import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowLeft, ArrowUp, FileDown, Loader2, Printer } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/providers/auth'
import ForbiddenPage from '@/components/ForbiddenPage'
import { parseNumericId } from '@/features/business/utils'
import { ReportGauge, ReportRadar, bandColor, bandGrade, GRADE_TEXT } from '@/features/business/report/ReportCharts'
import { ReportCard, ReportSecHead, FindingCard, ReportPlaceholder } from '@/features/business/report/ReportPrimitives'
import type { Severity } from '@/features/business/report/ReportPrimitives'
import { formatDateId, formatMonthZh } from '@/lib/formatDate'
import { ClientReplyCard } from '@/features/diagnosis/ClientReplyCard'

/** 报告页维度元数据（Apple 体系配色，design.md §2.2） */
const DIMS = [
  { key: 'tech' as const, name: '技术底座', fullName: '官网技术底座', weight: '25%', color: '#0071e3' },
  { key: 'arch' as const, name: '页面架构', fullName: '官网页面架构', weight: '20%', color: '#5e5ce6' },
  { key: 'content' as const, name: '内容生态', fullName: '官网内容生态', weight: '30%', color: '#ff9f0a' },
  { key: 'vis' as const, name: 'GEO可见度', fullName: '官网GEO可见度', weight: '25%', color: '#30d158' },
]

const PLATFORM_META = [
  { key: 'deepseek', name: 'DeepSeek', color: '#1a56db' },
  { key: 'doubao', name: '豆包', color: '#0ea5e9' },
  { key: 'qwen', name: '通义千问', color: '#5e5ce6' },
] as const

/** 九格列头逐字固定（决策→场景→对比）；key brand=对比词，不测品牌词 */
const GRID_COLS = [
  { key: 'generic', label: '决策词（品类推荐）' },
  { key: 'scenario', label: '场景词（采购场景）' },
  { key: 'brand', label: '对比词（品牌对比）' },
] as const

const LEVEL_CELL: Record<string, { text: string; label: string; color: string }> = {
  L2: { text: 'L2', label: '来源命中', color: '#30d158' },
  L1: { text: 'L1', label: '品牌提及', color: '#ff9f0a' },
  L0: { text: 'L0', label: '未命中', color: '#ff3b30' },
  none: { text: '—', label: '无数据', color: '#86868b' },
}

const DIRECTION_COLORS = ['#0071e3', '#5e5ce6', '#ff9f0a', '#30d158']

function firstSentence(text: string): string {
  const idx = text.indexOf('。')
  return idx >= 0 ? `${text.slice(0, idx)}。` : text
}

/** 打印规则：报告页独占（index.css 已含全局 print-hidden / 动画关闭） */
const PRINT_CSS = `
@media print {
  html, body { background: #fff !important; }
  .rpt-root { background: #fff !important; min-height: auto !important; }
  .rpt-card { box-shadow: none !important; border: 1px solid #e5e7eb; break-inside: avoid; page-break-inside: avoid; }
  .rpt-finding, .rpt-dir-card { break-inside: avoid; page-break-inside: avoid; }
  .rpt-topbar, .rpt-float, .rpt-progress, .print-hidden { display: none !important; }
  .rpt-hero { padding: 24px 16px 16px !important; }
  aside, nav, [data-sidebar] { display: none !important; }
  @page { margin: 14mm; size: A4; }
}
`

