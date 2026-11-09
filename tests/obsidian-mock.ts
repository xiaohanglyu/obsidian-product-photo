// Small API test double. This is not a substitute for testing inside Obsidian.
export class TFile { constructor(public path:string,public basename:string) {} }
export class TFolder { constructor(public path:string) {} }
export class FileSystemAdapter { getBasePath(){return 'test-vault';} }
export class MarkdownView { file?:TFile; getViewData(){return '';} async save(){} }
export class Notice { static messages:string[]=[]; constructor(text:string){Notice.messages.push(text);} }
export class Plugin {
  constructor(public app:any){}
  async loadData(){return null;} async saveData(_data:unknown){}
  registerMarkdownCodeBlockProcessor(){} addCommand(){} addSettingTab(){} registerEvent(){}
}
export class PluginSettingTab { containerEl:any; constructor(_app:any,_plugin:any){} }
export class MarkdownRenderChild { constructor(public containerEl:any){} registerDomEvent(){} }
export class Setting {}
export type App=any;

export class Modal { modalEl:any;contentEl:any;constructor(public app:any){}open(){}close(){} }
