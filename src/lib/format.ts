export const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR')
export const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n))
export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`
export const oddsText = (p: number | null) => {
  if (p == null || Math.abs(p - 0.5) < 1e-9) return '1/2'
  const inv = 1 / p
  return `1/${Number.isInteger(+inv.toFixed(2)) ? inv.toFixed(0) : inv.toFixed(1)}`
}