export default function DiagnosisReport() {
  const { id, dId } = useParams()
  const { user } = useAuth()
  const diagId = parseNumericId(dId)
  const reportQuery = trpc.diagnostics.reportData.useQuery(
    { id: diagId ?? 0 },
    { enabled: diagId !== null },
  )
  const data = reportQuery.data ?? null

  // 滚动进度（顶栏下 2px）
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const onScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight
      setProgress(total > 0 ? Math.min(1, window.scrollY / total) : 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const dims = useMemo(() => {
    if (!data) return null
    const d = data.diagnostic
    const scores = [d.techScore, d.archScore, d.contentScore, d.visScore]
    return DIMS.map((meta, i) => ({ ...meta, score: scores[i] ?? 0 }))
  }, [data])

  const composite = data?.diagnostic.compositeScore ?? 0
  const grade = (data?.diagnostic.grade ?? bandGrade(composite)) as 'A' | 'B' | 'C' | 'D'
  const gradeColor = { A: '#30d158', B: '#0071e3', C: '#ff9f0a', D: '#ff3b30' }[grade]

  const diagnoseDate = data?.diagnostic.diagnoseDate ?? ''
  const diagnoseMonthZh = formatMonthZh(diagnoseDate)
  const canShowClientScript = user?.role === 'operator' || user?.role === 'lead'

  const nineCell = (platform: string, category: string) =>
    data?.nineGrid.find((c) => c.platform === platform && c.category === category) ?? null
  const nineTotal = data?.nineGrid.reduce((acc, c) => acc + c.total, 0) ?? 0
  const nineL2 = data?.nineGrid.reduce((acc, c) => acc + c.l2, 0) ?? 0

  const findingsByDim = (dim: number) =>
    (data?.findings ?? []).filter((f) => f.dimension === dim)

  const verdict = data?.verdict ?? null
  const directions = data?.directions ?? null

  const projectName = data?.project?.name ?? ''
  const backTo = `/projects/${id ?? ''}`
  const findingsTo = `/projects/${id ?? ''}/diagnosis/${dId ?? ''}/findings`

  // 客户仅可读已完成（已发布）报告
  if (
    user?.role === 'client' &&
    data?.diagnostic &&
    data.diagnostic.status !== 'completed'
  ) {
    return <ForbiddenPage homeLabel="返回监测看板" />
  }

  return (
    <div className="rpt-root min-h-[100dvh] bg-rpt-bg font-sans text-[#1d1d1f]">
      <style>{PRINT_CSS}</style>

      {/* ===== 极简顶栏（打印隐藏） ===== */}
      <div className="rpt-topbar sticky top-0 z-40 border-b border-black/[0.06] bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-[52px] max-w-[960px] items-center justify-between px-5">
          <Link
            to={backTo}
            className="flex items-center gap-1.5 text-[14px] text-[#0071e3] transition-opacity hover:opacity-75"
          >
            <ArrowLeft className="h-4 w-4" />
            返回工作台
          </Link>
          <span className="hidden text-[12px] text-[#86868b] sm:inline">
            {projectName ? `${projectName} · ` : ''}官网GEO诊断报告{diagnoseDate ? ` · ${diagnoseMonthZh}` : ''}
          </span>
          <div className="flex items-center gap-2 print-hidden">
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-full border border-[#d2d2d7] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#1d1d1f] transition-opacity hover:opacity-80"
            >
              <Printer className="h-3.5 w-3.5" />
              打印
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              title="浏览器打印对话框中选择「另存为 PDF」"
              className="flex items-center gap-1.5 rounded-full bg-[#0071e3] px-4 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
            >
              <FileDown className="h-3.5 w-3.5" />
              导出 PDF
            </button>
          </div>
        </div>
        <div
          className="rpt-progress h-[2px] bg-[#0071e3] transition-[width] duration-150"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* ===== 加载 / 异常 ===== */}
      {reportQuery.isLoading && (
        <div className="flex min-h-[70vh] items-center justify-center gap-2 text-[#86868b]">
          <Loader2 className="h-5 w-5 animate-spin" />
          正在加载诊断报告…
        </div>
      )}
      {!reportQuery.isLoading && !data && (
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="text-[28px] font-bold">诊断单不存在或尚未生成</h1>
          <p className="text-[15px] text-[#6e6e73]">请返回工作台，先完成诊断与评分流程。</p>
          <Link to={backTo} className="mt-2 rounded-full bg-[#0071e3] px-5 py-2 text-[14px] text-white">
            返回工作台
          </Link>
        </div>
      )}

      {data && dims && (
        <>
          {/* ===== Section 00 · Hero ===== */}
          <section
            className="rpt-hero relative overflow-hidden px-6 pb-[72px] pt-[88px] text-center"
            style={{ background: '#f5f5f7' }}
          >
            <motion.img
              src="/report-hero-texture.svg"
              alt=""
              aria-hidden
              className="pointer-events-none absolute right-0 top-0 w-[720px] max-w-none opacity-80"
              animate={{ x: [0, 8, 0], y: [0, -6, 0] }}
              transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div className="relative">
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="inline-block rounded-full border border-[#d2d2d7] bg-white px-4 py-1.5 text-[12px] font-semibold tracking-[0.12em] text-[#6e6e73]"
              >
                GEO DIAGNOSTIC REPORT{diagnoseDate ? ` · ${diagnoseMonthZh}` : ''}
              </motion.span>
              <motion.h1
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                className="mx-auto mt-6 text-[44px] font-bold leading-[52px] tracking-[-0.025em]"
                style={{
                  background: 'linear-gradient(180deg,#1d1d1f,#4b4b52)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                {projectName} 官网GEO诊断报告
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="mx-auto mt-4 max-w-[640px] text-[17px] leading-[26px] text-[#6e6e73]"
              >
                面向豆包 · DeepSeek · 通义千问的官网可见性四维诊断
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.55, duration: 0.5 }}
                className="mt-7 font-mono text-[12px] leading-[22px] text-[#86868b]"
              >
                诊断域名 {data.project?.domain ?? '—'} · 诊断日期 {diagnoseMonthZh} · 服务机构
                清蓝官网GEO项目组 / PureblueAI 媒介运营部 · 密级 内部资料
              </motion.div>
            </div>
          </section>

          <div className="mx-auto flex max-w-[960px] flex-col gap-14 px-5 pb-6">
            {canShowClientScript && data.diagnostic.status === 'completed' && (
              <ClientReplyCard
                variant="report"
                projectName={projectName}
                findings={(data.findings ?? []).map((f) => ({
                  severity: f.severity,
                  title: f.title,
                  body: f.body,
                }))}
                verdict={verdict}
                composite={composite}
                grade={grade}
                packageMonths={6}
              />
            )}
            {/* ===== Section 01 · 综合健康度总览 ===== */}
            <ReportCard>
              <ReportSecHead
                num="01"
                title="综合健康度总览"
                desc="基于四大维度对官网进行公开信息实测评估，综合得分反映官网在 AI 搜索生态中的整体可见性水平。"
              />
              <div className="grid items-center gap-10 md:grid-cols-5">
                <div className="md:col-span-2">
                  <ReportGauge score={composite} />
                  <div className="mt-3 text-center">
                    <span
                      className="inline-block rounded-full px-5 py-1.5 text-[14px] font-semibold"
                      style={{ background: `${gradeColor}1a`, color: gradeColor }}
                    >
                      {grade} · {GRADE_TEXT[grade]}
                    </span>
                  </div>
                </div>
                <div className="md:col-span-3">
                  <div className="flex flex-col gap-4">
                    {dims.map((dim, i) => (
                      <motion.div
                        key={dim.key}
                        initial={{ opacity: 0, x: 12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.12, duration: 0.4 }}
                      >
                        <div className="flex items-baseline justify-between">
                          <span className="text-[15px] font-semibold text-[#1d1d1f]">
                            {dim.fullName}
                            <span className="ml-2 text-[12px] font-normal text-[#86868b]">权重 {dim.weight}</span>
                          </span>
                          <span className="text-[15px] font-bold tabular-nums" style={{ color: bandColor(dim.score) }}>
                            {dim.score}
                            <span className="text-[12px] font-normal text-[#86868b]">/100</span>
                          </span>
                        </div>
                        <div className="mt-1.5 h-[10px] overflow-hidden rounded-full bg-[#e8e8ed]">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: dim.color }}
                            initial={{ width: 0 }}
                            whileInView={{ width: `${dim.score}%` }}
                            viewport={{ once: true }}
                            transition={{ delay: 0.1 + i * 0.12, duration: 0.6, ease: 'easeOut' }}
                          />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <p className="mt-4 text-[12px] text-[#86868b]">
                    综合 = 技术×25% + 页面×20% + 内容×30% + 可见度×25%
                  </p>
                  {/* 等级标尺 */}
                  <div className="mt-4">
                    <div className="relative flex h-[10px] overflow-hidden rounded-full">
                      <span className="h-full bg-[#ff3b30]" style={{ width: '45%' }} />
                      <span className="h-full bg-[#ff9f0a]" style={{ width: '20%' }} />
                      <span className="h-full bg-[#0071e3]" style={{ width: '15%' }} />
                      <span className="h-full bg-[#30d158]" style={{ width: '20%' }} />
                      <span
                        className="absolute -top-[3px] h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-[#1d1d1f]"
                        style={{ left: `calc(${Math.min(99, Math.max(1, composite))}% - 6px)` }}
                      />
                    </div>
                    <div className="mt-1.5 flex justify-between text-[11px] text-[#86868b]">
                      <span>D 亟需优化 &lt;45</span>
                      <span>C 待提升 45–64.9</span>
                      <span>B 良好 65–79.9</span>
                      <span>A 优秀 ≥80</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 综合结论 */}
              <div className="mt-8">
                {verdict ? (
                  <div
                    className="rounded-[14px] border p-6"
                    style={{
                      background: 'linear-gradient(135deg, rgba(0,113,227,.06), rgba(94,92,230,.06))',
                      borderColor: 'rgba(0,113,227,.2)',
                    }}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span className="rounded-full bg-[#0071e3] px-3 py-0.5 text-[12px] font-semibold text-white">
                        核心结论
                      </span>
                    </div>
                    <p className="text-[17px] font-medium leading-[29px] text-[#1d1d1f]">{verdict.core}</p>
                    <div className="mt-4 space-y-2 border-t border-[rgba(0,113,227,.12)] pt-4 text-[14px] leading-[26px] text-[#3a3a3c]">
                      <p><b className="text-[#0071e3]">1. 技术：</b>{verdict.tech}</p>
                      <p><b className="text-[#0071e3]">2. 页面：</b>{verdict.pages}</p>
                      <p><b className="text-[#0071e3]">3. 内容：</b>{verdict.content}</p>
                      <p><b className="text-[#0071e3]">4. 实测：</b>{verdict.visibility}</p>
                    </div>
                  </div>
                ) : (
                  <ReportPlaceholder text="综合结论尚未填写，请返回「发现与结论」完善" linkTo={findingsTo} />
                )}
              </div>
            </ReportCard>

            {/* ===== Section 02 · 三平台引用速览九格 ===== */}
            <ReportCard>
              <ReportSecHead
                num="02"
                title="AI 平台引用实测速览"
                desc={
                  data.nineGridDate
                    ? `实测时间：${data.nineGridDate} · 决策/场景/对比词 × 豆包、DeepSeek、通义千问 · L2 来源命中口径（不测品牌词）`
                    : '尚未进行平台实测'
                }
              />
              {data.nineGrid.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <div className="min-w-[560px]">
                      {/* 列表头 */}
                      <div className="mb-2 grid grid-cols-[150px_repeat(3,1fr)] items-end gap-3">
                        <span />
                        {GRID_COLS.map((c) => (
                          <div key={c.key} className="text-center">
                            <div className="text-[13px] font-semibold text-[#6e6e73]">{c.label}</div>
                          </div>
                        ))}
                      </div>
                      {PLATFORM_META.map((p) => (
                        <div key={p.key} className="mb-3 grid grid-cols-[150px_repeat(3,1fr)] items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                            <span className="text-[14px] font-semibold text-[#1d1d1f]">{p.name}</span>
                          </div>
                          {GRID_COLS.map((c) => {
                            const cell = nineCell(p.key, c.key)
                            const meta = LEVEL_CELL[cell?.level ?? 'none']
                            return (
                              <motion.div
                                key={c.key}
                                initial={{ opacity: 0, scale: 0.8 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.35 }}
                                className="flex h-[72px] flex-col items-center justify-center rounded-[12px]"
                                style={{
                                  background: `${meta.color}14`,
                                  border: `1px solid ${meta.color}4d`,
                                }}
                              >
                                <span className="text-[20px] font-bold leading-none" style={{ color: meta.color }}>
                                  {meta.text}
                                </span>
                                <span className="mt-1 text-[11px]" style={{ color: meta.color }}>
                                  {meta.label}
                                </span>
                              </motion.div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="mt-2 text-[14px] leading-[24px] text-[#6e6e73]">
                    {nineTotal} 次实测，官网引用命中 {nineL2} 次
                    {nineTotal > 0 && nineL2 === 0 && '；同期对比词提问下，竞品官网已进入 AI 引用来源'}
                    。
                  </p>
                </>
              ) : (
                <ReportPlaceholder text="尚未完成三平台实测，请先在「实测录入」记录一轮引用判定" linkTo={`/projects/${id ?? ''}/measure`} />
              )}
            </ReportCard>

            {/* ===== Section 03 · 四维能力雷达 ===== */}
            <ReportCard>
              <ReportSecHead num="03" title="四维能力雷达" desc="本项目得分 vs 满分参考（虚线）；顶点标注各维度得分。" />
              <ReportRadar
                axes={[
                  { label: '技术底座', score: dims[0].score, weight: '25%' },
                  { label: '内容生态', score: dims[2].score, weight: '30%' },
                  { label: '页面架构', score: dims[1].score, weight: '20%' },
                  { label: 'GEO可见度', score: dims[3].score, weight: '25%' },
                ]}
              />
              <ul className="mx-auto mt-6 max-w-[720px] space-y-3">
                {dims.map((dim) => (
                  <li key={dim.key} className="flex gap-3 text-[14px] leading-[24px] text-[#3a3a3c]">
                    <span className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: dim.color }} />
                    <span>
                      <b className="text-[#1d1d1f]">
                        {dim.fullName} {dim.score}
                      </b>
                      {verdict && (
                        <>
                          {'：'}
                          {firstSentence(
                            dim.key === 'tech'
                              ? verdict.tech
                              : dim.key === 'arch'
                                ? verdict.pages
                                : dim.key === 'content'
                                  ? verdict.content
                                  : verdict.visibility,
                          )}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </ReportCard>

            {/* ===== Section 04–07 · 四维度明细 ===== */}
            {dims.map((dim, i) => {
              const rows = findingsByDim(i + 1)
              return (
                <ReportCard key={dim.key}>
                  <ReportSecHead num={String(i + 4).padStart(2, '0')} title={`维度${['一', '二', '三', '四'][i]} · ${dim.fullName}`} />
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="h-[11px] w-[11px] rounded-[4px]" style={{ background: dim.color }} />
                      <span className="text-[15px] font-semibold text-[#1d1d1f]">
                        权重 {dim.weight}
                      </span>
                    </div>
                    <span className="text-[24px] font-bold tabular-nums" style={{ color: bandColor(dim.score) }}>
                      {dim.score}
                      <span className="text-[13px] font-normal text-[#86868b]">
                        /100 · {GRADE_TEXT[bandGrade(dim.score)]}
                      </span>
                    </span>
                  </div>
                  <div className="mb-6 h-[8px] overflow-hidden rounded-full bg-[#e8e8ed]">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: bandColor(dim.score) }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${dim.score}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                  {rows.length > 0 ? (
                    <div className="flex flex-col gap-4">
                      {rows.map((f) => (
                        <FindingCard
                          key={f.id}
                          severity={f.severity as Severity}
                          title={f.title}
                          body={f.body}
                          impact={f.impact}
                        />
                      ))}
                    </div>
                  ) : (
                    <ReportPlaceholder text="该维度发现尚未填写，请返回「发现与结论」完善" linkTo={findingsTo} />
                  )}
                </ReportCard>
              )
            })}

            {/* ===== Section 08 · 优化方向 ===== */}
            <ReportCard>
              <ReportSecHead num="08" title="优化方向：固本 → 立信 → 扩声 → 占位" />
              {directions && directions.length > 0 ? (
                <>
                  {/* 四步串联渐变线 */}
                  <motion.div
                    className="mb-6 h-[2px] rounded-full"
                    style={{ background: 'linear-gradient(90deg,#0071e3,#5e5ce6,#ff9f0a,#30d158)' }}
                    initial={{ scaleX: 0, transformOrigin: 'left' }}
                    whileInView={{ scaleX: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 1 }}
                  />
                  <div className="grid gap-5 sm:grid-cols-2">
                    {directions.map((d, i) => {
                      const color = DIRECTION_COLORS[(d.step - 1) % 4] ?? DIRECTION_COLORS[i % 4]
                      const [theme, rest] = d.title.includes('·')
                        ? [d.title.split('·')[0].trim(), d.title.split('·').slice(1).join('·').trim()]
                        : [d.title, '']
                      return (
                        <motion.div
                          key={d.step}
                          initial={{ opacity: 0, y: 28 }}
                          whileInView={{ opacity: 1, y: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: i * 0.12, duration: 0.5 }}
                          className="rpt-dir-card rounded-[14px] border border-[#e8e8ed] bg-[#fbfbfd] p-6 transition-all duration-150 hover:-translate-y-1"
                        >
                          <div className="flex items-baseline gap-3">
                            <span className="text-[32px] font-bold leading-none" style={{ color: `${color}33` }}>
                              {String(d.step).padStart(2, '0')}
                            </span>
                            <div>
                              <div className="text-[18px] font-bold" style={{ color }}>
                                {theme}
                              </div>
                              {rest && <div className="mt-0.5 text-[12px] text-[#86868b]">{rest}</div>}
                            </div>
                          </div>
                          <ul className="mt-4 space-y-2">
                            {d.items.map((item, j) => (
                              <li key={j} className="flex gap-2.5 text-[14px] leading-[26px] text-[#3a3a3c]">
                                <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </motion.div>
                      )
                    })}
                  </div>
                </>
              ) : (
                <ReportPlaceholder text="优化方向尚未填写，请返回「发现与结论」完善" linkTo={findingsTo} />
              )}
            </ReportCard>
          </div>

          {/* ===== Section 08 之后 · 保密页脚 ===== */}
          <footer className="mx-auto max-w-[960px] px-5 pb-24 pt-2">
            <div className="border-t border-[#d2d2d7] pt-8 text-center">
              <img src="/logo-pureblue.svg" alt="PureblueAI 媒介运营部" className="mx-auto h-6 w-auto opacity-70" />
              <p className="mt-4 text-[13px] leading-[24px] text-[#86868b]">
                本报告由 清蓝官网GEO项目组 / PureblueAI 媒介运营部 出具 · 仅供委托方内部使用
                <br />
                数据口径：L2 来源命中计引用呈现率；评分为四档制（20/15/10/0）
                <br />
                报告编号 GEO-{formatDateId(diagnoseDate)}-R{data.diagnostic.id} · 诊断日期 {diagnoseMonthZh}
              </p>
            </div>
          </footer>

          {/* ===== 悬浮工具（打印隐藏） ===== */}
          <div className="rpt-float fixed bottom-6 right-6 z-40 flex flex-col gap-2.5">
            <button
              type="button"
              aria-label="回到顶部"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-black/[0.06] bg-white text-[#6e6e73] shadow-rpt-card transition-all hover:-translate-y-0.5 hover:text-[#0071e3]"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="导出 PDF"
              title="导出 PDF（打印另存）"
              onClick={() => window.print()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0071e3] text-white shadow-rpt-card transition-all hover:-translate-y-0.5 hover:opacity-90"
            >
              <FileDown className="h-4 w-4" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
