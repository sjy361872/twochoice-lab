# 독립 검증: 엔진 코드를 하나도 쓰지 않고 처음부터 다시 구현
#  (1) 최적 도달 확률: 1pt 단위 격자 위 가치 반복 (반올림 없음)
#  (2) 그 최적 정책으로 몬테카를로 → (1) 과 맞는지
#  (3) 상한: 환원율<100% 게임에서 '도달 확률 ≤ 시작잔고 / 목표' (기대 잔고가 줄어드니까)
import json, sys, numpy as np
d = json.load(open(sys.argv[1], encoding='utf-8'))
tiers = [(c, y - c, p) for c, y, p in d['tiers']]   # (건 돈, 이기면 순이익, 승률)
CAP = 0.5
def solve(S, T):
    N = T + max(g for _, g, _ in tiers) + 1
    i = np.arange(N, dtype=np.int64)
    V = (i >= T).astype(float)
    for it in range(200000):
        best = np.zeros(N)
        for c, g, p in tiers:
            ok = (c < i) & (c <= i * CAP + 1e-9) & (i < T)   # 전재산 금지 + 잔고의 50% 이하
            up = np.minimum(i + g, N - 1); dn = np.maximum(i - c, 0)
            val = np.where(ok, p * V[up] + (1 - p) * V[dn], 0)
            best = np.maximum(best, val)
        new = np.where(i >= T, 1.0, best)
        dlt = np.abs(new - V).max(); V = new
        if dlt < 1e-11: break
    return V, it
def policy(V, b, T):
    best, bt = -1, None
    for c, g, p in tiers:
        if c < b and c <= b * CAP + 1e-9:
            v = p * (1.0 if b + g >= T else V[min(b + g, len(V) - 1)]) + (1 - p) * V[b - c]
            if v > best + 1e-12: best, bt = v, (c, g, p)
    return bt
rng = np.random.default_rng(1)
for case in d['cases']:
    S, T = case['S'], case['T']
    V, its = solve(S, T)
    runs, hit, fin = 20000, 0, []
    pol = {}
    for _ in range(runs):
        b = S
        while b < T:
            t = pol.get(b) or pol.setdefault(b, policy(V, b, T))
            if t is None: break
            c, g, p = t
            b = b + g if rng.random() < p else b - c
        hit += b >= T; fin.append(b)
    se = (hit/runs*(1-hit/runs)/runs) ** .5
    print(f"{S:>6}→{T:<6} 독립DP {V[S]*100:5.1f}% | 독립MC {hit/runs*100:5.1f}% (±{2*se*100:.1f}) | 사이트 표시 {case['shown']*100:5.1f}% | "
          f"사이트 시뮬 {case['strat'][0]['reach']*100:5.1f}% | 상한 S/T {S/T*100:5.1f}% | 평균손익 독립 {np.mean(fin)-S:8.0f} · 사이트 {case['ev']:8.0f}")
