import { App, Modal, Notice, Setting, TFile } from 'obsidian';
import { ProductDraft, parseOrder, OrderFormat } from './parser';
import { recognizeLocal, Language, OcrAssets } from './engine';
import { FIELD_KEYS, FieldKey, FieldValues, inspectNote, NoteFields, fieldValue } from './write';
export interface OcrHost {
  note:TFile;initialText:string;knownBrands:string[];
  clipboard:()=>Promise<Blob>;choose:()=>Promise<Blob>;
  assets:(language:Language)=>Promise<OcrAssets>;
  save:(before:NoteFields,values:FieldValues,selected:FieldKey[],name:string,heading:boolean)=>Promise<void>;
  closed:()=>void;
}
const labels:Record<FieldKey,string>={brand:'Brand',shade:'Shade / color',price:'Item price',currency:'Currency',purchase_channel:'Purchase channel',purchase_date:'Purchase date',open_date:'Opening date'};
export class OrderOcrModal extends Modal {
  private controller?:AbortController;
  private previewUrl?:string;
  private disposed=false;
  private language:Language='eng+chi_sim';
  private format:OrderFormat='auto';
  private saving=false;
  private before:NoteFields;
  private status!:HTMLElement;
  private progress!:HTMLProgressElement;
  private review!:HTMLElement;
  private preview!:HTMLImageElement;
  private sourceButtons:HTMLButtonElement[]=[];
  constructor(app:App,private host:OcrHost){super(app);this.before=inspectNote(host.initialText);}
  onOpen(){
    this.modalEl.addClass('product-photo-ocr-modal');const el=this.contentEl;
    el.createEl('h2',{text:'Fill from order screenshot'});
    el.createEl('p',{text:`Review one product, then save selected fields to ${this.host.note.basename}. Images and raw OCR text are not saved or uploaded.`});
    new Setting(el).setName('Recognition language').addDropdown(drop=>drop.addOptions({'eng+chi_sim':'Chinese + English',eng:'English'}).setValue(this.language).onChange(value=>{this.language=value as Language;}));
    new Setting(el).setName('Order format').addDropdown(drop=>drop.addOptions({auto:'Auto / generic',sephora:'Sephora',amazon:'Amazon',tmall:'Tmall'}).setValue(this.format).onChange(value=>{this.format=value as OrderFormat;}));
    const sources=el.createDiv({cls:'product-photo-ocr-sources'});
    for(const [label,get] of [['Read clipboard',this.host.clipboard],['Choose screenshot',this.host.choose]] as const){
      const button=sources.createEl('button',{text:label});button.addEventListener('click',()=>void this.recognize(get));this.sourceButtons.push(button);
    }
    this.status=el.createEl('p',{cls:'product-photo-ocr-status',text:'Choose a complete order screenshot, not just the product photo.'});this.status.setAttribute('role','status');
    this.progress=el.createEl('progress');this.progress.max=1;this.progress.hidden=true;
    const columns=el.createDiv({cls:'product-photo-ocr-columns'});
    this.preview=columns.createEl('img',{cls:'product-photo-ocr-preview',attr:{alt:'Order screenshot preview'}});this.preview.hidden=true;
    this.review=columns.createDiv({cls:'product-photo-ocr-review'});
    el.createEl('button',{text:'Close'}).addEventListener('click',()=>this.close());
  }
  async start(){await this.recognize(this.host.clipboard);}
  private async recognize(get:()=>Promise<Blob>){
    if(this.saving)return;
    this.controller?.abort();const controller=new AbortController();this.controller=controller;
    this.review.empty();this.progress.hidden=false;this.status.textContent='Reading screenshot…';
    for(const button of this.sourceButtons)button.disabled=true;
    try{
      const image=await get();if(this.disposed||controller.signal.aborted)return;
      if(this.previewUrl)URL.revokeObjectURL(this.previewUrl);
      this.previewUrl=URL.createObjectURL(image);this.preview.src=this.previewUrl;this.preview.hidden=false;
      this.status.textContent='Loading offline OCR…';
      const assets=await this.host.assets(this.language);if(this.disposed||controller.signal.aborted)return;
      const result=await recognizeLocal(image,assets,this.language,(status,progress)=>{if(!this.disposed){this.status.textContent=status;this.progress.value=progress;}},controller.signal);
      if(this.disposed)return;
      const drafts=parseOrder(result,this.format,this.host.knownBrands);
      this.status.textContent=`OCR confidence: ${Math.round(result.confidence)}%. Check the screenshot before saving. Nothing has been written.`;
      const picker=this.review.createDiv();const fields=this.review.createDiv();
      if(drafts.length){
        if(drafts.length>1)new Setting(picker).setName('Product to fill').setDesc('Select one product for this note. Changing the selection resets unsaved field edits.').addDropdown(drop=>{
          for(const [i,draft] of drafts.entries())drop.addOption(String(i),`${i+1}. ${draft.brand} ${draft.name}`.slice(0,140));
          drop.onChange(value=>this.renderDraft(fields,drafts[Number(value)]!));
        });
        this.renderDraft(fields,drafts[0]!);
      }else this.status.textContent='Text was found, but no product could be grouped. You can review the recognized text below.';
      const details=this.review.createEl('details');details.createEl('summary',{text:'Recognized text (not saved)'});
      details.createEl('textarea',{attr:{readonly:'true','aria-label':'Recognized text'},text:result.text});
    }catch(error){if(!this.disposed)this.status.textContent=error instanceof Error?error.message:'OCR failed. Try another screenshot.';}
    finally{if(!this.disposed){this.progress.hidden=true;for(const button of this.sourceButtons)button.disabled=false;}}
  }
  private renderDraft(el:HTMLElement,draft:ProductDraft){
    el.empty();for(const warning of draft.warnings)el.createEl('p',{cls:'product-photo-ocr-warning',text:warning});
    if(draft.size||draft.quantity)el.createEl('p',{text:`For review only — size: ${draft.size||'unknown'}; quantity: ${draft.quantity||'unknown'}. These have no mapped note properties.`});
    const values={} as FieldValues;for(const key of FIELD_KEYS)values[key]=draft[key];
    let name=draft.name,heading=false;
    new Setting(el).setName('Product name').setDesc('Optional note heading. The file is not renamed.').addText(text=>text.setValue(name).onChange(v=>{name=v;})).addToggle(toggle=>toggle.setValue(false).onChange(v=>{heading=v;}));
    const selected=new Set<FieldKey>();
    const openingInput:{value?:HTMLInputElement}={};let openingToggle:{setValue(value:boolean):unknown}|undefined;
    for(const key of FIELD_KEYS){
      const old=this.before.values[key];const empty=old===undefined||old===null||old==='';const isPresent=this.before.present.includes(key);
      const pick=empty&&isPresent&&!!values[key];if(pick)selected.add(key);
      new Setting(el).setName(labels[key]).setDesc(`${isPresent?'Current':'New property'}: ${old===undefined||old===null||old===''?'empty':typeof old==='object'?'complex value (cannot replace)':String(old)}. ${empty?'Check to write.':'Unchecked by default to preserve existing information.'}`).addText(text=>{
        text.setValue(values[key]).onChange(v=>{values[key]=v;});if(key==='open_date')openingInput.value=text.inputEl;
        if(key.endsWith('_date'))text.setPlaceholder('YYYY-MM-DD');if(key==='currency')text.setPlaceholder('CAD / USD / CNY');
      }).addToggle(toggle=>{toggle.setValue(pick).onChange(v=>{if(v)selected.add(key);else selected.delete(key);});if(key==='open_date')openingToggle=toggle;});
    }
    if(draft.delivery_date){
      new Setting(el).setName(`Delivery: ${draft.delivery_date}`).setDesc('Use as opening date only if this matches what actually happened. It is not filled automatically.').addButton(button=>button.setButtonText('Use as opening date').onClick(()=>{
        try{fieldValue('open_date',draft.delivery_date);values.open_date=draft.delivery_date;if(openingInput.value)openingInput.value.value=draft.delivery_date;openingToggle?.setValue(true);selected.add('open_date');}
        catch(error){this.status.textContent=error instanceof Error?error.message:'Invalid opening date.';}
      }));
    }
    const save=el.createEl('button',{text:'Save selected fields',cls:'mod-cta'});
    save.addEventListener('click',()=>{
      if(save.disabled||this.saving)return;save.disabled=true;this.saving=true;for(const button of this.sourceButtons)button.disabled=true;
      void (async()=>{
        try{
          for(const key of selected)fieldValue(key,values[key]);
          await this.host.save(this.before,values,[...selected],name,heading);
          new Notice('Product information saved.');this.close();
        }catch(error){if(!this.disposed){this.status.textContent=error instanceof Error?error.message:'Could not save product information.';save.disabled=false;this.saving=false;for(const button of this.sourceButtons)button.disabled=false;}}
      })();
    });
  }
  onClose(){this.disposed=true;this.controller?.abort();if(this.previewUrl)URL.revokeObjectURL(this.previewUrl);this.contentEl.empty();this.host.closed();}
}
