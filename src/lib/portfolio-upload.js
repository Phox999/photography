export const PORTFOLIO_WEBP_QUALITY = 0.88;
export const PORTFOLIO_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
export const PORTFOLIO_SOURCE_MAX_BYTES = 40 * 1024 * 1024;
export const PORTFOLIO_MAX_PIXELS = 40_000_000;
const HEADER_LIMIT = 512 * 1024;

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
