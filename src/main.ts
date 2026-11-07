import {
  App, FileSystemAdapter, MarkdownRenderChild, MarkdownView, Notice, Plugin,
  PluginSettingTab, Setting, TFile, TFolder,
} from 'obsidian';
import { addButton, DEFAULTS, inScope, PhotoError, Settings, validateSettings } from './core';
import { MAX_PIXELS, processImage } from './image';
import { importPhoto, NoteHandle, Storage } from './importer';
import { acquireLock } from './lock';

const message = (error: unknown) => error instanceof Error ? error.message : 'Image import failed.';

export default class ProductPhotoPlugin extends Plugin {
  settings: Settings = {...DEFAULTS};
  private running = new Set<string>();
  private alive = true;
  private refreshers = new Set<() => void>();

  async onload() {
    const saved: unknown = await this.loadData();
    try { this.settings = validateSettings({...DEFAULTS,...(typeof saved === 'object' && saved ? saved : {})}); }
    catch { new Notice('Product Photo: Invalid saved settings. Defaults are active; review settings.'); }
    this.alive = true;
    this.registerMarkdownCodeBlockProcessor('product-photo', (_source,el,context) => {
      const file = this.app.vault.getAbstractFileByPath(context.sourcePath);
      if (!(file instanceof TFile)) return;
      context.addChild(new PhotoControls(el,this,file));
    });
    this.addCommand({ id:'add-import-button', name:'Add photo import button to current note', checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      if (!file || !inScope(file.path,this.settings.scope)) return false;
      if (!checking) void this.addToNote(file);
      return true;
    }});
    this.addCommand({ id:'import-from-clipboard', name:'Import product photo from clipboard', checkCallback: checking => {
      const file = this.app.workspace.getActiveFile();
      if (!file || !inScope(file.path,this.settings.scope)) return false;
      if (!checking) void this.run(file,document,'clipboard');
      return true;
    }});
    this.addSettingTab(new PhotoSettingsTab(this.app,this));
    this.registerEvent(this.app.metadataCache.on('changed', () => this.refresh()));
  }
  onunload() { this.alive = false; this.refreshers.clear(); }
  subscribe(refresh: () => void) { this.refreshers.add(refresh); return () => this.refreshers.delete(refresh); }
  refresh() { for (const refresh of this.refreshers) refresh(); }
  isRunning(file: TFile) { return this.running.has(file.path); }
  hasPhoto(file: TFile) {
    const value: unknown = this.app.metadataCache.getFileCache(file)?.frontmatter?.[this.settings.property];
    return typeof value === 'string' && !!value.trim();
  }
  private async currentText(file: TFile): Promise<string> {
    // Read an open editor's buffer when available; refuse conflicting duplicate views.
    const editors = this.app.workspace.getLeavesOfType('markdown').map(l => l.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView && view.file === file);
    const values = editors.map(v => v.getViewData());
    if (values.some(v => v !== values[0])) throw new PhotoError('Open views of this note differ. Save or close the conflicting view and retry.');
    return values[0] ?? await this.app.vault.read(file);
  }
  private async processNote(file: TFile, transform: (text:string)=>string) {
    const views = this.app.workspace.getLeavesOfType('markdown').map(l => l.view)
      .filter((view): view is MarkdownView => view instanceof MarkdownView && view.file === file);
    // Check duplicate views before flushing; never save divergent buffers over one another.
    const beforeSave = await this.currentText(file);
    // Flush pending editor text before Vault.process; otherwise a delayed editor save could undo an import.
    for (const view of views) {
      if (view.getViewData() !== beforeSave) throw new PhotoError('The note changed while saving. Please retry.');
      await view.save();
    }
    const buffered = await this.currentText(file);
    await this.app.vault.process(file,latest => {
      if (file.path !== this.app.vault.getAbstractFileByPath(file.path)?.path) throw new PhotoError('The note no longer exists.');
      for (const view of views) if (view.getViewData() !== buffered) throw new PhotoError('The note changed while saving. Please retry.');
      if (latest !== buffered && views.length) throw new PhotoError('The note has conflicting disk and editor changes. Please retry.');
      return transform(latest);
    });
  }
  private async addToNote(file:TFile) {
    try {
      const settings = validateSettings({...this.settings});
      await this.processNote(file,text => addButton(text,settings));
      new Notice('Product Photo: Import button ready.');
    } catch (error) { new Notice('Product Photo: '+message(error)); }
  }
  private storage(file:TFile): Storage {
    const vault = this.app.vault;
    return {
      read: async () => this.currentText(file),
      process: async (_note,transform) => {
        if (vault.getAbstractFileByPath(file.path) !== file) throw new PhotoError('The original note was moved or deleted. Please retry.');
        await this.processNote(file,transform);
      },
      resolve: link => this.app.metadataCache.getFirstLinkpathDest(link,file.path)?.path ?? link,
      createImage: async (folder,stem,data) => {
        const adapter = vault.adapter;
        if (!(adapter instanceof FileSystemAdapter)) throw new PhotoError('A local desktop vault is required.');
        const unlock = await acquireLock(adapter.getBasePath(),'image-folder:'+folder);
        try {
        let path = '';
        for (const segment of folder.split('/')) {
          path = path ? path+'/'+segment : segment;
          const existing = vault.getAbstractFileByPath(path);
          if (existing && !(existing instanceof TFolder)) throw new PhotoError(`A file blocks the image folder: ${path}`);
          if (!existing) {
            try { await vault.createFolder(path); }
            catch (error) { if (!(vault.getAbstractFileByPath(path) instanceof TFolder)) throw error; }
          }
        }
        const files = new Set(vault.getFiles().map(f => f.path.toLocaleLowerCase()));
        for (let number = 1; number < 10_000; number++) {
          const candidate = `${folder}/${stem}${number === 1 ? '' : '-'+number}.webp`;
          if (files.has(candidate.toLocaleLowerCase()) || await vault.adapter.exists(candidate)) continue;
          try { return (await vault.createBinary(candidate,data)).path; }
          catch (error) {
            throw new PhotoError(`${message(error)} Image creation did not finish. Check for a partial attachment at ${candidate}.`);
          }
        }
        throw new PhotoError('Too many conflicting image filenames. Choose another note name.');
        } finally { await unlock(); }
      },
      cleanupImage: async path => {
        // A failed write might still have reached disk. Only remove a newly created image if no note refers to it.
        for (const note of vault.getMarkdownFiles()) if ((await this.currentText(note)).includes(path)) return false;
        const image = vault.getAbstractFileByPath(path);
        if (image instanceof TFile) await vault.delete(image);
        return !(await vault.adapter.exists(path));
      },
    };
  }
  async run(file:TFile,doc:Document,source:'clipboard'|'file') {
    const originalPath = file.path;
    if (this.running.has(originalPath)) return;
    let release: (()=>Promise<void>) | undefined;
    this.running.add(originalPath); this.refresh();
    try {
      const settings = validateSettings({...this.settings});
      if (!inScope(originalPath,settings.scope)) throw new PhotoError('This note is outside the configured folder scope.');
      if (!(this.app.vault.adapter instanceof FileSystemAdapter)) throw new PhotoError('Product Photo currently requires a local desktop vault.');
      release = await acquireLock(this.app.vault.adapter.getBasePath(),originalPath);
      const note: NoteHandle = {path:originalPath,basename:file.basename};
      await importPhoto(this.storage(file),note,settings,async () => {
        let input: Blob;
        if (source === 'file') input = await chooseFile(doc);
        else {
          try { input = await readClipboard(doc); }
          catch (error) {
            // The visible file button avoids a browser-blocked automatic picker.
            throw new PhotoError(message(error)+' Use Choose image file instead.');
          }
        }
        return processImage(input,settings.trimWhite,doc);
      },() => this.alive && file.path === originalPath);
      if (this.alive) new Notice('Product photo imported.');
    } catch (error) {
      if (this.alive) new Notice('Product Photo: '+message(error),7000);
    } finally {
      if (release) await release();
      this.running.delete(originalPath); this.refresh();
    }
  }
}

