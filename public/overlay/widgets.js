// One entry per widget: what data it needs and how to draw it. `data` returns a plain
// object, and a widget redraws only when that object changes, so animations never restart.

import { h, crest, icon, EVENT_ICONS, textOn, visibleOn, formatClock } from './dom.js';

const panel = (className, title, logo, ...body) => h('div', { class: `panel ${className}` },
  title ? h('header', { class: 'panel-head' }, h('span', null, title), logo || '') : '',
  ...body);

const tag = (m) => (m ? { home: m.home.short, away: m.away.short } : { home: '', away: '' });
const waiting = (t) => panel('panel-empty', null, null, h('p', { class: 'empty-note' }, t('waitingData')));

// ── Stats ─────────────────────────────────────────────────────────
const STAT_ROWS = [
  ['shots', 'shots'], ['shotsOnTarget', 'shotsOnTarget'], ['xg', 'xg'], ['corners', 'corners'],
  ['fouls', 'fouls'], ['yellowCards', 'yellowCards'], ['offsides', 'offsides'], ['saves', 'saves'], ['passAccuracy', 'passAccuracy'],
];

function statsWidget(d, { t }) {
  const value = (key, v) => (key === 'xg' ? v.toFixed(2) : key === 'passAccuracy' ? `${v}%` : v);
  const poss = d.stats.possession;
  return panel('stats', t('stats'), h('span', { class: 'head-crests' }, crest(d.homeLogo), crest(d.awayLogo)),
    h('div', { class: 'poss' },
      h('b', { class: 'poss-num' }, `${poss.home}%`),
      h('div', { class: 'poss-bar' },
        h('i', { style: { width: `${poss.home}%`, background: 'var(--home-bar)' } }),
        h('i', { style: { width: `${poss.away}%`, background: 'var(--away-bar)' } })),
      h('b', { class: 'poss-num' }, `${poss.away}%`),
      h('span', { class: 'poss-label' }, t('possession'))),
    // Not every competition reports expected goals, and 0.00 would read as a real figure.
    h('div', { class: 'stat-rows' }, STAT_ROWS.filter(([key]) => key !== 'xg' || d.stats.xg.home + d.stats.xg.away > 0).map(([key, label]) => {
      const s = d.stats[key] || { home: 0, away: 0 };
      const total = s.home + s.away;
      const share = total ? (s.home / total) * 100 : 50;
      return h('div', { class: 'stat-row' },
        h('b', null, value(key, s.home)),
        h('div', { class: 'stat-mid' },
          h('span', null, t(label)),
          h('div', { class: 'stat-bar' },
            h('i', { style: { width: total ? `${share}%` : '0', background: 'var(--home-bar)' } }),
            h('i', { style: { width: total ? `${100 - share}%` : '0', background: 'var(--away-bar)' } }))),
        h('b', null, value(key, s.away)));
    })));
}

// ── League table ──────────────────────────────────────────────────
function tableRows(rows, t) {
  return h('table', { class: 'league' },
    h('thead', null, h('tr', null, h('th', null, t('pos')), h('th', { colspan: 2 }, t('team')), h('th', null, t('played')), h('th', null, t('gd')), h('th', null, t('pts')))),
    h('tbody', null, rows.map((r) => h('tr', { class: r.tracked ? 'tracked' : '' },
      h('td', null, r.rank), h('td', { class: 'cell-crest' }, crest(r.logo)), h('td', { class: 'cell-team' }, r.team),
      h('td', null, r.played), h('td', null, r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff), h('td', { class: 'cell-pts' }, r.points)))));
}

function windowAround(table, size) {
  if (table.length <= size) return table;
  const tracked = table.map((r, i) => (r.tracked ? i : -1)).filter((i) => i >= 0);
  const end = tracked.length ? Math.min(table.length, Math.max(size, Math.max(...tracked) + 2)) : size;
  return table.slice(end - size, end);
}

