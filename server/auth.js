// Server-only helpers. Nothing from this directory is imported by Astro client code.
export class HttpError extends Error {
  constructor(status, message, code = 'request_failed') {
    super(message);
    this.status = status;
    this.code = code;
    this.headers = {};
  }
}

export function json(data, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'private, no-store',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Cookie',
  });
  new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  return new Response(JSON.stringify(data), { status, headers });
}

export function endpoint(handler) {
  return async (context) => {
    try { return await handler(context); }
    catch (error) {
      // Do not log passwords, cookies, user data or provider error messages.
      if (error instanceof HttpError) return json({ success: false, message: error.message, code: error.code }, error.status, error.headers);
      return json({ success: false, message: '服務暫時無法使用，請稍後再試。', code: 'service_unavailable' }, 503);
    }
  };
}

const configError = (code = 'not_configured') => new HttpError(503, '後台設定尚未完成，請聯絡網站管理員。', code);

async function withUpstreamCode(operation, code) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof HttpError && (error.code === 'upstream_unavailable' || error.code.startsWith('upstream_'))) {
      const detail = error.code === 'upstream_unavailable' ? 'network' : error.code.slice('upstream_'.length);
      throw new HttpError(503, error.message, `${code}_${detail}`);
    }
    throw error;
  }
}

function legacyRole(key) {
  try {
    const parts = key.split('.');
    if (parts.length !== 3) return '';
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))).role;
  } catch { return ''; }
}

function getSupabaseUrl(env) {
  let url;
  try { url = new URL(env.SUPABASE_URL); } catch { throw configError(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !/^\/?$/.test(url.pathname)) throw configError();
  return url.origin;
}

export function getSupabaseConfig(env) {
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '').trim();
  const url = getSupabaseUrl(env);
  // Decoding is only a guard against configuring the wrong API key, never authentication.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && legacyRole(key) !== 'anon') throw configError();
  return { url, key };
}

export function getSecretConfig(env) {
  const url = getSupabaseUrl(env);
  const key = String(env.SUPABASE_SECRET_KEY || '').trim();
  if (!key) throw configError('missing_secret_key');
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(key) && legacyRole(key) !== 'service_role') throw configError('invalid_secret_key');
  return { url, key };
}

export function assertMutation(request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin || request.headers.get('x-phox-request') !== '1'
    || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, '請從本站頁面操作，再重新嘗試。', 'invalid_origin');
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, '請使用 JSON 格式送出。', 'invalid_content_type');
  }
}

export async function readJson(request, maxBytes = 32768) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > maxBytes) throw new HttpError(413, '提交資料過大。', 'payload_too_large');
  if (!request.body) throw new HttpError(400, '提交資料格式不正確。', 'invalid_json');
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, '提交資料過大。', 'payload_too_large');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, '提交資料格式不正確。', 'invalid_json');
  } finally { reader.releaseLock(); }
  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value;
  } catch { throw new HttpError(400, '提交資料格式不正確。', 'invalid_json'); }
}

export async function supabaseRequest(config, path, options = {}) {
  if (!path.startsWith('/') || path.startsWith('//')) throw configError();
  const headers = new Headers(options.headers || {});
  headers.set('apikey', config.key);
  // New API keys are not JWTs: only a verified user's token belongs in Authorization.
  if (options.accessToken) headers.set('Authorization', `Bearer ${options.accessToken}`);
  else if (legacyRole(config.key)) headers.set('Authorization', `Bearer ${config.key}`);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response;
  let data = null;
  try {
    response = await fetch(config.url + path, {
      method: options.method || 'GET', headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal, redirect: 'error', cache: 'no-store',
    });
    if (options.method !== 'HEAD' && response.status !== 204) {
      const text = await response.text();
      if (text) {
        try { data = JSON.parse(text); }
        catch {
          // Gateways may return HTML for non-2xx errors (for example, an edge 522).
          // Preserve the HTTP status below instead of masking it as a JSON parse error.
          if (response.ok) throw new HttpError(503, '服務暫時無法使用，請稍後再試。', 'upstream_invalid_response');
        }
      }
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, '連線暫時無法完成，請稍後再試。', 'upstream_unavailable');
  }
  finally { clearTimeout(timeout); }
  if (!response.ok) {
    if (data?.code === 'P0001' && data.message === 'conflict') throw new HttpError(409, '這筆資料已被更新。請重新載入後再編輯，避免覆蓋他人的變更。', 'conflict');
    if (data?.code === 'P0002' && data.message === 'not_found') throw new HttpError(404, '找不到這筆資料。', 'not_found');
    if (data?.code === '22023') throw new HttpError(400, '欄位內容不符合規定，請檢查後再試。', 'invalid_input');
    if (data?.code === '42501') throw new HttpError(403, '此帳號沒有管理權限。', 'forbidden');
    if (response.status === 429) {
      const error = new HttpError(429, '嘗試次數過多，請稍後再試。', 'rate_limited');
      const retry = Number(response.headers.get('retry-after'));
      error.headers = { 'Retry-After': String(Number.isFinite(retry) && retry > 0 ? Math.min(3600, Math.ceil(retry)) : 60) };
      throw error;
    }
    if (response.status === 401 || (path.startsWith('/auth/v1/') && [400, 403, 422].includes(response.status))) {
      throw new HttpError(401, '登入狀態已失效，請重新登入。', 'unauthenticated');
    }
    if (response.status === 403) throw new HttpError(403, '此帳號沒有管理權限。', 'forbidden');
    throw new HttpError(503, '服務設定或連線尚未就緒，請聯絡網站管理員。', `upstream_http_${response.status}`);
  }
  return { data, status: response.status, headers: response.headers };
}

