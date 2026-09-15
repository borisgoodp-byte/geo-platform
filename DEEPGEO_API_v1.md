# DeepGEO 维度四 API（后端 v1）

给 @前端工程师：默认 DeepGEO 自动查，失败再走人工 `saveVisManual`。

## 流程
0. （推荐）`diagnostics.triggerVisAuto({ projectId, diagnosticId? })` → 默认触发，返回三词+九格模板，**不问用户查什么**
1. 或 `diagnostics.suggestVisWords({ projectId })` → 三类词 + `siteDomain`（不问老板）
2. 前端/媒介用 **已登录 DeepGEO** 按返回的 3 词 × 三平台查询（UI 可自动触发）
3. `diagnostics.applyVisGrid({ diagnosticId, projectId, measureDate, words, cells })` → 定档写 `vis_1/2/3`，回填九格
4. 失败：走已有 `saveVisManual` / 人工九格

## suggestVisWords 输出
```ts
{
  decision: string;   // 决策词
  scenario: string;   // 场景词
  compare: string;    // 对比词（禁止品牌知名度提问）
  source: "pool" | "generated";
  siteDomain: string; // 判定官网引用用
}
```

## applyVisGrid.cells[]
与 `saveVisManual` 格字段同形：`wordType` ∈ decision|scenario|compare，`platform` ∈ deepseek|doubao|qwen，`officialSiteCited`，可选 `answerExcerpt` / `sourceUrls`。

## 权限
`operator` / `lead` 可调；`client` 不可（写保护下轮统一上）。

## 本轮边界
服务端**不代持** DeepGEO cookie；编排在前端（或媒介浏览器）。会话失效 → 明确失败 + 人工录入，不卡死流程。
