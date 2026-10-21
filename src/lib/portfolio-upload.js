export const PORTFOLIO_WEBP_QUALITY = 0.88;
export const PORTFOLIO_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
export const PORTFOLIO_SOURCE_MAX_BYTES = 40 * 1024 * 1024;
export const PORTFOLIO_MAX_PIXELS = 40_000_000;
export const PORTFOLIO_THUMBNAIL_SIZE = 384;
export const PORTFOLIO_THUMBNAIL_TARGET_BYTES = 80 * 1024;
const HEADER_LIMIT = 512 * 1024;

let imageWorker = null;
let imageWorkerUnavailable = false;
let workerJobId = 0;
const workerJobs = new Map();

function getImageWorker() {
  if (imageWorkerUnavailable || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  if (imageWorker) return imageWorker;
  try {
    imageWorker = new Worker(new URL('./portfolio-image-worker.js', import.meta.url), { type: 'module' });
  } catch { imageWorkerUnavailable = true; return null; }
  imageWorker.addEventListener('message', (event) => {
    const job = workerJobs.get(event.data?.id);
    if (!job) return;
    workerJobs.delete(event.data.id);
    if (event.data.unsupported) {
      imageWorkerUnavailable = true;
      imageWorker?.terminate(); imageWorker = null;
      job.reject(new Error('WORKER_UNSUPPORTED'));
    }
    else if (event.data.error) job.reject(new Error(event.data.error));
    else job.resolve({ file: event.data.output, thumbnail: event.data.thumbnail });
  });
  imageWorker.addEventListener('error', () => {
    const worker = imageWorker;
    imageWorkerUnavailable = true;
    imageWorker = null;
    worker?.terminate();
    for (const job of workerJobs.values()) job.reject(new Error('WORKER_UNAVAILABLE'));
    workerJobs.clear();
  });
  return imageWorker;
}

function processInWorker(file, convertJpeg) {
  const worker = getImageWorker();
  if (!worker) return Promise.reject(new Error('WORKER_UNAVAILABLE'));
  const id = ++workerJobId;
  return new Promise((resolve, reject) => {
    workerJobs.set(id, { resolve, reject });
    try {
      worker.postMessage({
        id,
        file,
        convertJpeg: convertJpeg && file.type === 'image/jpeg',
        thumbnailSize: PORTFOLIO_THUMBNAIL_SIZE,
        quality: PORTFOLIO_WEBP_QUALITY,
      });
    } catch {
      workerJobs.delete(id);
      imageWorkerUnavailable = true;
      imageWorker?.terminate(); imageWorker = null;
      reject(new Error('WORKER_UNAVAILABLE'));
    }
  });
}

function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(`${type} 轉檔失敗，原始照片已保留。`)), type, quality);
  });
}

async function processOnMainThread(file, convertJpeg) {
  if (typeof createImageBitmap !== 'function') throw new Error('此瀏覽器不支援安全的圖片解碼，請改用較新的瀏覽器。');
  await nextFrame();
  let bitmap;
  let mainCanvas;
  let thumbnailCanvas;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > PORTFOLIO_MAX_PIXELS) {
      throw new Error('照片尺寸超過 4000 萬像素解碼上限，請先縮小照片。');
    }
    let output = file;
    if (file.type === 'image/jpeg' && convertJpeg) {
      mainCanvas = document.createElement('canvas');
      mainCanvas.width = bitmap.width; mainCanvas.height = bitmap.height;
      const context = mainCanvas.getContext('2d');
      if (!context) throw new Error('瀏覽器無法建立圖片轉檔畫布。');
      context.drawImage(bitmap, 0, 0);
      const blob = await canvasBlob(mainCanvas, 'image/webp', PORTFOLIO_WEBP_QUALITY);
      output = new File([blob], file.name.replace(/\.jpe?g$/i, '.webp'), { type: 'image/webp', lastModified: file.lastModified });
      if (output.size > PORTFOLIO_UPLOAD_MAX_BYTES) throw new Error('轉檔後照片超過 8 MiB 上傳上限。');
    }
    await nextFrame();
    const scale = Math.min(1, PORTFOLIO_THUMBNAIL_SIZE / Math.max(bitmap.width, bitmap.height));
    thumbnailCanvas = document.createElement('canvas');
    thumbnailCanvas.width = Math.max(1, Math.round(bitmap.width * scale));
    thumbnailCanvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const thumbnailContext = thumbnailCanvas.getContext('2d');
    if (!thumbnailContext) throw new Error('瀏覽器無法建立縮圖畫布。');
    thumbnailContext.drawImage(bitmap, 0, 0, thumbnailCanvas.width, thumbnailCanvas.height);
    const thumbnail = await canvasBlob(thumbnailCanvas, 'image/webp', 0.82);
    return { file: output, thumbnail };
  } finally {
    bitmap?.close();
    if (mainCanvas) { mainCanvas.width = 0; mainCanvas.height = 0; }
    if (thumbnailCanvas) { thumbnailCanvas.width = 0; thumbnailCanvas.height = 0; }
    await nextFrame();
  }
}

