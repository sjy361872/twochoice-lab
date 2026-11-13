import { useCallback, useEffect, useMemo, useState } from 'react'
import { BalanceCard } from './components/BalanceCard'
import { Header } from './components/Header'
import { ResultPanel } from './components/ResultPanel'
import { StrategyCompare } from './components/StrategyCompare'
import { TierPicker } from './components/TierPicker'
import { engineTier, type Tier } from './lib/tiers'
import { useNibuichi, type StepInfo } from './nibuichi/useNibuichi'

// v3(11/13): 새 계산 엔진(src/nibuichi). 예전 저장값에서는 잔고·목표·고른 판만 가져오고 옛 옵션(상한·올인·승률)은 버린다.
const KEY = 'twochoice-lab:v3'
interface Saved { balance: number; target: number; tiers: Tier[]; stopLoss: number }
const load = (): Partial<Saved> => {
  try {
    const v3 = localStorage.getItem(KEY)
    if (v3) return JSON.parse(v3)
    for (const old of ['twochoice-lab:v2', 'twochoice-lab:v1']) {
      const raw = localStorage.getItem(old)
      if (raw) { const { balance, target, tiers } = JSON.parse(raw); return { balance, target, tiers } }
    }
  } catch { /* 저장값이 깨졌으면 처음부터 */ }
  return {}
}

/** 브라우저 기본: 표 칸 수 상한 3만 (큰 목표도 1초 안팎). 넘으면 단위를 키워 계산 → 화면에 '근사' 표시 */
const MAX_STATES = 30000

export default function App() {
  const s0 = useMemo(load, [])
  const [balance, setBalance] = useState(s0.balance ?? 10000)
  const [target, setTarget] = useState(s0.target ?? 11000)
  const [tiers, setTiers] = useState<Tier[]>(s0.tiers ?? [])
  const [stopLoss, setStopLoss] = useState(s0.stopLoss ?? 0)
  const [last, setLast] = useState<StepInfo | null>(null)   // 직전에 누른 판 (이겼다/졌다)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ balance, target, tiers, stopLoss })) } catch { /* 저장 못 해도 계산은 된다 */ }
  }, [balance, target, tiers, stopLoss])

  // 손절선은 '목표·잔고보다 작을 때'만 계산에 넣는다 (아니면 입력 중인 값으로 보고 무시)
  const floor = stopLoss > 0 && stopLoss < target ? stopLoss : 0
  const engineTiers = useMemo(() => tiers.map(engineTier), [tiers])
  const options = useMemo(() => ({ max_states: MAX_STATES, stop_loss: floor }), [floor])
  const ready = tiers.length > 0 && balance > 0 && target > balance && !(floor > 0 && floor >= balance)
  const calc = useNibuichi(ready ? engineTiers : [], target, options, balance, last)

  // 사용자가 잔고를 직접 고치면 '직전에 누른 판'은 잊는다
  const onBalance = useCallback((v: number) => { setLast(null); setBalance(v) }, [])

  return (
    <div className="min-h-screen pb-16">
      <Header />
      <main className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-3 sm:px-6">
        <p className="px-1 text-[14px] leading-relaxed text-[var(--ink-2)]">
          반반 확률 게임에서 <b className="text-[var(--ink)]">어떤 판을 눌러야 목표에 가장 잘 닿는지</b>, 그리고 <b className="text-[var(--ink)]">실패하면 얼마를 잃는지</b>를 같이 보여준다.
        </p>
        <BalanceCard balance={balance} target={target} onBalance={onBalance} onTarget={setTarget}
          stopLoss={stopLoss} onStopLoss={setStopLoss} floor={floor} />
        <TierPicker tiers={tiers} onChange={setTiers} autoSelectAll={s0.tiers === undefined} spendable={Math.max(0, balance - floor)} floor={floor} />
        <ResultPanel res={ready ? calc.res : null} busy={calc.busy} buildMs={calc.buildMs} balance={balance} target={target} floor={floor}
          last={last} stopLossTooHigh={floor > 0 && floor >= balance && balance < target}
          onPress={(info) => { setLast(info); setBalance(info.after) }}
          onRestore={(s) => { setLast(s.last); setBalance(s.balance) }} />
        <StrategyCompare />

        <footer className="px-1 pt-2 text-[12px] leading-relaxed text-[var(--ink-3)]">
          <p><b className="text-[var(--ink-2)]">꼭 알아둘 것.</b> 판마다 환원율(이기면 받는 금액 × 확률 ÷ 건 금액)이 100%보다 작으면, 어떤 순서·금액·기법으로 걸어도 <b className="text-[var(--ink-2)]">평균은 줄어든다</b>. 이 사이트는 목표에 닿을 확률을 가장 높이는 방법과 그 대가를 보여줄 뿐, 돈을 불려주지 않는다.</p>
          <p className="mt-2">계산: 목표에서 거꾸로 푼 '잔고별 최선의 판' 표(가치 반복). 확률은 모두 최소값(배당은 '이상 획득'의 최소값 기준) — <a href={`${import.meta.env.BASE_URL}how-it-works.html`} className="font-semibold underline">계산 방법 보기</a>. 자동 목록의 배당은 이미지에서 읽은 값이라 틀릴 수 있다. 특정 서비스와 관계없는 개인 프로젝트다.</p>
        </footer>
      </main>
    </div>
  )
}
