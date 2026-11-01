const test = require('node:test');
const assert = require('node:assert');
const { normalizeFixture, normalizeStandings, normalizeBracket, displayName, shortName, filterLiveMatches, normalizeFixtureRow } = require('../server/domain/normalize');
const { MatchEngine } = require('../server/domain/engine');
const { DelayLine } = require('../server/domain/delayLine');
const { nextPollSeconds } = require('../server/domain/budget');
const { SimulatorProvider } = require('../server/providers/simulator');

const HOME = 1;
const AWAY = 2;

function raw({ short = '2H', elapsed = 60, home = 0, away = 0, events = [], statistics = [], periods = {} } = {}) {
  return {
    fixture: { id: 7, status: { short, elapsed }, periods },
    league: { id: 61, name: 'L', season: 2026, round: 'R' },
    teams: { home: { id: HOME, name: 'Home FC' }, away: { id: AWAY, name: 'Away FC' } },
    goals: { home, away },
    score: {},
    events,
    statistics,
  };
}
const goal = (team, name, minute, detail = 'Normal Goal', comments = null) => ({
  time: { elapsed: minute, extra: null }, team: { id: team }, player: { id: name.length, name }, assist: {}, type: 'Goal', detail, comments,
});
const card = (team, name, minute, detail = 'Yellow Card') => ({
  time: { elapsed: minute }, team: { id: team }, player: { id: name.length + 100, name }, assist: {}, type: 'Card', detail,
});
const statsBlock = (team, corners, onTarget) => ({
  team: { id: team },
  statistics: [{ type: 'Corner Kicks', value: corners }, { type: 'Shots on Goal', value: onTarget }, { type: 'Ball Possession', value: '50%' }],
});
const typesOf = (events) => events.map((e) => e.type);

function feed(engine, ...snapshots) {
  return snapshots.map((s) => engine.ingest(normalizeFixture(s)).events);
}

test('joining a match in progress replays nothing', () => {
  const [events] = feed(new MatchEngine(), raw({ home: 2, away: 1, events: [goal(HOME, 'A One', 10), goal(HOME, 'B Two', 20), goal(AWAY, 'C Three', 30), card(AWAY, 'D Four', 31)] }));
  assert.deepStrictEqual(events, []);
});

test('goal with its event is announced once with the scorer', () => {
  const [, events, again] = feed(new MatchEngine(), raw(), raw({ home: 1, events: [goal(HOME, 'K. De Bruyne', 61)] }), raw({ home: 1, events: [goal(HOME, 'K. De Bruyne', 61)] }));
  assert.deepStrictEqual(typesOf(events), ['goal']);
  assert.strictEqual(events[0].player, 'De Bruyne');
  assert.deepStrictEqual(again, []);
});

test('score that lands before the event is announced, then the scorer is filled in', () => {
  const [, first, second] = feed(new MatchEngine(), raw(), raw({ home: 1 }), raw({ home: 1, events: [goal(HOME, 'Late Name', 61)] }));
  assert.deepStrictEqual(typesOf(first), ['goal']);
  assert.strictEqual(first[0].player, '');
  assert.deepStrictEqual(typesOf(second), ['goal_resolved']);
  assert.strictEqual(second[0].goalId, first[0].goalId);
  assert.strictEqual(second[0].player, 'Name');
});

test('event that lands before the score is not celebrated twice', () => {
  const [, first, second] = feed(new MatchEngine(), raw(), raw({ events: [goal(HOME, 'Early Bird', 61)] }), raw({ home: 1, events: [goal(HOME, 'Early Bird', 61)] }));
  assert.deepStrictEqual(typesOf(first), ['goal']);
  assert.deepStrictEqual(second, []);
});

test('a re-timed goal event does not celebrate again', () => {
  const [, , events] = feed(new MatchEngine(), raw(), raw({ home: 1, events: [goal(HOME, 'Same Guy', 61)] }), raw({ home: 1, events: [goal(HOME, 'Same Guy', 62)] }));
  assert.deepStrictEqual(events, []);
});

