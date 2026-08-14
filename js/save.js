/* NEURAL SPIRE — localStorage persistence: campaign progress + sound pref */
'use strict';
const SAVE = (function () {
  const KEY = 'neural-spire-v2';
  let state = { furthest: 1, levels: {}, muted: false };
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = Object.assign(state, JSON.parse(raw));
    } catch (e) { /* private mode etc. — play without persistence */ }
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function recordLevel(n, stars, won) {
    const cur = state.levels[n] || { stars: 0, attempts: 0 };
    cur.attempts++;
    if (won) {
      cur.stars = Math.max(cur.stars, stars);
      if (n + 1 > state.furthest && n + 1 <= CONFIG.LEVELS.length) state.furthest = n + 1;
    }
    state.levels[n] = cur;
    persist();
  }
  function starsFor(n) { return (state.levels[n] && state.levels[n].stars) || 0; }
  function clearedCount() {
    let c = 0;
    for (const k in state.levels) if (state.levels[k].stars > 0) c++;
    return c;
  }
  return { load, persist, recordLevel, starsFor, clearedCount, get state() { return state; } };
})();
