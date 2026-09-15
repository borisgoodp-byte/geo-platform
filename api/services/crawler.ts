/**
 * 域名抓取器（DESIGN_SPEC §5）
 * Node 20 原生 fetch + cheerio；超时/失败降级，抓取失败不阻塞诊断流程。
 */

import * as cheerio from "cheerio";
import type { CrawlPageSummary, CrawlSummary } from "@contracts/types";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_SAMPLE_PAGES = 15;
const AI_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Bytespider",
  "PerplexityBot",
  "CCBot",
  "Google-Extended",
  "Amazonbot",
  "meta-externalagent",
];

export interface AutoSuggestion {
  indicatorKey: string;
  autoScore: number | null;
  autoEvidence: string;
}

export interface CrawlOutcome {
  status: "ok" | "partial" | "failed";
  targetUrl: string;
  summary: CrawlSummary;
  suggestions: AutoSuggestion[];
}

interface FetchResult {
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  redirectChain: string[];
  body: string;
  error?: string;
}

function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

/** 跟随重定向（手动，最多 5 跳），记录跳转链 */
async function fetchPage(url: string, manualRedirect = true): Promise<FetchResult> {
  const chain: string[] = [];
  let current = url;
  try {
    for (let hop = 0; hop <= 5; hop++) {
      const res = await fetch(current, {
        signal: withTimeout(FETCH_TIMEOUT_MS),
        redirect: manualRedirect ? "manual" : "follow",
        headers: {
          "user-agent":
            "Mozilla/5.0 (compatible; GeoDiagBot/1.0; +https://pureblue.ai/bot)",
          accept: "text/html,application/xhtml+xml,*/*",
        },
      });
      if (
        manualRedirect &&
        [301, 302, 303, 307, 308].includes(res.status) &&
        res.headers.get("location")
      ) {
        const next = new URL(res.headers.get("location")!, current).toString();
        chain.push(`${res.status} → ${next}`);
        current = next;
        continue;
      }
      const body = await res.text();
      return { ok: res.ok, status: res.status, finalUrl: current, redirectChain: chain, body };
    }
    return { ok: false, status: null, finalUrl: current, redirectChain: chain, body: "", error: "重定向次数过多" };
  } catch (err) {
    return {
      ok: false,
      status: null,
      finalUrl: null,
      redirectChain: chain,
      body: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 域名归一：去协议、去路径、去 www. 前缀、小写 */
export function normalizeDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (d.startsWith("www.")) d = d.slice(4);
  return d;
}

/** robots.txt：检出明确拦截（Disallow: /）的 AI 爬虫名单 */
function analyzeRobots(body: string): { blocksAiBots: string[]; allowsAll: boolean } {
  const blocks: string[] = [];
  const lines = body.split(/\r?\n/);
  let agents: string[] = [];
  const flush = (groupAgents: string[], groupRules: string[]) => {
    const disallowAll = groupRules.some(
      (r) => /^disallow:\s*\/\s*$/i.test(r),
    );
    if (!disallowAll) return;
    for (const a of groupAgents) {
      const hit = AI_BOTS.find((b) => b.toLowerCase() === a.toLowerCase());
      if (hit) blocks.push(hit);
      if (a === "*") blocks.push("*（通配拦截）");
    }
  };
  let rules: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^([a-z-]+):\s*(.*)$/i);
    if (!m) continue;
    const [, field, value] = m;
    if (field.toLowerCase() === "user-agent") {
      if (rules.length) {
        flush(agents, rules);
        rules = [];
      }
      agents.push(value);
    } else {
      rules.push(line);
    }
  }
  flush(agents, rules);
  const blocksAi = blocks.filter((b) => !b.startsWith("*"));
  return {
    blocksAiBots: blocks,
    allowsAll: blocksAi.length === 0 && !blocks.some((b) => b.startsWith("*")),
  };
}

