import { HttpError, endpoint, json, getSupabaseConfig, assertMutation, readJson, supabaseRequest, readSessionCookies, withSessionCookies, requireAdmin, verifyAdminToken, checkLoginLimit } from '../../../server/auth.js';

const sessionView = (admin) => ({ user: admin.user, role: 'admin' });
const loginFailure = () => new HttpError(401, '無法登入，請確認帳號、密碼與管理權限。', 'invalid_credentials');

export const onRequest = endpoint(async (context) => {
  const { request, env } = context;
  const action = context.params.action;
  if (!['session', 'login', 'refresh', 'logout'].includes(action)) return json({ message: '找不到此功能。', code: 'not_found' }, 404);
  const allowed = action === 'session' ? 'GET' : 'POST';
  if (request.method !== allowed) return json({ message: '不支援此操作方式。', code: 'method_not_allowed' }, 405, { Allow: allowed });
  if (action === 'session') return json(sessionView(await requireAdmin(context)));
  assertMutation(request);
  const body = await readJson(request, 8192);
  // Validate transport before contacting the identity service or accepting a session.
  const cookies = readSessionCookies(context);

  if (action === 'login') {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body.password;
    if (Object.keys(body).some(key => !['email', 'password'].includes(key)) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
      || typeof password !== 'string' || password.length < 1 || password.length > 1024) throw loginFailure();
    const config = getSupabaseConfig(env);
    await checkLoginLimit(context, email);
    let session;
    try {
      try {
        ({ data: session } = await supabaseRequest(config, '/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } }));
      } catch (error) {
        if (error instanceof HttpError && error.code === 'upstream_unavailable') {
          throw new HttpError(503, error.message, 'auth_token_upstream_unavailable');
        }
        throw error;
      }
      const admin = await verifyAdminToken(env, session?.access_token);
      return withSessionCookies(json(sessionView(admin)), context, session);
    } catch (error) {
      // Password-correct non-admin attempts must not receive a usable browser session.
      if (session?.access_token) {
        try { await supabaseRequest(config, '/auth/v1/logout?scope=local', { method: 'POST', accessToken: session.access_token }); } catch {}
      }
      if (error instanceof HttpError && [401, 403].includes(error.status)) throw loginFailure();
      throw error;
    }
  }

  if (Object.keys(body).length) throw new HttpError(400, '此操作不接受額外欄位。', 'invalid_input');
  if (action === 'logout') {
    let revoked = false;
    // Always remove browser credentials, even if the upstream identity service is unavailable.
    if (cookies.accessToken || cookies.refreshToken) {
      try {
        const config = getSupabaseConfig(env);
        let token = cookies.accessToken;
        try {
          if (token) { await supabaseRequest(config, '/auth/v1/logout?scope=local', { method: 'POST', accessToken: token }); revoked = true; }
        } catch (error) { if (!(error instanceof HttpError) || error.status !== 401) throw error; }
        if (!revoked && cookies.refreshToken) {
          const { data: refreshed } = await supabaseRequest(config, '/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: cookies.refreshToken } });
          if (refreshed?.access_token) { await supabaseRequest(config, '/auth/v1/logout?scope=local', { method: 'POST', accessToken: refreshed.access_token }); revoked = true; }
        }
      } catch {}
    }
    return withSessionCookies(json({ success: true, message: revoked ? '已登出。' : '已清除此瀏覽器的登入狀態。' }), context);
  }

  if (!cookies.refreshToken) return withSessionCookies(json({ message: '請重新登入後台。', code: 'unauthenticated' }, 401), context);
  let refreshedSession;
  try {
    const config = getSupabaseConfig(env);
    const { data: session } = await supabaseRequest(config, '/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: cookies.refreshToken } });
    refreshedSession = session;
    const admin = await verifyAdminToken(env, session?.access_token);
    return withSessionCookies(json(sessionView(admin)), context, session);
  } catch (error) {
    if (error instanceof HttpError && [401, 403].includes(error.status)) {
      if (refreshedSession?.access_token) {
        try { await supabaseRequest(getSupabaseConfig(env), '/auth/v1/logout?scope=local', { method: 'POST', accessToken: refreshedSession.access_token }); } catch {}
      }
      return withSessionCookies(json({ message: error.message, code: error.code }, error.status), context);
    }
    // A temporary outage does not erase a recoverable refresh cookie.
    throw error;
  }
});
