import { assertMutation, endpoint, getSecretConfig, json, readJson, supabaseRequest } from '../../server/auth.js';
import { feedbackSubmission, publicFeedback, PUBLIC_FEEDBACK_FIELDS } from '../../server/feedback.js';

export const onRequest = endpoint(async ({ request, env }) => {
  if (request.method === 'GET') {
    const query = new URLSearchParams({ select: PUBLIC_FEEDBACK_FIELDS, status: 'eq.approved', allow_publication: 'eq.true', order: 'created_at.desc,id.desc', limit: '20' });
    const { data } = await supabaseRequest(getSecretConfig(env), `/rest/v1/collaboration_feedback?${query}`);
    return json({ feedback: publicFeedback(data) });
  }
  if (request.method !== 'POST') return json({ success: false, message: '不支援此操作。' }, 405, { Allow: 'GET, POST' });
  assertMutation(request);
  const payload = feedbackSubmission(await readJson(request, 24 * 1024));
  await supabaseRequest(getSecretConfig(env), '/rest/v1/collaboration_feedback', { method: 'POST', body: payload, headers: { Prefer: 'return=minimal' } });
  return json({ success: true, message: '回饋已送出。聯絡方式與改善建議只供工作室查看；公開內容仍需人工確認。' }, 201);
});
