// The show: everything the operator controls. The server owns it, so a closed
// control tab or a reloaded OBS source changes nothing that is on air.

const WIDGETS = {
  scorebug: { slot: 'top', label: 'Scoreboard', group: 'Always on air' },
  scorers: { slot: 'ribbon', label: 'Goal scorers', group: 'Always on air' },
  stats: { slot: 'leftTop', label: 'Match stats', group: 'Left, top' },
  prematch: { slot: 'leftTop', label: 'Pre-match card', group: 'Left, top' },
  standings: { slot: 'leftBottom', label: 'League table', group: 'Left, bottom' },
  livescore: { slot: 'leftBottom', label: 'Other matches', group: 'Left, bottom' },
  lineups: { slot: 'rightTop', label: 'Lineups', group: 'Right, top', options: { side: ['auto', 'home', 'away'] } },
  ratings: { slot: 'rightTop', label: 'Player ratings', group: 'Right, top' },
  socials: { slot: 'rightBottom', label: 'Socials', group: 'Right, bottom' },
  sponsor: { slot: 'rightBottom', label: 'Sponsor', group: 'Right, bottom' },
  radar: { slot: 'bottom', label: 'Radar', group: 'Under the camera', options: { mode: ['2d', '3d'] } },
  momentum: { slot: 'bottom', label: 'Pressure index', group: 'Under the camera' },
  penalties: { slot: 'bottom', label: 'Penalty shootout', group: 'Under the camera' },
  waiting: { slot: 'full', label: 'Countdown screen', group: 'Full screen' },
  endscreen: { slot: 'full', label: 'Full-time screen', group: 'Full screen' },
  radarFull: { slot: 'full', label: 'Radar, 3D', group: 'Full screen' },
  standingsFull: { slot: 'full', label: 'League table', group: 'Full screen' },
  ratingsFull: { slot: 'full', label: 'Player ratings', group: 'Full screen' },
  bracket: { slot: 'full', label: 'Knockout bracket', group: 'Full screen' },
};

const THEMES = {
  floodlight: { label: 'Floodlight', ink: '#0f2a24', raised: '#1a3f35', chalk: '#f4f6ee', muted: '#a9bdb3', accent: '#f2b632', onAccent: '#1a1405', back1: '#123229', back2: '#07150f', grass1: '#1d5c43', grass2: '#17503a' },
  continental: { label: 'European nights', ink: '#0b1b4d', raised: '#16296e', chalk: '#f2f5ff', muted: '#a4b3e0', accent: '#7fd0ff', onAccent: '#04142e', back1: '#122a7a', back2: '#040b26', grass1: '#14338a', grass2: '#102b78' },
  premier: { label: 'English top flight', ink: '#2b0a3d', raised: '#3f1558', chalk: '#fbf5ff', muted: '#c4a8d6', accent: '#04f5a0', onAccent: '#0c1f18', back1: '#451763', back2: '#17051f', grass1: '#4a1a6a', grass2: '#3e145b' },
  ligue: { label: 'French top flight', ink: '#10151f', raised: '#1e2533', chalk: '#f5f7fa', muted: '#a4adbd', accent: '#d7f205', onAccent: '#14170a', back1: '#232c3e', back2: '#07090f', grass1: '#27344a', grass2: '#202b3e' },
  liga: { label: 'Spanish top flight', ink: '#21102b', raised: '#32193f', chalk: '#fff6f2', muted: '#c9afbf', accent: '#ff5b45', onAccent: '#260704', back1: '#3c1a44', back2: '#120615', grass1: '#46204c', grass2: '#3b1a41' },
  serie: { label: 'Italian top flight', ink: '#06283f', raised: '#0d3b5b', chalk: '#f0f9ff', muted: '#9dbfd4', accent: '#3cd3f5', onAccent: '#03212b', back1: '#0e4468', back2: '#031521', grass1: '#0f4e74', grass2: '#0c4364' },
  bundes: { label: 'German top flight', ink: '#2a0609', raised: '#430c11', chalk: '#fff5f4', muted: '#d0a5a5', accent: '#ff6058', onAccent: '#2b0503', back1: '#5a0f16', back2: '#160304', grass1: '#621319', grass2: '#541015' },
  international: { label: 'International', ink: '#3a0f1e', raised: '#52182c', chalk: '#fff8ec', muted: '#d3b3a9', accent: '#e5c158', onAccent: '#241a02', back1: '#5e1a31', back2: '#1b0610', grass1: '#6a2038', grass2: '#5a1a2f' },
};
const LEAGUE_THEMES = { 2: 'continental', 3: 'continental', 848: 'continental', 39: 'premier', 61: 'ligue', 140: 'liga', 135: 'serie', 78: 'bundes', 1: 'international', 4: 'international', 6: 'international' };

