import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, CircleDashed, Loader2, Wand2 } from 'lucide-react'
import {
  DIMENSION_INDICATOR_KEYS,
  computeComposite,
  computeDimensionScore,
  computeGrade,
} from '@contracts/scoring'
import type { DimensionKey } from '@contracts/scoring'
import { trpc } from '@/providers/trpc'
import { cn } from '@/lib/utils'
import { DIMS, EASE, btnPrimary, btnSecondary, nowTime } from '@/features/diagnosis/meta'
import { useToasts } from '@/features/diagnosis/useToasts'
import {
  DiagStatusChip,
  DimDot,
  GradeBadge,
  PageHeader,
  PageSkeleton,
  SavedChip,
  ScoreGauge,
  ToastHost,
} from '@/features/diagnosis/ui'

const SCORE_OPTIONS = [
  { v: 20, label: '20 优秀', color: '#10b981' },
  { v: 15, label: '15 良好', color: '#0ea5e9' },
  { v: 10, label: '10 待提升', color: '#f59e0b' },
  { v: 0, label: '0 缺失', color: '#ef4444' },
] as const

const GRADE_SCALE = [
  { g: 'A 优秀', range: '≥80', color: '#10b981', from: 80 },
  { g: 'B 良好', range: '65–79.9', color: '#0ea5e9', from: 65 },
  { g: 'C 待提升', range: '45–64.9', color: '#f59e0b', from: 45 },
  { g: 'D 亟需优化', range: '<45', color: '#ef4444', from: 0 },
]

type Scores = Record<string, number | null>
type Evidences = Record<string, string>

