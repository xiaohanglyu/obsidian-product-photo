import { PhotoError } from './core';
export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PIXELS = 25_000_000;
export function dimensions(bytes: Uint8Array): { width: number; height: number; mime: string } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  let width = 0, height = 0, mime = '';
  if (bytes.length > MAX_BYTES) throw new PhotoError('Image exceeds the 20 MiB limit.');
  if (bytes.length >= 24 && ascii(0, 8) === '\x89PNG\r\n\x1a\n' && ascii(12,16) === 'IHDR') {
    width = view.getUint32(16); height = view.getUint32(20); mime = 'image/png';
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 3 < bytes.length) {
      if (bytes[i++] !== 0xff) break;
      while (bytes[i] === 0xff) i++;
      const marker = bytes[i++]!;
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (i + 2 > bytes.length) break;
      const size = view.getUint16(i);
      if (size < 2 || i + size > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && size >= 7) {
        height = view.getUint16(i+3); width = view.getUint16(i+5); mime = 'image/jpeg'; break;
      }
      i += size;
    }
  } else if (bytes.length >= 30 && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') {
    const codec = ascii(12,16); mime = 'image/webp';
    if (codec === 'VP8X') {
      if (bytes[20]! & 2) throw new PhotoError('Animated images are not supported.');
      width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
      height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
    } else if (codec === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      width = view.getUint16(26,true) & 0x3fff; height = view.getUint16(28,true) & 0x3fff;
    } else if (codec === 'VP8L' && bytes[20] === 0x2f) {
      const bits = view.getUint32(21,true);
      width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1;
    }
  }
  if (!width || !height) throw new PhotoError('Choose a valid PNG, JPEG, or static WebP image.');
  if (width * height > MAX_PIXELS) throw new PhotoError('Image exceeds the 25 megapixel limit.');
  return { width, height, mime };
}
export function fit(width: number, height: number) {
  const scale = Math.min(704 / Math.max(width, height), 1.5);
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  return { width: w, height: h, x: Math.floor((800-w)/2), y: Math.floor((800-h)/2) };
}
export async function processImage(input: Blob, trimWhite: boolean, doc: Document = document): Promise<ArrayBuffer> {
  if (input.size > MAX_BYTES) throw new PhotoError('Image exceeds the 20 MiB limit.');
  const bytes = new Uint8Array(await input.arrayBuffer());
  const header = dimensions(bytes); // Reject huge dimensions before allocating a decoded bitmap.
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(new Blob([bytes], { type: header.mime }), { imageOrientation: 'from-image' }); }
  catch { throw new PhotoError('This image could not be decoded. Try another screenshot or image file.'); }
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS) throw new PhotoError('Image exceeds the 25 megapixel limit.');
    let x = 0, y = 0, width = bitmap.width, height = bitmap.height;
    if (trimWhite) {
      // Analyze a small white-composited preview, never allocate a second full-size canvas.
      const preview = doc.createElement('canvas');
      const ratio = Math.min(1, 1024 / Math.max(width, height));
      preview.width = Math.max(1, Math.round(width * ratio)); preview.height = Math.max(1, Math.round(height * ratio));
      const ctx = preview.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new PhotoError('Image processing is unavailable in this window.');
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,preview.width,preview.height); ctx.drawImage(bitmap,0,0,preview.width,preview.height);
      const pixels = ctx.getImageData(0,0,preview.width,preview.height).data;
      let left = preview.width, top = preview.height, right = -1, bottom = -1;
      for (let row = 0; row < preview.height; row++) for (let col = 0; col < preview.width; col++) {
        const i = (row * preview.width + col) * 4;
        if (pixels[i]! < 250 || pixels[i+1]! < 250 || pixels[i+2]! < 250) {
          left = Math.min(left,col); right = Math.max(right,col); top = Math.min(top,row); bottom = Math.max(bottom,row);
        }
      }
      if (right >= left) {
        const pad = Math.max(2,Math.ceil(12*ratio));
        x = Math.max(0,Math.floor((left-pad)/ratio)); y = Math.max(0,Math.floor((top-pad)/ratio));
        width = Math.min(bitmap.width, Math.ceil((right+1+pad)/ratio)) - x;
        height = Math.min(bitmap.height, Math.ceil((bottom+1+pad)/ratio)) - y;
      }
      preview.width = preview.height = 1;
    }
    const canvas = doc.createElement('canvas'); canvas.width = canvas.height = 800;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PhotoError('Image processing is unavailable in this window.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,800,800);
    const placement = fit(width,height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap,x,y,width,height,placement.x,placement.y,placement.width,placement.height);
    const output = await new Promise<Blob>((resolve,reject) => canvas.toBlob(blob => blob && blob.type === 'image/webp' ? resolve(blob) : reject(new PhotoError('WebP encoding is unavailable.')), 'image/webp',0.82));
    canvas.width = canvas.height = 1;
    return await output.arrayBuffer();
  } finally { bitmap.close(); }
}
