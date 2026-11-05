/* ============================================================
   ITO 天猫直播看板 · 公共库
   1) 格式化 / 汇总计算
   2) 日期筛选（预设 + 自定义区间 + 上一期对比 + URL 同步）
   3) 页面外壳（导航 / 筛选条）
   4) 图表引擎（折线 / 散点 / 条形 / 漏斗 / 热力）
   ============================================================ */

const SHIFTS = ['数字人', '早', '中', '晚'];
const SC = { '数字人': '#6a5b8f', '早': '#c9a962', '中': '#3a5778', '晚': '#b3352c' };
const GOLD = '#c9a962';
const D = {};

/* ---------------- 格式化 ---------------- */
const N0 = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 });
const N1 = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const N2 = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmt = {
  /* 拆成 [数字, 单位]，让 KPI 能把单位做小 */
  mpart(v) {
    if (v === null || v === undefined || isNaN(v)) return ['—', ''];
    const a = Math.abs(v);
    if (a >= 1e8) return [(v / 1e8).toFixed(2), '亿'];
    if (a >= 1e4) return [(v / 1e4).toFixed(a >= 1e6 ? 0 : 1), '万'];
    return [N0.format(Math.round(v)), ''];
  },
  money(v) { const [n, u] = fmt.mpart(v); return n === '—' ? '—' : n + u; },
  yuan(v) { return (v === null || v === undefined || isNaN(v)) ? '—' : '¥' + N0.format(Math.round(v)); },
  num(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    if (Math.abs(v) >= 1e4) return (v / 1e4).toFixed(1) + '万';
    return N0.format(Math.round(v));
  },
  int(v) { return (v === null || v === undefined || isNaN(v)) ? '—' : N0.format(Math.round(v)); },
  dec1(v) { return (v === null || v === undefined || isNaN(v)) ? '—' : N1.format(v); },
  dec2(v) { return (v === null || v === undefined || isNaN(v)) ? '—' : N2.format(v); },
  pct(v, d = 1) {
    if (v === null || v === undefined || isNaN(v) || !isFinite(v)) return '—';
    return (v * 100).toFixed(d) + '%';
  },
  pp(v, d = 1) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return (v >= 0 ? '+' : '') + (v * 100).toFixed(d) + 'pp';
  },
  date(s) { return s ? s.slice(5).replace('-', '/') : ''; },
  md(s) { return s ? s.slice(5).replace('-', '/') : ''; },
  /* 两值差距：小差距用 %，超过 3.5 倍改用「倍」表述，避免出现 1480% 这种读不顺的数字 */
  gap(a, b) {
    if (!a || !b) return '—';
    const r = a / b;
    if (r >= 3.5) return N1.format(r) + ' 倍';
    return ((r - 1) * 100).toFixed(0) + '%';
  },
};

/* ---------------- 日期工具 ---------------- */
const dU = {
  parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); },
  iso(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  },
  add(s, n) { const d = dU.parse(s); d.setDate(d.getDate() + n); return dU.iso(d); },
  diff(a, b) { return Math.round((dU.parse(b) - dU.parse(a)) / 86400000) + 1; },
  /* 周一为一周起点 */
  weekStart(s) {
    const d = dU.parse(s);
    const w = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - w);
    return dU.iso(d);
  },
  monthStart(s) { return s.slice(0, 7) + '-01'; },
  monthEnd(s) {
    const d = dU.parse(s);
    return dU.iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  },
  yearMonth(s) { return s.slice(0, 7); },
};

/* ---------------- 汇总 ---------------- */
const calc = {
  sum(a, k) { let t = 0, n = 0; for (const x of a) { const v = x[k]; if (v !== null && v !== undefined && !isNaN(v)) { t += v; n++; } } return n ? t : 0; },
  avg(a, k) { let t = 0, n = 0; for (const x of a) { const v = x[k]; if (v !== null && v !== undefined && !isNaN(v)) { t += v; n++; } } return n ? t / n : null; },
  rate(a, b) { return (b && a !== null && a !== undefined && b !== null) ? a / b : null; },
  group(arr, fn) {
    const m = new Map();
    for (const x of arr) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    return m;
  },
  /* 一组场次 -> 汇总（比率一律重算分子分母，避免长短场次权重失真） */
  rollup(arr) {
    const gmv = calc.sum(arr, 'gmv');
    const rf = calc.sum(arr, 'rf');
    const durH = calc.sum(arr, 'dur') / 60;
    const uv = calc.sum(arr, 'uv');
    const bp = calc.sum(arr, 'bp');
    const ac = calc.sum(arr, 'ac');
    const fans = calc.sum(arr, 'fans');
    const ep = calc.sum(arr, 'ep');
    const cp = calc.sum(arr, 'cp');
    const gcp = calc.sum(arr, 'gcp');
    const net = gmv - rf;
    return {
      n: arr.length, gmv, rf, net, durH, uv, bp, ac, fans, ep, cp, gcp,
      hvGmv: calc.rate(gmv, durH),
      hvNet: calc.rate(net, durH),
      hUv: calc.rate(uv, durH),
      aov: calc.rate(gmv, bp),
      conv: calc.rate(bp, uv),
      acRate: calc.rate(ac, uv),
      gcpRate: calc.rate(gcp, uv),
      fanRate: calc.rate(fans, uv),
      clickRate: calc.rate(cp, ep),
      rrate: calc.rate(rf, gmv),
      perSess: calc.rate(gmv, arr.length),
      durPer: calc.rate(durH, arr.length),
    };
  },
};

