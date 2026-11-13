/// <reference lib="webworker" />
// 계산 엔진을 Web Worker 에서 돌린다 (화면이 멈추지 않게). 엔진 파일이 아니라 '연결부'다.
//
// - 목표·판 목록·옵션(= key)이 바뀔 때만 build_plan (느린 부분, 큰 목표는 수백 ms~수 초).
// - 잔고 변경·이겼다/졌다는 캐시된 plan 으로 advise/step (표 조회라 1 ms 안팎).
// - 화면 쪽(useNibuichi)이 요청 번호로 오래된 응답을 버리고, 쌓인 요청은 여기서 마지막 것만 처리한다.
import { build_plan, type Plan } from './plan.ts'
import type { Advice, TreeNode } from './plan.ts'
import type { OptionsInput, TierDict } from './tiers.ts'

export interface EngineTierInput { cost: number; payout: number; prob: string }
/** 판을 금액·확률 표기로 가리킨다 (plan 을 다시 만들면 번호가 바뀌므로 번호 대신) */
export interface TierRef { cost: number; payout: number; prob: string }

export interface WorkerRequest {
  id: number
  key: string
  tiers: EngineTierInput[]
  target: number
  options: OptionsInput
  balance: number
  /** 직전에 누른 판 ('지금 판 그대로 OK' 판정용) */
  last: TierRef | null
  /** 있으면 step(before, tier, won) 으로 반영한 결과를 돌려준다 */
  step: { before: number; tier: TierRef; won: boolean } | null
}

/** 후보 판 하나를 눌렀을 때의 갈림길 (이기면/지면 → 잔고·다음 추천 판·도달 확률) */
export interface Fork {
  balance: number
  status: 'play' | 'reached' | 'no_move'
  reach_prob: number
  next: TierDict | null
  near_tie_count: number
}
export interface Candidate { tier: TierDict; reach_prob: number; win: Fork; lose: Fork }

export interface WorkerResponse {
  id: number
  key: string
  ok: boolean
  error?: string
  build_ms: number | null // 이번에 plan 을 새로 만들었으면 걸린 시간
  balance: number
  advice?: Advice
  candidates?: Candidate[] // [추천, 사실상 같음 …] 순서, 최대 4개
  path?: ReturnType<Plan['path_if_all_wins']>
  tree?: TreeNode
  meta?: { exact: boolean; unit: number; calc_unit: number; states: number }
  step_balance?: number
}

let plan: Plan | null = null
let planKey = ''
let pending: WorkerRequest | null = null

const findId = (p: Plan, r: TierRef | null): number | null => {
  if (!r) return null
  const t = [...p.tiers, ...p.dominated].find((x) => x.cost === r.cost && x.payout === r.payout && x.prob_text === r.prob)
  return t ? t.id : null
}

function fork(p: Plan, b: number): Fork {
  const a = p.advise(b, null, false)
  return { balance: b, status: a.status, reach_prob: a.reach_prob, next: a.recommend?.tier ?? null, near_tie_count: a.near_ties.length }
}

function handle(m: WorkerRequest): WorkerResponse {
  let build_ms: number | null = null
  if (!plan || planKey !== m.key) {
    plan = null
    const t0 = performance.now()
    plan = build_plan(m.tiers, m.target, m.options)
    planKey = m.key
    build_ms = performance.now() - t0
  }
  const p = plan
  let balance = m.balance
  let step_balance: number | undefined
  let advice: Advice
  const stepId = m.step ? findId(p, m.step.tier) : null
  if (m.step && stepId != null && m.step.before < p.target && m.step.before >= m.step.tier.cost) {
    const s = p.step(m.step.before, stepId, m.step.won)
    step_balance = s.balance
    balance = s.balance
    advice = s.advice
  } else {
    advice = p.advise(balance, findId(p, m.last))
  }
  const tb = p.meta(balance)
  const res: WorkerResponse = {
    id: m.id, key: m.key, ok: true, build_ms, balance, advice, step_balance,
    meta: { exact: tb.exact, unit: tb.unit, calc_unit: tb.calc_unit, states: tb.states },
  }
  if (advice.status === 'play' && advice.recommend) {
    const list = [advice.recommend, ...advice.near_ties.slice(0, 3)]
    res.candidates = list.map((c) => {
      const t = c.tier
      return { tier: t, reach_prob: c.reach_prob, win: fork(p, balance - t.cost + t.payout), lose: fork(p, balance - t.cost) }
    })
    res.path = p.path_if_all_wins(balance)
    res.tree = p.tree(balance, 3)
  }
  return res
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  // 계산 중에 쌓인 요청은 마지막 것만 처리한다 (중간 입력은 이미 낡았다)
  pending = e.data
  setTimeout(() => {
    const m = pending
    if (!m || m !== e.data) return
    pending = null
    let res: WorkerResponse
    try {
      res = handle(m)
    } catch (err) {
      plan = null
      planKey = ''
      res = { id: m.id, key: m.key, ok: false, error: (err as Error).message, build_ms: null, balance: m.balance }
    }
    self.postMessage(res)
  }, 0)
}
