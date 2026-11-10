'use strict';
/* 日式庭园环境：程序化绘制地面、池底、池岸、树木、石灯笼、桥、木栈道等（一次性绘制并缓存） */

const GREENS = {
  spring: ['#6a8b3c', '#7a9a46', '#587a30', '#8fae58', '#4f6f2a'],
  summer: ['#45742c', '#548436', '#386424', '#6b9a44', '#2f5620'],
  autumn: ['#77783a', '#878540', '#646a2e', '#99914a', '#5a5e28'],
  winter: ['#6c7458', '#7c8464', '#5c644a', '#8a9070', '#4e5640'],
};

const FOLIAGE = {
  sakura: {
    spring: ['#f7c6d3', '#f2b0c3', '#fbe0e8', '#e999b1', '#fff0f4'],
    summer: ['#4d8a34', '#5e9a3e', '#3c7429', '#76ac4c'],
    autumn: ['#d98b3a', '#c96a2c', '#e0a64a', '#b5562a'],
    winter: null,
  },
  maple: {
    spring: ['#9cc25a', '#b6d36e', '#86ad48', '#c9df86'],
    summer: ['#3f7a2e', '#4e8a36', '#2f6324', '#5f9a40'],
    autumn: ['#c8321e', '#e0542a', '#a8231a', '#e47a2a', '#f0a03a'],
    winter: null,
  },
  pine: {
    spring: ['#2f5a2c', '#3d6a35', '#264a24', '#4b7a3e'],
    summer: ['#2a5228', '#386232', '#204220', '#467238'],
    autumn: ['#2f4f2a', '#3b5e31', '#263f22', '#4a6a3a'],
    winter: ['#2f4f2a', '#3b5e31', '#263f22', '#4a6a3a'],
  },
  willow: {
    spring: ['#a8c96a', '#bcd67e', '#96ba58'],
    summer: ['#6f9a45', '#7fa851', '#5e8a3a'],
    autumn: ['#c9b553', '#b3a046', '#d8c46a'],
    winter: ['#9a8a5a', '#8a7a4c'],
  },
};

function buildEnvironment(world) {
  const { W, H, dpr, pond, res, S } = world;
  const rng = U.rng((res.seed ^ U.hash(res.env + res.season)) >>> 0);
  const under = U.makeCanvas(W, H, dpr);
  const over = U.makeCanvas(W, H, dpr);
  const refl = U.makeCanvas(W, H, Math.min(dpr, 1));
  const E = {
    W, H, S, pond, rng, season: res.season, env: res.env,
    lights: [], occupied: [], winter: res.season === 'winter',
    areaK: (W * H) / (1280 * 800),
  };
  const u = under.ctx, o = over.ctx;

  // ---------- 下层：地面 + 池底 ----------
  drawGround(E, u);
  if (E.winter) drawSnowGround(E, u);
  if (E.env === 'temple') drawDeck(E, u);
  drawPondFloor(E, u);

  // ---------- 上层：池岸与景物 ----------
  drawInnerShadow(E, o);
  drawRimBand(E, o);
  drawRimStones(E, o);

  if (E.env === 'bridge') drawBridge(E, o);
  if (E.env === 'boardwalk') drawBoardwalk(E, o);
  if (E.env === 'bamboo') drawBambooFence(E, o);

  drawDecorations(E, o);
  drawTrees(E, o, refl.ctx);

  return { under: under.canvas, over: over.canvas, reflect: refl.canvas, lights: E.lights };
}

/* ================= 工具 ================= */

