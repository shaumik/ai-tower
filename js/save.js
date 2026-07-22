/* NEURAL SIEGE — persistence & meta progression */
'use strict';
const SAVE = (function () {
  const KEY = 'neural_siege_save_v1';

  const defaults = () => ({
    cores: 0,
    // per level: { stars: {standard:0..3, hard:0..3, insane:0..3}, endlessBest: 0 }
    levels: {},
    research: {},
    achievements: {},
    seenEnemies: {},
    settings: { sfx: true, music: true, shake: true, autostart: false },
    stats: {
      kills: 0, wavesCleared: 0, towersBuilt: 0, upgradesBought: 0, maxCash: 0,
      perfectWins: 0, bossKills: 0, insaneWins: 0, maxTier: 0, leaks: 0,
      cashEarned: 0, playSeconds: 0,
      sectorClear1: 0, sectorClear2: 0, sectorClear3: 0, sectorClear4: 0, sectorClear5: 0,
      starsTotal: 0, endlessBestAny: 0,
    },
  });

  let state = defaults();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = Object.assign(defaults(), parsed);
        state.settings = Object.assign(defaults().settings, parsed.settings || {});
        state.stats = Object.assign(defaults().stats, parsed.stats || {});
      }
    } catch (e) { state = defaults(); }
    return state;
  }

  let saveTimer = null;
  function persist() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full/blocked */ }
    }, 200);
  }

  function wipe() {
    state = defaults();
    try { localStorage.removeItem(KEY); } catch (e) {}
    persist();
  }

  // ---------- level progress ----------
  function levelRec(n) {
    if (!state.levels[n]) state.levels[n] = { stars: {}, endlessBest: 0 };
    return state.levels[n];
  }
  function starsFor(n, diff) { return (state.levels[n] && state.levels[n].stars[diff]) || 0; }
  function bestStars(n) {
    const rec = state.levels[n];
    if (!rec) return 0;
    return Math.max(rec.stars.standard || 0, rec.stars.hard || 0, rec.stars.insane || 0);
  }
  function isWon(n, diff) { return starsFor(n, diff || 'standard') > 0; }
  function isUnlocked(n) { return n === 1 || isWon(n - 1, 'standard') || isWon(n - 1, 'hard') || isWon(n - 1, 'insane'); }
  function recomputeStarTotal() {
    let t = 0;
    for (const k in state.levels) {
      const s = state.levels[k].stars;
      t += Math.max(s.standard || 0, s.hard || 0, s.insane || 0);
    }
    state.stats.starsTotal = t;
  }
  function recordWin(n, diff, stars, coresEarned) {
    const rec = levelRec(n);
    const prev = rec.stars[diff] || 0;
    if (stars > prev) rec.stars[diff] = stars;
    state.cores += coresEarned;
    recomputeStarTotal();
    // sector clears
    for (let s = 1; s <= 5; s++) {
      let all = true;
      for (let l = (s - 1) * 10 + 1; l <= s * 10; l++) if (bestStars(l) === 0) { all = false; break; }
      if (all) state.stats['sectorClear' + s] = 1;
    }
    persist();
  }

  // ---------- research ----------
  function researchLevel(id) { return state.research[id] || 0; }
  function researchValue(id) {
    const def = DATA.RESEARCH.find(r => r.id === id);
    if (!def) return 0;
    return researchLevel(id) * def.per;
  }
  function buyResearch(id) {
    const def = DATA.RESEARCH.find(r => r.id === id);
    const lvl = researchLevel(id);
    if (!def || lvl >= def.max) return false;
    const cost = def.costs[lvl];
    if (state.cores < cost) return false;
    state.cores -= cost;
    state.research[id] = lvl + 1;
    persist();
    return true;
  }

  // ---------- stats & achievements ----------
  function addStat(k, v) {
    state.stats[k] = (state.stats[k] || 0) + v;
    persist();
  }
  function maxStat(k, v) {
    if (v > (state.stats[k] || 0)) { state.stats[k] = v; persist(); }
  }
  // returns newly unlocked achievement defs
  function checkAchievements() {
    const fresh = [];
    for (const a of DATA.ACHIEVEMENTS) {
      if (state.achievements[a.id]) continue;
      if ((state.stats[a.stat] || 0) >= a.goal) {
        state.achievements[a.id] = true;
        fresh.push(a);
      }
    }
    if (fresh.length) persist();
    return fresh;
  }

  function markSeen(enemyId) {
    if (!state.seenEnemies[enemyId]) { state.seenEnemies[enemyId] = true; persist(); }
  }

  return {
    load, persist, wipe,
    get state() { return state; },
    levelRec, starsFor, bestStars, isWon, isUnlocked, recordWin,
    researchLevel, researchValue, buyResearch,
    addStat, maxStat, checkAchievements, markSeen,
  };
})();
