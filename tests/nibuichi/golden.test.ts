// 파이썬 엔진(기준)이 만든 정답 묶음(golden.json)과 TS 엔진 결과를 비교한다.
// 만들기: C:\nibuichi-engine 에서 python tools/export_golden.py
// 비교 규칙: 확률·돈 숫자는 1e-9(큰 금액은 상대 1e-9), 문자열·참거짓·null·목록 순서는 정확히. 시뮬레이션 값은 3σ.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { build_plan, InputError } from '../../src/nibuichi/index.ts'

const here = dirname(fileURLToPath(import.meta.url))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
const golden: Any = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf-8'))

const TOL = 1e-9
let maxDev = 0 // 실제로 본 가장 큰 숫자 차이 (보고용)
let exactSame = 0
let numbers = 0

/** 두 JSON 값을 비교해 처음 다른 곳의 경로를 돌려준다(같으면 null). */
function diff(a: unknown, b: unknown, path = '$'): string | null {
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isInteger(a) && Number.isInteger(b) && Math.abs(a) > 1e6) return a === b ? null : `${path}: ${a} != ${b}`
    const tol = TOL * Math.max(1, Math.abs(b))
    numbers++
    if (a === b) exactSame++
    else maxDev = Math.max(maxDev, Math.abs(a - b) / Math.max(1, Math.abs(b)))
    return Math.abs(a - b) <= tol ? null : `${path}: ${a} != ${b} (차이 ${Math.abs(a - b)})`
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return a === b ? null : `${path}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: 배열/객체 다름`
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    if (a.length !== bb.length) return `${path}: 길이 ${a.length} != ${bb.length}`
    for (let i = 0; i < a.length; i++) {
      const d = diff(a[i], bb[i], `${path}[${i}]`)
      if (d) return d
    }
    return null
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const ka = Object.keys(ao).sort()
  const kb = Object.keys(bo).sort()
  if (ka.join(',') !== kb.join(',')) return `${path}: 키 다름 [${ka}] != [${kb}]`
  for (const k of ka) {
    const d = diff(ao[k], bo[k], `${path}.${k}`)
    if (d) return d
  }
  return null
}

/** TS 결과를 JSON 왕복시켜 파이썬과 같은 꼴로 (undefined 제거 등) */
const j = (x: unknown): unknown => JSON.parse(JSON.stringify(x))

let compared = 0

describe('비교 함수 자체 점검', () => {
  it('다른 곳을 찾아낸다', () => {
    expect(diff({ a: [1, 2, { b: 0.5 }] }, { a: [1, 2, { b: 0.5 + 1e-12 }] })).toBeNull()
    expect(diff({ a: [1, 2, { b: 0.5 }] }, { a: [1, 2, { b: 0.5 + 1e-6 }] })).toContain('$.a[2].b')
    expect(diff({ a: 'x' }, { a: 'y' })).not.toBeNull()
    expect(diff([1, 2], [2, 1])).not.toBeNull()
    expect(diff({ a: 1 }, { a: 1, b: null })).not.toBeNull()
    expect(diff({ a: null }, { a: 0 })).not.toBeNull()
    maxDev = 0 // 점검용 비교는 보고 숫자에서 뺀다
    exactSame = 0
    numbers = 0
  })
})

describe('golden: 파이썬 엔진과 일치', () => {
  for (const c of golden.cases) {
    it(c.name, () => {
      const plan = build_plan(c.tiers, c.target, c.options, c.start_balance)
      const sb = c.start_balance !== null && c.start_balance < c.target ? c.start_balance : 0
      const m = plan.meta(sb)
      for (const k of ['unit', 'calc_unit', 'states', 'exact', 'converged', 'iterations']) {
        expect((m as Any)[k], `${c.name} meta.${k}`).toBe(c.meta[k])
      }
      expect(plan.warnings.map((w) => ({ code: w.code, index: w.index }))).toEqual(c.warnings)
      expect(diff(j(m.tiers_used), c.tiers_used)).toBeNull()
      for (const q of c.queries) {
        let got: unknown
        if (q.kind === 'advise') got = plan.advise(q.balance, q.last_tier ?? null, true, q.near_tie_pp ?? null)
        else if (q.kind === 'path') got = plan.path_if_all_wins(q.balance)
        else if (q.kind === 'tree') got = plan.tree(q.balance, q.depth)
        else if (q.kind === 'step') got = plan.step(q.balance, q.tier, q.won)
        else if (q.kind === 'money_sim') {
          const s: Any = plan.money(q.balance, q.n, 7)
          const r = q.result
          expect(s.method).toBe('simulation')
          for (const key of ['reach', 'mean_profit', 'mean_presses']) {
            const se = Math.hypot(s[key + '_err'] / 1.96, r[key + '_err'] / 1.96)
            expect(Math.abs(s[key] - r[key]), `${c.name} sim ${key}`).toBeLessThanOrEqual(3 * se + 1e-12)
          }
          continue
        }
        const d = diff(j(got), q.result)
        expect(d, `${c.name} / ${q.kind} ${q.balance}`).toBeNull()
        compared++
      }
    })
  }
})

describe('golden: 빠짐없이 비교했는가', () => {
  it('advise·path·tree·step 개수', () => {
    const n = golden.counts
    expect(compared).toBe(n.advise + n.path + n.tree + n.step)
    console.log(`비교한 숫자 ${numbers}개, 비트까지 같은 숫자 ${exactSame}개, 최대 차이(상대) ${maxDev}`)
  })
})

describe('golden: 오류 코드 일치', () => {
  for (const e of golden.errors) {
    it(e.name, () => {
      let code: string | null = null
      try {
        if (e.call === 'build') build_plan(e.tiers, e.target, e.options ?? null, e.start_balance ?? null)
        else {
          const plan = build_plan(e.tiers, e.target, e.options ?? null)
          if (e.call === 'advise') plan.advise(e.balance, e.last_tier ?? null, true, e.near_tie_pp ?? null)
          else if (e.call === 'step') plan.step(e.balance, e.tier, e.won)
          else if (e.call === 'tree') plan.tree(e.balance, e.depth)
        }
      } catch (ex) {
        expect(ex).toBeInstanceOf(InputError)
        code = (ex as InputError).code
      }
      expect(code).toBe(e.code)
    })
  }
})
