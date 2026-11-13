import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_1px_2px_rgba(20,25,40,.04),0_12px_32px_-18px_rgba(20,25,40,.25)] sm:p-6 ${className}`}>
      {children}
    </section>
  )
}

export function SectionTitle({ step, title, hint }: { step?: number; title: string; hint?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline gap-2">
      {step != null && (
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-night text-[12px] font-bold text-coin dark:bg-coin dark:text-night">{step}</span>
      )}
      <h2 className="text-[17px] font-bold">{title}</h2>
      {hint && <span className="text-[13px] text-[var(--ink-3)]">{hint}</span>}
    </div>
  )
}

export function Seg<T extends string | number>({ value, options, onChange }: {
  value: T; options: { v: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-2xl bg-[var(--surface-2)] p-1">
      {options.map((o) => (
        <button key={String(o.v)} type="button" onClick={() => onChange(o.v)}
          aria-pressed={o.v === value}
          className={`rounded-xl px-3 py-1.5 text-[13px] font-semibold transition ${o.v === value
            ? 'bg-[var(--surface)] text-[var(--ink)] shadow-sm' : 'text-[var(--ink-2)] hover:text-[var(--ink)]'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'win' | 'lose' | 'coin' }) {
  const c = {
    neutral: 'bg-[var(--surface-2)] text-[var(--ink-2)]',
    warn: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    win: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    lose: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    coin: 'bg-coin/20 text-coin-deep dark:text-coin',
  }[tone]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${c}`}>{children}</span>
}