test('a goal struck off by VAR is reported and a replacement goal still counts', () => {
  const [, , cancelled, next] = feed(new MatchEngine(), raw(), raw({ away: 1, events: [goal(AWAY, 'Off Side', 70)] }), raw({ away: 0 }), raw({ away: 1, events: [goal(AWAY, 'On Side', 80)] }));
  assert.deepStrictEqual(typesOf(cancelled), ['goal_cancelled']);
  assert.deepStrictEqual(typesOf(next), ['goal']);
});

test('shootout kicks do not count as goals or scorers', () => {
  const shootout = [goal(HOME, 'Pen One', 120, 'Penalty', 'Penalty Shootout'), goal(AWAY, 'Pen Two', 120, 'Missed Penalty', 'Penalty Shootout')];
  const inMatch = goal(HOME, 'Spot Kick', 50, 'Penalty');
  const s = normalizeFixture(raw({ short: 'P', elapsed: 120, home: 1, events: [inMatch, ...shootout] }));
  assert.deepStrictEqual(s.shootout.home.map((k) => k.result), ['scored']);
  assert.deepStrictEqual(s.shootout.away.map((k) => k.result), ['missed']);
  assert.deepStrictEqual(s.home.scorers.map((x) => x.name), ['Kick']);
  const [, events] = feed(new MatchEngine(), raw({ short: 'P', elapsed: 120, home: 1, events: [inMatch] }), raw({ short: 'P', elapsed: 120, home: 1, events: [inMatch, ...shootout] }));
  assert.deepStrictEqual(typesOf(events), ['shootout_kick', 'shootout_kick']);
});

test('shootout kicks leave no goal or miss marks on the lineup', async () => {
  let now = 0;
  const sim = new SimulatorProvider(60, () => now);
  await sim.fixture(1002);
  now = 240000;
  const s = normalizeFixture(await sim.fixture(1002), now);
  const marks = [...s.lineups.home.rows.flat(), ...s.lineups.away.rows.flat()].flatMap((p) => p.events);
  assert.ok(!marks.includes('penalty') && !marks.includes('missedpen'), marks.join());
  assert.ok(s.shootout.home.length === 5);
});

test('an own goal is credited to whichever side the score says', () => {
  const filedUnderDefender = normalizeFixture(raw({ away: 1, events: [goal(HOME, 'Un Lucky', 40, 'Own Goal')] }));
  assert.strictEqual(filedUnderDefender.away.scorers.length, 1);
  assert.strictEqual(filedUnderDefender.home.scorers.length, 0);
  const filedUnderBeneficiary = normalizeFixture(raw({ away: 1, events: [goal(AWAY, 'Un Lucky', 40, 'Own Goal')] }));
  assert.strictEqual(filedUnderBeneficiary.away.scorers.length, 1);
});

test('corners and shots are read from the statistics deltas', () => {
  const [, events] = feed(new MatchEngine(),
    raw({ statistics: [statsBlock(HOME, 1, 0), statsBlock(AWAY, 0, 0)] }),
    raw({ statistics: [statsBlock(HOME, 2, 1), statsBlock(AWAY, 0, 0)] }));
  assert.deepStrictEqual(typesOf(events).sort(), ['corner', 'shot_on_target']);
  assert.ok(events.every((e) => e.derived && e.side === 'home'));
});

test('pressure leans toward the side creating chances', () => {
  const engine = new MatchEngine();
  engine.ingest(normalizeFixture(raw({ statistics: [statsBlock(HOME, 0, 0), statsBlock(AWAY, 0, 0)] })));
  const { snapshot } = engine.ingest(normalizeFixture(raw({ statistics: [statsBlock(HOME, 3, 2), statsBlock(AWAY, 0, 0)] })));
  assert.ok(snapshot.momentum.level > 0);
  assert.ok(snapshot.momentum.series.length > 0);
});

