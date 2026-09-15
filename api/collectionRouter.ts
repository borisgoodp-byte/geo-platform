/**
 * 采集中心路由（collection.*）
 * 五个过程：getConfig / saveConfig / plan / calendar / stats，入参出参见 collect-spec §2。
 * 聚合逻辑在 services/collectionStats.ts；isPlannedDay 等纯函数在 contracts/collection.ts。
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { collectionConfigs, projects } from "@db/schema";
import {
  computeCalendar,
  computePlan,
  computeStats,
  getEffectiveConfig,
} from "./services/collectionStats";

const platformEnum = z.enum(["deepseek", "doubao", "qwen"]);
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const collectionRouter = createRouter({
  /** 读取生效配置：无记录返回默认值（daily/三平台/项目负责人/competitorSync=true），不落库 */
  getConfig: publicQuery
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ input }) => getEffectiveConfig(input.projectId)),

  /** 保存配置（upsert）：platforms 至少 1 个；custom 时 customDays 至少 1 天 */
  saveConfig: publicQuery
    .input(
      z
        .object({
          projectId: z.number().int().positive(),
          frequency: z.enum(["daily", "workdays", "custom"]),
          customDays: z.array(z.number().int().min(0).max(6)).optional().nullable(),
          platforms: z.array(platformEnum).min(1, "至少启用 1 个平台"),
          assignee: z.string().trim().max(64).optional().nullable(),
          competitorSync: z.boolean(),
        })
        .superRefine((v, ctx) => {
          if (v.frequency === "custom" && (!v.customDays || v.customDays.length === 0)) {
            ctx.addIssue({
              code: "custom",
              path: ["customDays"],
              message: "自定义频率需至少选择 1 天",
            });
          }
        }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!project) throw new Error(`项目不存在: ${input.projectId}`);

      // 非 custom 时清空 customDays，避免残留旧配置
      const values = {
        projectId: input.projectId,
        frequency: input.frequency,
        customDays: input.frequency === "custom" ? (input.customDays ?? null) : null,
        platforms: input.platforms,
        assignee: input.assignee?.trim() ? input.assignee.trim() : null,
        competitorSync: input.competitorSync,
      };
      const [existing] = await db
        .select({ projectId: collectionConfigs.projectId })
        .from(collectionConfigs)
        .where(eq(collectionConfigs.projectId, input.projectId))
        .limit(1);
      if (existing) {
        await db
          .update(collectionConfigs)
          .set(values)
          .where(eq(collectionConfigs.projectId, input.projectId));
      } else {
        await db.insert(collectionConfigs).values(values);
      }
      return getEffectiveConfig(input.projectId);
    }),

  /** 当日采集任务：应采/已采/完成率/缺失词/分平台进度 */
  plan: publicQuery
    .input(
      z.object({
        projectId: z.number().int().positive(),
        date: dateStr,
      }),
    )
    .query(async ({ input }) => computePlan(input.projectId, input.date)),

  /** 逐日采集日历（from/to 闭区间）；rate=null 表示非计划日 */
  calendar: publicQuery
    .input(
      z.object({
        projectId: z.number().int().positive(),
        from: dateStr,
        to: dateStr,
      }),
    )
    .query(async ({ input }) => {
      if (input.from > input.to) throw new Error("from 不能晚于 to");
      return computeCalendar(input.projectId, input.from, input.to);
    }),

  /** 近 N 天统计：完整采集日/平均完成率/连续缺采/记录数/快照留存率/竞对录入量 */
  stats: publicQuery
    .input(
      z.object({
        projectId: z.number().int().positive(),
        days: z.number().int().min(1).max(365).default(30),
      }),
    )
    .query(async ({ input }) => computeStats(input.projectId, input.days)),
});
