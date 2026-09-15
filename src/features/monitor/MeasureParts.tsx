import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router'
import {
  Award,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDashed,
  ClipboardPaste,
  Lock,
  Save,
  StickyNote,
  Undo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { KeywordCategory, MeasureLevel, Platform } from '@contracts/kpi'
import {
  CHECKPOINTS,
  LEVEL_LABELS,
  judgeCheckpoint,
  normalizeUrl,
} from '@contracts/kpi'
import {
  CATEGORY_META,
  LEVEL_META,
  LevelBadge,
  PLATFORM_META,
  PLATFORM_ORDER,
} from './shared'
import type { PoolKeyword } from './PoolSections'

/* ================= 单元格状态 ================= */

export interface CellDraft {
  level: MeasureLevel | null
  citedUrl: string
  snapshot: string
}

export interface SavedCell {
  id: number
  level: MeasureLevel
  citedUrl: string | null
  snapshot: string | null
}

/* ================= Section 1 · 录入参数条 ================= */

export function ParamBar({
  date,
  onDateChange,
  platform,
  onPlatformChange,
  platformProgress,
  isCheckpoint,
  onCheckpointChange,
  checkpointTag,
  onTagChange,
  onFillAll,
  readOnly,
  targetControl,
  checkpointDisabled,
}: {
  date: string
  onDateChange: (d: string) => void
  platform: Platform
  onPlatformChange: (p: Platform) => void
  platformProgress: Record<Platform, { done: number; total: number }>
  isCheckpoint: boolean
  onCheckpointChange: (v: boolean) => void
  checkpointTag: 'm6' | 'm12'
  onTagChange: (t: 'm6' | 'm12') => void
  onFillAll: (level: MeasureLevel) => void
  readOnly: boolean
  /** 录入对象分段控件插槽（我方官网 / 各竞对），渲染在平台切换旁；不传则不渲染（我方录入行为不变） */
  targetControl?: ReactNode
  /** 竞对录入时禁用考核勾选（金标仅回显我方考核日，竞对数据不参与考核） */
  checkpointDisabled?: boolean
}) {
  return (
    <section
      className={cn(
        'geo-card flex flex-wrap items-center gap-x-5 gap-y-3 border-l-4 px-5 py-4',
        isCheckpoint ? 'border-l-[#d4af37]' : 'border-l-transparent',
      )}
    >
      {/* 日期 */}
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-[#6b7280]" />
        <div>
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
            className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-small tabular-nums outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
          />
          <p className="mt-0.5 text-caption text-[#9ca3af]">同一日期重复录入将覆盖更新</p>
        </div>
      </div>

      {/* 平台分段控件 */}
      <div className="flex rounded-lg border border-[#e5e7eb] bg-[#f3f4f6] p-0.5">
        {PLATFORM_ORDER.map((p) => {
          const meta = PLATFORM_META[p]
          const prog = platformProgress[p]
          const active = platform === p
          const full = prog.total > 0 && prog.done >= prog.total
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPlatformChange(p)}
              className={cn(
                'relative flex h-9 items-center gap-1.5 rounded-md px-3 text-small transition-colors duration-150',
                active ? 'bg-white font-medium text-[#111827] shadow-card' : 'text-[#6b7280] hover:text-[#374151]',
              )}
            >
              <img src={meta.icon} alt="" className="h-4 w-4" />
              {meta.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-px font-mono text-[10px] tabular-nums',
                  full ? 'bg-success/10 text-success' : 'bg-warning/10 text-[#b45309]',
                )}
              >
                {prog.done}/{prog.total}
              </span>
            </button>
          )
        })}
      </div>

      {/* 录入对象（我方官网 / 竞对）分段控件，插在平台切换旁 */}
      {targetControl}

      {/* 考核节点 */}
      <div className="flex items-center gap-2.5">
        <label className="flex items-center gap-2 text-small text-[#374151]">
          <Checkbox
            checked={isCheckpoint}
            onCheckedChange={(v) => onCheckpointChange(v === true)}
            disabled={readOnly || checkpointDisabled}
          />
          标记为考核节点
        </label>
        <Select value={checkpointTag} onValueChange={(v) => onTagChange(v as 'm6' | 'm12')} disabled={!isCheckpoint || readOnly || checkpointDisabled}>
          <SelectTrigger className="h-9 w-44 text-small">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="m6">m6 六个月考核</SelectItem>
            <SelectItem value="m12">m12 十二个月考核</SelectItem>
          </SelectContent>
        </Select>
        {isCheckpoint && (
          <span className="flex items-center gap-1 rounded-full border border-[#d4af37]/50 bg-[#d4af37]/10 px-2.5 py-1 text-caption font-medium text-[#92700c]">
            <Award className="h-3 w-3" />
            考核日 · 判定将用于验收
          </span>
        )}
      </div>

      {/* 批量操作 */}
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => onFillAll('L0')}>
          全部置为 L0
        </Button>
        <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => onFillAll('L2')}>
          全部置为 L2
        </Button>
      </div>
    </section>
  )
}

