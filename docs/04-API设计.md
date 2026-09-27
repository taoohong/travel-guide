# API 设计

> 所有接口前缀为 `/api/v1`。客户端**不直接访问数据库**，一律经由本层。

---

## 1. 响应约定

### 1.1 成功

```json
{
  "success": true,
  "data": { },
  "requestId": "0f3c8a1e-...",
  "timestamp": "2026-09-20T10:35:00.000Z"
}
```

### 1.2 失败

```json
{
  "success": false,
  "code": "VALIDATION_FAILED",
  "message": "国家代码必须是两位大写字母，例如 JP",
  "details": { "issues": [{ "path": "countryCode", "message": "必须是两位大写字母" }] },
  "requestId": "0f3c8a1e-...",
  "timestamp": "2026-09-20T10:35:00.000Z"
}
```

**`code` 是稳定的机器可读错误码**，客户端据此分支；`message` 才用于展示。
5xx 的 `message` 一律是通用文案，绝不泄漏 SQL、路径或堆栈。

每个响应都带 `X-Request-Id` 头，便于用户报错时定位日志。

### 1.3 错误码表

| code | HTTP | 含义 |
|---|---|---|
| `VALIDATION_FAILED` | 400 | 入参不合法（`details.issues` 为字段级明细） |
| `UNAUTHORIZED` | 401 | 未登录或登录态失效 |
| `FORBIDDEN` | 403 | 无权限（与 401 区分：不应跳登录页） |
| `NOT_FOUND` | 404 | 记录不存在 |
| `CONFLICT` | 409 | 业务冲突（如状态机非法流转） |
| `DUPLICATE_CONTENT` | 409 | 唯一约束冲突（Prisma P2002） |
| `FILE_NOT_FOUND` | 400 | 未选择文件 |
| `FILE_TOO_LARGE` | 413 | 文件超过 5MB |
| `FILE_TYPE_UNSUPPORTED` | 422 | 格式不支持或魔数校验失败 |
| `IMAGE_PROCESS_FAILED` | 422 | 解码 / 压缩 / 落盘失败 |
| `REQUEST_TIMEOUT` | 408 | 请求超时 |
| `INTERNAL_ERROR` | 500 | 未归类的内部错误 |

---

## 2. 健康检查

```http
GET /api/v1/health
GET /api/v1/health/live
```

数据库不可用时返回 **200 + `status: 'degraded'`**，而不是 5xx——
探活失败会让负载均衡摘掉实例，损失比「数据库短暂抖动」大得多。

```json
{ "status": "ok", "uptimeSeconds": 128, "version": "0.1.0", "database": "unknown", "timestamp": "..." }
```

---

## 3. 内容版本（文档 52 / 53 章）

### 获取分模块版本

```http
GET /api/v1/content/version
```

```json
{ "country": 12, "visa": 28, "attraction": 53, "transport": 18, "packing": 9, "travelTip": 14, "city": 3 }
```

客户端流程：读本地版本 → 请求本接口 → **逐模块比较** → 只刷新变化的模块。

### 上报本地版本并获取差异

```http
POST /api/v1/content/version/diff
Content-Type: application/json

{ "local": { "country": 12, "visa": 27, "attraction": 53 } }
```

```json
{
  "diffs": [
    { "module": "country", "local": 12, "server": 12, "changed": false },
    { "module": "visa", "local": 27, "server": 28, "changed": true }
  ],
  "changedModules": ["visa"]
}
```

> **客户端注意**：必须先拉取模块数据成功，**再**把本地版本号更新为服务端值。
> 顺序写反会导致请求失败时本地版本已"新"，永久展示旧内容。

---

## 4. 目的地

```http
GET /api/v1/continents
GET /api/v1/countries?continentCode=AS&keyword=日本
GET /api/v1/countries/:code
GET /api/v1/countries/:code/cities
```

`countries` 返回的 `completeness` 是内容完整度（0～100），后台首页据此排序。

---

## 5. 签证（文档 9.2 / 25 章）

### 客户端查询

```http
GET /api/v1/visa/:passportRegion/:countryCode
```

```http
GET /api/v1/visa/CN/JP
```

