import { invalidInput, textField, validId } from './client-gallery.js';

export function selectionInput(body, allowEmpty = false) {
  if (!Array.isArray(body.photoIds) || body.photoIds.length < (allowEmpty ? 0 : 1) || body.photoIds.length > 200
    || body.photoIds.some(id => !validId(id)) || new Set(body.photoIds).size !== body.photoIds.length) invalidInput();
  const notes = body.photoNotes ?? {};
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) invalidInput();
  const photoNotes = Object.create(null);
  for (const [id, value] of Object.entries(notes)) {
    if (!validId(id) || !body.photoIds.includes(id) || typeof value !== 'string' || value.length > 500) invalidInput();
    if (value.trim()) photoNotes[id] = value.trim();
  }
  return { p_photo_ids: body.photoIds, p_photo_notes: photoNotes, p_note: textField(body.note ?? '', 2000, true) };
}
export function versionInput(value) {
  if (!Number.isSafeInteger(value) || value < 0) invalidInput();
  return value;
}
export const mapDraft = value => value ? { photoIds: value.photo_ids, photoNotes: value.photo_notes || {}, note: value.note, version: value.version, updatedAt: value.updated_at } : null;
export const mapSelection = value => ({ photoIds: value.photo_ids, photoNotes: value.photo_notes || {}, note: value.note, submittedAt: value.submitted_at });
