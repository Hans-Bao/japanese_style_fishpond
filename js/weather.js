'use strict';
/* 鱼食、水面漂浮物（荷叶/花瓣/落叶）、天气粒子（樱花/枫叶/雪/雨）、萤火虫 */

const SAKURA_COLORS = ['#f9c9d6', '#f4b3c4', '#fcdce5', '#f6bfcd', '#fbe7ee'];
const MAPLE_COLORS = ['#c8321e', '#e0542a', '#d9771f', '#b5221a', '#e8a33a', '#cf4424'];

function drawPetal(ctx, x, y, size, rot, flip, color, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(flip, 1);
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.55);
  ctx.bezierCurveTo(size * 0.6, size * 0.3, size * 0.55, -size * 0.45, size * 0.12, -size * 0.55);
  ctx.lineTo(0, -size * 0.38); // 樱花瓣尖端的缺口
  ctx.lineTo(-size * 0.12, -size * 0.55);
  ctx.bezierCurveTo(-size * 0.55, -size * 0.45, -size * 0.6, size * 0.3, 0, size * 0.55);
  ctx.fill();
  ctx.fillStyle = 'rgba(230,120,150,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, size * 0.3, size * 0.12, size * 0.2, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawMaple(ctx, x, y, size, rot, flip, color, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(flip, 1);
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  const lobes = [[-Math.PI / 2, 1], [-Math.PI / 2 + 0.95, 0.85], [-Math.PI / 2 - 0.95, 0.85], [-Math.PI / 2 + 1.85, 0.6], [-Math.PI / 2 - 1.85, 0.6]];
  // 按角度排序画星形
  const pts = [];
  lobes.sort((a, b) => a[0] - b[0]).forEach(([a, l], i, arr) => {
    pts.push([Math.cos(a) * size * l, Math.sin(a) * size * l]);
    const nxt = arr[(i + 1) % arr.length];
    let mid = (a + (i === arr.length - 1 ? nxt[0] + TAU : nxt[0])) / 2;
    pts.push([Math.cos(mid) * size * 0.32, Math.sin(mid) * size * 0.32]);
  });
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(80,20,10,0.35)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (const [a, l] of lobes) { ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * size * l * 0.8, Math.sin(a) * size * l * 0.8); }
  ctx.moveTo(0, 0); ctx.lineTo(0, size * 0.5);
  ctx.stroke();
  ctx.restore();
}