test('phase changes are reported', () => {
  const [, events] = feed(new MatchEngine(), raw({ short: '1H', elapsed: 45 }), raw({ short: 'HT', elapsed: 45 }));
  assert.deepStrictEqual(events.map((e) => e.phase), ['halftime']);
});

test('clock uses the kick-off timestamp, and falls back to the elapsed minute when it disagrees', () => {
  const now = 1_000_000_000_000;
  const kickoff = now / 1000 - 600 - 17;
  assert.strictEqual(normalizeFixture(raw({ short: '1H', elapsed: 10, periods: { first: kickoff } }), now).clock.seconds, 617);
  assert.strictEqual(normalizeFixture(raw({ short: '1H', elapsed: 10, periods: { first: kickoff - 3600 } }), now).clock.seconds, 600);
  const ht = normalizeFixture(raw({ short: 'HT', elapsed: 45 }), now).clock;
  assert.strictEqual(ht.running, false);
});

test('delay line holds items until the broadcast catches up', () => {
  const line = new DelayLine(30000);
  line.push('frame', 'a', 1000);
  assert.deepStrictEqual(line.release(30999), []);
  assert.deepStrictEqual(line.release(31000).map((i) => i.data), ['a']);
});

test('lowering the delay releases fresh data but drops long-past celebrations', () => {
  const line = new DelayLine(60000);
  line.push('event', 'old-goal', 0);
  line.push('frame', 'old-frame', 0);
  line.push('event', 'recent-card', 45000);
  line.setDelay(0);
  const released = line.release(50000).map((i) => i.data);
  assert.deepStrictEqual(released, ['old-frame', 'recent-card']);
});

test('polling pace stretches a small quota across the match', () => {
  assert.strictEqual(nextPollSeconds({ phase: 'ended' }), null);
  assert.strictEqual(nextPollSeconds({ phase: 'first', minute: 0, remaining: 100000 }), 15);
  const tight = nextPollSeconds({ phase: 'first', minute: 0, remaining: 100 });
  assert.ok(tight >= 60 && tight <= 120, `got ${tight}`);
  assert.strictEqual(nextPollSeconds({ phase: 'second', minute: 60, remaining: 0 }), 300);
  assert.strictEqual(nextPollSeconds({ phase: 'second', minute: 60, remaining: null }), 30);
});

test('names read well on air', () => {
  assert.strictEqual(displayName('K. De Bruyne'), 'De Bruyne');
  assert.strictEqual(displayName('Lionel Messi'), 'Messi');
  assert.strictEqual(displayName('Neymar'), 'Neymar');
  assert.strictEqual(shortName('Paris Saint Germain'), 'PSG');
  assert.strictEqual(shortName('FC Nantes'), 'NAN');
});

test('standings pick the tracked team group and keep the team visible', () => {
  const row = (rank, id) => ({ rank, team: { id, name: `T${id}` }, points: 40 - rank, goalsDiff: 0, all: { played: 10 } });
  const groupA = Array.from({ length: 6 }, (_, i) => row(i + 1, 100 + i));
  const groupB = Array.from({ length: 20 }, (_, i) => row(i + 1, 200 + i));
  const t = normalizeStandings([{ league: { name: 'L', standings: [groupA, groupB] } }], [219]);
  assert.strictEqual(t.table.length, 14);
  assert.ok(t.table.some((r) => r.teamId === 219 && r.tracked));
});

