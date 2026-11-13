// 씨앗을 고정할 수 있는 빠른 난수 (xoshiro128**, splitmix32 로 씨앗 섞기). [0,1) 실수를 돌려준다.
// 파이썬(numpy PCG64)과 같은 난수열은 아니다 — 시뮬레이션 값은 오차 범위(3σ)로만 비교한다.
export function makeRng(seed: number): () => number {
  let x = seed >>> 0
  const sm = (): number => {
    x = (x + 0x9e3779b9) >>> 0
    let z = x
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0
    return (z ^ (z >>> 16)) >>> 0
  }
  let a = sm(), b = sm(), c = sm(), d = sm()
  return () => {
    const r = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0
    const t = (b << 9) >>> 0
    c ^= a
    d ^= b
    b ^= c
    a ^= d
    c ^= t
    d = rotl(d, 11)
    // 32비트 정수 → [0,1) (확률 비교용으로 충분한 해상도 2^-32)
    return r / 4294967296
  }
}

function rotl(v: number, k: number): number {
  return ((v << k) | (v >>> (32 - k))) >>> 0
}
