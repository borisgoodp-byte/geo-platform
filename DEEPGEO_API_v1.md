# DeepGEO 维度四 API（后端 v1.1 · 服务端真查）

## 推荐默认路径（P0 自动化）
`diagnostics.runDeepgeoAuto({ projectId, diagnosticId, persist?: true })`

1. 服务端推决策/场景/对比词（不问用户）
2. 按 `DEEPGEO_MODE` 查九格：
   - `sample`：韩后全 miss 样例（默认，无账号可联调）
   - `live`：`DEEPGEO_USER` + `DEEPGEO_PASS` + `DEEPGEO_BASE_URL` 走站点 XHR 登录/查询
3. `persist=true` 时直接定档落库；也返回 `cells` 供前端展示
4. 失败：TRPCError，message 含 `fallback=saveVisManual`

## 环境变量（Railway web 服务）
| 变量 | 说明 |
|------|------|
| `DEEPGEO_MODE` | `sample` \| `live` |
| `DEEPGEO_BASE_URL` | 如 `https://www.deepgeo.org.cn` |
| `DEEPGEO_USER` / `DEEPGEO_PASS` | 登录账号 |
| `DEEPGEO_LOGIN_PATH` | 默认 `/api/auth/login`（可按真实 XHR 改） |
| `DEEPGEO_QUERY_PATH` | 默认 `/api/geo/query` |
| `DEEPGEO_USE_PLAYWRIGHT` | `1` 时启用浏览器路径（需镜像含 Chrome，本轮默认关） |

## 兼容旧路径
- `triggerVisAuto` / `suggestVisWords` → 只推词
- `applyVisGrid` → 外部已查完后落库
- `saveVisManual` → 失败兜底

## 权限
写保护下轮统一：`operator` / `lead`；`client` 不可。
