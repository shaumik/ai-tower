/* NEURAL SIEGE — core game state machine & loop */
'use strict';
const GAME = (function () {

  const g = {
    active: false,
    level: null, levelN: 1, diff: 'standard', diffDef: DATA.DIFFS[0], endless: false,
    phase: 'build',          // build | combat | won | lost
    wave: 1, totalWaves: 10,
    cash: 0, lives: 20, maxLives: 20,
    towers: [], enemies: [], projectiles: [], fx: [], particles: [],
    spawnQueue: [], spawnT: 0,
    pathLen: 1, grid: {}, bountyMult: 1,
    speed: 1, paused: false,
    placingType: null, placeCell: null, selectedTower: null,
    shakeT: 0, shakeMag: 0,
    bossEnemy: null,
    stats: { kills: 0, leaked: 0, built: 0 },
    seenThisRun: {},
    time: 0,
    // fun systems
    energy: 30, surgeT: 0, abilityTarget: null,
    chips: [], chipChoices: [],
    combo: 0, comboT: 0, comboPeak: 0, waveLeaks: 0,
    rushBase: 0, rushT: 0,
    burns: [], texts: [],
    curEvent: null, evSpeedMult: 1, evRegen: 0, evComboMult: 1,
    slowmoT: 0, endDelay: 0, hurtT: 0, autoT2: 0,
  };

  let rafId = null, lastT = 0;

  // ================================================================ SETUP
  function start(levelN, diff, endless) {
    g.levelN = levelN;
    g.diff = diff || 'standard';
    g.diffDef = DATA.DIFFS.find(d => d.id === g.diff) || DATA.DIFFS[0];
    g.endless = !!endless;
    g.level = MAPS.level(levelN);
    g.phase = 'build';
    g.wave = 1;
    g.totalWaves = g.level.waves;
    g.cash = g.level.startCash + SAVE.researchValue('capital');
    g.maxLives = g.level.lives + SAVE.researchValue('integrity');
    g.lives = g.maxLives;
    g.towers = []; g.enemies = []; g.projectiles = []; g.fx = []; g.particles = [];
    g.spawnQueue = [];
    g.grid = {};
    g.speed = 1; g.paused = false;
    g.placingType = null; g.placeCell = null; g.selectedTower = null;
    g.bossEnemy = null;
    g.stats = { kills: 0, leaked: 0, built: 0 };
    g.seenThisRun = {};
    g.time = 0;
    g.energy = 30; g.surgeT = 0; g.abilityTarget = null;
    g.chips = []; g.chipChoices = [];
    g.combo = 0; g.comboT = 0; g.comboPeak = 0; g.waveLeaks = 0;
    g.rushBase = 0; g.rushT = 0;
    g.burns = []; g.texts = [];
    g.curEvent = null; g.evSpeedMult = 1; g.evRegen = 0; g.evComboMult = 1;
    g.slowmoT = 0; g.endDelay = 0; g.hurtT = 0; g.autoT2 = 0;
    g.revived = false;
    g.perfectStreak = 0; g.perfectWaves = 0; g.bestCombo = 0; g.dangerT = 0; g.alarmT = 0;

    // offer 1-of-3 protocol chips, seeded per attempt
    SAVE.state.stats.attempts = (SAVE.state.stats.attempts || 0) + 1;
    SAVE.persist();
    const cr = UTIL.rng(0xC419 + levelN * 733 + SAVE.state.stats.attempts * 97);
    const pool = DATA.CHIPS.filter(c => c.id !== 'capacitor' || levelN >= 4); // abilities exist from L4
    const picks = [];
    while (picks.length < 3 && picks.length < pool.length) {
      const c = pool[Math.floor(cr() * pool.length)];
      if (!picks.includes(c)) picks.push(c);
    }
    g.chipChoices = picks;
    g.pathLen = g.level.path.length - 1;
    for (const b of g.level.blocks) g.grid[b.x + ',' + b.y] = 'block';
    for (const p of g.level.path) g.grid[p.x + ',' + p.y] = 'path';
    g.active = true;

    RENDER.resize(g);
    UI.enterGame();
    UI.updateHUD();
    UI.phaseBanner('DEPLOY PHASE — WAVE 1 INCOMING', false);
    UI.showChipPicker(g.chipChoices);

    // new tower unlocks at this level
    const newT = MAPS.newTowersAt(levelN);
    if (newT.length) setTimeout(() => UI.toast('NEW DEFENSE UNLOCKED: ' + DATA.TOWERS[newT[0]].name.toUpperCase(), 'warn'), 900);

    if (!rafId) { lastT = performance.now(); rafId = requestAnimationFrame(loop); }
  }

  function quit() {
    g.active = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // ================================================================ GRID
  function cellFree(x, y) {
    const lv = g.level;
    if (x < 0 || y < 0 || x >= lv.cols || y >= lv.rows) return false;
    return !g.grid[x + ',' + y];
  }
  function towerAt(x, y) {
    const v = g.grid[x + ',' + y];
    return (v && v instanceof Tower) ? v : null;
  }

  function pointAt(d) {
    const path = g.level.path;
    d = UTIL.clamp(d, 0, g.pathLen - 0.0001);
    const i = Math.min(path.length - 2, Math.floor(d));
    const f = d - i;
    return {
      x: UTIL.lerp(path[i].x, path[i + 1].x, f) + 0.5,
      y: UTIL.lerp(path[i].y, path[i + 1].y, f) + 0.5,
    };
  }

  // ================================================================ CHIPS
  function chipHas(id) { return g.chips.indexOf(id) >= 0; }
  function pickChip(id) {
    g.chips.push(id);
    if (id === 'warchest') g.cash += 180;
    if (id === 'plating') { g.maxLives += 6; g.lives += 6; }
    UI.updateHUD();
  }

  // ================================================================ ECONOMY
  function towerCost(type) {
    let c = DATA.TOWERS[type].levels[0].cost * (1 - SAVE.researchValue('discount') / 100);
    if (chipHas('fab')) c *= 0.88;
    return Math.round(c);
  }

  function placeTower(type, x, y) {
    if (g.phase !== 'build') { UI.toast('CANNOT BUILD DURING A WAVE', 'warn'); AUDIO.sfx.error(); return false; }
    if (!cellFree(x, y)) { AUDIO.sfx.error(); return false; }
    const cost = towerCost(type);
    if (g.cash < cost) { UI.toast('INSUFFICIENT CREDITS', 'warn'); AUDIO.sfx.error(); return false; }
    g.cash -= cost;
    const tw = new Tower(g, type, x, y);
    tw.invested = cost;
    tw.fresh = true; // full refund until first wave it fights
    g.towers.push(tw);
    g.grid[x + ',' + y] = tw;
    recomputeBuffs();
    g.stats.built++;
    SAVE.addStat('towersBuilt', 1);
    AUDIO.sfx.build();
    fxRing(x + 0.5, y + 0.5, 0.6, DATA.TOWERS[type].color);
    UI.updateHUD();
    return true;
  }

  function upgradeTower(tw, branchIdx) {
    if (g.phase !== 'build') { UI.toast('CANNOT UPGRADE DURING A WAVE', 'warn'); AUDIO.sfx.error(); return false; }
    const cost = tw.upgradeCost();
    if (cost === null || g.cash < cost) { AUDIO.sfx.error(); return false; }
    // final tier is a specialization: a branch must be chosen
    if (tw.tier === 2 && DATA.BRANCHES[tw.type] && branchIdx === undefined) { AUDIO.sfx.error(); return false; }
    g.cash -= cost;
    tw.invested += cost;
    tw.tier++;
    if (tw.tier === 3 && branchIdx !== undefined) tw.branch = branchIdx;
    recomputeBuffs();
    SAVE.addStat('upgradesBought', 1);
    if (tw.tier >= 3) SAVE.maxStat('maxTier', 1);
    AUDIO.sfx.upgrade();
    fxRing(tw.x, tw.y, 0.75, '#ffd166');
    UI.updateHUD();
    return true;
  }

  function sellTower(tw) {
    if (g.phase !== 'build') { UI.toast('CANNOT SELL DURING A WAVE', 'warn'); AUDIO.sfx.error(); return false; }
    const refund = tw.fresh ? tw.invested : tw.sellValue();
    g.cash += refund;
    g.towers.splice(g.towers.indexOf(tw), 1);
    delete g.grid[tw.gx + ',' + tw.gy];
    if (g.selectedTower === tw) g.selectedTower = null;
    recomputeBuffs();
    AUDIO.sfx.sell();
    UI.updateHUD();
    return true;
  }

  function recomputeBuffs() {
    for (const tw of g.towers) { tw.buffDmg = 0; tw.buffRate = 0; }
    for (const oc of g.towers) {
      if (oc.def.kind !== 'buffaura') continue;
      const s = oc.stats(); // includes branch bonuses
      for (const tw of g.towers) {
        if (tw === oc || tw.def.kind === 'buffaura' || tw.def.kind === 'income') continue;
        if (UTIL.dist2(oc.x, oc.y, tw.x, tw.y) <= s.range * s.range) {
          tw.buffDmg = Math.max(tw.buffDmg, s.buffDmg);
          tw.buffRate = Math.max(tw.buffRate, s.buffRate);
        }
      }
    }
  }

  // slow aura from throttle towers at a world point
  function auraSlowAt(x, y) {
    let slow = 0;
    for (const tw of g.towers) {
      if (tw.def.kind !== 'slowaura' || tw.disabledT > 0) continue;
      const s = tw.stats(); // includes branch + cryo chip
      if (UTIL.dist2(tw.x, tw.y, x, y) <= s.range * s.range) slow = Math.max(slow, s.slow);
    }
    return slow;
  }

  // ================================================================ WAVES
  function startWave() {
    if (g.phase !== 'build') return;
    // rush bonus: the sooner you start, the more you bank
    if (g.rushT > 0 && g.rushBase > 0) {
      const bonus = Math.ceil(g.rushBase * (g.rushT / 22));
      if (bonus > 0) { g.cash += bonus; UI.toast('RUSH BONUS +¤' + bonus, 'warn'); AUDIO.sfx.cash(); }
    }
    g.rushT = 0; g.rushBase = 0;

    const w = WAVES.build(g.levelN, g.wave, g.totalWaves, g.diff);
    g.bountyMult = w.bounty * (1 + SAVE.researchValue('bounty') / 100) * (chipHas('bounty') ? 1.2 : 1);
    g.spawnQueue = w.events.slice();
    g.spawnT = 0;
    g.phase = 'combat';
    g.waveLeaks = 0; g.combo = 0; g.comboPeak = 0;
    for (const tw of g.towers) tw.fresh = false;
    g.placingType = null; g.placeCell = null;

    // wave event
    g.curEvent = w.event || null;
    g.evSpeedMult = 1; g.evRegen = 0; g.evComboMult = 1;
    if (g.curEvent) {
      const ev = DATA.EVENTS[g.curEvent];
      if (ev.speed) g.evSpeedMult = ev.speed;
      if (ev.regen) g.evRegen = ev.regen;
      if (ev.comboMult) g.evComboMult = ev.comboMult;
      if (ev.blackout && g.towers.length) {
        const victims = g.towers.filter(t => t.def.kind !== 'income');
        if (victims.length) {
          const v = victims[Math.floor(Math.random() * victims.length)];
          v.disabledT = 9999;
          fxRing(v.x, v.y, 0.8, '#ff3d71');
        }
      }
      UI.phaseBanner(ev.ico + ' ' + ev.name + ' — ' + ev.desc, true);
    } else {
      UI.phaseBanner('WAVE ' + g.wave + (g.wave > g.totalWaves ? ' — OVERTIME' : ''), false);
    }
    g.fx.push({ kind: 'sweep', ttl: 0.9, t: 0.9 });
    UI.closeSheets();
    UI.updateHUD();
    AUDIO.sfx.waveStart();
    ADS.gameplayStart();
  }

  function endWave() {
    // clear event effects
    g.curEvent = null; g.evSpeedMult = 1; g.evRegen = 0; g.evComboMult = 1;
    for (const tw of g.towers) tw.disabledT = 0;
    g.burns = [];

    // payouts
    let income = WAVES.waveEndBonus(g.levelN, g.wave);
    let interestPct = SAVE.researchValue('interest') + (chipHas('interest') ? 3 : 0);
    for (const tw of g.towers) {
      if (tw.def.kind === 'income') {
        const s = tw.stats();
        income += s.income;
        interestPct += s.interest || 0;
      }
    }
    const interest = Math.floor(g.cash * Math.min(8, interestPct) / 100);
    g.cash += income + interest;

    // perfect wave streak: consecutive clean waves compound the payout
    if (g.waveLeaks === 0 && g.stats.kills > 0) {
      g.perfectStreak++;
      g.perfectWaves++;
      const perfect = Math.round((8 + g.wave + g.levelN) * (1 + 0.25 * Math.min(4, g.perfectStreak - 1)));
      g.cash += perfect;
      UI.toast('★ PERFECT' + (g.perfectStreak > 1 ? ' ×' + g.perfectStreak : '') + ' +¤' + perfect, 'warn');
    } else if (g.waveLeaks > 0) {
      g.perfectStreak = 0;
    }
    if (chipHas('medic') && g.lives < g.maxLives) g.lives++;
    SAVE.addStat('cashEarned', income + interest);
    SAVE.maxStat('maxCash', g.cash);
    SAVE.addStat('wavesCleared', 1);
    AUDIO.sfx.waveClear();

    g.bestCombo = Math.max(g.bestCombo || 0, g.comboPeak);
    const clearedWave = g.wave;
    g.wave++;
    g.bossEnemy = null;
    UI.bossBar(null);

    if (g.endless) {
      const over = clearedWave - g.totalWaves;
      SAVE.maxStat('endlessBestAny', clearedWave);
      const rec = SAVE.levelRec(g.levelN);
      if (clearedWave > rec.endlessBest) { rec.endlessBest = clearedWave; SAVE.persist(); }
      if (over > 0 && over % 5 === 0) {
        const bonus = g.diffDef.coreMult;
        SAVE.state.cores += bonus; SAVE.persist();
        UI.toast('+' + bonus + ' ◈ DATA CORES (ENDLESS)', 'warn');
      }
    } else if (clearedWave >= g.totalWaves) {
      return victory();
    }

    g.phase = 'build';
    g.rushBase = 18 + g.wave * 5 + g.levelN * 2;
    g.rushT = 22;
    UI.phaseBanner('WAVE CLEARED  ·  +' + UTIL.fmt(income + interest) + ' ¤  ·  DEPLOY PHASE', false);
    UI.updateHUD();
    UI.checkAchToasts();

    if (SAVE.state.settings.autostart) {
      g.autoT = 3;
    }
  }

  function victory() {
    g.phase = 'won';
    ADS.gameplayStop();
    const fracLives = g.lives / g.maxLives;
    const stars = g.lives >= g.maxLives * 0.9 ? 3 : (fracLives >= 0.5 ? 2 : 1);
    g.grade = g.stats.leaked === 0 ? 'S' : (fracLives >= 0.9 ? 'A' : (fracLives >= 0.55 ? 'B' : 'C'));
    const prev = SAVE.starsFor(g.levelN, g.diff);
    let cores = Math.round((2 + g.levelN * 0.3) * g.diffDef.coreMult) + (stars - 1);
    if (g.grade === 'S') cores = Math.round(cores * 1.3); // flawless pays extra
    if (stars <= prev) cores = Math.max(1, Math.round(cores * 0.2)); // repeat clears pay less
    SAVE.recordWin(g.levelN, g.diff, stars, cores);
    if (g.stats.leaked === 0) SAVE.addStat('perfectWins', 1);
    if (g.diff === 'insane') SAVE.addStat('insaneWins', 1);
    AUDIO.sfx.victory();
    UI.showEnd(true, stars, cores);
    UI.checkAchToasts();
  }

  function defeat() {
    g.phase = 'lost';
    ADS.gameplayStop();
    AUDIO.sfx.defeat();
    UI.showEnd(false, 0, 0);
  }

  // rewarded-ad second wind: once per level, back into the fight
  function revive() {
    if (g.phase !== 'lost' || g.revived) return false;
    g.revived = true;
    g.lives = 5;
    g.phase = 'combat';
    for (const e of g.enemies) if (!e.dead) e.applyStun(2.5);
    fxRing(g.level.path[g.level.path.length - 1].x + 0.5, g.level.path[g.level.path.length - 1].y + 0.5, 3, '#7fdcff');
    shake(5);
    UI.phaseBanner('⚡ SECOND WIND — CORE RESTORED TO 5', true);
    UI.updateHUD();
    ADS.gameplayStart();
    return true;
  }

  // ================================================================ SPAWN & COMBAT
  function spawnEnemy(type, hpMult, opts) {
    const e = new Enemy(g, type, hpMult, opts);
    if (g.evSpeedMult !== 1) e.baseSpeed *= g.evSpeedMult;
    if (g.evRegen) e.regenBonus = g.evRegen * hpMult;
    g.enemies.push(e);
    if (e.isBoss) {
      g.bossEnemy = e; UI.bossBar(e);
      if (e.traits.boss) {
        g.fx.push({ kind: 'flash', ttl: 0.3, t: 0.3, color: '#ff3d71' });
        shake(7);
      } else {
        UI.phaseBanner('⚠ ' + (e.displayName || e.def.name), true);
        shake(4);
      }
    }
    if (!SAVE.state.seenEnemies[type] && !g.seenThisRun[type]) {
      g.seenThisRun[type] = true;
      SAVE.markSeen(type);
      const def = DATA.ENEMIES[type];
      if (!def.nopool || def.traits && def.traits.boss) {
        UI.phaseBanner('NEW THREAT: ' + def.name.toUpperCase(), true);
        AUDIO.sfx.newThreat();
      }
    }
    return e;
  }

  function onEnemyKilled(e, source) {
    // combo: kills in quick succession pay extra
    g.combo++;
    g.comboT = 1.6;
    if (g.combo > g.comboPeak) g.comboPeak = g.combo;
    const comboBonus = Math.min(0.35, g.combo * 0.01) * g.evComboMult;
    if (e.bounty) { g.cash += Math.round(e.bounty * (1 + comboBonus)); }
    // ability energy from kills
    g.energy = Math.min(100, g.energy + 1 + (e.def.threat || 2) * 0.05);
    g.stats.kills++;
    SAVE.addStat('kills', 1);
    if (source instanceof Tower) source.kills++;
    // shatter burst
    fxHit(e.x, e.y, e.def.color, e.isBoss ? 30 : 10);
    fxRing(e.x, e.y, e.size * 1.6, e.def.color);
    // final kill of the wave: slow-mo finish
    if (g.phase === 'combat' && !g.spawnQueue.length) {
      let alive = 0;
      for (const o of g.enemies) if (!o.dead && o !== e) alive++;
      if (alive === 0) g.slowmoT = 0.55;
    }
    if (e.traits.boss) {
      SAVE.addStat('bossKills', 1);
      shake(9);
      AUDIO.sfx.bossDie();
      UI.bossBar(null);
    } else if (e.isBoss) {
      // mini-boss down
      shake(5);
      AUDIO.sfx.bossDie();
      UI.bossBar(null);
      fxText(e.x, e.y, '+¤' + e.bounty, '#ffd166', true);
    } else {
      AUDIO.sfx.die();
    }
    // death traits
    const tr = e.traits;
    if (tr.spawnOnDeath) {
      for (let i = 0; i < tr.spawnOnDeath.count; i++) {
        spawnEnemy(tr.spawnOnDeath.type, e.hpMult, { dist: Math.max(0, e.dist - 0.15 * i) });
      }
    }
    if (tr.split) {
      for (let i = 0; i < tr.split.count; i++) {
        spawnEnemy(tr.split.type, e.hpMult, { dist: Math.max(0, e.dist - 0.2 * i) });
      }
    }
    UI.updateHUD();
  }

  function onLeak(e) {
    g.lives -= e.dmg;
    g.stats.leaked++;
    g.waveLeaks++;
    g.hurtT = 0.5;
    SAVE.addStat('leaks', 1);
    if (e.traits.leech) {
      g.cash = Math.max(0, g.cash - e.traits.leech);
      UI.toast('-' + e.traits.leech + ' ¤ SIPHONED', 'warn');
    }
    if (e.isBoss) UI.bossBar(null);
    shake(e.isBoss ? 10 : 4);
    AUDIO.sfx.leak();
    UI.hurtFlash();
    UI.updateHUD();
    if (g.lives <= 0) defeat();
  }

  // ================================================================ FX
  function fxLine(x1, y1, x2, y2, color, ttl, zig) {
    g.fx.push({ kind: 'line', x1, y1, x2, y2, color, ttl, t: ttl, zig });
  }
  function fxRing(x, y, r, color) {
    g.fx.push({ kind: 'ring', x, y, r, color, ttl: 0.4, t: 0.4 });
  }
  function fxBoom(x, y, r, color) {
    g.fx.push({ kind: 'boom', x, y, r, color, ttl: 0.35, t: 0.35 });
    fxHit(x, y, color, 10);
    if (g.particles.length < 270) {
      for (let i = 0; i < 5; i++) { // rising smoke
        g.particles.push({
          x: x + (Math.random() - 0.5) * r, y: y + (Math.random() - 0.5) * r,
          vx: (Math.random() - 0.5) * 0.4, vy: -0.6 - Math.random() * 0.8,
          life: 0.55 + Math.random() * 0.3, maxLife: 0.85, size: 4 + Math.random() * 4, color: 'rgba(150,150,160,0.5)',
        });
      }
      for (let i = 0; i < 6; i++) { // hot debris
        const a = Math.random() * Math.PI * 2, sp = 2.5 + Math.random() * 3;
        g.particles.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.35 + Math.random() * 0.2, maxLife: 0.55, size: 2, color: '#fff2cc',
        });
      }
    }
  }
  function fxHit(x, y, color, n) {
    if (g.particles.length > 260) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.8 + Math.random() * 2.6;
      g.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.3 + Math.random() * 0.35, maxLife: 0.55,
        size: 2 + Math.random() * 3, color,
      });
    }
  }
  function shake(mag) { g.shakeT = 0.3; g.shakeMag = mag; }

  function fxText(x, y, txt, color, big) {
    if (g.texts.length > 24) g.texts.shift();
    g.texts.push({ x, y, txt: String(txt), color: color || '#fff', big: !!big, t: 0.9, ttl: 0.9 });
  }
  function addBurn(x, y, r, dps, dur) {
    if (g.burns.length > 12) g.burns.shift();
    g.burns.push({ x, y, r, dps, t: dur });
  }

  // ================================================================ ABILITIES
  function abilityCost(key) {
    const c = DATA.ABILITIES[key].cost;
    return Math.round(c * (chipHas('capacitor') ? 0.7 : 1));
  }
  function abilityReady(key) {
    return g.levelN >= DATA.ABILITIES[key].unlock && g.energy >= abilityCost(key);
  }
  function castAbility(key) {
    if (!abilityReady(key)) { AUDIO.sfx.error(); return false; }
    if (key === 'strike') {
      // enters targeting mode; energy spent on impact
      g.abilityTarget = g.abilityTarget === 'strike' ? null : 'strike';
      UI.refreshAbilities();
      AUDIO.sfx.click();
      return true;
    }
    g.energy -= abilityCost(key);
    if (key === 'surge') {
      g.surgeT = 6;
      fxRing(g.level.cols / 2, g.level.rows / 2, 3, '#ffe07a');
      UI.toast('⚡ OVERCLOCK SURGE', 'warn');
      AUDIO.sfx.upgrade();
      shake(4);
    } else if (key === 'patch') {
      g.lives = Math.min(g.maxLives, g.lives + 4);
      UI.toast('✚ CORE PATCHED +4', 'warn');
      AUDIO.sfx.waveClear();
    }
    UI.updateHUD(); UI.refreshAbilities();
    return true;
  }
  function doStrike(x, y) {
    if (!abilityReady('strike')) { g.abilityTarget = null; UI.refreshAbilities(); return; }
    g.energy -= abilityCost('strike');
    g.abilityTarget = null;
    const dmg = 130 * (1 + 0.09 * g.levelN);
    const r = 1.8;
    for (const e of g.enemies) {
      if (e.dead || e.y < 0) continue;
      if (UTIL.dist2(x, y, e.x, e.y) <= (r + e.size) * (r + e.size)) {
        e.hurt(dmg, { pierce: true, source: null });
        if (!e.dead) e.applyStun(0.8);
      }
    }
    fxBoom(x, y, r, '#ffd166');
    fxRing(x, y, r * 1.3, '#fff');
    fxText(x, y, 'ORBITAL STRIKE', '#ffd166', true);
    shake(9);
    AUDIO.sfx.bossDie();
    UI.updateHUD(); UI.refreshAbilities();
  }
  function autocast() {
    if (!SAVE.state.settings.autocast || g.phase !== 'combat') return;
    let alive = 0;
    for (const e of g.enemies) if (!e.dead && e.y > 0) alive++;
    if (g.levelN >= 12 && g.lives <= g.maxLives * 0.6 && abilityReady('patch')) { castAbility('patch'); return; }
    if (g.levelN >= 8 && alive >= 10 && abilityReady('surge') && g.surgeT <= 0) { castAbility('surge'); return; }
    if (g.levelN >= 4 && alive >= 6 && abilityReady('strike')) {
      // densest cluster: enemy with most neighbors within 1.5 tiles
      let best = null, bestN = 2;
      for (const e of g.enemies) {
        if (e.dead || e.y < 0) continue;
        let n = 0;
        for (const o of g.enemies) if (!o.dead && o.y > 0 && UTIL.dist2(e.x, e.y, o.x, o.y) < 2.25) n++;
        if (n > bestN) { bestN = n; best = e; }
      }
      if (best) doStrike(best.x, best.y);
    }
  }

  // ================================================================ LOOP
  function loop(now) {
    rafId = g.active ? requestAnimationFrame(loop) : null;
    if (!g.active) return;
    let dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if (!g.paused && (g.phase === 'combat' || g.phase === 'build')) {
      let simDt = dt * g.speed;
      if (g.slowmoT > 0) { simDt *= 0.3; g.slowmoT -= dt; } // cinematic last-kill
      while (simDt > 0) {
        const step = Math.min(simDt, 1 / 30);
        update(step);
        simDt -= step;
      }
    }
    RENDER.frame(g, now);
  }

  function update(dt) {
    g.time += dt;

    if (g.phase === 'build') {
      // idle animations only; optional autostart countdown
      if (g.autoT !== undefined && g.autoT > 0) {
        g.autoT -= dt;
        if (g.autoT <= 0) { delete g.autoT; startWave(); }
      }
      if (g.rushT > 0) g.rushT -= dt;
      tickFx(dt);
      return;
    }

    // spawner
    g.spawnT += dt;
    while (g.spawnQueue.length && g.spawnQueue[0].delay <= g.spawnT) {
      const ev = g.spawnQueue.shift();
      spawnEnemy(ev.type, ev.hpMult, { elite: ev.elite, mini: ev.mini });
    }

    // enemy aura buffs (botnet nodes)
    for (const e of g.enemies) e.auraSpeed = 0;
    for (const src of g.enemies) {
      if (src.dead || !src.traits.aura) continue;
      const au = src.traits.aura;
      for (const e of g.enemies) {
        if (e === src || e.dead) continue;
        if (UTIL.dist2(src.x, src.y, e.x, e.y) <= au.range * au.range) {
          e.auraSpeed = Math.max(e.auraSpeed, au.speed);
        }
      }
    }

    // scanners reveal stealth
    for (const tw of g.towers) {
      if (!tw.def.reveals) continue;
      const range = tw.def.levels[tw.tier].range;
      for (const e of g.enemies) {
        if (e.dead || (!e.traits.stealth && !e.traits.phaser)) continue;
        if (UTIL.dist2(tw.x, tw.y, e.x, e.y) <= (range + 0.4) * (range + 0.4)) {
          e.revealT = Math.max(e.revealT, 0.35);
          e.phaseHidden = false;
        }
      }
    }

    // entities
    for (const e of g.enemies) if (!e.dead) e.update(dt);
    for (const tw of g.towers) tw.update(dt);
    for (const p of g.projectiles) if (!p.dead) p.update(dt);

    // cull + leaks
    for (let i = g.enemies.length - 1; i >= 0; i--) {
      const e = g.enemies[i];
      if (e.dead) {
        if (e.leaked) onLeak(e);
        g.enemies.splice(i, 1);
      }
    }
    for (let i = g.projectiles.length - 1; i >= 0; i--) {
      if (g.projectiles[i].dead) g.projectiles.splice(i, 1);
    }

    // combo decay / surge timer / burn fields / autocast
    if (g.comboT > 0) { g.comboT -= dt; if (g.comboT <= 0) g.combo = 0; }
    if (g.surgeT > 0) g.surgeT -= dt;
    for (let i = g.burns.length - 1; i >= 0; i--) {
      const b = g.burns[i];
      b.t -= dt;
      if (b.t <= 0) { g.burns.splice(i, 1); continue; }
      for (const e of g.enemies) {
        if (e.dead || e.flying || e.y < 0) continue;
        if (UTIL.dist2(b.x, b.y, e.x, e.y) <= b.r * b.r) e.hurt(b.dps * dt, { noArmor: true });
      }
    }
    g.autoT2 -= dt;
    if (g.autoT2 <= 0) { g.autoT2 = 0.8; autocast(); }

    // near-miss alarm: something is in the final stretch
    let danger = false;
    for (const e of g.enemies) {
      if (!e.dead && e.y > 0 && e.dist / e.totalLen > 0.85) { danger = true; break; }
    }
    if (danger) {
      g.dangerT = 0.35;
      g.alarmT -= dt;
      if (g.alarmT <= 0) { g.alarmT = 0.9; AUDIO.sfx.alarm(); }
    } else if (g.dangerT > 0) g.dangerT -= dt;

    tickFx(dt);

    if (g.phase === 'combat' && !g.spawnQueue.length && !g.enemies.length) {
      g.endDelay += dt;
      if (g.endDelay > 0.45) { g.endDelay = 0; endWave(); }
    } else {
      g.endDelay = 0;
    }
  }

  function tickFx(dt) {
    if (g.shakeT > 0) g.shakeT -= dt;
    if (g.hurtT > 0) g.hurtT -= dt;
    for (let i = g.texts.length - 1; i >= 0; i--) {
      const tx = g.texts[i];
      tx.t -= dt;
      tx.y -= dt * 0.6;
      if (tx.t <= 0) g.texts.splice(i, 1);
    }
    for (let i = g.fx.length - 1; i >= 0; i--) {
      g.fx[i].t -= dt;
      if (g.fx[i].t <= 0) g.fx.splice(i, 1);
    }
    for (let i = g.particles.length - 1; i >= 0; i--) {
      const p = g.particles[i];
      p.life -= dt;
      if (p.life <= 0) { g.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
    }
  }

  function cycleSpeed() {
    g.speed = g.speed === 1 ? 2 : (g.speed === 2 ? 4 : 1);
    return g.speed;
  }

  // expose
  g.start = start; g.quit = quit;
  g.cellFree = cellFree; g.towerAt = towerAt; g.pointAt = pointAt;
  g.towerCost = towerCost; g.placeTower = placeTower;
  g.upgradeTower = upgradeTower; g.sellTower = sellTower;
  g.startWave = startWave; g.cycleSpeed = cycleSpeed;
  g.spawnEnemy = spawnEnemy; g.onEnemyKilled = onEnemyKilled;
  g.auraSlowAt = auraSlowAt;
  g.fxLine = fxLine; g.fxRing = fxRing; g.fxBoom = fxBoom; g.fxHit = fxHit;
  g.fxText = fxText; g.addBurn = addBurn;
  g.shake = shake;
  g.chipHas = chipHas; g.pickChip = pickChip;
  g.abilityCost = abilityCost; g.abilityReady = abilityReady;
  g.castAbility = castAbility; g.doStrike = doStrike;
  g.revive = revive;
  g.toast = (m, k) => UI.toast(m, k);
  return g;
})();
