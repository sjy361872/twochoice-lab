/// <reference lib="webworker" />
import { computeDP, expectedFinal, pickTier, policyReach } from './dp'
import { reachIfOnly } from './single'
import { simulate, type SimResult } from './simulate'
import { STRATEGIES, type StrategyId } from './strategies'
import type { EngineOptions, Tier } from './types'

export interface CalcRequest {
  kind: 'calc'
  id: number
  tiers: Tier[]
  balance: number
  target: number
  opt: EngineOptions
}
export interface CalcResponse {
  kind: 'calc'
  id: number
  best: { tier: Tier | null; reach: number; done: boolean }
  perTier: { tier: Tier; reach: number | null; approx: boolean }[]
  expected: number
}
export interface SimRequest {
  kind: 'sim'
  id: number
  tiers: Tier[]
  balance: number
  target: number
  opt: EngineOptions
  base: Tier
  roundLimit: number
  runs: number
}
export interface SimResponse { kind: 'sim'; id: number; results: SimResult[] }

self.onmessage = (e: MessageEvent<CalcRequest | SimRequest>) => {
  const m = e.data
  if (m.kind === 'calc') {
    const dp = computeDP(m.tiers, m.target, { ...m.opt, align: m.balance }, true)
    const pk = pickTier(dp, m.balance, m.target)
    const res: CalcResponse = {
      kind: 'calc', id: m.id,
      best: { tier: pk.tier, reach: policyReach(dp, m.balance, m.target), done: pk.done },
      perTier: m.tiers.map((t) => ({ tier: t, ...reachIfOnly(t, m.balance, m.target, m.opt) })),
      expected: expectedFinal(dp, m.balance),
    }
    self.postMessage(res)
  } else {
    const results = STRATEGIES.map((s) =>
      simulate(m.tiers, m.balance, m.target, m.opt, s.id as StrategyId, m.base, m.runs,
        m.roundLimit > 0 ? m.roundLimit : Infinity))
    const res: SimResponse = { kind: 'sim', id: m.id, results }
    self.postMessage(res)
  }
}
