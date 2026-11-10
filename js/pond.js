'use strict';
/* 池塘几何、水波高度场模拟、涟漪圆环、焦散纹理 */

class Pond {
  constructor(W, H, envKey, rng) {
    const minD = Math.min(W, H);
    const margin = U.clamp(minD * 0.09, 34, 130);
    let top = margin, bottom = H - margin, left = margin, right = W - margin;
    this.deckH = 0;
    if (envKey === 'temple') {
      this.deckH = U.clamp(H * 0.15, 70, 150);
      bottom = H - this.deckH - margin * 0.7;
    }
    if (envKey === 'bamboo') top += margin * 0.3;
    this.cx = (left + right) / 2;
    this.cy = (top + bottom) / 2;
    const rx = (right - left) / 2, ry = (bottom - top) / 2;
    this.rx = rx; this.ry = ry;
    this.n = W > H * 1.3 ? 2.7 : 2.3; // 超椭圆指数：宽屏更方
    this.harm = [];
    for (let k = 2; k <= 6; k++) {
      this.harm.push({ k, a: rng.range(0.012, 0.05) * (2.4 / k), p: rng.range(0, TAU) });
    }
    this.scale = 1;
    // 生成轮廓并缩放到边界内
    const N = 240;
    let maxX = 0, maxY = 0;
    const raw = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      const r = this._rawR(a);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      raw.push([x, y]);
      maxX = Math.max(maxX, Math.abs(x));
      maxY = Math.max(maxY, Math.abs(y));
    }
    this.sx = rx / maxX;
    this.sy = ry / maxY;
    this.poly = raw.map(([x, y]) => [this.cx + x * this.sx, this.cy + y * this.sy]);
    const p = new Path2D();
    this.poly.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    this.path = p;
    this.area = Math.PI * rx * ry * 1.1;
  }

  _rawR(a) {
    const c = Math.abs(Math.cos(a)) / this.rx, s = Math.abs(Math.sin(a)) / this.ry;
    let r = Math.pow(Math.pow(c, this.n) + Math.pow(s, this.n), -1 / this.n);
    let m = 1;
    for (const h of this.harm) m += h.a * Math.sin(h.k * a + h.p);
    return r * m;
  }

  /** <1 在池内，>1 在池外 */
  factor(x, y) {
    const dx = (x - this.cx) / this.sx, dy = (y - this.cy) / this.sy;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return 0;
    return d / this._rawR(Math.atan2(dy, dx));
  }

  /** 角度 a 方向上、比例 f 处的点 */
  pointAt(a, f) {
    const r = this._rawR(a) * f;
    return [this.cx + Math.cos(a) * r * this.sx, this.cy + Math.sin(a) * r * this.sy];
  }

  randomPoint(maxF = 0.8, rnd = Math.random) {
    const a = rnd() * TAU, f = Math.sqrt(rnd()) * maxF;
    return this.pointAt(a, f);
  }

  /** 把点推回池内 f<=limit */
  constrain(p, limit) {
    const f = this.factor(p.x, p.y);
    if (f > limit) {
      const k = limit / f;
      p.x = this.cx + (p.x - this.cx) * k;
      p.y = this.cy + (p.y - this.cy) * k;
      return true;
    }
    return false;
  }
}

/* 2D 水波方程（双缓冲高度场），用于真实的涟漪光影 */
class RippleSim {
  constructor(W, H, pond) {
    this.cs = U.clamp(Math.round(Math.min(W, H) / 170), 4, 8);
    this.gw = Math.ceil(W / this.cs) + 2;
    this.gh = Math.ceil(H / this.cs) + 2;
    const n = this.gw * this.gh;
    this.a = new Float32Array(n);
    this.b = new Float32Array(n);
    this.mask = new Uint8Array(n);
    for (let y = 1; y < this.gh - 1; y++) {
      for (let x = 1; x < this.gw - 1; x++) {
        const f = pond.factor((x + 0.5) * this.cs, (y + 0.5) * this.cs);
        if (f < 1.01) this.mask[y * this.gw + x] = 1;
      }
    }
    const { canvas, ctx } = U.makeCanvas(this.gw, this.gh, 1);
    this.canvas = canvas;
    this.ctx = ctx;
    this.img = ctx.createImageData(this.gw, this.gh);
    this.light = [255, 255, 255];
    this.damping = 0.984;
  }

