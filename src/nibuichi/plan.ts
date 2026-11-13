// 안내 API (SPEC 6~8장). 파이썬 nibuichi/plan.py 의 복사본 — 함수 이름·결과 JSON 키를 파이썬과 똑같이 맞췄다.
//
// const plan = build_plan(tiers, target, options)  // 한 번 풀기 (느린 부분)
// plan.advise(balance, last_tier)                   // 지금 누를 판 + 이기면/지면 다음 갈림길 + 돈 값 (표 조회)
// plan.step(balance, tier, won)                     // 아무 판이나 누른 결과 반영
// plan.path_if_all_wins(balance) / plan.tree(balance, depth) / plan.money(balance) / plan.simulate(...)
// 순수 계산만 한다(DOM 없음) → Web Worker 에서 그대로 쓸 수 있다.
import { makeRng } from './rng.ts'
import { Table, TIE_TOL, can_press, floorDiv, pmod, unit_of } from './solver.ts'
import {
  InputError,
  Tier,
  any_on,
  check_near_tie_pp,
  clean_tiers,
  isInt,
  make_options,
  type Options,
  type OptionsInput,
  type TierDict,
  type Warning,
} from './tiers.ts'

export const MAX_TREE_DEPTH = 12
export const MAX_PATH_STEPS = 100_000

type Status = 'play' | 'reached' | 'no_move'

export interface Branch {
  balance: number
  status: Status
  reach_prob: number
  tier: TierDict | null
  near_tie_count: number
  prob?: number
}

export interface NearTie {
  tier: TierDict
  reach_prob: number
  gap: number
  gap_pp: number
}

export interface Money {
  method: 'exact' | 'coarse_estimate' | 'none' | 'simulation'
  mean_profit: number
  mean_left_on_fail: number | null
  mean_presses: number
  mean_final_balance?: number
  note?: string | null
  [k: string]: unknown
}

export interface Advice {
  balance: number
  target: number
  stop_loss: number
  spendable: number
  status: Status
  reach_prob: number
  reach_prob_is_lower_bound: true
  recommend: { tier: TierDict; reach_prob: number } | null
  if_win: Branch | null
  if_lose: Branch | null
  runner_up: { tier: TierDict; reach_prob: number; gap: number } | null
  near_tie_pp: number
  near_ties: NearTie[]
  last_tier: TierDict | null
  stay_ok: boolean
  stay_tier: TierDict | null
  stay_gap_pp: number | null
  options_ranked: { tier: TierDict; reach_prob: number }[]
  money: Money | null
  message?: string
}

export interface TreeNode extends Branch {
  arrive_prob: number
  path: string
  win: TreeNode | null
  lose: TreeNode | null
}

export type TierSpec = number | Tier | { id?: number; cost?: number; payout?: number }

function checkInt(name: string, v: unknown, code: string, minimum: number): asserts v is number {
  if (!isInt(v) || v < minimum) throw new InputError(code, `${name} 은(는) ${minimum} 이상 정수여야 합니다: ${String(v)}`)
}

// 손절선 아래 잔고용 자리표시: 도달 확률 0
const BELOW = { V: new Float64Array(1) }
type TB = Table | typeof BELOW

/** tiers: {cost, payout, prob?, sold_out?} 목록 또는 Tier 목록 */
export function build_plan(
  tiers: readonly unknown[],
  target: number,
  options?: OptionsInput | null,
  start_balance: number | null = null,
): Plan {
  const opt = make_options(options)
  checkInt('목표', target, 'E_TARGET', 1)
  if (opt.stop_loss >= target) {
    throw new InputError('E_STOP_LOSS', `손절선(${opt.stop_loss})은 목표(${target})보다 작아야 합니다`)
  }
  if (start_balance !== null && start_balance !== undefined && opt.stop_loss > 0 && opt.stop_loss >= start_balance) {
    throw new InputError('E_STOP_LOSS', `손절선(${opt.stop_loss})은 시작 잔고(${start_balance})보다 작아야 합니다`)
  }
  const cleaned = clean_tiers(tiers)
  const plan = new Plan(cleaned.tiers, target, opt, cleaned.warnings, cleaned.dominated)
  if (start_balance !== null && start_balance !== undefined) {
    checkInt('잔고', start_balance, 'E_START', 0)
    if (start_balance < target) plan.table(start_balance)
  } else {
    plan.table(0)
  }
  return plan
}

