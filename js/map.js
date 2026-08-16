/* HARVEST PROTOCOL — the map: sculpted low-poly ground, rocks, crystal
   fields, gates, core, plus the navigation grid (flowfield to the core,
   A* for point-to-point). Portrait battlefield: gates north, core south. */
'use strict';
const MAP = (function () {
  const CS = 1.6;
  let scene = null, group = null;
  let W = 34, H = 52, cols = 0, rows = 0;
  let blocked = null;
  let flow = null;
  let fields = [];
  let gates = [];
  let corePos = null, coreMesh = null, coreLight = null, coreRing = null;

  // ---------------- grid helpers ----------------
  const idx = (cx, cz) => cz * cols + cx;
  function worldToCell(x, z) {
    return { cx: UTIL.clamp(Math.floor((x + W / 2) / CS), 0, cols - 1), cz: UTIL.clamp(Math.floor((z + H / 2) / CS), 0, rows - 1) };
  }
  function cellToWorld(cx, cz) {
    return { x: cx * CS - W / 2 + CS / 2, z: cz * CS - H / 2 + CS / 2 };
  }
  function isBlocked(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) return true;
    return blocked[idx(cx, cz)] > 0;
  }
  function addBlock(x, z) { const c = worldToCell(x, z); blocked[idx(c.cx, c.cz)]++; rebuildFlow(); return c; }
  function removeBlock(cx, cz) { blocked[idx(cx, cz)] = Math.max(0, blocked[idx(cx, cz)] - 1); rebuildFlow(); }

  function rebuildFlow() {
    flow = new Int32Array(cols * rows).fill(-1);
    const cc = worldToCell(corePos.x, corePos.z);
    const q = [idx(cc.cx, cc.cz)];
    const seen = new Uint8Array(cols * rows);
    seen[q[0]] = 1;
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      const cx = cur % cols, cz = (cur / cols) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
        const ni = idx(nx, nz);
        if (seen[ni] || blocked[ni]) continue;
        if (dx && dz && (blocked[idx(cx + dx, cz)] || blocked[idx(cx, cz + dz)])) continue;
        seen[ni] = 1;
        flow[ni] = cur;
        q.push(ni);
      }
    }
  }
  function flowStep(x, z) {
    const c = worldToCell(x, z);
    const next = flow[idx(c.cx, c.cz)];
    if (next < 0) return null;
    const w = cellToWorld(next % cols, (next / cols) | 0);
    return new THREE.Vector3(w.x, 0, w.z);
  }

  function findPath(x0, z0, x1, z1) {
    const s = worldToCell(x0, z0), t = worldToCell(x1, z1);
    if (isBlocked(t.cx, t.cz)) {
      let found = false;
      for (let r = 1; r <= 3 && !found; r++) {
        for (let dx = -r; dx <= r && !found; dx++) for (let dz = -r; dz <= r && !found; dz++) {
          if (!isBlocked(t.cx + dx, t.cz + dz)) { t.cx += dx; t.cz += dz; found = true; }
        }
      }
      if (!found) return null;
    }
    const open = [[0, s.cx, s.cz]];
    const g = new Map([[idx(s.cx, s.cz), 0]]);
    const from = new Map();
    const h = (cx, cz) => Math.hypot(cx - t.cx, cz - t.cz);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, cx, cz] = open.splice(bi, 1)[0];
      if (cx === t.cx && cz === t.cz) {
        const pts = [];
        let cur = idx(cx, cz);
        while (from.has(cur)) {
          const w = cellToWorld(cur % cols, (cur / cols) | 0);
          pts.unshift(new THREE.Vector3(w.x, 0, w.z));
          cur = from.get(cur);
        }
        return pts.length ? pts : [new THREE.Vector3(x1, 0, z1)];
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = cx + dx, nz = cz + dz;
        if (isBlocked(nx, nz)) continue;
        if (dx && dz && (isBlocked(cx + dx, cz) || isBlocked(cx, cz + dz))) continue;
        const ni = idx(nx, nz);
        const ng = g.get(idx(cx, cz)) + Math.hypot(dx, dz);
        if (g.has(ni) && g.get(ni) <= ng) continue;
        g.set(ni, ng);
        from.set(ni, idx(cx, cz));
        open.push([ng + h(nx, nz), nx, nz]);
      }
      if (g.size > 2600) return null;
    }
    return null;
  }

  // ---------------- visuals ----------------
  function flatMat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({
      color, flatShading: true, roughness: 0.85, metalness: 0.08, envMapIntensity: 0.35,
    }, opts || {}));
  }

  function dispose() {
    if (!group) return;
    scene.remove(group);
    group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of mats) { if (m.map) m.map.dispose(); m.dispose(); }
    });
    group = null;
  }

  function build(sc, level) {
    scene = sc;
    dispose();
    group = new THREE.Group();
    scene.add(group);
    fields = []; gates = [];

    const def = level.map;
    W = def.w; H = def.h;
    cols = Math.ceil(W / CS); rows = Math.ceil(H / CS);
    blocked = new Uint8Array(cols * rows);
    const R = UTIL.rng(level.seed);
    corePos = new THREE.Vector3(0, 0, H / 2 - 5);

    // ---- terrain: gently sculpted, vertex-colored, flat-shaded ----
    const segX = Math.round(W / 1.4), segZ = Math.round(H / 1.4);
    const gGeo = new THREE.PlaneGeometry(W, H, segX, segZ);
    gGeo.rotateX(-Math.PI / 2);
    const pos = gGeo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const base = new THREE.Color(0x0e1424);
    const soil = new THREE.Color(0x131a2c);
    const vein = new THREE.Color(0x1c3a4a);
    const scorch = new THREE.Color(0x241423);
    const c0 = new THREE.Color();
    const fieldPts = def.fields.map(f => ({ x: (f.x - 0.5) * W, z: (f.y - 0.5) * H }));
    const gatePts = def.gates.map(gx => ({ x: (gx - 0.5) * W, z: -H / 2 + 1.2 }));
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i), vz = pos.getZ(i);
      // soft height noise, flattened near the core and gates
      let hgt = (R() - 0.5) * 0.34;
      const dCore = Math.hypot(vx - corePos.x, vz - corePos.z);
      if (dCore < 7) hgt *= dCore / 7;
      for (const gp of gatePts) { const d = Math.hypot(vx - gp.x, vz - gp.z); if (d < 6) hgt *= d / 6; }
      pos.setY(i, hgt - 0.05);
      // color: mottled soil, teal veins near crystal fields, warm stain at gates
      c0.copy(base).lerp(soil, R());
      for (const fp of fieldPts) {
        const d = Math.hypot(vx - fp.x, vz - fp.z);
        if (d < 7) c0.lerp(vein, (1 - d / 7) * 0.75);
      }
      for (const gp of gatePts) {
        const d = Math.hypot(vx - gp.x, vz - gp.z);
        if (d < 7) c0.lerp(scorch, (1 - d / 7) * 0.7);
      }
      colors[i * 3] = c0.r; colors[i * 3 + 1] = c0.g; colors[i * 3 + 2] = c0.b;
    }
    gGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    gGeo.computeVertexNormals();
    const ground = new THREE.Mesh(gGeo, new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.97, metalness: 0.0, envMapIntensity: 0.15,
    }));
    ground.receiveShadow = true;
    group.add(ground);
    // void apron beyond the play area
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(W * 4, H * 4), new THREE.MeshBasicMaterial({ color: 0x05070d }));
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.6;
    group.add(apron);
    // border light rail
    const border = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-W / 2, 0.25, -H / 2), new THREE.Vector3(W / 2, 0.25, -H / 2),
        new THREE.Vector3(W / 2, 0.25, H / 2), new THREE.Vector3(-W / 2, 0.25, H / 2),
      ]),
      new THREE.LineBasicMaterial({ color: 0x2a78be, transparent: true, opacity: 0.45 })
    );
    group.add(border);

    // ---- the core: octagon platform, dome, orbit ring, mast ----
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.5, 0.7, 8), flatMat(0x232d47, { metalness: 0.3, roughness: 0.6 }));
    plat.position.set(corePos.x, 0.35, corePos.z);
    plat.castShadow = plat.receiveShadow = true;
    group.add(plat);
    const step = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.5, 8), flatMat(0x2c3a58, { metalness: 0.3, roughness: 0.55 }));
    step.position.set(corePos.x, 0.95, corePos.z);
    step.castShadow = true;
    group.add(step);
    coreMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: 0x5fc4ec, emissive: 0x1d86c0, emissiveIntensity: 0.42, roughness: 0.25, metalness: 0.1 })
    );
    coreMesh.position.set(corePos.x, 1.2, corePos.z);
    coreMesh.castShadow = true;
    coreMesh.userData.isCore = true;
    group.add(coreMesh);
    coreRing = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.09, 8, 32), flatMat(0x3f9be8, { emissive: 0x1d4a75, emissiveIntensity: 1, metalness: 0.4, roughness: 0.4 }));
    coreRing.rotation.x = Math.PI / 2.4;
    coreRing.position.set(corePos.x, 2.2, corePos.z);
    group.add(coreRing);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 2.4, 6), flatMat(0x36466a));
    mast.position.set(corePos.x + 1.9, 1.8, corePos.z + 1.4);
    mast.castShadow = true;
    group.add(mast);
    coreLight = new THREE.PointLight(0x55ccff, 1.0, 20);
    coreLight.position.set(corePos.x, 4, corePos.z);
    group.add(coreLight);

    // ---- rocks: stacked flat-shaded chunks ----
    for (let i = 0; i < def.rocks; i++) {
      const rx = (R() - 0.5) * (W - 8);
      const rz = -H / 2 + 8 + R() * (H - 20);
      if (Math.hypot(rx - corePos.x, rz - corePos.z) < 8) continue;
      const cluster = new THREE.Group();
      const n = 2 + Math.floor(R() * 3);
      const tone = 0.85 + R() * 0.4;
      for (let k = 0; k < n; k++) {
        const s = 0.7 + R() * 1.2;
        const col = new THREE.Color(0x222c46).multiplyScalar(tone * (0.85 + R() * 0.3));
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), flatMat(col.getHex()));
        rock.position.set(rx + (R() - 0.5) * 2.4, s * 0.5, rz + (R() - 0.5) * 2.4);
        rock.rotation.set(R() * 3, R() * 3, R() * 3);
        rock.scale.y = 0.7 + R() * 0.5;
        rock.castShadow = rock.receiveShadow = true;
        cluster.add(rock);
        const c = worldToCell(rock.position.x, rock.position.z);
        blocked[idx(c.cx, c.cz)] = 1;
      }
      group.add(cluster);
    }

    // ---- crystal fields: shard clusters with rubble ----
    for (const f of def.fields) {
      const fx = (f.x - 0.5) * W;
      const fz = (f.y - 0.5) * H;
      const field = {
        pos: new THREE.Vector3(fx, 0, fz),
        reserves: f.r, max: f.r,
        crystals: [], workers: new Set(),
        mesh: new THREE.Group(),
      };
      const shardMat = new THREE.MeshPhysicalMaterial({
        color: 0x7adcf2, emissive: 0x1e9cd8, emissiveIntensity: 0.62,
        flatShading: true, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.96,
        clearcoat: 1.0, clearcoatRoughness: 0.12, envMapIntensity: 1.6,
      });
      const n = 6 + Math.floor(R() * 4);
      for (let k = 0; k < n; k++) {
        const hgt = 0.9 + R() * 1.7;
        const shard = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.28 + R() * 0.14, hgt, 5), shardMat);
        const a = R() * Math.PI * 2, rr = R() * 2.6;
        shard.position.set(fx + Math.sin(a) * rr, hgt * 0.42, fz + Math.cos(a) * rr);
        shard.rotation.set((R() - 0.5) * 0.55, R() * 3, (R() - 0.5) * 0.55);
        shard.castShadow = true;
        field.crystals.push(shard);
        field.mesh.add(shard);
      }
      for (let k = 0; k < 5; k++) {
        const peb = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16 + R() * 0.14, 0), flatMat(0x24405c));
        const a = R() * Math.PI * 2, rr = 1 + R() * 3;
        peb.position.set(fx + Math.sin(a) * rr, 0.1, fz + Math.cos(a) * rr);
        peb.castShadow = true;
        field.mesh.add(peb);
      }
      const glow = new THREE.PointLight(0x2aa8ff, 0.75, 9);
      glow.position.set(fx, 2, fz);
      field.mesh.add(glow);
      field.light = glow;
      group.add(field.mesh);
      fields.push(field);
    }

    // ---- gates: pylon arches with an inner glow ----
    for (const gx of def.gates) {
      const x = (gx - 0.5) * W;
      const z = -H / 2 + 1.2;
      const pyl = flatMat(0x2c2033, { metalness: 0.3, roughness: 0.6 });
      for (const side of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.6, 0.55), pyl);
        p.position.set(x + side * 1.7, 1.3, z);
        p.rotation.y = 0.4 * side;
        p.castShadow = true;
        group.add(p);
      }
      const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.45, 0.6), pyl);
      lintel.position.set(x, 2.75, z);
      lintel.castShadow = true;
      group.add(lintel);
      const maw = new THREE.Mesh(
        new THREE.PlaneGeometry(3.1, 2.3),
        new THREE.MeshBasicMaterial({ color: 0xff2f55, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      );
      maw.position.set(x, 1.35, z);
      group.add(maw);
      const gl = new THREE.PointLight(0xff3050, 0.9, 11);
      gl.position.set(x, 2, z + 1.5);
      group.add(gl);
      gates.push({ pos: new THREE.Vector3(x, 0, z + 1) });
    }

    rebuildFlow();
  }

  function mineFrom(field, amount) {
    const got = Math.min(field.reserves, amount);
    field.reserves -= got;
    const k = field.reserves / field.max;
    for (let i = 0; i < field.crystals.length; i++) {
      const cr = field.crystals[i];
      const keep = (i + 1) / field.crystals.length <= k + 0.15;
      cr.scale.setScalar(Math.max(0.18, k * (keep ? 1 : 0.5)));
    }
    if (field.light) field.light.intensity = 0.15 + k * 0.6;
    return got;
  }
  function richestField() {
    let best = null;
    for (const f of fields) if (f.reserves > 0 && (!best || f.reserves > best.reserves)) best = f;
    return best;
  }
  function totalReserves() { return fields.reduce((s, f) => s + f.reserves, 0); }

  let t = 0;
  function update(dt) {
    t += dt;
    if (coreMesh) {
      coreMesh.rotation.y += dt * 0.4;
      coreRing.rotation.z += dt * 0.5;
      coreLight.intensity = 0.95 + Math.sin(t * 2.2) * 0.15;
      coreMesh.material.emissiveIntensity = 0.42 + Math.sin(t * 2.2) * 0.08;
    }
  }
  function coreHitFlash() {
    if (!coreMesh) return;
    coreMesh.material.emissive.setHex(0xff2244);
    setTimeout(() => coreMesh && coreMesh.material.emissive.setHex(0x2aa8e0), 160);
  }

  return {
    build, update, coreHitFlash,
    worldToCell, cellToWorld, isBlocked, addBlock, removeBlock, flowStep, findPath,
    mineFrom, richestField, totalReserves,
    get fields() { return fields; },
    get gates() { return gates; },
    get corePos() { return corePos; },
    get W() { return W; }, get H() { return H; }, get CS() { return CS; },
  };
})();
