# -*- coding: utf-8 -*-
"""
天猫直播数据看板 — 数据管线
输入：直播字段.xlsx（天猫后台导出）+ 10-11月天猫排班表.xlsx（主播排班）
输出：data.json / data.js（看板唯一数据源）

口径（依据老大 2026-11-04 指定）：
  店铺发货金额 = 支付金额(全部) - 未发货仅退款 - 已收到货仅退款 - 在途仅退款
  （三个仅退款场景取其【退款金额】列；"支付金额"列在各场景恒等于当日全店支付总额，
    直接相减会得负数，故只减退款金额）
  直播渗透率 = 当日直播成交金额 / 当日店铺发货金额

数据体积控制：
  场次表只保留前端实际用到的字段；单品明细按「商品 × 日」压缩存储（gd），
  前端展开后即可支持任意日期区间的商品级筛选。
"""
import sys, os, json, datetime, argparse
from collections import Counter
import openpyxl

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
DEF_SRC = r'C:\Users\QwQ\Desktop\直播字段V1.xlsx'
DEF_SCH = r'C:\Users\QwQ\Desktop\10-11月天猫排班表.xlsx'

ONLY_REFUND_SCENES = ('未发货仅退款', '已收到货仅退款', '在途仅退款')

# ---------------------------------------------------------------
# 连播场次拆分（老大 2026-11-05 确认）
#
# 2026-10-20 双11 预售夜由「中班 陈思颖」与「晚班 赵亚男」连播，但场次表只留了
# 一条「中班 621 分钟」的记录，133.8 万全记在陈思颖名下、赵亚男当天 0 场次。
# 排班与目标表是清楚的：早=一丹 / 中=陈思颖 / 晚=赵亚男，晚班目标 166.4 万。
#
# 处理：把这一场按权重拆成两条，成交/退款/时长/观看等「体量类」字段按权重分，
# 比率类指标（转化率、时均 UV、单小时 GMV 等）由前端用拆分后的分子分母重算，
# 因此比率不变。目标不拆——166.4 万仍属晚班，拆出来的晚班那条去承接它。
#
# 权重取对半：两名主播标准班次时长为 265 / 271 分钟，按时长权重是 49.4 : 50.6，
# 与对半的差额不到 1 万元，用对半更好解释。要改口径只改这张表，重跑即生效。
# ---------------------------------------------------------------
SPLIT_RULES = {
    ('2026-10-20', '中'): [('中', '陈思颖', 0.5), ('晚', '赵亚男', 0.5)],
}
# 按权重拆分的体量字段（其余字段原样带到每一条上）
SPLIT_VOL = ('gmv', 'rf', 'net', 'dur', 'uv', 'ep', 'cp', 'gcp', 'ac', 'bp', 'fans')

# ---------------------------------------------------------------
# 场次的活动节奏：改用「天猫活动节奏」官方表（V1 新增）
# 该表为逐日日历，横排两块：A~D 为 2026 年（日期/节奏/类型/直播间机制），
# G~I 为 2025 年（日期/节奏/类型）。原按标题关键词猜测的 大促/上新/常规 已废弃。
#
# 名称清洗规则（只做归一，不改语义）：
#   1. 节奏名里带换行和券信息备注（"无消费券""无消费券和限时红包"等），备注不属于活动名，剔除；
#   2. 去掉官方名的"天猫"前缀；
#   3. 同一活动的不同年份写法合并（见 RHYTHM_ALIAS），分波次/分阶段的名称保持独立，
#      因为它们是不同的活动期，合并会掩盖节奏差异。
# 空节奏（表里没填）按官方"类型=日销"处理，显示为「日销」。
# ---------------------------------------------------------------
RHYTHM_EMPTY = '日销'
RHYTHM_NOTES = ('无消费券和限时红包', '无消费券限时红包', '无消费券', '有消费券',
                '限时红包', '无消费券无红包')
RHYTHM_ALIAS = {
    '天猫新势力周': '新势力周',
    '8月新势力周': '新势力周',
    '618狂欢节': '618',
    '天猫38焕新周': '38焕新周',
    '天猫新风潮': '新风潮',
    '天猫510周年庆': '510周年庆',
    '天猫五一狂欢': '五一狂欢',
    '天猫春上新': '春上新',
}


