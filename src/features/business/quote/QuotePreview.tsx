import { Fragment } from 'react'
import { fmtMoney, STAGE_COLORS, TIER_KPI, TIER_LABELS } from '@/features/business/utils'
import { formatMonthZh } from '@/lib/formatDate'

export const QUOTE_GROUP_META: Record<string, { name: string; color: string }> = {
  A: { name: '诊断类', color: STAGE_COLORS.A },
  B: { name: '重构类', color: STAGE_COLORS.B },
  C: { name: '内容类', color: STAGE_COLORS.C },
  D: { name: '监测类', color: STAGE_COLORS.D },
}

export interface QuotePreviewItem {
  group: string
  name: string
  desc: string
  unit: string
  price: number
  qty: number
}

export interface QuotePreviewData {
  title: string
  quoteNo: string
  quoteDate: string
  validityDays: number
  tier: string
  clientName: string
  clientCompany: string
  clientDomain: string
  items: QuotePreviewItem[]
  subtotal: number
  discount: number
  total: number
  cnUpper: string
  payments: { label: string; pct: number }[]
}

const GROUP_ORDER = ['A', 'B', 'C', 'D']

/** A4 正式报价单预览（794px 宽纸张，由父级按容器缩放；打印时全宽输出） */
export function QuotePreview({ data }: { data: QuotePreviewData }) {
  const groups = GROUP_ORDER.map((g) => ({
    group: g,
    rows: data.items.filter((it) => it.group === g),
  })).filter((g) => g.rows.length > 0)
  const customGroups = data.items
    .filter((it) => !GROUP_ORDER.includes(it.group))
    .map((it) => it.group)
  const extraGroups = [...new Set(customGroups)].map((g) => ({
    group: g,
    rows: data.items.filter((it) => it.group === g),
  }))
  const allGroups = [...groups, ...extraGroups]
  let rowNo = 0

  return (
    <div
      className="quote-sheet mx-auto w-[794px] min-w-[794px] bg-white px-[56px] py-[52px] text-[#1d1d1f] shadow-[0_2px_16px_rgba(16,24,40,.10)] ring-1 ring-[#e5e7eb]"
      style={{ fontFamily: 'inherit' }}
    >
      {/* 抬头 */}
      <div className="flex items-start justify-between border-b-2 border-[#0f3a9e] pb-6">
        <div>
          <img src="/logo-pureblue.svg" alt="PureblueAI 媒介运营部" className="h-6 w-auto" />
          <p className="mt-2 text-[12px] text-[#6b7280]">清蓝官网GEO项目组 · PureblueAI 媒介运营部</p>
        </div>
        <div className="text-right">
          <div className="text-[26px] font-bold tracking-wide text-[#0f3a9e]">报价单</div>
          <div className="text-[12px] font-semibold tracking-[0.2em] text-[#9ca3af]">QUOTATION</div>
          <div className="mt-1 font-mono text-[12px] text-[#6b7280]">编号 {data.quoteNo}</div>
        </div>
      </div>

      {/* 客户信息块 */}
      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 rounded-lg bg-[#f9fafb] px-5 py-4 text-[13px] leading-[22px]">
        <p><span className="text-[#6b7280]">委托方：</span>{data.clientCompany || data.clientName}</p>
        <p><span className="text-[#6b7280]">官网域名：</span><span className="font-mono">{data.clientDomain}</span></p>
        <p>
          <span className="text-[#6b7280]">服务档：</span>
          {TIER_LABELS[data.tier] ?? data.tier}（KPI 目标 ≥{TIER_KPI[data.tier] ?? 30}%）
        </p>
        <p>
          <span className="text-[#6b7280]">报价日期：</span>
          <span className="tabular-nums">{formatMonthZh(data.quoteDate)}</span>
          <span className="ml-3 text-[#6b7280]">有效期 {data.validityDays} 天</span>
        </p>
      </div>

      {/* 明细表 */}
      <table className="mt-6 w-full border-collapse text-[12.5px] leading-[20px]">
        <thead>
          <tr className="bg-[#f3f4f6] text-[#374151]">
            <th className="border border-[#e5e7eb] px-2 py-2 text-left font-semibold">#</th>
            <th className="border border-[#e5e7eb] px-2 py-2 text-left font-semibold">服务项</th>
            <th className="border border-[#e5e7eb] px-2 py-2 text-center font-semibold">单位</th>
            <th className="border border-[#e5e7eb] px-2 py-2 text-right font-semibold">单价</th>
            <th className="border border-[#e5e7eb] px-2 py-2 text-center font-semibold">数量</th>
            <th className="border border-[#e5e7eb] px-2 py-2 text-right font-semibold">小计</th>
          </tr>
        </thead>
        <tbody>
          {allGroups.map(({ group, rows }) => (
            <Fragment key={`g-${group}`}>
              <tr>
                <td colSpan={6} className="border border-[#e5e7eb] px-2 py-1.5">
                  <span
                    className="mr-2 inline-block h-3 w-3 rounded-sm align-[-1.5px]"
                    style={{ background: QUOTE_GROUP_META[group]?.color ?? '#6b7280' }}
                  />
                  <b className="font-semibold text-[#111827]">
                    {group} {QUOTE_GROUP_META[group]?.name ?? '自定义服务'}
                  </b>
                </td>
              </tr>
              {rows.map((it) => {
                rowNo += 1
                return (
                  <tr key={`${group}-${rowNo}`}>
                    <td className="border border-[#e5e7eb] px-2 py-2 tabular-nums text-[#6b7280]">{rowNo}</td>
                    <td className="border border-[#e5e7eb] px-2 py-2">
                      <div className="font-semibold text-[#111827]">{it.name}</div>
                      {it.desc && <div className="mt-0.5 text-[11px] text-[#9ca3af]">{it.desc}</div>}
                    </td>
                    <td className="border border-[#e5e7eb] px-2 py-2 text-center">{it.unit}</td>
                    <td className="border border-[#e5e7eb] px-2 py-2 text-right font-mono tabular-nums">
                      {fmtMoney(it.price)}
                    </td>
                    <td className="border border-[#e5e7eb] px-2 py-2 text-center tabular-nums">{it.qty}</td>
                    <td className="border border-[#e5e7eb] px-2 py-2 text-right font-mono tabular-nums font-semibold">
                      {fmtMoney(it.price * it.qty)}
                    </td>
                  </tr>
                )
              })}
            </Fragment>
          ))}
        </tbody>
      </table>

      {/* 合计块 */}
      <div className="mt-5 flex justify-end">
        <div className="w-[320px] space-y-1.5 text-[13px]">
          <div className="flex justify-between text-[#374151]">
            <span>服务费合计</span>
            <span className="font-mono tabular-nums">{fmtMoney(data.subtotal)}</span>
          </div>
          <div className="flex justify-between text-[#374151]">
            <span>优惠折扣</span>
            <span className="font-mono tabular-nums">-{fmtMoney(data.discount)}</span>
          </div>
          <div className="flex justify-between border-t border-[#e5e7eb] pt-2 text-[16px] font-bold text-[#0f3a9e]">
            <span>总计</span>
            <span className="font-mono tabular-nums">{fmtMoney(data.total)}</span>
          </div>
          <div className="text-right text-[12px] text-[#6b7280]">大写：{data.cnUpper}</div>
        </div>
      </div>

      {/* 条款 + 落款 */}
      <div className="mt-8 border-t border-[#e5e7eb] pt-4 text-[11.5px] leading-[20px] text-[#6b7280]">
        <p>
          付款节奏：
          {data.payments.map((p) => `${p.label} ${p.pct}%`).join(' · ')}
        </p>
        <p className="mt-1">
          KPI 考核以 6/12 个月节点单日实测为准（达标线为目标的 80% 即验收合格）；本报价 {data.validityDays} 日内有效。
        </p>
        <div className="mt-6 flex justify-between text-[12.5px] text-[#374151]">
          <span>服务方（盖章）：清蓝官网GEO项目组 / PureblueAI 媒介运营部</span>
          <span>委托方（盖章）：________________</span>
        </div>
      </div>
    </div>
  )
}
