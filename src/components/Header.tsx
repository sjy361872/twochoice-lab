const DONATE_URL = import.meta.env.VITE_DONATE_URL as string | undefined

export function Header() {
  return (
    <header className="border-b-4 border-[var(--edge)] bg-coin text-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <HalfCoin />
          <div>
            <div className="text-[19px] font-extrabold tracking-tight">니부이치 계산기</div>
            <div className="text-[12.5px] text-white/80">제작자 파도(sjy361872)</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
        <a href={`${import.meta.env.BASE_URL}how-it-works.html`}
          className="rounded-full border-2 border-white/80 px-3 py-1.5 text-[13px] font-bold text-white hover:bg-white/10">계산 방법</a>
        {DONATE_URL && (
          <a href={DONATE_URL} target="_blank" rel="noopener"
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-[var(--edge)] bg-white px-3.5 py-2 text-[13px] font-bold text-[#1a1a1a] shadow-[0_3px_0_var(--edge)]">
            <span aria-hidden>☕</span> 커피 한 잔 후원
          </a>
        )}
        </div>
      </div>
    </header>
  )
}

/**
 * '½ 동전' — 대각선으로 반 갈린 동전(빨강/흰색) + 분수 빗금 + 1·2.
 * 둘 중 하나 = 1/2 를 그대로 그림으로. 가로 띠·가운데 단추 같은 특정 캐릭터 상품의 모양은 일부러 쓰지 않았다.
 */
export function HalfCoin({ size = 42 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className="shrink-0">
      <defs><clipPath id="hc"><circle cx="32" cy="32" r="27" /></clipPath></defs>
      <g clipPath="url(#hc)">
        <rect width="64" height="64" fill="#fff" />
        <path d="M0 0H64L0 64Z" fill="#e3350d" />
      </g>
      <path d="M51 13L13 51" stroke="#1a1a1a" strokeWidth="6" strokeLinecap="round" />
      <circle cx="32" cy="32" r="27" fill="none" stroke="#1a1a1a" strokeWidth="5" />
      <text x="22" y="30" textAnchor="middle" fontSize="17" fontWeight="900" fill="#fff" fontFamily="system-ui, sans-serif">1</text>
      <text x="42" y="50" textAnchor="middle" fontSize="17" fontWeight="900" fill="#1a1a1a" fontFamily="system-ui, sans-serif">2</text>
    </svg>
  )
}
