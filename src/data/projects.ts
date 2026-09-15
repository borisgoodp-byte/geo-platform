/**
 * 前端占位常量（后端接入后由页面代理替换为 tRPC 数据源）。
 * 口径：引用呈现率 = L2 ÷ 实测总数（不含可拓词）；百分比保留 1 位小数。
 */

export type StageKey = 'A' | 'B' | 'C' | 'D'
export type GradeKey = 'A' | 'B' | 'C' | 'D'
export type ServiceTier = 'junior' | 'middle' | 'senior'
export type ProjectStatus = 'active' | 'archived'

export interface Project {
  id: string
  name: string
  company: string
  domain: string
  industry: string
  tier: ServiceTier
  status: ProjectStatus
  /** 当前所处阶段 */
  stage: StageKey
  /** 综合诊断分；null = 未诊断 */
  score: number | null
  /** 近 30 日引用呈现率（L2 口径，%） */
  citationRate30d: number
  /** 近 30 日引用率 sparkline 采样点（%） */
  sparkline: number[]
  owner: string
  startDate: string
}

export const TIER_META: Record<ServiceTier, { label: string; kpi: string; chipClass: string }> = {
  junior: { label: '初级', kpi: 'KPI ≥20%', chipClass: 'bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]' },
  middle: { label: '中级', kpi: 'KPI ≥30%', chipClass: 'bg-brand-light text-brand border-[#c7dbff]' },
  senior: { label: '高级', kpi: 'KPI ≥40%', chipClass: 'bg-[#f0efff] text-qwen border-[#d8d6ff]' },
}

export const STAGE_META: Record<StageKey, { label: string; color: string }> = {
  A: { label: '战略诊断', color: '#1a56db' },
  B: { label: '官网重构', color: '#5e5ce6' },
  C: { label: '内容运营', color: '#0ea5e9' },
  D: { label: '数据洞察', color: '#10b981' },
}

export const GRADE_META: Record<GradeKey, { label: string; color: string; range: string }> = {
  A: { label: '优秀', color: '#10b981', range: '≥80' },
  B: { label: '良好', color: '#0ea5e9', range: '65–79.9' },
  C: { label: '待提升', color: '#f59e0b', range: '45–64.9' },
  D: { label: '亟需优化', color: '#ef4444', range: '<45' },
}

export const INDUSTRIES = ['化妆品（护肤品）', '保险', '医疗健康', '教育培训', '消费电子']

export const DEMO_PROJECTS: Project[] = [
  {
    id: 'hanhoo',
    name: '韩后 Hanhoo',
    company: '广州中妆美业化妆品有限公司',
    domain: 'hanhoo.com',
    industry: '化妆品（护肤品）',
    tier: 'middle',
    status: 'active',
    stage: 'A',
    score: 21.0,
    citationRate30d: 0.0,
    sparkline: [0, 0, 0, 0, 0, 0, 0, 0],
    owner: '王执行',
    startDate: '2025-06-10',
  },
  {
    id: 'demo-insure',
    name: '臻选保险集团（演示）',
    company: '臻选保险集团股份有限公司',
    domain: 'demo-insure.example.cn',
    industry: '保险',
    tier: 'middle',
    status: 'active',
    stage: 'D',
    score: null,
    citationRate30d: 54.3,
    sparkline: [38.2, 40.1, 41.5, 44.8, 46.2, 49.0, 51.6, 54.3],
    owner: '李监测',
    startDate: '2024-11-02',
  },
]

/** 全局统计迷你条占位 */
export const GLOBAL_STATS = {
  activeProjects: 2,
  measureCount30d: 1890,
  avgCitationRate: 40.2,
}
