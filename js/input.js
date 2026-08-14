/* NEURAL SPIRE — one-thumb camera (drag to orbit + climb) and tap picking */
'use strict';
const INPUT = (function () {
  let camera = null, dom = null;
  let az = 0.6;              // azimuth around the spire
  let focusY = 6;            // camera focus height
  let dist = 19;
  let lastUser = -1e9;       // time of last manual camera input
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();

  let down = null;           // { x, y, t, moved }

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
      az -= (e.clientX - (down.lx !== undefined ? down.lx : down.x)) * 0.007;
      focusY += (e.clientY - (down.ly !== undefined ? down.ly : down.y)) * 0.035;
      focusY = UTIL.clamp(focusY, 3, SPIRE.height + 3);
      down.lx = e.clientX; down.ly = e.clientY;
      lastUser = performance.now();
    });
    el.addEventListener('pointerup', e => {
      if (down && !down.moved && performance.now() - down.t < 400) {
        pick(e.clientX, e.clientY, onTap);
      }
      down = null;
    });
    el.addEventListener('pointercancel', () => { down = null; });
    el.addEventListener('wheel', e => {
      focusY = UTIL.clamp(focusY + e.deltaY * 0.02, 3, SPIRE.height + 3);
      lastUser = performance.now();
    }, { passive: true });
    window.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp') { focusY = UTIL.clamp(focusY + 2, 3, SPIRE.height + 3); lastUser = performance.now(); }
      if (e.key === 'ArrowDown') { focusY = UTIL.clamp(focusY - 2, 3, SPIRE.height + 3); lastUser = performance.now(); }
      if (e.key === 'ArrowLeft') { az += 0.25; lastUser = performance.now(); }
      if (e.key === 'ArrowRight') { az -= 0.25; lastUser = performance.now(); }
    });
  }

  function pick(cx, cy, onTap) {
    ptr.x = (cx / window.innerWidth) * 2 - 1;
    ptr.y = -(cy / window.innerHeight) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    // turrets first (their meshes sit on sockets), then empty pads
    const turretMeshes = GAME.turrets.map(t => t.mesh);
    let hits = ray.intersectObjects(turretMeshes, true);
    if (hits.length) {
      let o = hits[0].object;
      while (o && !o.userData.turret) o = o.parent;
      if (o) { onTap({ turret: o.userData.turret }); return; }
    }
    const padMeshes = SPIRE.sockets.filter(s => !s.turret).map(s => s.mesh);
    hits = ray.intersectObjects(padMeshes, false);
    if (hits.length) {
      onTap({ socket: SPIRE.sockets[hits[0].object.userData.socket] });
      return;
    }
    onTap({});
  }

  // camera follows the action when the player is idle during combat
  function update(dt) {
    if (GAME.phase === 'combat' && performance.now() - lastUser > 5000) {
      let leadY = null;
      for (const e of GAME.enemies) {
        if (!e.alive || e.state === 'air') continue;
        const y = e.mesh.position.y;
        if (leadY === null || y > leadY) leadY = y;
      }
      if (leadY !== null) focusY = UTIL.lerp(focusY, UTIL.clamp(leadY + 1.5, 3, SPIRE.height + 3), dt * 1.2);
    }
    const px = Math.sin(az) * dist, pz = Math.cos(az) * dist;
    camera.position.set(px, focusY + 6.5, pz);
    camera.lookAt(0, focusY + 0.5, 0);
  }

  function focusOn(y) { focusY = UTIL.clamp(y, 3, SPIRE.height + 3); }
  function focusBase() { focusOn(5); }

  return { init, update, focusOn, focusBase };
})();
