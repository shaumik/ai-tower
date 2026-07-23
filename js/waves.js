/* NEURAL SIEGE — wave composition (deterministic per level+wave+difficulty) */
'use strict';
const WAVES = (function () {

  // HP multiplier applied to an enemy's base hp
  function hpScale(level, wave, diffMult, totalWaves) {
    // progress-relative: same difficulty envelope regardless of how many waves a level has
    const p = Math.max(0, (wave - 1) / Math.max(1, (totalWaves || 20) - 1));
    const earlyGrit = 1 + 0.22 * Math.exp(-(level - 1) / 7); // early enemies are no pushovers
    return (1 + 0.045 * (level - 1) + (1.15 + 0.13 * level) * Math.pow(p, 1.35)) * diffMult * earlyGrit;
  }
  function bountyScale(level, diff, p) {
    // bounties grow with level but decay across a level: late waves have more
    // kills, so per-kill pay drops to keep income roughly flat vs rising threat
    return (1 + 0.018 * level) * diff.bountyMult * (1 - 0.30 * Math.min(1, p || 0));
  }

  // Themed wave formations: each asks a different question of your build
  const FORMATIONS = {
    rush:    { name: 'SPEED RUSH',   ico: '»', desc: 'Fast movers only',            match: e => e.speed >= 1.7, budgetMult: 1.0, hpMult: 0.85 },
    horde:   { name: 'HORDE',        ico: '≋', desc: 'A flood of light units',      match: e => e.threat <= 4,  budgetMult: 1.5, hpMult: 0.75 },
    siege:   { name: 'SIEGE COLUMN', ico: '▣', desc: 'Few, massive, armored',       match: e => e.hp >= 70,     budgetMult: 0.8, hpMult: 1.2 },
    airraid: { name: 'AIR RAID',     ico: '✈', desc: 'Airborne assault',            match: e => e.traits && e.traits.flying },
    phantom: { name: 'PHANTOM OPS',  ico: '◌', desc: 'Stealth infiltration',        match: e => e.traits && e.traits.stealth },
  };
  // formation display data for the UI
  function formationInfo(key) { return FORMATIONS[key] || null; }

  // Build the spawn schedule for one wave: array of {delay, type, hpMult, banner}
  function build(level, wave, totalWaves, diff, forcedFormation) {
    const r = UTIL.rng(0xBEEF + level * 10007 + wave * 271);
    const diffDef = DATA.DIFFS.find(d => d.id === diff) || DATA.DIFFS[0];
    const events = [];
    const isBossWave = !!(DATA.BOSS_LEVELS[level] && wave === totalWaves);
    const isEliteWave = !isBossWave && wave === totalWaves;
    let hs = hpScale(level, wave, diffDef.hpMult, totalWaves);

    // themed formation roll first, else a wave event (never both, never on bosses)
    let event = null, formation = null;
    if (forcedFormation && !isBossWave) {
      formation = forcedFormation;
    } else if (!isBossWave && wave >= 3) {
      const roll = r();
      if (roll < 0.35) {
        const fkeys = Object.keys(FORMATIONS);
        formation = fkeys[Math.floor(r() * fkeys.length)];
      } else if (roll < 0.60) {
        const keys = Object.keys(DATA.EVENTS);
        event = keys[Math.floor(r() * keys.length)];
      }
    }
    const ev = event ? DATA.EVENTS[event] : null;
    if (ev && ev.hpMult) hs *= ev.hpMult;

    // threat budget for this wave (HP scaling carries most difficulty; counts grow gently)
    const rampIn = Math.min(1, 0.7 + wave * 0.15); // first waves are only slightly lighter
    const earlyBoost = 1 + 0.5 * Math.exp(-(level - 1) / 7); // early levels punch harder, fades by ~L15
    const p = Math.max(0, (wave - 1) / Math.max(1, totalWaves - 1));
    const growth = 2.3 + level * 0.17; // total count growth across the level
    let budget = (20 + level * 1.6) * earlyBoost * Math.pow(growth, Math.min(p, 1)) * (0.9 + 0.2 * r()) * rampIn;
    if (ev && ev.countMult) budget *= ev.countMult;
    if (isBossWave) budget *= 0.45; // boss itself is the show
    if (wave > totalWaves) budget *= Math.pow(1.13, wave - totalWaves); // endless overtime compounds

    // pool of unlocked enemy types, weighted toward recent unlocks
    let pool = MAPS.unlockedEnemies(level);
    let fdef = formation ? FORMATIONS[formation] : null;
    if (fdef) {
      const sub = pool.filter(id => fdef.match(DATA.ENEMIES[id]));
      if (sub.length >= 1) {
        pool = sub;
        if (fdef.budgetMult) budget *= fdef.budgetMult;
        if (fdef.hpMult) hs *= fdef.hpMult;
      } else { formation = null; fdef = null; }
    }
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
      // specialists (stealth/flying) arrive as squads, never as the whole wave —
      // unless this IS an air raid / phantom ops formation
      const tr = e.traits || {};
      if ((tr.stealth || tr.flying) && !fdef) count = Math.min(count, 3 + Math.floor(wave / 3));
      if (fdef && (tr.stealth || tr.flying)) count = Math.min(count, 9 + Math.floor(wave / 2));
      budget -= count * e.threat;
      const gap = UTIL.clamp(0.9 / e.speed * (e.size + 0.55), 0.26, 0.95);
      for (let i = 0; i < count; i++) {
        events.push({ delay: t, type, hpMult: hs });
        t += gap * (0.85 + r() * 0.3);
      }
      t += 0.8 + r() * 0.6; // short breather between squads
    }

    // mini-boss checkpoints at ~1/3 and ~2/3 of every level
    const mb1 = Math.round(totalWaves * 0.33), mb2 = Math.round(totalWaves * 0.66);
    if (!isBossWave && (wave === mb1 || wave === mb2)) {
      const bigs = pool.filter(id => DATA.ENEMIES[id].threat >= 7);
      const type = bigs.length ? UTIL.wchoice(r, bigs, bigs.map(() => 1)) : pool[pool.length - 1];
      events.push({ delay: t + 1.5, type, hpMult: hs * 4.2, mini: true });
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
      bounty: bountyScale(level, diffDef, p) * (ev && ev.bounty ? ev.bounty : 1),
      event, formation,
    };
  }

  // Preview: which types appear in a wave + any wave event (for the UI)
  function preview(level, wave, totalWaves, diff, forcedFormation) {
    const w = build(level, wave, totalWaves, diff, forcedFormation);
    const seen = {};
    const list = [];
    let hasMini = false, hasBoss = false;
    for (const ev of w.events) {
      if (ev.mini) hasMini = true;
      if (DATA.ENEMIES[ev.type].traits && DATA.ENEMIES[ev.type].traits.boss) hasBoss = true;
      if (!seen[ev.type]) { seen[ev.type] = 0; list.push(ev.type); }
      seen[ev.type]++;
    }
    return { list: list.map(type => ({ type, count: seen[type] })), event: w.event, formation: w.formation, hasMini, hasBoss };
  }

  function waveEndBonus(level, wave) {
    return 18 + level * 2.5 + wave * 2.5;
  }

  return { build, preview, waveEndBonus, hpScale, formationInfo };
})();
