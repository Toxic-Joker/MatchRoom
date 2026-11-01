// The on-air page. It holds no state of its own beyond what the server sends, which
// is why reloading an OBS source mid-match brings everything straight back.

import { h, crest, icon, visibleOn, textOn, formatClock } from './dom.js';
import { translator } from './i18n.js';
import { WIDGETS } from './widgets.js';
import { Radar } from './radar.js';

const params = new URLSearchParams(location.search);
const FORMAT = params.get('format') === 'portrait' ? 'portrait' : 'landscape';
const LAYER = ['back', 'front'].includes(params.get('layer')) ? params.get('layer') : 'all';
const PREVIEW = params.has('preview');
const SIZE = FORMAT === 'portrait' ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };

// Portrait has room for one large and one small panel, so the side slots share them.
const SLOT_OF = {
  stats: 'leftTop', prematch: 'leftTop', standings: 'leftBottom', livescore: 'leftBottom',
  lineups: 'rightTop', ratings: 'rightTop', socials: 'rightBottom', sponsor: 'rightBottom',
  radar: 'bottom', momentum: 'bottom', penalties: 'bottom',
  waiting: 'full', endscreen: 'full', radarFull: 'full', standingsFull: 'full', ratingsFull: 'full', bracket: 'full',
};
const PORTRAIT_AREA = { leftTop: 'main', rightTop: 'main', bottom: 'main', leftBottom: 'sub', rightBottom: 'sub', full: 'full' };

const stage = document.getElementById('stage');
stage.className = `fmt-${FORMAT} layer-${LAYER}${PREVIEW ? ' preview' : ''}`;
stage.style.width = `${SIZE.w}px`;
stage.style.height = `${SIZE.h}px`;

function fit() {
  const scale = Math.min(innerWidth / SIZE.w, innerHeight / SIZE.h);
  stage.style.transform = Math.abs(scale - 1) < 0.001 ? 'none' : `scale(${scale})`;
}
addEventListener('resize', fit);
fit();

const state = {
  show: null,
  frame: null,
  tables: {},
  lineupAltSide: 'home',
  socialIndex: 0,
  nowMs: Date.now(),
};
let t = translator('en');

// ── Static structure ─────────────────────────────────────────────
const backdrop = h('div', { class: 'backdrop' },
  h('img', { class: 'backdrop-image', alt: '' }),
  h('svg', { class: 'backdrop-lines', viewBox: '0 0 1920 1080', preserveAspectRatio: 'xMidYMid slice' },
    h('circle', { cx: 960, cy: 620, r: 420 }), h('line', { x1: 960, y1: -100, x2: 960, y2: 1300 }),
    h('rect', { x: -300, y: 120, width: 720, height: 1000 }), h('rect', { x: 1500, y: 120, width: 720, height: 1000 })));
const cameraFrame = h('div', { class: 'camera-frame' }, h('span'));
const slots = {};
const areaNames = FORMAT === 'portrait' ? ['main', 'sub', 'full'] : ['leftTop', 'leftBottom', 'rightTop', 'rightBottom', 'bottom', 'full'];
areaNames.forEach((name) => { slots[name] = h('div', { class: `slot slot-${name}` }); });

const scorebug = buildScorebug();
const ribbon = h('div', { class: 'ribbon' });
const bannerEl = h('div', { class: 'banner' });
const goalSheet = h('div', { class: 'goal-sheet' });

const front = h('div', { class: 'front' }, cameraFrame, Object.values(slots), scorebug.el, ribbon, bannerEl, goalSheet);
if (LAYER !== 'front') stage.append(backdrop);
if (LAYER !== 'back') stage.append(front);

function buildScorebug() {
  const side = (s) => {
    const name = h('b', { class: 'bug-name' });
    const logo = h('span', { class: 'bug-crest' });
    const reds = h('span', { class: 'bug-reds' });
    const slab = h('div', { class: `bug-team ${s}` }, s === 'home' ? [reds, name, logo] : [logo, name, reds]);
    const score = h('b', { class: 'bug-score' });
    return { slab, name, logo, reds, score, value: null, logoUrl: null };
  };
  const home = side('home');
  const away = side('away');
  const clock = h('b', { class: 'bug-clock' });
  const extra = h('span', { class: 'bug-extra' });
  const pens = h('span', { class: 'bug-pens' });
  const el = h('div', { class: 'scorebug' },
    h('div', { class: 'bug-main' }, home.slab, h('div', { class: 'bug-scores' }, home.score, h('i'), away.score), away.slab),
    h('div', { class: 'bug-time' }, clock, extra, pens));
  return { el, home, away, clock, extra, pens };
}

// ── Clock ────────────────────────────────────────────────────────
const clock = { seconds: 0, running: false, rate: 1, at: performance.now() };

