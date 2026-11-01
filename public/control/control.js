// The control room. It only sends requests and shows what the server reports,
// so closing this tab, or opening it on a phone, never touches what is on air.

import { h } from '/overlay/dom.js';

function readToken() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const fromHash = hash.get('token');
  if (fromHash) {
    try { localStorage.setItem('controlToken', fromHash); } catch { /* private window */ }
    history.replaceState(null, '', location.pathname);
    return fromHash;
  }
  try { return localStorage.getItem('controlToken') || ''; } catch { return ''; }
}

// Pasting the server link into an already-open tab only changes the hash.
addEventListener('hashchange', () => { if (location.hash.includes('token=')) location.reload(); });

const app = document.getElementById('app');
const token = readToken();
let catalog = null;
let state = null;
let tab = 'widgets';
let toastTimer = null;
const ui = { fixtures: null, fixturesError: '', source: 'sim', date: new Date().toISOString().slice(0, 10), filter: '', picker: false, formats: 'landscape' };

if (!token) showLocked();

const socket = io('/control', { auth: { token } });
socket.on('connect_error', (err) => { if (err.message === 'unauthorized') showLocked(); });
socket.on('catalog', (c) => { catalog = c; draw(); });
socket.on('state', (s) => { state = s; refresh(); });
socket.on('connect', () => document.body.classList.remove('offline'));
socket.on('disconnect', () => document.body.classList.add('offline'));

function showLocked() {
  app.replaceChildren(h('main', { class: 'locked' },
    h('h1', null, 'Open the control room from your server link'),
    h('p', null, 'The server prints a private link when it starts. It looks like this:'),
    h('code', null, 'http://127.0.0.1:3000/control/#token=…'),
    h('p', null, 'The token is also saved in data/tokens.json.')));
}

function send(action) {
  socket.emit('action', action, (res) => { if (res?.error) toast(res.error, true); });
}

