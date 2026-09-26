import { assertMutation, endpoint, HttpError, json, readJson, requireAdmin, supabaseRequest } from '../../../server/auth.js';
import { allowMethods } from '../../../server/admin-validation.js';
import { hashToken, invalidInput, newToken, objectPath, textField, validId } from '../../_lib/client-gallery.js';

const galleryFields = 'id,title,status,selection_limit,allow_downloads,created_at,updated_at';
const statuses = new Set(['draft', 'proofing', 'delivered']);

export const onRequest = endpoint(async (context) => {
  const unsupported = allowMethods(context.request, ['GET', 'POST', 'PATCH']);
  if (unsupported) return unsupported;
  if (context.request.method !== 'GET') assertMutation(context.request);
  const { config, accessToken } = await requireAdmin(context);
  const call = (path, options = {}) => supabaseRequest(config, path, { accessToken, ...options });
  if (context.request.method === 'GET') {
    const id = new URL(context.request.url).searchParams.get('id');
    if (id && !validId(id)) invalidInput();
    const query = new URLSearchParams({ select: galleryFields, order: 'created_at.desc', limit: id ? '1' : '100' });
    if (id) query.set('id', `eq.${id}`);
    const { data } = await call(`/rest/v1/client_galleries?${query}`);
    if (!id) return json({ galleries: data ?? [] });
    if (!data?.[0]) throw new HttpError(404, '找不到這個專屬相簿。', 'not_found');
    const related = async (table, select, limit) => (await call(`/rest/v1/${table}?${new URLSearchParams({ select, gallery_id: `eq.${id}`, limit: String(limit) })}`)).data ?? [];
    const [photos, invites, selections] = await Promise.all([
      related('client_gallery_photos', 'id,gallery_id,title,preview_path,delivery_path,approved,created_at', 500),
      related('client_gallery_invites', 'id,gallery_id,expires_at,revoked_at,created_at', 100),
      related('client_gallery_selections', 'id,invite_id,gallery_id,photo_ids,photo_notes,note,submitted_at', 100),
    ]);
    return json({ gallery: data[0], photos, invites, selections });
  }
  const body = await readJson(context.request, 12 * 1024);
  const action = body.action;
  const input = {};
  let token = null;
  if (context.request.method === 'POST') {
    if (action !== 'create') invalidInput();
    input.title = textField(body.title, 160);
    input.selection_limit = body.selectionLimit ?? 20;
  } else {
    if (!validId(body.id)) invalidInput();
    input.id = body.id;
    if (action === 'update') {
      if (body.title !== undefined) input.title = textField(body.title, 160);
      if (body.status !== undefined) { if (!statuses.has(body.status)) invalidInput(); input.status = body.status; }
      if (body.selectionLimit !== undefined) input.selection_limit = body.selectionLimit;
      if (body.allowDownloads !== undefined) { if (typeof body.allowDownloads !== 'boolean') invalidInput(); input.allow_downloads = body.allowDownloads; }
      if (Object.keys(input).length === 1) invalidInput();
    } else if (action === 'addPhoto' || action === 'updatePhoto') {
      if (action === 'updatePhoto' && !validId(body.photoId)) invalidInput();
      if (body.photoId !== undefined) { if (!validId(body.photoId)) invalidInput(); input.photo_id = body.photoId; }
      if (action === 'addPhoto' || body.title !== undefined) input.title = textField(body.title, 160);
      if (action === 'addPhoto' || body.previewPath !== undefined) input.preview_path = objectPath(body.previewPath, body.id);
      if (body.deliveryPath !== undefined) input.delivery_path = body.deliveryPath ? objectPath(body.deliveryPath, body.id) : null;
      if (body.approved !== undefined) { if (typeof body.approved !== 'boolean') invalidInput(); input.approved = body.approved; }
    } else if (action === 'issueInvite') {
      const days = body.expiresInDays ?? 14;
      if (!Number.isInteger(days) || days < 1 || days > 90) invalidInput();
      token = newToken();
      input.token_hash = await hashToken(token);
      input.expires_at = new Date(Date.now() + days * 86400000).toISOString();
    } else if (action === 'revokeInvite') {
      if (!validId(body.inviteId)) invalidInput();
      input.invite_id = body.inviteId;
    } else invalidInput();
  }
  if (input.selection_limit !== undefined && (!Number.isInteger(input.selection_limit) || input.selection_limit < 1 || input.selection_limit > 200)) invalidInput();
  const { data } = await call('/rest/v1/rpc/admin_manage_client_gallery', { method: 'POST', body: { p_action: action, p_input: input } });
  if (token) {
    const invitation = new URL('/client/', context.request.url);
    invitation.hash = `token=${token}`;
    return json({ invitation: { id: data.id, url: invitation.href, expiresAt: data.expires_at } }, 201);
  }
  return json({ result: data }, action === 'create' || action === 'addPhoto' ? 201 : 200);
});
