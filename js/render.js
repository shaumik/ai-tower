/* NEURAL SIEGE — canvas renderer. Neon vector art, pre-rendered sprites for mobile perf. */
'use strict';
const RENDER = (function () {
  let canvas, ctx, dpr = 1;
  let W = 0, H = 0;          // css pixels
  let T = 32, OX = 0, OY = 0; // tile size + origin (css px)
  let boardBottom = 0;        // css y of the board's bottom edge
  let mapLayer = null;        // offscreen pre-rendered map
  const sprites = {};         // cache

  const TOP_MARGIN = 58, BOTTOM_MARGIN = 148;

  function setup(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
  }

  function resize(game) {
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    if (game && game.level) {
      const lv = game.level;
      const availW = W - 8, availH = H - TOP_MARGIN - BOTTOM_MARGIN;
      T = Math.min(availW / lv.cols, availH / lv.rows);
      OX = (W - T * lv.cols) / 2;
      // anchor the board just under the HUD; spare height goes to the bottom
      const slack = availH - T * lv.rows;
      OY = TOP_MARGIN + Math.min(slack * 0.18, 24);
      boardBottom = OY + T * lv.rows;
      for (const k in sprites) delete sprites[k]; // rebuild at new scale
      buildMap(game);
    }
  }

  const sx = x => OX + x * T;
  const sy = y => OY + y * T;

  function screenToCell(px, py) {
    return { x: Math.floor((px - OX) / T), y: Math.floor((py - OY) / T) };
  }
  function screenToWorld(px, py) {
    return { x: (px - OX) / T, y: (py - OY) / T };
  }
  function cellToScreen(cx, cy) {
    return { x: OX + cx * T, y: OY + cy * T };
  }

  // ambient drifting motes, rebuilt per level
  let ambient = [];
  function buildAmbient(lv) {
    const r = UTIL.rng(lv.n * 977);
    ambient = [];
    for (let i = 0; i < 34; i++) {
      ambient.push({
        x: r() * lv.cols, y: r() * lv.rows,
        s: 0.02 + r() * 0.05, size: 0.5 + r() * 1.6, a: 0.06 + r() * 0.12,
      });
    }
  }

  // ================================================================ MAP LAYER
  function buildMap(game) {
    const lv = game.level;
    const sec = DATA.SECTORS[lv.sector];
    const w = Math.round(T * lv.cols * dpr), h = Math.round(T * lv.rows * dpr);
    buildAmbient(lv);
    mapLayer = document.createElement('canvas');
    mapLayer.width = w; mapLayer.height = h;
    const c = mapLayer.getContext('2d');
    c.scale(dpr, dpr);
    const tw = T * lv.cols, th = T * lv.rows;

    // board bg
    c.fillStyle = sec.bg;
    c.fillRect(0, 0, tw, th);

    // sector-colored nebula blobs for depth
    const rn = UTIL.rng(lv.n * 555);
    for (let i = 0; i < 4; i++) {
      const nx = rn() * tw, ny = rn() * th, nr = T * (3 + rn() * 4);
      const ng = c.createRadialGradient(nx, ny, 0, nx, ny, nr);
      ng.addColorStop(0, sec.glow + '16');
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = ng;
      c.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
    }

    // subtle grid + circuit traces
    c.strokeStyle = 'rgba(120,180,255,0.055)';
    c.lineWidth = 1;
    for (let x = 0; x <= lv.cols; x++) { c.beginPath(); c.moveTo(x * T, 0); c.lineTo(x * T, th); c.stroke(); }
    for (let y = 0; y <= lv.rows; y++) { c.beginPath(); c.moveTo(0, y * T); c.lineTo(tw, y * T); c.stroke(); }
    const r = UTIL.rng(lv.n * 31337);
    c.strokeStyle = 'rgba(120,180,255,0.10)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      let cx = UTIL.rint(r, 0, lv.cols) * T, cy = UTIL.rint(r, 0, lv.rows) * T;
      c.beginPath(); c.moveTo(cx, cy);
      for (let s = 0; s < 3; s++) {
        if (r() < 0.5) cx += (r() < 0.5 ? -1 : 1) * T * UTIL.rint(r, 1, 3);
        else cy += (r() < 0.5 ? -1 : 1) * T * UTIL.rint(r, 1, 3);
        c.lineTo(cx, cy);
      }
      c.stroke();
      c.fillStyle = 'rgba(120,180,255,0.16)';
      c.beginPath(); c.arc(cx, cy, 2.5, 0, 7); c.fill();
    }

    // path (data bus)
    const path = lv.path;
    const pw = T * 0.62;
    c.lineJoin = 'round'; c.lineCap = 'round';
    // outer glow
    c.strokeStyle = sec.glow; c.globalAlpha = 0.16; c.lineWidth = pw + T * 0.34;
    strokePath(c, path);
    c.globalAlpha = 1;
    // bed
    c.strokeStyle = '#0b0f1c'; c.lineWidth = pw + 6;
    strokePath(c, path);
    c.strokeStyle = shade(sec.path, 0.55); c.lineWidth = pw;
    strokePath(c, path);
    // inner rails
    c.strokeStyle = sec.glow; c.globalAlpha = 0.5; c.lineWidth = 2;
    strokePathOffset(c, path, pw / 2 - 2);
    strokePathOffset(c, path, -(pw / 2 - 2));
    c.globalAlpha = 1;

    // special terrain
    for (const tl of (lv.tiles || [])) {
      const tx = tl.x * T, ty = tl.y * T;
      if (tl.kind === 'hill') {
        // elevated pad: layered plates + chevron
        c.fillStyle = 'rgba(140,190,255,0.10)';
        roundRect(c, tx + T * 0.06, ty + T * 0.06, T * 0.88, T * 0.88, T * 0.14); c.fill();
        c.fillStyle = 'rgba(140,190,255,0.14)';
        roundRect(c, tx + T * 0.16, ty + T * 0.16, T * 0.68, T * 0.68, T * 0.1); c.fill();
        c.strokeStyle = 'rgba(159,212,255,0.8)'; c.lineWidth = 2; c.lineJoin = 'round';
        c.beginPath();
        c.moveTo(tx + T * 0.34, ty + T * 0.56); c.lineTo(tx + T * 0.5, ty + T * 0.38); c.lineTo(tx + T * 0.66, ty + T * 0.56);
        c.moveTo(tx + T * 0.34, ty + T * 0.72); c.lineTo(tx + T * 0.5, ty + T * 0.54); c.lineTo(tx + T * 0.66, ty + T * 0.72);
        c.stroke();
      } else if (tl.kind === 'power') {
        // glowing power socket
        c.shadowColor = '#ffd166'; c.shadowBlur = 12;
        c.strokeStyle = 'rgba(255,209,102,0.9)'; c.lineWidth = 2;
        roundRect(c, tx + T * 0.14, ty + T * 0.14, T * 0.72, T * 0.72, T * 0.12); c.stroke();
        c.fillStyle = 'rgba(255,209,102,0.16)';
        roundRect(c, tx + T * 0.14, ty + T * 0.14, T * 0.72, T * 0.72, T * 0.12); c.fill();
        c.fillStyle = '#ffd166';
        c.font = 'bold ' + Math.round(T * 0.42) + 'px monospace';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('⚡', tx + T / 2, ty + T * 0.54);
        c.shadowBlur = 0;
      } else if (tl.kind === 'dead') {
        // dead zone: red hatching
        c.strokeStyle = 'rgba(255,61,113,0.4)'; c.lineWidth = 2;
        roundRect(c, tx + T * 0.08, ty + T * 0.08, T * 0.84, T * 0.84, T * 0.1); c.stroke();
        c.save();
        c.beginPath();
        roundRect(c, tx + T * 0.08, ty + T * 0.08, T * 0.84, T * 0.84, T * 0.1); c.clip();
        c.strokeStyle = 'rgba(255,61,113,0.28)'; c.lineWidth = 1.5;
        for (let i = -1; i < 3; i++) {
          c.beginPath();
          c.moveTo(tx + i * T * 0.4, ty + T);
          c.lineTo(tx + i * T * 0.4 + T, ty);
          c.stroke();
        }
        c.restore();
      }
    }

    // blocked cells: server racks
    for (const b of lv.blocks) {
      const bx = b.x * T, by = b.y * T;
      c.fillStyle = '#0d1526';
      c.strokeStyle = 'rgba(120,180,255,0.25)';
      c.lineWidth = 1.5;
      roundRect(c, bx + T * 0.12, by + T * 0.12, T * 0.76, T * 0.76, T * 0.12);
      c.fill(); c.stroke();
      for (let i = 0; i < 3; i++) {
        c.fillStyle = i === 1 ? 'rgba(80,220,140,0.6)' : 'rgba(120,180,255,0.35)';
        c.fillRect(bx + T * 0.22, by + T * (0.24 + i * 0.19), T * 0.42, T * 0.07);
        c.beginPath(); c.arc(bx + T * 0.72, by + T * (0.275 + i * 0.19), T * 0.028, 0, 7);
        c.fillStyle = 'rgba(47,230,168,0.8)'; c.fill();
      }
    }

    // entry portal marker
    const p0 = path[0];
    c.save();
    c.translate(p0.x * T + T / 2, p0.y * T + T * 0.18);
    c.strokeStyle = '#ff5d8a'; c.lineWidth = 3; c.shadowColor = '#ff3d71'; c.shadowBlur = 12;
    c.beginPath(); c.moveTo(-T * 0.3, -T * 0.05); c.lineTo(0, T * 0.22); c.lineTo(T * 0.3, -T * 0.05); c.stroke();
    c.restore();
  }

  function strokePath(c, path) {
    c.beginPath();
    c.moveTo(path[0].x * T + T / 2, 0);
    for (const p of path) c.lineTo(p.x * T + T / 2, p.y * T + T / 2);
    c.stroke();
  }
  function strokePathOffset(c, path, off) {
    // cheap parallel rail: re-stroke slightly narrower with dashes
    c.save();
    c.setLineDash([T * 0.3, T * 0.22]);
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(path[0].x * T + T / 2, 0);
    for (const p of path) c.lineTo(p.x * T + T / 2, p.y * T + T / 2);
    c.stroke();
    c.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const rr = Math.round(((n >> 16) & 255) * f), gg = Math.round(((n >> 8) & 255) * f), bb = Math.round((n & 255) * f);
    return 'rgb(' + rr + ',' + gg + ',' + bb + ')';
  }

  // ================================================================ SPRITES
  function makeSprite(key, px, draw) {
    if (sprites[key]) return sprites[key];
    const cv = document.createElement('canvas');
    const s = Math.max(8, Math.round(px * dpr));
    cv.width = s; cv.height = s;
    const c = cv.getContext('2d');
    c.scale(s / 100, s / 100); // draw in 100x100 space
    c.translate(50, 50);
    draw(c);
    sprites[key] = cv;
    return cv;
  }

  // ================================================== ENEMY CREATURES
  // Art direction: "dark machines, glowing threats". Every enemy is a living
  // light source — an emissive body in its roster color under dark carapace
  // plating, with real anatomy (legs, rotors, jaws, treads) and a baked
  // 4-frame locomotion cycle. shadowBlur is allowed below because all of it
  // is baked into cached sprites; per-frame accents live in drawEnemy.
  const TAU = Math.PI * 2;
  const EFRAMES = 4;

  const _epal = {};
  function epal(color) {
    let p = _epal[color];
    if (p) return p;
    const n = parseInt(color.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const mx = (r2, g2, b2, f) => 'rgb(' + Math.round(r + (r2 - r) * f) + ',' +
      Math.round(g + (g2 - g) * f) + ',' + Math.round(b + (b2 - b) * f) + ')';
    p = {
      c: color,
      hot: mx(255, 255, 255, 0.72),  // white-hot highlight
      lit: mx(255, 255, 255, 0.38),  // bright flesh
      dim: mx(6, 8, 14, 0.55),       // shaded flesh
      dk:  mx(6, 8, 14, 0.74),       // dark limbs
      sh1: mx(16, 20, 30, 0.86),     // carapace top
      sh2: mx(5, 7, 13, 0.94),       // carapace bottom
      a: aa => 'rgba(' + r + ',' + g + ',' + b + ',' + aa + ')',
    };
    _epal[color] = p;
    return p;
  }

  // ambient light the creature casts on the board (additive)
  function eglow(c, P, x, y, rad, a) {
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, P.a(a)); g.addColorStop(1, P.a(0));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
    c.restore();
  }
  // emissive flesh sphere
  function eorb(c, P, x, y, rad) {
    const g = c.createRadialGradient(x - rad * 0.3, y - rad * 0.3, rad * 0.1, x, y, rad);
    g.addColorStop(0, P.lit); g.addColorStop(0.55, P.c); g.addColorStop(1, P.dim);
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 1.6; c.stroke();
  }
  // white-hot glowing eye
  function eeye(c, P, x, y, rad) {
    c.save(); c.globalCompositeOperation = 'lighter';
    c.shadowColor = P.c; c.shadowBlur = rad * 2.6;
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
    c.restore();
  }
  // fill + outline the current path as dark carapace
  function eshell(c, P, y0, y1) {
    const g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, P.sh1); g.addColorStop(1, P.sh2);
    c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.8; c.stroke();
  }
  // n walking legs per side, phased sin cycle, glowing knee joints
  function elegs(c, P, ph, n, x0, dx, hipY, footY, stride, lw) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (let s = -1; s <= 1; s += 2) for (let i = 0; i < n; i++) {
      const sw = Math.sin(ph + i * 2.4 + (s > 0 ? Math.PI : 0));
      const hx = x0 + i * dx, kx = hx + sw * stride * 0.55, fx = hx + sw * stride;
      const ky = s * (hipY + (footY - hipY) * 0.55);
      c.strokeStyle = P.dk; c.lineWidth = lw;
      c.beginPath(); c.moveTo(hx, s * hipY); c.lineTo(kx, ky); c.lineTo(fx, s * footY); c.stroke();
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = P.a(0.85);
      c.beginPath(); c.arc(kx, ky, lw * 0.42, 0, 7); c.fill();
      c.restore();
    }
  }
  function boltPath(c) {
    c.beginPath();
    c.moveTo(-34, -8); c.lineTo(4, 14); c.lineTo(4, 0); c.lineTo(34, 8);
    c.lineTo(-6, -16); c.lineTo(-6, -2); c.closePath();
  }
  function hexPath(c, r) {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 - Math.PI / 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.closePath();
  }

  // Painters draw in 100x100 space, centered, facing +x, at cycle phase ph.
  const CREATURES = {
    // SPAMBOT — hovering courier drone: glowing envelope body, dark top plate
    bot(c, P, ph) {
      eglow(c, P, 0, 0, 42, 0.4);
      for (const s of [-1, 1]) { // thruster pods (flames drawn live)
        c.fillStyle = P.sh2;
        roundRect(c, -30, s * 9 - 4.5, 12, 9, 3.5); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.4; c.stroke();
      }
      c.beginPath(); // glowing teardrop body
      c.moveTo(28, 0);
      c.quadraticCurveTo(24, -17, 0, -18);
      c.quadraticCurveTo(-22, -17, -24, 0);
      c.quadraticCurveTo(-22, 17, 0, 18);
      c.quadraticCurveTo(24, 17, 28, 0);
      c.closePath();
      const g = c.createLinearGradient(-24, 0, 28, 0);
      g.addColorStop(0, P.dim); g.addColorStop(0.55, P.c); g.addColorStop(1, P.lit);
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.8; c.stroke();
      c.beginPath(); // dark carapace over the rear half
      c.moveTo(4, -17.4);
      c.quadraticCurveTo(-22, -17, -24, 0);
      c.quadraticCurveTo(-22, 17, 4, 17.4);
      c.quadraticCurveTo(-6, 0, 4, -17.4);
      c.closePath();
      eshell(c, P, -17, 17);
      c.strokeStyle = P.a(0.55); c.lineWidth = 1.3; // rim light on plate edge
      c.beginPath(); c.moveTo(4, -16); c.quadraticCurveTo(-5.5, 0, 4, 16); c.stroke();
      c.strokeStyle = P.a(0.3); c.lineWidth = 1.6; // vents
      for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-18 + i * 6, -8); c.lineTo(-16 + i * 6, 8); c.stroke(); }
      eeye(c, P, 17, 0, 4.6);
      c.strokeStyle = P.dk; c.lineWidth = 2; // antenna with blinking tip
      c.beginPath(); c.moveTo(-8, -14); c.lineTo(-14, -27); c.stroke();
      const on = ph < TAU * 0.28;
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = on ? '#ffd166' : 'rgba(255,209,102,0.25)';
      if (on) { c.shadowColor = '#ffd166'; c.shadowBlur = 7; }
      c.beginPath(); c.arc(-14.5, -29, 3, 0, 7); c.fill();
      c.restore();
    },
    // AD CRAWLER — sleek dart with flapping swept wings
    dart(c, P, ph) {
      eglow(c, P, 4, 0, 38, 0.4);
      const flap = Math.sin(ph) * 3;
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(8, s * 4);
        c.quadraticCurveTo(-10, s * 16, -26, s * (22 + flap));
        c.quadraticCurveTo(-14, s * 10, -18, s * 5);
        c.closePath();
        eshell(c, P, 0, s * 22);
        c.strokeStyle = P.a(0.5); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(6, s * 4.5); c.quadraticCurveTo(-12, s * 15, -24, s * (20.6 + flap)); c.stroke();
      }
      c.beginPath(); // glowing needle fuselage
      c.moveTo(36, 0); c.quadraticCurveTo(10, -8, -20, -6);
      c.lineTo(-24, 0); c.lineTo(-20, 6); c.quadraticCurveTo(10, 8, 36, 0);
      c.closePath();
      const g = c.createLinearGradient(-24, 0, 36, 0);
      g.addColorStop(0, P.dim); g.addColorStop(0.5, P.c); g.addColorStop(1, P.hot);
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.5; c.stroke();
      c.beginPath(); // dark canopy
      c.moveTo(14, -3.6); c.quadraticCurveTo(0, -8, -14, -5); c.lineTo(-14, 5);
      c.quadraticCurveTo(0, 8, 14, 3.6); c.closePath();
      eshell(c, P, -7, 7);
      eeye(c, P, 20, 0, 3.4);
      c.fillStyle = P.sh2; roundRect(c, -27, -4, 7, 8, 2.5); c.fill();
    },
    // BLOATWARE — wobbling amoeba with crusty plates and stalk eyes
    blob(c, P, ph) {
      eglow(c, P, 0, 0, 44, 0.5);
      c.beginPath();
      for (let i = 0; i <= 14; i++) {
        const a = i / 14 * TAU;
        const r = 28 + Math.sin(a * 3 + ph) * 3.2 + Math.sin(a * 5 - ph) * 1.8;
        const x = Math.cos(a) * r * 1.08, y = Math.sin(a) * r;
        i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
      c.closePath();
      const g = c.createRadialGradient(6, -4, 3, 0, 0, 32);
      g.addColorStop(0, P.lit); g.addColorStop(0.55, P.c); g.addColorStop(1, P.dim);
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 2; c.stroke();
      for (const w of [[-12, -12, 8], [-2, 12, 6.5], [-18, 6, 5]]) { // crust plates
        c.fillStyle = P.sh1;
        c.beginPath(); c.arc(w[0], w[1], w[2], 0, 7); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1.2; c.stroke();
      }
      c.save(); c.globalCompositeOperation = 'lighter'; // shifting goo bubbles
      c.fillStyle = P.a(0.5);
      c.beginPath(); c.arc(Math.sin(ph) * 3, Math.cos(ph) * 2, 9, 0, 7); c.fill();
      c.fillStyle = P.a(0.7);
      c.beginPath(); c.arc(10 + Math.sin(ph + 1) * 2, 8, 3, 0, 7); c.fill();
      c.beginPath(); c.arc(-6, -18 + Math.cos(ph) * 2, 2.4, 0, 7); c.fill();
      c.restore();
      eeye(c, P, 20, -7, 3.4); eeye(c, P, 23, 4, 2.6);
    },
    // SWARMLING — tiny skittering mite
    tri(c, P, ph) {
      eglow(c, P, 0, 0, 36, 0.45);
      elegs(c, P, ph, 3, -12, 10, 10, 24, 9, 4);
      c.beginPath(); c.moveTo(26, 0); c.lineTo(-16, -13); c.lineTo(-20, 0); c.lineTo(-16, 13); c.closePath();
      const g = c.createLinearGradient(-20, 0, 26, 0);
      g.addColorStop(0, P.dim); g.addColorStop(1, P.lit);
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.6; c.stroke();
      c.beginPath(); c.moveTo(-4, -9); c.lineTo(-16, -12.4); c.lineTo(-19, 0); c.lineTo(-16, 12.4); c.lineTo(-4, 9); c.closePath();
      eshell(c, P, -12, 12);
      eeye(c, P, 12, 0, 3.2);
    },
    // TROJAN CARRIER — walking crate, payload light leaking from the seams
    box(c, P, ph) {
      eglow(c, P, 0, 0, 40, 0.35);
      elegs(c, P, ph, 2, -12, 18, 16, 27, 8, 5);
      roundRect(c, -24, -20, 48, 40, 6);
      eshell(c, P, -20, 20);
      c.save(); c.globalCompositeOperation = 'lighter'; // glowing seams
      c.strokeStyle = P.a(0.85); c.lineWidth = 2;
      c.shadowColor = P.c; c.shadowBlur = 6;
      c.beginPath(); c.moveTo(-24, -6); c.lineTo(24, -6); c.moveTo(-24, 8); c.lineTo(24, 8); c.stroke();
      c.beginPath(); c.moveTo(2, -20); c.lineTo(2, 20); c.stroke();
      c.restore();
      c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 2;
      roundRect(c, -24, -20, 48, 40, 6); c.stroke();
      c.strokeStyle = P.a(0.4); c.lineWidth = 1.3;
      c.beginPath(); c.moveTo(-18, -20); c.lineTo(14, -20); c.stroke();
      c.save(); c.globalCompositeOperation = 'lighter'; // eye slit
      c.shadowColor = P.c; c.shadowBlur = 8;
      c.fillStyle = '#fff';
      roundRect(c, 16, -5, 5, 10, 2); c.fill();
      c.restore();
    },
    // WORM / WORMLET — segmented undulating crawler with mandibles
    worm(c, P, ph, def) {
      const n = def && def.size > 0.25 ? 5 : 4;
      eglow(c, P, 0, 0, 42, 0.4);
      for (let i = n - 1; i >= 0; i--) {
        const x = 26 - i * (48 / (n - 1));
        const y = Math.sin(ph + i * 1.5) * 8;
        const r = i === 0 ? 13 : 12 - i * (5.5 / n);
        eorb(c, P, x, y, r);
        if (i > 0) { // dark dorsal scute
          c.beginPath(); c.arc(x, y, r * 0.94, Math.PI * 1.15, Math.PI * 1.85);
          c.strokeStyle = P.sh1; c.lineWidth = r * 0.55; c.stroke();
        }
      }
      const hy = Math.sin(ph) * 8;
      c.strokeStyle = P.dk; c.lineWidth = 3; c.lineCap = 'round'; // mandibles
      c.beginPath(); c.moveTo(34, hy - 5); c.quadraticCurveTo(42, hy - 6, 44, hy - 1); c.stroke();
      c.beginPath(); c.moveTo(34, hy + 5); c.quadraticCurveTo(42, hy + 6, 44, hy + 1); c.stroke();
      eeye(c, P, 31, hy - 4, 2.6); eeye(c, P, 31, hy + 4, 2.6);
    },
    // RECON DRONE — quadcopter, spinning rotors, glowing sensor core
    wing(c, P, ph) {
      eglow(c, P, 0, 0, 40, 0.4);
      for (const arm of [[15, -15], [15, 15], [-15, -15], [-15, 15]]) {
        c.strokeStyle = P.sh1; c.lineWidth = 4.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(arm[0] * 0.35, arm[1] * 0.35); c.lineTo(arm[0], arm[1]); c.stroke();
        c.save(); c.translate(arm[0], arm[1]);
        c.fillStyle = P.a(0.12);
        c.beginPath(); c.arc(0, 0, 11, 0, 7); c.fill();
        c.rotate(ph * 0.75 + (arm[0] > 0 ? 0 : 0.8) + (arm[1] > 0 ? 0.4 : 0));
        c.strokeStyle = P.a(0.75); c.lineWidth = 2;
        c.beginPath(); c.moveTo(-10, 0); c.lineTo(10, 0); c.moveTo(0, -10); c.lineTo(0, 10); c.stroke();
        c.fillStyle = P.sh2; c.beginPath(); c.arc(0, 0, 3, 0, 7); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1; c.stroke();
        c.restore();
      }
      eorb(c, P, 0, 0, 12);
      c.beginPath(); c.moveTo(14, -4); c.lineTo(4, -12); c.lineTo(-12, -8); c.lineTo(-14, 0); c.lineTo(-12, 8); c.lineTo(4, 12); c.lineTo(14, 4); c.closePath();
      eshell(c, P, -12, 12);
      c.strokeStyle = P.a(0.5); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(12, -4.5); c.lineTo(3, -11); c.stroke();
      eeye(c, P, 9.5, 0, 3.8);
    },
    // RANSOMWARE — armored padlock crab, keyhole eye, walking legs
    lock(c, P, ph) {
      eglow(c, P, 0, 0, 42, 0.4);
      elegs(c, P, ph, 3, -14, 13, 17, 30, 9, 5);
      c.strokeStyle = P.sh1; c.lineWidth = 8; // shackle at the rear
      c.beginPath(); c.arc(-22, 0, 15, Math.PI * 0.5, Math.PI * 1.5); c.stroke();
      c.strokeStyle = P.a(0.55); c.lineWidth = 2.2;
      c.beginPath(); c.arc(-22, 0, 18.5, Math.PI * 0.62, Math.PI * 1.38); c.stroke();
      roundRect(c, -20, -19, 44, 38, 7); // armored body, glowing toward the face
      const g = c.createLinearGradient(-20, 0, 24, 0);
      g.addColorStop(0, P.sh2); g.addColorStop(0.45, P.sh1); g.addColorStop(1, P.c);
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 2; c.stroke();
      c.fillStyle = P.a(0.6); // rivets
      for (const rv of [[-14, -13], [-14, 13], [16, -13], [16, 13]]) {
        c.beginPath(); c.arc(rv[0], rv[1], 1.8, 0, 7); c.fill();
      }
      c.strokeStyle = P.a(0.5); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-14, -18.6); c.lineTo(16, -18.6); c.stroke();
      c.save(); c.globalCompositeOperation = 'lighter'; // keyhole eye
      c.shadowColor = P.c; c.shadowBlur = 12;
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(8, 0, 6.5, 0, 7); c.fill();
      c.beginPath(); c.moveTo(8, -3); c.lineTo(-4, -5.5); c.lineTo(-4, 5.5); c.lineTo(8, 3); c.closePath(); c.fill();
      c.restore();
    },
    // DATA LEECH — inching slug, sucker mouth, dorsal scutes
    leech(c, P, ph) {
      eglow(c, P, 0, 0, 40, 0.4);
      const st = Math.sin(ph);
      const L = 32 + st * 4, Wd = 13 - st * 1.5;
      c.strokeStyle = P.dk; c.lineWidth = 3.5; c.lineCap = 'round'; // tail fork
      c.beginPath(); c.moveTo(-L + 4, 0); c.lineTo(-L - 9, -7); c.moveTo(-L + 4, 0); c.lineTo(-L - 9, 7); c.stroke();
      c.beginPath(); c.ellipse(0, 0, L, Wd, 0, 0, 7);
      const g = c.createLinearGradient(-L, 0, L, 0);
      g.addColorStop(0, P.dim); g.addColorStop(0.6, P.c); g.addColorStop(1, P.lit);
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.8; c.stroke();
      c.strokeStyle = P.sh1; c.lineWidth = 5.5; c.lineCap = 'round'; // dorsal scutes
      for (let i = 0; i < 4; i++) {
        const x = -L * 0.66 + i * L * 0.36;
        c.beginPath(); c.arc(x, 4, Wd * (1.02 - i * 0.06), -2.25, -0.89); c.stroke();
      }
      c.fillStyle = P.sh2; // sucker mouth
      c.beginPath(); c.ellipse(L - 4, 0, 6.5, 7.5, 0, 0, 7); c.fill();
      c.save(); c.globalCompositeOperation = 'lighter';
      c.shadowColor = P.c; c.shadowBlur = 8;
      c.fillStyle = P.hot;
      c.beginPath(); c.ellipse(L - 3.5, 0, 3.4, 4.4, 0, 0, 7); c.fill();
      c.restore();
      c.strokeStyle = 'rgba(0,0,0,0.85)'; c.lineWidth = 1.4; // fangs in the glow
      c.beginPath(); c.moveTo(L - 6, -3.4); c.lineTo(L - 1.5, 0); c.lineTo(L - 6, 3.4); c.stroke();
      eeye(c, P, L - 13, -6.5, 2.2); eeye(c, P, L - 13, 6.5, 2.2);
    },
    // GAN REGENERATOR — twin orbs trading a healing arc
    twin(c, P, ph) {
      eglow(c, P, 0, 0, 44, 0.45);
      for (const s of [-1, 1]) {
        const r = s < 0 ? 15 : 13;
        eorb(c, P, 2, s * 18, r);
        c.beginPath(); c.arc(2, s * 18, r * 0.9, Math.PI * 0.6, Math.PI * 1.4);
        c.strokeStyle = P.sh1; c.lineWidth = r * 0.5; c.stroke();
        eeye(c, P, 2 + r * 0.6, s * 18, 2.8);
      }
      c.save(); c.globalCompositeOperation = 'lighter'; // energy tether on top
      c.strokeStyle = P.a(0.9); c.lineWidth = 2.2;
      c.shadowColor = P.c; c.shadowBlur = 7;
      c.beginPath(); c.moveTo(2, -10);
      for (let i = 1; i <= 4; i++) c.lineTo(2 + (i % 2 ? 5.5 : -5.5) * Math.sin(ph + i), -10 + i * 5);
      c.stroke();
      c.fillStyle = '#fff'; // spark travelling along it
      c.beginPath(); c.arc(2 + Math.sin(ph * 2) * 4, Math.sin(ph) * 10, 2.6, 0, 7); c.fill();
      c.restore();
    },
    // DEEPFAKE — floating hollow-eyed face trailing veil wisps
    mask(c, P, ph) {
      eglow(c, P, 0, 0, 40, 0.4);
      c.strokeStyle = P.a(0.35); c.lineWidth = 3.5; c.lineCap = 'round'; // wisps
      for (let i = -1; i <= 1; i++) {
        c.beginPath(); c.moveTo(-10, i * 8);
        c.quadraticCurveTo(-22, i * 12 + Math.sin(ph + i * 2) * 4, -34, i * 14 + Math.sin(ph + i) * 6);
        c.stroke();
      }
      c.save(); c.globalAlpha = 0.35; c.translate(2.5, -2); // glitch double
      c.beginPath(); c.ellipse(4, 0, 17, 24, 0.12, 0, 7);
      c.strokeStyle = P.c; c.lineWidth = 1.6; c.stroke();
      c.restore();
      c.beginPath(); c.ellipse(4, 0, 17, 24, 0, 0, 7); // pale glowing face
      const g = c.createRadialGradient(8, -6, 2, 4, 0, 24);
      g.addColorStop(0, P.hot); g.addColorStop(0.6, P.c); g.addColorStop(1, P.dim);
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 1.8; c.stroke();
      c.beginPath(); c.ellipse(4, -14, 16.4, 10, 0, Math.PI, 0); c.closePath(); // brow plate
      eshell(c, P, -24, -4);
      c.fillStyle = '#05070d'; // slanted hollow eyes
      c.beginPath(); c.moveTo(3, -10); c.lineTo(14, -6.5); c.lineTo(12, -1); c.lineTo(5, -3); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(-8, -9); c.lineTo(1, -9.6); c.lineTo(-1, -2.6); c.lineTo(-8, -4.4); c.closePath(); c.fill();
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = P.a(0.95);
      c.beginPath(); c.arc(10, -4.5, 1.5, 0, 7); c.arc(-3.5, -5.5, 1.5, 0, 7); c.fill();
      c.restore();
      c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 2; // glitch mouth
      c.beginPath(); c.moveTo(-6, 12); c.lineTo(0, 10); c.lineTo(4, 13); c.lineTo(9, 10.4); c.stroke();
    },
    // BOTNET NODE — hexapod relay, command pings running its spokes
    hub(c, P, ph) {
      eglow(c, P, 0, 0, 46, 0.45);
      elegs(c, P, ph, 3, -16, 14, 15, 28, 8, 5);
      const lit = Math.floor(ph / TAU * 6 + 0.01) % 6;
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6 + TAU / 12;
        const cx2 = Math.cos(a), cy2 = Math.sin(a);
        c.strokeStyle = P.sh1; c.lineWidth = 4;
        c.beginPath(); c.moveTo(cx2 * 14, cy2 * 14); c.lineTo(cx2 * 30, cy2 * 30); c.stroke();
        c.save(); c.globalCompositeOperation = 'lighter';
        const on = i === lit || i === (lit + 3) % 6;
        c.fillStyle = on ? '#fff' : P.a(0.4);
        if (on) { c.shadowColor = P.c; c.shadowBlur = 8; }
        c.beginPath(); c.arc(cx2 * 30, cy2 * 30, on ? 3.6 : 2.6, 0, 7); c.fill();
        c.restore();
      }
      eorb(c, P, 0, 0, 13);
      c.strokeStyle = P.sh1; c.lineWidth = 6;
      c.beginPath(); c.arc(0, 0, 16.5, 0, 7); c.stroke();
      c.strokeStyle = P.a(0.5); c.lineWidth = 1.3;
      c.beginPath(); c.arc(0, 0, 19.2, -2.4, -0.6); c.stroke();
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = P.a(0.5 + 0.3 * Math.sin(ph));
      c.beginPath(); c.arc(0, 0, 8, 0, 7); c.fill();
      c.restore();
    },
    // SIGNAL JAMMER — tracked crawler, static-spitting spikes, ✕ dish
    jam(c, P, ph) {
      eglow(c, P, 0, 0, 42, 0.4);
      for (const s of [-1, 1]) { // treads with scrolling lugs
        c.fillStyle = P.sh2;
        roundRect(c, -22, s * 14 - 5, 44, 10, 4); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.6; c.stroke();
        c.strokeStyle = P.a(0.35); c.lineWidth = 2;
        const off = ph / TAU * 8;
        for (let i = 0; i < 6; i++) {
          const x = -20 + ((i * 8 + off) % 42);
          c.beginPath(); c.moveTo(x, s * 14 - 4); c.lineTo(x, s * 14 + 4); c.stroke();
        }
      }
      for (let i = 0; i < 4; i++) { // interference spikes
        const a = i * TAU / 4 + TAU / 8;
        const cx2 = Math.cos(a), cy2 = Math.sin(a);
        c.strokeStyle = P.dk; c.lineWidth = 3; c.lineCap = 'round';
        c.beginPath(); c.moveTo(cx2 * 12, cy2 * 12); c.lineTo(cx2 * 30, cy2 * 30); c.stroke();
        c.save(); c.globalCompositeOperation = 'lighter';
        c.strokeStyle = P.a(0.8); c.lineWidth = 1.6;
        const j = Math.sin(ph + i * 1.7) * 3;
        c.beginPath();
        c.moveTo(cx2 * 30 - 4, cy2 * 30 + j);
        c.lineTo(cx2 * 30 + 1, cy2 * 30 - j);
        c.lineTo(cx2 * 30 + 5, cy2 * 30 + j * 0.6);
        c.stroke();
        c.restore();
      }
      eorb(c, P, 0, 0, 15);
      c.beginPath(); c.arc(0, 0, 15.5, Math.PI * 0.6, Math.PI * 2.4);
      c.strokeStyle = P.sh1; c.lineWidth = 7; c.stroke();
      c.save(); c.globalCompositeOperation = 'lighter'; // the ✕ dish
      c.strokeStyle = '#fff'; c.lineWidth = 3.4; c.lineCap = 'round';
      c.shadowColor = P.c; c.shadowBlur = 9;
      c.beginPath(); c.moveTo(-6, -6); c.lineTo(6, 6); c.moveTo(6, -6); c.lineTo(-6, 6); c.stroke();
      c.restore();
    },
    // OVERFIT GOLEM — stone slabs grinding over a molten core
    golem(c, P, ph) {
      eglow(c, P, 0, 0, 42, 0.45);
      const stp = Math.sin(ph);
      // molten core body peeking out everywhere the plates don't cover
      c.beginPath(); c.ellipse(0, 0, 27, 24, 0, 0, 7);
      const cg = c.createRadialGradient(2, 0, 2, 0, 0, 26);
      cg.addColorStop(0, P.hot); cg.addColorStop(0.5, P.c); cg.addColorStop(1, P.dim);
      c.fillStyle = cg; c.fill();
      for (const s of [-1, 1]) { // armor slabs, alternating with the stomp
        const fw = stp * 4 * s;
        c.beginPath();
        c.moveTo(-28 + fw, s * 26); c.lineTo(22 + fw, s * 26);
        c.lineTo(27 + fw, s * 7); c.lineTo(-24 + fw, s * 5);
        c.closePath();
        eshell(c, P, s * 26, s * 5);
        c.strokeStyle = P.a(0.35); c.lineWidth = 1.4; // plate cracks
        c.beginPath(); c.moveTo(-12 + fw, s * 25); c.lineTo(-8 + fw, s * 14); c.lineTo(-14 + fw, s * 8); c.stroke();
        c.beginPath(); c.moveTo(8 + fw, s * 25); c.lineTo(12 + fw, s * 12); c.stroke();
      }
      c.save(); c.globalCompositeOperation = 'lighter'; // molten seam
      c.strokeStyle = P.a(0.95); c.lineWidth = 4.5; c.lineCap = 'round';
      c.shadowColor = P.c; c.shadowBlur = 12;
      c.beginPath(); c.moveTo(-25, 0);
      for (let i = 0; i < 5; i++) c.lineTo(-17 + i * 9, (i % 2 ? -3 : 3));
      c.lineTo(23, 0); c.stroke();
      c.restore();
      roundRect(c, 20, -10, 15, 20, 4); // head block
      eshell(c, P, -10, 10);
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = '#ffdd55'; c.shadowColor = '#ffb300'; c.shadowBlur = 8;
      c.beginPath(); c.arc(30, -4, 2.6, 0, 7); c.fill();
      c.beginPath(); c.arc(30, 4, 2.6, 0, 7); c.fill();
      c.restore();
      for (const s of [-1, 1]) { // knuckles
        c.fillStyle = P.sh1;
        c.beginPath(); c.arc(28 - stp * 4 * s, s * 19, 7, 0, 7); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.4; c.stroke();
      }
    },
    // PHISHER — angler fish dangling a glowing hook
    hook(c, P, ph) {
      eglow(c, P, 10, -6, 36, 0.35);
      c.save(); c.translate(-18, 0); c.rotate(Math.sin(ph) * 0.35); // tail wag
      c.beginPath(); c.moveTo(0, 0); c.lineTo(-16, -10); c.lineTo(-12, 0); c.lineTo(-16, 10); c.closePath();
      eshell(c, P, -10, 10);
      c.restore();
      c.beginPath(); // dark fish body, glowing underbelly
      c.moveTo(20, 0); c.quadraticCurveTo(14, -13, -4, -12); c.quadraticCurveTo(-20, -9, -20, 0);
      c.quadraticCurveTo(-20, 9, -4, 12); c.quadraticCurveTo(14, 13, 20, 0);
      c.closePath();
      const g = c.createLinearGradient(0, -13, 0, 13);
      g.addColorStop(0, P.sh1); g.addColorStop(0.55, P.sh2); g.addColorStop(1, P.dim);
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.65)'; c.lineWidth = 1.8; c.stroke();
      c.save(); c.globalCompositeOperation = 'lighter'; // toothy jaw
      c.strokeStyle = P.a(0.75); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(19, 1);
      for (let i = 0; i < 4; i++) { c.lineTo(15 - i * 5, 6); c.lineTo(12 - i * 5, 2.6); }
      c.stroke();
      c.restore();
      eeye(c, P, 10, -4.5, 3);
      const hx = 27 + Math.sin(ph) * 2.5, hy = -14 + Math.cos(ph) * 2; // the lure
      c.strokeStyle = P.dk; c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(6, -11); c.quadraticCurveTo(18, -24, hx, hy); c.stroke();
      c.save(); c.globalCompositeOperation = 'lighter';
      c.strokeStyle = '#fff'; c.lineWidth = 2.6; c.lineCap = 'round';
      c.shadowColor = P.c; c.shadowBlur = 10;
      c.beginPath(); c.arc(hx, hy + 6, 5, -1.4, 1.9); c.stroke();
      c.fillStyle = P.hot;
      c.beginPath(); c.arc(hx, hy, 3, 0, 7); c.fill();
      c.restore();
    },
    // QUANTUM GLITCH — nucleus with orbiting electrons + glitch shards
    qbit(c, P, ph) {
      eglow(c, P, 0, 0, 40, 0.5);
      for (const rot of [0.6, -0.6]) {
        c.save(); c.rotate(rot);
        c.strokeStyle = P.sh1; c.lineWidth = 3.4;
        c.beginPath(); c.ellipse(0, 0, 32, 12, 0, 0, 7); c.stroke();
        c.strokeStyle = P.a(0.4); c.lineWidth = 1.2;
        c.beginPath(); c.ellipse(0, 0, 32, 12, 0, -2.2, -0.7); c.stroke();
        const ea = ph * (rot > 0 ? 1 : -1) + (rot > 0 ? 0 : 2);
        c.save(); c.globalCompositeOperation = 'lighter';
        c.fillStyle = '#fff'; c.shadowColor = P.c; c.shadowBlur = 8;
        c.beginPath(); c.arc(Math.cos(ea) * 32, Math.sin(ea) * 12, 2.8, 0, 7); c.fill();
        c.restore();
        c.restore();
      }
      c.save(); c.globalAlpha = 0.3; c.fillStyle = P.c; // superposition shards
      c.fillRect(-16 + Math.sin(ph * 2) * 5, -3, 10, 2.4);
      c.fillRect(8, 6 + Math.cos(ph * 2) * 4, 9, 2.2);
      c.restore();
      eorb(c, P, 0, 0, 10);
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.4 * Math.sin(ph * 2)).toFixed(3) + ')';
      c.beginPath(); c.arc(0, 0, 4.5, 0, 7); c.fill();
      c.restore();
    },
    // ZERO-DAY — sprinting bolt with afterimages and crackle
    flash(c, P, ph) {
      eglow(c, P, 0, 0, 40, 0.5);
      for (const im of [[-13, 0.14], [-7, 0.26]]) { // afterimages
        c.save(); c.globalAlpha = im[1]; c.translate(im[0], 0);
        boltPath(c); c.fillStyle = P.c; c.fill();
        c.restore();
      }
      boltPath(c);
      const g = c.createLinearGradient(-24, 0, 26, 0);
      g.addColorStop(0, P.c); g.addColorStop(1, P.hot);
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 1.6; c.stroke();
      c.beginPath(); c.moveTo(30, 4); c.lineTo(16, -2); c.lineTo(12, 6); c.closePath(); // visor
      eshell(c, P, -2, 6);
      c.save(); c.globalCompositeOperation = 'lighter'; // crackle
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.4;
      const j = Math.sin(ph);
      c.beginPath(); c.moveTo(-6, -12 + j * 3); c.lineTo(0, -16 - j * 3); c.lineTo(4, -11 + j * 2); c.stroke();
      c.beginPath(); c.moveTo(-2, 13 - j * 2); c.lineTo(4, 16 + j * 3); c.stroke();
      c.restore();
    },
    // HYDRA PROCESS — three swaying serpent heads on a scaled mound
    hydra(c, P, ph) {
      eglow(c, P, 0, 0, 44, 0.4);
      eorb(c, P, -16, 0, 15);
      c.strokeStyle = P.sh1; c.lineWidth = 8;
      c.beginPath(); c.arc(-16, 0, 12.5, Math.PI * 0.55, Math.PI * 1.45); c.stroke();
      for (let i = -1; i <= 1; i++) {
        const sway = Math.sin(ph + i * 2.1) * 4;
        const hx = 25 + (i === 0 ? 5 : 0), hy = i * 21 + sway;
        c.strokeStyle = P.dk; c.lineWidth = 8; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-12, i * 4); c.quadraticCurveTo(6, i * 18, hx - 6, hy); c.stroke();
        c.strokeStyle = P.a(0.5); c.lineWidth = 2.2;
        c.beginPath(); c.moveTo(-10, i * 4 + 3); c.quadraticCurveTo(6, i * 18 + 3, hx - 7, hy + 3); c.stroke();
        eorb(c, P, hx, hy, 9.5);
        c.strokeStyle = P.sh1; c.lineWidth = 5;
        c.beginPath(); c.arc(hx, hy, 8, Math.PI * 0.7, Math.PI * 1.3); c.stroke();
        c.strokeStyle = P.dk; c.lineWidth = 2.6; // open jaws
        c.beginPath(); c.moveTo(hx + 7, hy - 3.5); c.lineTo(hx + 14, hy - 6.5); c.stroke();
        c.beginPath(); c.moveTo(hx + 7, hy + 3.5); c.lineTo(hx + 14, hy + 6.5); c.stroke();
        eeye(c, P, hx + 3.5, hy - 3, 2.1);
      }
    },
    // GHOST PROTOCOL — spectral comet with hollow eyes and tattered tail
    ghost(c, P, ph) {
      eglow(c, P, 6, 0, 40, 0.45);
      c.save(); c.globalAlpha = 0.55; // tail streamers
      for (let i = -1; i <= 1; i++) {
        c.beginPath();
        c.moveTo(0, i * 8);
        c.quadraticCurveTo(-16, i * 12 + Math.sin(ph + i) * 5, -30, i * 10 + Math.sin(ph + i * 2) * 7);
        c.quadraticCurveTo(-14, i * 14 + 4, 0, i * 8 + 5);
        c.closePath();
        c.fillStyle = P.a(0.4); c.fill();
      }
      c.restore();
      c.beginPath(); // body: round front, scalloped rear
      c.arc(8, 0, 17, -Math.PI / 2, Math.PI / 2);
      c.lineTo(-4, 12); c.lineTo(-12, 17 - Math.sin(ph) * 3); c.lineTo(-10, 6);
      c.lineTo(-18, 0); c.lineTo(-10, -6); c.lineTo(-12, -17 + Math.sin(ph) * 3); c.lineTo(-4, -12);
      c.closePath();
      const g = c.createRadialGradient(12, 0, 2, 6, 0, 24);
      g.addColorStop(0, P.hot); g.addColorStop(0.55, P.c); g.addColorStop(1, P.a(0.15));
      c.fillStyle = g; c.fill();
      c.strokeStyle = P.a(0.6); c.lineWidth = 1.6; c.stroke();
      c.beginPath(); c.arc(8, 0, 16, -Math.PI * 0.85, -Math.PI * 0.15); // dark cowl
      c.strokeStyle = P.sh1; c.lineWidth = 6; c.stroke();
      c.fillStyle = '#05070d'; // hollow eyes
      c.beginPath(); c.ellipse(14, -7, 4.4, 6, 0.55, 0, 7); c.fill();
      c.beginPath(); c.ellipse(14, 7, 4.4, 6, -0.55, 0, 7); c.fill();
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(15.5, -6, 1.5, 0, 7); c.arc(15.5, 6, 1.5, 0, 7); c.fill();
      c.restore();
    },
    // JUGGERNAUT — treaded siege platform with reactor slits
    tank(c, P, ph) {
      eglow(c, P, 0, 0, 42, 0.3);
      for (const s of [-1, 1]) { // treads
        c.fillStyle = P.sh2;
        roundRect(c, -32, s * 19 - 8, 64, 16, 5); c.fill();
        c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineWidth = 2; c.stroke();
        c.strokeStyle = P.a(0.3); c.lineWidth = 2.4;
        const off = ph / TAU * 10;
        for (let i = 0; i < 7; i++) {
          const x = -29 + ((i * 10 + off) % 60);
          c.beginPath(); c.moveTo(x, s * 19 - 6); c.lineTo(x, s * 19 + 6); c.stroke();
        }
      }
      roundRect(c, -28, -16, 56, 32, 6); // hull
      eshell(c, P, -16, 16);
      c.strokeStyle = P.a(0.4); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(-22, -15.2); c.lineTo(18, -15.2); c.stroke();
      c.beginPath(); c.moveTo(28, -14); c.lineTo(38, -8); c.lineTo(38, 8); c.lineTo(28, 14); c.closePath(); // dozer blade
      eshell(c, P, -14, 14);
      c.strokeStyle = P.a(0.5); c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(37, -7); c.lineTo(37, 7); c.stroke();
      c.save(); c.globalCompositeOperation = 'lighter'; // reactor slits
      c.shadowColor = P.c; c.shadowBlur = 8;
      c.fillStyle = P.a(0.95);
      for (let i = 0; i < 3; i++) { roundRect(c, -14 + i * 12, -3, 7, 6, 2); c.fill(); }
      c.restore();
      c.fillStyle = P.sh1; c.beginPath(); c.arc(-16, 0, 7, 0, 7); c.fill(); // cupola
      c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 1.6; c.stroke();
      eeye(c, P, -16, 0, 2.6);
    },
    // MIRAGE / DECOY — refracting crystal with orbiting shards
    mirror(c, P, ph) {
      eglow(c, P, 0, 0, 40, 0.5);
      for (let i = 0; i < 2; i++) { // shard satellites
        const a = ph + i * Math.PI;
        c.save(); c.translate(Math.cos(a) * 30, Math.sin(a) * 20); c.rotate(a * 2);
        c.fillStyle = P.a(0.65);
        c.beginPath(); c.moveTo(0, -5); c.lineTo(3.4, 3); c.lineTo(-3.4, 3); c.closePath(); c.fill();
        c.restore();
      }
      c.beginPath(); c.moveTo(26, 0); c.lineTo(0, -19); c.lineTo(-24, 0); c.lineTo(0, 19); c.closePath();
      const g = c.createLinearGradient(-24, -10, 26, 10);
      g.addColorStop(0, P.dim); g.addColorStop(0.5, P.a(0.55)); g.addColorStop(1, P.lit);
      c.fillStyle = g; c.fill();
      c.strokeStyle = P.a(0.9); c.lineWidth = 2; c.stroke();
      c.strokeStyle = 'rgba(0,0,0,0.45)'; c.lineWidth = 1.4; // facets
      c.beginPath(); c.moveTo(0, -19); c.lineTo(0, 19); c.moveTo(-24, 0); c.lineTo(26, 0); c.stroke();
      c.save(); c.globalCompositeOperation = 'lighter';
      c.shadowColor = P.c; c.shadowBlur = 10;
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(2, 0, 4, 0, 7); c.fill();
      c.shadowBlur = 0;
      const ga = ph + 0.7, gx = Math.cos(ga) * 10, gy = Math.sin(ga) * 8; // roaming glint
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(gx - 4, gy); c.lineTo(gx + 4, gy); c.moveTo(gx, gy - 4); c.lineTo(gx, gy + 4); c.stroke();
      c.restore();
    },
    // COMPUTE TITAN — hex fortress striding on six armored legs
    titan(c, P, ph) {
      eglow(c, P, 0, 0, 46, 0.4);
      elegs(c, P, ph, 3, -20, 20, 22, 40, 10, 6);
      hexPath(c, 40);
      eshell(c, P, -40, 40);
      c.save(); c.globalCompositeOperation = 'lighter'; // glowing plate seams
      c.strokeStyle = P.a(0.55); c.lineWidth = 1.8;
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6 - Math.PI / 2;
        c.beginPath(); c.moveTo(Math.cos(a) * 16, Math.sin(a) * 16); c.lineTo(Math.cos(a) * 38, Math.sin(a) * 38); c.stroke();
      }
      c.restore();
      hexPath(c, 22);
      c.fillStyle = P.sh2; c.fill();
      c.strokeStyle = P.a(0.35); c.lineWidth = 1.4; c.stroke();
      eorb(c, P, 0, 0, 9);
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255,255,255,' + (0.55 + 0.35 * Math.sin(ph)).toFixed(3) + ')';
      c.beginPath(); c.arc(0, 0, 4, 0, 7); c.fill();
      const litI = Math.floor(ph / TAU * 6) % 6; // vents pulse in sequence
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6 - Math.PI / 2;
        c.fillStyle = i === litI ? '#fff' : P.a(0.5);
        c.beginPath(); c.arc(Math.cos(a) * 30, Math.sin(a) * 30, i === litI ? 3.4 : 2.4, 0, 7); c.fill();
      }
      c.restore();
    },
    // -------- BOSSES --------
    // KERNEL PANIC — cracked hex reactor crawling on six legs
    bosskernel(c, P, ph) {
      eglow(c, P, 0, 0, 46, 0.5);
      elegs(c, P, ph, 3, -18, 17, 26, 43, 10, 6);
      c.save(); c.rotate(ph * 0.5); // rotating hazard arcs
      c.strokeStyle = P.a(0.7); c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, 46, 0.2, 1.4); c.stroke();
      c.beginPath(); c.arc(0, 0, 46, Math.PI + 0.2, Math.PI + 1.4); c.stroke();
      c.restore();
      hexPath(c, 38);
      eshell(c, P, -38, 38);
      c.save(); c.globalCompositeOperation = 'lighter'; // magma cracks
      c.strokeStyle = P.a(0.9); c.lineWidth = 2.6; c.lineCap = 'round';
      c.shadowColor = P.c; c.shadowBlur = 8;
      for (let i = 0; i < 5; i++) {
        const a = i * TAU / 5 + 0.5;
        const j = Math.sin(ph + i * 1.9) * 2.5;
        c.beginPath();
        c.moveTo(Math.cos(a) * 13, Math.sin(a) * 13);
        c.lineTo(Math.cos(a + 0.18) * 24 + j, Math.sin(a + 0.18) * 24);
        c.lineTo(Math.cos(a - 0.1) * 35, Math.sin(a - 0.1) * 35 + j);
        c.stroke();
      }
      c.restore();
      eorb(c, P, 0, 0, 14);
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = '#fff'; c.shadowColor = P.c; c.shadowBlur = 12;
      c.font = 'bold 20px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('!', 0, 1);
      c.restore();
    },
    // THE BOTMASTER — spider queen herding the botnet
    bossmaster(c, P, ph) {
      eglow(c, P, 0, 0, 46, 0.5);
      c.lineCap = 'round';
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { // 8 long legs
        const sw = Math.sin(ph + i * 1.65 + (s > 0 ? Math.PI : 0));
        const hx = -10 + i * 9;
        const kx = hx + sw * 5, fx = hx + sw * 11;
        c.strokeStyle = P.dk; c.lineWidth = 5;
        c.beginPath(); c.moveTo(hx, s * 12); c.lineTo(kx, s * 30); c.lineTo(fx, s * 44); c.stroke();
        c.save(); c.globalCompositeOperation = 'lighter';
        c.fillStyle = P.a(0.8); c.beginPath(); c.arc(kx, s * 30, 2.2, 0, 7); c.fill();
        c.restore();
      }
      eorb(c, P, -16, 0, 17); // abdomen
      c.strokeStyle = P.sh1; c.lineWidth = 7;
      c.beginPath(); c.arc(-16, 0, 13, Math.PI * 0.55, Math.PI * 1.45); c.stroke();
      c.fillStyle = P.sh1;
      c.beginPath(); c.moveTo(-16, -10); c.lineTo(-10, 0); c.lineTo(-16, 10); c.lineTo(-22, 0); c.closePath(); c.fill();
      eorb(c, P, 8, 0, 12); // thorax under head carapace
      c.beginPath(); c.moveTo(20, -5); c.lineTo(12, -12); c.lineTo(-2, -10); c.lineTo(-4, 0); c.lineTo(-2, 10); c.lineTo(12, 12); c.lineTo(20, 5); c.closePath();
      eshell(c, P, -12, 12);
      eeye(c, P, 16, -5, 2.6); eeye(c, P, 16, 5, 2.6);
      eeye(c, P, 12.5, -9, 1.8); eeye(c, P, 12.5, 9, 1.8);
      const on = Math.floor(ph / TAU * 4) % 4; // crown antennae, blinking
      for (let i = -1; i <= 1; i++) {
        c.strokeStyle = P.dk; c.lineWidth = 2;
        c.beginPath(); c.moveTo(-26, i * 5); c.quadraticCurveTo(-34, i * 10, -40, i * 14); c.stroke();
        c.save(); c.globalCompositeOperation = 'lighter';
        const b = on === (i + 1);
        c.fillStyle = b ? '#fff' : P.a(0.35);
        if (b) { c.shadowColor = P.c; c.shadowBlur = 8; }
        c.beginPath(); c.arc(-40, i * 14, 3, 0, 7); c.fill();
        c.restore();
      }
    },
    // DEEPFAKE PRIME — a true face and its phasing wireframe twin
    bossfake(c, P, ph) {
      eglow(c, P, 0, 0, 46, 0.45);
      for (let i = 0; i < 3; i++) { // orbiting shards
        const a = ph + i * TAU / 3;
        c.save(); c.translate(Math.cos(a) * 40, Math.sin(a) * 26); c.rotate(a);
        c.fillStyle = P.a(0.5);
        c.beginPath(); c.ellipse(0, 0, 3, 6, 0, 0, 7); c.fill();
        c.restore();
      }
      c.beginPath(); c.ellipse(-8, 0, 22, 32, 0.12, 0, 7); // the true face
      const g = c.createRadialGradient(-2, -6, 3, -8, 0, 32);
      g.addColorStop(0, P.hot); g.addColorStop(0.6, P.c); g.addColorStop(1, P.dim);
      c.fillStyle = g; c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.ellipse(-8, -18, 20, 12, 0.1, Math.PI, 0); c.closePath(); // brow plate
      eshell(c, P, -32, -8);
      c.save(); c.globalAlpha = 0.45 + 0.3 * Math.sin(ph); // phasing twin
      c.setLineDash([7, 5]);
      c.strokeStyle = P.a(0.9); c.lineWidth = 2.2;
      c.beginPath(); c.ellipse(14, 0, 22, 32, -0.15, 0, 7); c.stroke();
      c.beginPath(); c.ellipse(20, -8, 4.5, 7, -0.3, 0, 7); c.stroke();
      c.setLineDash([]);
      c.restore();
      c.fillStyle = '#05070d'; // hollow eyes
      c.beginPath(); c.ellipse(-14, -8, 5.5, 8.5, 0.3, 0, 7); c.fill();
      c.beginPath(); c.ellipse(0, -8, 5.5, 8.5, -0.3, 0, 7); c.fill();
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(-13, -6, 1.8, 0, 7); c.arc(1, -6, 1.8, 0, 7); c.fill();
      c.restore();
      c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 2; // stitched mouth
      c.beginPath(); c.moveTo(-18, 14); c.quadraticCurveTo(-8, 20, 2, 14); c.stroke();
      for (let i = 0; i < 4; i++) {
        c.beginPath(); c.moveTo(-16 + i * 5.4, 12); c.lineTo(-15 + i * 5.4, 19); c.stroke();
      }
    },
    // THE OVERMIND — armored hive-brain with orbital ring and tendrils
    bossmind(c, P, ph) {
      eglow(c, P, 0, 0, 46, 0.5);
      c.lineCap = 'round';
      for (let i = 0; i < 5; i++) { // trailing tendrils
        const a = Math.PI * (0.55 + i * 0.22);
        const bx = Math.cos(a) * 26, by = Math.sin(a) * 26;
        const sway = Math.sin(ph + i * 1.3) * 6;
        c.strokeStyle = P.a(0.5); c.lineWidth = 3.5;
        c.beginPath(); c.moveTo(bx, by);
        c.quadraticCurveTo(bx * 1.5, by * 1.5 + sway, bx * 1.85, by * 1.75 - sway);
        c.stroke();
      }
      c.save(); c.rotate(ph * 0.5); // orbital ring
      c.strokeStyle = P.a(0.45); c.lineWidth = 2;
      c.setLineDash([5, 9]);
      c.beginPath(); c.ellipse(0, 0, 46, 30, 0, 0, 7); c.stroke();
      c.setLineDash([]);
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = '#fff';
      for (let i = 0; i < 4; i++) {
        const a = i * TAU / 4;
        c.beginPath(); c.arc(Math.cos(a) * 46, Math.sin(a) * 30, 2.6, 0, 7); c.fill();
      }
      c.restore(); c.restore();
      eorb(c, P, 0, 0, 26); // the brain
      c.strokeStyle = P.sh1; c.lineWidth = 4.5; // cortical ridges
      c.beginPath(); c.moveTo(-24, -6); c.bezierCurveTo(-10, -22, 8, -24, 22, -10); c.stroke();
      c.beginPath(); c.moveTo(-22, 8); c.bezierCurveTo(-6, -4, 10, 18, 23, 6); c.stroke();
      c.beginPath(); c.moveTo(-12, 20); c.bezierCurveTo(0, 10, 8, 24, 18, 14); c.stroke();
      c.save(); c.globalCompositeOperation = 'lighter'; // thought pulse
      c.fillStyle = '#fff'; c.shadowColor = P.c; c.shadowBlur = 8;
      const tp = ph / TAU;
      c.beginPath(); c.arc(-24 + 46 * tp, -6 - 4 * tp - Math.sin(tp * Math.PI) * 16, 2.4, 0, 7); c.fill();
      c.restore();
      c.save(); c.globalCompositeOperation = 'lighter'; // central eye
      c.fillStyle = '#fff'; c.shadowColor = P.c; c.shadowBlur = 12;
      c.beginPath(); c.ellipse(6, 2, 9, 5.5, 0, 0, 7); c.fill();
      c.restore();
      c.fillStyle = '#131722';
      c.beginPath(); c.arc(8, 2, 3, 0, 7); c.fill();
    },
    // ROGUE AGI — bladed hex seraph with a white-hot slit eye
    bossagi(c, P, ph) {
      eglow(c, P, 0, 0, 47, 0.55);
      c.save(); c.rotate(ph * 0.5); // rotating blade ring
      for (let i = 0; i < 3; i++) {
        c.save(); c.rotate(i * TAU / 3);
        c.strokeStyle = P.sh1; c.lineWidth = 6;
        c.beginPath(); c.arc(0, 0, 44, -0.15, 0.85); c.stroke();
        c.strokeStyle = P.a(0.8); c.lineWidth = 1.8;
        c.beginPath(); c.arc(0, 0, 46.6, -0.1, 0.6); c.stroke();
        c.restore();
      }
      c.restore();
      c.save(); c.globalCompositeOperation = 'lighter'; // orbiting pylons
      for (let i = 0; i < 3; i++) {
        const a = -ph + i * TAU / 3 + 0.6;
        c.fillStyle = '#fff'; c.shadowColor = P.c; c.shadowBlur = 8;
        c.beginPath(); c.arc(Math.cos(a) * 44, Math.sin(a) * 44, 3.2, 0, 7); c.fill();
      }
      c.restore();
      hexPath(c, 34);
      eshell(c, P, -34, 34);
      c.save(); c.globalCompositeOperation = 'lighter'; // glowing seams
      c.strokeStyle = P.a(0.75); c.lineWidth = 2;
      c.shadowColor = P.c; c.shadowBlur = 6;
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6 - Math.PI / 2;
        c.beginPath(); c.moveTo(Math.cos(a) * 15, Math.sin(a) * 15); c.lineTo(Math.cos(a) * 32, Math.sin(a) * 32); c.stroke();
      }
      c.restore();
      c.strokeStyle = P.sh2; c.lineWidth = 5;
      c.beginPath(); c.arc(0, 0, 20, 0, 7); c.stroke();
      c.strokeStyle = P.a(0.5); c.lineWidth = 1.4;
      c.beginPath(); c.arc(0, 0, 23, -2.2, -0.5); c.stroke();
      c.save(); c.globalCompositeOperation = 'lighter'; // THE EYE
      c.fillStyle = '#fff'; c.shadowColor = P.c; c.shadowBlur = 14;
      c.beginPath(); c.ellipse(0, 0, 14, 8, 0, 0, 7); c.fill();
      c.restore();
      c.fillStyle = P.c;
      c.beginPath(); c.arc(2, 0, 5, 0, 7); c.fill();
      c.fillStyle = '#05070d';
      c.beginPath(); c.ellipse(2, 0, 1.6, 4.4, 0, 0, 7); c.fill();
    },
  };

  // per-shape live-motion parameters used by drawEnemy
  //  mode 'w': cycle keyed to distance walked (rate = cycles/tile)
  //  mode 't': cycle keyed to time (rate = cycles/sec)
  //  hover/bob: vertical motion amplitude as a fraction of sprite size
  //  thr: thruster nozzle positions in 100-space (live flames)
  const EVIS = {
    bot:   { mode: 't', rate: 1.1, hover: 0.10, thr: [[-30, 9], [-30, -9]] },
    dart:  { mode: 't', rate: 2.4, thr: [[-26, 0]] },
    blob:  { mode: 't', rate: 0.8, squish: 0.05, wob: 0.6 },
    tri:   { mode: 'w', rate: 2.6, bob: 0.02 },
    box:   { mode: 'w', rate: 1.1, bob: 0.03 },
    worm:  { mode: 'w', rate: 1.3 },
    wing:  { mode: 't', rate: 3.4 },
    lock:  { mode: 'w', rate: 1.2, bob: 0.02 },
    leech: { mode: 'w', rate: 1.1 },
    twin:  { mode: 't', rate: 1.3, hover: 0.09 },
    mask:  { mode: 't', rate: 1.1, hover: 0.11 },
    hub:   { mode: 'w', rate: 1.0, bob: 0.02 },
    jam:   { mode: 'w', rate: 1.6 },
    golem: { mode: 'w', rate: 0.55, bob: 0.045, wob: 0.45 },
    hook:  { mode: 't', rate: 1.6, hover: 0.08 },
    qbit:  { mode: 't', rate: 2.0, hover: 0.10 },
    flash: { mode: 't', rate: 3.2, thr: [[-24, 0]] },
    hydra: { mode: 'w', rate: 0.9, bob: 0.03 },
    ghost: { mode: 't', rate: 1.5 },
    tank:  { mode: 'w', rate: 1.5, wob: 0.4 },
    mirror:{ mode: 't', rate: 1.4, hover: 0.10 },
    titan: { mode: 'w', rate: 0.8, bob: 0.03, wob: 0.35 },
    bosskernel: { mode: 'w', rate: 0.9, wob: 0.35 },
    bossmaster: { mode: 'w', rate: 0.8, wob: 0.35 },
    bossfake:   { mode: 't', rate: 0.9, hover: 0.07, wob: 0.4 },
    bossmind:   { mode: 't', rate: 1.0, hover: 0.06, wob: 0.4 },
    bossagi:    { mode: 't', rate: 1.1, hover: 0.06, wob: 0.4 },
  };

  function drawCreature(c, def, ph) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    const P = epal(def.color);
    // soft baked ground shadow
    const sg = c.createRadialGradient(2, 5, 4, 2, 5, 34);
    sg.addColorStop(0, 'rgba(0,0,0,0.48)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sg; c.beginPath(); c.ellipse(2, 5, 34, 29, 0, 0, 7); c.fill();
    (CREATURES[def.shape] || CREATURES.tri)(c, P, ph, def);
  }

  function enemySprite(type, frame) {
    const def = DATA.ENEMIES[type];
    const px = Math.max(22, T * def.size * 2.6);
    return makeSprite('e_' + type + '_' + frame + '_' + Math.round(px), px,
      c => drawCreature(c, def, frame / EFRAMES * TAU));
  }

  // ---- tower drawing: dark-machine style, in 100x100 space ----
  // Hulls are dark layered metal (gradients + rim light + baked shadow);
  // each family's identity color is confined to small functional glows.
  function hullG(c, x0, y0, x1, y1, lo, hi) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, hi); g.addColorStop(1, lo);
    return g;
  }
  function octPath(c, x, y, r, k) {
    k = k || 0.42;
    c.beginPath();
    c.moveTo(x - r, y - r * k);
    c.lineTo(x - r * k, y - r); c.lineTo(x + r * k, y - r);
    c.lineTo(x + r, y - r * k); c.lineTo(x + r, y + r * k);
    c.lineTo(x + r * k, y + r); c.lineTo(x - r * k, y + r);
    c.lineTo(x - r, y + r * k);
    c.closePath();
  }
  function drawTowerBase(c, def, tier) {
    // soft ground shadow
    const sh = c.createRadialGradient(2, 4, 4, 2, 4, 46);
    sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sh; c.beginPath(); c.arc(2, 4, 46, 0, 7); c.fill();
    // octagonal plate
    octPath(c, 0, 0, 40);
    c.fillStyle = hullG(c, -40, -40, 40, 40, '#161c28', '#2e3a4b');
    c.fill();
    c.strokeStyle = '#0a0e15'; c.lineWidth = 2.4; c.stroke();
    // top-left bevel light
    c.strokeStyle = 'rgba(140,170,205,0.45)'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(-40, -16.8); c.lineTo(-16.8, -40); c.lineTo(16.8, -40); c.stroke();
    // identity color: painted keel stripe along the lower-right facet
    c.strokeStyle = def.color; c.globalAlpha = 0.55; c.lineWidth = 3;
    c.beginPath(); c.moveTo(17.5, 38); c.lineTo(38, 17.5); c.stroke();
    c.globalAlpha = 1;
    // inner deck
    octPath(c, 0, 0, 29);
    c.fillStyle = hullG(c, -29, -29, 29, 29, '#101520', '#222c3a');
    c.fill();
    c.strokeStyle = 'rgba(9,13,20,0.9)'; c.lineWidth = 1.4; c.stroke();
    // corner bolts
    c.fillStyle = '#0d1119';
    for (const [bx, by] of [[-34, 0], [34, 0], [0, -34], [0, 34]]) {
      c.beginPath(); c.arc(bx, by, 2.6, 0, 7); c.fill();
    }
    // tier pips (gold, glowing)
    c.shadowColor = '#ffd166'; c.shadowBlur = 5;
    c.fillStyle = '#ffd166';
    for (let i = 0; i <= tier; i++) c.fillRect(-25 + i * 12, 31.5, 7, 4);
    c.shadowBlur = 0;
  }

  // small emissive dot with glow, baked cheaply
  function glowDot(c, x, y, r, color, alpha) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = alpha == null ? 0.95 : alpha;
    c.fillStyle = color; c.shadowColor = color; c.shadowBlur = r * 2.4;
    c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    c.restore();
  }
  // gunmetal block with outline + top rim light
  function plate(c, x, y, w, h, r, hi) {
    c.fillStyle = hullG(c, x, y, x + w * 0.4, y + h, '#141a25', hi || '#3a4a5e');
    roundRect(c, x, y, w, h, r); c.fill();
    c.strokeStyle = '#0a0e15'; c.lineWidth = 1.6; c.stroke();
    c.strokeStyle = 'rgba(170,200,235,0.6)'; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w * 0.65, y); c.stroke();
  }
  function gunBarrel(c, off, len, wdt) {
    c.fillStyle = hullG(c, 0, -wdt, 0, wdt, '#0e131c', '#2c3a4a');
    roundRect(c, off, -wdt, len, wdt * 2, wdt * 0.55); c.fill();
    c.strokeStyle = '#0a0e15'; c.lineWidth = 1.4; c.stroke();
    c.strokeStyle = 'rgba(150,185,220,0.4)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(off + wdt * 0.5, -wdt * 0.7); c.lineTo(off + len - wdt, -wdt * 0.7); c.stroke();
    c.fillStyle = '#080b11';
    roundRect(c, off + len - 3.5, -wdt * 0.78, 5, wdt * 1.56, wdt * 0.3); c.fill();
  }

  function drawTowerHead(c, def, tier, branch) {
    const col = def.color;
    const t = tier;
    const br = (tier === 3 && branch !== null && branch !== undefined) ? branch : -1;
    c.lineJoin = 'round'; c.lineCap = 'round';
    switch (def.kind) {
      case 'bullet':
        if (def.reveals) { // SCAN ARRAY: radar dish (sweep drawn live)
          plate(c, -18, -9, 30, 18, 4);
          // dish: thick dark parabola with bright leading edge, facing +x
          c.strokeStyle = '#121a26'; c.lineWidth = 7;
          c.beginPath(); c.arc(-9, 0, 19 + t * 1.5 + (br === 0 ? 6 : 0), -1.1, 1.1); c.stroke();
          c.strokeStyle = 'rgba(170,210,245,0.85)'; c.lineWidth = 2;
          c.beginPath(); c.arc(-9, 0, 22.6 + t * 1.5 + (br === 0 ? 6 : 0), -1.05, 1.05); c.stroke();
          // feed strut(s)
          c.strokeStyle = '#212b38'; c.lineWidth = 3;
          if (br === 1) { // Burst Array: twin feeds
            c.beginPath(); c.moveTo(-5, -6); c.lineTo(17, -6); c.stroke();
            c.beginPath(); c.moveTo(-5, 6); c.lineTo(17, 6); c.stroke();
            glowDot(c, 17, -6, 3, col); glowDot(c, 17, 6, 3, col);
          } else {
            c.beginPath(); c.moveTo(-5, 0); c.lineTo(18, 0); c.stroke();
            glowDot(c, 18, 0, 3.6, col);
          }
        } else { // SENTRY: boxy turret
          const bw = 24 + t * 1.8, bh = 28 + t * 2.4;
          if (t >= 3 && br === -1) { // pre-branch T3 gets armor cheeks too
            plate(c, -bw * 0.7, -bh * 0.7, bw * 0.5, bh * 1.4, 3, '#303e50');
          }
          if (t >= 2) plate(c, -bw * 0.68, -bh * 0.66, bw * 0.45, bh * 1.32, 3, '#303e50');
          if (br === 0) { // GATLING: rotary tri-barrel + collar
            for (const yy of [-5.4, 5.4, 0]) {
              c.save(); c.translate(0, yy); gunBarrel(c, 8, yy === 0 ? 42 : 37, 2.6); c.restore();
            }
            c.fillStyle = '#0d121b'; c.beginPath(); c.arc(12, 0, 7.5, 0, 7); c.fill();
            c.strokeStyle = '#2c3a4c'; c.lineWidth = 1.6; c.stroke();
          } else if (br === 1) { // RAILGUN: heavy finned rail
            gunBarrel(c, 6, 44, 3.4);
            c.fillStyle = '#0d121b';
            for (const fy of [-7, 7]) { roundRect(c, 14, fy - 1.5, 26, 3, 1.5); c.fill(); }
            glowDot(c, 48, 0, 3, '#aee6ff', 0.85);
          } else if (t >= 3) { // T3+: twin barrels
            for (const by of [-5.6, 5.6]) {
              c.save(); c.translate(0, by); gunBarrel(c, 8, 40 + t * 2, 2.9); c.restore();
            }
          } else {
            gunBarrel(c, 8, 38 + t * 3, 3.4 + t * 0.4);
          }
          plate(c, -bw * 0.55, -bh * 0.45, bw, bh * 0.9, 4);
          // identity stripe + status leds
          c.fillStyle = col; c.globalAlpha = 0.8;
          c.fillRect(-bw * 0.4, -bh * 0.45 + 2.5, 3, bh * 0.9 - 5);
          c.globalAlpha = 1;
          glowDot(c, bw * 0.28, 0, 4.2, col);
          glowDot(c, -bw * 0.3, -bh * 0.22, 1.8, '#ffd166', 0.8);
        }
        break;
      case 'snipe': { // KERNEL SNIPER: skeletal long rifle
        c.strokeStyle = '#1a2330'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(-16, 14); c.lineTo(0, 0); c.lineTo(-16, -14); c.stroke();
        gunBarrel(c, -5, br === 0 ? 50 : 52, 2.4);
        c.fillStyle = '#0d121b';
        roundRect(c, 40, -3.8, 9, 7.6, 1.5); c.fill();
        c.fillStyle = '#07090e';
        for (const sy of [-2, 0.8]) c.fillRect(41.5, sy, 6, 1.2);
        plate(c, -12, -7.5, 26, 15, 3);
        // scope on top (lens glow drawn live from charge)
        c.fillStyle = '#0d121b'; roundRect(c, -6, -13, 15, 5.5, 2.2); c.fill();
        if (br === 0) glowDot(c, 1, 0, 4.5, '#ffffff', 0.9);           // Antimatter core
        else glowDot(c, 1, 0, 3.6, col, 0.85);
        if (br === 1) { // Spotter Net: second scope
          c.fillStyle = '#0d121b'; roundRect(c, -2, 8, 12, 5, 2.2); c.fill();
          glowDot(c, 8.5, 10.5, 2, col, 0.9);
        }
        c.fillStyle = col; c.globalAlpha = 0.8; c.fillRect(-10, -6, 2.6, 12); c.globalAlpha = 1;
        break;
      }
      case 'chain': { // PULSE COIL: tesla toroid stack
        const rings = 2 + t;
        const topY = 12 - (rings - 1) * 9 - 8;
        for (let i = 0; i < rings; i++) {
          const ry = 12 - i * 9;
          const rw = (15 + t * 1.5) * (1 - i * 0.15);
          c.fillStyle = hullG(c, -rw, ry - 4.2, rw, ry + 4.2, '#141826', '#333450');
          roundRect(c, -rw, ry - 4.2, rw * 2, 8.4, 4.2); c.fill();
          c.strokeStyle = '#0a0c15'; c.lineWidth = 1.4; c.stroke();
          c.strokeStyle = 'rgba(179,136,255,0.4)'; c.lineWidth = 1.1;
          c.beginPath(); c.moveTo(-rw * 0.7, ry - 4.2); c.lineTo(rw * 0.45, ry - 4.2); c.stroke();
        }
        const heads = br === 0 ? [-11, 11] : [0];
        for (const hx of heads) {
          c.fillStyle = '#181524';
          c.beginPath(); c.arc(hx, topY, 4.6 + t * 0.4, 0, 7); c.fill();
          c.strokeStyle = '#0a0c15'; c.lineWidth = 1.2; c.stroke();
          glowDot(c, hx, topY, 3 + t * 0.3, col, 0.8);
        }
        if (br === 1) { // Amplifier: glowing delta antenna
          c.strokeStyle = '#241d38'; c.lineWidth = 3.4;
          c.beginPath(); c.moveTo(0, topY - 15); c.lineTo(9.5, topY + 0.5); c.lineTo(-9.5, topY + 0.5);
          c.closePath(); c.stroke();
          c.save(); c.globalCompositeOperation = 'lighter';
          c.strokeStyle = col; c.globalAlpha = 0.85; c.lineWidth = 1.4;
          c.shadowColor = col; c.shadowBlur = 7;
          c.beginPath(); c.moveTo(0, topY - 12.4); c.lineTo(7.2, topY - 0.6); c.lineTo(-7.2, topY - 0.6);
          c.closePath(); c.stroke();
          c.restore();
        }
        break;
      }
      case 'splash': { // PACKET MORTAR: chunky angled tube
        const ttr = 20 + t * 1.4;
        c.beginPath(); c.arc(0, 0, ttr, 0, 7);
        c.fillStyle = hullG(c, -ttr, -ttr, ttr, ttr, '#121722', '#2a3547'); c.fill();
        c.strokeStyle = '#0a0e15'; c.lineWidth = 1.6; c.stroke();
        if (br === 0) { // Napalm: strapped fuel tank
          c.save(); c.rotate(1.15);
          c.fillStyle = hullG(c, 0, -5, 0, 5, '#241108', '#54301a');
          roundRect(c, 12, -5.5, 19, 11, 5); c.fill();
          c.strokeStyle = '#0a0e15'; c.lineWidth = 1.4; c.stroke();
          c.fillStyle = '#8a4a1c'; c.fillRect(18, -5.5, 3, 11);
          c.restore();
        }
        const tube = (tw2, len) => {
          c.fillStyle = hullG(c, 0, -tw2, 0, tw2, '#0e131c', '#33404f');
          roundRect(c, -6, -tw2, len, tw2 * 2, tw2 * 0.7); c.fill();
          c.strokeStyle = '#0a0e15'; c.lineWidth = 1.6; c.stroke();
          c.fillStyle = '#0d121b';
          for (let i = 0; i < t + 1; i++) { roundRect(c, 4 + i * 6.5, -tw2 * 1.12, 3, tw2 * 2.24, 1.2); c.fill(); }
          c.fillStyle = br === 0 ? '#5c2c14' : '#5c4a16';
          for (let i = 0; i < 3; i++) c.fillRect(len - 15 + i * 4, -tw2, 2.2, tw2 * 2);
          c.fillStyle = '#07090e';
          c.beginPath(); c.ellipse(len - 6.5, 0, 3.4, tw2 * 0.85, 0, 0, 7); c.fill();
        };
        if (br === 1) { // Cluster: parallel triple tubes + drum
          for (const dy of [-8.5, 8.5, 0]) { c.save(); c.translate(0, dy); tube(4.6, 39); c.restore(); }
          c.fillStyle = '#0d121b'; c.beginPath(); c.arc(-2, 0, 9, 0, 7); c.fill();
          c.strokeStyle = '#2c3a4c'; c.lineWidth = 1.4; c.stroke();
        } else {
          tube(8 + t * 0.9, 37 + t * 2.5);
        }
        c.fillStyle = col; c.globalAlpha = 0.7;
        c.beginPath(); c.arc(0, 0, 3.4, 0, 7); c.fill(); c.globalAlpha = 1;
        break;
      }
      case 'slowaura': { // THROTTLER: pylon + suppression rings (nodes orbit live)
        for (const [rad, tilt] of [[22 + t, 0.42], [29 + t, 0.32]]) {
          c.strokeStyle = '#1e2836'; c.lineWidth = 2.6;
          c.beginPath(); c.ellipse(0, 0, rad, rad * tilt, 0, 0, 7); c.stroke();
        }
        plate(c, -6, -19, 12, 38, 5, '#31405a');
        c.fillStyle = col; c.globalAlpha = 0.8; c.fillRect(-1.4, -16, 2.8, 8); c.globalAlpha = 1;
        glowDot(c, 0, -19, 3.6, col, 0.9);
        break;
      }
      case 'field': { // TARPIT: grated vat of goo (bubbles live)
        const vr = 26 + t * 1.5;
        c.beginPath(); c.arc(0, 0, vr, 0, 7);
        c.fillStyle = hullG(c, -vr, -vr, vr, vr, '#10151f', '#2b3646'); c.fill();
        c.strokeStyle = '#0a0e15'; c.lineWidth = 2; c.stroke();
        const pr = vr - 5;
        const pg = c.createRadialGradient(0, 0, 0, 0, 0, pr);
        pg.addColorStop(0, '#20351a'); pg.addColorStop(0.75, '#15230e'); pg.addColorStop(1, '#0b1307');
        c.beginPath(); c.arc(0, 0, pr, 0, 7); c.fillStyle = pg; c.fill();
        c.save(); c.globalCompositeOperation = 'lighter';
        const gl = c.createRadialGradient(0, 0, 0, 0, 0, pr);
        gl.addColorStop(0, 'rgba(156,204,101,0.30)'); gl.addColorStop(1, 'rgba(156,204,101,0)');
        c.fillStyle = gl; c.beginPath(); c.arc(0, 0, pr, 0, 7); c.fill();
        c.restore();
        c.strokeStyle = 'rgba(8,11,16,0.9)'; c.lineWidth = 2.6;
        for (let i = -2; i <= 2; i++) {
          const gy = i * pr * 0.38, hw = Math.sqrt(Math.max(0, pr * pr - gy * gy));
          c.beginPath(); c.moveTo(-hw, gy); c.lineTo(hw, gy); c.stroke();
        }
        c.strokeStyle = '#1c2531'; c.lineWidth = 4.6;
        c.beginPath(); c.moveTo(vr + 6, -vr + 2); c.lineTo(vr - 4, -vr * 0.4); c.stroke();
        c.beginPath(); c.moveTo(-vr - 6, vr - 2); c.lineTo(-vr + 4, vr * 0.4); c.stroke();
        break;
      }
      case 'income': { // COMPUTE FARM: server racks (LEDs blink live)
        for (const rx of [-21, 2]) {
          c.fillStyle = hullG(c, rx, -22, rx + 18, 22, '#10151f', '#28334a');
          roundRect(c, rx, -24, 19, 48, 2.5); c.fill();
          c.strokeStyle = '#0a0e15'; c.lineWidth = 1.4; c.stroke();
          c.strokeStyle = 'rgba(170,200,235,0.5)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(rx + 2, -24); c.lineTo(rx + 14, -24); c.stroke();
        }
        // fan housing
        c.fillStyle = '#0d121b'; c.beginPath(); c.arc(27, 0, 8.5, 0, 7); c.fill();
        c.strokeStyle = '#0a0e15'; c.lineWidth = 1.4; c.stroke();
        c.fillStyle = col; c.globalAlpha = 0.75; c.fillRect(-21, 26, 42, 2.6); c.globalAlpha = 1;
        break;
      }
      case 'buffaura': { // OVERCLOCKER: heatsink fin stack (core pulses live)
        c.save(); c.globalCompositeOperation = 'lighter';
        const g2 = c.createRadialGradient(0, 0, 0, 0, 0, 24);
        g2.addColorStop(0, 'rgba(255,224,122,0.5)'); g2.addColorStop(1, 'rgba(255,190,80,0)');
        c.fillStyle = g2; c.beginPath(); c.arc(0, 0, 24, 0, 7); c.fill();
        c.restore();
        for (let i = 0; i < 5; i++) {
          const fy = -21 + i * 10.2;
          const fw = (28 + t * 1.5) - Math.abs(i - 2) * 4.5;
          c.fillStyle = hullG(c, -fw, fy, fw, fy + 6, '#141a26', '#3a465a');
          roundRect(c, -fw, fy, fw * 2, 6.1, 2); c.fill();
          c.strokeStyle = '#0a0e15'; c.lineWidth = 1.2; c.stroke();
        }
        break;
      }
      case 'beam': { // PHOTON LANCE: twin prongs + crystal (rotates live)
        c.strokeStyle = '#182230'; c.lineWidth = 6;
        for (const py of [-1, 1]) {
          c.beginPath();
          c.moveTo(-10, py * 5);
          c.quadraticCurveTo(18, py * (17 + t), 32 + t * 2, py * 5.5);
          c.stroke();
        }
        c.strokeStyle = 'rgba(150,190,220,0.4)'; c.lineWidth = 1.6;
        c.beginPath(); c.moveTo(-6, -6.5); c.quadraticCurveTo(16, -16.5 - t, 30 + t * 2, -6); c.stroke();
        plate(c, -24, -9, 20, 18, 4);
        c.fillStyle = col; c.globalAlpha = 0.8; c.fillRect(-22, -6, 2.6, 12); c.globalAlpha = 1;
        if (br === 1) { // Wide Lens: secondary ring
          c.strokeStyle = '#1e2836'; c.lineWidth = 2.6;
          c.beginPath(); c.arc(34, 0, 8, 0, 7); c.stroke();
          glowDot(c, 34, 0, 2.4, col, 0.7);
        }
        glowDot(c, 16, 0, br === 0 ? 5 : 4, br === 0 ? '#b6ffe4' : col, 0.9);
        break;
      }
      case 'emp': { // EMP EMITTER: dark dome (crackle + rings live)
        const dg = c.createRadialGradient(-9, -9, 2, 0, 0, 26);
        dg.addColorStop(0, '#3b3550'); dg.addColorStop(0.6, '#1c1930'); dg.addColorStop(1, '#0e0c1a');
        c.beginPath(); c.arc(0, 0, 24 + t, 0, 7);
        c.fillStyle = dg; c.fill();
        c.strokeStyle = '#0a0815'; c.lineWidth = 1.8; c.stroke();
        c.strokeStyle = 'rgba(9,7,18,0.8)'; c.lineWidth = 1.2;
        c.beginPath(); c.arc(0, 0, (24 + t) * 0.62, 0, 7); c.stroke();
        c.beginPath(); c.moveTo(-24 - t, 0); c.lineTo(24 + t, 0); c.stroke();
        c.beginPath(); c.moveTo(0, -24 - t); c.lineTo(0, 24 + t); c.stroke();
        glowDot(c, 0, 0, 3.4, col, 0.9);
        break;
      }
      case 'orb': { // SINGULARITY: containment arms caging a star (debris live)
        for (let i = 0; i < 3; i++) {
          c.save(); c.rotate((i / 3) * Math.PI * 2);
          c.strokeStyle = '#1a2230'; c.lineWidth = 5.4;
          c.beginPath(); c.arc(0, 0, 26, -0.5, 0.5); c.stroke();
          c.strokeStyle = 'rgba(160,190,225,0.35)'; c.lineWidth = 1.4;
          c.beginPath(); c.arc(0, 0, 29.4, -0.35, 0.3); c.stroke();
          c.restore();
        }
        // gravitational lensing shadow ring
        c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineWidth = 3.6;
        c.beginPath(); c.arc(0, 0, 13.5, 0, 7); c.stroke();
        c.save(); c.globalCompositeOperation = 'lighter';
        const sg = c.createRadialGradient(0, 0, 0, 0, 0, 12);
        sg.addColorStop(0, 'rgba(255,255,255,0.95)');
        sg.addColorStop(0.45, 'rgba(200,220,255,0.55)');
        sg.addColorStop(1, 'rgba(150,180,255,0)');
        c.fillStyle = sg; c.beginPath(); c.arc(0, 0, 12, 0, 7); c.fill();
        c.restore();
        break;
      }
    }
    // universal specialization badge for kinds without bespoke branch art
    if (br >= 0 && ['slowaura', 'field', 'income', 'buffaura', 'emp', 'orb'].indexOf(def.kind) >= 0) {
      c.shadowBlur = 7;
      c.fillStyle = br === 0 ? '#ffd166' : '#7fdcff';
      c.shadowColor = c.fillStyle;
      if (br === 0) { // gold delta
        c.beginPath(); c.moveTo(-36, -26); c.lineTo(-29, -38); c.lineTo(-22, -26); c.closePath(); c.fill();
      } else {        // cyan diamond
        c.beginPath(); c.moveTo(-29, -40); c.lineTo(-22, -32); c.lineTo(-29, -24); c.lineTo(-36, -32); c.closePath(); c.fill();
      }
      c.shadowBlur = 0;
    }
  }

  // ---- live tower accents: cheap per-frame motion on top of baked hulls.
  // Called inside the head transform (rotated for directional kinds).
  // No shadowBlur here — it's per-frame. s = pixels per 100-space unit.
  function fract(x) { return x - Math.floor(x); }
  function hash1(i) { const v = Math.sin(i * 127.1) * 43758.55; return v - Math.floor(v); }
  function drawTowerAnim(c, tw, s, now) {
    const def = tw.def, t = tw.tier, a = tw.anim;
    c.save();
    c.scale(s, s);
    c.globalCompositeOperation = 'lighter';
    switch (def.kind) {
      case 'bullet':
        if (def.reveals) { // scan sweep wedge (spins independent of aim)
          c.save(); c.rotate(a * 1.6);
          c.fillStyle = 'rgba(127,220,255,0.15)';
          c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 30 + t * 2, -0.5, 0.03); c.closePath(); c.fill();
          c.strokeStyle = 'rgba(127,220,255,0.5)'; c.lineWidth = 1.6;
          c.beginPath(); c.moveTo(0, 0); c.lineTo(30 + t * 2, 0); c.stroke();
          c.restore();
        } else { // sentry lens blink
          const bw = 24 + t * 1.8;
          c.globalAlpha = 0.35 + 0.3 * Math.sin(a * 2.4);
          c.fillStyle = def.color;
          c.beginPath(); c.arc(bw * 0.28, 0, 5.5, 0, 7); c.fill();
          c.globalAlpha = 1;
        }
        break;
      case 'snipe': { // scope charges up between shots
        const rate = def.levels[t].rate;
        const chg = Math.max(0, Math.min(1, 1 - tw.cool * rate));
        c.globalAlpha = 0.25 + 0.65 * chg;
        c.fillStyle = def.color;
        c.beginPath(); c.arc(4.5, -10.2, 2 + 1.6 * chg, 0, 7); c.fill();
        if (chg > 0.92) { // ready: glint
          c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1;
          c.beginPath(); c.moveTo(0.5, -10.2); c.lineTo(8.5, -10.2); c.stroke();
        }
        c.globalAlpha = 1;
        break;
      }
      case 'chain': { // corona pulse + intermittent idle arc
        const rings = 2 + t, topY = 12 - (rings - 1) * 9 - 8;
        const heads = (tw.tier === 3 && tw.branch === 0) ? [-11, 11] : [0];
        for (const hx of heads) {
          c.globalAlpha = 0.3 + 0.25 * Math.sin(a * 3.1 + hx);
          c.fillStyle = def.color;
          c.beginPath(); c.arc(hx, topY, 7, 0, 7); c.fill();
          const cyc = fract(a * 1.3 + hx * 0.13);
          if (cyc < 0.16) {
            const seed = Math.floor(a * 1.3 + hx * 0.13) * 7 + hx;
            c.globalAlpha = 1 - cyc / 0.16;
            c.strokeStyle = '#d9c2ff'; c.lineWidth = 1.6;
            c.beginPath();
            let ax = hx, ay = topY;
            const dir = hash1(seed) * 6.28;
            c.moveTo(ax, ay);
            for (let sg2 = 1; sg2 <= 3; sg2++) {
              ax += Math.cos(dir) * 8 + (hash1(seed * 9 + sg2) - 0.5) * 7;
              ay += Math.sin(dir) * 8 + (hash1(seed * 13 + sg2) - 0.5) * 7;
              c.lineTo(ax, ay);
            }
            c.stroke();
          }
        }
        c.globalAlpha = 1;
        break;
      }
      case 'slowaura': { // orbiting suppression nodes + expanding pulse
        for (const [rad, spd, tilt] of [[22 + t, 1.1, 0.42], [29 + t, -0.7, 0.32]]) {
          const ang = a * spd;
          c.fillStyle = 'rgba(100,181,246,0.9)';
          for (const dd of [0, Math.PI]) {
            c.beginPath();
            c.arc(Math.cos(ang + dd) * rad, Math.sin(ang + dd) * rad * tilt, 2.4, 0, 7);
            c.fill();
          }
        }
        const ph = fract(a * 0.65);
        c.globalAlpha = 0.35 * (1 - ph);
        c.strokeStyle = def.color; c.lineWidth = 2;
        c.beginPath(); c.arc(0, 0, 12 + ph * 26, 0, 7); c.stroke();
        c.globalAlpha = 1;
        break;
      }
      case 'field': { // rising goo bubbles
        c.lineWidth = 1.6;
        for (let i = 0; i < 5; i++) {
          const ph = fract(a * (0.35 + hash1(i) * 0.3) + hash1(i * 7));
          const bx = (hash1(i * 3) - 0.5) * 30, by = (hash1(i * 5) - 0.5) * 30;
          c.strokeStyle = 'rgba(190,235,120,' + (0.55 * (1 - ph)).toFixed(3) + ')';
          c.beginPath(); c.arc(bx, by, 1.2 + ph * 3.4, 0, 7); c.stroke();
        }
        break;
      }
      case 'income': { // blinking rack LEDs + spinning fan
        for (const [rx, seed] of [[-21, 1], [2, 2]]) {
          for (let ry = 0; ry < 6; ry++) for (let cx2 = 0; cx2 < 3; cx2++) {
            const id = seed * 100 + ry * 3 + cx2;
            const on = fract(a * (0.6 + hash1(id) * 1.6) + hash1(id * 3)) < 0.5;
            c.fillStyle = on
              ? (hash1(id * 7) < 0.7 ? 'rgba(255,209,102,0.9)' : 'rgba(120,220,160,0.9)')
              : 'rgba(70,70,85,0.4)';
            c.fillRect(rx + 3 + cx2 * 5, -20 + ry * 7.2, 2.8, 1.9);
          }
        }
        c.save(); c.translate(27, 0); c.rotate(a * 6);
        c.strokeStyle = 'rgba(120,150,185,0.8)'; c.lineWidth = 1.8;
        for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.beginPath(); c.moveTo(0, 0); c.lineTo(6.4, 0); c.stroke(); }
        c.restore();
        break;
      }
      case 'buffaura': { // pulsing core between fins + rising heat motes
        const pu = 0.5 + 0.5 * Math.sin(a * 2.2);
        c.globalAlpha = 0.22 + 0.3 * pu;
        c.fillStyle = def.color;
        c.beginPath(); c.arc(0, 0, 15, 0, 7); c.fill();
        for (let i = 0; i < 4; i++) {
          const ph = fract(a * (0.5 + hash1(i) * 0.4) + hash1(i * 11));
          c.globalAlpha = 0.55 * (1 - ph);
          c.beginPath();
          c.arc((hash1(i * 3) - 0.5) * 28, 10 - ph * 42, 1.6, 0, 7); c.fill();
        }
        c.globalAlpha = 1;
        break;
      }
      case 'beam': { // floating crystal rotates (in aim space, sits between prongs)
        const rot = a * 1.6, cs = 5 + 1.1 * Math.sin(a * 4);
        const bright = 0.55 + 0.35 * (tw.beamTarget ? tw.beamRamp / 2.5 : 0);
        c.save(); c.translate(16, 0); c.rotate(rot);
        c.globalAlpha = bright;
        c.fillStyle = (tw.tier === 3 && tw.branch === 0) ? '#b6ffe4' : def.color;
        c.beginPath(); c.moveTo(0, -cs * 1.4); c.lineTo(cs, 0); c.lineTo(0, cs * 1.4); c.lineTo(-cs, 0);
        c.closePath(); c.fill();
        c.restore(); c.globalAlpha = 1;
        break;
      }
      case 'emp': { // charge crackle building to the pulse
        const rate = def.levels[t].rate;
        const chg = Math.max(0, Math.min(1, 1 - tw.cool * rate));
        if (chg > 0.35) {
          const seed = Math.floor(now * 0.014);
          c.strokeStyle = 'rgba(200,107,255,' + (0.55 * chg).toFixed(3) + ')';
          c.lineWidth = 1.4;
          for (let i = 0; i < 3; i++) {
            const a0 = hash1(seed + i * 5) * 6.28, rr3 = 7 + hash1(seed + i * 9) * 13;
            c.beginPath();
            c.moveTo(Math.cos(a0) * rr3, Math.sin(a0) * rr3);
            c.lineTo(Math.cos(a0 + 0.5) * rr3 * 0.7, Math.sin(a0 + 0.5) * rr3 * 0.7);
            c.stroke();
          }
        }
        c.globalAlpha = 0.3 + 0.5 * chg;
        c.fillStyle = def.color;
        c.beginPath(); c.arc(0, 0, 4.5, 0, 7); c.fill();
        c.globalAlpha = 1;
        break;
      }
      case 'orb': { // star pulse + orbiting captured debris
        const pu = 0.35 + 0.2 * Math.sin(a * 5.3);
        c.globalAlpha = pu;
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(0, 0, 7, 0, 7); c.fill();
        c.globalAlpha = 0.85;
        c.fillStyle = 'rgba(220,235,255,0.9)';
        for (let i = 0; i < 3; i++) {
          const oa = a * (1.6 + i * 0.5) + i * 2.1;
          c.beginPath();
          c.arc(Math.cos(oa) * 17, Math.sin(oa) * 17 * 0.45, 1.5, 0, 7); c.fill();
        }
        c.globalAlpha = 1;
        break;
      }
    }
    c.restore();
    c.globalCompositeOperation = 'source-over';
  }

  const DIRECTIONAL = { bullet: 1, snipe: 1, splash: 1, beam: 1 };

  function towerBaseSprite(type, tier) {
    const px = T * 1.06;
    return makeSprite('tb_' + type + tier + '_' + Math.round(px), px, c => drawTowerBase(c, DATA.TOWERS[type], tier));
  }
  function towerHeadSprite(type, tier, branch) {
    const px = T * 1.06;
    const bkey = branch === null || branch === undefined ? 'x' : branch;
    return makeSprite('th_' + type + tier + bkey + '_' + Math.round(px), px, c => drawTowerHead(c, DATA.TOWERS[type], tier, branch));
  }

  // Icon renderers for DOM UI (build bar, codex)
  function paintTowerIcon(cv, type, tier, branch) {
    const c = cv.getContext('2d');
    const s = cv.width;
    c.clearRect(0, 0, s, s);
    c.save(); c.scale(s / 100, s / 100); c.translate(50, 50);
    drawTowerBase(c, DATA.TOWERS[type], tier || 0);
    drawTowerHead(c, DATA.TOWERS[type], tier || 0, branch);
    c.restore();
  }
  function paintEnemyIcon(cv, type) {
    const c = cv.getContext('2d');
    const s = cv.width;
    c.clearRect(0, 0, s, s);
    c.save(); c.scale(s / 100, s / 100); c.translate(50, 50);
    drawCreature(c, DATA.ENEMIES[type], TAU * 0.12);
    c.restore();
  }

  // ================================================================ FRAME
  function frame(game, now) {
    const g = game, lv = g.level;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, W, H);

    // screen shake
    let shx = 0, shy = 0;
    if (g.shakeT > 0 && SAVE.state.settings.shake) {
      shx = (Math.random() - 0.5) * g.shakeMag;
      shy = (Math.random() - 0.5) * g.shakeMag;
    }
    ctx.translate(shx, shy);

    // map
    if (mapLayer) ctx.drawImage(mapLayer, OX, OY, T * lv.cols, T * lv.rows);

    // ambient drifting motes
    ctx.globalCompositeOperation = 'lighter';
    for (const m of ambient) {
      const yy = (m.y + now * 0.0001 * (1 + m.s * 20)) % lv.rows;
      ctx.globalAlpha = m.a * (0.7 + 0.3 * Math.sin(now * 0.001 + m.x * 7));
      ctx.fillStyle = '#9fd4ff';
      ctx.fillRect(sx(m.x), sy(yy), m.size, m.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // burning ground (napalm)
    for (const b of g.burns) {
      const flick = 0.75 + Math.sin(now * 0.02 + b.x * 13) * 0.25;
      ctx.globalAlpha = 0.16 * flick * Math.min(1, b.t);
      ctx.fillStyle = '#ff8a5c';
      ctx.beginPath(); ctx.arc(sx(b.x), sy(b.y), b.r * T, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.35 * flick * Math.min(1, b.t);
      ctx.strokeStyle = '#ffc14d'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx(b.x), sy(b.y), b.r * T * (0.75 + 0.15 * flick), 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
      if (Math.random() < 0.25 && g.particles.length < 280) {
        const a = Math.random() * Math.PI * 2, rr = Math.random() * b.r;
        g.particles.push({
          x: b.x + Math.cos(a) * rr, y: b.y + Math.sin(a) * rr,
          vx: 0, vy: -0.8 - Math.random(), life: 0.4, maxLife: 0.4,
          size: 2 + Math.random() * 2, color: '#ffb74d',
        });
      }
    }

    // animated data flow along path
    const flowN = Math.min(14, Math.floor(g.pathLen / 2));
    ctx.globalCompositeOperation = 'lighter';
    const sec = DATA.SECTORS[lv.sector];
    for (let i = 0; i < flowN; i++) {
      const d = ((now * 0.0011 + i / flowN) % 1) * g.pathLen;
      const p = g.pointAt(d);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = sec.glow;
      ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), T * 0.055, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // core (end of path) — pulsing hexagon
    const end = lv.path[lv.path.length - 1];
    const pulse = 1 + Math.sin(now * 0.004) * 0.08;
    drawCore(sx(end.x + 0.5), sy(end.y + 0.5), T * 0.42 * pulse, g.lives / g.maxLives, now);

    // air corridor (fliers ignore the path) — shown during deploy once fliers exist
    if (g.phase === 'build' && g.levelN >= 7) {
      const a0 = lv.path[0];
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = '#4dd0e1';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      ctx.moveTo(sx(a0.x + 0.5), sy(0));
      ctx.lineTo(sx(end.x + 0.5), sy(end.y + 0.5));
      ctx.stroke();
      ctx.setLineDash([]);
      // little wing glyph at the top of the lane
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#4dd0e1';
      ctx.font = Math.round(T * 0.32) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('✈', sx(a0.x + 0.5), sy(0.35));
      ctx.restore();
    }

    // aura zones (throttle / tarpit / overclock) for placed towers — subtle
    for (const tw of g.towers) {
      const k = tw.def.kind;
      if (k !== 'slowaura' && k !== 'field' && k !== 'buffaura') continue;
      const s = tw.stats();
      ctx.globalAlpha = k === 'field' && tw.pulseT > 0 ? 0.16 : 0.07;
      ctx.fillStyle = tw.def.color;
      ctx.beginPath(); ctx.arc(sx(tw.x), sy(tw.y), s.range * T, 0, 7); ctx.fill();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = tw.def.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(sx(tw.x), sy(tw.y), s.range * T, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // corruption: creeping purple rot
    for (const key in g.corrupt) {
      const [cx2, cy2] = key.split(',').map(Number);
      const flick = 0.7 + Math.sin(now * 0.004 + cx2 * 3 + cy2 * 7) * 0.3;
      ctx.fillStyle = 'rgba(150,60,220,' + (0.20 * flick).toFixed(3) + ')';
      ctx.fillRect(sx(cx2) + 1, sy(cy2) + 1, T - 2, T - 2);
      ctx.strokeStyle = 'rgba(200,107,255,' + (0.55 * flick).toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(sx(cx2) + 2, sy(cy2) + 2, T - 4, T - 4);
      ctx.setLineDash([]);
      if (Math.random() < 0.06 && g.particles.length < 280) {
        g.particles.push({
          x: cx2 + Math.random(), y: cy2 + Math.random(),
          vx: 0, vy: -0.4, life: 0.6, maxLife: 0.6, size: 2, color: '#c86bff',
        });
      }
    }

    // jammer beams
    ctx.globalCompositeOperation = 'lighter';
    for (const e of g.enemies) {
      if (e.dead || !e.jamTarget || e.jammingT <= 0) continue;
      const t = e.jamTarget;
      ctx.strokeStyle = '#ff5252';
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.5 + Math.sin(now * 0.03) * 0.3;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(sx(e.x), sy(e.y)); ctx.lineTo(sx(t.x), sy(t.y)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';

    // towers
    for (const tw of g.towers) {
      const bs = towerBaseSprite(tw.type, tw.tier);
      const hs = towerHeadSprite(tw.type, tw.tier, tw.branch);
      const px = sx(tw.x), py = sy(tw.y);
      const sz = T * 1.06;
      ctx.drawImage(bs, px - sz / 2, py - sz / 2, sz, sz);
      ctx.save();
      ctx.translate(px, py);
      if (DIRECTIONAL[tw.def.kind]) {
        ctx.rotate(tw.aim);
        if (tw.recoil > 0.02) ctx.translate(-tw.recoil * T * 0.09, 0); // recoil kick
      } else if (tw.def.kind === 'orb' || tw.def.kind === 'emp') ctx.rotate(tw.anim * 0.6);
      ctx.drawImage(hs, -sz / 2, -sz / 2, sz, sz);
      // live accents (idle animation layer) — skip while blacked out
      if (tw.disabledT <= 0) drawTowerAnim(ctx, tw, sz / 100, now);
      // muzzle flash: spiky star + white core
      if (tw.flashT > 0 && DIRECTIONAL[tw.def.kind]) {
        ctx.globalCompositeOperation = 'lighter';
        const fr = T * (0.08 + tw.flashT * 1.5);
        const mx = T * 0.42;
        ctx.fillStyle = tw.def.color; ctx.globalAlpha = 0.75;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const fa = (i / 8) * 6.283 + tw.anim;
          const rr2 = (i % 2 ? fr : fr * 0.42);
          ctx.lineTo(mx + Math.cos(fa) * rr2, Math.sin(fa) * rr2);
        }
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(mx, 0, fr * 0.4, 0, 7); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      // blackout marker
      if (tw.disabledT > 0) {
        ctx.fillStyle = 'rgba(5,7,13,0.62)';
        ctx.beginPath(); ctx.arc(px, py, sz * 0.48, 0, 7); ctx.fill();
        ctx.strokeStyle = '#ff3d71'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(px, py, sz * 0.3, 0, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px - sz * 0.21, py + sz * 0.21); ctx.lineTo(px + sz * 0.21, py - sz * 0.21); ctx.stroke();
      }
      // beam draw
      if (tw.def.kind === 'beam' && tw.beamTarget && !tw.beamTarget.dead) {
        const t = tw.beamTarget;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = tw.def.color;
        ctx.lineWidth = 1.5 + tw.beamRamp * 1.6;
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx(t.x), sy(t.y)); ctx.stroke();
        ctx.lineWidth = 0.8; ctx.strokeStyle = '#fff';
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(sx(t.x), sy(t.y)); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    // enemies (ground first, fliers on top)
    for (const pass = { p: 0 }; pass.p < 2; pass.p++) {
      for (const e of g.enemies) {
        if (e.dead || (pass.p === 0) !== !e.flying) continue;
        drawEnemy(e, now);
      }
    }

    // projectiles
    for (const p of g.projectiles) {
      const px = sx(p.x), py = sy(p.y);
      ctx.globalCompositeOperation = 'lighter';
      if (p.kind === 'mortar') {
        // arc height fake
        const t = UTIL.clamp(p.traveled / p.totalDist, 0, 1);
        const lift = Math.sin(t * Math.PI) * T * 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(px, py - lift, T * 0.12, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.arc(px, py, T * 0.07, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (p.kind === 'orb') {
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(px, py, T * 0.14, 0, 7); ctx.fill();
        ctx.fillStyle = p.color; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(px, py, T * 0.24, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = p.color; ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(px - Math.cos(p.angle || 0) * T * 0.16, py - Math.sin(p.angle || 0) * T * 0.16);
        ctx.lineTo(px, py);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // fx (lines, rings, booms) + particles
    ctx.globalCompositeOperation = 'lighter';
    for (const f of g.fx) {
      const a = f.t / f.ttl;
      if (f.kind === 'line') {
        ctx.globalAlpha = a;
        ctx.strokeStyle = f.color; ctx.lineWidth = f.zig ? 2 : 2.5;
        if (f.zig) {
          ctx.beginPath();
          const segs = 6;
          for (let i = 0; i <= segs; i++) {
            const t = i / segs;
            const mx = UTIL.lerp(f.x1, f.x2, t) + (i > 0 && i < segs ? (Math.random() - 0.5) * 0.25 : 0);
            const my = UTIL.lerp(f.y1, f.y2, t) + (i > 0 && i < segs ? (Math.random() - 0.5) * 0.25 : 0);
            i === 0 ? ctx.moveTo(sx(mx), sy(my)) : ctx.lineTo(sx(mx), sy(my));
          }
          ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo(sx(f.x1), sy(f.y1)); ctx.lineTo(sx(f.x2), sy(f.y2)); ctx.stroke();
        }
      } else if (f.kind === 'ring') {
        const rr = f.r * (1.15 - a * 0.5);
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = f.color; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), rr * T, 0, 7); ctx.stroke();
      } else if (f.kind === 'boom') {
        const rr = f.r * (1.3 - a * 0.8);
        ctx.globalAlpha = a * 0.55;
        ctx.fillStyle = f.color;
        ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), rr * T, 0, 7); ctx.fill();
        ctx.globalAlpha = a * 0.85;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), rr * T * 0.38, 0, 7); ctx.fill();
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), rr * T * 1.15, 0, 7); ctx.stroke();
      } else if (f.kind === 'flash') {
        // full-screen pulse (boss spawn)
        ctx.globalAlpha = a * 0.28;
        ctx.fillStyle = f.color || '#fff';
        ctx.fillRect(-20, -20, W + 40, H + 40);
      } else if (f.kind === 'sweep') {
        // wave-start scanline sweeping down the board
        const yy = OY + (1 - a) * T * lv.rows;
        const sg = ctx.createLinearGradient(0, yy - T, 0, yy + T * 0.2);
        sg.addColorStop(0, 'rgba(127,220,255,0)');
        sg.addColorStop(0.85, 'rgba(127,220,255,' + (0.30 * a).toFixed(3) + ')');
        sg.addColorStop(1, 'rgba(255,255,255,' + (0.5 * a).toFixed(3) + ')');
        ctx.fillStyle = sg;
        ctx.fillRect(OX, yy - T, T * lv.cols, T * 1.2);
      }
    }
    for (const p of g.particles) {
      ctx.globalAlpha = UTIL.clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(sx(p.x) - p.size / 2, sy(p.y) - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // damage / event text pops
    for (const tx of g.texts) {
      const a = UTIL.clamp(tx.t / tx.ttl, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = '800 ' + Math.round(T * (tx.big ? 0.42 : 0.3)) + 'px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
      ctx.strokeText(tx.txt, sx(tx.x), sy(tx.y));
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.txt, sx(tx.x), sy(tx.y));
      ctx.globalAlpha = 1;
    }

    // selection / placement
    if (g.placingType) drawPlacement(g);
    else if (g.selectedTower) {
      const tw = g.selectedTower;
      const s = tw.stats();
      const px = sx(tw.x), py = sy(tw.y);
      // range disc
      ctx.strokeStyle = 'rgba(127,220,255,0.85)'; ctx.lineWidth = 1.6;
      ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.arc(px, py, s.range * T, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(127,220,255,0.07)';
      ctx.beginPath(); ctx.arc(px, py, s.range * T, 0, 7); ctx.fill();
      // pulsing glow under the selected tower
      const pu = 1 + Math.sin(now * 0.008) * 0.1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#7fdcff';
      ctx.beginPath(); ctx.arc(px, py, T * 0.62 * pu, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // animated corner brackets around the tile
      const hb = T * 0.55 * pu, ln = T * 0.24;
      ctx.strokeStyle = '#7fdcff'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.shadowColor = '#2aa8ff'; ctx.shadowBlur = 8;
      for (const [cx2, cy2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const bx = px + cx2 * hb, by = py + cy2 * hb;
        ctx.beginPath();
        ctx.moveTo(bx - cx2 * ln, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by - cy2 * ln);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }

    // near-miss amber vignette
    if (g.dangerT > 0 && g.hurtT <= 0) {
      const da = Math.min(1, g.dangerT * 3) * (0.55 + 0.45 * Math.sin(now * 0.012));
      const dg = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.75);
      dg.addColorStop(0, 'rgba(255,170,40,0)');
      dg.addColorStop(1, 'rgba(255,150,30,' + (0.20 * da).toFixed(3) + ')');
      ctx.fillStyle = dg;
      ctx.fillRect(0, 0, W, H);
    }

    // core-hit red vignette
    if (g.hurtT > 0) {
      const a = Math.min(1, g.hurtT * 2.2);
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
      vg.addColorStop(0, 'rgba(255,30,70,0)');
      vg.addColorStop(1, 'rgba(255,30,70,' + (0.34 * a).toFixed(3) + ')');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }

    // orbital strike targeting hint
    if (g.abilityTarget === 'strike') {
      const pu = 1 + Math.sin(now * 0.012) * 0.12;
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.strokeRect(OX + 2, OY + 2, T * lv.cols - 4, T * lv.rows - 4);
      ctx.setLineDash([]);
      ctx.font = '800 ' + Math.round(14 * pu) + 'px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd166';
      ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 4;
      const strikeMsg = '☄ ' + UTIL.tapWord() + ' TO TARGET ORBITAL STRIKE';
      ctx.strokeText(strikeMsg, W / 2, OY + T * 1.1);
      ctx.fillText(strikeMsg, W / 2, OY + T * 1.1);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // clear shake
  }

  function drawCore(px, py, r, hpFrac, now) {
    ctx.save();
    ctx.translate(px, py);
    const col = hpFrac > 0.5 ? '#2aa8ff' : (hpFrac > 0.25 ? '#ffc14d' : '#ff3d71');
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.rotate(now * 0.0006);
    ctx.strokeStyle = col; ctx.lineWidth = 2.5;
    hexPathAt(ctx, 0, 0, r);
    ctx.stroke();
    ctx.rotate(-now * 0.0012);
    hexPathAt(ctx, 0, 0, r * 0.66);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.22, 0, 7); ctx.fill();
    ctx.restore();
  }
  function hexPathAt(c, cx, cy, r) {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 - Math.PI / 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.closePath();
  }

  function drawEnemy(e, now) {
    if (e.y < -0.4) return;
    const def = e.def;
    const v = EVIS[def.shape] || { mode: 't', rate: 1 };
    // locomotion cycle: walkers key off distance travelled (legs stop when
    // stunned/jammed), hoverers and fliers key off time
    const cyc = v.mode === 'w' ? (e.walk || 0) * v.rate : e.anim * v.rate;
    const frame = Math.min(EFRAMES - 1, ((cyc - Math.floor(cyc)) * EFRAMES) | 0);
    const spr = enemySprite(e.type, frame);
    const px = sx(e.x), py = sy(e.y);
    const dim = T * (e.size || def.size) * 2.6;
    let alpha = 1;
    if (e.stealthed) alpha = 0.15 + Math.sin(now * 0.006 + e.anim) * 0.05;
    else if (e.traits.stealth || e.traits.phaser) alpha = 0.75;
    // engine trail for fliers and speeders
    if (!e.stealthed && (e.flying || e.baseSpeed > 2) && Math.random() < 0.35 && e.g.particles.length < 280) {
      e.g.particles.push({
        x: e.x - Math.cos(e.angle) * e.size, y: e.y - Math.sin(e.angle) * e.size,
        vx: -Math.cos(e.angle) * 0.6, vy: -Math.sin(e.angle) * 0.6,
        life: 0.3, maxLife: 0.3, size: 2.4, color: def.color,
      });
    }
    const hurt = e.hp < e.maxHp * 0.3 && !e.stealthed;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px, py);
    if (e.flying) ctx.translate(0, -T * 0.22 + Math.sin(e.anim * 4) * T * 0.05);
    else if (v.hover) { // hovering: slow vertical bob
      const amp = v.hover * dim;
      ctx.translate(0, -amp * 0.5 + Math.sin(e.anim * 3.1 + e.wobble) * amp * 0.5);
    } else if (v.bob) { // walkers: footfall bounce synced to the leg cycle
      ctx.translate(0, -Math.abs(Math.sin(cyc * Math.PI * 2)) * v.bob * dim);
    }
    const wob = Math.sin(e.anim * 6 + e.wobble) * 0.06 * (v.wob === undefined ? 1 : v.wob);
    ctx.rotate(e.angle + wob);
    const sc = 1 + (e.hitT > 0 ? e.hitT * 1.5 : 0);
    if (v.squish) { // gelatinous pulse
      const q = Math.sin(e.anim * 4 + e.wobble) * v.squish;
      ctx.scale(1 + q, 1 - q);
    }
    ctx.drawImage(spr, -dim / 2 * sc, -dim / 2 * sc, dim * sc, dim * sc);
    // live thruster flames (1 creature unit = dim/100 px); no shadowBlur here
    if (v.thr && !e.stealthed) {
      const k = dim / 100;
      const P = epal(def.color);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < v.thr.length; i++) {
        const tx2 = v.thr[i][0] * k, ty2 = v.thr[i][1] * k;
        const fl = (8 + 8 * Math.abs(Math.sin(now * 0.021 + e.wobble * 7 + i * 2.7))) * k;
        ctx.fillStyle = P.a(0.7);
        ctx.beginPath();
        ctx.moveTo(tx2, ty2 - 3.2 * k); ctx.lineTo(tx2, ty2 + 3.2 * k); ctx.lineTo(tx2 - fl, ty2);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.moveTo(tx2, ty2 - 1.5 * k); ctx.lineTo(tx2, ty2 + 1.5 * k); ctx.lineTo(tx2 - fl * 0.5, ty2);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // heavy damage: dark cracks across the carapace
    if (hurt) {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = Math.max(1, dim * 0.035);
      for (let i = 0; i < 2; i++) {
        const a0 = hash1(e.wobble * 10 + i * 7) * 6.28;
        const x0 = Math.cos(a0) * dim * 0.12, y0 = Math.sin(a0) * dim * 0.12;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + Math.cos(a0 + 0.9) * dim * 0.14, y0 + Math.sin(a0 + 0.9) * dim * 0.14);
        ctx.lineTo(x0 + Math.cos(a0 + 0.4) * dim * 0.26, y0 + Math.sin(a0 + 0.4) * dim * 0.26);
        ctx.stroke();
      }
    }
    ctx.restore();
    // heavy damage: smoke wisps + sparks
    if (hurt && e.g.particles.length < 280) {
      if (Math.random() < 0.16) e.g.particles.push({
        x: e.x + (Math.random() - 0.5) * e.size, y: e.y + (Math.random() - 0.5) * e.size,
        vx: (Math.random() - 0.5) * 0.2, vy: -0.5 - Math.random() * 0.4,
        life: 0.55, maxLife: 0.55, size: 2.5 + Math.random() * 2, color: 'rgba(115,115,130,0.6)',
      });
      if (Math.random() < 0.1) e.g.particles.push({
        x: e.x, y: e.y, vx: (Math.random() - 0.5) * 2.4, vy: (Math.random() - 0.5) * 2.4,
        life: 0.25, maxLife: 0.25, size: 1.8, color: '#ffd166',
      });
    }
    // boss aura sparks
    if (e.isBoss && !e.stealthed && Math.random() < 0.2 && e.g.particles.length < 280) {
      const oa = Math.random() * Math.PI * 2;
      e.g.particles.push({
        x: e.x + Math.cos(oa) * e.size * 1.5, y: e.y + Math.sin(oa) * e.size * 1.5,
        vx: Math.cos(oa + 1.57) * 0.8, vy: Math.sin(oa + 1.57) * 0.8,
        life: 0.4, maxLife: 0.4, size: 2.2, color: e.def.color,
      });
    }
    // boss menace ring
    if (e.isBoss && !e.stealthed) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + Math.sin(now * 0.006) * 0.15;
      ctx.strokeStyle = e.def.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, dim * 0.72, now * 0.002, now * 0.002 + 4.4); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // elite crown
    if (e.elite) {
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold ' + Math.round(T * 0.3) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('★', px, py - dim / 2 - T * 0.18);
    }
    // stun sparks
    if (e.stunT > 0) {
      ctx.strokeStyle = '#c86bff'; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9;
      for (let i = 0; i < 3; i++) {
        const a = now * 0.02 + i * 2.1;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(a) * dim * 0.5, py + Math.sin(a) * dim * 0.35);
        ctx.lineTo(px + Math.cos(a + 0.5) * dim * 0.65, py + Math.sin(a + 0.5) * dim * 0.45);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // status pips: chilled / shocked / burning
    if (!e.stealthed && (e.chilledT > 0 || e.shockT > 0 || e.burnT > 0)) {
      ctx.globalCompositeOperation = 'lighter';
      let sxo = px - dim * 0.4;
      if (e.chilledT > 0) { ctx.fillStyle = '#7fdcff'; ctx.fillRect(sxo, py + dim / 2 + 2, 5, 5); sxo += 7; }
      if (e.shockT > 0)   { ctx.fillStyle = '#c86bff'; ctx.fillRect(sxo, py + dim / 2 + 2, 5, 5); sxo += 7; }
      if (e.burnT > 0)    { ctx.fillStyle = '#ff8a5c'; ctx.fillRect(sxo, py + dim / 2 + 2, 5, 5); }
      ctx.globalCompositeOperation = 'source-over';
    }

    // hp bar
    if (e.hp < e.maxHp && !e.stealthed) {
      const bw = Math.max(T * 0.5, dim * 0.8), bh = Math.max(3, T * 0.07);
      const bx = px - bw / 2, by = py - dim / 2 - bh - 3 - (e.flying ? T * 0.22 : 0);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      const frac = UTIL.clamp(e.hp / e.maxHp, 0, 1);
      ctx.fillStyle = frac > 0.5 ? '#5be36b' : (frac > 0.25 ? '#ffc14d' : '#ff3d5f');
      ctx.fillRect(bx, by, bw * frac, bh);
      if (e.maxShield > 0 && e.shield > 0) {
        ctx.fillStyle = '#7fdcff';
        ctx.fillRect(bx, by - bh * 0.7 - 1, bw * UTIL.clamp(e.shield / e.maxShield, 0, 1), bh * 0.55);
      }
    }
  }

  function drawPlacement(g) {
    const lv = g.level;
    // tint buildable cells
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#2aa8ff';
    for (let y = 0; y < lv.rows; y++) for (let x = 0; x < lv.cols; x++) {
      if (g.cellFree(x, y)) ctx.fillRect(sx(x) + 1, sy(y) + 1, T - 2, T - 2);
    }
    ctx.globalAlpha = 1;
    // hovered cell preview
    if (g.placeCell) {
      const { x, y } = g.placeCell;
      const ok = g.cellFree(x, y) && g.cash >= g.towerCost(g.placingType);
      const def = DATA.TOWERS[g.placingType];
      const range = def.levels[0].range * T;
      ctx.fillStyle = ok ? 'rgba(80,255,160,0.10)' : 'rgba(255,60,90,0.12)';
      ctx.beginPath(); ctx.arc(sx(x + 0.5), sy(y + 0.5), range, 0, 7); ctx.fill();
      ctx.strokeStyle = ok ? 'rgba(80,255,160,0.75)' : 'rgba(255,60,90,0.8)';
      ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(sx(x + 0.5), sy(y + 0.5), range, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeRect(sx(x) + 1.5, sy(y) + 1.5, T - 3, T - 3);
      // corner brackets on the candidate tile
      const bpx = sx(x + 0.5), bpy = sy(y + 0.5);
      const hb = T * 0.62, ln = T * 0.26;
      ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (const [cx2, cy2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const bx = bpx + cx2 * hb, by = bpy + cy2 * hb;
        ctx.beginPath();
        ctx.moveTo(bx - cx2 * ln, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by - cy2 * ln);
        ctx.stroke();
      }
      // ghost sprite
      ctx.globalAlpha = 0.75;
      const bs = towerBaseSprite(g.placingType, 0), hs = towerHeadSprite(g.placingType, 0);
      const szz = T * 1.06;
      ctx.drawImage(bs, sx(x + 0.5) - szz / 2, sy(y + 0.5) - szz / 2, szz, szz);
      ctx.drawImage(hs, sx(x + 0.5) - szz / 2, sy(y + 0.5) - szz / 2, szz, szz);
      ctx.globalAlpha = 1;
    }
  }

  return { setup, resize, frame, screenToCell, screenToWorld, cellToScreen, paintTowerIcon, paintEnemyIcon, get T() { return T; }, get boardBottom() { return boardBottom; } };
})();
