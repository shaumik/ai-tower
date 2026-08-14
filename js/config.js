/* NEURAL SPIRE — all tuning data in one place */
'use strict';
const CONFIG = (function () {

  // ---------------- spire geometry ----------------
  const SPIRE = {
    height: 34,        // summit core height
    turns: 3.6,        // helix revolutions base→summit
    rCol: 2.1,         // central column radius (blocks line of sight)
    rPath: 3.7,        // climb ramp radius
    rSocket: 4.7,      // build socket radius
    socketEvery: 3.2,  // ramp arc-length between sockets
  };

  // ---------------- economy ----------------
  const ECONOMY = {
    startSalvage: 130,
    coreHP: 10,
    powerBase: 8,        // power supplied by the summit core itself
    interestRate: 0.10,  // paid on unspent salvage at each wave start
    interestCap: 50,
    sellRefund: 0.7,
    overclockCost: 25,   // salvage per overclock burst
    overclockTime: 8,    // seconds of double fire-rate
    overclockCooldown: 18,
    fallBonusPerUnit: 1.2, // extra salvage per unit of fall height (gravity kills)
  };

  // ---------------- turrets ----------------
  // upgrade steps apply multiplicatively on top of the base stats
  const TURRETS = {
    blaster: {
      name: 'Blaster', ico: '✛', color: 0x7fdcff,
      cost: 50, power: 2, dmg: 7, rate: 1.7, range: 7.5,
      desc: 'Reliable single-target fire. Backbone of any defense.',
    },
    tesla: {
      name: 'Arc Node', ico: '⌁', color: 0xb08cff,
      cost: 110, power: 3, dmg: 5, rate: 0.9, range: 6.5, chain: 3,
      desc: 'Lightning forks between up to 3 climbers. Shreds swarms.',
    },
    repulsor: {
      name: 'Repulsor', ico: '◎', color: 0xffd166,
      cost: 90, power: 3, dmg: 3, rate: 0.45, range: 5.2, knock: 9,
      desc: 'Shockwave hurls climbers off the spire. Fall height pays salvage bonus. Fliers and bosses resist.',
    },
    stasis: {
      name: 'Stasis Well', ico: '❉', color: 0x7fffd4,
      cost: 70, power: 2, dmg: 0, rate: 0, range: 5.6, slow: 0.48,
      desc: 'Aura that slows every climber in range. Pairs with anything.',
    },
    generator: {
      name: 'Generator', ico: '⚡', color: 0xffe9a0,
      cost: 80, power: 0, gen: 6, dmg: 0, rate: 0, range: 0,
      desc: '+6 power. No weapon — it spends a defense socket to grow your grid.',
    },
  };
  const TURRET_ORDER = ['blaster', 'stasis', 'repulsor', 'tesla', 'generator'];
  const UPGRADES = [                       // level 2 and level 3
    { cost: 0.9, dmg: 1.65, rate: 1.12, range: 1.12, gen: 1.5, slow: 1.12, knock: 1.25 },
    { cost: 1.6, dmg: 1.65, rate: 1.12, range: 1.12, gen: 1.5, slow: 1.12, knock: 1.25 },
  ];

  // ---------------- enemies ----------------
  const ENEMIES = {
    crawler:  { name: 'Crawler',  ico: '●', color: 0xff6a4d, hp: 22,  speed: 1.15, salvage: 8,  size: 0.42, dmg: 1 },
    sprinter: { name: 'Sprinter', ico: '▲', color: 0xffd166, hp: 13,  speed: 2.1,  salvage: 10, size: 0.34, dmg: 1 },
    brute:    { name: 'Brute',    ico: '■', color: 0xff3d6e, hp: 120, speed: 0.62, salvage: 26, size: 0.62, dmg: 2, armor: 3 },
    gnat:     { name: 'Gnat',     ico: '✦', color: 0x9dff5d, hp: 18,  speed: 1.25, salvage: 12, size: 0.30, dmg: 1, flying: true },
    boss:     { name: 'ARCHON',   ico: '◆', color: 0xff2255, hp: 950, speed: 0.5,  salvage: 160, size: 1.0, dmg: 3, armor: 4, boss: true, knockImmune: true },
  };

  // ---------------- waves ----------------
  const MAX_WAVE = 15;
  // scripted early waves teach one thing each; later waves scale by formula
  function wave(n) {
    const hpMult = 1 + Math.pow(Math.max(0, n - 1), 1.22) * 0.16;
    const W = (type, count, gap, delay) => ({ type, count, gap, delay: delay || 0, hpMult });
    switch (n) {
      case 1: return [W('crawler', 6, 1.6)];
      case 2: return [W('crawler', 9, 1.2)];
      case 3: return [W('crawler', 6, 1.3), W('sprinter', 4, 0.9, 6)];
      case 4: return [W('crawler', 7, 1.1), W('gnat', 4, 1.4, 4)];
      case 5: return [W('boss', 1, 0, 0), W('crawler', 8, 1.4, 3)];
      case 6: return [W('sprinter', 10, 0.7), W('gnat', 5, 1.2, 5)];
      case 7: return [W('brute', 3, 3.2), W('crawler', 10, 0.9, 2)];
      case 8: return [W('gnat', 9, 0.8), W('sprinter', 8, 0.8, 5)];
      default: {
        // 9+: formulaic escalation with themed mixes
        const list = [];
        const theme = n % 3;
        const c = Math.min(26, 6 + n * 1.3);
        if (theme === 0) { list.push(W('brute', Math.floor(2 + n * 0.4), 2.6), W('crawler', Math.floor(c), 0.8, 3)); }
        if (theme === 1) { list.push(W('sprinter', Math.floor(c), 0.55), W('gnat', Math.floor(4 + n * 0.7), 0.8, 4)); }
        if (theme === 2) { list.push(W('crawler', Math.floor(c), 0.75), W('gnat', Math.floor(3 + n * 0.5), 1.0, 3), W('brute', Math.floor(n * 0.3), 3, 6)); }
        if (n % 5 === 0) list.unshift(W('boss', Math.max(1, Math.floor(n / 10)), 8, 0));
        return list;
      }
    }
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
  // One-time purchases: long-term investment vs. the next turret.
  const TECH = [
    { id: 'coretap',  ico: '⚡', name: 'CORE TAP',          cost: 150, desc: '+3 power from the summit core.' },
    { id: 'compound', ico: '¤',  name: 'COMPOUND PROTOCOL', cost: 200, desc: 'Interest 10% → 14%, cap ¤50 → ¤90.' },
    { id: 'lenses',   ico: '✛',  name: 'FOCUS LENSES',      cost: 180, desc: 'Blasters and Arc Nodes +25% damage.' },
    { id: 'massdrv',  ico: '◎',  name: 'MASS DRIVERS',      cost: 160, desc: 'Repulsors +30% force, fall bonus +50%.' },
    { id: 'harmonic', ico: '❉',  name: 'FIELD HARMONICS',   cost: 140, desc: 'Stasis Wells slow 12% harder, +15% range.' },
    { id: 'cycles',   ico: '➤',  name: 'QUICK CYCLES',      cost: 120, desc: 'Overclock costs ¤15 and cools 6s faster.' },
  ];

  return { SPIRE, ECONOMY, TURRETS, TURRET_ORDER, UPGRADES, ENEMIES, MAX_WAVE, wave, DIRECTIVES, TECH };
})();
