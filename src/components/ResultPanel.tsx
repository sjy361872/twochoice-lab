import { useState } from 'react'
import type { CalcResponse } from '../engine/sim.worker'
import { fmt, oddsText, pct } from '../lib/format'
import { Card, SectionTitle } from './ui'

/**
 * 3번: 한눈에 '지금 누를 판' 하나 + 성공/실패 갈림 막대 + 결과 버튼.
 * 정직성 원칙: 성공 확률만 크게 두지 않는다 — 실패 몫과 그때 잃는 돈을 같은 줄에 같은 크기로.
 */
export function ResultPanel({ res, busy, balance, target, onBalance }: {
  res: CalcResponse | null; busy: boolean; balance: number; target: number; onBalance: (v: number) => void
}) {
  const [history, setHistory] = useState<number[]>([])   // 되돌리기용 이전 잔고
  const ready = res && balance > 0
  const reached = balance > 0 && target > 0 && balance >= target
  const play = (next: number) => { setHistory([...history.slice(-49), balance]); onBalance(next) }
  const undo = () => { const h = history.slice(); const prev = h.pop(); if (prev != null) { setHistory(h); onBalance(prev) } }

  return (
    <Card className={busy ? 'opacity-80 transition' : 'transition'}>
      <SectionTitle step={3} title="지금 누를 판" hint={busy ? '계산 중…' : undefined} />
      {history.length > 0 && (
        <button type="button" onClick={undo}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-[var(--line)] bg-[var(--surface-2)] py-3 text-[15px] font-extrabold text-[var(--ink)] transition hover:border-[var(--ink-3)] active:scale-[.99]">
          ↶ 되돌리기 <span className="num text-[13px] font-semibold text-[var(--ink-3)]">({fmt(history[history.length - 1])}pt로)</span>
        </button>
      )}

      {reached ? (
        <div className="rounded-2xl bg-emerald-50 p-5 text-center dark:bg-emerald-500/10">
          <div className="text-[22px] font-extrabold text-win">목표 도달 🎉</div>
          <p className="mt-1 text-[14px] text-[var(--ink-2)]">
            <b className="num text-[var(--ink)]">{fmt(balance)}pt</b>. 계산대로라면 <b className="text-[var(--ink)]">여기서 멈추는 게 맞다</b>.
            더 하면 평균은 다시 줄어든다.
          </p>
        </div>
      ) : !ready || target <= balance ? (
        <p className="text-[14px] text-[var(--ink-3)]">포인트, 목표(지금보다 크게), 판을 하나 이상 넣으면 여기 결과가 나온다.</p>
      ) : !res.best.tier ? (
        <div className="rounded-2xl bg-rose-50 p-4 text-[14px] text-lose dark:bg-rose-500/10">
          <b>지금 잔고로 걸 수 있는 판이 없다.</b>
          <span className="mt-1 block text-[13px] text-[var(--ink-2)]">한 판 상한(기본: 잔고의 50%)이나 전재산 금지 규칙 때문일 수 있다 — 아래 세부 설정.</span>
        </div>
      ) : (
        <Main res={res} busy={busy} balance={balance} target={target} onPlay={play} />
      )}

    </Card>
  )
}

function Main({ res, busy, balance, target, onPlay }: {
  res: CalcResponse; busy: boolean; balance: number; target: number; onPlay: (v: number) => void
}) {
  const t = res.best.tier!
  const win = res.best.reach
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="num text-[34px] leading-none font-extrabold tracking-tight">
          {fmt(t.cost)} <span className="text-[var(--ink-3)]">→</span> <span className="text-coin-deep dark:text-coin">{fmt(t.payout)}</span>
        </div>
        <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[12.5px] font-bold text-[var(--ink-2)]">{oddsText(t.p)} 확률</span>
      </div>

      {/* 성공/실패 갈림 막대 */}
      <div className="mt-5 flex h-3 overflow-hidden rounded-full" role="img" aria-label={`목표 도달 ${pct(win, 0)}, 실패 ${pct(1 - win, 0)}`}>
        <div className="bg-win transition-all duration-500" style={{ width: `${win * 100}%` }} />
        <div className="flex-1 bg-lose/80" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="num text-[24px] font-extrabold text-win">{pct(win, 0)}</div>
          <div className="text-[12.5px] text-[var(--ink-2)]"><b className="num">{fmt(target)}</b> 도달 <span className="text-win num">(+{fmt(target - balance)})</span></div>
        </div>
        <div className="text-right">
          <div className="num text-[24px] font-extrabold text-lose">{pct(1 - win, 0)}</div>
          <div className="text-[12.5px] text-[var(--ink-2)]">실패하면 약 <b className="num text-lose">−{fmt(balance)}</b></div>
        </div>
      </div>

      {/* 실제로 눌러본 결과를 넣으면 잔고가 바뀌고 다음 판이 다시 계산된다 */}
      <div className="mt-4">
        <div className="mb-2 text-[12.5px] font-semibold text-[var(--ink-3)]">눌러봤으면 결과를 알려줘 → 다음 판 계산</div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={() => onPlay(balance + t.profit)}
            className="rounded-2xl bg-win px-3 py-3 text-[15px] font-extrabold text-white transition active:scale-[.98] disabled:opacity-50">
            이겼다 <span className="num font-bold opacity-85">+{fmt(t.profit)}</span>
          </button>
          <button type="button" disabled={busy} onClick={() => onPlay(balance - t.cost)}
            className="rounded-2xl bg-lose px-3 py-3 text-[15px] font-extrabold text-white transition active:scale-[.98] disabled:opacity-50">
            졌다 <span className="num font-bold opacity-85">−{fmt(t.cost)}</span>
          </button>
        </div>
      </div>
    </>
  )
}
