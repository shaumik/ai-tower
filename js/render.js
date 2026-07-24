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

  function neon(c, color, blur) {
    c.shadowColor = color; c.shadowBlur = blur === undefined ? 10 : blur;
    c.strokeStyle = color; c.fillStyle = color;
  }

  // ---- enemy shape drawing in 100x100 space, facing +x ----
  function drawEnemyShape(c, shape, color) {
    c.lineWidth = 6; c.lineJoin = 'round'; c.lineCap = 'round';
    neon(c, color, 12);
    switch (shape) {
      case 'bot':
        c.globalAlpha = 0.25; c.beginPath(); c.arc(0, 0, 30, 0, 7); c.fill(); c.globalAlpha = 1;
        c.beginPath(); c.arc(0, 0, 30, 0, 7); c.stroke();
        c.beginPath(); c.arc(10, 0, 8, 0, 7); c.fillStyle = '#fff'; c.fill();
        c.beginPath(); c.moveTo(-30, -18); c.lineTo(-44, -30); c.moveTo(-30, 18); c.lineTo(-44, 30); c.stroke();
        break;
      case 'dart':
        c.globalAlpha = 0.3; c.beginPath(); c.moveTo(38, 0); c.lineTo(-26, -20); c.lineTo(-14, 0); c.lineTo(-26, 20); c.closePath(); c.fill();
        c.globalAlpha = 1; c.beginPath(); c.moveTo(38, 0); c.lineTo(-26, -20); c.lineTo(-14, 0); c.lineTo(-26, 20); c.closePath(); c.stroke();
        break;
      case 'blob': {
        c.globalAlpha = 0.3; blobPath(c); c.fill(); c.globalAlpha = 1; blobPath(c); c.stroke();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(-8, -6, 5, 0, 7); c.arc(10, -2, 5, 0, 7); c.fill();
        break;
      }
      case 'tri':
        c.beginPath(); c.moveTo(30, 0); c.lineTo(-22, -22); c.lineTo(-22, 22); c.closePath();
        c.globalAlpha = 0.35; c.fill(); c.globalAlpha = 1; c.stroke();
        break;
      case 'box':
        c.globalAlpha = 0.25; c.fillRect(-28, -28, 56, 56); c.globalAlpha = 1;
        c.strokeRect(-28, -28, 56, 56);
        c.beginPath(); c.moveTo(-28, -10); c.lineTo(28, -10); c.moveTo(-28, 8); c.lineTo(28, 8); c.stroke();
        c.fillStyle = '#fff'; c.fillRect(-6, -4, 12, 8);
        break;
      case 'worm':
        for (let i = 0; i < 4; i++) {
          const x = 24 - i * 17, rr = 16 - i * 2.4;
          c.globalAlpha = 0.3; c.beginPath(); c.arc(x, Math.sin(i * 1.5) * 6, rr, 0, 7); c.fill();
          c.globalAlpha = 1; c.beginPath(); c.arc(x, Math.sin(i * 1.5) * 6, rr, 0, 7); c.stroke();
        }
        break;
      case 'wing':
        c.beginPath(); c.moveTo(34, 0); c.lineTo(-6, -30); c.lineTo(-18, -8); c.lineTo(-18, 8); c.lineTo(-6, 30); c.closePath();
        c.globalAlpha = 0.3; c.fill(); c.globalAlpha = 1; c.stroke();
        c.beginPath(); c.arc(6, 0, 7, 0, 7); c.fillStyle = '#fff'; c.fill();
        break;
      case 'lock':
        c.globalAlpha = 0.3; roundRect(c, -26, -14, 52, 40, 8); c.fill(); c.globalAlpha = 1;
        roundRect(c, -26, -14, 52, 40, 8); c.stroke();
        c.beginPath(); c.arc(0, -16, 16, Math.PI, 0); c.stroke();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 6, 7, 0, 7); c.fill();
        break;
      case 'leech':
        c.beginPath(); c.ellipse(0, 0, 34, 16, 0, 0, 7);
        c.globalAlpha = 0.3; c.fill(); c.globalAlpha = 1; c.stroke();
        c.beginPath(); c.arc(26, 0, 8, 0, 7); c.fillStyle = '#fff'; c.fill();
        c.beginPath(); c.moveTo(-34, 0); c.lineTo(-46, -10); c.moveTo(-34, 0); c.lineTo(-46, 10); c.stroke();
        break;
      case 'twin':
        c.globalAlpha = 0.3; c.beginPath(); c.arc(-14, 0, 20, 0, 7); c.arc(14, 0, 20, 0, 7); c.fill(); c.globalAlpha = 1;
        c.beginPath(); c.arc(-14, 0, 20, 0, 7); c.stroke();
        c.beginPath(); c.arc(14, 0, 20, 0, 7); c.stroke();
        c.beginPath(); c.moveTo(-14, -20); c.lineTo(14, 20); c.stroke();
        break;
      case 'mask':
        c.globalAlpha = 0.3; c.beginPath(); c.ellipse(0, 0, 24, 30, 0, 0, 7); c.fill(); c.globalAlpha = 1;
        c.beginPath(); c.ellipse(0, 0, 24, 30, 0, 0, 7); c.stroke();
        c.fillStyle = '#05070d';
        c.beginPath(); c.ellipse(-9, -8, 6, 9, 0.3, 0, 7); c.fill();
        c.beginPath(); c.ellipse(9, -8, 6, 9, -0.3, 0, 7); c.fill();
        c.beginPath(); c.arc(0, 14, 8, 0, Math.PI); c.stroke();
        break;
      case 'hub':
        c.beginPath(); c.arc(0, 0, 16, 0, 7); c.globalAlpha = 0.35; c.fill(); c.globalAlpha = 1; c.stroke();
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3;
          c.beginPath(); c.moveTo(Math.cos(a) * 16, Math.sin(a) * 16); c.lineTo(Math.cos(a) * 38, Math.sin(a) * 38); c.stroke();
          c.beginPath(); c.arc(Math.cos(a) * 38, Math.sin(a) * 38, 6, 0, 7); c.fillStyle = '#fff'; c.fill();
          neon(c, color, 12);
        }
        break;
      case 'jam':
        c.beginPath(); c.arc(0, 0, 18, 0, 7); c.globalAlpha = 0.3; c.fill(); c.globalAlpha = 1;
        c.beginPath(); c.arc(0, 0, 18, 0, 7); c.stroke();
        // radiating interference spikes
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4;
          c.beginPath();
          c.moveTo(Math.cos(a) * 18, Math.sin(a) * 18);
          c.lineTo(Math.cos(a) * 36, Math.sin(a) * 36);
          c.stroke();
          c.beginPath(); c.arc(Math.cos(a) * 36, Math.sin(a) * 36, 4, 0, 7);
          c.globalAlpha = 0.7; c.fill(); c.globalAlpha = 1;
        }
        c.fillStyle = '#fff';
        c.font = 'bold 22px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('✕', 0, 1);
        break;
      case 'golem':
        c.globalAlpha = 0.3; roundRect(c, -30, -26, 60, 52, 10); c.fill(); c.globalAlpha = 1;
        roundRect(c, -30, -26, 60, 52, 10); c.stroke();
        roundRect(c, -18, -14, 36, 20, 5); c.stroke();
        c.fillStyle = '#ffdd55'; c.beginPath(); c.arc(-8, -4, 4, 0, 7); c.arc(8, -4, 4, 0, 7); c.fill();
        break;
      case 'hook':
        c.beginPath(); c.arc(0, -6, 22, -0.5, Math.PI + 0.5); c.stroke();
        c.beginPath(); c.moveTo(-20, 8); c.lineTo(-20, 26); c.lineTo(-6, 34); c.stroke();
        c.beginPath(); c.arc(14, -20, 8, 0, 7); c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1;
        break;
      case 'qbit':
        c.beginPath(); c.arc(0, 0, 12, 0, 7); c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1;
        c.beginPath(); c.ellipse(0, 0, 34, 13, 0.6, 0, 7); c.stroke();
        c.beginPath(); c.ellipse(0, 0, 34, 13, -0.6, 0, 7); c.stroke();
        break;
      case 'flash':
        c.beginPath(); c.moveTo(10, -34); c.lineTo(-16, 4); c.lineTo(0, 4); c.lineTo(-10, 34); c.lineTo(18, -6); c.lineTo(2, -6); c.closePath();
        c.globalAlpha = 0.4; c.fill(); c.globalAlpha = 1; c.stroke();
        break;
      case 'hydra':
        for (let i = -1; i <= 1; i++) {
          c.beginPath(); c.moveTo(-10, 0); c.quadraticCurveTo(8, i * 22, 30, i * 26);
          c.stroke();
          c.beginPath(); c.arc(30, i * 26, 8, 0, 7); c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1;
        }
        c.beginPath(); c.arc(-16, 0, 15, 0, 7); c.globalAlpha = 0.35; c.fill(); c.globalAlpha = 1;
        c.beginPath(); c.arc(-16, 0, 15, 0, 7); c.stroke();
        break;
      case 'ghost':
        c.beginPath();
        c.arc(0, -6, 24, Math.PI, 0);
        c.lineTo(24, 22); c.lineTo(12, 12); c.lineTo(0, 24); c.lineTo(-12, 12); c.lineTo(-24, 22);
        c.closePath();
        c.globalAlpha = 0.3; c.fill(); c.globalAlpha = 1; c.stroke();
        c.fillStyle = '#05070d'; c.beginPath(); c.arc(-8, -6, 5, 0, 7); c.arc(8, -6, 5, 0, 7); c.fill();
        break;
      case 'tank':
        c.globalAlpha = 0.3; roundRect(c, -34, -22, 68, 44, 8); c.fill(); c.globalAlpha = 1;
        roundRect(c, -34, -22, 68, 44, 8); c.stroke();
        roundRect(c, -40, -30, 80, 10, 4); c.stroke();
        roundRect(c, -40, 20, 80, 10, 4); c.stroke();
        c.beginPath(); c.moveTo(0, 0); c.lineTo(40, 0); c.stroke();
        break;
      case 'mirror':
        c.beginPath(); c.moveTo(0, -32); c.lineTo(24, 0); c.lineTo(0, 32); c.lineTo(-24, 0); c.closePath();
        c.globalAlpha = 0.35; c.fill(); c.globalAlpha = 1; c.stroke();
        c.beginPath(); c.moveTo(0, -32); c.lineTo(0, 32); c.stroke();
        break;
      case 'titan':
        c.globalAlpha = 0.25; hexPath(c, 42); c.fill(); c.globalAlpha = 1;
        hexPath(c, 42); c.stroke();
        hexPath(c, 26); c.stroke();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 8, 0, 7); c.fill();
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3 + Math.PI / 6;
          c.beginPath(); c.arc(Math.cos(a) * 34, Math.sin(a) * 34, 3.5, 0, 7); c.fill();
        }
        break;
      // -------- bosses --------
      case 'bosskernel':
        c.lineWidth = 7; hexPath(c, 40); c.globalAlpha = 0.3; c.fill(); c.globalAlpha = 1; hexPath(c, 40); c.stroke();
        c.font = 'bold 34px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#fff'; c.fillText('!', 0, 2);
        c.beginPath(); c.arc(0, 0, 46, 0.3, 1.4); c.stroke();
        c.beginPath(); c.arc(0, 0, 46, 3.4, 4.6); c.stroke();
        break;
      case 'bossmaster':
        c.lineWidth = 6; c.beginPath(); c.arc(0, 0, 26, 0, 7); c.globalAlpha = 0.35; c.fill(); c.globalAlpha = 1; c.stroke();
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          c.beginPath(); c.moveTo(Math.cos(a) * 26, Math.sin(a) * 26); c.lineTo(Math.cos(a) * 44, Math.sin(a) * 44); c.stroke();
          c.beginPath(); c.arc(Math.cos(a) * 44, Math.sin(a) * 44, 5, 0, 7); c.fillStyle = '#fff'; c.fill(); neon(c, color, 12);
        }
        c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 9, 0, 7); c.fill();
        break;
      case 'bossfake':
        c.lineWidth = 6;
        c.beginPath(); c.ellipse(-10, 0, 24, 34, 0.15, 0, 7); c.globalAlpha = 0.25; c.fill(); c.globalAlpha = 1; c.stroke();
        c.setLineDash([8, 6]); c.beginPath(); c.ellipse(14, 0, 24, 34, -0.15, 0, 7); c.stroke(); c.setLineDash([]);
        c.fillStyle = '#05070d';
        c.beginPath(); c.ellipse(-16, -10, 6, 9, 0.3, 0, 7); c.fill();
        c.beginPath(); c.ellipse(2, -10, 6, 9, -0.3, 0, 7); c.fill();
        break;
      case 'bossmind':
        c.lineWidth = 6; c.beginPath(); c.arc(0, 0, 34, 0, 7); c.globalAlpha = 0.3; c.fill(); c.globalAlpha = 1; c.stroke();
        c.beginPath(); c.moveTo(-34, 0); c.bezierCurveTo(-12, -30, 12, 30, 34, 0); c.stroke();
        c.beginPath(); c.moveTo(0, -34); c.bezierCurveTo(-30, -12, 30, 12, 0, 34); c.stroke();
        c.beginPath(); c.arc(0, 0, 47, 0, 7); c.setLineDash([6, 10]); c.stroke(); c.setLineDash([]);
        c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 7, 0, 7); c.fill();
        break;
      case 'bossagi':
        c.lineWidth = 6;
        hexPath(c, 44); c.globalAlpha = 0.25; c.fill(); c.globalAlpha = 1; hexPath(c, 44); c.stroke();
        c.beginPath(); c.arc(0, 0, 30, 0, 7); c.stroke();
        // eye
        c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, 0, 16, 9, 0, 0, 7); c.fill();
        c.fillStyle = '#ff2255'; c.beginPath(); c.arc(0, 0, 6, 0, 7); c.fill();
        for (let i = 0; i < 3; i++) {
          const a = i * Math.PI * 2 / 3 - Math.PI / 2;
          c.beginPath(); c.arc(Math.cos(a) * 44, Math.sin(a) * 44, 6, 0, 7); c.fillStyle = '#fff'; c.fill();
        }
        break;
      default:
        c.beginPath(); c.arc(0, 0, 28, 0, 7); c.stroke();
    }
  }
  function blobPath(c) {
    c.beginPath();
    c.moveTo(30, 0);
    c.bezierCurveTo(30, 22, 16, 32, -2, 30);
    c.bezierCurveTo(-24, 28, -34, 12, -28, -8);
    c.bezierCurveTo(-22, -28, 2, -34, 16, -26);
    c.bezierCurveTo(26, -20, 30, -12, 30, 0);
    c.closePath();
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

  function enemySprite(type) {
    const def = DATA.ENEMIES[type];
    const px = Math.max(20, T * def.size * 2.6);
    return makeSprite('e_' + type + '_' + Math.round(px), px, c => {
      // drop shadow pass for depth, then the neon body
      c.save();
      c.translate(2.5, 3.5);
      c.globalAlpha = 0.5;
      drawEnemyShape(c, def.shape, '#000000');
      c.restore();
      c.globalAlpha = 1;
      drawEnemyShape(c, def.shape, def.color);
    });
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
    drawEnemyShape(c, DATA.ENEMIES[type].shape, DATA.ENEMIES[type].color);
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
      ctx.strokeText('☄ TAP TO TARGET ORBITAL STRIKE', W / 2, OY + T * 1.1);
      ctx.fillText('☄ TAP TO TARGET ORBITAL STRIKE', W / 2, OY + T * 1.1);
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
    const spr = enemySprite(e.type);
    const px = sx(e.x), py = sy(e.y);
    const dim = T * e.def.size * 2.6;
    let alpha = 1;
    if (e.stealthed) alpha = 0.15 + Math.sin(now * 0.006 + e.anim) * 0.05;
    else if (e.traits.stealth || e.traits.phaser) alpha = 0.7;
    // engine trail for fliers and speeders
    if (!e.stealthed && (e.flying || e.baseSpeed > 2) && Math.random() < 0.35 && e.g.particles.length < 280) {
      e.g.particles.push({
        x: e.x - Math.cos(e.angle) * e.size, y: e.y - Math.sin(e.angle) * e.size,
        vx: -Math.cos(e.angle) * 0.6, vy: -Math.sin(e.angle) * 0.6,
        life: 0.3, maxLife: 0.3, size: 2.4, color: e.def.color,
      });
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px, py);
    if (e.flying) ctx.translate(0, -T * 0.22 + Math.sin(e.anim * 4) * T * 0.05);
    const wob = Math.sin(e.anim * 6 + e.wobble) * 0.06;
    ctx.rotate(e.angle + wob);
    const sc = 1 + Math.sin(e.anim * 5) * 0.04 + (e.hitT > 0 ? e.hitT * 1.5 : 0);
    ctx.drawImage(spr, -dim / 2 * sc, -dim / 2 * sc, dim * sc, dim * sc);
    ctx.restore();
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
