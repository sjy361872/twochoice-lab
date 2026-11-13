import { useState } from 'react'
import { fmt, pct } from '../lib/format'
import type { TierDict } from '../nibuichi/tiers'
import type { TreeNode } from '../nibuichi/plan'
import type { StepInfo } from '../nibuichi/useNibuichi'
import type { Candidate, Fork, WorkerResponse } from '../nibuichi/worker'
import { Card, SectionTitle } from './ui'

const tierText = (t: Pick<TierDict, 'cost' | 'payout' | 'prob'>) => `${fmt(t.cost)}→${fmt(t.payout)}${t.prob !== '1/2' ? ` (${t.prob})` : ''}`
/** 1위와의 차이(%p). 아주 작으면 자릿수를 늘려 '0.00' 으로 보이지 않게 */
const gapText = (g: number) => { const pp = Math.max(0, g * 100); return pp >= 0.01 ? pp.toFixed(2) : pp >= 0.001 ? pp.toFixed(3) : '0.000' }
const refOf = (t: TierDict) => ({ cost: t.cost, payout: t.payout, prob: t.prob })

interface Snapshot { balance: number; last: StepInfo | null }

/**
 * 3번: 지금 누를 판 + 성공/실패 막대 + 사실상 같은 판 + 갈림길 + 경로 미리보기 + 이겼다/졌다.
 * 정직성 원칙: 성공 확률만 크게 두지 않는다 — 실패 몫과 그때 남는 돈을 같은 줄에 같은 크기로.
 */
export function ResultPanel({ res, busy, buildMs, balance, target, floor, last, stopLossTooHigh, onPress, onRestore }: {
  res: WorkerResponse | null; busy: boolean; buildMs: number | null; balance: number; target: number; floor: number
  last: StepInfo | null; stopLossTooHigh: boolean
  onPress: (s: StepInfo) => void; onRestore: (s: Snapshot) => void
}) {
  const [history, setHistory] = useState<Snapshot[]>([])   // 되돌리기용
  const reached = balance > 0 && target > 0 && balance >= target
  const press = (s: StepInfo) => { setHistory([...history.slice(-49), { balance, last }]); onPress(s) }
  const undo = () => { const h = history.slice(); const prev = h.pop(); if (prev) { setHistory(h); onRestore(prev) } }
  const fresh = res && res.ok && res.balance === balance ? res : null
  const approx = fresh?.meta && !fresh.meta.exact ? fresh.meta : null

  return (
    <Card className={busy ? 'opacity-80 transition' : 'transition'}>
      <SectionTitle step={3} title="지금 누를 판" hint={busy ? '계산 중…' : approx
        ? <span title={`칸이 많아 ${approx.calc_unit}pt 단위로 묶어 계산했다 (거는 돈 올림·받는 돈 내림 → 확률은 실제보다 같거나 낮게)`}
            className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[11.5px] font-semibold">근사 · {fmt(approx.calc_unit)}pt 단위</span>
        : undefined} />
      {history.length > 0 && (
        <button type="button" onClick={undo}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-[var(--edge)] bg-[var(--surface)] py-3 text-[15px] font-extrabold shadow-[0_3px_0_var(--edge)] text-[var(--ink)] transition hover:border-[var(--ink-3)] active:scale-[.99]">
          ↶ 되돌리기 <span className="num text-[13px] font-semibold text-[var(--ink-3)]">({fmt(history[history.length - 1].balance)}pt로)</span>
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
      ) : stopLossTooHigh ? (
        <div className="rounded-2xl bg-rose-50 p-4 text-[14px] text-lose dark:bg-rose-500/10">
          <b>잔고가 손절선 이하다.</b>
          <span className="mt-1 block text-[13px] text-[var(--ink-2)]">손절선까지 왔으면 멈추는 게 계획이었다. 계속하려면 손절선을 낮추거나 비워줘.</span>
        </div>
      ) : res && !res.ok && res.id ? (
        <p className="rounded-2xl bg-rose-50 p-4 text-[13.5px] text-lose dark:bg-rose-500/10">계산할 수 없는 입력이다: {res.error}</p>
      ) : !fresh ? (
        <p className="text-[14px] text-[var(--ink-3)]">{busy || res ? '계산 중…' : '포인트, 목표(지금보다 크게), 판을 하나 이상 넣으면 여기 결과가 나온다.'}</p>
      ) : fresh.advice!.status !== 'play' || !fresh.candidates?.length ? (
        <div className="rounded-2xl bg-rose-50 p-4 text-[14px] text-lose dark:bg-rose-500/10">
          <b>지금 걸 수 있는 판이 없다.</b>
          <span className="mt-1 block text-[13px] text-[var(--ink-2)]">{floor > 0 ? '쓸 수 있는 돈(잔고 − 손절선)이 가장 싼 판보다 적다.' : '가장 싼 판보다 잔고가 적다.'}</span>
        </div>
      ) : (
        <Main key={`${fresh.balance}|${fresh.key}`} r={fresh} balance={balance} target={target} floor={floor} onPress={press} />
      )}
      {fresh && buildMs != null && <p className="mt-3 text-right text-[11px] text-[var(--ink-3)]">표 계산 {fmt(buildMs)}ms · 이후 안내는 표 조회</p>}
    </Card>
  )
}

