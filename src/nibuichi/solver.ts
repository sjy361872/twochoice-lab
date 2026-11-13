// 풀기 (SPEC 5장): 잔고별 최대 도달 확률 표 + 정책 표 + 돈 계산 표.
// 파이썬 nibuichi/solver.py 의 복사본. 계산 순서(식의 순서)까지 똑같이 맞춰 결과 비트가 같도록 했다.
//
// 칸 m (0 ≤ m < N) ↔ 쓸 수 있는 돈 하한 m*U + r. 가치 반복은 0 에서 시작(항상 참값 이하 = 하한).
import { cmpRat, type Options, type Tier } from './tiers.ts'

export const TIE_TOL = 1e-9 // SPEC 6.2 동점 허용치
export const VI_TOL = 1e-13 // 가치 반복 멈춤 기준
export const MAX_ITERS = 200_000

export const floorDiv = (a: number, b: number): number => Math.floor(a / b)
export const ceilDiv = (a: number, b: number): number => -Math.floor(-a / b)
export const pmod = (a: number, b: number): number => ((a % b) + b) % b

export function gcd(a: number, b: number): number {
  a = Math.abs(a)
  b = Math.abs(b)
  while (b) [a, b] = [b, a % b]
  return a
}

export interface CTier {
  tier: Tier // 원래 판
  c2: number // 거는 돈(올림)
  w2: number // 받는 돈(내림)
  c2u: number // c2 / U
  gu: number // (w2 - c2) / U
  m0: number // 이 칸부터 누를 수 있음 (N 이면 못 누름)
}

/** 동점일 때 앞서는 순서: 싼 판 → 확률 높은 판 → 배당 큰 판 → 입력 순서 */
export function prefCompare(a: Tier, b: Tier): number {
  return a.cost - b.cost || -cmpRat(a.prob, b.prob) || b.payout - a.payout || a.id - b.id
}

/** SPEC 4.3: 이 판을 누를 수 있는 최소 (쓸 수 있는) 잔고 */
export function min_balance_to_press(cost: number, opt: Options): number {
  let b = cost
  if (!opt.allow_all_in) b = Math.max(b, cost + 1)
  if (opt.max_bet_percent !== null) b = Math.max(b, ceilDiv(100 * cost, opt.max_bet_percent))
  return b
}

export function can_press(balance: number, cost: number, opt: Options): boolean {
  return balance >= min_balance_to_press(cost, opt)
}

/** SPEC 5.3: 칸 수 ceil(T/u) 가 N_max 를 넘으면 단위를 u 의 배수로 키운다 */
export function calc_unit(u: number, target: number, max_states: number): number {
  const n_u = ceilDiv(target, u)
  if (n_u <= max_states) return u
  return u * ceilDiv(n_u, max_states)
}

export function unit_of(tiers: readonly Tier[], target: number): number {
  let g = target
  for (const t of tiers) g = gcd(gcd(g, t.cost), t.payout)
  return g
}

export class Table {
  readonly target: number
  readonly u: number
  readonly r: number
  readonly opt: Options
  readonly U: number
  readonly N: number
  readonly ctiers: CTier[]
  readonly G: number
  V!: Float64Array // 길이 N+G+1, N 이상은 1
  pol!: Int32Array
  f!: Float64Array // 기대 최종 (쓸 수 있는) 잔고
  g!: Float64Array // E[최종 잔고 · 실패]
  n!: Float64Array // 기대 판 수
  pv!: Float64Array // 정책의 도달 확률
  converged = false
  iters = 0
  money_converged = false

  constructor(tiers: readonly Tier[], target: number, u: number, opt: Options, r: number) {
    this.target = target
    this.u = u
    this.r = r
    this.opt = opt
    this.U = calc_unit(u, target, opt.max_states)
    this.N = ceilDiv(target - r, this.U)
    this.ctiers = this.makeCtiers(tiers)
    this.G = this.ctiers.reduce((a, ct) => Math.max(a, ct.gu), 0)
    this.valueIteration()
    this.extractPolicy()
    this.moneyTables()
  }

  private makeCtiers(tiers: readonly Tier[]): CTier[] {
    const { U, N, r } = this
    const out: CTier[] = []
    for (const t of [...tiers].sort(prefCompare)) {
      const c2 = ceilDiv(t.cost, U) * U
      const w2 = floorDiv(t.payout, U) * U
      if (w2 <= c2) continue
      if (out.some((o) => o.c2 === c2 && cmpRat(o.tier.prob, t.prob) >= 0 && o.w2 >= w2)) continue
      const bmin = min_balance_to_press(c2, this.opt)
      const m0 = Math.min(N, Math.max(0, ceilDiv(bmin - r, U)))
      out.push({ tier: t, c2, w2, c2u: c2 / U, gu: (w2 - c2) / U, m0 })
    }
    return out
  }

