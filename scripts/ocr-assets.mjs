import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
export async function prepareOcrAssets() {
  const target='ocr';await mkdir(target,{recursive:true});
  const sources={
    'worker.js':'node_modules/tesseract.js/dist/worker.min.js',
    'core.js':'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
    'eng.traineddata':'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
    'chi_sim.traineddata':'node_modules/@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz',
  };
  const manifest={engine:'tesseract.js',version:JSON.parse(await readFile('node_modules/tesseract.js/package.json','utf8')).version,files:{}};
  for(const [name,source] of Object.entries(sources)){
    const input=await readFile(source);const data=source.endsWith('.gz')?gunzipSync(input):input;
    await writeFile(`${target}/${name}`,data);manifest.files[name]={bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};
  }
  await writeFile(`${target}/assets.json`,JSON.stringify(manifest,null,2)+'\n');
}
