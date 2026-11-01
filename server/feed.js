// Follows one match: polls the provider, works out what happened, and holds
// everything in the delay line until it is due on air.

const { normalizeFixture, normalizeStandings, normalizeBracket, normalizeFixtureRow, filterLiveMatches } = require('./domain/normalize');
const { MatchEngine } = require('./domain/engine');
const { DelayLine } = require('./domain/delayLine');
const { nextPollSeconds } = require('./domain/budget');

const SIM_POLL_SECONDS = 2;
const RETRY_SECONDS = 30;
const TICK_MS = 250;
const TABLE_CHECK_MS = 30000;

class Feed {
  constructor({ providers, getShow, onAir, onChange, log, now = () => Date.now() }) {
    this.providers = providers;
    this.getShow = getShow;
    this.onAir = onAir;
    this.onChange = onChange;
    this.log = log;
    this.now = now;
    this.delay = new DelayLine(0);
    this.provider = null;
    this.engine = null;
    this.fixtureId = null;
    this.generation = 0;
    this.pollTimer = null;
    this.live = null;
    this.onAirFrame = null;
    this.onAirAt = 0;
    this.tables = { standings: null, livescore: null, bracket: null };
    this.status = { state: 'idle', message: 'Choose a match to start', lastUpdate: null, nextPollSeconds: null };
    this.ticker = setInterval(() => this.tick(), TICK_MS);
    this.tableTimer = setInterval(() => this.refreshTables(), TABLE_CHECK_MS);
    this.ticker.unref?.();
    this.tableTimer.unref?.();
  }

  stop() {
    clearInterval(this.ticker);
    clearInterval(this.tableTimer);
    clearTimeout(this.pollTimer);
    this.generation += 1;
  }

  follow(source, fixtureId) {
    const provider = this.providers[source];
    if (!provider) throw new Error(`Unknown data source: ${source}`);
    this.generation += 1;
    clearTimeout(this.pollTimer);
    this.provider = provider;
    this.fixtureId = fixtureId;
    this.engine = new MatchEngine();
    this.live = null;
    this.onAirFrame = null;
    this.tables = { standings: null, livescore: null, bracket: null };
    // A new match must not inherit what was waiting for the old one.
    this.delay = new DelayLine(this.getShow().delaySeconds * 1000);
    this.onAir({ kind: 'reset' });
    this.status = { state: 'connecting', message: 'Connecting to the match feed', lastUpdate: null, nextPollSeconds: null };
    this.onChange();
    if (!provider.configured) {
      this.status = { state: 'error', message: 'Add API_FOOTBALL_KEY to .env, or use the rehearsal match', lastUpdate: null, nextPollSeconds: null };
      this.onChange();
      return;
    }
    this.poll(this.generation);
  }

  setDelay(seconds) {
    this.delay.setDelay(seconds * 1000);
    this.tick();
  }

  async poll(generation) {
    let wait;
    try {
      const raw = await this.provider.fixture(this.fixtureId);
      if (generation !== this.generation) return;
      const at = this.now();
      const { snapshot, events } = this.engine.ingest(normalizeFixture(raw, at));
      const firstFrame = !this.live;
      this.live = snapshot;
      this.delay.push('frame', snapshot, at);
      events.forEach((event) => {
        this.delay.push('event', event, at);
        if (!event.derived) this.log(describeEvent(event));
      });
      wait = this.pace(snapshot);
      this.status = {
        state: wait === null ? 'finished' : 'live',
        message: wait === null ? 'Match finished, feed stopped' : 'Receiving match data',
        lastUpdate: at,
        nextPollSeconds: wait,
      };
      if (firstFrame) this.refreshTables();
      this.tick();
    } catch (err) {
      if (generation !== this.generation) return;
      wait = RETRY_SECONDS;
      // Keep what is on air: a stale score beats an empty overlay.
      this.status = { ...this.status, state: 'stale', message: err.message, nextPollSeconds: wait };
      this.log(`Feed problem: ${err.message}`);
    }
    this.onChange();
    if (wait !== null) {
      this.pollTimer = setTimeout(() => this.poll(generation), wait * 1000);
      this.pollTimer.unref?.();
    }
  }

