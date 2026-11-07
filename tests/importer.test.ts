import { describe, expect, it, vi } from 'vitest';
import { DEFAULTS } from '../src/core';
import { importPhoto, Storage } from '../src/importer';
const initial='---\nbrand: A\n---\n# A\n## 产品照片\n```product-photo\n```\n## 使用记录\nOriginal review\n';
function fixture() {
  let text=initial;
  const files=new Map<string,ArrayBuffer>([['Photos/A.webp',new ArrayBuffer(1)]]);
  const storage:Storage={
    read:async()=>text,
    process:async (_note,fn)=>{text=fn(text);},
    createImage:async (folder,stem,data)=>{const path=folder+'/'+stem+'-2.webp';files.set(path,data);return path;},
    cleanupImage:async path=>files.delete(path),
    resolve:link=>link,
  };
  return {storage,files,get text(){return text;},edit:(value:string)=>{text=value;}};
}
const note={path:'Products/A.md',basename:'A'};
describe('import transaction',() => {
  it('merges review edits and preserves pre-existing attachments',async () => {
    const f=fixture();
    await importPhoto(f.storage,note,DEFAULTS,async()=>{f.edit(initial.replace('Original review','Concurrent review'));return new ArrayBuffer(8);});
    expect(f.text).toContain('Concurrent review'); expect(f.text).toContain('[[Photos/A-2.webp]]');
    expect(f.files.size).toBe(2); expect(f.files.get('Photos/A.webp')!.byteLength).toBe(1);
  });
  it('does not mutate notes or create files on decoding failure',async () => {
    const f=fixture(); await expect(importPhoto(f.storage,note,DEFAULTS,async()=>{throw Error('decode failed');})).rejects.toThrow('decode failed');
    expect(f.text).toBe(initial); expect(f.files.size).toBe(1);
  });
  it('rolls back only the new image when the note write fails',async () => {
    const f=fixture();f.storage.process=async()=>{throw Error('disk full');};
    await expect(importPhoto(f.storage,note,DEFAULTS,async()=>new ArrayBuffer(8))).rejects.toThrow('disk full');
    expect(f.text).toBe(initial); expect(f.files.size).toBe(1);
  });
  it('refuses conflicting edits and cleans the new attachment',async () => {
    const f=fixture();
    await expect(importPhoto(f.storage,note,DEFAULTS,async()=>{f.edit(initial.replace('## 产品照片','## Changed'));return new ArrayBuffer(8);})).rejects.toThrow('removed');
    expect(f.text).toContain('## Changed'); expect(f.files.size).toBe(1);
  });
  it('reports any retained image if failure cleanup is unsafe',async () => {
    const f=fixture();f.storage.process=async()=>{throw Error('write failed');};f.storage.cleanupImage=async()=>false;
    await expect(importPhoto(f.storage,note,DEFAULTS,async()=>new ArrayBuffer(8))).rejects.toThrow('Photos/A-2.webp');
  });
  it('preflights malformed notes before reading the clipboard',async () => {
    const f=fixture();f.edit(initial.replace('brand: A','photo: [one, two]'));
    const get=vi.fn(async()=>new ArrayBuffer(8));
    await expect(importPhoto(f.storage,note,DEFAULTS,get)).rejects.toThrow('must be text');expect(get).not.toHaveBeenCalled();
  });
  it('does not save an image after cancellation',async () => {
    const f=fixture();await expect(importPhoto(f.storage,note,DEFAULTS,async()=>new ArrayBuffer(8),()=>false)).rejects.toThrow('cancelled');expect(f.files.size).toBe(1);
  });
});