def clean_rhythm(v):
    """官方节奏名归一：去换行/备注/天猫前缀，合并同一活动的跨年写法"""
    if v is None:
        return RHYTHM_EMPTY
    s = str(v).replace('\r', ' ').replace('\n', ' ').strip()
    for n in RHYTHM_NOTES:
        s = s.replace(n, ' ')
    s = s.replace('-', ' ').replace('－', ' ')
    s = ' '.join(s.split())
    s = s.replace(' ', '')
    if s.startswith('天猫') and len(s) > 2:
        s = s[2:]
    s = RHYTHM_ALIAS.get(s, s)
    return s or RHYTHM_EMPTY


def load_targets(path):
    """「天猫排班及目标表」-> {date: [数字人, 早, 中, 晚]}（单位：元）

    表头两行：第 1 行只有 H 列写「目标」，第 2 行为 数字人 / 早 / 中 / 晚。
    列位：B 日期、C~E 排班主播、H 数字人目标、I 早目标、J 中目标、K 晚目标。
    目标只覆盖 2026-10-01 起的新排期，更早的日期没有目标，前端按「无目标」处理，
    不能把 0 当成目标 0 去算达成率。
    """
    wb = openpyxl.load_workbook(path, data_only=True)
    if '天猫排班及目标表' not in wb.sheetnames:
        return {}
    ws = wb['天猫排班及目标表']
    out = {}
    for r in ws.iter_rows(min_row=3, values_only=True):
        if r[1] is None:
            continue
        d = dstr(r[1])
        if len(d) != 10 or not d[:4].isdigit():
            continue
        vals = [f(r[7]), f(r[8]), f(r[9]), f(r[10])]
        if all(v is None for v in vals):
            continue
        out[d] = [r0(v) or 0.0 for v in vals]
    return out


def load_rhythm(path):
    """「天猫活动节奏」-> {date: (节奏名, 类型, 直播间机制)}"""
    wb = openpyxl.load_workbook(path, data_only=True)
    if '天猫活动节奏' not in wb.sheetnames:
        return {}
    ws = wb['天猫活动节奏']
    out = {}
    for r in ws.iter_rows(min_row=2, values_only=True):
        # 左块：日期/节奏/类型/机制
        if r[0] is not None:
            d = dstr(r[0])
            if len(d) == 10 and d[:4].isdigit():
                out[d] = (clean_rhythm(r[1]),
                          (str(r[2]).strip() if r[2] else RHYTHM_EMPTY),
                          (str(r[3]).strip() if len(r) > 3 and r[3] else ''))
        # 右块：日期/节奏/类型
        if len(r) > 8 and r[6] is not None:
            d = dstr(r[6])
            if len(d) == 10 and d[:4].isdigit():
                out.setdefault(d, (clean_rhythm(r[7]),
                                   (str(r[8]).strip() if r[8] else RHYTHM_EMPTY), ''))
    return out


def f(x):
    """安全转数字，'--' / None / '' -> None"""
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip()
    if s in ('', '--', '-', 'None', 'NULL', 'null'):
        return None
    try:
        return float(s.replace(',', ''))
    except Exception:
        return None


def r0(x):
    """金额取整到元，压缩体积"""
    return None if x is None else round(x, 1)


def div(a, b):
    if a is None or b in (None, 0):
        return None
    return a / b


def dstr(v):
    """日期归一化：支持 datetime / Excel 序列号 int / 'YYYY-MM-DD hh:mm:ss' 字符串"""
    if isinstance(v, (datetime.datetime, datetime.date)):
        return str(v)[:10]
    if isinstance(v, (int, float)) and 40000 < v < 60000:
        return (datetime.date(1899, 12, 30) + datetime.timedelta(days=int(v))).isoformat()
    s = str(v).strip()
    if len(s) >= 8 and s[:4].isdigit() and s[4] == '-':
        return s[:10]
    return s[:10]


