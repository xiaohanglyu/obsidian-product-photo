import { expect, it } from 'vitest';
import { dimensions, fit } from '../src/image';
it('rejects unsupported and oversized image headers before decode',() => {
  expect(()=>dimensions(new Uint8Array([1,2,3]))).toThrow('valid PNG');
  const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);png.set([73,72,68,82],12);
  const view=new DataView(png.buffer);view.setUint32(16,10000);view.setUint32(20,10000);
  expect(()=>dimensions(png)).toThrow('25 megapixel');
});
it('fits extreme aspect ratios and limits upscaling',() => {
  expect(fit(20,40)).toEqual({width:30,height:60,x:385,y:370});
  const wide=fit(2000,500);expect(wide.width).toBe(704);expect(wide.height).toBe(176);
  expect(fit(500,2000).height).toBe(704);
});
