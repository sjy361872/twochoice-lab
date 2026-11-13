import type { SimResponse } from '../engine/sim.worker'
import type { StrategyId } from '../engine/strategies'
import type { Tier } from '../engine/types'
import { fmt, pct, signed } from '../lib/format'
import { Card, SectionTitle, Seg } from './ui'

/** 사람 말로 된 이름·설명 (엔진의 STRATEGIES 이름보다 쉬운 표현) */
const LABEL: Record<StrategyId, { name: string; ex: (base: Tier | null) => string }> = {
  optimal: { name: '계산기 추천대로', ex: () => '매번 목표에 가장 잘 닿는 판을 고른다' },
  dalembert: { name: '달랑베르', ex: () => '지면 한 칸 큰 판, 이기면 한 칸 작은 판' },
  martingale: { name: '마틴게일', ex: () => '지면 잃은 만큼 한 번에 메우는 판으로 키운다' },
  paroli: { name: '파롤리', ex: () => '이기면 한 칸 키우고, 지면 처음 판으로' },
  fixed: { name: '같은 판만 계속', ex: (b) => (b ? `${fmt(b.cost)}pt 판만 계속 누른다` : '정한 판만 계속 누른다') },
  kelly: { name: '켈리 공식', ex: () => '유리할 때만 비율만큼 건다' },
}

/**
 * 4번 — 순위 카드(S1). 어려운 지표(전멸·판수·중앙값)는 빼고 '성공 확률'과 '평균 손익'만.
 * 기본 판·판 수 제한은 아래 접은 설정으로.
 */
export function StrategyCompare({ res, busy, tiers, base, onBase, roundLimit, onRoundLimit }: {
  res: SimResponse | null; busy: boolean; tiers: Tier[]; base: Tier | null; onBase: (t: Tier) => void
  roundLimit: number; onRoundLimit: (n: number) => void; balance: number; target: number
}) {
  const ranked = res ? res.results.filter((r) => !r.noBet).sort((a, b) => b.reach - a.reach) : []
  const kellyNoBet = res?.results.some((r) => r.strategy === 'kelly' && r.noBet)
  const best = ranked[0]

  return (
    <Card className={busy ? 'opacity-80 transition' : 'transition'}>
      <SectionTitle step={4} title="다른 방법이랑 비교하면?" hint={busy ? '계산 중…' : undefined} />
      <p className="-mt-2 mb-3 text-[12.5px] text-[var(--ink-3)]">
        같은 조건으로 방법마다 8,000번씩 해본 결과{roundLimit > 0 && <> · 최대 <b className="num">{roundLimit}판</b>까지만</>}
      </p>

      {!res ? (
        <p className="text-[14px] text-[var(--ink-3)]">{busy ? '계산 중…' : '위 입력이 채워지면 비교가 나온다.'}</p>
      ) : (
        <ol className="grid gap-2">
          {ranked.map((r, i) => {
            const L = LABEL[r.strategy as StrategyId]
            const top = i === 0
            return (
              <li key={r.strategy} className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 ${top ? 'border-coin bg-coin/10' : 'border-[var(--edge)]'}`}>
                <span className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full text-[13px] font-black ${top ? 'bg-coin text-white' : 'bg-[var(--surface-2)]'}`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-extrabold">{L.name}</div>
                  <div className="text-[11.5px] text-[var(--ink-2)]">{L.ex(base)}</div>
                  {r.unfinished > 0.01 && <div className="text-[11px] font-semibold text-amber-600">{pct(r.unfinished, 0)}는 5,000판 안에 안 끝남</div>}
                </div>
                <div className="shrink-0 text-right">
                  <b className={`num block text-[22px] leading-none font-black ${top ? 'text-coin' : ''}`}>{pct(r.reach, 0)}</b>
                  <small className={`num text-[11px] ${r.meanPnl < 0 ? 'text-[var(--ink-3)]' : 'text-win'}`}>평균 {signed(r.meanPnl)}pt</small>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {res && best && (
        <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-3)]">
          % = 목표에 닿을 확률. 1등도 평균은 <b className="num text-[var(--ink-2)]">{signed(best.meanPnl)}pt</b> — 어떤 방법도 평균을 플러스로 만들진 못한다.
          {kellyNoBet && <> 켈리 공식은 이 게임이 평균 손해라서 <b className="text-[var(--ink-2)]">"걸지 마라"</b>가 답이다.</>}
        </p>
      )}

      <details className="mt-3 rounded-2xl bg-[var(--surface-2)] p-3 text-[13px]">
        <summary className="cursor-pointer font-semibold text-[var(--ink-2)]">비교 조건 바꾸기</summary>
        <div className="mt-3 grid gap-3">
          <label className="flex flex-wrap items-center gap-2 font-semibold text-[var(--ink-2)]">
            시작 판 <span className="font-normal text-[var(--ink-3)]">(같은 판만·마틴게일·파롤리·달랑베르가 쓰는 판)</span>
            <select value={base ? tiers.indexOf(base) : -1} onChange={(e) => onBase(tiers[+e.target.value])}
              className="num rounded-xl border-2 border-[var(--edge)] bg-[var(--surface)] px-2.5 py-1.5 font-bold text-[var(--ink)] outline-none">
              {tiers.map((t, i) => <option key={i} value={i}>{fmt(t.cost)} → {fmt(t.payout)}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2 font-semibold text-[var(--ink-2)]">
            최대 판 수
            <Seg value={roundLimit} onChange={onRoundLimit}
              options={[{ v: 0, label: '제한 없음' }, { v: 10, label: '10판' }, { v: 30, label: '30판' }, { v: 100, label: '100판' }]} />
          </div>
        </div>
      </details>
    </Card>
  )
}
