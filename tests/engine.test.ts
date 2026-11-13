import { describe, expect, it } from 'vitest'
import { computeDP, expectedFinal, pickTier } from '../src/engine/dp'
import { parseTiers } from '../src/engine/parse'
import { simulate } from '../src/engine/simulate'
import { SAMPLE_TABLE } from '../src/engine/defaults'
import type { EngineOptions, Tier } from '../src/engine/types'

const T_ = (cost: number, payout: number, p: number | null = null): Tier => ({ cost, payout, profit: payout - cost, m: payout / cost, p })
const FREE: EngineOptions = { p: 0.5, capFrac: 1, hardCap: false }
const SAFE: EngineOptions = { p: 0.5, capFrac: 0.5, hardCap: true }
const table = parseTiers(SAMPLE_TABLE).tiers

describe('parseTiers', () => {
  it('여러 표기를 읽는다', () => {
    const { tiers, bad } = parseTiers('500 900\n300/540\n10000 17000 1/1.9\n100000 220000 1/3\n잘못된줄')
    expect(tiers.map((t) => t.cost)).toEqual([300, 500, 10000, 100000])
    expect(tiers[2].p).toBeCloseTo(1 / 1.9, 6)
    expect(tiers[3].p).toBeCloseTo(1 / 3, 6)
    expect(bad).toEqual(['잘못된줄'])
  })
  it('같은 가격 다른 확률은 둘 다 남긴다', () => {
    expect(parseTiers('10000 17000 1/1.9\n10000 18000').tiers).toHaveLength(2)
  })
  it('예시 배당표 21줄', () => expect(table).toHaveLength(21))
})

describe('computeDP · pickTier (옛 계산기 selfTest 이식)', () => {
  it('공정 게임에서 V = b/T', () => {
    const dp = computeDP([T_(300, 600)], 9000, { ...FREE, cap: 60000 })
    expect(pickTier(dp, 3000, 9000).V).toBeCloseTo(1 / 3, 2)
  })
  it('환원율 < 100% 면 기대 잔고가 늘 수 없다', () => {
    const dp = computeDP(table, 15000, FREE, true)
    expect(expectedFinal(dp, 10000)).toBeLessThanOrEqual(10000 + 1e-6)
  })
  it('잔고보다 큰 판은 추천하지 않는다', () => {
    const dp = computeDP(table, 15000, FREE)
    for (let b = 300; b <= 15000; b += 300) { const t = pickTier(dp, b, 15000).tier; if (t) expect(t.cost).toBeLessThanOrEqual(b) }
  })
  it('상한을 조일수록 확률은 내려가기만 한다', () => {
    for (const T of [15000, 25000]) for (const cf of [0.35, 0.7]) {
      const a = computeDP(table, T, FREE), b = computeDP(table, T, { ...FREE, capFrac: cf })
      expect(pickTier(b, 10000, T).V).toBeLessThanOrEqual(pickTier(a, 10000, T).V + 1e-9)
    }
  })
  it('성긴 격자도 낙관하지 않는다 (2026-09-24 사고 재발 방지)', () => {
    const real = [T_(100, 160), T_(300, 540), T_(777, 1400), T_(1777, 3200)]
    for (const [S, T] of [[40000, 60000], [50000, 75000], [100000, 150000]]) for (const cap of [600, 900, 3000]) {
      const fine = pickTier(computeDP(real, T, FREE), S, T).V
      const crude = pickTier(computeDP(real, T, { ...FREE, cap }), S, T).V
      expect(crude).toBeLessThanOrEqual(fine + 0.005)
    }
  })
  it('한 판 50% 상한 · 전재산 금지', () => {
    const tt = [T_(300, 540), T_(3600, 6500), T_(10000, 18000)]
    const dp = computeDP(tt, 20000, SAFE)
    for (let b = 400; b < 20000; b += 100) { const t = pickTier(dp, b, 20000).tier; if (t) { expect(t.cost).toBeLessThan(b); expect(t.cost).toBeLessThanOrEqual(b * 0.5 + 1e-9) } }
  })
})

