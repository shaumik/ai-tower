/* HARVEST PROTOCOL — the map: ground, rocks, crystal fields, gates, core,
   plus the navigation grid (flowfield to the core, A* for point-to-point).
   Portrait battlefield: gates on the north edge, your core in the south. */
'use strict';
const MAP = (function () {
  const CS = 1.6;                 // grid cell size
  let scene = null, group = null;
  let W = 34, H = 52, cols = 0, rows = 0;
  let blocked = null;             // static blockers: rocks (+ walls via addBlock)
  let flow = null;                // per-cell step direction toward the core
  let fields = [];                // { pos, reserves, max, crystals[], workers:Set }
  let gates = [];                 // { pos }
  let corePos = null, coreMesh = null, coreLight = null;

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

  // BFS flowfield toward the core: each cell stores the next cell to step to
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
        if (dx && dz && (blocked[idx(cx + dx, cz)] || blocked[idx(cx, cz + dz)])) continue; // no corner cutting
        seen[ni] = 1;
        flow[ni] = cur;
        q.push(ni);
      }
    }
  }
  // next waypoint toward the core from world pos; null = no path (walled off)
  function flowStep(x, z) {
    const c = worldToCell(x, z);
    const next = flow[idx(c.cx, c.cz)];
    if (next < 0) return null;
    const w = cellToWorld(next % cols, (next / cols) | 0);
    return new THREE.Vector3(w.x, 0, w.z);
  }

  // A* for point-to-point (workers, raiders); returns [Vector3] or null
  function findPath(x0, z0, x1, z1) {
    const s = worldToCell(x0, z0), t = worldToCell(x1, z1);
    if (isBlocked(t.cx, t.cz)) {
      // nudge target to nearest free neighbour
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
      if (g.size > 2600) return null; // safety valve
    }
    return null;
  }

  // ---------------- visuals ----------------
  function groundTexture(seedR) {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 512;
    const c = cv.getContext('2d');
    c.fillStyle = '#0a1120';
    c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = seedR() < 0.5 ? 'rgba(20,32,58,0.5)' : 'rgba(6,10,20,0.6)';
      const s = 2 + seedR() * 8;
      c.fillRect(seedR() * 512, seedR() * 512, s, s);
    }
    c.strokeStyle = 'rgba(42,120,190,0.13)'; c.lineWidth = 1;
    for (let p = 0; p <= 512; p += 32) {
      c.beginPath(); c.moveTo(0, p); c.lineTo(512, p); c.stroke();
      c.beginPath(); c.moveTo(p, 0); c.lineTo(p, 512); c.stroke();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(W / 16, H / 16);
    return tex;
  }

  function makeCrystal(scale, mat) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.32 * scale, 1.1 * scale, 5), mat);
    m.rotation.x = (Math.random() - 0.5) * 0.35;
    m.rotation.z = (Math.random() - 0.5) * 0.35;
    return m;
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

    // ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshStandardMaterial({ map: groundTexture(R), roughness: 0.95, metalness: 0.1 })
    );
    ground.rotation.x = -Math.PI / 2;
    group.add(ground);
    // out-of-bounds apron fades to darkness
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 4, H * 4),
      new THREE.MeshBasicMaterial({ color: 0x04070e })
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.06;
    group.add(apron);
    // border glow
    const border = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-W / 2, 0.05, -H / 2), new THREE.Vector3(W / 2, 0.05, -H / 2),
        new THREE.Vector3(W / 2, 0.05, H / 2), new THREE.Vector3(-W / 2, 0.05, H / 2),
      ]),
      new THREE.LineBasicMaterial({ color: 0x2a78be, transparent: true, opacity: 0.6 })
    );
    group.add(border);

    // core (south center)
    corePos = new THREE.Vector3(0, 0, H / 2 - 5);
    const coreBase = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.9, 0.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x1c2a45, roughness: 0.6, metalness: 0.5 })
    );
    coreBase.position.set(corePos.x, 0.4, corePos.z);
    group.add(coreBase);
    coreMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.35, 1),
      new THREE.MeshStandardMaterial({ color: 0x66ddff, emissive: 0x2299dd, emissiveIntensity: 1.5, roughness: 0.25 })
    );
    coreMesh.position.set(corePos.x, 2.1, corePos.z);
    coreMesh.userData.isCore = true;
    group.add(coreMesh);
    const cage = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.85, 0),
      new THREE.MeshBasicMaterial({ color: 0x2a78be, wireframe: true, transparent: true, opacity: 0.45 })
    );
    cage.position.copy(coreMesh.position);
    coreMesh.userData.cage = cage;
    group.add(cage);
    coreLight = new THREE.PointLight(0x55ccff, 1.6, 24);
    coreLight.position.set(corePos.x, 4, corePos.z);
    group.add(coreLight);

    // rocks: blocking clusters, kept off the core/gate approaches' immediate area
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x18243c, roughness: 0.9, metalness: 0.2 });
    for (let i = 0; i < def.rocks; i++) {
      const rx = (R() - 0.5) * (W - 8);
      const rz = -H / 2 + 8 + R() * (H - 20);
      if (Math.hypot(rx - corePos.x, rz - corePos.z) < 8) continue;
      const cluster = new THREE.Group();
      const n = 2 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const s = 0.8 + R() * 1.1;
        const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), rockMat);
        rock.position.set(rx + (R() - 0.5) * 2.2, s * 0.55, rz + (R() - 0.5) * 2.2);
        rock.rotation.set(R() * 3, R() * 3, R() * 3);
        cluster.add(rock);
        const c = worldToCell(rock.position.x, rock.position.z);
        blocked[idx(c.cx, c.cz)] = 1;
      }
      group.add(cluster);
    }

    // crystal fields
    for (const f of def.fields) {
      const fx = (f.x - 0.5) * W;
      const fz = (f.y - 0.5) * H;    // def y: 0=north (gates) … 1=south (core)
      const field = {
        pos: new THREE.Vector3(fx, 0, fz),
        reserves: f.r, max: f.r,
        crystals: [], workers: new Set(),
        mesh: new THREE.Group(),
      };
      const mat = new THREE.MeshStandardMaterial({
        color: 0x7fdcff, emissive: 0x2aa8ff, emissiveIntensity: 0.9,
        roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.95,
      });
      const n = 5 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        const cr = makeCrystal(0.9 + R() * 0.9, mat);
        cr.position.set(fx + (R() - 0.5) * 3.2, 0.5, fz + (R() - 0.5) * 3.2);
        field.crystals.push(cr);
        field.mesh.add(cr);
      }
      const glow = new THREE.PointLight(0x2aa8ff, 0.8, 9);
      glow.position.set(fx, 2, fz);
      field.mesh.add(glow);
      field.light = glow;
      group.add(field.mesh);
      fields.push(field);
    }

    // gates on the north edge
    const gateMat = new THREE.MeshBasicMaterial({ color: 0xff3d6e });
    for (const gx of def.gates) {
      const x = (gx - 0.5) * W;
      const z = -H / 2 + 1.2;
      const arch = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.16, 8, 24, Math.PI), gateMat);
      arch.position.set(x, 0.1, z);
      group.add(arch);
      const gl = new THREE.PointLight(0xff3050, 0.8, 10);
      gl.position.set(x, 2, z);
      group.add(gl);
      gates.push({ pos: new THREE.Vector3(x, 0, z + 1) });
    }

    rebuildFlow();
  }

  // deplete crystals visually as reserves drain
  function mineFrom(field, amount) {
    const got = Math.min(field.reserves, amount);
    field.reserves -= got;
    const k = field.reserves / field.max;
    for (let i = 0; i < field.crystals.length; i++) {
      const cr = field.crystals[i];
      const keep = (i + 1) / field.crystals.length <= k + 0.15;
      cr.scale.setScalar(Math.max(0.18, k * (keep ? 1 : 0.5)));
    }
    if (field.light) field.light.intensity = 0.15 + k * 0.7;
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
      coreMesh.rotation.y += dt * 0.5;
      coreMesh.userData.cage.rotation.y -= dt * 0.3;
      coreLight.intensity = 1.5 + Math.sin(t * 2.2) * 0.25;
    }
  }
  function coreHitFlash() {
    if (!coreMesh) return;
    coreMesh.material.emissive.setHex(0xff2244);
    setTimeout(() => coreMesh && coreMesh.material.emissive.setHex(0x2299dd), 160);
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
