import { mkdir, copyFile, readFile, cp } from 'node:fs/promises';
const { version } = JSON.parse(await readFile('manifest.json','utf8'));
const target = `dist/product-photo-${version}/product-photo`;
await mkdir(target,{recursive:true});
for (const file of ['main.js','manifest.json','styles.css','LICENSE','THIRD_PARTY_NOTICES.md']) await copyFile(file,`${target}/${file}`);
await cp('ocr',`${target}/ocr`,{recursive:true});
console.log(`Local install bundle: ${target}`);
