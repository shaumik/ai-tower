/* HARVEST PROTOCOL — bootstrap: renderer, filmic post pipeline, lights, loop */
'use strict';
(function () {
  SAVE.load();

  const canvas = UTIL.el('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.78;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070911);
  scene.fog = new THREE.Fog(0x070911, 50, 100);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 220);

  // image-based lighting: a tiny procedural "studio" baked through PMREM so
  // every metal surface picks up believable reflections
  {
    const envScene = new THREE.Scene();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(50, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x223a5e, side: THREE.BackSide })
    );
    envScene.add(sky);
    const strip = (color, y, rx, w, h) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color }));
      m.position.y = y;
      m.rotation.x = rx;
      envScene.add(m);
      return m;
    };
    strip(0xfff2dd, 30, Math.PI / 2, 40, 14);            // warm key card overhead
    const cool = strip(0x5d8fe0, 6, 0, 26, 10);          // cool side card
    cool.position.set(-24, 8, 0); cool.rotation.set(0, Math.PI / 2, 0);
    const teal = strip(0x2fd8c8, 4, 0, 20, 8);           // teal accent card
    teal.position.set(20, 6, -14); teal.rotation.set(0, -Math.PI / 2.5, 0);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.06).texture;
    pmrem.dispose();
  }

  // direct lighting: warm shadow-casting key against cool bounce
  scene.add(new THREE.HemisphereLight(0x5a7ab0, 0x171020, 0.55));
  scene.add(new THREE.AmbientLight(0x2c3a52, 0.4));
  const key = new THREE.DirectionalLight(0xffe8cf, 1.2);
  key.position.set(16, 34, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -34; key.shadow.camera.right = 34;
  key.shadow.camera.top = 40; key.shadow.camera.bottom = -40;
  key.shadow.camera.near = 4; key.shadow.camera.far = 90;
  key.shadow.bias = -0.0012;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x4d7ddb, 0.5);
  rim.position.set(-14, 16, -12);
  scene.add(rim);

  GAME.scene = scene;
  MAP.build(scene, CONFIG.LEVELS[0]);   // title backdrop: operation 1's map
  FX.init(scene);
  UI.init();
  INPUT.init(camera, canvas, UI.onTap);
  INPUT.focusBase();

  // post pipeline: render → bloom (emissives glow for real) → FXAA
  const composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(390, 844), 0.5, 0.55, 0.72);
  composer.addPass(bloom);
  const fxaa = new THREE.ShaderPass(THREE.FXAAShader);
  composer.addPass(fxaa);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = renderer.getPixelRatio();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(Math.round(w / 2), Math.round(h / 2));   // half-res bloom: soft and cheap
    fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
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
    composer.render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // debug/test hooks
  window.__TD = { GAME, CONFIG, MAP, UI, INPUT, SAVE, scene, camera, renderer };
})();
