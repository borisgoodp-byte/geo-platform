/**
 * DeepGEO 维度四自动查 runner（媒介运营组 Open API）。
 *
 * 认证域：https://global-api.deepgeo.org.cn
 * 查询域：https://api.deepgeo.org.cn
 *
 * 登录：POST /api/v1/customer/info { phone, password } → sub/secret_key
 *       GET  /api/v1/token（可用 DEEPGEO_TOKEN_URL 覆盖）换 ACCESS_TOKEN
 * 查询：POST /api/v1/query/reference { type:"title", question, platforms }
 *       GET  /api/v1/query/detail?task_id=… 轮询
 *
 * 平台 API 字符串：doubao / deepseek / tongyi；内部 Platform 仍 doubao|deepseek|qwen（tongyi↔qwen）
 *
 * 策略：
 * - live 主路径：网页自动化回填 applyVisGrid(provider=deepgeo_web)
 * - Open API：仅 DEEPGEO_USE_OPEN_API=1 时可选；失败明确抛错
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

/** Open API 平台字符串（通义 = tongyi） */
type DeepgeoApiPlatform = "doubao" | "deepseek" | "tongyi";

const INTERNAL_TO_API: Record<Platform, DeepgeoApiPlatform> = {
  doubao: "doubao",
  deepseek: "deepseek",
  qwen: "tongyi",
};

const API_TO_INTERNAL: Record<DeepgeoApiPlatform, Platform> = {
  doubao: "doubao",
  deepseek: "deepseek",
  tongyi: "qwen",
};

const TARGET_PLATFORMS: Platform[] = ["doubao", "deepseek", "qwen"];
const API_PLATFORMS: DeepgeoApiPlatform[] = TARGET_PLATFORMS.map(
  (p) => INTERNAL_TO_API[p],
);

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function deepgeoMode(): "sample" | "live" {
  const m = env("DEEPGEO_MODE").toLowerCase();
  return m === "live" ? "live" : "sample";
}

/** 查询 API 域（reference / detail） */
function apiBase(): string {
  return (
    env("DEEPGEO_API_BASE") ||
    env("DEEPGEO_BASE_URL")
      .replace("www.deepgeo.org.cn", "api.deepgeo.org.cn")
      .replace(/\/$/, "") ||
    "https://api.deepgeo.org.cn"
  ).replace(/\/$/, "");
}

/** 认证 API 域（customer/info、默认 token） */
function authBase(): string {
  return (
    env("DEEPGEO_AUTH_BASE") ||
    env("DEEPGEO_GLOBAL_API_BASE") ||
    "https://global-api.deepgeo.org.cn"
  ).replace(/\/$/, "");
}

function tokenUrl(): string {
  return env("DEEPGEO_TOKEN_URL") || `${authBase()}/api/v1/token`;
}

function infoUrl(): string {
  const path = env("DEEPGEO_INFO_PATH") || "/api/v1/customer/info";
  if (path.startsWith("http")) return path;
  return `${authBase()}${path.startsWith("/") ? path : `/${path}`}`;
}

