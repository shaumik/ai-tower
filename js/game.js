/* NEURAL SPIRE — run state: economy, waves, win/lose, and the wiring between them */
'use strict';
const GAME = (function () {
  const ECO = CONFIG.ECONOMY;
  const g = {
    scene: null,
    phase: 'title',          // title | build | combat | won | lost
    wave: 1,
    salvage: 0,
    coreHP: ECO.coreHP,
    enemies: [],
    turrets: [],
    spawnQueue: [],          // { type, at, hpMult } — combat-time seconds
    combatT: 0,
    time: 0,
    speed: 1,
    paused: false,
    endless: false,
    stats: null,
    comboThrows: 0, comboT: 0,
    level: null,             // the current campaign node (CONFIG.LEVELS entry)
    tech: {},                // purchased SPIRE OS nodes, by id
    permPower: 0,            // permanent grid bonuses from directives
    activeDirs: [],          // [{ def, mods, wavesLeft }]
    dirOffer: null,          // the 3 directives offered this build phase
    waveEarn: null,          // per-wave income breakdown for the report
  };

  // combined modifier: level twist mods first, then active directives.
  // 'Mult' keys multiply, everything else adds.
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

  // economy values, tech-aware
  function interestRate() { return g.tech.compound ? 0.14 : ECO.interestRate; }
  function interestCap() { return g.tech.compound ? 90 : ECO.interestCap; }
  function overclockCost() { return g.tech.cycles ? 15 : ECO.overclockCost; }
  function overclockCooldown() { return g.tech.cycles ? ECO.overclockCooldown - 6 : ECO.overclockCooldown; }
  function fallBonusMult() { return (g.tech.massdrv ? 1.5 : 1) * mod('fallMult', 1); }

  function powerCap() {
    const base = (g.level && g.level.eco && g.level.eco.powerBase !== undefined) ? g.level.eco.powerBase : ECO.powerBase;
    let cap = base + g.permPower + (g.tech.coretap ? 3 : 0);
    for (const t of g.turrets) cap += t.stat('gen') || 0;
    return Math.round(cap);
  }

  // turrets available on the current node (unlock chain across the campaign)
  function availableTurrets() {
    return (g.level && g.level.turrets) || CONFIG.TURRET_ORDER;
  }
  function powerUsed() {
    let used = 0;
    for (const t of g.turrets) used += t.def.power;
    return used;
  }

  function reset() {
    for (const e of g.enemies) e.remove();
    for (const t of g.turrets) t.sell();   // removes their meshes from the scene
    g.enemies = []; g.turrets = [];
    g.wave = 1;
    g.salvage = (g.level && g.level.eco && g.level.eco.startSalvage) || ECO.startSalvage;
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
    g.waveEarn = { kill: 0, fall: 0, leakPay: 0 };
    g.stats = { kills: 0, throws: 0, fallSalvage: 0, interest: 0, leaked: 0, built: 0, bestCombo: 0 };
  }

  function start(levelN) {
    // each node IS its spire: fixed seed + topology, learnable across attempts
    g.level = CONFIG.LEVELS[UTIL.clamp(levelN, 1, CONFIG.LEVELS.length) - 1];
    SPIRE.regen(g.level.seed, g.level.spire);
    reset();
    g.phase = 'build';
    rollDirectives();
    UI.onPhase();
    UI.banner('NODE ' + g.level.n + ' — ' + g.level.name, false);
    if (g.level.unlockNote) setTimeout(() => UI.toast(g.level.unlockNote, 'warn'), 1100);
    setTimeout(() => UI.toast(g.level.intro, ''), 2300);
    UI.updateHUD();
  }

  // ---------------- directives ----------------
  function rollDirectives() {
    if (g.wave < 2) { g.dirOffer = null; return; }
    const pool = CONFIG.DIRECTIVES.filter(d => (d.cost || 0) <= g.salvage);
    const offer = [];
    while (offer.length < 3 && pool.length) {
      offer.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    g.dirOffer = offer;
  }

  function pickDirective(def) {
    if (!g.dirOffer || !g.dirOffer.includes(def)) return false;
    if (def.cost) {
      if (g.salvage < def.cost) { AUDIO.sfx.error(); return false; }
      g.salvage -= def.cost;
    }
    if (def.mods.instant) g.salvage += def.mods.instant;
    if (def.mods.permPower) g.permPower += def.mods.permPower;
    g.activeDirs.push({ def, mods: def.mods, wavesLeft: def.mods.duration || 1 });
    g.dirOffer = null;
    AUDIO.sfx.cash();
    UI.toast(def.ico + ' ' + def.name + ' ACTIVE', 'warn');
    UI.onPhase(); UI.updateHUD();
    return true;
  }

  function skipDirectives() { g.dirOffer = null; UI.onPhase(); }

  // ---------------- tech ----------------
  function buyTech(def) {
    if (g.tech[def.id] || g.salvage < def.cost) { AUDIO.sfx.error(); return false; }
    g.salvage -= def.cost;
    g.tech[def.id] = true;
    AUDIO.sfx.build();
    UI.toast('⚙ ' + def.name + ' INSTALLED', 'warn');
    UI.updateHUD();
    return true;
  }

  // ---------------- economy actions ----------------
  function canAffordAny() {
    const cap = powerCap(), used = powerUsed();
    for (const id of availableTurrets()) {
      const d = CONFIG.TURRETS[id];
      if (g.salvage >= d.cost && used + d.power <= cap) return true;
    }
    return false;
  }

  function build(socket, type) {
    const def = CONFIG.TURRETS[type];
    if (!availableTurrets().includes(type)) return false;
    if (socket.turret || g.salvage < def.cost) return false;
    if (powerUsed() + def.power > powerCap()) { UI.toast('⚡ NOT ENOUGH POWER — BUILD A GENERATOR', 'bad'); AUDIO.sfx.error(); return false; }
    g.salvage -= def.cost;
    const t = new TURRET.Turret(g.scene, socket, type);
    g.turrets.push(t);
    g.stats.built++;
    AUDIO.sfx.build();
    FX.ring(socket.pos, 1.4, def.color);
    UI.updateHUD();
    return t;
  }

  function upgrade(t) {
    const cost = t.upgradeCost;
    if (cost === null || g.salvage < cost) { AUDIO.sfx.error(); return false; }
    g.salvage -= cost;
    t.upgrade();
    AUDIO.sfx.build();
    UI.updateHUD();
    return true;
  }

  function overclock(t) {
    if (t.ocCooldown > 0 || g.salvage < overclockCost()) { AUDIO.sfx.error(); return false; }
    if (t.type === 'generator' || t.type === 'stasis') return false;
    g.salvage -= overclockCost();
    t.overclock(overclockCooldown());
    UI.updateHUD();
    return true;
  }

  function sell(t) {
    const refund = t.sell();
    g.salvage += refund;
    g.turrets.splice(g.turrets.indexOf(t), 1);
    AUDIO.sfx.sell();
    UI.toast('+' + refund + ' ¤ RECLAIMED', 'warn');
    UI.updateHUD();
  }

  // ---------------- waves ----------------
  function startWave() {
    if (g.phase !== 'build') return;
    g.dirOffer = null;
    g.waveEarn = { kill: 0, fall: 0, leakPay: 0 };
    // interest on unspent salvage — the invest-or-hoard decision
    const interest = Math.round(Math.min(interestCap(), g.salvage * interestRate()) * mod('interestMult', 1));
    if (interest > 0) {
      g.salvage += interest;
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
    const gnatMult = mod('gnatSpeedMult', 1);
    const comp = CONFIG.wave(g.level, g.wave);
    for (const grp of comp) {
      for (let i = 0; i < grp.count; i++) {
        const flying = CONFIG.ENEMIES[grp.type].flying;
        g.spawnQueue.push({
          type: grp.type, at: grp.delay + i * grp.gap,
          hpMult: grp.hpMult * hpDirMult * (g.endless ? 1 + (g.wave - g.level.waves) * 0.25 : 1),
          spdMult: spdDirMult * (flying ? gnatMult : 1),
        });
      }
    }
    g.spawnQueue.sort((a, b) => a.at - b.at);
    AUDIO.sfx.waveStart();
    if (g.level.teach && g.level.teach.wave === g.wave) {
      UI.banner(g.level.teach.text, true);
    } else {
      UI.banner('WAVE ' + g.wave + (g.wave > g.level.waves ? ' — OVERTIME' : ''), !!(g.level.bosses && g.level.bosses[g.wave]));
    }
    UI.onPhase();
    UI.updateHUD();
  }

  function endWave() {
    // wave report: where the money came from
    const e = g.waveEarn;
    const parts = [];
    if (e.kill) parts.push('kills ¤' + e.kill);
    if (e.fall) parts.push('gravity ¤' + e.fall);
    if (e.interest) parts.push('interest ¤' + e.interest);
    if (e.leakPay) parts.push('insurance ¤' + e.leakPay);
    if (parts.length) UI.toast('WAVE ' + g.wave + ' INCOME — ' + parts.join(' · '), 'warn');
    // expire directives
    for (const d of g.activeDirs) d.wavesLeft--;
    g.activeDirs = g.activeDirs.filter(d => d.wavesLeft > 0);
    g.wave++;
    if (!g.endless && g.wave > g.level.waves) { victoryEnd(); return; }
    g.phase = 'build';
    rollDirectives();
    UI.banner('WAVE CLEAR — REINFORCE', false);
    UI.onPhase();
    UI.updateHUD();
  }

  // stars: an authored mastery target, not a participation prize
  function starRating() {
    if (g.stats.leaked === 0) return 3;
    if (g.stats.leaked <= 3) return 2;
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

  // ---------------- combat events ----------------
  function onKill(e, opts) {
    g.stats.kills++;
    let pay = Math.round(e.def.salvage * mod('killMult', 1)) + mod('killFlat', 0);
    g.waveEarn.kill += pay;
    if (opts.fallBonus) {
      const bonus = Math.round(opts.fallBonus * fallBonusMult());
      pay += bonus;
      g.stats.throws++;
      g.stats.fallSalvage += bonus;
      g.waveEarn.fall += bonus;
      FX.text(e.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), '+' + pay + ' ¤ GRAVITY', '#ffd166', 0.85);
    }
    g.salvage += pay;
    UI.updateHUD();
  }

  function onMultiThrow(n) {
    g.comboThrows = n;
    if (n > g.stats.bestCombo) g.stats.bestCombo = n;
    UI.combo(n + '× LAUNCHED!');
  }

  function onLeak(e) {
    g.coreHP -= e.def.dmg;
    g.stats.leaked++;
    const pay = mod('leakPay', 0);
    if (pay > 0) {
      g.salvage += pay;
      g.waveEarn.leakPay += pay;
      UI.toast('🛡 INSURANCE PAID ¤' + pay, 'warn');
    }
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

    SPIRE.update(dt, g.phase === 'build' && canAffordAny());
    FX.update(dt);

    for (const t of g.turrets) t.update(dt, g);

    if (g.phase === 'combat') {
      g.combatT += dt;
      while (g.spawnQueue.length && g.spawnQueue[0].at <= g.combatT) {
        const s = g.spawnQueue.shift();
        const e = new ENEMY.Enemy(g.scene, s.type, s.hpMult);
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
  g.startWave = startWave;
  g.build = build;
  g.upgrade = upgrade;
  g.overclock = overclock;
  g.sell = sell;
  g.update = update;
  g.onKill = onKill;
  g.onLeak = onLeak;
  g.onMultiThrow = onMultiThrow;
  g.powerCap = powerCap;
  g.powerUsed = powerUsed;
  g.canAffordAny = canAffordAny;
  g.pickDirective = pickDirective;
  g.skipDirectives = skipDirectives;
  g.buyTech = buyTech;
  g.mod = mod;
  g.overclockCost = overclockCost;
  g.interestRate = interestRate;
  g.interestCap = interestCap;
  g.availableTurrets = availableTurrets;
  return g;
})();
