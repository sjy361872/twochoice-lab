import { useEffect, useMemo, useRef, useState } from 'react'
import { SAMPLE_TABLE } from '../engine/defaults'
import { parseTiers, rtpOf } from '../engine/parse'
import type { Tier } from '../engine/types'
import { fmt, oddsText, pct } from '../lib/format'
import { Badge, Card, SectionTitle } from './ui'

/** scripts/fetch_nibuichi.py 가 만드는 자동 목록 (data 브랜치, 매시 15·45분) */
interface AutoItem {
  id: string; name: string; price: number; remaining: number | null; quantity: number | null
  url: string; payout: number | null; p: number | null; confidence: number; source?: string
}
interface AutoData { fetchedAt: string | null; items: AutoItem[] }

/** 같은 배당(가격·받는 pt·확률)의 가챠는 계산상 같은 판이라 한 줄로 묶는다 */
interface Row { key: string; tier: Tier; items: AutoItem[]; checked: boolean }

const tierOf = (cost: number, payout: number, p: number | null): Tier =>
  ({ cost, payout, profit: payout - cost, m: payout / cost, p: p != null && Math.abs(p - 0.5) > 1e-9 ? p : null })
const keyOf = (t: Tier) => `${t.cost}/${t.payout}/${t.p ?? ''}`
const sameTier = (a: Tier, b: Tier) => keyOf(a) === keyOf(b)

const RANGES = [
  { v: 'all', label: '전체', ok: () => true },
  { v: 's', label: '~1천', ok: (c: number) => c < 1000 },
  { v: 'm', label: '1천~1만', ok: (c: number) => c >= 1000 && c < 10000 },
  { v: 'l', label: '1만~', ok: (c: number) => c >= 10000 },
] as const