function Main({ r, balance, target, floor, onPress }: {
  r: WorkerResponse; balance: number; target: number; floor: number; onPress: (s: StepInfo) => void
}) {
  const a = r.advice!
  const cands = r.candidates!
  const [sel, setSel] = useState(0)
  const c: Candidate = cands[Math.min(sel, cands.length - 1)]
  const t = c.tier
  const win = c.reach_prob
  const stayId = a.stay_ok && a.stay_tier ? a.stay_tier.id : null
  const recIsStay = stayId != null && stayId === cands[0].tier.id
  const go = (won: boolean) => onPress({ before: balance, tier: refOf(t), won, after: won ? balance - t.cost + t.payout : balance - t.cost })

  return (
    <>
      {recIsStay && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border-2 border-win bg-emerald-50 px-3 py-1 text-[13px] font-extrabold text-win dark:bg-emerald-500/10">✔ 지금 판 그대로 OK</div>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="num text-[34px] leading-none font-extrabold tracking-tight">
          {fmt(t.cost)} <span className="text-[var(--ink-3)]">→</span> <span className="text-coin">{fmt(t.payout)}</span>
        </div>
        <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[12.5px] font-bold text-[var(--ink-2)]">{t.prob} 확률</span>
      </div>

      {/* 사실상 같음: 1위와 0.1%p 안. 누르면 그 판 기준으로 버튼·갈림길이 바뀐다. 직전에 누른 판이면 맨 앞 */}
      {cands.length > 1 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[12px] font-semibold text-[var(--ink-3)]">사실상 같음 (0.1%p 이내) — 아무거나 눌러도 된다</div>
          <div className="flex flex-wrap gap-1.5">
            {cands.map((x, i) => {
              const on = i === sel
              const stay = x.tier.id === stayId && i > 0
              return (
                <button key={x.tier.id} type="button" aria-pressed={on} onClick={() => setSel(i)}
                  className={`num rounded-full border-2 px-2.5 py-1 text-[12.5px] font-bold transition ${on ? 'border-[var(--edge)] bg-coin text-white' : stay ? 'border-win bg-emerald-50 text-win dark:bg-emerald-500/10' : 'border-[var(--edge)] bg-[var(--surface)] text-[var(--ink)]'}`}>
                  {stay && '✔ 지금 판 그대로 OK · '}{tierText(x.tier)} {i === 0 ? <span className="opacity-80">1위</span> : <span className="opacity-80">−{gapText(cands[0].reach_prob - x.reach_prob)}%p</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 성공/실패 갈림 막대 */}
      <div className="mt-5 flex h-3 overflow-hidden rounded-full" role="img" aria-label={`목표 도달 ${pct(win)}, 실패 ${pct(1 - win)}`}>
        <div className="bg-win transition-all duration-500" style={{ width: `${win * 100}%` }} />
        <div className="flex-1 bg-lose/80" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="num text-[24px] font-extrabold text-win" data-testid="reach">{pct(win)}</div>
          <div className="text-[12.5px] text-[var(--ink-2)]"><b className="num">{fmt(target)}</b> 도달 <span className="text-win num">(+{fmt(target - balance)})</span></div>
        </div>
        <div className="text-right">
          <div className="num text-[24px] font-extrabold text-lose">{pct(1 - win)}</div>
          <div className="text-[12.5px] text-[var(--ink-2)]">{floor > 0
            ? <>실패해도 <b className="num text-[var(--ink)]">{fmt(floor)}pt</b> 남음 <span className="text-[var(--ink-3)]">(손절선)</span></>
            : <>실패하면 약 <b className="num text-lose">−{fmt(balance)}</b></>}</div>
        </div>
      </div>

      {/* 갈림길 한 줄씩 */}
      <div className="mt-4 grid gap-1.5 text-[13px]">
        <ForkLine label="이기면" tone="win" f={c.win} />
        <ForkLine label="지면" tone="lose" f={c.lose} />
      </div>

      {/* 이겼다/졌다 → step 으로 반영 (고른 판 기준) */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => go(true)}
          className="rounded-2xl border-2 border-[var(--edge)] bg-win px-3 py-3 shadow-[0_3px_0_var(--edge)] text-[15px] font-extrabold text-white transition active:scale-[.98]">
          이겼다 <span className="num font-bold opacity-85">+{fmt(t.payout - t.cost)}</span>
        </button>
        <button type="button" onClick={() => go(false)}
          className="rounded-2xl border-2 border-[var(--edge)] bg-lose px-3 py-3 shadow-[0_3px_0_var(--edge)] text-[15px] font-extrabold text-white transition active:scale-[.98]">
          졌다 <span className="num font-bold opacity-85">−{fmt(t.cost)}</span>
        </button>
      </div>

      <Preview r={r} />
    </>
  )
}

function ForkLine({ label, tone, f }: { label: string; tone: 'win' | 'lose'; f: Fork }) {
  return (
    <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl px-3 py-1.5 ${tone === 'win' ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-rose-50 dark:bg-rose-500/10'}`}>
      <b className={tone === 'win' ? 'text-win' : 'text-lose'}>{label}</b>
      <span className="num font-bold">{fmt(f.balance)}pt</span>
      <span className="text-[var(--ink-3)]">→</span>
      {f.status === 'reached' ? <b className="text-win">목표 도착!</b>
        : f.status === 'no_move' ? <span className="font-semibold text-lose">누를 판 없음 (끝)</span>
        : <span className="num font-semibold">다음 {tierText(f.next!)}{f.near_tie_count > 0 && <span className="ml-1 text-[11.5px] text-[var(--ink-3)]">+{f.near_tie_count} 같음</span>}</span>}
      {f.status === 'play' && <b className="num ml-auto">{pct(f.reach_prob)}</b>}
    </div>
  )
}

/** 경로 미리보기 (추천대로 할 때): 연승 경로 + 갈림길 트리 3단계 */
function Preview({ r }: { r: WorkerResponse }) {
  const path = r.path!
  return (
    <details className="mt-4 rounded-2xl bg-[var(--surface-2)] p-3 text-[13px]">
      <summary className="cursor-pointer font-semibold text-[var(--ink-2)]">경로 미리보기 <span className="font-normal text-[var(--ink-3)]">(추천대로 하면)</span></summary>
      <div className="mt-3">
        <div className="font-bold">
          {path.end_status === 'reached'
            ? <>연승하면 <span className="num text-coin">{path.presses}판</span> 만에 도착 <span className="num font-semibold text-[var(--ink-3)]">(전부 이길 확률 {pct(path.prob_all_wins)})</span></>
            : <>연승해도 도착하지 못한다</>}
        </div>
        <div className="num mt-1.5 flex flex-wrap items-center gap-1 text-[12.5px]">
          {path.steps.slice(0, 12).map((s) => (
            <span key={s.step} className="inline-flex items-center gap-1">
              <span className="font-semibold text-[var(--ink-2)]">{fmt(s.balance_before)}</span>
              <span className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-1.5 font-bold">{tierText(s.tier)}</span>
              <span className="text-[var(--ink-3)]">→</span>
            </span>
          ))}
          <b className={path.end_status === 'reached' ? 'text-win' : ''}>{fmt(path.end_balance)}</b>
        </div>
      </div>
      <div className="mt-4 font-bold">갈림길 3단계</div>
      <ul className="mt-1.5 grid gap-1">
        <TreeRow n={r.tree!} depth={0} />
      </ul>
    </details>
  )
}

function TreeRow({ n, depth }: { n: TreeNode; depth: number }) {
  const side = n.path.slice(-1)
  return (
    <>
      <li className="num flex flex-wrap items-baseline gap-x-1.5 rounded-lg bg-[var(--surface)] px-2 py-1 text-[12.5px]" style={{ marginLeft: depth * 14 }}>
        {side && <b className={side === 'W' ? 'text-win' : 'text-lose'}>{side === 'W' ? '이김' : '짐'}</b>}
        <span className="font-bold">{fmt(n.balance)}</span>
        {n.status === 'reached' ? <b className="text-win">도착</b>
          : n.status === 'no_move' ? <span className="text-lose">끝</span>
          : <>
              <span className="text-[var(--ink-2)]">{tierText(n.tier!)}</span>
              {n.near_tie_count > 0 && <span className="rounded bg-[var(--surface-2)] px-1 text-[11px] font-semibold text-[var(--ink-3)]">+{n.near_tie_count} 같음</span>}
              <span className="font-semibold">{pct(n.reach_prob)}</span>
            </>}
        {depth > 0 && <span className="ml-auto text-[11px] text-[var(--ink-3)]">올 확률 {pct(n.arrive_prob)}</span>}
      </li>
      {n.win && <TreeRow n={n.win} depth={depth + 1} />}
      {n.lose && <TreeRow n={n.lose} depth={depth + 1} />}
    </>
  )
}
