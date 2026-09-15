/**
 * DeepGEO 维度四自动查 runner。
 *
 * 入口页：https://www.deepgeo.org.cn/inclusionQuery.html
 * API 域：https://api.deepgeo.org.cn
 * 契约：POST /customer/reference/query（type=title）→ poll /customer/reference/report
 *
 * 策略：
 * - live：DEEPGEO_ACCESS_TOKEN 或 USER/PASS 登录后真查；失败明确抛错
 * - 代理不可用且项目为韩后：HANHOO_DEEPGEO_SAMPLE_CELLS 短路（demo_auto）
 * - 其它项目无代理：抛错 → 前端 saveVisManual / 人工九格
 */
import {
  HANHOO_DEEPGEO_SAMPLE_CELLS,
  isHanhooProject,
} from "@contracts/deepgeoVis";
import type { Platform, VisWordType } from "@contracts/kpi";

export type DeepgeoCell = {
  wordType: VisWordType;
  platform: Platform;
  promptText: string;
  officialSiteCited: boolean;
  brandMentionOnly: boolean;
  answerExcerpt?: string | null;
  sourceUrls: string[];
  evidenceNote?: string | null;
};

export type DeepgeoRunMode = "live" | "sample";

export class DeepgeoRunError extends Error {
  code:
    | "DEEPGEO_CREDS_MISSING"
    | "DEEPGEO_AUTH_FAILED"
    | "DEEPGEO_QUERY_FAILED"
    | "DEEPGEO_NOT_CONFIGURED";
  fallback = "saveVisManual" as const;
  constructor(code: DeepgeoRunError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "DeepgeoRunError";
  }
}

/** DeepGEO 平台 id：1 豆包 / 2 DeepSeek / 5 通义千问 */
const DEEPGEO_PLATFORM_IDS: Record<Platform, number> = {
  doubao: 1,
  deepseek: 2,
  qwen: 5,
};

const TARGET_PLATFORMS: Platform[] = ["doubao", "deepseek", "qwen"];

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function deepgeoMode(): "sample" | "live" {
  const m = env("DEEPGEO_MODE").toLowerCase();
  return m === "live" ? "live" : "sample";
}

function apiBase(): string {
  return (
    env("DEEPGEO_API_BASE") ||
    env("DEEPGEO_BASE_URL").replace("www.deepgeo.org.cn", "api.deepgeo.org.cn").replace(/\/$/, "") ||
    "https://api.deepgeo.org.cn"
  ).replace(/\/$/, "");
}

export function citeDomain(text: string, siteDomain: string): boolean {
  const d = siteDomain.replace(/^www\./i, "").toLowerCase();
  if (!d) return false;
  const t = text.toLowerCase();
  return t.includes(d) || t.includes(`www.${d}`);
}

/** sample / 韩后演示：九格全 miss */
export function runDeepgeoSample(words: {
  decision: string;
  scenario: string;
  compare: string;
}): DeepgeoCell[] {
  return HANHOO_DEEPGEO_SAMPLE_CELLS(words).map((c) => ({
    ...c,
    answerExcerpt: null,
    evidenceNote: `${c.evidenceNote} · provider=demo_auto`,
  }));
}

type ApiEnvelope<T> = { code?: number; message?: string; data?: T; msg?: string };

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new DeepgeoRunError(
      "DEEPGEO_QUERY_FAILED",
      `DeepGEO 响应非 JSON HTTP ${res.status}：${text.slice(0, 200)}`,
    );
  }
}

