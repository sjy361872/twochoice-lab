import type { DPResult, EngineOptions, Pick, Tier } from './types'

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
function gcd(a: number, b: number) {
  a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b))
  while (b) { const t = a % b; a = b; b = t }
  return a
}

const cache = new Map<string, DPResult>()

/**
 * V[i] = 잔고 i·u 에서 목표 T 에 '바닥나기 전에' 닿을 최대 확률 (흡수 마르코프 연쇄 위 동적계획법).
 * 클로브 연습용 계산기 v6 의 computeDP 를 옮겼다. 핵심 안전장치 세 가지:
 *  1) 보수적 반올림 — 거는 돈은 올림, 따는 돈은 내림. 격자가 성겨도 실제보다 유리해지지 않는다
 *     (예전 반올림은 300→540 을 256/256 공정 게임으로 만들어 표시 83% / 실제 1.5% 를 냈다).
 *  2) 한 판 상한(capFrac)과 전재산 금지(hardCap)를 행동집합 '안에서' 적용 — 그래야 화면 확률 = 실제 정책.
 *  3) 대칭 Gauss-Seidel — 방향을 번갈아 돌려 수렴을 빠르게.
 */
export function computeDP(tiers: Tier[], T: number, opt: EngineOptions, needW = false): DPResult {
  const cap = opt.cap ?? 8000
  const floor = Math.max(0, opt.floor ?? 0)
  const { p, capFrac, hardCap } = opt
  const key = tiers.map((t) => `${t.cost}/${t.payout}/${t.p ?? ''}`).join('|') +
    `#${p.toFixed(4)}#${Math.round(T)}#${needW ? 1 : 0}#${cap}#${Math.round(floor)}#${capFrac}#${hardCap ? 1 : 0}#${Math.round(opt.align ?? 0)}#${opt.stable ?? 0}`
  const hit = cache.get(key)
  if (hit) return hit
  if (!needW) {
    const hitW = cache.get(key.replace(`#${Math.round(T)}#0#`, `#${Math.round(T)}#1#`))
    if (hitW) return hitW
  }

  let u = 0
  for (const t of tiers) { u = gcd(u, t.cost); u = gcd(u, t.profit) }
  u = gcd(u, Math.round(T))
  if (opt.align && opt.align > 0) u = gcd(u, Math.round(opt.align))
  if (u < 1) u = 1
  let iT = Math.round(T / u)
  while (iT > cap) { u *= 2; iT = Math.ceil(T / u) }

  const ts = tiers.map((t) => ({
    c: Math.max(1, Math.ceil(t.cost / u - 1e-9)),
    g: Math.floor(t.profit / u + 1e-9),
    p: t.p != null ? t.p : p,
    ref: t,
  }))
  const minCostReal = tiers.reduce((a, t) => Math.min(a, t.cost), Infinity)
  const capReal = (bal: number) => (capFrac >= 1 ? Infinity : Math.max(bal * capFrac, minCostReal))
  const okBet = (costReal: number, balReal: number, oneShot: boolean) => hardCap
    ? costReal < balReal - 1e-9 && (capFrac >= 1 || costReal <= balReal * capFrac + 1e-9)
    : costReal <= capReal(balReal) || oneShot

  const maxG = Math.min(ts.reduce((a, t) => Math.max(a, t.g), 1), iT + 1)
  const N = iT + maxG
  const V = new Float64Array(N + 1)
  for (let i = iT; i <= N; i++) V[i] = 1
  const minC = ts.reduce((a, t) => Math.min(a, t.c), Infinity)
  const maxIt = Math.min(40000, Math.max(1200, Math.ceil(Math.pow(iT / Math.max(1, minC), 2) * 3) + 400))
  const allowed = (k: number, i: number) => {
    const t = ts[k]
    return !(t.c > i || t.ref.cost > i * u - floor || !okBet(t.ref.cost, i * u, i + t.g >= iT) || t.g < 1)
  }
  const relax = (i: number) => {
    let best = 0
    for (let k = 0; k < ts.length; k++) {
      if (!allowed(k, i)) continue
      const up = Math.min(i + ts[k].g, N)
      const val = ts[k].p * V[up] + (1 - ts[k].p) * V[i - ts[k].c]
      if (val > best) best = val
    }
    const d = best - V[i]
    V[i] = best
    return d
  }
  for (let it = 0; it < maxIt; it++) {
    let delta = 0
    if (it & 1) for (let i = iT - 1; i >= 1; i--) { const d = Math.abs(relax(i)); if (d > delta) delta = d }
    else for (let i = 1; i < iT; i++) { const d = Math.abs(relax(i)); if (d > delta) delta = d }
    if (delta < 1e-12) break
  }

  const bestM = tiers.reduce((a, t) => Math.max(a, (t.p ?? p) * t.m / p), 0)
  const res: DPResult = { u, N, iT, V, W: null, VP: null, ts, T, floor, p, bestM, capFrac, hardCap, stable: opt.stable ?? 0 }

  if (needW) {
    // 기대 잔고는 '화면이 실제로 추천하는 정책'(pickTier, 안정화 규칙 포함)으로 계산한다.
    //   예전엔 격자 위 argmax 정책으로 계산해서 실제 추천과 달랐고, 평균 손실이 5~10% 작게 나왔다(10/27 점검).
    const pol = new Int16Array(N + 1).fill(-1)
    for (let i = 1; i < iT; i++) {
      const t = pickTier(res, i * u, T).tier
      pol[i] = t ? ts.findIndex((x) => x.ref === t) : -1
    }
    // 같은 정책으로 기대 잔고(W)와 '추천대로 했을 때의 도달 확률'(VP)을 함께 구한다.
    //   V 는 '이번 판 이후 최적'이라 안정화 규칙의 작은 손해가 빠져 있었다 → 화면이 실제보다 0.2~1.2%p 높았다(10/27 점검).
    const W = new Float64Array(N + 1), VP = new Float64Array(N + 1)
    for (let i = 0; i <= N; i++) { W[i] = i * u; VP[i] = i >= iT ? 1 : 0 }
    for (let it = 0; it < 4000; it++) {
      let delta = 0
      const sweep = (i: number) => {
        const k = pol[i]; if (k < 0) return
        // 실제 금액으로 이동한 뒤 격자에 내림 — 걸음이 격자보다 작게 반올림되어 손실이 줄어드는 것을 막는다
        const up = Math.min(Math.floor((i * u + ts[k].ref.profit) / u + 1e-9), N)
        const dn = Math.max(0, Math.floor((i * u - ts[k].ref.cost) / u + 1e-9))
        const nw = ts[k].p * W[up] + (1 - ts[k].p) * W[dn]
        const nv = ts[k].p * VP[up] + (1 - ts[k].p) * VP[dn]
        const d = Math.max(Math.abs(nw - W[i]) / u, Math.abs(nv - VP[i])); if (d > delta) delta = d
        W[i] = nw; VP[i] = nv
      }
      if (it & 1) for (let i = iT - 1; i >= 1; i--) sweep(i)
      else for (let i = 1; i < iT; i++) sweep(i)
      if (delta < 1e-9) break
    }
    res.W = W
    res.VP = VP
  }

  if (cache.size > 120) cache.clear()
  cache.set(key, res)
  return res
}

