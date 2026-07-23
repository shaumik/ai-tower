/* NEURAL SIEGE — 50 deterministic level maps (seeded path carving on a grid) */
'use strict';
const MAPS = (function () {
  const COLS = 11;

  // Carve a self-avoiding path from the top edge to the bottom edge.
  // Rule: a candidate cell may touch at most the current head (keeps lanes readable).
  function carve(cols, rows, r, minLen, maxLen) {
    const key = (x, y) => y * cols + x;
    for (let attempt = 0; attempt < 400; attempt++) {
      const sx = UTIL.rint(r, 1, cols - 2);
      let cur = { x: sx, y: 0 };
      const path = [cur];
      const used = new Set([key(sx, 0)]);
      let ok = false;

      for (let steps = 0; steps < cols * rows; steps++) {
        if (cur.y === rows - 1) { ok = path.length >= minLen; break; }
        const dirs = [
          { x: 0, y: 1, w: 3.2 },
          { x: -1, y: 0, w: 2.1 },
          { x: 1, y: 0, w: 2.1 },
          { x: 0, y: -1, w: 0.55 },
        ];
        const cands = [];
        for (const d of dirs) {
          const nx = cur.x + d.x, ny = cur.y + d.y;
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
          if (used.has(key(nx, ny))) continue;
          // count used neighbors of candidate other than current head
          let touch = 0;
          if (nx > 0 && used.has(key(nx - 1, ny))) touch++;
          if (nx < cols - 1 && used.has(key(nx + 1, ny))) touch++;
          if (ny > 0 && used.has(key(nx, ny - 1))) touch++;
          if (ny < rows - 1 && used.has(key(nx, ny + 1))) touch++;
          if (touch > 1) continue; // only the head may touch it
          // bias downward more when path is getting long
          let w = d.w;
          if (path.length > maxLen * 0.8 && d.y === 1) w *= 4;
          cands.push({ d, w });
        }
        if (!cands.length) break;
        const pick = UTIL.wchoice(r, cands, cands.map(c => c.w)).d;
        cur = { x: cur.x + pick.x, y: cur.y + pick.y };
        path.push(cur);
        used.add(key(cur.x, cur.y));
        if (path.length > maxLen && cur.y < rows - 1) break; // too long, retry
      }
      if (ok) return path;
    }
    // Guaranteed fallback: straight column
    const sx = Math.floor(cols / 2);
    const p = [];
    for (let y = 0; y < rows; y++) p.push({ x: sx, y });
    return p;
  }

  // Decorative blocked cells (server racks) on cells not adjacent to the path.
  function placeBlocks(cols, rows, path, r, count) {
    const near = new Set();
    for (const c of path) {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        near.add((c.y + dy) * cols + (c.x + dx));
      }
    }
    const blocks = [];
    let guard = 0;
    while (blocks.length < count && guard++ < 300) {
      const x = UTIL.rint(r, 0, cols - 1), y = UTIL.rint(r, 1, rows - 2);
      const k = y * cols + x;
      if (near.has(k) || blocks.some(b => b.x === x && b.y === y)) continue;
      blocks.push({ x, y });
    }
    return blocks;
  }

  const cache = {};
  function level(n) {
    if (cache[n]) return cache[n];
    const sector = Math.min(4, Math.floor((n - 1) / 10));
    const r = UTIL.rng(0xA1F00D + n * 7919);
    const rows = 14 + Math.min(3, Math.floor((n - 1) / 14)); // 14 → 17 rows as campaign advances
    // path length target grows with level: early = short lanes, later = winding mazes
    const minLen = Math.floor(rows + 2 + Math.min(28, n * 0.9));
    const maxLen = Math.floor(rows + 10 + Math.min(44, n * 1.3));
    const path = carve(COLS, rows, r, minLen, maxLen);
    const blocks = placeBlocks(COLS, rows, path, r, 3 + UTIL.rint(r, 0, 3) + Math.floor(n / 15));

    // special terrain: hills (+range), power nodes (+dmg), dead zones (unbuildable).
    // Placement is scored, not random: bonus tiles go where a tower can actually
    // work the path, dead zones deny prime real estate.
    const tiles = [];
    const taken = new Set(path.map(p => p.x + ',' + p.y).concat(blocks.map(b => b.x + ',' + b.y)));
    const cover = (x, y, r2) => {
      let n = 0, best = 1e9;
      for (const p of path) {
        const d = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
        if (d <= r2) n++;
        if (d < best) best = d;
      }
      return { n, near: Math.sqrt(best) };
    };
    const candidates = [];
    for (let y = 1; y < rows - 1; y++) for (let x = 0; x < COLS; x++) {
      if (taken.has(x + ',' + y)) continue;
      const base = cover(x, y, 6.25);   // path cells inside ~standard tower range
      if (base.near > 2.2) continue;    // too far to ever matter
      const wide = cover(x, y, 12.25);  // path cells a +1-range tower could reach
      candidates.push({ x, y, base: base.n, wide: wide.n, near: base.near });
    }
    const wantTiles = [
      // hills pay off where +1 range unlocks extra path beyond normal reach
      ['hill', 1 + UTIL.rint(r, 0, 1), c => c.wide + c.base * 0.5],
      // power nodes pay off on maximum direct coverage
      ['power', 1 + UTIL.rint(r, 0, 1), c => c.base * 2 + c.wide * 0.25],
      // dead zones hurt most on the tiles you'd most want (hug the path)
      ['dead', UTIL.rint(r, 1, 2), c => (c.near <= 1.2 ? c.base * 2 : 0)],
    ];
    for (const [kind, cnt, score] of wantTiles) {
      for (let placed = 0; placed < cnt; placed++) {
        const open = candidates.filter(c => !taken.has(c.x + ',' + c.y) && score(c) > 0);
        if (!open.length) break;
        open.sort((a, b) => score(b) - score(a));
        // pick among the best few (seeded) so maps stay varied
        const pick = open[UTIL.rint(r, 0, Math.min(open.length - 1, 3))];
        taken.add(pick.x + ',' + pick.y);
        tiles.push({ x: pick.x, y: pick.y, kind });
      }
    }

    const waves = 10 + Math.floor(n * 0.28);            // 10 → 24 waves
    const startCash = 165 + n * 16;
    const lives = 20;
    const def = {
      n, sector, cols: COLS, rows, path, blocks, tiles, waves, startCash, lives,
      boss: DATA.BOSS_LEVELS[n] || null,
      name: nodeName(n, r),
    };
    cache[n] = def;
    return def;
  }

  const NODE_WORDS_A = ['GATE', 'RELAY', 'SHARD', 'SPINE', 'MESH', 'VAULT', 'LOOP', 'STACK', 'GRID', 'PORT'];
  const NODE_WORDS_B = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON', 'ZETA', 'THETA', 'SIGMA', 'OMEGA', 'PRIME'];
  function nodeName(n, r) {
    if (DATA.BOSS_LEVELS[n]) return DATA.ENEMIES[DATA.BOSS_LEVELS[n]].name;
    return NODE_WORDS_A[n % 10] + ' ' + NODE_WORDS_B[Math.floor(n / 5) % 10] + '-' + (n < 10 ? '0' : '') + n;
  }

  // Enemy types whose unlock === n (for "NEW THREAT" intro)
  function newThreatsAt(n) {
    const out = [];
    for (const id in DATA.ENEMIES) {
      const e = DATA.ENEMIES[id];
      if (e.unlock === n && !e.nopool) out.push(id);
    }
    return out;
  }
  // Towers whose unlock === n
  function newTowersAt(n) {
    return DATA.TOWER_ORDER.filter(id => DATA.TOWERS[id].unlock === n);
  }
  function unlockedTowers(n) {
    return DATA.TOWER_ORDER.filter(id => DATA.TOWERS[id].unlock <= n);
  }
  function unlockedEnemies(n) {
    const out = [];
    for (const id in DATA.ENEMIES) {
      const e = DATA.ENEMIES[id];
      if (!e.nopool && e.unlock <= n) out.push(id);
    }
    return out;
  }

  return { level, newThreatsAt, newTowersAt, unlockedTowers, unlockedEnemies, COLS };
})();
