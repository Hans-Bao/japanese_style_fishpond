'use strict';
/* 锦鲤：外观生成、行为（游荡 / 跟随 / 觅食）、绘制 */

const KOI_N = 14; // 脊椎节点数
const WHITE = '#f6f3ec', HI = '#e0341c', SUMI = '#141416', BLACK = '#1a1a1d';

/** 根据品种生成花纹 */
function makeAppearance(sp, r) {
  const A = {
    base: WHITE, fin: '#f4efe6', finAlpha: 0.5, patches: [], metallic: false,
    reticulate: null, girth: r.range(0.92, 1.08), finEdge: null,
  };
  // 一团斑块 = 多个重叠圆，形状更自然
  const blob = (s, u, size, color, n = 5, spreadS = 0.7, spreadU = 0.9) => {
    for (let i = 0; i < n; i++) {
      A.patches.push({
        s: s + r.range(-1, 1) * size * spreadS,
        u: u + r.range(-1, 1) * spreadU * size * 6,
        r: size * r.range(0.6, 1.05),
        color,
      });
    }
  };
  // 红白式大斑纹：沿背部依次排列
  const hiPattern = (color, cover = 1) => {
    let s = r.range(0.0, 0.1);
    if (r.chance(0.85)) { blob(0.07, r.range(-0.15, 0.15), 0.07, color, 5, 0.5, 0.6); s = 0.2; }
    while (s < 0.82) {
      const size = r.range(0.06, 0.11) * cover;
      if (r.chance(0.78)) blob(s + size, r.range(-0.35, 0.35), size, color, r.int(5, 8), 0.9, 1.1);
      s += size * r.range(1.8, 3.2);
    }
  };
  switch (sp) {
    case 'kohaku': hiPattern(HI, 1.1); break;
    case 'sanke':
      hiPattern(HI, 1.0);
      for (let i = 0, n = r.int(3, 7); i < n; i++) blob(r.range(0.22, 0.85), r.range(-0.6, 0.6), r.range(0.02, 0.04), SUMI, 3, 0.6, 0.6);
      break;
    case 'showa':
      A.base = BLACK; A.fin = '#2b2b2e'; A.finAlpha = 0.6; A.finEdge = '#f4efe6';
      hiPattern(HI, 1.0);
      for (let i = 0, n = r.int(2, 4); i < n; i++) blob(r.range(0.1, 0.85), r.range(-0.6, 0.6), r.range(0.05, 0.08), WHITE, 5, 0.8, 1);
      break;
    case 'tancho':
      A.patches.push({ s: 0.09, u: 0, r: 0.068, color: HI });
      break;
    case 'ogon': A.base = '#e8b13a'; A.fin = '#f1c968'; A.metallic = true; break;
    case 'platinum': A.base = '#e9eef0'; A.fin = '#f4f7f8'; A.metallic = true; break;
    case 'asagi':
      A.base = '#7f9bb0'; A.reticulate = '#cfdbe4'; A.fin = '#e8723d'; A.finAlpha = 0.55;
      for (let s = 0.04; s < 0.9; s += 0.07) {
        blob(s, -1.25, 0.05, '#e0582a', 2, 0.4, 0.15);
        blob(s, 1.25, 0.05, '#e0582a', 2, 0.4, 0.15);
      }
      blob(0.04, 0, 0.05, '#c7d5df', 3, 0.4, 0.4);
      break;
    case 'chagoi': A.base = '#8d6237'; A.reticulate = '#b88f5e'; A.fin = '#9c7348'; A.girth *= 1.08; break;
    case 'kigoi': A.base = '#f1d24a'; A.fin = '#f6e08a'; break;
    case 'benigoi': A.base = '#d6431d'; A.fin = '#e8714a'; A.finAlpha = 0.55; break;
    case 'shiroutsuri':
      A.base = BLACK; A.fin = '#26262a'; A.finAlpha = 0.6; A.finEdge = '#f4efe6';
      for (let s = 0.08; s < 0.85; s += r.range(0.16, 0.26)) blob(s, r.range(-0.6, 0.6), r.range(0.07, 0.11), WHITE, 6, 0.9, 1.2);
      break;
    case 'hiutsuri':
      A.base = BLACK; A.fin = '#3a2018'; A.finAlpha = 0.6; A.finEdge = '#e86a3a';
      for (let s = 0.08; s < 0.85; s += r.range(0.16, 0.26)) blob(s, r.range(-0.6, 0.6), r.range(0.07, 0.11), '#de5a1e', 6, 0.9, 1.2);
      break;
    case 'kumonryu':
      A.base = '#1b1c1f'; A.fin = '#26272b'; A.finAlpha = 0.6; A.finEdge = '#eef0f0';
      for (let i = 0, n = r.int(5, 9); i < n; i++) blob(r.range(0.05, 0.9), r.range(-0.9, 0.9), r.range(0.04, 0.08), '#eceeee', 4, 0.8, 1.2);
      break;
  }
  return A;
}

