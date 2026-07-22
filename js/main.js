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
    // when an updated SW takes control, reload once to pick up new assets
    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshed) return;
      refreshed = true;
      if (!GAME.active) location.reload(); // never yank a level out from under the player
    });
  }

  // Block iOS double-tap zoom on the playfield (buttons stay tappable at speed)
  let lastTouch = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTouch < 350 && e.target && e.target.id === 'game-canvas') e.preventDefault();
    lastTouch = now;
  }, { passive: false });

  // Debug/test hooks
  window.__TD = { GAME, DATA, MAPS, WAVES, SAVE, UI, RENDER };
})();
