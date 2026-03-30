# VPS 部署指南

[English Version](vps-deploy.md)

这份指南对应你的目标部署形态：

- Ubuntu VPS
- Docker + Docker Compose
- Nginx Proxy Manager
- Cloudflare DNS
- 一个公开前端域名 + 一个公开 API 域名

## 推荐拓扑

建议使用两个域名：

- `album.ramonxu.com` -> Baby Album Web
- `album-api.ramonxu.com` -> Baby Album API

NAS agent 不要放在 VPS 里常驻。它应该放在家里，通过出站 HTTPS 主动连接公网 API。

## 1. Cloudflare DNS

在 Cloudflare 里创建两个指向 VPS 公网 IP 的记录：

- `album`
- `album-api`

第一次联通性验证时，建议先走 DNS only，这样可以少一层代理变量，便于排查上传和预览问题。

## 2. 服务器环境变量

把 `deploy/vps/.env.example` 复制成 `.env`，至少填写这些：

```env
NEXT_PUBLIC_API_BASE_URL=https://album-api.ramonxu.com
WEB_IMAGE=ghcr.io/rrmmxxuu/baby-album-web
API_IMAGE=ghcr.io/rrmmxxuu/baby-album-api
IMAGE_TAG=main
WEB_PORT=3000
API_PORT=18080
POSTGRES_PORT=15432
POSTGRES_DB=baby_album
POSTGRES_USER=baby_album
POSTGRES_PASSWORD=REPLACE_ME
API_ADDR=:8080
DATABASE_URL=postgres://baby_album:REPLACE_ME@postgres:5432/baby_album?sslmode=disable
CACHE_ROOT=/var/lib/baby-album/cache
MAX_UPLOAD_MB=512
ALLOWED_ORIGINS=https://album.ramonxu.com
```

VPS 的正式部署文件都在 `deploy/vps`，不要再用仓库根目录那套本地联调 compose。

如果你既有正式域名，又有临时预览域名，可以在 `ALLOWED_ORIGINS` 里用逗号分隔多个域名。

如果想让 VPS 一直跟随 `main` 的最新镜像，就保持 `IMAGE_TAG=main`。如果想固定某次发布或执行回滚，就把它改成对应的 `sha-*` 标签。

## 3. GitHub Actions 配置

先配置这些 GitHub 仓库变量：

- `PROD_NEXT_PUBLIC_API_BASE_URL`：发布 web 镜像时写入的公开 API 域名
- `PROD_SSH_HOST`：VPS 的主机名或 IP
- `PROD_SSH_PORT`：可选 SSH 端口，默认 `22`
- `PROD_SSH_USER`：发布 workflow 使用的 SSH 用户
- `PROD_DEPLOY_PATH`：VPS 上保存部署 `.env` 的目录
- `PROD_COMPOSE_FILES`：默认填 `-f docker-compose.yml`；如果使用 NPM override，就填 `-f docker-compose.yml -f docker-compose.npm.yml`
- `GHCR_READ_USER`：拥有 GHCR 读取 token 的 GitHub 用户名

再配置这些 GitHub 仓库 secrets：

- `PROD_SSH_KEY`：`Deploy Production` workflow 使用的 SSH 私钥
- `GHCR_READ_TOKEN`：给 VPS 用来拉 GHCR 镜像的 `read:packages` token

`Deploy Production` workflow 每次发布都会把 `deploy/vps/docker-compose.yml` 和 `deploy/vps/docker-compose.npm.yml` 同步到 `PROD_DEPLOY_PATH`。VPS 上的 `.env` 也应该放在这个目录里。

## 4. 给 NPM 准备共享 Docker 网络

如果 Nginx Proxy Manager 也是 Docker 跑的，先创建一次外部网络：

```bash
docker network create npm_net
```

然后启动 Baby Album：

```bash
cd deploy/vps
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.npm.yml pull
docker compose -f docker-compose.yml -f docker-compose.npm.yml up -d
```

这样 `baby-album-web` 和 `baby-album-api` 会加入和 NPM 相同的 Docker 网络，NPM 可以直接按服务名反代，而不是走宿主机端口。

如果 GHCR 镜像是私有的，第一次拉取前先在 VPS 上执行一次 `docker login ghcr.io`。

## 5. 配置 Nginx Proxy Manager

建两个代理主机。

### Web 代理

- Domain: `album.ramonxu.com`
- Scheme: `http`
- Forward host: `baby-album-web`
- Forward port: `3000`
- Websockets: 开启
- Block common exploits: 开启
- SSL: 申请 Let's Encrypt，并强制 HTTPS

### API 代理

- Domain: `album-api.ramonxu.com`
- Scheme: `http`
- Forward host: `baby-album-api`
- Forward port: `8080`
- Websockets: 开启
- Block common exploits: 开启
- SSL: 申请 Let's Encrypt，并强制 HTTPS

