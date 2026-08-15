/* HARVEST PROTOCOL — run state: the mining economy, waves, win/lose.
   Income is mined, not killed for. Protect the line that feeds you. */
'use strict';
const GAME = (function () {
  const ECO = CONFIG.ECONOMY;
  const g = {
    scene: null,
    phase: 'title',            // title | build | combat | won | lost
    wave: 1,
    minerals: 0,
    coreHP: ECO.coreHP,
    workers: [],
    buildings: [],
    enemies: [],
    spawnQueue: [],
    combatT: 0,
    prepT: 0,                  // build-phase countdown — waves launch themselves
    time: 0,
    speed: 1,
    paused: false,
    endless: false,
    level: null,
    tech: {},
    permPower: 0,
    activeDirs: [],
    dirOffer: null,
    waveEarn: null,
    stats: null,
    stars: 0,
  };

  // combined modifier: level twist mods first, then active directives
  function mod(key, base) {
    let v = base === undefined ? (key.endsWith('Mult') ? 1 : 0) : base;
    const lm = g.level && g.level.mods && g.level.mods[key];
    if (lm !== undefined) { if (key.endsWith('Mult')) v *= lm; else v += lm; }
    for (const d of g.activeDirs) {
      const m = d.mods[key];
      if (m === undefined) continue;
      if (key.endsWith('Mult')) v *= m; else v += m;
    }
    return v;
  }

  // prep window before each wave: generous early, tightening as ops advance
  function prepTime() {
    const w = g.wave, L = g.level ? g.level.n : 1;
    return Math.max(16, 32 - w * 0.8 - L * 0.6);
  }

  function interestRate() { return g.tech.compound ? 0.12 : ECO.interestRate; }
  function interestCap() { return g.tech.compound ? 80 : ECO.interestCap; }
  function overclockCost() { return g.tech.cycles ? 15 : ECO.overclockCost; }
  function overclockCooldown() { return g.tech.cycles ? ECO.overclockCooldown - 6 : ECO.overclockCooldown; }

  function powerCap() {
    const base = (g.level && g.level.eco && g.level.eco.powerBase !== undefined) ? g.level.eco.powerBase : ECO.powerBase;
    let cap = base + g.permPower + (g.tech.coretap ? 3 : 0);
    for (const b of g.buildings) if (b.alive && b.def.gen) cap += b.stat('gen');
    return Math.round(cap);
  }
  function powerUsed() {
    let used = 0;
    for (const b of g.buildings) if (b.alive) used += b.def.power;
    return used;
  }
  function workerCap() {
    let cap = ECO.workerCapBase;
    for (const b of g.buildings) if (b.alive && b.def.workerCap) cap += b.def.workerCap;
    return cap;
  }
  function availableBuildings() {
    return (g.level && g.level.buildings) || CONFIG.BUILD_ORDER;
  }
  function miningRate() {   // rough ¤/min estimate for the HUD
    const carry = ECO.workerCarry + (g.tech.drills ? 4 : 0);
    let rate = 0;
    for (const w of g.workers) if (w.alive) rate += carry / 14; // ~14s round trip typical
    return Math.round(rate * 60 * mod('mineMult', 1));
  }

  // ---------------- lifecycle ----------------
  function reset() {
    for (const e of g.enemies) e.remove();
    for (const w of g.workers) w.remove();
    for (const b of g.buildings) if (b.alive) b.remove();
    g.enemies = []; g.workers = []; g.buildings = [];
    g.wave = 1;
    g.minerals = CONFIG.startMinerals(g.level);
    g.coreHP = ECO.coreHP;
    g.spawnQueue = [];
    g.combatT = 0; g.time = 0;
    g.speed = 1;
    g.endless = false;
    g.paused = false;
    g.tech = {};
    g.permPower = 0;
    g.activeDirs = [];
    g.dirOffer = null;
    g.waveEarn = { mined: 0, scrap: 0, interest: 0, lossPay: 0 };
    g.stats = { mined: 0, kills: 0, workersLost: 0, buildingsLost: 0, leaked: 0, interest: 0, peakWorkers: 0 };
  }

  function start(levelN) {
    g.level = CONFIG.LEVELS[UTIL.clamp(levelN, 1, CONFIG.LEVELS.length) - 1];
    MAP.build(g.scene, g.level);
    reset();
    // two starter workers — the economy begins immediately
    for (let i = 0; i < 2; i++) spawnWorker(true);
    g.phase = 'build';
    g.prepT = prepTime() + 8;   // first wave: extra time to orient
    rollDirectives();
    UI.onPhase();
    UI.banner('OP ' + g.level.n + ' — ' + g.level.name, false);
    if (g.level.unlockNote) setTimeout(() => UI.toast(g.level.unlockNote, 'warn'), 1100);
    setTimeout(() => UI.toast(g.level.intro, ''), 2300);
    UI.updateHUD();
  }

  // ---------------- economy actions ----------------
  function spawnWorker(free) {
    const pos = MAP.corePos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, 2 + Math.random()));
    const w = new WORKER.Worker(g.scene, pos);
    g.workers.push(w);
    g.stats.peakWorkers = Math.max(g.stats.peakWorkers, g.workers.filter(x => x.alive).length);
    if (!free) FX.ring(pos, 1.2, 0x7fdcff);
    return w;
  }

  function buyWorker() {
    if (g.workers.filter(w => w.alive).length >= workerCap()) { UI.toast('WORKER CAP — BUILD A DEPOT', 'bad'); AUDIO.sfx.error(); return false; }
    if (g.minerals < ECO.workerCost) { AUDIO.sfx.error(); return false; }
    g.minerals -= ECO.workerCost;
    spawnWorker();
    AUDIO.sfx.build();
    UI.updateHUD();
    return true;
  }

  function canPlace(type, x, z) {
    if (Math.abs(x) > MAP.W / 2 - 1 || Math.abs(z) > MAP.H / 2 - 1) return false;
    const c = MAP.worldToCell(x, z);
    if (MAP.isBlocked(c.cx, c.cz)) return false;
    // keep the core and gate mouths open
    if (MAP.corePos.distanceTo(new THREE.Vector3(x, 0, z)) < 3.4) return false;
    for (const gate of MAP.gates) if (gate.pos.distanceTo(new THREE.Vector3(x, 0, z)) < 3.4) return false;
    // no stacking on crystals or other buildings
    for (const f of MAP.fields) if (f.pos.distanceTo(new THREE.Vector3(x, 0, z)) < 2.6) return false;
    const minGap = type === 'wall' ? MAP.CS * 0.9 : 1.4;
    for (const b of g.buildings) {
      if (!b.alive) continue;
      if (b.mesh.position.distanceTo(new THREE.Vector3(x, 0, z)) < minGap) return false;
    }
    return true;
  }

  function placeBuilding(type, x, z) {
    const def = CONFIG.BUILDINGS[type];
    if (!availableBuildings().includes(type)) return null;
    if (g.minerals < def.cost) { AUDIO.sfx.error(); return null; }
    if (def.power && powerUsed() + def.power > powerCap()) { UI.toast('⚡ NOT ENOUGH POWER — BUILD A GENERATOR', 'bad'); AUDIO.sfx.error(); return null; }
    // snap walls to the grid first so validation tests the real position
    let px = x, pz = z;
    if (def.blocks) {
      const c = MAP.worldToCell(x, z);
      const w = MAP.cellToWorld(c.cx, c.cz);
      px = w.x; pz = w.z;
    }
    if (!canPlace(type, px, pz)) { AUDIO.sfx.error(); return null; }
    g.minerals -= def.cost;
    const b = new BUILDING.Building(g.scene, type, new THREE.Vector3(px, 0, pz), g);
    g.buildings.push(b);
    AUDIO.sfx.build();
    FX.ring(b.mesh.position, 1.4, def.color);
    UI.updateHUD();
    return b;
  }

  function upgrade(b) {
    const cost = b.upgradeCost;
    if (cost === null || b.type === 'wall' || g.minerals < cost) { AUDIO.sfx.error(); return false; }
    g.minerals -= cost;
    b.upgrade();
    AUDIO.sfx.build();
    UI.updateHUD();
    return true;
  }

  function overclock(b) {
    if (b.def.kind !== 'turret' || b.type === 'stasis') return false;
    if (b.ocCooldown > 0 || g.minerals < overclockCost()) { AUDIO.sfx.error(); return false; }
    g.minerals -= overclockCost();
    b.overclock(overclockCooldown());
    UI.updateHUD();
    return true;
  }

  function repair(b) {
    const missing = Math.ceil(b.maxHp - b.hp);
    if (missing <= 0) return false;
    const cost = Math.ceil(missing * ECO.repairCostPerHP);
    if (g.minerals < cost) { AUDIO.sfx.error(); return false; }
    g.minerals -= cost;
    b.hp = b.maxHp;
    FX.ring(b.mesh.position, 1.2, 0x9dffb0);
    AUDIO.sfx.build();
    UI.updateHUD();
    return true;
  }

  function sell(b) {
    g.minerals += b.sell();
    g.buildings.splice(g.buildings.indexOf(b), 1);
    AUDIO.sfx.sell();
    UI.updateHUD();
  }

  // ---------------- directives / tech ----------------
  function rollDirectives() {
    if (g.wave < 2) { g.dirOffer = null; return; }
    const pool = CONFIG.DIRECTIVES.filter(d => (d.cost || 0) <= g.minerals);
    const offer = [];
    while (offer.length < 3 && pool.length) {
      offer.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    g.dirOffer = offer;
  }
  function pickDirective(def) {
    if (!g.dirOffer || !g.dirOffer.includes(def)) return false;
    if (def.cost) {
      if (g.minerals < def.cost) { AUDIO.sfx.error(); return false; }
      g.minerals -= def.cost;
    }
    if (def.mods.instant) g.minerals += def.mods.instant;
    if (def.mods.permPower) g.permPower += def.mods.permPower;
    g.activeDirs.push({ def, mods: def.mods, wavesLeft: def.mods.duration || 1 });
    g.dirOffer = null;
    AUDIO.sfx.cash();
    UI.toast(def.ico + ' ' + def.name + ' ACTIVE', 'warn');
    UI.onPhase(); UI.updateHUD();
    return true;
  }
  function skipDirectives() { g.dirOffer = null; UI.onPhase(); }
  function buyTech(def) {
    if (g.tech[def.id] || g.minerals < def.cost) { AUDIO.sfx.error(); return false; }
    g.minerals -= def.cost;
    g.tech[def.id] = true;
    if (def.id === 'plating') for (const b of g.buildings) if (b.alive) { b.maxHp *= 1.4; b.hp *= 1.4; }
    AUDIO.sfx.build();
    UI.toast('⚙ ' + def.name + ' INSTALLED', 'warn');
    UI.updateHUD();
    return true;
  }

  // ---------------- waves ----------------
  function startWave(early) {
    if (g.phase !== 'build') return;
    g.dirOffer = null;
    g.waveEarn = { mined: 0, scrap: 0, interest: 0, lossPay: 0 };
    // early-call bonus: pay for the prep time you gave up
    if (early && g.prepT > 2) {
      const bonus = Math.round(g.prepT * 1.3);
      g.minerals += bonus;
      g.waveEarn.earlyCall = bonus;
      UI.toast('+' + bonus + ' ¤ EARLY-CALL BONUS', 'warn');
      AUDIO.sfx.cash();
    }
    const interest = Math.round(Math.min(interestCap(), g.minerals * interestRate()) * mod('interestMult', 1));
    if (interest > 0) {
      g.minerals += interest;
      g.stats.interest += interest;
      g.waveEarn.interest = interest;
      UI.toast('+' + interest + ' ¤ INTEREST ON RESERVES', 'warn');
      AUDIO.sfx.cash();
    }
    g.phase = 'combat';
    g.combatT = 0;
    g.spawnQueue = [];
    const hpDirMult = mod('enemyHpMult', 1);
    const spdDirMult = mod('enemySpeedMult', 1);
    const raiderMult = mod('raiderSpeedMult', 1);
    const comp = CONFIG.wave(g.level, g.wave);
    for (const grp of comp) {
      for (let i = 0; i < grp.count; i++) {
        g.spawnQueue.push({
          type: grp.type, at: grp.delay + i * grp.gap,
          hpMult: grp.hpMult * hpDirMult * (g.endless ? 1 + (g.wave - g.level.waves) * 0.25 : 1),
          spdMult: spdDirMult * (CONFIG.ENEMIES[grp.type].target === 'workers' ? raiderMult : 1),
        });
      }
    }
    g.spawnQueue.sort((a, b) => a.at - b.at);
    AUDIO.sfx.waveStart();
    if (g.level.teach && g.level.teach.wave === g.wave) UI.banner(g.level.teach.text, true);
    else UI.banner('WAVE ' + g.wave + (g.wave > g.level.waves ? ' — OVERTIME' : ''), !!(g.level.bosses && g.level.bosses[g.wave]));
    UI.onPhase();
    UI.updateHUD();
  }

  function endWave() {
    const e = g.waveEarn;
    const parts = [];
    if (e.mined) parts.push('mined ¤' + e.mined);
    if (e.earlyCall) parts.push('early call ¤' + e.earlyCall);
    if (e.scrap) parts.push('scrap ¤' + e.scrap);
    if (e.interest) parts.push('interest ¤' + e.interest);
    if (e.lossPay) parts.push('insurance ¤' + e.lossPay);
    if (parts.length) UI.toast('WAVE ' + g.wave + ' INCOME — ' + parts.join(' · '), 'warn');
    for (const d of g.activeDirs) d.wavesLeft--;
    g.activeDirs = g.activeDirs.filter(d => d.wavesLeft > 0);
    g.wave++;
    if (!g.endless && g.wave > g.level.waves) { victoryEnd(); return; }
    g.phase = 'build';
    g.prepT = prepTime();
    rollDirectives();
    UI.banner('WAVE CLEAR — REINFORCE', false);
    UI.onPhase();
    UI.updateHUD();
  }

  function starRating() {
    if (g.stats.leaked === 0 && g.stats.workersLost === 0) return 3;
    if (g.coreHP >= ECO.coreHP * 0.6) return 2;
    return 1;
  }
  function victoryEnd() {
    g.phase = 'won';
    g.stars = starRating();
    SAVE.recordLevel(g.level.n, g.stars, true);
    AUDIO.sfx.victory();
    UI.showEnd(true);
  }
  function defeat() {
    g.phase = 'lost';
    SAVE.recordLevel(g.level.n, 0, false);
    AUDIO.sfx.defeat();
    UI.showEnd(false);
  }

  // ---------------- events ----------------
  function onMined(amount, pos) {
    g.minerals += amount;
    g.stats.mined += amount;
    g.waveEarn.mined += amount;
    FX.text(pos.clone().add(new THREE.Vector3(0, 1.4, 0)), '+' + amount, '#7fdcff', 0.5);
    AUDIO.sfx.cash();
    UI.updateHUD();
  }
  function onKill(e) {
    g.stats.kills++;
    const pay = Math.round(e.def.scrap * mod('scrapMult', ECO.scrapMult));
    if (pay > 0) { g.minerals += pay; g.waveEarn.scrap += pay; }
    UI.updateHUD();
  }
  function onWorkerLost(w) {
    g.stats.workersLost++;
    const pay = mod('lossPay', 0);
    if (pay > 0) { g.minerals += pay; g.waveEarn.lossPay += pay; }
    UI.toast('⚠ MINER DOWN', 'bad');
    UI.updateHUD();
  }
  function onBuildingLost(b) {
    g.stats.buildingsLost++;
    const i = g.buildings.indexOf(b);
    if (i >= 0) g.buildings.splice(i, 1);
    const pay = mod('lossPay', 0);
    if (pay > 0) { g.minerals += pay; g.waveEarn.lossPay += pay; }
    UI.toast('⚠ ' + b.def.name.toUpperCase() + ' DESTROYED', 'bad');
    UI.updateHUD();
  }
  function onCoreHit(e) {
    g.coreHP -= e.def.dmg;
    g.stats.leaked++;
    MAP.coreHitFlash();
    AUDIO.sfx.leak();
    UI.hurt();
    UI.updateHUD();
    if (g.coreHP <= 0) { g.coreHP = 0; defeat(); }
  }

  // ---------------- main update ----------------
  function update(rawDt) {
    if (g.paused || g.phase === 'title') return;
    const dt = Math.min(rawDt, 0.05) * g.speed;
    g.time += dt;

    MAP.update(dt);
    FX.update(dt);

    for (const w of g.workers) w.update(dt, g);
    g.workers = g.workers.filter(w => w.alive);
    // mercy rule: never soft-locked out of the economy
    if (g.workers.length === 0 && g.minerals < ECO.workerCost && MAP.totalReserves() > 0) {
      UI.toast('EMERGENCY MINER DEPLOYED', 'warn');
      spawnWorker(true);
    }

    for (const e of g.enemies) e.slowK = 1;   // stasis wells re-apply during building updates
    for (const b of g.buildings) b.update(dt, g);

    if (g.phase === 'build') {
      g.prepT -= dt;
      UI.tickPrep(g.prepT);
      if (g.prepT <= 0) startWave(false);
    }

    if (g.phase === 'combat') {
      g.combatT += dt;
      while (g.spawnQueue.length && g.spawnQueue[0].at <= g.combatT) {
        const s = g.spawnQueue.shift();
        const gate = MAP.gates[Math.floor(Math.random() * MAP.gates.length)];
        const e = new ENEMY.Enemy(g.scene, s.type, s.hpMult, gate);
        if (s.spdMult) e.speed *= s.spdMult;
        g.enemies.push(e);
      }
      for (const e of g.enemies) e.update(dt, g);
      g.enemies = g.enemies.filter(e => e.alive);
      if (g.phase === 'combat' && !g.spawnQueue.length && !g.enemies.length) endWave();
    }
  }

  // public surface
  g.start = start;
  g.startWave = () => startWave(true);
  g.buyWorker = buyWorker;
  g.placeBuilding = placeBuilding;
  g.canPlace = canPlace;
  g.upgrade = upgrade;
  g.overclock = overclock;
  g.repair = repair;
  g.sell = sell;
  g.update = update;
  g.onMined = onMined;
  g.onKill = onKill;
  g.onWorkerLost = onWorkerLost;
  g.onBuildingLost = onBuildingLost;
  g.onCoreHit = onCoreHit;
  g.powerCap = powerCap;
  g.powerUsed = powerUsed;
  g.workerCap = workerCap;
  g.miningRate = miningRate;
  g.availableBuildings = availableBuildings;
  g.pickDirective = pickDirective;
  g.skipDirectives = skipDirectives;
  g.buyTech = buyTech;
  g.mod = mod;
  g.overclockCost = overclockCost;
  g.interestRate = interestRate;
  g.interestCap = interestCap;
  return g;
})();
