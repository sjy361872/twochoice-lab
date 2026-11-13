/**
 * 정확한 답과 대조 (2026-11-13 계산 재검토).
 * 기대값은 엔진 코드를 쓰지 않은 독립 구현(tests/independent/verify_dp.py 방식: 1pt 격자, 반올림 없음,
 * 가치 반복 수렴 1e-12)으로 구한 '진짜 최적' 도달 확률이다. 배당표 = 11/13 열린 니부이치 20종.
 * 기본 설정(순수 최적: 상한 없음·올인 허용·안정화 없음·격자 2만 칸)이 이 값과 0.05%p 안이어야 한다.
 */
import { describe, expect, it } from 'vitest'
import { clearDPCache, computeDP, policyReach } from '../src/engine/dp'
import type { EngineOptions, Tier } from '../src/engine/types'

const TABLE: [number, number, number][] = [[99, 160, 0.5263157894736842], [100, 180, 0.5], [300, 480, 0.5], [300, 540, 0.5], [500, 900, 0.5], [1000, 1800, 0.5], [2000, 3600, 0.5], [3000, 5400, 0.5], [4000, 7200, 0.5], [5500, 9000, 0.5], [7777, 14000, 0.5], [10000, 16000, 0.5], [15000, 27000, 0.5], [20000, 36000, 0.5], [20000, 32000, 0.5], [30000, 48000, 0.5], [33333, 60000, 0.5], [50000, 90000, 0.5], [60000, 108000, 0.5], [60000, 96000, 0.5]]
const tiers: Tier[] = TABLE.map(([c, y, p]) => ({ cost: c, payout: y, profit: y - c, m: y / c, p: Math.abs(p - 0.5) > 1e-9 ? p : null }))
const PURE: EngineOptions = { p: 0.5, capFrac: 1, hardCap: false, stable: 0, cap: 20000 }
const EXACT: [number, number, number][] = [
  [3000, 3300, 0.8403], [10000, 12000, 0.7512], [10000, 20000, 0.3947],
  [50000, 60000, 0.7725], [100000, 130000, 0.6880], [230000, 276000, 0.7362],
]

describe('정확한 최적과 대조 (기본 = 순수 최적)', () => {
  for (const [S, T, ex] of EXACT) {
    it(`${S}→${T}: 정확한 값 ${(ex * 100).toFixed(2)}%`, () => {
      clearDPCache()
      const dp = computeDP(tiers, T, { ...PURE, align: S }, true)
      expect(Math.abs(policyReach(dp, S, T) - ex)).toBeLessThan(0.0005)
    })
  }
})