const LANGS = ['en', 'fr', 'es', 'pt'];
const SOCIAL_PLATFORMS = ['x', 'instagram', 'tiktok', 'youtube', 'twitch', 'kick'];
const DISPLAY = { goal: ['fullscreen', 'banner', 'off'], card: ['banner', 'off'], sub: ['banner', 'off'], var: ['banner', 'off'], phase: ['banner', 'off'] };
const MAX_DELAY = 300;

function defaultShow() {
  const widgets = {};
  Object.keys(WIDGETS).forEach((id) => { widgets[id] = { on: false, at: 0, opts: {} }; });
  widgets.scorebug.on = true;
  widgets.scorers.on = true;
  widgets.lineups.opts = { side: 'auto' };
  widgets.radar.opts = { mode: '2d' };
  return {
    source: 'sim',
    fixtureId: 1001,
    widgets,
    delaySeconds: 0,
    themeId: 'floodlight',
    themeAuto: true,
    custom: {},
    lang: 'en',
    background: '',
    cameraGuide: false,
    auto: { goal: 'fullscreen', card: 'banner', sub: 'banner', var: 'banner', phase: 'banner' },
    socials: [{ platform: 'x', handle: '@yourchannel' }],
    sponsor: { text: '', logo: '' },
    countdown: { title: '', target: null },
    followedTeams: [
      'Barcelona', 'Real Madrid', 'Paris Saint Germain', 'Monaco', 'Athletic Club', 'Atletico Madrid', 'Marseille',
      'Liverpool', 'Manchester City', 'Manchester United', 'Newcastle', 'Arsenal', 'Aston Villa', 'Chelsea',
      'Inter', 'Roma', 'AC Milan', 'Juventus', 'Como', 'Bayern Munich', 'Bayer Leverkusen', 'Borussia Dortmund',
      'Lyon', 'Ajax', 'Napoli', 'Sporting CP', 'Porto', 'Galatasaray', 'Inter Miami', 'Al-Nassr',
      'France', 'Spain', 'Cameroon', 'England', 'Argentina', 'Morocco', 'Algeria', 'Portugal', 'Ivory Coast',
      'Germany', 'Belgium', 'Norway', 'Netherlands',
    ],
    leagueIds: [39, 140, 78, 135, 61, 2],
  };
}

// Keeps saved settings usable after widgets or fields are added in an update.
function reviveShow(saved) {
  const base = defaultShow();
  if (!saved || typeof saved !== 'object') return base;
  const show = { ...base, ...saved, auto: { ...base.auto, ...saved.auto } };
  show.widgets = base.widgets;
  Object.keys(WIDGETS).forEach((id) => {
    if (saved.widgets?.[id]) show.widgets[id] = { ...base.widgets[id], ...saved.widgets[id] };
  });
  return show;
}

class ActionError extends Error {}

const HEX = /^#[0-9a-f]{6}$/i;
const fail = (message) => { throw new ActionError(message); };
const cleanText = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

