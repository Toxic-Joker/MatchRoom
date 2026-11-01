// API-Football v3 client. Never sends the key to the browser, caches slow data,
// and reports the remaining daily quota so polling can pace itself.

const BASE_URL = 'https://v3.football.api-sports.io';
const TABLE_TTL_MS = 60 * 60 * 1000;
const LIVE_TTL_MS = 90 * 1000;
const DETAIL_TTL_MS = 60 * 1000;

class ApiFootballProvider {
  constructor(key, fetchImpl = fetch, baseUrl = BASE_URL) {
    this.key = key;
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl;
    this.cache = new Map();
    this.quota = { limit: null, remaining: null, updatedAt: null };
    this.id = 'api';
    this.rate = 1;
  }

  get configured() {
    return Boolean(this.key);
  }

  async get(path, params = {}) {
    if (!this.key) throw new Error('API_FOOTBALL_KEY is not set');
    const url = new URL(path, this.baseUrl);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await this.fetch(url, {
      headers: { 'x-apisports-key': this.key },
      signal: AbortSignal.timeout(10000),
    });
    this.readQuota(res.headers);
    if (!res.ok) throw new Error(`API-Football answered ${res.status} for ${path}`);
    const body = await res.json();
    const errors = body.errors && Object.values(body.errors);
    if (errors?.length) throw new Error(`API-Football: ${errors.join(', ')}`);
    return body.response || [];
  }

  readQuota(headers) {
    const remaining = headers.get('x-ratelimit-requests-remaining');
    const limit = headers.get('x-ratelimit-requests-limit');
    if (remaining !== null) this.quota.remaining = Number(remaining);
    if (limit !== null) this.quota.limit = Number(limit);
    this.quota.updatedAt = Date.now();
  }

  async cached(key, ttl, load) {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const value = await load();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }

  // One call returns the fixture with its events, lineups, statistics and player
  // ratings. Anything the plan leaves out is fetched separately, at a slower pace.
  async fixture(id) {
    const [raw] = await this.get('/fixtures', { id });
    if (!raw) throw new Error(`Fixture ${id} not found`);
    const fill = async (field, path) => {
      if (Array.isArray(raw[field]) && raw[field].length) return;
      raw[field] = await this.cached(`${field}:${id}`, DETAIL_TTL_MS, () => this.get(path, { fixture: id }))
        .catch(() => []);
    };
    const started = !['NS', 'TBD'].includes(raw.fixture?.status?.short);
    await fill('lineups', '/fixtures/lineups');
    if (started) {
      await fill('events', '/fixtures/events');
      await fill('statistics', '/fixtures/statistics');
      await fill('players', '/fixtures/players');
    }
    return raw;
  }

  async fixturesByDate(date) {
    return this.cached(`date:${date}`, 5 * 60 * 1000, () => this.get('/fixtures', { date }));
  }

  async liveFixtures() {
    return this.cached('live', LIVE_TTL_MS, () => this.get('/fixtures', { live: 'all' }));
  }

  async standings(league, season) {
    return this.cached(`standings:${league}:${season}`, TABLE_TTL_MS, () => this.get('/standings', { league, season }));
  }

  async leagueFixtures(league, season) {
    return this.cached(`league:${league}:${season}`, TABLE_TTL_MS, () => this.get('/fixtures', { league, season }));
  }
}

module.exports = { ApiFootballProvider };
