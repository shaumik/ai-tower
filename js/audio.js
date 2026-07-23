/* NEURAL SIEGE — procedural WebAudio SFX + ambient music (no asset files needed) */
'use strict';
const AUDIO = (function () {
  let ctx = null, master = null, sfxGain = null, musicGain = null;
  let unlocked = false;
  let musicTimer = null, musicStep = 0;

  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
      sfxGain = ctx.createGain(); sfxGain.connect(master);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.32; musicGain.connect(master);
      applySettings();
    } catch (e) { ctx = null; }
  }

  function unlock() {
    init();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
    startMusic();
  }

  function applySettings() {
    if (!ctx) return;
    const s = SAVE.state.settings;
    sfxGain.gain.value = s.sfx ? 1 : 0;
    musicGain.gain.value = s.music ? 0.32 : 0;
    if (s.music && unlocked) startMusic(); else stopMusic();
  }

  // ---------- tiny synth helpers ----------
  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!ctx || !unlocked || !SAVE.state.settings.sfx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.12, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, freq) {
    if (!ctx || !unlocked || !SAVE.state.settings.sfx) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 900;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t0);
  }

  // ---------- SFX vocabulary (throttled per frame kind) ----------
  const lastPlay = {};
  function throttled(kind, minGap) {
    const now = performance.now();
    if (lastPlay[kind] && now - lastPlay[kind] < minGap) return true;
    lastPlay[kind] = now; return false;
  }

  const SFX = {
    shot()      { if (throttled('shot', 45)) return; tone(880, 0.07, 'square', 0.05, 440); },
    scan()      { if (throttled('scan', 40)) return; tone(1500, 0.04, 'sawtooth', 0.03, 1200); },
    snipe()     { if (throttled('snipe', 80)) return; tone(220, 0.18, 'sawtooth', 0.14, 60); noise(0.1, 0.1, 2500); },
    chain()     { if (throttled('chain', 70)) return; tone(1200, 0.1, 'sawtooth', 0.06, 300); },
    boom()      { if (throttled('boom', 60)) return; noise(0.3, 0.25, 500); tone(90, 0.25, 'sine', 0.2, 40); },
    beam()      { if (throttled('beam', 900)) return; tone(180, 0.5, 'sawtooth', 0.02, 220); },
    orb()       { if (throttled('orb', 90)) return; tone(600, 0.14, 'sine', 0.1, 1400); },
    empPulse()  { if (throttled('emp', 200)) return; tone(400, 0.35, 'sine', 0.15, 60); noise(0.2, 0.08, 700); },
    die()       { if (throttled('die', 50)) return; noise(0.12, 0.12, 1200); tone(300, 0.1, 'triangle', 0.07, 80); },
    bossDie()   { noise(0.7, 0.35, 400); tone(60, 0.8, 'sine', 0.3, 30); tone(120, 0.7, 'sawtooth', 0.15, 40, 0.1); },
    leak()      { tone(320, 0.25, 'sawtooth', 0.2, 90); },
    build()     { tone(520, 0.08, 'square', 0.12); tone(780, 0.1, 'square', 0.12, undefined, 0.07); },
    upgrade()   { tone(520, 0.08, 'square', 0.1); tone(660, 0.08, 'square', 0.1, undefined, 0.07); tone(880, 0.14, 'square', 0.12, undefined, 0.14); },
    sell()      { tone(700, 0.08, 'square', 0.1, 300); },
    cash()      { if (throttled('cash', 120)) return; tone(1046, 0.06, 'sine', 0.08); tone(1568, 0.09, 'sine', 0.08, undefined, 0.05); },
    error()     { if (throttled('error', 150)) return; tone(160, 0.12, 'square', 0.1, 120); },
    click()     { if (throttled('click', 60)) return; tone(900, 0.03, 'square', 0.05); },
    waveStart() { tone(392, 0.12, 'sawtooth', 0.14); tone(523, 0.12, 'sawtooth', 0.14, undefined, 0.11); tone(659, 0.2, 'sawtooth', 0.16, undefined, 0.22); },
    waveClear() { tone(659, 0.1, 'sine', 0.14); tone(784, 0.1, 'sine', 0.14, undefined, 0.09); tone(1046, 0.22, 'sine', 0.16, undefined, 0.18); },
    victory()   { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.3, 'sine', 0.16, undefined, i * 0.13)); },
    defeat()    { [400, 320, 240, 150].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.14, f * 0.7, i * 0.2)); },
    newThreat() { tone(200, 0.2, 'sawtooth', 0.14, 400); tone(200, 0.2, 'sawtooth', 0.14, 400, 0.25); },
    stun()      { if (throttled('stun', 150)) return; tone(1800, 0.08, 'sine', 0.05, 900); },
    alarm()     { tone(1300, 0.06, 'square', 0.07); tone(1300, 0.06, 'square', 0.07, undefined, 0.14); },
  };

  // ---------- ambient generative music ----------
  // Minor-key pad progression + sparse arpeggio; deliberately low-key so it loops for hours.
  const CHORDS = [
    [110.00, 130.81, 164.81], // Am
    [87.31, 110.00, 130.81],  // F
    [98.00, 123.47, 146.83],  // G
    [82.41, 110.00, 123.47],  // E-ish
  ];
  function padChord(freqs, dur) {
    if (!ctx || !SAVE.state.settings.music) return;
    const t0 = ctx.currentTime;
    freqs.forEach(f => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sine'; o2.frequency.value = f * 2.003; g2.gain.value = 0.35;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + dur * 0.3);
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(musicGain);
      o.start(t0); o.stop(t0 + dur); o2.start(t0); o2.stop(t0 + dur);
    });
  }
  function arpNote(f, delay) {
    if (!ctx || !SAVE.state.settings.music) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.045, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    o.connect(g); g.connect(musicGain); o.start(t0); o.stop(t0 + 0.55);
  }
  function musicBar() {
    const chord = CHORDS[musicStep % CHORDS.length];
    padChord(chord, 4.2);
    if (musicStep % 2 === 1) {
      for (let i = 0; i < 4; i++) {
        if (Math.random() < 0.6) arpNote(chord[i % chord.length] * 4, 0.5 + i * 0.9);
      }
    }
    musicStep++;
  }
  function startMusic() {
    if (!ctx || musicTimer || !SAVE.state.settings.music) return;
    musicBar();
    musicTimer = setInterval(musicBar, 4000);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  }

  return { unlock, applySettings, sfx: SFX };
})();
