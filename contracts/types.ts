export * from "./errors";

/** diagnostics.verdictJson：综合结论五段（技术/页面/内容/可见度/核心判断） */
export interface VerdictJson {
  tech: string;
  pages: string;
  content: string;
  visibility: string;
  core: string;
}

/** diagnostics.directionsJson：优化方向四卡 */
export interface DirectionCard {
  step: number;
  title: string;
  items: string[];
}

/** quotes.itemsJson 明细行 */
export interface QuoteLineItem {
  group: string;
  name: string;
  desc: string;
  unit: string;
  price: number;
  qty: number;
}

/** crawl_results.summaryJson */
export interface CrawlSummary {
  domain: string;
  entry: string | null;
  variants: {
    url: string;
    ok: boolean;
    status: number | null;
    finalUrl: string | null;
    redirectChain: string[];
    error?: string;
  }[];
  robots: { found: boolean; blocksAiBots: string[]; allowsAll: boolean };
  sitemap: { found: boolean; urlCount: number };
  llms: { found: boolean };
  pages: CrawlPageSummary[];
  error?: string;
}

export interface CrawlPageSummary {
  url: string;
  status: number | null;
  pageType: string;
  title: string;
  description: string;
  h1Count: number;
  h2Count: number;
  canonical: string | null;
  imgAltRatio: number;
  textLength: number;
  jsonLdTypes: string[];
  jsonLdErrors: number;
  jsonLdIds: number;
  hasBreadcrumb: boolean;
  navLinkCount: number;
  urlDepth: number;
  urlSemantic: boolean;
}
