export interface AdminSession {
  user: { id: string; email: string };
  role: 'admin';
}

export class AdminApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code = '', retryAfter = 0) {
    const messages: Record<number, string> = {
      0: '連線失敗或等待逾時，請檢查網路後再試。',
      400: '資料格式不正確，請檢查輸入內容。',
      401: '登入已逾時，請重新登入。',
      403: '此帳號沒有管理權限。請聯絡網站管理員。',
      404: '找不到這筆資料，請重新載入清單。',
      409: '資料已被其他操作更新。你的修改尚未覆蓋原資料，請重新載入後再編輯。',
      413: '資料內容過長，請縮短後再試。',
      422: '資料格式不正確，請檢查輸入內容。',
      429: '操作過於頻繁，請稍候再試。',
      503: '管理服務尚未完成設定或暫時無法使用。請聯絡網站管理員。',
    };
    super(status === 429 && retryAfter > 0 ? `操作過於頻繁，請在 ${retryAfter} 秒後再試。` : messages[status] || '服務暫時無法完成操作，請稍後再試。');
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }
}

type RequestOptions = { method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; retryAuth?: boolean };
let refreshPromise: Promise<AdminSession> | null = null;
let sessionPromise: Promise<AdminSession> | null = null;
let dirty = false;
let shellInitialized = false;

async function requestOnce<T>(path: string, options: RequestOptions): Promise<T> {
  if (!path.startsWith('/api/') || path.startsWith('//') || path.includes('\\')) throw new AdminApiError(400);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Phox-Request': '1' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    let data: unknown;
    try { data = await response.json(); } catch { throw new AdminApiError(response.ok ? 502 : response.status); }
    if (!response.ok) {
      const value = data && typeof data === 'object' && 'code' in data ? (data as { code?: unknown }).code : '';
      const retryAfter = Math.min(86400, Math.max(0, Number.parseInt(response.headers.get('Retry-After') || '0', 10) || 0));
      throw new AdminApiError(response.status, typeof value === 'string' ? value.slice(0, 80) : '', retryAfter);
    }
    return data as T;
  } catch (error) {
    if (error instanceof AdminApiError) throw error;
    throw new AdminApiError(0);
  } finally { window.clearTimeout(timeout); }
}

export async function requestAdmin<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try { return await requestOnce<T>(path, options); }
  catch (error) {
    if (!(error instanceof AdminApiError) || error.status !== 401 || options.retryAuth === false || path.startsWith('/api/auth/login') || path.startsWith('/api/auth/refresh')) {
      if (error instanceof AdminApiError && [401, 403].includes(error.status)) notifyAuthFailure(error);
      throw error;
    }
    if (!refreshPromise) {
      refreshPromise = requestOnce<AdminSession>('/api/auth/refresh', { method: 'POST', body: {} })
        .finally(() => { refreshPromise = null; });
    }
    try {
      await refreshPromise;
      return await requestOnce<T>(path, { ...options, retryAuth: false });
    } catch (retryError) {
      if (retryError instanceof AdminApiError && [401, 403].includes(retryError.status)) notifyAuthFailure(retryError);
      throw retryError;
    }
  }
}

function notifyAuthFailure(error: AdminApiError): void {
  window.dispatchEvent(new CustomEvent('phox999:admin-auth-required', { detail: { status: error.status } }));
}

export function adminErrorMessage(error: unknown): string {
  return error instanceof AdminApiError ? error.message : '操作失敗，請稍後再試。';
}

export function setUnsavedChanges(value: boolean): void { dirty = value; }
export function confirmDiscardChanges(): boolean {
  return !dirty || window.confirm('還有尚未儲存的修改。確定要捨棄並繼續嗎？');
}

export function formatAdminDate(value: unknown): string {
  if (typeof value !== 'string') return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Taipei' });
}

export function requireAdminSession(): Promise<AdminSession> {
  if (!sessionPromise) {
    sessionPromise = requestAdmin<AdminSession>('/api/auth/session').catch((error) => {
      sessionPromise = null;
      if (error instanceof AdminApiError && error.status === 401) window.location.replace('/admin/login/');
      throw error;
    });
  }
  return sessionPromise;
}

export function initAdminShell(): void {
  if (shellInitialized) return;
  shellInitialized = true;
  const shell = document.querySelector<HTMLElement>('[data-admin-shell]');
  if (!shell) return;
  const gate = document.querySelector<HTMLElement>('[data-admin-gate]');
  const workspace = document.querySelector<HTMLElement>('[data-admin-workspace]');
  const user = document.querySelector<HTMLElement>('[data-admin-user]');
  const logout = document.querySelector<HTMLButtonElement>('[data-admin-logout]');
  const gateMessage = document.querySelector<HTMLElement>('[data-admin-gate-message]');
  const gateRetry = document.querySelector<HTMLButtonElement>('[data-admin-retry]');
  window.addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!link || link.target === '_blank' || link.hasAttribute('download') || link.getAttribute('href')?.startsWith('#')) return;
    if (dirty && !confirmDiscardChanges()) event.preventDefault();
    else if (dirty) setUnsavedChanges(false);
  });
  gateRetry?.addEventListener('click', () => window.location.reload());
  logout?.addEventListener('click', async () => {
    if (!confirmDiscardChanges()) return;
    logout.disabled = true;
    const status = document.querySelector<HTMLElement>('[data-admin-shell-status]');
    try {
      await requestAdmin('/api/auth/logout', { method: 'POST', body: {}, retryAuth: false });
      setUnsavedChanges(false);
      window.location.replace('/admin/login/');
    } catch (error) { if (status) status.textContent = adminErrorMessage(error); }
    finally { logout.disabled = false; }
  });
  if (shell.dataset.adminShell === 'login') return;
  window.addEventListener('phox999:admin-auth-required', () => {
    const notice = document.querySelector<HTMLElement>('[data-admin-shell-status]');
    const reauth = document.querySelector<HTMLElement>('[data-admin-reauth]');
    if (notice && workspace && !workspace.hidden) notice.textContent = '登入狀態或管理權限已變更。請先複製未儲存的內容，再重新登入。';
    if (reauth) reauth.hidden = false;
  });
  requireAdminSession().then((session) => {
    if (user) user.textContent = session.user.email;
    if (logout) logout.hidden = false;
    if (gate) gate.hidden = true;
    if (workspace) workspace.hidden = false;
  }).catch((error) => {
    if (gateMessage) gateMessage.textContent = adminErrorMessage(error);
    if (gateRetry) gateRetry.hidden = false;
    if (error instanceof AdminApiError && error.status === 403 && logout) logout.hidden = false;
  });
}
