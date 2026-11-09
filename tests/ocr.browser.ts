import { test,expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
let bundle:string;let assets:{worker:string;core:string;eng:string;chi_sim:string};
test.beforeAll(async()=>{
  const entry=await build({stdin:{contents:"export * from './src/ocr/engine'; export * from './src/ocr/parser';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'OrderOcr',write:false});bundle=entry.outputFiles[0]!.text;
  assets={worker:await readFile('ocr/worker.js','utf8'),core:await readFile('ocr/core.js','utf8'),eng:(await readFile('ocr/eng.traineddata')).toString('base64'),chi_sim:(await readFile('ocr/chi_sim.traineddata')).toString('base64')};
});
test('recognizes and groups an English order offline with the actual packaged worker',async({page})=>{
  test.setTimeout(60_000);await page.route('https://**',route=>route.abort());await page.goto('about:blank');await page.addScriptTag({content:bundle});
  const result=await page.evaluate(async assets=>{
    const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
    const c=document.createElement('canvas');c.width=1100;c.height=1000;const ctx=c.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';ctx.font='32px Arial';
    const lines=['ORDER DETAILS','Sephora','Delivery By May 08, 2026','CLINIQUE','Mini Take The Day Off Charcoal Cleansing Balm','Size: 30 mL','CAD $21.00  Qty: 1','Add to Basket','The Ordinary','Matrixyl 10% + Hyaluronic Acid','Size: 30 mL','CAD $14.40  Qty: 1','Add to Basket'];
    lines.forEach((line,i)=>ctx.fillText(line,330,60+i*60));
    const image=await new Promise<Blob>(resolve=>c.toBlob(b=>resolve(b!),'image/png'));
    const api=(window as any).OrderOcr;
    const result=await api.recognizeLocal(image,{...assets,eng:decode(assets.eng),chi_sim:decode(assets.chi_sim)},'eng',()=>{},new AbortController().signal);
    return {confidence:result.confidence,text:result.text,products:api.parseOrder(result,'sephora')};
  },assets);
  expect(result.text).toContain('CLINIQUE');expect(result.products.some((p:any)=>p.brand==='CLINIQUE'&&p.price==='21.00')).toBe(true);
  expect(result.products.some((p:any)=>p.brand==='The Ordinary'&&p.price==='14.40')).toBe(true);
});
test('recognizes Chinese and English locally without fetching language files',async({page})=>{
  test.setTimeout(60_000);await page.route('https://**',route=>route.abort());await page.goto('about:blank');await page.addScriptTag({content:bundle});
  const result=await page.evaluate(async assets=>{
    const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));const c=document.createElement('canvas');c.width=1000;c.height=650;
    const ctx=c.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,1000,650);ctx.fillStyle='black';ctx.font='36px Arial, sans-serif';
    ['天猫 hince旗舰店','hince 高光棒','色号: LT001 轻盈','￥112.26','数量: 1','实付款 ￥233.15'].forEach((s,i)=>ctx.fillText(s,300,70+i*75));
    const image=await new Promise<Blob>(r=>c.toBlob(b=>r(b!)));
    const api=(window as any).OrderOcr;const result=await api.recognizeLocal(image,{...assets,eng:decode(assets.eng),chi_sim:decode(assets.chi_sim)},'eng+chi_sim',()=>{},new AbortController().signal);
    return {text:result.text,products:api.parseOrder(result,'tmall')};
  },assets);
  expect(result.text).toContain('hince');expect(result.text).toMatch(/112[.．]26/);
});
test('cancels a real worker before it can complete recognition',async({page})=>{
  await page.goto('about:blank');await page.addScriptTag({content:bundle});
  const error=await page.evaluate(async assets=>{
    const c=document.createElement('canvas');c.width=c.height=100;const image=await new Promise<Blob>(r=>c.toBlob(b=>r(b!)));
    const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));const controller=new AbortController();
    const task=(window as any).OrderOcr.recognizeLocal(image,{...assets,eng:decode(assets.eng)},'eng',()=>{setTimeout(()=>controller.abort(),0);},controller.signal);
    try{await task;return '';}catch(error){return (error as Error).message;}
  },assets);expect(error).toContain('cancelled');
});
if(process.env.OCR_SAMPLE_IMAGE)test('private local screenshot smoke test (image is not committed)',async({page})=>{
  test.setTimeout(90_000);await page.route('https://**',route=>route.abort());await page.goto('about:blank');await page.addScriptTag({content:bundle});
  const input=(await readFile(process.env.OCR_SAMPLE_IMAGE!)).toString('base64');
  const result=await page.evaluate(async({assets,input})=>{
    const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));const api=(window as any).OrderOcr;
    const result=await api.recognizeLocal(new Blob([decode(input)]),{...assets,eng:decode(assets.eng),chi_sim:decode(assets.chi_sim)},'eng+chi_sim',()=>{},new AbortController().signal);
    return {confidence:result.confidence,products:api.parseOrder(result,'auto')};
  },{assets,input});
  console.log(JSON.stringify(result));expect(result.products.length).toBeGreaterThan(0);
});
