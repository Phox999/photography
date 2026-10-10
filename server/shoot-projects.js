import { HttpError } from './auth.js';
import { createShootProjectSnapshot, getShootProjectById, shootProjectRequestState } from '../shared/shoot-projects.js';

const PROJECT_ID = /^[a-z0-9][a-z0-9-]{1,63}$/;
const invalid = (message) => { throw new HttpError(400, message, 'invalid_shoot_project'); };

export function parseShootProjectRequest(body) {
  const hasId = body.shoot_project_id !== undefined;
  const hasRevision = body.shoot_project_revision !== undefined;
  if (!hasId && !hasRevision) return null;
  if (hasId !== hasRevision || typeof body.shoot_project_id !== 'string' || !PROJECT_ID.test(body.shoot_project_id)
    || !Number.isInteger(body.shoot_project_revision) || body.shoot_project_revision < 1 || body.shoot_project_revision > 1_000_000) {
    invalid('企劃選擇格式不正確，請重新選擇企劃。');
  }
  if (body.collaboration_type !== '主題合作') invalid('企劃申請需使用主題合作類型。');
  return { id: body.shoot_project_id, revision: body.shoot_project_revision };
}

export function projectForNewRequest(identity, now = Date.now()) {
  const project = getShootProjectById(identity.id);
  const state = shootProjectRequestState(project, identity.revision, now);
  if (!state.accepted) throw new HttpError(409, state.reason, 'shoot_project_unavailable');
  return project;
}

export function attachShootProjectSnapshot(payload, project) {
  return {
    ...payload,
    description: payload.description || `申請企劃：${project.title}`,
    shoot_project_id: project.id,
    shoot_project_revision: project.revision,
    shoot_project_snapshot: createShootProjectSnapshot(project),
  };
}
