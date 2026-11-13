// React 쪽 연결: 입력이 바뀌면 워커에 요청하고, 마지막 요청의 답만 화면에 반영한다.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { OptionsInput } from './tiers.ts'
import type { EngineTierInput, TierRef, WorkerRequest, WorkerResponse } from './worker.ts'

const makeWorker = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })

export interface StepInfo { before: number; tier: TierRef; won: boolean; after: number }

export function useNibuichi(tiers: EngineTierInput[], target: number, options: OptionsInput, balance: number, last: StepInfo | null) {
  const w = useRef<Worker | null>(null)
  const seq = useRef(0)
  const builtKey = useRef('')                       // 워커가 이미 만들어 둔 plan 의 key
  const inflight = useRef<{ id: number; key: string } | null>(null)
  const [res, setRes] = useState<WorkerResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [buildMs, setBuildMs] = useState<number | null>(null)

  const key = useMemo(() => JSON.stringify([tiers, target, options]), [tiers, target, options])

  const onMessage = (e: MessageEvent<WorkerResponse>) => {
    const r = e.data
    if (r.ok) builtKey.current = r.key
    if (r.build_ms != null) setBuildMs(r.build_ms)
    if (r.id !== seq.current) return // 낡은 답
    inflight.current = null
    setRes(r)
    setBusy(false)
  }
  const start = () => { w.current = makeWorker(); w.current.onmessage = onMessage }

  useEffect(() => {
    start()
    return () => w.current?.terminate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!tiers.length || !(target > 0) || !(balance >= 0)) { setRes(null); setBusy(false); return }
    const needBuild = key !== builtKey.current
    const id = ++seq.current
    const send = () => {
      // 다른 목표로 plan 을 만드는 중이면(오래 걸릴 수 있다) 워커를 새로 띄워 그 계산을 버린다
      if (needBuild && inflight.current && inflight.current.key !== key && inflight.current.key !== builtKey.current) {
        w.current?.terminate()
        builtKey.current = ''
        start()
      }
      const lastRef = last && last.after === balance ? last : null
      const msg: WorkerRequest = {
        id, key, tiers, target, options, balance,
        last: lastRef ? lastRef.tier : null,
        step: lastRef ? { before: lastRef.before, tier: lastRef.tier, won: lastRef.won } : null,
      }
      inflight.current = { id, key }
      w.current?.postMessage(msg)
    }
    if (!needBuild) { send(); return } // 잔고만 바뀜 → 즉시
    setBusy(true)
    const t = setTimeout(send, 150) // 목표·판 입력 중에는 잠깐 기다렸다가 한 번만
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, balance, last])

  return { res, busy, buildMs }
}