export function TierPicker({ tiers, onChange, autoSelectAll }: {
  tiers: Tier[]; onChange: (t: Tier[]) => void; autoSelectAll: boolean
}) {
  const [auto, setAuto] = useState<AutoData | null>(null)
  const [range, setRange] = useState<(typeof RANGES)[number]['v']>('all')
  const [q, setQ] = useState('')
  const [fix, setFix] = useState<Record<string, string>>({})
  const firstLoad = useRef(autoSelectAll)

  useEffect(() => {
    // 데이터는 저장소의 data 브랜치에서 바로 읽는다 → 사이트 재배포 없이 최신. 로컬 개발이면 public/data.
    const url = (import.meta.env.VITE_DATA_URL as string | undefined) || `${import.meta.env.BASE_URL}data/nibuichi.json`
    fetch(`${url}?h=${Math.floor(Date.now() / 300000)}`).then((r) => r.json()).then(setAuto).catch(() => setAuto({ fetchedAt: null, items: [] }))
  }, [])

  // 배당을 확실히 아는 가챠만 판으로 만든다 (Gemini 판독, 또는 신뢰도 높은 값)
  const known = (it: AutoItem) => it.payout != null && it.payout > it.price && it.confidence >= 0.5
  const rows: Row[] = useMemo(() => {
    const m = new Map<string, Row>()
    for (const it of auto?.items ?? []) {
      if (!known(it)) continue
      const t = tierOf(it.price, it.payout!, it.p)
      const k = keyOf(t)
      if (!m.has(k)) m.set(k, { key: k, tier: t, items: [], checked: false })
      m.get(k)!.items.push(it)
    }
    return [...m.values()].map((r) => ({ ...r, checked: tiers.some((x) => sameTier(x, r.tier)) }))
      .sort((a, b) => a.tier.cost - b.tier.cost || b.tier.payout - a.tier.payout)
  }, [auto, tiers])
  const unknown = (auto?.items ?? []).filter((it) => !known(it))

  // 처음 온 사람은 열린 판을 전부 골라둔 상태로 시작 → 바로 결과가 보인다
  useEffect(() => {
    if (firstLoad.current && rows.length && !tiers.length) { firstLoad.current = false; onChange(rows.map((r) => r.tier)) }
  }, [rows, tiers.length, onChange])

  const toggle = (t: Tier) => onChange(tiers.some((x) => sameTier(x, t)) ? tiers.filter((x) => !sameTier(x, t)) : [...tiers, t].sort((a, b) => a.cost - b.cost))
  const okRange = RANGES.find((r) => r.v === range)!.ok
  const qq = q.trim().toLowerCase()
  const shown = rows.filter((r) => okRange(r.tier.cost) && (!qq || r.items.some((it) => it.name.toLowerCase().includes(qq)) || String(r.tier.cost).startsWith(qq.replace(/[^\d]/g, '') || '§')))
  const manual = tiers.filter((t) => !rows.some((r) => sameTier(r.tier, t)))
  const setAll = (on: boolean) => {
    const keys = new Set(shown.map((r) => r.key))
    const rest = tiers.filter((t) => !keys.has(keyOf(t)))
    onChange((on ? [...rest, ...shown.map((r) => r.tier)] : rest).sort((a, b) => a.cost - b.cost))
  }

  const fetched = auto?.fetchedAt ? new Date(auto.fetchedAt) : null
  const stale = fetched && Date.now() - fetched.getTime() > 3 * 3600_000

  return (
    <Card>
      <SectionTitle step={2} title="판 고르기" hint={<>누를 수 있는 판을 <b className="text-[var(--ink-2)]">탭해서 고른다</b></>} />

      {!auto ? (
        <div className="h-24 animate-pulse rounded-2xl bg-[var(--surface-2)]" />
      ) : !rows.length ? (
        <p className="rounded-2xl bg-[var(--surface-2)] p-4 text-[13.5px] text-[var(--ink-2)]">
          지금은 자동 목록을 불러오지 못했다. 아래 <b>직접 추가</b>에서 "500 900"처럼 넣어줘.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--ink-3)]">
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${stale ? 'bg-amber-500' : 'bg-win'}`} />
              지금 열린 니부이치 <b className="num text-[var(--ink-2)]">{rows.reduce((a, r) => a + r.items.length, 0)}개</b>
            </span>
            {fetched && <span>{fetched.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })} 기준 · 30분마다 갱신</span>}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-[var(--surface-2)] p-1">
              {RANGES.map((r) => (
                <button key={r.v} type="button" onClick={() => setRange(r.v)} aria-pressed={range === r.v}
                  className={`num rounded-lg px-2.5 py-1 text-[12.5px] font-semibold transition ${range === r.v ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm' : 'text-[var(--ink-2)]'}`}>{r.label}</button>
              ))}
            </div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·가격 검색"
              className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-[13.5px] outline-none focus:border-coin-deep" />
          </div>

          <div className="mb-2 flex items-center justify-between text-[12.5px]">
            <span className="text-[var(--ink-3)]">
              고른 판 <b className="num text-[var(--ink)]">{tiers.length}</b>개
            </span>
            <span className="flex gap-3 font-semibold">
              <button type="button" onClick={() => setAll(true)} className="text-coin-deep hover:underline dark:text-coin">보이는 것 모두 고르기</button>
              <button type="button" onClick={() => setAll(false)} className="text-[var(--ink-3)] hover:text-lose">해제</button>
            </span>
          </div>

          <ul className="grid max-h-[520px] grid-cols-[minmax(0,1fr)] gap-1.5 overflow-y-auto pr-1">
            {shown.map((r) => <TierRow key={r.key} row={r} onToggle={() => toggle(r.tier)} />)}
            {!shown.length && <li className="py-6 text-center text-[13px] text-[var(--ink-3)]">조건에 맞는 판이 없다</li>}
          </ul>
        </>
      )}

      {unknown.length > 0 && (
        <details className="mt-3 rounded-2xl border border-dashed border-[var(--line)] p-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-[var(--ink-2)]">
            배당을 못 읽은 가챠 {unknown.length}개 <span className="font-normal text-[var(--ink-3)]">— 썸네일 보고 직접 넣기</span>
          </summary>
          <ul className="mt-2 grid gap-2">
            {unknown.map((it) => {
              const y = +(fix[it.id] ?? '').replace(/[^\d]/g, '')
              const t = y > it.price && y <= it.price * 10 ? tierOf(it.price, y, it.p ?? 0.5) : null
              return (
                <li key={it.id} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                  <a href={it.url} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate font-semibold hover:underline">{it.name}</a>
                  <span className="num font-bold">{fmt(it.price)} →</span>
                  <input value={fix[it.id] ?? ''} onChange={(e) => setFix({ ...fix, [it.id]: e.target.value })} inputMode="numeric" placeholder="받는 pt"
                    className="num w-24 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-right font-bold outline-none focus:border-coin-deep" />
                  <button type="button" disabled={!t} onClick={() => t && !tiers.some((x) => sameTier(x, t)) && toggle(t)}
                    className="rounded-lg bg-night px-2.5 py-1 text-[12.5px] font-bold text-white disabled:opacity-35 dark:bg-coin dark:text-night">추가</button>
                </li>
              )
            })}
          </ul>
        </details>
      )}

      <ManualAdd tiers={tiers} manual={manual} onChange={onChange} />
    </Card>
  )
}

