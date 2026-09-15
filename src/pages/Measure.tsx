import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useParams } from 'react-router'
import { Keyboard, Swords } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { trpc } from '@/providers/trpc'
import type { MeasureLevel, Platform } from '@contracts/kpi'
import { calcCitationRate } from '@contracts/kpi'
import {
  CategoryGroupHeader,
  LegendBar,
  MatrixRow,
  ParamBar,
  PoolNotLockedState,
  ProgressPanel,
  ReadOnlyBar,
  SaveBar,
  type CellDraft,
  type SavedCell,
} from '@/features/monitor/MeasureParts'
import type { PoolData, PoolKeyword } from '@/features/monitor/PoolSections'
import {
  CATEGORY_ORDER,
  PLATFORM_ORDER,
  errText,
  todayStr,
  useMonitorToast,
} from '@/features/monitor/shared'

/** 录入对象：'own' = 我方官网（默认），number = 竞对 id */
type MeasureTarget = 'own' | number

/** 录入对象分段控件所需的最小竞对信息（competitors.list 返回结构的前子集） */
interface CompetitorOption {
  id: number
  name: string
}

function shiftDay(date: string, offset: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + offset)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * 录入对象分段控件：我方官网（默认）+ 各竞对名；
 * 无竞对时只显示我方 + 「+ 添加竞对」链接（指向竞对对比页管理入口）。
 */
function TargetControl({
  projectId,
  competitors,
  target,
  onChange,
}: {
  projectId: number
  competitors: CompetitorOption[]
  target: MeasureTarget
  onChange: (t: MeasureTarget) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-caption text-[#9ca3af]">录入对象</span>
      <div className="flex rounded-lg border border-[#e5e7eb] bg-[#f3f4f6] p-0.5">
        <button
          type="button"
          onClick={() => onChange('own')}
          className={cn(
            'flex h-9 items-center rounded-md px-3 text-small transition-colors duration-150',
            target === 'own'
              ? 'bg-white font-medium text-[#111827] shadow-card'
              : 'text-[#6b7280] hover:text-[#374151]',
          )}
        >
          我方官网
        </button>
        {competitors.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onChange(c.id)}
            className={cn(
              'flex h-9 items-center gap-1 rounded-md px-3 text-small transition-colors duration-150',
              target === c.id
                ? 'bg-amber-100 font-medium text-amber-900 shadow-card'
                : 'text-[#6b7280] hover:text-[#374151]',
            )}
          >
            {c.name}
          </button>
        ))}
        {competitors.length === 0 && (
          <Link
            to={`/projects/${projectId}/compete`}
            className="flex h-9 items-center rounded-md px-3 text-small text-brand transition-colors duration-150 hover:bg-white hover:shadow-card"
          >
            + 添加竞对
          </Link>
        )}
      </div>
    </div>
  )
}

/**
 * Page 10 · 实测录入 `/projects/:id/measure`
 * 日期 × 平台 × 词矩阵录 L2/L1/L0 + 被引用 URL（normalizeUrl 预览）+ 快照；吸顶进度 + 底部保存条。
 */