function syncClock(c) {
  if (!c) return;
  const now = performance.now();
  const current = clock.seconds + (clock.running ? ((now - clock.at) / 1000) * clock.rate : 0);
  // The feed only knows whole minutes at worst, so small corrections are not worth a visible jump.
  const close = clock.running && c.running && Math.abs(current - c.seconds) < 3 * c.rate;
  clock.seconds = close ? current : c.seconds;
  clock.running = c.running;
  clock.rate = c.rate;
  clock.at = now;
}

function clockText() {
  const f = state.frame;
  if (!f) return '';
  if (f.phase === 'first' || f.phase === 'second' || f.phase === 'extra') {
    const now = performance.now();
    return formatClock(clock.seconds + (clock.running ? ((now - clock.at) / 1000) * clock.rate : 0));
  }
  return t(f.phase);
}

// ── Drawing ──────────────────────────────────────────────────────
function applyTheme() {
  const { theme, kitColors, background } = state.show;
  const root = document.documentElement.style;
  [['--ink', theme.ink], ['--raised', theme.raised], ['--chalk', theme.chalk], ['--muted', theme.muted], ['--accent', theme.accent], ['--on-accent', theme.onAccent], ['--back1', theme.back1], ['--back2', theme.back2], ['--grass1', theme.grass1], ['--grass2', theme.grass2]]
    .forEach(([k, v]) => root.setProperty(k, v));
  const homeKit = kitColors.home || state.frame?.home.color || '#1e62b0';
  const awayKit = kitColors.away || state.frame?.away.color || '#b03232';
  root.setProperty('--home-kit', homeKit);
  root.setProperty('--away-kit', awayKit);
  root.setProperty('--home-on-kit', textOn(homeKit));
  root.setProperty('--away-on-kit', textOn(awayKit));
  root.setProperty('--home-bar', visibleOn(homeKit, theme.accent));
  root.setProperty('--away-bar', visibleOn(awayKit, theme.chalk));
  const image = backdrop.querySelector('.backdrop-image');
  if (background) { image.src = background; image.classList.add('on'); } else { image.removeAttribute('src'); image.classList.remove('on'); }
  document.documentElement.lang = state.show.lang;
}

function drawScorebug() {
  const f = state.frame;
  const on = state.show.widgets.scorebug.on && f;
  scorebug.el.classList.toggle('on', Boolean(on));
  if (!f) return;
  ['home', 'away'].forEach((s) => {
    const part = scorebug[s];
    const team = f[s];
    part.name.textContent = FORMAT === 'portrait' || team.name.length > 19 ? team.short : team.name;
    if (part.logoUrl !== team.logo) {
      part.logoUrl = team.logo;
      part.logo.replaceChildren(crest(team.logo));
    }
    part.reds.replaceChildren(...Array.from({ length: team.redCards }, () => icon('red', 'bug-red')));
    if (part.value !== team.score) {
      const changed = part.value !== null;
      part.value = team.score;
      part.score.textContent = team.score;
      if (changed) {
        part.score.classList.remove('flip');
        void part.score.offsetWidth;
        part.score.classList.add('flip');
      }
    }
  });
  scorebug.extra.textContent = f.announcedExtra ? `+${f.announcedExtra}` : '';
  scorebug.extra.hidden = !f.announcedExtra;
  const pens = f.penalties.home !== null;
  scorebug.pens.textContent = pens ? `${t('shootout')} ${f.penalties.home} - ${f.penalties.away}` : '';
  scorebug.pens.hidden = !pens;
}

let ribbonKey = '';
function drawRibbon() {
  const f = state.frame;
  const show = Boolean(f && state.show.widgets.scorers.on && (f.home.scorers.length || f.away.scorers.length) && !bannerActive);
  ribbon.classList.toggle('on', show);
  if (!f) return;
  const key = JSON.stringify([f.home.scorers, f.away.scorers, state.show.lang]);
  if (key === ribbonKey) return;
  ribbonKey = key;
  const list = (scorers, s) => h('div', { class: `ribbon-side ${s}` }, scorers.map((x) => h('span', { class: 'scorer' }, icon('ball'), `${x.name} ${x.minute}${x.kind === 'owngoal' ? ` ${t('og')}` : ''}`)));
  ribbon.replaceChildren(list(f.home.scorers, 'home'), list(f.away.scorers, 'away'));
}

const widgetEls = new Map();
const radar2d = new Radar();
const radarFull = new Radar();

function ensureWidget(id, area) {
  if (widgetEls.has(id)) return widgetEls.get(id);
  const el = h('div', { class: `widget widget-${id}` });
  slots[area].append(el);
  const entry = { el, sig: null };
  widgetEls.set(id, entry);
  return entry;
}

