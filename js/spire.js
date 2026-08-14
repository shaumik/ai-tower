/* NEURAL SPIRE — the tower: scene, helix climb path, build sockets */
'use strict';
const SPIRE = (function () {
  const S = CONFIG.SPIRE;
  let scene = null, group = null;
  const sockets = [];   // { i, pos, mesh, pad, turret|null }
  const path = { points: [], cum: [], total: 0 };
  let coreMesh = null, coreLight = null, coreBasePos = null;

  // ---------------- helix path ----------------
  function buildPath() {
    const steps = 640;
    let prev = null, d = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ang = t * S.turns * Math.PI * 2;
      const p = new THREE.Vector3(Math.sin(ang) * S.rPath, 0.6 + t * (S.height - 1.6), Math.cos(ang) * S.rPath);
      if (prev) d += p.distanceTo(prev);
      path.points.push(p);
      path.cum.push(d);
      prev = p;
    }
    path.total = d;
  }
  // position + tangent at distance d along the ramp
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

  // line-of-sight: is the straight segment a→b blocked by the central column?
  function losBlocked(a, b) {
    // 2D (xz) distance from origin to segment
    const ax = a.x, az = a.z, bx = b.x, bz = b.z;
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 ? -(ax * dx + az * dz) / len2 : 0;
    t = UTIL.clamp(t, 0, 1);
    const cx = ax + dx * t, cz = az + dz * t;
    return (cx * cx + cz * cz) < S.rCol * S.rCol * 0.92;
  }

  // ---------------- visuals ----------------
  function build(sc) {
    scene = sc;
    group = new THREE.Group();
    scene.add(group);
    buildPath();

    const matCol = new THREE.MeshStandardMaterial({ color: 0x1c2a45, roughness: 0.65, metalness: 0.5, emissive: 0x060d1c, emissiveIntensity: 1 });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x131e33, roughness: 0.85, metalness: 0.3 });

    // central column: stacked, slightly tapered segments with glowing seams
    const segs = 9;
    for (let i = 0; i < segs; i++) {
      const y0 = (i / segs) * S.height;
      const h = S.height / segs - 0.25;
      const r0 = S.rCol * (1 - 0.14 * (i / segs));
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 0.94, r0, h, 20, 1), matCol);
      cyl.position.y = y0 + h / 2;
      group.add(cyl);
      const seam = new THREE.Mesh(
        new THREE.TorusGeometry(r0 * 0.97, 0.045, 6, 40),
        new THREE.MeshBasicMaterial({ color: 0x2a78be })
      );
      seam.rotation.x = Math.PI / 2;
      seam.position.y = y0 + h + 0.12;
      group.add(seam);
    }

    // climb ramp: ribbon along the helix
    const inner = S.rPath - 0.55, outer = S.rPath + 0.55;
    const verts = [], norms = [], idx = [];
    const N = path.points.length;
    for (let i = 0; i < N; i++) {
      const p = path.points[i];
      const ang = Math.atan2(p.x, p.z);
      const ix = Math.sin(ang) * inner, iz = Math.cos(ang) * inner;
      const ox = Math.sin(ang) * outer, oz = Math.cos(ang) * outer;
      verts.push(ix, p.y, iz, ox, p.y, oz);
      norms.push(0, 1, 0, 0, 1, 0);
      if (i) {
        const a = (i - 1) * 2, b = a + 1, c = i * 2, e = c + 1;
        idx.push(a, b, c, b, e, c);
      }
    }
    const ribbonG = new THREE.BufferGeometry();
    ribbonG.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    ribbonG.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    ribbonG.setIndex(idx);
    const ribbon = new THREE.Mesh(ribbonG, new THREE.MeshStandardMaterial({
      color: 0x24406b, roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide,
      emissive: 0x0a1a33, emissiveIntensity: 1,
    }));
    group.add(ribbon);

    // glowing outer edge of the ramp (the "railing" enemies get thrown over)
    const edgePts = [];
    for (let i = 0; i < N; i += 2) {
      const p = path.points[i];
      const ang = Math.atan2(p.x, p.z);
      edgePts.push(new THREE.Vector3(Math.sin(ang) * outer, p.y + 0.05, Math.cos(ang) * outer));
    }
    const edge = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(edgePts),
      new THREE.LineBasicMaterial({ color: 0x3f9be8 })
    );
    group.add(edge);
    // matching inner edge hugging the column
    const inEdgePts = [];
    for (let i = 0; i < N; i += 2) {
      const p = path.points[i];
      const ang = Math.atan2(p.x, p.z);
      inEdgePts.push(new THREE.Vector3(Math.sin(ang) * inner, p.y + 0.05, Math.cos(ang) * inner));
    }
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(inEdgePts),
      new THREE.LineBasicMaterial({ color: 0x2a5a8e, transparent: true, opacity: 0.8 })
    ));
    // vertical circuit strips on the column
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, S.height * 0.92, 0.07),
        new THREE.MeshBasicMaterial({ color: k % 2 ? 0x1d4a75 : 0x2a78be, transparent: true, opacity: 0.65 })
      );
      const rr = S.rCol * 0.965;
      strip.position.set(Math.sin(a) * rr, S.height * 0.47, Math.cos(a) * rr);
      group.add(strip);
    }

    // build sockets: hex pads riding just outside the ramp
    const padG = new THREE.CylinderGeometry(0.52, 0.6, 0.16, 6);
    const nSock = Math.floor(path.total / S.socketEvery) - 1;
    for (let i = 1; i <= nSock; i++) {
      const d = i * S.socketEvery;
      const { pos } = at(d);
      const ang = Math.atan2(pos.x, pos.z);
      const sp = new THREE.Vector3(Math.sin(ang) * S.rSocket, pos.y - 0.05, Math.cos(ang) * S.rSocket);
      const pad = new THREE.Mesh(padG, new THREE.MeshStandardMaterial({
        color: 0x1a2b4a, roughness: 0.5, metalness: 0.5,
        emissive: 0x0a2038, emissiveIntensity: 1,
      }));
      pad.position.copy(sp);
      // small arm connecting pad to ramp
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 1.0), matDark);
      arm.position.copy(sp).lerp(pos, 0.5);
      arm.lookAt(pos.x, arm.position.y, pos.z);
      group.add(arm);
      pad.userData.socket = sockets.length;
      group.add(pad);
      sockets.push({ i: sockets.length, pos: sp, mesh: pad, turret: null });
    }

    // summit core
    coreBasePos = new THREE.Vector3(0, S.height + 1.3, 0);
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

    // base: spawn portal ring + ground
    const portal = new THREE.Mesh(
      new THREE.TorusGeometry(S.rPath, 0.14, 8, 48),
      new THREE.MeshBasicMaterial({ color: 0xff3d6e })
    );
    portal.rotation.x = Math.PI / 2;
    portal.position.y = 0.25;
    group.add(portal);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48),
      new THREE.MeshStandardMaterial({ color: 0x060a14, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    group.add(ground);
    const grid = new THREE.PolarGridHelper(30, 12, 8, 48, 0x14263f, 0x0e1a2e);
    grid.position.y = 0.02;
    group.add(grid);

    // starfield
    const starPts = [];
    for (let i = 0; i < 420; i++) {
      const r = 45 + Math.random() * 55, th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 1.6 - 0.8);
      starPts.push(new THREE.Vector3(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) + 14, r * Math.sin(ph) * Math.sin(th)));
    }
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(starPts),
      new THREE.PointsMaterial({ color: 0x9fc3e8, size: 0.16, transparent: true, opacity: 0.8 })
    );
    group.add(stars);
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
    build, update, at, losBlocked, coreHitFlash,
    get sockets() { return sockets; },
    get pathTotal() { return path.total; },
    get corePos() { return coreBasePos; },
    get height() { return S.height; },
    get rPath() { return S.rPath; },
  };
})();
