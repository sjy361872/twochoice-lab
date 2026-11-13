import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SimResponse } from '../engine/sim.worker'
import { STRATEGIES, type StrategyId } from '../engine/strategies'
import type { Tier } from '../engine/types'
import { fmt, pct, signed } from '../lib/format'
import { Card, SectionTitle, Seg } from './ui'

const COLORS = ['#c98a12', '#3b6fd8', '#12a17a', '#e5484d', '#8b5cf6', '#0ea5b7']

export function StrategyCompare({ res, busy, tiers, base, onBase, roundLimit, onRoundLimit, balance, target }: {
  res: SimResponse | null; busy: boolean; tiers: Tier[]; base: Tier | null; onBase: (t: Tier) => void
  roundLimit: number; onRoundLimit: (n: number) => void; balance: number; target: number
}) {
  const [sel, setSel] = useState<StrategyId>('optimal')
  const cur = res?.results.find((r) => r.strategy === sel)
  const chart = useMemo(() => {
    if (!cur) return []
    const len = Math.max(...cur.paths.map((p) => p.length))
    return Array.from({ length: len }, (_, i) => {
      const row: Record<string, number> = { i }
      cur.paths.forEach((p, k) => { if (i < p.length) row[`p${k}`] = p[i] })
      return row
    })
  }, [cur])

  return (
    <Card>
      <SectionTitle step={4} title="베팅 기법 비교" hint={busy ? '시뮬레이션 중…' : '각 8,000번씩 가상으로 돌려본 결과'} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[13px] font-semibold text-[var(--ink-2)]">
          기본 판
          <select value={base ? tiers.indexOf(base) : -1} onChange={(e) => onBase(tiers[+e.target.value])}
            className="num rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5 font-bold text-[var(--ink)] outline-none">
            {tiers.map((t, i) => <option key={i} value={i}>{fmt(t.cost)} → {fmt(t.payout)}</option>)}
          </select>
        </label>
        <Seg value={roundLimit} onChange={onRoundLimit}
          options={[{ v: 0, label: '판 수 제한 없음' }, { v: 10, label: '10판' }, { v: 30, label: '30판' }, { v: 100, label: '100판' }]} />
      </div>
      <p className="mt-2 text-[12px] text-[var(--ink-3)]">기본 판은 고정·마틴게일·파롤리·달랑베르가 시작하는 판이다. 최적은 매번 스스로 고른다.</p>

      {!res ? (
        <p className="mt-4 text-[14px] text-[var(--ink-3)]">{busy ? '계산 중…' : '위 입력이 채워지면 비교가 나온다.'}</p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="num w-full min-w-[520px] text-[13.5px]">
              <thead>
                <tr className="text-left text-[11.5px] text-[var(--ink-3)]">
                  <th className="py-2 font-semibold">기법</th>
                  <th className="py-2 text-right font-semibold">목표 도달</th>
                  <th className="py-2 text-right font-semibold">평균 손익</th>
                  <th className="py-2 text-right font-semibold">사실상 전멸</th>
                  <th className="py-2 text-right font-semibold">평균 판수</th>
                </tr>
              </thead>
              <tbody>
                {STRATEGIES.map((s) => {
                  const r = res.results.find((x) => x.strategy === s.id)!
                  const on = sel === s.id
                  return (
                    <tr key={s.id} onClick={() => setSel(s.id)}
                      className={`cursor-pointer border-t border-[var(--line)] transition ${on ? 'bg-coin/10' : 'hover:bg-[var(--surface-2)]'}`}>
                      <td className="py-2.5 pr-2">
                        <div className="font-bold">{s.name}</div>
                        <div className="text-[11.5px] font-normal text-[var(--ink-3)]">{s.short}</div>
                      </td>
                      {r.noBet ? (
                        <td colSpan={4} className="py-2.5 text-right text-[12.5px] font-semibold text-[var(--ink-2)]">
                          환원율이 100% 미만이라 켈리 공식은 <b>걸지 않기</b>가 정답이다
                        </td>
                      ) : (
                        <>
                          <td className="py-2.5 text-right">
                            <div className="font-extrabold">{pct(r.reach)}</div>
                            <div className="ml-auto mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-[var(--line)]">
                              <div className="h-full rounded-full bg-coin-deep" style={{ width: pct(r.reach) }} />
                            </div>
                          </td>
                          <td className={`py-2.5 text-right font-bold ${r.meanPnl < 0 ? 'text-lose' : 'text-win'}`}>{signed(r.meanPnl)}</td>
                          <td className="py-2.5 text-right">{pct(r.wipe)}</td>
                          <td className="py-2.5 text-right">{r.avgRounds.toFixed(1)}{r.unfinished > 0.01 && <div className="text-[11px] font-semibold text-amber-600">{pct(r.unfinished, 0)}는 5,000판 안에 안 끝남</div>}</td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {cur && !cur.noBet && chart.length > 1 && (
            <div className="mt-5">
              <div className="mb-1 text-[13px] font-bold text-[var(--ink-2)]">
                {STRATEGIES.find((s) => s.id === sel)?.name} — 가상 플레이 {cur.paths.length}번의 잔고 변화
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer>
                  <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="i" tick={{ fontSize: 11, fill: 'var(--ink-3)' }} tickLine={false} axisLine={false} />
                    <YAxis width={56} tick={{ fontSize: 11, fill: 'var(--ink-3)' }} tickLine={false} axisLine={false}
                      tickFormatter={(v: number) => (v >= 10000 ? `${Math.round(v / 1000)}k` : String(v))} />
                    <Tooltip formatter={(v) => fmt(Number(v))} labelFormatter={(l) => `${l}판째`}
                      contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 12 }} />
                    <ReferenceLine y={target} stroke="var(--color-win)" strokeDasharray="4 4" />
                    <ReferenceLine y={balance} stroke="var(--ink-3)" strokeDasharray="2 4" />
                    {cur.paths.map((_, k) => (
                      <Line key={k} dataKey={`p${k}`} dot={false} strokeWidth={2} stroke={COLORS[k % COLORS.length]} isAnimationActive={false} connectNulls={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[12px] text-[var(--ink-3)]">초록 점선이 목표, 회색 점선이 시작 잔고. 선 하나가 한 번의 가상 플레이다.</p>
            </div>
          )}
        </>
      )}
    </Card>
  )
}
