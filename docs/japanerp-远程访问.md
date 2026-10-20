# japanerp.com 远程访问（Xray VLESS + WS）

> 本文**不含**任何机密。UUID、WS 路径和 vless 链接只存在于：Windows `C:\xray\config.json`、Lightsail `app.conf`、用户桌面 `C:\Users\maxinjian\Desktop\vpn-japanerp\`。不要写进 git 或 docs。

建于 2026-10-20。用途：用户在中国时代替失效的商用 VPN，用日本网络上外网，同时访问内网 ERP。

## 架构

```
客户端(v2rayN / Clash Verge / Shadowrocket)
  └─ TLS 443, SNI/Host japanerp.com, WebSocket 路径 /ws-<随机16位>
     → Cloudflare（未改任何设置，WS 默认放行）
     → Lightsail 东京 nginx（容器 japan-erp-nginx，app.conf 中 `location = /ws-…`）
     → Tailscale → Windows 100.120.180.90:10808（Xray，VLESS 入站，只监听 Tailscale IP）
     → freedom 出站：日本网络（SoftBank）/ tailnet 100.64.0.0/10 / 局域网 192.168.3.0/24
```

- Xray-core v26.3.27（官方 release，SHA256 已核对），目录 `C:\xray`。
- 配置 `C:\xray\config.json`：VLESS + ws，`decryption: none`，访问日志关闭，错误日志 `C:\xray\error.log`。
- 自启动：计划任务 `xray-japanerp`（当前用户登录时启动，普通权限）→ `C:\xray\watchdog.ps1` 循环拉起 `xray.exe`，退出 5 秒后重启，记录在 `C:\xray\watchdog.log`。**需要 Windows 处于登录状态**（与 api-core 等服务相同）。
- 防火墙：当前会话没有管理员权限，未新增规则。Tailscale 网卡是 Private 配置文件，已有的 `Tailscale-In` 规则允许其上的入站流量；局域网网卡（Public）因 Xray 只绑定 100.120.180.90 而无法访问。若要单独加规则，需管理员 PowerShell：
  ```powershell
  New-NetFirewallRule -DisplayName 'xray-japanerp (Tailscale)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 10808 -InterfaceAlias Tailscale -Program C:\xray\xray.exe
  ```

验证（2026-10-20）：首页 200；WS 路径普通 GET 400、Upgrade 101；端到端出口 IP 为日本 SoftBank，google 200，`100.120.180.90:3000`/`:4000` 均 200。

## 客户端

导入文件与说明见桌面 `vpn-japanerp\使用说明.txt`：
- **v2rayN**：剪贴板导入 `link.txt`，路由「绕过大陆」。
- **Clash Verge Rev**：导入本地配置 `clash-verge.yaml`（国内直连，其余与 tailnet/局域网走日本）。
- **Shadowrocket / v2rayNG**：扫 `qr.png`。
- 客户端需 ALPN `http/1.1`（nginx 开了 http2，WS 需走 HTTP/1.1；链接里已带）。

## 换 UUID / 换路径

1. 生成新 UUID：`[guid]::NewGuid()`；改 `C:\xray\config.json` 里 `clients[0].id`（换路径则改 `wsSettings.path`）。
2. `C:\xray\xray.exe run -test -c C:\xray\config.json` 通过后 `Stop-Process -Name xray`（watchdog 5 秒内用新配置拉起）。
3. 换了路径的话，还要改 Lightsail `app.conf` 中 `# ── xray-japanerp` 下的 `location = /ws-…`，然后 `docker exec japan-erp-nginx nginx -t && docker exec japan-erp-nginx nginx -s reload`。
4. 重新生成链接/二维码，发给用户，旧链接即失效。

## 停用

- 临时：`Disable-ScheduledTask xray-japanerp; Stop-ScheduledTask xray-japanerp; Get-Process powershell | ? { $_.CommandLine -like '*watchdog.ps1*' } | Stop-Process; Stop-Process -Name xray`
- 恢复：`Enable-ScheduledTask xray-japanerp; Start-ScheduledTask xray-japanerp`
- 彻底删除：上面停用后 `Unregister-ScheduledTask xray-japanerp -Confirm:$false`，删 `C:\xray`，再执行下面的 nginx 回滚。

## nginx 回滚

改动前的备份：`/home/ubuntu/japan-erp/deploy/nginx/conf.d/app.conf.bak.pre-xray-20261020-143202`。

```bash
ssh -i C:\Users\maxinjian\.ssh\lightsail-tokyo.pem ubuntu@13.158.114.4
cd /home/ubuntu/japan-erp/deploy/nginx/conf.d
cp -p app.conf.bak.pre-xray-20261020-143202 app.conf
docker exec japan-erp-nginx nginx -t && docker exec japan-erp-nginx nginx -s reload
```

只新增了一个 `location` 块（`# ── xray-japanerp` 注释起，13 行），其余配置、haproxy、frps、Cloudflare 均未改。注意：仓库里的 `deploy/lightsail/nginx/app.conf` **没有**这个块（含机密路径）；以后用仓库版本覆盖服务器 app.conf 时，会把 VPN 一并去掉，需手动补回。
