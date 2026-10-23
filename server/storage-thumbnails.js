import { supabaseRequest } from './auth.js';

const PAGE_SIZE = 1000;
const MAX_PAGES = 4;
const CACHE_TTL_MS = 15_000;
const inventories = new Map();
const pendingInventories = new Map();

function cacheKey(config, bucket) {
  return `${config.url}|${bucket}`;
}

export function thumbnailObjectPath(path) {
  if (typeof path !== 'string' || path.startsWith('static:')) return null;
  return path.replace(/\.(jpg|png|webp)$/i, '.thumb.webp');
}

export function invalidateStorageThumbnailInventory(bucket, url = '') {
  const suffix = `|${bucket}`;
  for (const key of inventories.keys()) {
    if (key.endsWith(suffix) && (!url || key.startsWith(`${url}|`))) inventories.delete(key);
  }
}

async function loadThumbnailInventory(config, bucket) {
  const key = cacheKey(config, bucket);
  const cached = inventories.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.paths;
  const pending = pendingInventories.get(key);
  if (pending) return pending;

  const request = (async () => {
    const paths = new Set();
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * PAGE_SIZE;
      const { data } = await supabaseRequest(config, `/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
        method: 'POST',
        body: { prefix: '', limit: PAGE_SIZE, offset, search: '.thumb.webp' },
      });
      if (!Array.isArray(data)) throw new TypeError('Storage thumbnail inventory is malformed.');
      for (const entry of data) {
        if (typeof entry?.name === 'string' && entry.name.endsWith('.thumb.webp')) paths.add(entry.name);
      }
      if (data.length < PAGE_SIZE) break;
    }
    inventories.set(key, { paths, expiresAt: Date.now() + CACHE_TTL_MS });
    return paths;
  })();
  pendingInventories.set(key, request);
  try { return await request; }
  finally { if (pendingInventories.get(key) === request) pendingInventories.delete(key); }
}

// A Storage listing verifies thumbnails in batches. It avoids one blocking HEAD
// request per photo and reports legacy/missing variants as null for controlled fallback.
export async function imageThumbnailUrls(config, bucket, imagePaths) {
  const paths = Array.isArray(imagePaths) ? imagePaths : [];
  const result = new Map(paths.map((path) => [path, null]));
  const remotePaths = [...new Set(paths.filter((path) => thumbnailObjectPath(path)))];
  if (!config || !remotePaths.length) return result;

  let available;
  try { available = await loadThumbnailInventory(config, bucket); }
  catch { return result; }

  for (const path of remotePaths) {
    const thumbnailPath = thumbnailObjectPath(path);
    if (available.has(thumbnailPath)) {
      result.set(path, `${config.url}/storage/v1/object/public/${bucket}/${thumbnailPath}`);
    }
  }
  return result;
}
