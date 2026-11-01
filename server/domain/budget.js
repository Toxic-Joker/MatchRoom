// Decides how often to poll so a daily API quota survives the whole match.

const MIN_INTERVAL = 15;
const MAX_INTERVAL = 300;
const UNKNOWN_QUOTA_INTERVAL = 30;
const MATCH_SECONDS_LEFT = { first: 6600, halftime: 4200, second: 3300, extra: 2100, break: 1500, shootout: 900 };
const RESERVE = 0.2; // kept back for tables and the next match picker

function nextPollSeconds({ phase, minute = 0, remaining = null }) {
  if (phase === 'ended' || phase === 'stopped') return null;
  if (phase === 'pre') return MAX_INTERVAL;
  if (phase === 'halftime') return 60;
  if (remaining === null) return UNKNOWN_QUOTA_INTERVAL;
  let secondsLeft = MATCH_SECONDS_LEFT[phase] ?? 3000;
  if (phase === 'first') secondsLeft -= Math.min(minute, 50) * 60;
  if (phase === 'second') secondsLeft -= Math.max(0, Math.min(minute, 95) - 45) * 60;
  const usable = Math.floor(remaining * (1 - RESERVE));
  if (usable <= 0) return MAX_INTERVAL;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.ceil(Math.max(secondsLeft, 600) / usable)));
}

module.exports = { nextPollSeconds, MIN_INTERVAL, MAX_INTERVAL };
