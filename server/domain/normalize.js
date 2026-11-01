// Turns raw API-Football v3 payloads into the shapes the rest of the app uses.
// Pure functions only, so the simulator and the real feed share this path.

const PHASES = {
  TBD: 'pre', NS: 'pre',
  '1H': 'first', HT: 'halftime', '2H': 'second',
  ET: 'extra', BT: 'break', P: 'shootout',
  FT: 'ended', AET: 'ended', PEN: 'ended',
  LIVE: 'second',
};
const RUNNING_PHASES = new Set(['first', 'second', 'extra']);

const SHORT_NAMES = {
  'Paris Saint Germain': 'PSG', 'Manchester City': 'MCI', 'Manchester United': 'MUN',
  'Real Madrid': 'RMA', 'Atletico Madrid': 'ATM', 'Bayern Munich': 'BAY',
  'Borussia Dortmund': 'BVB', 'Bayer Leverkusen': 'LEV', 'AC Milan': 'MIL', Inter: 'INT',
  'Aston Villa': 'AVL', 'Athletic Club': 'ATH', 'Sporting CP': 'SCP',
};
const NAME_NOISE = /^(fc|ac|as|ss|sc|rc|cf|afc|cd|ud|sl|vfb|vfl|tsg|ogc|1\.)$/i;

function shortName(name = '') {
  if (SHORT_NAMES[name]) return SHORT_NAMES[name];
  const words = name.split(/\s+/).filter((w) => w && !NAME_NOISE.test(w));
  if (words.length >= 3) return words.slice(0, 3).map((w) => w[0]).join('').toUpperCase();
  return (words[0] || name).slice(0, 3).toUpperCase();
}

// "K. De Bruyne" -> "De Bruyne", "Lionel Messi" -> "Messi"
function displayName(name = '') {
  const parts = name.trim().split(/\s+/);
  while (parts.length > 1 && /^[A-Z]\.$/.test(parts[0])) parts.shift();
  if (parts.length === name.trim().split(/\s+/).length && parts.length > 1) return parts[parts.length - 1];
  return parts.join(' ');
}

function safeImage(url) {
  if (typeof url !== 'string') return '';
  return /^(https:\/\/|data:image\/)/.test(url) ? url : '';
}

function sideOf(teamId, homeId, awayId) {
  if (teamId === homeId) return 'home';
  if (teamId === awayId) return 'away';
  return null;
}

function normalizeEvents(raw, homeId, awayId) {
  return (raw || []).map((e) => {
    const detail = e.detail || '';
    const elapsed = e.time?.elapsed ?? 0;
    const extra = e.time?.extra ?? null;
    let kind = null;
    if (e.type === 'Goal') {
      if (detail === 'Own Goal') kind = 'owngoal';
      else if (detail === 'Missed Penalty') kind = 'missedpen';
      else if (detail === 'Penalty') kind = 'penalty';
      else kind = 'goal';
    } else if (e.type === 'Card') {
      kind = /yellow/i.test(detail) && !/second/i.test(detail) ? 'yellow' : 'red';
    } else if (e.type === 'subst') {
      kind = 'sub';
    } else if (e.type === 'Var') {
      kind = 'var';
    }
    if (!kind) return null;
    const penaltyLike = kind === 'penalty' || kind === 'missedpen';
    return {
      key: [elapsed, extra ?? 0, e.type, e.player?.id ?? e.player?.name ?? '', e.team?.id ?? '', detail].join('|'),
      kind,
      side: sideOf(e.team?.id, homeId, awayId),
      minute: elapsed,
      extra,
      playerId: e.player?.id ?? null,
      player: e.player?.name || '',
      assistId: e.assist?.id ?? null,
      assist: e.assist?.name || '',
      detail,
      shootout: penaltyLike && (/shootout/i.test(e.comments || '') || elapsed >= 120),
    };
  }).filter(Boolean);
}

// The feed files an own goal under one of the two teams. Pick the reading that
// reconciles the event list with the official score instead of assuming.
function resolveOwnGoalSides(events, homeScore, awayScore) {
  const scored = events.filter((e) => !e.shootout && ['goal', 'penalty', 'owngoal'].includes(e.kind));
  const tally = (flip) => {
    const count = { home: 0, away: 0 };
    scored.forEach((e) => {
      const flipped = e.kind === 'owngoal' && flip;
      const side = flipped ? (e.side === 'home' ? 'away' : 'home') : e.side;
      if (side) count[side] += 1;
    });
    return count;
  };
  const straight = tally(false);
  const flip = !(straight.home === homeScore && straight.away === awayScore);
  return events.map((e) => {
    if (e.kind !== 'owngoal') return e;
    const creditedSide = flip ? (e.side === 'home' ? 'away' : 'home') : e.side;
    return { ...e, creditedSide };
  });
}

