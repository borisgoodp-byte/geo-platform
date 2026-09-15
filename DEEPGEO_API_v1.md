# DeepGEO 维度四 API（后端 v1.3 · Open API）

入口页：https://www.deepgeo.org.cn/inclusionQuery.html  
查询域：https://api.deepgeo.org.cn（`DEEPGEO_API_BASE`）  
认证域：https://global-api.deepgeo.org.cn（`DEEPGEO_AUTH_BASE` / `DEEPGEO_GLOBAL_API_BASE`）

> 媒介运营组最新 **Open API**（替换旧 `/customer/reference/*`）。

## 推荐默认路径
`diagnostics.runDeepgeoVis`（别名 `runDeepgeoAuto`）

1. 服务端 `suggestVisWords` 推决策/场景/对比（不问用户）
2. 查九格（查询类型=`title`；平台字符串 `doubao` / `deepseek` / `tongyi`）：
   - **live**：
     1. `DEEPGEO_ACCESS_TOKEN` 直用（跳过登录）；或
     2. `POST {AUTH}/api/v1/customer/info` body `{ phone, password }` → `sub` / `secret_key`
     3. `GET` token（默认 `{AUTH}/api/v1/token`，可用 `DEEPGEO_TOKEN_URL` 覆盖）用 sub/secret_key 换 ACCESS_TOKEN
     4. `POST {API}/api/v1/query/reference` → poll `GET {API}/api/v1/query/detail?task_id=`
   - **韩后样例短路**（无凭证/代理不可用）：`HANHOO_DEEPGEO_SAMPLE_CELLS`，`provider=demo_auto`
   - 其它项目无代理：明确失败 → 前端人工九格 / `saveVisManual`
3. `persist=true`（默认）直接定档落库；成功路径前端少确认、不逐格手点
4. 拆不出平台时：合并命中复制到三格，`evidenceNote` 含「合并结果无法拆平台」
5. 命中：结果**渠道名 / 正文 / URL** 含 `siteDomain` 或 `www.` 变体；无正文不标仅品牌

## 平台映射
| 内部 Platform | Open API 字符串 |
|---------------|-----------------|
| `doubao`      | `doubao`        |
| `deepseek`    | `deepseek`      |
| `qwen`        | `tongyi`        |

## 默认 URL
| 用途 | 默认 |
|------|------|
| customer/info | `https://global-api.deepgeo.org.cn/api/v1/customer/info` |
| token | `https://global-api.deepgeo.org.cn/api/v1/token`（`DEEPGEO_TOKEN_URL`） |
| query/reference | `https://api.deepgeo.org.cn/api/v1/query/reference` |
| query/detail | `https://api.deepgeo.org.cn/api/v1/query/detail?task_id=`（`DEEPGEO_DETAIL_PATH` / `DEEPGEO_DETAIL_URL`） |

## 环境变量
| 变量 | 说明 |
|------|------|
| `DEEPGEO_MODE` | `sample`（默认）\| `live` |
| `DEEPGEO_API_BASE` | 查询域，默认 `https://api.deepgeo.org.cn` |
| `DEEPGEO_AUTH_BASE` / `DEEPGEO_GLOBAL_API_BASE` | 认证域，默认 `https://global-api.deepgeo.org.cn` |
| `DEEPGEO_TOKEN_URL` | 完整 token URL；默认 `{AUTH}/api/v1/token` |
| `DEEPGEO_ACCESS_TOKEN` | 优先；有则跳过登录 |
| `DEEPGEO_PHONE` / `DEEPGEO_USER` | 登录 phone（USER 兼容旧名） |
| `DEEPGEO_PASS` | 登录 password |
| `DEEPGEO_QUERY_PATH` | 默认 `/api/v1/query/reference` |
| `DEEPGEO_DETAIL_PATH` / `DEEPGEO_DETAIL_URL` | detail 路径或完整 URL |
| `DEEPGEO_ALLOW_SAMPLE_FALLBACK` | `live` 失败时韩后是否仍可 demo_auto |
| `DEEPGEO_USE_PLAYWRIGHT` | `1` 时明确失败（待 Chrome 镜像） |

## 兼容
- `triggerVisAuto` / `suggestVisWords` → 只推词
- `applyVisGrid` → provider=`deepgeo`\|`demo_auto`
- `saveVisManual` → 失败兜底

## 前端
Scoring 维度四默认 `autoStart`：进入即 `runDeepgeoVis`；主按钮「DeepGEO 自动查并回填」；仅失败展开人工九格。
