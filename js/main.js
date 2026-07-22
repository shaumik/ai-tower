/* NEURAL SIEGE — bootstrap */
'use strict';
(function () {
  SAVE.load();
  RENDER.setup(UTIL.el('game-canvas'));
  UI.init();

  // Offline support (needs http(s); silently skipped on file://)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // Block iOS double-tap zoom inside the game
  let lastTouch = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTouch < 350) e.preventDefault();
    lastTouch = now;
  }, { passive: false });

  // Debug/test hooks
  window.__TD = { GAME, DATA, MAPS, WAVES, SAVE, UI, RENDER };
})();