function radarData() {
  const f = state.frame;
  return {
    level: f?.momentum?.level ?? 0,
    running: Boolean(f && ['first', 'second', 'extra'].includes(f.phase)),
    names: { home: f?.home.name || '', away: f?.away.name || '' },
    phaseLabel: f ? t(f.phase) : t('waitingData'),
    t,
  };
}

function radarSide(f, side) {
  const s = f?.stats;
  const hasXg = s && s.xg.home + s.xg.away > 0;
  return h('div', { class: 'radar-side' },
    crest(f?.[side].logo || '', 'crest crest-lg'),
    h('b', { class: 'radar-poss' }, s ? `${s.possession[side]}%` : ''),
    h('span', null, s ? t('possession') : ''),
    hasXg ? h('b', { class: 'radar-xg' }, s.xg[side].toFixed(2)) : '',
    hasXg ? h('span', null, 'xG') : '');
}

function drawRadarWidget(id, instance, area, is3d, full) {
  const on = visible(id);
  const entry = ensureWidget(id, area);
  entry.el.classList.toggle('on', on);
  if (!on) { instance.stop(); return; }
  instance.update(radarData());
  const f = state.frame;
  const sig = JSON.stringify([is3d, f?.stats?.possession, f?.stats?.xg, f?.home.logo, state.show.lang]);
  if (sig !== entry.sig) {
    entry.sig = sig;
    const note = h('p', { class: 'radar-note' }, t('radarNote'));
    const stageEl = instance.el;
    stageEl.classList.toggle('is-3d', is3d);
    entry.el.replaceChildren(full
      ? h('div', { class: 'sheet radar-sheet' }, h('div', { class: 'sheet-lines' }), stageEl, note)
      : h('div', { class: 'panel radar-panel' }, radarSide(f, 'home'), h('div', { class: 'radar-mid' }, stageEl, note), radarSide(f, 'away')));
  }
  instance.start();
}

// Which widget wins each area: the most recently lit. Landscape slots hold one by design.
function winners() {
  const best = {};
  Object.entries(SLOT_OF).forEach(([id, slot]) => {
    const w = state.show.widgets[id];
    if (!w?.on) return;
    const area = FORMAT === 'portrait' ? PORTRAIT_AREA[slot] : slot;
    if (!best[area] || w.at > best[area].at) best[area] = { id, at: w.at };
  });
  return best;
}

let currentWinners = {};
const visible = (id) => {
  const slot = SLOT_OF[id];
  const area = FORMAT === 'portrait' ? PORTRAIT_AREA[slot] : slot;
  return currentWinners[area]?.id === id;
};

function drawWidgets() {
  currentWinners = winners();
  Object.entries(WIDGETS).forEach(([id, def]) => {
    const slot = SLOT_OF[id];
    const area = FORMAT === 'portrait' ? PORTRAIT_AREA[slot] : slot;
    const on = visible(id);
    if (!on && !widgetEls.has(id)) return;
    const entry = ensureWidget(id, area);
    entry.el.classList.toggle('on', on);
    if (!on) return;
    const data = def.data(state);
    const sig = JSON.stringify([data, state.show.lang]);
    if (sig === entry.sig) return;
    entry.sig = sig;
    entry.el.replaceChildren(def.render(data, { t, format: FORMAT }));
  });
  // These two sheets carry the teams and score themselves.
  front.classList.toggle('no-bug', ['waiting', 'endscreen'].includes(currentWinners.full?.id));
  const radarArea = FORMAT === 'portrait' ? 'main' : 'bottom';
  drawRadarWidget('radar', radar2d, radarArea, state.show.widgets.radar.opts?.mode === '3d', false);
  drawRadarWidget('radarFull', radarFull, 'full', true, true);
}

function render() {
  if (!state.show) return;
  t = translator(state.show.lang);
  applyTheme();
  const showGuide = state.show.cameraGuide || PREVIEW;
  cameraFrame.classList.toggle('guide', showGuide);
  cameraFrame.firstChild.textContent = showGuide ? t('camera') : '';
  if (LAYER === 'back') return;
  drawScorebug();
  drawWidgets();
  drawRibbon();
}

// ── Transient moments ────────────────────────────────────────────
let bannerActive = false;
const bannerQueue = [];

function bannerContent(e) {
  const main = (iconName, title, line, side) => ({ iconName, title, line, side });
  switch (e.type) {
    case 'goal': case 'goal_resolved': return main('ball', e.kind === 'owngoal' ? t('ownGoal') : t('goal'), e.player || e.team, e.side);
    case 'goal_cancelled': return main('var', t('goalCancelled'), e.team, e.side);
    case 'card': return main(e.card, t(e.card), e.player || e.team, e.side);
    case 'sub': return main('sub', t('sub'), e.playerIn ? `${e.playerIn}, ${e.playerOut}` : e.team, e.side);
    case 'var': return main('var', t('var'), e.detail || e.team, e.side);
    case 'missed_penalty': return main('missed', t('missedPen'), e.player || e.team, e.side);
    case 'phase': {
      const score = e.score && ['halftime', 'ended'].includes(e.phase) ? `${e.score.home} - ${e.score.away}` : '';
      return ['halftime', 'ended', 'second', 'extra', 'shootout', 'first'].includes(e.phase) ? main(null, t(e.phase), score, null) : null;
    }
    default: return null;
  }
}