export class Plan {
  readonly tiers: Tier[]
  readonly target: number
  readonly opt: Options
  readonly warnings: Warning[]
  readonly dominated: Tier[]
  readonly F: number
  readonly u: number
  private readonly tables = new Map<number, Table>()

  constructor(tiers: Tier[], target: number, opt: Options, warnings: Warning[], dominated: Tier[] = []) {
    this.tiers = tiers
    this.target = target
    this.opt = opt
    this.warnings = warnings
    this.dominated = dominated
    // 손절선 F: '쓸 수 있는 돈' b-F 로 목표 T-F 를 푸는 것과 같다 (SPEC 4.5)
    this.F = opt.stop_loss
    this.u = unit_of(tiers, target - this.F)
  }

  // ---------------------------------------------------------------- 판 찾기 (SPEC 6.7)
  find_tier(spec: TierSpec | unknown): Tier {
    const allt = [...this.tiers, ...this.dominated]
    let s: unknown = spec
    if (s instanceof Tier) s = s.id >= 0 ? { id: s.id } : { cost: s.cost, payout: s.payout }
    if (isInt(s)) s = { id: s }
    if (typeof s !== 'object' || s === null || Array.isArray(s)) {
      throw new InputError('E_TIER', `판을 알 수 없습니다: ${JSON.stringify(spec)}`)
    }
    const o = s as Record<string, unknown>
    let hit: Tier[]
    if ('id' in o) hit = allt.filter((t) => t.id === o.id)
    else if ('cost' in o && 'payout' in o) hit = allt.filter((t) => t.cost === o.cost && t.payout === o.payout)
    else if ('cost' in o) {
      hit = this.tiers.filter((t) => t.cost === o.cost)
      if (!hit.length) hit = this.dominated.filter((t) => t.cost === o.cost)
    } else hit = []
    if (hit.length !== 1) {
      throw new InputError('E_TIER', `판을 하나로 정할 수 없습니다(${hit.length}개 일치): ${JSON.stringify(spec)}`)
    }
    return hit[0]
  }

  // ---------------------------------------------------------------- 표
  private key(balance: number): number {
    return any_on(this.opt) ? pmod(balance - this.F, this.u) : 0
  }

  table(balance: number): Table {
    const k = this.key(balance)
    let tb = this.tables.get(k)
    if (!tb) {
      tb = new Table(this.tiers, this.target - this.F, this.u, this.opt, k)
      this.tables.set(k, tb)
    }
    return tb
  }

  is_exact(balance = 0): boolean {
    return this.table(balance).U === this.u
  }

  meta(balance = 0) {
    const tb = this.table(balance)
    const reasons = ["배당은 '이상 획득'의 최소값으로 계산"]
    if (tb.U > this.u) reasons.push(`칸 수가 많아 계산 단위를 ${this.u}→${tb.U} pt 로 키움(거는 돈 올림·받는 돈 내림)`)
    return {
      target: this.target,
      stop_loss: this.F,
      spendable: Math.max(0, balance - this.F),
      unit: this.u,
      calc_unit: tb.U,
      states: tb.N,
      exact: tb.U === this.u,
      converged: tb.converged,
      iterations: tb.iters,
      lower_bound_reasons: reasons,
      options: { ...this.opt },
      tiers_used: this.tiers.map((t) => t.to_dict()),
      warnings: this.warnings,
    }
  }

  // ---------------------------------------------------------------- 기본 조회
  private status(balance: number): [Status, TB | null, number] {
    if (balance >= this.target) return ['reached', null, 0]
    if (balance < this.F) return ['no_move', BELOW, 0]
    const tb = this.table(balance)
    const m = tb.cell(balance - this.F)
    if (tb.pol[m] < 0) return ['no_move', tb, m]
    return ['play', tb, m]
  }

  reach_prob(balance: number): number {
    const [st, tb, m] = this.status(balance)
    return st === 'reached' ? 1.0 : tb!.V[m]
  }