/* ---------- 鱼食 ---------- */
class Food {
  constructor(x, y, S) {
    this.x = x; this.y = y;
    this.vx = U.rand(-4, 4); this.vy = U.rand(-4, 4);
    this.r = U.clamp(3.2 * S, 2.2, 5);
    this.age = 0; this.life = U.rand(28, 40);
    this.eaten = false;
    this.tone = U.pick(['#8a5428', '#a0652e', '#7a4520', '#b07a3a']);
  }
  update(dt, world) {
    this.age += dt;
    const [gx, gy] = world.sim.grad(this.x, this.y);
    this.vx += -gx * 0.6 * dt * 60 * 0.05;
    this.vy += -gy * 0.6 * dt * 60 * 0.05;
    this.vx *= 0.96; this.vy *= 0.96;
    this.x += this.vx * dt; this.y += this.vy * dt;
    world.pond.constrain(this, 0.93);
    if (this.age > this.life) this.eaten = true;
  }
  draw(ctx) {
    const a = Math.min(1, (this.life - this.age) / 3);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.arc(this.x + 1.5, this.y + 2, this.r, 0, TAU); ctx.fill();
    ctx.fillStyle = this.tone;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,190,0.6)';
    ctx.beginPath(); ctx.arc(this.x - this.r * 0.35, this.y - this.r * 0.35, this.r * 0.35, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ---------- 水面漂浮物 ---------- */
class Floater {
  constructor(type, x, y, S, opts = {}) {
    this.type = type; this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.rot = U.rand(0, TAU); this.vr = U.rand(-0.15, 0.15);
    this.age = 0;
    this.life = type === 'pad' || type === 'lotus' ? Infinity : U.rand(50, 90);
    this.S = S;
    this.flip = Math.random() < 0.5 ? -1 : 1;
    if (type === 'petal') { this.size = U.rand(5, 8) * S; this.color = U.pick(SAKURA_COLORS); }
    if (type === 'leaf') { this.size = U.rand(8, 13) * S; this.color = opts.color || U.pick(MAPLE_COLORS); }
    if (type === 'pad') {
      this.size = U.rand(26, 52) * S;
      this.color = opts.color || U.pick(['#1f6b45', '#23744a', '#1a5e3e', '#2a7a4e']);
      this.flower = opts.flower || null;
      this.vr = U.rand(-0.02, 0.02);
    }
  }
  update(dt, world) {
    this.age += dt;
    const heavy = this.type === 'pad' ? 0.15 : 1;
    const [gx, gy] = world.sim.grad(this.x, this.y);
    this.vx += (-gx * 0.04 + world.wind[0] * 0.25) * heavy * dt * 6;
    this.vy += (-gy * 0.04 + world.wind[1] * 0.25) * heavy * dt * 6;
    // 被浮上来的鱼推开
    for (const f of world.fish) {
      if (f.z < 0.6) continue;
      const h = f.pts[0];
      const dx = this.x - h.x, dy = this.y - h.y, d = Math.hypot(dx, dy), lim = f.L * 0.3 + this.size * 0.5;
      if (d < lim && d > 0.01) {
        const k = (1 - d / lim) * 30 * heavy * f.z;
        this.vx += (dx / d) * k * dt; this.vy += (dy / d) * k * dt;
      }
    }
    this.vx *= 1 - dt * 0.8; this.vy *= 1 - dt * 0.8;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.rot += (this.vr + (this.vx * 0.002)) * dt;
    const lim = this.type === 'pad' ? 0.85 : 0.96;
    if (world.pond.constrain(this, lim)) { this.vx *= -0.3; this.vy *= -0.3; }
  }
  get alpha() {
    if (this.life === Infinity) return 1;
    return U.clamp(Math.min(this.age / 0.6, (this.life - this.age) / 6), 0, 1);
  }
  draw(ctx) {
    const a = this.alpha;
    if (this.type === 'petal') drawPetal(ctx, this.x, this.y, this.size, this.rot, this.flip, this.color, a * 0.95);
    else if (this.type === 'leaf') drawMaple(ctx, this.x, this.y, this.size, this.rot, this.flip, this.color, a);
    else if (this.type === 'pad') this.drawPad(ctx);
  }
  drawPad(ctx) {
    const { x, y, size: r, rot } = this;
    if (!this.edge) {
      this.edge = [];
      const ph = Math.random() * TAU;
      for (let i = 0; i <= 48; i++) this.edge.push(1 + Math.sin(i / 48 * TAU * 7 + ph) * 0.018 + Math.sin(i / 48 * TAU * 3 + ph * 2) * 0.02);
      this.drops = Math.random() < 0.6 ? [[Math.random() * TAU, Math.random() * 0.6 + 0.2, Math.random() * 0.03 + 0.04]] : [];
    }
    const gold = 'rgba(222,190,112,';
    const notch = 0.16;
    const path = new Path2D();
    path.moveTo(x, y);
    for (let i = 0; i <= 48; i++) {
      const a = rot + notch + (i / 48) * (TAU - notch * 2);
      const rr = r * this.edge[i];
      path.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    path.closePath();
    ctx.save();
    // 投影
    ctx.save();
    ctx.translate(r * 0.14, r * 0.2);
    ctx.fillStyle = 'rgba(0,12,10,0.35)';
    ctx.fill(path);
    ctx.restore();
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.05, x, y, r * 1.05);
    g.addColorStop(0, U.shade(this.color, 0.22));
    g.addColorStop(0.55, this.color);
    g.addColorStop(1, U.shade(this.color, -0.45));
    ctx.fillStyle = g;
    ctx.fill(path);
    // 金色叶脉
    ctx.save();
    ctx.clip(path);
    ctx.strokeStyle = gold + '0.55)';
    ctx.lineWidth = Math.max(0.6, r * 0.012);
    ctx.beginPath();
    const nv = 22;
    for (let k = 0; k <= nv; k++) {
      const a = rot + notch + (k / nv) * (TAU - notch * 2);
      const ex = x + Math.cos(a) * r, ey = y + Math.sin(a) * r;
      ctx.moveTo(x, y); ctx.lineTo(ex, ey);
      // 叶脉末端分叉
      const mx = x + Math.cos(a) * r * 0.72, my = y + Math.sin(a) * r * 0.72;
      ctx.moveTo(mx, my); ctx.lineTo(x + Math.cos(a + 0.06) * r, y + Math.sin(a + 0.06) * r);
      ctx.moveTo(mx, my); ctx.lineTo(x + Math.cos(a - 0.06) * r, y + Math.sin(a - 0.06) * r);
    }
    ctx.stroke();
    // 光泽
    const sh = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    sh.addColorStop(0, 'rgba(255,255,230,0.14)');
    sh.addColorStop(0.5, 'rgba(255,255,230,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = sh;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
    // 金边 + 中心
    ctx.strokeStyle = gold + '0.85)';
    ctx.lineWidth = Math.max(0.8, r * 0.022);
    ctx.stroke(path);
    ctx.beginPath(); ctx.arc(x, y, r * 0.05, 0, TAU);
    ctx.stroke();
    // 露珠
    for (const [da, df, ds] of this.drops) {
      const dx = x + Math.cos(rot + da) * r * df, dy = y + Math.sin(rot + da) * r * df, dr = Math.max(1.5, r * ds);
      ctx.fillStyle = 'rgba(0,30,20,0.35)';
      ctx.beginPath(); ctx.arc(dx + dr * 0.3, dy + dr * 0.4, dr, 0, TAU); ctx.fill();
      const dg = ctx.createRadialGradient(dx - dr * 0.3, dy - dr * 0.3, 0, dx, dy, dr);
      dg.addColorStop(0, 'rgba(255,255,255,0.95)');
      dg.addColorStop(0.35, 'rgba(160,230,200,0.6)');
      dg.addColorStop(1, 'rgba(40,120,90,0.5)');
      ctx.fillStyle = dg;
      ctx.beginPath(); ctx.arc(dx, dy, dr, 0, TAU); ctx.fill();
    }
    if (this.flower) this.drawLotus(ctx, x + Math.cos(rot + 3) * r * 0.2, y + Math.sin(rot + 3) * r * 0.2, r * 0.62);
    ctx.restore();
  }
  drawLotus(ctx, x, y, s) {
    const pink = this.flower === 'pink';
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.arc(x + s * 0.18, y + s * 0.25, s * 0.85, 0, TAU); ctx.fill();
    const petal = (a, len, wid, base, tip, vein) => {
      const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
      const tx = x + dx * len, ty = y + dy * len;
      const g = ctx.createLinearGradient(x, y, tx, ty);
      g.addColorStop(0, base); g.addColorStop(1, tip);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + dx * len * 0.55 + nx * wid, y + dy * len * 0.55 + ny * wid, tx, ty);
      ctx.quadraticCurveTo(x + dx * len * 0.55 - nx * wid, y + dy * len * 0.55 - ny * wid, x, y);
      ctx.fill();
      ctx.strokeStyle = vein;
      ctx.lineWidth = 0.6;
      ctx.stroke();
      ctx.beginPath();
      for (const f of [-0.45, 0, 0.45]) {
        ctx.moveTo(x + dx * len * 0.15, y + dy * len * 0.15);
        ctx.quadraticCurveTo(x + dx * len * 0.55 + nx * wid * f, y + dy * len * 0.55 + ny * wid * f, x + dx * len * 0.92, y + dy * len * 0.92);
      }
      ctx.stroke();
    };
    const layers = pink
      ? [[10, 1, 0.3, '#fbe3ea', '#e9739c', 'rgba(200,70,110,0.35)', 0],
         [8, 0.8, 0.27, '#fff0f4', '#ef8fb0', 'rgba(200,70,110,0.3)', 0.3],
         [6, 0.55, 0.24, '#fff8fa', '#f6aac4', 'rgba(200,70,110,0.25)', 0.15]]
      : [[10, 1, 0.28, '#fffdf6', '#efe6d6', 'rgba(160,140,110,0.3)', 0],
         [8, 0.8, 0.25, '#ffffff', '#f4ede0', 'rgba(160,140,110,0.25)', 0.3],
         [6, 0.55, 0.22, '#ffffff', '#f8f3ea', 'rgba(160,140,110,0.2)', 0.15]];
    for (const [n, l, w, c1, c2, v, off] of layers) {
      for (let i = 0; i < n; i++) petal(this.rot + off + (i / n) * TAU, s * l, s * w, c1, c2, v);
    }
    // 莲蓬 + 雄蕊
    ctx.fillStyle = '#f2c94c';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * s * 0.2, y + Math.sin(a) * s * 0.2, s * 0.03, 0, TAU); ctx.fill();
    }
    const pg = ctx.createRadialGradient(x - s * 0.05, y - s * 0.05, 0, x, y, s * 0.16);
    pg.addColorStop(0, '#e6e66a'); pg.addColorStop(1, '#a8b23a');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(x, y, s * 0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(90,100,30,0.7)';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU, d = i === 0 ? 0 : s * 0.08;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s * 0.02, 0, TAU); ctx.fill();
    }
  }
}

