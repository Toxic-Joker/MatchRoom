# Comparison with inplaystudio.com

Reviewed 2026-11-01 from the public website and its demo videos, not the paid product. Their claims are as stated on their site and were not tested. This project takes ideas about what a watchalong overlay needs. It does not use their code, artwork, video or copy.

## What their product is built around

1. **The anti-spoiler delay**, which their site calls the main problem for watchalongs.
2. **The match told without pictures**: an animated radar stands in for footage the streamer has no rights to show.
3. **Operating it while commentating**: pick a match from a list, press one button per widget, control it from a Stream Deck.
4. **Looking like TV**: a compact scorebug, a look for each competition, and a scene built around the camera.

## Before and after this rebuild

| What's needed | Old version | This version | Their product (as advertised) |
|---|---|---|---|
| Stream delay | None | Seconds, up to 5 minutes, applied to all match data | Yes |
| Survives a closed panel or reloaded overlay | No, it stopped or came back blank | Yes, the server owns the state | Hosted service |
| Choosing a match | Type a fixture ID | Searchable daily list | Daily list |
| Running clock | Jumped with each poll | Ticks every second | Synced clock |
| Joining a match in progress | Replayed old cards and goals | Silent baseline | Not stated |
| Goal cancelled by VAR | Ignored | Reported, and the score is corrected | Not stated |
| Radar | Possession badge | 2D and 3D illustrated pitch driven by match data | **True ball position, player and pass lines** |
| Pressure index | None | Yes, derived from match totals | Yes |
| Player ratings, pre-match card | None | Yes | Yes |
| Countdown and full-time screens | None | Yes | Pre-live and post-live video screens |
| Stream Deck | None | Links for the built-in Website action | **Dedicated plugin** |
| Scene layers | One overlay with a cut-out | Backdrop, camera, widgets | Two OBS sources |
| Competition themes | Colour presets, chosen by hand | 8 themes, chosen automatically | Marketplace with **licensed artwork** |
| On-air languages | French and English mixed | EN, FR, ES, PT | FR, EN, ES, PT |
| Security | Open sockets and API routes, unescaped feed text | Tokens, origin checks, CSP, no markup from the feed | Private URLs |
| Data latency | About 20s | 15s or slower, depending on plan | **"A fraction of a second"**, premium feeds |
| Cost | API plan only | API plan only | €69 to €249 per month |

## Where it still falls short, and why

- **Radar accuracy and speed.** Their radar needs a ball-tracking feed, which API-Football does not sell. Ours is honest about being an illustration. Closing this gap means paying for such a feed.
- **Data speed.** API-Football updates more slowly than the premium feeds they advertise. The delay hides much of this, because a watchalong stream is already behind.
- **Hosting.** Theirs is a service with monitoring. This one runs on the streamer's PC, so it depends on that machine and its connection staying up.
- **Multiplex.** "Other matches" is a list, not a full multi-match mode.
- **Video screens, odds and sponsor management.** Not built.
