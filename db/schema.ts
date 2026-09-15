import {
  mysqlTable,
  mysqlEnum,
  serial,
  bigint,
  int,
  varchar,
  text,
  timestamp,
  date,
  decimal,
  boolean,
  json,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";
import type {
  VerdictJson,
  DirectionCard,
  QuoteLineItem,
  CrawlSummary,
} from "../contracts/types";
import type { SchedulePhase, ScheduleMilestone } from "../contracts/schedule";
import type { Platform } from "../contracts/kpi";

/** 项目 */
export const projects = mysqlTable("projects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 255 }).notNull(),
  industry: varchar("industry", { length: 128 }).notNull(),
  serviceTier: mysqlEnum("serviceTier", ["basic", "standard", "premium"])
    .notNull()
    .default("standard"),
  stage: mysqlEnum("stage", ["A", "B", "C", "D"]).notNull().default("A"),
  startDate: date("startDate", { mode: "string" }),
  owner: varchar("owner", { length: 128 }),
  note: text("note"),
  status: mysqlEnum("status", ["active", "archived"]).notNull().default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** 诊断单 */
export const diagnostics = mysqlTable(
  "diagnostics",
  {
    id: serial("id").primaryKey(),
    projectId: bigint("projectId", { mode: "number", unsigned: true }).notNull(),
    diagnoseDate: date("diagnoseDate", { mode: "string" }).notNull(),
    status: mysqlEnum("status", ["crawling", "scoring", "completed"])
      .notNull()
      .default("crawling"),
    techScore: decimal("techScore", { precision: 5, scale: 1 }),
    archScore: decimal("archScore", { precision: 5, scale: 1 }),
    contentScore: decimal("contentScore", { precision: 5, scale: 1 }),
    visScore: decimal("visScore", { precision: 5, scale: 1 }),
    compositeScore: decimal("compositeScore", { precision: 5, scale: 1 }),
    grade: varchar("grade", { length: 2 }),
    verdictJson: json("verdictJson").$type<VerdictJson>(),
    directionsJson: json("directionsJson").$type<DirectionCard[]>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("diag_project_idx").on(t.projectId)],
);

/** 18 项指标评分（人工分 + 机器建议分） */
export const indicatorScores = mysqlTable(
  "indicator_scores",
  {
    id: serial("id").primaryKey(),
    diagnosticId: bigint("diagnosticId", { mode: "number", unsigned: true }).notNull(),
    indicatorKey: varchar("indicatorKey", { length: 32 }).notNull(),
    dimension: int("dimension").notNull(),
    score: int("score"),
    autoScore: int("autoScore"),
    autoEvidence: text("autoEvidence"),
    evidence: text("evidence"),
  },
  (t) => [
    uniqueIndex("diag_indicator_unique").on(t.diagnosticId, t.indicatorKey),
  ],
);

/** 诊断发现 */
export const findings = mysqlTable(
  "findings",
  {
    id: serial("id").primaryKey(),
    diagnosticId: bigint("diagnosticId", { mode: "number", unsigned: true }).notNull(),
    dimension: int("dimension").notNull(),
    severity: mysqlEnum("severity", ["danger", "warn", "ok"]).notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    body: text("body").notNull(),
    impact: text("impact").notNull(),
    sortOrder: int("sortOrder").notNull().default(0),
  },
  (t) => [index("findings_diag_idx").on(t.diagnosticId)],
);

/** 抓取结果 */
export const crawlResults = mysqlTable(
  "crawl_results",
  {
    id: serial("id").primaryKey(),
    diagnosticId: bigint("diagnosticId", { mode: "number", unsigned: true }).notNull(),
    targetUrl: varchar("targetUrl", { length: 512 }).notNull(),
    status: mysqlEnum("status", ["ok", "partial", "failed"]).notNull(),
    summaryJson: json("summaryJson").$type<CrawlSummary>(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("crawl_diag_idx").on(t.diagnosticId)],
);

/** 关键词池 */
export const keywordPools = mysqlTable(
  "keyword_pools",
  {
    id: serial("id").primaryKey(),
    projectId: bigint("projectId", { mode: "number", unsigned: true }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    version: int("version").notNull().default(1),
    status: mysqlEnum("status", ["draft", "locked"]).notNull().default("draft"),
    lockedAt: timestamp("lockedAt"),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("pool_project_idx").on(t.projectId)],
);

/** 关键词 */
export const keywords = mysqlTable(
  "keywords",
  {
    id: serial("id").primaryKey(),
    poolId: bigint("poolId", { mode: "number", unsigned: true }).notNull(),
    text: varchar("text", { length: 500 }).notNull(),
    category: mysqlEnum("category", ["brand", "generic", "scenario"]).notNull(),
    isExtended: boolean("isExtended").notNull().default(false),
    status: mysqlEnum("status", ["active", "removed"]).notNull().default("active"),
    addedAt: timestamp("addedAt").defaultNow().notNull(),
  },
  (t) => [index("kw_pool_idx").on(t.poolId)],
);

/** 词池变更日志 */
export const poolChangeLogs = mysqlTable(
  "pool_change_logs",
  {
    id: serial("id").primaryKey(),
    poolId: bigint("poolId", { mode: "number", unsigned: true }).notNull(),
    action: mysqlEnum("action", [
      "create",
      "lock",
      "unlock",
      "add",
      "remove",
      "extend",
    ]).notNull(),
    detail: text("detail").notNull(),
    operator: varchar("operator", { length: 128 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("log_pool_idx").on(t.poolId)],
);

/** 实测记录 */
export const measurements = mysqlTable(
  "measurements",
  {
    id: serial("id").primaryKey(),
    projectId: bigint("projectId", { mode: "number", unsigned: true }).notNull(),
    poolId: bigint("poolId", { mode: "number", unsigned: true }).notNull(),
    keywordId: bigint("keywordId", { mode: "number", unsigned: true }).notNull(),
    measureDate: date("measureDate", { mode: "string" }).notNull(),
    platform: mysqlEnum("platform", ["deepseek", "doubao", "qwen"]).notNull(),
    level: mysqlEnum("level", ["L2", "L1", "L0"]).notNull(),
    citedUrl: text("citedUrl"),
    citedUrlNorm: varchar("citedUrlNorm", { length: 768 }),
    citedPageTitle: varchar("citedPageTitle", { length: 500 }),
    snapshot: text("snapshot"),
    isCheckpoint: boolean("isCheckpoint").notNull().default(false),
    checkpointTag: mysqlEnum("checkpointTag", ["m6", "m12"]),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("ms_project_date_idx").on(t.projectId, t.measureDate),
    index("ms_pool_idx").on(t.poolId),
    index("ms_keyword_idx").on(t.keywordId),
  ],
);

/** 报价单 */
export const quotes = mysqlTable(
  "quotes",
  {
    id: serial("id").primaryKey(),
    projectId: bigint("projectId", { mode: "number", unsigned: true }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    tier: varchar("tier", { length: 32 }).notNull(),
    itemsJson: json("itemsJson").$type<QuoteLineItem[]>().notNull(),
    totalPrice: decimal("totalPrice", { precision: 12, scale: 2 }).notNull(),
    status: mysqlEnum("status", ["draft", "issued"]).notNull().default("draft"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("quote_project_idx").on(t.projectId)],
);

/** 排期表 */
export const schedules = mysqlTable(
  "schedules",
  {
    id: serial("id").primaryKey(),
    projectId: bigint("projectId", { mode: "number", unsigned: true }).notNull(),
    startDate: date("startDate", { mode: "string" }).notNull(),
    phasesJson: json("phasesJson").$type<SchedulePhase[]>().notNull(),
    milestonesJson: json("milestonesJson").$type<ScheduleMilestone[]>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("sched_project_idx").on(t.projectId)],
);

/** 竞对清单（项目级配置，名称 + 规范化域名，每项目 ≤ 5 个） */
export const competitors = mysqlTable(
  "competitors",
  {
    id: serial("id").primaryKey(),
    projectId: bigint("projectId", { mode: "number", unsigned: true }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    domain: varchar("domain", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("comp_project_idx").on(t.projectId)],
);

/**
 * 竞对命中记录（与 measurements 同粒度：词 × 平台 × 日 × 竞对）
 * L2 = 竞对官网被作为来源引用（url 规范化存储）；L1 = 品牌提及；L0 = 未出现。
 * 竞对数据仅作对比分析，不参与我方 KPI 计算。
 */
export const competitorHits = mysqlTable(
  "competitor_hits",
  {
    id: serial("id").primaryKey(),
    projectId: bigint("projectId", { mode: "number", unsigned: true }).notNull(),
    keywordId: bigint("keywordId", { mode: "number", unsigned: true }).notNull(),
    competitorId: bigint("competitorId", { mode: "number", unsigned: true }).notNull(),
    // 与 measurements.platform 同型
    platform: mysqlEnum("platform", ["deepseek", "doubao", "qwen"]).notNull(),
    // 与 measurements.measureDate 同型（YYYY-MM-DD 字符串）
    date: date("date", { mode: "string" }).notNull(),
    // 与 measurements.level 同型
    level: mysqlEnum("level", ["L2", "L1", "L0"]).notNull(),
    /** L2 时记录被引页面（normalizeUrl 规范化）；L1/L0 存 null */
    url: varchar("url", { length: 1024 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    // 同一竞对在同一 词 × 平台 × 日 仅一条记录（录入按 删→插 幂等覆盖）
    uniqueIndex("comp_hit_unique").on(t.keywordId, t.competitorId, t.platform, t.date),
    index("comp_hit_project_date_idx").on(t.projectId, t.date),
    index("comp_hit_competitor_idx").on(t.competitorId),
  ],
);

/**
 * 采集配置（每项目一条，PK=projectId，非 serial 主键）
 * 计划采集日由 frequency 决定：daily 每天 / workdays 周一至周五 / custom 按 customDays 星期几。
 */
export const collectionConfigs = mysqlTable("collection_configs", {
  projectId: bigint("projectId", { mode: "number", unsigned: true })
    .primaryKey()
    .references(() => projects.id),
  frequency: mysqlEnum("frequency", ["daily", "workdays", "custom"])
    .notNull()
    .default("daily"),
  /** 仅 custom 生效：number[]，0=周日 … 6=周六 */
  customDays: json("customDays").$type<number[]>(),
  /** 启用平台：Platform[]，默认 ["deepseek","doubao","qwen"] */
  platforms: json("platforms").$type<Platform[]>().notNull(),
  /** 采集执行人 */
  assignee: varchar("assignee", { length: 64 }),
  /** 采集时是否同屏录竞对 */
  competitorSync: boolean("competitorSync").notNull().default(true),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});


/** 用户账号 */
export const users = mysqlTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 128 }).notNull(),
    passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
    role: mysqlEnum("role", ["client", "operator", "lead"]).notNull(),
    status: mysqlEnum("status", ["active", "disabled"]).notNull().default("active"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

/** 用户 ↔ 项目绑定（lead 不写绑定行，表示全部项目） */
export const userProjects = mysqlTable(
  "user_projects",
  {
    id: serial("id").primaryKey(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    projectId: bigint("projectId", { mode: "number", unsigned: true }).notNull(),
  },
  (t) => [
    uniqueIndex("user_project_unique").on(t.userId, t.projectId),
    index("up_user_idx").on(t.userId),
    index("up_project_idx").on(t.projectId),
  ],
);

/** 登录会话 */
export const sessions = mysqlTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    userId: bigint("userId", { mode: "number", unsigned: true }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("sessions_token_unique").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

export type Project = typeof projects.$inferSelect;export type InsertProject = typeof projects.$inferInsert;
export type Diagnostic = typeof diagnostics.$inferSelect;
export type IndicatorScoreRow = typeof indicatorScores.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type CrawlResult = typeof crawlResults.$inferSelect;
export type KeywordPool = typeof keywordPools.$inferSelect;
export type Keyword = typeof keywords.$inferSelect;
export type PoolChangeLog = typeof poolChangeLogs.$inferSelect;
export type Measurement = typeof measurements.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type Schedule = typeof schedules.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;
export type CompetitorHit = typeof competitorHits.$inferSelect;
export type InsertCompetitorHit = typeof competitorHits.$inferInsert;
export type CollectionConfig = typeof collectionConfigs.$inferSelect;
export type InsertCollectionConfig = typeof collectionConfigs.$inferInsert;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
