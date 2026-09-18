# 桌游吧社交平台

面向桌游爱好者，提供桌游库管理、组局拼车和战绩追踪的社交化桌游吧运营平台。

## Docker Compose 快速启动

首次启动前复制环境变量文件：

```bash
cp .env.example .env
docker compose up -d
```

访问地址：

- 前端：http://localhost:28512
- 后端健康检查：http://localhost:29512/health
- API 示例：http://localhost:28512/api/overview

## 项目主要功能

- 桌游库管理与分类：录入桌游信息（名称、类型、适合人数、时长、难度、简介），上传封面图，按类型（策略/聚会/角色扮演/卡牌）分类管理，记录库存数量。
- 组局拼车与缺人招募：玩家发起组局（选择桌游、时间、人数），发布到拼车广场招募队友，其他玩家可报名加入，满员后自动锁定。
- 战绩记录与排行榜：记录每局桌游的参与者、胜负结果、时长，生成个人胜率排行榜和常用桌游统计，玩家可查看自己的桌游生涯数据。
- 包厢预约与会员储值：展示桌游吧包厢信息（容纳人数、设施、时价），按时段预约，**同一包厢重叠时段只能成功一单，时段冲突或余额不足整次拒绝（不生成预约、不扣款）**；到店结算按会员等级折扣原子扣款、按实付金额累计积分（实付 1 元 = 1 分），余额 / 积分 / 预约状态一起变化，**重复结算只生效一次（幂等）**。页面展示每日空档、预约记录与结算记录，数据持久化，刷新 / 重启可回读。
- 活动赛事发布：门店发布桌游赛事活动（如狼人杀锦标赛、剧本杀推理赛），玩家报名参赛，系统自动分组和记录比赛成绩，颁发虚拟奖牌。

### 包厢预约与会员结算接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/booking/state` | 包厢、会员、全部预约与结算记录（页面刷新回读） |
| GET | `/api/booking/availability?date=YYYY-MM-DD` | 指定日期各包厢 09:00-23:00 逐小时空档 / 占用 |
| POST | `/api/booking/reservations` | 发起预约（冲突或余额不足返回 409，整次拒绝） |
| POST | `/api/booking/reservations/:id/settle` | 到店结算（重复调用返回 `idempotent: true`，不重复扣款） |
| POST | `/api/booking/members/:id/recharge` | 会员储值（演示辅助） |
| POST | `/api/booking/reset` | 重置为演示种子数据（测试辅助） |

并发安全与持久化：后端在单进程内用全局事务临界区串行化所有“读-校验-写”，重叠判断、余额扣减、积分累计、状态翻转都在同一临界区完成；数据原子写入 `backend/data/booking-store.json`（可用环境变量 `BOOKING_DATA_FILE` 覆盖路径）。

真实端到端测试（启动真实 HTTP 服务，实测并发预约 / 余额不足 / 并发重复结算 / 重启回读）：

```bash
cd backend
npm run build
node scripts/e2e-booking.cjs
```

## 本地开发方式

前端：

```bash
cd frontend
npm install
npm run dev
```

后端：

```bash
cd backend
npm install
npm run dev
```

## 技术栈

| 分层 | 技术 |
| --- | --- |
| 前端 | Vue 3 + TypeScript、Element Plus、Vite |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | MongoDB |
| 认证 | JWT |
| 依赖 | Mongoose、bcryptjs |

## 项目目录结构

```text
.
├── backend/              # 后端服务
├── database/             # 数据库脚本
├── frontend/             # 前端应用
├── docker-compose.yml    # 一键部署编排
├── .env.example          # 环境变量示例
└── README.md
```

## 环境变量说明

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| COMPOSE_PROJECT_NAME | Compose 项目名，避免中文目录名导致项目名为空 | lpboardgame |
| DB_NAME | 数据库名称 | app |
| DB_USER | 数据库用户 | app |
| DB_PASSWORD | 数据库密码 | app_pwd |
| DB_ROOT_PASSWORD | 数据库 root 密码 | root_pwd |
| JWT_SECRET | JWT 签名密钥 | change_me_to_a_long_random_string |
| FRONTEND_PORT | 前端宿主机端口 | 28512 |
| BACKEND_PORT | 后端宿主机端口 | 29512 |
| DB_PORT | 数据库宿主机端口 | 27017 |

## Docker 部署说明

- 使用 `docker compose up -d` 启动，不需要额外传入 `-p`。
- `docker-compose.yml` 顶层已声明 `name: lpboardgame`，并且 `.env` 包含 `COMPOSE_PROJECT_NAME=lpboardgame`，可在中文目录名下启动。
- 数据库数据保存在命名卷 `db_data` 中，不依赖当前目录名。
- 前端容器由 Nginx 托管静态资源，并把 `/api/` 反向代理到 `backend:29512`。
- 若本地端口冲突，可修改 `.env` 中的 `FRONTEND_PORT`、`BACKEND_PORT`、`DB_PORT`。

常用命令：

```bash
docker compose config --quiet
docker compose ps
docker compose down
```

## License

MIT
