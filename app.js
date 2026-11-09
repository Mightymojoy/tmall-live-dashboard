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
  /* 自然季度，键形如 2026-Q4，字符串排序即时间序 */
  quarterOf(s) {
    const y = s.slice(0, 4), m = Number(s.slice(5, 7));
    return y + '-Q' + Math.ceil(m / 3);
  },
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

  /* 商品：元数据 + 商品×日 展开（步长 4：索引 / 支付 / 仅退款 / 退货退款） */
  D.goodsMeta = j.goodsMeta.map(([id, name, cat, prod]) => ({ id, name, cat, prod }));
  D.shopDates = Object.keys(j.gd).sort();
  D.goodsDaily = [];
  for (const d of D.shopDates) {
    const arr = j.gd[d];
    for (let i = 0; i < arr.length; i += 4) {
      D.goodsDaily.push({ d, gi: arr[i], pay: arr[i + 1], only: arr[i + 2], ret: arr[i + 3] });
    }
  }

  /* 直播归因明细：订单明细表，[索引 / 订单支付 / 订单退款 / 其中已确认收货]，步长 4。
     只覆盖 liveMeta.from ~ liveMeta.to 这几十天，其余区间没有归因可达，前端按窗口截取。 */
  D.liveMeta = j.liveMeta || { from: '', to: '', days: 0, goods: 0, sessions: 0, pay: 0 };
  D.liveDaily = [];
  for (const d of Object.keys(j.liveDaily || {}).sort()) {
    const arr = j.liveDaily[d];
    for (let i = 0; i < arr.length; i += 4) {
      D.liveDaily.push({ d, gi: arr[i], pay: arr[i + 1], rf: arr[i + 2], rfShip: arr[i + 3] });
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
  sessions: [], sessionsBase: [], shop: [], goods: [],
  prevSessions: [], liveByDay: new Map(),
  min: '', max: '',
  /* 五个维度的筛选状态：null = 不限，Set = 选中集合 */
  dims: { sh: null, an: null, rt: null, rn: null, mg: null },
  dimActive: false,
  /* 粒度：auto 由区间长度推导，其余为手工锁定 */
  grainPref: 'auto',
  /* 对比口径：prev = 上一等长区间（环比），yoy = 去年同期（同比） */
  cmp: 'prev',
  yoyFrom: '', yoyTo: '', yoySessions: [], hasYoy: false,
  grain: 'day',
  /* 活动名候选多（32 个节奏），默认折叠，展开后换行铺开 */
  rnOpen: false,
};

/* 五维度定义：与需求「总控 5 个板块」一一对应 */
const DIMS = [
  { k: 'sh', lab: '场次维度', ttl: '按开播时间划分班次', multi: true },
  { k: 'an', lab: '主播维度', ttl: '按排班主播过滤，仅含真人主播场次', multi: true },
  { k: 'rn', lab: '店铺活动', ttl: '官方活动节奏名，可与「日销 / 活动」叠加', multi: true },
  { k: 'mg', lab: '直播间机制', ttl: '直播间机制标签（大场名单需人工上传，当前仅少量场次有值）', multi: true },
];

const PRESETS = [
  { k: '7', t: '近 7 天' },
  { k: '30', t: '近 30 天' },
  { k: '90', t: '近 90 天' },
  { k: 'month', t: '本月' },
  { k: 'lastmonth', t: '上月' },
  { k: 'half', t: '近半年' },
  { k: 'all', t: '全部' },
];

/* 时间维度粒度：auto 按区间长度自动推导 */
const GRAINS = [
  { k: 'auto', t: '自动' },
  { k: 'day', t: '日' },
  { k: 'week', t: '周' },
  { k: 'month', t: '月' },
  { k: 'quarter', t: '季' },
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
  /* 直播归因窗口：明细只覆盖 liveMeta.from ~ liveMeta.to，取与当前筛选区间的交集。
     三列（直播间金额 / 渗透率 / 直播间退货率）都只在这个窗口内有意义。 */
  const lf = D.liveMeta && D.liveMeta.from ? D.liveMeta.from : '9999-12-31';
  const lt = D.liveMeta && D.liveMeta.to ? D.liveMeta.to : '0000-01-01';
  const wf = from > lf ? from : lf;
  const wt = to < lt ? to : lt;
  const hasLive = wf <= wt && D.liveDaily.length > 0;

  const m = new Map();      // 全区间：店铺口径
  const w = new Map();      // 归因窗口：渗透率分母（发货额）
  for (const r of D.goodsDaily) {
    const full = r.d >= from && r.d <= to;
    const win = hasLive && r.d >= wf && r.d <= wt;
    if (!full && !win) continue;
    if (full) {
      const g = m.get(r.gi);
      if (g) { g.pay += r.pay; g.only += r.only; g.ret += r.ret; }
      else m.set(r.gi, { gi: r.gi, pay: r.pay, only: r.only, ret: r.ret });
    }
    if (win) {
      const g = w.get(r.gi);
      if (g) { g.pay += r.pay; g.only += r.only; }
      else w.set(r.gi, { pay: r.pay, only: r.only });
    }
  }

  /* 订单侧：窗口内按商品的支付额，以及窗口合计（用于求校准系数） */
  const lm = new Map();
  let ordPay = 0;
  if (hasLive) {
    for (const r of D.liveDaily) {
      if (r.d < wf || r.d > wt) continue;
      const o = lm.get(r.gi);
      if (o) { o.pay += r.pay; o.rf += r.rf; o.rfShip += r.rfShip; }
      else lm.set(r.gi, { pay: r.pay, rf: r.rf, rfShip: r.rfShip });
      ordPay += r.pay;
    }
  }
  /* 校准系数 k = 窗口内场次口径成交 ÷ 窗口内订单口径支付。
     两者不是同一口径（下单归集 vs 支付时所在场），逐日 k 稳定在 0.34~0.60、中位 0.47，
     没有一天接近 1，属系统性差异，故用总量锚定、结构沿用订单表占比。 */
  const gmvW = hasLive
    ? F.sessions.reduce((t, s) => t + (s.d >= wf && s.d <= wt ? (s.gmv || 0) : 0), 0)
    : 0;
  const k = ordPay > 0 && gmvW > 0 ? gmvW / ordPay : null;

  const out = [...m.values()].map(g => {
    const meta = D.goodsMeta[g.gi] || { name: '—', cat: '未匹配', prod: '未匹配' };
    /* 发货 = 支付 − 仅退款（三个仅退款场景）；退货率 = 退货退款 ÷ 发货。
       源表偶有「仅有退款、无支付」的残行，已在上游剔除，这里再兜一次底不出现负数 */
    const ship = Math.max(g.pay - g.only, 0);
    const gw = w.get(g.gi) || { pay: 0, only: 0 };
    const shipW = Math.max(gw.pay - gw.only, 0);
    const o = lm.get(g.gi) || null;
    const liveAmt = o && k ? o.pay * k : null;
    return {
      i: g.gi, name: meta.name, cat: meta.cat, prod: meta.prod,
      pay: g.pay, only: g.only, ship, ret: g.ret,
      rate: ship ? g.ret / ship : null,
      retRate: ship ? g.ret / ship : null,
      /* 直播间三列：无订单明细的商品保留 null，页面显示「—」，不能当 0 算 */
      live: liveAmt,
      liveShip: shipW,
      pen: liveAmt !== null && shipW > 0 ? liveAmt / shipW : null,
      liveOrd: o ? o.pay : null,
      liveRf: o ? o.rf : null,
      liveRfShip: o ? o.rfShip : null,
    };
  });
  out.sort((a, b) => b.ship - a.ship);
  out.liveK = k;
  out.liveFrom = hasLive ? wf : '';
  out.liveTo = hasLive ? wt : '';
  return out;
}

/* ---------------- 维度过滤 ---------------- */
/* 维度候选值 + 场次计数，用于总控条渲染与「反选」 */
function dimOptions(k) {
  const cnt = new Map();
  const rtSel = F.dims.rt;
  for (const s of (F.sessionsBase || D.sessions)) {
    /* 活动名是类型的下级：选定类型后只列该类型下的活动名，
       否则会出现「类型选了活动、活动名却列着日销」的自相矛盾 */
    if (k === 'rn' && rtSel && !rtSel.has(s.rt || '')) continue;
    const v = k === 'mg' ? (s.mg || '无机制') : (s[k] || '');
    if (v === '' || v === undefined) continue;
    cnt.set(v, (cnt.get(v) || 0) + 1);
  }
  const arr = [...cnt.entries()];
  /* 班次按「数字人→早→中→晚」固定顺序，不按数量排，否则顺序随窗口跳动 */
  if (k === 'sh') {
    return arr.sort((a, b) => SHIFTS.indexOf(a[0]) - SHIFTS.indexOf(b[0]));
  }
  return arr.sort((a, b) => b[1] - a[1]);
}

function dimVal(s, k) {
  if (k === 'mg') return s.mg || '无机制';
  return s[k] || '';
}

/* 五个维度必须同时满足；null 表示该维度不限 */
function passDim(s) {
  const d = F.dims;
  if (d.sh && !d.sh.has(s.sh)) return false;
  if (d.an && !d.an.has(dimVal(s, 'an'))) return false;
  if (d.rt && !d.rt.has(dimVal(s, 'rt'))) return false;
  if (d.rn && !d.rn.has(dimVal(s, 'rn'))) return false;
  if (d.mg && !d.mg.has(dimVal(s, 'mg'))) return false;
  return true;
}

/* 选中集合如果等于全部候选，等价于不限，置回 null 避免「假筛选」 */
function normalizeDim(k) {
  const cur = F.dims[k];
  if (!cur) return;
  const all = dimOptions(k).map(x => x[0]);
  if (cur.size === 0 || cur.size >= all.length) F.dims[k] = null;
}

/* 类型变化后，已选活动名若不在新候选里就剔除，
   避免「类型选了活动、活动名却停在日销」导致筛出 0 场 */
function pruneRn() {
  if (!F.dims.rn || !F.dims.rt) return;
  const all = new Set(dimOptions('rn').map(x => x[0]));
  const keep = [...F.dims.rn].filter(v => all.has(v));
  F.dims.rn = (keep.length && keep.length < all.size) ? new Set(keep) : null;
}

function dimToggle(k, v) {
  if (k === 'rt') {
    /* 活动类型只有「日销 / 活动」两档，是父子结构的父级。
       按多选处理会出这种事：先选「活动」再点「日销」，两个都选中 = 不限，
       看着点了却没筛住。所以类型用单选语义：点新的替换，再点自己取消 */
    const only = F.dims.rt && F.dims.rt.size === 1 && F.dims.rt.has(v);
    F.dims.rt = only ? null : new Set([v]);
  } else {
    let cur = F.dims[k] ? new Set(F.dims[k]) : null;
    if (!cur) {
      /* 从「不限」点某一项 = 只看该项。沿用「全集减一」会让点一个名字变成排除他 */
      cur = new Set([v]);
    } else if (cur.has(v)) {
      cur.delete(v);
    } else {
      cur.add(v);
    }
    F.dims[k] = cur.size ? cur : null;
  }
  normalizeDim(k);
  setRange(F.from, F.to, F.preset);
}

function dimAll(k) {
  F.dims[k] = null;
  setRange(F.from, F.to, F.preset);
}

/* 反选：先展开成全部候选，再整体取反 */
function dimInvert(k) {
  const all = dimOptions(k).map(x => x[0]);
  const cur = F.dims[k] || new Set(all);
  const next = all.filter(v => !cur.has(v));
  F.dims[k] = next.length ? new Set(next) : null;
  normalizeDim(k);
  setRange(F.from, F.to, F.preset);
}

function resetDims() {
  F.dims = { sh: null, an: null, rt: null, rn: null, mg: null };
  setRange(F.from, F.to, F.preset);
}

function shiftYear(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const ny = y + n;
  const last = new Date(ny, m, 0).getDate();
  return ny + '-' + String(m).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0');
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

  /* 先按日期取全集，再按五个维度过滤；店铺侧数据没有维度字段，只按日期 */
  F.sessionsBase = D.sessions.filter(s => s.d >= from && s.d <= to);
  pruneRn();
  F.sessions = F.sessionsBase.filter(passDim);
  F.dimActive = F.sessions.length !== F.sessionsBase.length;
  F.shop = D.shopAll.filter(x => x.d >= from && x.d <= to);
  F.goods = aggGoods(from, to);
  F.prevSessions = D.sessions.filter(s => s.d >= F.prevFrom && s.d <= F.prevTo).filter(passDim);

  /* 同比：去年同一区间（2 月 29 日向前顺延到 2 月 28 日）
     去年同期必须完整落在数据起点之后，否则窗口会和本期重叠、或被截断，
     算出来的「同比」是两段时间拼出来的假数——宁可标不可用，也不给错数。 */
  F.yoyFrom = shiftYear(from, -1);
  F.yoyTo = shiftYear(to, -1);
  F.yoySessions = (F.yoyFrom >= F.min)
    ? D.sessions.filter(s => s.d >= F.yoyFrom && s.d <= F.yoyTo).filter(passDim)
    : [];
  F.hasYoy = F.yoySessions.length > 0;

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
  F.yoyRoll = calc.rollup(F.yoySessions);
  F.grain = F.grainPref === 'auto' ? grainOf(F.days) : F.grainPref;

  syncBar();
  const q = (location.pathname.split('/').pop() || '') + '?' + stateQuery();
  try { history.replaceState(null, '', q); } catch (e) { /* file:// 下忽略 */ }
  fireFilter();
}

/* URL 状态：日期 + 粒度 + 对比 + 五维度，便于分享与刷新还原 */
function stateQuery() {
  const p = new URLSearchParams();
  p.set('f', F.from); p.set('t', F.to);
  if (F.grainPref !== 'auto') p.set('g', F.grainPref);
  if (F.cmp !== 'prev') p.set('c', F.cmp);
  for (const k of ['sh', 'an', 'rt', 'rn', 'mg']) {
    if (F.dims[k]) p.set(k, [...F.dims[k]].join(','));
  }
  return p.toString();
}

function setGrain(g) {
  F.grainPref = g;
  setRange(F.from, F.to, F.preset);
}

function setCmp(c) {
  F.cmp = c;
  syncBar();
  fireFilter();
}

/* 总控条状态同步：日期、预设、粒度、对比、五维度高亮与计数 */
function syncBar() {
  const a = document.getElementById('dFrom'), b = document.getElementById('dTo');
  if (a) a.value = F.from;
  if (b) b.value = F.to;

  document.querySelectorAll('.chip[data-p]').forEach(c => {
    c.classList.toggle('on', c.dataset.p === F.preset);
  });
  document.querySelectorAll('.chip[data-g]').forEach(c => {
    c.classList.toggle('on', c.dataset.g === F.grainPref);
  });
  document.querySelectorAll('.chip[data-c]').forEach(c => {
    c.classList.toggle('on', c.dataset.c === F.cmp);
  });

  renderDimGroup('rt', 'chRt', '类型');
  renderDimGroup('rn', 'chRn', '活动名');
  renderDimGroup('sh', 'chSh', '班次');
  renderDimGroup('an', 'chAn', '主播');
  renderDimGroup('mg', 'chMg', '机制');

  /* 大场标记源表没有，如实标为待补，不用别的字段冒充 */
  const mgHost = document.getElementById('chMg');
  if (mgHost) mgHost.insertAdjacentHTML('beforeend',
    '<button type="button" class="chip dchip ghost" disabled title="大场名单需人工上传；源表现仅有「下单加赠箱套」等机制标记，无大场标识">大场（待补）</button>');

  const meta = document.getElementById('fbarMeta');
  if (meta) {
    const cmpLab = F.cmp === 'yoy' ? '同比' : '环比';
    /* 注记只留区间，场次数放进 title：首行宽度已经到极限，重复信息会让摘要被裁掉 */
    const cmpOk = F.cmp === 'yoy' ? F.hasYoy : !!(F.prevSessions && F.prevSessions.length);
    const cmpTxt = F.cmp === 'yoy'
      ? (F.hasYoy
        ? `${F.yoyFrom.slice(2)}~${F.yoyTo.slice(5)}`
        : (F.yoyFrom < F.min ? '不可用' : '不可用'))
      : (cmpOk ? `${F.prevFrom.slice(5)}~${F.prevTo.slice(5)}` : '不可用');
    const cmpWhy = F.cmp === 'yoy'
      ? (F.hasYoy ? `去年同期 ${F.yoyFrom} → ${F.yoyTo}，共 ${F.yoySessions.length} 场`
        : (F.yoyFrom < F.min
          ? `去年同期 ${F.yoyFrom} 早于数据起点 ${F.min}，同比不成立，指标留空`
          : `去年同期 ${F.yoyFrom} → ${F.yoyTo} 无场次`))
      : (cmpOk ? `对比期 ${F.prevFrom} → ${F.prevTo}，共 ${F.prevSessions.length} 场`
        : '区间已顶到数据起点，没有上一等长区间可对比');

    /* 当前区间已在左侧两个日期框里显示，摘要不再重复，只留天数与场次 */
    meta.innerHTML =
      `<span class="fb-sum"><b>${F.days}</b> 天 · <b>${F.roll.n}</b> 场</span>`
      + (F.dimActive
        ? `<span class="sp"></span><span class="fb-filtered">筛选后 <b>${F.sessions.length}</b> / ${F.sessionsBase.length}</span>`
        : '');
    const note = document.getElementById('fbCmpNote');
    if (note) {
      note.textContent = cmpOk ? `vs ${cmpTxt}` : `${cmpLab} ${cmpTxt}`;
      note.title = cmpWhy;
      note.className = 'fb-cmpnote' + (cmpOk ? '' : ' mute');
    }
  }

  const reset = document.getElementById('fbReset');
  if (reset) reset.style.visibility = (F.dimActive || F.grainPref !== 'auto' || F.cmp !== 'prev') ? 'visible' : 'hidden';

  syncDdBtns();
}

/* 活动名折叠阈值：再多就折叠成「更多 +N」，不铺横向滚动条 */
const RN_FOLD = 4;
/* 活动名「日销」与外层类型「日销」同名，加后缀区分两者不是一回事 */
const RN_ALIAS = { '日销': '日销（常规）' };

/* 下拉按钮上的「当前选择」摘要：不打开面板也能看出筛了什么 */
function syncDdBtns() {
  const set = (id, txt, on) => {
    const el = document.getElementById(id);
    if (!el) return;
    const v = el.querySelector('.vl');
    if (v) v.textContent = txt;
    el.classList.toggle('on', !!on);
  };
  const one = k => {
    const cur = F.dims[k];
    if (!cur || !cur.size) return null;
    const arr = [...cur];
    if (arr.length === 1) return (k === 'rn' && RN_ALIAS[arr[0]]) ? RN_ALIAS[arr[0]] : arr[0];
    return '已选 ' + arr.length + ' 项';
  };

  const pT = PRESETS.find(p => p.k === F.preset);
  /* 时间不做金色高亮：区间本身就写在按钮上，且各页默认区间不同
     （总览 30 天、班次与主播 90 天），一亮就分不清「改过」还是「本来如此」；
     金色只留给真正被筛过的四个维度 */
  set('ddTime', pT ? pT.t : `${F.from.slice(5)} ~ ${F.to.slice(5)}`, false);
  set('ddSh', one('sh') || '全部', !!F.dims.sh);
  set('ddAn', one('an') || '全部', !!F.dims.an);

  /* 店铺活动是父子两层：类型与活动名各取摘要再合并，避免只显示一半 */
  const act = [one('rt'), one('rn')].filter(Boolean).join(' · ');
  set('ddAct', act || '全部', !!(F.dims.rt || F.dims.rn));
  set('ddMg', one('mg') || '全部', !!F.dims.mg);
}

/* 一组维度 chips：候选值按场次数量排序，选中态高亮，点击切换 */
function renderDimGroup(k, hostId, unit) {
  const host = document.getElementById(hostId);
  if (!host) return;
  const opts = dimOptions(k);
  const cur = F.dims[k];
  const label = v => (k === 'rn' && RN_ALIAS[v]) ? RN_ALIAS[v] : v;

  const foldable = (k === 'rn') && opts.length > RN_FOLD + 1;
  const open = foldable && !!F.rnOpen;
  const shown = (foldable && !open) ? opts.slice(0, RN_FOLD) : opts;
  /* 每组「全量」按钮写清指向：类型组叫「不限类型」、活动名组叫「全部活动」，
     否则同一行并排两个「不限/全部」根本分不出各管哪一组 */
  const allLab = (k === 'rt') ? '不限'
    : (k === 'rn') ? '全部活动' : '全部';

  let html = `<button type="button" class="chip dchip${cur ? '' : ' on'}" data-dim="${k}" data-v="">${allLab}</button>`;
  html += shown.map(([v, n]) => `<button type="button" class="chip dchip${cur && cur.has(v) ? ' on' : ''}"
        data-dim="${k}" data-v="${escAttr(v)}" title="${escAttr(v)} · ${n} 场">${escTxt(label(v))}<i>${n}</i></button>`).join('');
  if (foldable) {
    html += open
      ? `<button type="button" class="chip more" data-fold="rn" title="收起活动名">收起</button>`
      : `<button type="button" class="chip more" data-fold="rn" title="展开全部 ${opts.length} 个活动名">更多 +${opts.length - RN_FOLD}</button>`;
  }
  host.innerHTML = html;
}

function escTxt(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
function escAttr(s) {
  return escTxt(s).replace(/"/g, '&quot;');
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
    fb.innerHTML = `<div class="fbar-in fbg">
      <!-- 一行五个下拉：默认只显示「标签 + 当前选择」，点开才铺候选值，
           避免五组 chip 平铺把筛选条撑成三行 -->
      <div class="dd" id="ddTime">
        <button type="button" class="dd-btn" aria-haspopup="true">
          <span class="lb">时间</span><span class="vl">近 30 天</span><i class="ar">▾</i>
        </button>
        <div class="dd-pop wide">
          <div class="dd-sec">
            <span class="dd-lb">快捷区间</span>
            <div class="chips">
              ${PRESETS.map(p => `<button type="button" class="chip" data-p="${p.k}">${p.t}</button>`).join('')}
            </div>
          </div>
          <div class="dd-sec">
            <span class="dd-lb">精确区间</span>
            <div class="dr">
              <input type="date" id="dFrom" aria-label="开始日期">
              <span class="to">→</span>
              <input type="date" id="dTo" aria-label="结束日期">
            </div>
          </div>
          <div class="dd-sec">
            <span class="dd-lb">趋势粒度</span>
            <div class="chips">
              ${GRAINS.map(g => `<button type="button" class="chip" data-g="${g.k}" title="${g.k === 'auto' ? '按区间长度自动选择' : ''}">${g.t}</button>`).join('')}
            </div>
          </div>
          <div class="dd-sec">
            <span class="dd-lb">对比口径</span>
            <div class="chips">
              <button type="button" class="chip" data-c="prev" title="与上一等长区间对比">环比</button>
              <button type="button" class="chip" data-c="yoy" title="与去年同期同一区间对比">同比</button>
            </div>
            <span class="fb-cmpnote" id="fbCmpNote"></span>
          </div>
        </div>
      </div>

      <div class="dd" id="ddSh">
        <button type="button" class="dd-btn" aria-haspopup="true">
          <span class="lb">班次</span><span class="vl">全部</span><i class="ar">▾</i>
        </button>
        <div class="dd-pop">
          <div class="dd-hd"><span class="dd-lb">按开播时间</span><button type="button" class="fb-act" data-inv="sh">反选</button></div>
          <div class="chips" id="chSh"></div>
        </div>
      </div>

      <div class="dd" id="ddAn">
        <button type="button" class="dd-btn" aria-haspopup="true">
          <span class="lb">主播</span><span class="vl">全部</span><i class="ar">▾</i>
        </button>
        <div class="dd-pop">
          <div class="dd-hd"><span class="dd-lb">出场主播</span><button type="button" class="fb-act" data-inv="an">反选</button></div>
          <div class="chips" id="chAn"></div>
        </div>
      </div>

      <div class="dd" id="ddAct">
        <button type="button" class="dd-btn" aria-haspopup="true">
          <span class="lb">店铺活动</span><span class="vl">全部</span><i class="ar">▾</i>
        </button>
        <div class="dd-pop wide">
          <div class="dd-sec">
            <div class="dd-hd"><span class="dd-lb">活动类型</span></div>
            <div class="chips" id="chRt"></div>
          </div>
          <div class="dd-sec">
            <div class="dd-hd"><span class="dd-lb">活动名称</span><button type="button" class="fb-act" data-inv="rn">反选</button></div>
            <div class="chips" id="chRn"></div>
          </div>
        </div>
      </div>

      <div class="dd" id="ddMg">
        <button type="button" class="dd-btn" aria-haspopup="true">
          <span class="lb">机制</span><span class="vl">全部</span><i class="ar">▾</i>
        </button>
        <div class="dd-pop">
          <div class="dd-hd"><span class="dd-lb">直播间机制</span><button type="button" class="fb-act" data-inv="mg">反选</button></div>
          <div class="chips" id="chMg"></div>
        </div>
      </div>

      <div class="fb-right">
        <span class="fbar-meta" id="fbarMeta"></span>
        <button type="button" class="btn-reset" id="fbReset">重置</button>
      </div>
    </div>`;

    fb.querySelectorAll('.chip[data-p]').forEach(c => {
      c.onclick = () => { const [a, b] = presetRange(c.dataset.p); setRange(a, b, c.dataset.p); if (window.closeDD) window.closeDD(); };
    });
    fb.querySelectorAll('.chip[data-g]').forEach(c => {
      c.onclick = () => { setGrain(c.dataset.g); if (window.closeDD) window.closeDD(); };
    });
    fb.querySelectorAll('.chip[data-c]').forEach(c => {
      c.onclick = () => { setCmp(c.dataset.c); if (window.closeDD) window.closeDD(); };
    });
    fb.querySelectorAll('.fb-act[data-inv]').forEach(b => {
      b.onclick = () => dimInvert(b.dataset.inv);
    });
    fb.querySelectorAll('#chRt, #chSh, #chAn, #chRn, #chMg').forEach(host => {
      host.onclick = e => {
        /* 「更多 +N」/「收起」在 chips 容器内，必须先拦下，不能当维度处理 */
        if (e.target.closest('[data-fold]')) {
          F.rnOpen = !F.rnOpen;
          syncBar();
          return;
        }
        const b = e.target.closest('.dchip');
        if (!b) return;
        const k = b.dataset.dim, v = b.dataset.v;
        if (v === '') dimAll(k); else dimToggle(k, v);
      };
    });
    /* 下拉面板：同一时刻只开一个；点面板内部不关闭（要连续多选），点外部或 Esc 关闭 */
    const ddAll = () => [...fb.querySelectorAll('.dd')];
    window.closeDD = () => ddAll().forEach(d => d.classList.remove('open'));
    ddAll().forEach(dd => {
      const btn = dd.querySelector('.dd-btn');
      const pop = dd.querySelector('.dd-pop');
      btn.onclick = e => {
        e.stopPropagation();
        const wasOpen = dd.classList.contains('open');
        window.closeDD();
        if (wasOpen) return;
        dd.classList.add('open');
        /* 靠近视口右缘时改为右对齐，避免面板被裁掉 */
        pop.style.visibility = 'hidden';
        const r = pop.getBoundingClientRect();
        dd.classList.toggle('flip', r.right > window.innerWidth - 12);
        pop.style.visibility = '';
      };
      pop.onclick = e => e.stopPropagation();
    });
    document.addEventListener('click', () => window.closeDD());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') window.closeDD(); });

    const rs = document.getElementById('fbReset');
    if (rs) rs.onclick = () => { F.grainPref = 'auto'; F.cmp = 'prev'; resetDims(); };

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
  /* URL 还原粒度、对比口径与五维度（分享链接可复现同一视图） */
  const g = u.get('g');
  if (g && GRAINS.some(x => x.k === g)) F.grainPref = g;
  const c = u.get('c');
  if (c === 'yoy') F.cmp = c;
  for (const k of ['sh', 'an', 'rt', 'rn', 'mg']) {
    const raw = u.get(k);
    if (!raw) continue;
    const set = new Set(raw.split(',').filter(Boolean));
    if (set.size) F.dims[k] = set;
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
  if (days <= 400) return 'month';
  return 'quarter';
}

function grainLabel(d, grain) {
  if (grain === 'quarter') return d.slice(2).replace('-Q', ' Q');
  if (grain === 'month') return d.slice(2, 7).replace('-', '/');
  return fmt.md(d);
}

/* 区间在某个粒度下的分桶键 */
function grainKey(d, grain) {
  if (grain === 'day') return d;
  if (grain === 'week') return dU.weekStart(d);
  if (grain === 'quarter') return dU.quarterOf(d);
  return dU.yearMonth(d);
}

const GRAIN_NAME = { day: '按日', week: '按周', month: '按月', quarter: '按季' };
const GRAIN_COL = { day: '日期', week: '周起始', month: '月份', quarter: '季度' };

/* 当前分桶对应的去年同期分桶键，用于逐桶同比 */
function yoyKey(k, grain) {
  if (grain === 'day') return shiftYear(k, -1);
  if (grain === 'week') return dU.weekStart(shiftYear(k, -1));
  return (Number(k.slice(0, 4)) - 1) + k.slice(4);
}

function groupByGrain(sessions, grain) {
  const key = s => grainKey(s.d, grain);
  const m = calc.group(sessions, key);
  return [...m.keys()].sort().map(k => {
    const arr = m.get(k);
    const r = calc.rollup(arr);
    r.k = k;
    r.days = new Set(arr.map(x => x.d)).size;
    return r;
  });
}

/* 末尾不完整的月/周/季不进趋势图，否则会被读成断崖式下跌 */
function trimTail(rows, grain) {
  if (!rows.length) return rows;
  const need = grain === 'quarter' ? 60 : grain === 'month' ? 15 : grain === 'week' ? 5 : 1;
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

/* 双对比：同一指标同时给环比与同比，两个数各带标签，不挤在一处 */
function cmpHtml(cur, prev, yoy, opt = {}) {
  const h = F.cmp === 'yoy' ? yoy : prev;
  const lab = F.cmp === 'yoy' ? '同比' : '环比';
  const other = F.cmp === 'yoy' ? prev : yoy;
  const otherLab = F.cmp === 'yoy' ? '环比' : '同比';
  const v = (h === null || h === undefined || !h) && opt.zeroOk !== true ? '<span class="delta flat">—</span>' : deltaHtml(cur, h, opt);
  const o = (other === null || other === undefined || !other)
    ? '<span class="delta flat">—</span>' : deltaHtml(cur, other, opt);
  return `<span class="cmps">`
    + `<span class="cmp"><i>${lab}</i>${v}</span>`
    + `<span class="cmp sub"><i>${otherLab}</i>${o}</span>`
    + `</span>`;
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
