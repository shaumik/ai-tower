/* NEURAL SPIRE — climbers, fliers, and the physics of being thrown off a tower */
'use strict';
const ENEMY = (function () {

  function makeMesh(def) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: def.color, emissive: def.color, emissiveIntensity: 0.85, roughness: 0.4,
    });
    let body;
    if (def.boss) {
      body = new THREE.Mesh(new THREE.IcosahedronGeometry(def.size, 0), mat);
      const spikes = new THREE.Mesh(
        new THREE.IcosahedronGeometry(def.size * 1.35, 0),
        new THREE.MeshBasicMaterial({ color: def.color, wireframe: true, transparent: true, opacity: 0.6 })
      );
      g.add(spikes); g.userData.spin = spikes;
    } else if (def.flying) {
      body = new THREE.Mesh(new THREE.TetrahedronGeometry(def.size), mat);
      const wing = new THREE.Mesh(
        new THREE.OctahedronGeometry(def.size * 0.9),
        new THREE.MeshBasicMaterial({ color: def.color, wireframe: true, transparent: true, opacity: 0.7 })
      );
      g.add(wing); g.userData.spin = wing;
    } else if (def.armor) {
      body = new THREE.Mesh(new THREE.DodecahedronGeometry(def.size), mat);
    } else {
      body = new THREE.Mesh(new THREE.IcosahedronGeometry(def.size, 1), mat);
    }
    g.add(body);
    g.userData.body = body;
    g.userData.mat = mat;
    return g;
  }

  class Enemy {
    constructor(scene, type, hpMult) {
      const def = CONFIG.ENEMIES[type];
      this.type = type;
      this.def = def;
      this.hp = this.maxHp = Math.round(def.hp * hpMult);
      this.speed = def.speed;
      this.alive = true;
      this.state = def.flying ? 'fly' : 'climb'; // climb | fly | air (knocked) | dead
      this.d = 0;                    // distance along ramp (climbers)
      this.y = 0.6;                  // altitude (fliers)
      this.flyAng = Math.random() * Math.PI * 2; // fliers rise in a fixed vertical lane
      this.slowK = 1;                // stasis multiplier, recomputed each frame
      this.vel = null;               // ballistic velocity once knocked
      this.fellFrom = 0;
      this.hitT = 0;
      this.dmgAcc = 0; this.dmgAccT = 0;  // aggregated floating damage numbers
      this.scene = scene;
      this.mesh = makeMesh(def);
      this.mesh.userData.enemy = this;
      scene.add(this.mesh);
      this.place(0);
    }

    place(dt) {
      const m = this.mesh;
      if (this.state === 'climb') {
        const { pos, tangent } = SPIRE.at(this.d);
        m.position.set(pos.x, pos.y + this.def.size + 0.12, pos.z);
        m.lookAt(pos.clone().add(tangent).setY(m.position.y));
      } else if (this.state === 'fly') {
        const r = 5.3; // outside even the widest ramp sections
        m.position.set(Math.sin(this.flyAng) * r, this.y, Math.cos(this.flyAng) * r);
        if (m.userData.spin) m.userData.spin.rotation.y += dt * 6;
      } else if (this.state === 'air') {
        this.vel.y -= 22 * dt;
        m.position.addScaledVector(this.vel, dt);
        m.rotation.x += dt * 7; m.rotation.z += dt * 5;
      }
      if (m.userData.spin && this.state !== 'fly') m.userData.spin.rotation.y += dt * 2;
    }

    update(dt, game) {
      if (!this.alive) return;
      if (this.hitT > 0) {
        this.hitT -= dt;
        if (this.hitT <= 0) this.mesh.userData.mat.emissiveIntensity = 0.85;
      }
      // flush aggregated damage as one readable number, not a spam stack
      if (this.dmgAcc > 0) {
        this.dmgAccT -= dt;
        if (this.dmgAccT <= 0) {
          FX.text(this.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)), String(this.dmgAcc), '#cfe8ff', 0.55);
          this.dmgAcc = 0;
        }
      }
      if (this.state === 'climb') {
        this.d += this.speed * this.slowK * dt;
        if (this.d >= SPIRE.pathTotal) { this.reachCore(game); return; }
      } else if (this.state === 'fly') {
        this.y += this.speed * this.slowK * dt;
        if (this.y >= SPIRE.height + 1.2) { this.reachCore(game); return; }
      } else if (this.state === 'air') {
        if (this.mesh.position.y <= 0.35) { this.splat(game); return; }
        if (this.mesh.position.y < -5) { this.remove(); return; }
      }
      this.slowK = 1; // re-applied by stasis wells each frame
      this.place(dt);
    }

    hit(dmg, game, opts) {
      if (!this.alive) return;
      const armor = this.def.armor || 0;
      const real = Math.max(1, dmg - armor);
      this.hp -= real;
      this.mesh.userData.mat.emissiveIntensity = 1.6;
      this.hitT = 0.1;
      if (opts && opts.showDmg) {
        if (this.dmgAcc === 0) this.dmgAccT = 0.45;
        this.dmgAcc += real;
      }
      if (this.hp <= 0) this.die(game);
    }

    knockback(force, from, game) {
      if (!this.alive || this.def.knockImmune || this.def.flying) return false;
      if (this.state !== 'climb') return false;
      // impulse: outward from the spire axis, away from the repulsor, and up
      const p = this.mesh.position;
      const out = new THREE.Vector3(p.x, 0, p.z).normalize();
      const away = p.clone().sub(from).setY(0).normalize();
      this.vel = out.multiplyScalar(force * 0.8).add(away.multiplyScalar(force * 0.45));
      this.vel.y = force * 0.5;
      this.state = 'air';
      this.fellFrom = p.y;
      AUDIO.sfx.knockoff();
      return true;
    }

    splat(game) {
      // hit the ground after being thrown — gravity does the killing
      const bonus = Math.round(this.fellFrom * CONFIG.ECONOMY.fallBonusPerUnit);
      AUDIO.sfx.splat();
      FX.burst(this.mesh.position, this.def.color, 14, 0.28);
      FX.ring(this.mesh.position, 2.2, 0xffd166);
      game.onKill(this, { fallBonus: bonus });
      this.remove();
    }

    die(game) {
      AUDIO.sfx.kill();
      FX.burst(this.mesh.position, this.def.color, this.def.boss ? 40 : 10, this.def.boss ? 0.4 : 0.2);
      game.onKill(this, {});
      this.remove();
    }

    reachCore(game) {
      SPIRE.coreHitFlash();
      FX.burst(this.mesh.position, 0xff2244, 16, 0.3);
      game.onLeak(this);
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

    get progress() { // 0..1 how close to the core (for targeting priority)
      return this.def.flying ? this.y / (SPIRE.height + 1.2) : this.d / SPIRE.pathTotal;
    }
  }

  return { Enemy };
})();
