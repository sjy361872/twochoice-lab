import { computeDP, pickTier } from './dp'
import { pOf } from './parse'
import type { EngineOptions, Tier } from './types'

/**
 * '이 판만 계속 누르면' 목표에 닿을 확률.
 * - 목표까지 필요한 승수가 적으면(≤ 60판 규모) 이 판 하나만 있는 DP 로 정확히 계산한다.
 * - 판이 잔고에 비해 아주 작으면 DP 가 수렴에 오래 걸리므로, 같은 상황의 확산(브라운 운동) 근사를 쓴다:
 *   P ≈ (1 − e^{−2μS/σ²}) / (1 − e^{−2μT/σ²}),  μ = 한 판 평균 손익, σ² = 한 판 분산, 0 에서 파산.
 *   작은 판일수록 이 근사가 정확해진다(걸음이 잘수록 연속에 가깝다).
 */
export function reachIfOnly(t: Tier, balance: number, target: number, opt: EngineOptions): { reach: number | null; approx: boolean } {
  if (t.cost >= balance || (opt.capFrac < 1 && t.cost > balance * opt.capFrac + 1e-9)) return { reach: null, approx: false }
  const steps = Math.ceil(target / t.cost)
  if (steps <= 60) {
    const dp = computeDP([t], target, { ...opt, align: balance })
    return { reach: pickTier(dp, balance, target).V, approx: false }
  }
  const p = pOf(t, opt.p)
  const mu = p * t.profit - (1 - p) * t.cost
  const s2 = p * t.profit ** 2 + (1 - p) * t.cost ** 2 - mu ** 2
  // 경계 보정(overshoot): 이산 걸음은 목표를 평균 '이득/2' 만큼 넘어서 끝나고, 바닥은 '더 못 거는 잔고'
  //   (전재산 금지·상한 때문에 cost 또는 cost/capFrac) 아래로 평균 'cost/2' 만큼 내려가서 끝난다.
  //   이걸 빼면 목표가 한두 판 거리일 때 크게 틀린다(1000→1800, 10만→10.1만: 78% vs 실제 70%).
  const stuck = opt.capFrac < 1 ? t.cost / opt.capFrac : t.cost
  const lo = stuck - t.cost / 2
  const S = balance - lo, Tt = target + t.profit / 2 - lo
  if (S <= 0) return { reach: 0, approx: true }
  if (Math.abs(mu) < 1e-9) return { reach: S / Tt, approx: true }
  const k = (-2 * mu) / s2
  const num = -Math.expm1(k * S), den = -Math.expm1(k * Tt)
  let r = num / den
  if (!isFinite(r)) r = Math.exp(k * (S - Tt))   // k>0 이고 지수가 넘칠 때: ≈ e^{−k(T−S)}
  return { reach: Math.max(0, Math.min(1, r)), approx: true }
}
