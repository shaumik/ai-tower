/* NEURAL SIEGE — DOM UI: screens, HUD, sheets, input */
'use strict';
const UI = (function () {
  const $ = UTIL.el;
  let curScreen = 'screen-menu';
  let selLevel = 1, selDiff = 'standard';
  let bannerTimer = null;
  let bossRef = null;

  // ================================================================ SCREENS
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
    curScreen = id;
    AUDIO.sfx.click();
  }

  function refreshMenu() {
    const st = SAVE.state;
    $('menu-stats').innerHTML =
      '◈ ' + st.cores + ' CORES &nbsp;·&nbsp; ★ ' + st.stats.starsTotal + '/150' +
      '<br>' + UTIL.fmt(st.stats.kills) + ' THREATS NEUTRALIZED' +
      '<br><span style="opacity:.55">v' + DATA.VERSION + '</span>';
  }

  // ================================================================ LEVEL SELECT
  let curSector = 0;
  function openLevels() {
    // jump to the sector containing the furthest unlocked level
    let furthest = 1;
    for (let i = 1; i <= 50; i++) if (SAVE.isUnlocked(i)) furthest = i;
    curSector = Math.min(4, Math.floor((furthest - 1) / 10));
    selLevel = furthest;
    buildSectorTabs();
    buildLevelGrid();
    $('levels-cores').textContent = '◈ ' + SAVE.state.cores;
    show('screen-levels');
  }

  function buildSectorTabs() {
    const wrap = $('sector-tabs');
    wrap.innerHTML = '';
    DATA.SECTORS.forEach((s, i) => {
      const unlocked = i === 0 || SAVE.isUnlocked(i * 10 + 1);
      const b = UTIL.h('button', 'stab' + (i === curSector ? ' active' : '') + (unlocked ? '' : ' locked'), s.tag + ' · ' + s.name);
      if (unlocked) b.onclick = () => { curSector = i; buildSectorTabs(); buildLevelGrid(); };
      wrap.appendChild(b);
    });
  }

  function buildLevelGrid() {
    const grid = $('level-grid');
    grid.innerHTML = '';
    const lo = curSector * 10 + 1, hi = lo + 9;
    let firstSelectable = null;
    for (let n = lo; n <= hi; n++) {
      const unlocked = SAVE.isUnlocked(n);
      const stars = SAVE.bestStars(n);
      const boss = !!DATA.BOSS_LEVELS[n];
      const node = UTIL.h('div', 'lvl-node' + (unlocked ? '' : ' locked') + (boss ? ' boss' : '') + (stars ? ' done' : ''));
      node.appendChild(UTIL.h('div', 'n', boss ? '☠' : String(n)));
      node.appendChild(UTIL.h('div', 'stars', stars ? '★'.repeat(stars) : (unlocked ? '·' : '🔒')));
      if (unlocked) {
        node.onclick = () => { selLevel = n; markSelected(); renderLevelDetail(); AUDIO.sfx.click(); };
        if (!firstSelectable) firstSelectable = n;
      }
      node.dataset.n = n;
      grid.appendChild(node);
    }
    if (selLevel < lo || selLevel > hi || !SAVE.isUnlocked(selLevel)) selLevel = firstSelectable || lo;
    markSelected();
    renderLevelDetail();
  }
  function markSelected() {
    document.querySelectorAll('.lvl-node').forEach(nd => {
      nd.classList.toggle('selected', Number(nd.dataset.n) === selLevel);
    });
  }

  function renderLevelDetail() {
    const box = $('level-detail');
    if (!SAVE.isUnlocked(selLevel)) { box.innerHTML = '<div class="ld-sub">LOCKED</div>'; return; }
    const lv = MAPS.level(selLevel);
    const wonStd = SAVE.isWon(selLevel, 'standard');
    const wonHard = SAVE.isWon(selLevel, 'hard');
    if (selDiff === 'hard' && !wonStd) selDiff = 'standard';
    if (selDiff === 'insane' && !wonHard) selDiff = 'standard';

    const newT = MAPS.newThreatsAt(selLevel).map(id => DATA.ENEMIES[id].name);
    const newTw = MAPS.newTowersAt(selLevel).map(id => DATA.TOWERS[id].name);
    let flags = '';
    if (DATA.BOSS_LEVELS[selLevel]) flags += '☠ BOSS: ' + DATA.ENEMIES[DATA.BOSS_LEVELS[selLevel]].name + '  ';
    if (newT.length) flags += '⚠ New threat: ' + newT.join(', ') + '  ';
    if (newTw.length) flags += '✚ Unlocks: ' + newTw.join(', ');

    box.innerHTML = '';
    box.appendChild(UTIL.h('div', 'ld-title', 'NODE ' + (selLevel < 10 ? '0' : '') + selLevel + ' — ' + lv.name));
    box.appendChild(UTIL.h('div', 'ld-sub', lv.waves + ' WAVES · ' + DATA.SECTORS[lv.sector].name +
      (SAVE.levelRec(selLevel).endlessBest ? ' · ENDLESS BEST: W' + SAVE.levelRec(selLevel).endlessBest : '')));
    box.appendChild(UTIL.h('div', 'ld-flags', flags));

    const diffRow = UTIL.h('div', 'ld-row');
    DATA.DIFFS.forEach(d => {
      const locked = (d.id === 'hard' && !wonStd) || (d.id === 'insane' && !wonHard);
      const stars = SAVE.starsFor(selLevel, d.id);
      const b = UTIL.h('button', 'diff-btn' + (selDiff === d.id ? ' active' : '') + (locked ? ' locked' : ''),
        d.name + '<br><span style="color:#ffd166">' + (stars ? '★'.repeat(stars) : '&nbsp;') + '</span>');
      if (!locked) b.onclick = () => { selDiff = d.id; renderLevelDetail(); AUDIO.sfx.click(); };
      diffRow.appendChild(b);
    });
    box.appendChild(diffRow);

    const row = UTIL.h('div', 'ld-row');
    row.style.marginTop = '8px';
    const start = UTIL.h('button', 'btn btn-primary', '▶ DEPLOY');
    start.onclick = () => { AUDIO.unlock(); GAME.start(selLevel, selDiff, false); };
    row.appendChild(start);
    if (SAVE.bestStars(selLevel) > 0) {
      const endless = UTIL.h('button', 'btn', '∞ ENDLESS');
      endless.onclick = () => { AUDIO.unlock(); GAME.start(selLevel, selDiff, true); };
      row.appendChild(endless);
    }
    box.appendChild(row);
  }

  // ================================================================ RESEARCH
  function openResearch() {
    renderResearch();
    show('screen-research');
  }
  function renderResearch() {
    $('research-cores').textContent = '◈ ' + SAVE.state.cores;
    const list = $('research-list');
    list.innerHTML = '';
    for (const def of DATA.RESEARCH) {
      const lvl = SAVE.researchLevel(def.id);
      const maxed = lvl >= def.max;
      const cost = maxed ? null : def.costs[lvl];
      const item = UTIL.h('div', 'res-item');
      item.appendChild(UTIL.h('div', 'res-ico', def.ico));
      const mid = UTIL.h('div', 'res-mid');
      mid.appendChild(UTIL.h('div', 'res-name', def.name));
      mid.appendChild(UTIL.h('div', 'res-desc', def.desc.replace('{v}', String(def.per * Math.max(1, lvl + (maxed ? 0 : 1)))) +
        (lvl > 0 ? ' <b style="color:#7fdcff">(now: ' + def.per * lvl + ')</b>' : '')));
      mid.appendChild(UTIL.h('div', 'res-pips', '●'.repeat(lvl) + '○'.repeat(def.max - lvl)));
      item.appendChild(mid);
      const buyWrap = UTIL.h('div', 'res-buy');
      const b = UTIL.h('button', 'btn' + (maxed ? '' : ' btn-primary'), maxed ? 'MAX' : '◈ ' + cost);
      b.disabled = maxed || SAVE.state.cores < cost;
      if (!maxed) b.onclick = () => {
        if (SAVE.buyResearch(def.id)) { AUDIO.sfx.upgrade(); renderResearch(); }
        else AUDIO.sfx.error();
      };
      buyWrap.appendChild(b);
      item.appendChild(buyWrap);
      list.appendChild(item);
    }
  }

  // ================================================================ CODEX
  let codexTab = 'threats';
  function openCodex() { renderCodex(); show('screen-codex'); }
  function renderCodex() {
    document.querySelectorAll('.ctab').forEach(t => t.classList.toggle('active', t.dataset.ctab === codexTab));
    const list = $('codex-list');
    list.innerHTML = '';
    if (codexTab === 'threats') {
      const ids = Object.keys(DATA.ENEMIES);
      for (const id of ids) {
        const e = DATA.ENEMIES[id];
        const seen = SAVE.state.seenEnemies[id];
        const item = UTIL.h('div', 'cdx-item' + (seen ? '' : ' locked'));
        const sp = UTIL.h('div', 'cdx-sprite');
        const cv = document.createElement('canvas');
        cv.width = cv.height = 88;
        if (seen) RENDER.paintEnemyIcon(cv, id);
        sp.appendChild(cv);
        item.appendChild(sp);
        const mid = UTIL.h('div');
        mid.appendChild(UTIL.h('div', 'cdx-name', seen ? e.name : '???'));
        const tags = [];
        const tr = e.traits || {};
        if (tr.boss) tags.push('BOSS');
        if (tr.flying) tags.push('AIRBORNE');
        if (tr.stealth) tags.push('STEALTH');
        if (tr.armor) tags.push('ARMORED');
        if (tr.shield) tags.push('SHIELDED');
        if (tr.regen) tags.push('REGEN');
        if (tr.slowImmune) tags.push('SLOW-IMMUNE');
        if (tr.split || tr.spawnOnDeath) tags.push('SPAWNER');
        if (tr.teleport) tags.push('BLINKS');
        if (tr.aura) tags.push('BUFFER');
        mid.appendChild(UTIL.h('div', 'cdx-tags', seen ? tags.join(' · ') : 'ENCOUNTER TO DECRYPT'));
        mid.appendChild(UTIL.h('div', 'cdx-desc', seen ? e.lore : 'No data. Encounter this entity in the field.'));
        if (seen) mid.appendChild(UTIL.h('div', 'cdx-stats',
          'HP ' + e.hp + ' · SPEED ' + e.speed + ' · BOUNTY ' + e.bounty + ' · CORE DMG ' + e.dmg));
        item.appendChild(mid);
        list.appendChild(item);
      }
    } else {
      for (const id of DATA.TOWER_ORDER) {
        const t = DATA.TOWERS[id];
        const item = UTIL.h('div', 'cdx-item');
        const sp = UTIL.h('div', 'cdx-sprite');
        const cv = document.createElement('canvas');
        cv.width = cv.height = 88;
        RENDER.paintTowerIcon(cv, id, 0);
        sp.appendChild(cv);
        item.appendChild(sp);
        const mid = UTIL.h('div');
        mid.appendChild(UTIL.h('div', 'cdx-name', t.name));
        mid.appendChild(UTIL.h('div', 'cdx-tags', 'UNLOCKS AT NODE ' + t.unlock + (t.air ? ' · TARGETS AIR' : ' · GROUND ONLY')));
        mid.appendChild(UTIL.h('div', 'cdx-desc', t.desc));
        const l0 = t.levels[0];
        mid.appendChild(UTIL.h('div', 'cdx-stats', 'COST ' + l0.cost +
          (l0.dmg ? ' · DMG ' + l0.dmg : '') + (l0.rate ? ' · RATE ' + l0.rate + '/s' : '') + ' · RANGE ' + l0.range));
        item.appendChild(mid);
        list.appendChild(item);
      }
    }
  }

  // ================================================================ ACHIEVEMENTS
  function openAch() {
    const list = $('ach-list');
    list.innerHTML = '';
    let got = 0;
    for (const a of DATA.ACHIEVEMENTS) {
      const done = !!SAVE.state.achievements[a.id];
      if (done) got++;
      const cur = Math.min(SAVE.state.stats[a.stat] || 0, a.goal);
      const item = UTIL.h('div', 'cdx-item' + (done ? '' : ' locked'));
      item.appendChild(UTIL.h('div', 'res-ico', done ? '🏆' : '○'));
      const mid = UTIL.h('div');
      mid.appendChild(UTIL.h('div', 'cdx-name', a.name));
      mid.appendChild(UTIL.h('div', 'cdx-desc', a.desc));
      mid.appendChild(UTIL.h('div', 'cdx-stats', done ? 'COMPLETE' : UTIL.fmt(cur) + ' / ' + UTIL.fmt(a.goal)));
      item.appendChild(mid);
      list.appendChild(item);
    }
    $('ach-count').textContent = got + '/' + DATA.ACHIEVEMENTS.length;
    show('screen-achievements');
  }

  // ================================================================ SETTINGS
  function openSettings() {
    const list = $('settings-list');
    list.innerHTML = '';
    const rows = [
      ['sfx', 'Sound Effects', 'Weapon fire, explosions, UI'],
      ['music', 'Ambient Music', 'Generative synth score'],
      ['shake', 'Screen Shake', 'Impact feedback'],
      ['autostart', 'Auto-Start Waves', 'Next wave begins 3s after deploy phase starts'],
      ['autocast', 'Auto-Cast Abilities', 'AI fires Orbital Strike / Surge / Patch for you (full AFK mode)'],
    ];
    for (const [key, label, sub] of rows) {
      const row = UTIL.h('div', 'set-row');
      const left = UTIL.h('div');
      left.appendChild(UTIL.h('div', 'set-label', label));
      left.appendChild(UTIL.h('div', 'set-sub', sub));
      row.appendChild(left);
      const tg = UTIL.h('div', 'toggle' + (SAVE.state.settings[key] ? ' on' : ''));
      tg.onclick = () => {
        SAVE.state.settings[key] = !SAVE.state.settings[key];
        SAVE.persist();
        tg.classList.toggle('on', SAVE.state.settings[key]);
        AUDIO.applySettings();
        AUDIO.sfx.click();
      };
      row.appendChild(tg);
      list.appendChild(row);
    }
    $('version-label').textContent = DATA.VERSION;
    show('screen-settings');
  }

  // ================================================================ GAME HUD
  function enterGame() {
    show('screen-game');
    buildBuildBar();
    buildAbilityBar();
    closeSheets();
    $('pause-overlay').classList.remove('show');
    $('end-overlay').classList.remove('show');
    $('chip-overlay').classList.remove('show');
    bossBar(null);
  }

  function updateHUD() {
    const g = GAME;
    if (!g.active) return;
    $('hud-lives-v').textContent = g.lives;
    $('hud-cash-v').textContent = UTIL.fmt(g.cash);
    const wl = g.endless && g.wave > g.totalWaves ? 'W' + g.wave + ' ∞' : g.wave + '/' + g.totalWaves;
    $('hud-wave-v').textContent = wl;
    $('btn-speed').textContent = g.speed + '×';
    const sw = $('btn-start-wave');
    if (g.phase === 'build') {
      sw.classList.remove('hidden');
      const prev = WAVES.preview(g.levelN, g.wave, g.totalWaves, g.diff);
      const rush = g.rushT > 0 && g.rushBase > 0 ? Math.ceil(g.rushBase * (g.rushT / 22)) : 0;
      const evTag = prev.event ? ' <span style="color:#ffd166">' + DATA.EVENTS[prev.event].ico + ' ' + DATA.EVENTS[prev.event].name + '</span>' : '';
      sw.innerHTML = '▶ START WAVE ' + g.wave +
        (rush > 0 ? ' <span style="color:#ffd166">+¤' + rush + '</span>' : '') + evTag +
        '<br><span style="font-size:10px;font-weight:400;opacity:.75">' +
        prev.list.slice(0, 3).map(p => p.count + '× ' + DATA.ENEMIES[p.type].name).join(', ') +
        (prev.list.length > 3 ? ' +' : '') +
        (prev.event ? ' · ' + DATA.EVENTS[prev.event].desc : '') + '</span>';
    } else {
      sw.classList.add('hidden');
    }
    refreshBuildBarState();
    refreshPlaceActions();
    refreshAbilities();
  }

  // ================================================================ ABILITIES
  function buildAbilityBar() {
    const wrap = $('ability-btns');
    wrap.innerHTML = '';
    const unlocked = Object.keys(DATA.ABILITIES).filter(k => GAME.levelN >= DATA.ABILITIES[k].unlock);
    $('ability-bar').classList.toggle('show', unlocked.length > 0);
    for (const key of unlocked) {
      const a = DATA.ABILITIES[key];
      const b = UTIL.h('button', 'ab-btn', a.ico + '<span class="ab-cost">' + GAME.abilityCost(key) + '</span>');
      b.dataset.ab = key;
      b.title = a.name + ' — ' + a.desc;
      b.onclick = () => { AUDIO.unlock(); GAME.castAbility(key); };
      wrap.appendChild(b);
    }
    refreshAbilities();
  }

  function refreshAbilities() {
    const g = GAME;
    if (!g.active) return;
    $('energy-fill').style.height = Math.round(g.energy) + '%';
    document.querySelectorAll('.ab-btn').forEach(b => {
      const key = b.dataset.ab;
      const ready = g.abilityReady(key);
      b.disabled = !ready;
      b.classList.toggle('ready', ready);
      b.classList.toggle('armed', g.abilityTarget === 'strike' && key === 'strike');
    });
  }

  // ================================================================ CHIP PICKER
  function showChipPicker(choices) {
    if (!choices || !choices.length) return;
    const card = $('chip-card');
    card.innerHTML = '';
    card.appendChild(UTIL.h('h2', '', '◈ PROTOCOL CHIP'));
    card.appendChild(UTIL.h('div', 'chip-sub', 'Pick one boost for this deployment.'));
    for (const c of choices) {
      const b = UTIL.h('button', 'chip-opt',
        '<span class="ci">' + c.ico + '</span><span><span class="cn">' + c.name + '</span><br><span class="cd">' + c.desc + '</span></span>');
      b.onclick = () => {
        GAME.pickChip(c.id);
        $('chip-overlay').classList.remove('show');
        toast('CHIP INSTALLED: ' + c.name.toUpperCase(), 'warn');
        AUDIO.sfx.upgrade();
      };
      card.appendChild(b);
    }
    $('chip-overlay').classList.add('show');
  }

  function hurtFlash() {
    const elv = $('hud-lives');
    elv.classList.remove('hurt');
    void elv.offsetWidth;
    elv.classList.add('hurt');
  }

  function phaseBanner(text, threat) {
    const b = $('phase-banner');
    b.textContent = text;
    b.classList.toggle('threat', !!threat);
    b.classList.add('show');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.remove('show'), 2600);
  }

  function toast(msg, kind) {
    const zone = $('toast-zone');
    while (zone.children.length >= 3) zone.removeChild(zone.firstChild);
    const t = UTIL.h('div', 'toast' + (kind ? ' ' + kind : ''), msg);
    zone.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 2700);
  }

  function bossBar(e) {
    bossRef = e;
    $('boss-bar').classList.toggle('show', !!e);
    if (e) $('boss-bar-name').textContent = e.displayName || e.def.name;
  }
  setInterval(() => {
    if (bossRef && !bossRef.dead) {
      $('boss-bar-fill').style.width = Math.max(0, bossRef.hp / bossRef.maxHp * 100) + '%';
    } else if (bossRef) bossBar(null);
    // live tickers: combo, energy, rush countdown
    const g = GAME;
    if (!g.active) return;
    const ci = $('combo-ind');
    if (g.combo >= 5 && g.phase === 'combat') {
      ci.textContent = '×' + g.combo + ' COMBO';
      ci.classList.add('show');
      ci.style.transform = 'scale(' + Math.min(1.5, 1 + g.combo * 0.01) + ')';
    } else ci.classList.remove('show');
    if (g.phase === 'combat') refreshAbilities();
  }, 120);
  // rush bonus countdown on the start button (cheap, only during build)
  setInterval(() => {
    if (GAME.active && GAME.phase === 'build' && GAME.rushT > 0) updateHUD();
  }, 1000);

  function checkAchToasts() {
    const fresh = SAVE.checkAchievements();
    for (const a of fresh) toast('🏆 ' + a.name.toUpperCase(), 'warn');
  }

  // ================================================================ BUILD BAR
  function buildBuildBar() {
    const bar = $('build-bar');
    bar.innerHTML = '';
    const unlocked = MAPS.unlockedTowers(GAME.levelN);
    for (const id of unlocked) {
      const t = DATA.TOWERS[id];
      const item = UTIL.h('div', 'bb-item');
      item.dataset.type = id;
      const cv = document.createElement('canvas');
      cv.width = cv.height = 72;
      RENDER.paintTowerIcon(cv, id, 0);
      item.appendChild(cv);
      item.appendChild(UTIL.h('div', 'bb-cost', '¤' + GAME.towerCost(id)));
      item.appendChild(UTIL.h('div', 'bb-name', t.name));
      item.onclick = () => {
        if (GAME.phase !== 'build') { toast('DEPLOY ONLY BETWEEN WAVES', 'warn'); AUDIO.sfx.error(); return; }
        if (GAME.placingType === id) { cancelPlacement(); }
        else { GAME.placingType = id; GAME.placeCell = null; GAME.selectedTower = null; closeSheets(); renderPlaceInfo(id); refreshPlaceActions(); }
        refreshBuildBarState();
        AUDIO.sfx.click();
      };
      bar.appendChild(item);
    }
    refreshBuildBarState();
  }

  function refreshBuildBarState() {
    const g = GAME;
    document.querySelectorAll('.bb-item').forEach(item => {
      const id = item.dataset.type;
      item.classList.toggle('selected', g.placingType === id);
      item.classList.toggle('poor', g.cash < g.towerCost(id));
      item.classList.toggle('disabled', g.phase !== 'build');
    });
  }

  // Compact info inside the single placement bar (no sheet during placement)
  function renderPlaceInfo(id) {
    const t = DATA.TOWERS[id];
    const l0 = t.levels[0];
    const box = $('place-info');
    box.innerHTML = '';
    const cv = document.createElement('canvas'); cv.width = cv.height = 72;
    RENDER.paintTowerIcon(cv, id, 0);
    box.appendChild(cv);
    const mid = UTIL.h('div');
    mid.appendChild(UTIL.h('div', 'pi-name', t.name + ' — ¤' + GAME.towerCost(id)));
    const bits = [];
    if (l0.dmg) bits.push('DMG ' + l0.dmg);
    if (l0.rate) bits.push(Math.round(l0.rate * 100) / 100 + '/s');
    bits.push('RNG ' + l0.range);
    if (l0.slow) bits.push('SLOW ' + Math.round(l0.slow * 100) + '%');
    if (l0.splash) bits.push('SPLASH ' + l0.splash);
    if (l0.chains) bits.push('CHAIN ×' + l0.chains);
    if (l0.income) bits.push('+¤' + l0.income + '/wave');
    if (l0.buffDmg) bits.push('+' + Math.round(l0.buffDmg * 100) + '% DMG aura');
    bits.push(t.air ? 'hits air' : 'ground only');
    mid.appendChild(UTIL.h('div', 'pi-stats', bits.join(' · ')));
    box.appendChild(mid);
  }

  function statChips(lv) {
    const bits = [];
    if (lv.dmg) bits.push('DMG <b>' + Math.round(lv.dmg) + '</b>');
    if (lv.rate) bits.push('RATE <b>' + (Math.round(lv.rate * 100) / 100) + '/s</b>');
    bits.push('RANGE <b>' + lv.range + '</b>');
    if (lv.slow) bits.push('SLOW <b>' + Math.round(lv.slow * 100) + '%</b>');
    if (lv.splash) bits.push('SPLASH <b>' + lv.splash + '</b>');
    if (lv.chains) bits.push('CHAINS <b>' + lv.chains + '</b>');
    if (lv.stun) bits.push('STUN <b>' + lv.stun + 's</b>');
    if (lv.income) bits.push('INCOME <b>¤' + lv.income + '/wave</b>');
    if (lv.buffDmg) bits.push('BUFF <b>+' + Math.round(lv.buffDmg * 100) + '% DMG</b>');
    if (lv.buffRate) bits.push('BUFF <b>+' + Math.round(lv.buffRate * 100) + '% RATE</b>');
    return bits.map(b => '<span>' + b + '</span>').join('');
  }

  // ================================================================ TOWER PANEL
  const MODES = ['first', 'last', 'strong', 'close'];
  function openTowerPanel(tw) {
    GAME.selectedTower = tw;
    GAME.placingType = null; GAME.placeCell = null;
    refreshBuildBarState();
    renderTowerPanel();
    $('build-panel').classList.remove('open');
    $('tower-panel').classList.add('open');
  }

  function renderTowerPanel() {
    const tw = GAME.selectedTower;
    if (!tw) return;
    const body = $('tower-panel-body');
    body.innerHTML = '';
    const head = UTIL.h('div', 'tp-head');
    const cv = document.createElement('canvas'); cv.width = cv.height = 92;
    RENDER.paintTowerIcon(cv, tw.type, tw.tier, tw.branch);
    head.appendChild(cv);
    const hd = UTIL.h('div');
    const branchName = (tw.tier === 3 && tw.branch !== null && DATA.BRANCHES[tw.type])
      ? DATA.BRANCHES[tw.type][tw.branch].name : null;
    hd.appendChild(UTIL.h('div', 'tp-title', branchName || tw.def.name));
    hd.appendChild(UTIL.h('div', 'tp-tier', 'TIER ' + UTIL.ROMAN[tw.tier] + (branchName ? ' ★' : '') + ' · ' + tw.kills + ' KILLS'));
    head.appendChild(hd);
    body.appendChild(head);
    const x = UTIL.h('button', 'sheet-close', '✕');
    x.onclick = closeSheets;
    body.appendChild(x);
    body.appendChild(UTIL.h('div', 'tp-stats', statChips(tw.def.levels[tw.tier])));

    const upCost = tw.upgradeCost();
    const isBranchPoint = tw.tier === 2 && DATA.BRANCHES[tw.type];

    if (tw.tier < 3 && !isBranchPoint) {
      const nxt = tw.def.levels[tw.tier + 1];
      body.appendChild(UTIL.h('div', 'tp-upnext', '⬆ TIER ' + UTIL.ROMAN[tw.tier + 1] + ': ' + statChips(nxt)));
    }

    // final upgrade forks: choose a specialization
    if (isBranchPoint) {
      body.appendChild(UTIL.h('div', 'tp-upnext', '⬆ TIER IV — choose a specialization (¤' + upCost + '):'));
      const brow = UTIL.h('div', 'branch-row');
      DATA.BRANCHES[tw.type].forEach((br, idx) => {
        const b = UTIL.h('button', 'branch-btn',
          '<div class="bn">' + br.ico + ' ' + br.name.toUpperCase() + '</div><div class="bd">' + br.desc + '</div>');
        b.disabled = GAME.cash < upCost || GAME.phase !== 'build';
        b.onclick = () => { if (GAME.upgradeTower(tw, idx)) renderTowerPanel(); };
        brow.appendChild(b);
      });
      body.appendChild(brow);
    }

    const row = UTIL.h('div', 'tp-actions');
    if (!isBranchPoint) {
      const up = UTIL.h('button', 'btn btn-primary', upCost === null ? 'MAX TIER' : '⬆ UPGRADE ¤' + upCost);
      up.disabled = upCost === null || GAME.cash < upCost || GAME.phase !== 'build';
      up.onclick = () => { if (GAME.upgradeTower(tw)) renderTowerPanel(); };
      row.appendChild(up);
    }

    if (tw.def.kind !== 'income' && tw.def.kind !== 'buffaura' && tw.def.kind !== 'slowaura' && tw.def.kind !== 'field' && tw.def.kind !== 'emp') {
      const tgt = UTIL.h('button', 'btn', '◎ ' + tw.targetMode.toUpperCase());
      tgt.onclick = () => {
        tw.targetMode = MODES[(MODES.indexOf(tw.targetMode) + 1) % MODES.length];
        tgt.textContent = '◎ ' + tw.targetMode.toUpperCase();
        AUDIO.sfx.click();
      };
      row.appendChild(tgt);
    }

    const refund = tw.fresh ? tw.invested : tw.sellValue();
    const sell = UTIL.h('button', 'btn btn-danger', tw.fresh ? '↩ UNDO ¤' + refund : '✕ SELL ¤' + refund);
    sell.disabled = GAME.phase !== 'build';
    sell.onclick = () => { if (GAME.sellTower(tw)) closeSheets(); };
    row.appendChild(sell);
    if (tw.fresh) {
      body.appendChild(UTIL.h('div', 'tp-upnext', 'Fresh deployment — UNDO refunds the full ¤' + refund + ' until the wave starts.'));
    }
    body.appendChild(row);
    if (GAME.phase !== 'build') {
      body.appendChild(UTIL.h('div', 'tp-upnext', '⏳ Wave in progress — modifications locked until deploy phase.'));
    }
  }

  function closeSheets() {
    $('tower-panel').classList.remove('open');
    $('build-panel').classList.remove('open');
    if (GAME.selectedTower) GAME.selectedTower = null;
    if (!GAME.placingType) $('place-actions').classList.remove('show');
  }

  // ================================================================ END / PAUSE
  function showEnd(won, stars, cores) {
    const card = $('end-card');
    card.innerHTML = '';
    card.appendChild(UTIL.h('h2', won ? 'win' : 'lose', won ? 'NODE SECURED' : 'CORE BREACHED'));
    if (won) {
      const gr = GAME.grade || 'B';
      const gcol = { S: '#ffd166', A: '#7fdcff', B: '#9fd4ff', C: '#7fa8c9' }[gr];
      card.appendChild(UTIL.h('div', '', '<span style="font-size:44px;font-weight:900;color:' + gcol +
        ';text-shadow:0 0 20px ' + gcol + '">' + gr + '</span>' +
        (gr === 'S' ? ' <span style="font-size:11px;color:#ffd166">FLAWLESS +30% ◈</span>' : '')));
      card.appendChild(UTIL.h('div', 'end-stars', '★'.repeat(stars) + '<span style="opacity:.25">' + '★'.repeat(3 - stars) + '</span>'));
      card.appendChild(UTIL.h('div', 'end-line',
        'Integrity ' + GAME.lives + '/' + GAME.maxLives + ' · ' + GAME.stats.kills + ' kills · best combo ×' + (GAME.bestCombo || 0) +
        '<br>' + (GAME.perfectWaves || 0) + ' perfect waves · DATA CORES: <b>+' + cores + ' ◈</b>'));
    } else {
      card.appendChild(UTIL.h('div', 'end-line',
        'Survived to wave ' + GAME.wave + ' of ' + GAME.totalWaves +
        '<br>' + GAME.stats.kills + ' threats neutralized.'));
    }
    // rewarded ad: bonus cores on victory / second wind on defeat (portal builds only)
    if (ADS.available()) {
      if (won) {
        const bonus = Math.max(1, Math.ceil(cores * 0.5));
        const adB = UTIL.h('button', 'btn btn-primary', '▶ WATCH AD: +' + bonus + ' ◈ BONUS');
        adB.onclick = () => {
          adB.disabled = true;
          ADS.showRewarded(ok => {
            if (ok) {
              SAVE.state.cores += bonus; SAVE.persist();
              adB.textContent = '✓ +' + bonus + ' ◈ CLAIMED';
              toast('+' + bonus + ' ◈ DATA CORES', 'warn');
              AUDIO.sfx.cash();
            } else { adB.textContent = 'AD UNAVAILABLE'; }
          });
        };
        card.appendChild(adB);
      } else if (!GAME.revived) {
        const adB = UTIL.h('button', 'btn btn-primary', '▶ WATCH AD: ⚡ SECOND WIND (+5 ⬢)');
        adB.onclick = () => {
          adB.disabled = true;
          ADS.showRewarded(ok => {
            if (ok && GAME.revive()) { $('end-overlay').classList.remove('show'); }
            else { adB.textContent = 'AD UNAVAILABLE'; }
          });
        };
        card.appendChild(adB);
      }
    }

    if (won) {
      if (!GAME.endless) {
        const cont = UTIL.h('button', 'btn', '∞ CONTINUE ENDLESS');
        cont.onclick = () => {
          $('end-overlay').classList.remove('show');
          GAME.endless = true;
          GAME.phase = 'build';
          phaseBanner('OVERTIME — THREATS COMPOUND. NO RETREAT.', true);
          updateHUD();
        };
        card.appendChild(cont);
      }
      if (GAME.levelN < 50 && !GAME.endless) {
        const nxt = UTIL.h('button', 'btn btn-primary', '▶ NEXT NODE');
        nxt.onclick = () => {
          $('end-overlay').classList.remove('show');
          ADS.interstitial(() => GAME.start(GAME.levelN + 1, GAME.diff, false));
        };
        card.appendChild(nxt);
      }
    } else {
      const rty = UTIL.h('button', 'btn btn-primary', '↻ RETRY NODE');
      rty.onclick = () => {
        $('end-overlay').classList.remove('show');
        ADS.interstitial(() => GAME.start(GAME.levelN, GAME.diff, GAME.endless));
      };
      card.appendChild(rty);
    }
    const back = UTIL.h('button', 'btn', 'NODE SELECT');
    back.onclick = () => { $('end-overlay').classList.remove('show'); GAME.quit(); refreshMenu(); openLevels(); };
    card.appendChild(back);
    $('end-overlay').classList.add('show');
  }

  function togglePause(on) {
    GAME.paused = on;
    $('pause-overlay').classList.toggle('show', on);
    if (on) { renderPauseToggles(); ADS.gameplayStop(); }
    else if (GAME.phase === 'combat') ADS.gameplayStart();
  }
  function renderPauseToggles() {
    const box = $('pause-toggles');
    box.innerHTML = '';
    [['sfx', '♪ SFX'], ['music', '♫ MUSIC'], ['shake', '✷ SHAKE']].forEach(([k, label]) => {
      const s = UTIL.h('span', SAVE.state.settings[k] ? '' : 'off', label);
      s.onclick = () => {
        SAVE.state.settings[k] = !SAVE.state.settings[k];
        SAVE.persist(); AUDIO.applySettings();
        s.classList.toggle('off', !SAVE.state.settings[k]);
      };
      box.appendChild(s);
    });
  }

  // ================================================================ CANVAS INPUT
  // Touch flow: tap/drag positions the ghost, big ✓ DEPLOY button confirms.
  // Mouse flow: hover previews, click places instantly.
  function refreshPlaceActions() {
    const g = GAME;
    const box = $('place-actions');
    const active = !!(g.active && g.placingType && g.placeCell && g.phase === 'build');
    box.classList.toggle('show', !!(g.active && g.placingType && g.phase === 'build'));
    if (!g.placingType) return;
    // dodge the card away from the tile being placed
    if (g.placeCell) {
      const p = RENDER.cellToScreen(g.placeCell.x, g.placeCell.y);
      box.classList.toggle('top', p.y > window.innerHeight * 0.52);
    } else {
      box.classList.remove('top');
    }
    const ok = $('btn-place-ok');
    const cost = g.towerCost(g.placingType);
    const valid = active && g.cellFree(g.placeCell.x, g.placeCell.y) && g.cash >= cost;
    ok.disabled = !valid;
    ok.textContent = g.placeCell
      ? (valid ? '✓ DEPLOY  ¤' + cost : (g.placeCell && !g.cellFree(g.placeCell.x, g.placeCell.y) ? 'BLOCKED TILE' : 'NEED ¤' + cost))
      : 'TAP THE GRID…';
  }

  function cancelPlacement() {
    GAME.placingType = null;
    GAME.placeCell = null;
    closeSheets();
    refreshBuildBarState();
    refreshPlaceActions();
  }

  let undoHintShown = false;
  function confirmPlacement() {
    const g = GAME;
    if (!g.placingType || !g.placeCell) return;
    if (g.placeTower(g.placingType, g.placeCell.x, g.placeCell.y)) {
      g.placeCell = null;
      if (!undoHintShown) {
        undoHintShown = true;
        toast('DEPLOYED — misplaced? Tap it → UNDO for a full refund', 'warn');
      }
      // keep placing while affordable for rapid multi-build
      if (g.cash < g.towerCost(g.placingType)) cancelPlacement();
      else { refreshBuildBarState(); refreshPlaceActions(); }
    }
  }

  function bindCanvas(canvas) {
    let dragging = false;
    const updateGhost = ev => {
      const c = RENDER.screenToCell(ev.clientX, ev.clientY);
      const g = GAME;
      if (c.x >= 0 && c.y >= 0 && c.x < g.level.cols && c.y < g.level.rows) {
        g.placeCell = c;
        refreshPlaceActions();
      }
    };
    canvas.addEventListener('pointermove', ev => {
      if (!GAME.active || !GAME.placingType) return;
      if (ev.pointerType === 'mouse' || dragging) updateGhost(ev);
    });
    canvas.addEventListener('pointerup', () => { dragging = false; });
    canvas.addEventListener('pointercancel', () => { dragging = false; });
    canvas.addEventListener('pointerdown', ev => {
      if (!GAME.active) return;
      AUDIO.unlock();
      const cell = RENDER.screenToCell(ev.clientX, ev.clientY);
      const g = GAME;

      // orbital strike targeting takes priority over everything
      if (g.abilityTarget === 'strike') {
        const w = RENDER.screenToWorld(ev.clientX, ev.clientY);
        g.doStrike(w.x, w.y);
        return;
      }

      if (g.placingType) {
        const inGrid = cell.x >= 0 && cell.y >= 0 && cell.x < g.level.cols && cell.y < g.level.rows;
        if (!inGrid) { cancelPlacement(); return; }
        if (ev.pointerType === 'mouse') {
          // desktop: click places directly at the hovered cell
          g.placeCell = cell;
          confirmPlacement();
        } else {
          // tapping the already-ghosted tile again also confirms (fallback to the ✓ button)
          if (g.placeCell && g.placeCell.x === cell.x && g.placeCell.y === cell.y && g.cellFree(cell.x, cell.y)) {
            confirmPlacement();
            return;
          }
          dragging = true;
          g.placeCell = cell;
          refreshPlaceActions();
          AUDIO.sfx.click();
        }
        return;
      }

      const tw = g.towerAt(cell.x, cell.y);
      if (tw) {
        if (g.selectedTower === tw) { closeSheets(); }       // tap again = deselect
        else { openTowerPanel(tw); AUDIO.sfx.click(); }
      } else {
        closeSheets();
      }
    });
  }

  // ================================================================ WIRING
  function init() {
    $('btn-play').onclick = () => { AUDIO.unlock(); openLevels(); };
    $('btn-research').onclick = () => { AUDIO.unlock(); openResearch(); };
    $('btn-codex').onclick = () => { AUDIO.unlock(); openCodex(); };
    $('btn-achievements').onclick = () => { AUDIO.unlock(); openAch(); };
    $('btn-settings').onclick = () => { AUDIO.unlock(); openSettings(); };
    document.querySelectorAll('.btn-back').forEach(b => {
      b.onclick = () => { refreshMenu(); show(b.dataset.back); };
    });
    document.querySelectorAll('.ctab').forEach(t => {
      t.onclick = () => { codexTab = t.dataset.ctab; renderCodex(); };
    });

    // force update: nuke SW + caches, reload fresh (save data untouched)
    const upBtn = UTIL.h('button', 'btn', '⟳ CHECK FOR UPDATES');
    upBtn.onclick = async () => {
      upBtn.textContent = 'UPDATING…';
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const r of regs) await r.unregister();
        }
        if (window.caches) {
          const keys = await caches.keys();
          for (const k of keys) await caches.delete(k);
        }
      } catch (e) {}
      location.replace(location.pathname + '?u=' + Math.floor(performance.now()));
    };
    document.querySelector('#screen-settings .settings-danger').insertBefore(upBtn, $('btn-wipe'));

    // wipe with confirm
    let wipeArmed = false;
    $('btn-wipe').onclick = () => {
      if (!wipeArmed) { wipeArmed = true; $('btn-wipe').textContent = 'TAP AGAIN TO CONFIRM WIPE'; setTimeout(() => { wipeArmed = false; $('btn-wipe').textContent = 'WIPE SAVE DATA'; }, 2500); return; }
      SAVE.wipe(); refreshMenu(); show('screen-menu');
    };

    // game controls
    $('btn-place-ok').onclick = () => { AUDIO.unlock(); confirmPlacement(); };
    $('btn-place-cancel').onclick = () => { cancelPlacement(); AUDIO.sfx.click(); };
    $('btn-start-wave').onclick = () => { AUDIO.unlock(); GAME.startWave(); };
    $('btn-speed').onclick = () => { $('btn-speed').textContent = GAME.cycleSpeed() + '×'; AUDIO.sfx.click(); };
    $('btn-pause').onclick = () => togglePause(true);
    $('btn-resume').onclick = () => togglePause(false);
    $('btn-restart').onclick = () => { togglePause(false); GAME.start(GAME.levelN, GAME.diff, GAME.endless); };
    $('btn-quit').onclick = () => { togglePause(false); GAME.quit(); refreshMenu(); openLevels(); };

    bindCanvas(UTIL.el('game-canvas'));
    refreshMenu();

    window.addEventListener('resize', () => { if (GAME.active) RENDER.resize(GAME); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && GAME.active && GAME.phase === 'combat') togglePause(true);
    });
  }

  return {
    init, show, refreshMenu, openLevels,
    enterGame, updateHUD, phaseBanner, toast, bossBar, hurtFlash,
    closeSheets, showEnd, checkAchToasts,
    showChipPicker, refreshAbilities,
  };
})();