  pace(snapshot) {
    if (this.provider.id === 'sim') return snapshot.phase === 'ended' ? null : SIM_POLL_SECONDS;
    return nextPollSeconds({ phase: snapshot.phase, minute: snapshot.minute, remaining: this.provider.quota.remaining });
  }

  tick() {
    const due = this.delay.release(this.now());
    due.forEach((item) => {
      if (item.kind === 'frame') {
        this.onAirFrame = item.data;
        this.onAirAt = this.now();
        this.onAir({ kind: 'frame', frame: item.data });
        this.onChange();
      } else if (item.kind === 'event') {
        this.onAir({ kind: 'event', event: item.data });
      } else if (item.kind === 'tables') {
        this.tables = { ...this.tables, ...item.data };
        this.onAir({ kind: 'tables', tables: item.data });
      }
    });
  }

  // The on-air frame with its clock brought up to this moment, for late joiners.
  currentFrame() {
    const frame = this.onAirFrame;
    if (!frame) return null;
    if (!frame.clock.running) return frame;
    const passed = ((this.now() - this.onAirAt) / 1000) * frame.clock.rate;
    return { ...frame, clock: { ...frame.clock, seconds: frame.clock.seconds + passed } };
  }

  needs(id) {
    return this.getShow().widgets[id]?.on;
  }

  // Tables cost API calls, so they load only when a widget on air needs them.
  async refreshTables() {
    const match = this.live;
    if (!match || !this.provider) return;
    const generation = this.generation;
    const { league } = match;
    const teamIds = [match.home.id, match.away.id];
    const publish = (data, delayed) => {
      if (generation !== this.generation) return;
      if (delayed) this.delay.push('tables', data, this.now());
      else {
        this.tables = { ...this.tables, ...data };
        this.onAir({ kind: 'tables', tables: data });
      }
    };
    try {
      if (this.needs('standings') || this.needs('standingsFull')) {
        publish({ standings: normalizeStandings(await this.provider.standings(league.id, league.season), teamIds) }, false);
      }
      if (this.needs('bracket')) {
        publish({ bracket: normalizeBracket(await this.provider.leagueFixtures(league.id, league.season), league.name, league.logo) }, false);
      }
      if (this.needs('livescore')) {
        const show = this.getShow();
        const rows = (await this.provider.liveFixtures()).map(normalizeFixtureRow);
        const leagueIds = this.provider.id === 'sim' ? [league.id] : show.leagueIds;
        publish({ livescore: filterLiveMatches(rows, { excludeId: this.fixtureId, leagueIds, followedTeams: show.followedTeams }) }, true);
      }
    } catch (err) {
      this.log(`Could not load a table: ${err.message}`);
    }
    this.onChange();
  }
}

function describeEvent(e) {
  switch (e.type) {
    case 'goal': return `Goal: ${e.team}${e.player ? `, ${e.player}` : ', scorer not known yet'}`;
    case 'goal_resolved': return `Scorer confirmed: ${e.player}`;
    case 'goal_cancelled': return `Goal cancelled: ${e.team}`;
    case 'card': return `${e.card === 'red' ? 'Red' : 'Yellow'} card: ${e.player}`;
    case 'sub': return `Substitution: ${e.playerIn} on, ${e.playerOut} off`;
    case 'var': return `VAR: ${e.detail}`;
    case 'missed_penalty': return `Penalty missed: ${e.player}`;
    case 'shootout_kick': return `Shootout: ${e.player} ${e.scored ? 'scored' : 'missed'}`;
    case 'phase': return `Match phase: ${e.phase}`;
    default: return e.type;
  }
}

module.exports = { Feed, describeEvent };
