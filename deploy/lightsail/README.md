# Lightsail（japanerp.com 公网入口）部署文件

目标机：13.158.114.4（Tailscale 100.73.55.42），用户 `ubuntu`。
**只改 nginx 容器配置与证书续期；不动 haproxy / frps。**

| 文件 | 放到 Lightsail 的位置 | 作用 |
|---|---|---|
| `nginx/app.conf` | `/home/ubuntu/japan-erp/deploy/nginx/conf.d/app.conf` | 反代到 Windows（Tailscale）+ 静态回退 |
| `scripts/tailscale-docker-snat.sh` | `sudo bash` 一次 | 让 nginx 容器能经 tailscale0 访问 Windows；安装开机自启 |
| `scripts/cert-renew.sh` | `/usr/local/sbin/japanerp-cert-renew.sh`（0755） | 证书续期（docker run 形式 + 日志） |
| `cron.d-japanerp-cert-renew` | `/etc/cron.d/japanerp-cert-renew` | 每周一 03:00 调上面脚本 |

应用顺序：
1. `sudo bash tailscale-docker-snat.sh`，然后 `docker exec japan-erp-nginx wget -qO- http://100.120.180.90:4000/api/v1/health` 必须返回 JSON。
2. 立即手动续期一次：`sudo /usr/local/sbin/japanerp-cert-renew.sh && sudo tail -5 /var/log/japanerp-cert-renew.log`。
3. 备份旧 app.conf（`app.conf.bak.$(date +%s)`），复制新 app.conf，`docker exec japan-erp-nginx nginx -t` 通过后 `nginx -s reload`。
4. `curl -sI https://japanerp.com | head -3`（应无 `X-Served-By: static-fallback`，表示正在反代 Windows）。

升级到 V64 时：只需把 `app.conf` 里两个 upstream 的 IP 换成 V64 的 Tailscale IP。

## 清理（用户批准：只留网站 + frp）
`scripts/cleanup-lightsail.sh`：备份旧库存数据 → 删 inventory-api/postgres/redis 容器（保留 volume）→ 删 openvpn/shadowsocks/旧备份 → apt 升级。
执行后 `sudo reboot`，再确认 haproxy / frps / docker / tailscaled / japan-erp-nginx 全部自动恢复。
Lightsail 防火墙里的 7001 端口在 AWS 控制台手动关闭。
