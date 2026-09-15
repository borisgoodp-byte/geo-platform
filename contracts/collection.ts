/**
 * 采集中心共享契约（前后端共享 · 禁止依赖 api/）
 * 口径见 collect-spec §0/§2：
 * - 应采格数 = 生效词数（最新锁定词池，含可拓词但标记区分）× 启用平台数
 * - 计划采集日由频率决定：daily 每天 / workdays 周一至周五 / custom 每周指定星期几
 * - 完成率 = 我方 measurements 已采格 ÷ 应采格（竞对录入不计入）
 */

import { PLATFORMS, type Platform } from "./kpi";

/** 采集频率 */
export const COLLECTION_FREQUENCIES = ["daily", "workdays", "custom"] as const;
export type CollectionFrequency = (typeof COLLECTION_FREQUENCIES)[number];

export const COLLECTION_FREQUENCY_LABELS: Record<CollectionFrequency, string> = {
  daily: "每日",
  workdays: "仅工作日",
  custom: "自定义",
};

/** 默认启用平台：三平台全量 */
export const DEFAULT_COLLECTION_PLATFORMS: Platform[] = [...PLATFORMS];

/** 采集配置（effective 形态：库中有记录为记录值，无记录为默认值） */
export interface CollectionConfigShape {
  projectId: number;
  frequency: CollectionFrequency;
  /** 仅 custom 生效：0=周日 … 6=周六 */
  customDays: number[] | null;
  platforms: Platform[];
  assignee: string | null;
  competitorSync: boolean;
}

/**
 * 判定某日是否为计划采集日。
 * date 为 YYYY-MM-DD；按 UTC 星期判定，避免服务器时区漂移。
 */
export function isPlannedDay(
  date: string,
  config: Pick<CollectionConfigShape, "frequency" | "customDays">,
): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (Number.isNaN(weekday)) return false;
  switch (config.frequency) {
    case "daily":
      return true;
    case "workdays":
      return weekday >= 1 && weekday <= 5;
    case "custom":
      return (config.customDays ?? []).includes(weekday);
  }
}

/** 完成率 = 已采格 ÷ 应采格 × 100%（保留 1 位小数；应采 0 时返回 null） */
export function calcCompletionRate(expected: number, actual: number): number | null {
  if (expected <= 0) return null;
  return Math.round((actual / expected) * 1000) / 10;
}
