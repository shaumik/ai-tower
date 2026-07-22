/* NEURAL SIEGE — Enemy / Tower / Projectile entities. All positions in tile units. */
'use strict';

// ==================================================================== ENEMY
class Enemy {
  constructor(g, type, hpMult, opts) {
    const def = DATA.ENEMIES[type];
    this.g = g;
    this.type = type;
    this.def = def;
    this.traits = def.traits || {};
    this.maxHp = Math.round(def.hp * hpMult);
    this.hp = this.maxHp;
    this.hpMult = hpMult;
    this.baseSpeed = def.speed;
    this.bounty = Math.max(1, Math.round(def.bounty * g.bountyMult));
    if (def.bounty === 0) this.bounty = 0;
    this.dmg = def.dmg;
    this.size = def.size * (opts && opts.elite ? 1.25 : 1);
    this.elite = !!(opts && opts.elite);
    this.flying = !!this.traits.flying;
    this.armor = this.traits.armor || 0; // flat: armor is a mechanic to counter, not a curve
    this.maxShield = this.traits.shield ? Math.round(this.traits.shield * hpMult) : 0;
    this.shield = this.maxShield;
    this.isBoss = !!this.traits.boss;

    // position: distance along path (ground) or 0..len line (flying)
    this.dist = (opts && opts.dist) || 0;
    this.wobble = Math.random() * Math.PI * 2;
    this.lane = (Math.random() - 0.5) * 0.34; // lateral offset so units don't stack
    if (this.isBoss) this.lane = 0;

    this.dead = false; this.leaked = false;
    this.stunT = 0; this.slowT = 0; this.slowPct = 0;
    this.dotDps = 0; this.dotT = 0;
    this.noHitT = 0;            // time since last damage (shield regen)
    this.revealT = 0;           // >0 = revealed
    this.phaseHidden = false;   // boss stealth phase
    this.auraSpeed = 0;         // botnet buff applied by game
    this.tpT = this.traits.teleport ? this.traits.teleport.every : 0;
    this.summonT = this.traits.summon ? this.traits.summon.every : 0;
    this.phaseT = this.traits.phaser ? this.traits.phaser.period : 0;
    this.enraged = false;
    this.anim = Math.random() * 10;

    if (this.flying) {
      const p = g.level.path;
      this.fx0 = p[0].x + 0.5; this.fy0 = -0.7;
      this.fx1 = p[p.length - 1].x + 0.5; this.fy1 = p[p.length - 1].y + 0.5;
      this.flyLen = UTIL.dist(this.fx0, this.fy0, this.fx1, this.fy1);
    }
    this.updatePos();
  }

  get stealthed() {
    return ((this.traits.stealth && this.revealT <= 0) || this.phaseHidden);
  }
  get totalLen() { return this.flying ? this.flyLen : this.g.pathLen; }

  updatePos() {
    if (this.flying) {
      const t = UTIL.clamp(this.dist / this.flyLen, 0, 1);
      this.x = UTIL.lerp(this.fx0, this.fx1, t) + Math.sin(this.anim * 3) * 0.12;
      this.y = UTIL.lerp(this.fy0, this.fy1, t);
      this.angle = Math.atan2(this.fy1 - this.fy0, this.fx1 - this.fx0);
      return;
    }
    const path = this.g.level.path;
    const d = UTIL.clamp(this.dist, 0, this.g.pathLen - 0.0001);
    const i = Math.min(path.length - 2, Math.floor(d));
    const f = d - i;
    const ax = path[i].x + 0.5, ay = path[i].y + 0.5;
    const bx = path[i + 1].x + 0.5, by = path[i + 1].y + 0.5;
    const dx = bx - ax, dy = by - ay;
    // lateral lane offset perpendicular to travel
    this.x = UTIL.lerp(ax, bx, f) + dy * this.lane;
    this.y = UTIL.lerp(ay, by, f) - dx * this.lane;
    this.angle = Math.atan2(dy, dx);
  }

  speedNow() {
    if (this.stunT > 0) return 0;
    let s = this.baseSpeed * (1 + this.auraSpeed);
    if (this.enraged) s *= 1.6;
    if (!this.traits.slowImmune && !this.flying) {
      let slow = this.slowT > 0 ? this.slowPct : 0;
      slow = Math.max(slow, this.g.auraSlowAt(this.x, this.y));
      if (this.isBoss) slow = Math.min(slow, 0.45);
      s *= (1 - slow);
    }
    return s;
  }

