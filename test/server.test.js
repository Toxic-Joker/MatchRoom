const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { io } = require('socket.io-client');
const { createApp } = require('../server/app');
const { applyAction, defaultShow, ActionError, reviveShow } = require('../server/show');
const { ApiFootballProvider } = require('../server/providers/apiFootball');

async function boot(env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inplay-test-'));
  const instance = createApp({ dataDir, env });
  await new Promise((resolve) => instance.server.listen(0, '127.0.0.1', resolve));
  instance.start();
  const url = `http://127.0.0.1:${instance.server.address().port}`;
  return { ...instance, url, dataDir };
}

function connect(url, ns, token) {
  return new Promise((resolve, reject) => {
    const socket = io(`${url}${ns}`, { auth: { token }, transports: ['websocket'], reconnection: false });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', (err) => { socket.close(); reject(err); });
  });
}

const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve));
const stop = (i) => { i.close(); i.server.close(); fs.rmSync(i.dataDir, { recursive: true, force: true }); };

test('sockets refuse missing and wrong tokens', async () => {
  const i = await boot();
  await assert.rejects(connect(i.url, '/overlay', 'nope'), /unauthorized/);
  await assert.rejects(connect(i.url, '/control', ''), /unauthorized/);
  // An overlay link must not open the control channel.
  await assert.rejects(connect(i.url, '/control', i.tokens.overlay), /unauthorized/);
  stop(i);
});

test('a foreign web page cannot open a socket to the server', async () => {
  const i = await boot();
  const refused = await new Promise((resolve) => {
    const s = io(`${i.url}/control`, { auth: { token: i.tokens.control }, transports: ['websocket'], reconnection: false, extraHeaders: { Origin: 'https://evil.example' } });
    s.on('connect', () => { s.close(); resolve(false); });
    s.on('connect_error', () => { s.close(); resolve(true); });
  });
  assert.strictEqual(refused, true);
  stop(i);
});

test('an overlay gets everything back on reload and cannot change the show', async () => {
  const i = await boot();
  const control = await connect(i.url, '/control', i.tokens.control);
  await new Promise((resolve) => control.emit('action', { name: 'widget', id: 'stats', on: true }, resolve));

  const overlay = await new Promise((resolve) => {
    const s = io(`${i.url}/overlay`, { auth: { token: i.tokens.overlay }, transports: ['websocket'] });
    s.once('hello', (hello) => resolve({ s, hello }));
  });
  assert.strictEqual(overlay.hello.show.widgets.stats.on, true);

  overlay.s.emit('action', { name: 'widget', id: 'stats', on: false });
  await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(i.getShow().widgets.stats.on, true);
  overlay.s.close();
  control.close();
  stop(i);
});

test('the show keeps running with no control room connected', async () => {
  const i = await boot();
  const overlay = await connect(i.url, '/overlay', i.tokens.overlay);
  const frame = await once(overlay, 'frame');
  assert.strictEqual(frame.fixtureId, 1001);
  overlay.close();
  stop(i);
});

test('match data waits for the stream delay, control changes do not', async () => {
  const i = await boot();
  const control = await connect(i.url, '/control', i.tokens.control);
  await new Promise((r) => control.emit('action', { name: 'delay', seconds: 3 }, r));
  await new Promise((r) => control.emit('action', { name: 'simRestart' }, r));
  const overlay = await connect(i.url, '/overlay', i.tokens.overlay);
  const started = Date.now();
  const frame = await once(overlay, 'frame');
  assert.ok(frame);
  assert.ok(Date.now() - started >= 2500, `frame arrived after ${Date.now() - started}ms`);
  const shown = once(overlay, 'show');
  control.emit('action', { name: 'widget', id: 'radar', on: true });
  const fast = await shown;
  assert.ok(fast.widgets);
  overlay.close();
  control.close();
  stop(i);
});

test('deck links need the control token and work with it', async () => {
  const i = await boot();
  assert.strictEqual((await fetch(`${i.url}/deck/toggle/stats`)).status, 401);
  assert.strictEqual((await fetch(`${i.url}/deck/toggle/stats?token=${i.tokens.overlay}`)).status, 401);
  assert.strictEqual((await fetch(`${i.url}/deck/toggle/stats?token=${i.tokens.control}`)).status, 200);
  assert.strictEqual(i.getShow().widgets.stats.on, true);
  assert.strictEqual((await fetch(`${i.url}/deck/toggle/nope?token=${i.tokens.control}`)).status, 400);
  assert.strictEqual((await fetch(`${i.url}/deck/delay/7?token=${i.tokens.control}`)).status, 200);
  assert.strictEqual(i.getShow().delaySeconds, 7);
  assert.strictEqual((await fetch(`${i.url}/deck/fire/goal/home?token=${i.tokens.control}`)).status, 200);
  stop(i);
});

