# Analytics (opt-in)

GlubLM does **not** ship with analytics enabled. This doc describes how to
turn them on if you run your own fork.

## Policy

- **The desk pet is never tracked.** It's an offline-first PWA and the
  "no telemetry, runs entirely in your browser" property is the selling
  point. `desk-pet/*.html` does not include the snippet below.
- **Only the landing page** (`web/index.html`) has an opt-in analytics
  placeholder. Uncomment to turn it on in your own deploy.
- Pick an analytics backend that is **cookie-free and aggregate-only**.
  GoatCounter is the default choice here; Plausible and Fathom Lite are
  equivalent alternatives.

## Option A - GoatCounter (hosted)

Zero infra. Free tier is generous for a launch-week audience.

1. Sign up at https://goatcounter.com - pick a site code like `glublm`.
   Your host becomes `glublm.goatcounter.com`.
2. Uncomment the `<script data-goatcounter="...">` line in
   `web/index.html` and replace `YOUR-GC-HOST` with your host.
3. Update the CSP meta tag in `web/index.html` to allow the host:
   - `script-src`: add `https://gc.zgo.at` (the CDN GoatCounter uses)
   - `connect-src`: add `https://YOUR-GC-HOST` (where counts are sent)
4. Commit + deploy. Page views appear on your dashboard within a minute.

## Option B - Self-hosted on your Proxmox homelab

Free forever, full data ownership. Requires an hour of infra setup.

1. Create a Debian 12 LXC container (~50 MB idle, 256 MB RAM is overkill).
2. Install the single Go binary:
   ```bash
   curl -L https://github.com/arp242/goatcounter/releases/latest/download/goatcounter-v2.5-linux-amd64.gz \
     | gunzip > /usr/local/bin/goatcounter
   chmod +x /usr/local/bin/goatcounter
   goatcounter db create -createdb
   goatcounter serve -listen :8080 -tls none
   ```
3. Put it behind a Cloudflare Tunnel route at e.g. `gc.example.com`.
4. Same CSP + snippet edits as Option A, with your own host.

## What gets collected

With the default GoatCounter config:
- page path (e.g., `/` or `/desk-pet/`)
- referrer (if set by the browser)
- user agent class (bucketed: "Chrome on Desktop", "Safari on Mobile", ...)
- country (from IP, then IP is discarded)
- screen size bucket

**Not** collected: IP address (after country lookup), cookies, sessions,
individual identifiers, form contents, DOM events.

## CSP implications

The current CSP (`web/index.html` line 5) already reflects the baseline
(self + jsdelivr for ONNX). When you enable analytics, the minimum diff is:

```diff
- script-src 'self' https://cdn.jsdelivr.net 'wasm-unsafe-eval';
+ script-src 'self' https://cdn.jsdelivr.net https://gc.zgo.at 'wasm-unsafe-eval';
- connect-src 'self' https://cdn.jsdelivr.net;
+ connect-src 'self' https://cdn.jsdelivr.net https://YOUR-GC-HOST;
```

No other directive needs to change.

## Why this is deliberately off

Shipping analytics-disabled keeps the "no backend, no accounts, no tracking"
promise printed on the landing page honest for anyone who clones the
repo and deploys as-is. Users who want visit stats for their own fork
get it in two line edits. That's the right default.
