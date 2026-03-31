# Baby Album

[English Version](README.md)

面向家庭自托管的宝宝照片平台。当前测试版重点覆盖 4 条端到端主链路：

- 移动优先的照片时间线与手动上传
- 相册注册、登录、创建相册与宝宝资料初始化
- 相册成员权限、邀请码与角色管理
- 云端控制面加 NAS agent 的出站协作模型

## 仓库结构

- `apps/web`：基于 Next.js 的移动优先 PWA，负责时间线、上传、引导、成员与设置界面
- `services/api`：Go 控制面 API，负责 PostgreSQL 持久化、登录会话、邀请码、上传会话、blob 缓存接入、健康检查与 CORS
- `services/agent`：Go 编写的 NAS 连接器，负责注册、心跳、轮询任务、从 API 下载原图、生成预览并把文件存到本地
- `deploy/vps`：面向生产部署的 Docker Compose，只包含 `web + api + postgres`
- `deploy/agent`：NAS 侧独立部署的 agent Compose
- `docs/architecture.md`：架构与数据流说明
- `docs/test-deploy.md`：单机云主机测试部署说明
- `docs/vps-deploy.md`：Ubuntu + Docker + Nginx Proxy Manager + Cloudflare 的 VPS 部署说明
- `docker-compose.yml`：仅用于本地开发 / 烟雾测试

## 快速开始

1. 复制 `.env.example` 为 `.env`
2. 用 Docker Compose 启 PostgreSQL，或者使用你自己的本地 Postgres
3. 给 API 配置好 `DATABASE_URL` 并启动
4. 启动 agent 并连接到 API
5. 在 `apps/web` 安装依赖并启动 Next.js 前端

## 本地开发

```powershell
# terminal 1
cd E:\qinbaobao\services\api
$env:DATABASE_URL='postgres://baby_album:baby_album@localhost:5432/baby_album?sslmode=disable'
$env:CACHE_ROOT='E:\qinbaobao\tmp\cache'
$env:ALLOWED_ORIGINS='http://localhost:3000'
& 'C:\Program Files\Go\bin\go.exe' run .\cmd\server

# terminal 2
cd E:\qinbaobao\services\agent
$env:AGENT_API_BASE_URL='http://localhost:8080'
$env:AGENT_LIBRARY_ROOT='E:\qinbaobao\tmp\library'
& 'C:\Program Files\Go\bin\go.exe' run .\cmd\agent

# terminal 3
cd E:\qinbaobao\apps\web
npm.cmd run dev
```

## 一键启动本地环境

```bash
./scripts/dev-up.sh 192.168.31.200
```

这会启动：

- 通过 Docker Compose 启动 PostgreSQL
- 在 `:8080` 启动 Go API
- 在 `:3000` 启动 Next.js 前端

如果你也想一起启动 NAS agent，可以先在当前 shell 里传入配对信息或节点凭据：

```bash
export AGENT_PAIRING_CODE='12345678'
./scripts/dev-up.sh 192.168.31.200
```

停止：

```bash
./scripts/dev-down.sh
```

## 浏览器烟雾测试

运行 Playwright 主链路测试：

```bash
./scripts/test-e2e.sh
```

这个脚本会启动 PostgreSQL、API、前端，以及一套可跑测试的 agent 兼容环境，然后执行 `apps/web/e2e` 下的浏览器测试。

## CI/CD

GitHub Actions 现在会覆盖：

- 合并到 `main` 前的 PR：Web 类型检查、Web 单元测试、API 测试、agent 测试，以及三份镜像的构建校验
- 推送到 `main`：先跑同样的检查，再把 `web`、`api`、`agent` 镜像发布到 GHCR，并同时打上 `main` 和 `sha-<shortsha>` 标签
- 手动生产发布：在 `Deploy Production` workflow 里指定一个不可变的 `sha-*` 标签，把 VPS 上的 `web + api` 升级到对应版本

在依赖镜像发布前，先配置仓库变量 `PROD_NEXT_PUBLIC_API_BASE_URL`。Web 会在构建期读取 `NEXT_PUBLIC_API_BASE_URL`，所以如果你更换了公开 API 域名，需要重新发布一版 web 镜像。

## 单机云主机测试部署

仓库现在提供了独立的 VPS 部署目录 `deploy/vps`：

1. 复制 `deploy/vps/.env.example` 为 `deploy/vps/.env`
2. 把 `NEXT_PUBLIC_API_BASE_URL` 改成你的公开 API 域名
3. 把 `ALLOWED_ORIGINS` 改成你的公开前端域名
4. 保持 `IMAGE_TAG=main` 就会跟随 `main` 最新镜像；如果你想固定发布版本或回滚，就改成某个已经发布的 `sha-*` 标签
5. 如果 VPS 上常见端口已被占用，就在 `deploy/vps/.env` 里修改 `WEB_PORT`、`API_PORT`、`POSTGRES_PORT`
6. 如果 GHCR 镜像是私有的，先在 VPS 上用有 `read:packages` 权限的 token 登录一次
7. `cd deploy/vps`
8. 如果 Nginx Proxy Manager 也是用 Docker 跑的，用 `docker compose -f docker-compose.yml -f docker-compose.npm.yml pull && docker compose -f docker-compose.yml -f docker-compose.npm.yml up -d`
9. 否则直接运行 `docker compose pull && docker compose up -d`
10. 再把前端和 API 的公开端口接到你的反向代理上；如果使用 NPM，也可以直接通过共享 Docker 网络按服务名反代

