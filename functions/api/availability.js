const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f-]{36}$/i;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  },
});

function validDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function publicRange(url) {
  const keys = [...url.searchParams.keys()];
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (keys.length !== 2 || new Set(keys).size !== 2 || !validDate(from) || !validDate(to)) return null;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days < 1 || days > 180) return null;
  return { from, to };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => !['from', 'to'].includes(key))) {
    return json({ success: false, message: '查詢包含不支援的欄位。' }, 400);
  }

  const range = publicRange(url);
  if (!range) return json({ success: false, message: '檔期查詢日期格式不正確。' }, 400);

  const supabaseUrl = String(env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const publicKey = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !publicKey) {
    return json({ success: false, message: '檔期暫時無法載入，請稍後重試或直接詢問。' }, 503);
  }

  let response;
  try {
    const headers = {
      apikey: publicKey,
      'Content-Type': 'application/json',
    };
    // Legacy anon JWT keys also need a bearer header; publishable keys do not.
    if (!publicKey.startsWith('sb_publishable_')) headers.Authorization = `Bearer ${publicKey}`;

    response = await fetch(`${supabaseUrl}/rest/v1/rpc/get_public_availability`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ p_from: range.from, p_to: range.to }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return json({ success: false, message: '檔期暫時無法載入，請稍後重試或直接詢問。' }, 503);
  }

  if (!response.ok) {
    return json({ success: false, message: '檔期暫時無法載入，請稍後重試或直接詢問。' }, 503);
  }

  let rows;
  try {
    rows = await response.json();
  } catch {
    return json({ success: false, message: '檔期暫時無法載入，請稍後重試或直接詢問。' }, 503);
  }

  if (!Array.isArray(rows) || rows.some((row) =>
    !row || typeof row.id !== 'string' || !UUID_PATTERN.test(row.id)
    || !Number.isFinite(Date.parse(row.startsAt)) || !Number.isFinite(Date.parse(row.endsAt))
    || Date.parse(row.endsAt) <= Date.parse(row.startsAt)
    || !['open', 'unavailable'].includes(row.status)
  )) {
    return json({ success: false, message: '檔期暫時無法載入，請稍後重試或直接詢問。' }, 503);
  }

  // Only public fields are returned; internal booking notes and inquiry IDs stay server-side.
  return json({
    slots: rows.map(({ id, startsAt, endsAt, status }) => ({ id, startsAt, endsAt, status })),
  });
}
