/**
 * 种子数据（DESIGN_SPEC §7）
 * 幂等：先清空全部业务表再插入。
 * 运行：npx tsx db/seed.ts
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../api/queries/connection";
import {
  projects,
  diagnostics,
  indicatorScores,
  findings,
  crawlResults,
  keywordPools,
  keywords,
  poolChangeLogs,
  measurements,
  quotes,
  schedules,
  competitors,
  competitorHits,
  collectionConfigs,
  users,
  userProjects,
  sessions,
} from "./schema";
import { hashPassword } from "../api/auth/password";
import { INDICATORS } from "../contracts/scoring";
import { normalizeUrl } from "../contracts/kpi";
import { catalogItemsForTier, computeQuoteTotal } from "../contracts/quote";
import { generateSchedule } from "../contracts/schedule";
import type { VerdictJson, DirectionCard } from "../contracts/types";

const summary: Record<string, number> = {};
function track(name: string, n: number) {
  summary[name] = (summary[name] ?? 0) + n;
}

function isoDay(offsetFromToday: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetFromToday);
  return d.toISOString().slice(0, 10);
}

/** 确定性伪随机（mulberry32），保证每次种子生成同一批实测结果 */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function clearBusinessTables() {
  const db = getDb();
  await db.delete(sessions);
  await db.delete(userProjects);
  await db.delete(users);
  await db.delete(measurements);
  await db.delete(poolChangeLogs);
  await db.delete(keywords);
  await db.delete(keywordPools);
  await db.delete(crawlResults);
  await db.delete(findings);
  await db.delete(indicatorScores);
  await db.delete(diagnostics);
  await db.delete(quotes);
  await db.delete(schedules);
  await db.delete(competitorHits);
  await db.delete(competitors);
  await db.delete(collectionConfigs);
  await db.delete(projects);
  console.log("已清空业务表");
}

// ---------------------------------------------------------------- 韩后 Hanhoo

const HANHOO_SCORES: Record<string, number> = {
  tech_1: 10, tech_2: 10, tech_3: 0, tech_4: 0, tech_5: 0, // =20
  arch_1: 15, arch_2: 10, arch_3: 15, arch_4: 0, arch_5: 10, // =50
  cont_1: 0, cont_2: 0, cont_3: 10, cont_4: 10, cont_5: 0, // =20
  vis_1: 0, vis_2: 0, vis_3: 0, // =0
};