export default function Scoring() {
  const { id, dId } = useParams()
  const projectId = Number(id)
  const diagId = Number(dId)
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const { toasts, push } = useToasts()

  const diagQ = trpc.diagnostics.get.useQuery({ id: diagId }, { enabled: Number.isFinite(diagId) })
  const projectQ = trpc.projects.get.useQuery({ id: projectId }, { enabled: Number.isFinite(projectId) })
  const diag = diagQ.data

  const [scores, setScores] = useState<Scores>({})
  const [evidence, setEvidence] = useState<Evidences>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [flashKey, setFlashKey] = useState<string | null>(null)
  const [confirmAdoptDim, setConfirmAdoptDim] = useState<number | null>(null)
  const initedRef = useRef(false)

  // 初次载入：用服务端评分初始化本地状态
  useEffect(() => {
    if (!diag || initedRef.current) return
    const s: Scores = {}
    const e: Evidences = {}
    for (const ind of diag.indicators) {
      s[ind.key] = ind.scoreRow?.score ?? null
      e[ind.key] = ind.scoreRow?.evidence ?? ''
    }
    setScores(s)
    setEvidence(e)
    initedRef.current = true
  }, [diag])

  const saveMut = trpc.diagnostics.saveScores.useMutation()
  const completeMut = trpc.diagnostics.complete.useMutation()

  const buildPayload = useCallback(() => {
    if (!diag) return []
    return diag.indicators
      .filter((i) => i.dimension !== 4 && scores[i.key] !== null && scores[i.key] !== undefined)
      .map((i) => ({ indicatorKey: i.key, score: scores[i.key]!, evidence: evidence[i.key] ?? '' }))
  }, [diag, scores, evidence])

  const savingRef = useRef(false)
  const doSave = useCallback(
    async (silent: boolean) => {
      const payload = buildPayload()
      if (!diag || savingRef.current) return true
      savingRef.current = true
      try {
        await saveMut.mutateAsync({ diagnosticId: diag.id, scores: payload })
        setDirty(false)
        setSavedAt(nowTime())
        if (!silent) push('success', `已保存 ${payload.length} 项进度`)
        await utils.diagnostics.get.invalidate({ id: diag.id })
        return true
      } catch (err) {
        push('error', err instanceof Error ? err.message : '保存失败')
        return false
      } finally {
        savingRef.current = false
      }
    },
    [buildPayload, diag, saveMut, push, utils],
  )

  // 失焦自动暂存（防抖 800ms）
  useEffect(() => {
    if (!dirty) return
    const t = window.setTimeout(() => void doSave(true), 800)
    return () => window.clearTimeout(t)
  }, [dirty, scores, evidence, doSave])

  const setScore = useCallback(
    (key: string, v: number) => {
      setScores((s) => ({ ...s, [key]: v }))
      setDirty(true)
      setFlashKey(key)
      window.setTimeout(() => setFlashKey(null), 500)
    },
    [],
  )

  // 键盘流：展开行上按 1/2/3/4 直接定档
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!expanded) return
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return
      const map: Record<string, number> = { '1': 20, '2': 15, '3': 10, '4': 0 }
      if (map[e.key] !== undefined && !expanded.startsWith('vis_')) {
        setScore(expanded, map[e.key]!)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [expanded, setScore])

  /* ----- 实时算分 ----- */
  const visScores = useMemo(() => {
    const m: Record<string, number> = {}
    if (diag) for (const ind of diag.indicators.filter((i) => i.dimension === 4)) m[ind.key] = ind.scoreRow?.score ?? 0
    return m
  }, [diag])

  const realtime = useMemo(() => {
    const map: Record<string, number> = {}
    for (const [k, v] of Object.entries(scores)) map[k] = v ?? 0
    for (const [k, v] of Object.entries(visScores)) map[k] = v
    const dims = computeDimensionScore(map)
    const composite = computeComposite(dims)
    return { dims, composite, grade: computeGrade(composite) }
  }, [scores, visScores])

  const doneKeys = useMemo(
    () =>
      Object.entries(scores)
        .filter(([k, v]) => v !== null && v !== undefined && !k.startsWith('vis_'))
        .map(([k]) => k),
    [scores],
  )
  const totalCount = 18
  const doneCount = doneKeys.length + 3 // 维度四三项由实测自动定档
  const allDone = doneKeys.length === 15
  const undone = useMemo(
    () => (diag ? diag.indicators.filter((i) => i.dimension !== 4 && (scores[i.key] === null || scores[i.key] === undefined)) : []),
    [diag, scores],
  )

  const adoptMachine = (dim: number) => {
    if (confirmAdoptDim !== dim) {
      setConfirmAdoptDim(dim)
      window.setTimeout(() => setConfirmAdoptDim(null), 3000)
      return
    }
    setConfirmAdoptDim(null)
    if (!diag) return
    const patch: Scores = {}
    for (const ind of diag.indicators) {
      if (ind.dimension === dim && ind.dimension !== 4 && ind.scoreRow?.autoScore !== null && ind.scoreRow?.autoScore !== undefined) {
        patch[ind.key] = ind.scoreRow.autoScore
      }
    }
    setScores((s) => ({ ...s, ...patch }))
    setDirty(true)
    push('info', `已采纳维度${['一', '二', '三', '四'][dim - 1]}全部机器建议`)
  }

  const completeAll = async () => {
    if (!diag) return
    const ok = await doSave(true)
    if (!ok) return
    try {
      await completeMut.mutateAsync({ diagnosticId: diag.id })
      push('success', '评分完成，进入发现与结论编辑')
      navigate(`/projects/${projectId}/diagnosis/${diag.id}/findings`)
    } catch (err) {
      push('error', err instanceof Error ? err.message : '完成评分失败')
    }
  }

  const scrollToRow = (key: string) => {
    setExpanded(key)
    requestAnimationFrame(() => {
      document.getElementById(`row-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setFlashKey(key)
      window.setTimeout(() => setFlashKey(null), 1200)
    })
  }

  if (!Number.isFinite(diagId)) return <p className="text-body text-danger">无效的诊断 ID</p>
  if (diagQ.isLoading) return <PageSkeleton />
  if (!diag) return <p className="text-body text-danger">诊断单不存在</p>

  const dimValues = [realtime.dims.tech, realtime.dims.arch, realtime.dims.content, realtime.dims.vis]

  return (
    <div className="space-y-5">
      <PageHeader
        title="评分复核"
        badge={<DiagStatusChip status={diag.status} />}
        caption={`${projectQ.data?.name ?? ''} · ${diag.diagnoseDate} 诊断 · 快捷键 1/2/3/4 对展开项直接打 20/15/10/0`}
        right={
          <>
            <SavedChip savedAt={savedAt} saving={saveMut.isPending} />
            <button type="button" className={btnSecondary} onClick={() => void doSave(false)} disabled={saveMut.isPending}>
              保存草稿
            </button>
            <button
              type="button"
              className={btnPrimary}
              disabled={!allDone || completeMut.isPending}
              title={allDone ? '完成评分并进入发现编辑' : `还有 ${15 - doneKeys.length} 项未定档`}
              onClick={() => void completeAll()}
            >
              {completeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              完成评分 →
            </button>
          </>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-4">
        {/* ---------- 主区：维度分组卡 ---------- */}
        <div className="space-y-5 xl:col-span-3">
          {DIMS.map((d, di) => {
            const keys = DIMENSION_INDICATOR_KEYS[d.dim as DimensionKey]
            const rows = diag.indicators.filter((i) => keys.includes(i.key))
            const isVis = d.dim === 4
            return (
              <motion.section
                key={d.dim}
                className="geo-card"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: di * 0.06, ease: EASE }}
              >
                {/* 卡头 */}
                <div className="flex flex-wrap items-center gap-3 border-b border-[#f3f4f6] px-5 py-4">
                  <DimDot dim={d.dim} />
                  <h2 className="text-h2 text-[#111827]">{d.label}</h2>
                  <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-caption text-[#6b7280]">权重 {d.weight}%</span>
                  {!isVis && (
                    <button
                      type="button"
                      onClick={() => adoptMachine(d.dim)}
                      className={cn(
                        'ml-auto inline-flex items-center gap-1 text-small transition-colors',
                        confirmAdoptDim === d.dim ? 'font-semibold text-danger' : 'text-brand hover:text-brand-deep',
                      )}
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      {confirmAdoptDim === d.dim ? '再次点击确认采纳' : '全部采纳机器建议'}
                    </button>
                  )}
                  <div className={cn('flex items-center gap-3', isVis && 'ml-auto')}>
                    <span className="text-[20px] font-bold text-[#111827] tabular-nums">
                      {dimValues[di]!.toFixed(dimValues[di]! % 1 ? 1 : 0)}
                      <span className="text-small font-normal text-[#9ca3af]"> / 100</span>
                    </span>
                    <div className="h-1 w-20 overflow-hidden rounded-full bg-[#f3f4f6]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: d.color }}
                        animate={{ width: `${dimValues[di]}%` }}
                        transition={{ duration: 0.3, ease: EASE }}
                      />
                    </div>
                  </div>
                </div>

                {isVis && (
                  <div className="border-b border-[#f3f4f6] bg-[#fffaf0] px-5 py-2.5 text-caption text-[#b45309]">
                    按近 30 天实测，该词类三平台命中平台数自动定档（3→20 / 2→15 / 1→10 / 0→0），本维度为只读
                  </div>
                )}

                {/* 指标行 */}
                <div className="divide-y divide-[#f3f4f6]">
                  {rows.map((ind) => {
                    const key = ind.key
                    const autoScore = ind.scoreRow?.autoScore ?? null
                    const human = scores[key] ?? null
                    const isOpen = expanded === key
                    const visVal = isVis ? (ind.scoreRow?.score ?? 0) : null
                    const visEv = isVis ? (ind.scoreRow?.evidence ?? ind.scoreRow?.autoEvidence ?? null) : null
                    return (
                      <div
                        key={key}
                        id={`row-${key}`}
                        className={cn(
                          'px-5 py-3 transition-shadow',
                          flashKey === key && 'shadow-[inset_0_0_0_2px_#1a56db] rounded-lg',
                        )}
                      >
                        {/* 收起态一行 */}
                        <div className="flex min-h-[48px] flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : key)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-[#9ca3af] transition-transform', isOpen && 'rotate-180')} />
                            <span className="text-body font-semibold text-[#111827]">{ind.name}</span>
                            {!isVis && human === null && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#c4c9d1]" title="未定档" />}
                            {key === 'cont_5' && (
                              <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-caption text-[#6b7280]">人工为主</span>
                            )}
                          </button>

                          {isVis ? (
                            <span
                              className="inline-flex cursor-help items-center gap-1.5 rounded-full bg-[#e8faf3] px-2.5 py-1 text-caption font-medium text-[#059669]"
                              title={visEv ?? '暂无实测记录，默认 0 分，保存后由服务端按实测数据定档'}
                            >
                              自动定档 {visVal} 分
                            </span>
                          ) : (
                            <>
                              {/* 机器建议胶囊（点击一键采纳） */}
                              {autoScore !== null ? (
                                <button
                                  type="button"
                                  onClick={() => setScore(key, autoScore)}
                                  title="点击采纳机器建议"
                                  className="shrink-0 rounded-full bg-brand-light px-2.5 py-1 text-caption font-medium text-brand transition-colors hover:bg-[#dbe7ff]"
                                >
                                  机器建议 {autoScore}
                                  {key.startsWith('cont_') && ' · 保守值'}
                                </button>
                              ) : (
                                <span className="shrink-0 rounded-full bg-[#f3f4f6] px-2.5 py-1 text-caption text-[#9ca3af]">无机器建议</span>
                              )}

                              {/* 四档按钮组 */}
                              <div className="flex shrink-0 gap-1.5">
                                {SCORE_OPTIONS.map((opt) => {
                                  const selected = human === opt.v
                                  const isMachine = autoScore === opt.v
                                  const mismatch = selected && autoScore !== null && autoScore !== opt.v
                                  return (
                                    <motion.button
                                      key={opt.v}
                                      type="button"
                                      whileTap={{ scale: 0.96 }}
                                      onClick={() => setScore(key, opt.v)}
                                      title={mismatch ? `与机器建议（${autoScore}）不一致` : opt.label}
                                      className={cn(
                                        'relative h-8 min-w-[64px] rounded-lg border px-2 text-caption font-semibold transition-colors',
                                        selected ? 'border-transparent text-white' : 'bg-white text-[#6b7280] hover:bg-[#f9fafb]',
                                        !selected && isMachine ? 'border-2 border-dashed' : 'border-[#e5e7eb]',
                                      )}
                                      style={
                                        selected
                                          ? { backgroundColor: opt.color }
                                          : !selected && isMachine
                                            ? { borderColor: opt.color, color: opt.color }
                                            : undefined
                                      }
                                    >
                                      {opt.label}
                                      {mismatch && (
                                        <span
                                          className="absolute -right-1 -top-1 h-0 w-0 border-l-[5px] border-t-[7px] border-l-transparent"
                                          style={{ borderTopColor: '#f59e0b' }}
                                        />
                                      )}
                                    </motion.button>
                                  )
                                })}
                              </div>

                              <span className="w-5 shrink-0">
                                {human !== null ? (
                                  <Check className="h-4 w-4 text-success" />
                                ) : (
                                  <CircleDashed className="h-4 w-4 text-[#c4c9d1]" />
                                )}
                              </span>
                            </>
                          )}
                        </div>

                        {/* 展开态 */}
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.24, ease: EASE }}
                              className="overflow-hidden"
                            >
                              <div className="space-y-3 pb-2 pt-3">
                                <div className="rounded-lg bg-[#f9fafb] px-3.5 py-2.5 text-small text-[#6b7280]">
                                  <span className="font-medium text-[#374151]">评分关键点：</span>
                                  {ind.keyPoints}
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="rounded-lg border border-[#b6ecd8] bg-[#f2fdf8] px-3.5 py-2.5 text-small text-[#047857]">
                                    <span className="font-semibold">优秀 20 锚点：</span>
                                    {ind.anchorGood}
                                  </div>
                                  <div className="rounded-lg border border-[#fecaca] bg-[#fef5f5] px-3.5 py-2.5 text-small text-[#b91c1c]">
                                    <span className="font-semibold">缺失 0 锚点：</span>
                                    {ind.anchorBad}
                                  </div>
                                </div>
                                {ind.scoreRow?.autoEvidence && (
                                  <div className="rounded-lg bg-[#f3f4f6] px-3.5 py-2.5 font-mono text-caption text-[#6b7280]">
                                    <span className="font-sans font-medium text-[#374151]">机器证据：</span>
                                    {ind.scoreRow.autoEvidence}
                                  </div>
                                )}
                                {isVis ? (
                                  <p className="text-caption text-[#9ca3af]">
                                    口径：{visEv ?? '暂无实测记录，默认 0 分；完成一次保存后服务端将按近 30 天实测命中平台数写入定档'}
                                  </p>
                                ) : (
                                  <div>
                                    <textarea
                                      rows={2}
                                      value={evidence[key] ?? ''}
                                      onChange={(e) => {
                                        setEvidence((ev) => ({ ...ev, [key]: e.target.value }))
                                        setDirty(true)
                                      }}
                                      placeholder="补充截图链接 / 实测备注 / 客户反馈…"
                                      className="w-full resize-none rounded-lg border border-[#e5e7eb] px-3 py-2 text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                                    />
                                    <p className="mt-1 text-right text-caption text-[#9ca3af] tabular-nums">
                                      {(evidence[key] ?? '').length} 字
                                    </p>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              </motion.section>
            )
          })}
        </div>

        {/* ---------- 右栏：实时评分预览卡 ---------- */}
        <motion.aside
          className="geo-card sticky top-20 space-y-5 p-5 xl:col-span-1"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15, ease: EASE }}
        >
          <div className="flex flex-col items-center border-b border-[#f3f4f6] pb-4">
            <ScoreGauge value={realtime.composite} size={120} stroke={8} />
            <div className="mt-2 flex items-center gap-2">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={realtime.grade}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                >
                  <GradeBadge grade={realtime.grade} />
                </motion.span>
              </AnimatePresence>
              <span className="text-small text-[#6b7280]">{realtime.composite.toFixed(1)} 分</span>
            </div>
            <p className="mt-2 text-center text-caption text-[#9ca3af]">技术×25% + 页面×20% + 内容×30% + 可见度×25%</p>
          </div>

          {/* 四维条 */}
          <div className="space-y-3 border-b border-[#f3f4f6] pb-4">
            {DIMS.map((d, i) => {
              const keys = DIMENSION_INDICATOR_KEYS[d.dim as DimensionKey]
              const done = keys.filter((k) => d.dim === 4 || scores[k] !== null).length
              return (
                <div key={d.dim} title={`${done}/${keys.length} 已定档`}>
                  <div className="flex items-center justify-between text-small">
                    <span className="text-[#374151]">{d.short}</span>
                    <span className="font-semibold text-[#111827] tabular-nums">{dimValues[i]!.toFixed(dimValues[i]! % 1 ? 1 : 0)}/100</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#f3f4f6]">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: d.color }}
                      animate={{ width: `${dimValues[i]}%` }}
                      transition={{ duration: 0.3, ease: EASE }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* 完成度 */}
          <div className="border-b border-[#f3f4f6] pb-4">
            <div className="flex items-center gap-3">
              <svg width={44} height={44} className="-rotate-90">
                <circle cx={22} cy={22} r={18} fill="none" stroke="#eef0f3" strokeWidth={5} />
                <motion.circle
                  cx={22}
                  cy={22}
                  r={18}
                  fill="none"
                  stroke="#1a56db"
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 18}
                  animate={{ strokeDashoffset: 2 * Math.PI * 18 * (1 - doneCount / totalCount) }}
                  transition={{ duration: 0.4, ease: EASE }}
                />
              </svg>
              <div>
                <p className="text-body font-semibold text-[#111827] tabular-nums">
                  {doneCount} / {totalCount} 已定档
                </p>
                <p className="text-caption text-[#9ca3af]">维度四 3 项由实测自动定档</p>
              </div>
            </div>
            {undone.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {undone.map((u) => (
                  <button
                    key={u.key}
                    type="button"
                    onClick={() => scrollToRow(u.key)}
                    className="rounded-full border border-[#e5e7eb] px-2 py-0.5 text-caption text-[#6b7280] transition-colors hover:border-brand hover:text-brand"
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 等级标尺 */}
          <div>
            <div className="relative flex h-2.5 overflow-hidden rounded-full">
              {[...GRADE_SCALE].reverse().map((g) => (
                <div key={g.g} className="h-full" style={{ backgroundColor: g.color, width: g.from === 0 ? '45%' : g.from === 45 ? '20%' : g.from === 65 ? '15%' : '20%' }} />
              ))}
              <motion.span
                className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-[#111827]"
                animate={{ left: `${Math.min(99, realtime.composite)}%` }}
                transition={{ duration: 0.4, ease: EASE }}
              />
            </div>
            <div className="mt-2 flex justify-between text-caption text-[#9ca3af]">
              <span>D &lt;45</span>
              <span>C 45–64.9</span>
              <span>B 65–79.9</span>
              <span>A ≥80</span>
            </div>
          </div>

          {allDone && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 rounded-lg border border-[#b6ecd8] bg-[#e8faf3] px-3 py-2.5 text-small text-[#047857]"
            >
              <Check className="h-4 w-4 shrink-0" /> 18 项已定档，可完成评分
            </motion.div>
          )}
        </motion.aside>
      </div>

      <ToastHost toasts={toasts} />
    </div>
  )
}
