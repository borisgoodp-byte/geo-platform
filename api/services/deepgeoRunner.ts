/**
 * DeepGEO 维度四真查 runner。
 * - sample：返回韩后全 miss 样例（演示/无账号）
 * - live：DEEPGEO_USER/PASS + BASE_URL，优先站点 XHR；可选 Playwright
 * 会话/登录失败一律抛 DeepgeoRunError，前端回退 saveVisManual。
 */
import {
  HANHOO_DEEPGEO_SAMPLE_CELLS,
  type SuggestedVisWords,
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

export class DeepgeoRunError extends Error {
  code:
    | "DEEPGEO_CREDS_MISSING"
    | "DEEPGEO_AUTH_FAILED"
    | "DEEPGEO_QUERY_FAILED"
    | "DEEPGEO_NOT_CONFIGURED";
  fallback = "saveVisManual" as const;
  constructor(
    code: DeepgeoRunError["code"],
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "DeepgeoRunError";
  }
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function deepgeoMode(): "sample" | "live" {
  const m = env("DEEPGEO_MODE").toLowerCase();
  return m === "live" ? "live" : "sample";
}

function citeDomain(text: string, siteDomain: string): boolean {
  const d = siteDomain.replace(/^www\./, "").toLowerCase();
  if (!d) return false;
  const t = text.toLowerCase();
  return t.includes(d) || t.includes(`www.${d}`);
}

/** sample 模式：韩后口径九格全 miss（可作联调） */
export function runDeepgeoSample(words: {
  decision: string;
  scenario: string;
  compare: string;
}): DeepgeoCell[] {
  return HANHOO_DEEPGEO_SAMPLE_CELLS(words).map((c) => ({
    ...c,
    answerExcerpt: null,
  }));
}

/**
 * live XHR：需站点提供可配置的 login/query。
 * 默认尝试 DEEPGEO_LOGIN_PATH / DEEPGEO_QUERY_PATH；未配置则明确失败。
 */
async function runDeepgeoXhr(args: {
  words: { decision: string; scenario: string; compare: string };
  siteDomain: string;
}): Promise<DeepgeoCell[]> {
  const base = env("DEEPGEO_BASE_URL").replace(/\/$/, "");
  const user = env("DEEPGEO_USER");
  const pass = env("DEEPGEO_PASS");
  if (!base || !user || !pass) {
    throw new DeepgeoRunError(
      "DEEPGEO_CREDS_MISSING",
      "缺少 DEEPGEO_BASE_URL / DEEPGEO_USER / DEEPGEO_PASS，无法服务端登录 DeepGEO",
    );
  }
  const loginPath = env("DEEPGEO_LOGIN_PATH") || "/api/auth/login";
  const queryPath = env("DEEPGEO_QUERY_PATH") || "/api/geo/query";

  const loginRes = await fetch(`${base}${loginPath}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ email: user, username: user, password: pass }),
  }).catch((e: Error) => {
    throw new DeepgeoRunError("DEEPGEO_AUTH_FAILED", `DeepGEO 登录请求失败：${e.message}`);
  });

  if (!loginRes.ok) {
    throw new DeepgeoRunError(
      "DEEPGEO_AUTH_FAILED",
      `DeepGEO 登录失败 HTTP ${loginRes.status}（会话失效或账号错误，请回退人工录入）`,
    );
  }

  const setCookie = loginRes.headers.getSetCookie?.() ?? [];
  const cookieHeader =
    setCookie.map((c) => c.split(";")[0]).join("; ") ||
    loginRes.headers.get("set-cookie")?.split(",").map((c) => c.split(";")[0].trim()).join("; ") ||
    "";

  let token: string | undefined;
  try {
    const body = (await loginRes.json()) as { token?: string; accessToken?: string; data?: { token?: string } };
    token = body.token || body.accessToken || body.data?.token;
  } catch {
    /* cookie-only session */
  }

  const platforms = ["doubao", "deepseek", "qwen"] as const;
  const wordEntries: Array<[VisWordType, string]> = [
    ["decision", args.words.decision],
    ["scenario", args.words.scenario],
    ["compare", args.words.compare],
  ];
  const cells: DeepgeoCell[] = [];

  for (const [wordType, promptText] of wordEntries) {
    for (const platform of platforms) {
      const qRes = await fetch(`${base}${queryPath}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(cookieHeader ? { cookie: cookieHeader } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          prompt: promptText,
          query: promptText,
          platform,
          platforms: [platform],
          domain: args.siteDomain,
        }),
      }).catch((e: Error) => {
        throw new DeepgeoRunError("DEEPGEO_QUERY_FAILED", `DeepGEO 查询失败：${e.message}`);
      });

      if (qRes.status === 401 || qRes.status === 403) {
        throw new DeepgeoRunError(
          "DEEPGEO_AUTH_FAILED",
          "DeepGEO 会话失效或无权限，请回退 saveVisManual",
        );
      }
      if (!qRes.ok) {
        throw new DeepgeoRunError(
          "DEEPGEO_QUERY_FAILED",
          `DeepGEO 查询 HTTP ${qRes.status}（${platform}/${wordType}）`,
        );
      }

      const rawText = await qRes.text();
      let answer = rawText;
      let sourceUrls: string[] = [];
      try {
        const j = JSON.parse(rawText) as Record<string, unknown>;
        answer =
          String(j.answer ?? j.content ?? j.text ?? j.result ?? rawText).slice(0, 4000);
        const src = j.sources ?? j.sourceUrls ?? j.citations;
        if (Array.isArray(src)) {
          sourceUrls = src
            .map((s) => (typeof s === "string" ? s : String((s as { url?: string }).url ?? "")))
            .filter(Boolean)
            .slice(0, 20);
        }
      } catch {
        /* plain text */
      }

      const blob = `${answer}\n${sourceUrls.join("\n")}`;
      const officialSiteCited = citeDomain(blob, args.siteDomain);
      cells.push({
        wordType,
        platform,
        promptText,
        officialSiteCited,
        brandMentionOnly: false,
        answerExcerpt: answer.slice(0, 2000),
        sourceUrls,
        evidenceNote: officialSiteCited
          ? `DeepGEO live · 命中 ${args.siteDomain}`
          : `DeepGEO live · 未命中官网 ${args.siteDomain}`,
      });
    }
  }
  return cells;
}

export async function runDeepgeoQuery(args: {
  words: { decision: string; scenario: string; compare: string };
  siteDomain: string;
}): Promise<{ mode: "sample" | "live"; cells: DeepgeoCell[] }> {
  if (deepgeoMode() === "sample") {
    return { mode: "sample", cells: runDeepgeoSample(args.words) };
  }
  // live：当前以可配置 XHR 为主（Railway 无 Chrome）；Playwright 开关预留
  if (env("DEEPGEO_USE_PLAYWRIGHT") === "1") {
    throw new DeepgeoRunError(
      "DEEPGEO_NOT_CONFIGURED",
      "Playwright 路径待装浏览器镜像；请改用 DEEPGEO_MODE=sample 或配置 XHR 路径，或回退 saveVisManual",
    );
  }
  const cells = await runDeepgeoXhr(args);
  return { mode: "live", cells };
}