更完整的 VPS 部署说明见 [docs/vps-deploy.zh-CN.md](docs/vps-deploy.zh-CN.md)。

## 运维说明

- API 现在会输出结构化 JSON 日志，包含 `request_id`、路径、状态码、耗时、用户与相册上下文
- Web 会把未处理的运行时错误上报到 `POST /api/v1/client-errors`，服务端会把它记入 API 日志
- PWA 的 service worker 现在会缓存静态壳资源，并在有新版本时提示刷新

## 上传与处理流程

1. Web 先创建只带元数据的上传会话
2. 浏览器把实际文件上传到 `POST /api/v1/upload-sessions/{id}/content`
3. API 把文件写入本地 blob 缓存，并把会话状态标记为 `uploaded`
4. API 为被分配到的 NAS 节点创建一条媒体处理任务
5. NAS agent 轮询任务，并通过 `GET /api/v1/agents/jobs/{id}/blob?nodeId=...` 下载原图
6. NAS agent 把原文件落到自己的本地媒体库
7. 对支持的图片，NAS agent 会生成 JPEG 预览图，并回传到 `POST /api/v1/agents/jobs/{id}/preview?nodeId=...`
8. NAS agent 最终回报处理完成状态，包括宽高、预览状态、预览 blob key 和原始文件路径

## NAS 配对与存储状态上报

1. 相册 owner 或 admin 在网页控制台里生成一个 NAS 配对码
2. 首次部署 NAS 时，配置 `AGENT_API_BASE_URL`、`AGENT_PAIRING_CODE`、`AGENT_NODE_NAME`、`AGENT_LIBRARY_ROOT`
3. agent 调用 `POST /api/v1/storage-nodes/register` 完成注册，控制面会为对应相册创建并绑定存储节点
4. 控制面返回专属 `nodeId` 和 `nodeToken`，agent 会把它们写入 `AGENT_LIBRARY_ROOT` 下的 `.agent-state.json`
5. 后续重启和心跳直接复用保存下来的节点凭据，并持续上报 NAS 文件系统的 `total/free/available` 容量
6. Web 控制台会读取当前相册绑定节点的最新容量状态并显示剩余空间

## Agent Docker Compose

推荐在 NAS 上用 Docker Compose 启动 agent，并直接使用镜像内置的本地控制面完成首次接入。

1. 先准备一个简单的 `.env`，至少包含：
   - `AGENT_IMAGE`
   - `AGENT_IMAGE_TAG`
   - `AGENT_LIBRARY_HOST_PATH`
   - `AGENT_CONFIG_HOST_PATH`
2. 启动 agent：

```bash
cd deploy/agent
docker compose pull && docker compose up -d
```

3. 在家里局域网打开 `http://<nas局域网IP>:8091`
4. 执行 `docker logs baby-album-agent`，找到启动时打印的 bootstrap secret，首次输入后再设置一个本地管理密码
5. 在本地控制面中填写：
   - API Base URL
   - Node Name
   - Pairing Code
6. 首次绑定成功后，面板会自动把 `agent.json` 和节点状态写入挂载出来的配置目录；worker 也会开始处理任务，后续重启只需要 `docker compose up -d`

这套部署会使用：

- 一个挂载出来的媒体库目录，用来存原图
- 一个挂载出来的配置目录，首次 setup 后会在里面写入 `agent.json`、`node-state.json`、`panel-auth.json`、`runtime.json` 和持久化日志
- 一个对局域网暴露的本地管理页面端口

旧的交互式 `agent setup` 仍然保留作为 fallback，但 Docker 场景默认应通过本地控制面完成首次 setup。

### Agent 本地迁盘

当当前 NAS 盘空间不够时，可以先用 migration override 把新盘临时挂进容器：

```bash
cd deploy/agent
docker compose -f docker-compose.yml -f docker-compose.migration.yml up -d
```

其中 `AGENT_MIGRATION_HOST_PATH` 指向新盘路径。

然后：

1. 打开本地控制面，确认迁移目标显示为“已挂载”
2. 点击迁移操作。agent 会自动进入维护模式，等待当前任务完成后复制媒体库并校验结果
3. 页面显示 `awaiting_cutover` 后，把正式的 `AGENT_LIBRARY_HOST_PATH` 改到新盘，去掉 migration override，再重启一次容器
4. 新容器启动后会自动识别切换完成，并恢复正常工作

## 生产说明

当前实现已经不再依赖云端和 NAS 共用文件系统。API 端目前把 blob 缓存放在云主机本地磁盘，这对于第一阶段测试部署已经足够；后面也可以在不改 agent 协议的前提下，平滑换成对象存储。
