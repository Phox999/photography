import { createClient } from '@supabase/supabase-js';

const MAX_PAYLOAD_BYTES = 20 * 1024;

const contactMethods = new Set(['Instagram', 'Line', 'Facebook', 'Threads', '手機', '其他']);
const collaborationTypes = new Set(['輕量體驗(2hr)', '標準方案(3hr)', '主題合作']);

const fieldLimits = {
  name: 80,
  contact_method: 50,
  contact_account: 120,
  collaboration_type: 50,
  preferred_date: 200,
  description: 2000,
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });

const normalizeText = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeOptionalText = (value) => {
  const text = normalizeText(value);
  return text || null;
};

const normalizeConsent = (value) => value === true || value === 'true' || value === 'on';

const validateLength = (name, value) => {
  const limit = fieldLimits[name];

  if (!limit || value === null) {
    return null;
  }

  return value.length > limit ? `${name} 欄位不可超過 ${limit} 字。` : null;
};

const createSupabaseClient = (env) =>
  createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

export async function onRequestPost(context) {
  const { request, env } = context;
  const contentLength = Number(request.headers.get('content-length') || 0);

  if (contentLength > MAX_PAYLOAD_BYTES) {
    return json(
      {
        success: false,
        message: '提交資料過大。',
      },
      413,
    );
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    return json(
      {
        success: false,
        message: '伺服器設定尚未完成。',
      },
      500,
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json(
      {
        success: false,
        message: '提交資料格式不正確。',
      },
      400,
    );
  }

  if (!body || typeof body !== 'object') {
    return json(
      {
        success: false,
        message: '提交資料格式不正確。',
      },
      400,
    );
  }

  if (normalizeText(body.website)) {
    return json({
      success: true,
      message: '合作意向已送出。',
    });
  }

  const payload = {
    name: normalizeText(body.name),
    contact_method: normalizeText(body.contact_method),
    contact_account: normalizeText(body.contact_account),
    collaboration_type: normalizeText(body.collaboration_type),
    preferred_date: normalizeOptionalText(body.preferred_date),
    description: normalizeOptionalText(body.description),
    consent: normalizeConsent(body.consent),
  };

  const lengthError = Object.entries(payload)
    .filter(([, value]) => typeof value === 'string')
    .map(([name, value]) => validateLength(name, value))
    .find(Boolean);

  if (lengthError) {
    return json(
      {
        success: false,
        message: lengthError,
      },
      400,
    );
  }

  if (!payload.name || !payload.contact_method || !payload.contact_account || !payload.collaboration_type || !payload.description) {
    return json(
      {
        success: false,
        message: '請填寫姓名、聯絡方式、聯絡賬號、合作類型與想拍攝的風格 / 主題。',
      },
      400,
    );
  }

  if (!payload.consent) {
    return json(
      {
        success: false,
        message: '請先同意資料使用說明。',
      },
      400,
    );
  }

  if (!contactMethods.has(payload.contact_method)) {
    return json(
      {
        success: false,
        message: '請選擇有效的聯絡方式。',
      },
      400,
    );
  }

  if (!collaborationTypes.has(payload.collaboration_type)) {
    return json(
      {
        success: false,
        message: '請選擇有效的合作類型。',
      },
      400,
    );
  }

  const supabase = createSupabaseClient(env);
  const { error } = await supabase.from('collaboration_requests').insert(payload);

  if (error) {
    console.error('Supabase insert failed', {
      code: error.code,
      message: error.message,
    });

    return json(
      {
        success: false,
        message: '資料送出失敗，請稍後再試。',
      },
      500,
    );
  }

  return json(
    {
      success: true,
      message: '合作意向已送出，我會盡快與你聯絡。',
    },
    201,
  );
}
