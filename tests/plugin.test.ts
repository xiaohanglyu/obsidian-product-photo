import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/image',async original=>({...await original<typeof import('../src/image')>(),processImage:vi.fn(async()=>new ArrayBuffer(8))}));
import ProductPhotoPlugin from '../src/main';
import { FileSystemAdapter, MarkdownView, Notice, TFile, TFolder } from './obsidian-mock';
import { randomUUID } from 'node:crypto';
const initial='---\nbrand: A\n---\n# Product\n## 产品照片\n```product-photo\n```\n## 使用记录\nKeep review\n';
function fixture() {
  const file=new TFile('Products/A.md','A');
  let disk=initial,buffer=initial;
  const files=new Map<string,TFile|TFolder>([[file.path,file],['Photos',new TFolder('Photos')],['Photos/A.webp',new TFile('Photos/A.webp','A')]]);
  const binaries=new Map<string,ArrayBuffer>();
  const adapter=Object.assign(new FileSystemAdapter(),{getBasePath:()=>randomUUID(),exists:async (p:string)=>files.has(p)});
  const view=Object.assign(new MarkdownView(),{file,getViewData:()=>buffer,save:async()=>{disk=buffer;}});
  const vault={adapter,getAbstractFileByPath:(p:string)=>files.get(p),getFiles:()=>[...files.values()].filter(f=>f instanceof TFile),getMarkdownFiles:()=>[file],read:async()=>disk,
    process:async (_f:TFile,transform:(s:string)=>string)=>{disk=transform(disk);buffer=disk;},
    createFolder:async(p:string)=>{files.set(p,new TFolder(p));},
    createBinary:async(p:string,data:ArrayBuffer)=>{if(files.has(p))throw Error('exists');const image=new TFile(p,'A');files.set(p,image);binaries.set(p,data);return image;},
    delete:async(image:TFile)=>{files.delete(image.path);binaries.delete(image.path);},
  };
  const app={vault,workspace:{getLeavesOfType:()=>[{view}],getActiveFile:()=>file},metadataCache:{getFirstLinkpathDest:(p:string)=>files.get(p),getFileCache:()=>({frontmatter:{}})}};
  const plugin=new ProductPhotoPlugin(app as any,{} as any);
  const doc={defaultView:{navigator:{clipboard:{read:async()=>[{types:['image/png'],getType:async()=>new Blob(['pixels'])}]}}}} as unknown as Document;
  return {file,plugin,doc,files,binaries,vault,get disk(){return disk;},get buffer(){return buffer;},edit:(text:string)=>{buffer=text;}};
}
beforeEach(()=>{Notice.messages=[];});
it('runs a clipboard import against the app adapter and avoids filename collisions',async()=>{
  const f=fixture();await f.plugin.run(f.file as any,f.doc,'clipboard');
  expect(f.disk).toContain('[[Photos/A-2.webp]]');expect(f.disk).toContain('Keep review');
  expect(f.files.has('Photos/A.webp')).toBe(true);expect(f.binaries.size).toBe(1);expect(Notice.messages).toContain('Product photo imported.');
});
it('serializes repeated clicks while the first import is running',async()=>{
  const f=fixture();await Promise.all([f.plugin.run(f.file as any,f.doc,'clipboard'),f.plugin.run(f.file as any,f.doc,'clipboard')]);
  expect(f.binaries.size).toBe(1);
});
it('cleans the new file if the app refuses the note write',async()=>{
  const f=fixture();f.vault.process=async()=>{throw Error('disk full');};await f.plugin.run(f.file as any,f.doc,'clipboard');
  expect(f.disk).toBe(initial);expect(f.binaries.size).toBe(0);expect(Notice.messages.join(' ')).toContain('disk full');
});
it('does not overwrite an incompatible photo property or invoke clipboard access',async()=>{
  const f=fixture();f.edit(initial.replace('brand: A','photo: [one, two]'));
  const read=vi.spyOn(f.doc.defaultView!.navigator.clipboard,'read');await f.plugin.run(f.file as any,f.doc,'clipboard');
  expect(read).not.toHaveBeenCalled();expect(f.binaries.size).toBe(0);expect(Notice.messages.join(' ')).toContain('must be text');
});