function httpsUrl(v) {
  const url = cleanText(v, 1000);
  if (url && !/^https:\/\//.test(url)) fail('Image links must start with https://');
  return url;
}

function setWidget(show, id, on, opts, now) {
  const def = WIDGETS[id] || fail(`Unknown widget: ${id}`);
  const current = show.widgets[id];
  const next = { ...current, on, at: on ? now : current.at, opts: { ...current.opts } };
  Object.entries(opts || {}).forEach(([k, v]) => {
    if (!def.options?.[k]?.includes(v)) fail(`Invalid ${k} for ${id}`);
    next.opts[k] = v;
  });
  const widgets = { ...show.widgets, [id]: next };
  // A slot holds one widget: lighting one up replaces its neighbour.
  if (on && !['top', 'ribbon'].includes(def.slot)) {
    Object.entries(WIDGETS).forEach(([other, d]) => {
      if (other !== id && d.slot === def.slot) widgets[other] = { ...widgets[other], on: false };
    });
  }
  return { ...show, widgets };
}

function applyAction(show, action, now = Date.now()) {
  const a = action || {};
  switch (a.name) {
    case 'widget': {
      const on = a.on === undefined ? !show.widgets[a.id]?.on : Boolean(a.on);
      return setWidget(show, a.id, on, a.opts, now);
    }
    case 'hideAll': {
      const widgets = { ...show.widgets };
      Object.keys(widgets).forEach((id) => {
        if (!['scorebug', 'scorers'].includes(id)) widgets[id] = { ...widgets[id], on: false };
      });
      return { ...show, widgets };
    }
    case 'delay': {
      const seconds = a.by !== undefined ? show.delaySeconds + Number(a.by) : Number(a.seconds);
      if (!Number.isFinite(seconds)) fail('Delay must be a number of seconds');
      return { ...show, delaySeconds: Math.max(0, Math.min(MAX_DELAY, Math.round(seconds))) };
    }
    case 'theme':
      if (!THEMES[a.id]) fail(`Unknown theme: ${a.id}`);
      return { ...show, themeId: a.id, themeAuto: false };
    case 'themeAuto':
      return { ...show, themeAuto: Boolean(a.on) };
    case 'customColors': {
      const custom = {};
      ['accent', 'ink', 'home', 'away'].forEach((k) => {
        if (a[k]) { if (!HEX.test(a[k])) fail(`Invalid colour for ${k}`); custom[k] = a[k]; }
      });
      return { ...show, custom };
    }
    case 'lang':
      if (!LANGS.includes(a.lang)) fail(`Unknown language: ${a.lang}`);
      return { ...show, lang: a.lang };
    case 'background':
      return { ...show, background: httpsUrl(a.url) };
    case 'cameraGuide':
      return { ...show, cameraGuide: Boolean(a.on) };
    case 'auto': {
      if (!DISPLAY[a.kind]?.includes(a.value)) fail('Invalid automatic event setting');
      return { ...show, auto: { ...show.auto, [a.kind]: a.value } };
    }
    case 'socials': {
      const socials = (Array.isArray(a.socials) ? a.socials : []).slice(0, 6).map((s) => {
        if (!SOCIAL_PLATFORMS.includes(s.platform)) fail(`Unknown platform: ${s.platform}`);
        return { platform: s.platform, handle: cleanText(s.handle, 40) };
      }).filter((s) => s.handle);
      return { ...show, socials };
    }
    case 'sponsor':
      return { ...show, sponsor: { text: cleanText(a.text, 60), logo: httpsUrl(a.logo) } };
    case 'countdown': {
      const target = a.target ? Number(a.target) : null;
      if (target !== null && !Number.isFinite(target)) fail('Countdown needs a valid time');
      return { ...show, countdown: { title: cleanText(a.title, 60), target } };
    }
    case 'followedTeams':
      return { ...show, followedTeams: (Array.isArray(a.teams) ? a.teams : []).slice(0, 200).map((t) => cleanText(t, 60)).filter(Boolean) };
    default:
      return fail(`Unknown action: ${a.name}`);
  }
}

function themeTokens(show, leagueId) {
  const id = (show.themeAuto && LEAGUE_THEMES[leagueId]) || show.themeId;
  return { id, ...THEMES[id], ...(show.custom.accent ? { accent: show.custom.accent } : {}), ...(show.custom.ink ? { ink: show.custom.ink } : {}) };
}

module.exports = { WIDGETS, THEMES, LANGS, DISPLAY, SOCIAL_PLATFORMS, MAX_DELAY, defaultShow, reviveShow, applyAction, themeTokens, ActionError, cleanText };