function showBanner(content) {
  if (!content) return;
  bannerQueue.push(content);
  if (!bannerActive) nextBanner();
}

function nextBanner() {
  const b = bannerQueue.shift();
  if (!b) {
    bannerActive = false;
    bannerEl.classList.remove('on');
    drawRibbon();
    return;
  }
  bannerActive = true;
  drawRibbon();
  const team = b.side ? h('span', { class: `banner-tab ${b.side}` }, crest(state.frame?.[b.side]?.logo || '')) : '';
  bannerEl.replaceChildren(team,
    b.iconName ? icon(b.iconName, 'banner-icon') : '',
    h('b', { class: 'banner-title' }, b.title),
    b.line ? h('span', { class: 'banner-line' }, b.line) : '',
    b.sub ? h('span', { class: 'banner-line' }, b.sub) : '');
  bannerEl.classList.remove('on');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('on');
  setTimeout(nextBanner, (b.seconds || 6) * 1000);
}

let goalTimer = null;
let goalShownId = null;

function showGoalSheet(e) {
  const side = e.side || 'home';
  const team = state.frame?.[side];
  goalShownId = e.goalId;
  // A goal pressed by hand comes before the feed has the new score, so show none rather than a wrong one.
  const score = e.manual ? null : (e.score || (state.frame ? { home: state.frame.home.score, away: state.frame.away.score } : null));
  const player = h('p', { class: 'goal-player' }, e.player || '');
  goalSheet.replaceChildren(
    h('div', { class: `goal-slab ${side}` }),
    h('div', { class: `goal-content ${side}` },
      crest(team?.logo || '', 'crest goal-crest'),
      h('p', { class: 'goal-word' }, e.kind === 'owngoal' ? t('ownGoal') : t('goal')),
      player,
      h('p', { class: 'goal-team' }, e.team || team?.name || ''),
      score ? h('p', { class: 'goal-score' }, `${score.home} - ${score.away}`) : ''));
  goalSheet.classList.remove('on');
  void goalSheet.offsetWidth;
  goalSheet.classList.add('on');
  clearTimeout(goalTimer);
  goalTimer = setTimeout(() => { goalSheet.classList.remove('on'); goalShownId = null; }, 5200);
}

function onEvent(e) {
  radar2d.react(e, t);
  radarFull.react(e, t);
  if (e.type === 'goal_resolved' && goalShownId === e.goalId) {
    const line = goalSheet.querySelector('.goal-player');
    if (line) line.textContent = e.player;
    return;
  }
  if (e.display === 'fullscreen' && e.type === 'goal') showGoalSheet(e);
  else if (e.display === 'fullscreen' || e.display === 'banner') showBanner(bannerContent(e));
}

// ── Connection ───────────────────────────────────────────────────
const token = params.get('token') || '';
const socket = io('/overlay', { auth: { token }, transports: ['websocket', 'polling'] });

socket.on('connect_error', (err) => {
  // Shown in the OBS preview only when the link is wrong, never for a brief network blip.
  if (err.message === 'unauthorized') stage.replaceChildren(h('p', { class: 'auth-error' }, 'This overlay link is out of date. Copy it again from the control room.'));
});
socket.on('hello', ({ show, frame, tables }) => {
  state.show = show;
  state.frame = frame;
  state.tables = tables || {};
  ribbonKey = '';
  if (frame) syncClock(frame.clock);
  render();
});
socket.on('show', (show) => { state.show = show; render(); });
socket.on('frame', (frame) => {
  state.frame = frame;
  syncClock(frame.clock);
  render();
});
socket.on('tables', (tables) => { state.tables = { ...state.tables, ...tables }; render(); });
socket.on('event', onEvent);
socket.on('alert', ({ text, sub, seconds }) => showBanner({ iconName: null, title: text, line: sub, side: null, seconds }));

// ── Timers ───────────────────────────────────────────────────────
setInterval(() => {
  state.nowMs = Date.now();
  if (LAYER === 'back') return;
  scorebug.clock.textContent = clockText();
  if (state.show?.widgets.waiting.on) drawWidgets();
}, 250);
setInterval(() => { state.lineupAltSide = state.lineupAltSide === 'home' ? 'away' : 'home'; render(); }, 12000);
setInterval(() => { state.socialIndex += 1; render(); }, 6000);
