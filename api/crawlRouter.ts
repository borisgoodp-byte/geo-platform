import { z } from "zod";
import { eq } from "drizzle-orm";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import {
  projects,
  diagnostics,
  indicatorScores,
  crawlResults,
} from "@db/schema";
import { crawlDomain } from "./services/crawler";

export const crawlRouter = createRouter({
  /**
   * 执行抓取：域名抓取 → 写 crawl_results → 写 indicator_scores.autoScore/autoEvidence。
   * 抓取失败不阻塞：状态置 partial/failed，18 项 autoScore 保持为空由人工评分。
   */
  run: publicQuery
    .input(z.object({ diagnosticId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [d] = await db
        .select()
        .from(diagnostics)
        .where(eq(diagnostics.id, input.diagnosticId))
        .limit(1);
      if (!d) throw new Error(`诊断单不存在: ${input.diagnosticId}`);
      const [p] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, d.projectId))
        .limit(1);
      if (!p) throw new Error(`项目不存在: ${d.projectId}`);

      let outcome;
      try {
        outcome = await crawlDomain(p.domain);
      } catch (err) {
        // 抓取器自身异常 → failed，autoScore 全空
        const summary = {
          domain: p.domain,
          entry: null,
          variants: [],
          robots: { found: false, blocksAiBots: [], allowsAll: false },
          sitemap: { found: false, urlCount: 0 },
          llms: { found: false },
          pages: [],
          error: err instanceof Error ? err.message : String(err),
        };
        const [{ id }] = await db
          .insert(crawlResults)
          .values({
            diagnosticId: d.id,
            targetUrl: p.domain,
            status: "failed",
            summaryJson: summary,
          })
          .$returningId();
        // 失败也推进到 scoring，避免卡在 crawling 导致演示路径断档
        if (d.status === "crawling") {
          await db
            .update(diagnostics)
            .set({ status: "scoring" })
            .where(eq(diagnostics.id, d.id));
        }
        return {
          crawlResultId: id,
          status: "failed" as const,
          summary,
          suggestionsWritten: 0,
        };
      }

      const [{ id: crawlId }] = await db
        .insert(crawlResults)
        .values({
          diagnosticId: d.id,
          targetUrl: outcome.targetUrl,
          status: outcome.status,
          summaryJson: outcome.summary,
        })
        .$returningId();

      // upsert autoScore/autoEvidence（不覆盖人工 score）
      const existingRows = await db
        .select()
        .from(indicatorScores)
        .where(eq(indicatorScores.diagnosticId, d.id));
      let written = 0;
      for (const s of outcome.suggestions) {
        const exists = existingRows.find((r) => r.indicatorKey === s.indicatorKey);
        if (exists) {
          await db
            .update(indicatorScores)
            .set({ autoScore: s.autoScore, autoEvidence: s.autoEvidence })
            .where(eq(indicatorScores.id, exists.id));
        } else {
          await db.insert(indicatorScores).values({
            diagnosticId: d.id,
            indicatorKey: s.indicatorKey,
            dimension:
              s.indicatorKey.startsWith("tech") ? 1
              : s.indicatorKey.startsWith("arch") ? 2
              : s.indicatorKey.startsWith("cont") ? 3
              : 4,
            autoScore: s.autoScore,
            autoEvidence: s.autoEvidence,
          });
        }
        written++;
      }

      if (d.status === "crawling") {
        await db
          .update(diagnostics)
          .set({ status: "scoring" })
          .where(eq(diagnostics.id, d.id));
      }

      return {
        crawlResultId: crawlId,
        status: outcome.status,
        summary: outcome.summary,
        suggestionsWritten: written,
      };
    }),
});
