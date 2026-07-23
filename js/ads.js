/* NEURAL SIEGE — ad adapter. Provider-agnostic; no-ops outside portal builds.
   Provider is selected by window.__AD_PROVIDER, injected by tools/build_portal.py.
   The GitHub Pages / PWA build ships with provider 'none': zero ads, zero requests. */
'use strict';
const ADS = (function () {
  const provider = window.__AD_PROVIDER || 'none';
  let ready = false;
  let cg = null; // CrazyGames SDK handle

  async function init() {
    try {
      if (provider === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK) {
        cg = window.CrazyGames.SDK;
        if (cg.init) await cg.init();
        ready = true;
      } else if (provider === 'gamedistribution') {
        // GD SDK bootstraps itself via GD_OPTIONS; presence of gdsdk = ready enough
        ready = !!window.gdsdk;
      }
    } catch (e) { ready = false; }
  }

  function available() {
    return !!window.__ADS_MOCK || ready;
  }

  // Rewarded video. onDone(success) is ALWAYS called exactly once.
  function showRewarded(onDone) {
    let done = false;
    const finish = ok => { if (!done) { done = true; onDone(!!ok); } };
    try {
      if (window.__ADS_MOCK) { setTimeout(() => finish(true), 60); return; }
      if (provider === 'crazygames' && ready) {
        cg.ad.requestAd('rewarded', {
          adFinished: () => finish(true),
          adError: () => finish(false),
          adStarted: () => {},
        });
        return;
      }
      if (provider === 'gamedistribution' && window.gdsdk && window.gdsdk.showAd) {
        window.gdsdk.showAd('rewarded').then(() => finish(true)).catch(() => finish(false));
        return;
      }
    } catch (e) { /* fall through */ }
    finish(false);
  }

  // Interstitial at natural breaks (level transitions). Never blocks the game on failure.
  function interstitial(onDone) {
    const finish = () => { if (onDone) { const f = onDone; onDone = null; f(); } };
    try {
      if (window.__ADS_MOCK) { setTimeout(finish, 60); return; }
      if (provider === 'crazygames' && ready) {
        cg.ad.requestAd('midgame', { adFinished: finish, adError: finish, adStarted: () => {} });
        return;
      }
      if (provider === 'gamedistribution' && window.gdsdk && window.gdsdk.showAd) {
        window.gdsdk.showAd().then(finish).catch(finish);
        return;
      }
    } catch (e) { /* fall through */ }
    finish();
  }

  // Portal lifecycle signals (required by CrazyGames QA; harmless elsewhere)
  function loadingStart() { try { if (cg && cg.game) cg.game.loadingStart(); } catch (e) {} }
  function loadingStop()  { try { if (cg && cg.game) cg.game.loadingStop(); } catch (e) {} }
  function gameplayStart(){ try { if (cg && cg.game) cg.game.gameplayStart(); } catch (e) {} }
  function gameplayStop() { try { if (cg && cg.game) cg.game.gameplayStop(); } catch (e) {} }

  return { init, available, showRewarded, interstitial, loadingStart, loadingStop, gameplayStart, gameplayStop, provider };
})();
