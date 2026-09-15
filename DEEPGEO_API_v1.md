# DeepGEO 维度四 API（后端 v1.4 · 网页自动化主路径）

入口页：https://www.deepgeo.org.cn/inclusionQuery.html（SPA `#/inclusion`）  
查询域：https://api.deepgeo.org.cn（`DEEPGEO_API_BASE`）  
认证域：https://global-api.deepgeo.org.cn（`DEEPGEO_AUTH_BASE`）

## 推荐默认路径（live 主路径 = 网页自动化）

Open API `/api/v1/query/reference` 实测常因**账户余额不足**失败；个人进阶版网页可无限查。因此：

1. 服务端 `suggestVisWords` / `triggerVisAuto` 推决策/场景/对比（不问用户）
2. **媒介/浏览器**在已登录 DeepGEO 网页执行 inclusionQuery（平台 豆包/DeepSeek/通义）
3. 回填九格 JSON → `diagnostics.applyVisGrid`（`provider: "deepgeo_web"`）定档落库
4. 可选：`runDeepgeoVis({ cells, provider: "deepgeo_web", persist: true })` 同构直落库，**不打 Open API**
5. 失败 → `saveVisManual`

### applyVisGrid 入参

```ts
{
  projectId: number
  diagnosticId: number
  measureDate: "YYYY-MM-DD"
  words: { decision: string; scenario: string; compare: string }
  cells: Array<{
    wordType: "decision" | "scenario" | "compare"
    platform: "doubao" | "deepseek" | "qwen"  // 通义 = qwen
    promptText: string
    officialSiteCited: boolean
    brandMentionOnly?: boolean
    answerExcerpt?: string | null
    sourceUrls?: string[]
    evidenceNote?: string | null
  }>  // 建议满 9 格
  provider: "deepgeo_web"  // live 主路径；另有 deepgeo | demo_auto
}
```

## Open API（可选，钱包有余额时）

仅当 `DEEPGEO_USE_OPEN_API=1`：

1. `DEEPGEO_ACCESS_TOKEN` 或 `customer/info`（phone+password）→ token
2. `POST /api/v1/query/reference` → poll detail
3. `provider=deepgeo`

韩后无代理：`provider=demo_auto` 样例短路。

## 平台映射

| 内部 Platform | Open API / 网页 |
|---------------|-----------------|
| `doubao`      | doubao / 1      |
| `deepseek`    | deepseek / 2    |
| `qwen`        | tongyi / 5      |

## 环境变量

| 变量 | 说明 |
|------|------|
| `DEEPGEO_MODE` | `sample`（默认）\| `live` |
| `DEEPGEO_USE_OPEN_API` | `1` 才走 Open API；默认关 |
| `DEEPGEO_API_BASE` / `DEEPGEO_AUTH_BASE` | Open API 域 |
| `DEEPGEO_ACCESS_TOKEN` / `DEEPGEO_PHONE` / `DEEPGEO_PASS` | 仅 Open API 用 |

## 兼容

- `triggerVisAuto` / `suggestVisWords` → 只推词
- `applyVisGrid` → **主路径** `provider=deepgeo_web`
- `saveVisManual` → 失败兜底
