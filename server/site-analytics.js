import { HttpError, getSecretConfig, supabaseRequest } from './auth.js';

const EVENT_NAMES = new Set([
  'page_view', 'inquiry_cta_click', 'outbound_contact_click',
  'cta_view', 'form_start', 'form_review', 'form_submit_attempt', 'form_submit_error',
  'form_step_enter', 'form_step_complete',
]);
const EVENT_KEYS = new Set(['id', 'name', 'path', 'clientAt', 'placement', 'destination', 'errorCode', 'schemaVersion', 'pageVisitId', 'tabId', 'documentId', 'eventSeq', 'tabSeq', 'formInstanceId', 'stepId', 'visiblePercent', 'visibleMs']);
const SOURCE_KEYS = new Set(['utmSource', 'utmMedium', 'utmCampaign', 'referrerHost']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLACEMENTS = new Set([
  'header-desktop', 'header-mobile', 'hero', 'projects-general', 'projects-empty',
  'cooperation', 'portfolio-index', 'behind-scenes', 'inspiration-board',
  'contact-icon',
  'journal-footer', 'journal-body', 'plans', 'footer', 'other',
]);
const LEGACY_PLACEMENTS = new Set([
  'header-desktop', 'header-mobile', 'hero', 'projects-general', 'projects-empty',
  'cooperation', 'portfolio-index', 'behind-scenes', 'inspiration-board',
  'journal-footer', 'journal-body', 'plans', 'footer', 'other',
]);
const DESTINATIONS = new Set(['internal', 'google_form', 'instagram', 'threads', 'facebook', 'email', 'other']);
const ERROR_CODES = new Set(['validation', 'network', 'server', 'rate_limited', 'unknown']);
const FORM_STEPS = new Set(['styles', 'details', 'review']);
const UTM_SOURCES = new Set(['instagram', 'threads', 'facebook', 'google', 'other']);
const UTM_MEDIA = new Set(['social', 'story', 'post', 'bio', 'referral', 'organic', 'paid', 'email', 'other']);
const DEVICE_TYPES = new Set(['mobile', 'tablet', 'desktop', 'unknown']);
const FIXED_PUBLIC_PATHS = new Set([
  '/', '/about/', '/behind-scenes/', '/cooperation/', '/apply/',
  '/portfolio/', '/projects/', '/journal/', '/inspiration/',
]);
const VISITOR_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 30;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const COOKIE_NAME = '__Host-phox999-analytics';
const LOCAL_COOKIE_NAME = 'phox999-analytics-local';
const textEncoder = new TextEncoder();

const badRequest = (message = '分析事件格式不正確。') => new HttpError(400, message, 'invalid_analytics_event');

export function normalizePublicAnalyticsPath(value) {
  if (typeof value !== 'string' || value.length > 500 || !value.startsWith('/') || /[?#\\\u0000-\u001f]/.test(value)) return null;
  let decoded;
  try { decoded = decodeURIComponent(value); } catch { return null; }
  if (decoded.includes('//') || decoded.includes('\\') || /[\u0000-\u001f]/.test(decoded)) return null;
  const path = decoded === '/' ? '/' : decoded.endsWith('/') ? decoded : decoded + '/';
  if (FIXED_PUBLIC_PATHS.has(path)) return path;
  const match = path.match(/^\/(portfolio|projects|journal)\/([^/]+)\/$/u);
  if (!match || (match[1] === 'projects' && match[2] === 'preview')) return null;
  // Existing public portfolio slugs include spaces, plus signs and emoji.
  const slugPattern = match[1] === 'portfolio'
    ? /^[\p{L}\p{N}\p{M}\p{So} _+-]{1,100}$/u
    : /^[\p{L}\p{N}_-]{1,100}$/u;
  if (!slugPattern.test(match[2]) || match[2] === '.' || match[2] === '..') return null;
  return path;
}

export function normalizeAnalyticsEvent(value, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !EVENT_KEYS.has(key))) throw badRequest();
  if (!UUID_PATTERN.test(value.id || '') || !EVENT_NAMES.has(value.name)) throw badRequest();
  const schemaVersion = value.schemaVersion === undefined ? 1 : value.schemaVersion;
  if (![1, 2].includes(schemaVersion)) throw badRequest('不支援這個事件版本。');
  const path = normalizePublicAnalyticsPath(value.path);
  if (!path) throw badRequest('不支援這個頁面路徑。');

  const event = {
    event_id: value.id.toLowerCase(),
    schema_version: schemaVersion,
    event_name: value.name,
    page_path: path,
    client_at: null,
    placement: null,
    destination: null,
    error_code: null,
    page_visit_id: null,
    tab_id: null,
    document_id: null,
    event_seq: null,
    tab_seq: null,
    form_instance_id: null,
    step_id: null,
    visible_percent: null,
    visible_ms: null,
  };
  if (value.clientAt !== undefined && value.clientAt !== null) {
    if (typeof value.clientAt !== 'string' || value.clientAt.length > 40) throw badRequest();
    const clientTime = Date.parse(value.clientAt);
    if (!Number.isFinite(clientTime) || clientTime < now - 5 * 60_000 || clientTime > now + 60_000) throw badRequest('事件時間已過期。');
    event.client_at = new Date(clientTime).toISOString();
  }
  if (schemaVersion === 2) {
    for (const [key, column] of [['pageVisitId', 'page_visit_id'], ['tabId', 'tab_id'], ['documentId', 'document_id']]) {
      if (!UUID_PATTERN.test(value[key] || '')) throw badRequest();
      event[column] = value[key].toLowerCase();
    }
    if (!Number.isSafeInteger(value.eventSeq) || value.eventSeq < 1 || value.eventSeq > 10_000
      || !Number.isSafeInteger(value.tabSeq) || value.tabSeq < 1 || value.tabSeq > 1_000_000_000) throw badRequest();
    event.event_seq = value.eventSeq;
    event.tab_seq = value.tabSeq;
  } else if (['pageVisitId', 'tabId', 'documentId', 'eventSeq', 'tabSeq', 'formInstanceId', 'stepId', 'visiblePercent', 'visibleMs'].some((key) => value[key] !== undefined)) {
    throw badRequest('舊版事件不可包含 v2 識別欄位。');
  }

  const formEvent = ['form_start', 'form_review', 'form_submit_attempt', 'form_submit_error', 'form_step_enter', 'form_step_complete'].includes(value.name);
  if (schemaVersion === 2 && formEvent) {
    if (!UUID_PATTERN.test(value.formInstanceId || '')) throw badRequest();
    event.form_instance_id = value.formInstanceId.toLowerCase();
  } else if (value.formInstanceId !== undefined) {
    throw badRequest();
  }
  if (value.name === 'form_step_enter' || value.name === 'form_step_complete') {
    if (!FORM_STEPS.has(value.stepId)) throw badRequest();
    event.step_id = value.stepId;
  } else if (value.stepId !== undefined) {
    throw badRequest();
  }

  if (value.name === 'inquiry_cta_click') {
    if (!PLACEMENTS.has(value.placement) || !DESTINATIONS.has(value.destination)) throw badRequest();
    event.placement = value.placement;
    event.destination = value.destination;
  } else if (value.name === 'cta_view') {
    if (schemaVersion !== 2 || !PLACEMENTS.has(value.placement)
      || !Number.isSafeInteger(value.visiblePercent) || value.visiblePercent < 50 || value.visiblePercent > 100
      || !Number.isSafeInteger(value.visibleMs) || value.visibleMs < 1_000 || value.visibleMs > 60_000) throw badRequest();
    event.placement = value.placement;
    event.visible_percent = value.visiblePercent;
    event.visible_ms = value.visibleMs;
  } else if (value.name === 'outbound_contact_click') {
    if (!DESTINATIONS.has(value.destination) || value.destination === 'internal') throw badRequest();
    event.destination = value.destination;
  } else if (value.name === 'form_submit_error') {
    if (!ERROR_CODES.has(value.errorCode)) throw badRequest();
    event.error_code = value.errorCode;
  } else if (value.placement !== undefined || value.destination !== undefined || value.errorCode !== undefined
    || value.visiblePercent !== undefined || value.visibleMs !== undefined) {
    throw badRequest();
  }
  return event;
}

export function normalizeAnalyticsBatch(body, now = Date.now()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest();
  const allowed = new Set(['events', 'landing', 'device', 'preference', 'bootstrap']);
  if (Object.keys(body).some((key) => !allowed.has(key))) throw badRequest();
  if (body.bootstrap !== undefined) {
    if (body.bootstrap !== true || Object.keys(body).length !== 1) throw badRequest();
    return { bootstrap: true };
  }
  if (body.preference !== undefined) {
    if (!['disabled', 'enabled', 'clear'].includes(body.preference) || body.events !== undefined || body.landing !== undefined || body.device !== undefined) throw badRequest();
    return { preference: body.preference };
  }
  if (!Array.isArray(body.events) || body.events.length < 1 || body.events.length > 10) throw badRequest();
  return {
    events: body.events.map((event) => normalizeAnalyticsEvent(event, now)),
    landing: normalizeLanding(body.landing),
    device: DEVICE_TYPES.has(body.device) ? body.device : 'unknown',
  };
}

function normalizeLanding(value) {
  if (value === undefined || value === null) return { source: 'direct', medium: null, campaign: null };
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !SOURCE_KEYS.has(key))) throw badRequest();
  const rawSource = typeof value.utmSource === 'string' ? value.utmSource.trim().toLowerCase().slice(0, 40) : '';
  const rawMedium = typeof value.utmMedium === 'string' ? value.utmMedium.trim().toLowerCase().slice(0, 40) : '';
  const rawCampaign = typeof value.utmCampaign === 'string' ? value.utmCampaign.trim().toLowerCase() : '';
  const campaign = /^[a-z0-9][a-z0-9_-]{0,39}$/.test(rawCampaign) ? rawCampaign : null;
  if (rawSource && UTM_SOURCES.has(rawSource)) {
    return { source: rawSource, medium: UTM_MEDIA.has(rawMedium) ? rawMedium : null, campaign };
  }

  const host = typeof value.referrerHost === 'string' ? value.referrerHost.trim().toLowerCase() : '';
  if (!host) return { source: 'direct', medium: null, campaign: null };
  if (host === 'phox999.com' || host === 'www.phox999.com') return { source: 'direct', medium: null, campaign: null };
  const source = hostMatches(host, ['instagram.com', 'l.instagram.com']) ? 'instagram'
    : hostMatches(host, ['threads.net']) ? 'threads'
      : hostMatches(host, ['facebook.com', 'fb.com', 'm.facebook.com', 'l.facebook.com']) ? 'facebook'
        : hostMatches(host, ['google.com', 'google.com.tw', 'google.co.jp', 'google.co.uk']) ? 'google'
          : 'other';
  return { source, medium: 'referral', campaign: null };
}

