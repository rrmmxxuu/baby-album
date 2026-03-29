# 测试部署指南

[English Version](test-deploy.md)

这份文档用于 Baby Album 首次公开测试时，在单台云主机上的部署。

## 拓扑

- `web`：公网 Next.js 前端
- `api`：公网 Go 控制面
- `postgres`：API 持久化数据库
- `agent`：可以临时同机跑做烟雾验证；真实测试时建议放在 NAS 或家里的服务器上

## 推荐的首次部署规格

- 云主机：2 vCPU、4 GB RAM、40 GB SSD
- 系统：Ubuntu 24.04 LTS 或 Debian 12
- 反向代理：Caddy 或 Nginx
- TLS：在反向代理层终止
- DNS：前端和 API 可以分成两个域名

## 环境配置

1. 把 `deploy/vps/.env.example` 复制成 `deploy/vps/.env`
2. 设置 `NEXT_PUBLIC_API_BASE_URL` 为你的公开 API 地址
3. 设置 `DATABASE_URL` 为生产 PostgreSQL 连接串
4. 设置 `CACHE_ROOT` 指向云主机上的持久化目录
5. 如果 NAS agent 单独部署在别的机器上，它的 API 地址请单独在 `deploy/agent` 那边配置

## 首次启动

```bash
cd deploy/vps
docker compose up --build -d
```

然后验证：

- 你的反代前端域名能正常打开
- 在 VPS 上执行 `curl -fsS http://127.0.0.1:18080/api/v1/healthz` 能成功
- 用户可以注册、创建相册、生成邀请码并上传媒体
- `docker compose logs api` 中每个请求都有一条包含 `request_id` 的 JSON 日志

## 每次升级前的备份

先创建一个备份目录：

```bash
mkdir -p ~/baby-album-backups/$(date +%F-%H%M%S)
BACKUP_DIR="$(ls -td ~/baby-album-backups/* | head -n 1)"
```

备份 PostgreSQL：

```bash
docker compose exec -T postgres pg_dump -U baby_album baby_album > "$BACKUP_DIR/postgres.sql"
```

备份 API blob 缓存卷：

```bash
docker run --rm \
  -v baby-album-vps_media-cache:/from:ro \
  -v "$BACKUP_DIR":/to \
  alpine sh -lc 'cd /from && tar -czf /to/media-cache.tar.gz .'
```

备份配置：

```bash
cp .env "$BACKUP_DIR/.env"
```

如果 NAS agent 跑在另一台机器上，也要在那台机器上额外备份它的 `AGENT_LIBRARY_ROOT`，包括 `.agent-state.json`。

## 发布流程

拉最新代码并重建：

```bash
git pull
cd deploy/vps
docker compose up --build -d
```

验证服务：

```bash
curl -fsS http://127.0.0.1:3000 >/dev/null
curl -fsS http://127.0.0.1:18080/healthz
curl -fsS http://127.0.0.1:18080/api/v1/healthz
docker compose ps
```

然后手工跑一遍主链路：

1. 注册或登录
2. 创建相册或进入已有相册
3. 打开照片页和设置页，再返回
4. 上传一张照片，并等待它出现在时间线里
5. 生成一个邀请码
6. 退出登录再重新登录

如果你本地有测试环境，建议在公开发布前先跑自动化浏览器测试：

```bash
./scripts/test-e2e.sh
```

## 回滚

如果新版本失败，切回上一版并重启：

```bash
git checkout <previous-commit>
cd deploy/vps
docker compose up --build -d
```

如果还需要恢复数据：

1. 用 `docker compose down` 停掉服务
2. 把 `postgres.sql` 恢复回 PostgreSQL
3. 恢复 `media-cache.tar.gz`
4. 如果 NAS 端数据发生了变化，也恢复它的媒体库和 `.agent-state.json`
5. 启动服务并重新做健康检查

## 当前版本的已知限制

- API 启动时仍会自动执行数据库迁移
- 认证仍然基于 bearer token，部分媒体访问仍会使用 query token
- PWA 现在会缓存静态壳资源并支持更新提示，但还不是离线优先产品

## 当前测试版的安全限制

- 密码哈希强度适合测试，不适合最终公网生产
- 认证仍然是 bearer token 模式，预览图片目前也接受 token query 参数
- blob 缓存目前仍在云主机本地磁盘，不是对象存储

## 下一步生产加固方向

- 把密码哈希升级到 Argon2id 或 bcrypt
- 把认证改成安全的 HTTP-only cookie，或短期 access token + refresh token
- 增加签名预览地址，或者改成受 cookie 保护的媒体接口
- 增加 HTTPS 反向代理配置模板
- 为 PostgreSQL 和云主机 blob 缓存补充更完整的备份流程
