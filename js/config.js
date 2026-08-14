/* NEURAL SPIRE — all tuning data in one place */
'use strict';
const CONFIG = (function () {

  // ---------------- spire geometry defaults ----------------
  // Levels override height / socket spacing / segment weights to give each
  // node a distinct topology (see LEVELS below).
  const SPIRE = {
    height: 34,
    rCol: 2.1,         // central column radius (blocks line of sight)
    rPath: 3.7,        // nominal ramp radius
    socketEvery: 3.2,  // ramp arc-length between sockets
  };

  // ---------------- economy ----------------
  const ECONOMY = {
    startSalvage: 130,
    coreHP: 10,
    powerBase: 8,
    interestRate: 0.10,
    interestCap: 50,
    sellRefund: 0.7,
    overclockCost: 25,
    overclockTime: 8,
    overclockCooldown: 18,
    fallBonusPerUnit: 1.2,
  };

  // ---------------- turrets ----------------
  const TURRETS = {
    blaster: {
      name: 'Blaster', ico: '✛', color: 0x7fdcff,
      cost: 50, power: 2, dmg: 7, rate: 1.7, range: 7.5,
      desc: 'Reliable single-target fire. Backbone of any defense.',
    },
    stasis: {
      name: 'Stasis Well', ico: '❉', color: 0x7fffd4,
      cost: 70, power: 2, dmg: 0, rate: 0, range: 5.6, slow: 0.48,
      desc: 'Aura that slows every climber in range. Pairs with anything.',
    },
    repulsor: {
      name: 'Repulsor', ico: '◎', color: 0xffd166,
      cost: 90, power: 3, dmg: 3, rate: 0.45, range: 5.2, knock: 9,
      desc: 'Shockwave hurls climbers off the spire. Fall height pays salvage bonus. Fliers and bosses resist.',
    },
    tesla: {
      name: 'Arc Node', ico: '⌁', color: 0xb08cff,
      cost: 110, power: 3, dmg: 5, rate: 0.9, range: 6.5, chain: 3,
      desc: 'Lightning forks between up to 3 climbers. Shreds swarms.',
    },
    generator: {
      name: 'Generator', ico: '⚡', color: 0xffe9a0,
      cost: 80, power: 0, gen: 6, dmg: 0, rate: 0, range: 0,
      desc: '+6 power. No weapon — it spends a defense socket to grow your grid.',
    },
  };
  const TURRET_ORDER = ['blaster', 'stasis', 'repulsor', 'tesla', 'generator'];
  const UPGRADES = [
    { cost: 0.9, dmg: 1.65, rate: 1.12, range: 1.12, gen: 1.5, slow: 1.12, knock: 1.25 },
    { cost: 1.6, dmg: 1.65, rate: 1.12, range: 1.12, gen: 1.5, slow: 1.12, knock: 1.25 },
  ];

  // ---------------- enemies ----------------
  // pts = encounter-budget cost used by the wave composer
  const ENEMIES = {
    crawler:  { name: 'Crawler',  ico: '●', color: 0xff6a4d, hp: 22,  speed: 1.15, salvage: 8,  size: 0.42, dmg: 1, pts: 1.0 },
    sprinter: { name: 'Sprinter', ico: '▲', color: 0xffd166, hp: 13,  speed: 2.1,  salvage: 10, size: 0.34, dmg: 1, pts: 1.4 },
    gnat:     { name: 'Gnat',     ico: '✦', color: 0x9dff5d, hp: 18,  speed: 1.25, salvage: 12, size: 0.30, dmg: 1, flying: true, pts: 1.8 },
    brute:    { name: 'Brute',    ico: '■', color: 0xff3d6e, hp: 120, speed: 0.62, salvage: 26, size: 0.62, dmg: 2, armor: 3, pts: 4.5 },
    boss:     { name: 'ARCHON',   ico: '◆', color: 0xff2255, hp: 800, speed: 0.5,  salvage: 160, size: 1.0, dmg: 3, armor: 4, boss: true, knockImmune: true, pts: 0 },
  };

  // ---------------- the campaign: 9 authored nodes ----------------
  // Design intent per node, following classic TD level-design structure:
  //   - fixed seed: each node IS its spire — attempts are learnable
  //   - one new element per node (threat, turret, or twist), taught in a
  //     low-pressure showcase wave before it appears under pressure
  //   - topology is a difficulty knob: path length buys DPS time, socket
  //     spacing buys build room, plazas showcase repulsors
  //   - a breather wave precedes every finale so the player can re-invest
  const LEVELS = [
    {
      n: 1, name: 'BOOTSTRAP', sub: 'Learn the climb', seed: 4021, waves: 8,
      palette: ['crawler', 'sprinter'], turrets: ['blaster', 'stasis', 'generator'],
      spire: { height: 30, socketEvery: 2.9, w: { arc: 0.62, sb: 0.14, riser: 0.09, plaza: 0.15 }, plazaMax: 1 },
      eco: { startSalvage: 150 },
      intro: 'A gentle spiral with generous sockets. Hold the line.',
      topo: 'WIDE SPIRAL · DENSE SOCKETS',
    },
    {
      n: 2, name: 'AIRGAP', sub: 'They can fly', seed: 7712, waves: 9,
      palette: ['crawler', 'sprinter', 'gnat'], turrets: ['blaster', 'stasis', 'generator', 'repulsor'],
      teach: { wave: 4, type: 'gnat', text: '✦ GNATS SKIP THE RAMP — THEY RISE STRAIGHT UP. COVER YOUR AIRSPACE.' },
      unlockNote: '◎ REPULSOR UNLOCKED — THROW CLIMBERS OFF THE SPIRE',
      spire: { height: 32, socketEvery: 3.0, w: { arc: 0.5, sb: 0.15, riser: 0.1, plaza: 0.25 }, plazaMax: 2 },
      intro: 'Plaza rings are repulsor country. Fliers ignore all of it.',
      topo: 'TWIN PLAZAS · OPEN AIR',
    },
    {
      n: 3, name: 'SWARM PROTOCOL', sub: 'Quantity is a quality', seed: 1583, waves: 10,
      palette: ['crawler', 'sprinter', 'gnat'], turrets: ['blaster', 'stasis', 'generator', 'repulsor', 'tesla'],
      unlockNote: '⌁ ARC NODE UNLOCKED — LIGHTNING FORKS THROUGH SWARMS',
      bosses: { 10: 1 },
      swarm: true,   // composer: more, weaker enemies in tighter packs
      spire: { height: 32, socketEvery: 3.1, w: { arc: 0.66, sb: 0.2, riser: 0.07, plaza: 0.07 }, plazaMax: 1 },
      intro: 'Dense packs, tight spiral. First ARCHON at the summit push.',
      topo: 'TIGHT COIL · SWARM WAVES',
    },
    {
      n: 4, name: 'SIEGE', sub: 'Armor climbs slow', seed: 9034, waves: 10,
      palette: ['crawler', 'sprinter', 'brute'], turrets: ['blaster', 'stasis', 'generator', 'repulsor', 'tesla'],
      teach: { wave: 3, type: 'brute', text: '■ BRUTES SHRUG OFF WEAK HITS — ARMOR 3. UPGRADE OR OUTSMART.' },
      spire: { height: 27, socketEvery: 3.6, w: { arc: 0.34, sb: 0.16, riser: 0.44, plaza: 0.06 }, plazaMax: 1 },
      intro: 'A short, steep climb and few sockets. Every placement counts.',
      topo: 'SHORT ASCENT · SPARSE SOCKETS',
    },
    {
      n: 5, name: 'BLACKOUT', sub: 'The core is damaged', seed: 3377, waves: 11,
      palette: ['crawler', 'sprinter', 'gnat', 'brute'], turrets: ['blaster', 'stasis', 'generator', 'repulsor', 'tesla'],
      eco: { powerBase: 5 },
      bosses: { 11: 1 },
      spire: { height: 33, socketEvery: 3.2, w: { arc: 0.55, sb: 0.2, riser: 0.15, plaza: 0.1 }, plazaMax: 1 },
      intro: 'Core power is down to 5. Generators are not optional here.',
      topo: 'STANDARD SPIRE · POWER CRISIS', twist: '⚡ CORE POWER 5 (NORMALLY 8)',
    },
    {
      n: 6, name: 'STORMFRONT', sub: 'Updraft', seed: 6119, waves: 11,
      palette: ['sprinter', 'gnat', 'crawler'], turrets: ['blaster', 'stasis', 'generator', 'repulsor', 'tesla'],
      mods: { gnatSpeedMult: 1.3 },
      bosses: { 11: 1 },
      spire: { height: 29, socketEvery: 3.2, w: { arc: 0.5, sb: 0.26, riser: 0.18, plaza: 0.06 }, plazaMax: 1 },
      intro: 'An updraft carries gnats 30% faster, and the spire is short.',
      topo: 'SHORT SPIRE · FLIER SURGE', twist: '✦ GNATS +30% CLIMB SPEED',
    },
    {
      n: 7, name: 'CRACKED MARKET', sub: 'The economy inverts', seed: 8251, waves: 12,
      palette: ['crawler', 'sprinter', 'gnat', 'brute'], turrets: ['blaster', 'stasis', 'generator', 'repulsor', 'tesla'],
      mods: { interestMult: 2, killMult: 0.7 },
      bosses: { 12: 1 },
      spire: { height: 34, socketEvery: 3.3, w: { arc: 0.5, sb: 0.14, riser: 0.11, plaza: 0.25 }, plazaMax: 2 },
      intro: 'Kills pay −30%, but interest is doubled. Hoard, then strike.',
      topo: 'TWIN PLAZAS · LONG CLIMB', twist: '¤ KILLS −30% · INTEREST ×2',
    },
    {
      n: 8, name: 'OVERRUN', sub: 'Everything, faster', seed: 2468, waves: 12,
      palette: ['crawler', 'sprinter', 'gnat', 'brute'], turrets: ['blaster', 'stasis', 'generator', 'repulsor', 'tesla'],
      bosses: { 6: 1, 12: 2 },
      hot: true,     // composer: shorter gaps, denser openers
      spire: { height: 28, socketEvery: 3.3, w: { arc: 0.6, sb: 0.25, riser: 0.12, plaza: 0.03 }, plazaMax: 1 },
      intro: 'Short spire, relentless waves, twin ARCHONs at the end.',
      topo: 'SHORT COIL · RELENTLESS', twist: '☠ TWIN ARCHON FINALE',
    },
    {
      n: 9, name: 'APEX', sub: 'The full stack', seed: 5555, waves: 13,
      palette: ['crawler', 'sprinter', 'gnat', 'brute'], turrets: ['blaster', 'stasis', 'generator', 'repulsor', 'tesla'],
      bosses: { 7: 1, 13: 2 },
      spire: { height: 38, socketEvery: 3.4, w: { arc: 0.42, sb: 0.2, riser: 0.24, plaza: 0.14 }, plazaMax: 2 },
      intro: 'The tallest spire and every threat in the codex. Hold it all.',
      topo: 'MEGASPIRE · BOSS GAUNTLET', twist: '☠ ARCHON AT 7 · TWINS AT 13',
    },
  ];

  // ---------------- wave composer ----------------
  // Encounter-budget waves with authored pacing roles:
  //   opener (light) → ramp → surge every 4th → breather before finale →
  //   finale (heavy, + bosses where scripted). Deterministic per (node, wave).
  function hpMult(L, n) {
    return (1 + 0.26 * Math.pow(L - 1, 1.06)) * (1 + 0.055 * (n - 1));
  }

  function wave(level, n) {
    const R = UTIL.rng(level.seed * 7919 + n * 104729);
    const W = level.waves;
    const hm = hpMult(level.n, n);
    const groups = [];
    const G = (type, count, gap, delay) => groups.push({ type, count, gap, delay: delay || 0, hpMult: hm });

    // teaching wave: the new threat appears alone, in a readable line
    if (level.teach && level.teach.wave === n) {
      G(level.teach.type, 5 + level.n, ENEMIES[level.teach.type].flying ? 1.6 : 1.3, 0.5);
      return groups;
    }

    // pacing role
    let mult = 0.62 + 0.78 * (n / W);
    if (n === 1) mult *= 0.55;
    else if (n === W) mult *= 1.4;
    else if (n === W - 1 && W > 5) mult *= 0.58;   // breather: bank, breathe, rebuild
    else if (n % 4 === 0) mult *= 1.22;            // surge beat
    let budget = (9 + level.n * 2.8) * mult * (1 + 0.055 * (n - 1));

    // scripted bosses spend none of the budget; escorts come from what's left
    const nBoss = (level.bosses && level.bosses[n]) || 0;
    for (let b = 0; b < nBoss; b++) G('boss', 1, 0, b * 9);
    if (nBoss) budget *= 0.55;

    // spend the budget on groups drawn from the node's palette
    const palette = level.palette.filter(t => !level.teach || level.teach.wave < n || level.teach.type !== t || n >= (level.teach.wave));
    let delay = nBoss ? 4 : 0;
    let guard = 0;
    while (budget > 0.9 && guard++ < 12) {
      const type = palette[Math.floor(R() * palette.length)];
      const def = ENEMIES[type];
      const maxN = Math.max(2, Math.floor(budget / def.pts));
      let count = Math.min(maxN, def.pts >= 4 ? 2 + Math.floor(R() * 2) : (level.swarm ? 6 : 4) + Math.floor(R() * 4));
      let gap = def.pts >= 4 ? 2.6 : (def.flying ? 1.1 : 0.85);
      if (level.swarm) gap *= 0.75;
      if (level.hot) gap *= 0.7;
      gap *= Math.max(0.55, 1 - 0.02 * (level.n + n));   // waves pack tighter as pressure rises
      G(type, count, gap, delay);
      budget -= count * def.pts;
      delay += 2 + R() * 3;
    }
    return groups;
  }

  // ---------------- wave directives ----------------
  // Between waves the player picks one of three market-style modifiers (or
  // skips). Each is a real economic trade, not a free buff.
  const DIRECTIVES = [
    { id: 'bull',      ico: '📈', name: 'BULL MARKET',   desc: 'Kills pay +40% this wave. No interest this wave.', mods: { killMult: 1.4, interestMult: 0 } },
    { id: 'haven',     ico: '🏦', name: 'SAFE HAVEN',    desc: 'Interest ×2 this wave. Threats +15% integrity.', mods: { interestMult: 2, enemyHpMult: 1.15 } },
    { id: 'overvolt',  ico: '⚡', name: 'OVERVOLT',      desc: 'Pay ¤30 now for +2 grid power, permanently.', cost: 30, mods: { permPower: 2 } },
    { id: 'drones',    ico: '🛰', name: 'SCRAP DRONES',  desc: '+3 salvage on every kill this wave.', mods: { killFlat: 3 } },
    { id: 'tailwind',  ico: '🌀', name: 'TAILWIND',      desc: 'Turrets +15% fire rate; threats +10% speed.', mods: { rateMult: 1.15, enemySpeedMult: 1.1 } },
    { id: 'insurance', ico: '🛡', name: 'INSURANCE',     desc: 'Each core leak this wave is compensated ¤60.', mods: { leakPay: 60 } },
    { id: 'royalty',   ico: '🪂', name: 'GRAVITY ROYALTIES', desc: 'Fall bonuses pay double this wave.', mods: { fallMult: 2 } },
    { id: 'bonds',     ico: '📜', name: 'WAR BONDS',     desc: '+¤120 now. Kills pay −20% for the next 3 waves.', mods: { instant: 120, killMult: 0.8, duration: 3 } },
    { id: 'coldsnap',  ico: '❄', name: 'COLD SNAP',     desc: 'Pay ¤35: all threats 12% slower this wave.', cost: 35, mods: { enemySpeedMult: 0.88 } },
  ];

  // ---------------- SPIRE OS: in-run tech tree ----------------
  const TECH = [
    { id: 'coretap',  ico: '⚡', name: 'CORE TAP',          cost: 150, desc: '+3 power from the summit core.' },
    { id: 'compound', ico: '¤',  name: 'COMPOUND PROTOCOL', cost: 200, desc: 'Interest 10% → 14%, cap ¤50 → ¤90.' },
    { id: 'lenses',   ico: '✛',  name: 'FOCUS LENSES',      cost: 180, desc: 'Blasters and Arc Nodes +25% damage.' },
    { id: 'massdrv',  ico: '◎',  name: 'MASS DRIVERS',      cost: 160, desc: 'Repulsors +30% force, fall bonus +50%.' },
    { id: 'harmonic', ico: '❉',  name: 'FIELD HARMONICS',   cost: 140, desc: 'Stasis Wells slow 12% harder, +15% range.' },
    { id: 'cycles',   ico: '➤',  name: 'QUICK CYCLES',      cost: 120, desc: 'Overclock costs ¤15 and cools 6s faster.' },
  ];

  return { SPIRE, ECONOMY, TURRETS, TURRET_ORDER, UPGRADES, ENEMIES, LEVELS, wave, hpMult, DIRECTIVES, TECH };
})();
