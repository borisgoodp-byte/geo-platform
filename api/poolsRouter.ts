import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { keywordPools, keywords, poolChangeLogs } from "@db/schema";

const wordInput = z.object({
  text: z.string().min(1),
  category: z.enum(["brand", "generic", "scenario"]),
  isExtended: z.boolean().default(false),
});

async function writeLog(
  poolId: number,
  action: "create" | "lock" | "unlock" | "add" | "remove" | "extend",
  detail: string,
  operator: string,
) {
  await getDb().insert(poolChangeLogs).values({ poolId, action, detail, operator });
}

export const poolsRouter = createRouter({
  create: publicQuery
    .input(
      z.object({
        projectId: z.number().int().positive(),
        name: z.string().min(1),
        words: z.array(wordInput).min(1),
        note: z.string().optional(),
        operator: z.string().default("系统"),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const [{ id }] = await db
        .insert(keywordPools)
        .values({
          projectId: input.projectId,
          name: input.name,
          note: input.note,
        })
        .$returningId();
      await db.insert(keywords).values(
        input.words.map((w) => ({
          poolId: id,
          text: w.text,
          category: w.category,
          isExtended: w.isExtended,
        })),
      );
      await writeLog(
        id,
        "create",
        `创建词池「${input.name}」，共 ${input.words.length} 词（品牌 ${input.words.filter((w) => w.category === "brand").length} / 通用 ${input.words.filter((w) => w.category === "generic").length} / 场景 ${input.words.filter((w) => w.category === "scenario").length}）`,
        input.operator,
      );
      return { id };
    }),

  get: publicQuery
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [pool] = await db
        .select()
        .from(keywordPools)
        .where(eq(keywordPools.projectId, input.projectId))
        .orderBy(desc(keywordPools.id))
        .limit(1);
      if (!pool) return null;
      const words = await db
        .select()
        .from(keywords)
        .where(eq(keywords.poolId, pool.id));
      return { ...pool, keywords: words };
    }),

  lock: publicQuery
    .input(
      z.object({
        poolId: z.number().int().positive(),
        operator: z.string().default("系统"),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const [pool] = await db
        .select()
        .from(keywordPools)
        .where(eq(keywordPools.id, input.poolId))
        .limit(1);
      if (!pool) throw new Error(`词池不存在: ${input.poolId}`);
      await db
        .update(keywordPools)
        .set({ status: "locked", lockedAt: new Date() })
        .where(eq(keywordPools.id, input.poolId));
      await writeLog(input.poolId, "lock", "词池确认锁定，服务周期内变更须审批并记录", input.operator);
      return { ok: true };
    }),

  addKeyword: publicQuery
    .input(
      z.object({
        poolId: z.number().int().positive(),
        text: z.string().min(1),
        category: z.enum(["brand", "generic", "scenario"]),
        isExtended: z.boolean().default(false),
        operator: z.string().default("系统"),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const [pool] = await db
        .select()
        .from(keywordPools)
        .where(eq(keywordPools.id, input.poolId))
        .limit(1);
      if (!pool) throw new Error(`词池不存在: ${input.poolId}`);
      const [{ id }] = await db
        .insert(keywords)
        .values({
          poolId: input.poolId,
          text: input.text,
          category: input.category,
          isExtended: input.isExtended,
        })
        .$returningId();
      // 锁定池加词须记录变更日志
      if (pool.status === "locked") {
        await writeLog(
          input.poolId,
          input.isExtended ? "extend" : "add",
          `${input.isExtended ? "新增可拓词" : "新增考核词"}「${input.text}」（${input.category}）`,
          input.operator,
        );
      }
      return { id };
    }),

  removeKeyword: publicQuery
    .input(
      z.object({
        keywordId: z.number().int().positive(),
        operator: z.string().default("系统"),
      }),
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      const [kw] = await db
        .select()
        .from(keywords)
        .where(eq(keywords.id, input.keywordId))
        .limit(1);
      if (!kw) throw new Error(`关键词不存在: ${input.keywordId}`);
      await db
        .update(keywords)
        .set({ status: "removed" })
        .where(eq(keywords.id, input.keywordId));
      const [pool] = await db
        .select()
        .from(keywordPools)
        .where(eq(keywordPools.id, kw.poolId))
        .limit(1);
      if (pool?.status === "locked") {
        await writeLog(kw.poolId, "remove", `移除关键词「${kw.text}」（标记 removed，历史数据保留）`, input.operator);
      }
      return { ok: true };
    }),

  changeLogs: publicQuery
    .input(z.object({ poolId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return getDb()
        .select()
        .from(poolChangeLogs)
        .where(eq(poolChangeLogs.poolId, input.poolId))
        .orderBy(poolChangeLogs.createdAt);
    }),
});
