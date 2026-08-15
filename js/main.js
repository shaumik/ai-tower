/* HARVEST PROTOCOL — bootstrap: renderer, scene, lights, loop */
'use strict';
(function () {
  SAVE.load();

  const canvas = UTIL.el('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070911);
  scene.fog = new THREE.Fog(0x070911, 50, 100);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 220);

  // low-poly stage lighting: soft sky bounce, one warm shadow-casting key,
  // cool rim. Shadows are what make simple geometry read as objects.
  scene.add(new THREE.HemisphereLight(0x5a7ab0, 0x171020, 0.85));
  scene.add(new THREE.AmbientLight(0x2c3a52, 0.5));
  const key = new THREE.DirectionalLight(0xffe8cf, 1.5);
  key.position.set(16, 34, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -34; key.shadow.camera.right = 34;
  key.shadow.camera.top = 40; key.shadow.camera.bottom = -40;
  key.shadow.camera.near = 4; key.shadow.camera.far = 90;
  key.shadow.bias = -0.0012;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x4d7ddb, 0.55);
  rim.position.set(-14, 16, -12);
  scene.add(rim);

  GAME.scene = scene;
  // title backdrop: operation 1's map
  MAP.build(scene, CONFIG.LEVELS[0]);
  FX.init(scene);
  UI.init();
  INPUT.init(camera, canvas, UI.onTap);
  INPUT.focusBase();

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = h > w ? 50 : 42;
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
  window.__TD = { GAME, CONFIG, MAP, UI, INPUT, SAVE, scene, camera, renderer };
})();
