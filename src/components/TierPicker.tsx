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
  thumb?: string | null      // 썸네일 주소 (클로브 이미지 저장소, 다시 올리지 않고 그대로 띄움)
  title_ko?: string | null   // 한국어 썸네일에 적힌 제목 (Gemini 판독). 없으면 일본어 이름
}
const nameOf = (it: AutoItem) => it.title_ko || it.name
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

export function TierPicker({ tiers, onChange, autoSelectAll, balance, capFrac, allIn }: {
  tiers: Tier[]; onChange: (t: Tier[]) => void; autoSelectAll: boolean; balance: number; capFrac: number; allIn: boolean
}) {
  const [showLocked, setShowLocked] = useState(false)
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
  const hit = (it: AutoItem) => !qq || it.name.toLowerCase().includes(qq) || (it.title_ko ?? '').toLowerCase().includes(qq) || String(it.price).startsWith(qq.replace(/[^\d]/g, '') || '§')
  const shown = rows.filter((r) => okRange(r.tier.cost) && r.items.some(hit))
  // 지금 잔고로 걸 수 있나 — 계산 엔진과 같은 규칙: 한 판 상한(기본 없음) + 올인 허용 여부
  const canBet = (t: Tier) => (allIn ? t.cost <= balance : t.cost < balance) && (capFrac >= 1 || t.cost <= balance * capFrac + 1e-9)
  const needBal = (t: Tier) => (capFrac >= 1 ? (allIn ? t.cost : t.cost + 1) : Math.ceil(t.cost / capFrac))
  const okRows = shown.filter((r) => canBet(r.tier))
  const lockedRows = shown.filter((r) => !canBet(r.tier))
  const visible = showLocked ? shown : okRows
  const usable = tiers.filter(canBet).length
  const manual = tiers.filter((t) => !rows.some((r) => sameTier(r.tier, t)))
  const setAll = (on: boolean) => {
    const keys = new Set(visible.map((r) => r.key))
    const rest = tiers.filter((t) => !keys.has(keyOf(t)))
    onChange((on ? [...rest, ...visible.map((r) => r.tier)] : rest).sort((a, b) => a.cost - b.cost))
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

          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12.5px]">
            <span className="text-[var(--ink-3)]">
              고른 판 <b className="num text-[var(--ink)]">{tiers.length}</b>개
              {usable < tiers.length && <> · 지금 걸 수 있는 건 <b className="num text-[var(--ink)]">{usable}</b>개</>}
            </span>
            <span className="flex shrink-0 gap-3 font-semibold whitespace-nowrap">
              <button type="button" onClick={() => setAll(true)} className="text-coin-deep hover:underline dark:text-coin">모두 고르기</button>
              <button type="button" onClick={() => setAll(false)} className="text-[var(--ink-3)] hover:text-lose">해제</button>
            </span>
          </div>

          <ul className="grid max-h-[520px] grid-cols-[minmax(0,1fr)] gap-1.5 overflow-y-auto pr-1">
            {/* 화면은 가챠 한 줄씩(그림·남은 수량이 가챠마다 다르다), 선택은 배당 단위(같은 배당이면 계산상 같은 판) */}
            {okRows.flatMap((r) => r.items.filter(hit).map((it) => (
              <GachaRow key={it.id} it={it} tier={r.tier} checked={r.checked} twins={r.items.length - 1} onToggle={() => toggle(r.tier)} />
            )))}
            {!okRows.length && <li className="py-4 text-center text-[13px] text-[var(--ink-3)]">{shown.length ? '지금 잔고로 걸 수 있는 판이 없다' : '조건에 맞는 판이 없다'}</li>}
            {lockedRows.length > 0 && (
              <li>
                <button type="button" onClick={() => setShowLocked(!showLocked)}
                  className="flex w-full items-center justify-between gap-2 rounded-2xl border-2 border-dashed border-[var(--line)] px-3 py-2.5 text-left text-[13px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-2)]">
                  <span>🔒 지금 잔고로 못 거는 판 <b className="num">{lockedRows.reduce((a, r) => a + r.items.filter(hit).length, 0)}개</b>
                    <span className="block text-[11.5px] font-normal text-[var(--ink-3)]">한 판 최대 <b className="num">{fmt(capFrac >= 1 ? (allIn ? balance : balance - 1) : balance * capFrac)}pt</b>{capFrac < 1 && <> (잔고의 {Math.round(capFrac * 100)}%)</>} — 골라두면 잔고가 늘었을 때 계산에 들어간다</span></span>
                  <span className="shrink-0 text-[12px]">{showLocked ? '접기 ▲' : '보기 ▼'}</span>
                </button>
              </li>
            )}
            {showLocked && lockedRows.flatMap((r) => r.items.filter(hit).map((it) => (
              <GachaRow key={it.id} it={it} tier={r.tier} checked={r.checked} twins={r.items.length - 1} onToggle={() => toggle(r.tier)} lockedFrom={needBal(r.tier)} />
            )))}
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
                  <a href={it.url} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate font-semibold hover:underline">{nameOf(it)}</a>
                  <span className="num font-bold">{fmt(it.price)} →</span>
                  <input value={fix[it.id] ?? ''} onChange={(e) => setFix({ ...fix, [it.id]: e.target.value })} inputMode="numeric" placeholder="받는 pt"
                    className="num w-24 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-1 text-right font-bold outline-none focus:border-coin-deep" />
                  <button type="button" disabled={!t} onClick={() => t && !tiers.some((x) => sameTier(x, t)) && toggle(t)}
                    className="rounded-lg bg-night px-2.5 py-1 text-[12.5px] font-bold text-white disabled:opacity-35 dark:bg-coin dark:text-white">추가</button>
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

function GachaRow({ it, tier: t, checked, twins, onToggle, lockedFrom }: {
  it: AutoItem; tier: Tier; checked: boolean; twins: number; onToggle: () => void; lockedFrom?: number
}) {
  const rtp = rtpOf(t, 0.5)
  const left = it.remaining != null && it.quantity ? it.remaining / it.quantity : null
  const img = it.thumb && /^https?:/.test(it.thumb) ? it.thumb : null
  return (
    <li role="button" tabIndex={0} aria-pressed={checked} onClick={onToggle}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      className={`flex cursor-pointer gap-2.5 rounded-2xl border-2 p-2 transition outline-none focus-visible:ring-2 focus-visible:ring-coin ${lockedFrom ? 'opacity-60 ' : ''}${checked
        ? 'border-coin bg-coin/10' : 'border-[var(--edge)] bg-[var(--surface)] hover:bg-[var(--surface-2)]'}`}>
      <div className="relative w-[104px] shrink-0">
        {img
          ? <img src={img} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-[74px] w-[104px] rounded-[10px] border-[1.5px] border-[var(--edge)] object-cover" />
          : <div className="grid h-[74px] w-[104px] place-items-center rounded-[10px] border-[1.5px] border-[var(--edge)] bg-[var(--surface-2)] text-[11px] text-[var(--ink-3)]">그림 없음</div>}
        <span className={`absolute -top-1.5 -left-1.5 grid h-[22px] w-[22px] place-items-center rounded-[7px] border-2 border-[var(--edge)] text-[13px] font-black text-white ${checked ? 'bg-coin' : 'bg-[var(--surface)]'}`} aria-hidden>
          {checked ? '✓' : ''}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="flex items-start justify-between gap-1.5">
          <span className="truncate text-[13px] font-bold" title={it.name}>{nameOf(it)}</span>
          {lockedFrom
            ? <Badge>🔒 잔고 {fmt(lockedFrom)}부터</Badge>
            : <Badge tone={rtp >= 0.9 ? 'neutral' : 'lose'}>환원 {pct(rtp, 0)}</Badge>}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="num text-[16px] font-extrabold whitespace-nowrap">{fmt(t.cost)} <span className="text-[var(--ink-3)]">→</span> <span className="text-coin">{fmt(t.payout)}</span></span>
          <span className="text-[11px] font-semibold text-[var(--ink-3)]">{oddsText(t.p)}</span>
          {twins > 0 && <span className="shrink-0 rounded bg-[var(--surface-2)] px-1 text-[10.5px] font-semibold text-[var(--ink-3)]" title="같은 배당이라 함께 선택된다">같은 배당 +{twins}</span>}
        </div>
        <div className="flex items-center gap-2">
          {left != null && (
            <span className="flex min-w-0 flex-1 items-center gap-1.5" title={`남은 ${fmt(it.remaining!)} / 전체 ${fmt(it.quantity!)}`}>
              <span className="num shrink-0 text-[11px] text-[var(--ink-3)]">남음 {left < 0.01 ? '<1' : Math.round(left * 100)}%</span>
              <span className="h-[5px] min-w-8 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <span className="block h-full rounded-full bg-[var(--ink-3)]" style={{ width: `${Math.max(3, left * 100)}%` }} />
              </span>
            </span>
          )}
          {/* 가챠 페이지로 — 눌러도 선택은 그대로 */}
          <a href={it.url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}
            className="ml-auto shrink-0 rounded-md px-1 text-[11.5px] font-bold text-[var(--ink-2)] hover:text-[var(--ink)] hover:underline">가챠 보기 ↗</a>
        </div>
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
        <button type="button" onClick={addOne} className="rounded-xl bg-night px-4 py-2 text-[14px] font-bold text-white dark:bg-coin dark:text-white">추가</button>
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
          <button type="button" onClick={() => { merge(parseTiers(paste).tiers); setPaste('') }} className="rounded-lg bg-night px-2.5 py-1 font-bold text-white dark:bg-coin dark:text-white">추가</button>
          <button type="button" onClick={() => setPaste(SAMPLE_TABLE)} className="rounded-lg border border-[var(--line)] px-2.5 py-1 font-semibold text-[var(--ink-2)]">예시 채우기</button>
        </div>
      </details>
    </details>
  )
}
