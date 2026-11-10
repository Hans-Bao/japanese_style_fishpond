'use strict';
/* 配置：品种 / 环境 / 季节 / 天气 + URL 参数与本地存储 */

const SPECIES = {
  kohaku:      { name: '红白',   weight: 3.2 },
  sanke:       { name: '大正三色', weight: 2.4 },
  showa:       { name: '昭和三色', weight: 2.0 },
  tancho:      { name: '丹顶',   weight: 1.2 },
  ogon:        { name: '黄金',   weight: 1.2 },
  platinum:    { name: '白金',   weight: 1.0 },
  asagi:       { name: '浅黄',   weight: 1.0 },
  chagoi:      { name: '茶鲤',   weight: 0.8 },
  kigoi:       { name: '黄鲤',   weight: 0.8 },
  benigoi:     { name: '红鲤',   weight: 1.0 },
  shiroutsuri: { name: '白写',   weight: 0.9 },
  hiutsuri:    { name: '绯写',   weight: 0.9 },
  kumonryu:    { name: '九纹龙', weight: 0.8 },
};

const ENVS = {
  moss:       { name: '苔庭' },
  karesansui: { name: '枯山水' },
  boardwalk:  { name: '木栈道' },
  bridge:     { name: '朱桥庭园' },
  temple:     { name: '寺院缘侧' },
  bamboo:     { name: '竹林' },
};

const SEASONS = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };
const TIMES = { day: '白天', dusk: '黄昏', night: '夜晚' };
const WEATHERS = { sakura: '樱花', maple: '枫叶', snow: '雪', rain: '小雨' };

const DEFAULTS = {
  fish: 0,            // 0 = 按屏幕自动
  species: [],        // [] = 全部品种随机
  env: 'random',
  season: 'random',
  time: 'random',
  weather: ['auto'],  // ['auto'] = 随季节随机；[] = 无；或 ['sakura','rain'...]
  intensity: 1,
  follow: true,
  ripple: true,
  seed: 0,            // 0 = 每次随机
};

const STORE_KEY = 'koi-pond-config-v1';

const Config = {
  load() {
    let cfg = { ...DEFAULTS };
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved && typeof saved === 'object') cfg = { ...cfg, ...saved };
    } catch (e) { /* ignore */ }
    const q = new URLSearchParams(location.search);
    if (q.has('fish')) cfg.fish = U.clamp(parseInt(q.get('fish'), 10) || 0, 0, 60);
    if (q.has('species')) {
      const v = q.get('species');
      cfg.species = v === 'random' || !v ? [] : v.split(',').filter((k) => SPECIES[k]);
    }
    if (q.has('env')) cfg.env = ENVS[q.get('env')] ? q.get('env') : 'random';
    if (q.has('season')) cfg.season = SEASONS[q.get('season')] ? q.get('season') : 'random';
    if (q.has('time')) cfg.time = TIMES[q.get('time')] ? q.get('time') : 'random';
    if (q.has('weather')) {
      const v = q.get('weather');
      if (v === 'auto' || v === 'random') cfg.weather = ['auto'];
      else if (v === 'none' || !v) cfg.weather = [];
      else cfg.weather = v.split(',').filter((k) => WEATHERS[k]);
    }
    if (q.has('intensity')) cfg.intensity = U.clamp(parseFloat(q.get('intensity')) || 1, 0.2, 3);
    if (q.has('follow')) cfg.follow = q.get('follow') !== '0';
    if (q.has('ripple')) cfg.ripple = q.get('ripple') !== '0';
    if (q.has('seed')) cfg.seed = parseInt(q.get('seed'), 10) >>> 0;
    return Config.sanitize(cfg);
  },

  sanitize(cfg) {
    if (!Array.isArray(cfg.species)) cfg.species = [];
    cfg.species = cfg.species.filter((k) => SPECIES[k]);
    if (!Array.isArray(cfg.weather)) cfg.weather = ['auto'];
    if (!ENVS[cfg.env]) cfg.env = 'random';
    if (!SEASONS[cfg.season]) cfg.season = 'random';
    if (!TIMES[cfg.time]) cfg.time = 'random';
    return cfg;
  },

  save(cfg) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
    try { history.replaceState(null, '', location.pathname + Config.toQuery(cfg)); } catch (e) { /* file:// 等 */ }
  },

  toQuery(cfg) {
    const q = new URLSearchParams();
    if (cfg.fish) q.set('fish', cfg.fish);
    if (cfg.species.length) q.set('species', cfg.species.join(','));
    if (cfg.env !== 'random') q.set('env', cfg.env);
    if (cfg.season !== 'random') q.set('season', cfg.season);
    if (cfg.time !== 'random') q.set('time', cfg.time);
    const w = cfg.weather;
    if (!(w.length === 1 && w[0] === 'auto')) q.set('weather', w.length ? w.join(',') : 'none');
    if (cfg.intensity !== 1) q.set('intensity', cfg.intensity);
    if (!cfg.follow) q.set('follow', '0');
    if (!cfg.ripple) q.set('ripple', '0');
    if (cfg.seed) q.set('seed', cfg.seed);
    const s = q.toString();
    return s ? '?' + s : '';
  },

  /** 把“随机”项落地为具体值。seed 决定环境/季节等随机结果 */
  resolve(cfg, seed) {
    // 每一项使用独立的随机流，修改某一项不会影响其他“随机”项的结果
    const sub = (k) => U.rng((seed ^ U.hash(k)) >>> 0);
    const pickKey = (val, dict, k) => (val === 'random' ? sub(k).pick(Object.keys(dict)) : val);
    const env = pickKey(cfg.env, ENVS, 'env');
    const season = pickKey(cfg.season, SEASONS, 'season');
    const time = cfg.time === 'random'
      ? U.weightedPick([['day', 0.6], ['dusk', 0.22], ['night', 0.18]], sub('time'))
      : cfg.time;
    let weather;
    if (cfg.weather.includes('auto')) {
      const x = sub('weather' + season)();
      weather = {
        spring: x < 0.2 ? ['sakura', 'rain'] : ['sakura'],
        summer: x < 0.45 ? ['rain'] : [],
        autumn: x < 0.2 ? ['maple', 'rain'] : ['maple'],
        winter: ['snow'],
      }[season];
    } else {
      weather = cfg.weather.filter((k) => WEATHERS[k]);
    }
    return {
      seed, env, season, time, weather,
      intensity: cfg.intensity,
      speciesPool: cfg.species.length ? cfg.species : Object.keys(SPECIES),
      fishCount: cfg.fish,
    };
  },
};