/* ---------------- 数据加载 ---------------- */
async function loadData() {
  let j;
  if (window.__DATA__) j = window.__DATA__;
  else {
    const res = await fetch('data.json?v=' + Date.now());
    if (!res.ok) throw new Error('data.json 加载失败');
    j = await res.json();
  }
  D.meta = j.meta;
  D.anchors = j.anchors;
  D.sessions = j.sessions;
  D.targets = j.targets || {};
  D.shopAll = j.shopDaily;
  D.shopMap = new Map(j.shopDaily.map(x => [x.d, x]));

  /* 商品：元数据 + 商品×日 展开 */
  D.goodsMeta = j.goodsMeta.map(([id, name, cat, prod]) => ({ id, name, cat, prod }));
  D.shopDates = Object.keys(j.gd).sort();
  D.goodsDaily = [];
  for (const d of D.shopDates) {
    const arr = j.gd[d];
    for (let i = 0; i < arr.length; i += 3) {
      D.goodsDaily.push({ d, gi: arr[i], pay: arr[i + 1], rf: arr[i + 2] });
    }
  }

  for (const s of D.sessions) {
    s.durH = s.dur ? s.dur / 60 : null;
    s.hvGmv = calc.rate(s.gmv, s.durH);
    s.hUv = calc.rate(s.uv, s.durH);
    s.aov = calc.rate(s.gmv, s.bp);
  }
  return D;
}

/* ============================================================
   销售目标（源表「天猫排班及目标表」H~K 列，按 日 × 班次 拆分）
   注意：没目标的日子表里没有这条记录，不能拿 0 兜底——
   0 会算出「达成率 ∞」或「有目标但达成 0%」，两种都是错的。
   ============================================================ */
const tgt = {
  /* 只认「数据截止日之前」的目标：表里还有 11-03 ~ 11-30 的计划目标，
     但没有对应实际数据，混进来会把周/月达成率压成假的低值 */
  known(d) { return d <= D.meta.dateTo; },
  at(d, sh) {
    const a = D.targets[d];
    if (!a) return null;
    return a[SHIFTS.indexOf(sh)] || 0;
  },
  dayTotal(d) {
    const a = D.targets[d];
    return a ? a.reduce((x, y) => x + y, 0) : null;
  },
  days(from, to) {
    return Object.keys(D.targets).filter(d => d >= from && d <= to && tgt.known(d)).sort();
  },
  sum(from, to, sh) {
    const i = sh ? SHIFTS.indexOf(sh) : -1;
    let s = 0, n = 0;
    for (const d of tgt.days(from, to)) {
      const a = D.targets[d];
      if (!a) continue;
      s += i >= 0 ? (a[i] || 0) : a.reduce((x, y) => x + y, 0);
      n++;
    }
    return { sum: s, days: n };
  },
  rate(act, tar) { return (tar && tar > 0) ? act / tar : null; },
  /* 按当前粒度（日/周/月）汇总目标，供总览明细直接查 */
  byBucket(grain) {
    const m = new Map();
    for (const d of Object.keys(D.targets)) {
      if (!tgt.known(d)) continue;
      const k = grain === 'day' ? d : grain === 'week' ? dU.weekStart(d) : dU.yearMonth(d);
      m.set(k, (m.get(k) || 0) + (tgt.dayTotal(d) || 0));
    }
    return m;
  },
  /* 同粒度下的实际成交，但只算「有目标的日子」——分子分母必须同口径，
     否则拿整周/整月的成交去比只有几天的目标，达成率会被高估 */
  actualByBucket(grain, sessions) {
    const m = new Map();
    for (const s of (sessions || [])) {
      if (!D.targets[s.d]) continue;
      const k = grain === 'day' ? s.d : grain === 'week' ? dU.weekStart(s.d) : dU.yearMonth(s.d);
      m.set(k, (m.get(k) || 0) + (s.gmv || 0));
    }
    return m;
  },
};

/* 达成率配色：一律浅底深字，避免深底深字看不清 */
function goalColor(r) {
  if (r === null) return '#8b867d';
  if (r >= 1) return '#9a7a2a';
  if (r >= .85) return '#3a5778';
  if (r >= .7) return '#6f6a61';
  return '#b3352c';
}
function goalBg(r) {
  if (r === null) return '';
  if (r >= 1.2) return 'rgba(201,169,98,.36)';
  if (r >= 1) return 'rgba(201,169,98,.22)';
  if (r >= .85) return 'rgba(58,87,120,.09)';
  if (r >= .7) return 'rgba(23,22,26,.04)';
  return 'rgba(179,53,44,.085)';
}
function goalPill(r, txt) {
  return '<span class="rpill" style="background:' + goalBg(r) + ';color:' + goalColor(r) + '">'
    + (txt !== undefined ? txt : (r === null ? '—' : fmt.pct(r, 1))) + '</span>';
}

/* ============================================================
   筛选器
   ============================================================ */