  update(dt) {
    const g = this.g;
    this.anim += dt;
    this.noHitT += dt;
    if (this.stunT > 0) this.stunT -= dt;
    if (this.slowT > 0) this.slowT -= dt;
    if (this.revealT > 0) this.revealT -= dt;

    // damage over time
    if (this.dotT > 0) {
      this.dotT -= dt;
      this.hurt(this.dotDps * dt, { silent: true, noArmor: true });
      if (this.dead) return;
    }
    // regen (innate + wave-event bonus)
    const regen = (this.traits.regen || 0) * this.hpMult + (this.regenBonus || 0);
    if (regen > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + regen * dt);
    }
    // shield recharge after 2.5s unhit
    if (this.maxShield && this.noHitT > 2.5 && this.shield < this.maxShield) {
      this.shield = Math.min(this.maxShield, this.shield + this.maxShield * 0.25 * dt);
    }
    // teleport
    if (this.traits.teleport && !this.flying) {
      this.tpT -= dt;
      if (this.tpT <= 0) {
        this.tpT = this.traits.teleport.every;
        this.dist = Math.min(this.dist + this.traits.teleport.dist, this.totalLen - 0.05);
        g.fxRing(this.x, this.y, 0.5, '#e1bee7');
      }
    }
    // boss summons
    if (this.traits.summon) {
      this.summonT -= dt;
      if (this.summonT <= 0) {
        this.summonT = this.traits.summon.every;
        for (let i = 0; i < this.traits.summon.count; i++) {
          g.spawnEnemy(this.traits.summon.type, this.hpMult * 0.6, { dist: Math.max(0, this.dist - 0.4 - i * 0.3) });
        }
        g.fxRing(this.x, this.y, 0.7, this.def.color);
      }
    }
    // boss stealth phasing
    if (this.traits.phaser) {
      this.phaseT -= dt;
      const dur = this.traits.phaser.dur;
      this.phaseHidden = this.phaseT < dur && this.revealT <= 0;
      if (this.phaseT <= 0) this.phaseT = this.traits.phaser.period;
    }
    // enrage
    if (this.traits.enrage && !this.enraged && this.hp / this.maxHp < this.traits.enrage) {
      this.enraged = true;
      g.toast(this.def.name + ' IS ENRAGED', 'warn');
    }

    this.dist += this.speedNow() * dt;
    if (this.dist >= this.totalLen) { this.leaked = true; this.dead = true; return; }
    this.updatePos();
  }

  // returns damage actually dealt
  hurt(amount, opts) {
    if (this.dead) return 0;
    opts = opts || {};
    this.noHitT = 0;
    let dmg = amount;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
      if (dmg <= 0) return absorbed;
    }
    if (this.armor && !opts.pierce && !opts.noArmor) {
      dmg = Math.max(amount * 0.1, dmg - this.armor);
    }
    this.hp -= dmg;
    if (this.hp <= 0) { this.dead = true; this.g.onEnemyKilled(this, opts.source); }
    return dmg;
  }

  applySlow(pct, dur) {
    if (this.traits.slowImmune || this.flying) return;
    if (pct >= this.slowPct || this.slowT <= 0) { this.slowPct = pct; this.slowT = dur; }
  }
  applyDot(dps, dur) {
    if (dps >= this.dotDps || this.dotT <= 0) { this.dotDps = dps; this.dotT = dur; }
  }
  applyStun(dur) {
    if (this.isBoss) { this.slowPct = Math.max(this.slowPct, 0.5); this.slowT = Math.max(this.slowT, dur); return; }
    this.stunT = Math.max(this.stunT, dur);
  }
}

// ==================================================================== TOWER
class Tower {
  constructor(g, type, gx, gy) {
    this.g = g;
    this.type = type;
    this.def = DATA.TOWERS[type];
    this.gx = gx; this.gy = gy;
    this.x = gx + 0.5; this.y = gy + 0.5;
    this.tier = 0;
    this.branch = null;                    // tier-IV specialization index (0/1)
    this.invested = 0;
    this.cool = 0;
    this.aim = -Math.PI / 2;
    this.targetMode = 'first';
    this.buffDmg = 0; this.buffRate = 0;   // from overclockers, recomputed on tower changes
    this.beamTarget = null; this.beamRamp = 1;
    this.anim = Math.random() * 10;
    this.kills = 0;
    this.flashT = 0; this.recoil = 0;      // muzzle flash / recoil juice
    this.disabledT = 0;                    // blackout event
  }

