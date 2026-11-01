// Compares successive match snapshots and works out what just happened.
// The first snapshot is a baseline: joining a match in the 70th minute must not
// replay 70 minutes of goals and cards on air.

const { goalSide, isScoringEvent, displayName } = require('./normalize');

const SIDES = ['home', 'away'];
const STAT_EVENTS = { corners: 'corner', shotsOnTarget: 'shot_on_target', shotsOff: 'shot_off', offsides: 'offside', fouls: 'foul' };
const PRESSURE_WEIGHTS = { goals: 4, shotsOnTarget: 3, shots: 1.5, corners: 1.5, offsides: 0.4 };
const BUCKET_MINUTES = 3;

class Momentum {
  constructor() {
    this.buckets = new Map();
    this.level = 0;
  }

  add(minute, side, weight) {
    const b = Math.floor(minute / BUCKET_MINUTES);
    if (!this.buckets.has(b)) this.buckets.set(b, { home: 0, away: 0 });
    this.buckets.get(b)[side] += weight;
  }

  step(possessionHome) {
    // Possession only leans the needle; chances are what move it.
    const lean = possessionHome ? (possessionHome - 50) / 100 : 0;
    const latest = [...this.buckets.keys()].sort((a, b) => b - a)[0];
    const bucket = latest !== undefined ? this.buckets.get(latest) : { home: 0, away: 0 };
    const target = Math.max(-1, Math.min(1, (bucket.home - bucket.away) / 6 + lean));
    this.level = this.level * 0.7 + target * 0.3;
  }

  snapshot() {
    return {
      level: Math.round(this.level * 100) / 100,
      bucketMinutes: BUCKET_MINUTES,
      series: [...this.buckets.entries()].sort((a, b) => a[0] - b[0]).map(([b, v]) => ({
        minute: b * BUCKET_MINUTES,
        value: Math.round(Math.max(-1, Math.min(1, (v.home - v.away) / 6)) * 100) / 100,
      })),
    };
  }
}

class MatchEngine {
  constructor() {
    this.prev = null;
    this.seen = new Set();
    this.announced = { home: 0, away: 0 };
    this.pendingScorer = { home: [], away: [] };
    this.momentum = new Momentum();
  }

  // Returns { snapshot, events } where snapshot carries the momentum read-out.
  ingest(snapshot) {
    const events = this.prev ? this.diff(snapshot) : this.baseline(snapshot);
    this.momentum.step(snapshot.stats?.possession?.home);
    this.prev = snapshot;
    return { snapshot: { ...snapshot, momentum: this.momentum.snapshot() }, events };
  }

  baseline(s) {
    s.events.forEach((e) => {
      this.seen.add(e.key);
      if (isScoringEvent(e) && goalSide(e)) this.momentum.add(e.minute, goalSide(e), PRESSURE_WEIGHTS.goals);
    });
    this.announced = { home: s.home.score, away: s.away.score };
    return [];
  }

  diff(s) {
    const out = [];
    const fresh = s.events.filter((e) => !this.seen.has(e.key));
    fresh.forEach((e) => this.seen.add(e.key));

    SIDES.forEach((side) => {
      this.diffGoals(s, side, fresh, out);
      const before = this.prev[side].score;
      if (s[side].score < before) {
        out.push({ type: 'goal_cancelled', side, team: s[side].name, score: this.scoreOf(s) });
        this.announced[side] = s[side].score;
        this.pendingScorer[side] = [];
      }
    });

    fresh.forEach((e) => {
      if (e.shootout) {
        out.push({ type: 'shootout_kick', side: e.side, player: displayName(e.player), scored: e.kind === 'penalty', team: s[e.side]?.name });
      } else if (e.kind === 'yellow' || e.kind === 'red') {
        out.push({ type: 'card', card: e.kind, side: e.side, player: displayName(e.player), team: s[e.side]?.name, minute: e.minute });
      } else if (e.kind === 'sub') {
        out.push({ type: 'sub', side: e.side, playerOut: displayName(e.player), playerIn: displayName(e.assist), team: s[e.side]?.name, minute: e.minute });
      } else if (e.kind === 'var') {
        out.push({ type: 'var', side: e.side, detail: e.detail, player: displayName(e.player), team: s[e.side]?.name, minute: e.minute });
      } else if (e.kind === 'missedpen') {
        out.push({ type: 'missed_penalty', side: e.side, player: displayName(e.player), team: s[e.side]?.name, minute: e.minute });
      }
    });

    this.diffStats(s, out);

    if (s.phase !== this.prev.phase) out.push({ type: 'phase', phase: s.phase, from: this.prev.phase, score: this.scoreOf(s) });
    return out;
  }

  // The score and the goal event often arrive on different polls, in either order.
  diffGoals(s, side, fresh, out) {
    const allGoals = s.events.filter((e) => isScoringEvent(e) && goalSide(e) === side);
    fresh.filter((e) => isScoringEvent(e) && goalSide(e) === side).forEach((e) => {
      const goal = {
        side,
        team: s[side].name,
        player: displayName(e.player),
        assist: displayName(e.assist),
        minute: e.minute,
        extra: e.extra,
        kind: e.kind,
        score: this.scoreOf(s),
      };
      const pendingId = this.pendingScorer[side].shift();
      if (pendingId) {
        out.push({ ...goal, type: 'goal_resolved', goalId: pendingId });
      } else if (allGoals.length > this.announced[side]) {
        this.announced[side] += 1;
        out.push({ ...goal, type: 'goal', goalId: e.key });
        this.momentum.add(e.minute, side, PRESSURE_WEIGHTS.goals);
      }
      // Otherwise the feed re-timed a goal we already celebrated: stay quiet.
    });
    while (s[side].score > this.announced[side]) {
      this.announced[side] += 1;
      const goalId = `pending-${side}-${this.announced[side]}`;
      this.pendingScorer[side].push(goalId);
      out.push({ type: 'goal', goalId, side, team: s[side].name, player: '', assist: '', minute: s.minute, extra: null, kind: 'goal', score: this.scoreOf(s) });
      this.momentum.add(s.minute, side, PRESSURE_WEIGHTS.goals);
    }
  }

  // API-Football has no event for corners or shots, but its match totals move
  // when one happens, so the radar and pressure index read them from the deltas.
  diffStats(s, out) {
    const before = this.prev.stats;
    const now = s.stats;
    if (!before || !now) return;
    SIDES.forEach((side) => {
      Object.entries(STAT_EVENTS).forEach(([stat, type]) => {
        const delta = (now[stat]?.[side] ?? 0) - (before[stat]?.[side] ?? 0);
        if (delta > 0) out.push({ type, side, derived: true, count: delta, minute: s.minute });
      });
      Object.entries(PRESSURE_WEIGHTS).forEach(([stat, weight]) => {
        if (stat === 'goals') return;
        const delta = (now[stat]?.[side] ?? 0) - (before[stat]?.[side] ?? 0);
        if (delta > 0) this.momentum.add(s.minute, side, weight * delta);
      });
    });
  }

  scoreOf(s) {
    return { home: s.home.score, away: s.away.score };
  }
}

module.exports = { MatchEngine, Momentum };