function toast(message, isError) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.className = `toast on${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
}

async function copy(text, done = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast('Copy did not work here. Select the link by hand.', true);
  }
}

function overlayUrl(params) {
  const q = new URLSearchParams({ token: catalog.overlayToken, ...params });
  return `${location.origin}/overlay/?${q}`;
}

const button = (label, onclick, className = '', extra = {}) => {
  const el = h('button', { type: 'button', class: className, ...extra }, label);
  el.addEventListener('click', onclick);
  return el;
};

const on = (input, event, handler) => { input.addEventListener(event, handler); return input; };

// ── Shell ────────────────────────────────────────────────────────
function draw() {
  if (!catalog) return;
  app.replaceChildren(
    h('header', { class: 'topbar' },
      h('div', { class: 'match-chip', id: 'match-chip' }),
      h('div', { class: 'feed-chip', id: 'feed-chip' }),
      delayControl(),
      button('Hide all widgets', () => send({ name: 'hideAll' }), 'danger', { title: 'Keeps the scoreboard on air' })),
    h('main', { class: 'desk' },
      h('section', { class: 'monitor' },
        h('div', { class: 'preview-box' }, h('iframe', { title: 'On-air preview', src: overlayUrl({ preview: 1 }), id: 'preview' })),
        h('div', { class: 'score-compare', id: 'score-compare' }),
        momentsPanel(),
      ),
      h('section', { class: 'side' },
        h('nav', { class: 'tabs' }, [['widgets', 'Widgets'], ['match', 'Match'], ['look', 'Look'], ['content', 'Content'], ['obs', 'Add to OBS']]
          .map(([id, label]) => button(label, () => { tab = id; drawTab(); }, 'tab', { 'data-tab': id }))),
        h('div', { class: 'tab-body', id: 'tab-body' }))),
    h('div', { id: 'toast', class: 'toast', role: 'status' }));
  drawTab();
  refresh();
}

function delayControl() {
  const value = h('b', { id: 'delay-value' });
  return h('div', { class: 'delay' },
    h('label', null, 'Stream delay', h('small', null, 'Holds match data until your viewers see it')),
    h('div', { class: 'delay-buttons' },
      button('-5', () => send({ name: 'delay', by: -5 })), button('-1', () => send({ name: 'delay', by: -1 })),
      value,
      button('+1', () => send({ name: 'delay', by: 1 })), button('+5', () => send({ name: 'delay', by: 5 }))));
}

function momentsPanel() {
  const side = (label, event) => h('div', { class: 'moment' }, h('span', null, label),
    button('Home', () => send({ name: 'fire', event, side: 'home' })), button('Away', () => send({ name: 'fire', event, side: 'away' })));
  const textInput = h('input', { type: 'text', placeholder: 'Alert text, for example Back after the break', maxlength: 80, 'aria-label': 'Alert text' });
  return h('div', { class: 'moments' },
    h('h2', null, 'Trigger by hand'),
    h('div', { class: 'moment-grid' },
      side('Goal', 'goal'), side('Yellow card', 'yellow'), side('Red card', 'red'), side('Substitution', 'sub'), side('VAR check', 'var'),
      h('div', { class: 'moment' }, h('span', null, 'Whistle'),
        button('Half time', () => send({ name: 'fire', event: 'halftime' })), button('Full time', () => send({ name: 'fire', event: 'fulltime' })))),
    h('form', { class: 'alert-form', id: 'alert-form' }, textInput, h('button', { type: 'submit' }, 'Send alert')),
    h('h2', null, 'Activity'),
    h('ol', { class: 'log', id: 'log' }));
}

// ── Live refresh ─────────────────────────────────────────────────
function refresh() {
  if (!state || !catalog || !document.getElementById('match-chip')) return;
  const { live, onAir, status, quota, show } = state;
  const chip = document.getElementById('match-chip');
  chip.replaceChildren(live
    ? h('span', null, h('b', null, live.home.short), ` ${live.home.score} - ${live.away.score} `, h('b', null, live.away.short), h('small', null, `${live.league.name}, ${phaseText(live)}`))
    : h('span', null, h('b', null, 'No match yet'), h('small', null, 'Choose one in the Match tab')));
  const feed = document.getElementById('feed-chip');
  feed.className = `feed-chip state-${status.state}`;
  const quotaText = quota?.remaining !== null && quota?.remaining !== undefined ? `${quota.remaining} calls left today` : (show.source === 'sim' ? 'Rehearsal match' : '');
  feed.replaceChildren(h('i'), h('span', null, h('b', null, status.message), h('small', null, [quotaText, status.nextPollSeconds ? `update every ${status.nextPollSeconds}s` : ''].filter(Boolean).join(', '))));
  document.getElementById('delay-value').textContent = `${show.delaySeconds}s`;
  const compare = document.getElementById('score-compare');
  compare.replaceChildren(
    h('div', null, h('small', null, 'At the stadium now'), h('b', null, live ? `${live.home.score} - ${live.away.score}` : '-'), h('span', null, live ? phaseText(live) : '')),
    h('div', { class: live && onAir && (live.home.score !== onAir.home.score || live.away.score !== onAir.away.score) ? 'held' : '' },
      h('small', null, 'On air now'), h('b', null, onAir ? `${onAir.home.score} - ${onAir.away.score}` : '-'), h('span', null, onAir ? phaseText(onAir) : '')));
  const log = document.getElementById('log');
  log.replaceChildren(...state.log.slice(0, 12).map((l) => h('li', null, h('time', null, new Date(l.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })), l.message)));
  if (tab === 'widgets') refreshWidgets();
  if (tab === 'look') refreshLook();
}

function phaseText(m) {
  const names = { pre: 'Not started', first: `${m.minute}'`, halftime: 'Half time', second: `${m.minute}'`, extra: `${m.minute}'`, break: 'Break', shootout: 'Penalties', ended: 'Finished', stopped: 'Suspended' };
  return names[m.phase] || '';
}

