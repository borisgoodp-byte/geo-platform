/**
 * 维度四 · DeepGEO 自动查可见度
 * 默认：runDeepgeoVis → 回填九格 + 定档（成功少确认，不逐格手点）
 * 失败：露出人工九格 → saveVisManual
 * 韩后无代理：服务端 demo_auto 样例短路全自动。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ClipboardPaste, Loader2, Radar, RefreshCw, TriangleAlert } from 'lucide-react'
import {
  DEEPGEO_ADAPTER,
  DEEPGEO_INCLUSION_URL,
  DEEPGEO_PLATFORM_ORDER,
  HANHOO_DEFAULT_VIS_PROMPTS,
  HANHOO_DEEPGEO_SAMPLE_CELLS,
  emptyNineGridTemplate,
  type SuggestedVisWords,
} from '@contracts/deepgeoVis'
import {
  NINE_GRID_COLUMNS,
  visCellKey,
  type ManualVisCellInput,
} from '@contracts/diagnosisMeasure'
import {
  PLATFORM_LABELS,
  VIS_WORD_TYPE_HINTS,
  VIS_WORD_TYPE_LABELS,
  type Platform,
  type VisWordType,
} from '@contracts/kpi'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/providers/auth'
import { cn } from '@/lib/utils'
import { btnPrimary, btnSecondary } from './meta'

type CellState = {
  wordType: VisWordType
  platform: Platform
  promptText: string
  officialSiteCited: boolean | null
  brandMentionOnly: boolean
  evidenceNote: string
}

/** idle → running 自动查 → saved 成功 / manual 失败人工 / error */
type Phase = 'idle' | 'running' | 'saved' | 'manual' | 'error'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function buildCellsFromWords(words: Pick<SuggestedVisWords, 'decision' | 'scenario' | 'compare'>): CellState[] {
  return emptyNineGridTemplate(words).map((t) => ({
    ...t,
    officialSiteCited: null,
    brandMentionOnly: false,
    evidenceNote: '',
  }))
}

function cellsFromApi(
  cells: Array<{
    wordType: VisWordType
    platform: Platform
    promptText: string
    officialSiteCited: boolean
    brandMentionOnly?: boolean
    evidenceNote?: string | null
  }>,
): CellState[] {
  return cells.map((c) => ({
    wordType: c.wordType,
    platform: c.platform,
    promptText: c.promptText,
    officialSiteCited: c.officialSiteCited,
    brandMentionOnly: c.brandMentionOnly ?? false,
    evidenceNote: c.evidenceNote ?? '',
  }))
}