const PAGE_TYPE_PATTERNS: [string, RegExp][] = [
  ["首页", /^\/$/],
  ["产品/服务页", /product|prod|service|series|item|pro-/i],
  ["FAQ页", /faq|question|q&a|问答/i],
  ["案例页", /case|cases|案例|customer/i],
  ["内容/blog页", /blog|news|article|content|资讯|文章|专栏/i],
  ["关于我们", /about|关于/i],
  ["联系方式", /contact|联系/i],
];

function detectPageType(path: string): string {
  for (const [name, re] of PAGE_TYPE_PATTERNS) {
    if (re.test(path)) return name;
  }
  return "其他页";
}

/** URL 深度与语义性 */
function analyzeUrl(url: string): { depth: number; semantic: boolean } {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const semantic = segments.every((s) => {
      if (/^\d+$/.test(s)) return false; // 纯数字段
      if (/\d{10,}/.test(s)) return false; // 时间戳式编号
      if (/\?|&|=/.test(s)) return false; // 参数乱串
      return /^[a-z0-9][a-z0-9-_]*(\.[a-z0-9]+)?$/i.test(s);
    });
    return { depth: segments.length, semantic };
  } catch {
    return { depth: 0, semantic: false };
  }
}

interface ParsedPage extends CrawlPageSummary {
  internalLinks: string[];
  hasDate: boolean;
  hasAuthor: boolean;
  hasQaForm: boolean;
  hasWhitepaper: boolean;
}

function parsePage(url: string, status: number | null, html: string, host: string): ParsedPage {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim();
  const description = ($('meta[name="description"]').attr("content") ?? "").trim();
  const h1Count = $("h1").length;
  const h2Count = $("h2").length;
  const canonical = $('link[rel="canonical"]').attr("href") ?? null;

  const imgs = $("img");
  const withAlt = imgs.filter((_, el) => {
    const alt = $(el).attr("alt");
    return typeof alt === "string" && alt.trim().length > 0;
  }).length;
  const imgAltRatio = imgs.length === 0 ? 1 : withAlt / imgs.length;

  // JSON-LD 块
  const jsonLdTypes = new Set<string>();
  let jsonLdErrors = 0;
  const ids = new Set<string>();
  const idRefs = new Set<string>();
  const collectNode = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(collectNode);
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    const t = obj["@type"];
    if (typeof t === "string") jsonLdTypes.add(t);
    else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && jsonLdTypes.add(x));
    if (typeof obj["@id"] === "string") ids.add(obj["@id"] as string);
    for (const [k, v] of Object.entries(obj)) {
      if (k === "@id") continue;
      if (typeof v === "object" && v !== null) {
        const ref = (v as Record<string, unknown>)["@id"];
        if (typeof ref === "string") idRefs.add(ref);
        collectNode(v);
      }
    }
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      collectNode(JSON.parse($(el).contents().text()));
    } catch {
      jsonLdErrors++;
    }
  });

  // 可见文本字数（去 script/style/noscript）
  const clone = cheerio.load(html);
  clone("script, style, noscript").remove();
  const textLength = clone("body").text().replace(/\s+/g, "").length;

  const hasBreadcrumb =
    $('[class*="breadcrumb" i], [id*="breadcrumb" i], [aria-label*="breadcrumb" i]').length > 0 ||
    jsonLdTypes.has("BreadcrumbList") ||
    /面包屑|当前位置/.test(html.slice(0, 200_000));

  const internalLinks: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    try {
      const abs = new URL(href, url);
      const h = abs.hostname.toLowerCase().replace(/^www\./, "");
      if (h === host.replace(/^www\./, "")) internalLinks.push(abs.toString().split("#")[0]!);
    } catch {
      /* ignore */
    }
  });
  const navLinkCount = $("nav a[href], header a[href], [class*='nav' i] a[href]").length;

  const bodyText = clone("body").text();
  const hasDate = /(20\d{2})[-年/.](0?[1-9]|1[0-2])[-月/.](0?[1-9]|[12]\d|3[01])/.test(bodyText);
  const hasAuthor = /作者|责编|编辑|署名|author|责任编辑/i.test(bodyText);
  const hasQaForm =
    /[?？]\s*<\/|常见(问题|问答)|FAQ/i.test(html) ||
    jsonLdTypes.has("FAQPage") ||
    $("dt, .qa, .faq, [class*='question' i]").length > 0;
  const hasWhitepaper =
    $("a[href$='.pdf' i]").length > 0 ||
    /白皮书|行业报告|研究报告|whitepaper|技术文档/i.test(bodyText);

  const { depth, semantic } = analyzeUrl(url);
  const u = new URL(url);

  return {
    url,
    status,
    pageType: detectPageType(u.pathname === "/" ? "/" : u.pathname),
    title,
    description,
    h1Count,
    h2Count,
    canonical,
    imgAltRatio: Math.round(imgAltRatio * 100) / 100,
    textLength,
    jsonLdTypes: [...jsonLdTypes],
    jsonLdErrors,
    jsonLdIds: ids.size > 0 && idRefs.size > 0 ? Math.min(ids.size, idRefs.size) : 0,
    hasBreadcrumb,
    navLinkCount,
    urlDepth: depth,
    urlSemantic: semantic,
    internalLinks,
    hasDate,
    hasAuthor,
    hasQaForm,
    hasWhitepaper,
  };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** 18 项自动建议分映射（vis_1-3 不在此定档） */