test('pages carry a content security policy and tokens are private on disk', async () => {
  const i = await boot();
  const res = await fetch(`${i.url}/overlay/`);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  const mode = fs.statSync(path.join(i.dataDir, 'tokens.json')).mode & 0o777;
  assert.strictEqual(mode, 0o600);
  stop(i);
});

test('widgets in one slot replace each other, other slots are untouched', () => {
  let show = defaultShow();
  show = applyAction(show, { name: 'widget', id: 'radar', on: true });
  show = applyAction(show, { name: 'widget', id: 'stats', on: true });
  show = applyAction(show, { name: 'widget', id: 'momentum', on: true });
  assert.strictEqual(show.widgets.radar.on, false);
  assert.strictEqual(show.widgets.momentum.on, true);
  assert.strictEqual(show.widgets.stats.on, true);
  show = applyAction(show, { name: 'hideAll' });
  assert.strictEqual(show.widgets.stats.on, false);
  assert.strictEqual(show.widgets.scorebug.on, true);
});

test('bad input is rejected', () => {
  const show = defaultShow();
  const bad = [
    { name: 'nope' }, { name: 'widget', id: 'nope' }, { name: 'theme', id: 'nope' }, { name: 'lang', lang: 'xx' },
    { name: 'background', url: 'javascript:alert(1)' }, { name: 'background', url: 'http://x/y.png' },
    { name: 'customColors', accent: 'red;background:url(x)' }, { name: 'widget', id: 'radar', opts: { mode: 'evil' } },
    { name: 'socials', socials: [{ platform: 'evil', handle: 'x' }] }, { name: 'delay', seconds: 'soon' },
  ];
  bad.forEach((a) => assert.throws(() => applyAction(show, a), ActionError, JSON.stringify(a)));
});

test('delay stays in range', () => {
  const show = defaultShow();
  assert.strictEqual(applyAction(show, { name: 'delay', by: -5 }).delaySeconds, 0);
  assert.strictEqual(applyAction(show, { name: 'delay', seconds: 9999 }).delaySeconds, 300);
});

test('saved settings survive an update that adds widgets', () => {
  const saved = { lang: 'fr', widgets: { stats: { on: true, at: 5, opts: {} } } };
  const show = reviveShow(saved);
  assert.strictEqual(show.lang, 'fr');
  assert.strictEqual(show.widgets.stats.on, true);
  assert.strictEqual(show.widgets.radar.on, false);
});

test('API client sends the key, reads the quota and fills in missing detail', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ path: new URL(url).pathname, key: opts.headers['x-apisports-key'] });
    const headers = new Headers({ 'x-ratelimit-requests-remaining': '42', 'x-ratelimit-requests-limit': '100' });
    const pathname = new URL(url).pathname;
    const response = pathname === '/fixtures'
      ? [{ fixture: { id: 1, status: { short: '1H' } }, events: [{ type: 'Goal' }], lineups: [], statistics: [], players: [] }]
      : [{ fromSubEndpoint: true }];
    return new Response(JSON.stringify({ errors: [], response }), { status: 200, headers });
  };
  const api = new ApiFootballProvider('secret', fakeFetch);
  const raw = await api.fixture(1);
  assert.strictEqual(api.quota.remaining, 42);
  assert.strictEqual(api.quota.limit, 100);
  assert.ok(calls.every((c) => c.key === 'secret'));
  assert.deepStrictEqual(raw.events, [{ type: 'Goal' }]);
  assert.deepStrictEqual(raw.statistics, [{ fromSubEndpoint: true }]);
  assert.ok(!calls.some((c) => c.path === '/fixtures/events'), 'events were already in the response');
});

test('API errors reported in a 200 response still count as errors', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ errors: { plan: 'Your plan does not cover this season' }, response: [] }), { status: 200 });
  const api = new ApiFootballProvider('secret', fakeFetch);
  await assert.rejects(api.fixture(1), /does not cover/);
});
