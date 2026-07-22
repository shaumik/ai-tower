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
    g.pathLen = g.level.path.length - 1;
    for (const b of g.level.blocks) g.grid[b.x + ',' + b.y] = 'block';
    for (const p of g.level.path) g.grid[p.x + ',' + p.y] = 'path';
    g.active = true;

    RENDER.resize(g);
    UI.enterGame();
    UI.updateHUD();
    UI.phaseBanner('DEPLOY PHASE — WAVE 1 INCOMING', false);

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

  // ================================================================ ECONOMY
  function towerCost(type) {
    return Math.round(DATA.TOWERS[type].levels[0].cost * (1 - SAVE.researchValue('discount') / 100));
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

  function upgradeTower(tw) {
    if (g.phase !== 'build') { UI.toast('CANNOT UPGRADE DURING A WAVE', 'warn'); AUDIO.sfx.error(); return false; }
    const cost = tw.upgradeCost();
    if (cost === null || g.cash < cost) { AUDIO.sfx.error(); return false; }
    g.cash -= cost;
    tw.invested += cost;
    tw.tier++;
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
      const s = oc.def.levels[oc.tier];
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
      if (tw.def.kind !== 'slowaura') continue;
      const s = tw.def.levels[tw.tier];
      if (UTIL.dist2(tw.x, tw.y, x, y) <= s.range * s.range) slow = Math.max(slow, s.slow);
    }
    return slow;
  }

  // ================================================================ WAVES
  function startWave() {
    if (g.phase !== 'build') return;
    const w = WAVES.build(g.levelN, g.wave, g.totalWaves, g.diff);
    g.bountyMult = w.bounty * (1 + SAVE.researchValue('bounty') / 100);
    g.spawnQueue = w.events.slice();
    g.spawnT = 0;
    g.phase = 'combat';
    for (const tw of g.towers) tw.fresh = false;
    g.placingType = null; g.placeCell = null;
    UI.closeSheets();
    UI.phaseBanner('WAVE ' + g.wave + (g.wave > g.totalWaves ? ' — OVERTIME' : ''), false);
    UI.updateHUD();
    AUDIO.sfx.waveStart();
  }

  function endWave() {
    // payouts
    let income = WAVES.waveEndBonus(g.levelN, g.wave);
    for (const tw of g.towers) {
      if (tw.def.kind === 'income') income += tw.def.levels[tw.tier].income;
    }
    const interest = Math.floor(g.cash * SAVE.researchValue('interest') / 100);
    g.cash += income + interest;
    SAVE.addStat('cashEarned', income + interest);
    SAVE.maxStat('maxCash', g.cash);
    SAVE.addStat('wavesCleared', 1);
    AUDIO.sfx.waveClear();

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
    UI.phaseBanner('WAVE CLEARED  ·  +' + UTIL.fmt(income + interest) + ' ¤  ·  DEPLOY PHASE', false);
    UI.updateHUD();
    UI.checkAchToasts();

    if (SAVE.state.settings.autostart) {
      g.autoT = 3;
    }
  }

  function victory() {
    g.phase = 'won';
    const fracLives = g.lives / g.maxLives;
    const stars = g.lives >= g.maxLives * 0.9 ? 3 : (fracLives >= 0.5 ? 2 : 1);
    const prev = SAVE.starsFor(g.levelN, g.diff);
    let cores = Math.round((2 + g.levelN * 0.3) * g.diffDef.coreMult) + (stars - 1);
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
    AUDIO.sfx.defeat();
    UI.showEnd(false, 0, 0);
  }

  // ================================================================ SPAWN & COMBAT
  function spawnEnemy(type, hpMult, opts) {
    const e = new Enemy(g, type, hpMult, opts);
    g.enemies.push(e);
    if (e.isBoss) { g.bossEnemy = e; UI.bossBar(e); }
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
    if (e.bounty) { g.cash += e.bounty; }
    g.stats.kills++;
    SAVE.addStat('kills', 1);
    if (source instanceof Tower) source.kills++;
    fxHit(e.x, e.y, e.def.color, e.isBoss ? 26 : 7);
    if (e.isBoss) {
      SAVE.addStat('bossKills', 1);
      shake(9);
      AUDIO.sfx.bossDie();
      UI.bossBar(null);
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

  // ================================================================ LOOP
  function loop(now) {
    rafId = g.active ? requestAnimationFrame(loop) : null;
    if (!g.active) return;
    let dt = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if (!g.paused && (g.phase === 'combat' || g.phase === 'build')) {
      let simDt = dt * g.speed;
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
      tickFx(dt);
      return;
    }

    // spawner
    g.spawnT += dt;
    while (g.spawnQueue.length && g.spawnQueue[0].delay <= g.spawnT) {
      const ev = g.spawnQueue.shift();
      spawnEnemy(ev.type, ev.hpMult, { elite: ev.elite });
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

    tickFx(dt);

    if (g.phase === 'combat' && !g.spawnQueue.length && !g.enemies.length) {
      endWave();
    }
  }

  function tickFx(dt) {
    if (g.shakeT > 0) g.shakeT -= dt;
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
  g.shake = shake;
  g.toast = (m, k) => UI.toast(m, k);
  return g;
})();