/* ================= Section 2 · 判定图例条 ================= */

export function LegendBar() {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-xl bg-[#f3f4f6] px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        {(['L2', 'L1', 'L0'] as MeasureLevel[]).map((lv) => (
          <div key={lv} className="flex items-center gap-2" title={LEVEL_META[lv].desc}>
            <LevelBadge level={lv} />
            <span className="text-caption text-[#6b7280]">{LEVEL_META[lv].desc}</span>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex items-center gap-1 text-caption text-[#6b7280] transition-colors hover:text-brand"
        >
          判定细则
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')} />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 grid gap-3 border-t border-[#e5e7eb] pt-3 text-caption text-[#6b7280] md:grid-cols-3">
              {PLATFORM_ORDER.map((p) => (
                <div key={p} className="rounded-lg bg-white px-3 py-2.5">
                  <p className="mb-1 flex items-center gap-1.5 font-medium text-[#374151]">
                    <span className="h-2 w-2 rounded-full" style={{ background: PLATFORM_META[p].color }} />
                    {PLATFORM_META[p].label}
                  </p>
                  展开回答底部「来源 / 参考」列表：命中官网任意页面（normalizeUrl 后去重）判 L2；
                  仅出现品牌名无链接判 L1；两者皆无判 L0。
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/* ================= 判定三态选择器 ================= */

function LevelTriSelector({
  value,
  saved,
  disabled,
  onSelect,
}: {
  value: MeasureLevel | null
  saved: boolean
  disabled: boolean
  onSelect: (lv: MeasureLevel) => void
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="判定等级">
      {(['L2', 'L1', 'L0'] as MeasureLevel[]).map((lv) => {
        const meta = LEVEL_META[lv]
        const selected = value === lv
        return (
          <motion.button
            key={lv}
            type="button"
            disabled={disabled}
            title={`${lv} ${LEVEL_LABELS[lv]}（快捷键 ${lv.slice(1)}）`}
            whileTap={disabled ? undefined : { scale: 0.9 }}
            onClick={() => onSelect(lv)}
            className={cn(
              'h-9 w-11 rounded-lg border text-small font-semibold transition-colors duration-150',
              selected ? meta.activeCls : 'bg-white text-[#9ca3af] ' + meta.idleCls,
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            {lv}
          </motion.button>
        )
      })}
      {saved && value && (
        <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-success/15 text-success" title="已保存">
          <Check className="h-3 w-3" />
        </span>
      )}
    </div>
  )
}

/* ================= Section 3 · 录入矩阵行 ================= */

export function MatrixRow({
  keyword,
  draft,
  saved,
  sparkRates,
  disabled,
  rowRef,
  onLevel,
  onUrl,
  onSnapshot,
  onEnterNext,
  hideSnapshot,
}: {
  keyword: PoolKeyword
  draft: CellDraft | null
  saved: SavedCell | null
  /** 近 7 日命中率（0–100，不含当日），用于 sparkline */
  sparkRates: number[]
  disabled: boolean
  rowRef: (el: HTMLDivElement | null) => void
  onLevel: (lv: MeasureLevel) => void
  onUrl: (url: string) => void
  onSnapshot: (s: string) => void
  onEnterNext: () => void
  /** 竞对录入时隐藏快照列（competitorHits 无快照字段），默认 false 不影响我方录入 */
  hideSnapshot?: boolean
}) {
  const level = draft ? draft.level : saved?.level ?? null
  const url = draft ? draft.citedUrl : saved?.citedUrl ?? ''
  const snapshot = draft ? draft.snapshot : saved?.snapshot ?? ''
  const isSaved = !!saved && !draft
  const [snapOpen, setSnapOpen] = useState(!!snapshot)
  const dirty = !!draft

  const urlNorm = level === 'L2' && url.trim() ? normalizeUrl(url) : ''
  const rowComplete = level !== null && (level !== 'L2' || url.trim().length > 0)

  const maxSpark = Math.max(...sparkRates, 1)

  return (
    <div
      ref={rowRef}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return
        const target = e.target as HTMLElement
        const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'
        if (!inInput && (e.key === '2' || e.key === '1' || e.key === '0')) {
          e.preventDefault()
          onLevel(`L${e.key}` as MeasureLevel)
        } else if (e.key === 'Enter' && !inInput) {
          e.preventDefault()
          onEnterNext()
        }
      }}
      className={cn(
        'relative grid grid-cols-[220px_1fr] items-center gap-x-4 border-b border-[#f3f4f6] px-5 py-2.5 outline-none transition-colors duration-150 focus:bg-brand-light/40 md:grid-cols-[220px_200px_minmax(220px,1fr)_minmax(180px,0.8fr)]',
        isSaved && 'bg-[#fcfcfd]',
      )}
    >
      {/* 行完成绿条 */}
      <span
        className={cn(
          'absolute inset-y-2 left-0 w-[3px] rounded-full bg-success transition-transform duration-200',
          rowComplete ? 'scale-y-100' : 'scale-y-0',
        )}
      />

      {/* 词单元格 */}
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-body font-semibold text-[#111827]">
          {keyword.isExtended && (
            <span title="可拓词 · 不计 KPI 分母" className="text-[#5e5ce6]">
              <CircleDashed className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="truncate">{keyword.text}</span>
          {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" title="未保存" />}
        </p>
        {/* 近 7 日命中率 sparkline */}
        <div className="mt-1 flex h-3 items-end gap-[2px]" title="近 7 日命中率（本平台）">
          {sparkRates.map((r, i) => (
            <span
              key={i}
              className="w-[7px] rounded-[1px] bg-brand/70"
              style={{ height: `${Math.max(2, (r / maxSpark) * 12)}px`, opacity: 0.35 + 0.65 * (i / Math.max(sparkRates.length - 1, 1)) }}
            />
          ))}
          {sparkRates.length === 0 && <span className="text-caption text-[#d1d5db]">近 7 日无数据</span>}
        </div>
      </div>

      {/* 判定 */}
      <LevelTriSelector value={level} saved={isSaved} disabled={disabled} onSelect={onLevel} />

      {/* URL */}
      <div className="min-w-0">
        {level === 'L2' ? (
          <>
            <input
              type="text"
              value={url}
              disabled={disabled}
              onChange={(e) => onUrl(e.target.value)}
              placeholder="https://…被引用的官网页面"
              className="h-9 w-full rounded-lg border border-[#e5e7eb] bg-white px-2.5 font-mono text-caption outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30 disabled:bg-[#f3f4f6]"
            />
            {urlNorm && (
              <p className="mt-0.5 truncate font-mono text-[11px] text-[#9ca3af]" title={urlNorm}>
                规范化：{urlNorm}
              </p>
            )}
          </>
        ) : (
          <span className="text-caption text-[#d1d5db]">—</span>
        )}
      </div>

      {/* 快照 / 备注（竞对录入无快照字段，整列置灰） */}
      <div className="min-w-0">
        {hideSnapshot ? (
          <span className="text-caption text-[#d1d5db]">—</span>
        ) : snapOpen || snapshot ? (
          <textarea
            value={snapshot}
            disabled={disabled}
            onChange={(e) => onSnapshot(e.target.value)}
            onBlur={() => !snapshot && setSnapOpen(false)}
            rows={2}
            placeholder="回答快照 / 备注…"
            className="w-full rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-1.5 text-caption outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30 disabled:bg-[#f3f4f6]"
          />
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setSnapOpen(true)}
            className="flex items-center gap-1 text-caption text-[#9ca3af] transition-colors hover:text-brand disabled:opacity-50"
          >
            <StickyNote className="h-3.5 w-3.5" />+ 快照
          </button>
        )}
      </div>
    </div>
  )
}

/* ================= 词类分组头 ================= */

export function CategoryGroupHeader({ category, count }: { category: KeywordCategory; count: number }) {
  const meta = CATEGORY_META[category]
  return (
    <div className="flex items-center gap-2 border-b border-[#f3f4f6] bg-[#f9fafb] px-5 py-2">
      <span className={cn('h-4 w-[3px] rounded-full', meta.leftBar)} />
      <span className="text-small font-medium text-[#6b7280]">
        {meta.label}（{count}）
      </span>
    </div>
  )
}

/* ================= Section 4 · 当日进度侧栏 ================= */

export function ProgressPanel({
  platformProgress,
  totalDone,
  totalAll,
  rate,
  isCheckpoint,
  checkpointTag,
}: {
  platformProgress: Record<Platform, { done: number; total: number }>
  totalDone: number
  totalAll: number
  /** 当前平台实时引用呈现率（非可拓词 L2 口径） */
  rate: number
  isCheckpoint: boolean
  checkpointTag: 'm6' | 'm12'
}) {
  const pct = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0
  const R = 26
  const CIRC = 2 * Math.PI * R
  const cp = CHECKPOINTS[checkpointTag]
  const judge = judgeCheckpoint(rate, cp.target)
  const judgeBadge =
    judge === 'achieved'
      ? { text: '达标', cls: 'bg-success/10 text-success border-success/40' }
      : judge === 'accepted'
        ? { text: '验收合格', cls: 'bg-warning/10 text-[#b45309] border-warning/40' }
        : { text: '未达标', cls: 'bg-danger/10 text-danger border-danger/40' }

  return (
    <div className="geo-card sticky top-[72px] space-y-4 px-5 py-4">
      <div className="flex items-center gap-4">
        {/* 环形进度 */}
        <svg width="68" height="68" viewBox="0 0 68 68" className="shrink-0 -rotate-90">
          <circle cx="34" cy="34" r={R} fill="none" stroke="#f3f4f6" strokeWidth="7" />
          <motion.circle
            cx="34"
            cy="34"
            r={R}
            fill="none"
            stroke="#1a56db"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            animate={{ strokeDashoffset: CIRC * (1 - pct / 100) }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          />
        </svg>
        <div>
          <p className="text-h2 text-[#111827] tabular-nums">
            本日完成 {totalDone}/{totalAll} 格
          </p>
          <p className="text-caption text-[#6b7280]">三平台合计</p>
        </div>
      </div>

      <div className="space-y-1.5">
        {PLATFORM_ORDER.map((p) => {
          const prog = platformProgress[p]
          const full = prog.total > 0 && prog.done >= prog.total
          return (
            <div key={p} className="flex items-center gap-2 text-small">
              <span className="h-2 w-2 rounded-full" style={{ background: PLATFORM_META[p].color }} />
              <span className="text-[#374151]">{PLATFORM_META[p].label}</span>
              <span className={cn('ml-auto tabular-nums', full ? 'font-medium text-success' : 'text-[#6b7280]')}>
                {prog.done}/{prog.total}
                {full && ' ✓'}
              </span>
            </div>
          )
        })}
      </div>

      <div className="border-t border-[#f3f4f6] pt-3">
        <p className="text-caption text-[#6b7280]">引用呈现率（实时 · 当前平台）</p>
        <motion.p
          key={rate}
          initial={{ backgroundColor: 'rgba(26,86,219,0.12)' }}
          animate={{ backgroundColor: 'rgba(26,86,219,0)' }}
          transition={{ duration: 0.6 }}
          className="rounded-md text-kpi text-brand tabular-nums"
        >
          {rate.toFixed(1)}%
        </motion.p>
        <p className="text-caption text-[#9ca3af]">L2 口径（不含可拓词）· 日粒度仅监控，不作达标判定</p>
      </div>

      {isCheckpoint && (
        <div className="rounded-lg border border-[#d4af37]/50 bg-[#d4af37]/[0.08] px-3.5 py-2.5">
          <p className="text-small font-medium text-[#92700c]">
            本日为 {checkpointTag === 'm6' ? '6' : '12'} 个月考核节点
          </p>
          <p className="mt-0.5 text-caption text-[#6b7280]">
            目标 ≥{cp.target}%，当前实时 {rate.toFixed(1)}%
          </p>
          <span className={cn('mt-1.5 inline-flex rounded-full border px-2.5 py-0.5 text-caption font-medium', judgeBadge.cls)}>
            预判定「{judgeBadge.text}」
          </span>
        </div>
      )}
    </div>
  )
}

/* ================= Section 5 · 底部保存条 ================= */

export function SaveBar({
  dirtyCount,
  saving,
  onDiscard,
  onSave,
}: {
  dirtyCount: number
  saving: boolean
  onDiscard: () => void
  onSave: () => void
}) {
  return (
    <AnimatePresence>
      {dirtyCount > 0 && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e5e7eb] bg-white/85 backdrop-blur"
        >
          <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-6 py-3">
            <span className="flex items-center gap-2 text-small text-[#b45309]">
              <span className="h-2 w-2 rounded-full bg-warning" />
              未保存更改 <b className="tabular-nums">{dirtyCount}</b> 格
            </span>
            <div className="ml-auto flex gap-2">
              <Button variant="secondary" size="sm" onClick={onDiscard} disabled={saving}>
                <Undo2 className="h-3.5 w-3.5" />
                放弃
              </Button>
              <Button size="sm" onClick={onSave} disabled={saving}>
                <Save className="h-3.5 w-3.5" />
                {saving ? '保存中…' : '保存本日录入（Ctrl+S）'}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ================= 词池未锁定引导 ================= */

export function PoolNotLockedState({ projectId, hasPool }: { projectId: number; hasPool: boolean }) {
  return (
    <div className="geo-card flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <img src="/illus-empty-project.svg" alt="" className="h-32 w-auto opacity-90" />
      <div>
        <h2 className="flex items-center justify-center gap-2 text-h1 text-[#111827]">
          <Lock className="h-5 w-5 text-warning" />
          {hasPool ? '词池未锁定' : '尚未创建词池'}
        </h2>
        <p className="mt-1 max-w-md text-small text-[#6b7280]">
          {hasPool
            ? '词池锁定后才作为考核基准开放实测录入，请先完成词池锁定。'
            : '实测录入依赖锁定的词池，请先在词池管理中创建并锁定词池。'}
        </p>
      </div>
      <Link to={`/projects/${projectId}/pool`}>
        <Button>
          <ClipboardPaste className="h-4 w-4" />
          前往词池管理
        </Button>
      </Link>
    </div>
  )
}

/* ================= 只读遮罩条 ================= */

export function ReadOnlyBar({ onEnable }: { onEnable: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-warning/40 bg-warning/[0.08] px-5 py-2.5">
      <Lock className="h-4 w-4 text-[#b45309]" />
      <p className="text-small text-[#b45309]">历史日期的已保存录入默认只读，防止误改。</p>
      <Button variant="secondary" size="sm" className="ml-auto" onClick={onEnable}>
        启用编辑
      </Button>
    </div>
  )
}