function TierRow({ row, onToggle }: { row: Row; onToggle: () => void }) {
  const { tier: t, items, checked } = row
  const rtp = rtpOf(t, 0.5)
  const left = items.reduce((a, it) => a + (it.remaining ?? 0), 0)
  const total = items.reduce((a, it) => a + (it.quantity ?? 0), 0)
  return (
    <li className={`overflow-hidden rounded-2xl border transition ${checked ? 'border-coin-deep bg-coin/10 dark:border-coin' : 'border-[var(--line)] hover:border-[var(--ink-3)]'}`}>
      <button type="button" onClick={onToggle} aria-pressed={checked} className="flex w-full items-center gap-3 px-3 pt-2.5 pb-1.5 text-left">
        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 text-[12px] font-black ${checked
          ? 'border-coin-deep bg-coin-deep text-white dark:border-coin dark:bg-coin dark:text-night' : 'border-[var(--line)]'}`} aria-hidden>
          {checked ? '✓' : ''}
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <span className="num text-[16px] font-extrabold whitespace-nowrap">{fmt(t.cost)} <span className="text-[var(--ink-3)]">→</span> {fmt(t.payout)}</span>
          <span className="text-[12px] font-semibold text-[var(--ink-3)]">{oddsText(t.p)}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone={rtp >= 0.9 ? 'neutral' : 'lose'}>환원 {pct(rtp, 0)}</Badge>
          {total > 0 && (
            // 환원율이 아니라 '남은 양' (남은 개수 ÷ 전체). 막대만 두면 환원율 그래프로 오해해서 글자를 붙였다.
            <span className="flex items-center gap-1.5" title={`남은 ${fmt(left)} / 전체 ${fmt(total)}`}>
              <span className="num text-[11px] text-[var(--ink-3)]">남음 {left / total < 0.01 ? '<1' : Math.round((left / total) * 100)}%</span>
              <span className="h-1 w-10 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <span className="block h-full rounded-full bg-[var(--ink-3)]" style={{ width: `${Math.max(2, (left / total) * 100)}%` }} />
              </span>
            </span>
          )}
        </span>
      </button>
      {/* 가챠 페이지로 가는 링크 — 선택 버튼과 분리해서, 눌러도 선택이 바뀌지 않게 */}
      <div className="flex flex-wrap gap-1.5 px-3 pb-2.5 pl-11">
        {items.map((it) => (
          <a key={it.id} href={it.url} target="_blank" rel="noopener"
            className="inline-flex max-w-full items-center gap-1 rounded-lg bg-[var(--surface-2)] px-2 py-1 text-[12px] font-semibold text-[var(--ink-2)] transition hover:bg-[var(--line)] hover:text-[var(--ink)]">
            <span className="truncate">{it.name}</span>
            <span aria-hidden className="shrink-0">↗</span>
          </a>
        ))}
      </div>
    </li>
  )
}

function ManualAdd({ tiers, manual, onChange }: { tiers: Tier[]; manual: Tier[]; onChange: (t: Tier[]) => void }) {
  const [cost, setCost] = useState('')
  const [pay, setPay] = useState('')
  const [odds, setOdds] = useState('0.5')
  const [paste, setPaste] = useState('')
  const merge = (got: Tier[]) => {
    const out = [...tiers]
    for (const t of got) if (!out.some((x) => sameTier(x, t))) out.push(t)
    onChange(out.sort((a, b) => a.cost - b.cost))
  }
  const addOne = () => {
    const c = +cost.replace(/[^\d]/g, ''), y = +pay.replace(/[^\d]/g, '')
    if (c > 0 && y > c && y <= c * 10) { merge([tierOf(c, y, +odds)]); setCost(''); setPay('') }
  }
  const input = 'num w-24 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[15px] font-bold outline-none focus:border-coin-deep'
  return (
    <details className="mt-3 rounded-2xl bg-[var(--surface-2)] p-3" open={manual.length > 0}>
      <summary className="cursor-pointer text-[13px] font-semibold text-[var(--ink-2)]">
        목록에 없는 판 직접 추가 {manual.length > 0 && <span className="num text-[var(--ink-3)]">({manual.length}개 추가됨)</span>}
      </summary>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-[12px] font-semibold text-[var(--ink-2)]">거는 pt
          <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="numeric" placeholder="500" className={input} /></label>
        <span className="pb-2.5 font-bold text-[var(--ink-3)]">→</span>
        <label className="grid gap-1 text-[12px] font-semibold text-[var(--ink-2)]">받는 pt
          <input value={pay} onChange={(e) => setPay(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addOne()} inputMode="numeric" placeholder="900" className={input} /></label>
        <label className="grid gap-1 text-[12px] font-semibold text-[var(--ink-2)]">확률
          <select value={odds} onChange={(e) => setOdds(e.target.value)}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2 text-[14px] font-bold outline-none">
            <option value="0.5">1/2</option><option value={String(1 / 1.9)}>1/1.9</option><option value={String(1 / 3)}>1/3</option><option value="0.25">1/4</option>
          </select></label>
        <button type="button" onClick={addOne} className="rounded-xl bg-night px-4 py-2 text-[14px] font-bold text-white dark:bg-coin dark:text-night">추가</button>
      </div>
      {manual.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {manual.map((t) => (
            <span key={keyOf(t)} className="num inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] py-0.5 pr-1 pl-2.5 text-[12.5px] font-bold">
              {fmt(t.cost)}→{fmt(t.payout)} <span className="font-semibold text-[var(--ink-3)]">{oddsText(t.p)}</span>
              <button type="button" onClick={() => onChange(tiers.filter((x) => !sameTier(x, t)))} aria-label="삭제" className="grid h-5 w-5 place-items-center rounded-full text-[var(--ink-3)] hover:text-lose">×</button>
            </span>
          ))}
        </div>
      )}
      <details className="mt-3 text-[12.5px]">
        <summary className="cursor-pointer text-[var(--ink-3)]">여러 줄 붙여넣기</summary>
        <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={3} placeholder={'300 540\n10000 17000 1/1.9'}
          className="num mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 font-mono text-[13px] outline-none" />
        <div className="mt-1.5 flex gap-2">
          <button type="button" onClick={() => { merge(parseTiers(paste).tiers); setPaste('') }} className="rounded-lg bg-night px-2.5 py-1 font-bold text-white dark:bg-coin dark:text-night">추가</button>
          <button type="button" onClick={() => setPaste(SAMPLE_TABLE)} className="rounded-lg border border-[var(--line)] px-2.5 py-1 font-semibold text-[var(--ink-2)]">예시 채우기</button>
        </div>
      </details>
    </details>
  )
}
