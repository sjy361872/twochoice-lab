// TS 엔진에서 직접 확인하는 수학 성질 (골든과 별개).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { build_plan, type TreeNode } from '../../src/nibuichi/index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf-8'))
const REAL: unknown[] = golden.cases.find((c: { name: string }) => c.name === '실제 20종 10000→12000').tiers

function ruin(p: number, i: number, n: number): number {
  if (Math.abs(p - 0.5) < 1e-15) return i / n
  const r = (1 - p) / p
  return (1 - r ** i) / (1 - r ** n)
}

describe('수학 성질', () => {
  it('판 1개 = 도박사의 파산 공식', () => {
    for (const [prob, p] of [['0.3', 0.3], ['1/2', 0.5], ['1/1.9', 1 / 1.9], ['0.6', 0.6]] as const) {
      for (const c of [1, 7, 100]) {
        const n = 13
        const plan = build_plan([{ cost: c, payout: 2 * c, prob }], n * c)
        for (let i = 0; i < n; i++) {
          expect(Math.abs(plan.reach_prob(i * c) - ruin(p, i, n))).toBeLessThan(1e-9)
          if (c > 1 && i > 0) expect(Math.abs(plan.reach_prob(i * c + c - 1) - ruin(p, i, n))).toBeLessThan(1e-9)
        }
      }
    }
  })

  it('공정 게임 여러 판 = S/T', () => {
    const plan = build_plan([100, 200, 300].map((c) => ({ cost: c, payout: 2 * c })), 1000)
    for (let s = 0; s < 1000; s += 100) expect(Math.abs(plan.reach_prob(s) - s / 1000)).toBeLessThan(1e-9)
  })

  it('불리한 실제 판: 확률 ≤ S/T, 잔고에 대해 단조 증가', () => {
    for (const opt of [{}, { allow_all_in: false }, { max_bet_percent: 30 }, { stop_loss: 2000 }]) {
      const plan = build_plan(REAL, 12000, opt)
      let prev = 0
      for (let b = 0; b < 12000; b += 7) {
        const v = plan.reach_prob(b)
        expect(v).toBeGreaterThanOrEqual(prev - 1e-12)
        if (!('stop_loss' in opt)) expect(v).toBeLessThanOrEqual(b / 12000 + 1e-12)
        prev = v
      }
    }
  })

  it('큰 단위 값 ≤ 정확값 (하한)', () => {
    const exact = build_plan(REAL, 12000)
    for (const ms of [50, 300, 1200, 3000]) {
      const coarse = build_plan(REAL, 12000, { max_states: ms })
      for (let b = 0; b < 12000; b += 37) expect(coarse.reach_prob(b)).toBeLessThanOrEqual(exact.reach_prob(b) + 1e-9)
    }
  })

  it('위(1)·아래(0)에서 시작한 가치 반복이 같다, 정책 확률 = 최적', () => {
    const plan = build_plan(REAL, 12000)
    const tb = plan.table(0)
    const up = tb.value_iteration_from_above()
    for (let m = 0; m < tb.N; m++) {
      expect(Math.abs(up[m] - tb.V[m])).toBeLessThan(1e-9)
      expect(Math.abs(tb.pv[m] - tb.V[m])).toBeLessThan(1e-9)
    }
  })

  it('트리 잎 (올 확률 × 도달 확률) 합 = 뿌리', () => {
    const plan = build_plan(REAL, 12000)
    for (const b of [3000, 9500, 10000, 11900]) {
      for (const depth of [1, 3, 5]) {
        const t = plan.tree(b, depth)
        let acc = 0
        const walk = (nd: TreeNode): void => {
          if (!nd.win) acc += nd.arrive_prob * nd.reach_prob
          else {
            walk(nd.win)
            walk(nd.lose!)
          }
        }
        walk(t)
        expect(Math.abs(acc - t.reach_prob)).toBeLessThan(1e-9)
      }
    }
  })

  it('TS 시뮬레이션(정책 표 따라가기) = 정확 돈 값 (3σ)', () => {
    const plan = build_plan(REAL, 12000)
    const ex = plan.money(10000)
    const s = plan.simulate(10000, 100_000, 11)
    const within = (x: number, err: number | null, want: number): boolean => Math.abs(x - want) <= (3 * (err ?? 0)) / 1.96
    expect(within(s.reach, s.reach_err, plan.reach_prob(10000))).toBe(true)
    expect(within(s.mean_profit, s.mean_profit_err, ex.mean_profit)).toBe(true)
    expect(within(s.mean_presses, s.mean_presses_err, ex.mean_presses)).toBe(true)
  })

  it('손절선: 이동 문제 + F 와 같다', () => {
    const F = 5000
    const sl = build_plan(REAL, 12000, { stop_loss: F })
    const mv = build_plan(REAL, 12000 - F)
    for (let b = F; b < 12000; b += 113) {
      expect(sl.reach_prob(b)).toBe(mv.reach_prob(b - F))
      expect(sl.best_tier(b)?.id ?? -1).toBe(mv.best_tier(b - F)?.id ?? -1)
    }
  })

  it('advise 는 순수 표 조회라 빠르다 (평균 < 1 ms)', () => {
    const plan = build_plan(REAL, 12000)
    const t0 = performance.now()
    for (let i = 0; i < 2000; i++) plan.advise((i * 6007) % 12000)
    expect((performance.now() - t0) / 2000).toBeLessThan(1)
  })
})
