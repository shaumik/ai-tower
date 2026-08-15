/* HARVEST PROTOCOL — all tuning data in one place */
'use strict';
const CONFIG = (function () {

  // ---------------- economy ----------------
  // Income comes from MINING, not kills. Workers shuttle crystal loads to
  // drop-offs; kills pay only token scrap. The economy is the game.
  const ECONOMY = {
    startMinerals: 120,
    coreHP: 20,
    powerBase: 6,          // power supplied by the core itself
    workerCost: 50,
    workerCarry: 8,        // minerals per trip
    workerCapBase: 4,      // +2 per depot
    workerHP: 24,
    mineTime: 1.6,         // seconds at the crystal per load
    scrapMult: 1,          // token scrap from kills (small)
    interestRate: 0.08,    // paid on unspent minerals at each wave start
    interestCap: 40,
    sellRefund: 0.7,
    overclockCost: 25,
    overclockTime: 8,
    overclockCooldown: 18,
    repairCostPerHP: 0.5,
  };

  // ---------------- buildings ----------------
  // blocks: occupies grid cells enemies must path around (walls only —
  // combat/economy structures sit on hover pads and don't block).
  const BUILDINGS = {
    cannon: {
      name: 'Cannon', ico: '✛', color: 0x7fdcff, kind: 'turret',
      cost: 60, power: 2, hp: 90, dmg: 8, rate: 1.5, range: 8,
      desc: 'Reliable single-target fire. Backbone of any defense.',
    },
    stasis: {
      name: 'Stasis Well', ico: '❉', color: 0x7fffd4, kind: 'turret',
      cost: 70, power: 2, hp: 70, dmg: 0, rate: 0, range: 6, slow: 0.45,
      desc: 'Aura that slows every hostile in range. Pairs with anything.',
    },
    mortar: {
      name: 'Mortar', ico: '◎', color: 0xffd166, kind: 'turret',
      cost: 95, power: 3, hp: 80, dmg: 14, rate: 0.5, range: 10, minRange: 3.5, splash: 2.2,
      desc: 'Long-range shells with splash. Blind up close — screen it.',
    },
    tesla: {
      name: 'Arc Node', ico: '⌁', color: 0xb08cff, kind: 'turret',
      cost: 110, power: 3, hp: 80, dmg: 5, rate: 0.9, range: 6.5, chain: 3,
      desc: 'Lightning forks between up to 3 hostiles. Shreds packs.',
    },
    generator: {
      name: 'Generator', ico: '⚡', color: 0xffe9a0, kind: 'eco',
      cost: 80, power: 0, gen: 6, hp: 70,
      desc: '+6 power to the grid. Turrets go dark without it.',
    },
    depot: {
      name: 'Depot', ico: '⬒', color: 0x9dffb0, kind: 'eco',
      cost: 100, power: 1, hp: 110, dropoff: true, workerCap: 2,
      desc: 'Drop-off point for miners (+2 worker cap). Mine far fields without the long haul.',
    },
    wall: {
      name: 'Wall', ico: '▦', color: 0x8fa8c8, kind: 'wall',
      cost: 15, power: 0, hp: 160, blocks: true,
      desc: 'Blocks ground hostiles — they must break it or walk around. Shape their approach.',
    },
  };
  const BUILD_ORDER = ['cannon', 'stasis', 'mortar', 'tesla', 'wall', 'generator', 'depot'];
  const UPGRADES = [   // turret levels 2 and 3
    { cost: 0.9, dmg: 1.6, rate: 1.1, range: 1.1, hp: 1.4, gen: 1.5, slow: 1.1 },
    { cost: 1.6, dmg: 1.6, rate: 1.1, range: 1.1, hp: 1.4, gen: 1.5, slow: 1.1 },
  ];

  // ---------------- enemies ----------------
  // target: core | workers | buildings. pts = encounter-budget cost.
  const ENEMIES = {
    crawler:  { name: 'Crawler', ico: '●', color: 0xff6a4d, hp: 26,  speed: 1.5, scrap: 3, size: 0.42, dmg: 1, pts: 1.0, target: 'core' },
    sprinter: { name: 'Sprinter', ico: '▲', color: 0xffd166, hp: 15,  speed: 2.6, scrap: 4, size: 0.34, dmg: 1, pts: 1.4, target: 'core' },
    raider:   { name: 'Raider',  ico: '✕', color: 0x9dff5d, hp: 30,  speed: 2.9, scrap: 5, size: 0.36, dmg: 8, pts: 2.0, target: 'workers', atkRate: 0.8 },
    brute:    { name: 'Brute',   ico: '■', color: 0xff3d6e, hp: 150, speed: 0.9, scrap: 10, size: 0.62, dmg: 12, pts: 4.5, target: 'buildings', armor: 3, atkRate: 0.7 },
    boss:     { name: 'ARCHON',  ico: '◆', color: 0xff2255, hp: 1100, speed: 0.75, scrap: 60, size: 1.0, dmg: 4, pts: 0, target: 'core', armor: 4, boss: true, wallBreaker: 3 },
  };

  // ---------------- the campaign: 9 authored operations ----------------
  // Fixed seeds: each node IS its map. One new element per node; topology
  // (field spread, gate directions, rock cover) is a difficulty knob; twist
  // nodes bend the economy. Maps are portrait: gates north, core south.
  const LEVELS = [
    {
      n: 1, name: 'CLAIM', sub: 'Stake it, mine it, hold it', seed: 811, waves: 8,
      palette: ['crawler', 'sprinter'], buildings: ['cannon', 'stasis', 'wall', 'generator'],
      map: { w: 34, h: 52, rocks: 10, fields: [
        { x: 0.5, y: 0.72, r: 900 }, { x: 0.26, y: 0.6, r: 700 }, { x: 0.74, y: 0.62, r: 700 },
      ], gates: [0.5] },
      intro: 'Three close fields, one gate. Learn the mining line.',
      topo: 'CLOSE FIELDS · ONE GATE',
    },
    {
      n: 2, name: 'POACHERS', sub: 'They hunt your miners', seed: 922, waves: 9,
      palette: ['crawler', 'sprinter', 'raider'], buildings: ['cannon', 'stasis', 'wall', 'generator', 'depot'],
      teach: { wave: 3, type: 'raider', text: '✕ RAIDERS IGNORE YOUR CORE — THEY KILL WORKERS. GUARD THE MINING LINE.' },
      unlockNote: '⬒ DEPOT UNLOCKED — REMOTE DROP-OFF, +2 WORKER CAP',
      map: { w: 34, h: 54, rocks: 12, fields: [
        { x: 0.5, y: 0.75, r: 700 }, { x: 0.2, y: 0.45, r: 900 }, { x: 0.8, y: 0.47, r: 900 },
      ], gates: [0.25, 0.75] },
      intro: 'Rich fields sit far from home. Depots shorten the haul — and widen the front.',
      topo: 'FAR FIELDS · TWO GATES',
    },
    {
      n: 3, name: 'SCRAPLINE', sub: 'Quantity is a quality', seed: 133, waves: 10,
      palette: ['crawler', 'sprinter', 'raider'], buildings: ['cannon', 'stasis', 'mortar', 'wall', 'generator', 'depot'],
      unlockNote: '◎ MORTAR UNLOCKED — SPLASH SHELLS FOR DENSE PACKS',
      bosses: { 10: 1 }, swarm: true,
      map: { w: 36, h: 52, rocks: 8, fields: [
        { x: 0.35, y: 0.68, r: 800 }, { x: 0.65, y: 0.68, r: 800 }, { x: 0.5, y: 0.4, r: 1000 },
      ], gates: [0.2, 0.5, 0.8] },
      intro: 'Open ground, three gates, dense packs. First ARCHON at the end.',
      topo: 'OPEN GROUND · THREE GATES',
    },
    {
      n: 4, name: 'BREAKERS', sub: 'They come for your buildings', seed: 244, waves: 10,
      palette: ['crawler', 'sprinter', 'brute'], buildings: ['cannon', 'stasis', 'mortar', 'tesla', 'wall', 'generator', 'depot'],
      teach: { wave: 3, type: 'brute', text: '■ BRUTES SIEGE STRUCTURES — ARMOR 3, BUILDING-KILLER. FOCUS THEM DOWN.' },
      unlockNote: '⌁ ARC NODE UNLOCKED — CHAIN LIGHTNING',
      map: { w: 32, h: 50, rocks: 16, fields: [
        { x: 0.5, y: 0.66, r: 900 }, { x: 0.75, y: 0.35, r: 1100 },
      ], gates: [0.35, 0.65] },
      intro: 'Tight canyons and crystal-poor ground. Every structure is a target now.',
      topo: 'CANYONS · CRYSTAL-POOR',
    },
    {
      n: 5, name: 'BROWNOUT', sub: 'The grid is failing', seed: 355, waves: 11,
      palette: ['crawler', 'sprinter', 'raider', 'brute'], buildings: ['cannon', 'stasis', 'mortar', 'tesla', 'wall', 'generator', 'depot'],
      eco: { powerBase: 3, startMinerals: 150 },
      bosses: { 11: 1 },
      map: { w: 34, h: 54, rocks: 12, fields: [
        { x: 0.3, y: 0.7, r: 800 }, { x: 0.7, y: 0.7, r: 800 }, { x: 0.5, y: 0.35, r: 1200 },
      ], gates: [0.5, 0.85] },
      intro: 'Core power is down to 3. Generators first, guns second.',
      topo: 'STANDARD GROUND · POWER CRISIS', twist: '⚡ CORE POWER 3 (NORMALLY 6)',
    },
    {
      n: 6, name: 'DUST RUSH', sub: 'Thin veins, fast raids', seed: 466, waves: 11,
      palette: ['sprinter', 'raider', 'crawler'], buildings: ['cannon', 'stasis', 'mortar', 'tesla', 'wall', 'generator', 'depot'],
      mods: { raiderSpeedMult: 1.25 },
      bosses: { 11: 1 },
      map: { w: 36, h: 56, rocks: 10, fields: [
        { x: 0.2, y: 0.75, r: 500 }, { x: 0.8, y: 0.75, r: 500 }, { x: 0.2, y: 0.35, r: 700 }, { x: 0.8, y: 0.35, r: 700 },
      ], gates: [0.15, 0.5, 0.85] },
      intro: 'Four thin fields in the corners. Raiders are faster; your line is long.',
      topo: 'SCATTERED VEINS · RAIDER SURGE', twist: '✕ RAIDERS +25% SPEED',
    },
    {
      n: 7, name: 'CRASHED MARKET', sub: 'Only the vault pays', seed: 577, waves: 12,
      palette: ['crawler', 'sprinter', 'raider', 'brute'], buildings: ['cannon', 'stasis', 'mortar', 'tesla', 'wall', 'generator', 'depot'],
      mods: { interestMult: 2, mineMult: 0.75 },
      eco: { startMinerals: 220 },
      bosses: { 12: 1 },
      map: { w: 34, h: 54, rocks: 12, fields: [
        { x: 0.5, y: 0.7, r: 1000 }, { x: 0.25, y: 0.4, r: 900 }, { x: 0.75, y: 0.4, r: 900 },
      ], gates: [0.3, 0.7] },
      intro: 'Crystals trade at 75%, but interest is doubled. Bank it, then spend big.',
      topo: 'STANDARD GROUND · LONG CLIMB', twist: '¤ MINING −25% · INTEREST ×2',
    },
    {
      n: 8, name: 'OVERRUN', sub: 'Everything, everywhere', seed: 688, waves: 12,
      palette: ['crawler', 'sprinter', 'raider', 'brute'], buildings: ['cannon', 'stasis', 'mortar', 'tesla', 'wall', 'generator', 'depot'],
      bosses: { 6: 1, 12: 2 }, hot: true,
      map: { w: 36, h: 52, rocks: 9, fields: [
        { x: 0.5, y: 0.72, r: 900 }, { x: 0.3, y: 0.5, r: 800 }, { x: 0.7, y: 0.5, r: 800 },
      ], gates: [0.15, 0.4, 0.6, 0.85] },
      intro: 'Four gates, relentless waves, twin ARCHONs at the end.',
      topo: 'FOUR GATES · RELENTLESS', twist: '☠ TWIN ARCHON FINALE',
    },
    {
      n: 9, name: 'MOTHERLODE', sub: 'The richest ground on the map', seed: 999, waves: 13,
      palette: ['crawler', 'sprinter', 'raider', 'brute'], buildings: ['cannon', 'stasis', 'mortar', 'tesla', 'wall', 'generator', 'depot'],
      bosses: { 7: 1, 13: 2 },
      map: { w: 38, h: 58, rocks: 14, fields: [
        { x: 0.5, y: 0.78, r: 600 }, { x: 0.2, y: 0.55, r: 800 }, { x: 0.8, y: 0.55, r: 800 }, { x: 0.5, y: 0.22, r: 1600 },
      ], gates: [0.2, 0.5, 0.8] },
      intro: 'The motherlode sits at the north wall — beside the gates. Greed or safety.',
      topo: 'MOTHERLODE AT THE GATES · BOSS GAUNTLET', twist: '☠ ARCHON AT 7 · TWINS AT 13',
    },
  ];

  // ---------------- wave composer ----------------
  // Encounter-budget waves with authored pacing (opener → ramp → surge →
  // breather → finale). Node scaling phases in across the level so openers
  // stay survivable from starting resources.
  function hpMult(level, n) {
    const L = level.n, W = level.waves;
    const ramp = 0.4 + 0.6 * Math.min(1, n / (W * 0.7));
    return (1 + 0.18 * (L - 1) * ramp) * (1 + 0.05 * (n - 1));
  }
  function startMinerals(level) {
    return (level.eco && level.eco.startMinerals) || (120 + 8 * (level.n - 1));
  }

  function wave(level, n) {
    const R = UTIL.rng(level.seed * 7919 + n * 104729);
    const W = level.waves;
    const hm = hpMult(level, n);
    const groups = [];
    const G = (type, count, gap, delay) => groups.push({ type, count, gap, delay: delay || 0, hpMult: hm });

    if (level.teach && level.teach.wave === n) {
      const def = ENEMIES[level.teach.type];
      const count = Math.max(3, Math.min(8, Math.round((6 + level.n * 1.5) / def.pts)));
      G(level.teach.type, count, def.pts >= 4 ? 2.4 : 1.5, 0.5);
      return groups;
    }

    let mult = 0.62 + 0.78 * (n / W);
    if (n === 1) mult *= 0.55;
    else if (n === W) mult *= 1.4;
    else if (n === W - 1 && W > 5) mult *= 0.58;
    else if (n % 4 === 0) mult *= 1.22;
    let budget = (8 + level.n * 1.1) * mult * (1 + Math.min(1.3, (0.05 + 0.011 * level.n) * (n - 1)));

    const nBoss = (level.bosses && level.bosses[n]) || 0;
    for (let b = 0; b < nBoss; b++) G('boss', 1, 0, b * 9);
    if (nBoss) budget *= 0.55;

    let palette = level.palette.filter(t => !(level.teach && level.teach.type === t && n < level.teach.wave));
    if (n <= 2) palette = palette.filter(t => ENEMIES[t].pts <= 1.5);
    if (!palette.length) palette = [level.palette[0]];

    let delay = nBoss ? 4 : 0;
    let guard = 0;
    while (budget > 0.9 && guard++ < 12) {
      const type = palette[Math.floor(R() * palette.length)];
      const def = ENEMIES[type];
      const maxN = Math.max(2, Math.floor(budget / def.pts));
      let count = Math.min(maxN, def.pts >= 4 ? 2 + Math.floor(R() * 2) : (level.swarm ? 6 : 4) + Math.floor(R() * 4));
      let gap = def.pts >= 4 ? 2.6 : (def.speed > 2.4 ? 1.0 : 0.85);
      if (level.swarm) gap *= 0.85;
      if (level.hot) gap *= 0.7;
      gap *= Math.max(0.55, 1 - 0.02 * (level.n + n));
      G(type, count, gap, delay);
      budget -= count * def.pts;
      delay += 2 + R() * 3;
    }
    return groups;
  }

  // ---------------- wave directives ----------------
  const DIRECTIVES = [
    { id: 'surge',     ico: '⛏', name: 'MINING SURGE',  desc: 'Miners work +30% faster this wave. Threats +10% speed.', mods: { mineSpeedMult: 1.3, enemySpeedMult: 1.1 } },
    { id: 'haven',     ico: '🏦', name: 'SAFE HAVEN',    desc: 'Interest ×2 this wave. Threats +15% integrity.', mods: { interestMult: 2, enemyHpMult: 1.15 } },
    { id: 'overvolt',  ico: '⚡', name: 'OVERVOLT',      desc: 'Pay ¤30 now for +2 grid power, permanently.', cost: 30, mods: { permPower: 2 } },
    { id: 'convoy',    ico: '🛰', name: 'ESCORT DRONES', desc: 'Workers take half damage this wave.', mods: { workerArmorMult: 0.5 } },
    { id: 'bounty',    ico: '💰', name: 'BOUNTY MARKET', desc: 'Kills pay triple scrap this wave. Mining −20%.', mods: { scrapMult: 3, mineMult: 0.8 } },
    { id: 'insurance', ico: '🛡', name: 'INSURANCE',     desc: 'Every worker or building lost this wave is compensated ¤40.', mods: { lossPay: 40 } },
    { id: 'bonds',     ico: '📜', name: 'WAR BONDS',     desc: '+¤120 now. Mining pays −20% for the next 3 waves.', mods: { instant: 120, mineMult: 0.8, duration: 3 } },
    { id: 'coldsnap',  ico: '❄', name: 'COLD SNAP',     desc: 'Pay ¤35: all threats 12% slower this wave.', cost: 35, mods: { enemySpeedMult: 0.88 } },
    { id: 'crackdown', ico: '🎯', name: 'CRACKDOWN',    desc: 'Turrets +15% fire rate this wave; miners −10% speed.', mods: { rateMult: 1.15, mineSpeedMult: 0.9 } },
  ];

  // ---------------- CORE OS: in-run tech tree ----------------
  const TECH = [
    { id: 'coretap',  ico: '⚡', name: 'CORE TAP',          cost: 150, desc: '+3 power from the core.' },
    { id: 'compound', ico: '¤',  name: 'COMPOUND PROTOCOL', cost: 200, desc: 'Interest 8% → 12%, cap ¤40 → ¤80.' },
    { id: 'lenses',   ico: '✛',  name: 'FOCUS LENSES',      cost: 180, desc: 'Cannons and Arc Nodes +25% damage.' },
    { id: 'drills',   ico: '⛏', name: 'PLASMA DRILLS',     cost: 160, desc: 'Miners mine 25% faster and carry +4.' },
    { id: 'plating',  ico: '▦',  name: 'HARDENED PLATING',  cost: 140, desc: 'Buildings and walls +40% integrity (new and existing).' },
    { id: 'cycles',   ico: '➤',  name: 'QUICK CYCLES',      cost: 120, desc: 'Overclock costs ¤15 and cools 6s faster.' },
  ];

  return { ECONOMY, BUILDINGS, BUILD_ORDER, UPGRADES, ENEMIES, LEVELS, wave, hpMult, startMinerals, DIRECTIVES, TECH };
})();