function cookiePolicy(context) {
  const url = new URL(context.request.url);
  const secure = url.protocol === 'https:';
  const local = context.env.AUTH_ALLOW_LOCALHOST === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!secure && !local) throw new HttpError(400, '登入需要使用 HTTPS 連線。', 'https_required');
  return { prefix: secure ? '__Host-phox-' : 'phox-local-', attributes: `Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}` };
}

export function readSessionCookies(context) {
  const policy = cookiePolicy(context);
  const cookies = new Map();
  for (const part of (context.request.headers.get('cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    // Duplicate cookie names are ambiguous: reject instead of picking one.
    if (cookies.has(name)) { cookies.set(name, ''); continue; }
    try { cookies.set(name, decodeURIComponent(part.slice(index + 1).trim())); } catch { cookies.set(name, ''); }
  }
  const clean = (name) => {
    const token = cookies.get(policy.prefix + name) || '';
    return token.length <= 3500 && /^[A-Za-z0-9._~-]+$/.test(token) ? token : '';
  };
  return { accessToken: clean('access'), refreshToken: clean('refresh') };
}

function sessionCookieValues(context, session = null) {
  const policy = cookiePolicy(context);
  const cookies = [];
  if (session && (typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string'
    || !/^[A-Za-z0-9._~-]{1,3500}$/.test(session.access_token) || !/^[A-Za-z0-9._~-]{1,3500}$/.test(session.refresh_token)
    || !Number.isFinite(session.expires_in) || session.expires_in <= 0)) throw configError();
  const accessAge = session ? Math.min(3600, Math.floor(session.expires_in)) : 0;
  const refreshAge = session ? 12 * 60 * 60 : 0;
  for (const [name, value, age] of [['access', session?.access_token || '', accessAge], ['refresh', session?.refresh_token || '', refreshAge]]) {
    cookies.push(`${policy.prefix}${name}=${encodeURIComponent(value)}; Max-Age=${age}; ${policy.attributes}`);
  }
  return cookies;
}

export function sessionHeaders(context, session = null) {
  const headers = new Headers();
  for (const cookie of sessionCookieValues(context, session)) headers.append('Set-Cookie', cookie);
  return headers;
}

export function withSessionCookies(response, context, session = null) {
  // append preserves separate Set-Cookie values in Cloudflare's Headers implementation.
  for (const cookie of sessionCookieValues(context, session)) response.headers.append('Set-Cookie', cookie);
  return response;
}

export async function verifyAdminToken(env, accessToken) {
  if (!accessToken) throw new HttpError(401, '請先登入後台。', 'unauthenticated');
  const config = getSupabaseConfig(env);
  const { data: user } = await withUpstreamCode(
    () => supabaseRequest(config, '/auth/v1/user', { accessToken }), 'admin_user_check_unavailable',
  );
  if (!user || typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(user.id) || !user.email || !user.email_confirmed_at || user.is_anonymous === true) {
    throw new HttpError(401, '此帳號尚未完成驗證，請聯絡網站管理員。', 'unauthenticated');
  }
  const query = new URLSearchParams({ select: 'user_id,active', user_id: `eq.${user.id}`, active: 'eq.true', limit: '1' });
  const { data: admins } = await withUpstreamCode(
    () => supabaseRequest(config, `/rest/v1/site_admins?${query}`, { accessToken }), 'admin_allowlist_unavailable',
  );
  if (!Array.isArray(admins) || !admins.some((admin) => admin.user_id === user.id && admin.active === true)) throw new HttpError(403, '此帳號沒有管理權限，請聯絡網站管理員。', 'forbidden');
  return { user: { id: user.id, email: user.email }, accessToken, config };
}

export async function requireAdmin(context) {
  const origin = context.request.headers.get('origin');
  if (context.request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(context.request.url).origin)) {
    throw new HttpError(403, '請從本站頁面操作。', 'invalid_origin');
  }
  const { accessToken } = readSessionCookies(context);
  return verifyAdminToken(context.env, accessToken);
}

export async function checkLoginLimit(context, email) {
  const config = getSecretConfig(context.env);
  const local = context.env.AUTH_ALLOW_LOCALHOST === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(context.request.url).hostname);
  const ip = context.request.headers.get('cf-connecting-ip') || (local ? 'localhost' : '');
  if (!ip || ip.length > 80) throw new HttpError(503, '登入服務尚未就緒，請聯絡網站管理員。', 'missing_client_ip');
  const digest = async (value) => {
    const input = new TextEncoder().encode(`${config.key}\n${value}`);
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  };
  const [ipKey, emailKey] = await Promise.all([digest(`ip:${ip}`), digest(`email:${email.toLowerCase()}`)]);
  const { data } = await withUpstreamCode(
    () => supabaseRequest(config, '/rest/v1/rpc/consume_admin_login_attempt', { method: 'POST', body: { p_ip_key: ipKey, p_email_key: emailKey } }),
    'login_limit_upstream_unavailable',
  );
  if (!data || typeof data.allowed !== 'boolean') throw configError('login_limit_rpc_unavailable');
  if (!data.allowed) {
    const seconds = Math.max(1, Math.min(900, Math.ceil(Number(data.retry_after) || 900)));
    const error = new HttpError(429, `登入嘗試過多，請約 ${Math.ceil(seconds / 60)} 分鐘後再試。`, 'rate_limited');
    error.headers = { 'Retry-After': String(seconds) };
    throw error;
  }
}
