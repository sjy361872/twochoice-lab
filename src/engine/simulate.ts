import { pOf } from './parse'
import { makeChooser, updateState, type StrategyId } from './strategies'
import type { EngineOptions, Tier } from './types'

export interface SimResult {
  strategy: StrategyId
  runs: number
  reach: number        // 목표 도달 비율
  meanPnl: number      // 평균 손익
  medianPnl: number
  wipe: number         // 잔고가 시작의 10% 아래로 끝난 비율 (사실상 전멸)
  avgRounds: number
  noBet: boolean       // 한 판도 걸지 않은 기법 (켈리 등)
  unfinished: number   // 판 수 안전장치(MAX_ROUNDS)에 걸려 결판이 안 난 비율
  paths: number[][]    // 차트용 샘플 잔고 경로
}

/** 간단한 시드 난수 — 같은 입력이면 같은 결과가 나와야 화면이 깜빡이지 않는다. */
function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296 }
}

/** 한 세션 판 수 안전장치. 아주 작은 판을 큰 잔고로 돌리면 결판까지 수만 판이 걸려서 끊는다. */
export const MAX_ROUNDS = 5000

export function simulate(
  tiers: Tier[], start: number, T: number, opt: EngineOptions, strategy: StrategyId, base: Tier,
  runs = 20000, roundLimit = Infinity, seed = 12345, keepPaths = 6,
): SimResult {
  const rand = rng(seed)
  const choose = makeChooser(strategy, tiers, T, { ...opt, align: start }, base)   // 화면과 같은 격자
  const finals: number[] = []
  const paths: number[][] = []
  let reach = 0, wipe = 0, rounds = 0, anyBet = false, unfinished = 0
  for (let n = 0; n < runs; n++) {
    let bal = start, r = 0
    const st = { lossAcc: 0, level: 0, streak: 0 }
    const path = n < keepPaths ? [bal] : null
    while (bal < T && r < roundLimit && r < MAX_ROUNDS) {
      const t = choose(bal, st)
      if (!t) break
      anyBet = true
      const win = rand() < pOf(t, opt.p)
      bal += win ? t.profit : -t.cost
      updateState(st, t, win)
      r++
      if (path) path.push(bal)
    }
    if (bal >= T) reach++
    else if (r >= MAX_ROUNDS) unfinished++
    if (bal < start * 0.1) wipe++
    rounds += r
    finals.push(bal)
    if (path) paths.push(path)
  }
  finals.sort((a, b) => a - b)
  return {
    strategy, runs,
    reach: reach / runs,
    meanPnl: finals.reduce((a, b) => a + b, 0) / runs - start,
    medianPnl: finals[runs >> 1] - start,
    wipe: wipe / runs,
    avgRounds: rounds / runs,
    noBet: !anyBet,
    unfinished: unfinished / runs,
    paths,
  }
}
