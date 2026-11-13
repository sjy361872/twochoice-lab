/** 한 판(티어): cost 를 걸고 이기면 payout 을 받는다. p 가 없으면 화면의 승률 가정을 따른다. */
export interface Tier {
  cost: number
  payout: number
  profit: number
  m: number
  p: number | null
}

/** 엔진 공통 옵션. 예전 계산기는 전역 state 에서 읽던 값들이다. */
export interface EngineOptions {
  /** 승률 가정 (표기 1/2 → 0.5) */
  p: number
  /** 한 판 최대 비중 (잔고 대비). 1 = 제한 없음 */
  capFrac: number
  /** true 면 '전재산 금지' — 한 판 < 잔고, 상한 예외 없음 */
  hardCap: boolean
  /** 손절선 (없으면 0) */
  floor?: number
  /** 격자 칸 수 상한 (기본 8000) */
  cap?: number
  /** 현재 잔고 — 격자 단위에 넣어 잔고가 격자 위에 정확히 오게 한다 (반올림 오차 제거) */
  align?: number
}

export interface DPResult {
  u: number
  N: number
  iT: number
  V: Float64Array
  W: Float64Array | null
  /** needW 일 때: 화면 추천(pickTier)을 그대로 따랐을 때의 도달 확률 */
  VP: Float64Array | null
  ts: { c: number; g: number; p: number; ref: Tier }[]
  T: number
  floor: number
  p: number
  bestM: number
  capFrac: number
  hardCap: boolean
}

export interface Pick {
  tier: Tier | null
  V: number
  done: boolean
  margin?: number | null
}
