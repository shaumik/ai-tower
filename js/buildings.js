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

  function flat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({
      color, flatShading: true, roughness: 0.6, metalness: 0.25,
    }, opts || {}));
  }
  function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }

  // composed low-poly models: silhouettes come from parts, not one primitive
  function makeMesh(type, def) {
    const g = new THREE.Group();
    const accent = flat(0x33415f, { emissive: def.color, emissiveIntensity: 0.5, roughness: 0.4 });
    const hull = flat(0x2a3450, { metalness: 0.35 });
    const dark = flat(0x1b2338);

    if (type === 'wall') {
      const w = shadowed(new THREE.Mesh(new THREE.BoxGeometry(MAP.CS * 0.94, 1.3, MAP.CS * 0.94),
        flat(0x323f5e, { emissive: 0x0d1626, emissiveIntensity: 1, metalness: 0.3, roughness: 0.65 })));
      w.position.y = 0.65;
      g.add(w);
      for (const sx of [-0.42, 0.42]) {
        const tooth = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, MAP.CS * 0.94), flat(0x3d4c70)));
        tooth.position.set(sx, 1.45, 0);
        g.add(tooth);
      }
      g.userData.head = w; g.userData.mat = w.material;
      return g;
    }

    // shared footing: hex pad + skirt
    const pad = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.85, 0.3, 6), dark));
    pad.position.y = 0.15;
    g.add(pad);

    let head;
    if (type === 'cannon') {
      head = new THREE.Group();
      const housing = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.5, 8), hull));
      head.add(housing);
      const barrel = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.15, 6), accent));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.1, 0.62);
      head.add(barrel);
      const muzzle = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 6), dark));
      muzzle.rotation.x = Math.PI / 2;
      muzzle.position.set(0, 0.1, 1.16);
      head.add(muzzle);
      head.position.y = 0.62;
    } else if (type === 'mortar') {
      head = new THREE.Group();
      for (const sx of [-0.36, 0.36]) {
        const plate = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.66), hull));
        plate.position.set(sx, 0.1, 0);
        head.add(plate);
      }
      const tube = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.0, 8), accent));
      tube.rotation.x = -0.85;
      tube.position.set(0, 0.34, -0.05);
      head.add(tube);
      head.position.y = 0.5;
    } else if (type === 'tesla') {
      head = new THREE.Group();
      const column = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.9, 6), hull));
      column.position.y = 0.1;
      head.add(column);
      const orb = shadowed(new THREE.Mesh(new THREE.OctahedronGeometry(0.34), accent));
      orb.position.y = 0.75;
      head.add(orb);
      for (let k = 0; k < 3; k++) {
        const prong = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.55, 4), dark));
        const a = (k / 3) * Math.PI * 2;
        prong.position.set(Math.sin(a) * 0.3, 0.62, Math.cos(a) * 0.3);
        prong.rotation.z = Math.sin(a) * 0.5;
        prong.rotation.x = Math.cos(a) * -0.5;
        head.add(prong);
      }
      head.position.y = 0.45;
    } else if (type === 'stasis') {
      head = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.85, 4), hull));
        const a = (k / 3) * Math.PI * 2;
        leg.position.set(Math.sin(a) * 0.4, 0.1, Math.cos(a) * 0.4);
        leg.rotation.z = Math.sin(a) * 0.55;
        leg.rotation.x = Math.cos(a) * -0.55;
        head.add(leg);
      }
      const orb = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), accent));
      orb.position.y = 0.85;
      head.add(orb);
      head.position.y = 0.35;
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1, 18, 10),
        new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.06, side: THREE.DoubleSide })
      );
      dome.position.y = 0.6;
      g.add(dome);
      g.userData.dome = dome;
    } else if (type === 'generator') {
      head = new THREE.Group();
      const block = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.62), hull));
      block.position.y = 0.36;
      head.add(block);
      for (const sx of [-0.34, 0.34]) {
        const vent = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.44), accent));
        vent.position.set(sx, 0.38, 0);
        head.add(vent);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 20), flat(0x5a4d2a, { emissive: def.color, emissiveIntensity: 0.9 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.95;
      head.add(ring);
      g.userData.ring = ring;
      head.position.y = 0.3;
    } else { // depot
      head = new THREE.Group();
      const deck = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.24, 1.5), hull));
      deck.position.y = 0.12;
      head.add(deck);
      const crate1 = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.44, 0.5), accent));
      crate1.position.set(-0.4, 0.45, -0.35);
      crate1.rotation.y = 0.3;
      head.add(crate1);
      const crate2 = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.42), dark));
      crate2.position.set(0.35, 0.42, 0.3);
      crate2.rotation.y = -0.2;
      head.add(crate2);
      const mast2 = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.1, 4), dark));
      mast2.position.set(0.55, 0.8, -0.5);
      head.add(mast2);
      const padGlow = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.72, 6),
        new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.45, side: THREE.DoubleSide })
      );
      padGlow.rotation.x = -Math.PI / 2;
      padGlow.position.y = 0.26;
      head.add(padGlow);
      head.position.y = 0.3;
    }
    g.add(head);
    g.userData.head = head;
    g.userData.mat = accent;
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
      this.baseEmissive = this.mesh.userData.mat.emissive.getHex();
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
        setTimeout(() => { if (this.alive && this.mesh.userData.mat) this.mesh.userData.mat.emissive.setHex(this.baseEmissive); }, 110);
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