  disturb(x, y, radius, strength) {
    const cs = this.cs, gw = this.gw;
    const gx = x / cs, gy = y / cs, gr = Math.max(1, radius / cs);
    const x0 = Math.max(1, Math.floor(gx - gr)), x1 = Math.min(gw - 2, Math.ceil(gx + gr));
    const y0 = Math.max(1, Math.floor(gy - gr)), y1 = Math.min(this.gh - 2, Math.ceil(gy + gr));
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const d = Math.hypot(xx - gx, yy - gy) / gr;
        if (d < 1) {
          const i = yy * gw + xx;
          if (this.mask[i]) this.a[i] += strength * (0.5 + 0.5 * Math.cos(d * Math.PI));
        }
      }
    }
  }

  step() {
    const { a, b, gw, gh, mask } = this;
    const damp = this.damping;
    for (let y = 1; y < gh - 1; y++) {
      let i = y * gw + 1;
      for (let x = 1; x < gw - 1; x++, i++) {
        if (!mask[i]) { b[i] = 0; continue; }
        b[i] = ((a[i - 1] + a[i + 1] + a[i - gw] + a[i + gw]) * 0.5 - b[i]) * damp;
      }
    }
    this.a = b;
    this.b = a;
  }

  render(gain = 5) {
    const { a, gw, gh, mask } = this;
    const d = this.img.data;
    const [lr, lg, lb] = this.light;
    for (let y = 1; y < gh - 1; y++) {
      let i = y * gw + 1;
      for (let x = 1; x < gw - 1; x++, i++) {
        const o = i * 4;
        if (!mask[i]) { d[o + 3] = 0; continue; }
        const dx = a[i + 1] - a[i - 1];
        const dy = a[i + gw] - a[i - gw];
        const l = -(dx * 0.6 + dy * 0.8) * gain;
        if (l > 0) {
          d[o] = lr; d[o + 1] = lg; d[o + 2] = lb;
          d[o + 3] = l > 190 ? 190 : l;
        } else {
          d[o] = 0; d[o + 1] = 18; d[o + 2] = 22;
          const v = -l * 0.7;
          d[o + 3] = v > 120 ? 120 : v;
        }
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }

  grad(x, y) {
    const gx = Math.round(x / this.cs), gy = Math.round(y / this.cs);
    if (gx < 1 || gy < 1 || gx >= this.gw - 1 || gy >= this.gh - 1) return [0, 0];
    const i = gy * this.gw + gx, a = this.a;
    return [a[i + 1] - a[i - 1], a[i + this.gw] - a[i - this.gw]];
  }

  draw(ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, 0, 0, this.gw * this.cs, this.gh * this.cs);
  }
}

/* 矢量涟漪圈：给涟漪清晰的线条 */
class Rings {
  constructor() { this.list = []; }
  add(x, y, maxR, alpha = 0.6, speed = 40, count = 2) {
    if (this.list.length > 220) this.list.shift();
    this.list.push({ x, y, r: 0, maxR, alpha, speed, count });
  }
  update(dt) {
    for (const g of this.list) g.r += g.speed * dt * (1 - (g.r / g.maxR) * 0.5);
    this.list = this.list.filter((g) => g.r < g.maxR);
  }
  draw(ctx, color = '255,214,140') {
    ctx.save();
    for (const g of this.list) {
      const t = g.r / g.maxR;
      const a = g.alpha * (1 - t) * Math.min(1, g.r / 4);
      for (let k = 0; k < g.count; k++) {
        const rr = g.r * (1 - k * 0.28);
        if (rr <= 1) continue;
        const ka = a * (1 - k * 0.35);
        // 暗边（立体）
        ctx.strokeStyle = `rgba(0,20,25,${ka * 0.3})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(g.x + 1, g.y + 1.5, rr, 0, TAU); ctx.stroke();
        // 金色光环 + 白色细线
        ctx.strokeStyle = `rgba(${color},${ka * 0.9})`;
        ctx.lineWidth = 2 - k * 0.4;
        ctx.beginPath(); ctx.arc(g.x, g.y, rr, 0, TAU); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,245,${ka * 0.7})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.arc(g.x - 0.5, g.y - 0.6, rr - 1, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/* 焦散纹理：域扭曲的 Worley 噪声 → 圆润弯曲的光网，带柔光晕（可平铺） */
function makeCausticsTexture(size = 384, seed = 7) {
  const r = U.rng(seed);
  const pts = [];
  for (let i = 0; i < 26; i++) pts.push([r(), r()]);
  // 周期性扭曲参数（整数频率保证平铺）
  const wp = [];
  for (let i = 0; i < 4; i++) wp.push({ fx: r.int(1, 4), fy: r.int(1, 4), p: r() * TAU, a: r.range(0.03, 0.05) });
  const { canvas, ctx } = U.makeCanvas(size, size, 1);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let px = x / size, py = y / size;
      let ox = 0, oy = 0;
      for (const w of wp) {
        ox += Math.sin(TAU * (w.fy * py + w.fx * px) + w.p) * w.a;
        oy += Math.cos(TAU * (w.fx * px - w.fy * py) + w.p * 1.7) * w.a;
      }
      px = (px + ox + 1) % 1; py = (py + oy + 1) % 1;
      let f1 = 9, f2 = 9;
      for (const [qx, qy] of pts) {
        let dx = Math.abs(px - qx), dy = Math.abs(py - qy);
        if (dx > 0.5) dx = 1 - dx;
        if (dy > 0.5) dy = 1 - dy;
        const dd = dx * dx + dy * dy;
        if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
      }
      const v = Math.sqrt(f2) - Math.sqrt(f1);
      const core = Math.pow(1 - U.smooth(U.clamp(v / 0.022, 0, 1)), 1.6);
      const halo = Math.pow(1 - U.clamp(v / 0.09, 0, 1), 3) * 0.35;
      const it = Math.min(1, core + halo);
      const o = (y * size + x) * 4;
      d[o] = 190 + core * 65; d[o + 1] = 255; d[o + 2] = 235 + core * 20;
      d[o + 3] = it * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
