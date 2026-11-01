// A scripted match that produces raw API-Football shaped payloads, so rehearsals,
// demos and tests run through exactly the code a real match does. Clubs are fictional.

const crest = (letters, bg, fg = '#fff') => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 72"><path d="M4 6 32 1l28 5v30c0 17-13 28-28 35C17 64 4 53 4 36z" fill="${bg}" stroke="${fg}" stroke-width="3"/><text x="32" y="44" font-size="22" text-anchor="middle" fill="${fg}" font-family="Arial,sans-serif" font-weight="700">${letters}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const squad = (idBase, names) => names.map((name, i) => ({ id: idBase + i, name, number: i + 1 }));

const HARBOUR = {
  id: 9001, name: 'Harbour City', logo: crest('HC', '#14406b'), primary: '14406b', number: 'ffffff', coach: 'I. Marchetti',
  players: squad(9100, ['T. Okafor', 'L. Brandt', 'S. Moreau', 'D. Ferreira', 'A. Lindqvist', 'R. Castellan', 'J. Mbaye', 'N. Sorensen', 'E. Valdez', 'K. Adeyemi', 'M. Rossi']),
  bench: squad(9130, ['P. Novak', 'G. Tanaka', 'B. Haddad']).map((p, i) => ({ ...p, number: 12 + i })),
};
const REDBRIDGE = {
  id: 9002, name: 'Redbridge Athletic', logo: crest('RA', '#a3202c'), primary: 'a3202c', number: 'ffffff', coach: 'C. Duarte',
  players: squad(9200, ['V. Petrov', 'H. Silva', 'O. Dubois', 'F. Keller', 'Y. Benali', 'Z. Horvat', 'C. Nwosu', 'I. Larsen', 'W. Cruz', 'T. Sato', 'A. Laurent']),
  bench: squad(9230, ['D. Rizzo', 'L. Osei', 'J. Weber']).map((p, i) => ({ ...p, number: 12 + i })),
};
const LEAGUE = { id: 61001, name: 'Coastal Premier', country: 'Rehearsal', logo: crest('CP', '#1b6b4a'), season: 2026, round: 'Matchday 12' };
const CUP = { id: 61002, name: 'Coastal Cup', country: 'Rehearsal', logo: crest('CC', '#7a5a12'), season: 2026, round: 'Semi-finals' };

const OTHER_CLUBS = [
  ['Northgate', 'Kingsmere', '#2c6e49', '#6a2c70'], ['Eastvale', 'Port Sable', '#b5651d', '#1f7a8c'],
  ['Stonebury', 'Larkfield', '#444f5a', '#c44536'], ['Westmoor', 'Ashford Town', '#3d348b', '#e07a5f'],
];

const ev = (minute, type, detail, team, player, assist, extra = null, comments = null) => ({ minute, type, detail, team, player, assist, extra, comments });

// Each entry fires once the match clock passes `minute`.
const LEAGUE_SCRIPT = [
  ev(12, 'Card', 'Yellow Card', HARBOUR, 2),
  ev(23, 'Goal', 'Normal Goal', HARBOUR, 9, 7),
  ev(38, 'Card', 'Yellow Card', REDBRIDGE, 5),
  ev(44, 'Goal', 'Normal Goal', REDBRIDGE, 9, 10),
  ev(58, 'subst', 'Substitution 1', REDBRIDGE, 8, { bench: 0 }),
  ev(64, 'Goal', 'Penalty', HARBOUR, 10, null),
  ev(71, 'subst', 'Substitution 1', HARBOUR, 7, { bench: 1 }),
  ev(76, 'Goal', 'Normal Goal', REDBRIDGE, 10, null),
  ev(79, 'Var', 'Goal cancelled', REDBRIDGE, 10, null),
  ev(83, 'Card', 'Red Card', REDBRIDGE, 3),
  ev(90, 'Goal', 'Normal Goal', HARBOUR, 8, 9, 2),
];
// The goal at 76' is struck off by VAR at 79': the score really goes back down.
const CANCELLED = { minute: 76, by: 79 };

const CUP_SCRIPT = [
  ev(31, 'Goal', 'Normal Goal', REDBRIDGE, 9, null),
  ev(68, 'Goal', 'Own Goal', REDBRIDGE, 4, null),
  ...[[HARBOUR, 10, 'Penalty'], [REDBRIDGE, 9, 'Penalty'], [HARBOUR, 9, 'Penalty'], [REDBRIDGE, 10, 'Missed Penalty'],
    [HARBOUR, 8, 'Missed Penalty'], [REDBRIDGE, 7, 'Penalty'], [HARBOUR, 7, 'Penalty'], [REDBRIDGE, 6, 'Penalty'],
    [HARBOUR, 6, 'Penalty'], [REDBRIDGE, 5, 'Missed Penalty']]
    .map(([team, p, d], i) => ({ ...ev(120, 'Goal', d, team, p, null, null, 'Penalty Shootout'), shootoutIndex: i })),
];

