const MAX_PIXELS = 40_000_000;

async function encode(canvas, type, quality) {
  const blob = await canvas.convertToBlob({ type, quality });
  if (blob.type !== type) throw new Error(`瀏覽器無法輸出 ${type}。`);
  return blob;
}

self.addEventListener('message', async (event) => {
  const { id, file, convertJpeg, thumbnailSize, quality } = event.data || {};
  let bitmap;
  let mainCanvas;
  let thumbnailCanvas;
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') {
      self.postMessage({ id, unsupported: true });
      return;
    }
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS) {
      throw new Error('照片尺寸超過 4000 萬像素解碼上限，請先縮小照片。');
    }

    let output = file;
    if (convertJpeg) {
      mainCanvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = mainCanvas.getContext('2d');
      if (!context) throw new Error('瀏覽器無法建立圖片轉檔畫布。');
      context.drawImage(bitmap, 0, 0);
      output = await encode(mainCanvas, 'image/webp', quality);
    }

    const scale = Math.min(1, thumbnailSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    thumbnailCanvas = new OffscreenCanvas(width, height);
    const thumbnailContext = thumbnailCanvas.getContext('2d');
    if (!thumbnailContext) throw new Error('瀏覽器無法建立縮圖畫布。');
    thumbnailContext.drawImage(bitmap, 0, 0, width, height);
    const thumbnail = await encode(thumbnailCanvas, 'image/webp', 0.82);
    self.postMessage({ id, output, thumbnail });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : '照片處理失敗。' });
  } finally {
    bitmap?.close();
    if (mainCanvas) { mainCanvas.width = 0; mainCanvas.height = 0; }
    if (thumbnailCanvas) { thumbnailCanvas.width = 0; thumbnailCanvas.height = 0; }
  }
});