如果你更喜欢让 NPM 反代宿主机端口，也可以不使用 `docker-compose.npm.yml`，直接把目标指向 `127.0.0.1:3000` 和 `127.0.0.1:18080`。

## 6. 验证

NPM 配好之后，检查这些地址：

- `https://album.ramonxu.com`
- `https://album-api.ramonxu.com/healthz`
- `https://album-api.ramonxu.com/api/v1/healthz`

然后验证产品主链路：

1. 注册用户
2. 创建相册
3. 确认宝宝资料和相册都创建成功
4. 生成邀请码
5. 上传一张图片
6. 确认时间线能在公开 Web 域名下正常加载

同时确认 API 结构化日志正常输出：

```bash
docker compose logs --tail=20 baby-album-api
```

每条请求日志都应该至少包含 `request_id`、path、status 和 `duration_ms`。

## 7. 每次发布前先备份

先创建一个时间戳备份目录：

```bash
mkdir -p ~/baby-album-backups/$(date +%F-%H%M%S)
BACKUP_DIR="$(ls -td ~/baby-album-backups/* | head -n 1)"
```

备份 PostgreSQL：

```bash
docker compose exec -T postgres pg_dump -U baby_album baby_album > "$BACKUP_DIR/postgres.sql"
```

备份 API 缓存卷：

```bash
docker run --rm \
  -v baby-album-vps_media-cache:/from:ro \
  -v "$BACKUP_DIR":/to \
  alpine sh -lc 'cd /from && tar -czf /to/media-cache.tar.gz .'
```

备份环境文件：

```bash
cp .env "$BACKUP_DIR/.env"
```

在家里的 NAS 或 Linux 机器上，也要备份：

- 完整的 `AGENT_LIBRARY_ROOT`
- 该目录里的 `.agent-state.json`
- 如果你用了 `deploy/agent/config/agent.json`，也把它一起备份

## 8. 发布流程

推荐的正式发布路径：

1. 把已经验证过的提交合并到 `main`
2. 等 `CI` workflow 里的 `Publish Images` job 把新的 `main` 和 `sha-*` 标签推到 GHCR
3. 运行 `Deploy Production` workflow，并输入你要发布的那个不可变 `sha-*` 标签
4. workflow 成功结束后，再做下面的健康检查

检查健康状态：

```bash
curl -fsS https://album-api.ramonxu.com/healthz
curl -fsS https://album-api.ramonxu.com/api/v1/healthz
docker compose ps
```

再跑一遍公开主链路：

1. 打开 Web 域名
2. 登录
3. 在照片页和设置页之间切换
4. 上传一张图片
5. 确认 agent 处理后预览能出现
6. 生成邀请码
7. 退出再重新登录

如果你本地或预发环境可用，建议在 VPS 升级前先跑自动化浏览器测试：

```bash
./scripts/test-e2e.sh
```

如果你需要在 VPS 上手工兜底发布，就把 `.env` 里的 `IMAGE_TAG` 改成目标版本，然后执行和 `PROD_COMPOSE_FILES` 一致的那组 Compose 命令：

```bash
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d
```

如果你启用了 NPM override，就给两条命令都追加 `-f docker-compose.npm.yml`。

## 9. 回滚

如果发布失败：

1. 先看 `docker compose logs baby-album-api baby-album-web`
2. 用上一个 `sha-*` 镜像标签重新执行一次 `Deploy Production`，或者在 VPS 上手动把 `IMAGE_TAG` 改回去
3. 用和 `PROD_COMPOSE_FILES` 一致的那组 Compose 命令重新拉镜像，例如 `docker compose -f docker-compose.yml pull`
4. 再用对应的 `docker compose ... up -d` 命令启动上一版镜像
5. 再跑一次健康检查和公开链路烟雾验证

如果还需要恢复数据：

1. 停掉服务
2. 恢复 `postgres.sql`
3. 恢复 `media-cache.tar.gz`
4. 恢复 NAS 媒体库备份和 `.agent-state.json`
5. 再启动服务

## 10. 家里 NAS 上的 agent

NAS agent 是独立部署的，目录在 `deploy/agent`。迁到家里后，至少要配置：

- `AGENT_API_BASE_URL=https://album-api.ramonxu.com`
- `AGENT_PAIRING_CODE`，用于首次配对
- `AGENT_LIBRARY_ROOT`，指向 NAS 本地媒体库目录

家里的 agent 只需要能出站访问 API 域名，不需要公网入站。

每次 `main` 推送后，GitHub Actions 也会发布 `ghcr.io/rrmmxxuu/baby-album-agent`。NAS 侧升级先保持手工执行：

```bash
cd deploy/agent
docker compose pull
docker compose up -d
```

## 11. 当前生产注意事项

- API 启动时仍会自动执行数据库迁移
- 认证仍是 bearer token 模式，部分预览图 / 原图访问仍带 token URL
- PWA 现在只缓存静态资源并支持更新提示，还不支持完整离线浏览