```json
{
  "policy": {
    "passportRegion": "CN",
    "destinationCountryCode": "JP",
    "visaType": "VISA_REQUIRED",
    "title": "需提前办理单次旅游签证，最长停留 15 天",
    "corePolicy": ["需通过指定代办机构递交材料"],
    "maxStayDays": 15,
    "fee": { "amount": 200, "currency": "CNY", "note": "单次" },
    "processingTime": "5～10 个工作日",
    "requirements": [
      {
        "title": "护照原件",
        "description": "有效期至少 6 个月",
        "required": true,
        "sortOrder": 1,
        "planMapping": {
          "actionable": true, "targetStage": "PREPARING",
          "itemType": "VISA_MATERIAL", "scope": "TRIP", "dedupeKey": "passport"
        }
      }
    ],
    "notes": ["入境时可能被要求出示返程机票"],
    "sourceName": "日本驻华大使馆",
    "lastVerifiedAt": "2026-09-20",
    "status": "PUBLISHED",
    "version": 1
  },
  "matchLevel": "exact",
  "expired": false,
  "daysSinceVerified": 0,
  "advice": { "level": "prepare", "text": "需提前办理签证，请尽早准备材料并预约递签" },
  "freshnessMessage": "该政策 0 天前已确认",
  "available": true
}
```

**重要行为**：

- `matchLevel` 取值 `exact` / `region-fallback` / `global-fallback` / `none`；
- **无数据时返回 HTTP 200 + `available: false`**，而不是 404——
  「这个国家还没维护签证」是正常业务状态，客户端应展示空状态而非错误提示；
- 同一接口用 `SG` 替换 `CN` 会返回免签，这是验证「签证不是 Country → Visa」的最快方式。

### 后台维护

```http
GET    /api/v1/admin/visa                      # 列表（含新鲜度）
POST   /api/v1/admin/visa                      # 新增或更新（需要 content:update）
DELETE /api/v1/admin/visa/:passportRegion/:countryCode
GET    /api/v1/admin/visa/freshness            # 过期体检清单
```

`POST` 保存成功后**只递增 `visa` 模块版本**，其余模块版本不变——
这正是「客户端只刷新签证缓存」的实现点。

保存时若政策不完整（缺 `corePolicy` / `sourceName` / `lastVerifiedAt`，
或 `visaType = VISA_REQUIRED` 但没有材料）会被拒绝并列出缺口。

---

## 6. Trip 与计划（文档 58 章 + `＋/✓` 交互）

### Trip

```http
POST   /api/v1/trips
GET    /api/v1/trips?page=1&pageSize=20
GET    /api/v1/trips/:tripId                     # 含 stats
PATCH  /api/v1/trips/:tripId                     # 标题 / 备注 / 状态
POST   /api/v1/trips/:tripId/stage-confirm       # 用户确认阶段切换
POST   /api/v1/trips/:tripId/destinations
DELETE /api/v1/trips/:tripId/destinations/:destinationId
```

**状态机**：`DRAFT → PREPARING → DEPARTING → TRAVELING → RETURNING → COMPLETED`，
允许回退一步，**禁止跨越式跳跃**（`PREPARING → COMPLETED` 返回 409）。

**阶段切换**（文档 15 章）走 `stage-confirm`，请求体 `{ "stage": "DEPARTING" }`，
语义是「用户已确认」，因此状态被写入后不再被日期推断覆盖。

### 计划项

```http
GET    /api/v1/trips/:tripId/plan-items
POST   /api/v1/trips/:tripId/plan-items          # 点击 ＋
POST   /api/v1/trips/:tripId/plan-items/batch    # 批量加入
PATCH  /api/v1/trips/:tripId/plan-items/:planItemId
DELETE /api/v1/trips/:tripId/plan-items/:planItemId   # 点击 ✓
POST   /api/v1/trips/:tripId/plan-items/state    # 批量查询 ＋/✓ 状态
```

#### 点击 `＋` 的请求体

```json
{
  "stage": "PREPARING",
  "itemType": "VISA_MATERIAL",
  "scope": "TRIP",
  "title": "护照原件",
  "description": "有效期至少 6 个月",
  "sourceType": "GUIDE",
  "sourceId": "passport",
  "sourceCountryCode": null,
  "dedupeKey": "passport"
}
```

#### 幂等语义（**关键**）

```json
{ "created": true,  "planItem": { "id": "plan_..." }, "toast": "已加入准备计划" }
{ "created": false, "planItem": { "id": "plan_..." }, "toast": "已在准备计划中" }
```

重复点击 `＋` **返回 200 且 `created: false`**，不抛 409。
原因是用户重复点击很常见（网络慢、手抖），抛错会让客户端弹一个"重复"的红色错误条，体验很差。

`scope = "COUNTRY"` 时必须带 `sourceCountryCode`，否则 400——
这是防止不同国家的同名景点互相去重。

#### 点击 `✓`

```json
{
  "removed": { "id": "plan_...", "title": "护照原件", "stage": "PREPARING", "dedupeKey": "passport" },
  "undoHint": { "action": "POST", "path": "/trips/t1/plan-items", "payload": { } }
}
```

响应带完整快照，客户端用 `undoHint.payload` 再调一次 `POST` 即可完成撤销
（dedupeKey 保证不会产生重复项）。

---

## 7. 景点 / 交通 / 准备事项 / 贴士 / App