function goalSide(e) {
  return e.kind === 'owngoal' ? e.creditedSide : e.side;
}

function isScoringEvent(e) {
  return !e.shootout && ['goal', 'penalty', 'owngoal'].includes(e.kind);
}

function minuteLabel(e) {
  return e.extra ? `${e.minute}+${e.extra}'` : `${e.minute}'`;
}

function scorersFor(events, side) {
  return events.filter((e) => isScoringEvent(e) && goalSide(e) === side).map((e) => ({
    name: displayName(e.player),
    minute: minuteLabel(e),
    kind: e.kind,
  }));
}

function computeClock(fx, phase, nowMs) {
  const elapsedSeconds = (fx.status?.elapsed ?? 0) * 60;
  const running = RUNNING_PHASES.has(phase);
  if (!running) return { seconds: elapsedSeconds, running: false, rate: 1 };
  // The rehearsal feed runs faster than real time, so it states its clock directly.
  if (fx.simulated) return { seconds: Math.floor(fx.simulated.seconds), running: true, rate: fx.simulated.rate };
  const nowSec = nowMs / 1000;
  let fromPeriods = null;
  if (phase === 'first' && fx.periods?.first) fromPeriods = nowSec - fx.periods.first;
  if (phase === 'second' && fx.periods?.second) fromPeriods = 2700 + nowSec - fx.periods.second;
  // Kick-off timestamps give second precision, the elapsed minute is the safety net.
  const trusted = fromPeriods !== null && Math.abs(fromPeriods - elapsedSeconds) < 240;
  return { seconds: Math.max(0, Math.floor(trusted ? fromPeriods : elapsedSeconds)), running: true, rate: 1 };
}

const STAT_KEYS = {
  'Ball Possession': 'possession',
  'Total Shots': 'shots',
  'Shots on Goal': 'shotsOnTarget',
  'Shots off Goal': 'shotsOff',
  'Blocked Shots': 'shotsBlocked',
  'Corner Kicks': 'corners',
  Offsides: 'offsides',
  Fouls: 'fouls',
  'Yellow Cards': 'yellowCards',
  'Red Cards': 'redCards',
  'Goalkeeper Saves': 'saves',
  'Passes %': 'passAccuracy',
  'Total passes': 'passes',
  expected_goals: 'xg',
};

function statValue(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return v;
}

function normalizeStats(blocks, homeId) {
  if (!Array.isArray(blocks) || blocks.length === 0) return null;
  const stats = {};
  Object.values(STAT_KEYS).forEach((k) => { stats[k] = { home: 0, away: 0 }; });
  blocks.forEach((block) => {
    const side = block.team?.id === homeId ? 'home' : 'away';
    (block.statistics || []).forEach((s) => {
      const key = STAT_KEYS[s.type];
      if (key) stats[key][side] = statValue(s.value);
    });
  });
  return stats;
}

function normalizeLineupSide(block, events, playerInfo) {
  if (!block) return null;
  const teamId = block.team?.id;
  const info = (id) => playerInfo.get(id) || {};
  const inMatch = events.filter((e) => e.kind !== 'sub' && !e.shootout);
  const eventsFor = (id) => inMatch.filter((e) => e.playerId === id).map((e) => e.kind)
    .concat(inMatch.some((e) => e.assistId === id) ? ['assist'] : []);

  const rowMap = new Map();
  (block.startXI || []).forEach(({ player }) => {
    const [row, col] = (player.grid || '1:1').split(':').map(Number);
    if (!rowMap.has(row)) rowMap.set(row, []);
    const sub = events.find((e) => e.kind === 'sub' && e.playerId === player.id);
    const on = sub ? {
      id: sub.assistId,
      name: displayName(sub.assist),
      number: (block.substitutes || []).find((s) => s.player.id === sub.assistId)?.player.number ?? null,
    } : null;
    const current = on || { id: player.id, name: displayName(player.name), number: player.number };
    rowMap.get(row).push({
      col,
      id: current.id,
      number: current.number,
      name: current.name,
      replaced: on ? displayName(player.name) : null,
      subbedOn: Boolean(on),
      captain: Boolean(info(player.id).captain),
      rating: info(current.id).rating ?? null,
      events: eventsFor(current.id),
    });
  });
  return {
    teamId,
    formation: block.formation || '',
    coach: block.coach?.name || '',
    color: block.team?.colors?.player?.primary ? `#${block.team.colors.player.primary}` : null,
    numberColor: block.team?.colors?.player?.number ? `#${block.team.colors.player.number}` : null,
    rows: [...rowMap.keys()].sort((a, b) => a - b)
      .map((r) => rowMap.get(r).sort((a, b) => a.col - b.col)),
  };
}

