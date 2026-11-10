'use strict';
/* 主程序：世界状态、主循环、渲染、交互 */

const World = {
  W: 0, H: 0, dpr: 1, S: 1, t: 0,
  cfg: null, res: null, seed: 0,
  pond: null, sim: null, rings: new Rings(), env: null,
  fish: [], foods: [], floaters: [], weather: new Weather(),
  pointer: { x: 0, y: 0, active: false, following: false, lastMove: -99, lastRipple: [0, 0] },
  wind: [0.6, 0.35], followR: 300, caustics: null, causticsPattern: null,
  shadow: null, ambientT: 2,
};

const App = (() => {
  const W = World;
  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');

  function autoFishCount() {
    return U.clamp(Math.round(Math.sqrt(W.W * W.H) / 105), 4, 20);
  }

  function spawnFish() {
    const n = W.res.fishCount || autoFishCount();
    const minD = Math.min(W.W, W.H);
    const Lbase = U.clamp(minD * 0.2, 64, 200) * U.clamp(Math.sqrt(12 / n), 0.6, 1.1);
    const pool = W.res.speciesPool.map((k) => [k, SPECIES[k].weight]);
    W.fish = [];
    for (let i = 0; i < n; i++) {
      const sp = U.weightedPick(pool);
      const [x, y] = W.pond.randomPoint(0.7);
      W.fish.push(new Koi(sp, Lbase * U.rand(0.72, 1.25), x, y));
    }
  }

  function buildWorld() {
    const rng = U.rng((W.res.seed ^ U.hash(W.res.env)) >>> 0);
    W.pond = new Pond(W.W, W.H, W.res.env, rng);
    W.sim = new RippleSim(W.W, W.H, W.pond);
    W.env = buildEnvironment(W);
    W.floaters = initFloaters(W);
    W.foods = [];
    W.rings.list = [];
    W.followR = Math.min(W.W, W.H) * 0.45;
    // 鱼若在池外，放回池中
    for (const f of W.fish) {
      if (W.pond.factor(f.pts[0].x, f.pts[0].y) > 0.85) {
        const [x, y] = W.pond.randomPoint(0.7);
        const dx = x - f.pts[0].x, dy = y - f.pts[0].y;
        for (const p of f.pts) { p.x += dx; p.y += dy; }
      }
    }
  }

  function resize() {
    W.dpr = Math.min(2, window.devicePixelRatio || 1);
    W.W = window.innerWidth;
    W.H = window.innerHeight;
    W.S = U.clamp(Math.min(W.W, W.H) / 900, 0.55, 1.6);
    canvas.width = Math.round(W.W * W.dpr);
    canvas.height = Math.round(W.H * W.dpr);
    canvas.style.width = W.W + 'px';
    canvas.style.height = W.H + 'px';
    const sh = U.makeCanvas(W.W / 4, W.H / 4, 1);
    W.shadow = sh;
    buildWorld();
    if (!W.fish.length || (!W.res.fishCount && W.fish.length !== autoFishCount())) spawnFish();
    W.weather.configure(W.res.weather, W.res.intensity, W);
  }

  /** 应用新配置，只重建受影响的部分 */
  function apply(cfg, { reroll = false, initial = false } = {}) {
    const prevCfg = W.cfg, prevRes = W.res;
    W.cfg = cfg;
    if (reroll) W.seed = (Math.random() * 4294967296) >>> 0;
    const seed = cfg.seed || W.seed;
    W.res = Config.resolve(cfg, seed);
    if (initial) { resize(); updateSubtitle(); return; }
    const r = W.res, p = prevRes;
    const worldChanged = r.env !== p.env || r.season !== p.season || r.seed !== p.seed;
    const fishChanged = r.fishCount !== p.fishCount || cfg.species.join() !== prevCfg.species.join() || (worldChanged && reroll);
    if (worldChanged) buildWorld();
    if (fishChanged) spawnFish();
    if (worldChanged || r.weather.join() !== p.weather.join() || r.intensity !== p.intensity || r.time !== p.time) {
      W.weather.configure(r.weather, r.intensity, W);
    }
    updateSubtitle();
  }

  function updateSubtitle() {
    const r = W.res;
    const wx = r.weather.map((k) => WEATHERS[k]).join('・');
    const el = document.getElementById('subtitle');
    if (el) el.textContent = [ENVS[r.env].name, SEASONS[r.season], TIMES[r.time], wx].filter(Boolean).join(' · ');
  }

  /* ---------- 交互 ---------- */
  function feed(x, y) {
    const S = W.S;
    const n = U.randInt(4, 7);
    for (let i = 0; i < n; i++) {
      const fx = x + U.rand(-18, 18) * S, fy = y + U.rand(-18, 18) * S;
      if (W.pond.factor(fx, fy) > 0.93) continue;
      W.foods.push(new Food(fx, fy, S));
      W.sim.disturb(fx, fy, 4 * S, 14);
      W.rings.add(fx, fy, 16 * S, 0.5, 26 * S, 1);
    }
    if (W.foods.length > 70) W.foods.splice(0, W.foods.length - 70);
  }

  function onMove(e) {
    const P = W.pointer;
    P.x = e.clientX; P.y = e.clientY;
    P.active = true; P.lastMove = W.t;
    if (W.cfg.ripple && W.pond.factor(P.x, P.y) < 0.98) {
      const d = Math.hypot(P.x - P.lastRipple[0], P.y - P.lastRipple[1]);
      if (d > 14 * W.S) {
        W.sim.disturb(P.x, P.y, 7 * W.S, U.clamp(d * 0.35, 4, 14));
        P.lastRipple = [P.x, P.y];
      }
    }
  }

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', (e) => {
    onMove(e);
    if (W.pond.factor(e.clientX, e.clientY) < 0.95) feed(e.clientX, e.clientY);
    else W.rings.add(e.clientX, e.clientY, 10, 0);
  });
  canvas.addEventListener('pointerleave', () => { W.pointer.active = false; });
  canvas.addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') W.pointer.active = false; });
  canvas.addEventListener('pointercancel', () => { W.pointer.active = false; });

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 160);
  });

  /* ---------- 更新 ---------- */
  let simAcc = 0;
  function update(dt) {
    W.t += dt;
    const t = W.t;
    W.wind[0] = 0.55 + Math.sin(t * 0.05) * 0.35 + Math.sin(t * 0.17) * 0.1;
    W.wind[1] = 0.3 + Math.sin(t * 0.07 + 1) * 0.2;
    const P = W.pointer;
    P.following = P.active && t - P.lastMove < 8 && W.pond.factor(P.x, P.y) < 1.05;

    simAcc += dt;
    let steps = 0;
    while (simAcc >= 1 / 60 && steps < 3) { W.sim.step(); simAcc -= 1 / 60; steps++; }
    if (steps >= 3) simAcc = 0;

    for (const f of W.fish) f.update(dt, W);
    for (const f of W.foods) f.update(dt, W);
    W.foods = W.foods.filter((f) => !f.eaten);
    for (const f of W.floaters) f.update(dt, W);
    W.floaters = W.floaters.filter((f) => f.age < f.life);
    W.weather.update(dt, W);
    W.rings.update(dt);

    // 偶尔的水黾/小虫涟漪
    W.ambientT -= dt;
    if (W.ambientT <= 0) {
      W.ambientT = U.rand(1.5, 5);
      const [x, y] = W.pond.randomPoint(0.9);
      W.sim.disturb(x, y, 4 * W.S, 8);
      W.rings.add(x, y, U.rand(18, 34) * W.S, 0.35, 16 * W.S, 2);
    }

    const time = W.res.time;
    W.sim.light = time === 'dusk' ? [255, 214, 160] : time === 'night' ? [190, 215, 255] : [215, 255, 240];
    W.sim.render(time === 'night' ? 4 : 5);
  }

  /* ---------- 渲染 ---------- */
  function render() {
    const { W: w, H: h, dpr, pond, env, S } = W;
    const time = W.res.time;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(env.under, 0, 0, w, h);

    ctx.save();
    ctx.clip(pond.path);

    // 焦散光纹
    if (!W.causticsPattern) W.causticsPattern = ctx.createPattern(W.caustics, 'repeat');
    const pat = W.causticsPattern;
    if (pat && pat.setTransform) {
      ctx.globalCompositeOperation = 'lighter';
      const base = time === 'night' ? 0.06 : time === 'dusk' ? 0.1 : 0.16;
      const sc = 1.25 * S;
      pat.setTransform(new DOMMatrix().translate(W.t * 9, W.t * 5).scale(sc));
      ctx.fillStyle = pat;
      ctx.globalAlpha = base;
      ctx.fillRect(0, 0, w, h);
      pat.setTransform(new DOMMatrix().translate(-W.t * 7, W.t * 8).rotate(37).scale(sc * 1.35));
      ctx.globalAlpha = base * 0.75;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // 鱼的投影（低分辨率画布 = 天然模糊）
    const sh = W.shadow;
    sh.ctx.setTransform(0.25, 0, 0, 0.25, 0, 0);
    sh.ctx.clearRect(0, 0, w, h);
    for (const f of W.fish) {
      const off = f.L * (0.1 + f.z * 0.4);
      sh.ctx.save();
      sh.ctx.translate(off * 0.8, off);
      sh.ctx.fillStyle = `rgba(0,10,12,${0.55 - f.z * 0.12})`;
      f.drawSilhouette(sh.ctx);
      sh.ctx.restore();
    }
    ctx.drawImage(sh.canvas, 0, 0, w, h);

    // 水下的鱼（由深到浅）
    const sorted = W.fish.slice().sort((a, b) => a.z - b.z);
    for (const f of sorted) if (f.z <= 0.85) f.draw(ctx, W.t);

    // 水体与天空/树影倒影
    const film = {
      day: 'rgba(8,80,78,0.16)', dusk: 'rgba(60,40,30,0.18)', night: 'rgba(5,15,30,0.3)',
    }[time];
    ctx.fillStyle = film;
    ctx.fillRect(0, 0, w, h);
    const sky = ctx.createLinearGradient(0, 0, w, h);
    const skyC = time === 'dusk' ? '255,190,120' : time === 'night' ? '120,150,220' : '210,235,255';
    sky.addColorStop(0, `rgba(${skyC},0.12)`);
    sky.addColorStop(0.5, `rgba(${skyC},0.02)`);
    sky.addColorStop(1, `rgba(${skyC},0.07)`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = time === 'night' ? 0.06 : 0.1;
    ctx.drawImage(env.reflect, 0, 0, w, h);
    ctx.globalAlpha = 1;

    // 涟漪光影
    W.sim.draw(ctx);
    W.rings.draw(ctx, time === 'night' ? '200,215,255' : '255,214,140');

    for (const f of W.foods) f.draw(ctx);
    for (const f of W.floaters) f.draw(ctx);
    for (const f of sorted) if (f.z > 0.85) f.draw(ctx, W.t);
    W.weather.drawSurface(ctx, W);
    ctx.restore();

    // 池岸与景物
    ctx.drawImage(env.over, 0, 0, w, h);
    W.weather.drawDragonflies(ctx, W);

    // 天气
    W.weather.draw(ctx, W);

    // 时间氛围
    const rainy = W.res.weather.includes('rain');
    if (rainy && time === 'day') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgb(185,198,210)';
      ctx.globalAlpha = 0.45;
      ctx.fillRect(0, 0, w, h);
    }
    if (time === 'dusk') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgb(255,186,140)';
      ctx.globalAlpha = 0.55;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(w, 0, 0, h);
      g.addColorStop(0, 'rgba(255,140,60,0.16)');
      g.addColorStop(0.6, 'rgba(255,140,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (time === 'night') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgb(48,66,120)';
      ctx.globalAlpha = 0.82;
      ctx.fillRect(0, 0, w, h);
      // 月影
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.clip(pond.path);
      const mx = pond.cx + pond.rx * 0.35, my = pond.cy - pond.ry * 0.3, mr = Math.min(pond.rx, pond.ry) * 0.18;
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 2.4);
      mg.addColorStop(0, 'rgba(220,230,255,0.22)');
      mg.addColorStop(0.25, 'rgba(200,215,255,0.1)');
      mg.addColorStop(1, 'rgba(200,215,255,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(mx - mr * 2.4, my - mr * 2.4, mr * 4.8, mr * 4.8);
      ctx.restore();
    }
    if (time !== 'day') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      const k = time === 'night' ? 1 : 0.45;
      env.lights.forEach((L, i) => {
        const fl = 1 + Math.sin(W.t * 7.3 + i * 2) * 0.03 + Math.sin(W.t * 13.1 + i) * 0.02;
        const r = L.r * fl;
        const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, r);
        g.addColorStop(0, `rgba(255,200,120,${0.55 * k})`);
        g.addColorStop(0.15, `rgba(255,170,80,${0.3 * k})`);
        g.addColorStop(1, 'rgba(255,140,60,0)');
        ctx.fillStyle = g;
        ctx.fillRect(L.x - r, L.y - r, r * 2, r * 2);
      });
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    W.weather.drawFireflies(ctx, W);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (window.innerWidth !== W.W || window.innerHeight !== W.H) { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 160); }
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function start() {
    W.caustics = makeCausticsTexture(384, 11);
    W.seed = (Math.random() * 4294967296) >>> 0;
    apply(Config.load(), { initial: true });
    requestAnimationFrame((t) => { last = t; frame(t); });
  }

  return { start, apply, feed, get world() { return W; } };
})();