/** 身体宽度曲线：s=0 头, s=1 尾柄 */
function koiProfile(s) {
  if (s < 0.2) return 0.62 + 0.38 * Math.sin((s / 0.2) * Math.PI / 2);
  return 1 - Math.pow((s - 0.2) / 0.8, 1.35) * 0.86;
}

class Koi {
  constructor(species, L, x, y, rnd = Math.random) {
    const r = U.rng((rnd() * 4294967296) >>> 0);
    this.species = species;
    this.app = makeAppearance(species, r);
    this.L = L;
    this.seg = (L * 0.76) / (KOI_N - 1);
    this.heading = r.range(0, TAU);
    this.pts = [];
    for (let i = 0; i < KOI_N; i++) {
      this.pts.push({ x: x - Math.cos(this.heading) * this.seg * i, y: y - Math.sin(this.heading) * this.seg * i });
    }
    this.baseSpeed = L * r.range(0.45, 0.75);
    this.speed = this.baseSpeed * 0.5;
    this.restZ = r.range(0.1, 0.6);
    this.z = this.restZ;
    this.phase = r.range(0, TAU);
    this.finPhase = r.range(0, TAU);
    this.wander = 0;
    this.wanderTarget = 0;
    this.wanderT = 0;
    this.mouth = 0;
    this.eatTimer = 0;
    this.wakeT = 0;
    this.perception = L * r.range(6, 14);
    this.orbit = r.chance(0.5) ? 1 : -1;
    this.gx = 0; this.gy = 0; // 折射偏移
    // 长鳍（蝴蝶鲤）概率 25%
    this.finLen = r.chance(0.25) ? r.range(1.45, 1.75) : r.range(1.0, 1.15);
    this.tailLen = L * 0.3 * this.finLen;
    const tx = this.pts[KOI_N - 1];
    this.tailPts = [];
    for (let i = 1; i <= 4; i++) {
      this.tailPts.push({ x: tx.x - Math.cos(this.heading) * this.tailLen * i / 4, y: tx.y - Math.sin(this.heading) * this.tailLen * i / 4 });
    }
    // 形状缓存
    this.ang = new Float32Array(KOI_N);
    this.w = new Float32Array(KOI_N);
    this.nx = new Float32Array(KOI_N);
    this.ny = new Float32Array(KOI_N);
    this.shape();
  }

  update(dt, world) {
    const { pond, foods, pointer, cfg, sim, rings } = world;
    const L = this.L, head = this.pts[0];
    const hx = Math.cos(this.heading), hy = Math.sin(this.heading);
    let sx = 0, sy = 0, speedMul = 0.55, tz = this.restZ;

    // 1) 游荡
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderTarget = U.rand(-1, 1) * (Math.random() < 0.15 ? 2.2 : 1);
      this.wanderT = U.rand(1.5, 5);
      if (Math.random() < 0.3) this.restZ = U.rand(0.05, 0.65);
      if (Math.random() < 0.2) this.speedBoost = U.rand(0.6, 1.5);
    }
    this.wander = U.lerp(this.wander, this.wanderTarget, Math.min(1, dt * 0.8));
    const wa = this.heading + this.wander * 0.9;
    sx += Math.cos(wa); sy += Math.sin(wa);
    speedMul *= this.speedBoost || 1;

