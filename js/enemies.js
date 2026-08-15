/* HARVEST PROTOCOL — hostiles. Crawlers/sprinters push the core along the
   nav grid, raiders hunt your miners, brutes siege structures, and the
   ARCHON walks through walls. */
'use strict';
const ENEMY = (function () {

  let glowTex = null;
  function getGlowTex() {
    if (glowTex) return glowTex;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const grad = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(cv);
    return glowTex;
  }

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
    } else if (def.target === 'workers') {
      body = new THREE.Mesh(new THREE.TetrahedronGeometry(def.size * 1.1), mat);
    } else if (def.armor) {
      body = new THREE.Mesh(new THREE.DodecahedronGeometry(def.size), mat);
    } else {
      body = new THREE.Mesh(new THREE.IcosahedronGeometry(def.size, 1), mat);
    }
    body.position.y = def.size + 0.1;
    g.add(body);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getGlowTex(), color: def.color, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(def.size * (def.boss ? 6 : 4.5));
    halo.position.y = def.size + 0.1;
    g.add(halo);
    g.userData.body = body;
    g.userData.mat = mat;
    return g;
  }

  class Enemy {
    constructor(scene, type, hpMult, gate) {
      const def = CONFIG.ENEMIES[type];
      this.type = type;
      this.def = def;
      this.hp = this.maxHp = Math.round(def.hp * hpMult);
      this.speed = def.speed;
      this.alive = true;
      this.slowK = 1;
      this.attackT = 0;
      this.victim = null;          // worker or building being attacked/hunted
      this.path = null; this.pathI = 0;
      this.repathT = 0;
      this.dmgAcc = 0; this.dmgAccT = 0;
      this.scene = scene;
      this.mesh = makeMesh(def);
      const jitter = () => (Math.random() - 0.5) * 2.2;
      this.mesh.position.set(gate.pos.x + jitter(), 0, gate.pos.z + Math.random() * 1.5);
      this.mesh.userData.enemy = this;
      scene.add(this.mesh);
    }

    moveToward(wp, dt) {
      const p = this.mesh.position;
      const dx = wp.x - p.x, dz = wp.z - p.z;
      const d = Math.hypot(dx, dz);
      const step = this.speed * this.slowK * dt;
      // snap on arrival OR overshoot — high sim speeds must never oscillate
      if (d < 0.2 || step >= d) { p.x = wp.x; p.z = wp.z; return true; }
      p.x += (dx / d) * step;
      p.z += (dz / d) * step;
      this.mesh.rotation.y = Math.atan2(dx, dz);
      return false;
    }

    // nearest wall adjacent to our cell (we're blocked — break through)
    blockingWall(game) {
      let best = null, bd = MAP.CS * 2.2;
      for (const b of game.buildings) {
        if (!b.alive || !b.def.blocks) continue;
        const d = b.mesh.position.distanceTo(this.mesh.position);
        if (d < bd) { bd = d; best = b; }
      }
      return best;
    }

    update(dt, game) {
      if (!this.alive) return;
      if (this.dmgAcc > 0) {
        this.dmgAccT -= dt;
        if (this.dmgAccT <= 0) {
          FX.text(this.mesh.position.clone().add(new THREE.Vector3(0, 1.1, 0)), String(this.dmgAcc), '#cfe8ff', 0.55);
          this.dmgAcc = 0;
        }
      }
      this.attackT -= dt;
      const p = this.mesh.position;

      // ---- raiders: hunt the mining line ----
      if (this.def.target === 'workers') {
        if (!this.victim || !this.victim.alive) {
          this.victim = null;
          let bd = 1e9;
          for (const w of game.workers) {
            if (!w.alive) continue;
            const d = w.mesh.position.distanceTo(p);
            if (d < bd) { bd = d; this.victim = w; }
          }
          this.path = null;
        }
        if (!this.victim) { this.pushCore(game, dt); return; }   // no workers left — join the push
        const d = this.victim.mesh.position.distanceTo(p);
        if (d < 1.1) {
          if (this.attackT <= 0) {
            this.attackT = 1 / this.def.atkRate;
            this.victim.hit(this.def.dmg, game);
            FX.beam(p.clone().setY(0.6), this.victim.mesh.position.clone().setY(0.6), this.def.color);
          }
        } else {
          this.repathT -= dt;
          if (!this.path || this.repathT <= 0) {
            this.path = MAP.findPath(p.x, p.z, this.victim.mesh.position.x, this.victim.mesh.position.z);
            this.pathI = 0;
            this.repathT = 0.9;
          }
          if (this.path && this.pathI < this.path.length) {
            if (this.moveToward(this.path[this.pathI], dt)) this.pathI++;
          } else this.moveToward(this.victim.mesh.position, dt);
        }
        this.spin(dt);
        return;
      }

      // ---- brutes: siege the nearest structure ----
      if (this.def.target === 'buildings') {
        if (!this.victim || !this.victim.alive) {
          this.victim = null;
          let bd = 1e9;
          for (const b of game.buildings) {
            if (!b.alive) continue;
            const d = b.mesh.position.distanceTo(p);
            if (d < bd) { bd = d; this.victim = b; }
          }
          this.path = null;
        }
        if (!this.victim) { this.pushCore(game, dt); return; }   // nothing left to break
        const d = this.victim.mesh.position.distanceTo(p);
        if (d < 1.5) {
          if (this.attackT <= 0) {
            this.attackT = 1 / this.def.atkRate;
            this.victim.hit(this.def.dmg, game);
            FX.beam(p.clone().setY(0.8), this.victim.mesh.position.clone().setY(0.8), this.def.color);
            AUDIO.sfx.fire('repulsor');
          }
        } else {
          this.repathT -= dt;
          if (!this.path || this.repathT <= 0) {
            this.path = MAP.findPath(p.x, p.z, this.victim.mesh.position.x, this.victim.mesh.position.z);
            this.pathI = 0;
            this.repathT = 1.2;
          }
          if (this.path && this.pathI < this.path.length) {
            if (this.moveToward(this.path[this.pathI], dt)) this.pathI++;
          } else this.moveToward(this.victim.mesh.position, dt);
        }
        this.spin(dt);
        return;
      }

      // ---- core pushers (crawler, sprinter, boss) ----
      this.pushCore(game, dt);
      this.spin(dt);
    }

    pushCore(game, dt) {
      const p = this.mesh.position;
      if (p.distanceTo(MAP.corePos) < 2.6) {
        game.onCoreHit(this);
        this.remove();
        return;
      }
      const wp = MAP.flowStep(p.x, p.z);
      if (!wp) {
        // walled off — the ARCHON smashes straight through, others chew the wall
        const wall = this.blockingWall(game);
        if (wall) {
          if (this.attackT <= 0) {
            this.attackT = 1 / (this.def.atkRate || 1);
            wall.hit(this.def.dmg * (this.def.wallBreaker || 1), game);
            FX.beam(p.clone().setY(0.8), wall.mesh.position.clone().setY(0.8), this.def.color);
          }
        } else {
          this.moveToward(MAP.corePos, dt); // open field fallback
        }
        return;
      }
      this.moveToward(wp, dt);
    }

    spin(dt) {
      if (this.mesh.userData.spin) this.mesh.userData.spin.rotation.y += dt * 2;
    }

    hit(dmg, game, opts) {
      if (!this.alive) return;
      const armor = this.def.armor || 0;
      const real = Math.max(1, dmg - armor);
      this.hp -= real;
      this.mesh.userData.mat.emissiveIntensity = 1.6;
      setTimeout(() => { if (this.alive) this.mesh.userData.mat.emissiveIntensity = 0.85; }, 100);
      if (opts && opts.showDmg) {
        if (this.dmgAcc === 0) this.dmgAccT = 0.45;
        this.dmgAcc += real;
      }
      if (this.hp <= 0) this.die(game);
    }

    die(game) {
      AUDIO.sfx.kill();
      FX.burst(this.mesh.position, this.def.color, this.def.boss ? 40 : 10, this.def.boss ? 0.4 : 0.2);
      game.onKill(this);
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

  return { Enemy };
})();
