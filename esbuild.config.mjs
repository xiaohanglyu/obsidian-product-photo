import { context } from 'esbuild';
import { prepareOcrAssets } from './scripts/ocr-assets.mjs';
await prepareOcrAssets();
const ctx = await context({
  entryPoints: ['src/main.ts'], bundle: true, external: ['obsidian', 'electron', 'node:*'],
  format: 'cjs', target: 'es2022', platform: 'browser', outfile: 'main.js',
  sourcemap: process.argv.includes('--watch') ? 'inline' : false,
  banner: { js: '/* Product Photo — MIT License. Source: src/main.ts */' },
});
if (process.argv.includes('--watch')) await ctx.watch();
else { await ctx.rebuild(); await ctx.dispose(); }
