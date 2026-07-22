/* NEURAL SIEGE — utilities */
'use strict';
const UTIL = (function () {

  // Deterministic PRNG (mulberry32)
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rint(r, lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); }
  function choice(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  function wchoice(r, items, weights) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    let x = r() * total;
    for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x <= 0) return items[i]; }
    return items[items.length - 1];
  }

  const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
  const dist2 = (x1, y1, x2, y2) => (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);

  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  function el(id) { return document.getElementById(id); }
  function h(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // Roman numerals for tiers
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

  return { rng, rint, choice, wchoice, clamp, lerp, dist, dist2, fmt, el, h, ROMAN };
})();
