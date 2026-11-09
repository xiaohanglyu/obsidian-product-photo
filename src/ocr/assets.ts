import { DataAdapter } from 'obsidian';
import { OcrAssets, Language } from './engine';
import { PhotoError } from '../core';
interface Manifest {engine:string;version:string;files:Record<string,{bytes:number;sha256:string}>}
export async function loadOcrAssets(adapter:DataAdapter,directory:string,language:Language):Promise<OcrAssets>{
  const base=directory.replace(/\/$/,'')+'/ocr';
  try {
    const manifest=JSON.parse(await adapter.read(base+'/assets.json')) as Manifest;
    if(manifest.engine!=='tesseract.js'||manifest.version!=='7.0.0')throw Error('Version mismatch');
    const load=async(name:string)=>{
      const expected=manifest.files[name];if(!expected)throw Error('Missing manifest entry');
      const bytes=await adapter.readBinary(base+'/'+name);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
      if(bytes.byteLength!==expected.bytes||hash!==expected.sha256)throw Error('Asset verification failed');
      return new Uint8Array(bytes);
    };
    const [worker,core,eng,chi_sim]=await Promise.all([load('worker.js'),load('core.js'),load('eng.traineddata'),language==='eng+chi_sim'?load('chi_sim.traineddata'):Promise.resolve(undefined)]);
    return {worker:new TextDecoder().decode(worker),core:new TextDecoder().decode(core),eng,chi_sim};
  }catch{throw new PhotoError('OCR files are missing or damaged. Install the complete Product Photo 0.2 package, including its ocr folder.');}
}
