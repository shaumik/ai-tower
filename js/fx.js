/* NEURAL SPIRE — lightweight pooled effects: beams, bursts, rings, floating text */
'use strict';
const FX = (function () {
  let scene = null;
  const live = [];   // { kind, obj, ttl, t0, ... }

  function init(sc) { scene = sc; }

  function add(item) { live.push(item); scene.add(item.obj); }

  function beam(a, b, color, thick) {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, linewidth: thick || 1 });
    add({ kind: 'beam', obj: new THREE.Line(g, m), ttl: 0.09, t0: 0.09 });
  }

  function zap(a, b, color) {
    // jittered lightning polyline
    const pts = [a.clone()];
    const n = 5;
    for (let i = 1; i < n; i++) {
      const p = a.clone().lerp(b, i / n);
      p.x += (Math.random() - 0.5) * 0.7; p.y += (Math.random() - 0.5) * 0.7; p.z += (Math.random() - 0.5) * 0.7;
      pts.push(p);
    }
    pts.push(b.clone());
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1 });
    add({ kind: 'beam', obj: new THREE.Line(g, m), ttl: 0.12, t0: 0.12 });
  }

  function ring(pos, radius, color) {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.06, 6, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    m.position.copy(pos);
    m.rotation.x = Math.PI / 2;
    add({ kind: 'ring', obj: m, ttl: 0.45, t0: 0.45, grow: radius });
  }

  function burst(pos, color, count, size) {
    const geo = new THREE.BufferGeometry();
    const n = count || 10;
    const p = new Float32Array(n * 3), v = [];
    for (let i = 0; i < n; i++) {
      p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
      v.push(new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ color, size: size || 0.22, transparent: true, opacity: 1 });
    add({ kind: 'burst', obj: new THREE.Points(geo, mat), ttl: 0.6, t0: 0.6, vel: v });
  }

  // floating text as a canvas sprite (damage numbers, salvage popups)
  function text(pos, str, cssColor, scale) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 80;
    const c = cv.getContext('2d');
    c.font = '900 44px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = cssColor; c.shadowBlur = 14;
    c.fillStyle = cssColor;
    c.fillText(str, 128, 40);
    const tex = new THREE.CanvasTexture(cv);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    const sc = scale || 1;
    spr.scale.set(3.2 * sc, 1.0 * sc, 1);
    spr.position.copy(pos);
    add({ kind: 'text', obj: spr, ttl: 0.9, t0: 0.9, rise: 1.6 });
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const f = live[i];
      f.ttl -= dt;
      const k = Math.max(0, f.ttl / f.t0);
      if (f.kind === 'beam') f.obj.material.opacity = k;
      else if (f.kind === 'ring') {
        const r = 0.3 + (1 - k) * f.grow;
        f.obj.scale.setScalar(r / 0.3);
        f.obj.material.opacity = k * 0.9;
      } else if (f.kind === 'burst') {
        const attr = f.obj.geometry.getAttribute('position');
        for (let j = 0; j < f.vel.length; j++) {
          f.vel[j].y -= 12 * dt;
          attr.array[j * 3] += f.vel[j].x * dt;
          attr.array[j * 3 + 1] += f.vel[j].y * dt;
          attr.array[j * 3 + 2] += f.vel[j].z * dt;
        }
        attr.needsUpdate = true;
        f.obj.material.opacity = k;
      } else if (f.kind === 'text') {
        f.obj.position.y += f.rise * dt;
        f.obj.material.opacity = k < 0.8 ? k / 0.8 : 1;
      }
      if (f.ttl <= 0) {
        scene.remove(f.obj);
        if (f.obj.geometry) f.obj.geometry.dispose();
        if (f.obj.material.map) f.obj.material.map.dispose();
        f.obj.material.dispose();
        live.splice(i, 1);
      }
    }
  }

  return { init, beam, zap, ring, burst, text, update };
})();