```http
GET /api/v1/countries/:code/attractions?cityCode=TYO&category=CULTURE
GET /api/v1/attractions/:attractionId
GET /api/v1/countries/:code/transport
GET /api/v1/countries/:code/packing
GET /api/v1/countries/:code/tips
GET /api/v1/countries/:code/apps
```

每条内容都带 `planMapping`：

```json
{
  "actionable": true,
  "targetStage": "TRAVELING",
  "itemType": "ATTRACTION",
  "scope": "COUNTRY",
  "dedupeKey": null
}
```

**`actionable = false` 的内容客户端不显示 `＋`**（例如「最长停留 60 天」这类纯信息）。

---

## 8. 用户

```http
POST  /api/v1/auth/wechat-login
GET   /api/v1/users/me
PATCH /api/v1/users/me
POST  /api/v1/users/me/avatar
```

小程序提交 `wx.login()` 返回的临时 `code` 和用户主动填写的昵称；服务端向微信换取 `openid` 并签发登录令牌。头像通过 `POST /users/me/avatar` 上传，服务端压缩后保存为静态图片。

```json
{ "nickname": "旅行者", "avatarUrl": "https://api.example.com/static/...webp", "passportRegion": "CN", "showPlanAddGuide": true, "locale": "zh-CN" }
```

- `passportRegion` 决定签证匹配结果，默认 `CN`；
- `showPlanAddGuide` 控制国家详情页的操作提示开关（文档 6 章）。

---

## 9. 媒体上传（文档 30 / 59 章）

```http
POST /api/v1/media/upload
Content-Type: multipart/form-data

file=@photo.jpg
usage=ATTRACTION_COVER
alt=浅草寺
```

```json
{ "url": "https://api.example.com/static/attractions/attraction_cover-...-a1b2c3.webp",
  "width": 1600, "height": 1200, "bytes": 428_331, "mimeType": "image/webp" }
```

后台版本会额外返回压缩对比信息：

```http
POST /api/v1/media/admin/upload-with-stats
```

```json
{
  "asset": { "url": "..." },
  "compression": {
    "originalBytes": 9_017_344, "originalSize": "8.6 MB",
    "finalSize": "418.3 KB", "ratio": 0.048,
    "originalDimensions": "4032×3024", "finalDimensions": "1600×1200",
    "note": "已按规则压缩为 WebP，未保存原图"
  }
}
```

**处理规则**：JPG / JPEG / PNG / WebP，单文件 ≤ 5MB，长边 ≤ 1600px，统一输出 WebP，
**不保存原图**。数据库只保存 URL / path。

---

## 10. 后台其它接口

```http
POST /api/v1/admin/auth/login            # { username, password } → { token, expiresIn, user }
GET  /api/v1/admin/auth/me
GET  /api/v1/admin/operation-logs?page=1&pageSize=20
GET  /api/v1/admin/content-health
GET  /api/v1/admin/trips?page=1&pageSize=20
```

### 鉴权

```http
Authorization: Bearer <token>
```

令牌为 HMAC-SHA256 签名的无状态令牌，默认有效期 8 小时。

登录失败时**账号不存在与密码错误返回完全相同的文案**，避免账号枚举。

### 角色权限（文档 37 章）

| 角色 | 权限 |
|---|---|
| `SUPER_ADMIN` | 全部 |
| `CONTENT_ADMIN` | `content:read` `content:create` `content:update` `media:upload` |
| `REVIEWER` | `content:read` `content:publish` `media:upload` |
| `VIEWER` | `content:read` |

无权限时返回 **403**（而不是 401），客户端应提示"无权限"而不是跳登录页。

---

## 11. 在本地验证核心场景

```bash
# 1) 同一目的地、不同护照结论不同
curl http://localhost:3000/api/v1/visa/CN/JP   # → VISA_REQUIRED
curl http://localhost:3000/api/v1/visa/SG/JP   # → VISA_FREE

# 2) 无数据返回 200 + available:false（不是 404）
curl http://localhost:3000/api/v1/visa/CN/XX

# 3) 点击 ＋ 幂等
curl -X POST http://localhost:3000/api/v1/trips/t1/plan-items \
  -H 'Content-Type: application/json' \
  -d '{"stage":"PREPARING","itemType":"VISA_MATERIAL","scope":"TRIP","title":"护照原件","sourceType":"GUIDE","dedupeKey":"passport"}'
# 再执行一次 → created 变为 false，toast 变为「已在准备计划中」

# 4) 只刷新签证模块
curl -X POST http://localhost:3000/api/v1/content/version/diff \
  -H 'Content-Type: application/json' -d '{"local":{"country":1,"visa":0,"attraction":1}}'
# → changedModules: ["visa"]
```
