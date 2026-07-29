/* NEURAL SIEGE — ad adapter. Provider-agnostic; no-ops outside portal builds.
   Provider is selected by window.__AD_PROVIDER, injected by tools/build_portal.py.
   The GitHub Pages / PWA build ships with provider 'none': zero ads, zero requests. */
'use strict';
const ADS = (function () {
  const provider = window.__AD_PROVIDER || 'none';
  let ready = false;
  let cg = null; // CrazyGames SDK handle
  let sdkMuted = false;      // muteAudio from the portal SDK — always wins over in-game toggles
  let pendLoadStart = false, pendLoadStop = false; // lifecycle events queued until init resolves

  function applySdkMute(m) {
    sdkMuted = !!m;
    try { if (window.AUDIO && AUDIO.setExternalMute) AUDIO.setExternalMute(sdkMuted); } catch (e) {}
  }
  function hookSettings() {
    // SDK muteAudio must take priority over in-game audio settings.
    // Defensive across SDK surface variations; every probe is try/caught.
    try {
      const st = cg.game && cg.game.settings;
      if (st && typeof st.muteAudio === 'boolean') applySdkMute(st.muteAudio);
    } catch (e) {}
    const onSettings = ns => { if (ns && typeof ns.muteAudio === 'boolean') applySdkMute(ns.muteAudio); };
    try { cg.game && cg.game.addSettingsListener && cg.game.addSettingsListener(onSettings); } catch (e) {}
    try { cg.game && cg.game.addEventListener && cg.game.addEventListener('settingsChange', ev => onSettings(ev && (ev.settings || ev))); } catch (e) {}
  }

  async function init() {
    try {
      if (provider === 'crazygames' && window.CrazyGames && window.CrazyGames.SDK) {
        cg = window.CrazyGames.SDK;
        if (cg.init) await cg.init();
        ready = true;
        hookSettings();
        if (pendLoadStart) { pendLoadStart = false; loadingStart(); }
        if (pendLoadStop) { pendLoadStop = false; loadingStop(); }
      } else if (provider === 'gamedistribution') {
        // GD SDK bootstraps itself via GD_OPTIONS; presence of gdsdk = ready enough
        ready = !!window.gdsdk;
      }
    } catch (e) { ready = false; }
  }

  // While a video ad plays: game audio off, gameplay signal paused.
  function adBegan() {
    try { if (window.AUDIO && AUDIO.setExternalMute) AUDIO.setExternalMute(true); } catch (e) {}
    gameplayStop();
  }
  function adEnded() {
    // restore to whatever the SDK says, not blindly to unmuted
    try { if (window.AUDIO && AUDIO.setExternalMute) AUDIO.setExternalMute(sdkMuted); } catch (e) {}
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
          adFinished: () => { adEnded(); finish(true); },
          adError: () => { adEnded(); finish(false); },
          adStarted: adBegan,
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
        cg.ad.requestAd('midgame', {
          adFinished: () => { adEnded(); finish(); },
          adError: () => { adEnded(); finish(); },
          adStarted: adBegan,
        });
        return;
      }
      if (provider === 'gamedistribution' && window.gdsdk && window.gdsdk.showAd) {
        window.gdsdk.showAd().then(finish).catch(finish);
        return;
      }
    } catch (e) { /* fall through */ }
    finish();
  }

  // Portal lifecycle signals (required by CrazyGames QA; harmless elsewhere).
  // Loading events fired before init resolves are queued and flushed by init().
  function loadingStart() {
    if (provider === 'crazygames' && !ready) { pendLoadStart = true; return; }
    try { if (cg && cg.game) cg.game.loadingStart(); } catch (e) {}
  }
  function loadingStop() {
    if (provider === 'crazygames' && !ready) { pendLoadStop = true; return; }
    try { if (cg && cg.game) cg.game.loadingStop(); } catch (e) {}
  }
  function gameplayStart(){ try { if (cg && cg.game) cg.game.gameplayStart(); } catch (e) {} }
  function gameplayStop() { try { if (cg && cg.game) cg.game.gameplayStop(); } catch (e) {} }
  // celebration signal at big wins; safe no-op outside CrazyGames
  function happytime()   { try { if (cg && cg.game && cg.game.happytime) cg.game.happytime(); } catch (e) {} }

  return { init, available, showRewarded, interstitial, loadingStart, loadingStop, gameplayStart, gameplayStop, happytime, provider };
})();