const HANHOO_FINDINGS: {
  dimension: number;
  severity: "danger" | "warn" | "ok";
  title: string;
  body: string;
  impact: string;
}[] = [
  {
    dimension: 1,
    severity: "danger",
    title: "品牌对外提供的官网地址打不开",
    body: "品牌对外提供的官网地址是 https://hanhoo.com，但该裸域没有配置解析记录，任何访问者（含各 AI 平台）按此地址进入都会直接失败；目前仅 www.hanhoo.com 一个入口可达。此外，http 与 https 双入口并存——http 访问不跳转至 https，同一个网站同时开着多个入口却没有标明正式入口。",
    impact: "对外宣传、物料与沟通中使用的官网地址实际不可用，官网的流量与信用在入口处就开始流失。",
  },
  {
    dimension: 1,
    severity: "danger",
    title: "没有站点地图，也没有一处结构化数据标记",
    body: "sitemap.xml 与 llms.txt 均不存在（访问返回 404）；首页、产品分类、产品详情、品牌等所有页型源码中 JSON-LD 结构化数据计数为零，品牌、产品、系列之间没有任何机器可读的声明与关联。",
    impact: "AI 没有页面清单可用，即使读到页面也无法快速确认「这是韩后官网、这是什么产品」，理解成本全部交给 AI 猜测。",
  },
  {
    dimension: 1,
    severity: "warn",
    title: "首页与品牌页正文以图片承载，AI 基本读不到内容",
    body: "官网首页可见文字仅三百余字，几乎只有导航与页脚——品牌主视觉、品牌故事、产品亮点全部做在图片与已停用的 Flash 组件里（该组件已停止服务多年，内容对现代访问者同样不可见）；关于我们、明星产品、天然社区等核心页面情况相同。目前只有产品详情页的正文是 AI 可直接读取的文字。",
    impact: "品牌故事与核心卖点存在于官网，却对 AI 隐形，AI 拿不到官网最有价值的素材。",
  },
  {
    dimension: 1,
    severity: "ok",
    title: "访问准入宽松、错误页面处理规范",
    body: "robots.txt 未拦截任何访问者（含各 AI 平台爬虫）；不存在的地址正确返回 404 状态。",
    impact: "官网大门对 AI 是敞开的，后续改造没有准入层面的历史包袱。",
  },
  {
    dimension: 2,
    severity: "danger",
    title: "全站所有页面共用同一个标题，无页面主标题、无规范地址声明",
    body: "抽查首页、产品分类、产品详情、品牌、社区等 15 个页面：页面标题无一例外都是「韩后Hanhoo官方网站|韩后官网」，AI 无法从标题区分产品页与品牌页；全站没有 H1/H2 层级标签；所有页面都没有 canonical 规范地址声明（且 http/https、带不带 www 多个入口并存）；图片替代文本缺失过半（产品分类页 16 张图仅 4 张有）。",
    impact: "AI 拿到了页面也分不清哪页讲什么、哪个是正式版本，官网给 AI 的「页面身份证」几乎全员相同。",
  },
  {
    dimension: 2,
    severity: "warn",
    title: "网址挂在建站平台的四层编号路径下，无意义且层级过深",
    body: "全部页面实际位于 /c10059/pc/home/ 路径之下（c10059 为建站平台的客户编号，无语义），页面名携带 16 位时间戳式编号（如 product-info-14822066530011810.aspx），整体达到四层深度；产品详情页的完整网址对人与 AI 都不可读。",
    impact: "网址本身不提供任何主题线索，页面重要度信号被稀释，AI 对页面层级与含义的判断只能另找线索。",
  },
  {
    dimension: 2,
    severity: "warn",
    title: "品牌文化六页近似重复，全站无面包屑",
    body: "「天然社区」六个页面结构完全雷同、可见文本同为三百余字、主题边界模糊且共用同一标题；全站无面包屑导航，产品详情页到分类页、系列页的层级关系只能靠顶部导航反推。",
    impact: "近似页面让 AI 难以确定哪个页面能代表一个主题，层级关系不明进一步增加理解成本。",
  },
  {
    dimension: 2,
    severity: "ok",
    title: "产品页体系完整，导航为真实可访问的文字链接",
    body: "8 个产品类目页与 6 个系列页分类清晰，产品详情页一产品一页，详情页内设有「建议配合使用产品」的关联推荐（3–4 个/页）；主导航全部为不依赖脚本的真实链接，AI 可以顺着链接走遍全站。",
    impact: "官网的「骨架」是完整可走的，后续优化是在现成产品体系上补内容与标记，不需要从零建站。",
  },
  {
    dimension: 3,
    severity: "danger",
    title: "护肤决策问题官网零承接：怎么选、怎么比、适合谁，官网都没有答案",
    body: "围绕消费者真实决策链核查：不同肤质怎么选、系列与单品怎么比、价格与容量是多少、成分安不安全、适合什么人群——五类护肤决策问题，官网无一有专门内容承接；产品页只有卖点文案、规格与使用方法，没有成分答疑、没有肤质适配说明、没有选购对比。",
    impact: "消费者在 AI 上问的正是这些问题，官网没有可回答的内容，AI 只能引用别人的信息——这是内容层面对零引用的直接解释。",
  },
  {
    dimension: 3,
    severity: "danger",
    title: "全站无日期、无署名，也没有内容栏目",
    body: "全站页面源码中检索不到任何发布或更新日期，没有任何作者或责任部门署名；官网没有内容栏目，自然也不存在持续更新的机制。",
    impact: "AI 无法判断官网内容的新鲜度与权威归属，官网上没有任何内容能被认定为「近期可靠来源」。",
  },
  {
    dimension: 3,
    severity: "danger",
    title: "官网无深度内容资产",
    body: "官网没有白皮书、研究报告、成分科普专题等任何深度内容页。",
    impact: "AI 回答「茶成分护肤有什么依据」这类深度问题时，官网没有任何可承接的素材。",
  },
  {
    dimension: 3,
    severity: "ok",
    title: "茶系成分叙事为原创内容，产品页有可读结构",
    body: "「研茶」品牌叙事与产品成分描述（白茶、雪绒花精粹、Te-cell 技术、茶 A 肽系列等）为原创自有内容，非转载通稿；产品详情页具备「产品介绍/使用方法/规格」的三段式结构，可抽取出「韩后茶蕊嫩白液是什么」类短答案。",
    impact: "官网不是完全没有内容底子——围绕茶成分这条差异化主线，有真实可用的原创素材，缺的只是决策形态与规模。",
  },
  {
    dimension: 4,
    severity: "danger",
    title: "九次提问官网零引用：正文与来源列表均无官网",
    body: "2026-09-01 实测：决策词「护肤品哪个牌子好？推荐几个品牌」、场景词「网上买护肤品哪个平台靠谱？」、对比词「韩后和百雀羚哪个好？」，在 DeepSeek、豆包、通义千问各问一次，共九次。九次回答的正文均未给出官网地址；来源核查——DeepSeek 已阅读网页 12/11/12 个、豆包参考 17/18/23 篇资料、通义千问默认模式正文核验——均不含 hanhoo.com 任何页面。",
    impact: "消费者在 AI 平台做决策的第一入口，官网完全缺席——品牌被谈论，但话语权交给别人。",
  },
  {
    dimension: 4,
    severity: "danger",
    title: "对比词提问下，同行业品牌官网已被引用",
    body: "「韩后和百雀羚哪个好？」的实测中，豆包来源列表包含韩后百科词条，以及同行业品牌的官网。AI 并非不引用护肤品牌官网——它引用的是别人的官网。",
    impact: "可见性竞争已经在官网层面展开，韩后缺席的每一格都在被同行占据。",
  },
];

