/* NEURAL SPIRE — bootstrap: renderer, scene, lights, loop */
'use strict';
(function () {
  SAVE.load();

  const canvas = UTIL.el('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060c);
  scene.fog = new THREE.Fog(0x04060c, 30, 75);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);

  // lighting: soft sky/ground hemisphere, cool key, blue rim
  scene.add(new THREE.HemisphereLight(0x4a6a9a, 0x0a0e1a, 0.95));
  scene.add(new THREE.AmbientLight(0x33455e, 0.55));
  const key = new THREE.DirectionalLight(0xb8d4f0, 1.25);
  key.position.set(8, 20, 12);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x3366cc, 0.85);
  rim.position.set(-10, 8, -8);
  scene.add(rim);

  GAME.scene = scene;
  // title backdrop: node 1's spire
  SPIRE.build(scene, CONFIG.LEVELS[0].seed, CONFIG.LEVELS[0].spire);
  FX.init(scene);
  UI.init();
  INPUT.init(camera, canvas, UI.onTap);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // portrait-first: on narrow screens widen the vertical FOV so the spire fits
    camera.fov = h > w ? 58 : 48;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now();
  function loop(now) {
    const dt = (now - last) / 1000;
    last = now;
    GAME.update(dt);
    INPUT.update(Math.min(dt, 0.05));
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // debug/test hooks
  window.__TD = { GAME, CONFIG, SPIRE, UI, INPUT, SAVE, scene, camera, renderer };
})();
