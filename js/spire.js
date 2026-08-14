/* NEURAL SPIRE — the tower: scene, generated climb path, build sockets.
   Each campaign node owns a fixed seed + topology parameters, so every node
   IS its spire: same layout on every attempt (learnable), different between
   nodes (tall lazy spirals, short steep risers, plaza-ring kill boxes). */
'use strict';
const SPIRE = (function () {
  const S = CONFIG.SPIRE;
  let scene = null, group = null;
  let sockets = [];
  let path = null;
  let coreMesh = null, coreLight = null, coreBasePos = null, crownLamp = null;
  let curSeed = 1, H = S.height;

  // ---------------- path generation ----------------
  function buildPath(seed, params) {
    const R = UTIL.rng(seed);
    const w = (params && params.w) || { arc: 0.55, sb: 0.16, riser: 0.14, plaza: 0.15 };
    const plazaMax = (params && params.plazaMax !== undefined) ? params.plazaMax : 2;
    H = (params && params.height) || S.height;

    path = { points: [], cum: [], total: 0 };
    let ang = R() * Math.PI * 2;
    let y = 0.6;
    let dir = R() < 0.5 ? 1 : -1;
    let radius = S.rPath;
    let plazas = 0, segsSinceFlip = 0;

    const segs = [];
    while (y < H - 1.2) {
      // weighted segment pick
      let type = 'arc';
      const total = w.arc + w.sb + w.riser + w.plaza;
      let roll = R() * total;
      if ((roll -= w.arc) < 0) type = 'arc';
      else if ((roll -= w.sb) < 0) type = segsSinceFlip >= 1 ? 'switchback' : 'arc';
      else if ((roll -= w.riser) < 0) type = 'riser';
      else type = (plazas < plazaMax && y > 5 && y < H - 7) ? 'plaza' : 'arc';

      let dAng, dY, rTarget = 3.2 + R() * 1.3;
      if (type === 'arc') { dAng = (Math.PI * 0.6 + R() * Math.PI * 0.6) * dir; dY = 3.2 + R() * 1.6; segsSinceFlip++; }
      else if (type === 'switchback') { dir = -dir; segsSinceFlip = 0; dAng = (Math.PI * 0.7 + R() * Math.PI * 0.5) * dir; dY = 2.6 + R() * 1.2; }
      else if (type === 'riser') { dAng = (Math.PI * 0.2 + R() * Math.PI * 0.15) * dir; dY = 4.2 + R() * 1.6; segsSinceFlip++; }
      else { plazas++; dAng = Math.PI * 2 * dir; dY = 1.3; rTarget = 3.9 + R() * 0.7; segsSinceFlip++; }
      dY = Math.min(dY, H - 1.0 - y);
      segs.push({ ang0: ang, dAng, y0: y, dY, r0: radius, r1: rTarget });
      ang += dAng; y += dY; radius = rTarget;
    }

    let prev = null, d = 0;
    for (const sg of segs) {
      const steps = Math.max(10, Math.round(Math.abs(sg.dAng) * 22));
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const a = sg.ang0 + sg.dAng * t;
        const r = UTIL.lerp(sg.r0, sg.r1, t * t * (3 - 2 * t));
        const p = new THREE.Vector3(Math.sin(a) * r, sg.y0 + sg.dY * t, Math.cos(a) * r);
        if (prev) d += p.distanceTo(prev);
        path.points.push(p);
        path.cum.push(d);
        prev = p;
      }
    }
    path.total = d;
  }

  function at(d) {
    d = UTIL.clamp(d, 0, path.total);
    let lo = 0, hi = path.cum.length - 1;
    while (lo < hi - 1) { const mid = (lo + hi) >> 1; if (path.cum[mid] <= d) lo = mid; else hi = mid; }
    const span = path.cum[hi] - path.cum[lo] || 1;
    const f = (d - path.cum[lo]) / span;
    const pos = path.points[lo].clone().lerp(path.points[hi], f);
    const tangent = path.points[hi].clone().sub(path.points[lo]).normalize();
    return { pos, tangent };
  }

  function losBlocked(a, b) {
    const ax = a.x, az = a.z, bx = b.x, bz = b.z;
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 ? -(ax * dx + az * dz) / len2 : 0;
    t = UTIL.clamp(t, 0, 1);
    const cx = ax + dx * t, cz = az + dz * t;
    return (cx * cx + cz * cz) < S.rCol * S.rCol * 0.92;
  }

  // ---------------- procedural textures ----------------
  function columnTexture() {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 1024;
    const c = cv.getContext('2d');
    c.fillStyle = '#0e1728';
    c.fillRect(0, 0, 512, 1024);
    // panel plates with slight tonal variation
    for (let py = 0; py < 1024; py += 64) {
      for (let px = 0; px < 512; px += 128) {
        c.fillStyle = Math.random() < 0.5 ? '#101a2e' : '#0c1524';
        c.fillRect(px + 2, py + 2, 124, 60);
      }
    }
    // seams
    c.strokeStyle = '#070d1a'; c.lineWidth = 3;
    for (let py = 0; py <= 1024; py += 64) { c.beginPath(); c.moveTo(0, py); c.lineTo(512, py); c.stroke(); }
    for (let px = 0; px <= 512; px += 128) { c.beginPath(); c.moveTo(px, 0); c.lineTo(px, 1024); c.stroke(); }
    // lit windows — sparse, in loose bands so it reads as a live machine
    for (let i = 0; i < 260; i++) {
      const px = 8 + Math.random() * 496;
      const py = 8 + Math.random() * 1008;
      const on = Math.random();
      if (on < 0.55) c.fillStyle = 'rgba(42,120,190,0.85)';
      else if (on < 0.8) c.fillStyle = 'rgba(127,220,255,0.9)';
      else if (on < 0.9) c.fillStyle = 'rgba(255,209,102,0.85)';
      else c.fillStyle = 'rgba(20,40,70,0.9)';
      c.fillRect(px, py, 3 + Math.random() * 3, 5 + Math.random() * 4);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    return tex;
  }

  function skyTexture() {
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 512;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#03040a');
    g.addColorStop(0.45, '#0a1430');
    g.addColorStop(0.75, '#0d1a3d');
    g.addColorStop(1, '#050810');
    c.fillStyle = g;
    c.fillRect(0, 0, 16, 512);
    return new THREE.CanvasTexture(cv);
  }

  // quad strip between two polylines, normals computed
  function strip(ptsA, ptsB, material) {
    const verts = [], idx = [];
    for (let i = 0; i < ptsA.length; i++) {
      verts.push(ptsA[i].x, ptsA[i].y, ptsA[i].z, ptsB[i].x, ptsB[i].y, ptsB[i].z);
      if (i) {
        const a = (i - 1) * 2, b = a + 1, c = i * 2, e = c + 1;
        idx.push(a, b, c, b, e, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return new THREE.Mesh(g, material);
  }

  // ---------------- build / regen ----------------
  function disposeGroup() {
    if (!group) return;
    scene.remove(group);
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) {
        if (m.map) m.map.dispose();
        if (m.emissiveMap && m.emissiveMap !== m.map) m.emissiveMap.dispose();
        m.dispose();
      }
    });
    group = null;
    sockets = [];
    coreMesh = null; coreLight = null; crownLamp = null;
  }

  function regen(seed, params) {
    curSeed = seed;
    disposeGroup();
    group = new THREE.Group();
    scene.add(group);
    buildPath(seed, params);
    const socketEvery = (params && params.socketEvery) || S.socketEvery;

    // ---- sky dome ----
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(130, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false })
    );
    sky.position.y = 10;
    group.add(sky);

    // ---- central column: tapered, panel-textured, window lights ----
    const colTex = columnTexture();
    const colMat = new THREE.MeshStandardMaterial({
      map: colTex, emissiveMap: colTex, emissive: 0xffffff, emissiveIntensity: 0.35,
      roughness: 0.7, metalness: 0.45,
    });
    const col = new THREE.Mesh(new THREE.CylinderGeometry(S.rCol * 0.72, S.rCol * 1.06, H, 24, 1), colMat);
    col.position.y = H / 2;
    group.add(col);
    // seam rings at thirds
    for (const f of [0.25, 0.5, 0.75]) {
      const rr = UTIL.lerp(S.rCol * 1.06, S.rCol * 0.72, f);
      const seam = new THREE.Mesh(
        new THREE.TorusGeometry(rr + 0.02, 0.05, 6, 40),
        new THREE.MeshBasicMaterial({ color: 0x2a78be, transparent: true, opacity: 0.85 })
      );
      seam.rotation.x = Math.PI / 2;
      seam.position.y = H * f;
      group.add(seam);
    }
    // base skirt + foundation
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(S.rCol * 1.06, S.rCol * 1.8, 1.6, 24),
      new THREE.MeshStandardMaterial({ color: 0x111c30, roughness: 0.8, metalness: 0.4 })
    );
    skirt.position.y = 0.8;
    group.add(skirt);
    const found = new THREE.Mesh(
      new THREE.CylinderGeometry(S.rCol * 2.4, S.rCol * 2.7, 0.5, 28),
      new THREE.MeshStandardMaterial({ color: 0x0d1626, roughness: 0.9 })
    );
    found.position.y = 0.25;
    group.add(found);
    // crown antenna
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.1, 3.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x1c2a45, roughness: 0.5, metalness: 0.7 })
    );
    mast.position.y = H + 3.2;
    group.add(mast);
    crownLamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff3d6e })
    );
    crownLamp.position.y = H + 4.8;
    group.add(crownLamp);

    // ---- ramp: extruded (top / walls / bottom), with center lane + rails ----
    const N = path.points.length;
    const HALF = 0.55, THICK = 0.30;
    const topIn = [], topOut = [], botIn = [], botOut = [], laneIn = [], laneOut = [], railPts = [];
    for (let i = 0; i < N; i++) {
      const p = path.points[i];
      const pr = Math.max(0.6, Math.hypot(p.x, p.z));
      const sa = Math.sin(Math.atan2(p.x, p.z)), ca = Math.cos(Math.atan2(p.x, p.z));
      topIn.push(new THREE.Vector3(sa * (pr - HALF), p.y, ca * (pr - HALF)));
      topOut.push(new THREE.Vector3(sa * (pr + HALF), p.y, ca * (pr + HALF)));
      botIn.push(new THREE.Vector3(sa * (pr - HALF), p.y - THICK, ca * (pr - HALF)));
      botOut.push(new THREE.Vector3(sa * (pr + HALF), p.y - THICK, ca * (pr + HALF)));
      laneIn.push(new THREE.Vector3(sa * (pr - 0.22), p.y + 0.02, ca * (pr - 0.22)));
      laneOut.push(new THREE.Vector3(sa * (pr + 0.22), p.y + 0.02, ca * (pr + 0.22)));
      if (i % 2 === 0) railPts.push(new THREE.Vector3(sa * (pr + HALF), p.y + 0.06, ca * (pr + HALF)));
    }
    group.add(strip(topIn, topOut, new THREE.MeshStandardMaterial({ color: 0x24344f, roughness: 0.55, metalness: 0.5 })));
    group.add(strip(topOut, botOut, new THREE.MeshStandardMaterial({ color: 0x141f33, roughness: 0.7, metalness: 0.4 })));
    group.add(strip(botIn, topIn, new THREE.MeshStandardMaterial({ color: 0x141f33, roughness: 0.7, metalness: 0.4 })));
    group.add(strip(botOut, botIn, new THREE.MeshStandardMaterial({ color: 0x0e1626, roughness: 0.8, metalness: 0.3 })));
    // glowing center lane: the enemy route reads at a glance
    group.add(strip(laneIn, laneOut, new THREE.MeshBasicMaterial({ color: 0x1b5288, transparent: true, opacity: 0.9 })));
    // outer rail glow
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(railPts), new THREE.LineBasicMaterial({ color: 0x3f9be8 })));

    // support struts from ramp underside to the column
    const strutMat = new THREE.MeshStandardMaterial({ color: 0x16233b, roughness: 0.7, metalness: 0.5 });
    for (let i = 6; i < N - 4; i += 16) {
      const p = path.points[i];
      const pr = Math.max(0.6, Math.hypot(p.x, p.z));
      const sa = p.x / pr, ca = p.z / pr;
      const a = new THREE.Vector3(sa * (pr - HALF * 0.5), p.y - THICK, ca * (pr - HALF * 0.5));
      const b = new THREE.Vector3(sa * S.rCol * 0.95, p.y - 1.5, ca * S.rCol * 0.95);
      const len = a.distanceTo(b);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, len), strutMat);
      strut.position.copy(a).lerp(b, 0.5);
      strut.lookAt(b);
      group.add(strut);
    }

    // ---- build sockets ----
    const padG = new THREE.CylinderGeometry(0.52, 0.62, 0.18, 6);
    const nSock = Math.floor(path.total / socketEvery) - 1;
    const armMat = new THREE.MeshStandardMaterial({ color: 0x131e33, roughness: 0.8, metalness: 0.3 });
    for (let i = 1; i <= nSock; i++) {
      const d = i * socketEvery;
      const { pos } = at(d);
      const pr = Math.max(0.6, Math.hypot(pos.x, pos.z));
      const ang = Math.atan2(pos.x, pos.z);
      const sp = new THREE.Vector3(Math.sin(ang) * (pr + 1.0), pos.y - 0.05, Math.cos(ang) * (pr + 1.0));
      const pad = new THREE.Mesh(padG, new THREE.MeshStandardMaterial({
        color: 0x1a2b4a, roughness: 0.5, metalness: 0.5,
        emissive: 0x0a2038, emissiveIntensity: 1,
      }));
      pad.position.copy(sp);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 1.1), armMat);
      arm.position.copy(sp).lerp(pos, 0.5);
      arm.lookAt(pos.x, arm.position.y, pos.z);
      group.add(arm);
      pad.userData.socket = sockets.length;
      group.add(pad);
      sockets.push({ i: sockets.length, pos: sp, mesh: pad, turret: null });
    }

    // ---- summit core ----
    coreBasePos = new THREE.Vector3(0, H + 1.3, 0);
    coreMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.05, 1),
      new THREE.MeshStandardMaterial({ color: 0x66ddff, emissive: 0x2299dd, emissiveIntensity: 1.6, roughness: 0.25 })
    );
    coreMesh.position.copy(coreBasePos);
    group.add(coreMesh);
    const cage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.45, 0),
      new THREE.MeshBasicMaterial({ color: 0x2a78be, wireframe: true, transparent: true, opacity: 0.5 })
    );
    cage.position.copy(coreBasePos);
    coreMesh.userData.cage = cage;
    group.add(cage);
    coreLight = new THREE.PointLight(0x55ccff, 1.5, 26);
    coreLight.position.copy(coreBasePos);
    group.add(coreLight);

    // ---- base: spawn portal + danger light + ground ----
    const p0 = path.points[0];
    const portal = new THREE.Mesh(
      new THREE.TorusGeometry(1.3, 0.13, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xff3d6e })
    );
    portal.rotation.x = Math.PI / 2;
    portal.position.set(p0.x, 0.28, p0.z);
    group.add(portal);
    const baseLight = new THREE.PointLight(0xff3050, 0.9, 14);
    baseLight.position.set(p0.x, 2, p0.z);
    group.add(baseLight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(60, 48),
      new THREE.MeshStandardMaterial({ color: 0x05080f, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    group.add(ground);
    const grid = new THREE.PolarGridHelper(30, 12, 8, 48, 0x10203a, 0x0a1422);
    grid.position.y = 0.02;
    group.add(grid);
    const glow = new THREE.Mesh(
      new THREE.RingGeometry(S.rCol * 2.7, S.rCol * 2.75, 40),
      new THREE.MeshBasicMaterial({ color: 0x2a78be, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.06;
    group.add(glow);

    // ---- starfield ----
    const starPts = [];
    for (let i = 0; i < 420; i++) {
      const r = 55 + Math.random() * 60, th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 1.6 - 0.8);
      starPts.push(new THREE.Vector3(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) + 14, r * Math.sin(ph) * Math.sin(th)));
    }
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(starPts),
      new THREE.PointsMaterial({ color: 0x9fc3e8, size: 0.16, transparent: true, opacity: 0.8 })
    );
    stars.material.fog = false;
    group.add(stars);
  }

  function build(sc, seed, params) {
    scene = sc;
    regen(seed, params);
  }

  // idle animation + socket affordance pulse
  let t = 0;
  function update(dt, canAfford) {
    t += dt;
    if (coreMesh) {
      coreMesh.rotation.y += dt * 0.5;
      coreMesh.userData.cage.rotation.y -= dt * 0.3;
      coreMesh.userData.cage.rotation.x += dt * 0.17;
      const s = 1 + Math.sin(t * 2.2) * 0.04;
      coreMesh.scale.setScalar(s);
      coreLight.intensity = 1.4 + Math.sin(t * 2.2) * 0.25;
    }
    if (crownLamp) crownLamp.material.color.setHex(Math.sin(t * 3) > 0 ? 0xff3d6e : 0x571225);
    const pulse = 0.5 + Math.sin(t * 3.5) * 0.5;
    for (const s of sockets) {
      if (!s.turret && canAfford) s.mesh.material.emissiveIntensity = 1 + pulse * 1.6;
      else s.mesh.material.emissiveIntensity = 0.6;
    }
  }

  function coreHitFlash() {
    if (!coreMesh) return;
    coreMesh.material.emissive.setHex(0xff2244);
    setTimeout(() => coreMesh && coreMesh.material.emissive.setHex(0x2299dd), 160);
  }

  return {
    build, regen, update, at, losBlocked, coreHitFlash,
    get sockets() { return sockets; },
    get pathTotal() { return path.total; },
    get corePos() { return coreBasePos; },
    get height() { return H; },
    get rPath() { return S.rPath; },
    get seed() { return curSeed; },
  };
})();
