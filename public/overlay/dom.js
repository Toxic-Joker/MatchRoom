// DOM helpers. Match data only ever reaches the page through textContent and
// validated attributes here, so nothing from the feed can run as markup.

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'rect', 'circle', 'line', 'polyline', 'g', 'text']);

export function h(tag, attrs, ...children) {
  const svg = SVG_TAGS.has(tag);
  const el = svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === 'class') el.setAttribute('class', value);
    else if (key === 'style' && typeof value === 'object') {
      Object.entries(value).forEach(([prop, v]) => el.style.setProperty(prop, v));
    } else el.setAttribute(key, value === true ? '' : value);
  });
  append(el, children);
  return el;
}

function append(el, children) {
  children.flat(Infinity).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
}

export function crest(url, className = 'crest') {
  if (!url || !/^(https:\/\/|data:image\/)/.test(url)) return h('span', { class: `${className} crest-empty` });
  return h('img', { class: className, src: url, alt: '' });
}

// Fixed, hand-written glyphs. Emoji render differently on every OBS machine.
const ICON_PATHS = {
  ball: '<circle cx="12" cy="12" r="10" fill="#fff" stroke="#111" stroke-width="1.4"/><path d="m12 7 4.6 3.4-1.8 5.4H9.2L7.4 10.4zM12 7V2.2M16.6 10.4l4.7-1.5M14.8 15.8l2.9 4M9.2 15.8l-2.9 4M7.4 10.4 2.7 8.9" fill="#111" stroke="#111" stroke-width="1.2"/>',
  yellow: '<rect x="6" y="2" width="12" height="20" rx="2" fill="#f7d11e" stroke="#0006"/>',
  red: '<rect x="6" y="2" width="12" height="20" rx="2" fill="#e5202e" stroke="#0006"/>',
  sub: '<path d="M8 21V7M8 7 3.5 11.5M8 7l4.5 4.5" fill="none" stroke="#35d07f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 3v14M16 17l-4.5-4.5M16 17l4.5-4.5" fill="none" stroke="#ff5a4f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  var: '<rect x="3" y="4" width="18" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="2.4"/>',
  assist: '<path d="M12 3 4 21h3.6l1.5-3.6h5.8l1.5 3.6H20zM10.3 14.5 12 10l1.7 4.5z" fill="currentColor"/>',
  missed: '<circle cx="12" cy="12" r="10" fill="#e5202e"/><path d="m8 8 8 8M16 8l-8 8" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>',
  scored: '<circle cx="12" cy="12" r="10" fill="#27b56b"/><path d="m7 12.5 3.4 3.4L17 9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  x: '<path d="M4 3h4.4l4 5.6L17.2 3H20l-6.3 7.4L21 21h-4.4l-4.6-6.4L6.5 21H3.7l6.9-8.1z" fill="currentColor"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="17.3" cy="6.7" r="1.4" fill="currentColor"/>',
  tiktok: '<path d="M14 3h3c.3 2.2 1.6 3.6 4 3.9v3c-1.5 0-2.8-.4-4-1.2v6.6a6 6 0 1 1-6-6h1v3.2h-1a2.8 2.8 0 1 0 3 2.8z" fill="currentColor"/>',
  youtube: '<rect x="2" y="5" width="20" height="14" rx="4" fill="currentColor"/><path d="m10 9 5.5 3-5.5 3z" fill="var(--ink, #000)"/>',
  twitch: '<path d="M5 3h16v11l-4.5 4.5H13L10 21H8v-2.500H4V6.500zM11 8v5.500h2V8zm4.500 0v5.500h2V8z" fill="currentColor"/>',
  kick: '<path d="M4 3h6v5h2V5.500h2V3h6v6.500h-2V12h2v8.500h-6V18h-2v-2.500h-2v5H4z" fill="currentColor"/>',
};

export function icon(name, className = 'icon') {
  const template = document.createElement('template');
  template.innerHTML = `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
  return template.content.firstChild;
}

export const EVENT_ICONS = { goal: 'ball', penalty: 'ball', owngoal: 'ball', yellow: 'yellow', red: 'red', assist: 'assist', missedpen: 'missed', var: 'var' };

function toRgb(hex) {
  const v = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!v) return null;
  const n = parseInt(v[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function textOn(hex) {
  const rgb = toRgb(hex);
  if (!rgb) return '#ffffff';
  return luminance(rgb) > 0.32 ? '#10130f' : '#ffffff';
}

// Kit colours can vanish on a dark panel, so bars and markers get lifted until they read.
export function visibleOn(hex, fallback) {
  const rgb = toRgb(hex);
  if (!rgb) return fallback;
  let mixed = rgb;
  for (let i = 0; i < 8 && luminance(mixed) < 0.12; i += 1) {
    mixed = mixed.map((c) => Math.round(c + (255 - c) * 0.14));
  }
  return `rgb(${mixed.join(',')})`;
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
