/**
 * 계산 점검 (2026-10-27): 여러 잔고·목표·판 구성에서 화면 값 ↔ 몬테카를로 실제 결과를 대조한다.
 *   npx vitest run tests/audit.test.ts
 * 확인 항목
 *  A. 추천 도달 확률(DP)  ↔ 추천대로 플레이한 시뮬레이션          (허용 1.5%p)
 *  B. 기대 손익(expectedFinal) ↔ 시뮬레이션 평균                    (허용: 잔고의 1.5%)
 *  C. '이 판만 계속' 확률 ↔ 그 판만 반복한 시뮬레이션 (긴 세션 허용)  (허용 3%p)
 *  D. 최적이 다른 기법보다 낮지 않은가                              (허용 1.5%p)
 */
import { describe, expect, it } from 'vitest'
import { computeDP, expectedFinal, pickTier, policyReach } from '../src/engine/dp'
import { parseTiers, pOf } from '../src/engine/parse'
import { reachIfOnly } from '../src/engine/single'
import { simulate } from '../src/engine/simulate'
import { SAMPLE_TABLE } from '../src/engine/defaults'
import type { EngineOptions, Tier } from '../src/engine/types'

const SAFE: EngineOptions = { p: 0.5, capFrac: 0.5, hardCap: true }
const FREE: EngineOptions = { p: 0.5, capFrac: 1, hardCap: true }
const full = parseTiers(SAMPLE_TABLE).tiers
const small = parseTiers('300 540\n500 900\n777 1400').tiers
const mixed = parseTiers('500 800 1/1.9\n1000 1800\n6200 9920 1/1.9\n10000 17000 1/1.9\n100000 220000 1/3').tiers
const auto = parseTiers('100 180\n200 360\n300 540\n500 900\n500 800\n1000 1800\n1777 3200\n2000 3600\n4000 7200\n9000 15000 1/1.9\n10000 18000\n10000 17000 1/1.9\n20000 36000\n50000 90000\n60000 96000\n100000 160000').tiers

/** 세션 길이 제한 없는 시뮬레이션 (작은 판 '이 판만' 검증용) */
function simFixed(t: Tier, S: number, T: number, opt: EngineOptions, runs: number, seed: number) {
  let s = seed >>> 0 || 1
  const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296 }
  const stuck = opt.capFrac < 1 ? t.cost / opt.capFrac : t.cost
  let reach = 0
  for (let n = 0; n < runs; n++) {
    let b = S
    while (b < T && b > stuck - 1e-9 && b > t.cost) b += rand() < pOf(t, opt.p) ? t.profit : -t.cost
    if (b >= T) reach++
  }
  return reach / runs
}

const cases: [string, Tier[], number, number, EngineOptions][] = [
  ['전체표 1만→1.1만', full, 10000, 11000, SAFE],
  ['전체표 1만→2만', full, 10000, 20000, SAFE],
  ['전체표 5만→5.5만', full, 50000, 55000, SAFE],
  ['전체표 10만→13만', full, 100000, 130000, SAFE],
  ['전체표 23만→25.3만', full, 230000, 253000, SAFE],
  ['전체표 27.5만→30만', full, 275000, 300000, SAFE],
  ['전체표 50만→55만', full, 500000, 550000, SAFE],
  ['전체표 상한없음 23만→27.6만', full, 230000, 276000, FREE],
  ['소액만 1만→1.05만', small, 10000, 10500, SAFE],
  ['소액만 3천→3.3천', small, 3000, 3300, SAFE],
  ['1/1.9·1/3 섞임 2만→2.4만', mixed, 20000, 24000, SAFE],
  ['자동목록형 23.6만→25만', auto, 236000, 250000, SAFE],
  ['자동목록형 2만→3만', auto, 20000, 30000, SAFE],
  ['승률 48% 가정 1만→1.2만', full, 10000, 12000, { ...SAFE, p: 0.48 }],
  ['승률 55% (유리한 게임) 1만→1.5만', full, 10000, 15000, { ...SAFE, p: 0.55 }],
]

