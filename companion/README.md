# GlubLM Companion Server

> The real thing: a persistent virtual goldfish with biological needs, personality,
> and a split-screen UI. The [desk pet PWA](../desk-pet/) is a forgettable demo;
> this is where the fish actually lives.

## What you get

- **Aquarium display** — open on your desktop / main monitor. Shows the bowl,
  the fish, bubbles, water quality, poops to clean up, idle phrases.
- **Phone controller** — open on your phone. Buttons to feed, clean, change
  water, play, and chat with the fish. Pairs via the same WebSocket.
- **Persistent pet state** — hunger, cleanliness, health, bond, age-in-days,
  poops on the gravel. Survives server restarts. Decays whether or not you
  are watching.
- **Local ONNX inference** — same 36M-param goldfish brain that runs in the
  browser, this time invoked from Node.js over `onnxruntime-node`.

## Install

Requires **Node.js 20+** (any platform Node supports).

```bash
git clone https://github.com/Den-Sec/glublm.git
cd glublm/companion
npm ci
npm start
```

Then:

- **Aquarium**: open `http://localhost:3210/aquarium/` on your desktop.
- **Controller**: open `http://<server-lan-ip>:3210/controller/` on your phone
  (same Wi-Fi network). For a bare `localhost:3210` on the phone you'd need
  to run the server on the phone itself — that's fine, Node ARM builds work.

Docker compose and systemd options below.

## Configuration (env vars)

| Var | Default | What it does |
|---|---|---|
| `PORT` | `3210` | HTTP + WebSocket port. |
| `STATE_FILE` | `./pet-state.json` | Where the pet state is persisted. Use an absolute path in production. |

Set them inline:

```bash
PORT=8080 STATE_FILE=/var/lib/glub/pet-state.json npm start
```

## Where state lives

Two files live in the `companion/` directory by default:

- `pet-state.json` — current state (hunger, cleanliness, bond, age, etc.). Atomically
  rewritten every 60 seconds via a `.tmp` + rename dance, so a crash mid-write
  cannot corrupt it.
- `data/idle-phrases.json` — 500+ idle phrases the fish says when nobody's
  interacting. Edit this freely; the server reloads it on restart.

**Backup**: copy `pet-state.json` periodically if your fish has emotional value.
The format is plain JSON, human-readable, trivially restorable.

## Running it for real (24/7 so your fish doesn't starve)

Three options, pick one:

### 1. Docker Compose (easiest)

```bash
cd companion
docker compose up -d
docker compose logs -f       # watch output
docker compose down          # stop
```

The `pet-state.json` lives in a named volume so `down -v` is the only
way to reset your fish. See [`docker-compose.yml`](docker-compose.yml).

### 2. systemd (for Linux homelab)

```bash
sudo cp systemd/glub-companion.service /etc/systemd/system/
# edit the file if your repo isn't at /opt/glub — the ExecStart path
# and WorkingDirectory need to match
sudo useradd --system --home-dir /opt/glub glub    # optional: run as its own user
sudo chown -R glub:glub /opt/glub
sudo systemctl daemon-reload
sudo systemctl enable --now glub-companion
sudo journalctl -fu glub-companion                 # watch logs
```

### 3. Plain Node + tmux / screen

For a quick always-on on your laptop: `npm start` inside `tmux new -s glub`,
detach with `Ctrl-b d`.

## Architecture at a glance

```
  ┌────────────────────────────┐
  │   server/index.js          │  HTTP + WebSocket on :3210
  │   ├── NeedsEngine (tick)   │  every 1 s: decay hunger, cleanliness, poops,
  │   ├── Persistence          │  save every 60 s
  │   ├── Personality          │  bond growth / decay
  │   └── GlubInference        │  onnxruntime-node loads the same model
  └────┬───────────────────────┘
       │
  WebSocket broadcasts
       │
  ┌────┴─────────┐       ┌──────────────┐
  │ aquarium/    │       │ controller/  │
  │ (desktop)    │       │ (phone)      │
  │ renders bowl │       │ feed / clean │
  │ + fish       │       │ / water /    │
  │ + bubbles    │       │ play / chat  │
  └──────────────┘       └──────────────┘
```

The two clients are plain static HTML + ES modules served by the same Node
process — no bundler, no framework.

## Troubleshooting

**`Pet loaded: hunger=... bond=...` but no fish on the page** — check the
browser console for a WebSocket error. The server binds to `0.0.0.0:PORT`
by default; a firewall or iptables rule may be blocking it on LAN.

**"Chat reply is empty"** — the ONNX model is still downloading / loading.
First start takes ~10 s. Subsequent starts are near-instant (model caches).

**State file gone after reboot** — you ran the server from a temp dir. Set
`STATE_FILE` to an absolute path (Docker Compose does this automatically
via a named volume).

**Multiple tabs fighting over the same state** — by design: all connected
clients share one pet. Close duplicate aquarium tabs if you only want one
visual.

**Zombie WebSocket connections** — the server sends a ping every 30 s and
drops clients that don't pong. Normally invisible; if you see the client
count climbing without matching tabs, check `npm start` logs for
`verifyClient` rejections.

## Security notes

- **Localhost-only by default** for WebSocket connections — the server checks
  the `Origin` header and rejects anything other than `localhost`, `127.0.0.1`,
  or `[::1]`. Expose to LAN by putting a reverse proxy in front (Caddy,
  Nginx, Traefik); the proxy strips the `Origin` and the server treats the
  request as a native client.
- Chat input is capped at **500 characters** per message; longer messages
  are rejected with an `invalid_input` error.
- Static file routes (`/aquarium/`, `/controller/`, `/engine/`) are mounted
  to specific subdirectories with a `path.resolve` + `startsWith` guard
  against path traversal, so malformed URLs can't escape the mount root.

Report vulnerabilities to `dennisepede@proton.me` — see
[`../SECURITY.md`](../SECURITY.md) for the full policy.

## License

AGPL-3.0-or-later. Same as the rest of the repo. See [`../LICENSE`](../LICENSE).