export default function Measure() {
  const { id } = useParams()
  const projectId = Number(id)
  const validId = Number.isInteger(projectId) && projectId > 0
  const toast = useMonitorToast()
  const utils = trpc.useUtils()

  const [date, setDate] = useState(todayStr())
  const [platform, setPlatform] = useState<Platform>('deepseek')
  const [isCheckpoint, setIsCheckpoint] = useState(false)
  const [checkpointTag, setCheckpointTag] = useState<'m6' | 'm12'>('m6')
  const [editHistory, setEditHistory] = useState(false)
  /** 未保存草稿：key = `${platform}|${keywordId}`（仅当前日期，我方录入） */
  const [drafts, setDrafts] = useState<Map<string, CellDraft>>(new Map())
  /** 录入对象：'own' 我方官网（默认）或竞对 id */
  const [target, setTarget] = useState<MeasureTarget>('own')
  /** 竞对录入未保存草稿（key 结构同我方；切换竞对/日期时丢弃，不跨对象保留） */
  const [rivalDrafts, setRivalDrafts] = useState<Map<string, CellDraft>>(new Map())

  const projectQ = trpc.projects.get.useQuery({ id: projectId }, { enabled: validId })
  const poolQ = trpc.pools.get.useQuery({ projectId }, { enabled: validId })
  const pool = (poolQ.data ?? null) as PoolData | null
  const poolLocked = pool?.status === 'locked'

  const dayQ = trpc.measurements.list.useQuery(
    { projectId, from: date, to: date, limit: 2000 },
    { enabled: validId && poolLocked === true },
  )
  const weekQ = trpc.measurements.list.useQuery(
    { projectId, from: shiftDay(date, -7), to: shiftDay(date, -1), platform, limit: 2000 },
    { enabled: validId && poolLocked === true },
  )

  /* ---------- 竞对录入（数据换源，UI 完全复用） ---------- */

  /** 当前是否竞对录入模式 */
  const isRival = target !== 'own'
  const rivalId = isRival ? target : 0

  /** 竞对清单（录入对象分段控件数据源） */
  const competitorsQ = trpc.competitors.list.useQuery({ projectId }, { enabled: validId })
  const competitors: CompetitorOption[] = useMemo(
    () => (competitorsQ.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    [competitorsQ.data],
  )
  const activeCompetitor = isRival ? competitors.find((c) => c.id === target) : undefined

  /** 竞对当日命中回显：三平台各一条查询（进度统计 + 当前平台回显共用） */
  const rivalEnabled = validId && poolLocked === true && isRival
  const rivalQs = {
    deepseek: trpc.competitors.hits.useQuery(
      { projectId, competitorId: rivalId, platform: 'deepseek', date },
      { enabled: rivalEnabled },
    ),
    doubao: trpc.competitors.hits.useQuery(
      { projectId, competitorId: rivalId, platform: 'doubao', date },
      { enabled: rivalEnabled },
    ),
    qwen: trpc.competitors.hits.useQuery(
      { projectId, competitorId: rivalId, platform: 'qwen', date },
      { enabled: rivalEnabled },
    ),
  }

  /** 竞对各平台已保存格（keywordId → SavedCell；竞对无快照字段，snapshot 置 null） */
  const rivalSavedByPlatform = useMemo(() => {
    const res = {} as Record<Platform, Map<number, SavedCell>>
    for (const p of PLATFORM_ORDER) {
      const m = new Map<number, SavedCell>()
      for (const r of rivalQs[p].data ?? []) {
        m.set(r.keywordId, { id: 0, level: r.level, citedUrl: r.url, snapshot: null })
      }
      res[p] = m
    }
    return res
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rivalQs.deepseek.data, rivalQs.doubao.data, rivalQs.qwen.data])

  /** 竞对当日已录格数（三平台合计，用于历史只读判定） */
  const rivalDayCount = useMemo(
    () => PLATFORM_ORDER.reduce((s, p) => s + (rivalQs[p].data?.length ?? 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rivalQs.deepseek.data, rivalQs.doubao.data, rivalQs.qwen.data],
  )

  const activeWords: PoolKeyword[] = useMemo(
    () => (pool?.keywords ?? []).filter((w) => w.status === 'active'),
    [pool],
  )

  /** 当日全部已保存记录（三平台） */
  const dayRows = useMemo(() => dayQ.data ?? [], [dayQ.data])

  /** 当日+当前平台 已保存格（同词取最新一条） */
  const savedMap = useMemo(() => {
    const m = new Map<number, SavedCell>()
    for (const r of dayRows) {
      if (r.platform !== platform) continue
      const prev = m.get(r.keywordId)
      if (!prev || r.id > prev.id) {
        m.set(r.keywordId, { id: r.id, level: r.level, citedUrl: r.citedUrl, snapshot: r.snapshot })
      }
    }
    return m
  }, [dayRows, platform])

  /** 当前录入对象生效的已保存格 / 草稿（我方模式下与原变量完全一致） */
  const activeSavedMap = isRival ? rivalSavedByPlatform[platform] : savedMap
  const activeDrafts = isRival ? rivalDrafts : drafts
  const setActiveDrafts = isRival ? setRivalDrafts : setDrafts

  /** 已有考核标记时回显 */
  useEffect(() => {
    const cp = dayRows.find((r) => r.isCheckpoint)
    if (cp) {
      setIsCheckpoint(true)
      if (cp.checkpointTag) setCheckpointTag(cp.checkpointTag)
    } else {
      setIsCheckpoint(false)
    }
  }, [dayRows])

  /** 切日期清空草稿（我方 + 竞对）与历史编辑态 */
  const changeDate = (d: string) => {
    const dirty = drafts.size + rivalDrafts.size
    if (dirty > 0 && !window.confirm('当前日期有未保存更改，切换日期将丢弃，确认？')) return
    setDrafts(new Map())
    setRivalDrafts(new Map())
    setEditHistory(false)
    setDate(d)
  }

  /** 切录入对象：竞对草稿不跨对象保留；我方草稿保留（切回时仍在） */
  const changeTarget = (t: MeasureTarget) => {
    if (t === target) return
    if (isRival && rivalDrafts.size > 0) {
      if (!window.confirm('当前竞对有未保存更改，切换录入对象将丢弃，确认？')) return
    }
    setRivalDrafts(new Map())
    setEditHistory(false)
    setTarget(t)
  }

  /** 历史只读判定：我方看 measurements，竞对看该竞对当日命中 */
  const isHistory = date < todayStr() && (isRival ? rivalDayCount > 0 : dayRows.length > 0)
  const readOnly = isHistory && !editHistory

  const draftKey = useCallback((p: Platform, kwId: number) => `${p}|${kwId}`, [])

  const setDraft = useCallback(
    (kwId: number, updater: (cur: CellDraft, saved: SavedCell | null) => CellDraft) => {
      setActiveDrafts((prev) => {
        const key = draftKey(platform, kwId)
        const cur: CellDraft = prev.get(key) ?? {
          level: activeSavedMap.get(kwId)?.level ?? null,
          citedUrl: activeSavedMap.get(kwId)?.citedUrl ?? '',
          snapshot: activeSavedMap.get(kwId)?.snapshot ?? '',
        }
        const nextMap = new Map(prev)
        nextMap.set(key, updater(cur, activeSavedMap.get(kwId) ?? null))
        return nextMap
      })
    },
    [draftKey, platform, activeSavedMap, setActiveDrafts],
  )

  const onLevel = useCallback(
    (kw: PoolKeyword, lv: MeasureLevel) => {
      const saved = activeSavedMap.get(kw.id)
      if (saved?.level === 'L2' && saved.citedUrl && lv !== 'L2') {
        if (!window.confirm(`「${kw.text}」原为 L2 且带被引用 URL，改判后 URL 将随判定清空，确认？`)) return
      }
      setDraft(kw.id, (cur) => ({
        ...cur,
        level: lv,
        citedUrl: lv === 'L2' ? cur.citedUrl : '',
      }))
    },
    [activeSavedMap, setDraft],
  )

  const onUrl = useCallback(
    (kwId: number, url: string) => setDraft(kwId, (cur) => ({ ...cur, citedUrl: url })),
    [setDraft],
  )
  const onSnapshot = useCallback(
    (kwId: number, s: string) => setDraft(kwId, (cur) => ({ ...cur, snapshot: s })),
    [setDraft],
  )

  /** 批量置级（当前平台、当前录入对象） */
  const fillAll = (lv: MeasureLevel) => {
    if (!window.confirm(`将把当前平台（${platform}）全部 ${activeWords.length} 词置为 ${lv}，确认？`)) return
    setActiveDrafts((prev) => {
      const nextMap = new Map(prev)
      for (const kw of activeWords) {
        const key = draftKey(platform, kw.id)
        const cur: CellDraft =
          nextMap.get(key) ?? {
            level: activeSavedMap.get(kw.id)?.level ?? null,
            citedUrl: activeSavedMap.get(kw.id)?.citedUrl ?? '',
            snapshot: activeSavedMap.get(kw.id)?.snapshot ?? '',
          }
        nextMap.set(key, { ...cur, level: lv, citedUrl: lv === 'L2' ? cur.citedUrl : '' })
      }
      return nextMap
    })
  }

  /* ---------- 进度与实时口径 ---------- */

  /** 进度统计：我方按 measurements，竞对按该竞对当日命中（含未保存草稿） */
  const platformProgress = useMemo(() => {
    const res = {} as Record<Platform, { done: number; total: number }>
    for (const p of PLATFORM_ORDER) {
      const savedKw = isRival
        ? new Set(rivalSavedByPlatform[p].keys())
        : new Set(dayRows.filter((r) => r.platform === p).map((r) => r.keywordId))
      let done = 0
      for (const kw of activeWords) {
        const d = activeDrafts.get(draftKey(p, kw.id))
        if (d ? d.level !== null : savedKw.has(kw.id)) done += 1
      }
      res[p] = { done, total: activeWords.length }
    }
    return res
  }, [isRival, rivalSavedByPlatform, dayRows, activeWords, activeDrafts, draftKey])

  const totalDone = PLATFORM_ORDER.reduce((s, p) => s + platformProgress[p].done, 0)
  const totalAll = PLATFORM_ORDER.reduce((s, p) => s + platformProgress[p].total, 0)

  /** 当前平台实时引用呈现率（不含可拓词；竞对模式下为该竞对命中率） */
  const realtimeRate = useMemo(() => {
    let total = 0
    let l2 = 0
    for (const kw of activeWords) {
      if (kw.isExtended) continue
      const d = activeDrafts.get(draftKey(platform, kw.id))
      const lv = d ? d.level : activeSavedMap.get(kw.id)?.level ?? null
      if (lv === null) continue
      total += 1
      if (lv === 'L2') l2 += 1
    }
    return calcCitationRate(total, l2)
  }, [activeWords, activeDrafts, draftKey, platform, activeSavedMap])

  /** 近 7 日每词命中率 sparkline（本平台） */
  const sparkByKeyword = useMemo(() => {
    const rows = weekQ.data ?? []
    const m = new Map<number, number[]>()
    for (const kw of activeWords) {
      const rates: number[] = []
      for (let i = 7; i >= 1; i--) {
        const d = shiftDay(date, -i)
        const dayRowsKw = rows.filter((r) => r.keywordId === kw.id && r.measureDate === d)
        if (dayRowsKw.length === 0) continue
        const l2 = dayRowsKw.filter((r) => r.level === 'L2').length
        rates.push(calcCitationRate(dayRowsKw.length, l2))
      }
      m.set(kw.id, rates)
    }
    return m
  }, [weekQ.data, activeWords, date])

  /* ---------- 保存（我方） ---------- */

  const bulkM = trpc.measurements.bulkCreate.useMutation({
    onError: (e) => toast.push('error', `保存失败：${errText(e)}`),
  })

  const save = useCallback(async () => {
    if (!pool || drafts.size === 0) return
    const rows = [...drafts.entries()]
      .map(([key, d]) => {
        const [p, kwId] = key.split('|')
        return { platform: p as Platform, keywordId: Number(kwId), d }
      })
      .filter((r) => r.d.level !== null)
      .map((r) => ({
        projectId,
        poolId: pool.id,
        keywordId: r.keywordId,
        measureDate: date,
        platform: r.platform,
        level: r.d.level as MeasureLevel,
        citedUrl: r.d.level === 'L2' && r.d.citedUrl.trim() ? r.d.citedUrl.trim() : null,
        snapshot: r.d.snapshot.trim() ? r.d.snapshot.trim() : null,
        isCheckpoint,
        checkpointTag: isCheckpoint ? checkpointTag : null,
      }))
    if (rows.length === 0) return
    try {
      await bulkM.mutateAsync({ rows })
      const perPlatform = PLATFORM_ORDER.map(
        (p) => `${p === 'deepseek' ? 'DeepSeek' : p === 'doubao' ? '豆包' : '通义'} ${rows.filter((r) => r.platform === p).length}`,
      ).join(' / ')
      toast.push('success', `已保存 ${rows.length} 条实测记录（${perPlatform}）`)
      setDrafts(new Map())
      setEditHistory(false)
      await utils.measurements.list.invalidate()
    } catch {
      /* onError 已提示 */
    }
  }, [pool, drafts, projectId, date, isCheckpoint, checkpointTag, bulkM, toast, utils])

  /* ---------- 保存（竞对） ---------- */

  const recordHitsM = trpc.competitors.recordHits.useMutation({
    onError: (e) => toast.push('error', `竞对保存失败：${errText(e)}`),
  })

  /**
   * 竞对保存：recordHits 对 (competitorId, platform, date) 整组「先删后插」，
   * 因此每个有草稿的平台都必须提交「已保存 ∪ 草稿」合并后的全量行，避免误删未改动的旧记录。
   * rows 结构与我方一致：L2 必须带 url，L1/L0 url 置 null。
   */
  const saveRival = useCallback(async () => {
    if (!isRival || rivalDrafts.size === 0) return
    const competitorId = target
    // 按平台分组草稿
    const byPlatform = new Map<Platform, Map<number, CellDraft>>()
    for (const [key, d] of rivalDrafts.entries()) {
      const [p, kwId] = key.split('|')
      const plat = p as Platform
      if (!byPlatform.has(plat)) byPlatform.set(plat, new Map())
      byPlatform.get(plat)!.set(Number(kwId), d)
    }
    // 逐平台合并「已保存 + 草稿」生成全量行
    const payloads: { platform: Platform; rows: { keywordId: number; level: MeasureLevel; url: string | null }[] }[] = []
    for (const [plat, dmap] of byPlatform.entries()) {
      const savedForP = rivalSavedByPlatform[plat]
      const rows: { keywordId: number; level: MeasureLevel; url: string | null }[] = []
      for (const kw of activeWords) {
        const d = dmap.get(kw.id)
        const lv = d ? d.level : savedForP.get(kw.id)?.level ?? null
        if (lv === null) continue
        const rawUrl = lv === 'L2' ? (d ? d.citedUrl : savedForP.get(kw.id)?.citedUrl ?? '') : ''
        rows.push({ keywordId: kw.id, level: lv, url: lv === 'L2' && rawUrl.trim() ? rawUrl.trim() : null })
      }
      payloads.push({ platform: plat, rows })
    }
    // 前端预校验：L2 必须带 URL（后端同样强校验）
    const missing = payloads.flatMap((p) => p.rows.filter((r) => r.level === 'L2' && !r.url))
    if (missing.length > 0) {
      toast.push('error', `有 ${missing.length} 格判为 L2 但未填写被引 URL，请补齐后再保存`)
      return
    }
    try {
      let total = 0
      for (const p of payloads) {
        if (p.rows.length === 0) continue
        await recordHitsM.mutateAsync({ projectId, competitorId, platform: p.platform, date, rows: p.rows })
        total += p.rows.length
      }
      toast.push('success', `已保存 ${activeCompetitor?.name ?? '竞对'} ${total} 条命中记录`)
      setRivalDrafts(new Map())
      setEditHistory(false)
      await utils.competitors.hits.invalidate()
      await utils.competitors.list.invalidate()
    } catch {
      /* onError 已提示 */
    }
  }, [isRival, rivalDrafts, target, rivalSavedByPlatform, activeWords, activeCompetitor, recordHitsM, projectId, date, toast, utils])

  /** 保存分派：我方走 measurements.bulkCreate，竞对走 competitors.recordHits */
  const handleSave = isRival ? saveRival : save

  /** Ctrl+S 保存 */
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  /* ---------- 行焦点导航 ---------- */

  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  const visibleWords = useMemo(
    () =>
      CATEGORY_ORDER.flatMap((c) => activeWords.filter((w) => w.category === c)),
    [activeWords],
  )
  rowRefs.current = rowRefs.current.slice(0, visibleWords.length)

  /* ---------- 渲染 ---------- */

  if (!validId) {
    return <p className="py-20 text-center text-small text-[#6b7280]">无效的项目地址</p>
  }

  const loading = projectQ.isLoading || poolQ.isLoading
  const project = projectQ.data

  return (
    <div className="space-y-4 pb-20">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-[#111827]">实测录入</h1>
          <p className="mt-1 flex items-center gap-2 text-small text-[#6b7280]">
            {project ? `${project.name}（${project.domain}）` : '项目加载中…'}
            <span className="hidden items-center gap-1 text-caption text-[#9ca3af] md:flex">
              <Keyboard className="h-3.5 w-3.5" />
              快捷键：行内按 2 / 1 / 0 设级，Enter 下一行，Ctrl+S 保存
            </span>
          </p>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-[420px] w-full rounded-xl" />
        </div>
      ) : !poolLocked || !pool ? (
        <PoolNotLockedState projectId={projectId} hasPool={!!pool} />
      ) : (
        <>
          {/* 竞对录入提示条：竞对数据不计入我方 KPI */}
          {isRival && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-5 py-2.5 text-small text-amber-800">
              <Swords className="h-4 w-4 shrink-0" />
              正在录入：{activeCompetitor?.name ?? '竞对'} · 竞对数据不计入我方 KPI
            </div>
          )}

          <ParamBar
            date={date}
            onDateChange={changeDate}
            platform={platform}
            onPlatformChange={setPlatform}
            platformProgress={platformProgress}
            isCheckpoint={isCheckpoint}
            onCheckpointChange={setIsCheckpoint}
            checkpointTag={checkpointTag}
            onTagChange={setCheckpointTag}
            onFillAll={fillAll}
            readOnly={readOnly}
            targetControl={
              <TargetControl
                projectId={projectId}
                competitors={competitors}
                target={target}
                onChange={changeTarget}
              />
            }
            checkpointDisabled={isRival}
          />

          <LegendBar />

          {isHistory && readOnly && <ReadOnlyBar onEnable={() => setEditHistory(true)} />}

          <div className="grid items-start gap-5 lg:grid-cols-12">
            {/* 录入矩阵 */}
            <motion.section
              key={`${target}:${platform}`}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="geo-card overflow-x-auto lg:col-span-9"
            >
              <div className="min-w-[860px]">
                {/* 表头 */}
                <div className="grid grid-cols-[220px_1fr] gap-x-4 border-b border-[#e5e7eb] bg-[#f3f4f6] px-5 py-2.5 text-small font-semibold text-[#6b7280] md:grid-cols-[220px_200px_minmax(220px,1fr)_minmax(180px,0.8fr)]">
                  <span>词（按词类分组）</span>
                  <span>判定（快捷键 2/1/0）</span>
                  <span className="hidden md:block">被引用页面 URL</span>
                  <span className="hidden md:block">回答快照 / 备注</span>
                </div>

                {CATEGORY_ORDER.map((c) => {
                  const list = visibleWords.filter((w) => w.category === c)
                  if (list.length === 0) return null
                  return (
                    <div key={c}>
                      <CategoryGroupHeader category={c} count={list.length} />
                      {list.map((kw) => {
                        const rowIndex = visibleWords.indexOf(kw)
                        return (
                          <MatrixRow
                            key={kw.id}
                            keyword={kw}
                            draft={activeDrafts.get(draftKey(platform, kw.id)) ?? null}
                            saved={activeSavedMap.get(kw.id) ?? null}
                            sparkRates={isRival ? [] : sparkByKeyword.get(kw.id) ?? []}
                            disabled={readOnly}
                            hideSnapshot={isRival}
                            rowRef={(el) => {
                              rowRefs.current[rowIndex] = el
                            }}
                            onLevel={(lv) => onLevel(kw, lv)}
                            onUrl={(url) => onUrl(kw.id, url)}
                            onSnapshot={(s) => onSnapshot(kw.id, s)}
                            onEnterNext={() => {
                              const next = rowRefs.current[rowIndex + 1]
                              next?.focus()
                            }}
                          />
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </motion.section>

            {/* 当日进度侧栏 */}
            <div className="lg:col-span-3">
              <ProgressPanel
                platformProgress={platformProgress}
                totalDone={totalDone}
                totalAll={totalAll}
                rate={realtimeRate}
                isCheckpoint={isCheckpoint}
                checkpointTag={checkpointTag}
              />
            </div>
          </div>

          <SaveBar
            dirtyCount={activeDrafts.size}
            saving={isRival ? recordHitsM.isPending : bulkM.isPending}
            onDiscard={() => setActiveDrafts(new Map())}
            onSave={() => void handleSave()}
          />
        </>
      )}

      {toast.node}
    </div>
  )
}