export function DeepgeoVisPanel({
  projectId,
  diagnosticId,
  compact,
  onSaved,
  className,
  /** 进入评分维度四时默认自动跑一轮 */
  autoStart = true,
}: {
  projectId: number
  diagnosticId: number
  compact?: boolean
  onSaved?: () => void
  className?: string
  autoStart?: boolean
}) {
  const { user } = useAuth()
  const canWrite = user?.role === 'operator' || user?.role === 'lead'
  const utils = trpc.useUtils()
  const autoStarted = useRef(false)

  const [phase, setPhase] = useState<Phase>('idle')
  const [words, setWords] = useState<SuggestedVisWords | null>(null)
  const [cells, setCells] = useState<CellState[]>([])
  const [measureDate, setMeasureDate] = useState(todayStr())
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [failHint, setFailHint] = useState<string | null>(null)
  const [usedFallback, setUsedFallback] = useState(false)
  const [providerTag, setProviderTag] = useState<'deepgeo' | 'demo_auto' | null>(null)
  const [manualSubmitting, setManualSubmitting] = useState(false)
  const [visScores, setVisScores] = useState<Record<string, { score: number; hits: number; evidence: string }> | null>(
    null,
  )

  const runMut = trpc.diagnostics.runDeepgeoVis.useMutation()
  const applyMut = trpc.diagnostics.applyVisGrid.useMutation()
  const manualMut = trpc.diagnostics.saveVisManual.useMutation()

  const filledCount = cells.filter((c) => c.officialSiteCited !== null).length
  const allFilled = cells.length === 9 && filledCount === 9

  const prepareManualFallback = useCallback(
    async (hint: string) => {
      setFailHint(hint)
      try {
        const res = await utils.client.diagnostics.suggestVisWords.query({ projectId })
        const w: SuggestedVisWords = {
          decision: res.decision,
          scenario: res.scenario,
          compare: res.compare,
          source: res.source,
          siteDomain: res.siteDomain,
        }
        setWords(w)
        setCells(buildCellsFromWords(w))
      } catch {
        const fallback: SuggestedVisWords = {
          ...HANHOO_DEFAULT_VIS_PROMPTS,
          source: 'generated',
          siteDomain: 'hanhoo.com',
        }
        setWords(fallback)
        setCells(buildCellsFromWords(fallback))
      }
      setPhase('manual')
    },
    [projectId, utils.client.diagnostics.suggestVisWords],
  )

  /** 一键自动查并定档（禁止默认手点九格） */
  const autoRun = useCallback(async () => {
    if (!canWrite) return
    setPhase('running')
    setErrMsg(null)
    setFailHint(null)
    setUsedFallback(false)
    setVisScores(null)
    setProviderTag(null)
    try {
      const res = await runMut.mutateAsync({
        projectId,
        diagnosticId,
        measureDate,
        persist: true,
      })
      const w: SuggestedVisWords = {
        decision: res.words.decision,
        scenario: res.words.scenario,
        compare: res.words.compare,
        source: res.words.source,
        siteDomain: res.words.siteDomain,
      }
      setWords(w)
      setCells(cellsFromApi(res.cells))
      setProviderTag(res.provider)
      if (res.persisted && 'visScores' in res && res.visScores) {
        setVisScores(res.visScores)
        setPhase('saved')
        await utils.diagnostics.get.invalidate({ id: diagnosticId })
        onSaved?.()
      } else {
        // persist=false 路径：自动 applyVisGrid
        const applyRes = await applyMut.mutateAsync({
          diagnosticId,
          projectId,
          measureDate,
          words: { decision: w.decision, scenario: w.scenario, compare: w.compare },
          cells: res.cells,
          provider: res.provider,
        })
        setVisScores(applyRes.visScores)
        setPhase('saved')
        await utils.diagnostics.get.invalidate({ id: diagnosticId })
        onSaved?.()
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'DeepGEO 自动查失败'
      await prepareManualFallback(
        `${msg}。入口 ${DEEPGEO_INCLUSION_URL} 须已登录；可下方人工确认九格（${DEEPGEO_ADAPTER.status}）`,
      )
    }
  }, [
    applyMut,
    canWrite,
    diagnosticId,
    measureDate,
    onSaved,
    prepareManualFallback,
    projectId,
    runMut,
    utils.diagnostics.get,
  ])

  useEffect(() => {
    if (!canWrite || !autoStart || autoStarted.current) return
    autoStarted.current = true
    void autoRun()
  }, [autoStart, autoRun, canWrite])

  const setCell = (wordType: VisWordType, platform: Platform, patch: Partial<CellState>) => {
    setCells((prev) =>
      prev.map((c) => (c.wordType === wordType && c.platform === platform ? { ...c, ...patch } : c)),
    )
  }

  const markAllMiss = () => {
    setCells((prev) =>
      prev.map((c) => ({
        ...c,
        officialSiteCited: false,
        brandMentionOnly: false,
        evidenceNote: c.evidenceNote || '人工确认：官网未引用',
      })),
    )
  }

  /** 失败兜底：一键填韩后样例后再提交 */
  const fillHanhooSample = () => {
    const w = words ?? {
      ...HANHOO_DEFAULT_VIS_PROMPTS,
      source: 'generated' as const,
      siteDomain: 'hanhoo.com',
    }
    if (!words) setWords(w)
    setCells(
      HANHOO_DEEPGEO_SAMPLE_CELLS({
        decision: w.decision,
        scenario: w.scenario,
        compare: w.compare,
      }).map((c) => ({
        wordType: c.wordType,
        platform: c.platform,
        promptText: c.promptText,
        officialSiteCited: c.officialSiteCited,
        brandMentionOnly: c.brandMentionOnly,
        evidenceNote: c.evidenceNote,
      })),
    )
    setPhase('manual')
    setErrMsg(null)
    setFailHint('已填入韩后 DeepGEO 样例（九格全 miss · 演示），请点确认回填定档')
  }

  const toPayloadCells = (): ManualVisCellInput[] =>
    cells.map((c) => ({
      wordType: c.wordType,
      platform: c.platform,
      promptText: c.promptText,
      officialSiteCited: !!c.officialSiteCited,
      brandMentionOnly: c.brandMentionOnly,
      evidenceNote: c.evidenceNote || null,
      answerExcerpt: null,
      sourceUrls: [],
    }))

  const submitManual = async () => {
    if (!words || !allFilled || !canWrite) return
    setManualSubmitting(true)
    setErrMsg(null)
    setUsedFallback(false)
    const payloadCells = toPayloadCells()
    try {
      const res = await applyMut.mutateAsync({
        diagnosticId,
        projectId,
        measureDate,
        words: {
          decision: words.decision,
          scenario: words.scenario,
          compare: words.compare,
        },
        cells: payloadCells,
        provider: 'deepgeo',
      })
      setVisScores(res.visScores)
      setProviderTag('deepgeo')
      setPhase('saved')
      await utils.diagnostics.get.invalidate({ id: diagnosticId })
      onSaved?.()
    } catch (e) {
      try {
        const res = await manualMut.mutateAsync({
          diagnosticId,
          projectId,
          measureDate,
          cells: payloadCells,
        })
        setVisScores(res.visScores)
        setUsedFallback(true)
        setFailHint(e instanceof Error ? e.message : 'applyVisGrid 失败，已改用人工录入')
        setPhase('saved')
        await utils.diagnostics.get.invalidate({ id: diagnosticId })
        onSaved?.()
      } catch (e2) {
        setErrMsg(e2 instanceof Error ? e2.message : '提交失败')
        setPhase('error')
      }
    } finally {
      setManualSubmitting(false)
    }
  }

  const wordSummary = useMemo(() => {
    if (!words) {
      return [
        { t: 'decision' as const, text: HANHOO_DEFAULT_VIS_PROMPTS.decision },
        { t: 'scenario' as const, text: HANHOO_DEFAULT_VIS_PROMPTS.scenario },
        { t: 'compare' as const, text: HANHOO_DEFAULT_VIS_PROMPTS.compare },
      ]
    }
    return [
      { t: 'decision' as const, text: words.decision },
      { t: 'scenario' as const, text: words.scenario },
      { t: 'compare' as const, text: words.compare },
    ]
  }, [words])

  if (!canWrite) {
    return (
      <div className={cn('rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-4 py-3 text-caption text-[#9ca3af]', className)}>
        维度四可见度由执行侧用 DeepGEO 自动查回填；客户只读评分结果。
      </div>
    )
  }

  return (
    <div className={cn('rounded-xl border border-[#b6ecd8] bg-[#f2fdf8]', className)}>
      <div className={cn('flex flex-wrap items-start gap-3 px-4 py-3', compact ? 'sm:items-center' : '')}>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#10b981]/20 text-[#059669]">
          <Radar className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-[#047857]">DeepGEO 自动查可见度</p>
          <p className="mt-0.5 text-caption text-[#6b7280]">
            按决策 / 场景 / 对比三问自动查豆包 · DeepSeek · 通义千问，回填九格并定档；
            <b className="font-medium text-[#374151]">不测品牌词 · 禁止默认手点九格</b>。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {phase === 'running' ? (
            <button type="button" className={btnPrimary} disabled>
              <Loader2 className="h-4 w-4 animate-spin" /> 自动查中…
            </button>
          ) : (
            <button type="button" className={btnPrimary} onClick={() => void autoRun()}>
              <Radar className="h-4 w-4" />
              {phase === 'saved' ? '重新自动查并回填' : 'DeepGEO 自动查并回填'}
            </button>
          )}
          {phase === 'manual' && (
            <button type="button" className={btnSecondary} onClick={() => void autoRun()}>
              <RefreshCw className="h-4 w-4" /> 重试自动查
            </button>
          )}
        </div>
      </div>

      {/* 三问只读摘要（无问词弹窗） */}
      <div className="border-t border-[#d1fae5] px-4 py-3">
        <p className="mb-2 text-caption font-medium text-[#6b7280]">
          本次将查的三问
          {words ? (
            <span className="ml-1 font-normal text-[#9ca3af]">
              · 来源 {words.source === 'pool' ? '项目词池' : '系统生成'} · 官网域 {words.siteDomain}
            </span>
          ) : (
            <span className="ml-1 font-normal text-[#9ca3af]">· 进入本页将自动拉词并查询</span>
          )}
        </p>
        <ul className="space-y-1.5">
          {wordSummary.map((w) => (
            <li key={w.t} className="flex gap-2 text-small text-[#374151]">
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-caption font-medium text-[#059669] ring-1 ring-[#b6ecd8]">
                {VIS_WORD_TYPE_LABELS[w.t]}（{VIS_WORD_TYPE_HINTS[w.t]}）
              </span>
              <span className="min-w-0 break-words">{w.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {failHint && (phase === 'manual' || phase === 'error') && (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-[#fde3b3] bg-[#fffaf0] px-3 py-2 text-caption text-[#b45309]">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {failHint}
            <span className="mt-1 block text-[#9ca3af]">
              适配 · {DEEPGEO_ADAPTER.status} · 人工兜底九格已展开
            </span>
          </span>
        </div>
      )}

      {/* 仅失败才露出人工九格；成功路径不强迫 hit/miss */}
      {(phase === 'manual' || phase === 'error') && (
        <div className="border-t border-[#d1fae5] px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption font-medium text-[#374151]">
              <ClipboardPaste className="mr-1 inline h-3.5 w-3.5" />
              人工九格兜底 · {filledCount}/9
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-caption text-[#6b7280]">
                实测日
                <input
                  type="date"
                  value={measureDate}
                  onChange={(e) => setMeasureDate(e.target.value)}
                  className="h-8 rounded-md border border-[#e5e7eb] bg-white px-2 text-small"
                />
              </label>
              <button type="button" className={btnSecondary} onClick={markAllMiss}>
                全部标为未引用
              </button>
              <button
                type="button"
                className={btnSecondary}
                onClick={fillHanhooSample}
                title="媒介运营组韩后 DeepGEO 九格全 miss 样例"
              >
                填入韩后样例
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-[#e5e7eb] bg-white">
            <table className="w-full min-w-[640px] border-collapse text-small">
              <thead>
                <tr className="bg-[#f9fafb] text-caption text-[#6b7280]">
                  <th className="px-3 py-2 text-left font-medium">平台</th>
                  {NINE_GRID_COLUMNS.map((wt) => (
                    <th key={wt} className="px-3 py-2 text-left font-medium">
                      {VIS_WORD_TYPE_LABELS[wt]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEEPGEO_PLATFORM_ORDER.map((platform) => (
                  <tr key={platform} className="border-t border-[#f3f4f6]">
                    <td className="px-3 py-2 font-medium text-[#111827]">{PLATFORM_LABELS[platform]}</td>
                    {NINE_GRID_COLUMNS.map((wordType) => {
                      const cell = cells.find((c) => c.wordType === wordType && c.platform === platform)
                      if (!cell) return <td key={wordType} />
                      const key = visCellKey(wordType, platform)
                      return (
                        <td key={key} className="px-2 py-2 align-top">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => setCell(wordType, platform, { officialSiteCited: true, brandMentionOnly: false })}
                                className={cn(
                                  'h-7 flex-1 rounded-md border text-caption font-medium transition-colors',
                                  cell.officialSiteCited === true
                                    ? 'border-transparent bg-[#10b981] text-white'
                                    : 'border-[#e5e7eb] bg-white text-[#6b7280] hover:bg-[#f0fdf4]',
                                )}
                              >
                                hit
                              </button>
                              <button
                                type="button"
                                onClick={() => setCell(wordType, platform, { officialSiteCited: false })}
                                className={cn(
                                  'h-7 flex-1 rounded-md border text-caption font-medium transition-colors',
                                  cell.officialSiteCited === false
                                    ? 'border-transparent bg-[#ef4444] text-white'
                                    : 'border-[#e5e7eb] bg-white text-[#6b7280] hover:bg-[#fef2f2]',
                                )}
                              >
                                miss
                              </button>
                            </div>
                            <input
                              value={cell.evidenceNote}
                              onChange={(e) => setCell(wordType, platform, { evidenceNote: e.target.value })}
                              placeholder="简短证据"
                              className="h-7 w-full rounded-md border border-[#e5e7eb] px-2 text-caption outline-none focus:border-brand"
                            />
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {errMsg && <p className="mt-2 text-caption text-danger">{errMsg}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={!allFilled || manualSubmitting}
              onClick={() => void submitManual()}
              title={allFilled ? '提交 applyVisGrid 定档维度四' : '请填完九格 hit/miss'}
            >
              {manualSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              确认回填并定档
            </button>
            <span className="text-caption text-[#9ca3af]">优先 applyVisGrid · 失败自动改 saveVisManual</span>
          </div>
        </div>
      )}

      {phase === 'saved' && visScores && (
        <div className="border-t border-[#d1fae5] px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-small font-medium text-[#047857]">
            <Check className="h-4 w-4" />
            已自动回填定档
            {usedFallback
              ? '（人工兜底 saveVisManual）'
              : providerTag === 'demo_auto'
                ? '（demo_auto · 韩后样例短路）'
                : '（DeepGEO · applyVisGrid）'}
          </p>
          <ul className="space-y-1 text-caption text-[#374151]">
            {Object.entries(visScores).map(([k, v]) => (
              <li key={k}>
                <b>{k}</b> → {v.score} 分（命中 {v.hits}/3）· {v.evidence}
              </li>
            ))}
          </ul>
        </div>
      )}

      {phase === 'running' && (
        <div className="border-t border-[#d1fae5] px-4 py-3 text-caption text-[#6b7280]">
          正在拉三问并自动查询 / 回填定档，无需手点九格…
        </div>
      )}
    </div>
  )
}

/** Measure 页顶：解析最近诊断单后挂载面板（不自动跑，避免误写；一点主按钮即可） */
export function DeepgeoVisEntryForProject({ projectId }: { projectId: number }) {
  const listQ = trpc.diagnostics.listByProject.useQuery({ projectId }, { enabled: projectId > 0 })
  const latest = listQ.data?.[0]
  if (listQ.isLoading) return null
  if (!latest) {
    return (
      <div className="rounded-xl border border-dashed border-[#e5e7eb] bg-white px-4 py-3 text-caption text-[#9ca3af]">
        暂无诊断单。新建诊断并进入评分后，可用 DeepGEO 自动查可见度回填维度四九格。
      </div>
    )
  }
  return <DeepgeoVisPanel projectId={projectId} diagnosticId={latest.id} compact autoStart={false} />
}
