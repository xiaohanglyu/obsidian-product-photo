import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
let bundle:string;
test.beforeAll(async()=>{const result=await build({entryPoints:['src/image.ts'],bundle:true,format:'iife',globalName:'PhotoImages',write:false});bundle=result.outputFiles[0]!.text;});
for (const sample of [{name:'landscape',w:1600,h:900},{name:'portrait',w:900,h:1600},{name:'transparent',w:600,h:800},{name:'small',w:40,h:20}]) {
  test(`encodes a real ${sample.name} image with white padding`,async ({page})=>{
    await page.goto('about:blank');await page.addScriptTag({content:bundle});
    const result=await page.evaluate(async sample=>{
      const input=document.createElement('canvas');input.width=sample.w;input.height=sample.h;
      const ctx=input.getContext('2d')!;
      if(sample.name!=='transparent'){ctx.fillStyle='white';ctx.fillRect(0,0,input.width,input.height);}
      ctx.fillStyle='#cc3355';ctx.fillRect(sample.w/4,sample.h/4,sample.w/2,sample.h/2);
      const blob=await new Promise<Blob>(r=>input.toBlob(b=>r(b!),'image/png'));
      const api=(window as any).PhotoImages;
      const data=await api.processImage(blob,false);
      const output=new Blob([data],{type:'image/webp'});const bitmap=await createImageBitmap(output);
      const canvas=document.createElement('canvas');canvas.width=canvas.height=800;const out=canvas.getContext('2d')!;out.drawImage(bitmap,0,0);
      return {width:bitmap.width,height:bitmap.height,corner:[...out.getImageData(0,0,1,1).data],center:[...out.getImageData(400,400,1,1).data],bytes:data.byteLength,header:api.dimensions(new Uint8Array(data))};
    },sample);
    expect(result.width).toBe(800);expect(result.height).toBe(800);expect(result.corner).toEqual([255,255,255,255]);
    expect(result.center[0]).toBeGreaterThan(180);expect(result.center[1]).toBeLessThan(80);expect(result.header.mime).toBe('image/webp');expect(result.bytes).toBeLessThan(100*1024);
  });
}
test('optional trimming enlarges the subject without cutting it off',async ({page})=>{
  await page.goto('about:blank');await page.addScriptTag({content:bundle});
  const counts=await page.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=c.height=800;const ctx=c.getContext('2d')!;
    ctx.fillStyle='white';ctx.fillRect(0,0,800,800);ctx.fillStyle='red';ctx.fillRect(300,200,200,400);
    const blob=await new Promise<Blob>(r=>c.toBlob(b=>r(b!)));
    const results=[];
    for(const trim of [false,true]){
      const data=await (window as any).PhotoImages.processImage(blob,trim);const b=await createImageBitmap(new Blob([data]));ctx.drawImage(b,0,0);
      const pixels=ctx.getImageData(0,0,800,800).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]!>150&&pixels[i+1]!<100)count++;results.push(count);
    }
    return results;
  });expect(counts[1]!).toBeGreaterThan(counts[0]!);
});
for (const mime of ['image/jpeg','image/webp']) {
  test(`accepts actual ${mime} input`,async({page})=>{
    await page.goto('about:blank');await page.addScriptTag({content:bundle});
    const result=await page.evaluate(async mime=>{
      const canvas=document.createElement('canvas');canvas.width=300;canvas.height=500;const ctx=canvas.getContext('2d')!;
      ctx.fillStyle='green';ctx.fillRect(0,0,300,500);
      const input=await new Promise<Blob>(r=>canvas.toBlob(b=>r(b!),mime));
      const data=await (window as any).PhotoImages.processImage(input,false);
      return (window as any).PhotoImages.dimensions(new Uint8Array(data));
    },mime);expect(result).toEqual({width:800,height:800,mime:'image/webp'});
  });
}
test('applies EXIF orientation before sizing and strips source metadata',async({page})=>{
  const {readFile}=await import('node:fs/promises');const bytes=[...await readFile('tests/fixtures/orientation-6.jpg')];
  await page.goto('about:blank');await page.addScriptTag({content:bundle});
  const result=await page.evaluate(async bytes=>{
    const data=await (window as any).PhotoImages.processImage(new Blob([new Uint8Array(bytes)],{type:'image/jpeg'}),false);
    const bitmap=await createImageBitmap(new Blob([data]));const c=document.createElement('canvas');c.width=c.height=800;const ctx=c.getContext('2d')!;ctx.drawImage(bitmap,0,0);
    return {top:[...ctx.getImageData(400,350,1,1).data],bottom:[...ctx.getImageData(400,450,1,1).data],metadata:new TextDecoder().decode(data).includes('Exif')};
  },bytes);
  expect(result.top[0]).toBeGreaterThan(200);expect(result.top[2]).toBeLessThan(40);
  expect(result.bottom[2]).toBeGreaterThan(200);expect(result.bottom[0]).toBeLessThan(40);expect(result.metadata).toBe(false);
});
