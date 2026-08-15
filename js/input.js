/* HARVEST PROTOCOL — one-thumb RTS camera: drag to pan the battlefield,
   tap to select, drag the ghost while placing a building. */
'use strict';
const INPUT = (function () {
  let camera = null, dom = null;
  let tx = 0, tz = 10;          // camera target on the ground
  let zoom = 1;                 // 0.7 (close) … 1.6 (far)
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  let down = null;
  let placing = null;           // { type, ghost, pos, valid }

  function init(cam, el, onTap) {
    camera = cam; dom = el;

    el.addEventListener('pointerdown', e => {
      down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!down.moved && dx * dx + dy * dy < 64) return;
      down.moved = true;
      const px = e.clientX - (down.lx !== undefined ? down.lx : down.x);
      const py = e.clientY - (down.ly !== undefined ? down.ly : down.y);
      down.lx = e.clientX; down.ly = e.clientY;
      const k = 0.035 * zoom;
      if (placing) {
        // in placement mode the drag moves the ghost, not the camera
        placing.pos.x += px * k;
        placing.pos.z += py * k;
        clampToMap(placing.pos);
        syncGhost();
      } else {
        tx -= px * k;
        tz -= py * k;
        clampCam();
      }
    });
    el.addEventListener('pointerup', e => {
      if (down && !down.moved && performance.now() - down.t < 400) {
        if (placing) {
          const hit = groundAt(e.clientX, e.clientY);
          if (hit) { placing.pos.copy(hit); clampToMap(placing.pos); syncGhost(); }
        } else {
          pick(e.clientX, e.clientY, onTap);
        }
      }
      down = null;
    });
    el.addEventListener('pointercancel', () => { down = null; });
    el.addEventListener('wheel', e => {
      zoom = UTIL.clamp(zoom + e.deltaY * 0.0012, 0.7, 1.6);
    }, { passive: true });
    window.addEventListener('keydown', e => {
      const step = 3;
      if (e.key === 'ArrowUp') { tz -= step; clampCam(); }
      if (e.key === 'ArrowDown') { tz += step; clampCam(); }
      if (e.key === 'ArrowLeft') { tx -= step; clampCam(); }
      if (e.key === 'ArrowRight') { tx += step; clampCam(); }
    });
  }

  function clampCam() {
    tx = UTIL.clamp(tx, -MAP.W / 2 + 4, MAP.W / 2 - 4);
    tz = UTIL.clamp(tz, -MAP.H / 2 + 4, MAP.H / 2 + 2);
  }
  function clampToMap(v) {
    v.x = UTIL.clamp(v.x, -MAP.W / 2 + 1, MAP.W / 2 - 1);
    v.z = UTIL.clamp(v.z, -MAP.H / 2 + 1, MAP.H / 2 - 1);
  }

  function groundAt(cx, cy) {
    ptr.x = (cx / window.innerWidth) * 2 - 1;
    ptr.y = -(cy / window.innerHeight) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const out = new THREE.Vector3();
    return ray.ray.intersectPlane(groundPlane, out) ? out : null;
  }

  function pick(cx, cy, onTap) {
    ptr.x = (cx / window.innerWidth) * 2 - 1;
    ptr.y = -(cy / window.innerHeight) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    // buildings first, then workers, then crystal fields
    const bMeshes = GAME.buildings.filter(b => b.alive).map(b => b.mesh);
    let hits = ray.intersectObjects(bMeshes, true);
    if (hits.length) {
      let o = hits[0].object;
      while (o && !o.userData.building) o = o.parent;
      if (o) { onTap({ building: o.userData.building }); return; }
    }
    const wMeshes = GAME.workers.filter(w => w.alive).map(w => w.mesh);
    hits = ray.intersectObjects(wMeshes, true);
    if (hits.length) {
      let o = hits[0].object;
      while (o && !o.userData.worker) o = o.parent;
      if (o) { onTap({ worker: o.userData.worker }); return; }
    }
    const fMeshes = MAP.fields.map(f => f.mesh);
    hits = ray.intersectObjects(fMeshes, true);
    if (hits.length) {
      const fm = hits[0].object;
      for (const f of MAP.fields) {
        let found = false;
        f.mesh.traverse(o => { if (o === fm) found = true; });
        if (found) { onTap({ field: f }); return; }
      }
    }
    const gpt = groundAt(cx, cy);
    onTap(gpt ? { ground: gpt } : {});
  }

  // ---------------- placement ghost ----------------
  function startPlacing(type) {
    stopPlacing();
    const def = CONFIG.BUILDINGS[type];
    const geo = def.blocks
      ? new THREE.BoxGeometry(MAP.CS * 0.92, 1.5, MAP.CS * 0.92)
      : new THREE.CylinderGeometry(0.7, 0.7, 1.1, 8);
    const ghost = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: def.color, transparent: true, opacity: 0.5, depthWrite: false,
    }));
    const ring = def.range ? new THREE.Mesh(
      new THREE.RingGeometry(def.range - 0.08, def.range, 48),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    ) : null;
    if (ring) { ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; }
    placing = { type, ghost, ring, pos: new THREE.Vector3(tx, 0, tz), valid: false };
    GAME.scene.add(ghost);
    if (ring) GAME.scene.add(ring);
    syncGhost();
  }
  function syncGhost() {
    if (!placing) return;
    const p = placing;
    // snap preview for walls
    let px = p.pos.x, pz = p.pos.z;
    if (CONFIG.BUILDINGS[p.type].blocks) {
      const c = MAP.worldToCell(px, pz);
      const w = MAP.cellToWorld(c.cx, c.cz);
      px = w.x; pz = w.z;
    }
    p.ghost.position.set(px, 0.75, pz);
    if (p.ring) p.ring.position.set(px, 0.06, pz);
    p.valid = GAME.canPlace(p.type, px, pz);
    p.ghost.material.color.setHex(p.valid ? CONFIG.BUILDINGS[p.type].color : 0xff3355);
  }
  function stopPlacing() {
    if (!placing) return;
    GAME.scene.remove(placing.ghost);
    placing.ghost.geometry.dispose();
    placing.ghost.material.dispose();
    if (placing.ring) {
      GAME.scene.remove(placing.ring);
      placing.ring.geometry.dispose();
      placing.ring.material.dispose();
    }
    placing = null;
  }
  function confirmPlacing() {
    if (!placing || !placing.valid) { AUDIO.sfx.error(); return null; }
    const b = GAME.placeBuilding(placing.type, placing.ghost.position.x, placing.ghost.position.z);
    if (b) stopPlacing();
    return b;
  }

  function update(dt) {
    const camH = 26 * zoom, camD = 13 * zoom;
    camera.position.set(tx, camH, tz + camD);
    camera.lookAt(tx, 0, tz);
  }

  function focusOn(x, z) { tx = x; tz = z; clampCam(); }
  function focusBase() { focusOn(MAP.corePos.x, MAP.corePos.z - 6); }

  return {
    init, update, focusOn, focusBase,
    startPlacing, stopPlacing, confirmPlacing,
    get placing() { return placing; },
  };
})();