async function loginDeepgeo(): Promise<string> {
  const token = env("DEEPGEO_ACCESS_TOKEN");
  if (token) return token;

  const user = env("DEEPGEO_USER");
  const pass = env("DEEPGEO_PASS");
  if (!user || !pass) {
    throw new DeepgeoRunError(
      "DEEPGEO_CREDS_MISSING",
      "缺少 DEEPGEO_ACCESS_TOKEN 或 DEEPGEO_USER/PASS，无法登录 DeepGEO（入口 inclusionQuery.html 须已登录）",
    );
  }

  const base = apiBase();
  const loginPath = env("DEEPGEO_LOGIN_PATH") || "/customer/login";
  const loginRes = await fetch(`${base}${loginPath}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      account: user,
      password: pass,
      use_token: 1,
      rememberMe: true,
    }),
  }).catch((e: Error) => {
    throw new DeepgeoRunError("DEEPGEO_AUTH_FAILED", `DeepGEO 登录请求失败：${e.message}`);
  });

  const body = await readJson<
    ApiEnvelope<{ access_token?: string; refresh_token?: string }> & {
      access_token?: string;
      data?: { access_token?: string };
    }
  >(loginRes);

  if (!loginRes.ok || (typeof body.code === "number" && body.code !== 0 && body.code !== 200)) {
    throw new DeepgeoRunError(
      "DEEPGEO_AUTH_FAILED",
      `DeepGEO 登录失败 HTTP ${loginRes.status}：${body.message || body.msg || "会话失效或需验证码，请回退人工录入"}`,
    );
  }

  const access =
    body.data?.access_token ||
    (body as { access_token?: string }).access_token ||
    (body as { data?: { access_token?: string } }).data?.access_token;
  if (!access) {
    throw new DeepgeoRunError(
      "DEEPGEO_AUTH_FAILED",
      "DeepGEO 登录成功但未返回 access_token（可能需图形验证码），请配置 DEEPGEO_ACCESS_TOKEN 或回退人工",
    );
  }
  return access;
}

type ReportPlatform = {
  platform_id?: number;
  status?: string;
  is_ref?: boolean;
  chat_content?: unknown;
  channels?: Array<{
    channel_name?: string;
    ref_num?: number;
    url?: string;
    link?: string;
  }>;
};

type ReportPayload = {
  type?: string;
  keyword_report?: {
    base?: { status?: string; question?: string };
    platforms?: ReportPlatform[];
  };
  title_report?: {
    base?: { status?: string; question?: string };
    platforms?: ReportPlatform[];
  };
  url_report?: {
    base?: { status?: string };
    platforms?: ReportPlatform[];
  };
};

function pickReportBlock(data: ReportPayload): {
  base?: { status?: string; question?: string };
  platforms?: ReportPlatform[];
} | undefined {
  if (data.keyword_report) return data.keyword_report;
  if (data.title_report) return data.title_report;
  if (data.url_report) return data.url_report;
  return undefined;
}

function extractBlob(p: ReportPlatform): { text: string; urls: string[] } {
  const urls: string[] = [];
  const parts: string[] = [];
  if (p.channels) {
    for (const ch of p.channels) {
      if (ch.channel_name) parts.push(ch.channel_name);
      const u = ch.url || ch.link;
      if (u) {
        urls.push(u);
        parts.push(u);
      }
    }
  }
  if (p.chat_content != null) {
    const raw =
      typeof p.chat_content === "string"
        ? p.chat_content
        : JSON.stringify(p.chat_content);
    parts.push(raw);
    const urlHits = raw.match(/https?:\/\/[^\s"'\\]+/g) ?? [];
    urls.push(...urlHits);
  }
  return { text: parts.join("\n"), urls: [...new Set(urls)].slice(0, 20) };
}

function cellFromPlatform(
  wordType: VisWordType,
  promptText: string,
  platform: Platform,
  p: ReportPlatform | null,
  siteDomain: string,
  merged: boolean,
): DeepgeoCell {
  if (!p) {
    return {
      wordType,
      platform,
      promptText,
      officialSiteCited: false,
      brandMentionOnly: false,
      answerExcerpt: null,
      sourceUrls: [],
      evidenceNote: merged
        ? "合并结果无法拆平台 · 无平台数据"
        : `DeepGEO live · 无 ${platform} 结果`,
    };
  }
  const { text, urls } = extractBlob(p);
  const hasBody = text.trim().length > 0;
  const officialSiteCited = hasBody ? citeDomain(`${text}\n${urls.join("\n")}`, siteDomain) : false;
  const noteParts = [
    officialSiteCited ? `命中官网 ${siteDomain}` : `未命中官网 ${siteDomain}`,
    merged ? "合并结果无法拆平台" : `platform_id=${p.platform_id ?? "?"}`,
  ];
  return {
    wordType,
    platform,
    promptText,
    officialSiteCited,
    brandMentionOnly: false,
    answerExcerpt: hasBody ? text.slice(0, 2000) : null,
    sourceUrls: urls,
    evidenceNote: `DeepGEO live · ${noteParts.join(" · ")}`,
  };
}

async function queryOneWord(args: {
  token: string;
  promptText: string;
  wordType: VisWordType;
  siteDomain: string;
}): Promise<DeepgeoCell[]> {
  const base = apiBase();
  const queryPath = env("DEEPGEO_QUERY_PATH") || "/customer/reference/query";
  const reportPath = env("DEEPGEO_REPORT_PATH") || "/customer/reference/report";
  const platformIds = TARGET_PLATFORMS.map((p) => DEEPGEO_PLATFORM_IDS[p]);

  const qRes = await fetch(`${base}${queryPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${args.token}`,
    },
    // 查询类型：检索关键词/文章标题
    body: JSON.stringify({
      type: "title",
      question: args.promptText.slice(0, 50),
      platforms: platformIds,
    }),
  }).catch((e: Error) => {
    throw new DeepgeoRunError("DEEPGEO_QUERY_FAILED", `DeepGEO 查询失败：${e.message}`);
  });

  if (qRes.status === 401 || qRes.status === 403) {
    throw new DeepgeoRunError(
      "DEEPGEO_AUTH_FAILED",
      "DeepGEO 会话失效或未登录（inclusionQuery 须已登录），请回退 saveVisManual",
    );
  }

  const qBody = await readJson<ApiEnvelope<{ id?: number | string }>>(qRes);
  if (!qRes.ok || (typeof qBody.code === "number" && qBody.code !== 0 && qBody.code !== 200)) {
    throw new DeepgeoRunError(
      "DEEPGEO_QUERY_FAILED",
      `DeepGEO 查询 HTTP ${qRes.status}：${qBody.message || qBody.msg || "失败"}`,
    );
  }
  const taskId = qBody.data?.id;
  if (taskId == null) {
    throw new DeepgeoRunError("DEEPGEO_QUERY_FAILED", "DeepGEO 查询未返回 task id");
  }

  const deadline = Date.now() + Number(env("DEEPGEO_POLL_MS") || 90_000);
  let report: ReportPayload | null = null;
  while (Date.now() < deadline) {
    const rRes = await fetch(`${base}${reportPath}?task_id=${encodeURIComponent(String(taskId))}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${args.token}`,
      },
    }).catch((e: Error) => {
      throw new DeepgeoRunError("DEEPGEO_QUERY_FAILED", `DeepGEO 拉报告失败：${e.message}`);
    });
    if (rRes.status === 401 || rRes.status === 403) {
      throw new DeepgeoRunError("DEEPGEO_AUTH_FAILED", "DeepGEO 拉报告时会话失效，请回退人工录入");
    }
    const rBody = await readJson<ApiEnvelope<ReportPayload>>(rRes);
    const data = (rBody.data ?? (rBody as unknown as ReportPayload)) as ReportPayload;
    const block = pickReportBlock(data);
    const status = block?.base?.status ?? "success";
    if (status === "running") {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    report = data;
    break;
  }
  if (!report) {
    throw new DeepgeoRunError("DEEPGEO_QUERY_FAILED", `DeepGEO 查询超时（词：${args.promptText.slice(0, 20)}）`);
  }

  const block = pickReportBlock(report);
  const platforms = block?.platforms ?? [];

  const byId = new Map<number, ReportPlatform>();
  for (const p of platforms) {
    if (typeof p.platform_id === "number") byId.set(p.platform_id, p);
  }

  const usable = TARGET_PLATFORMS.filter((pl) => byId.has(DEEPGEO_PLATFORM_IDS[pl]));
  // 拆不出目标三平台 → 合并命中复制到三格
  if (usable.length === 0) {
    const merged = platforms[0] ?? null;
    return TARGET_PLATFORMS.map((platform) =>
      cellFromPlatform(args.wordType, args.promptText, platform, merged, args.siteDomain, true),
    );
  }

  return TARGET_PLATFORMS.map((platform) => {
    const id = DEEPGEO_PLATFORM_IDS[platform];
    return cellFromPlatform(
      args.wordType,
      args.promptText,
      platform,
      byId.get(id) ?? null,
      args.siteDomain,
      false,
    );
  });
}

async function runDeepgeoLive(args: {
  words: { decision: string; scenario: string; compare: string };
  siteDomain: string;
}): Promise<DeepgeoCell[]> {
  if (env("DEEPGEO_USE_PLAYWRIGHT") === "1") {
    throw new DeepgeoRunError(
      "DEEPGEO_NOT_CONFIGURED",
      "Playwright 路径待装浏览器镜像；请改用 token/XHR 或 DEEPGEO_MODE=sample（韩后演示），或回退 saveVisManual",
    );
  }
  const token = await loginDeepgeo();
  const wordEntries: Array<[VisWordType, string]> = [
    ["decision", args.words.decision],
    ["scenario", args.words.scenario],
    ["compare", args.words.compare],
  ];
  const cells: DeepgeoCell[] = [];
  for (const [wordType, promptText] of wordEntries) {
    const part = await queryOneWord({
      token,
      promptText,
      wordType,
      siteDomain: args.siteDomain,
    });
    cells.push(...part);
  }
  return cells;
}

export async function runDeepgeoQuery(args: {
  words: { decision: string; scenario: string; compare: string };
  siteDomain: string;
  projectName?: string | null;
}): Promise<{ mode: DeepgeoRunMode; provider: "deepgeo" | "demo_auto"; cells: DeepgeoCell[] }> {
  const hanhoo = isHanhooProject({ name: args.projectName, domain: args.siteDomain });
  const hasCreds = !!(env("DEEPGEO_ACCESS_TOKEN") || (env("DEEPGEO_USER") && env("DEEPGEO_PASS")));
  const mode = deepgeoMode();

  // live 或具备凭证时优先真查
  if (mode === "live" || hasCreds) {
    try {
      const cells = await runDeepgeoLive(args);
      return { mode: "live", provider: "deepgeo", cells };
    } catch (e) {
      // 代理失败：韩后可样例短路演示；其它项目继续抛
      if (hanhoo && mode !== "live") {
        return {
          mode: "sample",
          provider: "demo_auto",
          cells: runDeepgeoSample(args.words),
        };
      }
      if (hanhoo && mode === "live" && env("DEEPGEO_ALLOW_SAMPLE_FALLBACK") === "1") {
        return {
          mode: "sample",
          provider: "demo_auto",
          cells: runDeepgeoSample(args.words),
        };
      }
      throw e;
    }
  }

  // sample 模式 / 无凭证：仅韩后短路
  if (hanhoo) {
    return {
      mode: "sample",
      provider: "demo_auto",
      cells: runDeepgeoSample(args.words),
    };
  }

  throw new DeepgeoRunError(
    "DEEPGEO_CREDS_MISSING",
    "DeepGEO 代理不可用（未配置 token/账号）。非韩后项目请人工九格或配置 DEEPGEO_ACCESS_TOKEN · fallback=saveVisManual",
  );
}
