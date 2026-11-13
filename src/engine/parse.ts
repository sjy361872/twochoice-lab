import type { Tier } from './types'

/**
 * 티어 목록 파싱. "500 900", "500/900", "500 900 1/1.9", "100000 220000 1/3" 같은 줄을 읽는다.
 * (원본: 클로브 연습용 계산기 parseTiers — 동작을 그대로 옮겼다)
 */
export function parseTiers(text: string, isNet = false): { tiers: Tier[]; bad: string[] } {
  const out: Tier[] = []
  const bad: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    // "1/2", "1:2", "1/1.9" 같은 확률 표기만 걷어낸다. 양쪽이 1~2자리일 때만 —
    // 그래야 "300/540" 형식의 티어 줄이 통째로 날아가지 않는다.
    const pm = line.match(/\b(\d{1,2}(?:\.\d+)?)\s*[/:]\s*(\d{1,2}(?:\.\d+)?)\b/)
    const tp = pm && +pm[2] > 0 && +pm[1] / +pm[2] > 0 && +pm[1] / +pm[2] < 1 ? +pm[1] / +pm[2] : null
    const cleaned = line.replace(/\b\d{1,2}(?:\.\d+)?\s*[/:]\s*\d{1,2}(?:\.\d+)?\b/g, ' ')
    const nums = (cleaned.match(/\d[\d,]*/g) || []).map((s) => parseInt(s.replace(/,/g, ''), 10))
    if (nums.length < 2) { bad.push(line); continue }
    const cost = nums[0]
    const payout = isNet ? cost + nums[1] : nums[1]
    // 배당 10배 초과는 오타(0 하나 더 침)로 본다.
    if (!(cost > 0) || !(payout > cost) || !isFinite(payout) || payout > cost * 10) { bad.push(line); continue }
    out.push({ cost, payout, profit: payout - cost, m: payout / cost,
      p: tp != null && Math.abs(tp - 0.5) > 1e-9 ? tp : null })
  }
  out.sort((a, b) => a.cost - b.cost)
  // 같은 가격이라도 확률이 다르면 다른 티어다 (500→800 1/2 판과 1/1.9 판).
  const seen = new Set<string>()
  const tiers = out.filter((t) => {
    const k = `${t.cost}/${t.payout}/${t.p}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  return { tiers, bad }
}

export const pOf = (t: Tier, p: number) => (t.p != null ? t.p : p)
export const rtpOf = (t: Tier, p: number) => pOf(t, p) * t.m
