import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, animate, motion } from 'framer-motion'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  TrendingUp,
} from 'lucide-react'
import {
  GRADE_META,
  INDUSTRIES,
  STAGE_META,
  TIER_META,
  type GradeKey,
  type ServiceTier,
  type StageKey,
} from '@/data/projects'
import { trpc } from '@/providers/trpc'
import { useAuth } from '@/providers/auth'
import { canCreateProject, filterProjectsByRole } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { EASE } from '@/features/diagnosis/meta'
import { PageSkeleton } from '@/features/diagnosis/ui'

/** 后端服务档枚举 ↔ 前端 UI 键 */
const TIER_TO_UI: Record<string, ServiceTier> = { basic: 'junior', standard: 'middle', premium: 'senior' }
const TIER_TO_API: Record<ServiceTier, 'basic' | 'standard' | 'premium'> = {
  junior: 'basic',
  middle: 'standard',
  senior: 'premium',
}

type ProjectRow = {
  id: number
  name: string
  company: string
  domain: string
  industry: string
  tier: ServiceTier
  status: 'active' | 'archived'
  stage: StageKey
  score: number | null
  grade: GradeKey | null
  owner: string | null
}

/* ---------- 小组件 ---------- */

/** KPI 数字 count-up（600ms ease-out） */
function CountUp({ value, decimals = 0, suffix = '' }: { value: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const controls = animate(0, value, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: (v) => {
        el.textContent = `${v.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`
      },
    })
    return () => controls.stop()
  }, [value, decimals, suffix])
  return (
    <span ref={ref} className="tabular-nums">
      0{suffix}
    </span>
  )
}

function GradeBadge({ grade, size = 'md' }: { grade: GradeKey; size?: 'md' | 'lg' }) {
  const meta = GRADE_META[grade]
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-bold text-white',
        size === 'md' ? 'h-7 min-w-7 px-2 text-[13px]' : 'h-10 min-w-10 px-3 text-[17px]',
      )}
      style={{ backgroundColor: meta.color }}
      title={`${meta.label}（${meta.range}）`}
    >
      {grade}
    </span>
  )
}

/** 迷你阶段条：A·B·C·D 四圆点，当前阶段彩色脉冲，完成打勾 */
function MiniStageStepper({ current }: { current: StageKey }) {
  const stages: StageKey[] = ['A', 'B', 'C', 'D']
  const currentIdx = stages.indexOf(current)
  return (
    <div className="flex items-center gap-1.5">
      {stages.map((s, i) => {
        const done = i < currentIdx
        const active = i === currentIdx
        return (
          <span key={s} className="flex items-center gap-1.5">
            {i > 0 && <span className={cn('h-px w-2.5 shrink-0', done || active ? 'bg-[#c7d2fe]' : 'bg-[#e5e7eb]')} />}
            <span
              className={cn(
                'relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                done
                  ? 'border-transparent bg-[#d1fae5] text-success'
                  : active
                    ? 'border-transparent text-white'
                    : 'border-[#e5e7eb] bg-white text-[#9ca3af]',
              )}
              style={active ? { backgroundColor: STAGE_META[s].color } : undefined}
              title={`${s} ${STAGE_META[s].label}${active ? '（进行中）' : done ? '（已完成）' : ''}`}
            >
              {done ? <Check className="h-3 w-3" /> : s}
              {active && (
                <span
                  className="absolute inset-0 animate-pulse-dot rounded-full"
                  style={{ boxShadow: `0 0 0 3px ${STAGE_META[s].color}33` }}
                />
              )}
            </span>
          </span>
        )
      })}
    </div>
  )
}

