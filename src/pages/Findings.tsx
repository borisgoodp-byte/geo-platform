import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { DirectionCard, VerdictJson } from '@contracts/types'
import { trpc } from '@/providers/trpc'
import { cn } from '@/lib/utils'
import { DIMS, EASE, btnPrimary, btnSecondary, nowTime } from '@/features/diagnosis/meta'
import { useToasts } from '@/features/diagnosis/useToasts'
import {
  DiagStatusChip,
  DimDot,
  PageHeader,
  PageSkeleton,
  SavedChip,
  ToastHost,
} from '@/features/diagnosis/ui'
import { ClientReplyCard } from '@/features/diagnosis/ClientReplyCard'
import { useAuth } from '@/providers/auth'

type Severity = 'danger' | 'warn' | 'ok'

const SEVERITY_META: Record<Severity, { label: string; color: string; pill: string; pillActive: string }> = {
  danger: { label: '严重', color: '#ef4444', pill: 'border-[#e5e7eb] text-[#6b7280]', pillActive: 'border-transparent bg-danger text-white' },
  warn: { label: '待优化', color: '#f59e0b', pill: 'border-[#e5e7eb] text-[#6b7280]', pillActive: 'border-transparent bg-warning text-white' },
  ok: { label: '亮点', color: '#10b981', pill: 'border-[#e5e7eb] text-[#6b7280]', pillActive: 'border-transparent bg-success text-white' },
}

interface FindingDraft {
  lid: string
  dimension: number
  severity: Severity
  title: string
  body: string
  impact: string
}

const VERDICT_SECTIONS: { key: keyof VerdictJson; label: string }[] = [
  { key: 'tech', label: '技术底座结论' },
  { key: 'pages', label: '页面架构结论' },
  { key: 'content', label: '内容生态结论' },
  { key: 'visibility', label: 'GEO可见度结论' },
  { key: 'core', label: '核心结论' },
]

const DIRECTION_DEFAULTS: DirectionCard[] = [
  { step: 1, title: '固本 · 技术底座修复', items: [] },
  { step: 2, title: '立信 · 页面架构与信任要素', items: [] },
  { step: 3, title: '扩声 · 内容生态建设', items: [] },
  { step: 4, title: '占位 · GEO 可见度占位', items: [] },
]

const DIRECTION_COLORS = ['#1a56db', '#5e5ce6', '#0ea5e9', '#10b981']

let lidSeq = 0
const nextLid = () => `f${++lidSeq}`

