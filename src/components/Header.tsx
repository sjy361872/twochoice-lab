const DONATE_URL = import.meta.env.VITE_DONATE_URL as string | undefined

export function Header() {
  return (
    <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pt-6 pb-2 sm:px-6">
      <div className="flex items-center gap-3">
        <Coin />
        <div>
          <div className="text-[19px] font-extrabold tracking-tight">둘중하나 연구소</div>
          <div className="text-[12.5px] text-[var(--ink-3)]">반반 게임, 감 말고 숫자로</div>
        </div>
      </div>
      {DONATE_URL && (
        <a href={DONATE_URL} target="_blank" rel="noopener"
          className="inline-flex items-center gap-1.5 rounded-full bg-coin px-3.5 py-2 text-[13px] font-bold text-night shadow-sm transition hover:brightness-105">
          <span aria-hidden>☕</span> 커피 한 잔 후원
        </a>
      )}
    </header>
  )
}

/** 반은 금색, 반은 남색인 동전 — '둘 중 하나' */
function Coin() {
  return (
    <svg width="40" height="40" viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <circle cx="32" cy="32" r="28" fill="#F2B544" />
      <path d="M32 4a28 28 0 0 1 0 56z" fill="#1F2A44" />
      <circle cx="32" cy="32" r="28" fill="none" stroke="#1F2A44" strokeWidth="4" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="2" strokeDasharray="3 4" />
    </svg>
  )
}