  stats() {
    const lv = this.def.levels[this.tier];
    const g = this.g;
    let dmg = lv.dmg, rate = lv.rate, range = lv.range;
    let slow = lv.slow || 0, splash = lv.splash || 0, chains = lv.chains || 0;
    let stun = lv.stun || 0, income = lv.income || 0;
    let buffDmgOut = lv.buffDmg || 0, buffRateOut = lv.buffRate || 0;
    let rampMax = 2.5, pierce = !!this.def.pierce, burn = false, interest = 0;

    if (this.tier === 3 && this.branch !== null && DATA.BRANCHES[this.type]) {
      const m = DATA.BRANCHES[this.type][this.branch].mods;
      if (m.dmg) dmg *= m.dmg;
      if (m.rate) rate *= m.rate;
      if (m.range) range *= m.range;
      if (m.splash) splash *= m.splash;
      if (m.income) income = Math.round(income * m.income);
      if (m.slowAdd) slow += m.slowAdd;
      if (m.chainsAdd) chains += m.chainsAdd;
      if (m.stunAdd) stun += m.stunAdd;
      if (m.buffDmgAdd) buffDmgOut += m.buffDmgAdd;
      if (m.buffRateAdd) buffRateOut += m.buffRateAdd;
      if (m.rampMax) rampMax = m.rampMax;
      if (m.pierce) pierce = true;
      if (m.burn) burn = true;
      if (m.interest) interest = m.interest;
    }
    // protocol chips
    if (g.chipHas) {
      if (g.chipHas('ap_rounds') && (this.type === 'sentry' || this.type === 'scanner')) dmg *= 1.3;
      if (g.chipHas('storm_coil') && chains) chains += 2;
      if (g.chipHas('cryo') && slow) slow += 0.12;
      if (g.chipHas('longshot') && this.type === 'sniper') range += 1.5;
      if (g.chipHas('harvest')) income = Math.round(income * 1.4);
      if (g.chipHas('napalm') && this.type === 'mortar') burn = true;
    }
    const surge = g.surgeT > 0;
    const fw = 1 + SAVE.researchValue('firmware') / 100 + this.buffDmg + (surge ? 0.8 : 0);
    let rr = 1 + SAVE.researchValue('overclockr') / 100 + this.buffRate + (surge ? 0.3 : 0);
    if (g.chipHas && g.chipHas('overvolt')) rr += 0.10;
    return {
      dmg: dmg * fw, rate: rate * rr, range,
      slow: Math.min(0.8, slow), splash, chains, stun, income,
      rampMax, pierce, burn, interest,
      buffDmg: buffDmgOut, buffRate: buffRateOut,
    };
  }

  // roll a crit for one shot: returns {dmg, crit}
  rollHit(baseDmg) {
    const chance = 0.08 + (this.g.chipHas && this.g.chipHas('deadeye') ? 0.12 : 0);
    if (Math.random() < chance) return { dmg: baseDmg * 2.2, crit: true };
    return { dmg: baseDmg, crit: false };
  }

  fireJuice() { this.flashT = 0.07; this.recoil = 1; }

  inRange(e, range) {
    return UTIL.dist2(this.x, this.y, e.x, e.y) <= (range + e.size) * (range + e.size);
  }
  canTarget(e) {
    if (e.dead || e.stealthed) return false;
    if (e.flying && !this.def.air) return false;
    if (e.y < -0.2) return false;
    return true;
  }

  pickTarget(range) {
    const g = this.g;
    let best = null, bestV = -Infinity;
    for (const e of g.enemies) {
      if (!this.canTarget(e) || !this.inRange(e, range)) continue;
      let v;
      switch (this.targetMode) {
        case 'last':   v = -(e.dist / e.totalLen); break;
        case 'strong': v = e.hp; break;
        case 'close':  v = -UTIL.dist2(this.x, this.y, e.x, e.y); break;
        default:       v = e.dist / e.totalLen + (e.isBoss ? 10 : 0); break; // first
      }
      if (v > bestV) { bestV = v; best = e; }
    }
    return best;
  }

  update(dt) {
    const g = this.g;
    this.anim += dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.recoil > 0) this.recoil *= Math.pow(0.0001, dt); // fast decay
    if (this.disabledT > 0) { this.disabledT -= dt; return; } // blackout event
    const s = this.stats();
    this.cool -= dt;