export default function Findings() {
  const { id, dId } = useParams()
  const projectId = Number(id)
  const diagId = Number(dId)
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const { user } = useAuth()
  const { toasts, push } = useToasts()

  const diagQ = trpc.diagnostics.get.useQuery({ id: diagId }, { enabled: Number.isFinite(diagId) })
  const diag = diagQ.data
  const projectQ = trpc.projects.get.useQuery(
    { id: projectId },
    { enabled: Number.isFinite(projectId) && projectId > 0 },
  )

  const [tab, setTab] = useState<'findings' | 'verdict'>('findings')
  const [rows, setRows] = useState<FindingDraft[]>([])
  const [verdict, setVerdict] = useState<VerdictJson>({ tech: '', pages: '', content: '', visibility: '', core: '' })
  const [directions, setDirections] = useState<DirectionCard[]>(DIRECTION_DEFAULTS)
  const [dirty, setDirty] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const initedRef = useRef(false)

  useEffect(() => {
    if (!diag || initedRef.current) return
    setRows(
      diag.findings.map((f) => ({
        lid: nextLid(),
        dimension: f.dimension,
        severity: f.severity,
        title: f.title,
        body: f.body,
        impact: f.impact,
      })),
    )
    if (diag.verdictJson) setVerdict(diag.verdictJson as VerdictJson)
    if (diag.directionsJson && (diag.directionsJson as DirectionCard[]).length === 4) {
      setDirections(diag.directionsJson as DirectionCard[])
    }
    initedRef.current = true
  }, [diag])

  const saveFindingsMut = trpc.diagnostics.saveFindings.useMutation()
  const saveVerdictMut = trpc.diagnostics.saveVerdict.useMutation()
  const completeMut = trpc.diagnostics.complete.useMutation()
  const saving = saveFindingsMut.isPending || saveVerdictMut.isPending
  const savingRef = useRef(false)

  const doSave = useCallback(
    async (silent: boolean) => {
      if (!diag || savingRef.current) return true
      savingRef.current = true
      try {
        const valid = rows.filter((r) => r.title.trim())
        await saveFindingsMut.mutateAsync({
          diagnosticId: diag.id,
          findings: valid.map((r) => ({
            dimension: r.dimension,
            severity: r.severity,
            title: r.title.trim(),
            body: r.body,
            impact: r.impact,
          })),
        })
        await saveVerdictMut.mutateAsync({ diagnosticId: diag.id, verdictJson: verdict, directionsJson: directions })
        setDirty(false)
        setSavedAt(nowTime())
        if (!silent) push('success', `已保存 ${valid.length} 条发现与结论`)
        await utils.diagnostics.get.invalidate({ id: diag.id })
        return true
      } catch (err) {
        push('error', err instanceof Error ? err.message : '保存失败')
        return false
      } finally {
        savingRef.current = false
      }
    },
    [diag, rows, verdict, directions, saveFindingsMut, saveVerdictMut, push, utils],
  )

  // 失焦自动保存（防抖 800ms）
  useEffect(() => {
    if (!dirty) return
    const t = window.setTimeout(() => void doSave(true), 800)
    return () => window.clearTimeout(t)
  }, [dirty, rows, verdict, directions, doSave])

  const patchRow = (lid: string, patch: Partial<FindingDraft>) => {
    setRows((rs) => rs.map((r) => (r.lid === lid ? { ...r, ...patch } : r)))
    setDirty(true)
  }

  const moveRow = (lid: string, dir: -1 | 1) => {
    setRows((rs) => {
      const i = rs.findIndex((r) => r.lid === lid)
      if (i < 0) return rs
      const dim = rs[i]!.dimension
      // 与同维度相邻项交换
      let j = i + dir
      while (j >= 0 && j < rs.length && rs[j]!.dimension !== dim) j += dir
      if (j < 0 || j >= rs.length) return rs
      const next = [...rs]
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
    setDirty(true)
  }

  const removeRow = (lid: string) => {
    if (confirmDelete !== lid) {
      setConfirmDelete(lid)
      window.setTimeout(() => setConfirmDelete(null), 3000)
      return
    }
    setConfirmDelete(null)
    setRows((rs) => rs.filter((r) => r.lid !== lid))
    setDirty(true)
    push('info', '已删除，报告将同步移除该条')
  }

  const addRow = (dim: number) => {
    setRows((rs) => {
      // 插到该维度分组末尾
      let idx = rs.length
      for (let i = rs.length - 1; i >= 0; i--) {
        if (rs[i]!.dimension === dim) {
          idx = i + 1
          break
        }
      }
      const draft: FindingDraft = { lid: nextLid(), dimension: dim, severity: 'warn', title: '', body: '', impact: '' }
      return [...rs.slice(0, idx), draft, ...rs.slice(idx)]
    })
    setDirty(true)
  }

  const stats = useMemo(() => {
    const c = { danger: 0, warn: 0, ok: 0 }
    for (const r of rows) c[r.severity]++
    return c
  }, [rows])

  const ready = useMemo(
    () =>
      Object.values(verdict).every((v) => v.trim().length > 0) &&
      directions.every((d) => d.items.filter((i) => i.trim()).length >= 2),
    [verdict, directions],
  )

  const goReport = () => {
    if (!diag) return
    navigate(`/projects/${projectId}/diagnosis/${diag.id}/report`)
  }

  const completeAll = async () => {
    if (!diag) return
    // 已结单：直接预览报告（话术卡仍可见）
    if (diag.status === 'completed') {
      goReport()
      return
    }
    const ok = await doSave(true)
    if (!ok) return
    try {
      await completeMut.mutateAsync({ diagnosticId: diag.id })
      await utils.diagnostics.get.invalidate({ id: diag.id })
      push('success', '诊断已完成，正在打开报告预览')
      goReport()
    } catch (err) {
      push('error', err instanceof Error ? err.message : '完成诊断失败')
    }
  }

  if (!Number.isFinite(diagId)) return <p className="text-body text-danger">无效的诊断 ID</p>
  if (diagQ.isLoading) return <PageSkeleton />
  if (!diag) return <p className="text-body text-danger">诊断单不存在</p>

  return (
    <div className="space-y-5">
      <PageHeader
        title="发现与结论"
        badge={<DiagStatusChip status={diag.status} />}
        caption={`共 ${rows.length} 条发现 · 严重 ${stats.danger} / 待优化 ${stats.warn} / 亮点 ${stats.ok} · 失焦自动保存`}
        right={
          <>
            <SavedChip savedAt={savedAt} saving={saving} />
            <button type="button" className={btnSecondary} onClick={() => void doSave(false)} disabled={saving}>
              保存
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => void completeAll()}
              disabled={completeMut.isPending}
              title={
                diag.status === 'completed'
                  ? '打开报告预览'
                  : ready
                    ? '完成诊断并预览报告'
                    : '缺项：五个结论段均需填写，四个优化方向各 ≥2 条（仍可强制完成）'
              }
            >
              {completeMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {diag.status === 'completed' ? '预览报告 →' : '完成并预览报告 →'}
              {(ready || diag.status === 'completed') && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#30d158]" title="已就绪" />
              )}
            </button>
          </>
        }
      />

      {(user?.role === 'operator' || user?.role === 'lead') &&
        (diag.status === 'completed' || ready) && (
        <ClientReplyCard
          projectName={projectQ.data?.name}
          findings={rows.map((r) => ({ severity: r.severity, title: r.title, body: r.body }))}
          verdict={verdict}
          composite={diag.compositeScore}
          grade={diag.grade}
          packageMonths={6}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[#e5e7eb]">
        {(
          [
            { k: 'findings', label: '发现列表' },
            { k: 'verdict', label: '综合结论与优化方向' },
          ] as const
        ).map((t) => (
          <button
            key={t.k}
            type="button"
            onClick={() => setTab(t.k)}
            className={cn(
              'relative px-4 py-2.5 text-body transition-colors',
              tab === t.k ? 'font-semibold text-brand' : 'text-[#6b7280] hover:text-[#374151]',
            )}
          >
            {t.label}
            {tab === t.k && (
              <motion.span layoutId="findings-tab" className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand" />
            )}
          </button>
        ))}
      </div>

      {tab === 'findings' ? (
        <div className="space-y-6">
          {DIMS.map((d, gi) => {
            const group = rows.filter((r) => r.dimension === d.dim)
            const sev = { danger: 0, warn: 0, ok: 0 }
            for (const r of group) sev[r.severity]++
            const sevTotal = Math.max(1, group.length)
            return (
              <motion.section
                key={d.dim}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: gi * 0.05, ease: EASE }}
              >
                {/* 区块头 */}
                <div className="flex flex-wrap items-center gap-3">
                  <DimDot dim={d.dim} size="sm" />
                  <h2 className="text-h2 text-[#111827]">{d.label}</h2>
                  <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-caption text-[#6b7280] tabular-nums">
                    {group.length} 条
                  </span>
                  {/* 严重度分布迷你条 */}
                  <span className="flex h-2 w-20 overflow-hidden rounded-full bg-[#f3f4f6]">
                    {(['danger', 'warn', 'ok'] as Severity[]).map((s) =>
                      sev[s] > 0 ? (
                        <span
                          key={s}
                          style={{ backgroundColor: SEVERITY_META[s].color, width: `${(sev[s] / sevTotal) * 100}%` }}
                        />
                      ) : null,
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => addRow(d.dim)}
                    className="ml-auto inline-flex items-center gap-1 text-small text-brand transition-colors hover:text-brand-deep"
                  >
                    <Plus className="h-3.5 w-3.5" /> 添加发现
                  </button>
                </div>

                {/* 发现卡列表 */}
                <div className="mt-3 space-y-3">
                  <AnimatePresence initial={false}>
                    {group.map((r) => (
                      <motion.div
                        key={r.lid}
                        layout="position"
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
                        transition={{ duration: 0.24, ease: EASE }}
                        className="geo-card relative overflow-hidden p-5 pl-6"
                      >
                        <motion.span
                          className="absolute inset-y-0 left-0 w-1"
                          animate={{ backgroundColor: SEVERITY_META[r.severity].color }}
                          transition={{ duration: 0.2 }}
                        />
                        {/* 首行：严重度 + 标题 + 操作 */}
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex gap-1.5">
                            {(['danger', 'warn', 'ok'] as Severity[]).map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => patchRow(r.lid, { severity: s })}
                                className={cn(
                                  'rounded-full border px-2.5 py-1 text-caption font-medium transition-colors',
                                  r.severity === s ? SEVERITY_META[s].pillActive : SEVERITY_META[s].pill,
                                )}
                              >
                                {SEVERITY_META[s].label}
                              </button>
                            ))}
                          </div>
                          <input
                            value={r.title}
                            onChange={(e) => patchRow(r.lid, { title: e.target.value })}
                            placeholder="一句话说清问题或亮点"
                            className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 text-[18px] font-semibold leading-7 text-[#111827] outline-none transition-colors hover:border-[#e5e7eb] focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                          />
                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              aria-label="上移"
                              onClick={() => moveRow(r.lid, -1)}
                              className="rounded-md p-1.5 text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="下移"
                              onClick={() => moveRow(r.lid, 1)}
                              className="rounded-md p-1.5 text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="删除"
                              title={confirmDelete === r.lid ? '再次点击确认删除' : '删除该条'}
                              onClick={() => removeRow(r.lid)}
                              className={cn(
                                'rounded-md p-1.5 transition-colors',
                                confirmDelete === r.lid ? 'bg-[#fef2f2] text-danger' : 'text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-danger',
                              )}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <textarea
                          rows={3}
                          value={r.body}
                          onChange={(e) => patchRow(r.lid, { body: e.target.value })}
                          placeholder="具体表现与证据，将原样进入报告正文…"
                          className="mt-3 w-full resize-y rounded-lg border border-[#e5e7eb] px-3 py-2 text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                        />
                        <div className="mt-3">
                          <p className="mb-1 text-caption text-[#9ca3af]">业务影响</p>
                          <textarea
                            rows={2}
                            value={r.impact}
                            onChange={(e) => patchRow(r.lid, { impact: e.target.value })}
                            placeholder="对 AI 搜索获客 / 品牌声量的影响…"
                            className="w-full resize-none rounded-lg border border-[#e5e7eb] border-l-2 border-l-brand px-3 py-2 text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                          />
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {group.length === 0 && (
                    <button
                      type="button"
                      onClick={() => addRow(d.dim)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#e5e7eb] py-6 text-small text-[#9ca3af] transition-colors hover:border-brand hover:text-brand"
                    >
                      <Plus className="h-4 w-4" /> 添加该维度第一条发现
                    </button>
                  )}
                </div>
              </motion.section>
            )
          })}
        </div>
      ) : (
        <div className="space-y-8">
          {/* 五段综合结论 */}
          <section>
            <h2 className="text-h1 text-[#111827]">综合结论</h2>
            <p className="mt-1 text-caption text-[#9ca3af]">对应报告第 07 节，五段结构</p>
            <div className="mt-4 space-y-3">
              {VERDICT_SECTIONS.map((s, i) => {
                const isCore = s.key === 'core'
                return (
                  <motion.div
                    key={s.key}
                    className={cn('geo-card p-5', isCore && 'border-[1.5px] border-brand')}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.05, ease: EASE }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f3f4f6] text-caption font-semibold text-[#6b7280]">
                        {i + 1}
                      </span>
                      <h3 className="text-body font-semibold text-[#111827]">{s.label}</h3>
                      {isCore && (
                        <span className="rounded-full bg-brand-light px-2 py-0.5 text-caption font-medium text-brand">核心</span>
                      )}
                      <button
                        type="button"
                        title="基于评分与发现自动拼草稿（人工校对后生效）"
                        onClick={() => {
                          // AI 辅助起草：模板拼装（v1）
                          const dimScores: [keyof VerdictJson, string | null][] = [
                            ['tech', diag.techScore !== null ? String(diag.techScore) : null],
                            ['pages', diag.archScore !== null ? String(diag.archScore) : null],
                            ['content', diag.contentScore !== null ? String(diag.contentScore) : null],
                            ['visibility', diag.visScore !== null ? String(diag.visScore) : null],
                          ]
                          const related = rows.filter((r) =>
                            s.key === 'core' ? r.severity === 'danger' : r.dimension === VERDICT_SECTIONS.findIndex((v) => v.key === s.key) + 1,
                          )
                          const top = related.slice(0, 3).map((r) => r.title).filter(Boolean)
                          const scoreText = dimScores.find(([k]) => k === s.key)?.[1]
                          const draft =
                            top.length > 0
                              ? `本维度得分 ${scoreText ?? '—'}/100。主要发现：${top.join('；')}。${
                                  s.key === 'core' ? '综合四维度表现，需按固本→立信→扩声→占位路径系统重建。' : ''
                                }`
                              : ''
                          if (draft) {
                            setVerdict((v) => ({ ...v, [s.key]: draft }))
                            setDirty(true)
                            push('info', `已起草「${s.label}」，请人工校对`)
                          } else {
                            push('info', '暂无可用发现素材，请先在发现列表补充')
                          }
                        }}
                        className="ml-auto inline-flex items-center gap-1 text-small text-brand transition-colors hover:text-brand-deep"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> AI 辅助起草
                      </button>
                    </div>
                    <textarea
                      rows={isCore ? 5 : 4}
                      value={verdict[s.key]}
                      onChange={(e) => {
                        setVerdict((v) => ({ ...v, [s.key]: e.target.value }))
                        setDirty(true)
                      }}
                      className="mt-3 w-full resize-y rounded-lg border border-[#e5e7eb] px-3 py-2 text-body leading-6 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                    />
                  </motion.div>
                )
              })}
            </div>
          </section>

          {/* 优化方向四卡 */}
          <section>
            <h2 className="text-h1 text-[#111827]">优化方向</h2>
            <p className="mt-1 text-caption text-[#9ca3af]">对应报告第 08 节，四步路径：固本 → 立信 → 扩声 → 占位</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {directions.map((dir, di) => (
                <motion.div
                  key={dir.step}
                  className="geo-card p-5"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: di * 0.08, ease: EASE }}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full text-small font-bold text-white"
                      style={{ backgroundColor: DIRECTION_COLORS[di] }}
                    >
                      {dir.step}
                    </span>
                    <input
                      value={dir.title}
                      onChange={(e) => {
                        setDirections((ds) => ds.map((x, xi) => (xi === di ? { ...x, title: e.target.value } : x)))
                        setDirty(true)
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 text-body font-semibold text-[#111827] outline-none transition-colors hover:border-[#e5e7eb] focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                    />
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <AnimatePresence initial={false}>
                      {dir.items.map((item, ii) => (
                        <motion.div
                          key={`${di}-${ii}-${item.slice(0, 8)}`}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                          transition={{ duration: 0.2, ease: EASE }}
                          className="group flex items-center gap-2"
                        >
                          <span className="text-[#9ca3af]">-</span>
                          <input
                            value={item}
                            onChange={(e) => {
                              setDirections((ds) =>
                                ds.map((x, xi) =>
                                  xi === di ? { ...x, items: x.items.map((it, iti) => (iti === ii ? e.target.value : it)) } : x,
                                ),
                              )
                              setDirty(true)
                            }}
                            placeholder="一条可执行动作…"
                            className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1.5 text-body outline-none transition-colors hover:border-[#e5e7eb] focus:border-brand"
                          />
                          <button
                            type="button"
                            aria-label="删除该条"
                            onClick={() => {
                              setDirections((ds) =>
                                ds.map((x, xi) => (xi === di ? { ...x, items: x.items.filter((_, iti) => iti !== ii) } : x)),
                              )
                              setDirty(true)
                            }}
                            className="shrink-0 rounded p-1 text-[#c4c9d1] opacity-0 transition-all hover:text-danger group-hover:opacity-100"
                          >
                            ×
                          </button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    <button
                      type="button"
                      onClick={() => {
                        setDirections((ds) => ds.map((x, xi) => (xi === di ? { ...x, items: [...x.items, ''] } : x)))
                        setDirty(true)
                      }}
                      className="mt-1 inline-flex items-center gap-1 px-2 py-1 text-small text-[#9ca3af] transition-colors hover:text-brand"
                    >
                      <Plus className="h-3.5 w-3.5" /> 添加一条
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          {/* 就绪校验 */}
          <div
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-3 text-small',
              ready ? 'border-[#b6ecd8] bg-[#e8faf3] text-[#047857]' : 'border-[#fde3b3] bg-[#fff7e8] text-[#b45309]',
            )}
          >
            <Check className="h-4 w-4 shrink-0" />
            {ready
              ? '五段结论与四个优化方向均已就绪，可完成诊断并生成报告'
              : '完成条件：五个结论段均有内容，且四个优化方向卡各 ≥2 条要点'}
          </div>
        </div>
      )}

      <ToastHost toasts={toasts} />
    </div>
  )
}