// ── Tabs ─────────────────────────────────────────────────────────
function drawTab() {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  const body = document.getElementById('tab-body');
  const draws = { widgets: widgetsTab, match: matchTab, look: lookTab, content: contentTab, obs: obsTab };
  body.replaceChildren(draws[tab]());
  if (tab === 'widgets') refreshWidgets();
  if (tab === 'look') refreshLook();
  if (tab === 'match' && !ui.fixtures) loadFixtures();
}

function widgetsTab() {
  const groups = new Map();
  Object.entries(catalog.widgets).forEach(([id, w]) => {
    if (!groups.has(w.group)) groups.set(w.group, []);
    groups.get(w.group).push([id, w]);
  });
  return h('div', { class: 'widget-groups' }, [...groups.entries()].map(([group, items]) => h('section', { class: 'group' },
    h('h2', null, group),
    h('div', { class: 'widget-buttons' }, items.map(([id, w]) => h('div', { class: 'widget-row' },
      button(w.label, () => send({ name: 'widget', id }), 'widget-btn', { 'data-widget': id, 'aria-pressed': 'false' }),
      w.options ? Object.entries(w.options).map(([key, values]) => h('div', { class: 'seg', role: 'group', 'aria-label': `${w.label} ${key}` }, values.map((v) => button(v, () => send({ name: 'widget', id, on: true, opts: { [key]: v } }), 'seg-btn', { 'data-opt': `${id}:${key}:${v}` })))) : ''))))));
}

function refreshWidgets() {
  document.querySelectorAll('[data-widget]').forEach((b) => {
    const isOn = state?.show.widgets[b.dataset.widget]?.on;
    b.classList.toggle('on', Boolean(isOn));
    b.setAttribute('aria-pressed', String(Boolean(isOn)));
  });
  document.querySelectorAll('[data-opt]').forEach((b) => {
    const [id, key, value] = b.dataset.opt.split(':');
    b.classList.toggle('on', state?.show.widgets[id]?.opts?.[key] === value);
  });
}