    switch (this.def.kind) {
      case 'bullet': {
        if (this.cool > 0) break;
        const t = this.pickTarget(s.range);
        if (!t) break;
        this.aim = Math.atan2(t.y - this.y, t.x - this.x);
        this.cool = 1 / s.rate;
        const h = this.rollHit(s.dmg);
        g.projectiles.push(new Projectile(g, this, t, { dmg: h.dmg, crit: h.crit, pierce: s.pierce, speed: 11, color: this.def.color, kind: 'bullet' }));
        this.fireJuice();
        if (this.type === 'scanner') AUDIO.sfx.scan(); else AUDIO.sfx.shot();
        break;
      }
      case 'snipe': {
        if (this.cool > 0) break;
        const t = this.pickTarget(s.range);
        if (!t) break;
        this.aim = Math.atan2(t.y - this.y, t.x - this.x);
        this.cool = 1 / s.rate;
        const h = this.rollHit(s.dmg);
        t.hurt(h.dmg, { pierce: s.pierce, source: this });
        if (h.crit) g.fxText(t.x, t.y, Math.round(h.dmg), '#ffd166', true);
        g.fxLine(this.x, this.y, t.x, t.y, this.def.color, 0.14);
        g.fxHit(t.x, t.y, this.def.color, 6);
        this.fireJuice();
        AUDIO.sfx.snipe();
        break;
      }
      case 'chain': {
        if (this.cool > 0) break;
        const first = this.pickTarget(s.range);
        if (!first) break;
        this.aim = Math.atan2(first.y - this.y, first.x - this.x);
        this.cool = 1 / s.rate;
        const h = this.rollHit(s.dmg);
        let prev = { x: this.x, y: this.y };
        let cur = first, dmg = h.dmg;
        const hitSet = new Set();
        for (let i = 0; i < s.chains && cur; i++) {
          g.fxLine(prev.x, prev.y, cur.x, cur.y, this.def.color, 0.12, true);
          cur.hurt(dmg, { source: this });
          if (h.crit && i === 0) g.fxText(cur.x, cur.y, Math.round(dmg), '#ffd166', true);
          g.fxHit(cur.x, cur.y, this.def.color, 3);
          hitSet.add(cur);
          prev = cur;
          dmg *= 0.75;
          // nearest unhit target within 2 tiles of last strike
          let nxt = null, nd = 4;
          for (const e of g.enemies) {
            if (hitSet.has(e) || !this.canTarget(e)) continue;
            const d2 = UTIL.dist2(prev.x, prev.y, e.x, e.y);
            if (d2 < nd) { nd = d2; nxt = e; }
          }
          cur = nxt;
        }
        this.fireJuice();
        AUDIO.sfx.chain();
        break;
      }
      case 'splash': {
        if (this.cool > 0) break;
        const t = this.pickTarget(s.range);
        if (!t) break;
        this.aim = Math.atan2(t.y - this.y, t.x - this.x);
        this.cool = 1 / s.rate;
        // lead the target slightly
        const lead = UTIL.clamp(t.speedNow() * 0.45, 0, 0.9);
        const tx = t.x + Math.cos(t.angle) * lead, ty = t.y + Math.sin(t.angle) * lead;
        const h = this.rollHit(s.dmg);
        g.projectiles.push(new Projectile(g, this, null, {
          dmg: h.dmg, crit: h.crit, speed: 6.5, color: this.def.color, kind: 'mortar',
          destX: tx, destY: ty, splash: s.splash, arc: true, burn: s.burn,
        }));
        this.fireJuice();
        AUDIO.sfx.shot();
        break;
      }
      case 'orb': {
        if (this.cool > 0) break;
        const t = this.pickTarget(s.range);
        if (!t) break;
        this.aim = Math.atan2(t.y - this.y, t.x - this.x);
        this.cool = 1 / s.rate;
        const h = this.rollHit(s.dmg);
        g.projectiles.push(new Projectile(g, this, t, {
          dmg: h.dmg, crit: h.crit, speed: 5.5, color: this.def.color, kind: 'orb', splash: s.splash, air: true,
        }));
        this.fireJuice();
        AUDIO.sfx.orb();
        break;
      }
      case 'beam': {
        // keep / acquire lock
        if (this.beamTarget && (this.beamTarget.dead || this.beamTarget.stealthed || !this.inRange(this.beamTarget, s.range))) {
          this.beamTarget = null; this.beamRamp = 1;
        }
        if (!this.beamTarget) {
          this.beamTarget = this.pickTarget(s.range);
          this.beamRamp = 1;
        }
        if (this.beamTarget) {
          const t = this.beamTarget;
          this.aim = Math.atan2(t.y - this.y, t.x - this.x);
          this.beamRamp = Math.min(s.rampMax, this.beamRamp + dt * 0.55);
          t.hurt(s.dmg * this.beamRamp * dt, { source: this });
          AUDIO.sfx.beam();
        }
        break;
      }
      case 'field': {
        if (this.cool > 0) break;
        this.cool = 1 / s.rate;
        let hit = false;
        for (const e of this.g.enemies) {
          if (e.dead || e.flying || e.y < 0) continue;
          if (this.inRange(e, s.range)) {
            e.hurt(s.dmg / s.rate, { source: this, noArmor: true });
            e.applySlow(s.slow, 0.65);
            hit = true;
          }
        }
        if (hit) this.pulseT = 0.4;
        break;
      }
      case 'emp': {
        if (this.cool > 0) break;
        // only fire when something is in range
        let any = false;
        for (const e of g.enemies) { if (!e.dead && e.y > 0 && this.inRange(e, s.range)) { any = true; break; } }
        if (!any) break;
        this.cool = 1 / s.rate;
        for (const e of g.enemies) {
          if (e.dead || e.y < 0 || !this.inRange(e, s.range)) continue;
          e.hurt(s.dmg, { source: this, noArmor: true });
          if (!e.dead) e.applyStun(s.stun);
        }
        g.fxRing(this.x, this.y, s.range, this.def.color);
        g.shake(3);
        AUDIO.sfx.empPulse();
        break;
      }
      // slowaura / buffaura / income: passive
    }
    if (this.pulseT > 0) this.pulseT -= dt;
  }

  upgradeCost() {
    if (this.tier >= 3) return null;
    const c = this.def.levels[this.tier + 1].cost;
    return Math.round(c * (1 - SAVE.researchValue('discount') / 100));
  }
  sellValue() {
    return Math.round(this.invested * (0.70 + SAVE.researchValue('salvage') / 100));
  }
}