const SCENARIOS = {
  1001: { league: LEAGUE, script: LEAGUE_SCRIPT, shootout: false, label: 'League match with a VAR reversal' },
  1002: { league: CUP, script: CUP_SCRIPT, shootout: true, label: 'Cup tie decided on penalties' },
};

const SECONDS = {
  preEnd: 20, // match seconds before kick-off, so the countdown is visible
  htLength: 300,
  etBreak: 120,
};

// Deterministic per-minute statistics: same match every rehearsal.
function statAt(minute, seed, rate) {
  let total = 0;
  for (let m = 1; m <= minute; m += 1) {
    const v = Math.sin(m * 12.9898 + seed * 78.233) * 43758.5453;
    if (v - Math.floor(v) < rate) total += 1;
  }
  return total;
}

class SimulatorProvider {
  constructor(speed = 20, now = () => Date.now()) {
    this.now = now;
    this.speed = speed;
    this.starts = new Map();
    this.id = 'sim';
    this.quota = { limit: null, remaining: null, updatedAt: null };
  }

  get configured() {
    return true;
  }

  get rate() {
    return this.speed;
  }

  setSpeed(speed) {
    // Rebase running matches so the clock does not jump when the speed changes.
    this.starts.forEach((start, id) => {
      const virtual = (this.now() - start) * this.speed;
      this.starts.set(id, this.now() - virtual / speed);
    });
    this.speed = speed;
  }

  restart(id) {
    this.starts.set(Number(id), this.now());
  }

  matchSeconds(id) {
    if (!this.starts.has(id)) this.starts.set(id, this.now());
    return ((this.now() - this.starts.get(id)) / 1000) * this.speed;
  }

  // Where the match stands, given how long the simulation has been running.
  position(id, scenario) {
    let t = this.matchSeconds(id) - SECONDS.preEnd * this.speed;
    if (t < 0) return { short: 'NS', elapsed: null, clock: 0 };
    if (t < 2820) return { short: '1H', elapsed: Math.min(45, Math.floor(t / 60)), extra: t > 2700 ? 2 : null, clock: t };
    t -= 2820;
    if (t < SECONDS.htLength) return { short: 'HT', elapsed: 45, clock: 2700 };
    t -= SECONDS.htLength;
    if (t < 3000) return { short: '2H', elapsed: Math.min(90, 45 + Math.floor(t / 60)), extra: t > 2700 ? 5 : null, clock: 2700 + t };
    t -= 3000;
    if (!scenario.shootout) return { short: 'FT', elapsed: 90, clock: 5700 };
    if (t < SECONDS.etBreak) return { short: 'BT', elapsed: 90, clock: 5700 };
    t -= SECONDS.etBreak;
    if (t < 1800) return { short: 'ET', elapsed: 90 + Math.floor(t / 60), clock: 5700 + t, shown: 5400 + t };
    t -= 1800;
    const kicks = Math.floor(t / 90);
    if (kicks < 10) return { short: 'P', elapsed: 120, clock: 7200, kicks };
    return { short: 'PEN', elapsed: 120, clock: 7200, kicks: 10 };
  }

