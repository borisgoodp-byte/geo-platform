import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Database, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { KeywordCategory } from '@contracts/kpi'
import { CATEGORY_META, CATEGORY_ORDER } from './shared'

export interface WizardWord {
  text: string
  category: KeywordCategory
  isExtended: boolean
}

interface PoolWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  submitting: boolean
  onSubmit: (name: string, words: WizardWord[], operator: string) => void
}

const STEP_TITLES = ['① 词池名称', '② 批量录入词', '③ 确认建池'] as const

const POOL_MIN = 10
const POOL_MAX = 20

/**
 * 建池向导三步弹窗：池名 → 批量粘贴词（每行一词 + 词类选择 + 可拓标记）→ 确认。
 * 护栏：正式词 10–20；三类大致均分给出提示（不强制阻断）。
 */
export default function PoolWizard({ open, onOpenChange, submitting, onSubmit }: PoolWizardProps) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('监测词池 v1')
  const [operator, setOperator] = useState('李监测')
  const [paste, setPaste] = useState('')
  const [pasteCategory, setPasteCategory] = useState<KeywordCategory>('generic')
  const [pasteExtended, setPasteExtended] = useState(false)
  const [words, setWords] = useState<WizardWord[]>([])
  const [dupMsg, setDupMsg] = useState('')

  const formalWords = words.filter((w) => !w.isExtended)
  const extendedWords = words.filter((w) => w.isExtended)
  const countOk = formalWords.length >= POOL_MIN && formalWords.length <= POOL_MAX

  const balance = useMemo(() => {
    const counts = CATEGORY_ORDER.map((c) => formalWords.filter((w) => w.category === c).length)
    const max = Math.max(...counts, 0)
    const min = Math.min(...counts)
    return { counts, balanced: max - min <= 2, max, min }
  }, [formalWords])

  const addPasted = () => {
    const lines = paste
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (lines.length === 0) return
    const exist = new Set(words.map((w) => w.text))
    const fresh: WizardWord[] = []
    let dup = 0
    for (const text of lines) {
      if (exist.has(text)) {
        dup += 1
        continue
      }
      exist.add(text)
      fresh.push({ text, category: pasteCategory, isExtended: pasteExtended })
    }
    setWords((prev) => [...prev, ...fresh])
    setPaste('')
    setDupMsg(dup > 0 ? `${dup} 个词已存在，已跳过` : '')
  }

  const reset = () => {
    setStep(0)
    setName('监测词池 v1')
    setWords([])
    setPaste('')
    setDupMsg('')
  }

  const close = (v: boolean) => {
    if (!v) reset()
    onOpenChange(v)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-brand" />
            创建监测词池 · {STEP_TITLES[step]}
          </DialogTitle>
          <DialogDescription>
            词池规模 10–20 个正式词（品牌 / 通用 / 业务场景三类均衡配置），可拓词单独标记、不计 KPI 分母。
          </DialogDescription>
        </DialogHeader>

        {/* 步骤指示 */}
        <div className="flex items-center gap-2">
          {STEP_TITLES.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-200',
                i <= step ? 'bg-brand' : 'bg-[#e5e7eb]',
              )}
            />
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {step === 0 && (
            <motion.div
              key="s0"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="text-small font-medium text-[#374151]">词池名称</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：监测词池 v1" />
              </div>
              <div className="space-y-1.5">
                <label className="text-small font-medium text-[#374151]">操作人</label>
                <Input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="录入操作人姓名" />
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="s1"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
              className="space-y-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-small text-[#6b7280]">导入到：</span>
                {CATEGORY_ORDER.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPasteCategory(c)}
                    className={cn(
                      'flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-caption transition-colors',
                      pasteCategory === c
                        ? 'border-current font-medium ' + CATEGORY_META[c].text + ' ' + CATEGORY_META[c].chipBg
                        : 'border-[#e5e7eb] text-[#6b7280] hover:border-[#9ca3af]',
                    )}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_META[c].dot }} />
                    {CATEGORY_META[c].label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPasteExtended((v) => !v)}
                  className={cn(
                    'h-7 rounded-full border border-dashed px-2.5 text-caption transition-colors',
                    pasteExtended
                      ? 'border-[#5e5ce6] bg-[#5e5ce6]/[0.08] font-medium text-[#5e5ce6]'
                      : 'border-[#d1d5db] text-[#6b7280] hover:border-[#9ca3af]',
                  )}
                >
                  ◌ 可拓词（不计 KPI 分母）
                </button>
              </div>
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={4}
                placeholder="每行一个词，粘贴后点击「加入清单」"
                className="w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-small outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-accent-blue/30"
              />
              <div className="flex items-center gap-3">
                <Button type="button" variant="secondary" size="sm" onClick={addPasted}>
                  加入清单
                </Button>
                {dupMsg && <span className="text-caption text-danger">{dupMsg}</span>}
              </div>

              {/* 已加入清单 */}
              <div className="max-h-52 space-y-2 overflow-y-auto rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-3">
                {words.length === 0 && (
                  <p className="py-4 text-center text-caption text-[#9ca3af]">尚未加入任何词</p>
                )}
                {CATEGORY_ORDER.map((c) => {
                  const list = words.filter((w) => w.category === c)
                  if (list.length === 0) return null
                  return (
                    <div key={c}>
                      <p className="mb-1 flex items-center gap-1.5 text-caption text-[#6b7280]">
                        <span className="h-2 w-2 rounded-full" style={{ background: CATEGORY_META[c].dot }} />
                        {CATEGORY_META[c].label}（{list.length}）
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {list.map((w) => (
                          <span
                            key={w.text}
                            className={cn(
                              'group flex h-7 items-center gap-1 rounded-full border bg-white px-2.5 text-caption',
                              w.isExtended && 'border-dashed border-[#5e5ce6]/60 text-[#5e5ce6]',
                            )}
                          >
                            {w.isExtended && <span>◌</span>}
                            {w.text}
                            <button
                              type="button"
                              title="移除"
                              onClick={() => setWords((prev) => prev.filter((x) => x.text !== w.text))}
                              className="text-[#9ca3af] transition-colors hover:text-danger"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="s2"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
              className="space-y-3"
            >
              <div className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-4">
                <p className="text-small font-medium text-[#111827]">{name}</p>
                <p className="mt-1 text-caption text-[#6b7280]">
                  正式词 {formalWords.length}（品牌 {balance.counts[0]} / 通用 {balance.counts[1]} / 场景{' '}
                  {balance.counts[2]}）· 可拓词 {extendedWords.length} · 操作人 {operator}
                </p>
              </div>

              {/* 护栏校验 */}
              <div
                className={cn(
                  'rounded-lg border px-3.5 py-2.5 text-small',
                  countOk
                    ? 'border-success/30 bg-success/[0.06] text-success'
                    : 'border-warning/40 bg-warning/[0.08] text-[#b45309]',
                )}
              >
                {countOk
                  ? `规模校验通过：${formalWords.length} 个正式词，处于 10–20 护栏区间。`
                  : formalWords.length < POOL_MIN
                    ? `正式词不足：当前 ${formalWords.length} 词，距下限 ${POOL_MIN} 词还差 ${POOL_MIN - formalWords.length}。`
                    : `正式词超出上限：当前 ${formalWords.length} 词，上限 ${POOL_MAX} 词，请移除 ${formalWords.length - POOL_MAX} 词。`}
              </div>
              {!balance.balanced && countOk && (
                <div className="rounded-lg border border-warning/40 bg-warning/[0.08] px-3.5 py-2.5 text-small text-[#b45309]">
                  三类分布不均（{balance.counts.join(' / ')}），建议品牌 / 通用 / 业务场景大致均分；可继续创建，后续通过变更调整。
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {step > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft className="h-3.5 w-3.5" />
                上一步
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => close(false)}>
              取消
            </Button>
            {step < 2 ? (
              <Button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={(step === 0 && (!name.trim() || !operator.trim())) || (step === 1 && words.length === 0)}
              >
                下一步
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!countOk || submitting}
                onClick={() => {
                  onSubmit(name.trim(), words, operator.trim())
                }}
              >
                {submitting ? '创建中…' : '确认创建词池'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