describe('정직성: 화면 확률 = 실제 시뮬레이션', () => {
  it('23만 → 25.3만 (기존 검증값 82.4% / 81.6%)', () => {
    const dp = computeDP(table, 253000, SAFE)
    const shown = pickTier(dp, 230000, 253000).V
    const sim = simulate(table, 230000, 253000, SAFE, 'optimal', table[0], 20000)
    expect(Math.abs(shown - sim.reach)).toBeLessThan(0.015)
    expect(shown).toBeGreaterThan(0.8); expect(shown).toBeLessThan(0.85)
  })
  it('236k → 250k 최적 ≈ 88%, 마틴게일보다 높다', () => {
    const opt = simulate(table, 236000, 250000, SAFE, 'optimal', table[0], 10000)
    const mart = simulate(table, 236000, 250000, SAFE, 'martingale', table.find((t) => t.cost === 1000)!, 10000)
    expect(opt.reach).toBeGreaterThan(0.85); expect(opt.reach).toBeLessThan(0.91)
    expect(opt.reach).toBeGreaterThan(mart.reach)
    expect(opt.meanPnl).toBeLessThan(0)   // 어떤 기법도 평균은 마이너스
  })
  it('켈리는 환원율 < 100% 에서 걸지 않는다', () => {
    const k = simulate(table, 10000, 11000, SAFE, 'kelly', table[0], 100)
    expect(k.noBet).toBe(true); expect(k.meanPnl).toBe(0)
  })
})

import { reachIfOnly } from '../src/engine/single'
describe('이 판만 계속 누르면 (reachIfOnly)', () => {
  it('확산 근사가 시뮬레이션과 맞는다: 1000→1800, 10만→10.1만 (기존 시뮬 70.3%)', () => {
    const t = table.find((x) => x.cost === 1000)!
    const r = reachIfOnly(t, 100000, 101000, SAFE)
    expect(r.approx).toBe(true)
    const sim = simulate(table, 100000, 101000, SAFE, 'fixed', t, 4000, Infinity, 7, 0)
    expect(Math.abs(r.reach! - sim.reach)).toBeLessThan(0.04)
  })
  it('큰 판은 정확한 DP 로: 30000→54000, 23만→25.3만 과 시뮬레이션 일치', () => {
    const t = table.find((x) => x.cost === 30000)!
    const r = reachIfOnly(t, 230000, 253000, SAFE)
    expect(r.approx).toBe(false)
    const sim = simulate(table, 230000, 253000, SAFE, 'fixed', t, 20000, Infinity, 9, 0)
    expect(Math.abs(r.reach! - sim.reach)).toBeLessThan(0.015)
  })
  it('최적 혼합이 어떤 단일 판보다 낮을 수 없다', () => {
    const best = pickTier(computeDP(table, 253000, SAFE), 230000, 253000).V
    for (const t of table) { const r = reachIfOnly(t, 230000, 253000, SAFE).reach; if (r != null) expect(r).toBeLessThanOrEqual(best + 0.02) }
  })
})

describe('reachIfOnly 전 구간 대조 (근사 ↔ 시뮬레이션)', () => {
  it('23만→25.3만, 3600 이상 모든 판에서 오차 3%p 이내', () => {
    for (const t of table.filter((x) => x.cost >= 3600 && x.cost <= 50000)) {
      const r = reachIfOnly(t, 230000, 253000, SAFE).reach!
      const sim = simulate(table, 230000, 253000, SAFE, 'fixed', t, 3000, Infinity, t.cost, 0)
      expect(Math.abs(r - sim.reach), `${t.cost}→${t.payout}: 계산 ${r.toFixed(3)} / 시뮬 ${sim.reach.toFixed(3)}`).toBeLessThan(0.03)
    }
  })
})