export async function preparePortfolioImage(file, { convertJpeg = true } = {}) {
  await inspectPortfolioUpload(file);
  let prepared;
  try {
    prepared = await processInWorker(file, convertJpeg);
  } catch (error) {
    if (error instanceof Error && ['WORKER_UNAVAILABLE', 'WORKER_UNSUPPORTED'].includes(error.message)) {
      prepared = await processOnMainThread(file, convertJpeg);
    } else throw error;
  }
  if (convertJpeg && prepared.file.type !== 'image/webp' && file.type === 'image/jpeg') {
    throw new Error('此瀏覽器無法輸出 WebP；原始 JPG 已保留，沒有改用 JPG 上傳。');
  }
  if (convertJpeg && file.type === 'image/jpeg' && !(prepared.file instanceof File)) {
    prepared.file = new File([prepared.file], file.name.replace(/\.jpe?g$/i, '.webp'), { type: 'image/webp', lastModified: file.lastModified });
  }
  if (prepared.file.size > PORTFOLIO_UPLOAD_MAX_BYTES) throw new Error('轉檔後照片超過 8 MiB 上傳上限。');
  if (file.type === 'image/jpeg' && prepared.file === file) {
    prepared.file = new File([prepared.file], file.name.replace(/\.jpe?g$/i, '.webp'), { type: 'image/webp', lastModified: file.lastModified });
  }
  if (convertJpeg || file.type !== 'image/jpeg') await inspectPortfolioUpload(prepared.file);
  return prepared;
}

function dimensions(bytes, type) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'image/png' && bytes.length >= 24
    && [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value)
    && String.fromCharCode(...bytes.slice(12,16)) === 'IHDR') {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === 'image/webp' && bytes.length >= 25
    && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') {
    const chunk = String.fromCharCode(...bytes.slice(12,16));
    if (chunk === 'VP8X' && bytes.length >= 30) return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
    if (chunk === 'VP8L' && bytes[20] === 0x2f) return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    };
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  if (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || marker >= 0xd0 && marker <= 0xd7) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 8) {
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += length;
    }
  }
  throw new Error('檔頭與格式不一致、照片損毀，或無法在安全範圍內讀取圖片尺寸。');
}

export async function inspectPortfolioUpload(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const expectedType = ['jpg', 'jpeg'].includes(extension) ? 'image/jpeg'
    : extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : '';
  if (!expectedType || file.type !== expectedType || !file.size) {
    throw new Error('請選擇副檔名與檔案格式一致的 JPG、PNG 或 WebP。');
  }
  const maxBytes = file.type === 'image/jpeg' ? PORTFOLIO_SOURCE_MAX_BYTES : PORTFOLIO_UPLOAD_MAX_BYTES;
  if (file.size > maxBytes) throw new Error(file.type === 'image/jpeg' ? 'JPG 原始檔不可超過 40 MiB。' : 'PNG／WebP 檔案不可超過 8 MiB。');
  const header = new Uint8Array(await file.slice(0, HEADER_LIMIT).arrayBuffer());
  const result = dimensions(header, file.type);
  if (!result.width || !result.height || result.width * result.height > PORTFOLIO_MAX_PIXELS) {
    throw new Error('照片超過 4000 萬像素上限，請先縮小照片再上傳。');
  }
  return result;
}