async function loadFixtures() {
  ui.fixtures = null;
  ui.fixturesError = '';
  try {
    const res = await fetch(`/api/fixtures?source=${ui.source}&date=${ui.date}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `Server answered ${res.status}`);
    ui.fixtures = body;
  } catch (err) {
    ui.fixturesError = err.message;
    ui.fixtures = { fixtures: [], labels: {} };
  }
  if (tab === 'match') drawTab();
}

function matchTab() {
  const source = h('div', { class: 'seg seg-wide', role: 'group', 'aria-label': 'Data source' },
    button('Rehearsal match', () => { ui.source = 'sim'; loadFixtures(); }, `seg-btn${ui.source === 'sim' ? ' on' : ''}`),
    button('Real matches', () => { ui.source = 'api'; loadFixtures(); }, `seg-btn${ui.source === 'api' ? ' on' : ''}`));
  const list = h('div', { class: 'fixture-list' });
  const drawList = () => {
    if (!ui.fixtures) { list.replaceChildren(h('p', { class: 'note' }, 'Loading matches…')); return; }
    if (ui.fixturesError) { list.replaceChildren(h('p', { class: 'note error' }, ui.source === 'api' && !state?.apiConfigured ? 'Add API_FOOTBALL_KEY to your .env file and restart to see real matches.' : ui.fixturesError)); return; }
    const q = ui.filter.toLowerCase();
    const rows = ui.fixtures.fixtures.filter((f) => !q || `${f.home.name} ${f.away.name} ${f.league.name} ${f.league.country}`.toLowerCase().includes(q));
    if (!rows.length) { list.replaceChildren(h('p', { class: 'note' }, q ? 'No match fits that search.' : 'No matches on this date.')); return; }
    const leagues = new Map();
    rows.forEach((f) => {
      const key = `${f.league.country} ${f.league.name}`;
      if (!leagues.has(key)) leagues.set(key, { title: f.league.name, country: f.league.country, rows: [] });
      leagues.get(key).rows.push(f);
    });
    list.replaceChildren(...[...leagues.values()].map((l) => h('section', { class: 'league-group' },
      h('h3', null, l.title, h('small', null, l.country)),
      l.rows.map((f) => {
        const current = state?.show.fixtureId === f.fixtureId;
        const when = f.phase === 'pre' && f.kickoff ? new Date(f.kickoff).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (f.minute !== null ? `${f.minute}'` : f.statusShort);
        const label = ui.fixtures.labels?.[f.fixtureId];
        return button([
          h('span', { class: 'fx-time' }, when),
          h('span', { class: 'fx-teams' }, `${f.home.name} v ${f.away.name}`, label ? h('small', null, label) : ''),
          h('span', { class: 'fx-score' }, f.home.score !== null ? `${f.home.score} - ${f.away.score}` : ''),
        ], () => { send({ name: 'follow', source: ui.source, fixtureId: f.fixtureId }); toast(`Following ${f.home.name} v ${f.away.name}`); setTimeout(drawTab, 200); }, `fixture${current ? ' current' : ''}`);
      }))));
  };
  drawList();

  const rehearsal = ui.source === 'sim' ? h('section', { class: 'group' },
    h('h2', null, 'Rehearsal controls'),
    h('p', { class: 'note' }, 'A scripted match with fictional clubs. It runs through the same code as a real match, so you can practise and check your OBS scene without using any API calls.'),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Rehearsal speed' }, catalog.simSpeeds.map((s) => button(`${s}x`, () => { send({ name: 'simSpeed', speed: s }); toast(`Rehearsal speed ${s}x`); }, `seg-btn${state?.simSpeed === s ? ' on' : ''}`))),
    button('Restart this rehearsal', () => send({ name: 'simRestart' }), 'plain')) : '';

  return h('div', { class: 'match-tab' },
    source,
    ui.source === 'api' ? h('div', { class: 'row' },
      on(h('input', { type: 'date', value: ui.date, 'aria-label': 'Match date' }), 'change', (e) => { ui.date = e.target.value; loadFixtures(); }),
      on(h('input', { type: 'search', placeholder: 'Search team or league', value: ui.filter, 'aria-label': 'Search matches' }), 'input', (e) => { ui.filter = e.target.value; drawList(); })) : '',
    list,
    rehearsal);
}

