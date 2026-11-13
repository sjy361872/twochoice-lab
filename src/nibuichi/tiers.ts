// 입력 검증·정리 (SPEC 2장). 파이썬 nibuichi/tiers.py 의 복사본 — 파이썬이 기준(정답).
// 확률은 분수(BigInt 분자/분모)로 정확히 들고 다닌다: "1/1.9" = 10/19.

export class InputError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(`[${code}] ${message}`)
    this.name = 'InputError'
    this.code = code
  }
}

export interface Rational {
  num: bigint // > 0
  den: bigint // > 0
}

function bgcd(a: bigint, b: bigint): bigint {
  if (a < 0n) a = -a
  if (b < 0n) b = -b
  while (b) [a, b] = [b, a % b]
  return a
}

function reduce(num: bigint, den: bigint): Rational {
  if (den < 0n) {
    num = -num
    den = -den
  }
  const g = bgcd(num, den) || 1n
  return { num: num / g, den: den / g }
}

/** 두 분수 비교: a<b → 음수, 같으면 0, a>b → 양수 */
export function cmpRat(a: Rational, b: Rational): number {
  const d = a.num * b.den - b.num * a.den
  return d < 0n ? -1 : d > 0n ? 1 : 0
}

// 파이썬 Fraction(str) 이 받는 꼴: "3/7", " 3 / 7 ", "0.5", ".5", "5.", "1e-3", 부호
const RAT_RE = /^\s*([-+]?)(?=\d|\.\d)(\d*)(?:(?:\s*\/\s*(\d+))?|(?:\.(\d*))?(?:[eE]([-+]?\d+))?)\s*$/

export function parseFraction(text: string): Rational {
  const m = RAT_RE.exec(text)
  if (!m) throw new Error(`분수로 읽을 수 없습니다: ${JSON.stringify(text)}`)
  const sign = m[1] === '-' ? -1n : 1n
  const intPart = m[2] || '0'
  if (m[3] !== undefined) {
    const den = BigInt(m[3])
    if (den === 0n) throw new Error('0 으로 나눌 수 없습니다')
    return reduce(sign * BigInt(intPart), den)
  }
  const dec = m[4] ?? ''
  let num = BigInt(intPart + dec)
  let den = 10n ** BigInt(dec.length)
  const exp = m[5] !== undefined ? Number(m[5]) : 0
  if (exp > 0) num *= 10n ** BigInt(exp)
  else if (exp < 0) den *= 10n ** BigInt(-exp)
  return reduce(sign * num, den)
}

/** '1/1.9' → (10/19, '1/1.9'). 소수 0.5 → (1/2, '0.5'). null/undefined → 1/2. 잘못되면 Error. */
export function parse_prob(raw: unknown): [Rational, string] {
  if (raw === null || raw === undefined) return [{ num: 1n, den: 2n }, '1/2']
  if (typeof raw === 'boolean') throw new Error('확률에 참/거짓은 쓸 수 없습니다')
  let p: Rational
  let text: string
  if (typeof raw === 'number') {
    text = String(raw)
    p = parseFraction(text)
  } else if (typeof raw === 'string') {
    text = raw.trim()
    if (text.startsWith('1/')) {
      const x = parseFraction(text.slice(2).trim())
      if (cmpRat(x, { num: 1n, den: 1n }) <= 0) throw new Error(`'1/x' 에서 x 는 1보다 커야 합니다: ${text}`)
      p = reduce(x.den, x.num)
    } else {
      p = parseFraction(text)
    }
  } else {
    throw new Error(`확률 형식을 알 수 없습니다: ${String(raw)}`)
  }
  if (!(p.num > 0n && p.num < p.den)) throw new Error(`확률은 0과 1 사이(양 끝 제외)여야 합니다: ${String(raw)}`)
  return [p, text]
}

export interface TierDict {
  id: number
  cost: number
  payout: number
  prob: string
  q: number
  label: string
}

export class Tier {
  readonly cost: number
  readonly payout: number
  readonly prob: Rational
  readonly prob_text: string
  readonly id: number
  readonly q: number // 분수를 한 번만 나눈 값 = 파이썬 float(Fraction) 과 같은 비트

  constructor(cost: number, payout: number, prob: Rational, prob_text = '1/2', id = -1) {
    this.cost = cost
    this.payout = payout
    this.prob = prob
    this.prob_text = prob_text
    this.id = id
    this.q = Number(prob.num) / Number(prob.den)
  }

  get gain(): number {
    return this.payout - this.cost
  }

  get label(): string {
    return `${this.cost}→${this.payout} (${this.prob_text})`
  }

  to_dict(): TierDict {
    return { id: this.id, cost: this.cost, payout: this.payout, prob: this.prob_text, q: this.q, label: this.label }
  }
}

/** SPEC 4장 옵션 (키 이름은 파이썬과 같다). 기본은 모두 꺼짐. */
export interface OptionsInput {
  allow_all_in?: boolean
  max_bet_percent?: number | null
  max_states?: number
  near_tie_pp?: number
  stop_loss?: number
}

export interface Options {
  allow_all_in: boolean
  max_bet_percent: number | null
  max_states: number
  near_tie_pp: number
  stop_loss: number
}

