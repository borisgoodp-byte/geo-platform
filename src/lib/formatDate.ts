/**
 * 对外日期展示：一律精确到月（如「2026 年 9 月」）。
 * 速览表「实测时间」可精确到日，勿对本函数套用该例外场景。
 */
export function formatMonthZh(raw: string | null | undefined): string {
  if (!raw) return '—'
  const m = String(raw).trim().match(/^(\d{4})-(\d{1,2})/)
  if (!m) return String(raw)
  return `${m[1]} 年 ${Number(m[2])} 月`
}

/** ISO / YYYY-MM-DD → 内部编号用的紧凑月日串（可保留日，仅用于编号） */
export function formatDateId(raw: string | null | undefined): string {
  if (!raw) return '00000000'
  return String(raw).replaceAll('-', '').slice(0, 8) || '00000000'
}
