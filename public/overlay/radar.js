// The radar. API-Football has no ball-tracking data, so this draws the shape of the
// match: which side is pressing (from the pressure index) and the moments the data
// does report (corners, shots, goals, cards). The ball is an illustration, and the
// widget says so on screen. A tracking feed could drive setBall() directly.

import { h } from './dom.js';

const W = 1050;
const H = 680;
const TRAIL = 14;

function pitchLines() {
  const line = { fill: 'none', stroke: 'var(--pitch-line)', 'stroke-width': 4 };
  const stripes = [];
  for (let i = 0; i < 10; i += 1) {
    stripes.push(h('rect', { x: (i * W) / 10, y: 0, width: W / 10 + 1, height: H, fill: i % 2 ? 'var(--grass2)' : 'var(--grass1)' }));
  }
  const box = (x, w, y, hh) => h('rect', { ...line, x, y, width: w, height: hh });
  return [
    stripes,
    h('rect', { ...line, x: 2, y: 2, width: W - 4, height: H - 4 }),
    h('line', { ...line, x1: W / 2, y1: 0, x2: W / 2, y2: H }),
    h('circle', { ...line, cx: W / 2, cy: H / 2, r: 91 }),
    box(2, 165, 138, 404), box(W - 167, 165, 138, 404),
    box(2, 55, 248, 184), box(W - 57, 55, 248, 184),
    h('circle', { cx: 110, cy: H / 2, r: 5, fill: 'var(--pitch-line)' }),
    h('circle', { cx: W - 110, cy: H / 2, r: 5, fill: 'var(--pitch-line)' }),
    h('circle', { cx: W / 2, cy: H / 2, r: 5, fill: 'var(--pitch-line)' }),
  ];
}

export class Radar {
  constructor() {
    this.zone = h('rect', { class: 'radar-zone', x: 0, y: 0, width: W / 3, height: H, opacity: 0 });
    this.trail = h('polyline', { class: 'radar-trail', points: '' });
    this.ballGlow = h('circle', { class: 'radar-ball-glow', r: 30 });
    this.ball = h('circle', { class: 'radar-ball', r: 13 });
    this.svg = h('svg', { class: 'radar-svg', viewBox: `0 0 ${W} ${H}` }, pitchLines(), this.zone, this.trail, this.ballGlow, this.ball);
    this.label = h('div', { class: 'radar-label' });
    this.el = h('div', { class: 'radar-stage' }, h('div', { class: 'radar-tilt' }, this.svg), this.label);
    this.x = 0.5;
    this.y = 0.5;
    this.tx = 0.5;
    this.ty = 0.5;
    this.points = [];
    this.level = 0;
    this.running = false;
    this.nextMove = 0;
    this.moment = null;
    this.momentQueue = [];
    this.lastTrail = 0;
    this.names = { home: '', away: '' };
    this.frameId = null;
    this.t = (k) => k;
    this.phaseLabel = '';
  }

  start() {
    if (this.frameId) return;
    const loop = (now) => {
      this.step(now);
      this.frameId = requestAnimationFrame(loop);
    };
    this.frameId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = null;
    this.momentQueue = [];
    this.moment = null;
  }

  update({ level, running, names, phaseLabel, t }) {
    this.level = level;
    this.running = running;
    this.names = names;
    this.phaseLabel = phaseLabel;
    this.t = t;
  }

