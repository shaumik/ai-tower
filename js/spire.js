/* NEURAL SPIRE — the tower: scene, procedurally generated climb path, build sockets.
   Every run rolls a new spire: winding arcs, switchbacks, steep risers and flat
   plaza rings, with the ramp radius swelling and tightening as it climbs. */
'use strict';
const SPIRE = (function () {
  const S = CONFIG.SPIRE;
  let scene = null, group = null;
  let sockets = [];     // { i, pos, mesh, turret|null }
  let path = null;      // { points[], cum[], total }
  let coreMesh = null, coreLight = null, coreBasePos = null;
  let curSeed = 1;

  // ---------------- procedural helix path ----------------
  // The path is a chain of segments. Each segment turns (arc / switchback /
  // riser / plaza) while climbing, and drifts toward its own target radius.
  function buildPath(seed) {
    const R = UTIL.rng(seed);
    path = { points: [], cum: [], total: 0 };
    let ang = R() * Math.PI * 2;
    let y = 0.6;
    let dir = R() < 0.5 ? 1 : -1;      // winding direction, flips at switchbacks
    let radius = S.rPath;
    let plazas = 0, segsSinceFlip = 0;

    const segs = [];
    while (y < S.height - 1.2) {
      const roll = R();
      let type;
      if (roll < 0.52) type = 'arc';
      else if (roll < 0.68 && segsSinceFlip >= 1) type = 'switchback';
      else if (roll < 0.85) type = 'riser';
      else if (plazas < 2 && y > 6 && y < S.height - 8) type = 'plaza';
      else type = 'arc';

      let dAng, dY, rTarget = 3.2 + R() * 1.3;
      if (type === 'arc') { dAng = (Math.PI * 0.6 + R() * Math.PI * 0.6) * dir; dY = 3.2 + R() * 1.6; segsSinceFlip++; }
      else if (type === 'switchback') { dir = -dir; segsSinceFlip = 0; dAng = (Math.PI * 0.7 + R() * Math.PI * 0.5) * dir; dY = 2.6 + R() * 1.2; }
      else if (type === 'riser') { dAng = (Math.PI * 0.2 + R() * Math.PI * 0.15) * dir; dY = 4.2 + R() * 1.6; segsSinceFlip++; }
      else { plazas++; dAng = Math.PI * 2 * dir; dY = 1.3; rTarget = 3.9 + R() * 0.7; segsSinceFlip++; }
      dY = Math.min(dY, S.height - 1.0 - y);
      segs.push({ ang0: ang, dAng, y0: y, dY, r0: radius, r1: rTarget });
      ang += dAng; y += dY; radius = rTarget;
    }

    let prev = null, d = 0;
    for (const sg of segs) {
      const steps = Math.max(10, Math.round(Math.abs(sg.dAng) * 22));
      for (let i = 0; i < steps; i++) {
        const t = i / steps;
        const a = sg.ang0 + sg.dAng * t;
        // ease the radius between segment targets so the ramp flows
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
    const ax = a.x, az = a.z, bx = b.x, bz = b.z;
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    let t = len2 ? -(ax * dx + az * dz) / len2 : 0;
    t = UTIL.clamp(t, 0, 1);
    const cx = ax + dx * t, cz = az + dz * t;
    return (cx * cx + cz * cz) < S.rCol * S.rCol * 0.92;
  }

  // ---------------- visuals ----------------
  function disposeGroup() {
    if (!group) return;
    scene.remove(group);
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
    group = null;
    sockets = [];
    coreMesh = null; coreLight = null;
  }

  function regen(seed) {
    curSeed = seed;
    disposeGroup();
    group = new THREE.Group();
    scene.add(group);
    buildPath(seed);

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

    // climb ramp: ribbon following the generated path, width around each
    // point's own radius (the radius varies along the tower)
    const verts = [], norms = [], idx = [];
    const N = path.points.length;
    const HALF = 0.55;
    for (let i = 0; i < N; i++) {
      const p = path.points[i];
      const pr = Math.max(0.6, Math.hypot(p.x, p.z));
      const ang = Math.atan2(p.x, p.z);
      const ri = pr - HALF, ro = pr + HALF;
      verts.push(Math.sin(ang) * ri, p.y, Math.cos(ang) * ri, Math.sin(ang) * ro, p.y, Math.cos(ang) * ro);
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

    // glowing edges of the ramp (outer = the railing enemies get thrown over)
    const outPts = [], inPts = [];
    for (let i = 0; i < N; i += 2) {
      const p = path.points[i];
      const pr = Math.max(0.6, Math.hypot(p.x, p.z));
      const ang = Math.atan2(p.x, p.z);
      outPts.push(new THREE.Vector3(Math.sin(ang) * (pr + HALF), p.y + 0.05, Math.cos(ang) * (pr + HALF)));
      inPts.push(new THREE.Vector3(Math.sin(ang) * (pr - HALF), p.y + 0.05, Math.cos(ang) * (pr - HALF)));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outPts), new THREE.LineBasicMaterial({ color: 0x3f9be8 })));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(inPts), new THREE.LineBasicMaterial({ color: 0x2a5a8e, transparent: true, opacity: 0.8 })));

    // build sockets: hex pads riding just outside the ramp
    const padG = new THREE.CylinderGeometry(0.52, 0.6, 0.16, 6);
    const nSock = Math.floor(path.total / S.socketEvery) - 1;
    for (let i = 1; i <= nSock; i++) {
      const d = i * S.socketEvery;
      const { pos } = at(d);
      const pr = Math.max(0.6, Math.hypot(pos.x, pos.z));
      const ang = Math.atan2(pos.x, pos.z);
      const sp = new THREE.Vector3(Math.sin(ang) * (pr + 1.0), pos.y - 0.05, Math.cos(ang) * (pr + 1.0));
      const pad = new THREE.Mesh(padG, new THREE.MeshStandardMaterial({
        color: 0x1a2b4a, roughness: 0.5, metalness: 0.5,
        emissive: 0x0a2038, emissiveIntensity: 1,
      }));
      pad.position.copy(sp);
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

    // base: spawn portal ring at the path start + ground
    const p0 = path.points[0];
    const portal = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.14, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xff3d6e })
    );
    portal.rotation.x = Math.PI / 2;
    portal.position.set(p0.x, 0.25, p0.z);
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
    group.add(new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(starPts),
      new THREE.PointsMaterial({ color: 0x9fc3e8, size: 0.16, transparent: true, opacity: 0.8 })
    ));
  }

  function build(sc, seed) {
    scene = sc;
    regen(seed);
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
    build, regen, update, at, losBlocked, coreHitFlash,
    get sockets() { return sockets; },
    get pathTotal() { return path.total; },
    get corePos() { return coreBasePos; },
    get height() { return S.height; },
    get rPath() { return S.rPath; },
    get seed() { return curSeed; },
  };
})();
