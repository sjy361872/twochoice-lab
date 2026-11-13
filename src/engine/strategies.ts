import { computeDP, pickTier } from './dp'
import { rtpOf } from './parse'
import type { EngineOptions, Tier } from './types'

export type StrategyId = 'optimal' | 'fixed' | 'martingale' | 'paroli' | 'dalembert' | 'kelly'

export const STRATEGIES: { id: StrategyId; name: string; short: string }[] = [
  { id: 'optimal', name: '최적 (추천대로)', short: '목표 도달 확률이 가장 높은 판을 매번 고른다' },
  { id: 'fixed', name: '고정 금액', short: '정한 판만 계속 누른다' },
  { id: 'martingale', name: '마틴게일', short: '지면 그동안 잃은 걸 한 번에 메우는 판으로 키운다' },
  { id: 'paroli', name: '역마틴게일 (파롤리)', short: '이기면 한 단계 키우고, 지면 처음 판으로' },
  { id: 'dalembert', name: '달랑베르', short: '지면 한 단계 위, 이기면 한 단계 아래' },
  { id: 'kelly', name: '켈리', short: '기대값이 플러스일 때만 비율만큼 건다' },
]

/** 판을 걸 수 있나 — 잔고 이하·한 판 상한·전재산 금지. 모든 기법이 같은 규칙을 쓴다. */
export function canBet(t: Tier, bal: number, opt: EngineOptions) {
  if (t.cost > bal - (opt.floor ?? 0)) return false
  if (opt.hardCap && t.cost >= bal) return false
  if (opt.capFrac < 1 && t.cost > bal * opt.capFrac + 1e-9) return false
  return true
}

export interface StratState { lossAcc: number; level: number; streak: number }

export type Chooser = (bal: number, st: StratState) => Tier | null

/** 기법별 '다음 판 고르기' 함수를 만든다. base 는 고정/마틴/파롤리/달랑베르의 시작 판. */
export function makeChooser(id: StrategyId, tiers: Tier[], T: number, opt: EngineOptions, base: Tier): Chooser {
  const ladder = tiers.slice().sort((a, b) => a.cost - b.cost)
  const baseIdx = Math.max(0, ladder.findIndex((t) => t.cost === base.cost && t.payout === base.payout))
  const ok = (t: Tier | undefined, bal: number) => (t && canBet(t, bal, opt) ? t : null)
  const fallDown = (i: number, bal: number) => { for (let k = Math.min(i, ladder.length - 1); k >= 0; k--) if (canBet(ladder[k], bal, opt)) return ladder[k]; return null }
  switch (id) {
    case 'optimal': {
      const dp = computeDP(tiers, T, opt)
      return (bal) => pickTier(dp, bal, T).tier
    }
    case 'fixed':
      return (bal) => ok(ladder[baseIdx], bal)
    case 'martingale':
      // 누적 손실 + 기본 이득을 한 번에 메울 수 있는 가장 싼 판. 그런 판이 없으면 '복구 불가' → 손실 확정 후 처음 판부터.
      return (bal, st) => {
        if (st.lossAcc <= 0) return ok(ladder[baseIdx], bal)
        const need = st.lossAcc + ladder[baseIdx].profit
        const t = ladder.find((x) => x.profit >= need && canBet(x, bal, opt))
        if (t) return t
        st.lossAcc = 0
        return ok(ladder[baseIdx], bal)
      }
    case 'paroli':
      // 연승마다 한 단계 위(최대 3연승 후 리셋), 지면 처음 판.
      return (bal, st) => fallDown(baseIdx + Math.min(st.streak, 3), bal)
    case 'dalembert':
      return (bal, st) => fallDown(baseIdx + st.level, bal)
    case 'kelly': {
      // 켈리 비율 f* = (p·m − 1)/(m − 1). 환원율 100% 미만이면 음수 → 걸지 않는다.
      const best = ladder.reduce((a, t) => (rtpOf(t, opt.p) > rtpOf(a, opt.p) ? t : a), ladder[0])
      if (rtpOf(best, opt.p) <= 1) return () => null
      return (bal) => {
        const pr = best.p ?? opt.p
        const f = (pr * best.m - 1) / (best.m - 1)
        const want = bal * f
        let pick: Tier | null = null
        for (const t of ladder) if (t.cost <= want && canBet(t, bal, opt)) pick = t
        return pick
      }
    }
  }
}

/** 판 결과를 상태에 반영 */
export function updateState(st: StratState, t: Tier, win: boolean) {
  if (win) { st.lossAcc = 0; st.streak = st.streak >= 3 ? 0 : st.streak + 1; st.level = Math.max(0, st.level - 1) }
  else { st.lossAcc += t.cost; st.streak = 0; st.level += 1 }
}

/** 환원율 100% 미만인가 — 켈리가 '걸지 않음'을 띄울지 판단 */
export const allNegative = (tiers: Tier[], p: number) => tiers.every((t) => rtpOf(t, p) < 1)