  best_tier(balance: number): Tier | null {
    const [st, tb, m] = this.status(balance)
    if (st !== 'play') return null
    const t = tb as Table
    return t.ctiers[t.pol[m]].tier
  }

  private ranked(tb: Table, m: number): [number, number][] {
    const qv = tb.q_values(m)
    const bestQ = Math.max(...qv.map(([, v]) => v))
    const tied = qv.filter(([, v]) => v >= bestQ - TIE_TOL)
    const rest = qv.filter(([, v]) => v < bestQ - TIE_TOL).sort((a, b) => b[1] - a[1])
    const k1 = tb.pol[m]
    const all = [...tied, ...rest]
    return [...all.filter(([k]) => k === k1), ...all.filter(([k]) => k !== k1)]
  }

  private nearTies(tb: Table, m: number, ranked: [number, number][], pp: number): NearTie[] {
    if (pp <= 0) return []
    const v1 = tb.V[m]
    const out: NearTie[] = []
    for (const [k, v] of ranked.slice(1)) {
      const gap = Math.max(0.0, v1 - v)
      if (gap <= pp / 100 + 1e-12) out.push({ tier: tb.ctiers[k].tier.to_dict(), reach_prob: v, gap, gap_pp: gap * 100 })
    }
    out.sort((a, b) => a.gap - b.gap) // 안정 정렬
    return out
  }

  private brief(balance: number, pp: number | null = null): Branch {
    const [st, tb, m] = this.status(balance)
    const t = st === 'play' ? (tb as Table).ctiers[(tb as Table).pol[m]].tier : null
    let cnt = 0
    if (st === 'play') {
      const p = pp === null ? this.opt.near_tie_pp : pp
      cnt = this.nearTies(tb as Table, m, this.ranked(tb as Table, m), p).length
    }
    return {
      balance,
      status: st,
      reach_prob: st === 'reached' ? 1.0 : tb!.V[m],
      tier: t ? t.to_dict() : null,
      near_tie_count: cnt,
    }
  }

  // ---------------------------------------------------------------- 기능 1·2
  advise(balance: number, last_tier: TierSpec | null = null, with_money = true, near_tie_pp: number | null = null): Advice {
    checkInt('잔고', balance, 'E_START', 0)
    const pp = near_tie_pp === null || near_tie_pp === undefined ? this.opt.near_tie_pp : check_near_tie_pp(near_tie_pp)
    const lt = last_tier === null || last_tier === undefined ? null : this.find_tier(last_tier)
    const [st, tb, m] = this.status(balance)
    const out: Advice = {
      balance,
      target: this.target,
      stop_loss: this.F,
      spendable: Math.max(0, balance - this.F),
      status: st,
      reach_prob: st === 'reached' ? 1.0 : tb!.V[m],
      reach_prob_is_lower_bound: true,
      recommend: null,
      if_win: null,
      if_lose: null,
      runner_up: null,
      near_tie_pp: pp,
      near_ties: [],
      last_tier: lt ? lt.to_dict() : null,
      stay_ok: false,
      stay_tier: null,
      stay_gap_pp: null,
      options_ranked: [],
      money: null,
    }
    if (st === 'reached') {
      out.message = '이미 목표에 도달했습니다'
      out.money = { method: 'none', mean_profit: 0.0, mean_left_on_fail: null, mean_presses: 0.0 }
      return out
    }
    if (st === 'no_move') {
      out.message = '누를 수 있는 판이 없습니다(실패 상태)'
      out.money = { method: 'none', mean_profit: 0.0, mean_left_on_fail: balance, mean_presses: 0.0 }
      return out
    }
    const T = tb as Table
    const ranked = this.ranked(T, m)
    const t1 = T.ctiers[ranked[0][0]].tier
    out.recommend = { tier: t1.to_dict(), reach_prob: T.V[m] }
    out.if_win = { ...this.brief(balance - t1.cost + t1.payout, pp), prob: t1.q }
    out.if_lose = { ...this.brief(balance - t1.cost, pp), prob: 1 - t1.q }
    if (ranked.length > 1) {
      const [k2, v2] = ranked[1]
      out.runner_up = { tier: T.ctiers[k2].tier.to_dict(), reach_prob: v2, gap: T.V[m] - v2 }
    }
    out.near_ties = this.nearTies(T, m, ranked, pp)
    if (lt) this.applyStay(out, lt, T, m, ranked)
    out.options_ranked = ranked.map(([k, v]) => ({ tier: T.ctiers[k].tier.to_dict(), reach_prob: v }))
    if (with_money) out.money = this.moneyFromTable(balance, T, m)
    return out
  }

