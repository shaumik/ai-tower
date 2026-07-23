/* NEURAL SIEGE — all balance data, towers, enemies, research, achievements */
'use strict';
const DATA = (function () {

  const VERSION = '1.6.3';

  // ------------------------------------------------------------------
  // SECTORS — 5 campaigns of 10 levels
  // ------------------------------------------------------------------
  const SECTORS = [
    { name: 'SPAM FILTER',      tag: 'S1', path: '#1c6ea8', glow: '#2aa8ff', bg: '#070d18', accent: '#4fc3f7' },
    { name: 'DARKNET RELAY',    tag: 'S2', path: '#7a3fa8', glow: '#c86bff', bg: '#0c0716', accent: '#c86bff' },
    { name: 'NEURAL FABRIC',    tag: 'S3', path: '#1d8a6b', glow: '#2fe6a8', bg: '#06120d', accent: '#2fe6a8' },
    { name: 'QUANTUM VAULT',    tag: 'S4', path: '#a8721c', glow: '#ffc14d', bg: '#120d05', accent: '#ffc14d' },
    { name: 'AGI CONTAINMENT',  tag: 'S5', path: '#a82440', glow: '#ff3d71', bg: '#130509', accent: '#ff5d8a' },
  ];

  // ------------------------------------------------------------------
  // DIFFICULTY TIERS
  // ------------------------------------------------------------------
  const DIFFS = [
    { id: 'standard', name: 'STANDARD', hpMult: 1.0,  bountyMult: 1.0,  coreMult: 1 },
    { id: 'hard',     name: 'HARD',     hpMult: 1.4,  bountyMult: 0.92, coreMult: 2 },
    { id: 'insane',   name: 'INSANE',   hpMult: 1.95, bountyMult: 0.85, coreMult: 4 },
  ];

  // ------------------------------------------------------------------
  // TOWERS — 12 types, 4 tiers each
  // kind: bullet | chain | slowaura | beam | snipe | splash | field | income | buffaura | emp | orb
  // ------------------------------------------------------------------
  const TOWERS = {
    sentry: {
      name: 'Sentry Node', color: '#4fc3f7', unlock: 1, kind: 'bullet', air: true,
      desc: 'Reliable packet-interceptor turret. The backbone of any perimeter.',
      levels: [
        { cost: 45,  dmg: 8,  rate: 1.2,  range: 2.5 },
        { cost: 60,  dmg: 15, rate: 1.35, range: 2.7 },
        { cost: 95,  dmg: 30, rate: 1.5,  range: 2.9 },
        { cost: 150, dmg: 56, rate: 1.7,  range: 3.2 },
      ],
    },
    scanner: {
      name: 'Scan Array', color: '#7fdcff', unlock: 2, kind: 'bullet', air: true, reveals: true,
      desc: 'Rapid-fire heuristic scanner. REVEALS stealthed threats in range.',
      levels: [
        { cost: 70,  dmg: 3,  rate: 3.5, range: 2.3 },
        { cost: 70,  dmg: 5,  rate: 3.8, range: 2.5 },
        { cost: 110, dmg: 10, rate: 4.2, range: 2.8 },
        { cost: 170, dmg: 17, rate: 4.6, range: 3.1 },
      ],
    },
    tarpit: {
      name: 'Tarpit', color: '#9ccc65', unlock: 3, kind: 'field', air: false,
      desc: 'Floods nearby data lanes with junk handshakes. Damages and slows ground threats.',
      levels: [
        { cost: 80,  dmg: 4,  rate: 2, range: 1.7, slow: 0.25 },
        { cost: 60,  dmg: 7,  rate: 2, range: 1.9, slow: 0.30 },
        { cost: 90,  dmg: 13, rate: 2, range: 2.1, slow: 0.35 },
        { cost: 140, dmg: 20, rate: 2, range: 2.4, slow: 0.42 },
      ],
    },
    mortar: {
      name: 'Packet Mortar', color: '#ff8a5c', unlock: 5, kind: 'splash', air: false,
      desc: 'Lobs compressed payload bombs. Splash damage wrecks clustered threats. Cannot hit fliers.',
      levels: [
        { cost: 130, dmg: 26,  rate: 0.5,  range: 3.4, splash: 1.15 },
        { cost: 110, dmg: 44,  rate: 0.52, range: 3.7, splash: 1.30 },
        { cost: 170, dmg: 82,  rate: 0.55, range: 4.0, splash: 1.45 },
        { cost: 260, dmg: 138, rate: 0.6,  range: 4.3, splash: 1.65 },
      ],
    },
    throttle: {
      name: 'Throttler', color: '#64b5f6', unlock: 7, kind: 'slowaura', air: false,
      desc: 'Bandwidth-choke field. Continuously slows all ground threats in radius.',
      levels: [
        { cost: 90,  dmg: 0, rate: 0, range: 2.0, slow: 0.32 },
        { cost: 80,  dmg: 0, rate: 0, range: 2.3, slow: 0.40 },
        { cost: 120, dmg: 0, rate: 0, range: 2.6, slow: 0.48 },
        { cost: 190, dmg: 0, rate: 0, range: 3.0, slow: 0.58 },
      ],
    },
    farm: {
      name: 'Compute Farm', color: '#ffd166', unlock: 9, kind: 'income', air: false,
      desc: 'Mines credits between engagements. Pays out at the end of every wave.',
      levels: [
        { cost: 140, dmg: 0, rate: 0, range: 0.9, income: 35 },
        { cost: 130, dmg: 0, rate: 0, range: 0.9, income: 60 },
        { cost: 200, dmg: 0, rate: 0, range: 0.9, income: 95 },
        { cost: 300, dmg: 0, rate: 0, range: 0.9, income: 150 },
      ],
    },
    pulse: {
      name: 'Pulse Coil', color: '#b388ff', unlock: 11, kind: 'chain', air: true,
      desc: 'Arc-discharge coil. Lightning chains between multiple threats.',
      levels: [
        { cost: 120, dmg: 12, rate: 0.9,  range: 2.4, chains: 3 },
        { cost: 100, dmg: 20, rate: 1.0,  range: 2.6, chains: 4 },
        { cost: 160, dmg: 38, rate: 1.1,  range: 2.8, chains: 5 },
        { cost: 250, dmg: 64, rate: 1.25, range: 3.0, chains: 6 },
      ],
    },
    sniper: {
      name: 'Kernel Sniper', color: '#ff5d8a', unlock: 14, kind: 'snipe', air: true, pierce: true,
      desc: 'Ring-0 precision strike. Extreme range and damage, IGNORES armor.',
      levels: [
        { cost: 160, dmg: 55,  rate: 0.38, range: 5.5 },
        { cost: 140, dmg: 105, rate: 0.42, range: 6.5 },
        { cost: 230, dmg: 215, rate: 0.46, range: 7.5 },
        { cost: 360, dmg: 390, rate: 0.50, range: 9.0 },
      ],
    },
    overclock: {
      name: 'Overclocker', color: '#ffe07a', unlock: 17, kind: 'buffaura', air: false,
      desc: 'Boosts damage of all towers in radius. Higher tiers also boost fire rate. Buffs do not stack.',
      levels: [
        { cost: 150, dmg: 0, rate: 0, range: 1.9, buffDmg: 0.15, buffRate: 0    },
        { cost: 140, dmg: 0, rate: 0, range: 2.1, buffDmg: 0.25, buffRate: 0    },
        { cost: 220, dmg: 0, rate: 0, range: 2.3, buffDmg: 0.35, buffRate: 0.10 },
        { cost: 340, dmg: 0, rate: 0, range: 2.6, buffDmg: 0.50, buffRate: 0.20 },
      ],
    },
    lance: {
      name: 'Photon Lance', color: '#2fe6a8', unlock: 21, kind: 'beam', air: true,
      desc: 'GPU-cluster beam weapon. Damage ramps up to 250% while locked on a target.',
      levels: [
        { cost: 210, dmg: 18, rate: 0, range: 3.0 },
        { cost: 180, dmg: 30, rate: 0, range: 3.2 },
        { cost: 280, dmg: 56, rate: 0, range: 3.4 },
        { cost: 430, dmg: 98, rate: 0, range: 3.6 },
      ],
    },
    emp: {
      name: 'EMP Emitter', color: '#c86bff', unlock: 26, kind: 'emp', air: true,
      desc: 'Periodic electromagnetic burst: damages and STUNS every threat in radius. Bosses are slowed instead.',
      levels: [
        { cost: 190, dmg: 15, rate: 1 / 5.5, range: 2.2, stun: 0.9 },
        { cost: 170, dmg: 25, rate: 1 / 5.0, range: 2.4, stun: 1.1 },
        { cost: 260, dmg: 40, rate: 1 / 4.5, range: 2.6, stun: 1.3 },
        { cost: 400, dmg: 60, rate: 1 / 3.8, range: 2.9, stun: 1.6 },
      ],
    },
    singularity: {
      name: 'Singularity Core', color: '#ffffff', unlock: 31, kind: 'orb', air: true,
      desc: 'Contained micro-singularity launches homing plasma spheres with splash damage. The endgame.',
      levels: [
        { cost: 500,  dmg: 45,  rate: 1.4, range: 3.2, splash: 0.8  },
        { cost: 400,  dmg: 75,  rate: 1.5, range: 3.4, splash: 0.9  },
        { cost: 650,  dmg: 120, rate: 1.6, range: 3.6, splash: 1.0  },
        { cost: 1000, dmg: 200, rate: 1.8, range: 3.9, splash: 1.15 },
      ],
    },
  };
  const TOWER_ORDER = ['sentry','scanner','tarpit','mortar','throttle','farm','pulse','sniper','overclock','lance','emp','singularity'];

  // ------------------------------------------------------------------
  // ENEMIES
  // hp/speed/bounty are level-1 baselines; scaled by level, wave, difficulty.
  // ------------------------------------------------------------------
  const ENEMIES = {
    spambot:   { name: 'Spambot',        hp: 22,  speed: 1.5,  bounty: 4,  dmg: 1, size: .27, color: '#ff8a5c', shape: 'bot',    unlock: 1,  threat: 3,
      lore: 'Mass-produced junk process. Alone it is nothing. It is never alone.' },
    crawler:   { name: 'Ad Crawler',     hp: 14,  speed: 2.6,  bounty: 4,  dmg: 1, size: .22, color: '#ffd166', shape: 'dart',   unlock: 2,  threat: 3,
      lore: 'Scrapes everything, respects nothing. Fast and flimsy.' },
    bloat:     { name: 'Bloatware',      hp: 72,  speed: 0.9,  bounty: 8,  dmg: 2, size: .36, color: '#9ccc65', shape: 'blob',   unlock: 3,  threat: 8,
      lore: '400MB of toolbar. Slow, bloated, annoyingly durable.' },
    swarmling: { name: 'Swarmling',      hp: 8,   speed: 2.3,  bounty: 2,  dmg: 1, size: .16, color: '#ffab91', shape: 'tri',    unlock: 4,  threat: 1.5,
      lore: 'Script-kiddie botlets. Individually trivial. They ship in bulk.' },
    trojan:    { name: 'Trojan Carrier', hp: 95,  speed: 1.2,  bounty: 12, dmg: 2, size: .38, color: '#ce93d8', shape: 'box',    unlock: 5,  threat: 12,
      traits: { spawnOnDeath: { type: 'spambot', count: 4 } },
      lore: 'Looks like a harmless package. Bursts into Spambots on destruction.' },
    worm:      { name: 'Worm',           hp: 42,  speed: 1.4,  bounty: 6,  dmg: 1, size: .30, color: '#aed581', shape: 'worm',   unlock: 6,  threat: 8,
      traits: { split: { type: 'wormlet', count: 2 } },
      lore: 'Self-replicating. Kill it and two segments crawl on.' },
    wormlet:   { name: 'Wormlet',        hp: 18,  speed: 1.8,  bounty: 3,  dmg: 1, size: .20, color: '#c5e1a5', shape: 'worm',   unlock: 99, nopool: true, threat: 2,
      lore: 'A worm fragment, still wriggling toward your core.' },
    drone:     { name: 'Recon Drone',    hp: 32,  speed: 2.0,  bounty: 6,  dmg: 1, size: .26, color: '#4dd0e1', shape: 'wing',   unlock: 7,  threat: 7,
      traits: { flying: true },
      lore: 'AIRBORNE — ignores the data bus and flies straight for your core. Tarpits and Mortars cannot touch it.' },
    ransom:    { name: 'Ransomware',     hp: 125, speed: 1.0,  bounty: 14, dmg: 2, size: .36, color: '#ef5350', shape: 'lock',   unlock: 8,  threat: 14,
      traits: { armor: 6 },
      lore: 'ARMORED — flat damage reduction on every hit. Snipers pierce it.' },
    leech:     { name: 'Data Leech',     hp: 46,  speed: 1.8,  bounty: 10, dmg: 1, size: .26, color: '#f48fb1', shape: 'leech',  unlock: 9,  threat: 9,
      traits: { leech: 20 },
      lore: 'If it reaches your core it siphons credits along with integrity.' },
    ganheal:   { name: 'GAN Regenerator',hp: 85,  speed: 1.3,  bounty: 12, dmg: 2, size: .32, color: '#80cbc4', shape: 'twin',   unlock: 11, threat: 13,
      traits: { regen: 6 },
      lore: 'Generator and discriminator, endlessly repairing each other. Burst it down.' },
    deepfake:  { name: 'Deepfake',       hp: 58,  speed: 1.7,  bounty: 12, dmg: 2, size: .28, color: '#b0bec5', shape: 'mask',   unlock: 12, threat: 12,
      traits: { stealth: true },
      lore: 'STEALTHED — invisible to towers unless revealed by a Scan Array.' },
    botnode:   { name: 'Botnet Node',    hp: 105, speed: 1.1,  bounty: 15, dmg: 2, size: .36, color: '#ffb74d', shape: 'hub',    unlock: 13, threat: 16,
      traits: { aura: { speed: 0.35, range: 2.2 } },
      lore: 'Command relay. Accelerates every threat marching near it. Kill it first.' },
    golem:     { name: 'Overfit Golem',  hp: 270, speed: 0.75, bounty: 22, dmg: 3, size: .42, color: '#a1887f', shape: 'golem',  unlock: 14, threat: 22,
      traits: { slowImmune: true },
      lore: 'Memorized the whole training set, including your slow effects. IMMUNE to slows.' },
    phisher:   { name: 'Phisher',        hp: 95,  speed: 1.4,  bounty: 14, dmg: 2, size: .30, color: '#7986cb', shape: 'hook',   unlock: 16, threat: 15,
      traits: { shield: 65 },
      lore: 'SHIELDED — the shield recharges out of combat. Focus fire to crack it.' },
    quantum:   { name: 'Quantum Glitch', hp: 62,  speed: 1.5,  bounty: 14, dmg: 2, size: .27, color: '#e1bee7', shape: 'qbit',   unlock: 18, threat: 14,
      traits: { teleport: { every: 3.0, dist: 1.5 } },
      lore: 'Superposition abuse. BLINKS forward along the path every few seconds.' },
    zeroday:   { name: 'Zero-Day',       hp: 48,  speed: 2.8,  bounty: 16, dmg: 3, size: .26, color: '#fff176', shape: 'flash',  unlock: 22, threat: 16,
      traits: { stealth: true },
      lore: 'Unknown signature, terrifying speed. STEALTHED and nearly gone before you see it.' },
    hydra:     { name: 'Hydra Process',  hp: 160, speed: 1.2,  bounty: 18, dmg: 2, size: .38, color: '#81c784', shape: 'hydra',  unlock: 24, threat: 20,
      traits: { split: { type: 'worm', count: 3 } },
      lore: 'kill -9 one head and three Worms fork from the corpse.' },
    wraith:    { name: 'Ghost Protocol', hp: 75,  speed: 2.2,  bounty: 16, dmg: 3, size: .28, color: '#90a4ae', shape: 'ghost',  unlock: 27, threat: 18,
      traits: { flying: true, stealth: true },
      lore: 'AIRBORNE and STEALTHED. Your worst nightmare without scanner coverage.' },
    juggernaut:{ name: 'Juggernaut',     hp: 440, speed: 0.8,  bounty: 30, dmg: 4, size: .44, color: '#ff7043', shape: 'tank',   unlock: 34, threat: 34,
      traits: { armor: 12, regen: 8 },
      lore: 'ARMORED and REGENERATING siege platform. Bring armor-piercing rounds.' },
    mirage:    { name: 'Mirage',         hp: 125, speed: 1.6,  bounty: 18, dmg: 2, size: .30, color: '#80deea', shape: 'mirror', unlock: 38, threat: 18,
      traits: { spawnOnDeath: { type: 'decoy', count: 3 } },
      lore: 'Hallucinated by an adversarial model. Shatters into decoys that clog your targeting.' },
    decoy:     { name: 'Decoy',          hp: 2,   speed: 2.0,  bounty: 0,  dmg: 1, size: .22, color: '#b2ebf2', shape: 'mirror', unlock: 99, nopool: true, threat: 1,
      lore: 'It is not real. It can still hurt you.' },
    titan:     { name: 'Compute Titan',  hp: 950, speed: 0.7,  bounty: 60, dmg: 6, size: .48, color: '#ffcc80', shape: 'titan',  unlock: 45, threat: 70,
      traits: { armor: 10, slowImmune: true },
      lore: 'A rogue datacenter on legs. ARMORED, slow-IMMUNE, unstoppable-adjacent.' },
    // ---------------- BOSSES ----------------
    boss_kernel: { name: 'KERNEL PANIC', hp: 2300, speed: 0.55, bounty: 150, dmg: 10, size: .55, color: '#ff3d71', shape: 'bosskernel', unlock: 99, nopool: true, threat: 200,
      traits: { boss: true, armor: 8, summon: { type: 'spambot', every: 4, count: 2 } },
      lore: 'SECTOR 1 BOSS. A cascading system failure given will. Spawns Spambots as it advances.' },
    boss_botmaster: { name: 'THE BOTMASTER', hp: 5600, speed: 0.6, bounty: 250, dmg: 12, size: .58, color: '#c86bff', shape: 'bossmaster', unlock: 99, nopool: true, threat: 400,
      traits: { boss: true, armor: 6, aura: { speed: 0.4, range: 2.6 }, summon: { type: 'swarmling', every: 3, count: 3 } },
      lore: 'SECTOR 2 BOSS. Herds the botnet personally. Accelerates its escort and breeds Swarmlings.' },
    boss_fakeprime: { name: 'DEEPFAKE PRIME', hp: 10500, speed: 0.7, bounty: 350, dmg: 15, size: .58, color: '#b0bec5', shape: 'bossfake', unlock: 99, nopool: true, threat: 700,
      traits: { boss: true, regen: 25, phaser: { period: 6, dur: 2 } },
      lore: 'SECTOR 3 BOSS. Cycles into stealth every few seconds and regenerates. Keep scanners close.' },
    boss_overmind: { name: 'THE OVERMIND', hp: 18000, speed: 0.6, bounty: 500, dmg: 20, size: .62, color: '#ffc14d', shape: 'bossmind', unlock: 99, nopool: true, threat: 1200,
      traits: { boss: true, armor: 15, teleport: { every: 5, dist: 1.2 }, summon: { type: 'drone', every: 5, count: 2 } },
      lore: 'SECTOR 4 BOSS. Armored hive-intellect. Blinks forward and launches Recon Drones.' },
    boss_agi: { name: 'ROGUE AGI', hp: 34000, speed: 0.55, bounty: 1000, dmg: 50, size: .66, color: '#ff3d71', shape: 'bossagi', unlock: 99, nopool: true, threat: 3000,
      traits: { boss: true, armor: 20, regen: 45, summon: { type: 'zeroday', every: 6, count: 2 }, enrage: 0.3 },
      lore: 'FINAL BOSS. The alignment failure you were warned about. Enrages below 30% integrity.' },
  };

  const BOSS_LEVELS = { 10: 'boss_kernel', 20: 'boss_botmaster', 30: 'boss_fakeprime', 40: 'boss_overmind', 50: 'boss_agi' };

  // ------------------------------------------------------------------
  // RESEARCH — permanent meta upgrades bought with Data Cores
  // ------------------------------------------------------------------
  const RESEARCH = [
    { id: 'capital',   ico: '¤', name: 'Seed Capital',    max: 5, costs: [2, 4, 7, 11, 16], per: 40,   desc: '+{v} starting credits per level.' },
    { id: 'integrity', ico: '⬢', name: 'Core Plating',    max: 5, costs: [2, 4, 7, 11, 16], per: 2,    desc: '+{v} Core Integrity per level.' },
    { id: 'firmware',  ico: '⚙', name: 'Firmware Tuning', max: 5, costs: [3, 5, 8, 12, 18], per: 4,    desc: '+{v}% tower damage.' },
    { id: 'bounty',    ico: '◎', name: 'Bounty Program',  max: 5, costs: [2, 4, 7, 11, 16], per: 4,    desc: '+{v}% credits per kill.' },
    { id: 'discount',  ico: '▽', name: 'Bulk Fabrication',max: 5, costs: [3, 5, 8, 12, 18], per: 3,    desc: '-{v}% tower build & upgrade cost.' },
    { id: 'interest',  ico: '％', name: 'Compound Yield',  max: 3, costs: [4, 8, 14],       per: 2,    desc: '+{v}% of held credits paid at each wave end.' },
    { id: 'salvage',   ico: '♻', name: 'Salvage Rights',  max: 3, costs: [3, 6, 10],       per: 5,    desc: '+{v}% refund when selling towers (base 70%).' },
    { id: 'overclockr',ico: '⚡', name: 'Global Overclock',max: 3, costs: [5, 10, 16],      per: 4,    desc: '+{v}% tower fire rate.' },
  ];

  // ------------------------------------------------------------------
  // ACHIEVEMENTS
  // ------------------------------------------------------------------
  const ACHIEVEMENTS = [
    { id: 'first_blood',  name: 'First Blood',        desc: 'Destroy your first threat.',                    stat: 'kills', goal: 1 },
    { id: 'hunter',       name: 'Threat Hunter',      desc: 'Destroy 1,000 threats.',                        stat: 'kills', goal: 1000 },
    { id: 'exterminator', name: 'Exterminator',       desc: 'Destroy 10,000 threats.',                       stat: 'kills', goal: 10000 },
    { id: 'genocide',     name: 'rm -rf /threats',    desc: 'Destroy 100,000 threats.',                      stat: 'kills', goal: 100000 },
    { id: 'sector1',      name: 'Spam Filtered',      desc: 'Clear Sector 1 (levels 1-10).',                 stat: 'sectorClear1', goal: 1 },
    { id: 'sector2',      name: 'Relay Severed',      desc: 'Clear Sector 2 (levels 11-20).',                stat: 'sectorClear2', goal: 1 },
    { id: 'sector3',      name: 'Fabric Unwoven',     desc: 'Clear Sector 3 (levels 21-30).',                stat: 'sectorClear3', goal: 1 },
    { id: 'sector4',      name: 'Vault Sealed',       desc: 'Clear Sector 4 (levels 31-40).',                stat: 'sectorClear4', goal: 1 },
    { id: 'sector5',      name: 'Containment Holds',  desc: 'Clear Sector 5 (levels 41-50). Beat the game.', stat: 'sectorClear5', goal: 1 },
    { id: 'perfect',      name: 'Flawless Firewall',  desc: 'Win a level without losing any Core Integrity.',stat: 'perfectWins', goal: 1 },
    { id: 'perfect10',    name: 'Untouchable',        desc: 'Win 10 levels without losing Core Integrity.',  stat: 'perfectWins', goal: 10 },
    { id: 'stars30',      name: 'Constellation',      desc: 'Earn 30 stars.',                                stat: 'starsTotal', goal: 30 },
    { id: 'stars90',      name: 'Galaxy Brain',       desc: 'Earn 90 stars.',                                stat: 'starsTotal', goal: 90 },
    { id: 'stars150',     name: 'Perfect Run',        desc: 'Earn all 150 stars.',                           stat: 'starsTotal', goal: 150 },
    { id: 'rich',         name: 'Venture Capital',    desc: 'Hold 3,000 credits at once in a level.',        stat: 'maxCash', goal: 3000 },
    { id: 'builder',      name: 'Infrastructure Week',desc: 'Build 500 towers (lifetime).',                  stat: 'towersBuilt', goal: 500 },
    { id: 'maxed',        name: 'Fully Vested',       desc: 'Upgrade any tower to Tier IV.',                 stat: 'maxTier', goal: 1 },
    { id: 'boss1',        name: 'Panic Averted',      desc: 'Defeat KERNEL PANIC.',                          stat: 'bossKills', goal: 1 },
    { id: 'boss5',        name: 'Alignment Achieved', desc: 'Defeat all 5 sector bosses.',                   stat: 'bossKills', goal: 5 },
    { id: 'endless20',    name: 'Marathon Process',   desc: 'Reach wave 20 in Endless mode.',                stat: 'endlessBestAny', goal: 20 },
    { id: 'endless40',    name: 'Daemon Mode',        desc: 'Reach wave 40 in Endless mode.',                stat: 'endlessBestAny', goal: 40 },
    { id: 'insane1',      name: 'Certified Insane',   desc: 'Win any level on INSANE.',                      stat: 'insaneWins', goal: 1 },
    { id: 'insane10',     name: 'Beyond Alignment',   desc: 'Win 10 levels on INSANE.',                      stat: 'insaneWins', goal: 10 },
    { id: 'waves500',     name: 'Wave Function',      desc: 'Clear 500 waves (lifetime).',                   stat: 'wavesCleared', goal: 500 },
  ];

  // ------------------------------------------------------------------
  // WAVE EVENTS — seeded modifiers that break wave monotony
  // ------------------------------------------------------------------
  const EVENTS = {
    storm:    { name: 'DATA STORM',  ico: '⚡', desc: '+35% enemy speed · ×2 bounty',      speed: 1.35, bounty: 2.0 },
    goldrush: { name: 'GOLD RUSH',   ico: '¤', desc: '×1.6 bounty this wave',              bounty: 1.6 },
    swarm:    { name: 'SWARM SURGE', ico: '≋', desc: '+60% enemies · −40% HP each',        countMult: 1.6, hpMult: 0.6 },
    regen:    { name: 'REGEN FIELD', ico: '✚', desc: 'Enemies regenerate · ×1.4 bounty',   regen: 4, bounty: 1.4 },
    blackout: { name: 'BLACKOUT',    ico: '◌', desc: 'One tower offline · ×1.35 bounty',   blackout: 1, bounty: 1.35 },
    frenzy:   { name: 'KILL FRENZY', ico: '☠', desc: 'Combo bonus ×3 this wave',           comboMult: 3 },
  };

  // ------------------------------------------------------------------
  // CHARGE ABILITIES — powered by kills, usable any time (auto-cast optional)
  // ------------------------------------------------------------------
  const ABILITIES = {
    strike: { name: 'ORBITAL STRIKE', ico: '✸', cost: 30, unlock: 4,
      desc: 'Tap anywhere: massive damage + stun in a blast zone.' },
    surge:  { name: 'OVERCLOCK SURGE', ico: '⚡', cost: 45, unlock: 8,
      desc: 'All towers +80% damage, +30% fire rate for 6s.' },
    patch:  { name: 'EMERGENCY PATCH', ico: '✚', cost: 60, unlock: 12,
      desc: 'Instantly restore 4 Core Integrity.' },
  };

  // ------------------------------------------------------------------
  // PROTOCOL CHIPS — pick 1 of 3 at level start, lasts the level
  // ------------------------------------------------------------------
  const CHIPS = [
    { id: 'ap_rounds',  ico: '➶', name: 'AP Rounds',        desc: 'Sentry & Scanner damage +30%' },
    { id: 'storm_coil', ico: '⌁', name: 'Storm Protocol',   desc: 'Pulse Coils chain to +2 extra targets' },
    { id: 'napalm',     ico: '🔥', name: 'Napalm Payload',   desc: 'Mortar shells leave a burning field' },
    { id: 'cryo',       ico: '❄', name: 'Cryo Injection',   desc: 'All slows 12% stronger' },
    { id: 'bounty',     ico: '◎', name: 'Bounty Hunter',    desc: '+20% credits per kill' },
    { id: 'interest',   ico: '％', name: 'Yield Farming',    desc: '+3% of held credits every wave' },
    { id: 'fab',        ico: '▽', name: 'Rapid Fab',        desc: 'Towers 12% cheaper' },
    { id: 'deadeye',    ico: '✜', name: 'Deadeye Firmware', desc: 'Critical hit chance +12%' },
    { id: 'longshot',   ico: '⌖', name: 'Longshot Optics',  desc: 'Kernel Snipers +1.5 range' },
    { id: 'overvolt',   ico: '⚡', name: 'Overvolt',         desc: 'All towers +10% fire rate' },
    { id: 'warchest',   ico: '¤', name: 'War Chest',        desc: '+180 starting credits' },
    { id: 'plating',    ico: '⬢', name: 'Reactive Plating', desc: '+6 Core Integrity now' },
    { id: 'medic',      ico: '✚', name: 'Self-Repair',      desc: 'Restore 1 Integrity every wave cleared' },
    { id: 'capacitor',  ico: '◍', name: 'Capacitor Bank',   desc: 'Abilities cost 30% less energy' },
    { id: 'harvest',    ico: '⌂', name: 'Harvest Boost',    desc: 'Compute Farms +40% income' },
  ];

  // ------------------------------------------------------------------
  // TIER-UP SPECIALIZATIONS — final upgrade forks into one of two paths
  // mods multiply the tier-IV stats; flags add behavior
  // ------------------------------------------------------------------
  const BRANCHES = {
    sentry:      [{ name: 'Gatling Array', ico: '≡', desc: 'Fire rate ×1.9, damage ×0.7',        mods: { rate: 1.9, dmg: 0.7 } },
                  { name: 'Railgun',       ico: '⟶', desc: 'Damage ×2.1, pierces armor, slow',   mods: { dmg: 2.1, rate: 0.55, pierce: true } }],
    scanner:     [{ name: 'Overscan',      ico: '◉', desc: 'Range ×1.4 — huge reveal umbrella',  mods: { range: 1.4 } },
                  { name: 'Burst Array',   ico: '⋙', desc: 'Fire rate ×1.6',                     mods: { rate: 1.6 } }],
    tarpit:      [{ name: 'Acid Pit',      ico: '☣', desc: 'Damage ×2',                          mods: { dmg: 2 } },
                  { name: 'Superglue',     ico: '⊚', desc: 'Slow +15%, range ×1.2',              mods: { slowAdd: 0.15, range: 1.2 } }],
    mortar:      [{ name: 'Napalm Shells', ico: '🔥', desc: 'Shells leave a burning field',       mods: { burn: true } },
                  { name: 'Cluster Bomb',  ico: '✳', desc: 'Splash ×1.35, damage ×1.15',         mods: { splash: 1.35, dmg: 1.15 } }],
    throttle:    [{ name: 'Stasis Field',  ico: '⧖', desc: 'Slow +12%',                          mods: { slowAdd: 0.12 } },
                  { name: 'Wide Choke',    ico: '◯', desc: 'Range ×1.4',                         mods: { range: 1.4 } }],
    farm:        [{ name: 'Bull Market',   ico: '↗', desc: 'Income ×1.5',                        mods: { income: 1.5 } },
                  { name: 'Hedge Fund',    ico: '⊞', desc: 'Income ×1.2 and +2% interest',       mods: { income: 1.2, interest: 2 } }],
    pulse:       [{ name: 'Chain Storm',   ico: '⌁', desc: '+3 chain targets',                   mods: { chainsAdd: 3 } },
                  { name: 'Amplifier',     ico: '△', desc: 'Damage ×1.7',                        mods: { dmg: 1.7 } }],
    sniper:      [{ name: 'Antimatter',    ico: '✦', desc: 'Damage ×1.8',                        mods: { dmg: 1.8 } },
                  { name: 'Spotter Net',   ico: '⌖', desc: 'Fire rate ×1.7',                     mods: { rate: 1.7 } }],
    overclock:   [{ name: 'Frenzy Core',   ico: '⚡', desc: 'Rate buff +25%',                     mods: { buffRateAdd: 0.25 } },
                  { name: 'Power Core',    ico: '▲', desc: 'Damage buff +30%',                   mods: { buffDmgAdd: 0.30 } }],
    lance:       [{ name: 'Focus Crystal', ico: '◆', desc: 'Beam ramps to ×3.5 damage',          mods: { rampMax: 3.5 } },
                  { name: 'Wide Lens',     ico: '◇', desc: 'Range ×1.3, damage ×1.15',           mods: { range: 1.3, dmg: 1.15 } }],
    emp:         [{ name: 'Ion Cascade',   ico: '✺', desc: 'Stun +0.6s',                         mods: { stunAdd: 0.6 } },
                  { name: 'Pulsar',        ico: '◉', desc: 'Pulses 40% more often',              mods: { rate: 1.4 } }],
    singularity: [{ name: 'Event Horizon', ico: '●', desc: 'Splash ×1.5',                        mods: { splash: 1.5 } },
                  { name: 'Overmass',      ico: '◉', desc: 'Damage ×1.6',                        mods: { dmg: 1.6 } }],
  };

  return { VERSION, SECTORS, DIFFS, TOWERS, TOWER_ORDER, ENEMIES, BOSS_LEVELS, RESEARCH, ACHIEVEMENTS,
           EVENTS, ABILITIES, CHIPS, BRANCHES };
})();
