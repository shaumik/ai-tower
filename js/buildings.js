/* HARVEST PROTOCOL — structures: turrets, generators, depots, walls.
   Buildings have integrity and can be sieged; walls block the nav grid. */
'use strict';
const BUILDING = (function () {

  function statFor(def, level, key) {
    let v = def[key] || 0;
    for (let i = 2; i <= level; i++) {
      const u = CONFIG.UPGRADES[i - 2];
      if (u && u[key]) v *= u[key];
    }
    return v;
  }
  function upgradeCost(def, level) {
    const u = CONFIG.UPGRADES[level - 1];
    return u ? Math.round(def.cost * u.cost) : null;
  }

  function makeMesh(type, def) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x223350, emissive: def.color, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.5,
    });
    if (type === 'wall') {
      const w = new THREE.Mesh(
        new THREE.BoxGeometry(MAP.CS * 0.92, 1.5, MAP.CS * 0.92),
        new THREE.MeshStandardMaterial({ color: 0x2c3c5c, roughness: 0.7, metalness: 0.4, emissive: 0x101b30, emissiveIntensity: 1 })
      );
      w.position.y = 0.75;
      g.add(w);
      g.userData.head = w; g.userData.mat = w.material;
      return g;
    }
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.68, 0.35, 6),
      new THREE.MeshStandardMaterial({ color: 0x1c2b47, roughness: 0.5, metalness: 0.6 })
    );
    base.position.y = 0.2;
    g.add(base);
    let head;
    if (type === 'cannon') {
      head = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.95, 8), mat);
      head.rotation.x = Math.PI / 2;
    } else if (type === 'tesla') {
      head = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), mat);
    } else if (type === 'mortar') {
      head = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.7, 8), mat);
      head.rotation.x = -0.7;
    } else if (type === 'stasis') {
      head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 10), mat);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 10),
        new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.07, side: THREE.DoubleSide })
      );
      dome.position.y = 0.6;
      g.add(dome);
      g.userData.dome = dome;
    } else if (type === 'generator') {
      head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.55), mat);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 6, 20), new THREE.MeshBasicMaterial({ color: def.color }));
      ring.position.y = 0.7;
      g.add(ring);
      g.userData.ring = ring;
    } else { // depot
      head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.1), mat);
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.8, 0.8, 0.06, 6),
        new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.5 })
      );
      pad.position.y = 0.56;
      g.add(pad);
    }
    head.position.y = 0.75;
    g.add(head);
    g.userData.head = head;
    g.userData.mat = mat;
    return g;
  }

  class Building {
    constructor(scene, type, pos, game) {
      this.type = type;
      this.def = CONFIG.BUILDINGS[type];
      this.level = 1;
      this.alive = true;
      this.cooldown = 0;
      this.overclockT = 0;
      this.ocCooldown = 0;
      this.kills = 0;
      this.spent = this.def.cost;
      this.scene = scene;
      this.mesh = makeMesh(type, this.def);
      if (type !== 'wall') this.mesh.scale.setScalar(1.45);  // readable at RTS camera distance
      this.mesh.position.copy(pos);
      this.mesh.userData.building = this;
      scene.add(this.mesh);
      this.hp = this.maxHp = this.stat('hp') * (game && game.tech.plating ? 1.4 : 1);
      if (this.def.blocks) {
        const c = MAP.addBlock(pos.x, pos.z);
        this.cell = c;
      }
    }

    stat(key) {
      let v = statFor(this.def, this.level, key);
      const tech = (typeof GAME !== 'undefined' && GAME.tech) || {};
      if (tech.lenses && key === 'dmg' && (this.type === 'cannon' || this.type === 'tesla')) v *= 1.25;
      if (tech.plating && key === 'hp') v *= 1.4;
      return v;
    }
    get upgradeCost() { return upgradeCost(this.def, this.level); }

    upgrade() {
      this.spent += this.upgradeCost;
      this.level++;
      const frac = this.hp / this.maxHp;
      this.maxHp = this.stat('hp');
      this.hp = this.maxHp * frac;
      const s = 1 + (this.level - 1) * 0.16;
      this.mesh.userData.head.scale.setScalar(s);
      if (this.mesh.userData.mat) this.mesh.userData.mat.emissiveIntensity = 0.5 + (this.level - 1) * 0.35;
      FX.ring(this.mesh.position, 1.6, this.def.color);
    }

    overclock(cooldown) {
      this.overclockT = CONFIG.ECONOMY.overclockTime;
      this.ocCooldown = CONFIG.ECONOMY.overclockTime + cooldown;
      FX.ring(this.mesh.position, 2.2, 0xffd166);
      AUDIO.sfx.overclock();
    }

    muzzle() { return this.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)); }

    findTarget(enemies) {
      const range = this.stat('range');
      const minR = this.def.minRange || 0;
      const from = this.muzzle();
      let best = null, bestScore = -1;
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = e.mesh.position.distanceTo(from);
        if (d > range || d < minR) continue;
        const score = 1000 - e.mesh.position.distanceTo(MAP.corePos); // closest to core first
        if (score > bestScore) { bestScore = score; best = e; }
      }
      return best;
    }

    update(dt, game) {
      if (!this.alive) return;
      const m = this.mesh;
      if (this.overclockT > 0) this.overclockT -= dt;
      if (this.ocCooldown > 0) this.ocCooldown -= dt;
      const boosted = this.overclockT > 0;
      if (m.userData.mat) m.userData.mat.emissiveIntensity = boosted ? 1.8 : 0.5 + (this.level - 1) * 0.35;

      if (this.type === 'generator') {
        if (m.userData.ring) m.userData.ring.rotation.z += dt * (boosted ? 6 : 2);
        return;
      }
      if (this.type === 'depot' || this.type === 'wall') return;

      // powered? unpowered turrets go dark
      if (game.powerUsed() > game.powerCap()) {
        if (m.userData.mat) m.userData.mat.emissiveIntensity = 0.12;
        return;
      }

      if (this.type === 'stasis') {
        const r = this.stat('range');
        const slow = 1 - this.stat('slow') * (boosted ? 1.25 : 1);
        for (const e of game.enemies) {
          if (!e.alive) continue;
          if (e.mesh.position.distanceTo(m.position) <= r) e.slowK = Math.min(e.slowK, Math.max(0.2, slow));
        }
        if (m.userData.dome) m.userData.dome.scale.setScalar(r);
        return;
      }

      this.cooldown -= dt * (boosted ? 2 : 1);
      if (this.cooldown > 0) return;
      const target = this.findTarget(game.enemies);
      if (!target) return;
      this.cooldown = 1 / (this.stat('rate') * game.mod('rateMult', 1));
      const from = this.muzzle();
      m.userData.head.lookAt(target.mesh.position);

      if (this.type === 'cannon') {
        FX.beam(from, target.mesh.position.clone(), this.def.color);
        AUDIO.sfx.fire('blaster');
        target.hit(this.stat('dmg'), game, { showDmg: true });
        if (!target.alive) this.kills++;
      } else if (this.type === 'mortar') {
        const at = target.mesh.position.clone();
        FX.beam(from, at, this.def.color);
        FX.ring(at, this.def.splash, this.def.color);
        AUDIO.sfx.fire('repulsor');
        for (const e of game.enemies.slice()) {
          if (!e.alive) continue;
          if (e.mesh.position.distanceTo(at) <= this.def.splash) {
            e.hit(this.stat('dmg'), game, { showDmg: e === target });
            if (!e.alive) this.kills++;
          }
        }
      } else if (this.type === 'tesla') {
        let cur = target;
        const hitSet = [target];
        const chain = this.def.chain + (this.level - 1);
        FX.zap(from, cur.mesh.position.clone(), this.def.color);
        for (let i = 1; i < chain; i++) {
          let next = null, nd = 4.5;
          for (const e of game.enemies) {
            if (!e.alive || hitSet.includes(e)) continue;
            const d = e.mesh.position.distanceTo(cur.mesh.position);
            if (d < nd) { nd = d; next = e; }
          }
          if (!next) break;
          FX.zap(cur.mesh.position.clone(), next.mesh.position.clone(), this.def.color);
          hitSet.push(next);
          cur = next;
        }
        AUDIO.sfx.fire('tesla');
        for (const e of hitSet) {
          e.hit(this.stat('dmg'), game, { showDmg: hitSet.length < 3 });
          if (!e.alive) this.kills++;
        }
      }
    }

    hit(dmg, game) {
      if (!this.alive) return;
      this.hp -= dmg;
      if (this.mesh.userData.mat) {
        this.mesh.userData.mat.emissive.setHex(0xff4444);
        setTimeout(() => { if (this.alive && this.mesh.userData.mat) this.mesh.userData.mat.emissive.setHex(this.def.color); }, 110);
      }
      if (this.hp <= 0) this.destroyed(game);
    }

    destroyed(game) {
      FX.burst(this.mesh.position, this.def.color, 16, 0.3);
      AUDIO.sfx.splat();
      game.onBuildingLost(this);
      this.remove();
    }

    remove() {
      this.alive = false;
      if (this.cell) MAP.removeBlock(this.cell.cx, this.cell.cz);
      this.scene.remove(this.mesh);
      this.mesh.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }

    sellValue() { return Math.round(this.spent * CONFIG.ECONOMY.sellRefund); }
    sell() {
      const v = this.sellValue();
      this.remove();
      return v;
    }
  }

  return { Building };
})();