  private valueIteration(start = 0): void {
    const N = this.N
    const V = new Float64Array(N + this.G + 1)
    V.fill(start, 0, N)
    V.fill(1, N)
    const best = new Float64Array(N)
    const live = this.ctiers.filter((ct) => ct.m0 < N)
    this.converged = false
    this.iters = 0
    for (let it = 1; it <= MAX_ITERS; it++) {
      best.fill(0)
      for (const ct of live) {
        const q = ct.tier.q
        const q1 = 1.0 - q
        const gu = ct.gu
        const cu = ct.c2u
        for (let m = ct.m0; m < N; m++) {
          const v = q * V[m + gu] + q1 * V[m - cu]
          if (v > best[m]) best[m] = v
        }
      }
      let diff = 0
      for (let m = 0; m < N; m++) {
        const d = Math.abs(best[m] - V[m])
        if (d > diff) diff = d
        V[m] = best[m]
      }
      this.iters = it
      if (diff < VI_TOL) {
        this.converged = true
        break
      }
    }
    this.V = V
  }

  /** 검증용: 시작값 1 에서 가치 반복 */
  value_iteration_from_above(): Float64Array {
    const saved = [this.V, this.converged, this.iters] as const
    this.valueIteration(1)
    const upper = this.V.slice(0, this.N)
    ;[this.V, this.converged, this.iters] = saved
    return upper
  }

  private qAt(ct: CTier, m: number): number {
    const q = ct.tier.q
    return q * this.V[m + ct.gu] + (1.0 - q) * this.V[m - ct.c2u]
  }

  private extractPolicy(): void {
    const N = this.N
    const Qmax = new Float64Array(N).fill(-1)
    this.ctiers.forEach((ct) => {
      for (let m = ct.m0; m < N; m++) {
        const v = this.qAt(ct, m)
        if (v > Qmax[m]) Qmax[m] = v
      }
    })
    const pol = new Int32Array(N).fill(-1)
    this.ctiers.forEach((ct, k) => {
      for (let m = ct.m0; m < N; m++) {
        if (pol[m] === -1 && this.qAt(ct, m) >= Qmax[m] - TIE_TOL) pol[m] = k
      }
    })
    this.pol = pol
  }

  /** 칸 m 에서 누를 수 있는 판별 Q [계산 판 번호, 확률] — 우선순위 순서 */
  q_values(m: number): [number, number][] {
    const out: [number, number][] = []
    this.ctiers.forEach((ct, k) => {
      if (m >= ct.m0) out.push([k, this.qAt(ct, m)])
    })
    return out
  }

  private moneyTables(): void {
    const { N, U, r, G } = this
    const L = N + G + 1
    const act: number[] = []
    for (let m = 0; m < N; m++) if (this.pol[m] >= 0) act.push(m)
    const A = act.length
    const iw = new Int32Array(A)
    const il = new Int32Array(A)
    const qa = new Float64Array(A)
    act.forEach((m, i) => {
      const ct = this.ctiers[this.pol[m]]
      iw[i] = m + ct.gu
      il[i] = m - ct.c2u
      qa[i] = ct.tier.q
    })
    const f = new Float64Array(L)
    const g = new Float64Array(L)
    const n = new Float64Array(L)
    const pv = new Float64Array(L)
    for (let i = N; i < L; i++) {
      f[i] = i * U + r
      pv[i] = 1
    }
    for (let m = 0; m < N; m++) {
      if (this.pol[m] < 0) {
        f[m] = m * U + r
        g[m] = m * U + r
      }
    }
    const nf = new Float64Array(A)
    const ng = new Float64Array(A)
    const nn = new Float64Array(A)
    const npv = new Float64Array(A)
    const T = this.target
    const tol = 1e-12 * Math.max(1.0, T)
    this.money_converged = false
    for (let it = 0; it < MAX_ITERS; it++) {
      let df = 0
      let dg = 0
      let dn = 0
      let dp = 0
      for (let i = 0; i < A; i++) {
        const q = qa[i]
        const q1 = 1 - q
        const a = iw[i]
        const b = il[i]
        nf[i] = q * f[a] + q1 * f[b]
        ng[i] = q * g[a] + q1 * g[b]
        nn[i] = 1.0 + q * n[a] + q1 * n[b]
        npv[i] = q * pv[a] + q1 * pv[b]
      }
      for (let i = 0; i < A; i++) {
        const m = act[i]
        df = Math.max(df, Math.abs(nf[i] - f[m]))
        dg = Math.max(dg, Math.abs(ng[i] - g[m]))
        dn = Math.max(dn, Math.abs(nn[i] - n[m]))
        dp = Math.max(dp, Math.abs(npv[i] - pv[m]))
        f[m] = nf[i]
        g[m] = ng[i]
        n[m] = nn[i]
        pv[m] = npv[i]
      }
      const d = A ? Math.max(df, dg, dn * T, dp * T) : 0
      if (d < tol) {
        this.money_converged = true
        break
      }
    }
    this.f = f.slice(0, N)
    this.g = g.slice(0, N)
    this.n = n.slice(0, N)
    this.pv = pv.slice(0, N)
  }

  /** 쓸 수 있는 돈 → 칸 번호 (내림) */
  cell(spendable: number): number {
    return floorDiv(spendable - this.r, this.U)
  }
}
