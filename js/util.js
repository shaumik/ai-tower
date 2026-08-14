/* NEURAL SPIRE — small helpers */
'use strict';
const UTIL = (function () {
  function el(id) { return document.getElementById(id); }
  function h(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function fmt(n) {
    n = Math.round(n);
    if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }
  // device-appropriate verb for instructional text
  const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  function tapWord() { return isTouch ? 'Tap' : 'Click'; }
  // seeded RNG (mulberry32) — every run generates its own spire from a seed
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  return { el, h, clamp, lerp, fmt, tapWord, isTouch, rng };
})();
