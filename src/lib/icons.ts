// Official vendored SVGs: Lucide UI, Feather Instagram, Font Awesome Threads.
export const iconNames = ['arrow-down', 'arrow-left', 'arrow-right', 'arrow-up', 'arrow-up-right', 'camera', 'check', 'chevron-down', 'chevron-left', 'chevron-right', 'circle', 'circle-check', 'download', 'file-text', 'grip-vertical', 'heart', 'instagram', 'mail', 'menu', 'message-circle', 'minus', 'plus', 'scan', 'search', 'send', 'sparkles', 'threads', 'trash', 'upload', 'volume-2', 'volume-x', 'x', 'zoom-in'] as const;
export type IconName = typeof iconNames[number];

export function createIcon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({ class: 'ui-icon', 'data-icon': name, viewBox: '0 0 24 24', width: '24', height: '24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `/assets/icons/sprite.svg#${name}`);
  svg.append(use);
  return svg;
}