// =============================================================== PROJECTILE
class Projectile {
  constructor(g, source, target, opts) {
    this.g = g;
    this.source = source;
    this.target = target;
    this.x = source.x; this.y = source.y - 0.18;
    this.dmg = opts.dmg;
    this.crit = !!opts.crit;
    this.pierce = !!opts.pierce;
    this.burn = !!opts.burn;
    this.speed = opts.speed;
    this.color = opts.color;
    this.kind = opts.kind;
    this.splash = opts.splash || 0;
    this.air = !!opts.air;
    this.arc = !!opts.arc;
    this.dead = false;
    if (target) { this.destX = target.x; this.destY = target.y; }
    else { this.destX = opts.destX; this.destY = opts.destY; }
    this.totalDist = Math.max(0.001, UTIL.dist(this.x, this.y, this.destX, this.destY));
    this.traveled = 0;
  }

  update(dt) {
    const g = this.g;
    // homing: track live target
    if (this.target && !this.target.dead) { this.destX = this.target.x; this.destY = this.target.y; }
    const dx = this.destX - this.x, dy = this.destY - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed * dt;
    this.traveled += step;

    if (d <= step + 0.05) {
      this.x = this.destX; this.y = this.destY;
      this.impact();
      return;
    }
    this.x += dx / d * step;
    this.y += dy / d * step;
    this.angle = Math.atan2(dy, dx);
    if (this.traveled > 30) this.dead = true; // safety
  }

  impact() {
    const g = this.g;
    this.dead = true;
    if (this.kind === 'mortar' || (this.kind === 'orb' && this.splash)) {
      // area damage
      const r = this.splash;
      for (const e of g.enemies) {
        if (e.dead || e.y < 0) continue;
        if (e.flying && this.kind === 'mortar') continue;
        if (UTIL.dist2(this.x, this.y, e.x, e.y) <= (r + e.size) * (r + e.size)) {
          e.hurt(this.dmg, { source: this.source });
        }
      }
      if (this.crit) g.fxText(this.x, this.y, Math.round(this.dmg), '#ffd166', true);
      if (this.burn) g.addBurn(this.x, this.y, r * 0.85, this.dmg * 0.22, 3);
      g.fxBoom(this.x, this.y, r, this.color);
      AUDIO.sfx.boom();
      if (this.kind === 'mortar') g.shake(2);
    } else {
      // single hit
      if (this.target && !this.target.dead) {
        this.target.hurt(this.dmg, { pierce: this.pierce, source: this.source });
        if (this.crit) g.fxText(this.x, this.y, Math.round(this.dmg), '#ffd166', true);
        g.fxHit(this.x, this.y, this.color, 3);
      }
    }
  }
}
