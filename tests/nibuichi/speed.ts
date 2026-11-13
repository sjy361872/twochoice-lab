// 속도 측정 (Node). 실행: node tests/nibuichi/speed.ts   (Node 22.18+ 는 .ts 를 그대로 실행)
// 실제 20종으로 build_plan 시간과 advise 1회 평균 시간, 그리고 N_max 를 낮췄을 때의 정확도 손실.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build_plan } from '../../src/nibuichi/index.ts'

const here = dirname(fileURLToPath(import.meta.url))
const golden = JSON.parse(readFileSync(join(here, 'golden.json'), 'utf-8'))
const REAL: unknown[] = golden.cases.find((c: { name: string }) => c.name === '실제 20종 10000→12000').tiers

const cases: [number, number][] = [[3000, 3300], [10000, 12000], [10000, 20000], [50000, 60000], [230000, 276000]]
console.log('| S → T | 계산 단위 | 칸 수 | 반복 | build_plan (ms) | advise 평균 (ms) | 도달 확률 |')
console.log('|---|---|---|---|---|---|---|')
for (const [S, T] of cases) {
  const t0 = performance.now()
  const plan = build_plan(REAL, T, null, S)
  const bms = performance.now() - t0
  const m = plan.meta(S)
  let x = 0
  const t1 = performance.now()
  for (let i = 0; i < 2000; i++) x += plan.advise(Math.floor(S / 2) + ((i * 7919) % (T - Math.floor(S / 2)))).reach_prob
  const ams = (performance.now() - t1) / 2000
  console.log(`| ${S} → ${T} | ${m.calc_unit} | ${m.states} | ${m.iterations} | ${bms.toFixed(0)} | ${ams.toFixed(4)} | ${plan.reach_prob(S).toFixed(6)} |${x < 0 ? '' : ''}`)
}

console.log('\n## N_max 를 낮추면 (230000 → 276000, 50000 → 60000)')
console.log('| S → T | N_max | 계산 단위 | build (ms) | 도달 확률 | 정확값과 차이 | 추천 판 같음 |')
console.log('|---|---|---|---|---|---|---|')
for (const [S, T] of [[50000, 60000], [230000, 276000]] as const) {
  const exact = build_plan(REAL, T, { max_states: 10_000_000 }, S)
  const ve = exact.reach_prob(S)
  for (const nmax of [200_000, 100_000, 50_000, 30_000, 20_000]) {
    const t0 = performance.now()
    const p = build_plan(REAL, T, { max_states: nmax }, S)
    const ms = performance.now() - t0
    const v = p.reach_prob(S)
    console.log(`| ${S} → ${T} | ${nmax} | ${p.meta(S).calc_unit} | ${ms.toFixed(0)} | ${v.toFixed(6)} | ${(ve - v).toFixed(6)} | ${p.best_tier(S)?.id === exact.best_tier(S)?.id ? '예' : '아니오'} |`)
  }
}
