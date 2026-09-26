export type ClientPhoto = { id: string; title: string; previewUrl: string; downloadable: boolean };
export type DraftContent = { photoIds: string[]; photoNotes: Record<string, string>; note: string };
export type ClientDraft = DraftContent & { version: number; updatedAt: string };
export type ClientSelection = DraftContent & { submittedAt: string };
export type ClientGallery = {
  gallery: { id: string; title: string; status: 'proofing' | 'delivered'; selectionLimit: number; allowDownloads: boolean; expiresAt: string };
  photos: ClientPhoto[];
  selection: ClientSelection | null;
  draft: ClientDraft | null;
};

export function invitationFromFragment(fragment: string): string {
  const value = new URLSearchParams(fragment.replace(/^#/, '')).get('token') || '';
  return /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : '';
}

export function sanitizePhotoSelection(values: unknown, allowed: readonly string[], limit: number): string[] {
  const valid = new Set(allowed);
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && valid.has(value)))].slice(0, Math.max(0, limit));
}

export function safePhotoUrl(value: string, origin: string): string {
  try {
    const url = new URL(value, origin);
    if (url.protocol === 'https:' || (url.origin === origin && /^https?:$/.test(url.protocol))) return url.href;
  } catch { /* Reject invalid and executable URLs. */ }
  return '';
}

export class ClientGalleryError extends Error {
  constructor(public status: number, public code = '') {
    const messages: Record<number, string> = {
      0: '目前無法連線。請檢查網路，再重新載入相簿。',
      400: '資料不正確，請檢查選片數量與備註。',
      401: '邀請連結無效或已到期，請向攝影師索取新的連結。',
      403: '這份邀請目前無法使用，可能已撤銷或相簿尚未開放。',
      404: '找不到這個相簿或照片，請聯繫攝影師確認。',
      409: '這份邀請已確認選片。請重新載入，查看已送出的內容。',
      410: '邀請已到期，請向攝影師索取新的連結。',
      422: '資料不正確，請檢查選片數量與備註。',
      429: '操作過於頻繁，請稍候再試。',
      503: '相簿服務尚未設定完成或暫時無法使用，請聯繫攝影師。',
    };
    super(code === 'draft_conflict' ? '另一個視窗已更新草稿。目前的選片仍保留在此頁，請先核對，再明確選擇載入已儲存版本。' : code === 'archive_too_large' ? '這批作品超過 32 MiB。請減少每批張數，或使用單張下載。' : messages[status] || '相簿服務暫時無法完成操作，請稍後再試。');
  }
}

export async function requestClientGallery<T>(path: '/api/client/gallery' | '/api/client/selection' | '/api/client/download' | '/api/client/draft', token: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Phox-Request': '1' },
      credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new ClientGalleryError(response.status, typeof result?.code === 'string' ? result.code : '');
    if (!result || typeof result !== 'object') throw new ClientGalleryError(502);
    return result as T;
  } catch (error) {
    if (error instanceof ClientGalleryError) throw error;
    throw new ClientGalleryError(0);
  } finally { window.clearTimeout(timeout); }
}

/** Public sample data only. These existing homepage images are never private client photos. */
export function publicDemoGallery(): ClientGallery {
  return {
    gallery: { id: 'public-demo', title: '把喜歡的瞬間，留在一起。', status: 'proofing', selectionLimit: 3, allowDownloads: false, expiresAt: '' },
    photos: [
      { id: 'public-01', title: '公開範例 01', previewUrl: '/assets/hero.webp', downloadable: false },
      { id: 'public-02', title: '公開範例 02', previewUrl: '/assets/hero-02.webp', downloadable: false },
      { id: 'public-03', title: '公開範例 03', previewUrl: '/assets/hero-03.webp', downloadable: false },
      { id: 'public-04', title: '公開範例 04', previewUrl: '/assets/hero-04.webp', downloadable: false },
    ],
    selection: null,
    draft: null,
  };
}


export async function requestGalleryArchive(token: string, photoIds: string[]): Promise<Blob> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch('/api/client/archive', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Phox-Request': '1' }, credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal, body: JSON.stringify({ photoIds }) });
    if (!response.ok) { const error = await response.json().catch(() => null); throw new ClientGalleryError(response.status, error?.code || ''); }
    if (response.headers.get('content-type') !== 'application/zip') throw new ClientGalleryError(502);
    return await response.blob();
  } catch (error) { if (error instanceof ClientGalleryError) throw error; throw new ClientGalleryError(0); }
  finally { window.clearTimeout(timeout); }
}

const cloneDraft = (value: DraftContent): DraftContent => ({ photoIds: [...value.photoIds], photoNotes: { ...value.photoNotes }, note: value.note });
const draftKey = (value: DraftContent) => JSON.stringify([value.photoIds, Object.entries(value.photoNotes).sort(([a], [b]) => a.localeCompare(b)), value.note]);
/** Serial, optimistic autosaves. Uncertain requests always retry the identical payload/version. */
export class DraftSaver {
  version = 0;
  conflict = false;
  error = '';
  private value: DraftContent = { photoIds: [], photoNotes: {}, note: '' };
  private savedKey = draftKey(this.value);
  private pending: (DraftContent & { version: number }) | null = null;
  private running: Promise<boolean> | null = null;
  private stopped = false;
  constructor(private send: (value: DraftContent & { version: number }) => Promise<ClientDraft>, private changed: () => void = () => {}) {}
  get dirty() { return this.pending !== null || draftKey(this.value) !== this.savedKey; }
  get saving() { return this.running !== null; }
  reset(value: DraftContent, version: number) { this.value = cloneDraft(value); this.savedKey = draftKey(value); this.version = version; this.pending = null; this.conflict = false; this.error = ''; this.stopped = false; this.changed(); }
  update(value: DraftContent) { this.value = cloneDraft(value); this.changed(); }
  stop() { this.stopped = true; }
  async flush(): Promise<boolean> {
    if (this.running) return this.running;
    if (this.stopped || this.conflict) return false;
    this.running = this.drain(); this.changed();
    try { return await this.running; } finally { this.running = null; this.changed(); }
  }
  private async drain(): Promise<boolean> {
    while (this.dirty && !this.stopped && !this.conflict) {
      this.pending ??= { ...cloneDraft(this.value), version: this.version };
      const request = this.pending;
      let result: ClientDraft | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        try { result = await this.send(request); break; }
        catch (error) {
          // Only an identical request may retry after an uncertain transport failure.
          if (attempt === 0 && error instanceof ClientGalleryError && [0, 503].includes(error.status)) continue;
          this.conflict = error instanceof ClientGalleryError && error.status === 409;
          this.error = error instanceof Error ? error.message : '草稿未儲存。'; this.changed(); return false;
        }
      }
      if (!result || !Number.isSafeInteger(result.version) || result.version !== request.version + 1 || draftKey(result) !== draftKey(request)) { this.error = '無法確認草稿是否儲存，請保留此頁並再試。'; return false; }
      this.version = result.version; this.savedKey = draftKey(request); this.pending = null; this.error = ''; this.changed();
    }
    return !this.dirty && !this.stopped && !this.conflict;
  }
}
