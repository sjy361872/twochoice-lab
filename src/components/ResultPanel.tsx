import type { CalcResponse } from '../engine/sim.worker'
import { fmt, oddsText, pct, signed } from '../lib/format'
import { Badge, Card, SectionTitle } from './ui'

function Ring({ v }: { v: number }) {
  const C = 2 * Math.PI * 34
  return (
    <svg width="92" height="92" viewBox="0 0 80 80" className="shrink-0 -rotate-90" aria-hidden>
      <circle cx="40" cy="40" r="34" fill="none" stroke="var(--line)" strokeWidth="8" />
      <circle cx="40" cy="40" r="34" fill="none" stroke="var(--color-coin-deep)" strokeWidth="8" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - v)} style={{ transition: 'stroke-dashoffset .5s ease' }} />
    </svg>
  )
}

export function ResultPanel({ res, busy, balance, target }: {
  res: CalcResponse | null; busy: boolean; balance: number; target: number
}) {
  const ready = res && balance > 0 && target > balance
  const loss = ready ? res.expected - balance : 0
  const rows = ready ? res.perTier.slice().sort((a, b) => (b.reach ?? -1) - (a.reach ?? -1)) : []
  const top = rows[0]?.reach ?? 0
  return (
    <Card className={busy ? 'opacity-80 transition' : 'transition'}>
      <SectionTitle step={3} title="어떤 판을 눌러야 하나" hint={busy ? '계산 중…' : undefined} />
      {!ready ? (
        <p className="text-[14px] text-[var(--ink-3)]">포인트, 목표(지금보다 크게), 판을 하나 이상 넣으면 여기 결과가 나온다.</p>
      ) : !res.best.tier ? (
        <p className="rounded-2xl bg-rose-50 p-4 text-[14px] font-semibold text-lose dark:bg-rose-500/10">
          지금 잔고로 걸 수 있는 판이 없다. (한 판 상한 또는 전재산 금지 규칙 때문일 수 있다 — 아래 세부 설정)
        </p>
      ) : (
        <>
          <div className="flex items-center gap-5 rounded-2xl bg-night p-5 text-white dark:bg-[var(--surface-2)]">
            <div className="relative">
              <Ring v={res.best.reach} />
              <div className="num absolute inset-0 grid place-items-center text-[19px] font-extrabold">{pct(res.best.reach, 0)}</div>
            </div>
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-white/60">지금 누를 판</div>
              <div className="num text-[28px] leading-tight font-extrabold text-coin">
                {fmt(res.best.tier.cost)}<span className="text-[16px] text-white/70"> → {fmt(res.best.tier.payout)}</span>
              </div>
              <div className="mt-1 text-[13px] text-white/75">
                이 판부터 추천대로 끝까지 하면 <b className="text-white">{fmt(target)}</b>에 닿을 확률 <b className="text-white">{pct(res.best.reach)}</b>
              </div>
            </div>
          </div>
          {/* 정직성: 성공 확률만 크게 보여주지 않는다 — 실패 몫과 평균을 같은 크기로 */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-500/25 dark:bg-rose-500/10">
              <div className="text-[12px] font-semibold text-lose">실패하면 ({pct(1 - res.best.reach, 0)})</div>
              <div className="num text-[22px] font-extrabold text-lose">약 −{fmt(balance)}</div>
              <div className="text-[12px] text-[var(--ink-2)]">멈추지 않고 계속하면 거의 전부 잃는다</div>
            </div>
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
              <div className="text-[12px] font-semibold text-[var(--ink-2)]">평균으로 보면</div>
              <div className={`num text-[22px] font-extrabold ${loss < 0 ? 'text-lose' : 'text-win'}`}>{signed(loss)}</div>
              <div className="text-[12px] text-[var(--ink-2)]">성공과 실패를 섞은 기대 손익</div>
            </div>
          </div>

          <h3 className="mt-6 mb-1 text-[13px] font-bold text-[var(--ink-2)]">이 판 하나만 계속 누르면</h3>
          <p className="mb-2 text-[12px] text-[var(--ink-3)]">같은 판만 반복했을 때 목표에 닿을 확률. 위의 추천은 상황에 따라 판을 바꿔 가며 이보다 높거나 같다.</p>
          <ul className="grid gap-1.5">
            {rows.map(({ tier, reach, approx }) => {
              const best = rows[0].tier === tier && reach != null
              return (
                <li key={`${tier.cost}/${tier.payout}/${tier.p}`} className={`relative overflow-hidden rounded-xl border px-3 py-2 ${best ? 'border-coin-deep' : 'border-[var(--line)]'}`}>
                  {reach != null && <div className="absolute inset-y-0 left-0 bg-coin/15" style={{ width: `${(reach / Math.max(top, 1e-9)) * 100}%` }} />}
                  <div className="relative flex items-center gap-2 text-[13.5px]">
                    <span className="num w-36 shrink-0 font-bold">{fmt(tier.cost)} → {fmt(tier.payout)}</span>
                    <span className="text-[12px] text-[var(--ink-3)]">{oddsText(tier.p)}</span>
                    {best && <Badge tone="coin">한 판만 고르면 이것</Badge>}
                    <span className="num ml-auto font-extrabold">{reach == null ? <span className="text-[12px] font-semibold text-[var(--ink-3)]">상한 때문에 못 걸음</span> : <>{approx && <span className="mr-1 text-[11px] font-semibold text-[var(--ink-3)]">약</span>}{pct(reach)}</>}</span>
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 text-[12px] text-[var(--ink-3)]">"약"은 판이 잔고에 비해 작아서 근사식으로 구한 값이다(시뮬레이션과 3%p 이내로 맞춰 확인함).</p>
        </>
      )}
    </Card>
  )
}
