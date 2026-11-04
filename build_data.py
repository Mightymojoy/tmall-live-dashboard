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
DEF_SRC = r'C:\Users\QwQ\Desktop\直播字段.xlsx'
DEF_SCH = r'C:\Users\QwQ\Desktop\10-11月天猫排班表.xlsx'

ONLY_REFUND_SCENES = ('未发货仅退款', '已收到货仅退款', '在途仅退款')

# ---------------------------------------------------------------
# 场次类型（活动场次）判定
# 天猫后台无「活动」字段，只能从「场次信息」标题反推。
# 实测 25 种标题，按关键词归为三档；顺序为先判大促、再判上新。
# 若要调整口径，改这两个元组即可，重跑管线生效。
# ---------------------------------------------------------------
PROMO_KW = ('双十一', '双11', '双十二', '双12', '3.8', '38焕新', '焕新周',
            '五一', '狂欢', '预售', '开运', '快闪')
NEW_KW = ('首发', '新品', '上新', '上市', '新色', '箱会')
EVENT_TYPES = ('大促', '上新', '常规')


def classify_event(title):
    t = title or ''
    for k in PROMO_KW:
        if k in t:
            return '大促'
    for k in NEW_KW:
        if k in t:
            return '上新'
    return '常规'


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

    # ---------- 场次主表 ----------
    rows = list(wb['直播单场数据源'].iter_rows(min_row=2, values_only=True))
    sessions = []
    matched = unmatched_in_range = 0
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
        sessions.append({
            'd': d,
            'sh': shift,
            'an': anchor or '',
            't': title,
            'pt': classify_event(title),
            'gmv': r0(gmv), 'rf': r0(rf), 'net': r0(net),
            'dur': round(dur_min, 1) if dur_min is not None else None,
            'uv': f(r[9]),
            'ep': f(r[15]), 'cp': f(r[17]),
            'gcp': f(r[19]), 'ac': f(r[20]), 'bp': f(r[22]),
            'fans': f(r[14]),
            'flag': flag,
        })

    sessions.sort(key=lambda x: (x['d'], x['sh']))

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

    meta = {
        'generated': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
        'src': os.path.basename(args.src),
        'sch': os.path.basename(args.sch),
        'sessions': len(sessions),
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
        'eventCounts': dict(Counter(s['pt'] for s in sessions)),
        'eventCountsAnchor': dict(Counter(s['pt'] for s in with_anchor)),
        'eventFrom': '场次信息标题关键词',
    }

    out = {
        'meta': meta,
        'anchors': anchors,
        'sessions': sessions,
        'shopDaily': shop_daily,
        'goodsMeta': goods_meta,
        'gd': gd,
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
    print('输出            :', args.out, f'{size:.0f} KB')
    print('=' * 54)


if __name__ == '__main__':
    main()