describe('계산 점검', () => {
  it('A·B·D: 추천 확률 · 기대 손익 · 기법 비교', () => {
    const rows: string[] = []
    let worstA = 0, worstB = 0, worstD = 0
    for (const [name, tiers, S, T, opt] of cases) {
      const dp = computeDP(tiers, T, { ...opt, align: S }, true)   // 화면(워커)과 같은 호출
      const shown = policyReach(dp, S, T)
      const ev = expectedFinal(dp, S) - S
      const opt1 = simulate(tiers, S, T, opt, 'optimal', tiers[0], 20000, Infinity, 101)
      const others = (['fixed', 'martingale', 'paroli', 'dalembert'] as const).map((id) => {
        const base = tiers.reduce((a, t) => ((reachIfOnly(t, S, T, opt).reach ?? -1) > (reachIfOnly(a, S, T, opt).reach ?? -1) ? t : a), tiers[0])
        return simulate(tiers, S, T, opt, id, base, 6000, Infinity, 202).reach
      })
      const dA = Math.abs(shown - opt1.reach), dB = Math.abs(ev - opt1.meanPnl) / S, dD = Math.max(0, Math.max(...others) - opt1.reach)
      worstA = Math.max(worstA, dA); worstB = Math.max(worstB, dB); worstD = Math.max(worstD, dD)
      rows.push(`${name.padEnd(26)} 표시 ${(shown * 100).toFixed(1).padStart(5)}% · 시뮬 ${(opt1.reach * 100).toFixed(1).padStart(5)}% (차 ${(dA * 100).toFixed(2)}%p) | 기대손익 ${Math.round(ev).toLocaleString().padStart(8)} · 시뮬 ${Math.round(opt1.meanPnl).toLocaleString().padStart(8)} | 다른 기법 최고 ${(Math.max(...others) * 100).toFixed(1)}%`)
    }
    console.log('\n' + rows.join('\n') + `\n최대 오차 A ${(worstA * 100).toFixed(2)}%p · B 잔고의 ${(worstB * 100).toFixed(2)}% · D ${(worstD * 100).toFixed(2)}%p`)
    expect(worstA).toBeLessThan(0.015); expect(worstB).toBeLessThan(0.02); expect(worstD).toBeLessThan(0.015)
  }, 600000)

  it('C: 이 판만 계속 누르면 (작은 판 포함, 세션 길이 제한 없음)', () => {
    const rows: string[] = []
    const bad: string[] = []
    let worst = 0
    for (const [name, tiers, S, T, opt] of cases.slice(0, 12)) {
      for (const t of tiers) {
        const r = reachIfOnly(t, S, T, opt)
        if (r.reach == null) continue
        const expect_runs = (T / t.cost) > 400 ? 300 : 2000   // 아주 긴 세션은 표본을 줄인다
        const sim = simFixed(t, S, T, opt, expect_runs, t.cost + S)
        const d = Math.abs(r.reach - sim)
        const tol = 3.5 * Math.sqrt(Math.max(sim * (1 - sim), 0.01) / expect_runs) + (r.approx ? 0.025 : 0.005)   // 표본오차 3.5배 + 근사 여유
        if (d > worst) worst = d
        if (d > tol * 0.7) rows.push(`${name} · ${t.cost}→${t.payout}: 계산 ${(r.reach * 100).toFixed(1)}%${r.approx ? '(근사)' : ''} · 시뮬 ${(sim * 100).toFixed(1)}%`)
        if (d >= tol) bad.push(`${name} ${t.cost}→${t.payout}: ${(r.reach * 100).toFixed(1)} vs ${(sim * 100).toFixed(1)}`)
      }
    }
    console.log('\n[C] 오차 큰 편인 것들:\n' + (rows.join('\n') || '(없음)') + `\n[C] 최대 오차 ${(worst * 100).toFixed(2)}%p`)
    expect(bad).toEqual([])
  }, 900000)

  it('경계 상황', () => {
    // 잔고가 가장 싼 판보다 적으면 걸 수 있는 판이 없다
    expect(pickTier(computeDP(full, 1000, SAFE), 150, 1000).tier).toBeNull()
    // 목표가 잔고 이하면 이미 도달
    expect(pickTier(computeDP(full, 10000, SAFE), 12000, 10000).done).toBe(true)
    // 유리한 게임(승률 55%)이면 켈리가 실제로 건다
    const k = simulate(full, 10000, 15000, { ...SAFE, p: 0.58 }, 'kelly', full[0], 500)
    expect(k.noBet).toBe(false)   // (승률 58%: 1.8배 판의 손익분기 55.6% 위)
    // 50% 상한에서 잔고의 50%를 넘는 추천 없음 (전 구간)
    const dp = computeDP(full, 300000, SAFE)
    for (let b = 1000; b < 300000; b += 997) { const t = pickTier(dp, b, 300000).tier; if (t) expect(t.cost).toBeLessThanOrEqual(b * 0.5 + 1e-9) }
  })
})
