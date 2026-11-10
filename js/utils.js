'use strict';
/* 通用工具 */
const TAU = Math.PI * 2;

const U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  lerp: (a, b, t) => a + (b - a) * t,
  smooth: (t) => t * t * (3 - 2 * t),
  rand: (a = 0, b = 1) => a + (b - a) * Math.random(),
  randInt: (a, b) => Math.floor(a + (b - a + 1) * Math.random()),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  /** 归一化 a-b 到 [-PI, PI] */
  angDiff(a, b) {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    else if (d < -Math.PI) d += TAU;
    return d;
  },
  /** 可复现随机数 (mulberry32) */
  rng(seed) {
    let s = seed >>> 0;
    const f = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (a, b) => a + (b - a) * f();
    f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.chance = (p) => f() < p;
    return f;
  },
  hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  },
  weightedPick(entries, r = Math.random) {
    // entries: [[key, weight], ...]
    const total = entries.reduce((s, e) => s + e[1], 0);
    let x = r() * total;
    for (const [k, w] of entries) {
      if ((x -= w) <= 0) return k;
    }
    return entries[entries.length - 1][0];
  },
  hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },
  rgba(hex, a) {
    const [r, g, b] = U.hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  },
  mix(h1, h2, t) {
    const a = U.hexToRgb(h1), b = U.hexToRgb(h2);
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  },
  /** amt>0 变亮, amt<0 变暗 */
  shade(hex, amt) {
    return amt >= 0 ? U.mix(hex, '#ffffff', amt) : U.mix(hex, '#000000', -amt);
  },
  makeCanvas(w, h, dpr = 1) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas: c, ctx };
  },
  /** 不规则圆形 Path2D（石头、灌木等） */
  blobPath(x, y, r, rng, jitter = 0.18, n = 10, squash = 1, rot = 0) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const rr = r * (1 - jitter + rng() * jitter * 2);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr * squash;
      pts.push([
        x + px * Math.cos(rot) - py * Math.sin(rot),
        y + px * Math.sin(rot) + py * Math.cos(rot),
      ]);
    }
    const p = new Path2D();
    const m0 = [(pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2];
    p.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const c = pts[i], nx = pts[(i + 1) % n];
      p.quadraticCurveTo(c[0], c[1], (c[0] + nx[0]) / 2, (c[1] + nx[1]) / 2);
    }
    p.closePath();
    return p;
  },
};