function buildSuggestions(
  entry: FetchResult,
  variants: CrawlSummary["variants"],
  robots: CrawlSummary["robots"],
  sitemap: CrawlSummary["sitemap"],
  llms: CrawlSummary["llms"],
  pages: ParsedPage[],
): AutoSuggestion[] {
  const out: AutoSuggestion[] = [];
  const push = (indicatorKey: string, autoScore: number | null, autoEvidence: string) =>
    out.push({ indicatorKey, autoScore, autoEvidence });

  const reachable = variants.filter((v) => v.ok).length;
  const hasRedirect = variants.some((v) => v.redirectChain.length > 0);
  const entryStatus = entry.status ?? 0;

  // tech_1 准入与抓取健康度
  if (!entry.ok) {
    push("tech_1", 0, `主入口不可达：${entry.error ?? `HTTP ${entryStatus}`}`);
  } else if (robots.blocksAiBots.length > 0) {
    push("tech_1", 0, `robots.txt 明确拦截 AI 爬虫：${robots.blocksAiBots.join("、")}`);
  } else if (reachable <= 1 && hasRedirect) {
    push("tech_1", 10, `仅 ${reachable} 个入口变体可达且存在跳转链，多入口未归一`);
  } else if (reachable <= 2 || hasRedirect) {
    push("tech_1", 15, `入口基本可达，robots 准入宽松，跳转/归一存在少量瑕疵`);
  } else {
    push("tech_1", 20, `入口规范可达，robots.txt 未拦截 AI 爬虫，跳转与错误页行为正常`);
  }

  // tech_2 正文可提取性（样本页可见文本中位数）
  const med = median(pages.map((p) => p.textLength));
  const t2 =
    med < 200 ? 0 : med <= 500 ? 10 : med <= 1200 ? 15 : 20;
  push(
    "tech_2",
    pages.length === 0 ? null : t2,
    `抽样 ${pages.length} 页，可见纯文本字数中位数 ${Math.round(med)} 字（阈值：<200→0 / 200–500→10 / 500–1200→15 / >1200→20）`,
  );

  // tech_3 发现协议
  if (!sitemap.found && !llms.found) {
    push("tech_3", 0, "sitemap.xml 与 llms.txt 均不存在（404）");
  } else if (sitemap.found && llms.found) {
    push("tech_3", 20, `sitemap.xml 可访问（${sitemap.urlCount} 条 URL），llms.txt 已提供`);
  } else if (sitemap.found) {
    push("tech_3", 15, `sitemap.xml 存在且可解析（${sitemap.urlCount} 条 URL），缺少 llms.txt`);
  } else {
    push("tech_3", 10, "仅 llms.txt 存在，缺少 sitemap.xml");
  }

  // tech_4 结构化数据覆盖度
  const allTypes = new Set(pages.flatMap((p) => p.jsonLdTypes));
  const hasOrg = allTypes.has("Organization");
  const hasProductOrService = allTypes.has("Product") || allTypes.has("Service");
  const t4 =
    allTypes.size === 0
      ? 0
      : allTypes.size === 1
        ? 10
        : allTypes.size >= 4 && hasOrg && hasProductOrService
          ? 20
          : 15;
  push(
    "tech_4",
    t4,
    allTypes.size === 0
      ? "抽样页面 JSON-LD 结构化数据计数为零"
      : `检出 JSON-LD @type 共 ${allTypes.size} 类：${[...allTypes].join("、")}`,
  );

  // tech_5 结构化数据规范度与实体关联
  const totalBlocks = pages.reduce((a, p) => a + p.jsonLdTypes.length, 0);
  const totalErrors = pages.reduce((a, p) => a + p.jsonLdErrors, 0);
  const totalLinks = pages.reduce((a, p) => a + p.jsonLdIds, 0);
  if (totalBlocks === 0 && totalErrors === 0) {
    push("tech_5", 0, "全站无 JSON-LD 结构化数据标记");
  } else if (totalErrors > 0) {
    push("tech_5", 10, `JSON-LD 解析错误 ${totalErrors} 处，语法不合规`);
  } else if (totalLinks > 0) {
    push("tech_5", 20, `JSON-LD 语法合规，检出 ${totalLinks} 处 @id 互链`);
  } else {
    push("tech_5", 15, "JSON-LD 语法合规但实体间无 @id 互链");
  }

  // arch_1 核心页面体系完备度
  const typeSet = new Set(pages.map((p) => p.pageType).filter((t) => t !== "其他页"));
  const t1 = typeSet.size >= 6 ? 20 : typeSet.size >= 4 ? 15 : typeSet.size >= 2 ? 10 : 0;
  push(
    "arch_1",
    t1,
    `识别页型 ${typeSet.size}/7 类：${[...typeSet].join("、") || "未识别"}`,
  );

  // arch_2 URL 语义与目录层级
  const avgDepth = pages.length
    ? pages.reduce((a, p) => a + p.urlDepth, 0) / pages.length
    : 0;
  const semanticRatio = pages.length
    ? pages.filter((p) => p.urlSemantic).length / pages.length
    : 0;
  const t22 =
    pages.length === 0
      ? null
      : semanticRatio < 0.3
        ? 0
        : avgDepth >= 4 || semanticRatio < 0.7
          ? 10
          : semanticRatio >= 0.95
            ? 20
            : 15;
  push(
    "arch_2",
    t22,
    `URL 平均深度 ${avgDepth.toFixed(1)} 层，语义化占比 ${Math.round(semanticRatio * 100)}%`,
  );

  // arch_3 内链与面包屑
  const navOk = pages.some((p) => p.navLinkCount >= 3);
  const breadcrumbRatio = pages.length
    ? pages.filter((p) => p.hasBreadcrumb).length / pages.length
    : 0;
  const t3 =
    pages.length === 0
      ? null
      : !navOk
        ? 0
        : breadcrumbRatio >= 0.5
          ? 20
          : breadcrumbRatio > 0
            ? 15
            : 10;
  push(
    "arch_3",
    t3,
    `导航可爬性：${navOk ? "导航为真实链接" : "未发现可爬导航链接"}；面包屑覆盖 ${Math.round(breadcrumbRatio * 100)}%`,
  );

  // arch_4 页面语义标签规范（title 唯一率 / H1 存在率 / canonical 覆盖 / alt 完整率综合）
  if (pages.length === 0) {
    push("arch_4", null, "无抽样页面");
  } else {
    const titles = pages.map((p) => p.title);
    const uniqTitle = new Set(titles).size / pages.length;
    const h1Ratio = pages.filter((p) => p.h1Count >= 1).length / pages.length;
    const canonicalRatio = pages.filter((p) => p.canonical).length / pages.length;
    const altAvg = pages.reduce((a, p) => a + p.imgAltRatio, 0) / pages.length;
    const scoreSum = uniqTitle + h1Ratio + canonicalRatio + altAvg; // 0-4
    const t4s = scoreSum >= 3.5 ? 20 : scoreSum >= 2.5 ? 15 : scoreSum >= 1.5 ? 10 : 0;
    push(
      "arch_4",
      t4s,
      `title 唯一率 ${Math.round(uniqTitle * 100)}%、H1 存在率 ${Math.round(h1Ratio * 100)}%、canonical 覆盖 ${Math.round(canonicalRatio * 100)}%、图片 alt 完整率 ${Math.round(altAvg * 100)}%`,
    );

    // arch_5 页面主题唯一性与重复控制
    const dupRatio = 1 - uniqTitle;
    const t5 = dupRatio > 0.5 ? 0 : dupRatio >= 0.3 ? 10 : dupRatio > 0 ? 15 : 20;
    push(
      "arch_5",
      t5,
      `重复 title 比例 ${Math.round(dupRatio * 100)}%（${new Set(titles).size}/${pages.length} 唯一）`,
    );
  }

  // cont_1–cont_5：机器仅给证据，保守定档（有检出 10、无检出 0）
  const dateHit = pages.filter((p) => p.hasDate).length;
  const authorHit = pages.filter((p) => p.hasAuthor).length;
  const qaHit = pages.filter((p) => p.hasQaForm).length;
  const wpHit = pages.filter((p) => p.hasWhitepaper).length;
  const lengths = pages.map((p) => p.textLength);
  push(
    "cont_1",
    qaHit > 0 ? 10 : 0,
    `问答/决策形态检出 ${qaHit}/${pages.length} 页（决策问题覆盖度需人工复核）`,
  );
  push(
    "cont_2",
    dateHit > 0 || authorHit > 0 ? 10 : 0,
    `日期检出 ${dateHit}/${pages.length} 页、署名关键词检出 ${authorHit}/${pages.length} 页`,
  );
  push("cont_3", null, `内容原创性需人工复核；内容页字数分布：${lengths.join("/") || "无样本"}`);
  push(
    "cont_4",
    qaHit > 0 ? 10 : 0,
    `问答式/清单式结构检出 ${qaHit}/${pages.length} 页（可引用形态需人工复核）`,
  );
  push(
    "cont_5",
    wpHit > 0 ? 10 : 0,
    `白皮书/PDF/报告链接检出 ${wpHit}/${pages.length} 页`,
  );

  return out;
}

