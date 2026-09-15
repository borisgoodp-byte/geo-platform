/**
 * 排期表生成规则（前后端共享 · 禁止依赖 api/）
 * 依据 DESIGN_SPEC §6：day 为相对 startDate 的偏移天数。
 */

import type { ServiceTier } from "./kpi";
import { TIER_KPI_TARGETS } from "./kpi";

export interface ScheduleTask {
  name: string;
  owner: string;
  startDay: number;
  endDay: number;
  deliverable: string;
}

export interface SchedulePhase {
  phase: "A" | "B" | "C" | "D";
  name: string;
  tasks: ScheduleTask[];
}

export interface ScheduleMilestone {
  name: string;
  day: number;
  desc: string;
}

export interface GeneratedSchedule {
  startDate: string;
  tier: ServiceTier;
  phasesJson: SchedulePhase[];
  milestonesJson: ScheduleMilestone[];
}

/** day 偏移 → ISO 日期（基于 startDate） */
export function dayToDate(startDate: string, day: number): string {
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
}

/**
 * 生成排期表：A 战略诊断(0-5) / B 官网重构(6-25) / C 内容运营(15-75) / D 数据洞察(10-180+)。
 * 考核目标按档：basic 20% / standard 30% / premium 40%；
 * 6 个月节点 30%/50% 双线呈现仅在高级档（premium）。
 */
export function generateSchedule(
  startDate: string,
  tier: ServiceTier,
): GeneratedSchedule {
  const kpiTarget = TIER_KPI_TARGETS[tier];
  const m6Desc =
    tier === "premium"
      ? "6 个月考核节点：当日实测引用率目标 ≥30%，冲刺线 50%；达成率 ≥80%（24%/40%）即验收合格"
      : `6 个月考核节点：当日实测引用率目标 ≥${kpiTarget}%；达成率 ≥80%（${Math.round(
          kpiTarget * 0.8,
        )}%）即验收合格`;
  const m12Desc =
    tier === "premium"
      ? "12 个月考核节点：当日实测引用率目标 ≥50%；达成率 ≥80%（40%）即验收合格"
      : `12 个月考核节点：当日实测引用率目标 ≥${kpiTarget}%；达成率 ≥80%（${Math.round(
          kpiTarget * 0.8,
        )}%）即验收合格`;

  const phasesJson: SchedulePhase[] = [
    {
      phase: "A",
      name: "战略诊断",
      tasks: [
        { name: "资料收集与词池商定", owner: "项目组", startDay: 0, endDay: 2, deliverable: "词池清单（商定稿）" },
        { name: "网站实测与四维评分", owner: "项目组", startDay: 1, endDay: 4, deliverable: "18 项指标评分表" },
        { name: "诊断报告出具与汇报", owner: "项目组", startDay: 4, endDay: 5, deliverable: "GEO 诊断报告" },
      ],
    },
    {
      phase: "B",
      name: "官网重构",
      tasks: [
        { name: "语义重构方案", owner: "项目组", startDay: 6, endDay: 10, deliverable: "语义重构方案文档" },
        { name: "结构化数据部署", owner: "客户技术团队", startDay: 8, endDay: 18, deliverable: "JSON-LD 部署记录" },
        { name: "商业页升级与架构调整", owner: "客户技术团队", startDay: 12, endDay: 25, deliverable: "重构上线确认单" },
      ],
    },
    {
      phase: "C",
      name: "内容运营",
      tasks: [
        { name: "内容战略与选题", owner: "项目组", startDay: 15, endDay: 20, deliverable: "选题规划表" },
        { name: "FAQ 体系搭建", owner: "项目组", startDay: 18, endDay: 30, deliverable: "FAQ 问答体系上线" },
        { name: "深度长文持续产出", owner: "项目组", startDay: 20, endDay: 75, deliverable: "深度长文（每周 2 篇）" },
        { name: "存量内容重构", owner: "项目组", startDay: 30, endDay: 60, deliverable: "存量页面重构清单" },
      ],
    },
    {
      phase: "D",
      name: "数据洞察",
      tasks: [
        { name: "词池锁定与基准线实测", owner: "项目组", startDay: 10, endDay: 12, deliverable: "基准线报告" },
        { name: "日常监测周报", owner: "项目组", startDay: 12, endDay: 180, deliverable: "监测周报（每周）" },
        { name: "6 个月考核节点", owner: "项目组", startDay: 130, endDay: 130, deliverable: "6 个月考核验收单" },
        { name: "12 个月考核节点", owner: "项目组", startDay: 260, endDay: 260, deliverable: "12 个月考核验收单" },
      ],
    },
  ];

  const milestonesJson: ScheduleMilestone[] = [
    { name: "诊断报告交付", day: 5, desc: "四维评分与诊断报告出具并完成汇报" },
    { name: "重构上线", day: 25, desc: "官网语义化重构与结构化数据部署完成上线" },
    { name: "基准线报告", day: 12, desc: "词池锁定，三平台基准线实测完成" },
    { name: "6 个月考核", day: 130, desc: m6Desc },
    { name: "12 个月考核", day: 260, desc: m12Desc },
  ];

  return { startDate, tier, phasesJson, milestonesJson };
}
