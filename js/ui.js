'use strict';
/* 设置面板 */

const UI = (() => {
  let cfg;
  const $ = (s) => document.querySelector(s);

  function commit(opts) {
    Config.save(cfg);
    App.apply({ ...cfg, species: cfg.species.slice(), weather: cfg.weather.slice() }, opts);
    render();
  }

  /** 单选分段按钮 */
  function segment(el, dict, key, withRandom = true) {
    el.innerHTML = '';
    const opts = withRandom ? [['random', '随机'], ...Object.entries(dict)] : Object.entries(dict);
    for (const [k, label] of opts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = typeof label === 'string' ? label : label.name;
      b.dataset.k = k;
      b.addEventListener('click', () => { cfg[key] = k; commit(); });
      el.appendChild(b);
    }
  }

  function build() {
    segment($('#seg-env'), ENVS, 'env');
    segment($('#seg-season'), SEASONS, 'season');
    segment($('#seg-time'), TIMES, 'time');

    // 品种：多选，空 = 随机
    const sp = $('#chips-species');
    sp.innerHTML = '';
    const all = document.createElement('button');
    all.type = 'button'; all.textContent = '全部随机'; all.dataset.k = '__all';
    all.addEventListener('click', () => { cfg.species = []; commit(); });
    sp.appendChild(all);
    for (const [k, v] of Object.entries(SPECIES)) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.k = k;
      b.innerHTML = `<i class="dot dot-${k}"></i>${v.name}`;
      b.addEventListener('click', () => {
        const i = cfg.species.indexOf(k);
        i >= 0 ? cfg.species.splice(i, 1) : cfg.species.push(k);
        commit();
      });
      sp.appendChild(b);
    }

    // 天气：多选；“随季节” 与 “无” 互斥
    const wc = $('#chips-weather');
    wc.innerHTML = '';
    const mk = (k, label, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.k = k; b.textContent = label;
      b.addEventListener('click', fn);
      wc.appendChild(b);
    };
    mk('auto', '随机（随季节）', () => { cfg.weather = ['auto']; commit(); });
    for (const [k, label] of Object.entries(WEATHERS)) {
      mk(k, label, () => {
        let w = cfg.weather.filter((x) => x !== 'auto');
        w = w.includes(k) ? w.filter((x) => x !== k) : [...w, k];
        cfg.weather = w;
        commit();
      });
    }
    mk('none', '无', () => { cfg.weather = []; commit(); });

    const fc = $('#fish-count');
    fc.addEventListener('input', () => { cfg.fish = +fc.value; $('#fish-count-val').textContent = cfg.fish ? cfg.fish + ' 尾' : '自动'; });
    fc.addEventListener('change', () => commit());
    const it = $('#intensity');
    it.addEventListener('input', () => { cfg.intensity = +it.value; $('#intensity-val').textContent = '×' + cfg.intensity.toFixed(1); });
    it.addEventListener('change', () => commit());

    $('#opt-follow').addEventListener('change', (e) => { cfg.follow = e.target.checked; commit(); });
    $('#opt-ripple').addEventListener('change', (e) => { cfg.ripple = e.target.checked; commit(); });

    $('#btn-reroll').addEventListener('click', () => { cfg.seed = 0; commit({ reroll: true }); toast('已重新随机'); });
    $('#btn-reset').addEventListener('click', () => { cfg = { ...DEFAULTS, species: [], weather: ['auto'] }; commit({ reroll: true }); toast('已恢复默认'); });
    $('#btn-share').addEventListener('click', async () => {
      const c = { ...cfg, seed: cfg.seed || App.world.res.seed };
      const url = location.href.split('?')[0] + Config.toQuery(c);
      try { await navigator.clipboard.writeText(url); toast('链接已复制（含当前随机结果）'); }
      catch (e) { prompt('复制这个链接：', url); }
    });

    const panel = $('#panel');
    const toggle = (show) => {
      const open = show ?? !panel.classList.contains('open');
      panel.classList.toggle('open', open);
      $('#btn-settings').setAttribute('aria-expanded', open);
    };
    $('#btn-settings').addEventListener('click', () => toggle());
    $('#btn-close').addEventListener('click', () => toggle(false));
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'Escape') toggle(false);
      if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('hide-ui');
      if (e.key === 'r' || e.key === 'R') $('#btn-reroll').click();
    });
  }

  function render() {
    const res = App.world.res;
    const mark = (sel, active) => document.querySelectorAll(sel + ' button').forEach((b) => b.classList.toggle('on', active(b.dataset.k)));
    mark('#seg-env', (k) => k === cfg.env);
    mark('#seg-season', (k) => k === cfg.season);
    mark('#seg-time', (k) => k === cfg.time);
    mark('#chips-species', (k) => (k === '__all' ? cfg.species.length === 0 : cfg.species.includes(k)));
    mark('#chips-weather', (k) => (k === 'auto' ? cfg.weather.includes('auto') : k === 'none' ? cfg.weather.length === 0 : cfg.weather.includes(k)));
    // 随机项提示当前结果
    const hint = (id, val, dict) => { $(id).textContent = val === 'random' ? '→ ' + (dict[res[id.slice(6)]].name || dict[res[id.slice(6)]]) : ''; };
    hint('#hint-env', cfg.env, ENVS);
    hint('#hint-season', cfg.season, SEASONS);
    hint('#hint-time', cfg.time, TIMES);
    $('#hint-weather').textContent = cfg.weather.includes('auto') ? '→ ' + (res.weather.map((k) => WEATHERS[k]).join('・') || '无') : '';
    $('#fish-count').value = cfg.fish;
    $('#fish-count-val').textContent = cfg.fish ? cfg.fish + ' 尾' : `自动（${App.world.fish.length} 尾）`;
    $('#intensity').value = cfg.intensity;
    $('#intensity-val').textContent = '×' + (+cfg.intensity).toFixed(1);
    $('#opt-follow').checked = cfg.follow;
    $('#opt-ripple').checked = cfg.ripple;
  }

  let toastTimer = 0;
  function toast(msg, ms = 2200) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  function init() {
    cfg = { ...App.world.cfg, species: App.world.cfg.species.slice(), weather: App.world.cfg.weather.slice() };
    build();
    render();
    setTimeout(() => toast('点击水面投喂 · 移动指针，鲤鱼会跟过来', 5000), 600);
  }

  return { init, toast };
})();
