// 화면 판(소수 p) → 엔진 확률 문자열 변환이 정확한지 (9회차)
import { describe, expect, it } from 'vitest'
import { parseTiers, probText, tierOf } from '../src/lib/tiers'
import { parse_prob } from '../src/nibuichi/tiers'

describe('probText', () => {
  it('자동 목록·직접 입력 값', () => {
    expect(probText(null)).toBe('1/2')
    expect(probText(0.5)).toBe('1/2')
    expect(probText(0.5263157894736842)).toBe('1/1.9')
    expect(probText(1 / 1.9)).toBe('1/1.9')
    expect(probText(1 / 3)).toBe('1/3')
    expect(probText(0.25)).toBe('1/4')
    expect(probText(0.4)).toBe('1/2.5')
    expect(probText(0.6)).toBe('3/5')
  })
  it('엔진이 정확한 분수로 읽는다 (1/1.9 = 10/19)', () => {
    const [r] = parse_prob(probText(tierOf(99, 160, 0.5263157894736842).p))
    expect([r.num, r.den]).toEqual([10n, 19n])
  })
  it('붙여넣기 "10000 17000 1/1.9" 도 같은 형식', () => {
    const t = parseTiers('10000 17000 1/1.9').tiers[0]
    expect(probText(t.p)).toBe('1/1.9')
  })
})
