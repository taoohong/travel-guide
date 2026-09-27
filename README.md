# 出国旅行宝典

出国旅行规划与目的地信息小程序，采用 pnpm monorepo 管理 API、管理后台、小程序和共享业务包。

## 项目结构

- `apps/api`：NestJS API、Prisma schema 与数据库迁移
- `apps/admin`：React + Vite 内容管理后台
- `apps/miniapp`：Taro 微信小程序
- `apps/mobile`：React Native 客户端基础工程
- `packages`：共享类型、常量、API 客户端与业务规则
- `docs`：需求、架构、数据模型、API、测试和运维文档

## 本地环境

- Node.js 22 或更高版本
- pnpm 10.33.2

安装依赖：

```sh
pnpm install
```

按需从 `.env.example` 复制本地配置：API 配置位于 `apps/api/.env`，小程序配置位于 `apps/miniapp/.env`。请使用本地开发凭据；不要把 `.env`、生产密钥或数据库备份提交到仓库。

在微信开发者工具中导入 `apps/miniapp`。开发时确认 `TARO_APP_API_BASE_URL` 指向当前设备可访问的 API 地址。

## 常用命令

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build                 # API
pnpm admin:build           # Admin production build
pnpm build:miniapp         # WeChat mini program build
pnpm prod                  # Production builds for API, Admin, and mini program
pnpm api:prisma:generate
```

开发服务：

```sh
pnpm --filter @travel-guide/api dev
pnpm admin:dev
pnpm dev:miniapp
```

## 文档

- [需求与技术设计](docs/01-出国旅行宝典_完整项目需求与技术设计报告_V2.1.md)
- [架构说明](docs/02-架构说明.md)
- [数据模型](docs/03-数据模型.md)
- [API 设计](docs/04-API设计.md)
- [开发计划](docs/05-开发计划.md)
- [测试说明](docs/06-测试说明.md)
- [部署与运维](docs/07-部署与运维.md)

生产环境变量模板只用于说明配置项。真实密钥、数据库连接凭据和生产 `.env` 应单独保存在服务器，不应放进代码包或 Git 仓库。