function lookTab() {
  const themes = h('div', { class: 'theme-grid', id: 'theme-grid' }, Object.entries(catalog.themes).map(([id, theme]) => button([
    h('span', { class: 'swatch', style: { background: theme.ink } }, h('i', { style: { background: theme.accent } })),
    theme.label,
  ], () => send({ name: 'theme', id }), 'theme-btn', { 'data-theme': id })));
  const auto = on(h('input', { type: 'checkbox', id: 'theme-auto' }), 'change', (e) => send({ name: 'themeAuto', on: e.target.checked }));
  const color = (key, label) => h('label', { class: 'color' }, label, on(h('input', { type: 'color', value: state?.show.custom[key] || '#000000', 'data-color': key }), 'input', pushColors));
  function pushColors() {
    const payload = { name: 'customColors' };
    document.querySelectorAll('[data-color]').forEach((i) => { if (i.dataset.touched || i === document.activeElement) { i.dataset.touched = '1'; payload[i.dataset.color] = i.value; } });
    send(payload);
  }
  const autoSelect = (kind, label) => h('label', { class: 'field' }, label,
    on(h('select', { 'data-auto': kind }, catalog.display[kind].map((v) => h('option', { value: v }, { fullscreen: 'Full screen', banner: 'Banner', off: 'Do not show' }[v]))), 'change', (e) => send({ name: 'auto', kind, value: e.target.value })));

  return h('div', { class: 'look-tab' },
    h('section', { class: 'group' }, h('h2', null, 'Theme'), themes,
      h('label', { class: 'check' }, auto, 'Pick the theme from the competition automatically')),
    h('section', { class: 'group' }, h('h2', null, 'Your own colours'),
      h('div', { class: 'row' }, color('accent', 'Accent'), color('ink', 'Panels'), color('home', 'Home kit'), color('away', 'Away kit')),
      button('Clear my colours', () => { send({ name: 'customColors' }); document.querySelectorAll('[data-color]').forEach((i) => { delete i.dataset.touched; }); }, 'plain')),
    h('section', { class: 'group' }, h('h2', null, 'Language on air'),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Language' }, catalog.langs.map((l) => button({ en: 'English', fr: 'Français', es: 'Español', pt: 'Português' }[l], () => send({ name: 'lang', lang: l }), 'seg-btn', { 'data-lang': l })))),
    h('section', { class: 'group' }, h('h2', null, 'When something happens'),
      autoSelect('goal', 'Goals'), autoSelect('card', 'Cards'), autoSelect('sub', 'Substitutions'), autoSelect('var', 'VAR and cancelled goals'), autoSelect('phase', 'Half time and full time')));
}

function refreshLook() {
  const { show } = state;
  document.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('on', b.dataset.theme === show.themeId && !show.themeAuto));
  const auto = document.getElementById('theme-auto');
  if (auto) auto.checked = show.themeAuto;
  document.querySelectorAll('[data-lang]').forEach((b) => b.classList.toggle('on', b.dataset.lang === show.lang));
  document.querySelectorAll('[data-auto]').forEach((s) => { if (s !== document.activeElement) s.value = show.auto[s.dataset.auto]; });
}

