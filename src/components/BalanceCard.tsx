import { fmt } from '../lib/format'
import { Card, SectionTitle } from './ui'

const MULTS = [1.01, 1.03, 1.05, 1.1, 1.2, 1.5, 2, 3]
const MAX_MULT = 3
/** ×1.5 · ×2 처럼 쓸데없는 0 없이 (예전엔 ×1.50 · ×1.10 으로 보였다) */
const multText = (m: number) => `×${+m.toFixed(2)}`

export function BalanceCard({ balance, target, onBalance, onTarget }: {
  balance: number; target: number; onBalance: (v: number) => void; onTarget: (v: number) => void
}) {
  const mult = balance > 0 ? target / balance : 1
  return (
    <Card>
      <SectionTitle step={1} title="내 포인트와 목표" />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-[13px] font-semibold text-[var(--ink-2)]">지금 가진 포인트</span>
          <div className="mt-1.5 flex items-center rounded-2xl border-2 border-[var(--edge)] bg-[var(--surface-2)] px-4 focus-within:border-coin">
            <input inputMode="numeric" className="num w-full bg-transparent py-3 text-[26px] font-extrabold outline-none"
              value={balance ? fmt(balance) : ''} placeholder="0"
              onChange={(e) => onBalance(+e.target.value.replace(/[^\d]/g, '') || 0)} />
            <span className="text-[15px] font-bold text-[var(--ink-3)]">pt</span>
          </div>
        </label>
        <label className="block">
          <span className="text-[13px] font-semibold text-[var(--ink-2)]">
            목표 {balance > 0 && target > balance && <span className="text-win">(+{fmt(target - balance)})</span>}
          </span>
          <div className="mt-1.5 flex items-center rounded-2xl border-2 border-[var(--edge)] bg-[var(--surface-2)] px-4 focus-within:border-coin">
            <input inputMode="numeric" className="num w-full bg-transparent py-3 text-[26px] font-extrabold outline-none"
              value={target ? fmt(target) : ''} placeholder="0"
              onChange={(e) => onTarget(+e.target.value.replace(/[^\d]/g, '') || 0)} />
            <span className="text-[15px] font-bold text-[var(--ink-3)]">pt</span>
          </div>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {MULTS.map((m) => {
          const on = Math.abs(mult - m) < 0.0005
          return (
            <button key={m} type="button" disabled={!balance} onClick={() => onTarget(Math.round(balance * m))}
              className={`num rounded-full border-2 px-3 py-1.5 text-[13px] font-bold transition disabled:opacity-40 ${on
                ? 'border-[var(--edge)] bg-coin text-white'
                : 'border-[var(--edge)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]'}`}>
              {multText(m)}
            </button>
          )
        })}
      </div>
      {balance > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <input type="range" min={1.01} max={MAX_MULT} step={0.01} value={Math.min(MAX_MULT, Math.max(1.01, mult))}
            onChange={(e) => onTarget(Math.round(balance * +e.target.value))} className="w-full" aria-label="목표 배수" />
          <span className="num w-12 shrink-0 text-right text-[14px] font-bold text-[var(--ink-2)]">{multText(mult)}</span>
        </div>
      )}
    </Card>
  )
}