/** 迷你 sparkline（40px 宽 SVG 折线，描边动画 800ms） */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 40
  const h = 18
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const span = max - min || 1
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`)
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <motion.polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: EASE }}
      />
    </svg>
  )
}

/** 服务档单选卡 */
function TierRadioCard({
  tier,
  selected,
  onSelect,
}: {
  tier: ServiceTier
  selected: boolean
  onSelect: () => void
}) {
  const meta = TIER_META[tier]
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-lg border px-3.5 py-2.5 text-left transition-all duration-150 ease-geo',
        selected
          ? 'border-brand bg-brand-light shadow-[0_0_0_1px_#1a56db]'
          : 'border-[#e5e7eb] bg-white hover:border-[#c7d2fe]',
      )}
    >
      <span className={cn('text-small font-semibold', selected ? 'text-brand' : 'text-[#374151]')}>
        {meta.label}
      </span>
      <span className="text-caption text-[#6b7280] tabular-nums">{meta.kpi}</span>
    </button>
  )
}

/* ---------- 新建/编辑项目 Modal ---------- */

interface ProjectFormState {
  name: string
  company: string
  domain: string
  industry: string
  tier: ServiceTier
  startDate: string
  owner: string
  note: string
}

const EMPTY_FORM: ProjectFormState = {
  name: '',
  company: '',
  domain: '',
  industry: '',
  tier: 'middle',
  startDate: '',
  owner: '',
  note: '',
}

/** 表单面板：随 open 挂载/卸载，key 变化即重置（避免 effect 内 setState） */
function ProjectModalPanel({
  editTarget,
  onClose,
}: {
  editTarget: ProjectRow | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const [form, setForm] = useState<ProjectFormState>(() =>
    editTarget
      ? {
          name: editTarget.name,
          company: editTarget.company,
          domain: editTarget.domain,
          industry: editTarget.industry,
          tier: editTarget.tier,
          startDate: '',
          owner: editTarget.owner ?? '',
          note: '',
        }
      : EMPTY_FORM,
  )
  const [error, setError] = useState<string | null>(null)
  const createMut = trpc.projects.create.useMutation()
  const updateMut = trpc.projects.update.useMutation()
  const pending = createMut.isPending || updateMut.isPending

  const patch = (p: Partial<ProjectFormState>) => setForm((f) => ({ ...f, ...p }))

  const submit = async () => {
    setError(null)
    try {
      if (editTarget) {
        await updateMut.mutateAsync({
          id: editTarget.id,
          name: form.name,
          company: form.company,
          domain: form.domain,
          industry: form.industry,
          serviceTier: TIER_TO_API[form.tier],
          startDate: form.startDate || undefined,
          owner: form.owner || undefined,
          note: form.note || undefined,
        })
        await utils.projects.list.invalidate()
        onClose()
      } else {
        const created = await createMut.mutateAsync({
          name: form.name,
          company: form.company,
          domain: form.domain,
          industry: form.industry,
          serviceTier: TIER_TO_API[form.tier],
          startDate: form.startDate || undefined,
          owner: form.owner || undefined,
          note: form.note || undefined,
        })
        await utils.projects.list.invalidate()
        onClose()
        navigate(`/projects/${created.id}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    }
  }

  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={editTarget ? '编辑项目' : '新建项目'}
            className="relative w-full max-w-[560px] rounded-xl bg-white p-6 shadow-xl"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', duration: 0.24, bounce: 0 }}
          >
            <h2 className="text-h2 text-[#111827]">{editTarget ? '编辑项目' : '新建项目'}</h2>
            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="mb-1.5 block text-small font-medium text-[#374151]">
                    项目名称 <span className="text-danger">*</span>
                  </span>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    placeholder="韩后 Hanhoo"
                    className="h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-small font-medium text-[#374151]">
                    客户公司 <span className="text-danger">*</span>
                  </span>
                  <input
                    required
                    value={form.company}
                    onChange={(e) => patch({ company: e.target.value })}
                    placeholder="广州中妆美业化妆品有限公司"
                    className="h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-small font-medium text-[#374151]">
                  官网域名 <span className="text-danger">*</span>
                </span>
                <span className="flex h-9 items-stretch overflow-hidden rounded-lg border border-[#e5e7eb] transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-accent-blue/30">
                  <span className="flex items-center border-r border-[#e5e7eb] bg-[#f3f4f6] px-3 font-mono text-small text-[#9ca3af]">
                    https://
                  </span>
                  <input
                    required
                    value={form.domain}
                    onChange={(e) => patch({ domain: e.target.value })}
                    placeholder="hanhoo.com"
                    className="w-full px-3 font-mono text-body outline-none"
                  />
                </span>
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="mb-1.5 block text-small font-medium text-[#374151]">
                    行业 <span className="text-danger">*</span>
                  </span>
                  <span className="relative block">
                    <select
                      required
                      value={form.industry}
                      onChange={(e) => patch({ industry: e.target.value })}
                      className="h-9 w-full appearance-none rounded-lg border border-[#e5e7eb] bg-white px-3 pr-8 text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                    >
                      <option value="" disabled>
                        请选择行业
                      </option>
                      {INDUSTRIES.map((i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-small font-medium text-[#374151]">项目启动日</span>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => patch({ startDate: e.target.value })}
                    className="h-9 w-full rounded-lg border border-[#e5e7eb] px-3 font-mono text-body tabular-nums outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                  />
                </label>
              </div>

              <div>
                <span className="mb-1.5 block text-small font-medium text-[#374151]">
                  服务档 <span className="text-danger">*</span>
                </span>
                <div className="grid grid-cols-3 gap-2.5">
                  {(['junior', 'middle', 'senior'] as ServiceTier[]).map((t) => (
                    <TierRadioCard key={t} tier={t} selected={form.tier === t} onSelect={() => patch({ tier: t })} />
                  ))}
                </div>
                <p className="mt-1.5 text-caption text-[#9ca3af]">
                  服务档承诺：初级 ≥20% / 中级 ≥30% / 高级 ≥40%（引用呈现率 KPI）
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="mb-1.5 block text-small font-medium text-[#374151]">负责人</span>
                  <input
                    value={form.owner}
                    onChange={(e) => patch({ owner: e.target.value })}
                    placeholder="项目执行"
                    className="h-9 w-full rounded-lg border border-[#e5e7eb] px-3 text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-small font-medium text-[#374151]">备注</span>
                  <textarea
                    rows={1}
                    value={form.note}
                    onChange={(e) => patch({ note: e.target.value })}
                    placeholder="选填"
                    className="w-full resize-none rounded-lg border border-[#e5e7eb] px-3 py-2 text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                  />
                </label>
              </div>

              {error && <p className="text-small text-danger">{error}</p>}

              <div className="flex justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-4 text-body text-[#374151] transition-colors hover:bg-[#f9fafb]"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-brand px-4 text-body font-medium text-white transition-all hover:bg-brand-deep active:scale-[0.98] disabled:opacity-50"
                >
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editTarget ? '保存修改' : '创建并进入项目'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
  )
}

function ProjectModal({
  open,
  editTarget,
  onClose,
}: {
  open: boolean
  editTarget: ProjectRow | null
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {open && <ProjectModalPanel key={editTarget?.id ?? 'new'} editTarget={editTarget} onClose={onClose} />}
    </AnimatePresence>
  )
}

/* ---------- 项目表格 ---------- */

type SortKey = 'score' | 'rate'

interface RateInfo {
  rate: number
  sparkline: number[]
}

function SortHeader({
  label,
  sortKey,
  sortAsc,
  active,
  onToggle,
}: {
  label: string
  sortKey: SortKey
  sortAsc: boolean
  active: boolean
  onToggle: (k: SortKey) => void
}) {
  return (
    <button type="button" onClick={() => onToggle(sortKey)} className="inline-flex items-center gap-1 hover:text-[#111827]">
      {label}
      {active ? (
        sortAsc ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 text-[#c4c9d1]" />
      )}
    </button>
  )
}

function ProjectTable({
  rows,
  rateMap,
  onCreate,
  onEdit,
  canCreate = true,
  canManage = true,
  projectEntryPath,
}: {
  rows: ProjectRow[]
  rateMap: Map<number, RateInfo>
  onCreate: () => void
  onEdit: (p: ProjectRow) => void
  canCreate?: boolean
  canManage?: boolean
  /** 行点击落地；client 进看板 */
  projectEntryPath?: (id: number) => string
}) {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const [keyword, setKeyword] = useState('')
  const [industry, setIndustry] = useState('all')
  const [status, setStatus] = useState<'active' | 'archived'>('active')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortAsc, setSortAsc] = useState(false)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const archiveMut = trpc.projects.update.useMutation({
    onSuccess: () => void utils.projects.list.invalidate(),
  })

  const filtered = useMemo(() => {
    let list = rows.filter((p) => p.status === status)
    if (keyword.trim()) {
      const k = keyword.trim().toLowerCase()
      list = list.filter(
        (p) => p.name.toLowerCase().includes(k) || p.company.toLowerCase().includes(k) || p.domain.toLowerCase().includes(k),
      )
    }
    if (industry !== 'all') list = list.filter((p) => p.industry === industry)
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const av = sortKey === 'score' ? (a.score ?? -1) : (rateMap.get(a.id)?.rate ?? 0)
        const bv = sortKey === 'score' ? (b.score ?? -1) : (rateMap.get(b.id)?.rate ?? 0)
        return sortAsc ? av - bv : bv - av
      })
    }
    return list
  }, [rows, keyword, industry, status, sortKey, sortAsc, rateMap])

  const archivedCount = rows.filter((p) => p.status === 'archived').length

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v)
    else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const archive = async (p: ProjectRow) => {
    setMenuFor(null)
    await archiveMut.mutateAsync({ id: p.id, status: p.status === 'archived' ? 'active' : 'archived' })
  }

  return (
    <motion.section
      className="geo-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25, ease: EASE }}
    >
      {/* 卡头 + 工具条 */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#e5e7eb] px-5 py-4">
        <h2 className="text-h2 text-[#111827]">项目列表</h2>
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索客户名 / 域名"
              className="h-9 w-60 rounded-lg border border-[#e5e7eb] pl-9 pr-3 text-body outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
            />
          </div>
          <div className="relative">
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="h-9 appearance-none rounded-lg border border-[#e5e7eb] bg-white pl-3 pr-8 text-body outline-none focus:border-brand"
            >
              <option value="all">全部行业</option>
              {INDUSTRIES.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
          </div>
          <div className="relative">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'archived')}
              className="h-9 appearance-none rounded-lg border border-[#e5e7eb] bg-white pl-3 pr-8 text-body outline-none focus:border-brand"
            >
              <option value="active">进行中</option>
              <option value="archived">已归档</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
          </div>
          {canCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-3.5 text-body text-[#374151] transition-colors hover:bg-[#f9fafb]"
          >
            <Plus className="h-4 w-4" />
            新建项目
          </button>
          )}
        </div>
      </div>

      {/* 数据表格 */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <img src="/illus-empty-project.svg" alt="" className="h-40 w-60" />
          <p className="text-small text-[#6b7280]">{canCreate ? '暂无项目，点击右上角新建项目' : '账号尚未绑定项目，请联系负责人'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] whitespace-nowrap text-left text-body">
            <thead>
              <tr className="bg-[#f3f4f6] text-small font-semibold text-[#6b7280]">
                <th className="rounded-tl-xl px-5 py-3">客户 / 项目</th>
                <th className="px-4 py-3">域名</th>
                <th className="px-4 py-3">行业</th>
                <th className="px-4 py-3">服务档</th>
                <th className="px-4 py-3">当前阶段</th>
                <th className="px-4 py-3">
                  <SortHeader label="综合分" sortKey="score" sortAsc={sortAsc} active={sortKey === 'score'} onToggle={toggleSort} />
                </th>
                <th className="px-4 py-3">
                  <SortHeader label="近30日引用率" sortKey="rate" sortAsc={sortAsc} active={sortKey === 'rate'} onToggle={toggleSort} />
                </th>
                <th className="px-4 py-3">负责人</th>
                {canManage && <th className="rounded-tr-xl px-4 py-3 text-right">操作</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, idx) => {
                const rate = rateMap.get(p.id)
                return (
                  <motion.tr
                    key={p.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.35 + idx * 0.05, ease: EASE }}
                    onClick={() => navigate(projectEntryPath ? projectEntryPath(p.id) : `/projects/${p.id}`)}
                    className="cursor-pointer border-t border-[#f3f4f6] transition-colors duration-100 hover:bg-[#f9fafb]"
                  >
                    <td className="min-w-[140px] whitespace-normal px-5 py-3.5" style={{ height: 52 }}>
                      <p className="font-semibold text-[#111827]">{p.name}</p>
                      <p className="text-caption text-[#9ca3af]">{p.company}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1 font-mono text-small text-[#374151]">
                        {p.domain}
                        <ExternalLink className="h-3 w-3 text-[#9ca3af]" />
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className="inline-flex max-w-[150px] truncate rounded-full bg-[#f3f4f6] px-2.5 py-1 text-caption text-[#6b7280]"
                        title={p.industry}
                      >
                        {p.industry}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-caption font-medium',
                          TIER_META[p.tier].chipClass,
                        )}
                      >
                        {TIER_META[p.tier].label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <MiniStageStepper current={p.stage} />
                    </td>
                    <td className="px-4 py-3.5">
                      {p.grade && p.score !== null ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="text-[15px] font-bold text-[#111827] tabular-nums">
                            {p.score.toFixed(1)}
                          </span>
                          <GradeBadge grade={p.grade} />
                        </span>
                      ) : (
                        <span className="inline-flex flex-col">
                          <span className="font-medium text-[#9ca3af]">—</span>
                          <span className="text-caption text-[#9ca3af]">未诊断</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={cn(
                            'font-semibold tabular-nums',
                            rate && rate.rate > 0 ? 'text-[#111827]' : 'text-[#9ca3af]',
                          )}
                        >
                          {rate ? `${rate.rate.toFixed(1)}%` : '—'}
                        </span>
                        {rate && rate.rate > 0 && (
                          <>
                            <TrendingUp className="h-3.5 w-3.5 text-success" />
                            {rate.sparkline.length >= 2 && <Sparkline data={rate.sparkline} color="#10b981" />}
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-[#374151]">{p.owner ?? '—'}</td>
                    {canManage && (
                    <td className="px-4 py-3.5 text-right">
                      <div className="relative inline-block">
                        <button
                          type="button"
                          aria-label="项目操作"
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuFor(menuFor === p.id ? null : p.id)
                          }}
                          className="rounded-md p-1.5 text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {menuFor === p.id && (
                          <div
                            className="absolute right-0 top-full z-20 mt-1 w-28 overflow-hidden rounded-lg border border-[#e5e7eb] bg-white py-1 shadow-card-hover"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="block w-full px-3.5 py-2 text-left text-small text-[#374151] transition-colors hover:bg-[#f9fafb]"
                              onClick={() => {
                                setMenuFor(null)
                                onEdit(p)
                              }}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="block w-full px-3.5 py-2 text-left text-small text-[#374151] transition-colors hover:bg-[#f9fafb]"
                              onClick={() => void archive(p)}
                            >
                              {p.status === 'archived' ? '取消归档' : '归档'}
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    )}
                  </motion.tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 已归档折叠组 */}
      {status === 'active' && archivedCount > 0 && (
        <button
          type="button"
          onClick={() => setArchivedOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 border-t border-[#f3f4f6] px-5 py-3 text-small text-[#6b7280] transition-colors hover:bg-[#f9fafb]"
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', archivedOpen && 'rotate-180')} />
          已归档（{archivedCount}）
        </button>
      )}
      {status === 'active' && archivedOpen && (
        <div className="border-t border-[#f3f4f6] px-5 py-3 text-caption text-[#9ca3af]">
          切换右上方状态筛选为「已归档」查看归档项目
        </div>
      )}

      <p className="border-t border-[#f3f4f6] px-5 py-2.5 text-caption text-[#9ca3af]">
        口径：引用呈现率 = L2 ÷ 实测总数（不含可拓词）
      </p>
    </motion.section>
  )
}

/* ---------- 首页 ---------- */

const CAPABILITY_CHIPS = ['四维 18 项评分体系', 'L2/L1/L0 引用判定', '6/12 个月考核双节点']

export default function Home() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const role = user?.role ?? 'operator'
  const allowCreate = canCreateProject(role)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ProjectRow | null>(null)

  const listQ = trpc.projects.list.useQuery()

  const rows: ProjectRow[] = useMemo(() => {
    const mapped = (listQ.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      company: p.company,
      domain: p.domain,
      industry: p.industry,
      tier: TIER_TO_UI[p.serviceTier] ?? 'middle',
      status: p.status,
      stage: p.stage,
      score: p.latestDiagnostic?.compositeScore ?? null,
      grade: (p.latestDiagnostic?.grade as GradeKey | null) ?? null,
      owner: p.owner,
    }))
    return user ? filterProjectsByRole(user, mapped) : mapped
  }, [listQ.data, user])

  // 各项目实测统计（近 30 日引用率 + sparkline + 全局统计）
  const statQueries = trpc.useQueries((t) => rows.map((p) => t.measurements.stats({ projectId: p.id })))

  const { rateMap, globalStats } = useMemo(() => {
    const map = new Map<number, RateInfo>()
    let total30 = 0
    let l230 = 0
    rows.forEach((p, i) => {
      const daily = statQueries[i]?.data?.daily
      if (!daily) return
      const last30 = daily.slice(-30)
      const total = last30.reduce((a, d) => a + d.total, 0)
      const l2 = last30.reduce((a, d) => a + d.l2, 0)
      const rate = total > 0 ? Math.round((l2 / total) * 1000) / 10 : 0
      const spark = daily.slice(-8).map((d) => d.rate)
      map.set(p.id, { rate, sparkline: spark })
      total30 += total
      l230 += l2
    })
    return {
      rateMap: map,
      globalStats: {
        activeProjects: rows.filter((r) => r.status === 'active').length,
        measureCount30d: total30,
        avgCitationRate: total30 > 0 ? Math.round((l230 / total30) * 1000) / 10 : 0,
      },
    }
  }, [rows, statQueries])

  const firstProject = rows[0] ?? null

  const moduleCards = [
    ...(role === 'client'
      ? []
      : [
          {
            key: 'diagnosis',
            theme: '#1a56db',
            illus: '/illus-module-diagnosis.svg',
            title: '诊断与商务出具',
            desc: '域名自动初评 + 人工复核 18 项指标，一键生成 Apple 风标准诊断报告，配套报价单与四阶段排期表。',
            linkLabel: '新建诊断',
            to: firstProject ? `/projects/${firstProject.id}/diagnosis/new` : null,
          },
        ]),
    {
      key: 'monitor',
      theme: '#0ea5e9',
      illus: '/illus-module-monitor.svg',
      title: '引用监测',
      desc:
        role === 'client'
          ? '查看己方项目监测看板与周期报告；报告发布后将在此展示关键指标。'
          : '锁定 10–20 词监测词池，三平台逐日录入 L2/L1/L0，看板实时追踪引用率爬升，周/月/季报自动汇总导出。',
      linkLabel: '进入监测看板',
      to: firstProject ? `/projects/${firstProject.id}/dashboard` : null,
    },
  ]

  if (listQ.isLoading) return <PageSkeleton />
  if (listQ.isError) return <p className="text-body text-danger">项目列表加载失败：{listQ.error.message}</p>

  if (role === 'client' && rows.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
        <img src="/illus-empty-project.svg" alt="" className="h-40 w-60" />
        <p className="text-body text-[#6b7280]">账号尚未绑定项目，请联系负责人</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Section 1 · PageHeader */}
      <div className="flex items-end justify-between gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
        >
          <h1 className="text-display text-[#111827]">工作台</h1>
          <p className="mt-1 text-caption text-[#6b7280]">
            清蓝官网GEO项目组 · 面向豆包 / DeepSeek / 通义千问的官网可见性诊断与引用监测
          </p>
        </motion.div>
        {allowCreate && (
        <motion.button
          type="button"
          onClick={() => {
            setEditTarget(null)
            setModalOpen(true)
          }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1, ease: EASE }}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-4 text-body font-medium text-white transition-all hover:bg-brand-deep active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          新建项目
        </motion.button>
        )}
      </div>

      {/* Section 2 · Hero 简介条 */}
      <motion.section
        className="geo-card relative flex flex-col gap-6 overflow-hidden p-6 pl-7 lg:flex-row lg:items-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: EASE }}
      >
        <span className="absolute left-0 top-0 h-full w-1 bg-brand" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-h1 text-[#111827]">官网 GEO 诊断与监测平台</h2>
          <p className="mt-2 max-w-2xl text-body text-[#6b7280]">
            输入域名，18 项指标四维评分生成标准诊断报告；锁定词池，三平台逐日实测官网引用呈现率。
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {CAPABILITY_CHIPS.map((chip) => (
              <span key={chip} className="rounded-full bg-[#f3f4f6] px-3 py-1.5 text-caption text-[#374151]">
                {chip}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 items-stretch gap-8 border-t border-[#f3f4f6] pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          {[
            { label: '进行中项目', value: globalStats.activeProjects, suffix: '' },
            { label: '近 30 天实测记录', value: globalStats.measureCount30d, suffix: ' 条' },
            { label: '平均引用呈现率', value: globalStats.avgCitationRate, suffix: '%', decimals: 1, note: 'L2 口径' },
          ].map((s) => (
            <div key={s.label} className="flex flex-col justify-center">
              <p className="text-caption text-[#9ca3af]">{s.label}</p>
              <p className="mt-1 text-[22px] font-bold leading-7 text-[#111827]">
                <CountUp value={s.value} decimals={s.decimals ?? 0} suffix={s.suffix} />
              </p>
              {s.note && <p className="mt-0.5 text-caption text-[#9ca3af]">{s.note}</p>}
            </div>
          ))}
        </div>
      </motion.section>

      {/* Section 3 · 双模块入口卡 */}
      <div className="grid gap-5 md:grid-cols-2">
        {moduleCards.map((card, i) => (
          <motion.button
            key={card.key}
            type="button"
            disabled={!card.to}
            onClick={() => card.to && navigate(card.to)}
            className="geo-card group relative overflow-hidden p-7 text-left disabled:cursor-not-allowed disabled:opacity-60"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15 + i * 0.12, ease: EASE }}
            whileHover={{ y: -3, boxShadow: '0 4px 12px rgba(16,24,40,.10)' }}
          >
            {/* 顶部 3px 主题色条滑入 */}
            <span
              className="absolute left-0 top-0 h-[3px] w-full origin-left scale-x-0 transition-transform duration-200 ease-geo group-hover:scale-x-100"
              style={{ backgroundColor: card.theme }}
              aria-hidden
            />
            <motion.img
              src={card.illus}
              alt=""
              className="h-24 w-24"
              whileHover={{ rotate: 8 }}
              transition={{ duration: 0.2 }}
            />
            <h3 className="mt-4 text-h2 text-[#111827]">{card.title}</h3>
            <p className="mt-2 text-body text-[#6b7280]">{card.desc}</p>
            <span
              className="mt-4 inline-flex items-center gap-1 text-body font-medium transition-transform duration-150 ease-geo group-hover:translate-x-1"
              style={{ color: card.theme }}
            >
              {card.linkLabel}
              <span aria-hidden>→</span>
            </span>
          </motion.button>
        ))}
      </div>

      {/* Section 4 · 项目列表 */}
      <ProjectTable
        rows={rows}
        rateMap={rateMap}
        canCreate={allowCreate}
        canManage={role !== 'client'}
        projectEntryPath={
          role === 'client'
            ? (id) => `/projects/${id}/dashboard`
            : (id) => `/projects/${id}`
        }
        onCreate={() => {
          setEditTarget(null)
          setModalOpen(true)
        }}
        onEdit={(p) => {
          setEditTarget(p)
          setModalOpen(true)
        }}
      />

      {/* Section 5 · 新建/编辑项目 Modal */}
      <ProjectModal open={modalOpen} editTarget={editTarget} onClose={() => setModalOpen(false)} />
    </div>
  )
}
