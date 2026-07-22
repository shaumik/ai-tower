# NEURAL SIEGE — AI Tower Defense

A complete, offline-first, mobile-first tower defense game with an AI/cyberwar theme.
Rogue AI threats march down the data bus toward your Core — build defenses between
waves, then watch them hold the line. **You cannot build during a wave**: all
deployment happens in the deploy phase, so combat itself is hands-off.

No frameworks, no build step, no external assets — pure HTML5 canvas with
procedurally rendered neon vector graphics and synthesized WebAudio sound.

## Play

**Option 1 — any static server (recommended, enables offline PWA):**

```bash
cd ai-tower
python3 -m http.server 8000
# open http://localhost:8000 on your phone/desktop
```

Once loaded over HTTP(S), a service worker caches everything — the game then works
fully offline, and on mobile you can "Add to Home Screen" to install it as an app.

**Option 2 — just open `index.html` in a browser.** Everything works except the
offline service worker (which requires http/https).

## What's in the box

- **50 levels** across 5 sectors (Spam Filter → Darknet Relay → Neural Fabric →
  Quantum Vault → AGI Containment), each with a unique procedurally-carved map,
  8–33 waves, and its own palette.
- **26 enemy types**: fast crawlers, armored ransomware, stealth deepfakes,
  airborne drones that skip the path, splitting worms, trojan carriers, shielded
  phishers, teleporting quantum glitches, speed-buffing botnet nodes, regenerating
  GANs, decoy-spawning mirages… plus **5 sector bosses** with summons, stealth
  phases, blinks, and enrage mechanics.
- **12 tower types × 4 upgrade tiers**: Sentry Node, Scan Array (reveals stealth),
  Tarpit, Packet Mortar, Throttler, Compute Farm (income), Pulse Coil (chain
  lightning), Kernel Sniper (armor-piercing), Overclocker (buff aura), Photon
  Lance (ramping beam), EMP Emitter (AoE stun), Singularity Core. Per-tower
  targeting modes (first/last/strong/close).
- **3 difficulty tiers per level** (Standard / Hard / Insane), star ratings,
  and **Endless mode** on any beaten level with compounding overtime waves and
  recurring bosses.
- **Meta progression**: earn Data Cores ◈ from victories and spend them in the
  Research Lab on 8 permanent upgrade tracks (starting capital, core plating,
  firmware damage, bounties, build discounts, interest, salvage, global overclock).
- **Threat Codex** (unlocks as you encounter enemies), **24 achievements**,
  lifetime stats, and local save (localStorage).
- 1×/2×/4× game speed, optional auto-start, pause, screen shake toggle,
  generative ambient soundtrack.

## Rules of engagement

- Towers can be **built, upgraded, and sold only between waves**.
- Towers built in the current deploy phase refund 100% if sold before fighting
  (free undo); otherwise selling refunds 70% (+ Salvage research).
- Stealth enemies are invisible to towers without a Scan Array nearby.
- Fliers ignore the path and fly straight at the Core — ground-only towers
  (Mortar, Tarpit, Throttler) can't touch them.
- 3 stars = finish with ≥90% Core Integrity.

## Code layout

```
index.html            app shell & screens
css/style.css         mobile-first UI
js/util.js            seeded RNG, math helpers
js/data.js            all balance data: towers, enemies, research, achievements
js/save.js            localStorage persistence & meta progression
js/audio.js           procedural WebAudio SFX + generative music
js/maps.js            deterministic map/path generation for the 50 levels
js/waves.js           wave composition & difficulty scaling
js/entities.js        Enemy / Tower / Projectile simulation
js/render.js          canvas renderer, pre-rendered neon sprites
js/game.js            game state machine & main loop
js/ui.js              DOM screens, HUD, input
sw.js                 offline cache service worker
manifest.webmanifest  PWA manifest
```

Debug hooks are exposed at `window.__TD` (e.g. `__TD.GAME.start(12, 'hard')`).
