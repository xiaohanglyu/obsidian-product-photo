import { dimensions, MAX_BYTES, MAX_PIXELS } from '../image';
import { PhotoError } from '../core';
export type Language = 'eng' | 'eng+chi_sim';
export interface OcrLine { text:string; confidence:number; bbox:{x0:number;y0:number;x1:number;y1:number} }
export interface OcrResult { text:string; confidence:number; lines:OcrLine[]; width:number;height:number }
export interface OcrAssets { worker:string;core:string;eng:Uint8Array;chi_sim?:Uint8Array }
export type Progress = (status:string,progress:number)=>void;

async function prepareImage(input:Blob):Promise<{bytes:Uint8Array;width:number;height:number}> {
  if(input.size>MAX_BYTES)throw new PhotoError('Screenshot exceeds the 20 MiB limit.');
  const bytes=new Uint8Array(await input.arrayBuffer());const header=dimensions(bytes);
  const bitmap=await createImageBitmap(new Blob([bytes],{type:header.mime}),{imageOrientation:'from-image'});
  try {
    const scale=Math.min(2,Math.max(1,1200/bitmap.width),Math.sqrt(MAX_PIXELS/(bitmap.width*bitmap.height)));
    const width=Math.round(bitmap.width*scale),height=Math.round(bitmap.height*scale);
    const canvas=new OffscreenCanvas(width,height);const ctx=canvas.getContext('2d');
    if(!ctx)throw new PhotoError('Screenshot decoding is unavailable.');
    ctx.fillStyle='white';ctx.fillRect(0,0,width,height);ctx.drawImage(bitmap,0,0,width,height);
    const blob=await canvas.convertToBlob({type:'image/png'});
    return {bytes:new Uint8Array(await blob.arrayBuffer()),width,height};
  }finally{bitmap.close();}
}

/** Adapter for the packaged Tesseract.js 7 worker protocol. Keep protocol changes isolated here.
 * Owning the Worker directly permits cancellation during initialization as well as recognition.
 * Language bytes and embedded-WASM core are supplied locally; no default CDN paths are used.
 */
export async function recognizeLocal(input:Blob,assets:OcrAssets,language:Language,progress:Progress,signal:AbortSignal):Promise<OcrResult>{
  if(signal.aborted)throw new PhotoError('OCR cancelled.');
  progress('Preparing screenshot',0);
  const image=await prepareImage(input);
  if(signal.aborted)throw new PhotoError('OCR cancelled.');
  const urls:string[]=[];let worker:Worker|undefined;
  const pending=new Map<string,{resolve:(data:any)=>void;reject:(error:Error)=>void}>();
  let sequence=0;
  const fail=(error:Error)=>{for(const task of pending.values())task.reject(error);pending.clear();worker?.terminate();};
  const cancelled=()=>fail(new PhotoError('OCR cancelled.'));
  const timeout=setTimeout(()=>fail(new PhotoError('OCR timed out. Try a smaller, clearer screenshot.')),90_000);
  signal.addEventListener('abort',cancelled,{once:true});
  try {
    const workerUrl=URL.createObjectURL(new Blob([assets.worker],{type:'text/javascript'}));urls.push(workerUrl);
    const coreUrl=URL.createObjectURL(new Blob([assets.core],{type:'text/javascript'}));urls.push(coreUrl);
    worker=new Worker(workerUrl);
    worker.onmessage=({data})=>{
      if(data.status==='progress'){progress(String(data.data.status),Number(data.data.progress)||0);return;}
      const task=pending.get(data.jobId);if(!task)return;pending.delete(data.jobId);
      if(data.status==='resolve')task.resolve(data.data);else task.reject(new PhotoError('OCR engine failed. Reinstall the complete plugin package if assets are missing.'));
    };
    worker.onerror=()=>fail(new PhotoError('OCR worker could not start. Check that the complete OCR package is installed.'));
    const request=(action:string,payload:unknown)=>new Promise<any>((resolve,reject)=>{
      if(signal.aborted){reject(new PhotoError('OCR cancelled.'));return;}
      const jobId=String(++sequence);pending.set(jobId,{resolve,reject});
      worker!.postMessage({workerId:'product-photo-ocr',jobId,action,payload});
    });
    await request('load',{options:{lstmOnly:true,corePath:coreUrl+'#engine.js',logging:false}});
    const langs=[{code:'eng',data:assets.eng}];
    if(language==='eng+chi_sim'){
      if(!assets.chi_sim)throw new PhotoError('Chinese OCR data is missing. Reinstall the complete plugin package.');
      langs.push({code:'chi_sim',data:assets.chi_sim});
    }
    await request('loadLanguage',{langs,options:{cacheMethod:'none',gzip:false,lstmOnly:true}});
    await request('initialize',{langs:language,oem:1,config:{}});
    await request('setParameters',{params:{tessedit_pageseg_mode:'3',preserve_interword_spaces:'1',user_defined_dpi:'150'}});
    const data=await request('recognize',{image:image.bytes,options:{},output:{text:true,blocks:true}});
    const lines:OcrLine[]=[];
    for(const block of data.blocks??[])for(const paragraph of block.paragraphs??[])for(const line of paragraph.lines??[]){
      if(typeof line.text==='string'&&line.text.trim())lines.push({text:line.text.trim(),confidence:line.confidence??0,bbox:line.bbox});
    }
    if(!String(data.text??'').trim())throw new PhotoError('No text found. Try a clearer order screenshot.');
    return {text:String(data.text),confidence:Number(data.confidence)||0,lines,width:image.width,height:image.height};
  }finally{
    clearTimeout(timeout);signal.removeEventListener('abort',cancelled);worker?.terminate();
    for(const url of urls)URL.revokeObjectURL(url);
  }
}