def apply_splits(sessions):
    """把 SPLIT_RULES 里指定的连播场次按权重拆成多条。

    只拆体量字段，比率字段不拆（由前端重算，比率天然不变）。
    余数补到最后一条，保证拆分前后总量严格相等。
    """
    out = []
    for s in sessions:
        rule = SPLIT_RULES.get((s['d'], s['sh']))
        if not rule:
            out.append(s)
            continue
        totals = {k: s.get(k) for k in SPLIT_VOL if s.get(k) is not None}
        acc = {k: 0.0 for k in totals}
        for i, (sh, an, w) in enumerate(rule):
            n = dict(s)
            n['sh'] = sh
            n['an'] = an
            last = (i == len(rule) - 1)
            for k, tot in totals.items():
                if last:
                    n[k] = round(tot - acc[k], 1)
                else:
                    n[k] = round(tot * w, 1)
                    acc[k] += n[k]
            n['sp'] = '连播·%d人·%.0f%%' % (len(rule), w * 100)
            out.append(n)
    return out


def load_schedule(path):
    """排班表 -> {(date, shift): anchor}"""
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.worksheets[0]
    mapping = {}
    for r in ws.iter_rows(min_row=3, values_only=True):
        if r[1] is None:
            continue
        d = dstr(r[1])
        for idx, shift in ((2, '早'), (3, '中'), (4, '晚')):
            if idx < len(r) and r[idx]:
                mapping[(d, shift)] = str(r[idx]).strip()
    return mapping


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=DEF_SRC)
    ap.add_argument('--sch', default=DEF_SCH)
    ap.add_argument('--out', default=os.path.join(HERE, 'data.json'))
    args = ap.parse_args()

    wb = openpyxl.load_workbook(args.src, data_only=True)
    sched = load_schedule(args.sch)
    sched_days = sorted({k[0] for k in sched})
    rhythm = load_rhythm(args.src)
    targets = load_targets(args.src)

    # ---------- 场次主表 ----------
    rows = list(wb['直播单场数据源'].iter_rows(min_row=2, values_only=True))
    sessions = []
    matched = unmatched_in_range = 0
    miss_rhythm = 0
    shift_hours = {}
    for r in rows:
        if not r[0]:
            continue
        d = dstr(r[0])
        shift = (str(r[5]).strip() if r[5] else '')
        anchor = sched.get((d, shift))
        if anchor:
            matched += 1
        elif sched_days and sched_days[0] <= d <= sched_days[-1] and shift != '数字人':
            unmatched_in_range += 1

        # 记录各班次真实开播时间分布
        if r[1]:
            hh = str(r[1])[:2]
            if hh.isdigit():
                shift_hours.setdefault(shift, []).append(int(hh))

        gmv, rf = f(r[6]), f(r[7])
        dur_min = f(r[11])
        net = (gmv - rf) if (gmv is not None and rf is not None) else None

        flag = ''
        if dur_min is not None and dur_min < 10:
            flag = 'short'
        elif dur_min is not None and dur_min > 720:
            flag = 'long'

        title = (str(r[2]).strip() if r[2] else '')[:36]
        rn, rt, mech = rhythm.get(d, (RHYTHM_EMPTY, RHYTHM_EMPTY, ''))
        if d not in rhythm:
            miss_rhythm += 1
        sessions.append({
            'd': d,
            'sh': shift,
            'an': anchor or '',
            't': title,
            'rn': rn,          # 官方活动节奏名（已归一）
            'rt': rt,          # 官方类型：活动 / 日销
            'mg': mech,        # 直播间机制（仅少量日期有值）
            'gmv': r0(gmv), 'rf': r0(rf), 'net': r0(net),
            'dur': round(dur_min, 1) if dur_min is not None else None,
            'uv': f(r[9]),
            'ep': f(r[15]), 'cp': f(r[17]),
            'gcp': f(r[19]), 'ac': f(r[20]), 'bp': f(r[22]),
            'fans': f(r[14]),
            'flag': flag,
            'sp': '',          # 连播拆分备注，非空表示该条由连播场次拆分而来
        })

    sessions.sort(key=lambda x: (x['d'], x['sh']))
    raw_count = len(sessions)

    # 连播场次拆分（见文件头 SPLIT_RULES）
    if SPLIT_RULES:
        sessions = apply_splits(sessions)

    # ---------- 店铺日级 ----------
    shop = {}
    for r in wb['退款率数据源'].iter_rows(min_row=2, values_only=True):
        if not r[0]:
            continue
        d = dstr(r[0])
        scene = str(r[3]).strip() if r[3] else ''
        pay, refund, refund_ord = f(r[5]), f(r[7]), f(r[6])
        rec = shop.setdefault(d, {'pay': None, 'onlyRefund': 0.0, 'allRefund': 0.0, 'refundOrd': 0.0, 'scenes': {}})
        rec['scenes'][scene] = refund or 0.0
        if scene == '全部':
            rec['pay'] = pay
            rec['allRefund'] = refund or 0.0
            rec['refundOrd'] = refund_ord or 0.0
        elif scene in ONLY_REFUND_SCENES:
            rec['onlyRefund'] += (refund or 0.0)

    shop_daily = []
    for d in sorted(shop):
        rec = shop[d]
        pay = rec['pay']
        ship = (pay - rec['onlyRefund']) if pay is not None else None
        shop_daily.append({
            'd': d,
            'pay': r0(pay),
            'onlyRefund': r0(rec['onlyRefund']),
            'allRefund': r0(rec['allRefund']),
            'ship': r0(ship),
            'scenes': {k: r0(v) for k, v in rec['scenes'].items() if v},
        })

    # ---------- 单品退款：商品维度 + 商品×日 ----------
    goods = {}
    for r in wb['退款数据源-单品'].iter_rows(min_row=2, values_only=True):
        if not r[2]:
            continue
        scene = str(r[5]).strip() if r[5] else ''
        if scene != '全部':
            continue
        pid = str(r[2]).strip()
        g = goods.setdefault(pid, {'name': (str(r[3]).strip() if r[3] else '')[:40],
                                   'pay': 0.0, 'refund': 0.0})
        g['pay'] += (f(r[7]) or 0.0)
        g['refund'] += (f(r[9]) or 0.0)

    match = {}
    for r in wb['商品匹配关系'].iter_rows(min_row=2, values_only=True):
        if not r[0]:
            continue
        match[str(r[0]).strip()] = {
            'cat': str(r[2]).strip() if r[2] else '',
            'prod': str(r[3]).strip() if r[3] else '',
        }

    # 商品索引：按累计支付降序，前端按索引引用
    order = sorted(goods.keys(), key=lambda k: -goods[k]['pay'])
    gidx = {pid: i for i, pid in enumerate(order)}
    goods_meta = []
    for pid in order:
        m = match.get(pid, {})
        goods_meta.append([pid, goods[pid]['name'], m.get('cat') or '未匹配', m.get('prod') or '未匹配'])

    gd = {}
    for r in wb['退款数据源-单品'].iter_rows(min_row=2, values_only=True):
        if not r[2]:
            continue
        if str(r[5]).strip() != '全部':
            continue
        pid = str(r[2]).strip()
        i = gidx.get(pid)
        if i is None:
            continue
        d = dstr(r[0])
        arr = gd.setdefault(d, [])
        pay = round(f(r[7]) or 0.0, 1)
        ref = round(f(r[9]) or 0.0, 1)
        if pay or ref:
            arr.extend([i, pay, ref])

    anchors = sorted({s['an'] for s in sessions if s['an']})
    with_anchor = [s for s in sessions if s['an']]

    # 节奏清单：按场次数降序，前端筛选器直接照此排序
    rhythm_counts = Counter(s['rn'] for s in sessions)
    rhythm_list = [k for k, _ in rhythm_counts.most_common()]

    # 目标：只统计「既有目标、又有实际场次」的日子，避免拿空白天凑达成率
    tgt_days = sorted(targets)
    day_gmv = {}
    for s in sessions:
        day_gmv[s['d']] = day_gmv.get(s['d'], 0.0) + (s['gmv'] or 0.0)
    tgt_cover = [d for d in tgt_days if d in day_gmv]
    tgt_sum = sum(sum(targets[d]) for d in tgt_days)
    tgt_cover_sum = sum(sum(targets[d]) for d in tgt_cover)
    tgt_cover_act = sum(day_gmv[d] for d in tgt_cover)

    meta = {
        'generated': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'src': os.path.basename(args.src),
        'sch': os.path.basename(args.sch),
        'sessions': len(sessions),
        'sessionsRaw': raw_count,
        'splitSessions': len(sessions) - raw_count,
        'dateFrom': sessions[0]['d'] if sessions else '',
        'dateTo': sessions[-1]['d'] if sessions else '',
        'anchorSessions': len(with_anchor),
        'anchorFrom': with_anchor[0]['d'] if with_anchor else '',
        'anchorTo': with_anchor[-1]['d'] if with_anchor else '',
        'anchorDays': len({s['d'] for s in with_anchor}),
        'anchorCount': len(anchors),
        'schedFrom': sched_days[0] if sched_days else '',
        'schedTo': sched_days[-1] if sched_days else '',
        'unmatchedInSchedRange': unmatched_in_range,
        'shopFrom': shop_daily[0]['d'] if shop_daily else '',
        'shopTo': shop_daily[-1]['d'] if shop_daily else '',
        'goodsCount': len(goods_meta),
        'shiftHours': {k: round(sum(v) / len(v), 1) for k, v in shift_hours.items()},
        'rhythms': rhythm_list,
        'rhythmCounts': dict(rhythm_counts),
        'rhythmFrom': '天猫活动节奏（官方表）',
        'rhythmDays': len(rhythm),
        'rhythmMiss': miss_rhythm,
        'rhythmMechDays': sum(1 for s in sessions if s['mg']),
        'typeCounts': dict(Counter(s['rt'] for s in sessions)),
        'shifts': ['数字人', '早', '中', '晚'],
        'targetFrom': tgt_days[0] if tgt_days else '',
        'targetTo': tgt_days[-1] if tgt_days else '',
        'targetDays': len(tgt_days),
        'targetCoverDays': len(tgt_cover),
        'targetSum': round(tgt_sum, 1),
        'targetCoverSum': round(tgt_cover_sum, 1),
        'targetCoverAct': round(tgt_cover_act, 1),
        'targetNote': '分日销售目标，按 数字人/早/中/晚 四班次拆分（源表「天猫排班及目标表」H~K 列）',
    }

    out = {
        'meta': meta,
        'anchors': anchors,
        'sessions': sessions,
        'shopDaily': shop_daily,
        'goodsMeta': goods_meta,
        'gd': gd,
        'targets': targets,
    }
    with open(args.out, 'w', encoding='utf-8') as fp:
        json.dump(out, fp, ensure_ascii=False, separators=(',', ':'))

    js_out = os.path.join(os.path.dirname(args.out), 'data.js')
    with open(js_out, 'w', encoding='utf-8') as fp:
        fp.write('window.__DATA__=')
        json.dump(out, fp, ensure_ascii=False, separators=(',', ':'))
        fp.write(';')

    size = os.path.getsize(args.out) / 1024
    print('=' * 54)
    print('场次总数        :', meta['sessions'], f"({meta['dateFrom']} ~ {meta['dateTo']})")
    print('有主播场次      :', meta['anchorSessions'], f"({meta['anchorFrom']} ~ {meta['anchorTo']}, {meta['anchorDays']}天)")
    print('主播人数        :', meta['anchorCount'], anchors if len(anchors) <= 12 else '')
    print('排班覆盖        :', f"{meta['schedFrom']} ~ {meta['schedTo']}，区间内未匹配 {meta['unmatchedInSchedRange']}")
    print('店铺日级        :', len(shop_daily), f"({meta['shopFrom']} ~ {meta['shopTo']})")
    print('商品数 / 商品日 :', meta['goodsCount'], '/', len(gd), '天')
    print('班次开播均值    :', meta['shiftHours'])
    print('活动节奏        : 日历', meta['rhythmDays'], '天 / 节奏名', len(rhythm_list),
          '个 / 未匹配场次', meta['rhythmMiss'])
    print('  活动/日销     :', meta['typeCounts'])
    print('  场次最多      :', '、'.join(f'{k}{v}' for k, v in rhythm_counts.most_common(8)))
    print('  有机制日期场次:', meta['rhythmMechDays'])
    print('销售目标        :', meta['targetDays'], '天', f"({meta['targetFrom']} ~ {meta['targetTo']})",
          '合计', f"{meta['targetSum']:,.0f}", '元')
    print('  有实际的天数  :', meta['targetCoverDays'], '天，目标', f"{meta['targetCoverSum']:,.0f}",
          '/ 实际', f"{meta['targetCoverAct']:,.0f}",
          f"（达成 {meta['targetCoverAct'] / meta['targetCoverSum'] * 100:.1f}%）" if meta['targetCoverSum'] else '')
    print('输出            :', args.out, f'{size:.0f} KB')
    print('=' * 54)


if __name__ == '__main__':
    main()