    // 2) 觅食
    let target = null, td = Infinity;
    for (const f of foods) {
      if (f.eaten) continue;
      const d = Math.hypot(f.x - head.x, f.y - head.y);
      if (d < this.perception && d < td) { td = d; target = f; }
    }
    if (target) {
      const k = 4 / Math.max(td, 1);
      sx += (target.x - head.x) * k; sy += (target.y - head.y) * k;
      speedMul = td > L ? 1.45 : 0.55;
      tz = td < L * 2.5 ? 1 : 0.65;
      // 张嘴靠近
      if (td < L * 0.18 && this.z > 0.82) this.eat(target, sim, rings);
    } else if (pointer.following && cfg.follow) {
      // 3) 跟随鼠标
      const dx = pointer.x - head.x, dy = pointer.y - head.y;
      const d = Math.hypot(dx, dy);
      if (d < world.followR) {
        if (d > L * 0.9) {
          const k = 2.2 / d;
          sx += dx * k; sy += dy * k;
          speedMul = U.clamp(d / (L * 3), 0.6, 1.25);
        } else {
          // 围着指针打转
          sx += (-dy * this.orbit) / d * 1.5 - dx / d * 0.3;
          sy += (dx * this.orbit) / d * 1.5 - dy / d * 0.3;
          speedMul = 0.4;
        }
        tz = 0.72;
      }
    }

    if (this.eatTimer > 0) {
      this.eatTimer -= dt;
      tz = 1; speedMul = 0.3;
    }

    // 4) 避开池边（前视点）
    const lx = head.x + hx * L * 0.9, ly = head.y + hy * L * 0.9;
    const f = pond.factor(lx, ly);
    if (f > 0.68) {
      const w = Math.pow((f - 0.68) / 0.32, 2) * 5;
      const cx = pond.cx - head.x, cy = pond.cy - head.y, cd = Math.hypot(cx, cy) || 1;
      sx += (cx / cd) * w; sy += (cy / cd) * w;
    }

    // 5) 与同伴保持距离
    for (const o of world.fish) {
      if (o === this) continue;
      const dx = head.x - o.pts[0].x, dy = head.y - o.pts[0].y;
      const d = Math.hypot(dx, dy), lim = (L + o.L) * 0.4;
      if (d < lim && d > 0.01 && Math.abs(o.z - this.z) < 0.45) {
        const w = (1 - d / lim) * 1.6;
        sx += (dx / d) * w; sy += (dy / d) * w;
      }
    }

    // 转向（限制角速度）
    const sm = Math.hypot(sx, sy);
    if (sm > 0.01) {
      const desired = Math.atan2(sy, sx);
      const turnRate = (1.2 + (this.speed / this.baseSpeed) * 1.1) * (target ? 1.6 : 1);
      const diff = U.angDiff(desired, this.heading);
      const mt = turnRate * dt;
      this.heading += U.clamp(diff, -mt, mt);
      if (Math.abs(diff) > 1.4) speedMul *= 0.75;
    }

    const tSpeed = this.baseSpeed * speedMul;
    this.speed = U.lerp(this.speed, tSpeed, Math.min(1, dt * (tSpeed > this.speed ? 1.8 : 1.0)));

    // 摆尾推进：头部沿正弦方向前进，身体跟随形成波动
    const sp = this.speed / L;
    this.phase += dt * (3 + sp * 7);
    this.finPhase += dt * (2 + sp * 3);
    const swing = Math.sin(this.phase) * (0.12 + Math.min(0.22, sp * 0.25));
    const mv = this.heading + swing;
    head.x += Math.cos(mv) * this.speed * dt;
    head.y += Math.sin(mv) * this.speed * dt;
    if (pond.constrain(head, 0.95)) {
      // 撞边时转向中心
      const toC = Math.atan2(pond.cy - head.y, pond.cx - head.x);
      this.heading += U.angDiff(toC, this.heading) * Math.min(1, dt * 3);
    }

    // 身体跟随（带弯曲角度限制）
    const pts = this.pts, seg = this.seg;
    for (let i = 1; i < KOI_N; i++) {
      const p = pts[i], q = pts[i - 1];
      let a = Math.atan2(q.y - p.y, q.x - p.x);
      if (i >= 2) {
        const qq = pts[i - 2];
        const pa = Math.atan2(qq.y - q.y, qq.x - q.x);
        const maxBend = 0.2;
        a = pa + U.clamp(U.angDiff(a, pa), -maxBend, maxBend);
      }
      p.x = q.x - Math.cos(a) * seg;
      p.y = q.y - Math.sin(a) * seg;
    }