function contentTab() {
  const { show } = state;
  const list = h('div', { class: 'social-list' });
  const rows = show.socials.length ? show.socials : [{ platform: 'x', handle: '' }];
  const addRow = (s) => {
    const row = h('div', { class: 'row social-row' },
      h('select', { 'aria-label': 'Platform' }, catalog.platforms.map((p) => h('option', { value: p, selected: p === s.platform }, { x: 'X', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', twitch: 'Twitch', kick: 'Kick' }[p]))),
      h('input', { type: 'text', value: s.handle, placeholder: '@yourchannel', maxlength: 40, 'aria-label': 'Handle' }),
      button('Remove', () => row.remove(), 'plain'));
    list.append(row);
  };
  rows.forEach(addRow);
  const sponsorText = h('input', { type: 'text', value: show.sponsor.text, maxlength: 60 });
  const sponsorLogo = h('input', { type: 'url', value: show.sponsor.logo, placeholder: 'https://' });
  const bg = h('input', { type: 'url', value: show.background, placeholder: 'https://' });
  const cdTitle = h('input', { type: 'text', value: show.countdown.title, maxlength: 60, placeholder: 'Starting soon' });
  const cdTime = h('input', { type: 'datetime-local', value: toLocalInput(show.countdown.target) });
  const teams = h('textarea', { rows: 8 }, show.followedTeams.join('\n'));
  const guide = on(h('input', { type: 'checkbox', checked: show.cameraGuide }), 'change', (e) => send({ name: 'cameraGuide', on: e.target.checked }));

  return h('div', { class: 'content-tab' },
    h('section', { class: 'group' }, h('h2', null, 'Socials'), h('p', { class: 'note' }, 'With more than one handle, the widget rotates through them.'), list,
      h('div', { class: 'row' }, button('Add a handle', () => addRow({ platform: 'x', handle: '' }), 'plain'),
        button('Save socials', () => {
          const socials = [...list.querySelectorAll('.social-row')].map((r) => ({ platform: r.querySelector('select').value, handle: r.querySelector('input').value }));
          send({ name: 'socials', socials }); toast('Socials saved');
        }))),
    h('section', { class: 'group' }, h('h2', null, 'Countdown screen'), h('p', { class: 'note' }, 'Leave the time empty to count down to the kick-off of the match you are following.'),
      h('label', { class: 'field' }, 'Title', cdTitle), h('label', { class: 'field' }, 'Count down to', cdTime),
      button('Save countdown', () => { send({ name: 'countdown', title: cdTitle.value, target: cdTime.value ? new Date(cdTime.value).getTime() : null }); toast('Countdown saved'); })),
    h('section', { class: 'group' }, h('h2', null, 'Sponsor'), h('label', { class: 'field' }, 'Name', sponsorText), h('label', { class: 'field' }, 'Logo link', sponsorLogo),
      button('Save sponsor', () => { send({ name: 'sponsor', text: sponsorText.value, logo: sponsorLogo.value }); toast('Sponsor saved'); })),
    h('section', { class: 'group' }, h('h2', null, 'Backdrop image'), h('label', { class: 'field' }, 'Image link', bg),
      button('Save backdrop', () => { send({ name: 'background', url: bg.value }); toast('Backdrop saved'); })),
    h('section', { class: 'group' }, h('h2', null, 'Teams you follow'), h('p', { class: 'note' }, 'One team per line. These always appear in Other matches, alongside the major leagues.'), teams,
      button('Save teams', () => { send({ name: 'followedTeams', teams: teams.value.split('\n') }); toast('Teams saved'); })),
    h('section', { class: 'group' }, h('h2', null, 'Camera position'), h('label', { class: 'check' }, guide, 'Show the camera outline on air while lining up your scene')));
}

function toLocalInput(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function obsTab() {
  const link = (label, hint, url) => h('div', { class: 'obs-link' },
    h('div', null, h('b', null, label), h('small', null, hint)),
    button('Copy link', () => copy(url, `${label}: link copied`)));
  const deckLine = (label, path) => h('div', { class: 'obs-link' }, h('div', null, h('b', null, label), h('small', null, `/deck/${path}`)),
    button('Copy', () => copy(`${location.origin}/deck/${path}?token=${catalog.controlToken}`, 'Deck link copied')));
  const format = (name, size, params) => h('section', { class: 'group' },
    h('h2', null, `${name}, ${size}`),
    link('1. Backdrop', 'Bottom of the scene. Skip it if you want your camera full screen.', overlayUrl({ ...params, layer: 'back' })),
    h('p', { class: 'note obs-step' }, '2. Put your camera source here, in the middle of the stack.'),
    link('3. Widgets', 'Top of the scene. Transparent everywhere except the graphics.', overlayUrl({ ...params, layer: 'front' })));
  return h('div', { class: 'obs-tab' },
    h('p', { class: 'note' }, 'In OBS, add each link as a Browser source at the size shown. Keep these links private: the widgets link can show your overlay to anyone who has it.'),
    format('Landscape for YouTube and Twitch', '1920×1080', { format: 'landscape' }),
    format('Portrait for TikTok and Shorts', '1080×1920', { format: 'portrait' }),
    h('section', { class: 'group' }, h('h2', null, 'Stream Deck'),
      h('p', { class: 'note' }, 'Give a key the Website action, paste a link, and tick "GET request in background". These links can control your show, so never share them.'),
      deckLine('Radar on or off', 'toggle/radar'), deckLine('Stats on or off', 'toggle/stats'), deckLine('Lineups on or off', 'toggle/lineups'),
      deckLine('Hide all widgets', 'hide-all'), deckLine('Add 1s of delay', 'delay/1'), deckLine('Remove 1s of delay', 'delay/-1'), deckLine('Home goal by hand', 'fire/goal/home'),
      h('p', { class: 'note' }, `Any widget works: ${Object.keys(catalog.widgets).join(', ')}.`)));
}

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'alert-form') return;
  e.preventDefault();
  const input = e.target.querySelector('input');
  send({ name: 'alert', text: input.value });
  input.value = '';
});