const F = {
  from: '', to: '', preset: '30', days: 0,
  prevFrom: '', prevTo: '',
  sessions: [], shop: [], goods: [],
  prevSessions: [], liveByDay: new Map(),
  min: '', max: '',
};

const PRESETS = [
  { k: '7', t: '近 7 天' },
  { k: '30', t: '近 30 天' },
  { k: '90', t: '近 90 天' },
  { k: 'month', t: '本月' },
  { k: 'lastmonth', t: '上月' },
  { k: 'half', t: '近半年' },
  { k: 'all', t: '全部' },
];

const _listeners = [];
function onFilter(fn) { _listeners.push(fn); }
function fireFilter() { for (const fn of _listeners) fn(); }

function presetRange(k) {
  const { min, max } = F;
  if (k === 'all') return [min, max];
  if (k === 'month') return [dU.monthStart(max), max];
  if (k === 'lastmonth') {
    const lastEnd = dU.add(dU.monthStart(max), -1);
    return [dU.monthStart(lastEnd), lastEnd];
  }
  const n = k === 'half' ? 180 : Number(k);
  const from = dU.add(max, -(n - 1));
  return [from < min ? min : from, max];
}

function aggGoods(from, to) {
  const m = new Map();
  for (const r of D.goodsDaily) {
    if (r.d < from || r.d > to) continue;
    const g = m.get(r.gi);
    if (g) { g.pay += r.pay; g.rf += r.rf; }
    else m.set(r.gi, { gi: r.gi, pay: r.pay, rf: r.rf });
  }
  const out = [...m.values()].map(g => {
    const meta = D.goodsMeta[g.gi] || { name: '—', cat: '未匹配', prod: '未匹配' };
    return {
      i: g.gi, name: meta.name, cat: meta.cat, prod: meta.prod,
      pay: g.pay, refund: g.rf, rate: g.pay ? g.rf / g.pay : null,
    };
  });
  out.sort((a, b) => b.pay - a.pay);
  return out;
}

function setRange(from, to, preset) {
  const { min, max } = F;
  if (!from || from < min) from = min;
  if (!to || to > max) to = max;
  if (from > to) { const t = from; from = to; to = t; }
  F.from = from; F.to = to;
  F.days = dU.diff(from, to);
  F.preset = preset || detectPreset();

  F.prevTo = dU.add(from, -1);
  F.prevFrom = dU.add(from, -F.days);
  if (F.prevFrom < min) F.prevFrom = min;

  F.sessions = D.sessions.filter(s => s.d >= from && s.d <= to);
  F.shop = D.shopAll.filter(x => x.d >= from && x.d <= to);
  F.goods = aggGoods(from, to);
  F.prevSessions = D.sessions.filter(s => s.d >= F.prevFrom && s.d <= F.prevTo);

  F.liveByDay = new Map();
  for (const s of F.sessions) {
    if (!F.liveByDay.has(s.d)) F.liveByDay.set(s.d, []);
    F.liveByDay.get(s.d).push(s);
  }
  F.liveDay = new Map();
  for (const [d, arr] of F.liveByDay) F.liveDay.set(d, calc.rollup(arr));

  F.shipTotal = F.shop.reduce((t, x) => t + (x.ship || 0), 0);
  F.payTotal = F.shop.reduce((t, x) => t + (x.pay || 0), 0);
  F.roll = calc.rollup(F.sessions);
  F.prevRoll = calc.rollup(F.prevSessions);

  syncInputs();
  const q = (location.pathname.split('/').pop() || '') + '?f=' + from + '&t=' + to;
  try { history.replaceState(null, '', q); } catch (e) { /* file:// 下忽略 */ }
  fireFilter();
}

function syncInputs() {
  const a = document.getElementById('dFrom'), b = document.getElementById('dTo');
  if (a) a.value = F.from;
  if (b) b.value = F.to;
  const meta = document.getElementById('fbarMeta');
  if (meta) {
    meta.innerHTML =
      `<span>当前区间 <b>${F.from} → ${F.to}</b> · ${F.days} 天 · ${F.roll.n} 场</span>` +
      `<span class="sp"></span>` +
      `<span>对比期 ${prevRangeLabel()}</span>`;
  }
  document.querySelectorAll('.chip[data-p]').forEach(c => {
    c.classList.toggle('on', c.dataset.p === F.preset);
  });
}

/* 上一等长区间；若已顶到数据起点则如实说明，不伪造对比 */
function prevRangeLabel() {
  if (!F.prevSessions || !F.prevSessions.length) return '无（已到数据起点）';
  return F.prevFrom + ' → ' + F.prevTo + '（' + F.prevSessions.length + ' 场）';
}

/* ============================================================
   页面外壳
   ============================================================ */
const NAV = [
  ['index.html', '总览'],
  ['shift.html', '班次分析'],
  ['anchor.html', '主播表现'],
  ['quality.html', '退款与流量'],
];