/** 抓取入口：域名 → 抓取摘要 + 自动建议分 */
export async function crawlDomain(rawDomain: string): Promise<CrawlOutcome> {
  const domain = normalizeDomain(rawDomain);
  const targetUrl = `https://${domain}`;

  // 1. 探测 4 个入口变体
  const variantUrls = [
    `https://${domain}`,
    `https://www.${domain}`,
    `http://${domain}`,
    `http://www.${domain}`,
  ];
  const variantResults = await Promise.all(
    variantUrls.map(async (u) => {
      const r = await fetchPage(u);
      return {
        url: u,
        ok: r.ok,
        status: r.status,
        finalUrl: r.finalUrl,
        redirectChain: r.redirectChain,
        error: r.error,
        body: r.body,
      };
    }),
  );
  const variants: CrawlSummary["variants"] = variantResults.map(({ body: _b, ...rest }) => rest);

  // 2. 取可达入口（优先 https）
  const entryResult =
    variantResults.find((v) => v.ok && v.url.startsWith("https://")) ??
    variantResults.find((v) => v.ok);

  if (!entryResult) {
    const summary: CrawlSummary = {
      domain,
      entry: null,
      variants,
      robots: { found: false, blocksAiBots: [], allowsAll: false },
      sitemap: { found: false, urlCount: 0 },
      llms: { found: false },
      pages: [],
      error: "四个入口变体（https/http × 裸域/www）均不可达",
    };
    return {
      status: "failed",
      targetUrl,
      summary,
      suggestions: [
        {
          indicatorKey: "tech_1",
          autoScore: 0,
          autoEvidence: "四个入口变体均不可达，主入口失败",
        },
      ],
    };
  }

  const entry = entryResult.finalUrl ?? entryResult.url;
  const host = new URL(entry).hostname;

  // 3. robots / sitemap / llms
  const base = `${new URL(entry).protocol}//${host}`;
  const [robotsRes, sitemapRes, llmsRes] = await Promise.all([
    fetchPage(`${base}/robots.txt`, false),
    fetchPage(`${base}/sitemap.xml`, false),
    fetchPage(`${base}/llms.txt`, false),
  ]);
  const robotsFound = robotsRes.ok && robotsRes.body.length > 0;
  const robotsAnalysis = robotsFound
    ? analyzeRobots(robotsRes.body)
    : { blocksAiBots: [], allowsAll: true };
  const sitemapFound = sitemapRes.ok && /<urlset|<sitemapindex/i.test(sitemapRes.body);
  const urlCount = sitemapFound ? (sitemapRes.body.match(/<loc>/g) ?? []).length : 0;
  const llmsFound = llmsRes.ok && llmsRes.body.trim().length > 0;

  // 4. 首页 + 站内链接抽样（≤15 页）
  const homepage = parsePage(entry, entryResult.status, entryResult.body, host);
  const priorityRe = /product|service|about|contact|faq|blog|news|case|article/i;
  const candidates = [...new Set(homepage.internalLinks)]
    .filter((u) => u !== entry && u !== `${entry}/`)
    .sort((a, b) => Number(priorityRe.test(b)) - Number(priorityRe.test(a)))
    .slice(0, MAX_SAMPLE_PAGES - 1);

  const sampled: ParsedPage[] = [homepage];
  // 逐批抓取，避免瞬时并发过高
  const batchSize = 5;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = await Promise.all(
      candidates.slice(i, i + batchSize).map(async (u) => {
        const r = await fetchPage(u, false);
        if (!r.ok || !r.body) return null;
        return parsePage(u, r.status, r.body, host);
      }),
    );
    sampled.push(...batch.filter((p): p is ParsedPage => p !== null));
  }

  const partial = sampled.length <= 1 || sampled.some((p) => (p.status ?? 0) >= 400);

  const robots: CrawlSummary["robots"] = {
    found: robotsFound,
    blocksAiBots: robotsAnalysis.blocksAiBots,
    allowsAll: robotsAnalysis.allowsAll,
  };
  const sitemap: CrawlSummary["sitemap"] = { found: sitemapFound, urlCount };
  const llms: CrawlSummary["llms"] = { found: llmsFound };

  const suggestions = buildSuggestions(
    { ...entryResult, body: "" },
    variants,
    robots,
    sitemap,
    llms,
    sampled,
  );

  const summary: CrawlSummary = {
    domain,
    entry,
    variants,
    robots,
    sitemap,
    llms,
    pages: sampled.map(({ internalLinks: _i, hasDate: _d, hasAuthor: _a, hasQaForm: _q, hasWhitepaper: _w, ...rest }) => rest),
  };

  return { status: partial ? "partial" : "ok", targetUrl: entry, summary, suggestions };
}