/* ---------- 蜻蜓：在荷叶间飞停 ---------- */
class Dragonfly {
  constructor(world) {
    const [x, y] = world.pond.randomPoint(0.8);
    this.x = x; this.y = y; this.h = 1;
    this.heading = U.rand(0, TAU);
    this.state = 'fly';
    this.timer = 0;
    this.target = null;
    this.color = U.pick([['#c8401e', '#e8783a'], ['#2f6fb0', '#5aa0d8'], ['#b8321a', '#d9a03a']]);
    this.pickTarget(world);
  }
  pickTarget(world) {
    const pads = world.floaters.filter((f) => f.type === 'pad');
    if (pads.length && Math.random() < 0.75) {
      this.target = U.pick(pads);
      this.ta = U.rand(0, TAU); this.td = U.rand(0.2, 0.55);
    } else {
      const [x, y] = world.pond.randomPoint(1.1);
      this.target = { x, y, free: true };
    }
    this.timer = U.rand(2, 5);
  }
  goal() {
    const t = this.target;
    if (t.free) return [t.x, t.y];
    return [t.x + Math.cos(t.rot + this.ta) * t.size * this.td, t.y + Math.sin(t.rot + this.ta) * t.size * this.td];
  }
  update(dt, world) {
    const S = world.S;
    const [gx, gy] = this.goal();
    if (this.state === 'perch') {
      this.x = gx; this.y = gy;
      this.h = Math.max(0, this.h - dt * 2);
      this.timer -= dt;
      const spooked = world.fish.some((f) => f.z > 0.85 && Math.hypot(f.pts[0].x - this.x, f.pts[0].y - this.y) < f.L * 0.6);
      if (this.timer <= 0 || spooked) { this.state = 'fly'; this.pickTarget(world); }
      return;
    }
    this.h = Math.min(1, this.h + dt * 2);
    const dx = gx - this.x, dy = gy - this.y, d = Math.hypot(dx, dy);
    const want = Math.atan2(dy, dx);
    this.heading += U.clamp(U.angDiff(want, this.heading), -5 * dt, 5 * dt);
    const sp = (d > 40 * S ? 170 : 60) * S;
    // 蜻蜓式的顿挫飞行
    const burst = 0.6 + 0.4 * Math.max(0, Math.sin(world.t * 4 + this.timer));
    this.x += Math.cos(this.heading) * sp * burst * dt;
    this.y += Math.sin(this.heading) * sp * burst * dt;
    this.timer -= dt;
    if (d < 6 * S) {
      if (this.target.free) this.pickTarget(world);
      else { this.state = 'perch'; this.timer = U.rand(4, 11); }
    } else if (this.timer < -6) this.pickTarget(world);
  }
  draw(ctx, world) {
    const S = world.S, t = world.t;
    const L = 46 * S * (1 + this.h * 0.15);
    const a = this.state === 'perch' ? this.heading : this.heading;
    // 投影
    ctx.save();
    ctx.translate(this.x + this.h * 30 * S, this.y + this.h * 42 * S);
    ctx.rotate(a);
    ctx.fillStyle = `rgba(0,0,0,${0.18 - this.h * 0.08})`;
    ctx.fillRect(-L * 0.6, -L * 0.04, L * 0.95, L * 0.08);
    ctx.beginPath(); ctx.ellipse(0.05 * L, 0, L * 0.06, L * 0.55, 0, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(a);
    const flying = this.state === 'fly';
    const flap = flying ? Math.sin(t * 60) : 0;
    // 翅膀
    for (const [ox, len, ang] of [[0.12, 0.5, 1.45], [-0.02, 0.46, 1.75]]) {
      for (const side of [1, -1]) {
        ctx.save();
        ctx.translate(ox * L, 0);
        ctx.rotate(side * (ang + flap * 0.25));
        const wl = len * L, ww = L * 0.085;
        const g = ctx.createLinearGradient(0, 0, wl, 0);
        g.addColorStop(0, `rgba(220,240,255,${flying ? 0.35 : 0.55})`);
        g.addColorStop(1, `rgba(220,240,255,${flying ? 0.12 : 0.25})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(wl * 0.5, 0, wl * 0.5, ww, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(222,190,112,${flying ? 0.35 : 0.8})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(wl * 0.95, 0);
        for (let k = 1; k < 6; k++) { ctx.moveTo(wl * k / 6, -ww * 0.8); ctx.lineTo(wl * k / 6, ww * 0.8); }
        ctx.strokeStyle = `rgba(222,190,112,${flying ? 0.2 : 0.45})`;
        ctx.stroke();
        ctx.fillStyle = 'rgba(60,30,20,0.6)';
        ctx.fillRect(wl * 0.82, -ww * 0.35, wl * 0.06, ww * 0.7);
        ctx.restore();
      }
    }
    // 腹部（分节）
    for (let i = 0; i < 9; i++) {
      const sx = -L * 0.08 - i * L * 0.072;
      ctx.fillStyle = i % 2 ? this.color[0] : this.color[1];
      ctx.beginPath(); ctx.ellipse(sx, 0, L * 0.042, L * 0.03 * (1 - i * 0.05), 0, 0, TAU); ctx.fill();
    }
    // 胸 + 头
    ctx.fillStyle = this.color[0];
    ctx.beginPath(); ctx.ellipse(L * 0.04, 0, L * 0.09, L * 0.055, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2a20';
    for (const side of [1, -1]) { ctx.beginPath(); ctx.arc(L * 0.16, side * L * 0.04, L * 0.04, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,240,200,0.7)';
    ctx.beginPath(); ctx.arc(L * 0.16, -L * 0.05, L * 0.012, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

/** 根据季节初始化漂浮物 */
function initFloaters(world) {
  const { pond, res, S } = world;
  const list = [];
  const r = U.rng(res.seed ^ 0x9e3779b9);
  const areaK = U.clamp(pond.area / (900 * 600), 0.4, 2.2);
  const season = res.season;
  const padN = Math.round({ spring: 4, summer: 9, autumn: 4, winter: 0 }[season] * areaK);
  // 荷叶成簇分布
  const clusters = [];
  for (let i = 0; i < Math.max(1, Math.round(padN / 4)); i++) clusters.push([r.range(0, TAU), r.range(0.55, 0.8)]);
  for (let i = 0; i < padN; i++) {
    const [a, f] = r.pick(clusters);
    const [x, y] = pond.pointAt(a + r.range(-0.25, 0.25), f + r.range(-0.1, 0.08));
    const color = season === 'autumn' ? r.pick(['#7c7a35', '#8a6e30', '#6d7a34']) : undefined;
    const flower = season === 'summer' && r.chance(0.35) ? r.pick(['pink', 'pink', 'white']) : null;
    list.push(new Floater('pad', x, y, S, { color, flower }));
  }
  const extra = { spring: ['petal', 30], autumn: ['leaf', 18], summer: [null, 0], winter: ['leaf', 3] }[season];
  if (extra[0]) {
    for (let i = 0; i < Math.round(extra[1] * areaK); i++) {
      const [x, y] = pond.randomPoint(0.95, r);
      const fl = new Floater(extra[0], x, y, S, season === 'winter' ? { color: '#7a5a3a' } : {});
      fl.age = U.rand(1, 20);
      list.push(fl);
    }
  }
  return list;
}

/* ---------- 天气粒子 ---------- */
class Weather {
  constructor() {
    this.parts = [];
    this.fireflies = [];
    this.types = [];
    this.intensity = 1;
    this.dragonflies = [];
    this.glints = [];
    this.flecks = [];
  }
  configure(types, intensity, world) {
    this.types = types.slice();
    this.intensity = intensity;
    this.parts = this.parts.filter((p) => types.includes(p.type));
    const areaK = (world.W * world.H) / (1280 * 800);
    const base = { sakura: 46, maple: 26, snow: 170, rain: 150 };
    this.targets = {};
    for (const t of types) this.targets[t] = Math.round(base[t] * intensity * U.clamp(areaK, 0.35, 2.5));
    // 预先填充，避免开场空白
    for (const t of types) {
      const have = this.parts.filter((p) => p.type === t).length;
      for (let i = have; i < this.targets[t]; i++) {
        const p = this.spawn(t, world);
        p.h = Math.random();
        p.age = 2;
        this.parts.push(p);
      }
    }
    // 蜻蜓
    this.dragonflies = [];
    if (world.res.season !== 'winter' && world.res.time !== 'night' && !types.includes('rain')) {
      const pads = world.floaters.filter((f) => f.type === 'pad').length;
      const n = (world.res.season === 'summer' ? 2 : 1) + (pads > 6 ? 1 : 0);
      for (let i = 0; i < n; i++) this.dragonflies.push(new Dragonfly(world));
    }
    // 水面金屑
    this.flecks = [];
    const nf = Math.round(70 * U.clamp(world.pond.area / (900 * 600), 0.4, 2.5));
    for (let i = 0; i < nf; i++) {
      const [x, y] = world.pond.randomPoint(0.97);
      this.flecks.push({ x, y, s: U.rand(0.8, 2.2), ph: U.rand(0, TAU), rate: U.rand(0.8, 2.5), rot: U.rand(0, TAU) });
    }
    this.glints = [];
    // 萤火虫：夏季黄昏/夜晚
    this.fireflies = [];
    if (world.res.season === 'summer' && world.res.time !== 'day') {
      const n = Math.round(26 * U.clamp(areaK, 0.5, 2));
      for (let i = 0; i < n; i++) {
        this.fireflies.push({
          x: U.rand(0, world.W), y: U.rand(0, world.H),
          vx: 0, vy: 0, ph: U.rand(0, TAU), rate: U.rand(0.6, 1.6), seed: U.rand(0, 100),
        });
      }
    }
  }
  spawn(type, world) {
    const S = world.S;
    const p = {
      type, x: U.rand(-60, world.W + 60), y: U.rand(-60, world.H + 60), h: 1, age: 0,
      rot: U.rand(0, TAU), vr: U.rand(-2, 2), spin: U.rand(0, TAU), vs: U.rand(2, 5),
      ph: U.rand(0, TAU), ground: 0,
    };
    if (type === 'sakura') { p.vh = U.rand(0.07, 0.12); p.size = U.rand(5.5, 8.5) * S; p.color = U.pick(SAKURA_COLORS); }
    if (type === 'maple') { p.vh = U.rand(0.09, 0.14); p.size = U.rand(9, 14) * S; p.color = U.pick(MAPLE_COLORS); p.vr = U.rand(-1.2, 1.2); }
    if (type === 'snow') { p.vh = U.rand(0.1, 0.18); p.size = U.rand(1.4, 3.8) * S; }
    if (type === 'rain') { p.vh = U.rand(1.6, 2.4); p.size = U.rand(10, 18) * S; }
    return p;
  }
  update(dt, world) {
    const { pond, sim, rings, wind, S } = world;
    // 维持数量
    for (const t of this.types) {
      const have = this.parts.reduce((n, p) => n + (p.type === t && p.ground === 0), 0);
      const need = this.targets[t] - have;
      const rate = t === 'rain' ? need : Math.min(need, Math.ceil(this.targets[t] * dt * 0.4));
      for (let i = 0; i < rate; i++) this.parts.push(this.spawn(t, world));
    }
    const out = [];
    for (const p of this.parts) {
      p.age += dt;
      if (p.ground > 0) {
        p.ground -= dt;
        if (p.ground > 0) out.push(p);
        continue;
      }
      p.h -= p.vh * dt;
      const flutter = p.type === 'sakura' || p.type === 'maple';
      const sway = flutter ? Math.sin(p.age * 1.7 + p.ph) * 18 : p.type === 'snow' ? Math.sin(p.age * 1.2 + p.ph) * 10 : 0;
      const wmul = p.type === 'rain' ? 2.2 : p.type === 'snow' ? 0.6 : 1;
      p.x += (wind[0] * 30 * wmul + sway * (flutter ? 1 : 0.6)) * dt * S;
      p.y += (wind[1] * 30 * wmul + (flutter ? Math.cos(p.age * 1.3 + p.ph) * 8 : 0)) * dt * S;
      p.rot += p.vr * dt;
      p.spin += p.vs * dt;
      if (p.h <= 0) {
        const inPond = pond.factor(p.x, p.y) < 0.98;
        if (inPond) {
          if (p.type === 'rain') {
            sim.disturb(p.x, p.y, 5 * S, 22);
            rings.add(p.x, p.y, U.rand(14, 26) * S, 0.45, 30 * S, 1);
          } else if (p.type === 'snow') {
            if (Math.random() < 0.2) sim.disturb(p.x, p.y, 3 * S, 3);
          } else {
            sim.disturb(p.x, p.y, 6 * S, 10);
            rings.add(p.x, p.y, 22 * S, 0.35, 18 * S, 1);
            if (world.floaters.length < 160) {
              const f = new Floater(p.type === 'sakura' ? 'petal' : 'leaf', p.x, p.y, S, { color: p.color });
              f.size = p.size; f.color = p.color; f.rot = p.rot;
              world.floaters.push(f);
            }
          }
        } else if (p.type !== 'rain') {
          p.ground = p.type === 'snow' ? 1.2 : 3;
          p.groundMax = p.ground;
          out.push(p);
        } else {
          p.ground = 0.25; p.groundMax = 0.25; out.push(p);
        }
        continue;
      }
      if (p.x < -120 || p.x > world.W + 120 || p.y < -120 || p.y > world.H + 120) continue;
      out.push(p);
    }
    this.parts = out;

    for (const d of this.dragonflies) d.update(dt, world);
    // 金屑随水流漂
    for (const f of this.flecks) {
      const [gx, gy] = sim.grad(f.x, f.y);
      f.x += (wind[0] * 3 - gx * 0.15) * dt * S;
      f.y += (wind[1] * 3 - gy * 0.15) * dt * S;
      if (pond.factor(f.x, f.y) > 0.98) { const [x, y] = pond.randomPoint(0.9); f.x = x; f.y = y; }
    }
    // 星芒闪光
    const glintRate = world.res.time === 'night' ? 1.5 : 7;
    if (Math.random() < glintRate * dt) {
      const [x, y] = pond.randomPoint(0.95);
      this.glints.push({ x, y, age: 0, life: U.rand(0.6, 1.3), s: U.rand(5, 11) * S });
    }
    for (const g of this.glints) g.age += dt;
    this.glints = this.glints.filter((g) => g.age < g.life);

    // 萤火虫
    for (const f of this.fireflies) {
      f.vx += Math.sin(world.t * 0.7 + f.seed) * 6 * dt;
      f.vy += Math.cos(world.t * 0.6 + f.seed * 1.3) * 6 * dt;
      f.vx *= 0.99; f.vy *= 0.99;
      f.x += f.vx * dt * S; f.y += f.vy * dt * S;
      if (f.x < -20) f.x = world.W + 20; if (f.x > world.W + 20) f.x = -20;
      if (f.y < -20) f.y = world.H + 20; if (f.y > world.H + 20) f.y = -20;
    }
  }
  draw(ctx, world) {
    const S = world.S;
    for (const p of this.parts) {
      const fadeIn = Math.min(1, p.age / 1.2);
      const gA = p.ground > 0 ? p.ground / p.groundMax : 1;
      const h = Math.max(0, p.h);
      const scale = 0.75 + h * 0.7;
      if (p.type === 'rain') {
        if (p.ground > 0) {
          ctx.strokeStyle = `rgba(220,230,240,${0.4 * gA})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.arc(p.x, p.y, (1 - gA) * 5 * S + 1, 0, TAU); ctx.stroke();
          continue;
        }
        const len = p.size * scale;
        const wx = world.wind[0] * 2.2 + 0.25, wy = world.wind[1] * 2.2 + 1;
        const wl = Math.hypot(wx, wy);
        ctx.strokeStyle = `rgba(225,235,245,${0.55 * fadeIn})`;
        ctx.lineWidth = 1.3 * S;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (wx / wl) * len, p.y - (wy / wl) * len);
        ctx.stroke();
        continue;
      }
      const a = fadeIn * gA;
      // 投影：离地越近越清晰
      if (p.ground === 0 && p.type !== 'snow') {
        ctx.fillStyle = `rgba(0,0,0,${0.12 * (1 - h) * a})`;
        ctx.beginPath();
        ctx.arc(p.x + h * 40 * S, p.y + h * 55 * S, p.size * 0.45, 0, TAU);
        ctx.fill();
      }
      if (p.type === 'snow') {
        ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * scale, 0, TAU); ctx.fill();
      } else {
        const flip = p.ground > 0 ? 1 : Math.cos(p.spin);
        const fn = p.type === 'sakura' ? drawPetal : drawMaple;
        fn(ctx, p.x, p.y, p.size * scale, p.rot, flip || 0.05, p.color, a);
      }
    }
  }
  /** 水面上的金屑与星芒（需在池塘裁剪区域内调用） */
  drawSurface(ctx, world) {
    const t = world.t, S = world.S;
    ctx.save();
    const night = world.res.time === 'night';
    for (const f of this.flecks) {
      const tw = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * f.rate + f.ph), 3);
      ctx.fillStyle = `rgba(240,205,120,${(night ? 0.35 : 0.75) * tw})`;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot + t * 0.2);
      const z = f.s * S;
      ctx.fillRect(-z, -z * 0.6, z * 2, z * 1.2);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const g of this.glints) {
      const k = Math.sin((g.age / g.life) * Math.PI);
      const s = g.s * (0.6 + k * 0.6);
      ctx.fillStyle = `rgba(255,250,225,${0.9 * k})`;
      ctx.beginPath();
      ctx.moveTo(g.x, g.y - s); ctx.lineTo(g.x + s * 0.12, g.y - s * 0.12); ctx.lineTo(g.x + s, g.y);
      ctx.lineTo(g.x + s * 0.12, g.y + s * 0.12); ctx.lineTo(g.x, g.y + s); ctx.lineTo(g.x - s * 0.12, g.y + s * 0.12);
      ctx.lineTo(g.x - s, g.y); ctx.lineTo(g.x - s * 0.12, g.y - s * 0.12);
      ctx.closePath();
      ctx.fill();
      const rg = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, s * 0.5);
      rg.addColorStop(0, `rgba(255,255,240,${0.8 * k})`);
      rg.addColorStop(1, 'rgba(255,255,240,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.arc(g.x, g.y, s * 0.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  drawDragonflies(ctx, world) {
    for (const d of this.dragonflies) d.draw(ctx, world);
  }
  drawFireflies(ctx, world) {
    if (!this.fireflies.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const S = world.S;
    for (const f of this.fireflies) {
      const b = Math.pow(Math.max(0, Math.sin(world.t * f.rate + f.ph)), 3);
      if (b < 0.02) continue;
      const r = 14 * S;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(230,255,150,${0.9 * b})`);
      g.addColorStop(0.2, `rgba(190,255,90,${0.4 * b})`);
      g.addColorStop(1, 'rgba(150,255,50,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}
