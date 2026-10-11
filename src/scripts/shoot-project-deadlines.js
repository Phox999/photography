function deadlineOf(element) {
  const value = element.dataset.shootProjectDeadline;
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function markExpired(element) {
  if (element.dataset.shootProjectExpired === 'true') return;
  element.dataset.shootProjectExpired = 'true';
  element.dataset.shootProjectOpen = 'false';

  const status = element.querySelector('[data-shoot-project-status]');
  if (status) {
    status.textContent = '已截止';
    status.classList.remove('shoot-project-badge--open');
    status.classList.add('shoot-project-badge--closed');
  }

  element.querySelectorAll('[data-shoot-project-apply]').forEach((link) => {
    link.hidden = true;
    link.setAttribute('aria-hidden', 'true');
  });
  const closed = element.querySelector('[data-shoot-project-closed]');
  if (closed) closed.hidden = false;
  const nextTitle = element.querySelector('[data-shoot-project-next-title]');
  if (nextTitle) nextTitle.textContent = '想從一般合作開始？';

  if (element instanceof HTMLOptionElement) {
    element.disabled = true;
    const title = element.dataset.projectTitle || element.textContent.replace(/（已截止）$/, '');
    element.textContent = `${title}（已截止）`;
    if (element.selected) {
      const notice = element.closest('[data-inquiry-form]')?.querySelector('[data-shoot-project-notice]');
      if (notice) notice.textContent = '這個企劃已截止。尚未送出的新申請會停用；若送出結果尚未確認，保留原內容重試可查回原回條。';
    }
  }
  window.dispatchEvent(new CustomEvent('shoot-project-deadline-change', { detail: { element } }));

  const sourceGroup = element.closest('[data-shoot-project-group="open"]');
  const targetGroup = sourceGroup?.parentElement?.querySelector('[data-shoot-project-group="past"]');
  if (sourceGroup && targetGroup) {
    targetGroup.hidden = false;
    const card = element.closest('[data-shoot-project-list-card]');
    if (card) targetGroup.querySelector('[data-shoot-project-list]')?.append(card);
    if (!sourceGroup.querySelector('[data-shoot-project-list-card]')) sourceGroup.hidden = true;
  }

  const homeSection = element.closest('[data-shoot-project-home]');
  if (homeSection && !homeSection.querySelector('[data-shoot-project-deadline][data-shoot-project-open="true"]')) {
    homeSection.hidden = true;
  }
}

export function refreshShootProjectDeadlines(root = document) {
  const now = Date.now();
  root.querySelectorAll('[data-shoot-project-deadline]').forEach((element) => {
    const deadline = deadlineOf(element);
    if (deadline !== null && deadline <= now) markExpired(element);
  });
}

function scheduleNextDeadline() {
  const now = Date.now();
  const next = [...document.querySelectorAll('[data-shoot-project-deadline]')]
    .filter((element) => element.dataset.shootProjectExpired !== 'true')
    .map(deadlineOf)
    .filter((deadline) => deadline !== null && deadline > now)
    .sort((a, b) => a - b)[0];
  if (next !== undefined) window.setTimeout(() => {
    refreshShootProjectDeadlines(document);
    scheduleNextDeadline();
  }, Math.min(next - now + 25, 2_147_000_000));
}

refreshShootProjectDeadlines(document);
scheduleNextDeadline();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshShootProjectDeadlines(document);
});
window.addEventListener('pageshow', () => refreshShootProjectDeadlines(document));
window.addEventListener('focus', () => refreshShootProjectDeadlines(document));
