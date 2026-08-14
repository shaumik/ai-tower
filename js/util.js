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
  return { el, h, clamp, lerp, fmt, tapWord, isTouch };
})();