/* 数据更新角标：颜色=新鲜度，点击=绕过缓存强制重载 */
function stampHtml() {
  const m = D.meta;
  const g = m.generated || '';
  const t = g ? new Date(g.replace(' ', 'T')) : null;
  const ok = t && !isNaN(t.getTime());
  const hrs = ok ? (Date.now() - t.getTime()) / 3600e3 : null;
  const cls = hrs === null ? '' : hrs > 24 * 7 ? ' stale' : hrs > 36 ? ' aging' : '';
  const short = g ? g.slice(5, 16).replace('-', '/') : '—';
  const age = hrs === null ? ''
    : hrs < 1 ? Math.max(1, Math.round(hrs * 60)) + ' 分钟前'
      : hrs < 48 ? Math.round(hrs) + ' 小时前'
        : Math.round(hrs / 24) + ' 天前';
  return `<button class="stamp${cls}" id="stamp" type="button"
      aria-label="数据更新于 ${g}，点击强制重新加载">
      <i class="stamp-dot"></i>
      <span class="stamp-lab">数据更新</span>
      <b>${short}</b>
      ${age ? `<span class="stamp-age">${age}</span>` : ''}
      <span class="stamp-pop" role="tooltip">
        <div class="sp-row"><span>数据生成</span><b>${g || '—'}</b></div>
        <div class="sp-row"><span>数据截止</span><b>${m.dateTo || '—'}</b></div>
        <div class="sp-row"><span>覆盖场次</span><b>${fmt.int(m.sessions)} 场</b></div>
        <div class="sp-row"><span>源表</span><b>${m.src || '—'}</b></div>
        <div class="sp-hr"></div>
        <div class="sp-tip">点击强制重新加载，可确认线上是否为最新版本（绕过浏览器与 CDN 缓存）</div>
      </span>
    </button>`;
}

function mountShell() {
  const cur = location.pathname.split('/').pop() || 'index.html';

  const top = document.getElementById('topbar');
  if (top) {
    top.className = 'topbar';
    top.innerHTML = `<div class="topbar-in">
      <a class="brand" href="index.html">
        <span class="brand-mark"></span>
        <span class="brand-t">ITO 天猫直播</span>
        <span class="brand-s">TMALL LIVE BI</span>
      </a>
      <nav class="nav">
        ${NAV.map(([h, t]) => `<a href="${h}" class="${h === cur ? 'on' : ''}">${t}</a>`).join('')}
      </nav>
      ${stampHtml()}
    </div>`;
    const st = document.getElementById('stamp');
    if (st) st.onclick = () => {
      const u = new URL(location.href);
      u.searchParams.set('_cb', Date.now());
      location.replace(u.toString());
    };
  }

  const fb = document.getElementById('fbar');
  if (fb) {
    fb.className = 'fbar';
    fb.innerHTML = `<div class="fbar-in">
      <span class="fbar-lab">日期范围</span>
      <div class="chips">
        ${PRESETS.map(p => `<button class="chip" data-p="${p.k}">${p.t}</button>`).join('')}
      </div>
      <div class="dr">
        <input type="date" id="dFrom" aria-label="开始日期">
        <span class="to">→</span>
        <input type="date" id="dTo" aria-label="结束日期">
      </div>
      <div class="fbar-meta" id="fbarMeta"></div>
    </div>`;

    fb.querySelectorAll('.chip[data-p]').forEach(c => {
      c.onclick = () => { const [a, b] = presetRange(c.dataset.p); setRange(a, b, c.dataset.p); };
    });
    const a = document.getElementById('dFrom'), b = document.getElementById('dTo');
    a.max = F.max; b.max = F.max; a.min = F.min; b.min = F.min;
    a.onchange = () => setRange(a.value, F.to, 'custom');
    b.onchange = () => setRange(F.from, b.value, 'custom');
  }
}

function initFilter(def = '30') {
  const u = new URLSearchParams(location.search);
  let from = u.get('f'), to = u.get('t'), preset = null;
  if (!from || !to) {
    preset = def;
    const r = presetRange(def);
    from = r[0]; to = r[1];
  }
  setRange(from, to, preset);
}

/* 一次性完成：设边界 + 挂外壳 + 注册渲染 + 首次应用 */
function bootShell(defDays, render) {
  F.min = D.meta.dateFrom;
  F.max = D.meta.dateTo;
  mountShell();
  onFilter(render);
  initFilter(defDays);
}

/* 当前选择是否命中某个预设（用于 chip 高亮还原） */
function detectPreset() {
  for (const p of PRESETS) {
    const [a, b] = presetRange(p.k);
    if (a === F.from && b === F.to) return p.k;
  }
  return 'custom';
}

/* ============================================================
   派生：按粒度聚合
   ============================================================ */
function grainOf(days) {
  if (days <= 45) return 'day';
  if (days <= 150) return 'week';
  return 'month';
}

function grainLabel(d, grain) {
  if (grain === 'month') return d.slice(2, 7).replace('-', '/');
  return fmt.md(d);
}

function groupByGrain(sessions, grain) {
  const key = grain === 'day' ? (s => s.d)
    : grain === 'week' ? (s => dU.weekStart(s.d))
      : (s => dU.yearMonth(s.d));
  const m = calc.group(sessions, key);
  return [...m.keys()].sort().map(k => {
    const arr = m.get(k);
    const r = calc.rollup(arr);
    r.k = k;
    r.days = new Set(arr.map(x => x.d)).size;
    return r;
  });
}

/* 末尾不完整的月/周不进趋势图，否则会被读成断崖式下跌 */
function trimTail(rows, grain) {
  if (!rows.length) return rows;
  const need = grain === 'month' ? 15 : grain === 'week' ? 5 : 1;
  return rows[rows.length - 1].days < need ? rows.slice(0, -1) : rows;
}