/**
 * 이번 판 추천. 진짜 최적(argmax)을 기본으로 하되, 1위와 0.3%p 이내의 사실상 동점이면
 *  ① 한 번 이기면 목표인 가장 싼 티어 ② 없으면 가장 큰 티어(판수 최소) ③ 환원율 높은 쪽.
 * '동점권에서 싼 티어'는 금지 — 매 판 누적되면 실측 22.8%p 폭락했다.
 */
export function pickTier(dp: DPResult, bal: number, T: number): Pick {
  if (bal >= T) return { tier: null, V: 1, done: true }
  const gi = (x: number) => dp.V[clamp(Math.floor(x / dp.u + 1e-9), 0, dp.N)]   // 내림: 격자에 안 맞는 잔고를 올려서 낙관하지 않게
  const cf = dp.capFrac
  const capSoft = cf >= 1 ? Infinity : Math.max(bal * cf, dp.ts[0].ref.cost)
  const cands: { r: Tier; val: number; oneShot: boolean }[] = []
  let bv = -1
  for (const t of dp.ts) {
    const r = t.ref
    const bw = bal + r.profit
    if (r.cost > bal - dp.floor || (r.cost > capSoft && bw < T)) continue
    if (dp.hardCap && (r.cost >= bal || (cf < 1 && r.cost > bal * cf + 1e-9))) continue
    const pr = r.p != null ? r.p : dp.p
    const val = pr * (bw >= T ? 1 : gi(bw)) + (1 - pr) * gi(bal - r.cost)
    cands.push({ r, val, oneShot: bw >= T })
    if (val > bv) bv = val
  }
  if (!cands.length) return { tier: null, V: 0, done: false, margin: null }
  let bestC = cands[0]
  for (const c of cands) if (c.val > bestC.val) bestC = c
  if (!dp.stable) {   // 순수 최적: 도달 확률 1위 그대로 (11/13 검토 — 안정화 규칙이 0.17~0.45%p 깎고 있었다)
    let secondV = -1
    for (const c of cands) if (c !== bestC && c.val > secondV) secondV = c.val
    return { tier: bestC.r, V: bestC.val, done: false, margin: secondV >= 0 ? bestC.val - secondV : null }
  }
  const STABLE = dp.stable, FREE = Math.min(0.001, dp.stable)
  const rtp = (c: { r: Tier }) => (c.r.p != null ? c.r.p : dp.p) * c.r.m
  const band = cands.filter((c) => c.val >= bestC.val - STABLE)
  const ones = band.filter((c) => c.oneShot).sort((a, b) => a.r.cost - b.r.cost)
  const freeOneShot = cands.find((c) => c.oneShot && c.val >= bestC.val - FREE)
  const chosen = ones.length ? ones[0]
    : band.slice().sort((a, b) => (b.r.cost - a.r.cost) || (rtp(b) - rtp(a)))[0] || freeOneShot || bestC
  let secondV = -1
  for (const c of cands) if (c.r !== chosen.r && c.val > secondV) secondV = c.val
  return { tier: chosen.r, V: chosen.val, done: false, margin: secondV >= 0 ? bv - secondV : null }
}

