/* HARVEST PROTOCOL — DOM HUD: build bar, selection sheet, directives,
   tech, operation select, end screens. */
'use strict';
const UI = (function () {
  const $ = UTIL.el;
  let selected = null;   // { building } | { worker } | { field }

  // ---------------- tap routing ----------------
  function onTap(hit) {
    AUDIO.unlock();
    if (hit.building) { select({ building: hit.building }); return; }
    if (hit.worker) { select({ worker: hit.worker }); return; }
    if (hit.field) { select({ field: hit.field }); return; }
    clearSel();
  }

  function select(sel) {
    selected = sel;
    renderSel();
    $('sheet-tech').classList.remove('open');
    $('sheet-sel').classList.add('open');
    AUDIO.sfx.click();
  }
  function clearSel() {
    selected = null;
    $('sheet-sel').classList.remove('open');
    $('sheet-tech').classList.remove('open');
  }

  function renderSel() {
    const body = $('sel-body');
    if (!selected) return;
    if (selected.building) {
      const b = selected.building;
      if (!b.alive) { clearSel(); return; }
      const col = '#' + b.def.color.toString(16).padStart(6, '0');
      let stats = 'Integrity ' + Math.ceil(b.hp) + '/' + Math.round(b.maxHp);
      if (b.def.kind === 'turret' && b.type !== 'stasis') stats += ' · DMG ' + b.stat('dmg').toFixed(1) + ' · ' + b.stat('rate').toFixed(1) + '/s · range ' + b.stat('range').toFixed(1) + ' · kills ' + b.kills;
      if (b.type === 'stasis') stats += ' · slows ' + Math.round(b.stat('slow') * 100) + '% · range ' + b.stat('range').toFixed(1);
      if (b.def.gen) stats += ' · +' + Math.round(b.stat('gen')) + ' ⚡';
      if (b.def.dropoff) stats += ' · drop-off · +2 ⛏ cap';
      body.innerHTML =
        '<div class="t-head"><div class="t-ico" style="color:' + col + '">' + b.def.ico + '</div>' +
        '<div><div class="t-name">' + b.def.name.toUpperCase() + '</div>' +
        (b.def.kind === 'turret' ? '<div class="t-lvl">' + '▮'.repeat(b.level) + '▯'.repeat(3 - b.level) + ' LEVEL ' + b.level + '</div>' : '') +
        '</div></div>' +
        '<div class="t-stats">' + stats + '</div>';
      const row = UTIL.h('div', 't-row');
      if (b.def.kind === 'turret') {
        const upCost = b.upgradeCost;
        if (upCost !== null) {
          const up = UTIL.h('button', 'btn btn-primary', '▲ ¤' + upCost);
          up.disabled = GAME.minerals < upCost;
          up.onclick = () => { if (GAME.upgrade(b)) renderSel(); };
          row.appendChild(up);
        }
        if (b.type !== 'stasis') {
          const ocCost = GAME.overclockCost();
          const oc = UTIL.h('button', 'btn' + (b.overclockT > 0 ? ' oc-active' : ''),
            b.overclockT > 0 ? '⚡ ON' : (b.ocCooldown > 0 ? '⚡ ' + Math.ceil(b.ocCooldown) + 's' : '⚡ ¤' + ocCost));
          oc.disabled = b.ocCooldown > 0 || GAME.minerals < ocCost;
          oc.onclick = () => { if (GAME.overclock(b)) renderSel(); };
          row.appendChild(oc);
        }
      }
      if (b.hp < b.maxHp - 1) {
        const cost = Math.ceil((b.maxHp - b.hp) * CONFIG.ECONOMY.repairCostPerHP);
        const rp = UTIL.h('button', 'btn', '🔧 ¤' + cost);
        rp.disabled = GAME.minerals < cost;
        rp.onclick = () => { if (GAME.repair(b)) renderSel(); };
        row.appendChild(rp);
      }
      const sl = UTIL.h('button', 'btn', '✕ ¤' + b.sellValue());
      sl.onclick = () => { GAME.sell(b); clearSel(); };
      row.appendChild(sl);
      body.appendChild(row);
      return;
    }
    if (selected.worker) {
      const w = selected.worker;
      if (!w.alive) { clearSel(); return; }
      const states = { idle: 'looking for work', toField: 'heading to crystals', mining: 'mining', toDrop: 'hauling a load home' };
      body.innerHTML =
        '<div class="t-head"><div class="t-ico" style="color:#7fdcff">⛏</div>' +
        '<div><div class="t-name">HARVESTER DRONE</div></div></div>' +
        '<div class="t-stats">Integrity ' + Math.ceil(w.hp) + '/' + w.maxHp + ' · ' + (states[w.state] || w.state) +
        (w.carry ? ' · carrying ¤' + w.carry : '') + '</div>';
      return;
    }
    if (selected.field) {
      const f = selected.field;
      const k = Math.round((f.reserves / f.max) * 100);
      body.innerHTML =
        '<div class="t-head"><div class="t-ico" style="color:#7fdcff">◆</div>' +
        '<div><div class="t-name">CRYSTAL FIELD</div></div></div>' +
        '<div class="t-stats">Reserves ¤' + Math.round(f.reserves) + ' of ¤' + f.max + ' (' + k + '%)' +
        ' · ' + f.workers.size + ' miner' + (f.workers.size === 1 ? '' : 's') + ' working' +
        (f.reserves <= 0 ? ' · <b style="color:#ff5d7a">DEPLETED</b>' : '') + '</div>';
      return;
    }
  }

  // ---------------- build bar ----------------
  function renderBuildBar() {
    const bar = $('build-bar');
    bar.innerHTML = '';
    // worker card first — the economy button
    const alive = GAME.workers.filter(w => w.alive).length;
    const wCard = UTIL.h('div', 'b-card' + (GAME.minerals >= CONFIG.ECONOMY.workerCost && alive < GAME.workerCap() ? '' : ' cant'),
      '<div class="bc-ico" style="color:#7fdcff">⛏</div>' +
      '<div class="bc-name">MINER</div>' +
      '<div class="bc-cost">¤ ' + CONFIG.ECONOMY.workerCost + '</div>' +
      '<div class="bc-pow">' + alive + '/' + GAME.workerCap() + '</div>');
    wCard.onclick = () => { AUDIO.unlock(); GAME.buyWorker(); renderBuildBar(); };
    bar.appendChild(wCard);
    for (const id of GAME.availableBuildings()) {
      const d = CONFIG.BUILDINGS[id];
      const afford = GAME.minerals >= d.cost && (!d.power || GAME.powerUsed() + d.power <= GAME.powerCap());
      const card = UTIL.h('div', 'b-card' + (afford ? '' : ' cant') + (INPUT.placing && INPUT.placing.type === id ? ' sel' : ''),
        '<div class="bc-ico" style="color:#' + d.color.toString(16).padStart(6, '0') + '">' + d.ico + '</div>' +
        '<div class="bc-name">' + d.name.toUpperCase() + '</div>' +
        '<div class="bc-cost">¤ ' + d.cost + '</div>' +
        '<div class="bc-pow">' + (d.gen ? '+' + d.gen + ' ⚡' : (d.power ? d.power + ' ⚡' : '&nbsp;')) + '</div>');
      card.onclick = () => {
        AUDIO.unlock(); AUDIO.sfx.click();
        clearSel();
        INPUT.startPlacing(id);
        $('place-hint').textContent = d.desc.split('.')[0].toUpperCase();
        $('place-bar').classList.add('show');
        renderBuildBar();
      };
      bar.appendChild(card);
    }
  }

  // ---------------- HUD ----------------
  function updateHUD() {
    $('v-core').textContent = GAME.coreHP;
    $('hud-core').classList.toggle('low', GAME.coreHP <= CONFIG.ECONOMY.coreHP * 0.3);
    $('v-minerals').textContent = UTIL.fmt(GAME.minerals);
    const used = GAME.powerUsed(), cap = GAME.powerCap();
    $('v-power').textContent = used + '/' + cap;
    $('hud-power').classList.toggle('full', used >= cap);
    const alive = GAME.workers.filter(w => w.alive).length;
    $('v-workers').textContent = alive + '/' + GAME.workerCap();
    const W = GAME.level ? GAME.level.waves : 0;
    $('v-wave').textContent = GAME.level
      ? ('W' + Math.min(GAME.wave, GAME.endless ? GAME.wave : W) + (GAME.endless ? '∞' : '/' + W))
      : '';
    renderBuildBar();
    if (selected && $('sheet-sel').classList.contains('open')) renderSel();
    if ($('sheet-tech').classList.contains('open')) renderTech();
  }

  function onPhase() {
    const b = $('btn-wave');
    if (GAME.phase === 'build') {
      b.classList.remove('hidden2');
      const interest = Math.round(Math.min(GAME.interestCap(), GAME.minerals * GAME.interestRate()) * GAME.mod('interestMult', 1));
      b.textContent = '▶ WAVE ' + GAME.wave + (interest > 0 ? ' (+' + interest + ' ¤)' : '');
      renderPreview();
      renderDirectives();
    } else {
      b.classList.add('hidden2');
      $('wave-preview').innerHTML = '';
      $('directive-bar').innerHTML = '';
    }
    renderBuildBar();
  }

  function renderPreview() {
    const box = $('wave-preview');
    box.innerHTML = '<span style="opacity:.7">NEXT:</span>';
    const comp = CONFIG.wave(GAME.level, GAME.wave);
    const totals = {};
    for (const grp of comp) totals[grp.type] = (totals[grp.type] || 0) + grp.count;
    for (const type in totals) {
      const d = CONFIG.ENEMIES[type];
      const col = '#' + d.color.toString(16).padStart(6, '0');
      box.appendChild(UTIL.h('span', 'wp-chip',
        '<span style="color:' + col + '">' + d.ico + '</span> ' + d.name + ' <b>×' + totals[type] + '</b>' +
        (d.target === 'workers' ? ' ⛏!' : '') + (d.target === 'buildings' ? ' 🏚' : '') + (d.boss ? ' ☠' : '')));
    }
  }

  // ---------------- directives ----------------
  function renderDirectives() {
    const bar = $('directive-bar');
    bar.innerHTML = '';
    const offer = GAME.dirOffer;
    if (!offer || !offer.length) return;
    bar.appendChild(UTIL.h('div', 'dir-title', '◈ DIRECTIVE — PICK ONE TRADE'));
    const row = UTIL.h('div', 'dir-row');
    for (const d of offer) {
      const chip = UTIL.h('div', 'dir-chip',
        '<div class="dc-ico">' + d.ico + '</div>' +
        '<div class="dc-name">' + d.name + (d.cost ? ' −¤' + d.cost : '') + '</div>' +
        '<div class="dc-desc">' + d.desc + '</div>');
      chip.onclick = () => { AUDIO.unlock(); GAME.pickDirective(d); };
      row.appendChild(chip);
    }
    bar.appendChild(row);
    const skip = UTIL.h('div', 'dir-skip', '✕ SKIP');
    skip.onclick = () => { AUDIO.sfx.click(); GAME.skipDirectives(); };
    bar.appendChild(skip);
  }

  // ---------------- tech ----------------
  function renderTech() {
    const list = $('tech-list');
    list.innerHTML = '';
    for (const t of CONFIG.TECH) {
      const owned = !!GAME.tech[t.id];
      const row = UTIL.h('div', 'tech-row' + (owned ? ' owned' : ''),
        '<div class="th-ico">' + t.ico + '</div>' +
        '<div class="th-body"><div class="th-name">' + t.name + '</div>' +
        '<div class="th-desc">' + t.desc + '</div></div>');
      const btn = UTIL.h('button', 'btn' + (owned ? '' : ' btn-primary'), owned ? '✓ OWNED' : '¤ ' + t.cost);
      btn.disabled = owned || GAME.minerals < t.cost;
      btn.onclick = () => { if (GAME.buyTech(t)) renderTech(); };
      row.appendChild(btn);
      list.appendChild(row);
    }
  }
  function openTech() {
    clearSel();
    renderTech();
    $('sheet-tech').classList.add('open');
    AUDIO.sfx.click();
  }

  // ---------------- feedback ----------------
  let bannerT = null;
  function banner(msg, warn) {
    const b = $('banner');
    b.textContent = msg;
    b.classList.toggle('warn', !!warn);
    b.classList.add('show');
    clearTimeout(bannerT);
    bannerT = setTimeout(() => b.classList.remove('show'), 2400);
  }
  function toast(msg, kind) {
    const t = UTIL.h('div', 'toast' + (kind ? ' ' + kind : ''), msg);
    $('toast-zone').appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }
  function hurt() {
    const h = $('hurt-vignette');
    h.style.opacity = 1;
    setTimeout(() => h.style.opacity = 0, 220);
  }

  // ---------------- end screens ----------------
  function showEnd(won) {
    INPUT.stopPlacing();
    $('place-bar').classList.remove('show');
    clearSel();
    const card = $('end-card');
    const s = GAME.stats;
    const lvl = GAME.level;
    card.innerHTML = '';
    card.appendChild(UTIL.h('h2', won ? 'win' : 'lose', won ? 'OPERATION SECURED' : 'CORE BREACHED'));
    if (won) {
      const st = GAME.stars;
      card.appendChild(UTIL.h('div', '', '<span style="font-size:30px;letter-spacing:4px;color:#ffd166">' +
        '★'.repeat(st) + '<span style="opacity:.22">' + '★'.repeat(3 - st) + '</span></span>' +
        '<div style="font-size:9.5px;color:#5f89ad;letter-spacing:1px;margin-top:2px">' +
        (st === 3 ? 'FLAWLESS — NO LEAKS, NO MINERS LOST' : st === 2 ? 'CORE HELD STRONG' : 'SECURED, BARELY') + '</div>'));
    }
    card.appendChild(UTIL.h('div', 'end-line',
      'OP ' + lvl.n + ' · ' + lvl.name + ' — ' +
      (won ? 'all ' + lvl.waves + ' waves repelled.' : 'fell on wave ' + GAME.wave + ' of ' + lvl.waves + '.') +
      '<br>mined <b>¤ ' + s.mined + '</b> · interest <b>¤ ' + s.interest + '</b> · ' + s.kills + ' kills' +
      '<br>peak crew <b>' + s.peakWorkers + '</b> · miners lost ' + s.workersLost + ' · structures lost ' + s.buildingsLost +
      '<br>core leaks ' + s.leaked));
    if (won && lvl.n < CONFIG.LEVELS.length) {
      const next = CONFIG.LEVELS[lvl.n];
      const nx = UTIL.h('button', 'btn btn-primary', '▶ OP ' + next.n + ' — ' + next.name);
      nx.onclick = () => { $('end-overlay').classList.remove('show'); GAME.start(next.n); INPUT.focusBase(); };
      card.appendChild(nx);
    }
    if (won) {
      const cont = UTIL.h('button', 'btn', '∞ OVERTIME — WAVES COMPOUND');
      cont.onclick = () => {
        $('end-overlay').classList.remove('show');
        GAME.endless = true;
        GAME.phase = 'build';
        banner('OVERTIME — NO RETREAT', true);
        onPhase(); updateHUD();
      };
      card.appendChild(cont);
    }
    const again = UTIL.h('button', 'btn' + (won ? '' : ' btn-primary'), '↻ RETRY OP ' + lvl.n);
    again.onclick = () => { $('end-overlay').classList.remove('show'); GAME.start(lvl.n); INPUT.focusBase(); };
    card.appendChild(again);
    const sel2 = UTIL.h('button', 'btn', 'OPERATIONS');
    sel2.onclick = () => { $('end-overlay').classList.remove('show'); openLevels(); };
    card.appendChild(sel2);
    $('end-overlay').classList.add('show');
  }

  // ---------------- operation select ----------------
  function renderLevels() {
    const list = $('levels-list');
    list.innerHTML = '';
    let totalStars = 0;
    for (const lvl of CONFIG.LEVELS) {
      const stars = SAVE.starsFor(lvl.n);
      totalStars += stars;
      const locked = lvl.n > SAVE.state.furthest;
      const threats = lvl.palette.map(t => {
        const d = CONFIG.ENEMIES[t];
        return '<span style="color:#' + d.color.toString(16).padStart(6, '0') + '">' + d.ico + '</span>';
      }).join(' ');
      const card = UTIL.h('div', 'lvl-card' + (locked ? ' locked' : ''),
        '<div class="lvl-num">' + (locked ? '🔒' : lvl.n) + '</div>' +
        '<div class="lvl-body">' +
          '<div class="lvl-name">' + lvl.name + ' <small>· ' + lvl.sub + '</small></div>' +
          '<div class="lvl-meta">' + lvl.topo + ' · ' + lvl.waves + ' WAVES · ' + threats +
          (lvl.twist ? ' · <span class="tw">' + lvl.twist + '</span>' : '') + '</div>' +
        '</div>' +
        '<div class="lvl-stars">' + '★'.repeat(stars) + '<span class="off">' + '★'.repeat(3 - stars) + '</span></div>');
      if (!locked) {
        card.onclick = () => {
          AUDIO.unlock(); AUDIO.sfx.click();
          $('screen-levels').classList.remove('show');
          $('screen-title').classList.remove('show');
          $('hud').classList.remove('hidden');
          GAME.start(lvl.n);
          INPUT.focusBase();
          if (lvl.n === 1 && !SAVE.starsFor(1)) $('help-overlay').classList.add('show');
        };
      }
      list.appendChild(card);
    }
    $('levels-stars').textContent = '★ ' + totalStars + '/' + CONFIG.LEVELS.length * 3;
  }
  function openLevels() {
    renderLevels();
    $('screen-levels').classList.add('show');
  }

  // ---------------- wiring ----------------
  function init() {
    $('btn-start').onclick = () => {
      AUDIO.unlock();
      const n = SAVE.state.furthest;
      $('screen-title').classList.remove('show');
      $('hud').classList.remove('hidden');
      GAME.start(n);
      INPUT.focusBase();
      if (n === 1 && !SAVE.starsFor(1)) $('help-overlay').classList.add('show');
    };
    $('btn-levels').onclick = () => { AUDIO.unlock(); AUDIO.sfx.click(); openLevels(); };
    $('btn-levels-back').onclick = () => {
      AUDIO.sfx.click();
      $('screen-levels').classList.remove('show');
      if (!GAME.level) $('screen-title').classList.add('show');
    };
    $('btn-wave').onclick = () => { AUDIO.unlock(); GAME.startWave(); };
    $('btn-tech').onclick = () => {
      AUDIO.unlock();
      if ($('sheet-tech').classList.contains('open')) clearSel(); else openTech();
    };
    $('btn-place-ok').onclick = () => {
      const b = INPUT.confirmPlacing();
      if (b) { $('place-bar').classList.remove('show'); renderBuildBar(); }
    };
    $('btn-place-cancel').onclick = () => {
      INPUT.stopPlacing();
      $('place-bar').classList.remove('show');
      AUDIO.sfx.click();
      renderBuildBar();
    };
    $('btn-pause').onclick = () => { GAME.paused = true; $('pause-overlay').classList.add('show'); syncMuteLabel(); };
    $('btn-resume').onclick = () => { GAME.paused = false; $('pause-overlay').classList.remove('show'); };
    $('btn-restart').onclick = () => { GAME.paused = false; $('pause-overlay').classList.remove('show'); GAME.start(GAME.level ? GAME.level.n : 1); INPUT.focusBase(); };
    $('btn-mute').onclick = () => { AUDIO.setMuted(!SAVE.state.muted); syncMuteLabel(); };
    $('btn-help').onclick = () => { $('pause-overlay').classList.remove('show'); $('help-overlay').classList.add('show'); };
    $('btn-help-close').onclick = () => { $('help-overlay').classList.remove('show'); GAME.paused = false; };
    $('btn-speed').onclick = () => {
      GAME.speed = GAME.speed === 1 ? 2 : 1;
      $('btn-speed').textContent = GAME.speed + '×';
      AUDIO.sfx.click();
    };
    const cleared = SAVE.clearedCount();
    $('btn-start').textContent = cleared ? '▶ CONTINUE — OP ' + SAVE.state.furthest : 'DEPLOY';
    $('title-best').textContent = cleared ? cleared + '/' + CONFIG.LEVELS.length + ' OPERATIONS SECURED' : '';
  }
  function syncMuteLabel() { $('btn-mute').textContent = 'SOUND: ' + (SAVE.state.muted ? 'OFF' : 'ON'); }

  return { init, onTap, updateHUD, onPhase, banner, toast, hurt, showEnd, clearSel, openLevels };
})();
