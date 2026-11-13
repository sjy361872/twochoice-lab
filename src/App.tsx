import { useEffect, useMemo, useState } from 'react'
import { BalanceCard } from './components/BalanceCard'
import { Header } from './components/Header'
import { ResultPanel } from './components/ResultPanel'
import { StrategyCompare } from './components/StrategyCompare'
import { TierPicker } from './components/TierPicker'
import { Card, Seg } from './components/ui'
import type { EngineOptions, Tier } from './engine/types'
import { useCalc, useSim } from './engine/useEngine'

const KEY = 'twochoice-lab:v1'
interface Saved { balance: number; target: number; tiers: Tier[]; capFrac: number; p: number; baseCost: number | null; roundLimit: number }
const load = (): Partial<Saved> => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }

export default function App() {
  const s0 = useMemo(load, [])
  const [balance, setBalance] = useState(s0.balance ?? 10000)
  const [target, setTarget] = useState(s0.target ?? 11000)
  const [tiers, setTiers] = useState<Tier[]>(s0.tiers ?? [])
  const [capFrac, setCapFrac] = useState(s0.capFrac ?? 0.5)
  const [p, setP] = useState(s0.p ?? 0.5)
  const [baseCost, setBaseCost] = useState<number | null>(s0.baseCost ?? null)
  const [roundLimit, setRoundLimit] = useState(s0.roundLimit ?? 0)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ balance, target, tiers, capFrac, p, baseCost, roundLimit })) } catch { /* 저장 못 해도 계산은 된다 */ }
  }, [balance, target, tiers, capFrac, p, baseCost, roundLimit])

  // 전재산은 절대 걸지 않는다(hardCap). 한 판 상한은 사용자가 고른다.
  const opt = useMemo<EngineOptions>(() => ({ p, capFrac, hardCap: true }), [p, capFrac])
  const calc = useCalc(tiers, balance, target, opt)
  // 기법 비교의 기본 판: 사용자가 고른 판, 없으면 '이 판만 계속 누를 때' 가장 좋은 판.
  //   (가장 싼 판을 기본으로 두면 100pt 를 23만에서 수천 판 돌리게 되어 비교가 무의미했다)
  const bestSingle = calc.res?.perTier.filter((x) => x.reach != null).sort((a, b) => b.reach! - a.reach!)[0]?.tier
  const base = tiers.find((t) => t.cost === baseCost) ?? (bestSingle && tiers.find((t) => t.cost === bestSingle.cost && t.payout === bestSingle.payout)) ?? tiers[0] ?? null
  const sim = useSim(tiers, balance, target, opt, base, roundLimit)

  return (
    <div className="min-h-screen pb-16">
      <Header />
      <main className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-3 sm:px-6">
        <p className="px-1 text-[14px] leading-relaxed text-[var(--ink-2)]">
          반반 확률 게임에서 <b className="text-[var(--ink)]">어떤 판을 눌러야 목표에 가장 잘 닿는지</b>, 그리고 <b className="text-[var(--ink)]">실패하면 얼마를 잃는지</b>를 같이 보여준다.
        </p>
        <BalanceCard balance={balance} target={target} onBalance={setBalance} onTarget={setTarget} />
        <TierPicker tiers={tiers} onChange={setTiers} />
        <ResultPanel res={calc.res} busy={calc.busy} balance={balance} target={target} />
        <StrategyCompare res={sim.res} busy={sim.busy} tiers={tiers} base={base}
          onBase={(t) => setBaseCost(t.cost)} roundLimit={roundLimit} onRoundLimit={setRoundLimit}
          balance={balance} target={target} />

        <Card>
          <details>
            <summary className="cursor-pointer text-[15px] font-bold">세부 설정</summary>
            <div className="mt-4 grid gap-5">
              <div>
                <div className="mb-2 text-[13px] font-semibold text-[var(--ink-2)]">한 판에 걸 수 있는 최대 비중 <span className="font-normal text-[var(--ink-3)]">(전재산은 항상 금지)</span></div>
                <Seg value={capFrac} onChange={setCapFrac} options={[{ v: 0.3, label: '30%' }, { v: 0.5, label: '50% (기본)' }, { v: 0.8, label: '80%' }, { v: 1, label: '제한 없음' }]} />
                <p className="mt-2 text-[12px] text-[var(--ink-3)]">상한을 풀면 도달 확률은 조금 오르지만, 한 판에 크게 잃을 수 있다.</p>
              </div>
              <div>
                <div className="mb-2 text-[13px] font-semibold text-[var(--ink-2)]">승률 가정 <b className="num text-[var(--ink)]">{(p * 100).toFixed(1)}%</b> <span className="font-normal text-[var(--ink-3)]">(1/2 판에 적용)</span></div>
                <input type="range" min={0.45} max={0.55} step={0.005} value={p} onChange={(e) => setP(+e.target.value)} className="w-full" aria-label="승률 가정" />
                <p className="mt-1 text-[12px] text-[var(--ink-3)]">표기는 50%지만 실제가 1%p만 낮아도 도달 확률은 몇 %p씩 떨어진다. 여기서 확인해볼 수 있다.</p>
              </div>
            </div>
          </details>
        </Card>

        <footer className="px-1 pt-2 text-[12px] leading-relaxed text-[var(--ink-3)]">
          <p><b className="text-[var(--ink-2)]">꼭 알아둘 것.</b> 판마다 환원율(이기면 받는 금액 × 확률 ÷ 건 금액)이 100%보다 작으면, 어떤 순서·금액·기법으로 걸어도 <b className="text-[var(--ink-2)]">평균은 줄어든다</b>. 이 사이트는 목표에 닿을 확률을 가장 높이는 방법과 그 대가를 보여줄 뿐, 돈을 불려주지 않는다.</p>
          <p className="mt-2">계산: 흡수 마르코프 연쇄 위 동적계획법(최적 정책) + 몬테카를로 시뮬레이션. 자동 목록의 배당은 이미지에서 읽은 값이라 틀릴 수 있다. 특정 서비스와 관계없는 개인 프로젝트다.</p>
        </footer>
      </main>
    </div>
  )
}