test('bracket gives no winner while a two-legged tie is unfinished', () => {
  const a = { id: 1, name: 'A' };
  const b = { id: 2, name: 'B' };
  const leg = (home, away, gh, ga, short, hw = null, aw = null) => ({
    fixture: { status: { short } }, league: { round: 'Quarter-finals' },
    teams: { home: { ...home, winner: hw }, away: { ...away, winner: aw } }, goals: { home: gh, away: ga },
  });
  const open = normalizeBracket([leg(a, b, 3, 0, 'FT', true, false), leg(b, a, null, null, 'NS')]);
  assert.strictEqual(open.rounds[0].ties[0].winner, null);
  assert.strictEqual(open.rounds[0].ties[0].home.score, 3);
  const done = normalizeBracket([leg(a, b, 3, 0, 'FT', true, false), leg(b, a, 1, 0, 'FT', true, false)]);
  assert.strictEqual(done.rounds[0].ties[0].winner, 'home');
  assert.strictEqual(done.rounds[0].ties[0].away.score, 1);
});

test('other matches leave out reserve sides and unfollowed leagues', () => {
  const row = (id, league, home, away) => normalizeFixtureRow({
    fixture: { id, status: { short: '1H', elapsed: 10 } }, league: { id: league }, teams: { home: { name: home }, away: { name: away } }, goals: { home: 0, away: 0 },
  });
  const kept = filterLiveMatches(
    [row(1, 39, 'Arsenal', 'Chelsea'), row(2, 39, 'Arsenal W', 'Chelsea W'), row(3, 500, 'Smalltown', 'Roma'), row(4, 500, 'Smalltown', 'Otherville'), row(5, 39, 'Everton', 'Fulham')],
    { excludeId: 5, leagueIds: [39], followedTeams: ['Roma'] },
  );
  assert.deepStrictEqual(kept.map((m) => m.fixtureId), [1, 3]);
});

test('malicious image URLs from the feed are dropped', () => {
  const s = normalizeFixture({ ...raw(), teams: { home: { id: 1, name: 'H', logo: 'javascript:alert(1)' }, away: { id: 2, name: 'A', logo: 'https://x/y.png' } } });
  assert.strictEqual(s.home.logo, '');
  assert.strictEqual(s.away.logo, 'https://x/y.png');
});

test('a full rehearsal match plays out with the right score story', async () => {
  let now = 0;
  const sim = new SimulatorProvider(60, () => now);
  const engine = new MatchEngine();
  const seen = [];
  let last;
  for (now = 0; now < 130000; now += 2000) {
    const { snapshot, events } = engine.ingest(normalizeFixture(await sim.fixture(1001), now));
    seen.push(...events);
    last = snapshot;
  }
  const goals = seen.filter((e) => e.type === 'goal');
  assert.deepStrictEqual(goals.map((g) => g.player), ['Valdez', 'Cruz', 'Adeyemi', 'Sato', 'Sorensen']);
  assert.strictEqual(seen.filter((e) => e.type === 'goal_cancelled').length, 1);
  assert.strictEqual(last.home.score, 3);
  assert.strictEqual(last.away.score, 1);
  assert.strictEqual(last.phase, 'ended');
  assert.deepStrictEqual(seen.filter((e) => e.type === 'phase').map((e) => e.phase), ['first', 'halftime', 'second', 'ended']);
  assert.ok(last.lineups.home.rows.flat().some((p) => p.subbedOn));
});

test('a rehearsal cup tie ends in a shootout that matches the published score', async () => {
  let now = 0;
  const sim = new SimulatorProvider(60, () => now);
  const engine = new MatchEngine();
  const seen = [];
  let last;
  for (now = 0; now < 240000; now += 1000) {
    const { snapshot, events } = engine.ingest(normalizeFixture(await sim.fixture(1002), now));
    seen.push(...events);
    last = snapshot;
  }
  assert.strictEqual(last.statusShort, 'PEN');
  assert.strictEqual(last.home.score, 1);
  assert.strictEqual(last.away.score, 1);
  assert.strictEqual(last.shootout.home.filter((k) => k.result === 'scored').length, last.penalties.home);
  assert.strictEqual(last.shootout.away.filter((k) => k.result === 'scored').length, last.penalties.away);
  assert.strictEqual(seen.filter((e) => e.type === 'shootout_kick').length, 10);
});