const HANHOO_VERDICT: VerdictJson = {
  tech: "品牌对外提供的官网地址（hanhoo.com）无法访问，实际只有 www.hanhoo.com 一个入口，且 http 与 https 双入口并存未归一；站点地图与 llms.txt 均未提供；全站无一处结构化数据标记。",
  pages: "产品分类与产品详情页体系完整，但全站所有页面共用同一个标题、无页面主标题（H1）、无规范地址声明，网址挂在建站平台四层深的编号路径之下；除产品详情页外，首页、品牌页等核心内容以图片承载，AI 读不到。",
  content: "官网没有内容板块与问答页，产品页只有卖点文案，「怎么选、怎么比、适合谁」等护肤决策问题官网没有答案；全站无日期、无署名。",
  visibility: "决策词、场景词、对比词在豆包、DeepSeek、通义千问九次提问中，官网均未出现在回答正文或来源列表；对比词提问中，同行业品牌官网已被引用。",
  core: "韩后官网是一座以图片为主要载体的品牌展示站——给人看有设计感，给 AI 读的内容极少；三平台九次提问官网零引用。官网有一套完整的产品展示体系作底子，但对 AI 而言几乎没有可引用的素材——先把入口与页面标记理顺，再围绕护肤决策建设内容板块，可见性才有承接的基础。",
};

const HANHOO_DIRECTIONS: DirectionCard[] = [
  {
    step: 1,
    title: "固本 · 把官网入口与页面身份理顺",
    items: [
      "打通唯一、稳定的官网正式入口",
      "让 AI 平台能获取全站页面清单与官方指引",
      "核心页面向 AI 表明品牌与产品身份",
    ],
  },
  {
    step: 2,
    title: "立信 · 让官网说得清「韩后是谁、每个页面讲什么」",
    items: [
      "每页有独立明确的主题与身份标识",
      "品牌故事与核心卖点转为可读文字，不再只存于图片",
      "产品页补全成分、功效、适用人群等关键信息",
    ],
  },
  {
    step: 3,
    title: "扩声 · 围绕护肤决策建设内容板块",
    items: [
      "围绕「怎么选、怎么比、成分答疑」建问答式内容",
      "不同肤质、不同年龄的产品搭配建议，结论先行",
      "茶成分专题提供可读的文字内容，补充日期与署名",
    ],
  },
  {
    step: 4,
    title: "占位 · 建立三平台引用监测与持续优化",
    items: [
      "持续跟踪三平台官网引用表现",
      "对零引用场景定向补充内容",
      "形成「实测—补强—复测」的持续优化闭环",
    ],
  },
];

