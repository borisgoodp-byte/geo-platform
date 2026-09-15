import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Globe,
  History,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react'
import type { CrawlSummary } from '@contracts/types'
import { computeComposite, computeDimensionScore, computeGrade } from '@contracts/scoring'
import { trpc } from '@/providers/trpc'
import { cn } from '@/lib/utils'
import { DIMS, EASE, btnGhost, btnPrimary, btnSecondary } from '@/features/diagnosis/meta'
import { DiagStatusChip, DimBar, PageHeader, PageSkeleton, ScoreGauge } from '@/features/diagnosis/ui'
import { formatMonthZh } from '@/lib/formatDate'

/* ---------- 检测清单（由 crawl summary 推导真实结果） ---------- */

type CheckStatus = 'pending' | 'running' | 'ok' | 'partial' | 'failed'

interface CheckItem {
  label: string
  status: CheckStatus
  detail: string
}

function pct(a: number, b: number) {
  return b === 0 ? 0 : Math.round((a / b) * 100)
}

function buildChecklist(s: CrawlSummary, visEvidence: string[] | null): CheckItem[] {
  const pages = s.pages ?? []
  const reachable = s.variants.filter((v) => v.ok)
  const bareBad = s.variants.some((v) => !v.ok && !v.url.includes('://www.'))
  const homepage = pages[0]
  const titles = pages.map((p) => p.title).filter(Boolean)
  const dupRate = titles.length ? 100 - pct(new Set(titles).size, titles.length) : 0
  const canonCount = pages.filter((p) => p.canonical).length
  const h1Count = pages.filter((p) => p.h1Count >= 1).length
  const ldTypes = new Set(pages.flatMap((p) => p.jsonLdTypes))
  const ldErrors = pages.reduce((a, p) => a + p.jsonLdErrors, 0)
  const bcCount = pages.filter((p) => p.hasBreadcrumb).length
  const navPages = pages.filter((p) => p.navLinkCount > 0).length
  const avgDepth = pages.length ? pages.reduce((a, p) => a + p.urlDepth, 0) / pages.length : 0
  const semanticCount = pages.filter((p) => p.urlSemantic).length
  const textLen = homepage?.textLength ?? 0

  return [
    {
      label: '入口变体探测（https/http × 裸域/www）',
      status: reachable.length > 0 ? 'ok' : 'failed',
      detail:
        reachable.length > 0
          ? `${s.variants.length} 变体探测完成，可达 ${reachable.length} 个${bareBad ? '，裸域不可达' : ''}`
          : '四个入口变体均不可达',
    },
    {
      label: 'robots.txt 解析',
      status: s.robots.found ? (s.robots.blocksAiBots.length ? 'partial' : 'ok') : 'failed',
      detail: !s.robots.found
        ? '未找到 robots.txt'
        : s.robots.blocksAiBots.length
          ? `拦截 AI 爬虫：${s.robots.blocksAiBots.join('、')}`
          : '未拦截 AI 爬虫',
    },
    {
      label: 'sitemap.xml 检测',
      status: s.sitemap.found ? 'ok' : 'failed',
      detail: s.sitemap.found ? `可访问，站点地图约 ${s.sitemap.urlCount} 个页面` : '404 未找到',
    },
    {
      label: 'llms.txt 检测',
      status: s.llms.found ? 'ok' : 'failed',
      detail: s.llms.found ? '已提供 AI 索引' : '未提供',
    },
    {
      label: '首页抓取与正文提取',
      status: textLen > 500 ? 'ok' : textLen > 0 ? 'partial' : 'failed',
      detail: homepage ? `可见文本 ${textLen} 字${textLen < 500 ? '，图片承载为主' : ''}` : '首页抓取失败',
    },
    {
      label: '站内链接抽样（≤15 页）',
      status: pages.length > 1 ? 'ok' : 'partial',
      detail: pages.length > 1 ? `抽样 ${pages.length} 页（含首页）` : '未抽样到站内页面',
    },
    {
      label: 'title / meta / H1 解析',
      status: pages.length === 0 ? 'failed' : dupRate > 50 || h1Count < pages.length / 2 ? 'partial' : 'ok',
      detail: pages.length ? `title 重复率 ${dupRate}%，H1 覆盖 ${h1Count}/${pages.length} 页` : '无样本页',
    },
    {
      label: 'canonical 与语义标签',
      status: pages.length === 0 ? 'failed' : canonCount === 0 ? 'partial' : canonCount < pages.length ? 'partial' : 'ok',
      detail: pages.length ? `canonical 覆盖 ${canonCount}/${pages.length} 页` : '无样本页',
    },
    {
      label: 'JSON-LD 结构化数据解析',
      status: ldTypes.size === 0 ? 'failed' : ldTypes.size >= 4 && ldErrors === 0 ? 'ok' : 'partial',
      detail:
        ldTypes.size === 0
          ? '未检出 JSON-LD'
          : `检出 ${ldTypes.size} 类：${[...ldTypes].slice(0, 4).join(' / ')}${ldErrors ? `，解析错误 ${ldErrors} 处` : ''}`,
    },
    {
      label: '面包屑与内链可爬性',
      status: pages.length === 0 ? 'failed' : bcCount > 0 && navPages > 0 ? 'ok' : navPages > 0 ? 'partial' : 'failed',
      detail: pages.length ? `面包屑 ${bcCount}/${pages.length} 页，导航可爬 ${navPages}/${pages.length} 页` : '无样本页',
    },
    {
      label: 'URL 深度与语义性',
      status: pages.length === 0 ? 'failed' : avgDepth <= 3 && semanticCount >= pages.length / 2 ? 'ok' : 'partial',
      detail: pages.length ? `平均深度 ${avgDepth.toFixed(1)} 层，语义化 ${semanticCount}/${pages.length} 页` : '无样本页',
    },
    {
      label: '近 30 天实测记录关联（可见度定档）',
      status: visEvidence === null ? 'pending' : visEvidence.every((e) => e.includes('待实测')) ? 'partial' : 'ok',
      detail:
        visEvidence === null
          ? '等待前序完成'
          : visEvidence.every((e) => e.includes('待实测'))
            ? '暂无实测记录，可见度默认 0 分（保存评分后按实测自动定档）'
            : '已关联实测数据，保存评分后自动定档',
    },
  ]
}