  // A sequence of beats: where the ball goes, how long it stays and what to caption.
  react(event, t = this.t) {
    // Off air: a moment from minutes ago must not play when the radar next appears.
    if (!this.frameId) return;
    const side = event.side || 'home';
    const toward = side === 'home' ? (x) => x : (x) => 1 - x;
    const team = this.names[side] || '';
    const flank = Math.random() < 0.5 ? 0.02 : 0.98;
    const beats = {
      corner: [
        { x: toward(0.995), y: flank, ms: 1600, label: t('corner'), team },
        { x: toward(0.9), y: 0.5, ms: 1500, label: t('corner'), team, danger: side },
      ],
      shot_on_target: [
        { x: toward(0.84), y: 0.45, ms: 700, label: t('shotOn'), team, danger: side },
        { x: toward(0.99), y: 0.5, ms: 1500, label: t('shotOn'), team, danger: side },
      ],
      shot_off: [
        { x: toward(0.82), y: 0.6, ms: 700, label: t('shot'), team, danger: side },
        { x: toward(1), y: 0.18, ms: 1400, label: t('shot'), team },
      ],
      offside: [{ x: toward(0.74), y: 0.3 + Math.random() * 0.4, ms: 2200, label: t('offside'), team }],
      foul: [{ x: 0.3 + Math.random() * 0.4, y: 0.2 + Math.random() * 0.6, ms: 2200, label: t('foul'), team }],
      goal: [
        { x: toward(0.86), y: 0.48, ms: 600, label: t('goal'), team, danger: side },
        { x: toward(1), y: 0.5, ms: 3400, label: t('goal'), team, danger: side, big: true },
        { x: 0.5, y: 0.5, ms: 1200, label: '' },
      ],
      card: [{ x: 0.5, y: 0.5, ms: 2600, label: event.card === 'red' ? t('red') : t('yellow'), team: event.player || team }],
    }[event.type];
    if (!beats) return;
    // Real moments outrank whatever the illustration was doing.
    this.momentQueue = [...beats];
    this.moment = null;
    this.nextMove = 0;
  }

  step(now) {
    if (now > this.nextMove) this.pickTarget(now);
    // Critically damped chase: no bounce, and it never overshoots the pitch.
    const speed = this.moment ? 0.075 : 0.022;
    this.x += (this.tx - this.x) * speed;
    this.y += (this.ty - this.y) * speed;
    const px = this.x * W;
    const py = this.y * H;
    this.ball.setAttribute('cx', px);
    this.ball.setAttribute('cy', py);
    this.ballGlow.setAttribute('cx', px);
    this.ballGlow.setAttribute('cy', py);
    if (now - this.lastTrail > 240) {
      this.lastTrail = now;
      this.points.push(`${Math.round(px)},${Math.round(py)}`);
      if (this.points.length > TRAIL) this.points.shift();
      this.trail.setAttribute('points', this.points.join(' '));
    }
  }

  pickTarget(now) {
    if (this.momentQueue.length) {
      const beat = this.momentQueue.shift();
      this.moment = beat;
      this.tx = beat.x;
      this.ty = beat.y;
      this.nextMove = now + beat.ms;
      this.setLabel(beat.label, beat.team, beat.big);
      this.setZone(beat.danger || null);
      return;
    }
    this.moment = null;
    if (!this.running) {
      this.tx = 0.5;
      this.ty = 0.5;
      this.nextMove = now + 1000;
      this.setLabel(this.phaseLabel, '');
      this.setZone(null);
      return;
    }
    const homeShare = 0.5 + this.level * 0.4;
    const attacking = Math.random() < homeShare ? 'home' : 'away';
    const depth = 0.52 + Math.random() * (0.26 + Math.abs(this.level) * 0.14);
    this.tx = attacking === 'home' ? depth : 1 - depth;
    this.ty = 0.12 + Math.random() * 0.76;
    this.nextMove = now + 1300 + Math.random() * 1500;
    const dangerous = depth > 0.72;
    this.setLabel(dangerous ? this.t('danger') : this.t('attack'), this.names[attacking] || '');
    this.setZone(dangerous ? attacking : null);
  }

  setLabel(text, team, big = false) {
    this.label.replaceChildren();
    this.label.classList.toggle('big', Boolean(big));
    this.label.classList.toggle('empty', !text);
    if (text) this.label.append(h('strong', null, text), team ? h('span', null, team) : '');
  }

  setZone(side) {
    if (!side) {
      this.zone.setAttribute('opacity', 0);
      return;
    }
    this.zone.setAttribute('x', side === 'home' ? (W * 2) / 3 : 0);
    this.zone.setAttribute('opacity', 0.32);
  }
}
