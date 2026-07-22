/* NEURAL SIEGE — canvas renderer. Neon vector art, pre-rendered sprites for mobile perf. */
'use strict';
const RENDER = (function () {
  let canvas, ctx, dpr = 1;
  let W = 0, H = 0;          // css pixels
  let T = 32, OX = 0, OY = 0; // tile size + origin (css px)
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
      OY = TOP_MARGIN + (availH - T * lv.rows) / 2;
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

  // ---- tower drawing: base + head, in 100x100 space ----
  function drawTowerBase(c, def, tier) {
    // platform with depth: shadow, gradient body, lit top edge
    c.save();
    c.translate(2, 3); c.globalAlpha = 0.45; c.fillStyle = '#000';
    roundRect(c, -40, -40, 80, 80, 16); c.fill();
    c.restore(); c.globalAlpha = 1;
    c.lineWidth = 4;
    const grd = c.createRadialGradient(0, -22, 8, 0, 6, 62);
    grd.addColorStop(0, '#1c2c4e');
    grd.addColorStop(1, '#0a1220');
    c.fillStyle = grd; c.strokeStyle = 'rgba(140,190,255,0.35)';
    roundRect(c, -40, -40, 80, 80, 16); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(210,240,255,0.28)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-26, -38); c.lineTo(26, -38); c.stroke();
    neon(c, def.color, 8);
    c.globalAlpha = 0.6; c.lineWidth = 2.5;
    roundRect(c, -33, -33, 66, 66, 12); c.stroke();
    c.globalAlpha = 1;
    // tier pips
    c.shadowBlur = 6;
    for (let i = 0; i <= tier; i++) {
      c.fillStyle = i === 3 ? '#ffd166' : def.color;
      c.beginPath(); c.arc(-27 + i * 18, 33, 4, 0, 7); c.fill();
    }
  }
  function drawTowerHead(c, def, tier) {
    const col = def.color;
    c.lineWidth = 5; c.lineJoin = 'round'; c.lineCap = 'round';
    neon(c, col, 10);
    const t = tier;
    switch (def.kind) {
      case 'bullet':
        if (def.reveals) { // scanner: radar dish
          c.beginPath(); c.arc(0, 0, 20 + t * 2, -1.9, 1.9); c.stroke();
          c.beginPath(); c.moveTo(0, 0); c.lineTo(26 + t * 3, 0); c.stroke();
          c.beginPath(); c.arc(0, 0, 7, 0, 7); c.globalAlpha = 0.7; c.fill(); c.globalAlpha = 1;
        } else { // sentry: barrel(s)
          c.beginPath(); c.arc(0, 0, 15 + t * 1.5, 0, 7); c.globalAlpha = 0.35; c.fill(); c.globalAlpha = 1;
          c.beginPath(); c.arc(0, 0, 15 + t * 1.5, 0, 7); c.stroke();
          c.beginPath(); c.moveTo(8, t >= 2 ? -6 : 0); c.lineTo(34 + t * 2, t >= 2 ? -6 : 0); c.stroke();
          if (t >= 2) { c.beginPath(); c.moveTo(8, 6); c.lineTo(34 + t * 2, 6); c.stroke(); }
        }
        break;
      case 'snipe':
        c.beginPath(); c.arc(0, 0, 13, 0, 7); c.globalAlpha = 0.35; c.fill(); c.globalAlpha = 1;
        c.beginPath(); c.arc(0, 0, 13, 0, 7); c.stroke();
        c.lineWidth = 6; c.beginPath(); c.moveTo(6, 0); c.lineTo(44 + t * 2, 0); c.stroke();
        c.lineWidth = 3; c.beginPath(); c.moveTo(20, -7); c.lineTo(30, -7); c.stroke();
        break;
      case 'chain':
        c.beginPath(); c.moveTo(0, -26 - t * 2); c.lineTo(0, 8); c.stroke();
        for (let i = 0; i < 3; i++) {
          c.beginPath(); c.arc(0, 2 - i * (9 + t), 12 - i * 2.5, 0.4, Math.PI - 0.4); c.stroke();
        }
        c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -26 - t * 2, 5, 0, 7); c.fill();
        break;
      case 'splash':
        roundRect(c, -12, -14, 24, 28, 6); c.globalAlpha = 0.35; c.fill(); c.globalAlpha = 1;
        roundRect(c, -12, -14, 24, 28, 6); c.stroke();
        c.lineWidth = 8; c.beginPath(); c.moveTo(6, 0); c.lineTo(30 + t * 3, 0); c.stroke();
        break;
      case 'slowaura':
        for (let i = 0; i < 3; i++) { c.globalAlpha = 0.9 - i * 0.28; c.beginPath(); c.arc(0, 0, 10 + i * 9 + t, 0, 7); c.stroke(); }
        c.globalAlpha = 1; c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill();
        break;
      case 'field':
        for (let i = 0; i < 5; i++) {
          const a = i * Math.PI * 2 / 5 - Math.PI / 2;
          c.beginPath(); c.arc(Math.cos(a) * 17, Math.sin(a) * 17, 6 + t * 0.7, 0, 7);
          c.globalAlpha = 0.6; c.fill(); c.globalAlpha = 1;
        }
        c.beginPath(); c.arc(0, 0, 8, 0, 7); c.stroke();
        break;
      case 'income':
        c.font = 'bold 40px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.globalAlpha = 0.35; hexPath(c, 26 + t * 2); c.fill(); c.globalAlpha = 1;
        hexPath(c, 26 + t * 2); c.stroke();
        c.fillStyle = '#fff'; c.fillText('¤', 0, 3);
        break;
      case 'buffaura':
        c.beginPath(); c.moveTo(6, -28); c.lineTo(-10, 4); c.lineTo(2, 4); c.lineTo(-6, 28); c.lineTo(12, -4); c.lineTo(0, -4); c.closePath();
        c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1; c.stroke();
        break;
      case 'beam':
        roundRect(c, -10, -18, 36 + t * 3, 12, 5); c.globalAlpha = 0.4; c.fill(); c.globalAlpha = 1;
        roundRect(c, -10, -18, 36 + t * 3, 12, 5); c.stroke();
        roundRect(c, -10, 6, 36 + t * 3, 12, 5); c.globalAlpha = 0.4; c.fill(); c.globalAlpha = 1;
        roundRect(c, -10, 6, 36 + t * 3, 12, 5); c.stroke();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(-14, 0, 8, 0, 7); c.fill();
        break;
      case 'emp':
        c.beginPath(); c.arc(0, 0, 12, 0, 7); c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1;
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4;
          c.beginPath(); c.arc(0, 0, 24 + t, a - 0.5, a + 0.5); c.stroke();
        }
        break;
      case 'orb':
        c.beginPath(); c.arc(0, 0, 14, 0, 7); c.fillStyle = '#fff'; c.shadowBlur = 18; c.fill();
        neon(c, col, 10);
        c.beginPath(); c.ellipse(0, 0, 30, 10, 0.5, 0, 7); c.stroke();
        c.beginPath(); c.ellipse(0, 0, 30, 10, -0.5, 0, 7); c.stroke();
        break;
    }
  }
  const DIRECTIONAL = { bullet: 1, snipe: 1, splash: 1, beam: 1 };

  function towerBaseSprite(type, tier) {
    const px = T * 1.06;
    return makeSprite('tb_' + type + tier + '_' + Math.round(px), px, c => drawTowerBase(c, DATA.TOWERS[type], tier));
  }
  function towerHeadSprite(type, tier) {
    const px = T * 1.06;
    return makeSprite('th_' + type + tier + '_' + Math.round(px), px, c => drawTowerHead(c, DATA.TOWERS[type], tier));
  }

  // Icon renderers for DOM UI (build bar, codex)
  function paintTowerIcon(cv, type, tier) {
    const c = cv.getContext('2d');
    const s = cv.width;
    c.clearRect(0, 0, s, s);
    c.save(); c.scale(s / 100, s / 100); c.translate(50, 50);
    drawTowerBase(c, DATA.TOWERS[type], tier || 0);
    drawTowerHead(c, DATA.TOWERS[type], tier || 0);
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

    // towers
    for (const tw of g.towers) {
      const bs = towerBaseSprite(tw.type, tw.tier);
      const hs = towerHeadSprite(tw.type, tw.tier);
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
      // muzzle flash
      if (tw.flashT > 0 && DIRECTIONAL[tw.def.kind]) {
        ctx.globalCompositeOperation = 'lighter';
        const fr = T * (0.10 + tw.flashT * 1.3);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(T * 0.4, 0, fr * 0.5, 0, 7); ctx.fill();
        ctx.globalAlpha = 0.6; ctx.fillStyle = tw.def.color;
        ctx.beginPath(); ctx.arc(T * 0.4, 0, fr, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
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
    const sc = 1 + Math.sin(e.anim * 5) * 0.04;
    ctx.drawImage(spr, -dim / 2 * sc, -dim / 2 * sc, dim * sc, dim * sc);
    ctx.restore();
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

  return { setup, resize, frame, screenToCell, screenToWorld, cellToScreen, paintTowerIcon, paintEnemyIcon, get T() { return T; } };
})();