    // 尾鳍链：更柔软，自然拖曳飘动
    {
      const tseg = this.tailLen / 4;
      let prev = pts[KOI_N - 1], prevA = Math.atan2(pts[KOI_N - 2].y - prev.y, pts[KOI_N - 2].x - prev.x);
      for (let i = 0; i < 4; i++) {
        const p = this.tailPts[i];
        let a = Math.atan2(prev.y - p.y, prev.x - p.x);
        a = prevA + U.clamp(U.angDiff(a, prevA), -0.42, 0.42);
        p.x = prev.x - Math.cos(a) * tseg;
        p.y = prev.y - Math.sin(a) * tseg;
        prev = p; prevA = a;
      }
    }

    // 深度
    this.z += (tz - this.z) * Math.min(1, dt * (tz > this.z ? 1.0 : 0.5));

    // 嘴巴开合
    const atSurface = this.z > 0.88;
    const wantMouth = atSurface && (this.eatTimer > 0 || (target && td < L * 1.5)) ? 0.5 + 0.5 * Math.sin(world.t * 13 + this.phase) : 0;
    this.mouth = U.lerp(this.mouth, wantMouth, Math.min(1, dt * 12));

    // 浮到水面时产生尾流
    if (this.z > 0.8 && sim) {
      this.wakeT -= dt;
      if (this.wakeT <= 0) {
        this.wakeT = 0.1;
        const k = (this.z - 0.8) / 0.2;
        sim.disturb(head.x, head.y, L * 0.12, 7 * k * (0.4 + Math.min(1, sp)));
      }
    }

    // 水面折射造成的轻微晃动
    if (sim) {
      const [gx, gy] = sim.grad(head.x, head.y);
      const k = 0.06 * (1 - this.z * 0.7);
      this.gx = U.lerp(this.gx, U.clamp(gx * k, -4, 4), 0.3);
      this.gy = U.lerp(this.gy, U.clamp(gy * k, -4, 4), 0.3);
    }

