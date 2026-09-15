import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { History, Loader2, Minus, Plus, Printer, Save, Send, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { trpc } from '@/providers/trpc'
import { cn } from '@/lib/utils'
import { fmtMoney, toCnUpperAmount } from '@/features/business/utils'
import { useResolvedProjectId } from '@/features/business/hooks'
import { QuotePreview, QUOTE_GROUP_META } from '@/features/business/quote/QuotePreview'
import type { QuotePreviewItem } from '@/features/business/quote/QuotePreview'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Tier = 'basic' | 'standard' | 'premium'

interface EditItem {
  uid: string
  group: string
  name: string
  desc: string
  unit: string
  price: number
  qty: number
  selected: boolean
  custom?: boolean
}

const TIER_CARDS: { tier: Tier; label: string; desc: string; months: number; extra?: string }[] = [
  { tier: 'basic', label: '初级 · 基础诊断', desc: 'KPI 目标 ≥20%', months: 6 },
  { tier: 'standard', label: '中级 · 诊断+重构+运营', desc: 'KPI 目标 ≥30%', months: 12 },
  { tier: 'premium', label: '高级 · 全案深度运营', desc: 'KPI 目标 ≥40%', months: 12, extra: '双线考核 30%/50%' },
]

/** 各档预勾选目录项 code（演示默认方案） */
const TIER_PRESELECT: Record<Tier, string[] | 'all'> = {
  basic: ['A1', 'A2', 'D1'],
  standard: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2', 'D3'],
  premium: 'all',
}

const GROUPS = ['A', 'B', 'C', 'D'] as const

let uidSeq = 0
const nextUid = () => `q${++uidSeq}`

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

const PRINT_CSS = `
@media print {
  .quote-chrome { display: none !important; }
  .quote-print-wrap { position: static !important; height: auto !important; overflow: visible !important; }
  .quote-scale { transform: none !important; width: 100% !important; }
  .quote-sheet { width: 100% !important; min-width: 0 !important; box-shadow: none !important; ring: none !important; }
  @page { margin: 12mm; }
}
`

export default function Quote() {
  const { id: slug } = useParams()
  const { projectId, resolving } = useResolvedProjectId()

  const projectQuery = trpc.projects.get.useQuery(
    { id: projectId ?? 0 },
    { enabled: projectId !== null },
  )
  const catalogQuery = trpc.quotes.catalog.useQuery()
  const listQuery = trpc.quotes.listByProject.useQuery(
    { projectId: projectId ?? 0 },
    { enabled: projectId !== null },
  )
  const utils = trpc.useUtils()

  const createMut = trpc.quotes.create.useMutation({
    onSuccess: () => projectId && utils.quotes.listByProject.invalidate({ projectId }),
  })
  const updateMut = trpc.quotes.update.useMutation({
    onSuccess: () => projectId && utils.quotes.listByProject.invalidate({ projectId }),
  })

  // ---------- 编辑器状态 ----------
  const [tier, setTier] = useState<Tier>('standard')
  const [title, setTitle] = useState('')
  const [quoteDate, setQuoteDate] = useState(today())
  const [validityDays, setValidityDays] = useState(30)
  const [items, setItems] = useState<EditItem[]>([])
  const [discountMode, setDiscountMode] = useState<'amount' | 'percent'>('amount')
  const [discountInput, setDiscountInput] = useState(0)
  const [payments, setPayments] = useState([
    { label: '签约', pct: 40 },
    { label: '重构上线', pct: 30 },
    { label: '12个月考核验收', pct: 30 },
  ])
  const [currentQuoteId, setCurrentQuoteId] = useState<number | null>(null)
  const [currentStatus, setCurrentStatus] = useState<'draft' | 'issued'>('draft')
  const [issueOpen, setIssueOpen] = useState(false)
  const loadedRef = useRef(false)

  const project = projectQuery.data ?? null

  // 初始化：目录 + 项目 + 历史就绪后，载入最新历史或按档展开目录
  useEffect(() => {
    if (loadedRef.current) return
    if (!catalogQuery.data || listQuery.isLoading || projectQuery.isLoading) return
    if (listQuery.data && listQuery.data.length > 0) {
      loadQuote(listQuery.data[0])
      return
    }
    const t = ((project?.serviceTier as Tier) ?? 'standard') as Tier
    setTier(t)
    setTitle(`${project?.name ?? ''}官网GEO优化服务报价单`)
    setItems(buildItemsFromCatalog(catalogQuery.data, t))
    loadedRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogQuery.data, listQuery.data, listQuery.isLoading, projectQuery.isLoading, project])

  function buildItemsFromCatalog(
    catalog: NonNullable<typeof catalogQuery.data>,
    t: Tier,
  ): EditItem[] {
    const pre = TIER_PRESELECT[t]
    const months = t === 'basic' ? 6 : 12
    return catalog.map((c) => {
      let qty = 1
      if (c.unit === '月') qty = months
      else if (c.code === 'D3') qty = t === 'basic' ? 1 : 2
      else if (c.unit === '期') qty = 6
      return {
        uid: nextUid(),
        group: c.group,
        name: `${c.code} ${c.name}`,
        desc: c.desc,
        unit: c.unit,
        price: c.priceByTier[t],
        qty,
        selected: pre === 'all' ? true : pre.includes(c.code),
      }
    })
  }

  function loadQuote(q: NonNullable<typeof listQuery.data>[number]) {
    const saved = ((q.itemsJson as unknown as QuotePreviewItem[]) ?? []) as EditItem[]
    const savedTier = (q.tier as Tier) ?? 'standard'
    // 与当前目录合并：目录行保留勾选态与已存价格，已存自定义行追加
    const catalogRows = catalogQuery.data ? buildItemsFromCatalog(catalogQuery.data, savedTier) : []
    const merged: EditItem[] = catalogRows.map((c) => {
      const hit = saved.find((s) => s.name === c.name)
      return hit
        ? { ...c, selected: true, price: hit.price, qty: hit.qty, desc: hit.desc || c.desc }
        : { ...c, selected: false }
    })
    const extras = saved
      .filter((s) => !catalogRows.some((c) => c.name === s.name))
      .map((s) => ({ ...s, uid: nextUid(), selected: true, custom: true }))
    setItems([...merged, ...extras])
    setTitle(q.title)
    setTier(savedTier)
    setCurrentQuoteId(q.id)
    setCurrentStatus(q.status as 'draft' | 'issued')
    setQuoteDate(q.createdAt ? new Date(q.createdAt).toISOString().slice(0, 10) : today())
    loadedRef.current = true
  }

  // 历史报价：目录就绪后默认载入最新一份
  useEffect(() => {
    if (loadedRef.current || !listQuery.data || listQuery.data.length === 0 || !catalogQuery.data) return
    loadQuote(listQuery.data[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery.data, catalogQuery.data])

  // 切换服务档：整组重建目录项（crossfade）
  function switchTier(t: Tier) {
    setTier(t)
    if (catalogQuery.data) setItems(buildItemsFromCatalog(catalogQuery.data, t))
  }

  // ---------- 计算 ----------
  const subtotal = useMemo(
    () => items.filter((i) => i.selected).reduce((acc, i) => acc + i.price * i.qty, 0),
    [items],
  )
  const discount = useMemo(() => {
    const v =
      discountMode === 'amount' ? discountInput : (subtotal * discountInput) / 100
    return Math.min(Math.max(0, v), subtotal)
  }, [discountMode, discountInput, subtotal])
  const total = subtotal - discount
  const taxTotal = total * 1.06
  const cnUpper = toCnUpperAmount(total)

  const patchItem = (uid: string, patch: Partial<EditItem>) =>
    setItems((prev) => prev.map((i) => (i.uid === uid ? { ...i, ...patch } : i)))

  const addCustomItem = (group: string) =>
    setItems((prev) => [
      ...prev,
      { uid: nextUid(), group, name: '', desc: '', unit: '项', price: 0, qty: 1, selected: true, custom: true },
    ])

  // ---------- 保存 / 出具 ----------
  const saving = createMut.isPending || updateMut.isPending

  function payloadItems(): QuotePreviewItem[] {
    return items
      .filter((i) => i.selected && i.name.trim())
      .map(({ group, name, desc, unit, price, qty }) => ({ group, name, desc, unit, price, qty }))
  }

  async function save(status: 'draft' | 'issued') {
    if (!projectId) return
    const rows = payloadItems()
    if (rows.length === 0) {
      toast.error('请至少勾选一行服务项')
      return
    }
    const finalTitle = title.trim() || `${project?.name ?? ''}官网GEO优化服务报价单`
    try {
      if (currentQuoteId && currentStatus === 'draft') {
        await updateMut.mutateAsync({ id: currentQuoteId, title: finalTitle, tier, items: rows, status })
      } else {
        // 无历史或历史已出具 → 创建新版本
        const created = await createMut.mutateAsync({ projectId, title: finalTitle, tier, items: rows, status })
        setCurrentQuoteId(created.id)
      }
      setCurrentStatus(status)
      toast.success(status === 'issued' ? '报价单已出具并留痕' : '草稿已保存')
    } catch (e) {
      toast.error(`保存失败：${e instanceof Error ? e.message : '未知错误'}`)
    }
  }

  const quoteNo = currentQuoteId
    ? `QT-${quoteDate.replaceAll('-', '')}-${String(currentQuoteId).padStart(2, '0')}`
    : `QT-${quoteDate.replaceAll('-', '')}-NEW`

  // ---------- 预览缩放 ----------
  const wrapRef = useRef<HTMLDivElement>(null)
  const [wrapW, setWrapW] = useState(794)
  const [zoom, setZoom] = useState(1)
  const [sheetH, setSheetH] = useState(1123)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWrapW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = Math.min(1, wrapW / 794) * zoom

  const statusChip = currentStatus === 'issued'
    ? 'bg-[#e8f8f0] text-[#0d9463] border-[#bbe8d4]'
    : 'bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]'

  return (
    <div className="flex flex-col gap-5">
      <style>{PRINT_CSS}</style>
      <Toaster richColors position="top-center" />

      {/* ===== PageHeader ===== */}
      <div className="quote-chrome flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-display text-[#111827]">报价单{project ? ` · ${project.name}` : ''}</h1>
          <span className={cn('rounded-full border px-3 py-1 text-caption font-medium', statusChip)}>
            {currentStatus === 'issued' ? '已出具' : '草稿'}
          </span>
          {/* 历史版本 */}
          {listQuery.data && listQuery.data.length > 0 && (
            <label className="flex items-center gap-1.5 text-small text-[#6b7280]">
              <History className="h-3.5 w-3.5" />
              <select
                className="rounded-lg border border-[#e5e7eb] bg-white px-2 py-1.5 text-small text-[#374151] outline-none focus:border-brand"
                value={currentQuoteId ?? ''}
                onChange={(e) => {
                  const q = listQuery.data?.find((x) => x.id === Number(e.target.value))
                  if (q) {
                    loadQuote(q)
                    toast.info(`已载入报价单 #${q.id}（${q.status === 'issued' ? '已出具' : '草稿'}）`)
                  }
                }}
              >
                {currentQuoteId === null && <option value="">未保存的新报价</option>}
                {listQuery.data.map((q) => (
                  <option key={q.id} value={q.id}>
                    #{q.id} · {q.createdAt ? new Date(q.createdAt).toISOString().slice(0, 10) : ''} ·{' '}
                    {fmtMoney(Number(q.totalPrice))} · {q.status === 'issued' ? '已出具' : '草稿'}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="flex items-center gap-2">
          {currentStatus === 'issued' && (
            <span className="text-caption text-[#b45309]">当前版本已出具，再次保存将创建新版本</span>
          )}
          <button
            type="button"
            onClick={() => void save('draft')}
            disabled={saving || projectId === null}
            className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-4 py-2 text-small font-medium text-[#374151] transition-colors hover:bg-[#f9fafb] disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            保存草稿
          </button>
          <button
            type="button"
            onClick={() => setIssueOpen(true)}
            disabled={saving || projectId === null}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-small font-medium text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            出具报价单
          </button>
        </div>
      </div>

      {(resolving || projectQuery.isLoading) && (
        <div className="flex items-center gap-2 text-small text-[#6b7280]">
          <Loader2 className="h-4 w-4 animate-spin" /> 正在加载项目…
        </div>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-12">
        {/* ===== 左栏：编辑器 ===== */}
        <div className="quote-chrome flex flex-col gap-5 xl:col-span-7">

          {/* ① 服务档与周期 */}
          <section className="geo-card p-5">
            <h2 className="text-h2 text-[#111827]">服务方案</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {TIER_CARDS.map((c) => {
                const active = tier === c.tier
                return (
                  <button
                    key={c.tier}
                    type="button"
                    onClick={() => switchTier(c.tier)}
                    className={cn(
                      'rounded-xl border p-4 text-left transition-all duration-150 ease-geo',
                      active
                        ? 'border-brand bg-brand-light shadow-sm'
                        : 'border-[#e5e7eb] bg-white hover:border-[#c7dbff]',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded-full border',
                          active ? 'border-brand' : 'border-[#d1d5db]',
                        )}
                      >
                        {active && <span className="h-2 w-2 rounded-full bg-brand" />}
                      </span>
                      <span className={cn('text-small font-semibold', active ? 'text-brand' : 'text-[#111827]')}>
                        {c.label}
                      </span>
                    </div>
                    <p className="mt-2 text-caption text-[#6b7280]">{c.desc} · 周期 {c.months} 个月</p>
                    {c.extra && <p className="mt-0.5 text-caption text-[#9ca3af]">{c.extra}</p>}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="md:col-span-2 flex flex-col gap-1 text-caption text-[#6b7280]">
                报价标题
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={`${project?.name ?? '客户'}官网GEO优化服务报价单`}
                  className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-body text-[#111827] outline-none focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                />
              </label>
              <label className="flex flex-col gap-1 text-caption text-[#6b7280]">
                报价日期
                <input
                  type="date"
                  value={quoteDate}
                  onChange={(e) => setQuoteDate(e.target.value)}
                  className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-body text-[#111827] outline-none focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
                />
              </label>
              <label className="flex flex-col gap-1 text-caption text-[#6b7280]">
                有效期
                <select
                  value={validityDays}
                  onChange={(e) => setValidityDays(Number(e.target.value))}
                  className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-body text-[#111827] outline-none focus:border-brand"
                >
                  <option value={15}>15 天</option>
                  <option value={30}>30 天</option>
                </select>
              </label>
            </div>
          </section>

          {/* ② 服务项表格 */}
          <section className="geo-card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-h2 text-[#111827]">服务明细</h2>
              <span className="text-caption text-[#9ca3af]">数据来自价格目录 QUOTE_CATALOG，占位价可编辑</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={tier}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.24 }}
                className="mt-4 flex flex-col gap-5"
              >
                {GROUPS.map((g) => {
                  const rows = items.filter((i) => i.group === g)
                  const meta = QUOTE_GROUP_META[g]
                  const groupSubtotal = rows
                    .filter((r) => r.selected)
                    .reduce((acc, r) => acc + r.price * r.qty, 0)
                  return (
                    <div key={g} className="overflow-hidden rounded-xl border border-[#e5e7eb]">
                      <div className="flex items-center justify-between bg-[#f9fafb] px-4 py-2.5">
                        <span className="flex items-center gap-2 text-small font-semibold text-[#111827]">
                          <span className="h-3 w-3 rounded-sm" style={{ background: meta.color }} />
                          {g} {meta.name}
                        </span>
                        <span className="text-caption tabular-nums text-[#6b7280]">
                          组小计 {fmtMoney(groupSubtotal)}
                        </span>
                      </div>
                      <table className="w-full text-body">
                        <thead>
                          <tr className="text-left text-caption text-[#6b7280]">
                            <th className="w-10 px-3 py-2">选择</th>
                            <th className="px-2 py-2">服务项</th>
                            <th className="w-14 px-2 py-2 text-center">单位</th>
                            <th className="w-32 px-2 py-2 text-right">单价</th>
                            <th className="w-24 px-2 py-2 text-center">数量</th>
                            <th className="w-28 px-2 py-2 text-right">小计</th>
                            <th className="w-10 px-2 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((it) => (
                            <tr
                              key={it.uid}
                              className={cn(
                                'border-t border-[#f3f4f6] transition-colors',
                                it.selected ? 'bg-brand/[0.04]' : 'opacity-40',
                              )}
                            >
                              <td className="px-3 py-2.5">
                                <input
                                  type="checkbox"
                                  checked={it.selected}
                                  onChange={(e) => patchItem(it.uid, { selected: e.target.checked })}
                                  className="h-4 w-4 accent-[#1a56db]"
                                  aria-label={`选择 ${it.name}`}
                                />
                              </td>
                              <td className="px-2 py-2.5">
                                {it.custom ? (
                                  <input
                                    value={it.name}
                                    placeholder="自定义服务项名称"
                                    onChange={(e) => patchItem(it.uid, { name: e.target.value })}
                                    className="w-full rounded-md border border-[#e5e7eb] px-2 py-1 text-small outline-none focus:border-brand"
                                  />
                                ) : (
                                  <div className="text-small font-semibold text-[#111827]">{it.name}</div>
                                )}
                                {it.custom ? (
                                  <input
                                    value={it.desc}
                                    placeholder="服务说明"
                                    onChange={(e) => patchItem(it.uid, { desc: e.target.value })}
                                    className="mt-1 w-full rounded-md border border-[#e5e7eb] px-2 py-1 text-caption outline-none focus:border-brand"
                                  />
                                ) : (
                                  it.desc && <div className="mt-0.5 text-caption text-[#9ca3af]">{it.desc}</div>
                                )}
                              </td>
                              <td className="px-2 py-2.5 text-center">
                                {it.custom ? (
                                  <input
                                    value={it.unit}
                                    onChange={(e) => patchItem(it.uid, { unit: e.target.value })}
                                    className="w-12 rounded-md border border-[#e5e7eb] px-1 py-1 text-center text-small outline-none focus:border-brand"
                                  />
                                ) : (
                                  <span className="text-small text-[#6b7280]">{it.unit}</span>
                                )}
                              </td>
                              <td className="px-2 py-2.5">
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-caption text-[#9ca3af]">¥</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={it.price}
                                    onChange={(e) => patchItem(it.uid, { price: Math.max(0, Number(e.target.value) || 0) })}
                                    className="w-24 rounded-md border border-[#e5e7eb] px-2 py-1 text-right font-mono text-small tabular-nums outline-none focus:border-brand"
                                    aria-label="单价"
                                  />
                                </div>
                              </td>
                              <td className="px-2 py-2.5">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    aria-label="减数量"
                                    onClick={() => patchItem(it.uid, { qty: Math.max(1, it.qty - 1) })}
                                    className="flex h-6 w-6 items-center justify-center rounded border border-[#e5e7eb] text-[#6b7280] hover:bg-[#f3f4f6]"
                                  >
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <input
                                    type="number"
                                    min={1}
                                    value={it.qty}
                                    onChange={(e) => patchItem(it.uid, { qty: Math.max(1, Number(e.target.value) || 1) })}
                                    className="w-12 rounded-md border border-[#e5e7eb] px-1 py-1 text-center text-small tabular-nums outline-none focus:border-brand"
                                    aria-label="数量"
                                  />
                                  <button
                                    type="button"
                                    aria-label="加数量"
                                    onClick={() => patchItem(it.uid, { qty: it.qty + 1 })}
                                    className="flex h-6 w-6 items-center justify-center rounded border border-[#e5e7eb] text-[#6b7280] hover:bg-[#f3f4f6]"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </div>
                              </td>
                              <td className="px-2 py-2.5 text-right font-mono text-small font-semibold tabular-nums text-[#111827]">
                                {fmtMoney(it.price * it.qty)}
                              </td>
                              <td className="px-2 py-2.5 text-center">
                                <button
                                  type="button"
                                  aria-label="删除行"
                                  onClick={() => setItems((prev) => prev.filter((x) => x.uid !== it.uid))}
                                  className="text-[#d1d5db] transition-colors hover:text-danger"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <button
                        type="button"
                        onClick={() => addCustomItem(g)}
                        className="flex w-full items-center justify-center gap-1 border-t border-dashed border-[#e5e7eb] py-2 text-caption text-[#6b7280] transition-colors hover:bg-[#f9fafb] hover:text-brand"
                      >
                        <Plus className="h-3.5 w-3.5" /> 自定义服务项
                      </button>
                    </div>
                  )
                })}
              </motion.div>
            </AnimatePresence>
          </section>

          {/* ③ 费用汇总 */}
          <section className="geo-card p-5">
            <h2 className="text-h2 text-[#111827]">费用汇总</h2>
            <div className="mt-4 flex flex-col items-end gap-2 text-body">
              <div className="flex w-full max-w-sm items-center justify-between">
                <span className="text-[#6b7280]">服务费合计</span>
                <span className="text-[22px] font-bold tabular-nums text-[#111827]">{fmtMoney(subtotal)}</span>
              </div>
              <div className="flex w-full max-w-sm items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[#6b7280]">
                  优惠折扣
                  <span className="inline-flex overflow-hidden rounded-md border border-[#e5e7eb] text-caption">
                    <button
                      type="button"
                      onClick={() => setDiscountMode('amount')}
                      className={cn('px-2 py-0.5', discountMode === 'amount' ? 'bg-brand text-white' : 'bg-white text-[#6b7280]')}
                    >
                      金额
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountMode('percent')}
                      className={cn('px-2 py-0.5', discountMode === 'percent' ? 'bg-brand text-white' : 'bg-white text-[#6b7280]')}
                    >
                      %
                    </button>
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  {discountMode === 'amount' ? '¥' : ''}
                  <input
                    type="number"
                    min={0}
                    value={discountInput}
                    onChange={(e) => setDiscountInput(Math.max(0, Number(e.target.value) || 0))}
                    className="w-24 rounded-md border border-[#e5e7eb] px-2 py-1 text-right font-mono text-small tabular-nums outline-none focus:border-brand"
                    aria-label="优惠折扣"
                  />
                  {discountMode === 'percent' ? '%' : ''}
                  <span className="w-28 text-right font-mono text-small tabular-nums text-[#6b7280]">
                    -{fmtMoney(discount)}
                  </span>
                </span>
              </div>
              <div className="flex w-full max-w-sm items-center justify-between text-caption text-[#9ca3af]">
                <span>含税合计（6% 增值税，参考）</span>
                <span className="font-mono tabular-nums">{fmtMoney(taxTotal)}</span>
              </div>
              <div className="mt-1 w-full max-w-sm border-t border-[#e5e7eb] pt-3 text-right">
                <div className="text-[28px] font-bold tabular-nums text-brand">{fmtMoney(total)}</div>
                <div className="mt-1 text-caption text-[#6b7280]">大写：{cnUpper}</div>
              </div>
            </div>

            {/* 付款节奏 */}
            <div className="mt-5 border-t border-[#f3f4f6] pt-4">
              <p className="mb-2 text-caption text-[#9ca3af]">付款节奏（可编辑，合计应为 100%）</p>
              <div className="grid gap-2 md:grid-cols-3">
                {payments.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-[#e5e7eb] px-3 py-2">
                    <input
                      value={p.label}
                      onChange={(e) =>
                        setPayments((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                      }
                      className="w-full min-w-0 rounded-md border border-transparent px-1 py-0.5 text-small outline-none focus:border-brand"
                      aria-label={`付款节点 ${i + 1}`}
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={p.pct}
                      onChange={(e) =>
                        setPayments((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, pct: Math.max(0, Number(e.target.value) || 0) } : x)),
                        )
                      }
                      className="w-16 rounded-md border border-[#e5e7eb] px-1 py-0.5 text-right text-small tabular-nums outline-none focus:border-brand"
                      aria-label={`付款比例 ${i + 1}`}
                    />
                    <span className="text-caption text-[#9ca3af]">%</span>
                  </div>
                ))}
              </div>
              {payments.reduce((a, p) => a + p.pct, 0) !== 100 && (
                <p className="mt-1.5 text-caption text-warning">当前付款比例合计 {payments.reduce((a, p) => a + p.pct, 0)}%，请调整为 100%</p>
              )}
            </div>
          </section>
        </div>

        {/* ===== 右栏：A4 预览 ===== */}
        <div className="xl:col-span-5">
          <div className="sticky top-20">
            <div className="quote-chrome mb-3 flex items-center justify-between">
              <span className="text-small font-semibold text-[#374151]">正式报价单预览</span>
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="缩小"
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-[#e5e7eb] bg-white text-[#6b7280] hover:bg-[#f9fafb]"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="w-12 text-center text-caption tabular-nums text-[#6b7280]">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  type="button"
                  aria-label="放大"
                  onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-[#e5e7eb] bg-white text-[#6b7280] hover:bg-[#f9fafb]"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="ml-1 flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-caption font-medium text-white hover:bg-brand-deep"
                >
                  <Printer className="h-3.5 w-3.5" />
                  打印 / 导出 PDF
                </button>
              </span>
            </div>
            <div ref={wrapRef} className="quote-print-wrap overflow-hidden">
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3 }}
                style={{ height: sheetH * scale }}
              >
                <div className="quote-scale" style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 794 }}>
                  <SheetHeightContext onHeight={setSheetH}>
                    <QuotePreview
                      data={{
                        title: title || `${project?.name ?? ''}官网GEO优化服务报价单`,
                        quoteNo,
                        quoteDate,
                        validityDays,
                        tier,
                        clientName: project?.name ?? slug ?? '',
                        clientCompany: project?.company ?? '',
                        clientDomain: project?.domain ?? '',
                        items: payloadItems(),
                        subtotal,
                        discount,
                        total,
                        cnUpper,
                        payments,
                      }}
                    />
                  </SheetHeightContext>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* 出具二次确认 */}
      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>出具报价单</DialogTitle>
            <DialogDescription>
              出具后进入留痕，修改将生成新版本。确认按当前明细（合计 {fmtMoney(total)}）出具报价单？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setIssueOpen(false)}
              className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-2 text-small text-[#374151] hover:bg-[#f9fafb]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                setIssueOpen(false)
                void save('issued')
              }}
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-2 text-small font-medium text-white hover:bg-brand-deep disabled:opacity-50"
            >
              确认出具
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** 测量纸张高度，驱动缩放容器占位高度 */
function SheetHeightContext({ children, onHeight }: { children: React.ReactNode; onHeight: (h: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight))
    ro.observe(el)
    onHeight(el.offsetHeight)
    return () => ro.disconnect()
  }, [onHeight])
  return <div ref={ref}>{children}</div>
}
