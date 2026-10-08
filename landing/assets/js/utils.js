/* utils.js — туслах функцууд ($, el, reduce) */
const $ = id => document.getElementById(id);
const el = (tag, cls = '', text = '') => { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; };
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
