# Architecture

```
API-Football or rehearsal match
        │  raw fixture payloads
        ▼
normalize.js   raw payload → one clean match snapshot (pure)
        ▼
engine.js      previous + current snapshot → what happened (pure)
        ▼
delayLine.js   holds frames, events and live scores until the stream catches up
        ▼
app.js ──/overlay socket (read only)──▶ OBS sources: the same page, ?layer= and ?format=
   ▲
   └────/control socket (control token)── control room, Stream Deck links
```

## Decisions

**The server owns the show.** The first version kept polling and event detection in the control panel's browser tab, so closing it stopped the show, and a reloaded overlay came back empty. Now `feed.js` runs the match and `show.js` holds the settings, saved to `data/show.json`. Browsers are only views of that state, and a new connection gets the current state in its `hello` message.

**The rehearsal match produces raw API payloads.** `simulator.js` emits the same JSON shape as API-Football, so a rehearsal exercises the real normaliser and event engine rather than a separate demo path.

**The first snapshot is a baseline.** Joining a match in progress announces nothing old. After that, the score and goal event can arrive on different polls, in either order. `diffGoals` counts goals already announced, so each one is celebrated once, a late scorer's name is filled in afterwards, and a re-timed event stays silent.

**Only match data is delayed.** Frames, events and live scores pass through the delay line. Widget toggles and manual triggers do not, because the operator presses those while watching their own stream.

**Polling is paced to the quota.** `budget.js` spreads the remaining daily requests over the rest of the match, keeping 20% in reserve. `/fixtures?id=` is the only regular call, and sub-endpoints are called only for data that response lacks.

**Two kinds of token.** An overlay link can only read and is safe to paste into OBS. The control token can change the show. Sockets also refuse foreign origins, because browsers do not apply CORS to WebSockets and any web page could otherwise reach a local server. The server binds to localhost by default.

**Feed text never becomes markup.** Overlay and control pages build the DOM with `h()` in `dom.js`, which uses text nodes. Image URLs must be `https:` or `data:image/`. A Content Security Policy backs this up.

## Adding a widget

1. Add it to `WIDGETS` in `server/show.js` with its screen slot.
2. Add its `data` and `render` functions in `public/overlay/widgets.js`, and its slot in `SLOT_OF` in `overlay.js`.
3. Put any on-air text in `i18n.js`, in all four languages.

The control room builds its buttons from the server's list, so it needs no change.

## Adding a data source

A provider exposes `fixture`, `fixturesByDate`, `liveFixtures`, `standings`, `leagueFixtures`, `configured`, `id` and `quota`. The domain code expects API-Football's payload shape, so a different source would map to that shape. A ball-tracking feed would also send positions to `Radar`.