  buildFixture(id) {
    const scenario = SCENARIOS[id];
    if (!scenario) throw new Error(`Rehearsal fixture ${id} does not exist`);
    const pos = this.position(id, scenario);
    const clockMinute = pos.clock / 60;
    const fired = scenario.script.filter((e) => {
      if (e.shootoutIndex !== undefined) return pos.kicks !== undefined && e.shootoutIndex < pos.kicks;
      const at = e.minute + (e.extra || 0);
      return clockMinute >= at && pos.short !== 'NS';
    }).filter((e) => {
      const struckOff = scenario === SCENARIOS[1001] && e.type === 'Goal' && e.minute === CANCELLED.minute && clockMinute >= CANCELLED.by;
      return !struckOff;
    });
    const events = fired.map((e) => this.rawEvent(e));

    const goals = { home: 0, away: 0 };
    fired.filter((e) => e.type === 'Goal' && e.shootoutIndex === undefined && e.detail !== 'Missed Penalty').forEach((e) => {
      const isHome = e.team === HARBOUR;
      const credited = e.detail === 'Own Goal' ? !isHome : isHome;
      goals[credited ? 'home' : 'away'] += 1;
    });
    const pens = { home: 0, away: 0 };
    fired.filter((e) => e.shootoutIndex !== undefined && e.detail === 'Penalty').forEach((e) => {
      pens[e.team === HARBOUR ? 'home' : 'away'] += 1;
    });

    const nowSec = Math.floor(this.now() / 1000);
    const started = pos.short !== 'NS';
    return {
      fixture: {
        id,
        timestamp: nowSec + (started ? 0 : Math.ceil((SECONDS.preEnd - this.matchSeconds(id) / this.speed))),
        referee: 'A. Whitfield',
        venue: { name: 'Quayside Ground', city: 'Harbour City' },
        status: { short: pos.short, elapsed: pos.elapsed, extra: pos.extra ?? null },
        periods: { first: null, second: null },
        simulated: { seconds: pos.shown ?? pos.clock, rate: this.speed },
      },
      league: scenario.league,
      teams: {
        home: { id: HARBOUR.id, name: HARBOUR.name, logo: HARBOUR.logo, winner: pos.short === 'PEN' ? pens.home > pens.away : null },
        away: { id: REDBRIDGE.id, name: REDBRIDGE.name, logo: REDBRIDGE.logo, winner: pos.short === 'PEN' ? pens.away > pens.home : null },
      },
      goals: { home: started ? goals.home : null, away: started ? goals.away : null },
      score: { penalty: { home: pos.kicks ? pens.home : null, away: pos.kicks ? pens.away : null } },
      events,
      lineups: [this.rawLineup(HARBOUR, '4-3-3'), this.rawLineup(REDBRIDGE, '4-2-3-1')],
      statistics: started ? this.rawStats(Math.min(120, Math.floor(clockMinute)), fired) : [],
      players: started ? [this.rawPlayers(HARBOUR, 1, fired), this.rawPlayers(REDBRIDGE, 2, fired)] : [],
    };
  }

  rawEvent(e) {
    const player = e.team.players[e.player - 1];
    let assist = null;
    if (e.assist && typeof e.assist === 'object') assist = e.team.bench[e.assist.bench];
    else if (e.assist) assist = e.team.players[e.assist - 1];
    return {
      time: { elapsed: e.minute, extra: e.extra },
      team: { id: e.team.id, name: e.team.name, logo: e.team.logo },
      player: { id: player.id, name: player.name },
      assist: { id: assist?.id ?? null, name: assist?.name ?? null },
      type: e.type,
      detail: e.detail,
      comments: e.comments,
    };
  }

  rawLineup(club, formation) {
    const layout = formation === '4-3-3' ? [1, 4, 3, 3] : [1, 4, 2, 3, 1];
    let index = 0;
    const startXI = [];
    layout.forEach((count, row) => {
      for (let col = 1; col <= count; col += 1) {
        const p = club.players[index];
        startXI.push({ player: { id: p.id, name: p.name, number: p.number, pos: row === 0 ? 'G' : 'M', grid: `${row + 1}:${col}` } });
        index += 1;
      }
    });
    return {
      team: { id: club.id, name: club.name, logo: club.logo, colors: { player: { primary: club.primary, number: club.number } } },
      coach: { name: club.coach },
      formation,
      startXI,
      substitutes: club.bench.map((p) => ({ player: { id: p.id, name: p.name, number: p.number, pos: 'M', grid: null } })),
    };
  }

  rawStats(minute, fired = []) {
    const yellows = (club) => fired.filter((e) => e.type === 'Card' && e.detail === 'Yellow Card' && e.team === club).length;
    const block = (club, seed, onTarget, off, corners, offsides, fouls, saves, possession, xg) => ({
      team: { id: club.id, name: club.name, logo: club.logo },
      statistics: [
        { type: 'Ball Possession', value: `${possession}%` },
        { type: 'Total Shots', value: onTarget + off },
        { type: 'Shots on Goal', value: onTarget },
        { type: 'Shots off Goal', value: off },
        { type: 'Corner Kicks', value: corners },
        { type: 'Offsides', value: offsides },
        { type: 'Fouls', value: fouls },
        { type: 'Goalkeeper Saves', value: saves },
        { type: 'Yellow Cards', value: yellows(club) },
        { type: 'Passes %', value: `${78 + (seed % 9)}%` },
        { type: 'Total passes', value: Math.round(minute * (5 + seed)) },
        { type: 'expected_goals', value: xg.toFixed(2) },
      ],
    });
    const possessionHome = Math.round(54 + 8 * Math.sin(minute / 11));
    const hOn = statAt(minute, 1, 0.07);
    const aOn = statAt(minute, 2, 0.05);
    return [
      block(HARBOUR, 2, hOn, statAt(minute, 3, 0.09), statAt(minute, 4, 0.08), statAt(minute, 5, 0.03), statAt(minute, 6, 0.14), aOn, possessionHome, hOn * 0.27),
      block(REDBRIDGE, 1, aOn, statAt(minute, 7, 0.07), statAt(minute, 8, 0.06), statAt(minute, 9, 0.03), statAt(minute, 10, 0.17), hOn, 100 - possessionHome, aOn * 0.31),
    ];
  }

