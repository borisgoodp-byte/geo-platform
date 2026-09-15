/**
 * 诊断完成后「客户回复话术」模板拼装（五段式一段话，不分点）。
 * 不调用外部 LLM；遵守禁用词（收录 / SEO / seo就绪度 等）。
 */

export type ClientScriptFinding = {
  severity: 'danger' | 'warn' | 'ok' | string
  title: string
  body?: string
}

export type ClientScriptVerdict = {
  tech?: string
  pages?: string
  content?: string
  visibility?: string
  core?: string
}

export type ClientScriptInput = {
  projectName?: string
  findings: ClientScriptFinding[]
  verdict: ClientScriptVerdict | null
  composite?: number | null
  grade?: string | null
  /** 推荐套餐周期，默认 6 个月版 */
  packageMonths?: 3 | 6 | 12
}

const PRICE_LINE =
  '服务费用按周期计费：3 个月 3 万 / 6 个月 6 万 / 12 个月 12 万；考核口径为 3/6 个月 ≥30%、12 个月 ≥50%。'

function trimSentence(s: string, max = 48): string {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const cut = t.indexOf('。')
  const one = cut >= 0 && cut < max ? t.slice(0, cut) : t.slice(0, max)
  return one.replace(/[，,；;：:]+$/, '')
}

export function buildClientReplyScript(input: ClientScriptInput): string {
  const name = (input.projectName ?? '贵司').trim() || '贵司'
  const months = input.packageMonths ?? 6
  const packageLabel = `${months} 个月版`

  const highlights = input.findings
    .filter((f) => f.severity === 'ok')
    .map((f) => trimSentence(f.title || f.body || ''))
    .filter(Boolean)
    .slice(0, 2)

  const gaps = input.findings
    .filter((f) => f.severity === 'danger' || f.severity === 'warn')
    .map((f) => trimSentence(f.title || f.body || ''))
    .filter(Boolean)
    .slice(0, 3)

  const highlightText =
    highlights.length > 0
      ? highlights.join('、')
      : trimSentence(input.verdict?.tech || '') || '页面正文具备一定可读基础'

  const gapText =
    gaps.length > 0
      ? gaps.join('、')
      : [
          trimSentence(input.verdict?.pages || ''),
          trimSentence(input.verdict?.content || ''),
        ]
          .filter(Boolean)
          .slice(0, 2)
          .join('、') || '页面架构与内容资产仍有明显短板'

  const vis =
    trimSentence(input.verdict?.visibility || '', 60) ||
    '目前 AI 平台侧官网被引用表现偏弱'
  const core = trimSentence(input.verdict?.core || '', 60)
  const scoreHint =
    input.composite != null && Number.isFinite(Number(input.composite))
      ? `综合健康度评分 ${Number(input.composite).toFixed(1)}${input.grade ? `（${input.grade}）` : ''}。`
      : ''

  // ①亮点 →②短板 →③因果 →④套餐周期 →⑤报价口径
  const part1 = `${name}官网${highlightText}，具备继续优化的基础`
  const part2 = `但目前${gapText}`
  const part3 = `${scoreHint}${vis}${core ? `，${core}` : ''}。需要进行全链路系统优化，才能提升 AI 平台对官网的发现与引用表现`
  const part4 = `对应我们的${packageLabel}服务`
  const part5 = PRICE_LINE

  return `${part1}，${part2}。${part3}，${part4}。${part5}`
    .replace(/。+/g, '。')
    .replace(/，+/g, '，')
    .replace(/\s+/g, ' ')
    .trim()
}
