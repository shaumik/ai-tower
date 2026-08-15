/* HARVEST PROTOCOL — harvester drones: the little workers the whole economy
   rides on. They path to a crystal field, mine a load, haul it to the
   nearest drop-off, repeat — and raiders will hunt them. */
'use strict';
const WORKER = (function () {
  const ECO = CONFIG.ECONOMY;

  function makeMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a3a58, emissive: 0x7fdcff, emissiveIntensity: 0.5, roughness: 0.4 })
    );
    body.position.y = 0.55;
    g.add(body);
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0 })
    );
    eye.position.set(0, 0.6, 0.26);
    g.add(eye);
    // carried crystal (visible when hauling)
    const load = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.2),
      new THREE.MeshStandardMaterial({ color: 0x7fdcff, emissive: 0x2aa8ff, emissiveIntensity: 1.2 })
    );
    load.position.set(0, 1.0, 0);
    load.visible = false;
    g.add(load);
    g.userData.body = body;
    g.userData.load = load;
    return g;
  }

  class Worker {
    constructor(scene, pos) {
      this.scene = scene;
      this.hp = this.maxHp = ECO.workerHP;
      this.alive = true;
      this.state = 'idle';       // idle | toField | mining | toDrop
      this.field = null;
      this.path = null; this.pathI = 0;
      this.mineT = 0;
      this.carry = 0;
      this.mesh = makeMesh();
      this.mesh.position.copy(pos);
      this.mesh.userData.worker = this;
      scene.add(this.mesh);
    }

    // choose the closest field with reserves and room (2 slots + 1 per depot nearby)
    pickField(game) {
      let best = null, bd = 1e9;
      for (const f of MAP.fields) {
        if (f.reserves <= 0) continue;
        if (f.workers.size >= 3) continue;
        const d = f.pos.distanceTo(this.mesh.position);
        if (d < bd) { bd = d; best = f; }
      }
      return best;
    }

    nearestDrop(game) {
      let best = MAP.corePos, bd = this.mesh.position.distanceTo(MAP.corePos);
      for (const b of game.buildings) {
        if (!b.def.dropoff || !b.alive) continue;
        const d = this.mesh.position.distanceTo(b.mesh.position);
        if (d < bd) { bd = d; best = b.mesh.position; }
      }
      return best;
    }

    goTo(target) {
      const p = this.mesh.position;
      this.path = MAP.findPath(p.x, p.z, target.x, target.z);
      this.pathI = 0;
      return !!this.path;
    }

    update(dt, game) {
      if (!this.alive) return;
      const speedK = game.mod('mineSpeedMult', 1) * (game.tech.drills ? 1.12 : 1);
      const speed = 3.1 * speedK;

      // recall: shelter at the core (finish the haul first — it's paid for)
      if (game.recall && this.state !== 'toDrop' && this.state !== 'refuge') {
        if (this.field) { this.field.workers.delete(this); this.field = null; }
        const shelter = MAP.corePos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 4, 0, 2.5));
        if (this.goTo(shelter)) this.state = 'refuge';
      }
      if (this.state === 'refuge') {
        if (!game.recall) { this.state = 'idle'; return; }
        if (this.path && this.pathI < this.path.length) {
          const wp = this.path[this.pathI];
          const p = this.mesh.position;
          const dx = wp.x - p.x, dz = wp.z - p.z;
          const d = Math.hypot(dx, dz);
          const step = speed * dt;
          if (d < 0.25 || step >= d) { p.x = wp.x; p.z = wp.z; this.pathI++; }
          else { p.x += (dx / d) * step; p.z += (dz / d) * step; this.mesh.rotation.y = Math.atan2(dx, dz); }
        }
        return;
      }

      if (this.state === 'idle') {
        this.field = this.pickField(game);
        if (this.field) {
          this.field.workers.add(this);
          if (this.goTo(this.field.pos)) this.state = 'toField';
          else { this.field.workers.delete(this); this.field = null; }
        }
        return;
      }

      if (this.state === 'toField' || this.state === 'toDrop') {
        if (!this.path || this.pathI >= this.path.length) {
          if (this.state === 'toField') { this.state = 'mining'; this.mineT = ECO.mineTime / speedK; }
          else this.deposit(game);
          return;
        }
        const wp = this.path[this.pathI];
        const p = this.mesh.position;
        const dx = wp.x - p.x, dz = wp.z - p.z;
        const d = Math.hypot(dx, dz);
        const step = speed * dt;
        // snap on arrival OR overshoot — high sim speeds must never oscillate
        if (d < 0.25 || step >= d) { p.x = wp.x; p.z = wp.z; this.pathI++; return; }
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        this.mesh.rotation.y = Math.atan2(dx, dz);
        this.mesh.position.y = Math.abs(Math.sin(performance.now() / 130)) * 0.07; // busy little hop
        return;
      }

      if (this.state === 'mining') {
        if (!this.field || this.field.reserves <= 0) {
          if (this.field) this.field.workers.delete(this);
          this.field = null; this.state = 'idle';
          return;
        }
        this.mineT -= dt;
        if (this.mineT <= 0) {
          const carryMax = ECO.workerCarry + (game.tech.drills ? 6 : 0);
          this.carry = MAP.mineFrom(this.field, carryMax);
          this.mesh.userData.load.visible = true;
          this.field.workers.delete(this);
          if (this.goTo(this.nearestDrop(game))) this.state = 'toDrop';
          else this.state = 'idle';
        }
        return;
      }
    }

    deposit(game) {
      if (this.carry > 0) {
        const pay = Math.round(this.carry * game.mod('mineMult', 1));
        game.onMined(pay, this.mesh.position);
        this.carry = 0;
        this.mesh.userData.load.visible = false;
      }
      this.state = 'idle';
      if (this.field) { this.field.workers.delete(this); this.field = null; }
    }

    hit(dmg, game) {
      if (!this.alive) return;
      const real = dmg * game.mod('workerArmorMult', 1);
      this.hp -= real;
      this.mesh.userData.body.material.emissiveIntensity = 1.6;
      setTimeout(() => { if (this.alive) this.mesh.userData.body.material.emissiveIntensity = 0.5; }, 100);
      if (this.hp <= 0) this.die(game);
    }

    die(game) {
      this.alive = false;
      if (this.field) this.field.workers.delete(this);
      FX.burst(this.mesh.position, 0x7fdcff, 12, 0.24);
      AUDIO.sfx.kill();
      game.onWorkerLost(this);
      this.remove();
    }

    remove() {
      this.alive = false;
      this.scene.remove(this.mesh);
      this.mesh.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
  }

  return { Worker };
})();