  private applyStay(out: Advice, lt: Tier, tb: Table, m: number, ranked: [number, number][]): void {
    const v1 = tb.V[m]
    const mine = ranked.filter(([k]) => tb.ctiers[k].tier.id === lt.id)
    if (mine.length) out.stay_gap_pp = Math.max(0.0, v1 - mine[0][1]) * 100
    let ok: boolean
    if (out.recommend!.tier.id === lt.id) ok = true
    else {
      const idx = out.near_ties.findIndex((d) => d.tier.id === lt.id)
      ok = idx >= 0
      if (ok) out.near_ties.unshift(...out.near_ties.splice(idx, 1))
    }
    out.stay_ok = ok
    out.stay_tier = ok ? lt.to_dict() : null
  }

  // ---------------------------------------------------------------- 누른 결과 반영 (SPEC 6.6)
  step(balance: number, tier: TierSpec, won: boolean, near_tie_pp: number | null = null) {
    checkInt('잔고', balance, 'E_START', 0)
    if (typeof won !== 'boolean') throw new InputError('E_WON', `won 은 참/거짓이어야 합니다: ${String(won)}`)
    const t = this.find_tier(tier)
    if (balance >= this.target) throw new InputError('E_NOT_PRESSABLE', '이미 목표에 도달한 잔고입니다')
    if (balance < t.cost) throw new InputError('E_NOT_PRESSABLE', `잔고 ${balance} 로는 ${t.label} 을(를) 누를 수 없습니다`)
    const nb = won ? balance - t.cost + t.payout : balance - t.cost
    return {
      balance_before: balance,
      pressed: t.to_dict(),
      won,
      balance: nb,
      change: nb - balance,
      outside_options: !can_press(balance - this.F, t.cost, this.opt),
      advice: this.advise(nb, t.id, true, near_tie_pp),
    }
  }

  // ---------------------------------------------------------------- 기능 3a: 연승 경로
  path_if_all_wins(balance: number) {
    checkInt('잔고', balance, 'E_START', 0)
    const steps: {
      step: number
      balance_before: number
      tier: TierDict
      reach_prob_before: number
      balance_after: number
    }[] = []
    let b = balance
    let prob = 1.0
    while (steps.length < MAX_PATH_STEPS) {
      const [st, tb, m] = this.status(b)
      if (st !== 'play') break
      const T = tb as Table
      const t = T.ctiers[T.pol[m]].tier
      const nb = b - t.cost + t.payout
      steps.push({ step: steps.length + 1, balance_before: b, tier: t.to_dict(), reach_prob_before: T.V[m], balance_after: nb })
      prob *= t.q
      b = nb
    }
    const end: Status = b >= this.target ? 'reached' : this.status(b)[0]
    return {
      start: balance,
      target: this.target,
      presses: steps.length,
      end_status: end,
      end_balance: b,
      prob_all_wins: steps.length ? prob : end === 'reached' ? 1.0 : 0.0,
      steps,
    }
  }

  // ---------------------------------------------------------------- 기능 3b: 갈림길 트리
  tree(balance: number, depth = 3, near_tie_pp: number | null = null): TreeNode {
    checkInt('잔고', balance, 'E_START', 0)
    if (!isInt(depth) || depth < 0 || depth > MAX_TREE_DEPTH) {
      throw new InputError('E_DEPTH', `depth 는 0~${MAX_TREE_DEPTH} 정수여야 합니다: ${String(depth)}`)
    }
    const pp = near_tie_pp === null || near_tie_pp === undefined ? this.opt.near_tie_pp : check_near_tie_pp(near_tie_pp)
    const node = (b: number, arrive: number, d: number, path: string): TreeNode => {
      const nd: TreeNode = { ...this.brief(b, pp), arrive_prob: arrive, path, win: null, lose: null }
      if (d < depth && nd.status === 'play') {
        const t = this.best_tier(b)!
        nd.win = node(b - t.cost + t.payout, arrive * t.q, d + 1, path + 'W')
        nd.lose = node(b - t.cost, arrive * (1 - t.q), d + 1, path + 'L')
      }
      return nd
    }
    return node(balance, 1.0, 0, '')
  }