const STATUS_ICON: Record<CheckStatus, ReactElement> = {
  pending: <CircleDashed className="h-4 w-4 text-[#c4c9d1]" />,
  running: <Loader2 className="h-4 w-4 animate-spin text-brand" />,
  ok: <Check className="h-4 w-4 text-success" />,
  partial: <AlertTriangle className="h-4 w-4 text-warning" />,
  failed: <X className="h-4 w-4 text-danger" />,
}

const STEPS = ['域名确认', '自动检测', '初评摘要']

/* ---------- 步骤条 ---------- */

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center">
      {STEPS.map((label, i) => {
        const n = i + 1
        const done = step > n
        const active = step === n
        return (
          <div key={label} className={cn('flex items-center', i > 0 && 'flex-1')}>
            {i > 0 && (
              <div className="relative mx-3 h-0.5 flex-1 overflow-hidden rounded bg-[#e5e7eb]">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-brand"
                  initial={false}
                  animate={{ width: step > i ? '100%' : '0%' }}
                  transition={{ duration: 0.5, ease: EASE }}
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-small font-semibold transition-colors',
                  done ? 'bg-[#e8faf3] text-success' : active ? 'bg-brand text-white' : 'bg-[#f3f4f6] text-[#9ca3af]',
                )}
              >
                {done ? <Check className="h-4 w-4" /> : n}
              </span>
              <span className={cn('text-small', active ? 'font-semibold text-[#111827]' : 'text-[#6b7280]')}>
                {label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ---------- 历史诊断下拉 ---------- */

function HistoryMenu({ projectId }: { projectId: number }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { data } = trpc.diagnostics.listByProject.useQuery({ projectId })
  if (!data || data.length === 0) return null
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className={btnSecondary}>
        <History className="h-4 w-4" />
        历史诊断
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-lg border border-[#e5e7eb] bg-white py-1 shadow-card-hover">
            {data.map((d) => (
              <button
                key={d.id}
                type="button"
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-small transition-colors hover:bg-[#f9fafb]"
                onClick={() =>
                  navigate(
                    d.status === 'completed'
                      ? `/projects/${projectId}/diagnosis/${d.id}/report`
                      : `/projects/${projectId}/diagnosis/${d.id}/scoring`,
                  )
                }
              >
                <span className="font-mono text-[#374151] tabular-nums">{formatMonthZh(d.diagnoseDate)}</span>
                <DiagStatusChip status={d.status} />
                <span className="ml-auto font-semibold text-[#111827] tabular-nums">
                  {d.compositeScore !== null ? d.compositeScore.toFixed(1) : '—'}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------- 主页面 ---------- */

export default function DiagnosisNew() {
  const { id } = useParams()
  const projectId = Number(id)
  const navigate = useNavigate()

  const projectQ = trpc.projects.get.useQuery({ id: projectId }, { enabled: Number.isFinite(projectId) })
  const project = projectQ.data

  const [step, setStep] = useState(1)
  const [domain, setDomain] = useState('')
  const [domainTouched, setDomainTouched] = useState(false)
  const [diagId, setDiagId] = useState<number | null>(null)
  /** 同步缓存 create 返回的 id，避免 setState 尚未提交时失败态主按钮点不动 */
  const diagIdRef = useRef<number | null>(null)
  const [crawlSummary, setCrawlSummary] = useState<CrawlSummary | null>(null)
  const [crawlFailed, setCrawlFailed] = useState<string | null>(null)
  const [runningIdx, setRunningIdx] = useState(0)
  const [detailOpen, setDetailOpen] = useState(false)

  // 域名预填：未手动修改前跟随项目域名（派生值，无需 effect）
  const effectiveDomain = domainTouched ? domain : (project?.domain ?? '')

  const diagQ = trpc.diagnostics.get.useQuery(
    { id: diagId ?? 0 },
    { enabled: diagId !== null },
  )

  const utils = trpc.useUtils()
  const createMut = trpc.diagnostics.create.useMutation()
  const updateProjectMut = trpc.projects.update.useMutation()
  const crawlMut = trpc.crawl.run.useMutation()
  const crawling = crawlMut.isPending || createMut.isPending

  // 抓取进行中：逐项推进「进行中」光标（真实结果以返回的 summary 为准）
  useEffect(() => {
    if (!crawling || step !== 2) return
    const t = window.setInterval(() => setRunningIdx((i) => Math.min(i + 1, 10)), 900)
    return () => window.clearInterval(t)
  }, [crawling, step])

  // 抓取进行中离开提示
  useEffect(() => {
    if (!crawling) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [crawling])

  const rememberDiagId = (id: number) => {
    diagIdRef.current = id
    setDiagId(id)
  }

  const goToScoring = (id?: number | null) => {
    const dId = id ?? diagIdRef.current ?? diagId
    if (!dId) return
    navigate(`/projects/${projectId}/diagnosis/${dId}/scoring`)
  }

  const runCrawl = async () => {
    if (!Number.isFinite(projectId)) return
    setCrawlFailed(null)
    setCrawlSummary(null)
    setRunningIdx(0)
    try {
      let dId = diagIdRef.current ?? diagId
      if (!dId) {
        // 域名被修改时先落库，抓取器以项目域名为准
        if (project && effectiveDomain.trim() && effectiveDomain.trim() !== project.domain) {
          await updateProjectMut.mutateAsync({ id: projectId, domain: effectiveDomain.trim() })
        }
        const d = await createMut.mutateAsync({ projectId })
        dId = d.id
        // create 成功立刻落 ref+state，后续 crawl 失败仍可一键进评分
        rememberDiagId(dId)
      }
      setStep(2)
      const res = await crawlMut.mutateAsync({ diagnosticId: dId })
      setCrawlSummary(res.summary)
      await utils.diagnostics.get.invalidate({ id: dId })
      if (res.status === 'failed') {
        // 确保失败态渲染时 id 已可用（防 setState 时序）
        rememberDiagId(dId)
        setCrawlFailed(res.summary.error ?? '目标站点不可达')
      } else {
        // 展示完整检测清单结果后自动进入初评摘要
        window.setTimeout(() => setStep(3), 1600)
      }
    } catch (err) {
      // create 已成功时 ref 仍保留 id，失败卡可进评分
      setCrawlFailed(err instanceof Error ? err.message : '抓取失败')
      setStep(2)
    }
  }

  /* ----- 步骤② 清单渲染数据 ----- */
  const visEvidence = useMemo(() => {
    if (!diagQ.data) return null
    return diagQ.data.indicators
      .filter((i) => i.dimension === 4)
      .map((i) => i.scoreRow?.autoEvidence ?? i.scoreRow?.evidence ?? '待实测：近 30 天无实测记录')
  }, [diagQ.data])

  const checklist: CheckItem[] = useMemo(() => {
    if (crawlSummary) return buildChecklist(crawlSummary, visEvidence)
    return Array.from({ length: 12 }, (_, i) => ({
      label: buildChecklist(
        { domain: effectiveDomain, entry: null, variants: [], robots: { found: false, blocksAiBots: [], allowsAll: false }, sitemap: { found: false, urlCount: 0 }, llms: { found: false }, pages: [] },
        null,
      )[i]!.label,
      status: (i < runningIdx ? 'running' : i === runningIdx ? 'running' : 'pending') as CheckStatus,
      detail: i < runningIdx ? '解析中…' : '排队中',
    }))
  }, [crawlSummary, visEvidence, runningIdx, effectiveDomain])

  const failCount = checklist.filter((c) => c.status === 'failed').length
  const doneCount = crawlSummary ? checklist.length : Math.min(runningIdx, 11)
  const progress = crawlSummary ? 100 : Math.round((doneCount / 12) * 100)

  /* ----- 步骤③ 机器初评数据 ----- */
  const machine = useMemo(() => {
    const d = diagQ.data
    if (!d) return null
    const auto: Record<string, number> = {}
    for (const ind of d.indicators) auto[ind.key] = ind.scoreRow?.autoScore ?? 0
    const dims = computeDimensionScore(auto)
    const composite = computeComposite(dims)
    const grade = computeGrade(composite)
    const issues = d.indicators
      .filter((i) => i.scoreRow?.autoScore !== null && i.scoreRow !== null && (i.scoreRow.autoScore ?? 20) <= 10)
      .sort((a, b) => (a.scoreRow!.autoScore ?? 0) - (b.scoreRow!.autoScore ?? 0))
      .slice(0, 5)
      .map((i) => ({
        key: i.key,
        severity: (i.scoreRow!.autoScore === 0 ? 'danger' : 'warn') as 'danger' | 'warn',
        title: i.name,
        evidence: i.scoreRow!.autoEvidence ?? '',
      }))
    return { dims, composite, grade, issues, indicators: d.indicators }
  }, [diagQ.data])

  if (!Number.isFinite(projectId)) return <p className="text-body text-danger">无效的项目 ID</p>
  if (projectQ.isLoading) return <PageSkeleton />
  if (!project) return <p className="text-body text-danger">项目不存在</p>

  return (
    <div className="space-y-5">
      <PageHeader
        title={`新建诊断 · ${project.name}`}
        caption={`${project.domain} · 三步完成机器初评：确认域名 → 自动检测 → 人工复核`}
        right={<HistoryMenu projectId={projectId} />}
      />

      <motion.section
        className="geo-card mx-auto max-w-[880px] p-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <Stepper step={step} />
      </motion.section>

      {/* ---------- 步骤① 域名确认 ---------- */}
      {step === 1 && (
        <motion.section
          className="geo-card mx-auto max-w-[880px] p-10"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05, ease: EASE }}
        >
          <h2 className="text-h1 text-[#111827]">确认诊断目标域名</h2>
          <p className="mt-2 max-w-2xl text-body text-[#6b7280]">
            系统将探测 https/http × 裸域/www 四个入口变体，抓取 robots.txt、sitemap.xml、llms.txt 与首页，并抽样 ≤15 个站内页面解析。
          </p>

          <div className="mt-6 flex h-14 items-stretch overflow-hidden rounded-lg border border-[#e5e7eb] transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-accent-blue/30">
            <span className="flex items-center border-r border-[#e5e7eb] bg-[#f3f4f6] px-4 font-mono text-body text-[#9ca3af]">
              https://
            </span>
            <input
              value={effectiveDomain}
              onChange={(e) => {
                setDomain(e.target.value)
                setDomainTouched(true)
              }}
              placeholder="hanhoo.com"
              className="w-full px-4 font-mono text-[16px] outline-none"
            />
          </div>

          <div className="mt-5 space-y-2.5">
            {[
              '抓取站内样本页（≤15 页）',
              '检测 AI 爬虫准入（GPTBot / ClaudeBot / Bytespider / PerplexityBot）',
              '读取近 30 天实测记录用于可见度定档',
            ].map((t) => (
              <label key={t} className="flex cursor-default items-center gap-2.5 text-body text-[#374151]">
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded border border-brand bg-brand">
                  <Check className="h-3 w-3 text-white" />
                </span>
                {t}
              </label>
            ))}
          </div>

          <button
            type="button"
            disabled={!effectiveDomain.trim() || crawling}
            onClick={runCrawl}
            className={cn(btnPrimary, 'mt-8 h-11 w-[200px] text-[15px]')}
          >
            {crawling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            开始自动检测
          </button>
        </motion.section>
      )}

      {/* ---------- 步骤② 抓取进度 ---------- */}
      {step === 2 && (
        <motion.section
          className="geo-card mx-auto max-w-[880px] p-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          {crawlFailed && !crawling ? (
            /* 整体失败态：醒目说明 + 保证能进评分（非路由白屏） */
            <div className="rounded-xl border-2 border-[#fecaca] bg-[#fef2f2] px-6 py-10 text-center sm:px-10">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-sm">
                <AlertTriangle className="h-8 w-8 text-danger" />
              </span>
              <h2 className="mt-5 text-[22px] font-semibold leading-tight text-[#111827]">
                抓取失败 · 目标站点不可达
              </h2>
              <p className="mx-auto mt-3 max-w-lg rounded-lg border border-[#fecaca] bg-white/90 px-4 py-2.5 font-mono text-small text-[#991b1b]">
                {crawlFailed}
              </p>
              <div className="mx-auto mt-5 max-w-md space-y-2 text-left">
                <p className="text-body font-medium text-[#111827]">下一步说明</p>
                <ul className="list-disc space-y-1.5 pl-5 text-small text-[#4b5563]">
                  <li>
                    <span className="font-medium text-[#111827]">可跳过抓取</span>
                    ，18 项指标改人工定档——主按钮进入评分复核
                  </li>
                  <li>站点恢复可达后，可用次要按钮「重试抓取」再跑自动检测</li>
                  <li>当前仍停在新建页，不是路由白屏；诊断单已创建时可继续流程</li>
                </ul>
              </div>
              <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  className={cn(btnPrimary, 'h-12 min-w-[240px] px-6 text-[15px] shadow-sm')}
                  disabled={(diagId ?? diagIdRef.current) == null}
                  onClick={() => goToScoring(diagIdRef.current ?? diagId)}
                >
                  直接进入评分复核 <ChevronRight className="h-4 w-4" />
                </button>
                <button type="button" className={cn(btnSecondary, 'h-11')} onClick={runCrawl}>
                  <RefreshCw className="h-4 w-4" /> 重试抓取
                </button>
              </div>
              {!diagId && !diagIdRef.current ? (
                <p className="mt-3 text-small text-danger">诊断单尚未创建成功，请先重试抓取后再进入评分。</p>
              ) : (
                <p className="mt-3 text-small text-[#6b7280]">
                  诊断单 #{diagId ?? diagIdRef.current} 已创建 · 可跳过抓取，18 项改人工定档
                </p>
              )}
            </div>
          ) : (
            <>
              <h2 className="text-h1 text-[#111827]">自动检测进行中</h2>
              <p className="mt-1 font-mono text-caption text-[#6b7280]">
                {crawlSummary ? `检测完成：${crawlSummary.entry ?? effectiveDomain}` : `正在解析 https://${effectiveDomain} …`}
              </p>

              {/* 总进度条 */}
              <div className="mt-5 flex items-center gap-3">
                <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-[#f3f4f6]">
                  <motion.div
                    className={cn('h-full rounded-full', crawlSummary ? 'bg-success' : 'bg-brand')}
                    initial={false}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.4, ease: EASE }}
                  />
                  {!crawlSummary && (
                    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                  )}
                </div>
                <span className="w-10 text-right text-small font-semibold text-[#111827] tabular-nums">{progress}%</span>
              </div>

              {crawlSummary && failCount > 0 && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#fde3b3] bg-[#fff7e8] px-3.5 py-2.5 text-small text-[#b45309]">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  部分检测失败（{failCount} 项），可稍后人工复核补录
                </div>
              )}

              {/* 逐项清单 */}
              <div className="mt-5 grid gap-2 md:grid-cols-2">
                {checklist.map((item, i) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: crawlSummary ? i * 0.05 : 0, ease: EASE }}
                    className="flex items-center gap-2.5 rounded-lg border border-[#f3f4f6] bg-[#fafbfc] px-3 py-2.5"
                  >
                    <span className="shrink-0">{STATUS_ICON[item.status]}</span>
                    <div className="min-w-0">
                      <p className="truncate text-small font-medium text-[#374151]">{item.label}</p>
                      <p className="truncate font-mono text-caption text-[#9ca3af]">{item.detail}</p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {crawlSummary && (
                <motion.div
                  className="mt-5 flex justify-end"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.6 }}
                >
                  <button type="button" className={btnPrimary} onClick={() => setStep(3)}>
                    查看初评摘要 <ChevronRight className="h-4 w-4" />
                  </button>
                </motion.div>
              )}
            </>
          )}
        </motion.section>
      )}

      {/* ---------- 步骤③ 初评摘要 ---------- */}
      {step === 3 && (
        <div className="mx-auto max-w-[880px] space-y-5">
          <motion.div
            className="flex items-center gap-2 rounded-lg border border-[#b6ecd8] bg-[#e8faf3] px-4 py-3 text-small text-[#047857]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <Check className="h-4 w-4 shrink-0" />
            自动检测完成（12/12 项执行{failCount > 0 ? `，${failCount} 项未检出` : ''}），机器建议分已生成，请人工复核定档
          </motion.div>

          {!machine ? (
            <div className="geo-card flex h-48 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-brand" />
            </div>
          ) : (
            <>
              <div className="grid gap-5 md:grid-cols-3">
                {/* 左：综合分 */}
                <motion.section
                  className="geo-card flex items-center justify-center p-6"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.05, ease: EASE }}
                >
                  <ScoreGauge value={machine.composite} grade={machine.grade} caption="机器初评，仅供复核参考" />
                </motion.section>

                {/* 中：四维条 */}
                <motion.section
                  className="geo-card p-6"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.12, ease: EASE }}
                >
                  <h3 className="text-h2 text-[#111827]">四维度建议分</h3>
                  <div className="mt-4 space-y-4">
                    {DIMS.map((d, i) => (
                      <DimBar
                        key={d.dim}
                        dim={d.dim}
                        delay={0.15 + i * 0.1}
                        value={[machine.dims.tech, machine.dims.arch, machine.dims.content, machine.dims.vis][i]!}
                      />
                    ))}
                  </div>
                  <p className="mt-4 text-caption text-[#9ca3af]">权重：技术×25% + 页面×20% + 内容×30% + 可见度×25%</p>
                </motion.section>

                {/* 右：关键问题速览 */}
                <motion.section
                  className="geo-card p-6"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.19, ease: EASE }}
                >
                  <h3 className="text-h2 text-[#111827]">关键问题速览</h3>
                  <div className="mt-3 space-y-2.5">
                    {machine.issues.length === 0 && (
                      <p className="text-small text-[#6b7280]">未检出明显问题，仍以人工复核为准。</p>
                    )}
                    {machine.issues.map((iss, i) => (
                      <motion.div
                        key={iss.key}
                        className="flex items-start gap-2"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.25 + i * 0.08, ease: EASE }}
                      >
                        <span
                          className={cn(
                            'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-caption font-medium',
                            iss.severity === 'danger' ? 'bg-[#fef2f2] text-danger' : 'bg-[#fff7e8] text-[#b45309]',
                          )}
                        >
                          {iss.severity === 'danger' ? '严重' : '待优化'}
                        </span>
                        <span className="text-small text-[#374151]" title={iss.evidence}>
                          {iss.title}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </motion.section>
              </div>

              {/* 18 项建议分折叠表 */}
              <motion.section
                className="geo-card"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.25, ease: EASE }}
              >
                <button
                  type="button"
                  onClick={() => setDetailOpen((v) => !v)}
                  className="flex w-full items-center gap-2 px-5 py-4 text-left text-body font-medium text-[#374151] transition-colors hover:bg-[#f9fafb]"
                >
                  <ChevronDown className={cn('h-4 w-4 transition-transform', detailOpen && 'rotate-180')} />
                  {detailOpen ? '收起' : '展开查看'} 18 项建议分明细
                </button>
                <AnimatePresence initial={false}>
                  {detailOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.24, ease: EASE }}
                      className="overflow-hidden"
                    >
                      <table className="w-full text-left text-body">
                        <thead>
                          <tr className="bg-[#f3f4f6] text-small font-semibold text-[#6b7280]">
                            <th className="px-5 py-2.5">维度</th>
                            <th className="px-4 py-2.5">指标</th>
                            <th className="px-4 py-2.5">建议分</th>
                            <th className="px-4 py-2.5">机器证据摘要</th>
                          </tr>
                        </thead>
                        <tbody>
                          {machine.indicators.map((ind) => {
                            const autoScore = ind.scoreRow?.autoScore ?? null
                            return (
                              <tr key={ind.key} className="border-t border-[#f3f4f6]">
                                <td className="px-5 py-2.5 text-small text-[#6b7280]">
                                  {DIMS.find((d) => d.dim === ind.dimension)?.short}
                                </td>
                                <td className="px-4 py-2.5 text-small font-medium text-[#111827]">{ind.name}</td>
                                <td className="px-4 py-2.5">
                                  {autoScore === null ? (
                                    <span className="text-caption text-[#9ca3af]">待人工</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 text-small font-semibold tabular-nums">
                                      <span
                                        className="h-2 w-2 rounded-full"
                                        style={{
                                          backgroundColor:
                                            autoScore === 20 ? '#10b981' : autoScore === 15 ? '#0ea5e9' : autoScore === 10 ? '#f59e0b' : '#ef4444',
                                        }}
                                      />
                                      {autoScore}
                                    </span>
                                  )}
                                </td>
                                <td className="max-w-[380px] truncate px-4 py-2.5 font-mono text-caption text-[#6b7280]" title={ind.scoreRow?.autoEvidence ?? ''}>
                                  {ind.scoreRow?.autoEvidence ?? '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.section>

              <div className="flex items-center justify-between pb-2">
                <button type="button" className={btnGhost} onClick={runCrawl} disabled={crawling}>
                  <RefreshCw className={cn('h-4 w-4', crawling && 'animate-spin')} /> 重新抓取
                </button>
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={(diagId ?? diagIdRef.current) == null}
                  onClick={() => goToScoring(diagIdRef.current ?? diagId)}
                >
                  进入评分复核 <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