// ── Other matches ─────────────────────────────────────────────────
function livescoreWidget(d, { t }) {
  return panel('livescore', t('other'), null,
    d.matches.length ? h('ul', { class: 'live-list' }, d.matches.slice(0, 5).map((m) => h('li', null,
      h('span', { class: 'live-min' }, m.minute !== null ? `${m.minute}'` : ''),
      h('span', { class: 'live-team home' }, m.home.name, crest(m.home.logo)),
      h('b', { class: 'live-score' }, `${m.home.score ?? 0} - ${m.away.score ?? 0}`),
      h('span', { class: 'live-team' }, crest(m.away.logo), m.away.name))))
      : h('p', { class: 'empty-note' }, t('noOther')));
}

// ── Lineups ───────────────────────────────────────────────────────
function shirt(color, numberColor, number) {
  return h('svg', { class: 'shirt', viewBox: '0 0 64 64' },
    h('path', { d: 'M14 16 2 8v18l12 4zM50 16l12-8v18l-12 4z', fill: color, stroke: '#0007', 'stroke-width': 2 }),
    h('path', { d: 'M14 16q6-7 11-2 7 8 14 0 5-5 11 2v42q0 2-2 2H16q-2 0-2-2z', fill: color, stroke: '#0007', 'stroke-width': 2 }),
    h('text', { x: 32, y: 45, 'text-anchor': 'middle', fill: numberColor, 'font-size': 23, 'font-weight': 700, 'font-family': 'Barlow Condensed' }, number ?? ''));
}

function lineupsWidget(d, { t }) {
  const lineup = d.lineup;
  const color = lineup.color || d.fallback;
  const numberColor = lineup.numberColor && lineup.numberColor !== color ? lineup.numberColor : textOn(color);
  const rowCount = lineup.rows.length;
  return panel('lineups', null, null,
    h('header', { class: 'panel-head' }, h('span', { class: 'lineup-team' }, crest(d.logo), d.name), h('b', { class: 'formation' }, lineup.formation)),
    h('div', { class: 'lineup-pitch' }, lineup.rows.map((row, i) => h('div', {
      class: 'lineup-row',
      style: { top: `${((rowCount - 1 - i) / Math.max(1, rowCount - 1)) * 82 + 3}%` },
    }, row.map((p) => h('div', { class: `player${p.subbedOn ? ' subbed' : ''}` },
      h('div', { class: 'player-shirt' },
        shirt(color, numberColor, p.number),
        p.captain ? h('span', { class: 'captain' }, 'C') : '',
        p.subbedOn ? h('span', { class: 'sub-mark' }, icon('sub')) : '',
        h('span', { class: 'player-events' }, [...new Set(p.events)].slice(0, 3).map((e) => (EVENT_ICONS[e] ? icon(EVENT_ICONS[e]) : '')))),
      h('span', { class: 'player-name' }, p.name)))))),
    lineup.coach ? h('footer', { class: 'lineup-coach' }, `${t('coach')}: ${lineup.coach}`) : '');
}

// ── Ratings ───────────────────────────────────────────────────────
function ratingClass(r) {
  if (r >= 8) return 'great';
  if (r >= 7) return 'good';
  if (r >= 6) return 'ok';
  return 'low';
}

function ratingColumn(name, logo, players, limit) {
  return h('div', { class: 'rating-col' },
    h('div', { class: 'rating-team' }, crest(logo), name),
    players.slice(0, limit).map((p) => h('div', { class: 'rating-row' },
      h('span', { class: 'rating-num' }, p.number ?? ''),
      h('span', { class: 'rating-name' }, p.name),
      h('b', { class: `rating-val ${ratingClass(p.rating)}` }, p.rating.toFixed(1)))));
}

