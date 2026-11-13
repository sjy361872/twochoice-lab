import { useEffect, useRef, useState } from 'react'
import type { CalcResponse, SimResponse } from './sim.worker'
import type { EngineOptions, Tier } from './types'

/**
 * 계산은 Web Worker 두 개에서 돌린다 — 하나는 즉답용(DP), 하나는 느린 시뮬레이션용.
 * 입력이 바뀌면 이전 결과는 버리고(요청 id 로 구분) 마지막 입력만 반영한다.
 */
function makeWorker() {
  return new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })
}

export function useCalc(tiers: Tier[], balance: number, target: number, opt: EngineOptions) {
  const w = useRef<Worker | null>(null)
  const seq = useRef(0)
  const [res, setRes] = useState<CalcResponse | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    w.current = makeWorker()
    w.current.onmessage = (e: MessageEvent<CalcResponse>) => {
      if (e.data.id === seq.current) { setRes(e.data); setBusy(false) }
    }
    return () => w.current?.terminate()
  }, [])
  useEffect(() => {
    if (!tiers.length || !(balance > 0) || !(target > balance)) { setRes(null); return }
    const id = ++seq.current
    setBusy(true)
    const t = setTimeout(() => w.current?.postMessage({ kind: 'calc', id, tiers, balance, target, opt }), 120)
    return () => clearTimeout(t)
  }, [tiers, balance, target, opt])
  return { res, busy }
}

export function useSim(tiers: Tier[], balance: number, target: number, opt: EngineOptions, base: Tier | null, roundLimit: number) {
  const w = useRef<Worker | null>(null)
  const seq = useRef(0)
  const [res, setRes] = useState<SimResponse | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    w.current = makeWorker()
    w.current.onmessage = (e: MessageEvent<SimResponse>) => {
      if (e.data.id === seq.current) { setRes(e.data); setBusy(false) }
    }
    return () => w.current?.terminate()
  }, [])
  useEffect(() => {
    if (!tiers.length || !base || !(balance > 0) || !(target > balance)) { setRes(null); return }
    const id = ++seq.current
    setBusy(true)
    const t = setTimeout(() => {
      // 이전 시뮬레이션이 돌고 있으면 워커를 새로 만들어 즉시 끊는다(긴 계산이 쌓이지 않게).
      w.current?.terminate()
      w.current = makeWorker()
      w.current.onmessage = (e: MessageEvent<SimResponse>) => {
        if (e.data.id === seq.current) { setRes(e.data); setBusy(false) }
      }
      w.current.postMessage({ kind: 'sim', id, tiers, balance, target, opt, base, roundLimit, runs: 8000 })
    }, 350)
    return () => clearTimeout(t)
  }, [tiers, balance, target, opt, base, roundLimit])
  return { res, busy }
}
