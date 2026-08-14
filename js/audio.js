/* NEURAL SPIRE — procedural WebAudio SFX (no asset files) */
'use strict';
const AUDIO = (function () {
  let ctx = null, master = null;
  let unlocked = false;

  function unlock() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain();
        master.gain.value = SAVE.state.muted ? 0 : 0.55;
        master.connect(ctx.destination);
      } catch (e) { ctx = null; return; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
  }
  function setMuted(m) {
    SAVE.state.muted = m; SAVE.persist();
    if (master) master.gain.value = m ? 0 : 0.55;
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!ctx || !unlocked || SAVE.state.muted) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.15, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, delay) {
    if (!ctx || !unlocked || SAVE.state.muted) return;
    const t0 = ctx.currentTime + (delay || 0);
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vol || 0.12;
    s.connect(g); g.connect(master); s.start(t0);
  }

  // fire sounds are throttled so dense combat doesn't become white noise
  let lastFire = 0;
  const sfx = {
    click: () => tone(880, 0.05, 'square', 0.06),
    error: () => tone(160, 0.14, 'sawtooth', 0.1, 110),
    build: () => { tone(330, 0.1, 'square', 0.1); tone(660, 0.12, 'square', 0.09, undefined, 0.07); },
    sell:  () => tone(500, 0.12, 'square', 0.08, 250),
    cash:  () => { tone(1180, 0.06, 'square', 0.07); tone(1560, 0.08, 'square', 0.06, undefined, 0.05); },
    fire(kind) {
      const now = performance.now();
      if (now - lastFire < 50) return;
      lastFire = now;
      if (kind === 'tesla') tone(1400, 0.08, 'sawtooth', 0.045, 300);
      else if (kind === 'repulsor') { tone(120, 0.22, 'sine', 0.16, 45); noise(0.1, 0.05); }
      else tone(760, 0.05, 'square', 0.05, 480);
    },
    kill: () => noise(0.12, 0.08),
    knockoff: () => tone(600, 0.35, 'sine', 0.12, 60),
    splat: () => { noise(0.15, 0.12); tone(90, 0.15, 'sine', 0.12, 40); },
    leak: () => { tone(220, 0.3, 'sawtooth', 0.16, 90); noise(0.2, 0.08); },
    waveStart: () => { tone(440, 0.1, 'square', 0.1); tone(587, 0.1, 'square', 0.1, undefined, 0.11); tone(880, 0.16, 'square', 0.1, undefined, 0.22); },
    overclock: () => { tone(500, 0.09, 'square', 0.1); tone(1000, 0.09, 'square', 0.1, undefined, 0.08); tone(2000, 0.12, 'square', 0.08, undefined, 0.16); },
    victory: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'square', 0.1, undefined, i * 0.13)),
    defeat: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.1, undefined, i * 0.16)),
  };

  return { unlock, setMuted, sfx };
})();
