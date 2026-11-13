// 화면에서 쓰는 '판' 모양과 도우미. (예전 src/engine 의 types·parse·defaults 에서 화면에 필요한 것만 옮김 —
// 새 계산 엔진(src/nibuichi)으로 넘어가면서 옛 엔진은 import 하지 않는다.)

/** 한 판: cost 를 걸고 이기면 payout 을 받는다. p = 이길 확률(소수), null 이면 표기 1/2. */
export interface Tier {
  cost: number
  payout: number
  profit: number
  m: number
  p: number | null
}

export const tierOf = (cost: number, payout: number, p: number | null): Tier =>
  ({ cost, payout, profit: payout - cost, m: payout / cost, p: p != null && Math.abs(p - 0.5) > 1e-9 ? p : null })

export const keyOf = (t: Tier) => `${t.cost}/${t.payout}/${t.p ?? ''}`
export const sameTier = (a: Tier, b: Tier) => keyOf(a) === keyOf(b)

/** 환원율 = 이길 확률 × 받는 돈 ÷ 거는 돈 */
export const rtpOf = (t: Tier) => (t.p ?? 0.5) * t.m

/**
 * 소수 확률 → 엔진이 읽는 확률 문자열. 자동 목록의 0.5263157894736842 → "1/1.9", 0.5 → "1/2", 1/3 → "1/3".
 * 엔진은 문자열을 분수로 정확히 읽으므로(1/1.9 = 10/19) 소수를 그대로 넘기지 않고 원래 표기로 되돌린다.
 */
export function probText(p: number | null): string {
  if (p == null || Math.abs(p - 0.5) < 1e-12) return '1/2'
  if (!(p > 0 && p < 1)) throw new Error(`확률이 0과 1 사이가 아님: ${p}`)
  const inv = 1 / p
  // "1/x" (x 는 소수 넷째 자리까지) 로 정확히 되돌아오면 그 표기
  for (let d = 0; d <= 4; d++) {
    const x = +inv.toFixed(d)
    if (x > 1 && Math.abs(1 / x - p) < 1e-12) return `1/${x}`
  }
  // 그 밖엔 분모 1000 이하 분수 a/b
  for (let b = 2; b <= 1000; b++) {
    const a = Math.round(p * b)
    if (a > 0 && a < b && Math.abs(a / b - p) < 1e-12) return `${a}/${b}`
  }
  return String(p) // 엔진은 소수 문자열도 받는다
}

/** 엔진 입력 모양 {cost, payout, prob} */
export const engineTier = (t: Tier) => ({ cost: t.cost, payout: t.payout, prob: probText(t.p) })

/** 확률 표기 (화면용) */
export const oddsLabel = (t: Pick<Tier, 'p'>) => probText(t.p)

/**
 * 붙여넣은 줄 읽기. "500 900", "500/900", "500 900 1/1.9", "100000 220000 1/3".
 * (예전 엔진 parse.ts 의 parseTiers 와 같은 동작)
 */
export function parseTiers(text: string): { tiers: Tier[]; bad: string[] } {
  const out: Tier[] = []
  const bad: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    // "1/2", "1:2", "1/1.9" 같은 확률 표기만 걷어낸다 (양쪽 1~2자리일 때만 — "300/540" 은 판 줄)
    const pm = line.match(/\b(\d{1,2}(?:\.\d+)?)\s*[/:]\s*(\d{1,2}(?:\.\d+)?)\b/)
    const tp = pm && +pm[2] > 0 && +pm[1] / +pm[2] > 0 && +pm[1] / +pm[2] < 1 ? +pm[1] / +pm[2] : null
    const cleaned = line.replace(/\b\d{1,2}(?:\.\d+)?\s*[/:]\s*\d{1,2}(?:\.\d+)?\b/g, ' ')
    const nums = (cleaned.match(/\d[\d,]*/g) || []).map((s) => parseInt(s.replace(/,/g, ''), 10))
    if (nums.length < 2) { bad.push(line); continue }
    const [cost, payout] = nums
    // 배당 10배 초과는 오타(0 하나 더 침)로 본다
    if (!(cost > 0) || !(payout > cost) || !isFinite(payout) || payout > cost * 10) { bad.push(line); continue }
    out.push(tierOf(cost, payout, tp))
  }
  out.sort((a, b) => a.cost - b.cost)
  const seen = new Set<string>()
  return { tiers: out.filter((t) => (seen.has(keyOf(t)) ? false : (seen.add(keyOf(t)), true))), bad }
}

/** 예시 배당표 (2026-09-28 기준). 사용자가 언제든 바꿀 수 있다. */
export const SAMPLE_TABLE = `100 180
300 540
500 900
777 1400
1000 1800
1777 3200
2000 3600
3600 6500
4000 6400
5000 9000
6000 10800
6200 9920 1/1.9
7000 12600
8000 14400
10000 17000 1/1.9
10000 18000
11111 20000
20000 36000
30000 54000
50000 90000
100000 220000 1/3`
