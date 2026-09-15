import { useMemo, useState } from 'react'
import { Check, Copy, MessageSquareText } from 'lucide-react'
import {
  buildClientReplyScript,
  type ClientScriptFinding,
  type ClientScriptVerdict,
} from '@/features/diagnosis/clientScript'
import { cn } from '@/lib/utils'

type Props = {
  projectName?: string
  findings: ClientScriptFinding[]
  verdict: ClientScriptVerdict | null
  composite?: number | null
  grade?: string | null
  packageMonths?: 3 | 6 | 12
  className?: string
  /** 报告页用浅色体系，发现页用工作台体系 */
  variant?: 'workbench' | 'report'
}

/** 客户回复话术卡片：一段话 + 一键复制（operator/lead） */
export function ClientReplyCard({
  projectName,
  findings,
  verdict,
  composite,
  grade,
  packageMonths = 6,
  className,
  variant = 'workbench',
}: Props) {
  const text = useMemo(
    () =>
      buildClientReplyScript({
        projectName,
        findings,
        verdict,
        composite,
        grade,
        packageMonths,
      }),
    [projectName, findings, verdict, composite, grade, packageMonths],
  )
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const isReport = variant === 'report'

  return (
    <div
      className={cn(
        isReport
          ? 'rounded-[14px] border border-[rgba(0,113,227,.2)] bg-[linear-gradient(135deg,rgba(0,113,227,.06),rgba(94,92,230,.06))] p-5'
          : 'geo-card border-brand/20 bg-brand-light/40 p-5',
        'print-hidden',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <MessageSquareText
          className={cn('h-4 w-4', isReport ? 'text-[#0071e3]' : 'text-brand')}
        />
        <h3
          className={cn(
            'text-[15px] font-semibold',
            isReport ? 'text-[#1d1d1f]' : 'text-[#111827]',
          )}
        >
          客户回复话术
        </h3>
        <span className="text-caption text-[#86868b]">可直接转发客户 · 一段话不分点</span>
        <button
          type="button"
          onClick={() => void onCopy()}
          className={cn(
            'ml-auto inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90',
            isReport ? 'bg-[#0071e3]' : 'bg-brand',
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? '已复制' : '一键复制'}
        </button>
      </div>
      <p
        className={cn(
          'mt-3 text-[14px] leading-[26px]',
          isReport ? 'text-[#3a3a3c]' : 'text-[#374151]',
        )}
      >
        {text}
      </p>
    </div>
  )
}