// ── Pressure index ────────────────────────────────────────────────
function momentumWidget(d, { t }) {
  const BAR_HEIGHT = 80;
  const maxMinute = Math.max(90, ...d.series.map((s) => s.minute + 3));
  const barWidth = 100 / (maxMinute / 3);
  return panel('momentum', t('pressure'), h('span', { class: 'head-crests' }, crest(d.homeLogo), crest(d.awayLogo)),
    d.series.length ? h('svg', { class: 'momentum-chart', viewBox: `0 0 100 ${BAR_HEIGHT * 2}`, preserveAspectRatio: 'none' },
      d.series.map((s) => {
        const height = Math.max(2, Math.abs(s.value) * BAR_HEIGHT);
        return h('rect', {
          x: (s.minute / maxMinute) * 100 + barWidth * 0.1,
          width: barWidth * 0.8,
          y: s.value >= 0 ? BAR_HEIGHT - height : BAR_HEIGHT,
          height,
          fill: s.value >= 0 ? 'var(--home-bar)' : 'var(--away-bar)',
        });
      }),
      h('line', { x1: 0, x2: 100, y1: BAR_HEIGHT, y2: BAR_HEIGHT, stroke: 'var(--chalk)', 'stroke-width': 0.8, 'vector-effect': 'non-scaling-stroke' }),
      h('line', { x1: (45 / maxMinute) * 100, x2: (45 / maxMinute) * 100, y1: 0, y2: BAR_HEIGHT * 2, stroke: 'var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '3 3', 'vector-effect': 'non-scaling-stroke' }))
      : h('p', { class: 'empty-note' }, t('pressureEmpty')));
}

// ── Penalties ─────────────────────────────────────────────────────
function kicks(results) {
  const slots = [];
  for (let i = 0; i < Math.max(5, results.length); i += 1) {
    const r = results[i];
    slots.push(r ? icon(r.result === 'scored' ? 'scored' : 'missed', 'kick') : h('span', { class: 'kick kick-empty' }));
  }
  return slots;
}

function penaltiesWidget(d, { t }) {
  return panel('penalties', t('shootoutTitle'), null,
    ['home', 'away'].map((side) => h('div', { class: 'pen-row' },
      crest(d[side].logo), h('span', { class: 'pen-name' }, d[side].name),
      h('div', { class: 'pen-kicks' }, kicks(d[side].kicks)), h('b', { class: 'pen-score' }, d[side].kicks.filter((k) => k.result === 'scored').length))));
}

// ── Pre-match ─────────────────────────────────────────────────────
function prematchWidget(d, { t }) {
  const when = d.kickoff ? new Date(d.kickoff).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const side = (s) => h('div', { class: 'pre-team' }, crest(s.logo, 'crest crest-lg'), h('b', null, s.name), h('span', null, s.formation || ''));
  const facts = [[t('pre'), when], [t('venue'), d.venue], [t('referee'), d.referee]].filter(([, v]) => v);
  return panel('prematch', d.league.name, crest(d.league.logo),
    h('p', { class: 'pre-round' }, d.league.round),
    h('div', { class: 'pre-teams' }, side(d.home), h('span', { class: 'pre-vs' }, 'v'), side(d.away)),
    h('dl', { class: 'pre-facts' }, facts.map(([k, v]) => [h('dt', null, k), h('dd', null, v)])));
}

// ── Socials and sponsor ───────────────────────────────────────────
function socialsWidget(d, { t }) {
  const s = d.socials[d.index % d.socials.length];
  return panel('socials', t('follow'), null, h('div', { class: 'social-line' }, icon(s.platform), h('b', null, s.handle)));
}

function sponsorWidget(d, { t }) {
  return panel('sponsor', t('presentedBy'), null, h('div', { class: 'sponsor-line' }, d.logo ? crest(d.logo, 'sponsor-logo') : '', d.text ? h('b', null, d.text) : ''));
}

// ── Full-screen sheets ────────────────────────────────────────────
function sheet(className, ...children) {
  return h('div', { class: `sheet ${className}` }, h('div', { class: 'sheet-lines' }), ...children);
}

function waitingWidget(d, { t }) {
  return sheet('waiting',
    h('p', { class: 'sheet-kicker' }, d.title || t('startingSoon')),
    d.home ? h('div', { class: 'sheet-teams' },
      h('div', { class: 'sheet-team' }, crest(d.home.logo, 'crest crest-xl'), h('b', null, d.home.name)),
      h('span', { class: 'sheet-v' }, 'v'),
      h('div', { class: 'sheet-team' }, crest(d.away.logo, 'crest crest-xl'), h('b', null, d.away.name))) : '',
    d.remaining > 0 ? h('p', { class: 'sheet-count-label' }, t('kickoffIn')) : '',
    d.remaining > 0 ? h('p', { class: 'sheet-count' }, formatClock(d.remaining)) : '',
    d.league ? h('p', { class: 'sheet-foot' }, [d.league.name, d.league.round].filter(Boolean).join(', ')) : '');
}

function endWidget(d, { t }) {
  const list = (team) => h('ul', { class: 'end-scorers' }, team.scorers.map((s) => h('li', null, `${s.name} ${s.minute}${s.kind === 'owngoal' ? ` ${t('og')}` : ''}`)));
  return sheet('endscreen',
    h('p', { class: 'sheet-kicker' }, t(d.phase === 'ended' ? 'final' : d.phase)),
    h('div', { class: 'sheet-teams' },
      h('div', { class: 'sheet-team' }, crest(d.home.logo, 'crest crest-xl'), h('b', null, d.home.name), list(d.home)),
      h('div', { class: 'end-score' }, h('b', null, d.home.score), h('i'), h('b', null, d.away.score),
        d.penalties.home !== null ? h('span', { class: 'end-pens' }, `(${d.penalties.home} - ${d.penalties.away})`) : ''),
      h('div', { class: 'sheet-team' }, crest(d.away.logo, 'crest crest-xl'), h('b', null, d.away.name), list(d.away))),
    h('p', { class: 'sheet-foot' }, [d.league.name, d.league.round].filter(Boolean).join(', ')));
}

function bracketWidget(d, { t }) {
  const team = (s, loser) => h('div', { class: `tie-team${loser ? ' lost' : ''}` }, crest(s.logo), h('span', null, s.name), h('b', null, s.score ?? '-'));
  return sheet('bracket-sheet',
    h('header', { class: 'sheet-head' }, crest(d.logo, 'crest crest-lg'), h('b', null, d.title || t('bracket'))),
    h('div', { class: 'bracket' }, d.rounds.map((r) => h('section', { class: 'round' },
      h('h3', null, r.round),
      h('div', { class: 'round-ties' }, r.ties.map((tie) => h('div', { class: 'tie' }, team(tie.home, tie.winner === 'away'), team(tie.away, tie.winner === 'home'))))))));
}

const needMatch = (state) => state.frame;

export const WIDGETS = {
  stats: {
    data: (s) => (s.frame?.stats ? { stats: s.frame.stats, homeLogo: s.frame.home.logo, awayLogo: s.frame.away.logo } : { none: true }),
    render: (d, c) => (d.none ? waiting(c.t) : statsWidget(d, c)),
  },
  prematch: {
    data: (s) => (s.frame ? {
      league: s.frame.league, kickoff: s.frame.kickoff, venue: s.frame.venue, referee: s.frame.referee,
      home: { name: s.frame.home.name, logo: s.frame.home.logo, formation: s.frame.lineups?.home?.formation },
      away: { name: s.frame.away.name, logo: s.frame.away.logo, formation: s.frame.lineups?.away?.formation },
    } : { none: true }),
    render: (d, c) => (d.none ? waiting(c.t) : prematchWidget(d, c)),
  },
  standings: {
    data: (s) => (s.tables.standings ? { ...s.tables.standings } : { none: true }),
    render: (d, c) => (d.none ? waiting(c.t) : panel('standings', d.title || c.t('table'), crest(d.logo), tableRows(windowAround(d.table, 6), c.t))),
  },
  standingsFull: {
    data: (s) => (s.tables.standings ? { ...s.tables.standings } : { none: true }),
    render: (d, c) => (d.none ? sheet('table-sheet', h('p', { class: 'empty-note' }, c.t('waitingData'))) : sheet('table-sheet',
      h('header', { class: 'sheet-head' }, crest(d.logo, 'crest crest-lg'), h('b', null, d.title || c.t('table'))),
      tableRows(d.table, c.t))),
  },
  livescore: {
    data: (s) => (s.tables.livescore ? { matches: s.tables.livescore } : { none: true }),
    render: (d, c) => (d.none ? waiting(c.t) : livescoreWidget(d, c)),
  },
  lineups: {
    data: (s) => {
      if (!s.frame?.lineups) return { none: true };
      const opt = s.show.widgets.lineups.opts?.side || 'auto';
      const side = opt === 'auto' ? (s.lineupAltSide || 'home') : opt;
      const lineup = s.frame.lineups[side];
      if (!lineup) return { none: true };
      return { side, lineup, name: s.frame[side].name, logo: s.frame[side].logo, fallback: side === 'home' ? '#1e62b0' : '#b03232' };
    },
    render: (d, c) => (d.none ? waiting(c.t) : lineupsWidget(d, c)),
  },
  ratings: {
    data: (s) => (s.frame?.ratings?.home?.length ? { ratings: s.frame.ratings, home: { name: s.frame.home.short, logo: s.frame.home.logo }, away: { name: s.frame.away.short, logo: s.frame.away.logo } } : { none: true }),
    render: (d, c) => (d.none ? waiting(c.t) : panel('ratings', c.t('ratings'), null, h('div', { class: 'rating-cols' },
      ratingColumn(d.home.name, d.home.logo, d.ratings.home, 11), ratingColumn(d.away.name, d.away.logo, d.ratings.away, 11)))),
  },
  ratingsFull: {
    data: (s) => (s.frame?.ratings?.home?.length ? { ratings: s.frame.ratings, home: { name: s.frame.home.name, logo: s.frame.home.logo }, away: { name: s.frame.away.name, logo: s.frame.away.logo } } : { none: true }),
    render: (d, c) => (d.none ? sheet('ratings-sheet', h('p', { class: 'empty-note' }, c.t('waitingData'))) : sheet('ratings-sheet',
      h('header', { class: 'sheet-head' }, h('b', null, c.t('ratings'))),
      h('div', { class: 'rating-cols' }, ratingColumn(d.home.name, d.home.logo, d.ratings.home, 11), ratingColumn(d.away.name, d.away.logo, d.ratings.away, 11)))),
  },
  momentum: {
    data: (s) => (s.frame ? { series: s.frame.momentum?.series || [], homeLogo: s.frame.home.logo, awayLogo: s.frame.away.logo } : { none: true }),
    render: (d, c) => (d.none ? waiting(c.t) : momentumWidget(d, c)),
  },
  penalties: {
    data: (s) => (s.frame ? {
      home: { name: s.frame.home.name, logo: s.frame.home.logo, kicks: s.frame.shootout.home },
      away: { name: s.frame.away.name, logo: s.frame.away.logo, kicks: s.frame.shootout.away },
    } : { none: true }),
    render: (d, c) => (d.none ? waiting(c.t) : penaltiesWidget(d, c)),
  },
  socials: {
    data: (s) => (s.show.socials.length ? { socials: s.show.socials, index: s.socialIndex } : { none: true }),
    render: (d, c) => (d.none ? h('div') : socialsWidget(d, c)),
  },
  sponsor: {
    data: (s) => ((s.show.sponsor.text || s.show.sponsor.logo) ? { ...s.show.sponsor } : { none: true }),
    render: (d, c) => (d.none ? h('div') : sponsorWidget(d, c)),
  },
  waiting: {
    data: (s) => {
      const target = s.show.countdown.target || s.frame?.kickoff || null;
      return {
        title: s.show.countdown.title,
        remaining: target ? Math.max(0, Math.ceil((target - s.nowMs) / 1000)) : 0,
        home: s.frame ? { name: s.frame.home.name, logo: s.frame.home.logo } : null,
        away: s.frame ? { name: s.frame.away.name, logo: s.frame.away.logo } : null,
        league: s.frame ? s.frame.league : null,
      };
    },
    render: waitingWidget,
  },
  endscreen: {
    data: (s) => (needMatch(s) ? { phase: s.frame.phase, home: s.frame.home, away: s.frame.away, penalties: s.frame.penalties, league: s.frame.league } : { none: true }),
    render: (d, c) => (d.none ? sheet('endscreen', h('p', { class: 'empty-note' }, c.t('waitingData'))) : endWidget(d, c)),
  },
  bracket: {
    data: (s) => (s.tables.bracket?.rounds?.length ? { ...s.tables.bracket } : { none: true }),
    render: (d, c) => (d.none ? sheet('bracket-sheet', h('p', { class: 'empty-note' }, c.t('waitingData'))) : bracketWidget(d, c)),
  },
};

export { visibleOn };
