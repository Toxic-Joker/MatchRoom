# InPlay Studio

A self-hosted football overlay for watchalong streamers. It puts a live scoreboard, stats, lineups, a radar and full-screen moments on your stream, held back to match your stream delay so the overlay never spoils a goal.

It runs on your own machine, with no subscription. Match data comes from [API-Football](https://www.api-football.com/), and a built-in rehearsal match lets you try everything without an API key.

## Start

You need [Node.js 20 or newer](https://nodejs.org).

```bash
git clone https://github.com/Toxic-Joker/inplay-studio.git
```

```bash
cd inplay-studio && npm install
```

```bash
npm start
```

The server prints a private link to the control room. Open it, and a rehearsal match starts playing straight away.

For real matches, copy `.env.example` to `.env`, add your API-Football key and restart. Then pick a match in the **Match** tab.

## Add it to OBS

The **Add to OBS** tab has the links to copy. Each one is a Browser source, stacked like this:

| Order in the scene | Source | Size |
|---|---|---|
| Top | Widgets link (transparent) | 1920×1080 |
| Middle | Your camera | Inside the outlined area |
| Bottom | Backdrop link (optional) | 1920×1080 |

Portrait links for TikTok and Shorts work the same way at 1080×1920. Turn on **Camera position** in the **Content** tab while you line up the scene.

## Set your stream delay

YouTube and Twitch reach viewers 20 to 60 seconds after you. Without a delay setting, the score would change before your viewers see the goal.

1. Note how far your stream is behind the live match.
2. Enter that in **Stream delay** at the top of the control room.

All match data waits until it is due: score, clock, events, stats, radar and other matches. The panel shows both "At the stadium now" and "On air now", so you can see what is being held back. Buttons you press, such as showing a widget, take effect at once.

## During the match

The server follows the match by itself. Closing the control room or reloading an OBS source does not interrupt anything: both catch up immediately when they reconnect.

- **Widgets**: a lit button is on air. Each screen area holds one widget, so lighting one replaces its neighbour.
- **Trigger by hand**: for when you see a goal before the data does. The data's own version of that goal then appears as a small banner, not a second celebration.
- **Look**: themes follow the competition automatically. You can also pick one, set your own colours and choose how each event appears. On-air text comes in English, French, Spanish and Portuguese.

### Stream Deck

Add a **Website** action, paste a link from **Add to OBS**, and tick "GET request in background". Links look like `/deck/toggle/radar`, `/deck/hide-all` or `/deck/delay/1`. They carry your control token, so keep them private.

### Using a phone

The server only accepts connections from your own computer by default. To use a phone on the same network, set `HOST=0.0.0.0` in `.env`. Traffic is not encrypted, so only do this on a network you trust.

## What the radar shows

API-Football does not provide ball-tracking data, so **the radar is an illustration of the match, not the ball's real position**. Which side is pressing comes from the pressure index, and corners, shots, goals and cards come from the match data. The widget says this on screen. Shots and corners are worked out from changes in the match totals, so they appear up to a minute late, or more on a small API plan.

Showing the true ball position, with player names and passing lines, would need a paid tracking feed. `server/providers/` and `Radar` are where one would connect.

## API usage

The free API-Football plan has a low daily request limit, and plans can restrict which seasons you can access, so check your dashboard. A single fixture request can carry the events, lineups and stats, and the server spaces its requests to make your remaining daily quota last the match. Expect slower updates on a small plan. The remaining quota shows at the top of the control room.

## Run with Docker

```bash
cp .env.example .env
```

```bash
docker compose up -d --build
```

```bash
docker compose logs studio
```

The last command shows your control room link. Settings and tokens are kept in a Docker volume.

## Develop

```bash
npm test
```

```bash
npm run dev
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how it fits together, and [docs/COMPARISON.md](docs/COMPARISON.md) for how it compares with the product that inspired it.

## License

[PolyForm Noncommercial 1.0.0](./LICENSE). Barlow fonts are under the SIL Open Font License, in `public/vendor/fonts`.