/** 이 티어로 '이번 한 판'을 걸고 이후 최적으로 갈 때의 도달 확률. 판 비교 카드용. */
export function valueIfBet(dp: DPResult, bal: number, T: number, t: Tier): number | null {
  if (t.cost > bal - dp.floor) return null
  if (dp.hardCap && (t.cost >= bal || (dp.capFrac < 1 && t.cost > bal * dp.capFrac + 1e-9))) return null
  const gi = (x: number) => dp.V[clamp(Math.floor(x / dp.u + 1e-9), 0, dp.N)]   // 내림: 격자에 안 맞는 잔고를 올려서 낙관하지 않게
  const pr = t.p != null ? t.p : dp.p
  const bw = bal + t.profit
  return pr * (bw >= T ? 1 : gi(bw)) + (1 - pr) * gi(bal - t.cost)
}

/** 기대 최종 잔고. 환원율 < 100% 면 현재 잔고를 넘을 수 없으므로 잘라낸다(격자 반올림 방지). */
export function expectedFinal(dp: DPResult, bal: number): number {
  if (!dp.W) return bal
  const i = clamp(Math.floor(bal / dp.u + 1e-9), 0, dp.N)
  const v = bal + (dp.W[i] - i * dp.u)
  return dp.p * dp.bestM < 1 ? Math.min(v, bal) : v
}

/** 화면 추천을 그대로 따랐을 때의 도달 확률 (needW 로 만든 dp 에서). 없으면 '이번 판 이후 최적' 값. */
export function policyReach(dp: DPResult, bal: number, T: number): number {
  if (bal >= T) return 1
  if (!dp.VP) return pickTier(dp, bal, T).V
  return dp.VP[clamp(Math.floor(bal / dp.u + 1e-9), 0, dp.N)]
}

export function clearDPCache() { cache.clear() }