  // ---------------------------------------------------------------- 돈 값 (SPEC 8장)
  private moneyFromTable(balance: number, tb: Table, m: number): Money {
    const sp = balance - this.F
    const offset = pmod(sp, this.u) - tb.r
    const base = m * tb.U + tb.r + offset
    const f = tb.f[m] + offset
    const pf = 1.0 - tb.pv[m]
    const left = pf > 1e-15 ? (tb.g[m] + offset * pf) / pf + this.F : null
    const exact = tb.U === this.u
    return {
      method: exact ? 'exact' : 'coarse_estimate',
      mean_profit: f - base,
      mean_left_on_fail: left,
      mean_presses: tb.n[m],
      mean_final_balance: f + (sp - base) + this.F,
      note: exact ? null : '큰 단위 표 기준 추정값. plan.money(balance) 로 실제 금액 시뮬레이션 가능',
    }
  }

  money(balance: number, n = 200_000, seed = 20261113): Money {
    checkInt('잔고', balance, 'E_START', 0)
    const [st, tb, m] = this.status(balance)
    if (st !== 'play') return this.advise(balance).money!
    const T = tb as Table
    if (T.U === this.u) return this.moneyFromTable(balance, T, m)
    return { ...this.simulate(balance, n, seed), method: 'simulation' } as Money
  }

  /** 정책 표(추천)를 따르며 '실제 금액'으로 n 회. 오차는 95%(±1.96σ/√n). 난수는 xoshiro128** (씨앗 고정). */
  simulate(balance: number, n = 200_000, seed = 20261113, max_steps = 1_000_000) {
    checkInt('잔고', balance, 'E_START', 0)
    const T = this.target
    if (balance >= T || balance < this.F) {
      return {
        n, reach: balance >= T ? 1.0 : 0.0, reach_err: 0.0, mean_profit: 0.0, mean_profit_err: 0.0,
        mean_left_on_fail: null as number | null, mean_left_on_fail_err: null as number | null,
        mean_presses: 0.0, mean_presses_err: 0.0, truncated: 0,
      }
    }
    const tb = this.table(balance)
    const cost = tb.ctiers.map((c) => c.tier.cost)
    const gain = tb.ctiers.map((c) => c.tier.gain)
    const qq = tb.ctiers.map((c) => c.tier.q)
    const rng = makeRng(seed)
    let ok = 0
    let sP = 0, sP2 = 0, sN = 0, sN2 = 0, sF = 0, sF2 = 0, nF = 0, trunc = 0
    const off = this.F + tb.r
    for (let i = 0; i < n; i++) {
      let b = balance
      let presses = 0
      let s = 0
      while (b < T) {
        if (s++ >= max_steps) {
          trunc++
          break
        }
        const k = tb.pol[floorDiv(b - off, tb.U)]
        if (k < 0) break
        b += rng() < qq[k] ? gain[k] : -cost[k]
        presses++
      }
      if (b >= T) ok++
      else {
        sF += b
        sF2 += b * b
        nF++
      }
      const p = b - balance
      sP += p
      sP2 += p * p
      sN += presses
      sN2 += presses * presses
    }
    const ci = (s1: number, s2: number, k: number): number | null =>
      k > 1 ? (1.96 * Math.sqrt(Math.max(0, (s2 - (s1 * s1) / k) / (k - 1)))) / Math.sqrt(k) : null
    const p = ok / n
    return {
      n, seed, reach: p, reach_err: 1.96 * Math.sqrt((p * (1 - p)) / n),
      mean_profit: sP / n, mean_profit_err: ci(sP, sP2, n),
      mean_left_on_fail: nF ? sF / nF : null, mean_left_on_fail_err: ci(sF, sF2, nF),
      mean_presses: sN / n, mean_presses_err: ci(sN, sN2, n), truncated: trunc,
    }
  }
}
