/* NEURAL SPIRE — tiny localStorage persistence (best run + sound pref) */
'use strict';
const SAVE = (function () {
  const KEY = 'neural-spire-v1';
  let state = { bestWave: 0, victories: 0, muted: false };
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = Object.assign(state, JSON.parse(raw));
    } catch (e) { /* private mode etc. — play without persistence */ }
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }
  function recordRun(wave, won) {
    if (wave > state.bestWave) state.bestWave = wave;
    if (won) state.victories++;
    persist();
  }
  return { load, persist, recordRun, get state() { return state; } };
})();
