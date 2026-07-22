/* NEURAL SIEGE — wave composition (deterministic per level+wave+difficulty) */
'use strict';
const WAVES = (function () {

  // HP multiplier applied to an enemy's base hp
  function hpScale(level, wave, diffMult) {
    const earlyGrit = 1 + 0.22 * Math.exp(-(level - 1) / 7); // early enemies are no pushovers
    return (1 + 0.045 * (level - 1) + 0.07 * (wave - 1) + 0.0032 * (wave - 1) * (wave - 1)) * diffMult * earlyGrit;
  }
  function bountyScale(level, diff) {
    // bounties grow with level to track HP inflation
    return (1 + 0.018 * level) * diff.bountyMult;
  }

  // Build the spawn schedule for one wave: array of {delay, type, hpMult, banner}
  function build(level, wave, totalWaves, diff) {
    const r = UTIL.rng(0xBEEF + level * 10007 + wave * 271);
    const diffDef = DATA.DIFFS.find(d => d.id === diff) || DATA.DIFFS[0];
    const events = [];
    const isBossWave = !!(DATA.BOSS_LEVELS[level] && wave === totalWaves);
    const isEliteWave = !isBossWave && wave === totalWaves;
    let hs = hpScale(level, wave, diffDef.hpMult);

    // seeded wave event roll (never on wave 1-3 or boss waves)
    let event = null;
    if (!isBossWave && wave >= 3 && r() < 0.24) {
      const keys = Object.keys(DATA.EVENTS);
      event = keys[Math.floor(r() * keys.length)];
    }
    const ev = event ? DATA.EVENTS[event] : null;
    if (ev && ev.hpMult) hs *= ev.hpMult;

    // threat budget for this wave (HP scaling carries most difficulty; counts grow gently)
    const rampIn = Math.min(1, 0.7 + wave * 0.15); // first waves are only slightly lighter
    const earlyBoost = 1 + 0.5 * Math.exp(-(level - 1) / 7); // early levels punch harder, fades by ~L15
    let budget = (20 + level * 1.6) * earlyBoost * Math.pow(1.075, wave - 1) * (0.9 + 0.2 * r()) * rampIn;
    if (ev && ev.countMult) budget *= ev.countMult;
    if (isBossWave) budget *= 0.45; // boss itself is the show
    if (wave > totalWaves) {
      // endless overtime: keep compounding
      budget = (20 + level * 1.6) * Math.pow(1.075, totalWaves - 1) * Math.pow(1.16, wave - totalWaves);
    }

    // pool of unlocked enemy types, weighted toward recent unlocks
    const pool = MAPS.unlockedEnemies(level);
    const weights = pool.map(id => {
      const e = DATA.ENEMIES[id];
      let w = 1 + 2.4 * Math.exp(-(level - e.unlock) / 6);
      if (e.threat > budget * 0.65) w *= 0.15; // don't blow whole budget on one unit
      return w;
    });

    let t = 0.5;
    const groups = 2 + Math.min(3, Math.floor(wave / 4)) + (budget > 300 ? 1 : 0);
    for (let g = 0; g < groups && budget > 2; g++) {
      const type = UTIL.wchoice(r, pool, weights);
      const e = DATA.ENEMIES[type];
      const share = budget * (0.25 + r() * 0.4);
      let count = Math.max(1, Math.min(26, Math.round(share / e.threat)));
      if (type === 'swarmling') count = Math.min(34, count * 2);
      // specialists (stealth/flying) arrive as squads, never as the whole wave
      const tr = e.traits || {};
      if (tr.stealth || tr.flying) count = Math.min(count, 3 + Math.floor(wave / 3));
      budget -= count * e.threat;
      const gap = UTIL.clamp(0.9 / e.speed * (e.size + 0.55), 0.26, 0.95);
      for (let i = 0; i < count; i++) {
        events.push({ delay: t, type, hpMult: hs });
        t += gap * (0.85 + r() * 0.3);
      }
      t += 0.8 + r() * 0.6; // short breather between squads
    }

    if (isEliteWave && level >= 2) {
      // final wave of a non-boss level: an elite (fattened) unit closes the show
      const bigs = pool.filter(id => DATA.ENEMIES[id].threat >= 8);
      const type = bigs.length ? UTIL.wchoice(r, bigs, bigs.map(() => 1)) : pool[pool.length - 1];
      events.push({ delay: t + 1, type, hpMult: hs * 2.6, elite: true });
    }

    if (isBossWave) {
      const bossId = DATA.BOSS_LEVELS[level];
      events.push({ delay: t + 2, type: bossId, hpMult: diffDef.hpMult, banner: DATA.ENEMIES[bossId].name });
    }

    // Endless bosses: every 10 overtime waves, re-run a boss with compounding hp
    if (wave > totalWaves && (wave - totalWaves) % 10 === 0) {
      const bossPool = ['boss_kernel', 'boss_botmaster', 'boss_fakeprime', 'boss_overmind', 'boss_agi'];
      const bossId = bossPool[Math.min(bossPool.length - 1, Math.floor((wave - totalWaves) / 10) - 1 + Math.floor(level / 15))];
      events.push({ delay: t + 2, type: bossId, hpMult: diffDef.hpMult * Math.pow(1.5, (wave - totalWaves) / 10), banner: DATA.ENEMIES[bossId].name });
    }

    return {
      events,
      bounty: bountyScale(level, diffDef) * (ev && ev.bounty ? ev.bounty : 1),
      event,
    };
  }

  // Preview: which types appear in a wave + any wave event (for the UI)
  function preview(level, wave, totalWaves, diff) {
    const w = build(level, wave, totalWaves, diff);
    const seen = {};
    const list = [];
    for (const ev of w.events) {
      if (!seen[ev.type]) { seen[ev.type] = 0; list.push(ev.type); }
      seen[ev.type]++;
    }
    return { list: list.map(type => ({ type, count: seen[type] })), event: w.event };
  }

  function waveEndBonus(level, wave) {
    return 24 + level * 3 + wave * 4;
  }

  return { build, preview, waveEndBonus, hpScale };
})();
