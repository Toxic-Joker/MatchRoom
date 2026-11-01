// Wires the HTTP routes, the two Socket.IO channels and the feed together.
// Overlays may only read. Only the control channel, with its own token, can change anything.

const path = require('path');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const { Server } = require('socket.io');

const { WIDGETS, THEMES, LANGS, DISPLAY, SOCIAL_PLATFORMS, MAX_DELAY, reviveShow, applyAction, themeTokens, ActionError, cleanText } = require('./show');
const { Feed } = require('./feed');
const { normalizeFixtureRow } = require('./domain/normalize');
const { ApiFootballProvider } = require('./providers/apiFootball');
const { SimulatorProvider, SCENARIOS } = require('./providers/simulator');

const MANUAL_EVENTS = new Set(['goal', 'yellow', 'red', 'sub', 'var', 'halftime', 'fulltime']);
const SIM_SPEEDS = [1, 5, 20, 60];
const LOG_SIZE = 60;

function sameToken(given, expected) {
  const a = Buffer.from(String(given ?? ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function loadTokens(dataDir, env) {
  const file = path.join(dataDir, 'tokens.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  const tokens = {
    control: env.CONTROL_TOKEN || saved.control || crypto.randomBytes(18).toString('base64url'),
    overlay: env.OVERLAY_TOKEN || saved.overlay || crypto.randomBytes(18).toString('base64url'),
  };
  fs.writeFileSync(file, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  return tokens;
}

function createApp({ env = process.env, dataDir, providers: providersOverride } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tokens = loadTokens(dataDir, env);
  const showFile = path.join(dataDir, 'show.json');
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(showFile, 'utf8')); } catch { /* first run */ }
  let show = reviveShow(saved);
  if (!show.source) show = { ...show, source: 'sim' };

  const sim = new SimulatorProvider(Number(env.SIM_SPEED) || 20);
  const providers = providersOverride || { sim, api: new ApiFootballProvider(env.API_FOOTBALL_KEY) };
  const log = [];

  const app = express();
  app.disable('x-powered-by');
  const server = http.createServer(app);
  const io = new Server(server, {
    serveClient: true,
    // Browsers do not apply CORS to WebSockets, so foreign pages are refused here.
    allowRequest: (req, callback) => {
      const { origin, host } = req.headers;
      if (!origin) return callback(null, true);
      try { return callback(null, new URL(origin).host === host); } catch { return callback(null, false); }
    },
  });
  const overlayIo = io.of('/overlay');
  const controlIo = io.of('/control');

  let saveTimer = null;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      fs.writeFile(showFile, JSON.stringify(show, null, 2), (err) => { if (err) console.error('[show] save failed:', err.message); });
    }, 300);
    saveTimer.unref?.();
  }

  function addLog(message) {
    log.unshift({ at: Date.now(), message: cleanText(message, 200) });
    log.length = Math.min(log.length, LOG_SIZE);
  }

  function overlayShow() {
    return {
      widgets: show.widgets,
      lang: show.lang,
      background: show.background,
      cameraGuide: show.cameraGuide,
      socials: show.socials,
      sponsor: show.sponsor,
      countdown: show.countdown,
      theme: themeTokens(show, feed.live?.league?.id),
      kitColors: { home: show.custom.home || null, away: show.custom.away || null },
    };
  }

  function controlState() {
    return {
      show,
      live: feed.live,
      onAir: feed.onAirFrame,
      status: feed.status,
      quota: feed.provider?.quota ?? null,
      pendingOnAir: feed.delay.pending,
      log,
      simSpeed: sim.speed,
      apiConfigured: Boolean(providers.api?.configured),
      tablesLoaded: { standings: Boolean(feed.tables.standings), livescore: Boolean(feed.tables.livescore), bracket: Boolean(feed.tables.bracket) },
    };
  }

  let changeTimer = null;
  function publishControl() {
    if (changeTimer) return;
    changeTimer = setTimeout(() => {
      changeTimer = null;
      controlIo.emit('state', controlState());
    }, 100);
    changeTimer.unref?.();
  }

  // Pressing Goal by hand and then getting the same goal from the feed must not celebrate twice.
  const manualGoalAt = { home: 0, away: 0 };
  const MANUAL_GOAL_WINDOW_MS = 180000;

  function presentEvent(event) {
    const { auto } = show;
    if (event.type === 'goal' && Date.now() - manualGoalAt[event.side] < MANUAL_GOAL_WINDOW_MS) {
      manualGoalAt[event.side] = 0;
      return { ...event, display: auto.goal === 'off' ? 'off' : 'banner' };
    }
    const rule = { goal: auto.goal, goal_resolved: auto.goal, card: auto.card, sub: auto.sub, var: auto.var, goal_cancelled: auto.var, missed_penalty: auto.var, phase: auto.phase, shootout_kick: 'off' }[event.type];
    const display = event.derived ? 'off' : (rule ?? 'off');
    return { ...event, display };
  }

  const feed = new Feed({
    providers,
    getShow: () => show,
    log: addLog,
    onChange: publishControl,
    onAir: (item) => {
      if (item.kind === 'reset') overlayIo.emit('hello', { show: overlayShow(), frame: null, tables: {} });
      if (item.kind === 'frame') {
        overlayIo.emit('frame', item.frame);
        overlayIo.emit('show', overlayShow());
      }
      if (item.kind === 'event') overlayIo.emit('event', presentEvent(item.event));
      if (item.kind === 'tables') overlayIo.emit('tables', item.tables);
    },
  });

  function runAction(action) {
    const name = action?.name;
    if (name === 'follow') {
      const source = action.source === 'api' ? 'api' : 'sim';
      const fixtureId = Number(action.fixtureId);
      if (!Number.isInteger(fixtureId) || fixtureId <= 0) throw new ActionError('Choose a valid match');
      show = { ...show, source, fixtureId };
      feed.follow(source, fixtureId);
      addLog(`Following match ${fixtureId}`);
    } else if (name === 'simSpeed') {
      if (!SIM_SPEEDS.includes(Number(action.speed))) throw new ActionError('Invalid rehearsal speed');
      sim.setSpeed(Number(action.speed));
    } else if (name === 'simRestart') {
      sim.restart(show.fixtureId);
      feed.follow('sim', show.fixtureId);
      addLog('Rehearsal restarted');
    } else if (name === 'fire') {
      if (!MANUAL_EVENTS.has(action.event)) throw new ActionError('Unknown manual event');
      fireManual(action.event, action.side);
      return;
    } else if (name === 'alert') {
      const text = cleanText(action.text, 80);
      if (!text) throw new ActionError('Write the alert text first');
      overlayIo.emit('alert', { text, sub: cleanText(action.sub, 120), seconds: Math.min(60, Number(action.seconds) || 8) });
      addLog(`Alert: ${text}`);
      return;
    } else {
      const before = show;
      show = applyAction(show, action);
      if (name === 'delay' && before.delaySeconds !== show.delaySeconds) {
        feed.setDelay(show.delaySeconds);
        addLog(`Broadcast delay set to ${show.delaySeconds}s`);
      }
      if (name === 'widget' && show.widgets[action.id]?.on) feed.refreshTables();
    }
    overlayIo.emit('show', overlayShow());
    persist();
    publishControl();
  }

  // Manual triggers skip the delay: the operator presses them while watching their own stream.
  function fireManual(event, side) {
    const match = feed.onAirFrame || feed.live;
    const validSide = side === 'home' || side === 'away' ? side : null;
    const team = validSide && match ? match[validSide].name : '';
    const base = { manual: true, side: validSide, team, player: '', minute: match?.minute ?? 0 };
    const score = match ? { home: match.home.score, away: match.away.score } : null;
    if (event === 'goal' && validSide) manualGoalAt[validSide] = Date.now();
    const payload = {
      goal: { ...base, type: 'goal', kind: 'goal', goalId: `manual-${Date.now()}`, display: 'fullscreen' },
      yellow: { ...base, type: 'card', card: 'yellow', display: 'banner' },
      red: { ...base, type: 'card', card: 'red', display: 'banner' },
      sub: { ...base, type: 'sub', playerIn: '', playerOut: '', display: 'banner' },
      var: { ...base, type: 'var', detail: '', display: 'banner' },
      halftime: { ...base, type: 'phase', phase: 'halftime', score, display: 'banner' },
      fulltime: { ...base, type: 'phase', phase: 'ended', score, display: 'banner' },
    }[event];
    overlayIo.emit('event', payload);
    addLog(`Manual trigger: ${event}${validSide ? ` (${validSide})` : ''}`);
    publishControl();
  }

  // ── HTTP ──────────────────────────────────────────────────────────
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' ws: wss:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.get('/', (req, res) => res.redirect('/control/'));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(express.json({ limit: '32kb' }));
  app.get('/healthz', (req, res) => res.json({ ok: true }));

  function requireControl(req, res, next) {
    const bearer = (req.get('authorization') || '').replace(/^Bearer /, '');
    if (sameToken(bearer || req.query.token, tokens.control)) return next();
    return res.status(401).json({ error: 'Control token missing or wrong' });
  }

  app.get('/api/fixtures', requireControl, async (req, res) => {
    const source = req.query.source === 'api' ? 'api' : 'sim';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : new Date().toISOString().slice(0, 10);
    try {
      const raw = await providers[source].fixturesByDate(date);
      res.json({ date, source, fixtures: raw.map(normalizeFixtureRow), labels: source === 'sim' ? Object.fromEntries(Object.entries(SCENARIOS).map(([k, v]) => [k, v.label])) : {} });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // Plain GET links, so a Stream Deck "Website" key (background mode) or Companion can press them.
  function deck(res, action) {
    try {
      runAction(action);
      res.json({ ok: true });
    } catch (err) {
      res.status(err instanceof ActionError ? 400 : 500).json({ error: err.message });
    }
  }
  app.get('/deck/toggle/:id', requireControl, (req, res) => deck(res, { name: 'widget', id: req.params.id }));
  app.get('/deck/on/:id', requireControl, (req, res) => deck(res, { name: 'widget', id: req.params.id, on: true }));
  app.get('/deck/off/:id', requireControl, (req, res) => deck(res, { name: 'widget', id: req.params.id, on: false }));
  app.get('/deck/hide-all', requireControl, (req, res) => deck(res, { name: 'hideAll' }));
  app.get('/deck/delay/:by', requireControl, (req, res) => deck(res, { name: 'delay', by: Number(req.params.by) }));
  app.get('/deck/fire/:event{/:side}', requireControl, (req, res) => deck(res, { name: 'fire', event: req.params.event, side: req.params.side }));

  // ── Sockets ───────────────────────────────────────────────────────
  overlayIo.use((socket, next) => {
    const { token } = socket.handshake.auth;
    if (sameToken(token, tokens.overlay) || sameToken(token, tokens.control)) return next();
    return next(new Error('unauthorized'));
  });
  overlayIo.on('connection', (socket) => {
    // A reloaded OBS source gets everything back immediately. Nothing else is accepted from it.
    socket.emit('hello', { show: overlayShow(), frame: feed.currentFrame(), tables: feed.tables });
  });

  controlIo.use((socket, next) => {
    if (sameToken(socket.handshake.auth.token, tokens.control)) return next();
    return next(new Error('unauthorized'));
  });
  controlIo.on('connection', (socket) => {
    socket.emit('catalog', { widgets: WIDGETS, themes: Object.fromEntries(Object.entries(THEMES).map(([k, v]) => [k, v])), langs: LANGS, display: DISPLAY, platforms: SOCIAL_PLATFORMS, simSpeeds: SIM_SPEEDS, maxDelay: MAX_DELAY, overlayToken: tokens.overlay, controlToken: tokens.control });
    socket.emit('state', controlState());
    socket.on('action', (action, reply) => {
      try {
        runAction(action);
        if (typeof reply === 'function') reply({ ok: true });
      } catch (err) {
        if (!(err instanceof ActionError)) console.error('[action]', err);
        if (typeof reply === 'function') reply({ error: err.message });
      }
    });
  });

  function start() {
    feed.setDelay(show.delaySeconds);
    feed.follow(show.source === 'api' && !providers.api?.configured ? 'sim' : show.source, show.fixtureId);
  }

  function close() {
    feed.stop();
    clearTimeout(saveTimer);
    io.close();
  }

  return { app, server, io, tokens, start, close, feed, getShow: () => show };
}

module.exports = { createApp };