    this.shape();
  }

  eat(food, sim, rings) {
    food.eaten = true;
    this.eatTimer = 0.9;
    const L = this.L;
    if (sim) sim.disturb(food.x, food.y, L * 0.22, 70);
    if (rings) {
      rings.add(food.x, food.y, L * 1.1, 0.75, L * 0.9, 3);
      setTimeout(() => rings.add(food.x, food.y, L * 0.7, 0.5, L * 0.6, 2), 220);
    }
  }

  shape() {
    const { pts, ang, w, nx, ny, L } = this;
    const N = KOI_N;
    for (let i = 0; i < N; i++) {
      const a = i === 0 ? pts[0] : pts[i - 1];
      const b = i === 0 ? pts[1] : pts[i];
      let t = Math.atan2(a.y - b.y, a.x - b.x);
      if (i > 0 && i < N - 1) {
        const t2 = Math.atan2(pts[i].y - pts[i + 1].y, pts[i].x - pts[i + 1].x);
        t = t + U.angDiff(t2, t) * 0.5;
      }
      ang[i] = t;
      nx[i] = -Math.sin(t);
      ny[i] = Math.cos(t);
      w[i] = L * 0.1 * koiProfile(i / (N - 1)) * this.app.girth;
    }
  }

  /** 沿脊柱插值：s∈[0,1]，u∈[-1,1] 横向位置 */
  at(s, u) {
    const f = U.clamp(s, 0, 1) * (KOI_N - 1);
    const i = Math.min(KOI_N - 2, Math.floor(f)), t = f - i;
    const p = this.pts[i], q = this.pts[i + 1];
    const w = U.lerp(this.w[i], this.w[i + 1], t);
    const nx = U.lerp(this.nx[i], this.nx[i + 1], t), ny = U.lerp(this.ny[i], this.ny[i + 1], t);
    return [U.lerp(p.x, q.x, t) + nx * u * w, U.lerp(p.y, q.y, t) + ny * u * w];
  }

  bodyPath() {
    const { pts, w, nx, ny, ang } = this;
    const N = KOI_N;
    const L = [], R = [];
    for (let i = 0; i < N; i++) {
      L.push([pts[i].x + nx[i] * w[i], pts[i].y + ny[i] * w[i]]);
      R.push([pts[i].x - nx[i] * w[i], pts[i].y - ny[i] * w[i]]);
    }
    const p = new Path2D();
    const dx = Math.cos(ang[0]), dy = Math.sin(ang[0]);
    const k = w[0] * 1.45;
    p.moveTo(R[0][0], R[0][1]);
    p.bezierCurveTo(R[0][0] + dx * k, R[0][1] + dy * k, L[0][0] + dx * k, L[0][1] + dy * k, L[0][0], L[0][1]);
    for (let i = 1; i < N - 1; i++) {
      p.quadraticCurveTo(L[i][0], L[i][1], (L[i][0] + L[i + 1][0]) / 2, (L[i][1] + L[i + 1][1]) / 2);
    }
    p.lineTo(L[N - 1][0], L[N - 1][1]);
    p.lineTo(R[N - 1][0], R[N - 1][1]);
    for (let i = N - 2; i >= 1; i--) {
      p.quadraticCurveTo(R[i][0], R[i][1], (R[i][0] + R[i - 1][0]) / 2, (R[i][1] + R[i - 1][1]) / 2);
    }
    p.closePath();
    return p;
  }

  tailPath() {
    const N = KOI_N, L = this.L;
    const c = [this.pts[N - 1], ...this.tailPts];
    const TL = this.tailLen, wb = this.w[N - 1] * 1.05;
    const left = [], right = [];
    for (let k = 0; k < c.length; k++) {
      const a = c[Math.max(0, k - 1)], b = c[Math.min(c.length - 1, k + (k === 0 ? 1 : 0))];
      const ang = k === 0 ? Math.atan2(c[0].y - c[1].y, c[0].x - c[1].x) : Math.atan2(a.y - b.y, a.x - b.x);
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      const t = k / (c.length - 1);
      const w = U.lerp(wb, TL * 0.34, Math.pow(t, 1.1)) * (1 + 0.07 * Math.sin(this.phase * 1.3 - k));
      left.push([c[k].x + nx * w, c[k].y + ny * w]);
      right.push([c[k].x - nx * w, c[k].y - ny * w]);
    }
    const last = c.length - 1;
    // 尾叉凹口
    const notch = [U.lerp(c[last - 1].x, c[last].x, 0.25), U.lerp(c[last - 1].y, c[last].y, 0.25)];
    const p = new Path2D();
    p.moveTo(left[0][0], left[0][1]);
    for (let k = 1; k < last; k++) p.quadraticCurveTo(left[k][0], left[k][1], (left[k][0] + left[k + 1][0]) / 2, (left[k][1] + left[k + 1][1]) / 2);
    p.lineTo(left[last][0], left[last][1]);
    p.quadraticCurveTo(c[last].x, c[last].y, notch[0], notch[1]);
    p.quadraticCurveTo(c[last].x, c[last].y, right[last][0], right[last][1]);
    for (let k = last - 1; k >= 1; k--) p.quadraticCurveTo(right[k][0], right[k][1], (right[k][0] + right[k - 1][0]) / 2, (right[k][1] + right[k - 1][1]) / 2);
    p.lineTo(right[0][0], right[0][1]);
    p.closePath();
    return { path: p, B: c[0], tip: c[last], c, left, right };
  }

  finPath(i, side, len, base, flapAmp) {
    len *= this.finLen;
    const a = this.ang[i];
    const flap = Math.sin(this.finPhase + (side > 0 ? 0 : 0.6)) * flapAmp;
    const fa = a + side * (Math.PI / 2 + base + flap);
    const bx = this.pts[i].x + this.nx[i] * this.w[i] * 0.75 * side;
    const by = this.pts[i].y + this.ny[i] * this.w[i] * 0.75 * side;
    const pt = (da, l) => [bx + Math.cos(fa + da * side) * len * l, by + Math.sin(fa + da * side) * len * l];
    const p1 = pt(-0.6, 0.8), p2 = pt(-0.05, 1.05), p3 = pt(0.45, 0.85);
    const p = new Path2D();
    p.moveTo(bx + Math.cos(a) * len * 0.12, by + Math.sin(a) * len * 0.12);
    p.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]);
    p.quadraticCurveTo(p3[0], p3[1], bx - Math.cos(a) * len * 0.3, by - Math.sin(a) * len * 0.3);
    p.closePath();
    return { path: p, bx, by, tip: p2, fa };
  }

  /** 剪影（用于投影） */
  drawSilhouette(ctx) {
    ctx.fill(this.bodyPath());
    ctx.fill(this.tailPath().path);
    ctx.fill(this.finPath(3, 1, this.L * 0.17, 0.6, 0.3).path);
    ctx.fill(this.finPath(3, -1, this.L * 0.17, 0.6, 0.3).path);
  }

  /** 鳍：从根部到边缘的半透明渐变 + 鳍条 */
  _fin(ctx, fp, x0, y0, x1, y1, rays) {
    const A = this.app;
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    const edge = A.finEdge || U.shade(A.fin, 0.45);
    g.addColorStop(0, U.rgba(A.fin, Math.min(0.95, A.finAlpha + 0.3)));
    g.addColorStop(0.55, U.rgba(A.fin, A.finAlpha * 0.75));
    g.addColorStop(1, typeof edge === 'string' && edge.startsWith('#') ? U.rgba(edge, 0.22) : 'rgba(255,255,255,0.22)');
    ctx.fillStyle = g;
    ctx.fill(fp.path);
    if (rays) {
      ctx.save();
      ctx.clip(fp.path);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = Math.max(0.6, this.L * 0.005);
      ctx.beginPath();
      rays();
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 0.8;
    ctx.stroke(fp.path);
  }

  draw(ctx, t) {
    const A = this.app, L = this.L;
    const surf = this.z > 0.85;
    ctx.save();
    ctx.translate(this.gx, this.gy);
    ctx.globalAlpha = surf ? 1 : 0.6 + 0.4 * Math.pow(this.z, 0.7);

    // 尾鳍
    const tail = this.tailPath();
    this._fin(ctx, tail, tail.B.x, tail.B.y, tail.tip.x, tail.tip.y, () => {
      const { c, left, right } = tail;
      for (let k = -3; k <= 3; k++) {
        const f = k / 3.4;
        ctx.moveTo(c[0].x, c[0].y);
        for (let j = 1; j < c.length; j++) {
          const lx = U.lerp(c[j].x, f > 0 ? left[j][0] : right[j][0], Math.abs(f));
          const ly = U.lerp(c[j].y, f > 0 ? left[j][1] : right[j][1], Math.abs(f));
          ctx.lineTo(lx, ly);
        }
      }
    });
    // 胸鳍 / 腹鳍
    for (const side of [1, -1]) {
      const fp = this.finPath(3, side, L * 0.17, 0.6, 0.32);
      this._fin(ctx, fp, fp.bx, fp.by, fp.tip[0], fp.tip[1], () => {
        for (let k = -2; k <= 3; k++) {
          const a = fp.fa + k * 0.22 * side;
          ctx.moveTo(fp.bx, fp.by);
          ctx.lineTo(fp.bx + Math.cos(a) * L * 0.25, fp.by + Math.sin(a) * L * 0.25);
        }
      });
      const pf = this.finPath(8, side, L * 0.085, 0.9, 0.2);
      this._fin(ctx, pf, pf.bx, pf.by, pf.tip[0], pf.tip[1]);
    }

    // 身体
    const body = this.bodyPath();
    ctx.fillStyle = A.base;
    ctx.fill(body);

    ctx.save();
    ctx.clip(body);
    for (const p of A.patches) {
      const [x, y] = this.at(p.s, p.u);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, p.r * L, 0, TAU);
      ctx.fill();
    }
    // 鳞片
    if (L > 34) {
      const sr = L * 0.026;
      const scales = new Path2D();
      let row = 0;
      for (let s = 0.17; s < 0.97; s += 0.034, row++) {
        const ai = Math.min(KOI_N - 1, Math.round(s * (KOI_N - 1)));
        const back = this.ang[ai] + Math.PI;
        for (let u = -1.05 + (row % 2) * 0.17; u <= 1.06; u += 0.34) {
          const [x, y] = this.at(s, u);
          scales.moveTo(x + Math.cos(back - 1.25) * sr, y + Math.sin(back - 1.25) * sr);
          scales.arc(x, y, sr, back - 1.25, back + 1.25);
        }
      }
      const strong = A.metallic || A.reticulate || A.base === '#d6431d';
      ctx.lineWidth = Math.max(0.6, L * 0.0055);
      ctx.strokeStyle = A.reticulate ? U.rgba(A.reticulate, 0.6) : strong ? 'rgba(120,60,10,0.35)' : 'rgba(90,30,20,0.16)';
      ctx.stroke(scales);
      ctx.save();
      ctx.translate(-0.6, -0.6);
      ctx.strokeStyle = strong ? 'rgba(255,230,160,0.45)' : 'rgba(255,255,255,0.16)';
      ctx.stroke(scales);
      ctx.restore();
    }
    // 体积光影：边缘渐暗（多层叠加形成柔和过渡）
    ctx.strokeStyle = 'rgba(10,20,25,0.09)';
    for (const k of [0.17, 0.11, 0.06, 0.03]) {
      ctx.lineWidth = L * k;
      ctx.stroke(body);
    }
    ctx.restore();

    // 背部高光带
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const spine = new Path2D();
    for (let i = 1; i < 11; i++) {
      const p = this.pts[i];
      const ox = this.nx[i] * this.w[i] * 0.18, oy = this.ny[i] * this.w[i] * 0.18; // 光从左上来
      i === 1 ? spine.moveTo(p.x - Math.abs(ox), p.y - Math.abs(oy)) : spine.lineTo(p.x - Math.abs(ox), p.y - Math.abs(oy));
    }
    const hiA = A.metallic ? 2.2 : 1;
    for (const [wk, a] of [[0.95, 0.05], [0.6, 0.07], [0.32, 0.09], [0.14, 0.12]]) {
      ctx.strokeStyle = `rgba(255,255,250,${a * hiA})`;
      ctx.lineWidth = this.w[4] * wk;
      ctx.stroke(spine);
    }
    // 背鳍
    ctx.beginPath();
    for (let i = 4; i < 10; i++) {
      const p = this.pts[i];
      i === 4 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = U.rgba(A.fin === '#f4efe6' ? '#b9b0a2' : A.fin, 0.5);
    ctx.lineWidth = Math.max(1, L * 0.02);
    ctx.stroke();

    // 眼睛（带高光）
    for (const u of [0.74, -0.74]) {
      const [x, y] = this.at(0.06, u);
      const er = Math.max(1.1, L * 0.019);
      ctx.fillStyle = 'rgba(20,18,22,0.92)';
      ctx.beginPath(); ctx.arc(x, y, er, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(x - er * 0.35, y - er * 0.35, er * 0.38, 0, TAU); ctx.fill();
    }
    // 鼻孔 + 须
    {
      const a0 = this.ang[0], n = this.pts[0];
      ctx.strokeStyle = U.rgba(A.base === BLACK || A.base === '#1b1c1f' ? '#555' : '#c9a890', 0.5);
      ctx.lineWidth = Math.max(0.6, L * 0.006);
      ctx.beginPath();
      for (const side of [1, -1]) {
        const bx = n.x + Math.cos(a0) * this.w[0] * 0.7 + this.nx[0] * this.w[0] * 0.45 * side;
        const by = n.y + Math.sin(a0) * this.w[0] * 0.7 + this.ny[0] * this.w[0] * 0.45 * side;
        const sw = Math.sin(t * 3 + this.phase) * 0.3;
        ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(
          bx + Math.cos(a0 + side * 0.8) * L * 0.03, by + Math.sin(a0 + side * 0.8) * L * 0.03,
          bx + Math.cos(a0 + side * (1.3 + sw)) * L * 0.05, by + Math.sin(a0 + side * (1.3 + sw)) * L * 0.05);
      }
      ctx.stroke();
    }

    // 浮出水面：张嘴 + 湿润高光
    if (surf) {
      const k = (this.z - 0.85) / 0.15;
      const a0 = this.ang[0];
      const nose = this.pts[0];
      const mx = nose.x + Math.cos(a0) * this.w[0] * 0.95, my = nose.y + Math.sin(a0) * this.w[0] * 0.95;
      if (this.mouth > 0.05) {
        ctx.fillStyle = `rgba(40,10,10,${0.85 * k})`;
        ctx.beginPath();
        ctx.ellipse(mx, my, L * 0.032 * (0.4 + this.mouth), L * 0.045 * (0.3 + this.mouth * 0.7), a0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(255,220,210,${0.6 * k})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      const [hx, hy] = this.at(0.1, 0.3);
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, L * 0.09);
      g.addColorStop(0, `rgba(255,255,255,${0.5 * k})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(hx, hy, L * 0.09, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,236,190,${0.45 * k})`;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(nose.x - Math.cos(a0) * L * 0.04, nose.y - Math.sin(a0) * L * 0.04, L * 0.15, L * 0.13, a0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
}
