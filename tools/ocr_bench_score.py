import json, re, sys
d = sys.argv[1]
truth = json.load(open(d + '/truth.json', encoding='utf-8'))
eng = {'tess': json.load(open(d + '/tess.json', encoding='utf-8')), 'paddle': json.load(open(d + '/paddle_app.json', encoding='utf-8'))}
norm = lambda s: re.sub(r'\s+', '', s or '')


def lev(a, b):
    if len(a) < len(b): a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


rows = []
for name, t in sorted(truth.items()):
    T = norm(t['text'])
    nums = [norm(x) for x in re.findall(r'\d[\d,.\-%]*\d%?', t['text']) if len(re.sub(r'\D', '', x)) >= 4]
    r = {'name': name, 'doc': t['doc'], 'cond': t['cond']}
    for e, res in eng.items():
        P = norm(res[name]['text'])
        acc = max(0.0, 1 - lev(P, T) / len(T))
        f_hit = sum(1 for f in t['fields'] if norm(f) in P)
        n_hit = sum(1 for n in nums if n in P)
        r[e] = {'acc': acc, 'f': f_hit, 'fn': len(t['fields']), 'n': n_hit, 'nn': len(nums), 'ms': res[name]['ms'], 'fail': acc < 0.5}
    rows.append(r)


def agg(sel, e):
    s = [r[e] for r in sel]
    return {'acc': round(100 * sum(x['acc'] for x in s) / len(s), 1), 'field': round(100 * sum(x['f'] for x in s) / sum(x['fn'] for x in s), 1),
            'num': round(100 * sum(x['n'] for x in s) / max(1, sum(x['nn'] for x in s)), 1), 'fail': sum(x['fail'] for x in s), 'cnt': len(s),
            'ms': int(sum(x['ms'] for x in s) / len(s)), 'perfect': sum(1 for x in s if x['f'] == x['fn'])}


out = {'all': {e: agg(rows, e) for e in eng}}
for c in ['clean', 'photo', 'lowres', 'fax', 'small']:
    out['cond:' + c] = {e: agg([r for r in rows if r['cond'] == c], e) for e in eng}
for dkey in sorted({r['doc'] for r in rows}):
    out['doc:' + dkey] = {e: agg([r for r in rows if r['doc'] == dkey], e) for e in eng}
out['rows'] = [{'name': r['name'], 'tess': [round(100 * r['tess']['acc']), r['tess']['f'], r['tess']['fn']], 'paddle': [round(100 * r['paddle']['acc']), r['paddle']['f'], r['paddle']['fn']]} for r in rows]
json.dump(out, open(d + '/score.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for k, v in out.items():
    if k == 'rows': continue
    print(f"{k:14s} T acc {v['tess']['acc']:5} fld {v['tess']['field']:5} num {v['tess']['num']:5} fail {v['tess']['fail']} perf {v['tess']['perfect']}/{v['tess']['cnt']} {v['tess']['ms']}ms | P acc {v['paddle']['acc']:5} fld {v['paddle']['field']:5} num {v['paddle']['num']:5} fail {v['paddle']['fail']} perf {v['paddle']['perfect']}/{v['paddle']['cnt']} {v['paddle']['ms']}ms")