/* ============================================================
   通用小组件
   ============================================================ */
function deltaHtml(cur, prev, opt = {}) {
  if (cur === null || cur === undefined || prev === null || prev === undefined || !prev) {
    return `<span class="delta flat">—</span>`;
  }
  let v, txt;
  if (opt.pp) { v = cur - prev; txt = fmt.pp(v); }
  else { v = (cur - prev) / Math.abs(prev); txt = (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%'; }
  const dir = Math.abs(v) < (opt.pp ? 0.0005 : 0.0005) ? 'flat' : (v > 0 ? 'up' : 'down');
  const arrow = dir === 'flat' ? '·' : (v > 0 ? '▲' : '▼');
  return `<span class="delta ${dir}">${arrow} ${txt.replace(/^[+-]/, '')}</span>`;
}

function kpiHtml(items) {
  return items.map(i => `
    <div class="kpi${i.key ? ' key' : ''}">
      <div class="kpi-t">${i.lab}${i.delta || ''}</div>
      <div class="kpi-v num">${i.val}${i.unit ? `<small>${i.unit}</small>` : ''}</div>
      <div class="kpi-s">${i.sub || ''}</div>
    </div>`).join('');
}

/* ============================================================
   图表引擎
   ============================================================ */
const SVGNS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

function niceTicks(min, max, count = 4) {
  if (min === max) max = min + 1;
  const span = max - min;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm <= 1) step = 1; else if (norm <= 2) step = 2;
  else if (norm <= 2.5) step = 2.5; else if (norm <= 5) step = 5; else step = 10;
  step *= mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step * 0.001; v += step) out.push(+v.toFixed(10));
  return out;
}

const GRID = '#f2eee4';
const AXIS_TXT = '#a29c90';

/**
 * 折线图（含联动 hover 十字线）
 * cfg: {height, labels, series:[{name,color,data,area,dash,width}], yFmt, yMin0,
 *       maxXLabels, compact, minPad, avgLine:{value,label,color}}
 */
