# Publishing NEURAL SIEGE to game portals (getting paid)

The game has a built-in ad adapter (`js/ads.js`). The public GitHub Pages build
has **no ads ever** (`provider: none`). Portal builds activate ads and two
monetized features:

- **Victory screen** → "WATCH AD: +N ◈ BONUS" (rewarded video → bonus Data Cores)
- **Defeat screen** → "WATCH AD: SECOND WIND" (rewarded video → revive with 5 Integrity, once per level)
- Interstitials at level transitions (Next Node / Retry)

## Step 1 — CrazyGames (best revenue share, highest quality bar)

1. Create a developer account: https://developer.crazygames.com (do this on your phone, it's a normal signup).
2. Build the submission zip (I can run this for you any time):
   ```
   python3 tools/build_portal.py crazygames
   # → dist/neural-siege-crazygames.zip
   ```
3. On the developer portal: **Submit game** → upload the zip (HTML5 game),
   fill in name (NEURAL SIEGE), category (Tower Defense / Strategy), description,
   and screenshots (use `docs/screens/*.png`).
4. Their QA reviews it (typically 1–2 weeks). They check: loads in iframe, no
   external links, SDK events fire (already wired: loading, gameplay start/stop, ads).
5. If accepted: revenue share is paid monthly (PayPal etc.) based on play time & ad views.

## Step 2 — GameDistribution (lower bar, wide syndication network)

1. Sign up: https://gamedistribution.com (choose "developer").
2. Register the game on their dashboard → you get a **GD game ID** (a hex string).
3. Build with that ID baked in:
   ```
   python3 tools/build_portal.py gamedistribution <YOUR-GD-GAME-ID>
   ```
4. Upload the zip. Their network syndicates the game to hundreds of portal sites.

## Step 3 — itch.io (optional, tips/donations)

The plain repo zip works as-is (it's a static site): itch.io → new project →
HTML game → upload a zip of the repo (minus .git) → set "pay what you want".

## Honest expectations

- Portal revenue = share of ad revenue driven by *their* traffic. Small games
  typically earn tens of dollars/month if they get featured, less if not.
  A game that reviews well and retains players can do much better.
- CrazyGames may request tweaks before acceptance (e.g. faster first-load,
  tutorial hints). Send me their QA feedback verbatim and I'll implement it.

## What's where in the code

- `js/ads.js` — provider adapter (crazygames / gamedistribution / none)
- `tools/build_portal.py` — produces portal zips, injects SDK + strips PWA
- Rewarded/interstitial call sites: `js/ui.js` (showEnd, togglePause), `js/game.js` (revive, gameplay signals)
- Test hook: set `window.__ADS_MOCK = 1` in the console to simulate ads locally.