function normalizePlayers(blocks) {
  const map = new Map();
  const ratings = { home: [], away: [] };
  (blocks || []).forEach((block, index) => {
    const side = index === 0 ? 'home' : 'away';
    (block.players || []).forEach(({ player, statistics }) => {
      const games = statistics?.[0]?.games || {};
      const rating = games.rating ? parseFloat(games.rating) : null;
      map.set(player.id, { captain: games.captain === true, rating });
      if (rating !== null && games.minutes) {
        ratings[side].push({ name: displayName(player.name), number: games.number ?? null, rating, photo: safeImage(player.photo) });
      }
    });
  });
  ratings.home.sort((a, b) => b.rating - a.rating);
  ratings.away.sort((a, b) => b.rating - a.rating);
  return { map, ratings };
}

function normalizeShootout(events) {
  const row = (side) => events
    .filter((e) => e.shootout && e.side === side)
    .map((e) => ({ result: e.kind === 'penalty' ? 'scored' : 'missed', name: displayName(e.player) }));
  return { home: row('home'), away: row('away') };
}

function normalizeFixture(raw, nowMs = Date.now()) {
  const { fixture: fx, league, teams, goals, score } = raw;
  const homeId = teams.home.id;
  const awayId = teams.away.id;
  const short = fx.status?.short;
  const phase = PHASES[short] || 'stopped';
  const homeScore = goals?.home ?? 0;
  const awayScore = goals?.away ?? 0;
  const events = resolveOwnGoalSides(normalizeEvents(raw.events, homeId, awayId), homeScore, awayScore);
  const { map: playerInfo, ratings } = normalizePlayers(raw.players);
  const homeLineup = (raw.lineups || []).find((l) => l.team?.id === homeId);
  const awayLineup = (raw.lineups || []).find((l) => l.team?.id === awayId);
  const lineups = homeLineup || awayLineup ? {
    home: normalizeLineupSide(homeLineup, events, playerInfo),
    away: normalizeLineupSide(awayLineup, events, playerInfo),
  } : null;

  const team = (t, lineup, side, scoreValue) => ({
    id: t.id,
    name: t.name,
    short: shortName(t.name),
    logo: safeImage(t.logo),
    color: lineup?.color || null,
    numberColor: lineup?.numberColor || null,
    score: scoreValue,
    scorers: scorersFor(events, side),
    redCards: events.filter((e) => e.kind === 'red' && e.side === side).length,
  });

  return {
    fixtureId: fx.id,
    statusShort: short,
    phase,
    minute: fx.status?.elapsed ?? 0,
    announcedExtra: fx.status?.extra ?? null,
    clock: computeClock(fx, phase, nowMs),
    kickoff: fx.timestamp ? fx.timestamp * 1000 : null,
    venue: fx.venue?.name || '',
    city: fx.venue?.city || '',
    referee: fx.referee || '',
    league: {
      id: league?.id, name: league?.name || '', logo: safeImage(league?.logo),
      round: league?.round || '', season: league?.season,
    },
    home: team(teams.home, lineups?.home, 'home', homeScore),
    away: team(teams.away, lineups?.away, 'away', awayScore),
    penalties: { home: score?.penalty?.home ?? null, away: score?.penalty?.away ?? null },
    events,
    stats: normalizeStats(raw.statistics, homeId),
    lineups,
    ratings,
    shootout: normalizeShootout(events),
  };
}

function normalizeFixtureRow(raw) {
  const phase = PHASES[raw.fixture.status?.short] || 'stopped';
  return {
    fixtureId: raw.fixture.id,
    kickoff: raw.fixture.timestamp ? raw.fixture.timestamp * 1000 : null,
    statusShort: raw.fixture.status?.short,
    phase,
    minute: raw.fixture.status?.elapsed ?? null,
    league: { id: raw.league?.id, name: raw.league?.name || '', country: raw.league?.country || '', logo: safeImage(raw.league?.logo) },
    home: { name: raw.teams.home.name, short: shortName(raw.teams.home.name), logo: safeImage(raw.teams.home.logo), score: raw.goals?.home ?? null },
    away: { name: raw.teams.away.name, short: shortName(raw.teams.away.name), logo: safeImage(raw.teams.away.logo), score: raw.goals?.away ?? null },
  };
}