function lineChart(host, cfg) {
  if (!host) return;
  host.innerHTML = '';
  const W = Math.max(host.clientWidth || 900, 280);
  const H = cfg.height || 240;
  const compact = !!cfg.compact;
  const pad = compact
    ? { t: 10, r: 8, b: 20, l: 34 }
    : { t: 14, r: cfg.avgLine ? 62 : 16, b: 32, l: 56 };
  const iw = Math.max(W - pad.l - pad.r, 40);
  const ih = Math.max(H - pad.t - pad.b, 40);
  const labels = cfg.labels || [];
  const series = (cfg.series || []).filter(s => s.data && s.data.length);
  if (!series.length || !labels.length) { host.innerHTML = '<div class="empty">所选区间暂无数据</div>'; return; }

  let mn = Infinity, mx = -Infinity;
  series.forEach(s => s.data.forEach(v => {
    if (v !== null && v !== undefined && !isNaN(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
  }));
  if (mn === Infinity) { host.innerHTML = '<div class="empty">所选区间暂无数据</div>'; return; }
  if (cfg.yMin0) {
    mn = Math.min(0, mn);
  } else {
    const padv = (mx - mn) * (cfg.minPad || 0.14) || Math.abs(mx || 1) * 0.1;
    mn -= padv;
    if (!cfg.allowNeg && mn < 0) mn = 0;
  }

  const ticks = niceTicks(mn, mx, cfg.ticks || (compact ? 2 : 4));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const band = !!cfg.bars;
  const X = i => band
    ? pad.l + iw * (i + 0.5) / Math.max(labels.length, 1)
    : pad.l + (labels.length <= 1 ? iw / 2 : iw * i / (labels.length - 1));
  const Y = v => pad.t + ih - ih * (v - y0) / (y1 - y0 || 1);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', style: `height:${H}px`, preserveAspectRatio: 'none' }, host);

  /* 网格 */
  ticks.forEach(t => {
    el('line', { x1: pad.l, x2: W - pad.r, y1: Y(t), y2: Y(t), stroke: GRID, 'stroke-width': 1 }, svg);
    if (!compact) {
      const tx = el('text', { x: pad.l - 9, y: Y(t) + 3.5, 'text-anchor': 'end', fill: AXIS_TXT, 'font-size': 10.5, class: 'num' }, svg);
      tx.textContent = cfg.yFmt ? cfg.yFmt(t) : fmt.num(t);
    }
  });
  /* 基线 */
  el('line', { x1: pad.l, x2: W - pad.r, y1: pad.t + ih, y2: pad.t + ih, stroke: '#ddd7c9', 'stroke-width': 1 }, svg);

  /* 柱状系列（第一组） */
  if (band) {
    const bw = Math.max(Math.min(28, iw / labels.length * 0.62), 2);
    series[0].data.forEach((v, i) => {
      if (v === null || v === undefined || isNaN(v)) return;
      const yTop = v >= 0 ? Y(v) : Y(0);
      const h = Math.abs(Y(v) - Y(0));
      const r = el('rect', {
        x: X(i) - bw / 2, y: yTop, width: bw, height: Math.max(h, 1.2),
        fill: series[0].color || GOLD, rx: 1, opacity: .92,
      }, svg);
      r.style.cursor = 'pointer';
    });
  }

  /* x 标签 */
  if (!compact) {
    const step = Math.max(1, Math.ceil(labels.length / (cfg.maxXLabels || 8)));
    labels.forEach((lb, i) => {
      if (i % step !== 0 && i !== labels.length - 1) return;
      /* 避免最后一个标签与前一标签重叠 */
      if (i === labels.length - 1 && i % step !== 0 && (labels.length - 1) % step < step * 0.6 && labels.length > 4) return;
      const tx = el('text', {
        x: Math.min(Math.max(X(i), pad.l + 10), W - pad.r - 10),
        y: H - 11, 'text-anchor': 'middle', fill: AXIS_TXT, 'font-size': 10.5, class: 'num',
      }, svg);
      tx.textContent = lb;
    });
  }

  /* 均值参考线：标签画在右侧留白槽内，避免压住折线 */
  if (cfg.avgLine && cfg.avgLine.value) {
    const y = Y(cfg.avgLine.value);
    if (y > pad.t && y < pad.t + ih) {
      el('line', {
        x1: pad.l, x2: W - pad.r, y1: y, y2: y,
        stroke: cfg.avgLine.color || '#c9a962', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: .7,
      }, svg);
      if (!compact) {
        const tx = el('text', {
          x: W - pad.r + 6, y: y + 3.5, 'text-anchor': 'start',
          fill: cfg.avgLine.color || '#a29c90', 'font-size': 10, class: 'num',
        }, svg);
        tx.textContent = cfg.avgLine.label || '';
      }
    }
  }

  /* 折线（null 断点分段） */
  series.forEach((s, si) => {
    if (band && si === 0) return;
    const segs = [];
    let cur = [];
    s.data.forEach((v, i) => {
      if (v === null || v === undefined || isNaN(v)) { if (cur.length) { segs.push(cur); cur = []; } return; }
      cur.push([X(i), Y(v), i, v]);
    });
    if (cur.length) segs.push(cur);

    const single = series.length === 1;
    if ((cfg.area || s.area) && single) {
      segs.forEach(pts => {
        if (pts.length < 2) return;
        const d = `M${pts[0][0]},${Y(y0)} ` + pts.map(p => `L${p[0]},${p[1]}`).join(' ') + ` L${pts[pts.length - 1][0]},${Y(y0)} Z`;
        const gid = 'g' + Math.random().toString(36).slice(2, 8);
        const defs = el('defs', {}, svg);
        const lg = el('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
        el('stop', { offset: '0%', 'stop-color': s.color || GOLD, 'stop-opacity': .18 }, lg);
        el('stop', { offset: '100%', 'stop-color': s.color || GOLD, 'stop-opacity': .01 }, lg);
        el('path', { d, fill: `url(#${gid})` }, svg);
      });
    }
    segs.forEach(pts => {
      if (pts.length === 1) {
        el('circle', { cx: pts[0][0], cy: pts[0][1], r: 2.4, fill: s.color || GOLD }, svg);
        return;
      }
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
      el('path', {
        d, fill: 'none', stroke: s.color || GOLD, 'stroke-width': s.width || 1.7,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dash || null,
        opacity: s.opacity || 1,
      }, svg);
    });
    /* 末点 */
    const last = segs.length ? segs[segs.length - 1][segs.length - 1] : null;
    if (last) el('circle', { cx: last[0], cy: last[1], r: 2.8, fill: '#fff', stroke: s.color || GOLD, 'stroke-width': 1.6 }, svg);
  });

  /* 峰值标注：单点极高时给出数值，避免被误读成绘图错误 */
  if (cfg.peakLabel) {
    const d0 = series[0].data;
    let mi = -1, mv = -Infinity;
    d0.forEach((v, i) => { if (v !== null && v !== undefined && !isNaN(v) && v > mv) { mv = v; mi = i; } });
    if (mi >= 0) {
      const px = X(mi), py = Y(mv);
      const inside = py > pad.t + 18;
      const tx = el('text', {
        x: Math.min(Math.max(px, pad.l + 26), W - pad.r - 26),
        y: inside ? py - 6 : py + 13,
        'text-anchor': 'middle', 'font-size': 10.5, 'font-weight': 600,
        fill: inside ? '#8a6d2f' : '#fff',
      }, svg);
      tx.textContent = (cfg.yFmt ? cfg.yFmt(mv) : fmt.num(mv));
    }
  }

  /* hover：整列十字线 + 全部系列数值 */
  const guide = el('line', {
    x1: 0, x2: 0, y1: pad.t, y2: pad.t + ih,
    stroke: '#c9c3b6', 'stroke-width': 1, 'stroke-dasharray': '2 3', opacity: 0,
  }, svg);
  const dots = series.map(s => el('circle', {
    r: 3.4, fill: '#fff', stroke: s.color || GOLD, 'stroke-width': 1.8, opacity: 0,
  }, svg));
  const hit = el('rect', { x: pad.l, y: pad.t, width: iw, height: ih, fill: 'transparent' }, svg);
  hit.style.cursor = 'crosshair';
  hit.addEventListener('mousemove', e => {
    const box = svg.getBoundingClientRect();
    const px = (e.clientX - box.left) * (W / box.width);
    const i = Math.max(0, Math.min(labels.length - 1, Math.round((px - pad.l) / (labels.length <= 1 ? 1 : iw / (labels.length - 1)))));
    guide.setAttribute('x1', X(i)); guide.setAttribute('x2', X(i));
    guide.setAttribute('opacity', .8);
    let html = `<b>${cfg.tipTitle ? cfg.tipTitle(labels[i], i) : labels[i]}</b>`;
    series.forEach((s, si) => {
      const v = s.data[i];
      const ok = v !== null && v !== undefined && !isNaN(v);
      dots[si].setAttribute('opacity', ok ? 1 : 0);
      if (ok) { dots[si].setAttribute('cx', X(i)); dots[si].setAttribute('cy', Y(v)); }
      html += `<div class="tt-row"><i style="background:${s.color || GOLD}"></i>${s.name || ''}<b>${ok ? (cfg.yFmt ? cfg.yFmt(v) : fmt.num(v)) : '—'}</b></div>`;
    });
    showTip(e, html);
  });
  hit.addEventListener('mouseleave', () => {
    guide.setAttribute('opacity', 0);
    dots.forEach(d => d.setAttribute('opacity', 0));
    hideTip();
  });
}

/**
 * 散点图（分位截断：极少数超大值钉在边线上并单独提示，避免整张图被压缩）
 * cfg: {height, points:[{x,y,c,title}], xFmt, yFmt, xLab, yLab, quad, capP}
 * 返回 {overflow, max}
 */
function scatterChart(host, cfg) {
  if (!host) return { overflow: 0, max: 0 };
  host.innerHTML = '';
  const pts = (cfg.points || []).filter(p => p.x && p.y);
  if (!pts.length) { host.innerHTML = '<div class="empty">所选区间暂无数据</div>'; return { overflow: 0, max: 0 }; }
  const W = Math.max(host.clientWidth || 520, 260), H = cfg.height || 300;
  const pad = { t: 22, r: 22, b: 36, l: 56 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;

  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const q = (arr, p) => {
    const a = arr.slice().sort((m, n) => m - n);
    return a[Math.min(a.length - 1, Math.max(0, Math.floor(a.length * p)))];
  };
  const capP = cfg.capP || 0.95;
  const xHi = q(xs, capP), yHi = q(ys, capP);
  const xmn = Math.min(...xs), ymn = Math.min(...ys);
  const xmx = Math.max(xHi, xmn + 1), ymx = Math.max(yHi, ymn + 1);

  const padX = (xmx - xmn) * .10 || xmx * .1 || 1;
  const padY = (ymx - ymn) * .14 || ymx * .1 || 1;
  const xt = niceTicks(Math.max(0, xmn - padX), xmx + padX, 4);
  const yt = niceTicks(Math.max(0, ymn - padY), ymx + padY, 4);
  const x0 = xt[0], x1 = xt[xt.length - 1];
  const y0 = yt[0], y1 = yt[yt.length - 1];
  const X = v => pad.l + iw * (Math.min(Math.max(v, x0), x1) - x0) / (x1 - x0 || 1);
  const Y = v => pad.t + ih - ih * (Math.min(Math.max(v, y0), y1) - y0) / (y1 - y0 || 1);

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', style: `height:${H}px`, preserveAspectRatio: 'none' }, host);

  yt.forEach(t => {
    el('line', { x1: pad.l, x2: W - pad.r, y1: Y(t), y2: Y(t), stroke: GRID }, svg);
    const tx = el('text', { x: pad.l - 8, y: Y(t) + 3.5, 'text-anchor': 'end', fill: AXIS_TXT, 'font-size': 10, class: 'num' }, svg);
    tx.textContent = cfg.yFmt ? cfg.yFmt(t) : fmt.num(t);
  });
  xt.forEach(t => {
    const tx = el('text', { x: X(t), y: pad.t + ih + 15, 'text-anchor': 'middle', fill: AXIS_TXT, 'font-size': 10, class: 'num' }, svg);
    tx.textContent = cfg.xFmt ? cfg.xFmt(t) : fmt.num(t);
  });
  el('line', { x1: pad.l, x2: W - pad.r, y1: pad.t + ih, y2: pad.t + ih, stroke: '#ddd7c9' }, svg);

  /* 均值十字线 */
  if (cfg.quad !== false) {
    const mx = cfg.quad && cfg.quad.x !== undefined ? cfg.quad.x : xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = cfg.quad && cfg.quad.y !== undefined ? cfg.quad.y : ys.reduce((a, b) => a + b, 0) / ys.length;
    el('line', { x1: X(mx), x2: X(mx), y1: pad.t, y2: pad.t + ih, stroke: '#dbd5c7', 'stroke-dasharray': '3 3' }, svg);
    el('line', { x1: pad.l, x2: pad.l + iw, y1: Y(my), y2: Y(my), stroke: '#dbd5c7', 'stroke-dasharray': '3 3' }, svg);
  }

  let overflow = 0, hardest = 0;
  pts.forEach(p => {
    const clipped = p.x > x1 || p.y > y1;
    if (clipped) { overflow++; hardest = Math.max(hardest, p.y); }
    const c = el('circle', {
      cx: X(p.x), cy: Y(p.y), r: p.r || 4,
      fill: p.c || GOLD, opacity: clipped ? .42 : .74,
      stroke: clipped ? '#fff' : '#fff', 'stroke-width': clipped ? 1.4 : .8,
      'stroke-dasharray': clipped ? '2 2' : null,
    }, svg);
    c.style.cursor = 'pointer';
    c.addEventListener('mouseenter', e => showTip(e, p.title));
    c.addEventListener('mousemove', moveTip);
    c.addEventListener('mouseleave', hideTip);
  });

  /* 轴标题：放在绘图区外侧，避免与刻度打架 */
  if (cfg.xLab) {
    const t = el('text', { x: W - pad.r, y: pad.t + ih + 31, 'text-anchor': 'end', fill: '#b3aea3', 'font-size': 9.5 }, svg);
    t.textContent = cfg.xLab;
  }
  if (cfg.yLab) {
    const t = el('text', { x: pad.l - 46, y: pad.t - 9, 'text-anchor': 'start', fill: '#b3aea3', 'font-size': 9.5 }, svg);
    t.textContent = cfg.yLab;
  }
  return { overflow, max: hardest };
}

/* ---------------- Tooltip ---------------- */
let _tip;
function showTip(e, html) {
  if (!_tip) {
    _tip = document.createElement('div');
    _tip.className = 'tipbox';
    _tip.style.cssText = 'position:fixed;z-index:999;background:#17161a;color:#fff;padding:8px 11px;border-radius:3px;font-size:11.5px;line-height:1.6;pointer-events:none;box-shadow:0 6px 20px rgba(0,0,0,.2);white-space:nowrap';
    document.body.appendChild(_tip);
  }
  _tip.innerHTML = html;
  _tip.style.display = 'block';
  moveTip(e);
}
function moveTip(e) {
  if (!_tip) return;
  let x = e.clientX + 14, y = e.clientY - 10;
  const r = _tip.getBoundingClientRect();
  if (x + r.width > window.innerWidth - 10) x = e.clientX - r.width - 14;
  if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 10;
  if (y < 8) y = 8;
  _tip.style.left = x + 'px';
  _tip.style.top = y + 'px';
}
function hideTip() { if (_tip) _tip.style.display = 'none'; }

/* 让 tooltip 内的行排得整齐 */
const tipStyle = document.createElement('style');
tipStyle.textContent = `.tipbox b{font-weight:600}
.tipbox .tt-row{display:flex;align-items:center;gap:6px;margin-top:3px}
.tipbox .tt-row i{width:6px;height:6px;border-radius:1px;display:inline-block;flex:none}
.tipbox .tt-row b{margin-left:auto;padding-left:12px;font-variant-numeric:tabular-nums}`;
document.head.appendChild(tipStyle);

/* ---------------- 横向条形组 ---------------- */
function barsHtml(items) {
  const mx = Math.max(...items.map(i => i.v || 0), 1);
  return `<div class="bars">` + items.map(i => `
    <div class="bar-item">
      <div class="bl">
        <span class="nm">${i.name}</span>
        <span class="vl">${i.txt}</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max((i.v / mx) * 100, 1.5).toFixed(1)}%;background:${i.c || GOLD}"></div></div>
      ${i.foot ? `<div class="bar-foot">${i.foot}</div>` : ''}
    </div>`).join('') + `</div>`;
}

/* ---------------- 漏斗 ---------------- */
function funnelHtml(steps, color) {
  const mx = Math.max(...steps.map(s => s.v || 0), 1);
  return `<div class="funnel">` + steps.map((s, i) => {
    const prev = i ? steps[i - 1].v : null;
    const rate = prev ? s.v / prev : null;
    return `<div class="fn-step">
      <div class="fn-row">
        <span class="fn-lab">${s.lab}</span>
        <span class="fn-val">${fmt.int(s.v)}</span>
        <span class="fn-idx">${i === 0 ? '100%' : fmt.pct(rate, 1)}</span>
      </div>
      <div class="fn-track"><div class="fn-fill" style="width:${Math.max((s.v / mx) * 100, 0.8).toFixed(2)}%;background:${color}"></div></div>
      ${s.note ? `<div class="fn-note">${s.note}</div>` : ''}
    </div>`;
  }).join('') + `</div>`;
}

/* ---------------- 热力表 ---------------- */
function heatHtml(rows, cols, getVal, fmtVal, colorFn) {
  let html = `<div class="heat" style="grid-template-columns:44px repeat(${cols.length},minmax(0,1fr))">
    <div class="hh"></div>${cols.map(c => `<div class="hh">${c}</div>`).join('')}`;
  rows.forEach(r => {
    html += `<div class="hr">${r.lab}</div>`;
    cols.forEach(c => {
      const v = getVal(r.k, c);
      const st = colorFn(v);
      html += `<div class="hc" style="background:${st.bg};color:${st.fg}" title="${r.lab} · ${c}">${v ? fmtVal(v) : '—'}</div>`;
    });
  });
  return html + '</div>';
}

/* ---------------- 窗口缩放重绘 ---------------- */
let _rt;
function onResize(fn) {
  window.addEventListener('resize', () => {
    clearTimeout(_rt);
    _rt = setTimeout(fn, 180);
  });
}
