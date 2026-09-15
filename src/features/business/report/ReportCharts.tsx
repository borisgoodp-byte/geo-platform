import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'

/** 报告页得分区间色（design.md §2.2 / ScoreGauge 分段弧语义） */
export function bandColor(score: number): string {
  if (score >= 80) return '#30d158'
  if (score >= 65) return '#0071e3'
  if (score >= 45) return '#ff9f0a'
  return '#ff3b30'
}

export function bandGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 80) return 'A'
  if (score >= 65) return 'B'
  if (score >= 45) return 'C'
  return 'D'
}

export const GRADE_TEXT: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: '优秀',
  B: '良好',
  C: '待提升',
  D: '亟需优化',
}

/** 数字 count-up（报告首屏仪式感，打印时动画全局禁用无影响） */
export function useCountUp(target: number, duration = 1200, started = true): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef(0)
  useEffect(() => {
    if (!started) return
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(target * eased)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration, started])
  return value
}

/**
 * 综合仪表盘：手写 SVG 圆环（r=140 视区 320，stroke 14 圆头），
 * 弧色按得分区间分段；中心三层：大数字 / 标签 / 等级胶囊（等级胶囊由父级叠加）。
 */
export function ReportGauge({ score }: { score: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.2 })
  const display = useCountUp(score, 1200, inView)

  const R = 140
  const C = 2 * Math.PI * R
  const frac = Math.max(0, Math.min(100, score)) / 100
  const color = bandColor(score)

  return (
    <div ref={ref} className="relative mx-auto w-fit">
      <svg viewBox="0 0 320 320" className="h-[280px] w-[280px]" role="img" aria-label={`综合健康度 ${score} 分`}>
        <circle cx={160} cy={160} r={R} fill="none" stroke="#e8e8ed" strokeWidth={14} />
        <motion.circle
          cx={160}
          cy={160}
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={C}
          transform="rotate(-90 160 160)"
          initial={{ strokeDashoffset: C }}
          animate={inView ? { strokeDashoffset: C * (1 - frac) } : undefined}
          transition={{ duration: 1.4, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[56px] font-bold leading-none tracking-[-0.02em] tabular-nums" style={{ color }}>
          {display.toFixed(1)}
        </span>
        <span className="mt-2 text-[13px] tracking-[0.08em] text-[#86868b]">综合健康度 / 100</span>
      </div>
    </div>
  )
}

interface RadarAxis {
  label: string
  score: number
  weight: string
}

/**
 * 四维能力雷达：手写 SVG（视区 420），四层网格 + 满分虚线参考 + 本项目多边形。
 * 轴序：上 技术底座 / 右 内容生态 / 下 页面架构 / 左 GEO可见度（与模板一致）。
 */
export function ReportRadar({ axes }: { axes: [RadarAxis, RadarAxis, RadarAxis, RadarAxis] }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.2 })

  const SIZE = 420
  const C = SIZE / 2
  const MAX_R = 128
  // 轴角度：上、右、下、左
  const angles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI]

  const point = (axis: number, ratio: number): [number, number] => [
    C + Math.cos(angles[axis]) * MAX_R * ratio,
    C + Math.sin(angles[axis]) * MAX_R * ratio,
  ]
  const poly = (ratios: number[]) =>
    ratios.map((r, i) => point(i, r).map((v) => v.toFixed(1)).join(',')).join(' ')

  const labelPos = (axis: number): [number, number] => point(axis, 1.22)
  const anchors = ['middle', 'start', 'middle', 'end'] as const
  const scoreOffsets: [number, number][] = [
    [0, -16],
    [16, 4],
    [0, 22],
    [-16, 4],
  ]

  const dataRatios = axes.map((a) => Math.max(0.02, Math.min(1, a.score / 100)))

  return (
    <div ref={ref} className="mx-auto w-fit">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-[420px] w-[420px] max-w-full" role="img" aria-label="四维能力雷达图">
        {/* 四层同心网格 */}
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <polygon key={r} points={poly([r, r, r, r])} fill="none" stroke="#e8e8ed" strokeWidth={1} />
        ))}
        {/* 轴线 */}
        {angles.map((_, i) => {
          const [x, y] = point(i, 1)
          return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="#e8e8ed" strokeWidth={1} />
        })}
        {/* 轴端标签 + 权重 */}
        {axes.map((a, i) => {
          const [x, y] = labelPos(i)
          return (
            <text key={a.label} x={x} y={y} textAnchor={anchors[i]} fontSize={14} fill="#6e6e73">
              {a.label}
              <tspan fill="#86868b" fontSize={12}>{` · ${a.weight}`}</tspan>
            </text>
          )
        })}
        {/* 满分参考虚线 */}
        <polygon points={poly([1, 1, 1, 1])} fill="none" stroke="#d2d2d7" strokeWidth={1.5} strokeDasharray="4 4" />
        {/* 本项目多边形 */}
        <motion.polygon
          points={poly(dataRatios)}
          fill="rgba(0,113,227,.18)"
          stroke="#0071e3"
          strokeWidth={2.5}
          initial={{ scale: 0, opacity: 0 }}
          animate={inView ? { scale: 1, opacity: 1 } : undefined}
          transition={{ type: 'spring', stiffness: 120, damping: 16, duration: 0.6 }}
          style={{ transformOrigin: `${C}px ${C}px` }}
        />
        {/* 顶点圆点 + 分数 */}
        {axes.map((a, i) => {
          const [x, y] = point(i, dataRatios[i])
          const [dx, dy] = scoreOffsets[i]
          return (
            <motion.g
              key={a.label}
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : undefined}
              transition={{ delay: 0.35 + i * 0.08 }}
            >
              <circle cx={x} cy={y} r={5} fill="#0071e3" stroke="#fff" strokeWidth={2}>
                <title>{`${a.label} ${a.score}/100 · 权重 ${a.weight}`}</title>
              </circle>
              <text
                x={x + dx}
                y={y + dy}
                textAnchor="middle"
                fontSize={13}
                fontWeight={700}
                fill={a.score === 0 ? '#ff3b30' : '#1d1d1f'}
              >
                {a.score}
              </text>
            </motion.g>
          )
        })}
      </svg>
    </div>
  )
}
