import { describe,it,expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadOcrAssets } from '../src/ocr/assets';
const adapter=(corrupt=false)=>({
  read:()=>readFile('ocr/assets.json','utf8'),
  readBinary:async(path:string)=>{const b=await readFile('ocr/'+path.split('/').pop());if(corrupt&&path.endsWith('worker.js'))b[0]=b[0]!^1;return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);},
});
describe('offline OCR assets',()=>{
  it('loads and verifies the packaged engines and both language packs',async()=>{
    const data=await loadOcrAssets(adapter() as any,'plugins/product-photo','eng+chi_sim');
    expect(data.worker.length).toBeGreaterThan(1000);expect(data.eng.byteLength).toBeGreaterThan(1000);expect(data.chi_sim?.byteLength).toBeGreaterThan(1000);
  });
  it('rejects a damaged resource instead of executing it',async()=>{
    await expect(loadOcrAssets(adapter(true) as any,'plugins/product-photo','eng')).rejects.toThrow('missing or damaged');
  });
  it('gives a reinstall instruction for missing resources',async()=>{
    await expect(loadOcrAssets({read:async()=>{throw Error('missing');}} as any,'plugins/product-photo','eng')).rejects.toThrow('including its ocr folder');
  });
});