  rawPlayers(club, seed, fired) {
    const rating = (p, i) => {
      const scored = fired.filter((e) => e.type === 'Goal' && e.team === club && club.players[e.player - 1] === p).length;
      return (6.4 + ((i * 7 + seed * 3) % 11) / 10 + scored * 1.1).toFixed(1);
    };
    return {
      team: { id: club.id },
      players: club.players.map((p, i) => ({
        player: { id: p.id, name: p.name, photo: null },
        statistics: [{ games: { minutes: 45, number: p.number, rating: rating(p, i), captain: i === (seed === 1 ? 3 : 5) } }],
      })),
    };
  }

  async fixture(id) {
    return this.buildFixture(Number(id));
  }

  async fixturesByDate() {
    const row = (id) => {
      const raw = this.buildFixture(id);
      return { ...raw, events: undefined, lineups: undefined, statistics: undefined, players: undefined };
    };
    return [row(1001), row(1002)];
  }

  async liveFixtures() {
    const minute = Math.floor(this.matchSeconds(0) / 60) % 90;
    return OTHER_CLUBS.map(([home, away, hc, ac], i) => {
      const elapsed = (minute + i * 17) % 90;
      return {
        fixture: { id: 2000 + i, timestamp: 0, status: { short: elapsed < 45 ? '1H' : '2H', elapsed } },
        league: LEAGUE,
        teams: { home: { id: 3000 + i * 2, name: home, logo: crest(home[0], hc) }, away: { id: 3001 + i * 2, name: away, logo: crest(away[0], ac) } },
        goals: { home: Math.floor(elapsed / (30 + i * 9)), away: Math.floor(elapsed / (44 + i * 3)) },
      };
    });
  }

  async standings() {
    const clubs = [[HARBOUR.id, HARBOUR.name, HARBOUR.logo], [REDBRIDGE.id, REDBRIDGE.name, REDBRIDGE.logo]];
    OTHER_CLUBS.forEach(([h, a, hc, ac], i) => {
      clubs.push([3000 + i * 2, h, crest(h[0], hc)], [3001 + i * 2, a, crest(a[0], ac)]);
    });
    const order = [2, 0, 3, 4, 1, 5, 6, 7, 8, 9];
    return [{
      league: {
        name: LEAGUE.name,
        logo: LEAGUE.logo,
        standings: [order.map((idx, rank) => ({
          rank: rank + 1,
          team: { id: clubs[idx][0], name: clubs[idx][1], logo: clubs[idx][2] },
          points: 27 - rank * 2,
          goalsDiff: 14 - rank * 3,
          all: { played: 11 },
        }))],
      },
    }];
  }

  async leagueFixtures() {
    const tie = (a, b, round, ga, gb, ended = true) => ({
      fixture: { id: Math.random(), status: { short: ended ? 'FT' : 'NS' } },
      league: { round },
      teams: { home: { ...a, winner: ended ? ga > gb : null }, away: { ...b, winner: ended ? gb > ga : null } },
      goals: { home: ended ? ga : null, away: ended ? gb : null },
    });
    const t = (name, id, color) => ({ id, name, logo: crest(name[0], color) });
    const c = [t('Northgate', 1, '#2c6e49'), t('Kingsmere', 2, '#6a2c70'), t('Eastvale', 3, '#b5651d'), t('Port Sable', 4, '#1f7a8c')];
    const h = { id: HARBOUR.id, name: HARBOUR.name, logo: HARBOUR.logo };
    const r = { id: REDBRIDGE.id, name: REDBRIDGE.name, logo: REDBRIDGE.logo };
    return [
      tie(h, c[0], 'Quarter-finals', 2, 0), tie(c[1], r, 'Quarter-finals', 1, 3),
      tie(c[2], c[3], 'Quarter-finals', 1, 2), tie(t('Stonebury', 5, '#444f5a'), t('Larkfield', 6, '#c44536'), 'Quarter-finals', 0, 1),
      tie(h, r, 'Semi-finals', 0, 0, false),
      tie(c[3], t('Larkfield', 6, '#c44536'), 'Semi-finals', 2, 1),
    ];
  }
}

module.exports = { SimulatorProvider, SCENARIOS, HARBOUR, REDBRIDGE };