async function readClipboard(doc:Document): Promise<Blob> {
  // Electron's desktop clipboard is reliable for macOS screenshots and browser Copy Image.
  try {
    const { clipboard } = require('electron') as {clipboard:{readImage:()=>{isEmpty:()=>boolean;getSize:()=>{width:number;height:number};toPNG:()=>Uint8Array}}};
    const image = clipboard.readImage();
    if (!image.isEmpty()) {
      const size = image.getSize();
      if (size.width * size.height > MAX_PIXELS) throw new PhotoError('Image exceeds the 25 megapixel limit.');
      return new Blob([new Uint8Array(image.toPNG())],{type:'image/png'});
    }
    throw new PhotoError('Copy an image or screenshot first.');
  } catch (error) {
    if (error instanceof PhotoError) throw error;
    // Fall back to the standard browser clipboard API if Electron clipboard is unavailable.
    const clipboard = doc.defaultView?.navigator.clipboard;
    if (!clipboard?.read) throw new PhotoError('Clipboard access is unavailable.');
    try {
      for (const item of await clipboard.read()) {
        const type = item.types.find(t => ['image/png','image/jpeg','image/webp'].includes(t));
        if (type) return await item.getType(type);
      }
    } catch { throw new PhotoError('Clipboard access was denied.'); }
    throw new PhotoError('Copy an image or screenshot first.');
  }
}
function chooseFile(doc:Document): Promise<File> {
  return new Promise((resolve,reject) => {
    const input = doc.createElement('input'); input.type='file'; input.accept='image/png,image/jpeg,image/webp'; input.hidden=true;
    doc.body.appendChild(input);
    const finish = () => input.remove();
    input.addEventListener('change',() => { const file=input.files?.[0]; finish(); file ? resolve(file) : reject(new PhotoError('No image selected.')); },{once:true});
    input.addEventListener('cancel',() => { finish(); reject(new PhotoError('No image selected.')); },{once:true});
    input.click();
  });
}
class PhotoControls extends MarkdownRenderChild {
  private unsubscribe?: ()=>void;
  constructor(el:HTMLElement,private plugin:ProductPhotoPlugin,private file:TFile) { super(el); }
  onload() {
    this.containerEl.addClass('product-photo-controls');
    const primary=this.containerEl.createEl('button',{text:'Import product photo',cls:'mod-cta'});
    const fallback=this.containerEl.createEl('button',{text:'Choose image file'});
    const hint=this.containerEl.createEl('div',{text:'Copy an image, then click the button. Do not paste into the note.',cls:'product-photo-hint'});
    const refresh=() => {
      const running=this.plugin.isRunning(this.file), allowed=inScope(this.file.path,this.plugin.settings.scope);
      primary.textContent=running ? 'Importing…' : this.plugin.hasPhoto(this.file) ? 'Replace image' : 'Import product photo';
      primary.disabled=fallback.disabled=running || !allowed;
      hint.textContent=allowed ? 'Copy → click button. Do not paste into the note. · 800 × 800 WebP' : 'This note is outside the configured folder scope.';
    };
    this.registerDomEvent(primary,'click',() => void this.plugin.run(this.file,this.containerEl.ownerDocument,'clipboard'));
    this.registerDomEvent(fallback,'click',() => void this.plugin.run(this.file,this.containerEl.ownerDocument,'file'));
    this.unsubscribe=this.plugin.subscribe(refresh); refresh();
  }
  onunload() { this.unsubscribe?.(); }
}
class PhotoSettingsTab extends PluginSettingTab {
  constructor(app:App,private plugin:ProductPhotoPlugin) { super(app,plugin); }
  display() {
    const el=this.containerEl; el.empty();
    el.createEl('h2',{text:'Product Photo'});
    el.createEl('p',{text:'Images stay in your vault. No AI, uploads, or network connection required.'});
    const text=(key:'scope'|'imageFolder'|'property'|'heading',name:string,description:string) => {
      new Setting(el).setName(name).setDesc(description).addText(control => {
        control.setValue(this.plugin.settings[key]);
        this.registerInput(control.inputEl,key);
      });
    };
    text('scope','Enabled folder scope','Vault-relative folder. Empty means notes with an import button anywhere in the vault.');
    text('imageFolder','Image folder','For example: 化妆品管理/Photos');
    text('property','Image property','Text property containing the image wikilink. Default: photo');
    text('heading','Photo section heading','Section title without #. Default: 产品照片');
    new Setting(el).setName('Trim outer white margins').setDesc('Optional. Leave off for pale packaging.').addToggle(toggle => toggle.setValue(this.plugin.settings.trimWhite).onChange(async value => {
      this.plugin.settings.trimWhite=value; await this.plugin.saveData(this.plugin.settings);
    }));
    new Setting(el).setName('Beauty inventory preset').setDesc('Configure folders for 化妆品管理. Does not edit notes.').addButton(button => button.setButtonText('Use preset').onClick(async () => {
      this.plugin.settings={...DEFAULTS,scope:'化妆品管理/Products',imageFolder:'化妆品管理/Photos'};
      await this.plugin.saveData(this.plugin.settings); this.plugin.refresh(); this.display();
    }));
  }
  private registerInput(input:HTMLInputElement,key:'scope'|'imageFolder'|'property'|'heading') {
    input.addEventListener('change',() => {
      void (async () => {
        try {
          const next=validateSettings({...this.plugin.settings,[key]:input.value});
          await this.plugin.saveData(next); this.plugin.settings=next; this.plugin.refresh(); input.value=next[key];
        } catch (error) { new Notice(message(error)); input.value=this.plugin.settings[key]; }
      })();
    });
  }
}