// ---------------------------------------------------------------- 臻选保险

const INSURE_WORDS: { text: string; category: "brand" | "generic" | "scenario" }[] = [
  // 品牌类 5
  { text: "臻选保险", category: "brand" },
  { text: "臻选保险官网", category: "brand" },
  { text: "臻选重疾险怎么样", category: "brand" },
  { text: "臻选百万医疗险", category: "brand" },
  { text: "臻选保险理赔靠谱吗", category: "brand" },
  // 通用类 5
  { text: "重疾险怎么买", category: "generic" },
  { text: "百万医疗险哪个好", category: "generic" },
  { text: "保险理赔流程", category: "generic" },
  { text: "成人保险配置方案", category: "generic" },
  { text: "重疾险保费多少钱一年", category: "generic" },
  // 业务场景类 5
  { text: "网上买保险哪个平台靠谱", category: "scenario" },
  { text: "生病后保险怎么理赔", category: "scenario" },
  { text: "家庭保险怎么配置", category: "scenario" },
  { text: "给孩子买保险怎么选", category: "scenario" },
  { text: "退保损失怎么算", category: "scenario" },
];

const INSURE_EXTENDED: { text: string; category: "generic" | "scenario" }[] = [
  { text: "带病人群投保攻略", category: "scenario" },
  { text: "惠民保值得买吗", category: "generic" },
];

const CITED_PAGES: { url: string; title: string }[] = [
  { url: "https://www.demo-insure.example.cn/products/critical-illness?utm_source=ai", title: "臻选重疾险 · 产品详情" },
  { url: "https://demo-insure.example.cn/products/medical-million", title: "臻选百万医疗险 · 产品详情" },
  { url: "https://demo-insure.example.cn/claims/guide", title: "理赔服务指南" },
  { url: "https://demo-insure.example.cn/claims/materials-checklist", title: "理赔材料清单" },
  { url: "https://demo-insure.example.cn/faq", title: "常见问题 FAQ" },
  { url: "https://demo-insure.example.cn/blog/how-to-choose-critical-illness", title: "重疾险怎么选：选购指南" },
  { url: "https://demo-insure.example.cn/blog/family-insurance-plan", title: "家庭保险配置方案" },
  { url: "https://demo-insure.example.cn/products/term-life", title: "臻选定期寿险 · 产品详情" },
  { url: "https://demo-insure.example.cn/about", title: "关于臻选保险" },
  { url: "https://demo-insure.example.cn/products/annuity", title: "臻选年金险 · 产品详情" },
];

const PLATFORMS_ARR = ["deepseek", "doubao", "qwen"] as const;

// ---------------------------------------------------------------- main