function queryUrl(): string {
  const path = env("DEEPGEO_QUERY_PATH") || "/api/v1/query/reference";
  if (path.startsWith("http")) return path;
  return `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
}

function detailUrl(taskId: string): string {
  const override = env("DEEPGEO_DETAIL_URL") || env("DEEPGEO_DETAIL_PATH");
  if (override) {
    if (override.startsWith("http")) {
      const sep = override.includes("?") ? "&" : "?";
      return `${override}${sep}task_id=${encodeURIComponent(taskId)}`;
    }
    return `${apiBase()}${override.startsWith("/") ? override : `/${override}`}${
      override.includes("?") ? "&" : "?"
    }task_id=${encodeURIComponent(taskId)}`;
  }
  return `${apiBase()}/api/v1/query/detail?task_id=${encodeURIComponent(taskId)}`;
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

function envelopeOk(res: Response, body: ApiEnvelope<unknown>): boolean {
  if (!res.ok) return false;
  if (typeof body.code === "number" && body.code !== 0 && body.code !== 200) return false;
  return true;
}

function pickAccessToken(body: Record<string, unknown>): string | undefined {
  const data = body.data as Record<string, unknown> | undefined;
  const candidates = [
    data?.access_token,
    data?.ACCESS_TOKEN,
    data?.token,
    body.access_token,
    body.ACCESS_TOKEN,
    body.token,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return undefined;
}

/**
 * 换 ACCESS_TOKEN：优先 DEEPGEO_ACCESS_TOKEN；
 * 否则 POST customer/info → GET token（sub/secret_key）。
 */
async function loginDeepgeo(): Promise<string> {
  const token = env("DEEPGEO_ACCESS_TOKEN");
  if (token) return token;

  const phone = env("DEEPGEO_PHONE") || env("DEEPGEO_USER");
  const pass = env("DEEPGEO_PASS") || env("DEEPGEO_PASSWORD");
  if (!phone || !pass) {
    throw new DeepgeoRunError(
      "DEEPGEO_CREDS_MISSING",
      "缺少 DEEPGEO_ACCESS_TOKEN 或 DEEPGEO_PHONE|USER / DEEPGEO_PASS，无法登录 DeepGEO Open API",
    );
  }

  const infoRes = await fetch(infoUrl(), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ phone, password: pass }),
  }).catch((e: Error) => {
    throw new DeepgeoRunError("DEEPGEO_AUTH_FAILED", `DeepGEO customer/info 请求失败：${e.message}`);
  });

  const infoBody = await readJson<
    ApiEnvelope<{ sub?: string; secret_key?: string; secretKey?: string }> & {
      sub?: string;
      secret_key?: string;
    }
  >(infoRes);

  if (!envelopeOk(infoRes, infoBody)) {
    throw new DeepgeoRunError(
      "DEEPGEO_AUTH_FAILED",
      `DeepGEO customer/info 失败 HTTP ${infoRes.status}：${infoBody.message || infoBody.msg || "认证失败"}`,
    );
  }

  const infoData = (infoBody.data ?? infoBody) as {
    sub?: string;
    secret_key?: string;
    secretKey?: string;
  };
  const sub = infoData.sub ?? (infoBody as { sub?: string }).sub;
  const secretKey =
    infoData.secret_key ??
    infoData.secretKey ??
    (infoBody as { secret_key?: string }).secret_key;

  if (!sub || !secretKey) {
    throw new DeepgeoRunError(
      "DEEPGEO_AUTH_FAILED",
      "DeepGEO customer/info 未返回 sub/secret_key，请配置 DEEPGEO_ACCESS_TOKEN 或回退人工",
    );
  }

  const tokUrl = new URL(tokenUrl());
  tokUrl.searchParams.set("sub", String(sub));
  tokUrl.searchParams.set("secret_key", String(secretKey));

  const tokRes = await fetch(tokUrl.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      // 部分网关也接受 header；query 为主
      "x-sub": String(sub),
      "x-secret-key": String(secretKey),
    },
  }).catch((e: Error) => {
    throw new DeepgeoRunError("DEEPGEO_AUTH_FAILED", `DeepGEO token 请求失败：${e.message}`);
  });

  const tokBody = await readJson<Record<string, unknown> & ApiEnvelope<unknown>>(tokRes);
  if (!envelopeOk(tokRes, tokBody)) {
    throw new DeepgeoRunError(
      "DEEPGEO_AUTH_FAILED",
      `DeepGEO 换 token 失败 HTTP ${tokRes.status}：${(tokBody.message as string) || (tokBody.msg as string) || "失败"}`,
    );
  }

  const access = pickAccessToken(tokBody);
  if (!access) {
    throw new DeepgeoRunError(
      "DEEPGEO_AUTH_FAILED",
      "DeepGEO token 接口未返回 ACCESS_TOKEN，请配置 DEEPGEO_ACCESS_TOKEN 或回退人工",
    );
  }
  return access;
}

type DetailPlatform = {
  platform?: string;
  platform_id?: number | string;
  platform_name?: string;
  status?: string;
  is_ref?: boolean;
  chat_content?: unknown;
  content?: unknown;
  answer?: unknown;
  channels?: Array<{
    channel_name?: string;
    name?: string;
    ref_num?: number;
    url?: string;
    link?: string;
  }>;
  sources?: Array<{ url?: string; link?: string; name?: string; title?: string }>;
};

type DetailPayload = {
  type?: string;
  status?: string;
  task_id?: string | number;
  platforms?: DetailPlatform[];
  /** 兼容旧 title_report / keyword_report 形态 */
  keyword_report?: { base?: { status?: string }; platforms?: DetailPlatform[] };
  title_report?: { base?: { status?: string }; platforms?: DetailPlatform[] };
  url_report?: { base?: { status?: string }; platforms?: DetailPlatform[] };
  result?: { platforms?: DetailPlatform[]; status?: string };
};

function pickPlatforms(data: DetailPayload): {
  status: string;
  platforms: DetailPlatform[];
} {
  if (Array.isArray(data.platforms) && data.platforms.length) {
    return { status: data.status ?? "success", platforms: data.platforms };
  }
  if (data.result?.platforms?.length) {
    return {
      status: data.result.status ?? data.status ?? "success",
      platforms: data.result.platforms,
    };
  }
  for (const key of ["title_report", "keyword_report", "url_report"] as const) {
    const block = data[key];
    if (block?.platforms?.length) {
      return {
        status: block.base?.status ?? data.status ?? "success",
        platforms: block.platforms,
      };
    }
  }
  return { status: data.status ?? "success", platforms: data.platforms ?? [] };
}

function normalizeApiPlatform(raw: unknown): DeepgeoApiPlatform | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === "doubao" || s === "豆包") return "doubao";
  if (s === "deepseek") return "deepseek";
  if (s === "tongyi" || s === "qwen" || s === "通义" || s === "通义千问") return "tongyi";
  // 旧数字 id 兜底
  if (s === "1") return "doubao";
  if (s === "2") return "deepseek";
  if (s === "5") return "tongyi";
  return null;
}

function extractBlob(p: DetailPlatform): { text: string; urls: string[] } {
  const urls: string[] = [];
  const parts: string[] = [];
  if (p.channels) {
    for (const ch of p.channels) {
      if (ch.channel_name) parts.push(ch.channel_name);
      if (ch.name) parts.push(ch.name);
      const u = ch.url || ch.link;
      if (u) {
        urls.push(u);
        parts.push(u);
      }
    }
  }
  if (p.sources) {
    for (const s of p.sources) {
      if (s.name) parts.push(s.name);
      if (s.title) parts.push(s.title);
      const u = s.url || s.link;
      if (u) {
        urls.push(u);
        parts.push(u);
      }
    }
  }
  for (const field of [p.chat_content, p.content, p.answer] as const) {
    if (field == null) continue;
    const raw = typeof field === "string" ? field : JSON.stringify(field);
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
  p: DetailPlatform | null,
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
  // 命中判定：渠道名 / 正文 / URL 含 siteDomain
  const officialSiteCited = hasBody
    ? citeDomain(`${text}\n${urls.join("\n")}`, siteDomain)
    : false;
  const apiName =
    normalizeApiPlatform(p.platform) ||
    normalizeApiPlatform(p.platform_name) ||
    normalizeApiPlatform(p.platform_id) ||
    INTERNAL_TO_API[platform];
  const noteParts = [
    officialSiteCited ? `命中官网 ${siteDomain}` : `未命中官网 ${siteDomain}`,
    merged ? "合并结果无法拆平台" : `platform=${apiName}`,
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

function pickTaskId(body: ApiEnvelope<Record<string, unknown>>): string | number | undefined {
  const data = body.data;
  if (!data || typeof data !== "object") return undefined;
  const d = data as Record<string, unknown>;
  const id = d.task_id ?? d.taskId ?? d.id;
  if (typeof id === "string" || typeof id === "number") return id;
  return undefined;
}

async function queryOneWord(args: {
  token: string;
  promptText: string;
  wordType: VisWordType;
  siteDomain: string;
}): Promise<DeepgeoCell[]> {
  const qRes = await fetch(queryUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${args.token}`,
    },
    body: JSON.stringify({
      type: "title",
      question: args.promptText.slice(0, 50),
      platforms: API_PLATFORMS,
    }),
  }).catch((e: Error) => {
    throw new DeepgeoRunError("DEEPGEO_QUERY_FAILED", `DeepGEO 查询失败：${e.message}`);
  });

  if (qRes.status === 401 || qRes.status === 403) {
    throw new DeepgeoRunError(
      "DEEPGEO_AUTH_FAILED",
      "DeepGEO 会话失效或 token 无效，请回退 saveVisManual",
    );
  }

  const qBody = await readJson<ApiEnvelope<Record<string, unknown>>>(qRes);
  if (!envelopeOk(qRes, qBody)) {
    throw new DeepgeoRunError(
      "DEEPGEO_QUERY_FAILED",
      `DeepGEO 查询 HTTP ${qRes.status}：${qBody.message || qBody.msg || "失败"}`,
    );
  }
  const taskId = pickTaskId(qBody);
  if (taskId == null) {
    throw new DeepgeoRunError("DEEPGEO_QUERY_FAILED", "DeepGEO 查询未返回 task_id");
  }

  const deadline = Date.now() + Number(env("DEEPGEO_POLL_MS") || 90_000);
  let detail: DetailPayload | null = null;
  while (Date.now() < deadline) {
    const rRes = await fetch(detailUrl(String(taskId)), {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${args.token}`,
      },
    }).catch((e: Error) => {
      throw new DeepgeoRunError("DEEPGEO_QUERY_FAILED", `DeepGEO 拉 detail 失败：${e.message}`);
    });
    if (rRes.status === 401 || rRes.status === 403) {
      throw new DeepgeoRunError("DEEPGEO_AUTH_FAILED", "DeepGEO 拉 detail 时会话失效，请回退人工录入");
    }
    const rBody = await readJson<ApiEnvelope<DetailPayload>>(rRes);
    const data = (rBody.data ?? (rBody as unknown as DetailPayload)) as DetailPayload;
    const { status, platforms } = pickPlatforms(data);
    if (status === "running" || status === "pending" || status === "processing") {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    // 尚无平台且状态不明 → 再等一轮
    if (!platforms.length && (status === "success" ? false : status !== "failed" && status !== "error")) {
      if (!status || status === "unknown") {
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
    }
    detail = data;
    break;
  }
  if (!detail) {
    throw new DeepgeoRunError(
      "DEEPGEO_QUERY_FAILED",
      `DeepGEO 查询超时（词：${args.promptText.slice(0, 20)}）`,
    );
  }

  const { platforms } = pickPlatforms(detail);
  const byApi = new Map<DeepgeoApiPlatform, DetailPlatform>();
  for (const p of platforms) {
    const key =
      normalizeApiPlatform(p.platform) ||
      normalizeApiPlatform(p.platform_name) ||
      normalizeApiPlatform(p.platform_id);
    if (key) byApi.set(key, p);
  }

  const usable = TARGET_PLATFORMS.filter((pl) => byApi.has(INTERNAL_TO_API[pl]));
  // 拆不出目标三平台 → 合并命中复制到三格
  if (usable.length === 0) {
    const merged = platforms[0] ?? null;
    return TARGET_PLATFORMS.map((platform) =>
      cellFromPlatform(args.wordType, args.promptText, platform, merged, args.siteDomain, true),
    );
  }

  return TARGET_PLATFORMS.map((platform) => {
    const apiKey = INTERNAL_TO_API[platform];
    return cellFromPlatform(
      args.wordType,
      args.promptText,
      platform,
      byApi.get(apiKey) ?? null,
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
      "Playwright 路径待装浏览器镜像；请改用 token/Open API 或 DEEPGEO_MODE=sample（韩后演示），或回退 saveVisManual",
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

function hasDeepgeoCreds(): boolean {
  if (env("DEEPGEO_ACCESS_TOKEN")) return true;
  const phone = env("DEEPGEO_PHONE") || env("DEEPGEO_USER");
  const pass = env("DEEPGEO_PASS") || env("DEEPGEO_PASSWORD");
  return !!(phone && pass);
}

export async function runDeepgeoQuery(args: {
  words: { decision: string; scenario: string; compare: string };
  siteDomain: string;
  projectName?: string | null;
}): Promise<{
  mode: DeepgeoRunMode;
  provider: "deepgeo" | "demo_auto" | "deepgeo_web";
  cells: DeepgeoCell[];
}> {
  const hanhoo = isHanhooProject({ name: args.projectName, domain: args.siteDomain });
  const hasCreds = hasDeepgeoCreds();
  const mode = deepgeoMode();
  const useOpenApi = env("DEEPGEO_USE_OPEN_API") === "1";

  // Open API 仅显式开启（钱包有余额）时走；默认不依赖 token
  if (useOpenApi && (mode === "live" || hasCreds)) {
    try {
      const cells = await runDeepgeoLive(args);
      return { mode: "live", provider: "deepgeo", cells };
    } catch (e) {
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

  // 默认：韩后 demo_auto；其它项目提示走网页自动化 applyVisGrid(deepgeo_web)
  if (hanhoo || mode === "sample") {
    if (hanhoo) {
      return {
        mode: "sample",
        provider: "demo_auto",
        cells: runDeepgeoSample(args.words),
      };
    }
  }

  throw new DeepgeoRunError(
    "DEEPGEO_NOT_CONFIGURED",
    "DeepGEO live 主路径为网页自动化：请用 inclusionQuery 查完后 applyVisGrid(provider=deepgeo_web)。Open API 需 DEEPGEO_USE_OPEN_API=1 且钱包有余额 · fallback=saveVisManual",
  );
}

// 导出映射供契约/测试引用
export const DEEPGEO_PLATFORM_API_MAP = {
  internalToApi: INTERNAL_TO_API,
  apiToInternal: API_TO_INTERNAL,
  apiPlatforms: API_PLATFORMS,
} as const;