export const DEFAULT_OPTIONS: Options = {
  allow_all_in: true,
  max_bet_percent: null,
  max_states: 200_000,
  near_tie_pp: 0.1,
  stop_loss: 0,
}

export function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v)
}

export function check_near_tie_pp(v: unknown): number {
  if (typeof v !== 'number' || !(v >= 0 && v <= 100)) {
    throw new InputError('E_NEAR_TIE', `near_tie_pp 는 0~100 사이 수(%p)여야 합니다: ${String(v)}`)
  }
  return v
}

export function make_options(o?: OptionsInput | null): Options {
  const opt: Options = { ...DEFAULT_OPTIONS, ...(o ?? {}) } as Options
  if (opt.max_bet_percent === undefined) opt.max_bet_percent = null
  const p = opt.max_bet_percent
  if (p !== null && (!isInt(p) || p < 1 || p > 100)) {
    throw new InputError('E_CAP', `상한은 1~100 사이 정수 % 여야 합니다: ${String(p)}`)
  }
  if (!isInt(opt.max_states) || opt.max_states < 1) {
    throw new InputError('E_STATES', `max_states 는 1 이상 정수여야 합니다: ${String(opt.max_states)}`)
  }
  check_near_tie_pp(opt.near_tie_pp)
  if (!isInt(opt.stop_loss) || opt.stop_loss < 0) {
    throw new InputError('E_STOP_LOSS', `손절선은 0 이상 정수여야 합니다: ${String(opt.stop_loss)}`)
  }
  return opt
}

/** 올인 금지·상한 중 하나라도 켜졌는가 (켜져 있으면 나머지 r 별로 표가 달라질 수 있다) */
export function any_on(opt: Options): boolean {
  return !opt.allow_all_in || opt.max_bet_percent !== null
}

export interface Warning {
  code: string
  index: number
  message: string
}

export interface CleanResult {
  tiers: Tier[]
  warnings: Warning[]
  dominated: Tier[] // 지배당해 계산에서 뺀 판. step() 에서만 받는다.
}

export interface RawTier {
  cost?: unknown
  payout?: unknown
  prob?: unknown
  sold_out?: unknown
}

/** SPEC 2.3: 매진 제거 → 판 단위 오류 제거 → 완전 중복 제거 → 지배당한 판 제거 → 번호 다시 붙이기 */
export function clean_tiers(raw: readonly unknown[]): CleanResult {
  const warnings: Warning[] = []
  const staged: Tier[] = []
  raw.forEach((item0, pos) => {
    let item = item0 as RawTier
    if (item0 instanceof Tier) item = { cost: item0.cost, payout: item0.payout, prob: item0.prob_text }
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      warnings.push({ code: 'E_FORMAT', index: pos, message: '판 형식이 아닙니다' })
      return
    }
    if (item.sold_out) {
      warnings.push({ code: 'W_SOLD_OUT', index: pos, message: '매진이라 제외' })
      return
    }
    const { cost, payout } = item
    if (!isInt(cost) || cost < 1) {
      warnings.push({ code: 'E_COST', index: pos, message: `가격이 1 이상 정수가 아님: ${String(cost)}` })
      return
    }
    if (!isInt(payout) || payout <= cost) {
      warnings.push({ code: 'E_PAYOUT', index: pos, message: `배당이 가격보다 큰 정수가 아님: ${String(payout)}` })
      return
    }
    let parsed: [Rational, string]
    try {
      parsed = parse_prob(item.prob)
    } catch (e) {
      warnings.push({ code: 'E_PROB', index: pos, message: (e as Error).message })
      return
    }
    staged.push(new Tier(cost, payout, parsed[0], parsed[1], pos))
  })

  const seen = new Set<string>()
  const uniq: Tier[] = []
  for (const t of staged) {
    const key = `${t.cost}|${t.payout}|${t.prob.num}/${t.prob.den}`
    if (seen.has(key)) {
      warnings.push({ code: 'W_DUPLICATE', index: t.id, message: `${t.label} 중복이라 제외` })
      continue
    }
    seen.add(key)
    uniq.push(t)
  }

  const kept: Tier[] = []
  const dropped: Tier[] = []
  for (const t of uniq) {
    const dom = uniq.find(
      (o) =>
        o !== t &&
        o.cost === t.cost &&
        cmpRat(o.prob, t.prob) >= 0 &&
        o.payout >= t.payout &&
        (cmpRat(o.prob, t.prob) > 0 || o.payout > t.payout),
    )
    if (dom) {
      warnings.push({ code: 'W_DOMINATED', index: t.id, message: `${t.label} 은(는) ${dom.label} 보다 항상 나빠 제외` })
      dropped.push(t)
      continue
    }
    kept.push(t)
  }
  const tiers = kept.map((t, i) => new Tier(t.cost, t.payout, t.prob, t.prob_text, i))
  if (!tiers.length) throw new InputError('E_EMPTY', '정리 후 계산할 판이 없습니다')
  const extra = dropped.map((t, j) => new Tier(t.cost, t.payout, t.prob, t.prob_text, tiers.length + j))
  return { tiers, warnings, dominated: extra }
}