async function seed() {
  const db = getDb();
  console.log("Seeding database...");
  await clearBusinessTables();

  // ============ 项目一：韩后 Hanhoo ============
  // 固定演示项目 ID=1：保证种子可重复执行（幂等），竞对/报告等演示链路依赖稳定 projectId
  const [{ id: hanhooId }] = await db
    .insert(projects)
    .values({
      id: 1,
      name: "韩后 Hanhoo",
      company: "广州中妆美业化妆品有限公司",
      domain: "hanhoo.com",
      industry: "化妆品（护肤品）",
      serviceTier: "standard",
      stage: "A",
      startDate: "2026-09-01",
      owner: "清蓝官网GEO项目组",
      note: "官网 GEO 诊断演示项目（报告日期 2026 年 9 月）",
    })
    .$returningId();
  track("projects", 1);

  const [{ id: hanhooDiagId }] = await db
    .insert(diagnostics)
    .values({
      projectId: hanhooId,
      diagnoseDate: "2026-09-01",
      status: "completed",
      techScore: "20",
      archScore: "50",
      contentScore: "20",
      visScore: "0",
      compositeScore: "21.0",
      grade: "D",
      verdictJson: HANHOO_VERDICT,
      directionsJson: HANHOO_DIRECTIONS,
    })
    .$returningId();
  track("diagnostics", 1);

  await db.insert(indicatorScores).values(
    INDICATORS.map((def) => ({
      diagnosticId: hanhooDiagId,
      indicatorKey: def.key,
      dimension: def.dimension,
      score: HANHOO_SCORES[def.key] ?? 0,
    })),
  );
  track("indicator_scores", 18);

  await db.insert(findings).values(
    HANHOO_FINDINGS.map((f, i) => ({
      ...f,
      diagnosticId: hanhooDiagId,
      sortOrder: i,
    })),
  );
  track("findings", HANHOO_FINDINGS.length);

  // 韩后速览九格实测词池（3 词）
  const [{ id: hanhooPoolId }] = await db
    .insert(keywordPools)
    .values({
      projectId: hanhooId,
      name: "韩后 · 速览九格实测词（3 词）",
      status: "locked",
      lockedAt: new Date("2026-09-01T00:00:00Z"),
      note: "诊断期速览实测词：决策词/场景词/对比词各 1",
    })
    .$returningId();
  track("keyword_pools", 1);
  await db
    .insert(keywords)
    .values([
      { poolId: hanhooPoolId, text: "护肤品哪个牌子好？推荐几个品牌", category: "generic" as const },
      { poolId: hanhooPoolId, text: "网上买护肤品哪个平台靠谱？", category: "scenario" as const },
      { poolId: hanhooPoolId, text: "韩后和百雀羚哪个好？", category: "brand" as const },
    ]);
  track("keywords", 3);
  await db.insert(poolChangeLogs).values([
    { poolId: hanhooPoolId, action: "create" as const, detail: "创建速览实测词池（决策/场景/对比各 1 词）", operator: "清蓝官网GEO项目组" },
    { poolId: hanhooPoolId, action: "lock" as const, detail: "诊断实测词锁定", operator: "清蓝官网GEO项目组" },
  ]);
  track("pool_change_logs", 2);

  // 九格实测：2026-09-01 三平台 × 三类词 全 L0
  const hanhooKw = (await db.select().from(keywords).orderBy(keywords.id)).filter(
    (k) => k.poolId === hanhooPoolId,
  );
  const hanhooMeasurements = hanhooKw.flatMap((kw) =>
    PLATFORMS_ARR.map((platform) => ({
      projectId: hanhooId,
      poolId: hanhooPoolId,
      keywordId: kw.id,
      measureDate: "2026-09-01",
      platform,
      level: "L0" as const,
      snapshot: "九次提问官网零引用：正文与来源列表均无 hanhoo.com 页面",
      isCheckpoint: false,
    })),
  );
  await db.insert(measurements).values(hanhooMeasurements);
  track("measurements", hanhooMeasurements.length);

  // ============ 项目二：臻选保险集团（演示） ============
  const insureStart = isoDay(-180);
  // 固定演示项目 ID=2：竞对种子幂等判断与验收均以 projectId=2 为准
  const [{ id: insureId }] = await db
    .insert(projects)
    .values({
      id: 2,
      name: "臻选保险集团（演示）",
      company: "臻选保险集团股份有限公司",
      domain: "demo-insure.example.cn",
      industry: "保险",
      serviceTier: "standard",
      stage: "D",
      startDate: insureStart,
      owner: "陈云",
      note: "数据洞察阶段演示项目：15 词锁定词池 + 42 天监测数据",
    })
    .$returningId();
  track("projects", 1);

  const [{ id: insurePoolId }] = await db
    .insert(keywordPools)
    .values({
      projectId: insureId,
      name: "臻选保险固定词池 · 15 词",
      version: 1,
      status: "locked",
      lockedAt: new Date(`${isoDay(-42)}T02:00:00Z`),
      note: "品牌/通用/业务场景各 5 词，商定后锁定",
    })
    .$returningId();
  track("keyword_pools", 1);

  await db.insert(keywords).values(
    INSURE_WORDS.map((w) => ({ poolId: insurePoolId, ...w })),
  );
  const insureKw = (await db.select().from(keywords).orderBy(keywords.id)).filter(
    (k) => k.poolId === insurePoolId,
  );
  track("keywords", insureKw.length);

  const insureKwIdByText = new Map(insureKw.map((k) => [k.text, k.id]));

  // 变更日志：创建 → 锁定 → 拓词
  await db.insert(poolChangeLogs).values([
    {
      poolId: insurePoolId,
      action: "create" as const,
      detail: "创建词池「臻选保险固定词池 · 15 词」，品牌 5 / 通用 5 / 场景 5",
      operator: "陈云",
      createdAt: new Date(`${isoDay(-44)}T02:00:00Z`),
    },
    {
      poolId: insurePoolId,
      action: "lock" as const,
      detail: "词池经客户确认锁定，服务周期内变更须审批并记录",
      operator: "张磊",
      createdAt: new Date(`${isoDay(-42)}T02:00:00Z`),
    },
    {
      poolId: insurePoolId,
      action: "extend" as const,
      detail: "新增可拓词「带病人群投保攻略」「惠民保值得买吗」（不计 KPI 分母）",
      operator: "陈云",
      createdAt: new Date(`${isoDay(-14)}T02:00:00Z`),
    },
  ]);
  track("pool_change_logs", 3);

  // 可拓词 2 个
  await db.insert(keywords).values(
    INSURE_EXTENDED.map((w) => ({ poolId: insurePoolId, ...w, isExtended: true })),
  );
  const extRows = (await db.select().from(keywords).orderBy(keywords.id)).filter(
    (k) => k.poolId === insurePoolId && k.isExtended,
  );
  track("keywords", extRows.length);

  // 42 天 measurements：每词每平台每日 1 条，L2 率 26% → 54% 线性爬升，L1 约 20%
  const rand = mulberry32(20260901);
  const rows: (typeof measurements.$inferInsert)[] = [];
  const DAYS = 42;
  const coreWords = INSURE_WORDS.map((w) => insureKwIdByText.get(w.text)!);
  for (let day = 0; day < DAYS; day++) {
    const date = isoDay(day - (DAYS - 1));
    const p2 = 0.26 + (0.54 - 0.26) * (day / (DAYS - 1));
    const isCheckpointDay = day === 30; // m6 考核节点在第 30 天
    const wordIds =
      day >= DAYS - 14
        ? [...coreWords, ...extRows.map((k) => k.id)]
        : coreWords;
    for (const keywordId of wordIds) {
      for (const platform of PLATFORMS_ARR) {
        const r = rand();
        let level: "L2" | "L1" | "L0";
        let citedUrl: string | null = null;
        let citedUrlNorm: string | null = null;
        let citedPageTitle: string | null = null;
        if (r < p2) {
          level = "L2";
          const page = CITED_PAGES[Math.floor(rand() * CITED_PAGES.length)]!;
          citedUrl = page.url;
          citedUrlNorm = normalizeUrl(page.url);
          citedPageTitle = page.title;
        } else if (r < p2 + 0.2) {
          level = "L1";
        } else {
          level = "L0";
        }
        rows.push({
          projectId: insureId,
          poolId: insurePoolId,
          keywordId,
          measureDate: date,
          platform,
          level,
          citedUrl,
          citedUrlNorm,
          citedPageTitle,
          isCheckpoint: isCheckpointDay,
          checkpointTag: isCheckpointDay ? ("m6" as const) : null,
        });
      }
    }
  }
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    await db.insert(measurements).values(rows.slice(i, i + chunk));
  }
  track("measurements", rows.length);
  const l2Count = rows.filter((r) => r.level === "L2").length;
  console.log(
    `臻选保险：${rows.length} 条实测，L2=${l2Count}（${((l2Count / rows.length) * 100).toFixed(1)}%），m6 考核节点=第 30 天`,
  );

  // 报价单（standard 档，全目录）
  const quoteItems = catalogItemsForTier("standard");
  await db.insert(quotes).values({
    projectId: insureId,
    title: "臻选保险官网 GEO 优化服务报价单（中级档）",
    tier: "standard",
    itemsJson: quoteItems,
    totalPrice: String(computeQuoteTotal(quoteItems)),
    status: "issued",
  });
  track("quotes", 1);

  // 排期表
  const { phasesJson, milestonesJson } = generateSchedule(insureStart, "standard");
  await db.insert(schedules).values({
    projectId: insureId,
    startDate: insureStart,
    phasesJson,
    milestonesJson,
  });
  track("schedules", 1);

  // ============ 竞对监测对标种子（增量 · 幂等） ============
  // 仅演示项目「臻选保险集团（演示）」(projectId=2)；该项目已有竞对记录则整段跳过。
  // 竞对数据仅作对比分析，不影响上方我方 measurements/KPI 口径。
  const existingComps = await db
    .select({ id: competitors.id })
    .from(competitors)
    .where(eq(competitors.projectId, insureId));
  if (existingComps.length > 0) {
    console.log("竞对种子：该项目已有竞对数据，整段跳过（幂等）");
  } else {
    // 竞对两个：恒安（强势）+ 泰和（弱势）
    const [{ id: henganId }] = await db
      .insert(competitors)
      .values({
        projectId: insureId,
        name: "恒安保险（演示）",
        domain: "hengan-demo.example.cn",
      })
      .$returningId();
    const [{ id: taiheId }] = await db
      .insert(competitors)
      .values({
        projectId: insureId,
        name: "泰和人寿（演示）",
        domain: "taihe-demo.example.cn",
      })
      .$returningId();
    track("competitors", 2);

    // 我方各词 L2 被引 URL 的「路径池」：竞对 L2 时换用竞对域名，营造真实感
    const stripHost = (u: string) => u.replace(/^[^/]+/, "");
    const ownL2Rows = await db
      .select({ keywordId: measurements.keywordId, url: measurements.citedUrlNorm })
      .from(measurements)
      .where(and(eq(measurements.projectId, insureId), eq(measurements.level, "L2")));
    const pathPoolByKw = new Map<number, string[]>();
    for (const r of ownL2Rows) {
      if (!r.url) continue;
      const arr = pathPoolByKw.get(r.keywordId) ?? [];
      const p = stripHost(r.url);
      if (!arr.includes(p)) arr.push(p);
      pathPoolByKw.set(r.keywordId, arr);
    }
    const fallbackPaths = CITED_PAGES.map((p) => stripHost(normalizeUrl(p.url)));

    // 恒安占优词（4 个）：这些词上恒安 L2 概率高于我方，制造「竞对占优词」
    const HENGAN_BOOST_TEXTS = new Set([
      "重疾险怎么买",
      "百万医疗险哪个好",
      "网上买保险哪个平台靠谱",
      "家庭保险怎么配置",
    ]);
    const boostKwIds = new Set(
      insureKw.filter((k) => HENGAN_BOOST_TEXTS.has(k.text)).map((k) => k.id),
    );

    // 项目 2 已有的全部实测格（词 × 平台 × 日）
    const cells = await db
      .select({
        keywordId: measurements.keywordId,
        platform: measurements.platform,
        date: measurements.measureDate,
      })
      .from(measurements)
      .where(eq(measurements.projectId, insureId));

    // 简单字符串哈希（FNV-1a）：keywordId+platform+date → 确定性伪随机种子，重复执行结果一致
    const hashSeed = (s: string): number => {
      let h = 2166136261 >>> 0;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    };

    // 概率设计（目标 SOV ≈ 我方 52 / 恒安 36 / 泰和 12，我方整体 L2 率约 40%）：
    // 恒安普通词 L2 18% + 占优词 55%（加权约 28%）；泰和 L2 约 9%
    const hitRows: (typeof competitorHits.$inferInsert)[] = [];
    for (const cell of cells) {
      const rng = mulberry32(
        hashSeed(`${cell.keywordId}|${cell.platform}|${cell.date}`),
      );
      const boosted = boostKwIds.has(cell.keywordId);
      const compDefs = [
        {
          id: henganId,
          domain: "hengan-demo.example.cn",
          pL2: boosted ? 0.55 : 0.18,
          pL1: 0.14,
        },
        { id: taiheId, domain: "taihe-demo.example.cn", pL2: 0.09, pL1: 0.09 },
      ];
      for (const comp of compDefs) {
        const r = rng();
        let level: "L2" | "L1" | "L0";
        let url: string | null = null;
        if (r < comp.pL2) {
          level = "L2";
          const pool = pathPoolByKw.get(cell.keywordId) ?? fallbackPaths;
          url = `${comp.domain}${pool[Math.floor(rng() * pool.length)]!}`;
        } else if (r < comp.pL2 + comp.pL1) {
          level = "L1";
        } else {
          level = "L0";
        }
        hitRows.push({
          projectId: insureId,
          keywordId: cell.keywordId,
          competitorId: comp.id,
          platform: cell.platform,
          date: cell.date,
          level,
          url,
        });
      }
    }
    for (let i = 0; i < hitRows.length; i += 500) {
      await db.insert(competitorHits).values(hitRows.slice(i, i + 500));
    }
    track("competitor_hits", hitRows.length);
    const half = hitRows.length / 2;
    const hL2 = hitRows.filter((r) => r.competitorId === henganId && r.level === "L2").length;
    const tL2 = hitRows.filter((r) => r.competitorId === taiheId && r.level === "L2").length;
    console.log(
      `竞对种子：${hitRows.length} 条命中，恒安 L2=${hL2}（${((hL2 / half) * 100).toFixed(1)}%），泰和 L2=${tL2}（${((tL2 / half) * 100).toFixed(1)}%）`,
    );
  }

  // ============ 采集中心配置种子（增量 · 幂等） ============
  // 仅演示项目「臻选保险集团（演示）」(projectId=2)：daily / 三平台 / 执行人陈云 / 同屏录竞对。
  const existingCfg = await db
    .select({ projectId: collectionConfigs.projectId })
    .from(collectionConfigs)
    .where(eq(collectionConfigs.projectId, insureId));
  if (existingCfg.length > 0) {
    console.log("采集配置种子：该项目已有采集配置，跳过（幂等）");
  } else {
    await db.insert(collectionConfigs).values({
      projectId: insureId,
      frequency: "daily",
      customDays: null,
      platforms: ["deepseek", "doubao", "qwen"],
      assignee: "陈云",
      competitorSync: true,
    });
    track("collection_configs", 1);
    console.log("采集配置种子：臻选保险 daily / 三平台 / 陈云 / competitorSync=true");
  }


  // ============ 三角色演示账号（AUTH_API_v1） ============
  const pwd = hashPassword("demo1234");
  const [{ id: clientId }] = await db
    .insert(users)
    .values({
      email: "client@demo.local",
      name: "韩后客户",
      passwordHash: pwd,
      role: "client",
    })
    .$returningId();
  const [{ id: opId }] = await db
    .insert(users)
    .values({
      email: "chenyun@demo.local",
      name: "陈云",
      passwordHash: pwd,
      role: "operator",
    })
    .$returningId();
  const [{ id: leadId }] = await db
    .insert(users)
    .values({
      email: "zhanglei@demo.local",
      name: "张磊",
      passwordHash: pwd,
      role: "lead",
    })
    .$returningId();
  await db.insert(userProjects).values([
    { userId: clientId, projectId: hanhooId },
    { userId: opId, projectId: hanhooId },
    { userId: opId, projectId: insureId },
  ]);
  track("users", 3);
  track("user_projects", 3);
  console.log(
    "演示账号：client@demo.local / chenyun@demo.local / zhanglei@demo.local ，密码均为 demo1234",
  );

  console.log("\n插入行数摘要：");
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k}: ${v}`);
  console.log("Done.");
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