function hostMatches(host, domains) {
  if (host.length > 253 || /[/:?#@\\\s]/.test(host)) return false;
  return domains.some((domain) => host === domain || host.endsWith('.' + domain));
}

function cookieName(request) {
  const url = new URL(request.url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !local) throw new HttpError(400, '量測需要 HTTPS 連線。', 'https_required');
  return url.protocol === 'https:' ? COOKIE_NAME : LOCAL_COOKIE_NAME;
}

function analyticsSecret(env) {
  const secret = String(env.SITE_ANALYTICS_COOKIE_SECRET || '');
  if (secret.length < 32) throw new HttpError(503, '量測服務尚未設定。', 'analytics_not_configured');
  return secret;
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid encoding');
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function signingKey(env, cryptoApi = globalThis.crypto) {
  return cryptoApi.subtle.importKey('raw', textEncoder.encode(analyticsSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signIdentity(identity, env, cryptoApi = globalThis.crypto) {
  const payload = base64UrlEncode(textEncoder.encode(JSON.stringify(identity)));
  const signature = await cryptoApi.subtle.sign('HMAC', await signingKey(env, cryptoApi), textEncoder.encode(payload));
  return payload + '.' + base64UrlEncode(new Uint8Array(signature));
}

async function readIdentityCookie(request, env, now, cryptoApi = globalThis.crypto) {
  const name = cookieName(request);
  const header = request.headers.get('cookie') || '';
  const pair = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(name + '='));
  if (!pair) return null;
  try {
    const token = pair.slice(name.length + 1);
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra !== undefined) return null;
    const key = await signingKey(env, cryptoApi);
    const valid = await cryptoApi.subtle.verify('HMAC', key, base64UrlDecode(signature), textEncoder.encode(payload));
    if (!valid) return null;
    const identity = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    if (!identity || !UUID_PATTERN.test(identity.visitorId || '') || !UUID_PATTERN.test(identity.sessionId || '')
      || !Number.isSafeInteger(identity.lastSeenAt) || typeof identity.optOut !== 'boolean') return null;
    if (identity.lastSeenAt > now + 60_000 || now - identity.lastSeenAt > VISITOR_COOKIE_TTL_SECONDS * 1000) return null;
    if (now - identity.lastSeenAt > SESSION_IDLE_MS) identity.sessionId = cryptoApi.randomUUID();
    identity.lastSeenAt = now;
    return identity;
  } catch { return null; }
}

export async function issueAnalyticsCookie(request, env, identity, { clear = false } = {}) {
  const name = cookieName(request);
  const secure = new URL(request.url).protocol === 'https:';
  const attributes = 'Path=/; HttpOnly; SameSite=Lax' + (secure ? '; Secure' : '');
  return clear ? name + '=; ' + attributes + '; Max-Age=0'
    : name + '=' + await signIdentity(identity, env) + '; ' + attributes + '; Max-Age=' + VISITOR_COOKIE_TTL_SECONDS;
}

export async function analyticsIdentityForRequest(request, env, now = Date.now()) {
  const identity = await readIdentityCookie(request, env, now)
    || { visitorId: crypto.randomUUID(), sessionId: crypto.randomUUID(), lastSeenAt: now, optOut: false };
  const cookie = await issueAnalyticsCookie(request, env, identity);
  return { identity, cookie };
}

export async function existingAnalyticsIdentity(request, env, now = Date.now()) {
  if (!env.SITE_ANALYTICS_COOKIE_SECRET) return null;
  const identity = await readIdentityCookie(request, env, now);
  if (!identity || identity.optOut) return null;
  return { identity, cookie: await issueAnalyticsCookie(request, env, identity) };
}

export async function recordAnalyticsEvents(env, identity, events, landing, device) {
  const config = getSecretConfig(env);
  const schemaVersion = events.some((event) => event.schema_version === 2) ? 2 : 1;
  const payload = {
    p_visitor_id: identity.visitorId,
    p_session_id: identity.sessionId,
    p_events: events,
    p_source: landing.source,
    p_medium: landing.medium,
    p_campaign: landing.campaign,
    p_device: device,
  };
  if (schemaVersion === 1) return supabaseRequest(config, '/rest/v1/rpc/record_site_analytics_events', { method: 'POST', body: payload });

  try {
    return await supabaseRequest(config, '/rest/v1/rpc/record_site_analytics_events_v2', {
      method: 'POST', body: payload,
    });
  } catch (error) {
    if (!(error instanceof HttpError) || error.code !== 'upstream_http_404') throw error;
    const legacyEvents = events.filter((event) => !['cta_view', 'form_step_enter', 'form_step_complete'].includes(event.event_name))
      .map((event) => ({
        event_id: event.event_id,
        event_name: event.event_name,
        page_path: event.page_path,
        client_at: event.client_at,
        placement: event.placement && !LEGACY_PLACEMENTS.has(event.placement) ? 'other' : event.placement,
        destination: event.destination,
        error_code: event.error_code,
      }));
    if (!legacyEvents.length) return { data: { accepted: 0, rate_limited: false, v2Unavailable: true } };
    return supabaseRequest(config, '/rest/v1/rpc/record_site_analytics_events', {
      method: 'POST', body: { ...payload, p_events: legacyEvents },
    });
  }
}

export async function recordInquiryAttribution(env, submissionId, identity, formInstanceId = null) {
  const config = getSecretConfig(env);
  const validFormId = typeof formInstanceId === 'string' && UUID_PATTERN.test(formInstanceId) ? formInstanceId.toLowerCase() : null;
  try {
    return await supabaseRequest(config, '/rest/v1/rpc/record_site_analytics_inquiry_v2', {
      method: 'POST',
      body: {
        p_submission_id: submissionId,
        p_visitor_id: identity.visitorId,
        p_session_id: identity.sessionId,
        p_form_instance_id: validFormId,
      },
    });
  } catch (error) {
    if (!(error instanceof HttpError) || error.code !== 'upstream_http_404') throw error;
    return supabaseRequest(config, '/rest/v1/rpc/record_site_analytics_inquiry', {
      method: 'POST',
      body: { p_submission_id: submissionId, p_visitor_id: identity.visitorId, p_session_id: identity.sessionId },
    });
  }
}

export async function runAnalyticsRetention(env) {
  const config = getSecretConfig(env);
  return supabaseRequest(config, '/rest/v1/rpc/purge_site_analytics', { method: 'POST', body: {} });
}

function dateInTaipei(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return values.year + '-' + values.month + '-' + values.day;
}

function addDays(date, days) {
  const result = new Date(date + 'T00:00:00.000Z');
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function taipeiMidnight(date) {
  return new Date(date + 'T00:00:00+08:00');
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function resolveAnalyticsRange(params, nowValue = new Date()) {
  const now = new Date(nowValue);
  if (!Number.isFinite(now.getTime())) throw badRequest('查詢日期不正確。');
  const range = params.get('range') || 'today';
  const today = dateInTaipei(now);
  let startDate;
  let endDate;
  let start;
  let end;
  if (range === 'today') {
    startDate = today;
    endDate = today;
    start = taipeiMidnight(today);
    end = now;
  } else if (range === 'yesterday') {
    startDate = addDays(today, -1);
    endDate = startDate;
    start = taipeiMidnight(startDate);
    end = taipeiMidnight(today);
  } else if (range === '7d' || range === '30d') {
    const days = range === '7d' ? 7 : 30;
    startDate = addDays(today, -(days - 1));
    endDate = today;
    start = taipeiMidnight(startDate);
    end = now;
  } else if (range === 'custom') {
    startDate = params.get('start') || '';
    endDate = params.get('end') || '';
    if (!isIsoDate(startDate) || !isIsoDate(endDate)
      || startDate > endDate || endDate > today) throw badRequest('自訂日期區間不正確。');
    const days = Math.floor((taipeiMidnight(endDate) - taipeiMidnight(startDate)) / 86_400_000) + 1;
    if (days > 90) throw badRequest('自訂區間最多查詢 90 天。');
    if (taipeiMidnight(startDate).getTime() < now.getTime() - 90 * 86_400_000 + 5 * 60_000) {
      throw badRequest('開始日期已超出 90 天資料保留範圍。');
    }
    start = taipeiMidnight(startDate);
    const requestedEnd = taipeiMidnight(addDays(endDate, 1));
    end = requestedEnd > now ? now : requestedEnd;
  } else {
    throw badRequest('請選擇有效的日期區間。');
  }

  const elapsed = end.getTime() - start.getTime();
  let previousStart;
  let previousEnd;
  if (range === 'today') {
    previousStart = taipeiMidnight(addDays(today, -1));
    previousEnd = new Date(previousStart.getTime() + elapsed);
  } else if (range === 'yesterday') {
    previousEnd = start;
    previousStart = new Date(previousEnd.getTime() - elapsed);
  } else if (range === '7d' || range === '30d') {
    const days = range === '7d' ? 7 : 30;
    previousEnd = new Date(end.getTime() - days * 86_400_000);
    previousStart = new Date(previousEnd.getTime() - elapsed);
  } else {
    previousEnd = new Date(start.getTime());
    previousStart = new Date(previousEnd.getTime() - elapsed);
  }

  return {
    range,
    startDate,
    endDate,
    start: start.toISOString(),
    end: end.toISOString(),
    previousStart: previousStart.toISOString(),
    previousEnd: previousEnd.toISOString(),
    hourly: range === 'today',
    isCurrentDay: endDate === today,
  };
}

export const ANALYTICS_LIMITS = Object.freeze({
  visitorCookieDays: 30,
  sessionIdleMinutes: 30,
  rawRetentionDays: 90,
  maxEventsPerBatch: 10,
  maxReportDays: 90,
});
