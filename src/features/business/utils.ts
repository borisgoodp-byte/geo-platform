/**
 * 商务出具共享工具：金额格式化、人民币大写、路由 id 解析、阶段/平台常量。
 * 仅为展示工具与设计 token，不包含业务数据。
 */

/** ¥1,234,567.00 */
export function fmtMoney(n: number): string {
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** ¥1,234,567（无小数，用于预览紧凑场景） */
export function fmtMoneyInt(n: number): string {
  return `¥${Math.round(n).toLocaleString('zh-CN')}`
}

const CN_DIGITS = '零壹贰叁肆伍陆柒捌玖'
const CN_UNITS = ['', '拾', '佰', '仟']
const CN_GROUP_UNITS = ['', '万', '亿', '兆']

function groupToCn(group: number): string {
  let s = ''
  const digits = String(group).padStart(4, '0')
  let zeroPending = false
  for (let i = 0; i < 4; i++) {
    const d = Number(digits[i])
    if (d === 0) {
      zeroPending = s.length > 0
    } else {
      if (zeroPending) {
        s += '零'
        zeroPending = false
      }
      s += CN_DIGITS[d] + CN_UNITS[3 - i]
    }
  }
  return s
}

/** 人民币大写金额：386000 → 叁拾捌万陆仟元整；386000.5 → 叁拾捌万陆仟元伍角整 */
export function toCnUpperAmount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return ''
  if (n === 0) return '零元整'
  const rounded = Math.round(n * 100)
  let intPart = Math.floor(rounded / 100)
  const hasInt = intPart > 0
  const jiao = Math.floor((rounded % 100) / 10)
  const fen = rounded % 10

  let intCn = ''
  if (intPart > 0) {
    const groups: number[] = []
    while (intPart > 0) {
      groups.push(intPart % 10000)
      intPart = Math.floor(intPart / 10000)
    }
    let zeroBetween = false
    for (let g = groups.length - 1; g >= 0; g--) {
      const v = groups[g]
      if (v === 0) {
        zeroBetween = intCn.length > 0
        continue
      }
      if (zeroBetween || (intCn.length > 0 && v < 1000)) {
        intCn += '零'
      }
      zeroBetween = false
      intCn += groupToCn(v) + CN_GROUP_UNITS[g]
    }
    intCn += '元'
  }

  if (jiao === 0 && fen === 0) return intCn + '整'
  let dec = ''
  if (jiao > 0) dec += CN_DIGITS[jiao] + '角'
  else if (hasInt && fen > 0) dec += '零'
  if (fen > 0) dec += CN_DIGITS[fen] + '分'
  return intCn + dec
}

/** 日期 + N 天 → YYYY-MM-DD（UTC 口径，与 contracts/schedule.dayToDate 一致） */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** YYYY-MM-DD → MM-DD */
export function shortDate(iso: string): string {
  return iso.slice(5)
}

/** 阶段色带（design.md §2.1 阶段色，固定 token 非业务数据） */
export const STAGE_COLORS: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: '#1a56db',
  B: '#5e5ce6',
  C: '#0ea5e9',
  D: '#10b981',
}

export const STAGE_NAMES: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: '战略诊断',
  B: '官网重构',
  C: '内容运营',
  D: '数据洞察',
}

export const TIER_LABELS: Record<string, string> = {
  basic: '初级',
  standard: '中级',
  premium: '高级',
}

export const TIER_KPI: Record<string, number> = {
  basic: 20,
  standard: 30,
  premium: 40,
}

/**
 * 路由 id 解析：导航占位使用 slug（hanhoo / demo-insure / d1），
 * 后端主键为数字。数字直用；slug 交由调用方用 projects.list 匹配 domain。
 */
export function parseNumericId(raw: string | undefined): number | null {
  if (!raw) return null
  if (/^\d+$/.test(raw)) return Number(raw)
  const m = raw.match(/(\d+)$/)
  return m ? Number(m[1]) : null
}

/** 项目 slug → 匹配项目（domain 前缀或 name 包含） */
export function matchProjectBySlug<T extends { id: number; name: string; domain: string }>(
  rows: T[],
  slug: string,
): T | undefined {
  const s = slug.toLowerCase()
  return (
    rows.find((p) => p.domain.toLowerCase().startsWith(s)) ??
    rows.find((p) => p.domain.toLowerCase().includes(s)) ??
    rows.find((p) => p.name.toLowerCase().includes(s))
  )
}
