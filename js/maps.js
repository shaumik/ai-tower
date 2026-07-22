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

    const waves = 8 + Math.floor(n * 0.5);              // 8 → 33 waves
    const startCash = 216 + n * 14;
    const lives = 20;
    const def = {
      n, sector, cols: COLS, rows, path, blocks, waves, startCash, lives,
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
