#!/usr/bin/env bash
# Lightsail 清理：只保留 网站入口（haproxy + nginx 容器 + 证书）和 frp。
# 用户 2026-10-15 批准「全部照做」。在 Lightsail 上以 ubuntu 用户执行：sudo bash cleanup-lightsail.sh
# 安全措施：先备份旧库存数据到 /home/ubuntu/backup-*，不删 docker volume，不动 haproxy / frps / vpn 证书。
set -uo pipefail
cd /home/ubuntu
STAMP=$(date +%F)

echo "== 1. 备份旧库存栈数据"
if docker exec japan-erp-postgres-prod pg_dumpall -U postgres > "backup-inventory-$STAMP.sql" 2>/dev/null; then
  echo "pg_dumpall -> backup-inventory-$STAMP.sql ($(du -h "backup-inventory-$STAMP.sql" | cut -f1))"
else
  echo "pg_dumpall 失败或容器不在（继续）"
fi
VOL=$(docker volume inspect -f '{{.Mountpoint}}' japan-erp_inventory_data 2>/dev/null || true)
if [[ -n "$VOL" && -d "$VOL" ]]; then
  tar czf "backup-inventory-data-$STAMP.tgz" -C "$VOL" . \
    && echo "volume -> backup-inventory-data-$STAMP.tgz ($(du -h "backup-inventory-data-$STAMP.tgz" | cut -f1))"
fi

echo "== 2. 移除旧库存栈容器（保留 japan-erp-nginx 与 volume）"
docker rm -f japan-erp-inventory-api japan-erp-postgres-prod japan-erp-redis-prod 2>/dev/null || true
docker ps --format '{{.Names}}'

echo "== 3. 停掉并删除 VPN / 代理残留"
for u in $(systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '{print $1}' \
           | grep -iE 'shadowsocks|ss-server|ss-local|v2ray|xray|openvpn|wg-quick' || true); do
  echo "disable $u"; systemctl disable --now "$u" 2>/dev/null || true
done
rm -rf openvpn-ca ./*.ovpn proxy-backup.tar.gz web-static-backup-20260816 aws-edge-keep
find . -maxdepth 1 -type f \( -iname 'ss-*' -o -iname 'shadowsocks*' -o -iname 'ssserver*' -o -iname 'sslocal*' -o -iname 'xray*' -o -iname 'v2ray*' \) -print -delete
ls -la /home/ubuntu

echo "== 4. 系统更新"
apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq && apt-get autoremove -y -qq
df -h /
echo "== 完成。需要重启以加载新内核：sudo reboot"
echo "   重启后确认 haproxy / frps / docker / tailscaled 与 japan-erp-nginx 容器自动恢复。"
