# DeepGEO 维度四 API（后端 v1.2 · 自动查）

入口页：https://www.deepgeo.org.cn/inclusionQuery.html  
API 域：https://api.deepgeo.org.cn（`DEEPGEO_API_BASE`）

## 推荐默认路径
`diagnostics.runDeepgeoVis`（别名 `runDeepgeoAuto`）

1. 服务端 `suggestVisWords` 推决策/场景/对比（不问用户）
2. 查九格（查询类型=`title` 检索关键词/文章标题；平台勾选豆包+DeepSeek+通义）：
   - **live**：`DEEPGEO_ACCESS_TOKEN` 或 `DEEPGEO_USER`/`PASS` → `/customer/login` + `/customer/reference/query` → poll report
   - **韩后样例短路**（代理不可用）：`HANHOO_DEEPGEO_SAMPLE_CELLS`，`provider=demo_auto`
   - 其它项目无代理：明确失败 → 前端人工九格 / `saveVisManual`
3. `persist=true`（默认）直接定档落库；成功路径前端少确认、不逐格手点
4. 拆不出平台时：合并命中复制到三格，`evidenceNote` 含「合并结果无法拆平台」
5. 命中：来源/正文含 `siteDomain` 或 `www.` 变体；无正文不标仅品牌

## 环境变量
| 变量 | 说明 |
|------|------|
| `DEEPGEO_MODE` | `sample`（默认）\| `live` |
| `DEEPGEO_API_BASE` | 默认 `https://api.deepgeo.org.cn` |
| `DEEPGEO_ACCESS_TOKEN` | 优先；媒介机已登录可直接填 Bearer |
| `DEEPGEO_USER` / `DEEPGEO_PASS` | 无 token 时尝试 `/customer/login`（可能要验证码） |
| `DEEPGEO_ALLOW_SAMPLE_FALLBACK` | `live` 失败时韩后是否仍可 demo_auto |
| `DEEPGEO_USE_PLAYWRIGHT` | `1` 时明确失败（待 Chrome 镜像） |

## 兼容
- `triggerVisAuto` / `suggestVisWords` → 只推词
- `applyVisGrid` → provider=`deepgeo`\|`demo_auto`
- `saveVisManual` → 失败兜底

## 前端
Scoring 维度四默认 `autoStart`：进入即 `runDeepgeoVis`；主按钮「DeepGEO 自动查并回填」；仅失败展开人工九格。
