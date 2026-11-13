import { Card, SectionTitle } from './ui'

/**
 * 4번 — 다른 방법이랑 비교 (정적 숫자).
 * 새 엔진에는 기법 비교 기능이 없어서, 계산 방법 페이지와 같은 숫자를 그대로 보여준다.
 * 출처: C:\nibuichi-engine\docs\compare_numbers.json (10,000 → 12,000, 2026-11-13 판 20종)
 *   — 각 방법은 '가장 잘 되는 시작 판'(★) 값, 마틴게일만 20만 번 시뮬레이션(±0.2%p), 나머지는 정확 계산.
 */
const ROWS = [
  { name: '계산기 추천', ex: '매번 성공 확률 1등 판', reach: 75.1, best: true },
  { name: '달랑베르', ex: '지면 한 칸 큰 판, 이기면 한 칸 작은 판', reach: 69.5 },
  { name: '마틴게일', ex: '지면 잃은 만큼 되찾게 판 키우기', reach: 69.3, err: 0.2 },
  { name: '파롤리', ex: '이기면 한 칸 키우고, 지면 처음 판으로', reach: 67.8 },
  { name: '같은 판만 계속', ex: '한 판만 계속 누르기', reach: 66.7 },
]

export function StrategyCompare() {
  return (
    <Card>
      <SectionTitle step={4} title="다른 방법이랑 비교하면?" />
      <p className="num -mt-2 mb-3 text-[12.5px] text-[var(--ink-3)]">예: 10,000 → 12,000 · 11/13 열린 판 20종 기준</p>
      <ol className="grid gap-2.5">
        {ROWS.map((r) => (
          <li key={r.name}>
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-[14px]">
              <b className={`font-extrabold ${r.best ? 'text-coin' : ''}`}>{r.name}</b>
              <span className="text-[12px] text-[var(--ink-3)]">{r.ex}</span>
            </div>
            <div className="relative mt-1 h-6 overflow-hidden rounded-lg border-[1.5px] border-[var(--edge)] bg-[var(--surface-2)]">
              <div className={`h-full ${r.best ? 'bg-coin' : 'bg-[var(--line)]'}`} style={{ width: `${r.reach}%` }} />
              <span className={`num absolute top-1/2 right-2 -translate-y-1/2 text-[13px] font-black ${r.best ? 'text-coin' : ''}`}>
                {r.reach.toFixed(1)}%{r.err && <small className="text-[11px] font-bold"> ±{r.err}</small>}
              </span>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[13px] text-[var(--ink-2)]">다른 방법은 각자 가장 유리한 시작 판으로 계산했어. 그래도 계산기가 제일 높아.</p>
      <p className="mt-1 text-[12px] text-[var(--ink-3)]">계산기는 '목표에 닿을 확률'이 기준이야 (평균 손익 기준이면 순위가 다를 수 있어).</p>
      <a href={`${import.meta.env.BASE_URL}how-it-works.html`}
        className="mt-3 inline-flex items-center gap-1 rounded-full border-2 border-[var(--edge)] bg-[var(--surface)] px-3.5 py-1.5 text-[13px] font-extrabold shadow-[0_3px_0_var(--edge)]">
        계산 방법 자세히 보기 →
      </a>
    </Card>
  )
}