const EXCLUDED_TEAM = [/\bwomen\b/i, /\bféminin\b/i, / W$/, /\bII\b/, /\breserves?\b/i, / B$/, /\bU(1\d|2\d)\b/i];

function isFirstTeam(name) {
  return !EXCLUDED_TEAM.some((re) => re.test(name));
}

function filterLiveMatches(rows, { excludeId, leagueIds, followedTeams }) {
  const followed = new Set((followedTeams || []).map((t) => t.toLowerCase()));
  return rows
    .filter((m) => m.fixtureId !== Number(excludeId))
    .filter((m) => isFirstTeam(m.home.name) && isFirstTeam(m.away.name))
    .filter((m) => (leagueIds || []).includes(m.league.id)
      || followed.has(m.home.name.toLowerCase()) || followed.has(m.away.name.toLowerCase()))
    .slice(0, 8);
}

// A league table for the tracked team: its group, windowed so the team is always on it.
function normalizeStandings(response, teamIds = [], size = 14) {
  const league = response?.[0]?.league;
  const groups = league?.standings || [];
  const group = groups.find((g) => g.some((row) => teamIds.includes(row.team.id))) || groups[0] || [];
  const ranks = group.map((row, i) => (teamIds.includes(row.team.id) ? i : -1)).filter((i) => i >= 0);
  const lastTracked = ranks.length ? Math.max(...ranks) : 0;
  const start = Math.max(0, Math.min(lastTracked - size + 2, group.length - size));
  return {
    title: league?.name || '',
    logo: safeImage(league?.logo),
    table: group.slice(start, start + size).map((row) => ({
      rank: row.rank,
      teamId: row.team.id,
      team: row.team.name,
      logo: safeImage(row.team.logo),
      played: row.all?.played ?? 0,
      goalDiff: row.goalsDiff ?? 0,
      points: row.points ?? 0,
      tracked: teamIds.includes(row.team.id),
    })),
  };
}

const BRACKET_ROUNDS = [
  { name: 'Round of 16', match: /round of 16|8th finals/i },
  { name: 'Quarter-finals', match: /quarter/i },
  { name: 'Semi-finals', match: /semi/i },
  { name: 'Final', match: /^final$/i },
];

// No winner until every leg is over. Aggregate decides, and the feed's winner flag
// (which describes a single leg) only settles ties level on aggregate.
function tieWinner(t) {
  if (!t.finished || !t.played) return null;
  if (t.aggA !== t.aggB) return t.aggA > t.aggB ? 'home' : 'away';
  if (!t.winnerId) return null;
  return t.winnerId === t.a.id ? 'home' : 'away';
}

function normalizeBracket(fixtures, title = '', logo = '') {
  const rounds = BRACKET_ROUNDS.map(({ name, match }) => {
    const ties = new Map();
    (fixtures || []).filter((fx) => match.test(fx.league?.round || '')).forEach((fx) => {
      const key = [fx.teams.home.id, fx.teams.away.id].sort((a, b) => a - b).join('-');
      if (!ties.has(key)) {
        ties.set(key, { a: fx.teams.home, b: fx.teams.away, aggA: 0, aggB: 0, finished: true, played: false, winnerId: null });
      }
      const tie = ties.get(key);
      const aIsHome = fx.teams.home.id === tie.a.id;
      const ended = PHASES[fx.fixture?.status?.short] === 'ended';
      if (fx.goals?.home !== null && fx.goals?.home !== undefined) tie.played = true;
      tie.aggA += (aIsHome ? fx.goals?.home : fx.goals?.away) ?? 0;
      tie.aggB += (aIsHome ? fx.goals?.away : fx.goals?.home) ?? 0;
      tie.finished = tie.finished && ended;
      if (ended && fx.teams.home.winner) tie.winnerId = fx.teams.home.id;
      if (ended && fx.teams.away.winner) tie.winnerId = fx.teams.away.id;
    });
    return {
      round: name,
      ties: [...ties.values()].map((t) => ({
        home: { name: t.a.name, short: shortName(t.a.name), logo: safeImage(t.a.logo), score: t.played ? t.aggA : null },
        away: { name: t.b.name, short: shortName(t.b.name), logo: safeImage(t.b.logo), score: t.played ? t.aggB : null },
        winner: tieWinner(t),
      })),
    };
  }).filter((r) => r.ties.length);
  return { title, logo: safeImage(logo), rounds };
}

module.exports = {
  normalizeFixture, normalizeFixtureRow, normalizeStandings, normalizeBracket,
  filterLiveMatches, shortName, displayName, safeImage, goalSide, isScoringEvent,
  isFirstTeam,
};
