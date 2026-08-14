# NEURAL SPIRE

**▶ Play: https://shaumik.github.io/ai-tower/**

Vertical tower defense built with Three.js for the **MHCP Creator Competition**
(Tower Defense & Strategy). Single-player, portrait, zero network requests.

The map is a literal tower — and **every run grows a new one**. The climb
path is procedurally generated from winding arcs, switchbacks, steep risers
and plaza rings, so where the good sockets are changes each run. Rogue
processes climb toward the summit core; you mount defenses on sockets
spiraling up the outside. **Gravity is a weapon** — Repulsor turrets hurl
climbers off the spire, and fall height pays a salvage bonus. The spire
blocks its own defenses (no shooting through the column) and fliers skip the
ramp entirely.

The economy is the second front: salvage from kills, **interest on unspent
reserves** each wave, a hard **power grid** fed by socket-hungry generators,
**pick-one wave directives** (market-style trades like Bull Market, War
Bonds, Insurance), the **SPIRE OS tech tree** competing with turret spending,
overclock bursts, and a wave-end income report.

| | | |
|---|---|---|
| ![Spire](docs/screens/spire.png) | ![Directives](docs/screens/directives.png) | ![SPIRE OS](docs/screens/spireos.png) |

## Competition submission

The three MHCP artefacts:

1. **Playable build** — `python3 tools/build_competition.py` assembles the
   modular sources (`css/`, `js/`) into a single readable, unminified
   `dist/index.html` and packages `dist/neural-spire-mhcp.zip`
   (index.html at the zip's top level; Three.js in `vendor/`, referenced
   with a relative path).
2. **Design Intent** — `submission/design-intent.docx`
3. **Build Log** — `BUILD_LOG.md`

## Development

Sources are modular for development: `js/*.js` + `css/style.css`, loaded by
the root `index.html`; `vendor/three.min.js` is the only dependency. Open
`index.html` with any static server or straight from `file://` — there is no
build step for dev.
