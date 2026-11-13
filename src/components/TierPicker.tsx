import { useEffect, useState } from 'react'
import { SAMPLE_TABLE } from '../engine/defaults'
import { parseTiers, rtpOf } from '../engine/parse'
import type { Tier } from '../engine/types'
import { fmt, oddsText, pct } from '../lib/format'
import { Badge, Card, SectionTitle, Seg } from './ui'

/** scripts/fetch-nibuichi.mjs 가 만드는 자동 목록 */
interface AutoItem {
  id: string; name: string; price: number; remaining: number | null; quantity: number | null
  url: string; payout: number | null; p: number | null; confidence: number
}

const tierOf = (cost: number, payout: number, p: number | null): Tier =>
  ({ cost, payout, profit: payout - cost, m: payout / cost, p: p != null && Math.abs(p - 0.5) > 1e-9 ? p : null })

export function TierPicker({ tiers, onChange }: { tiers: Tier[]; onChange: (t: Tier[]) => void }) {
  const [tab, setTab] = useState<'auto' | 'manual'>('auto')
  const [auto, setAuto] = useState<{ fetchedAt: string | null; items: AutoItem[] } | null>(null)
  const [cost, setCost] = useState('')
  const [pay, setPay] = useState('')
  const [odds, setOdds] = useState('0.5')
  const [paste, setPaste] = useState('')
  const [edit, setEdit] = useState<Record<string, string>>({})
  const [q, setQ] = useState('')

  useEffect(() => {
    // 데이터는 저장소의 data 브랜치(1시간마다 Actions 가 갱신)에서 바로 읽는다 → 사이트 재배포 없이 최신.
    //   로컬 개발이나 주소 미설정이면 함께 배포된 public/data 파일을 쓴다.
    const url = (import.meta.env.VITE_DATA_URL as string | undefined) || `${import.meta.env.BASE_URL}data/nibuichi.json`
    fetch(`${url}?h=${Math.floor(Date.now() / 600000)}`).then((r) => r.json()).then(setAuto).catch(() => setAuto({ fetchedAt: null, items: [] }))
  }, [])

  const has = (t: Tier) => tiers.some((x) => x.cost === t.cost && x.payout === t.payout && x.p === t.p)
  const add = (t: Tier) => { if (!has(t)) onChange([...tiers, t].sort((a, b) => a.cost - b.cost)) }
  const remove = (t: Tier) => onChange(tiers.filter((x) => x !== t))

  const addManual = () => {
    const c = +cost.replace(/[^\d]/g, ''), y = +pay.replace(/[^\d]/g, '')
    if (c > 0 && y > c && y <= c * 10) { add(tierOf(c, y, +odds)); setCost(''); setPay('') }
  }
  const addPaste = () => {
    const { tiers: got } = parseTiers(paste)
    const merged = [...tiers]
    for (const t of got) if (!merged.some((x) => x.cost === t.cost && x.payout === t.payout && x.p === t.p)) merged.push(t)
    onChange(merged.sort((a, b) => a.cost - b.cost)); setPaste('')
  }

  return (
    <Card>
      <SectionTitle step={2} title="판 고르기" hint="걸 수 있는 니부이치 판을 모아둔다" />
      <Seg value={tab} onChange={setTab} options={[{ v: 'auto', label: '지금 열린 둘 중 하나' }, { v: 'manual', label: '직접 입력' }]} />

      {tab === 'auto' ? (
        <div className="mt-4">
          {!auto?.items.length ? (
            <p className="rounded-2xl bg-[var(--surface-2)] p-4 text-[13.5px] text-[var(--ink-2)]">
              아직 자동 목록이 없다. <b>직접 입력</b> 탭에서 "500 900"처럼 넣어줘.
            </p>
          ) : (
            <>
              <p className="mb-3 text-[12.5px] text-[var(--ink-3)]">
                가격은 자동으로 채워진다. <b>이기면 받는 pt</b>는 가챠 썸네일(이름을 누르면 열림)에 적힌 값을 넣고 <b>추가</b>를 눌러줘. 자동 인식된 값도 꼭 확인!
                {auto.fetchedAt && <> · {new Date(auto.fetchedAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })} 기준</>}
              </p>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름이나 가격으로 찾기 (예: 500)"
                className="mb-2 w-full rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-[14px] outline-none focus:border-coin-deep" />
              <ul className="grid max-h-[460px] gap-2 overflow-y-auto pr-1">
                {auto.items.filter((it) => !q.trim() || it.name.toLowerCase().includes(q.trim().toLowerCase()) || String(it.price).startsWith(q.replace(/[^\d]/g, '') || '§')).map((it) => {
                  const guess = it.payout && it.confidence >= 0.5 ? it.payout : null
                  const e = edit[it.id] ?? (guess ? String(guess) : '')
                  const y = +e.replace(/[^\d]/g, '')
                  const t = y > it.price ? tierOf(it.price, y, it.p ?? 0.5) : null
                  const added = t ? has(t) : false
                  return (
                    <li key={it.id} className="rounded-2xl border border-[var(--line)] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <a href={it.url} target="_blank" rel="noopener" className="min-w-0 text-[14px] leading-snug font-semibold break-words hover:underline">{it.name}</a>
                        {guess ? <Badge tone="warn">자동 인식 · 확인</Badge> : <Badge>썸네일 보고 입력</Badge>}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="num text-[15px] font-extrabold">{fmt(it.price)}</span>
                        <span className="font-bold text-[var(--ink-3)]">→</span>
                        <input value={e} inputMode="numeric" placeholder="받는 pt" aria-label="이기면 받는 포인트"
                          onChange={(ev) => setEdit({ ...edit, [it.id]: ev.target.value })}
                          onKeyDown={(ev) => ev.key === 'Enter' && t && add(t)}
                          className="num w-28 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5 text-right text-[15px] font-bold outline-none focus:border-coin-deep" />
                        <span className="text-[12px] font-semibold text-[var(--ink-3)]">{oddsText(it.p ?? 0.5)}</span>
                        {it.remaining != null && it.quantity != null && <span className="num text-[12px] text-[var(--ink-3)]">남은 {fmt(it.remaining)}/{fmt(it.quantity)}</span>}
                        <button type="button" disabled={!t || added} onClick={() => t && add(t)}
                          className="ml-auto rounded-xl bg-night px-3.5 py-2 text-[13px] font-bold text-white transition disabled:opacity-35 dark:bg-coin dark:text-night">
                          {added ? '추가됨' : '추가'}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-[12px] font-semibold text-[var(--ink-2)]">거는 pt
              <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="numeric" placeholder="500"
                className="num w-28 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[16px] font-bold outline-none focus:border-coin-deep" /></label>
            <span className="pb-3 font-bold text-[var(--ink-3)]">→</span>
            <label className="grid gap-1 text-[12px] font-semibold text-[var(--ink-2)]">이기면 받는 pt
              <input value={pay} onChange={(e) => setPay(e.target.value)} inputMode="numeric" placeholder="900"
                onKeyDown={(e) => e.key === 'Enter' && addManual()}
                className="num w-28 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[16px] font-bold outline-none focus:border-coin-deep" /></label>
            <label className="grid gap-1 text-[12px] font-semibold text-[var(--ink-2)]">확률
              <select value={odds} onChange={(e) => setOdds(e.target.value)}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-[15px] font-bold outline-none">
                <option value="0.5">1/2</option>
                <option value={String(1 / 1.9)}>1/1.9</option>
                <option value={String(1 / 3)}>1/3</option>
                <option value="0.25">1/4</option>
              </select></label>
            <button type="button" onClick={addManual}
              className="rounded-xl bg-night px-4 py-2.5 text-[14px] font-bold text-white dark:bg-coin dark:text-night">추가</button>
          </div>
          <details className="rounded-2xl bg-[var(--surface-2)] p-3 text-[13px]">
            <summary className="cursor-pointer font-semibold text-[var(--ink-2)]">여러 줄 한 번에 붙여넣기</summary>
            <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={4}
              placeholder={'300 540\n500 900\n10000 17000 1/1.9'}
              className="num mt-2 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 font-mono text-[13px] outline-none" />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={addPaste} className="rounded-xl bg-night px-3 py-1.5 font-bold text-white dark:bg-coin dark:text-night">붙여넣은 줄 추가</button>
              <button type="button" onClick={() => setPaste(SAMPLE_TABLE)} className="rounded-xl border border-[var(--line)] px-3 py-1.5 font-semibold text-[var(--ink-2)]">예시 배당표 채우기</button>
            </div>
          </details>
        </div>
      )}

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[var(--ink-2)]">모아둔 판 {tiers.length}개</span>
          {tiers.length > 0 && <button type="button" onClick={() => onChange([])} className="text-[12px] font-semibold text-[var(--ink-3)] hover:text-lose">모두 지우기</button>}
        </div>
        {tiers.length === 0 ? (
          <p className="text-[13px] text-[var(--ink-3)]">아직 없다. 위에서 판을 추가해줘.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tiers.map((t) => (
              <span key={`${t.cost}/${t.payout}/${t.p}`} className="num inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-2)] py-1 pr-1 pl-3 text-[13px] font-bold">
                {fmt(t.cost)}→{fmt(t.payout)}
                <span className="font-semibold text-[var(--ink-3)]">{oddsText(t.p)} · {pct(rtpOf(t, 0.5), 0)}</span>
                <button type="button" onClick={() => remove(t)} aria-label="삭제"
                  className="grid h-6 w-6 place-items-center rounded-full text-[var(--ink-3)] hover:bg-[var(--line)] hover:text-lose">×</button>
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
