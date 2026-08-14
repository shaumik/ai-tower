/* NEURAL SPIRE — turrets: build, target (LOS matters), fire, upgrade, overclock */
'use strict';
const TURRET = (function () {

  function statFor(def, level, key) {
    let v = def[key] || 0;
    for (let i = 2; i <= level; i++) {
      const u = CONFIG.UPGRADES[i - 2];
      if (u && u[key]) v *= u[key];
    }
    return v;
  }
  function upgradeCost(def, level) { // cost to go from level → level+1
    const u = CONFIG.UPGRADES[level - 1];
    return u ? Math.round(def.cost * u.cost) : null;
  }

  function makeMesh(type, def) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.5, 0.3, 6),
      new THREE.MeshStandardMaterial({ color: 0x1c2b47, roughness: 0.5, metalness: 0.6 })
    );
    base.position.y = 0.22;
    g.add(base);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x223350, emissive: def.color, emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.5,
    });
    let head;
    if (type === 'blaster') {
      head = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.85, 8), mat);
      head.rotation.x = Math.PI / 2;
    } else if (type === 'tesla') {
      head = new THREE.Mesh(new THREE.OctahedronGeometry(0.42), mat);
    } else if (type === 'repulsor') {
      head = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.13, 8, 20), mat);
    } else if (type === 'stasis') {
      head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 12, 10), mat);
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 10),
        new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.07, side: THREE.DoubleSide })
      );
      dome.position.y = 0.6;
      g.add(dome);
      g.userData.dome = dome;
    } else { // generator
      head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), mat);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.52, 0.05, 6, 20),
        new THREE.MeshBasicMaterial({ color: def.color })
      );
      ring.position.y = 0.62;
      g.add(ring);
      g.userData.ring = ring;
    }
    head.position.y = 0.62;
    g.add(head);
    g.userData.head = head;
    g.userData.mat = mat;
    return g;
  }

  class Turret {
    constructor(scene, socket, type) {
      this.type = type;
      this.def = CONFIG.TURRETS[type];
      this.level = 1;
      this.socket = socket;
      this.cooldown = 0;
      this.overclockT = 0;   // active boost seconds remaining
      this.ocCooldown = 0;   // seconds until overclock available again
      this.kills = 0;
      this.spent = this.def.cost;   // for sell refund
      this.scene = scene;
      this.mesh = makeMesh(type, this.def);
      this.mesh.position.copy(socket.pos);
      this.mesh.userData.turret = this;
      scene.add(this.mesh);
      socket.turret = this;
    }

    stat(key) {
      let v = statFor(this.def, this.level, key);
      // SPIRE OS tech modifies live stats
      const tech = GAME.tech || {};
      if (tech.lenses && key === 'dmg' && (this.type === 'blaster' || this.type === 'tesla')) v *= 1.25;
      if (tech.massdrv && key === 'knock') v *= 1.3;
      if (tech.harmonic && this.type === 'stasis') {
        if (key === 'slow') v += 0.12;
        if (key === 'range') v *= 1.15;
      }
      return v;
    }
    get upgradeCost() { return upgradeCost(this.def, this.level); }

    upgrade() {
      this.spent += this.upgradeCost;
      this.level++;
      const s = 1 + (this.level - 1) * 0.16;
      this.mesh.userData.head.scale.setScalar(s);
      this.mesh.userData.mat.emissiveIntensity = 0.5 + (this.level - 1) * 0.35;
      if (this.mesh.userData.dome) {
        const r = this.stat('range');
        this.mesh.userData.dome.scale.setScalar(r / 1);
      }
      FX.ring(this.mesh.position, 1.6, this.def.color);
    }

    overclock(cooldown) {
      this.overclockT = CONFIG.ECONOMY.overclockTime;
      this.ocCooldown = CONFIG.ECONOMY.overclockTime + (cooldown !== undefined ? cooldown : CONFIG.ECONOMY.overclockCooldown);
      FX.ring(this.mesh.position, 2.2, 0xffd166);
      AUDIO.sfx.overclock();
    }

    muzzle() {
      return this.mesh.position.clone().add(new THREE.Vector3(0, 0.65, 0));
    }

    findTarget(enemies) {
      const range = this.stat('range');
      const from = this.muzzle();
      let best = null, bestProg = -1;
      for (const e of enemies) {
        if (!e.alive || e.state === 'air') continue;
        const d = e.mesh.position.distanceTo(from);
        if (d > range) continue;
        if (SPIRE.losBlocked(from, e.mesh.position)) continue; // the spire blocks its own defenses
        if (e.progress > bestProg) { bestProg = e.progress; best = e; }
      }
      return best;
    }

    update(dt, game) {
      const m = this.mesh;
      if (this.overclockT > 0) this.overclockT -= dt;
      if (this.ocCooldown > 0) this.ocCooldown -= dt;
      const boosted = this.overclockT > 0;
      m.userData.mat.emissiveIntensity = (boosted ? 1.8 : 0.5 + (this.level - 1) * 0.35);

      if (this.type === 'generator') {
        if (m.userData.ring) m.userData.ring.rotation.z += dt * (boosted ? 6 : 2);
        return;
      }
      if (this.type === 'stasis') {
        const r = this.stat('range');
        const slow = 1 - this.stat('slow') * (boosted ? 1.25 : 1);
        for (const e of game.enemies) {
          if (!e.alive || e.state === 'air') continue;
          if (e.mesh.position.distanceTo(m.position) <= r) e.slowK = Math.min(e.slowK, Math.max(0.2, slow));
        }
        if (m.userData.dome) {
          m.userData.dome.scale.setScalar(r);
          m.userData.dome.material.opacity = 0.05 + Math.sin(game.time * 3) * 0.02;
        }
        return;
      }

      this.cooldown -= dt * (boosted ? 2 : 1);
      if (this.cooldown > 0) return;
      const target = this.findTarget(game.enemies);
      if (!target) return;
      this.cooldown = 1 / (this.stat('rate') * game.mod('rateMult', 1));
      const from = this.muzzle();
      m.userData.head.lookAt(target.mesh.position);

      if (this.type === 'blaster') {
        FX.beam(from, target.mesh.position.clone(), this.def.color);
        AUDIO.sfx.fire('blaster');
        target.hit(this.stat('dmg'), game, { showDmg: true });
        if (!target.alive) this.kills++;
      } else if (this.type === 'tesla') {
        // chain to nearest neighbours of the first target
        let cur = target, hitSet = [target];
        const chain = this.def.chain + (this.level - 1);
        FX.zap(from, cur.mesh.position.clone(), this.def.color);
        for (let i = 1; i < chain; i++) {
          let next = null, nd = 4.2;
          for (const e of game.enemies) {
            if (!e.alive || e.state === 'air' || hitSet.includes(e)) continue;
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
      } else if (this.type === 'repulsor') {
        const r = this.stat('range');
        const force = this.stat('knock');
        FX.ring(m.position.clone().add(new THREE.Vector3(0, 0.4, 0)), r, this.def.color);
        AUDIO.sfx.fire('repulsor');
        let thrown = 0;
        for (const e of game.enemies.slice()) {
          if (!e.alive) continue;
          if (e.mesh.position.distanceTo(m.position) > r) continue;
          e.hit(this.stat('dmg'), game, {});
          if (e.alive && e.knockback(force, m.position, game)) thrown++;
        }
        if (thrown >= 2) game.onMultiThrow(thrown);
      }
    }

    sell(scene) {
      this.socket.turret = null;
      this.scene.remove(this.mesh);
      this.mesh.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      return Math.round(this.spent * CONFIG.ECONOMY.sellRefund);
    }
  }

  return { Turret, statFor, upgradeCost };
})();
