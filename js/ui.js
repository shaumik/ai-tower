/* NEURAL SPIRE — DOM HUD: sheets, banners, end screens, wave preview */
'use strict';
const UI = (function () {
  const $ = UTIL.el;
  let selSocket = null, selTurret = null, selType = null;
  let rangeRing = null;   // 3D range indicator for the current selection

  // ---------------- range ring ----------------
  function showRange(pos, r, color) {
    hideRange();
    rangeRing = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.05, 6, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })
    );
    rangeRing.rotation.x = Math.PI / 2;
    rangeRing.position.copy(pos);
    GAME.scene.add(rangeRing);
  }
  function hideRange() {
    if (rangeRing) { GAME.scene.remove(rangeRing); rangeRing.geometry.dispose(); rangeRing.material.dispose(); rangeRing = null; }
  }

  // ---------------- selection / sheets ----------------
  function onTap(hit) {
    AUDIO.unlock();
    if (hit.turret) { selectTurret(hit.turret); return; }
    if (hit.socket) { selectSocket(hit.socket); return; }
    clearSel();
  }

  function selectSocket(s) {
    selSocket = s; selTurret = null;
    selType = selType || 'blaster';
    renderBuildSheet();
    $('sheet-turret').classList.remove('open');
    $('sheet-build').classList.add('open');
    INPUT.focusOn(s.pos.y + 2.5); // bring the selection above the sheet
    AUDIO.sfx.click();
  }

  function selectTurret(t) {
    selTurret = t; selSocket = null;
    renderTurretSheet();
    $('sheet-build').classList.remove('open');
    $('sheet-turret').classList.add('open');
    showRange(t.mesh.position, t.stat('range') || 1.2, t.def.color);
    INPUT.focusOn(t.mesh.position.y + 2.5);
    AUDIO.sfx.click();
  }

  function clearSel() {
    selSocket = null; selTurret = null;
    $('sheet-build').classList.remove('open');
    $('sheet-turret').classList.remove('open');
    hideRange();
  }

  function renderBuildSheet() {
    $('build-socket-n').textContent = '#' + (selSocket.i + 1);
    const cards = $('build-cards');
    cards.innerHTML = '';
    const cap = GAME.powerCap(), used = GAME.powerUsed();
    for (const id of CONFIG.TURRET_ORDER) {
      const d = CONFIG.TURRETS[id];
      const afford = GAME.salvage >= d.cost && used + d.power <= cap;
      const card = UTIL.h('div', 'b-card' + (selType === id ? ' sel' : '') + (afford ? '' : ' cant'),
        '<div class="bc-ico" style="color:#' + d.color.toString(16).padStart(6, '0') + '">' + d.ico + '</div>' +
        '<div class="bc-name">' + d.name.toUpperCase() + '</div>' +
        '<div class="bc-cost">¤ ' + d.cost + '</div>' +
        '<div class="bc-pow">' + (d.gen ? '+' + d.gen + ' ⚡' : d.power + ' ⚡') + '</div>');
      card.onclick = () => { selType = id; renderBuildSheet(); AUDIO.sfx.click(); };
      cards.appendChild(card);
    }
    const d = CONFIG.TURRETS[selType];
    let body = $('sheet-build').querySelector('.b-desc');
    if (!body) { body = UTIL.h('div', 'b-desc'); $('sheet-build').appendChild(body); }
    body.innerHTML = d.desc;
    let btn = $('sheet-build').querySelector('.b-confirm');
    if (!btn) { btn = UTIL.h('button', 'btn btn-primary b-confirm'); $('sheet-build').appendChild(btn); }
    const afford = GAME.salvage >= d.cost && GAME.powerUsed() + d.power <= GAME.powerCap();
    btn.textContent = afford ? '✓ BUILD ' + d.name.toUpperCase() + ' — ¤ ' + d.cost : (GAME.salvage < d.cost ? 'NEED ¤ ' + d.cost : 'NEED ⚡ POWER');
    btn.disabled = !afford;
    btn.onclick = () => {
      const t = GAME.build(selSocket, selType);
      if (t) { clearSel(); selectTurret(t); }
    };
    // preview the range from this socket
    if (d.range) showRange(selSocket.pos, d.range, d.color); else hideRange();
  }

  function renderTurretSheet() {
    const t = selTurret;
    const body = $('turret-body');
    const col = '#' + t.def.color.toString(16).padStart(6, '0');
    let stats = '';
    if (t.type === 'generator') stats = '+' + Math.round(t.stat('gen')) + ' ⚡ power to the grid';
    else if (t.type === 'stasis') stats = 'Slows ' + Math.round(t.stat('slow') * 100) + '% · range ' + t.stat('range').toFixed(1);
    else stats = 'DMG ' + t.stat('dmg').toFixed(1) + ' · ' + t.stat('rate').toFixed(1) + '/s · range ' + t.stat('range').toFixed(1) + (t.def.knock ? ' · knock ' + t.stat('knock').toFixed(1) : '') + ' · kills ' + t.kills;
    const upCost = t.upgradeCost;
    body.innerHTML =
      '<div class="t-head"><div class="t-ico" style="color:' + col + '">' + t.def.ico + '</div>' +
      '<div><div class="t-name">' + t.def.name.toUpperCase() + '</div>' +
      '<div class="t-lvl">' + '▮'.repeat(t.level) + '▯'.repeat(3 - t.level) + ' LEVEL ' + t.level + '</div></div></div>' +
      '<div class="t-stats">' + stats + '</div>';
    const row = UTIL.h('div', 't-row');
    if (upCost !== null) {
      const up = UTIL.h('button', 'btn btn-primary', '▲ UPGRADE ¤ ' + upCost);
      up.disabled = GAME.salvage < upCost;
      up.onclick = () => { if (GAME.upgrade(t)) renderTurretSheet(); };
      row.appendChild(up);
    } else {
      row.appendChild(UTIL.h('button', 'btn', '★ MAX LEVEL')).disabled = true;
    }
    if (t.type !== 'generator' && t.type !== 'stasis') {
      const oc = UTIL.h('button', 'btn' + (t.overclockT > 0 ? ' oc-active' : ''),
        t.overclockT > 0 ? '⚡ OVERCLOCKED' : (t.ocCooldown > 0 ? '⚡ COOLING ' + Math.ceil(t.ocCooldown) + 's' : '⚡ OVERCLOCK ¤ ' + CONFIG.ECONOMY.overclockCost));
      oc.disabled = t.ocCooldown > 0 || GAME.salvage < CONFIG.ECONOMY.overclockCost;
      oc.onclick = () => { if (GAME.overclock(t)) renderTurretSheet(); };
      row.appendChild(oc);
    }
    const sl = UTIL.h('button', 'btn', '✕ SELL ¤ ' + Math.round(t.spent * CONFIG.ECONOMY.sellRefund));
    sl.onclick = () => { GAME.sell(t); clearSel(); };
    row.appendChild(sl);
    body.appendChild(row);
    showRange(t.mesh.position, t.stat('range') || 1.2, t.def.color);
  }

  // ---------------- HUD ----------------
  function updateHUD() {
    $('v-core').textContent = GAME.coreHP;
    $('hud-core').classList.toggle('low', GAME.coreHP <= 3);
    $('v-salvage').textContent = UTIL.fmt(GAME.salvage);
    const used = GAME.powerUsed(), cap = GAME.powerCap();
    $('v-power').textContent = used + '/' + cap;
    $('hud-power').classList.toggle('full', used >= cap);
    $('v-wave').textContent = 'W' + Math.min(GAME.wave, GAME.endless ? GAME.wave : CONFIG.MAX_WAVE) + (GAME.endless ? '·∞' : '/' + CONFIG.MAX_WAVE);
    // refresh open sheets so costs stay truthful
    if (selSocket && $('sheet-build').classList.contains('open')) renderBuildSheet();
  }

  function onPhase() {
    const b = $('btn-wave');
    if (GAME.phase === 'build') {
      b.classList.remove('hidden2');
      const interest = Math.min(CONFIG.ECONOMY.interestCap, Math.floor(GAME.salvage * CONFIG.ECONOMY.interestRate));
      b.textContent = '▶ START WAVE ' + GAME.wave + (interest > 0 ? '  (+' + interest + ' ¤ interest)' : '');
      renderPreview();
    } else {
      b.classList.add('hidden2');
      $('wave-preview').innerHTML = '';
      clearSel();
    }
  }

  function renderPreview() {
    const box = $('wave-preview');
    box.innerHTML = '<span style="opacity:.7">NEXT:</span>';
    const comp = CONFIG.wave(GAME.wave);
    const totals = {};
    for (const grp of comp) totals[grp.type] = (totals[grp.type] || 0) + grp.count;
    for (const type in totals) {
      const d = CONFIG.ENEMIES[type];
      const col = '#' + d.color.toString(16).padStart(6, '0');
      box.appendChild(UTIL.h('span', 'wp-chip',
        '<span style="color:' + col + '">' + d.ico + '</span> ' + d.name + ' <b>×' + totals[type] + '</b>' +
        (d.flying ? ' ✈' : '') + (d.boss ? ' ☠' : '')));
    }
  }

  // ---------------- feedback ----------------
  let bannerT = null;
  function banner(msg, warn) {
    const b = $('banner');
    b.textContent = msg;
    b.classList.toggle('warn', !!warn);
    b.classList.add('show');
    clearTimeout(bannerT);
    bannerT = setTimeout(() => b.classList.remove('show'), 2200);
  }
  function toast(msg, kind) {
    const t = UTIL.h('div', 'toast' + (kind ? ' ' + kind : ''), msg);
    $('toast-zone').appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }
  let comboT = null;
  function combo(msg) {
    const c = $('combo-ind');
    c.textContent = msg;
    c.classList.add('show');
    clearTimeout(comboT);
    comboT = setTimeout(() => c.classList.remove('show'), 1400);
  }
  function hurt() {
    const h = $('hurt-vignette');
    h.style.opacity = 1;
    setTimeout(() => h.style.opacity = 0, 220);
  }

  // ---------------- end screens ----------------
  function showEnd(won) {
    const card = $('end-card');
    const s = GAME.stats;
    card.innerHTML = '';
    card.appendChild(UTIL.h('h2', won ? 'win' : 'lose', won ? 'SPIRE HELD' : 'CORE BREACHED'));
    card.appendChild(UTIL.h('div', 'end-line',
      (won ? 'All ' + CONFIG.MAX_WAVE + ' waves repelled.' : 'Fell on wave ' + GAME.wave + ' of ' + CONFIG.MAX_WAVE + '.') +
      '<br><b>' + s.kills + '</b> threats destroyed · <b>' + s.throws + '</b> thrown off the spire' +
      '<br>gravity paid <b>¤ ' + s.fallSalvage + '</b> · interest paid <b>¤ ' + s.interest + '</b>' +
      '<br>best launch combo <b>×' + s.bestCombo + '</b> · leaks ' + s.leaked));
    if (won) {
      const cont = UTIL.h('button', 'btn btn-primary', '∞ CONTINUE — OVERTIME');
      cont.onclick = () => {
        $('end-overlay').classList.remove('show');
        GAME.endless = true;
        GAME.phase = 'build';
        banner('OVERTIME — WAVES COMPOUND FOREVER', true);
        onPhase(); updateHUD();
      };
      card.appendChild(cont);
    }
    const again = UTIL.h('button', 'btn' + (won ? '' : ' btn-primary'), '↻ ' + (won ? 'NEW RUN' : 'RETRY'));
    again.onclick = () => { $('end-overlay').classList.remove('show'); GAME.start(); INPUT.focusBase(); };
    card.appendChild(again);
    $('end-overlay').classList.add('show');
  }

  // ---------------- wiring ----------------
  function init() {
    $('btn-start').onclick = () => {
      AUDIO.unlock();
      $('screen-title').classList.remove('show');
      $('hud').classList.remove('hidden');
      GAME.start();
      INPUT.focusBase();
      if (!SAVE.state.bestWave) $('help-overlay').classList.add('show');
    };
    $('btn-wave').onclick = () => { AUDIO.unlock(); GAME.startWave(); };
    $('btn-pause').onclick = () => { GAME.paused = true; $('pause-overlay').classList.add('show'); syncMuteLabel(); };
    $('btn-resume').onclick = () => { GAME.paused = false; $('pause-overlay').classList.remove('show'); };
    $('btn-restart').onclick = () => { GAME.paused = false; $('pause-overlay').classList.remove('show'); GAME.start(); INPUT.focusBase(); };
    $('btn-mute').onclick = () => { AUDIO.setMuted(!SAVE.state.muted); syncMuteLabel(); };
    $('btn-help').onclick = () => { $('pause-overlay').classList.remove('show'); $('help-overlay').classList.add('show'); };
    $('btn-help-close').onclick = () => { $('help-overlay').classList.remove('show'); GAME.paused = false; };
    $('btn-speed').onclick = () => {
      GAME.speed = GAME.speed === 1 ? 2 : 1;
      $('btn-speed').textContent = GAME.speed + '×';
      AUDIO.sfx.click();
    };
    const best = SAVE.state.bestWave;
    $('title-best').textContent = best ? 'BEST: WAVE ' + best + (SAVE.state.victories ? ' · ' + SAVE.state.victories + ' VICTORIES' : '') : '';
  }
  function syncMuteLabel() { $('btn-mute').textContent = 'SOUND: ' + (SAVE.state.muted ? 'OFF' : 'ON'); }

  return { init, onTap, updateHUD, onPhase, banner, toast, combo, hurt, showEnd, clearSel };
})();