function speckle(ctx, E, n, colors, rmin, rmax, alpha) {
  const r = E.rng;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = alpha * r.range(0.4, 1);
    ctx.fillStyle = r.pick(colors);
    ctx.beginPath();
    ctx.arc(r.range(0, E.W), r.range(0, E.H), r.range(rmin, rmax) * E.S, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 在池外找一个不与已有景物重叠的位置 */
function place(E, rad, minF, maxF, tries = 40, filter) {
  const r = E.rng, { pond, W, H } = E;
  for (let t = 0; t < tries; t++) {
    const a = r.range(0, TAU);
    const [x, y] = pond.pointAt(a, r.range(minF, maxF));
    if (x < -rad * 0.4 || x > W + rad * 0.4 || y < -rad * 0.4 || y > H + rad * 0.4) continue;
    if (pond.factor(x, y) < minF * 0.98) continue;
    if (filter && !filter(x, y)) continue;
    if (E.occupied.some((q) => Math.hypot(q.x - x, q.y - y) < (q.r + rad) * 0.8)) continue;
    E.occupied.push({ x, y, r: rad });
    return [x, y];
  }
  return null;
}

function notOnDeck(E) {
  return (x, y) => !E.pond.deckH || y < E.H - E.pond.deckH - 10;
}

function outsideClip(ctx, E) {
  const p = new Path2D();
  p.rect(-10, -10, E.W + 20, E.H + 20);
  p.addPath(E.pond.path);
  ctx.clip(p, 'evenodd');
}

function softShadow(ctx, x, y, r, a = 0.25) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(0.6, `rgba(0,0,0,${a * 0.55})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

/* ================= 地面 ================= */

function drawGround(E, ctx) {
  const { W, H, S, rng, season, env } = E;
  const G = GREENS[season];
  if (env === 'karesansui') return drawGravel(E, ctx);

  if (env === 'bamboo') {
    ctx.fillStyle = '#4b412e';
    ctx.fillRect(0, 0, W, H);
    speckle(ctx, E, 2500 * E.areaK, ['#3e3526', '#5a4e38', '#615238', '#352d20'], 2, 9, 0.5);
    // 苔藓斑块
    for (let i = 0; i < 30 * E.areaK; i++) {
      const x = rng.range(0, W), y = rng.range(0, H), r = rng.range(30, 90) * S;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, U.rgba(G[0], 0.55)); g.addColorStop(1, U.rgba(G[0], 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    // 竹叶落叶
    for (let i = 0; i < 1600 * E.areaK; i++) {
      ctx.save();
      ctx.translate(rng.range(0, W), rng.range(0, H));
      ctx.rotate(rng.range(0, TAU));
      ctx.fillStyle = rng.pick(['#a08a4a', '#8a7a3a', '#b59d58', '#7a6a34', '#6d7a3a']);
      ctx.globalAlpha = rng.range(0.4, 0.9);
      ctx.beginPath(); ctx.ellipse(0, 0, rng.range(6, 11) * S, rng.range(1.2, 2) * S, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  } else {
    // 苔藓 / 草地
    ctx.fillStyle = G[0];
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 60 * E.areaK; i++) {
      const x = rng.range(0, W), y = rng.range(0, H), r = rng.range(40, 140) * S;
      const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r);
      const c = rng.chance(0.5) ? G[3] : G[4];
      g.addColorStop(0, U.rgba(c, 0.45)); g.addColorStop(1, U.rgba(c, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    speckle(ctx, E, 7000 * E.areaK, G, 1, 3.5, 0.55);
    if (env === 'boardwalk') {
      // 草叶纹理
      ctx.lineWidth = 1.1 * S;
      for (let i = 0; i < 5000 * E.areaK; i++) {
        const x = rng.range(0, W), y = rng.range(0, H), l = rng.range(5, 12) * S, a = rng.range(-2.4, -0.7);
        ctx.strokeStyle = U.rgba(rng.pick(G), 0.7);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
      }
    }
  }

  if (env === 'bridge') {
    // 通往桥头的碎石小径
    const by = E.pond.cy + E.pond.ry * 0.22;
    E.bridgeY = by;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#c7bb9c';
    ctx.lineWidth = 46 * S;
    ctx.beginPath();
    ctx.moveTo(-50, by + 40 * S);
    ctx.quadraticCurveTo(E.pond.cx - E.pond.rx * 0.9, by - 10 * S, E.pond.cx, by);
    ctx.quadraticCurveTo(E.pond.cx + E.pond.rx * 0.9, by + 10 * S, W + 50, by - 30 * S);
    ctx.stroke();
    ctx.restore();
  }
  if (env === 'temple') {
    // 缘侧前的白砂
    const top = E.H - E.pond.deckH;
    ctx.fillStyle = '#d6d0c2';
    ctx.fillRect(0, top - 34 * S, W, 34 * S + 4);
    ctx.strokeStyle = 'rgba(120,110,95,0.25)';
    ctx.lineWidth = 1;
    for (let y = top - 30 * S; y < top; y += 6 * S) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  // 季节性落物
  if (season === 'spring' && env !== 'bamboo') {
    for (let i = 0; i < 260 * E.areaK; i++) drawPetal(ctx, rng.range(0, W), rng.range(0, H), rng.range(3, 5) * S, rng.range(0, TAU), 1, rng.pick(SAKURA_COLORS), 0.85);
  }
  if (season === 'autumn') {
    for (let i = 0; i < 180 * E.areaK; i++) drawMaple(ctx, rng.range(0, W), rng.range(0, H), rng.range(5, 9) * S, rng.range(0, TAU), 1, rng.pick(MAPLE_COLORS), 0.85);
  }
}

function drawGravel(E, ctx) {
  const { W, H, S, rng, pond } = E;
  const base = E.winter ? '#e4e6e8' : '#d9d3c5';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, E, 9000 * E.areaK, ['#c4bdac', '#e9e4d8', '#b5ae9e', '#f3efe6'], 0.6, 1.8, 0.7);
  const rake = (path) => {
    ctx.strokeStyle = 'rgba(110,100,85,0.28)';
    ctx.lineWidth = 2 * S;
    ctx.save(); ctx.translate(0.8 * S, 1.2 * S); ctx.stroke(path); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.3 * S;
    ctx.stroke(path);
  };
  // 外围直线耙纹
  for (let y = 6 * S; y < H; y += 9 * S) {
    const p = new Path2D(); p.moveTo(0, y); p.lineTo(W, y); rake(p);
  }
  // 池塘周围同心耙纹
  const step = 9 * S, n = 9;
  const ringPath = (k) => {
    const p = new Path2D();
    const N = 180;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      const [x0, y0] = pond.pointAt(a, 1);
      const nx = x0 - pond.cx, ny = y0 - pond.cy, d = Math.hypot(nx, ny);
      const x = x0 + (nx / d) * k * step, y = y0 + (ny / d) * k * step;
      i ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    p.closePath();
    return p;
  };
  ctx.fillStyle = base;
  ctx.fill(ringPath(n + 0.6));
  for (let k = n; k >= 1; k--) rake(ringPath(k));
  // 枯山水的立石 + 环形耙纹
  for (let i = 0; i < Math.round(3 * Math.sqrt(E.areaK)) + 1; i++) {
    const r0 = rng.range(16, 30) * S;
    const pt = place(E, r0 + 8 * step, 1.25, 1.7);
    if (!pt) continue;
    ctx.fillStyle = base;
    ctx.beginPath(); ctx.arc(pt[0], pt[1], r0 + 5.6 * step, 0, TAU); ctx.fill();
    for (let k = 5; k >= 1; k--) {
      const p = new Path2D(); p.arc(pt[0], pt[1], r0 + k * step, 0, TAU); rake(p);
    }
    E.zenStones = E.zenStones || [];
    E.zenStones.push([pt[0], pt[1], r0]);
  }
}

function drawSnowGround(E, ctx) {
  const { W, H, S, rng } = E;
  ctx.fillStyle = 'rgba(240,244,249,0.86)';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 50 * E.areaK; i++) {
    const x = rng.range(0, W), y = rng.range(0, H), r = rng.range(40, 120) * S;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = rng.chance(0.6) ? '200,212,228' : '255,255,255';
    g.addColorStop(0, `rgba(${c},0.35)`); g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  speckle(ctx, E, 2500 * E.areaK, ['#ffffff', '#dfe7f0'], 0.5, 1.6, 0.8);
}

function drawDeck(E, ctx) {
  const { W, H, S, rng } = E;
  const top = H - E.pond.deckH;
  // 投影
  const sg = ctx.createLinearGradient(0, top - 24 * S, 0, top);
  sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = sg; ctx.fillRect(0, top - 24 * S, W, 24 * S);
  // 木板
  const bh = 15 * S;
  for (let y = top + 9 * S; y < H; y += bh) {
    const tone = rng.pick(['#8a5c38', '#94653f', '#7f5433', '#9a6c44']);
    ctx.fillStyle = tone;
    ctx.fillRect(0, y, W, bh);
    ctx.strokeStyle = 'rgba(40,20,10,0.25)';
    ctx.lineWidth = 0.8;
    for (let g = 0; g < 5; g++) {
      const gy = y + rng.range(2, bh - 2);
      ctx.beginPath(); ctx.moveTo(0, gy);
      for (let x = 0; x < W; x += 40 * S) ctx.lineTo(x, gy + rng.range(-0.8, 0.8));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(30,15,5,0.5)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    for (let x = rng.range(0, 200) * S; x < W; x += rng.range(160, 320) * S) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + bh); ctx.stroke();
    }
  }
  // 缘侧边梁
  const g = ctx.createLinearGradient(0, top, 0, top + 10 * S);
  g.addColorStop(0, '#b07e52'); g.addColorStop(1, '#5e3c22');
  ctx.fillStyle = g; ctx.fillRect(0, top, W, 10 * S);
  // 屋檐阴影
  const eg = ctx.createLinearGradient(0, H - E.pond.deckH * 0.55, 0, H);
  eg.addColorStop(0, 'rgba(20,10,5,0)'); eg.addColorStop(1, 'rgba(20,10,5,0.6)');
  ctx.fillStyle = eg; ctx.fillRect(0, top, W, H - top);
  // 脱鞋石
  const sx = E.pond.cx + rng.range(-0.2, 0.2) * E.pond.rx;
  E.deckStepX = sx;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 8 * S; ctx.shadowOffsetY = 4 * S;
  ctx.fillStyle = '#a7a39a';
  ctx.fill(U.blobPath(sx, top - 6 * S, 34 * S, rng, 0.1, 12, 0.5));
  ctx.restore();
  // 纸灯笼（行灯）
  const lx = rng.chance(0.5) ? W * 0.15 : W * 0.85, ly = top + E.pond.deckH * 0.4;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10 * S; ctx.shadowOffsetX = 5 * S; ctx.shadowOffsetY = 6 * S;
  ctx.fillStyle = '#3a2416';
  ctx.fillRect(lx - 16 * S, ly - 16 * S, 32 * S, 32 * S);
  ctx.restore();
  ctx.fillStyle = '#f3e6c8';
  ctx.fillRect(lx - 13 * S, ly - 13 * S, 26 * S, 26 * S);
  ctx.strokeStyle = '#3a2416'; ctx.lineWidth = 1.5 * S;
  ctx.beginPath(); ctx.moveTo(lx, ly - 13 * S); ctx.lineTo(lx, ly + 13 * S); ctx.moveTo(lx - 13 * S, ly); ctx.lineTo(lx + 13 * S, ly); ctx.stroke();
  E.lights.push({ x: lx, y: ly, r: 150 * S, warm: 1 });
}

/* ================= 池底 ================= */

function drawPondFloor(E, ctx) {
  const { pond, S, rng, season } = E;
  ctx.save();
  ctx.clip(pond.path);
  const R = Math.max(pond.rx, pond.ry) * 1.05;
  const g = ctx.createRadialGradient(pond.cx, pond.cy, R * 0.1, pond.cx, pond.cy, R);
  const cols = season === 'winter'
    ? ['#082a30', '#0e3d44', '#1d5258', '#3c5e60']
    : ['#04302f', '#0a4844', '#13605a', '#2f6a5a'];
  g.addColorStop(0, cols[0]);
  g.addColorStop(0.55, cols[1]);
  g.addColorStop(0.85, cols[2]);
  g.addColorStop(1, cols[3]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, E.W, E.H);
  // 斑驳的池底
  for (let i = 0; i < 40 * E.areaK; i++) {
    const [x, y] = pond.randomPoint(1, rng);
    const r = rng.range(30, 110) * S;
    const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = rng.chance(0.5) ? '30,80,60' : '0,10,8';
    gg.addColorStop(0, `rgba(${c},0.25)`); gg.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  // 卵石：靠近池边更密
  const pebbleCols = ['#6b6a55', '#5a5848', '#7c7360', '#4a4a3c', '#8a8068', '#3f4a3c'];
  for (let i = 0; i < 1400 * E.areaK; i++) {
    const a = rng.range(0, TAU);
    const f = 1.02 - Math.pow(rng(), 2.2) * 0.45;
    const [x, y] = pond.pointAt(a, f);
    const r = rng.range(2, 7) * S;
    ctx.globalAlpha = 0.08 + (f - 0.57) * 0.45;
    ctx.fillStyle = rng.pick(pebbleCols);
    ctx.beginPath(); ctx.ellipse(x, y, r, r * rng.range(0.6, 0.9), rng.range(0, TAU), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 水草
  ctx.lineCap = 'round';
  for (let i = 0; i < 14 * Math.sqrt(E.areaK); i++) {
    const [x, y] = pond.pointAt(rng.range(0, TAU), rng.range(0.6, 0.95));
    for (let k = 0; k < 7; k++) {
      const a = rng.range(0, TAU), l = rng.range(20, 50) * S;
      ctx.strokeStyle = U.rgba(rng.pick(['#2f5a2a', '#3b6a2e', '#24481f']), 0.4);
      ctx.lineWidth = rng.range(1.5, 3) * S;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a + 0.5) * l * 0.6, y + Math.sin(a + 0.5) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* ================= 池岸 ================= */

function drawInnerShadow(E, ctx) {
  ctx.save();
  ctx.clip(E.pond.path);
  // 只保留模糊的投影（把描边本身移到画面外）
  const off = 20000;
  ctx.translate(-off, 0);
  const outside = new Path2D();
  outside.rect(-E.W, -E.H, E.W * 3, E.H * 3);
  outside.addPath(E.pond.path);
  ctx.fillStyle = '#000';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 34 * E.S;
  ctx.shadowOffsetX = off * (ctx.getTransform().a || 1);
  ctx.fill(outside, 'evenodd');
  ctx.restore();
}

function drawRimBand(E, ctx) {
  const { S, env, season } = E;
  ctx.save();
  outsideClip(ctx, E);
  ctx.lineJoin = 'round';
  const band = env === 'karesansui' ? '#8f8a7e' : env === 'bamboo' ? '#3a3424' : GREENS[season][2];
  ctx.strokeStyle = U.rgba(E.winter ? '#cfd8e2' : band, 0.7);
  ctx.lineWidth = 14 * S;
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 8 * S;
  ctx.stroke(E.pond.path);
  ctx.restore();
}

function drawStone(ctx, E, x, y, r, opts = {}) {
  const rng = E.rng, S = E.S;
  const tone = opts.tone || '#8e8b82';
  const path = U.blobPath(x, y, r, rng, opts.jitter ?? 0.2, 11, opts.squash ?? rng.range(0.65, 0.95), rng.range(0, TAU));
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = r * 0.5;
  ctx.shadowOffsetX = r * 0.18;
  ctx.shadowOffsetY = r * 0.25;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, U.shade(tone, opts.flat ? 0.25 : 0.35));
  g.addColorStop(0.6, tone);
  g.addColorStop(1, U.shade(tone, -0.4));
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.restore();
  ctx.save();
  ctx.clip(path);
  // 纹理
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
    ctx.beginPath(); ctx.arc(x + rng.range(-r, r), y + rng.range(-r, r), rng.range(1, r * 0.25), 0, TAU); ctx.fill();
  }
  if (opts.moss) {
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = U.rgba(rng.pick(GREENS[E.season]), 0.6);
      ctx.beginPath(); ctx.arc(x + rng.range(-r, r * 0.4), y + rng.range(-r, r * 0.3), rng.range(r * 0.08, r * 0.3), 0, TAU); ctx.fill();
    }
  }
  if (E.winter) {
    const sg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x - r * 0.2, y - r * 0.25, r * 0.85);
    sg.addColorStop(0, 'rgba(250,252,255,0.97)');
    sg.addColorStop(0.75, 'rgba(240,245,250,0.9)');
    sg.addColorStop(1, 'rgba(240,245,250,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.25, r * 0.85, 0, TAU); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 0.8 * S;
  ctx.stroke(path);
  return path;
}

const STONE_TONES = {
  moss: '#8d8b80', karesansui: '#9a978e', boardwalk: '#7d7a70', bridge: '#a09a8c', temple: '#8f8c86', bamboo: '#77756d',
};

function drawRimStones(E, ctx) {
  const { pond, S, rng, env } = E;
  const tone = STONE_TONES[env];
  const moss = env === 'moss' || env === 'boardwalk' || env === 'bamboo';
  // 沿池边一圈
  let a = rng.range(0, TAU);
  const end = a + TAU;
  while (a < end) {
    const r = rng.range(12, 30) * S;
    const [x, y] = pond.pointAt(a, rng.range(1.0, 1.06));
    if (!(pond.deckH && y > E.H - pond.deckH)) {
      if (rng.chance(0.75)) drawStone(ctx, E, x, y, r, { tone: U.shade(tone, rng.range(-0.12, 0.12)), moss: moss && rng.chance(0.6) });
    }
    const circ = Math.hypot(pond.rx, pond.ry) * 1.4;
    a += (r * rng.range(1.3, 2.4)) / circ;
  }
  // 几块大景石
  for (let i = 0; i < 2 + Math.round(rng.range(0, 2) * Math.sqrt(E.areaK)); i++) {
    const r = rng.range(42, 70) * S;
    const [x, y] = pond.pointAt(rng.range(0, TAU), rng.range(1.02, 1.1));
    if (pond.deckH && y > E.H - pond.deckH - r) continue;
    drawStone(ctx, E, x, y, r, { tone: U.shade(tone, rng.range(-0.15, 0.05)), moss });
    E.occupied.push({ x, y, r });
  }
  // 池中小岛石
  if (rng.chance(0.55)) {
    const [x, y] = pond.pointAt(rng.range(0, TAU), rng.range(0.5, 0.7));
    drawStone(ctx, E, x, y, rng.range(18, 30) * S, { tone, moss });
  }
  if (E.zenStones) for (const [x, y, r] of E.zenStones) drawStone(ctx, E, x, y, r, { tone: '#7e7a72', moss: false, squash: 0.7 });
}

/* ================= 朱桥 ================= */

function drawBridge(E, ctx) {
  const { pond, S, rng, W } = E;
  const y0 = E.bridgeY || pond.cy + pond.ry * 0.22;
  const findEdge = (dir) => {
    let x = pond.cx;
    while (x > -50 && x < W + 50 && pond.factor(x, y0) < 1) x += dir * 4;
    return x + dir * 46 * S;
  };
  const x1 = findEdge(-1), x2 = findEdge(1);
  const bw = 52 * S;
  const cyOff = -pond.ry * 0.1;
  const N = 48, pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = U.lerp(x1, x2, t);
    const y = y0 + Math.sin(t * Math.PI) * cyOff;
    pts.push([x, y]);
  }
  const norm = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
    return [-dy / d, dx / d];
  });
  const side = (k) => pts.map((p, i) => [p[0] + norm[i][0] * k, p[1] + norm[i][1] * k]);
  const L = side(-bw / 2), R = side(bw / 2);
  const deck = new Path2D();
  L.forEach(([x, y], i) => (i ? deck.lineTo(x, y) : deck.moveTo(x, y)));
  for (let i = N; i >= 0; i--) deck.lineTo(R[i][0], R[i][1]);
  deck.closePath();

  // 水面投影
  ctx.save();
  ctx.clip(pond.path);
  ctx.translate(18 * S, 30 * S);
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.filter = `blur(${6 * S}px)`;
  ctx.fill(deck);
  ctx.restore();
  // 桥面
  const g = ctx.createLinearGradient(x1, 0, x2, 0);
  g.addColorStop(0, '#8e2219'); g.addColorStop(0.5, '#c94a3a'); g.addColorStop(1, '#8e2219');
  ctx.fillStyle = g;
  ctx.fill(deck);
  ctx.save();
  ctx.clip(deck);
  ctx.strokeStyle = 'rgba(60,10,5,0.35)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= N; i++) {
    ctx.beginPath(); ctx.moveTo(L[i][0], L[i][1]); ctx.lineTo(R[i][0], R[i][1]); ctx.stroke();
  }
  if (E.winter) {
    ctx.fillStyle = 'rgba(245,248,252,0.88)';
    const sn = new Path2D();
    const L2 = side(-bw * 0.33), R2 = side(bw * 0.33);
    L2.forEach(([x, y], i) => (i ? sn.lineTo(x, y) : sn.moveTo(x, y)));
    for (let i = N; i >= 0; i--) sn.lineTo(R2[i][0], R2[i][1]);
    ctx.fill(sn);
  }
  ctx.restore();
  // 栏杆
  for (const k of [-bw / 2 + 3 * S, bw / 2 - 3 * S]) {
    const rail = side(k);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 4 * S; ctx.shadowOffsetX = 3 * S; ctx.shadowOffsetY = 5 * S;
    ctx.strokeStyle = '#7f1d16';
    ctx.lineWidth = 6 * S;
    ctx.lineCap = 'round';
    ctx.beginPath();
    rail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = E.winter ? 'rgba(250,250,255,0.9)' : '#d9604f';
    ctx.lineWidth = 2 * S;
    ctx.beginPath();
    rail.forEach(([x, y], i) => (i ? ctx.lineTo(x, y - 1) : ctx.moveTo(x, y - 1)));
    ctx.stroke();
    for (let i = 0; i <= N; i += 6) {
      const [x, y] = rail[i];
      ctx.fillStyle = '#6e1810';
      ctx.fillRect(x - 4 * S, y - 4 * S, 8 * S, 8 * S);
      if (i === 0 || i === N || i === N / 2) {
        // 擬宝珠
        const gg = ctx.createRadialGradient(x - 2 * S, y - 2 * S, 0, x, y, 7 * S);
        gg.addColorStop(0, '#f0d78a'); gg.addColorStop(1, '#8a6a24');
        ctx.fillStyle = gg;
        ctx.beginPath(); ctx.arc(x, y, 6.5 * S, 0, TAU); ctx.fill();
      }
    }
  }
  E.occupied.push({ x: x1, y: y0, r: 70 * S }, { x: x2, y: y0, r: 70 * S });
}

/* ================= 木栈道（八桥式） ================= */

function drawBoardwalk(E, ctx) {
  const { pond, S, rng, H } = E;
  const bw = 54 * S;
  const xs = pond.cx - pond.rx * rng.range(0.35, 0.55);
  const topY = (() => { let y = pond.cy; while (y > -50 && pond.factor(xs, y) < 1) y -= 4; return y - 40 * S; })();
  const botY = (() => { let y = pond.cy; while (y < H + 50 && pond.factor(xs + pond.rx * 0.25, y) < 1) y += 4; return y + 40 * S; })();
  const pts = [
    [xs - pond.rx * 0.05, topY],
    [xs + pond.rx * 0.08, U.lerp(topY, botY, 0.33)],
    [xs - pond.rx * 0.1, U.lerp(topY, botY, 0.62)],
    [xs + pond.rx * 0.25, botY],
  ];
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
  const segPath = ([a, b], w, ext = 0) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
    const ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
    const ax = a[0] - ux * ext, ay = a[1] - uy * ext, bx = b[0] + ux * ext, by = b[1] + uy * ext;
    const p = new Path2D();
    p.moveTo(ax + nx * w / 2, ay + ny * w / 2);
    p.lineTo(bx + nx * w / 2, by + ny * w / 2);
    p.lineTo(bx - nx * w / 2, by - ny * w / 2);
    p.lineTo(ax - nx * w / 2, ay - ny * w / 2);
    p.closePath();
    return { p, ux, uy, nx, ny, d };
  };
  // 投影
  ctx.save();
  ctx.clip(pond.path);
  ctx.filter = `blur(${5 * S}px)`;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.translate(16 * S, 26 * S);
  for (const s of segs) ctx.fill(segPath(s, bw, bw * 0.3).p);
  ctx.restore();
  // 桥面木板
  segs.forEach((s, si) => {
    const { p, ux, uy, nx, ny, d } = segPath(s, bw, bw * 0.3);
    ctx.save();
    ctx.clip(p);
    ctx.fillStyle = '#8c7b64';
    ctx.fill(p);
    const step = 11 * S;
    for (let t = -bw * 0.3; t < d + bw * 0.3; t += step) {
      const cx = s[0][0] + ux * t, cy = s[0][1] + uy * t;
      ctx.fillStyle = rng.pick(['#a39279', '#968569', '#8a7a62', '#b0a084', '#7f705a']);
      ctx.beginPath();
      ctx.moveTo(cx + nx * bw, cy + ny * bw);
      ctx.lineTo(cx + nx * bw + ux * (step - 1.5 * S), cy + ny * bw + uy * (step - 1.5 * S));
      ctx.lineTo(cx - nx * bw + ux * (step - 1.5 * S), cy - ny * bw + uy * (step - 1.5 * S));
      ctx.lineTo(cx - nx * bw, cy - ny * bw);
      ctx.fill();
      // 木纹
      ctx.strokeStyle = 'rgba(50,35,20,0.18)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(cx + nx * bw + ux * step * 0.5, cy + ny * bw + uy * step * 0.5);
      ctx.lineTo(cx - nx * bw + ux * step * 0.5, cy - ny * bw + uy * step * 0.5);
      ctx.stroke();
    }
    if (E.winter) {
      ctx.fillStyle = 'rgba(245,248,252,0.85)';
      ctx.fill(segPath(s, bw * 0.7, bw * 0.2).p);
    }
    ctx.restore();
    // 边梁 + 栏杆柱
    for (const k of [-1, 1]) {
      const ox = nx * k * (bw / 2 - 2 * S), oy = ny * k * (bw / 2 - 2 * S);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 4 * S; ctx.shadowOffsetX = 3 * S; ctx.shadowOffsetY = 5 * S;
      ctx.strokeStyle = '#6e604c';
      ctx.lineWidth = 5 * S;
      ctx.beginPath();
      ctx.moveTo(s[0][0] - ux * bw * 0.3 + ox, s[0][1] - uy * bw * 0.3 + oy);
      ctx.lineTo(s[1][0] + ux * bw * 0.3 + ox, s[1][1] + uy * bw * 0.3 + oy);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = E.winter ? 'rgba(250,250,255,0.85)' : '#b3a387';
      ctx.lineWidth = 1.6 * S;
      ctx.beginPath();
      ctx.moveTo(s[0][0] - ux * bw * 0.3 + ox, s[0][1] - uy * bw * 0.3 + oy - 1);
      ctx.lineTo(s[1][0] + ux * bw * 0.3 + ox, s[1][1] + uy * bw * 0.3 + oy - 1);
      ctx.stroke();
      const nPost = Math.max(2, Math.round(d / (90 * S)));
      for (let i = 0; i <= nPost; i++) {
        const t = (i / nPost) * d;
        const px = s[0][0] + ux * t + ox, py = s[0][1] + uy * t + oy;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6 * S; ctx.shadowOffsetX = 6 * S; ctx.shadowOffsetY = 10 * S;
        ctx.fillStyle = '#5e5242';
        ctx.fillRect(px - 5 * S, py - 5 * S, 10 * S, 10 * S);
        ctx.restore();
        ctx.fillStyle = E.winter ? '#f2f5f8' : '#857660';
        ctx.fillRect(px - 3.5 * S, py - 3.5 * S, 7 * S, 7 * S);
      }
    }
  });
  E.occupied.push(...pts.map(([x, y]) => ({ x, y, r: 60 * S })));
}

/* ================= 竹林 ================= */

function drawBambooFence(E, ctx) {
  const { W, S, rng } = E;
  const y = 16 * S;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8 * S; ctx.shadowOffsetY = 8 * S;
  ctx.fillStyle = '#6f7a3a';
  ctx.fillRect(0, y - 8 * S, W, 16 * S);
  ctx.restore();
  for (let x = 0; x < W; x += 11 * S) {
    const g = ctx.createRadialGradient(x - 1.5 * S, y - 2 * S, 0, x, y, 6 * S);
    g.addColorStop(0, E.winter ? '#f4f6f8' : '#c9c27a'); g.addColorStop(1, '#6a6a2e');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y + rng.range(-1, 1) * S, 5.2 * S, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = '#3e2c1a';
  ctx.lineWidth = 2.2 * S;
  for (let x = 60 * S; x < W; x += 120 * S) {
    ctx.beginPath(); ctx.moveTo(x - 6 * S, y - 9 * S); ctx.lineTo(x + 6 * S, y + 9 * S); ctx.moveTo(x + 6 * S, y - 9 * S); ctx.lineTo(x - 6 * S, y + 9 * S); ctx.stroke();
  }
}

function drawBambooClump(ctx, E, x, y, R, rng) {
  const S = E.S;
  softShadow(ctx, x + R * 0.3, y + R * 0.4, R * 1.1, 0.28);
  // 竹竿俯视（圆环）
  const n = rng.int(8, 16);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU), d = rng.range(0, R * 0.22);
    const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d, r = rng.range(4, 7) * S;
    ctx.fillStyle = '#5d7a2e';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#9db45a'; ctx.lineWidth = 1.5 * S;
    ctx.stroke();
  }
  // 竹叶
  const cols = E.winter ? ['#3e5a2a', '#4d6a32', '#36502a'] : E.season === 'autumn' ? ['#6e8a3a', '#8a9a44', '#5a7a30', '#a8a050'] : ['#4f7e2e', '#5f9238', '#3e6a24', '#76a84a', '#2f5a20'];
  const leaves = Math.round(260 * (R / (120 * S)));
  for (let i = 0; i < leaves; i++) {
    const a = rng.range(0, TAU), d = R * Math.pow(rng(), 0.7);
    const lx = x + Math.cos(a) * d, ly = y + Math.sin(a) * d;
    const len = rng.range(16, 30) * S;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(a + rng.range(-0.8, 0.8));
    ctx.fillStyle = rng.pick(cols);
    ctx.globalAlpha = rng.range(0.75, 1);
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0);
    ctx.quadraticCurveTo(0, -len * 0.14, len / 2, 0);
    ctx.quadraticCurveTo(0, len * 0.14, -len / 2, 0);
    ctx.fill();
    if (E.winter && rng.chance(0.45)) {
      ctx.fillStyle = 'rgba(248,250,255,0.9)';
      ctx.beginPath(); ctx.ellipse(-len * 0.05, -len * 0.03, len * 0.3, len * 0.07, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/* ================= 装饰：灯笼 / 灌木 / 菖蒲 / 蹲踞 ================= */

function drawLantern(ctx, E, x, y, s) {
  const S = E.S;
  softShadow(ctx, x + s * 0.5, y + s * 0.7, s * 1.5, 0.35);
  // 笠（六角屋顶）
  const hex = new Path2D();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    i ? hex.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s) : hex.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
  }
  hex.closePath();
  const g = ctx.createRadialGradient(x - s * 0.4, y - s * 0.4, s * 0.1, x, y, s * 1.2);
  g.addColorStop(0, '#b9b6ad'); g.addColorStop(1, '#5e5c56');
  ctx.fillStyle = g;
  ctx.fill(hex);
  ctx.strokeStyle = 'rgba(30,30,30,0.5)'; ctx.lineWidth = 1 * S;
  ctx.stroke(hex);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + Math.PI / 6;
    ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
    // 蕨手
    ctx.moveTo(x + Math.cos(a) * s * 1.08 + 2.5 * S, y + Math.sin(a) * s * 1.08);
    ctx.arc(x + Math.cos(a) * s * 1.08, y + Math.sin(a) * s * 1.08, 2.5 * S, 0, TAU);
  }
  ctx.strokeStyle = 'rgba(40,40,40,0.45)';
  ctx.stroke();
  // 苔
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = U.rgba(E.rng.pick(GREENS[E.season]), 0.45);
    ctx.beginPath(); ctx.arc(x + E.rng.range(-s, s) * 0.7, y + E.rng.range(-s, s) * 0.7, E.rng.range(1, 3.5) * S, 0, TAU); ctx.fill();
  }
  if (E.winter) {
    ctx.fillStyle = 'rgba(248,250,253,0.95)';
    ctx.beginPath(); ctx.arc(x - s * 0.1, y - s * 0.1, s * 0.8, 0, TAU); ctx.fill();
  }
  // 宝珠
  const pg = ctx.createRadialGradient(x - s * 0.08, y - s * 0.08, 0, x, y, s * 0.28);
  pg.addColorStop(0, '#d2cfc6'); pg.addColorStop(1, '#6a6862');
  ctx.fillStyle = pg;
  ctx.beginPath(); ctx.arc(x, y, s * 0.24, 0, TAU); ctx.fill();
  E.lights.push({ x: x + s * 0.2, y: y + s * 0.35, r: 190 * S, warm: 1 });
}

function drawShrub(ctx, E, x, y, r, rng) {
  const S = E.S, season = E.season;
  softShadow(ctx, x + r * 0.3, y + r * 0.4, r * 1.25, 0.3);
  const base = {
    spring: ['#4f7a30', '#5e8a38', '#3f6826'], summer: ['#36612a', '#447232', '#2a5020'],
    autumn: ['#b8401e', '#cc5a28', '#9a2e18', '#d8782e'], winter: ['#3a5a2c', '#466634', '#2e4a24'],
  }[season];
  const n = rng.int(4, 7);
  const blobs = [];
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU), d = rng.range(0, r * 0.45);
    blobs.push([x + Math.cos(a) * d, y + Math.sin(a) * d, r * rng.range(0.45, 0.7)]);
  }
  for (const [bx, by, br] of blobs) {
    const g = ctx.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.1, bx, by, br);
    g.addColorStop(0, U.shade(base[0], 0.25)); g.addColorStop(0.7, base[1 % base.length]); g.addColorStop(1, U.shade(base[2], -0.2));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill();
  }
  // 叶片纹理
  for (let i = 0; i < 140 * (r / (40 * S)); i++) {
    const [bx, by, br] = rng.pick(blobs);
    const a = rng.range(0, TAU), d = br * Math.sqrt(rng());
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = U.shade(rng.pick(base), rng.range(-0.2, 0.3));
    ctx.beginPath(); ctx.arc(bx + Math.cos(a) * d, by + Math.sin(a) * d, rng.range(1.2, 3) * S, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // 花
  if (season === 'spring' || (season === 'summer' && rng.chance(0.4))) {
    const fc = season === 'spring' ? rng.pick([['#e0457f', '#f27aa6'], ['#d13a6a', '#ee6f98'], ['#f4f0f0', '#ffffff']]) : ['#f6f2ee', '#ffffff'];
    for (let i = 0; i < 70 * (r / (40 * S)); i++) {
      const [bx, by, br] = rng.pick(blobs);
      const a = rng.range(0, TAU), d = br * Math.sqrt(rng()) * 0.95;
      ctx.fillStyle = rng.pick(fc);
      ctx.beginPath(); ctx.arc(bx + Math.cos(a) * d, by + Math.sin(a) * d, rng.range(2, 3.6) * S, 0, TAU); ctx.fill();
    }
  }
  if (E.winter) {
    for (const [bx, by, br] of blobs) {
      const g = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.35, 0, bx - br * 0.2, by - br * 0.2, br * 0.85);
      g.addColorStop(0, 'rgba(250,252,255,0.97)'); g.addColorStop(0.7, 'rgba(240,245,250,0.85)'); g.addColorStop(1, 'rgba(240,245,250,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bx - br * 0.2, by - br * 0.2, br * 0.85, 0, TAU); ctx.fill();
    }
  }
}

function drawIris(ctx, E, x, y, s, rng) {
  const S = E.S, season = E.season;
  const cols = season === 'autumn' ? ['#9a9a44', '#a8964a', '#7e8a3a'] : season === 'winter' ? ['#8a7a58', '#9a8a62', '#76684a'] : ['#4f8a34', '#5e9a3c', '#3e7a2a', '#6aa848'];
  const n = rng.int(12, 22);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU), l = rng.range(18, 38) * s;
    const w = rng.range(2, 3.5) * s;
    const cx = x + rng.range(-4, 4) * s, cy = y + rng.range(-4, 4) * s;
    const ex = cx + Math.cos(a) * l, ey = cy + Math.sin(a) * l;
    const nx = -Math.sin(a), ny = Math.cos(a);
    ctx.fillStyle = rng.pick(cols);
    ctx.beginPath();
    ctx.moveTo(cx + nx * w, cy + ny * w);
    ctx.quadraticCurveTo((cx + ex) / 2 + nx * w * 1.2, (cy + ey) / 2 + ny * w * 1.2, ex, ey);
    ctx.quadraticCurveTo((cx + ex) / 2 - nx * w * 0.6, (cy + ey) / 2 - ny * w * 0.6, cx - nx * w, cy - ny * w);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,220,0.15)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
  }
  if (season === 'summer' || (season === 'spring' && rng.chance(0.5))) {
    const nf = rng.int(1, 3);
    for (let i = 0; i < nf; i++) {
      const fx = x + rng.range(-14, 14) * s, fy = y + rng.range(-14, 14) * s;
      const c = rng.pick(['#5a3a9e', '#6b44b5', '#f2eefa', '#4a3488']);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU + rng.range(0, 1);
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.ellipse(fx + Math.cos(a) * 5 * s, fy + Math.sin(a) * 5 * s, 6 * s, 3.4 * s, a, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#f2c94c';
        ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * 4 * s, fy + Math.sin(a) * 4 * s, 2 * s, 0.9 * s, a, 0, TAU); ctx.fill();
      }
    }
  }
}

function drawFern(ctx, E, x, y, s, rng) {
  const cols = E.season === 'autumn' ? ['#8a8a3a', '#a08a3a'] : ['#4e8a34', '#5e9a3c', '#3e7a2a'];
  const n = rng.int(5, 8);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.3, 0.3), l = rng.range(18, 30) * s;
    ctx.strokeStyle = rng.pick(cols);
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    for (let t = 0.2; t < 1; t += 0.12) {
      const px = x + Math.cos(a) * l * t, py = y + Math.sin(a) * l * t, ll = (1 - t) * 8 * s + 2 * s;
      ctx.beginPath();
      ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a + 1.1) * ll, py + Math.sin(a + 1.1) * ll);
      ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a - 1.1) * ll, py + Math.sin(a - 1.1) * ll);
      ctx.stroke();
    }
  }
}

function drawTsukubai(ctx, E, x, y, s) {
  const S = E.S, rng = E.rng;
  for (let i = 0; i < 24; i++) {
    const a = rng.range(0, TAU), d = s * rng.range(1.1, 1.7);
    ctx.fillStyle = rng.pick(['#5a5a54', '#3e3e3a', '#6a6860']);
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rng.range(2, 4) * S, 0, TAU); ctx.fill();
  }
  drawStone(ctx, E, x, y, s, { tone: '#8a877e', jitter: 0.08, squash: 0.95 });
  const g = ctx.createRadialGradient(x - s * 0.15, y - s * 0.15, 0, x, y, s * 0.45);
  g.addColorStop(0, E.winter ? '#c8d8e4' : '#4a7a8a'); g.addColorStop(1, E.winter ? '#8aa0b0' : '#0e2a30');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, s * 0.42, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.ellipse(x - s * 0.15, y - s * 0.15, s * 0.12, s * 0.06, -0.6, 0, TAU); ctx.fill();
  // 竹筧
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 4 * S; ctx.shadowOffsetX = 4 * S; ctx.shadowOffsetY = 6 * S;
  ctx.strokeStyle = '#8a9a44'; ctx.lineWidth = 6 * S; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s * 2.2, y - s * 1.4); ctx.lineTo(x - s * 0.15, y - s * 0.1); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#5a6a2a'; ctx.lineWidth = 6.5 * S;
  ctx.beginPath(); ctx.moveTo(x - s * 1.3, y - s * 0.82); ctx.lineTo(x - s * 1.26, y - s * 0.79); ctx.stroke();
  // 柄杓
  ctx.strokeStyle = '#c8a870'; ctx.lineWidth = 1.5 * S;
  ctx.beginPath(); ctx.moveTo(x + s * 0.3, y - s * 0.65); ctx.lineTo(x + s * 0.95, y + s * 0.4); ctx.stroke();
  ctx.fillStyle = '#b8945a';
  ctx.beginPath(); ctx.arc(x + s * 0.3, y - s * 0.65, 4 * S, 0, TAU); ctx.fill();
}

function drawDecorations(E, ctx) {
  const { S, rng, env, pond } = E;
  const ok = notOnDeck(E);
  // 石灯笼
  const nL = env === 'karesansui' ? 1 : env === 'bridge' ? 2 : rng.int(1, 2);
  for (let i = 0; i < nL; i++) {
    const s = rng.range(22, 28) * S;
    const pt = place(E, s * 1.6, 1.12, 1.3, 60, ok);
    if (pt) drawLantern(ctx, E, pt[0], pt[1], s);
  }
  // 蹲踞
  if (env === 'moss' || env === 'temple' || env === 'bamboo') {
    const s = 24 * S;
    const pt = place(E, s * 2, 1.15, 1.35, 60, ok);
    if (pt) drawTsukubai(ctx, E, pt[0], pt[1], s);
  }
  // 菖蒲
  if (env === 'boardwalk' || env === 'bridge' || env === 'moss') {
    const n = Math.round((env === 'boardwalk' ? 26 : 9) * Math.sqrt(E.areaK));
    for (let i = 0; i < n; i++) {
      const [x, y] = pond.pointAt(rng.range(0, TAU), rng.range(0.96, 1.12));
      if (!ok(x, y)) continue;
      drawIris(ctx, E, x, y, S * rng.range(0.9, 1.3), rng);
    }
  }
  // 蕨
  if (env === 'moss' || env === 'bamboo') {
    for (let i = 0; i < 10 * Math.sqrt(E.areaK); i++) {
      const [x, y] = pond.pointAt(rng.range(0, TAU), rng.range(1.08, 1.5));
      if (ok(x, y)) drawFern(ctx, E, x, y, S, rng);
    }
  }
  // 修剪灌木（皋月杜鹃）
  if (env !== 'bamboo') {
    const n = Math.round(rng.range(3, 6) * Math.sqrt(E.areaK));
    for (let i = 0; i < n; i++) {
      const r = rng.range(28, 52) * S;
      const pt = place(E, r, 1.08, 1.45, 40, ok);
      if (pt) drawShrub(ctx, E, pt[0], pt[1], r, rng);
    }
  }
}

/* ================= 树木 ================= */

function drawBranches(ctx, x, y, a, len, w, depth, rng, snow) {
  const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
  ctx.strokeStyle = '#4a382a';
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + Math.cos(a + 0.2) * len * 0.5, y + Math.sin(a + 0.2) * len * 0.5, ex, ey);
  ctx.stroke();
  if (snow) {
    ctx.strokeStyle = 'rgba(250,252,255,0.85)';
    ctx.lineWidth = w * 0.45;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.25, y - w * 0.3);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.2) * len * 0.5 - w * 0.25, y + Math.sin(a + 0.2) * len * 0.5 - w * 0.3, ex - w * 0.25, ey - w * 0.3);
    ctx.stroke();
  }
  if (depth > 0) {
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      drawBranches(ctx, ex, ey, a + rng.range(-0.75, 0.75), len * rng.range(0.6, 0.78), w * 0.62, depth - 1, rng, snow);
    }
  }
}

function drawCanopy(ctx, x, y, R, colors, rng, S, kind) {
  const n = rng.int(16, 26);
  const cl = [];
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU), d = R * 0.72 * Math.sqrt(rng());
    cl.push([x + Math.cos(a) * d, y + Math.sin(a) * d, R * rng.range(0.22, 0.38)]);
  }
  for (const [cx, cy, cr] of cl) {
    ctx.fillStyle = U.shade(colors[0], -0.4);
    ctx.beginPath(); ctx.arc(cx + cr * 0.12, cy + cr * 0.16, cr, 0, TAU); ctx.fill();
  }
  for (const [cx, cy, cr] of cl) {
    const c = rng.pick(colors);
    const g = ctx.createRadialGradient(cx - cr * 0.35, cy - cr * 0.4, cr * 0.1, cx, cy, cr);
    g.addColorStop(0, U.shade(c, 0.22)); g.addColorStop(0.7, c); g.addColorStop(1, U.shade(c, -0.25));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, TAU); ctx.fill();
  }
  const blossom = kind === 'sakura' && colors[0] === FOLIAGE.sakura.spring[0];
  for (const [cx, cy, cr] of cl) {
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, TAU), d = cr * Math.sqrt(rng());
      const lightSide = Math.cos(a + 2.3) > 0;
      ctx.fillStyle = blossom ? rng.pick(['#fff4f7', '#fbd5e0', '#f4aac0', '#ffffff']) : U.shade(rng.pick(colors), lightSide ? rng.range(0, 0.3) : rng.range(-0.3, 0));
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rng.range(1.5, blossom ? 3.6 : 3) * S, 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawPine(ctx, x, y, R, colors, rng, S, snow) {
  // 枝
  const pads = [];
  const n = rng.int(5, 8);
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU), d = R * rng.range(0.25, 0.75);
    pads.push([x + Math.cos(a) * d, y + Math.sin(a) * d, R * rng.range(0.25, 0.38), a]);
  }
  ctx.strokeStyle = '#4a382a'; ctx.lineCap = 'round';
  for (const [px, py] of pads) {
    ctx.lineWidth = 5 * S;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo((x + px) / 2 + 10 * S, (y + py) / 2 - 8 * S, px, py); ctx.stroke();
  }
  pads.push([x, y, R * 0.3, 0]);
  for (const [px, py, pr] of pads) {
    ctx.fillStyle = U.shade(colors[2], -0.3);
    ctx.beginPath(); ctx.ellipse(px + pr * 0.1, py + pr * 0.15, pr, pr * 0.85, 0, 0, TAU); ctx.fill();
    const g = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.35, pr * 0.1, px, py, pr);
    g.addColorStop(0, U.shade(colors[3], 0.1)); g.addColorStop(1, colors[2]);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(px, py, pr, pr * 0.85, 0, 0, TAU); ctx.fill();
    // 松针
    ctx.lineWidth = 1 * S;
    for (let i = 0; i < 70; i++) {
      const a = rng.range(0, TAU), d = pr * Math.sqrt(rng()) * 0.9;
      const sx = px + Math.cos(a) * d, sy = py + Math.sin(a) * d * 0.85;
      const na = rng.range(0, TAU), nl = rng.range(3, 7) * S;
      ctx.strokeStyle = U.rgba(rng.pick(colors), 0.8);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(na) * nl, sy + Math.sin(na) * nl); ctx.stroke();
    }
    if (snow) {
      const sg = ctx.createRadialGradient(px - pr * 0.25, py - pr * 0.3, 0, px - pr * 0.15, py - pr * 0.2, pr * 0.8);
      sg.addColorStop(0, 'rgba(250,252,255,0.97)'); sg.addColorStop(0.7, 'rgba(240,245,250,0.8)'); sg.addColorStop(1, 'rgba(240,245,250,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.ellipse(px - pr * 0.15, py - pr * 0.2, pr * 0.8, pr * 0.65, 0, 0, TAU); ctx.fill();
    }
  }
}

function drawWillow(ctx, x, y, R, colors, rng, S) {
  ctx.lineCap = 'round';
  const n = 160;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU), d0 = R * rng.range(0.05, 0.35), d1 = R * rng.range(0.7, 1.05);
    const sx = x + Math.cos(a) * d0, sy = y + Math.sin(a) * d0;
    const ex = x + Math.cos(a) * d1, ey = y + Math.sin(a) * d1 + R * 0.08;
    ctx.strokeStyle = U.rgba(rng.pick(colors), 0.75);
    ctx.lineWidth = rng.range(1.2, 2.4) * S;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo((sx + ex) / 2 + rng.range(-8, 8) * S, (sy + ey) / 2 + 6 * S, ex, ey);
    ctx.stroke();
    // 叶子小点
    for (let t = 0.3; t < 1; t += 0.14) {
      ctx.fillStyle = U.rgba(rng.pick(colors), 0.85);
      ctx.beginPath(); ctx.ellipse(U.lerp(sx, ex, t), U.lerp(sy, ey, t), 3 * S, 1.2 * S, a, 0, TAU); ctx.fill();
    }
  }
}

function drawTree(ctx, E, x, y, R, kind, seed) {
  const S = E.S, season = E.season;
  const rng = U.rng(seed);
  const colors = FOLIAGE[kind][season];
  if (kind === 'pine') return drawPine(ctx, x, y, R, colors, rng, S, E.winter);
  if (kind === 'willow') {
    drawBranches(ctx, x, y, rng.range(0, TAU), R * 0.25, 9 * S, 1, rng, false);
    return drawWillow(ctx, x, y, R, colors, rng, S);
  }
  // 树干与主枝
  const nb = rng.int(5, 7);
  for (let i = 0; i < nb; i++) {
    drawBranches(ctx, x, y, (i / nb) * TAU + rng.range(-0.3, 0.3), R * rng.range(0.3, 0.42), 9 * S, colors ? 1 : 3, rng, E.winter);
  }
  if (colors) drawCanopy(ctx, x, y, R, colors, rng, S, kind);
}

function drawTrees(E, ctx, rctx) {
  const { S, rng, env, season, pond } = E;
  const ok = notOnDeck(E);
  let kinds = {
    moss: ['maple', 'pine', 'maple', 'sakura'],
    karesansui: ['pine', 'pine', 'maple'],
    boardwalk: ['willow', 'maple', 'pine', 'maple'],
    bridge: ['sakura', 'willow', 'maple', 'pine'],
    temple: ['sakura', 'maple', 'pine', 'maple'],
    bamboo: ['bamboo', 'bamboo', 'bamboo', 'maple', 'bamboo'],
  }[env].slice();
  if (season === 'spring') kinds = kinds.map((k) => (k === 'maple' && rng.chance(0.5) ? 'sakura' : k));
  if (season === 'autumn') kinds = kinds.map((k) => (k === 'sakura' && rng.chance(0.6) ? 'maple' : k));
  const count = U.clamp(Math.round(kinds.length * Math.sqrt(E.areaK)), 2, 7);
  const trees = [];
  for (let i = 0; i < count; i++) {
    const kind = kinds[i % kinds.length];
    const R = (kind === 'bamboo' ? rng.range(90, 140) : rng.range(105, 165)) * S;
    const pt = place(E, R * 0.55, 1.1, 1.45, 60, ok);
    if (!pt) continue;
    trees.push({ kind, R, x: pt[0], y: pt[1], seed: (rng() * 4294967296) >>> 0 });
  }
  // 投影
  for (const t of trees) softShadow(ctx, t.x + t.R * 0.3, t.y + t.R * 0.42, t.R * 1.05, kind0(t) ? 0.18 : 0.26);
  for (const t of trees) {
    if (t.kind === 'bamboo') drawBambooClump(ctx, E, t.x, t.y, t.R, U.rng(t.seed));
    else drawTree(ctx, E, t.x, t.y, t.R, t.kind, t.seed);
  }
  // 水面倒影：把树冠以池边为轴镜像到水中，模糊处理
  rctx.save();
  rctx.filter = `blur(${7 * S}px)`;
  for (const t of trees) {
    const a = Math.atan2((t.y - pond.cy) / pond.sy, (t.x - pond.cx) / pond.sx);
    const [ex, ey] = pond.pointAt(a, 1);
    const mx = ex * 2 - t.x, my = ey * 2 - t.y;
    if (t.kind === 'bamboo') drawBambooClump(rctx, E, mx, my, t.R, U.rng(t.seed));
    else drawTree(rctx, E, mx, my, t.R, t.kind, t.seed);
  }
  rctx.restore();
  function kind0(t) { return E.winter && t.kind !== 'pine' && t.kind !== 'bamboo'; }
}
