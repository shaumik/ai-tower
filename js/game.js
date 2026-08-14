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
  };

  function powerCap() {
    let cap = ECO.powerBase;
    for (const t of g.turrets) cap += t.stat('gen') || 0;
    return Math.round(cap);
  }
  function powerUsed() {
    let used = 0;
    for (const t of g.turrets) used += t.def.power;
    return used;
  }

  function reset() {
    for (const e of g.enemies) e.remove();
    for (const t of g.turrets) t.sell();
    g.enemies = []; g.turrets = [];
    g.wave = 1;
    g.salvage = ECO.startSalvage;
    g.coreHP = ECO.coreHP;
    g.spawnQueue = [];
    g.combatT = 0; g.time = 0;
    g.speed = 1;
    g.endless = false;
    g.paused = false;
    g.stats = { kills: 0, throws: 0, fallSalvage: 0, interest: 0, leaked: 0, built: 0, bestCombo: 0 };
  }

  function start() {
    reset();
    g.phase = 'build';
    UI.onPhase();
    UI.banner('WAVE 1 INCOMING — BUILD YOUR DEFENSE', false);
    UI.updateHUD();
  }

  // ---------------- economy actions ----------------
  function canAffordAny() {
    const cap = powerCap(), used = powerUsed();
    for (const id of CONFIG.TURRET_ORDER) {
      const d = CONFIG.TURRETS[id];
      if (g.salvage >= d.cost && used + d.power <= cap) return true;
    }
    return false;
  }

  function build(socket, type) {
    const def = CONFIG.TURRETS[type];
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
    if (t.ocCooldown > 0 || g.salvage < ECO.overclockCost) { AUDIO.sfx.error(); return false; }
    if (t.type === 'generator' || t.type === 'stasis') return false;
    g.salvage -= ECO.overclockCost;
    t.overclock();
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
    // interest on unspent salvage — the invest-or-hoard decision
    const interest = Math.min(ECO.interestCap, Math.floor(g.salvage * ECO.interestRate));
    if (interest > 0) {
      g.salvage += interest;
      g.stats.interest += interest;
      UI.toast('+' + interest + ' ¤ INTEREST ON RESERVES', 'warn');
      AUDIO.sfx.cash();
    }
    g.phase = 'combat';
    g.combatT = 0;
    g.spawnQueue = [];
    const comp = CONFIG.wave(g.wave);
    for (const grp of comp) {
      for (let i = 0; i < grp.count; i++) {
        g.spawnQueue.push({ type: grp.type, at: grp.delay + i * grp.gap, hpMult: grp.hpMult * (g.endless ? 1 + (g.wave - CONFIG.MAX_WAVE) * 0.25 : 1) });
      }
    }
    g.spawnQueue.sort((a, b) => a.at - b.at);
    AUDIO.sfx.waveStart();
    UI.banner('WAVE ' + g.wave + (g.wave > CONFIG.MAX_WAVE ? ' — OVERTIME' : ''), g.wave % 5 === 0);
    UI.onPhase();
    UI.updateHUD();
  }

  function endWave() {
    g.wave++;
    if (!g.endless && g.wave > CONFIG.MAX_WAVE) { victoryEnd(); return; }
    g.phase = 'build';
    UI.banner('WAVE CLEAR — REINFORCE', false);
    UI.onPhase();
    UI.updateHUD();
  }

  function victoryEnd() {
    g.phase = 'won';
    SAVE.recordRun(CONFIG.MAX_WAVE, true);
    AUDIO.sfx.victory();
    UI.showEnd(true);
  }

  function defeat() {
    g.phase = 'lost';
    SAVE.recordRun(g.wave, false);
    AUDIO.sfx.defeat();
    UI.showEnd(false);
  }

  // ---------------- combat events ----------------
  function onKill(e, opts) {
    g.stats.kills++;
    let pay = e.def.salvage;
    if (opts.fallBonus) {
      pay += opts.fallBonus;
      g.stats.throws++;
      g.stats.fallSalvage += opts.fallBonus;
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
        g.enemies.push(new ENEMY.Enemy(g.scene, s.type, s.hpMult));
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
  return g;
})();
