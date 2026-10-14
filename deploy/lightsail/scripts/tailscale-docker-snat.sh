#!/usr/bin/env bash
# 让 Docker bridge 里的容器（nginx）能经宿主的 tailscale0 访问 tailnet（Windows / V64）。
# 容器源地址 172.18.x 不在 tailnet 内，必须在宿主做 MASQUERADE，否则对端会丢包。
# 用法：sudo bash tailscale-docker-snat.sh  （幂等，可重复执行；并安装为开机自启 systemd 单元）
set -euo pipefail
RULE=(-t nat -s 172.16.0.0/12 -o tailscale0 -j MASQUERADE)
iptables -C POSTROUTING "${RULE[@]}" 2>/dev/null || iptables -A POSTROUTING "${RULE[@]}"
# 允许 FORWARD（Docker 默认 FORWARD 策略为 DROP）
iptables -C FORWARD -i docker0 -o tailscale0 -j ACCEPT 2>/dev/null || iptables -I FORWARD -i docker0 -o tailscale0 -j ACCEPT
iptables -C FORWARD -i br-+ -o tailscale0 -j ACCEPT 2>/dev/null || iptables -I FORWARD -i br-+ -o tailscale0 -j ACCEPT
iptables -C FORWARD -i tailscale0 -m state --state RELATED,ESTABLISHED -j ACCEPT 2>/dev/null || iptables -I FORWARD -i tailscale0 -m state --state RELATED,ESTABLISHED -j ACCEPT

cat >/etc/systemd/system/tailscale-docker-snat.service <<'UNIT'
[Unit]
Description=MASQUERADE docker bridge traffic out of tailscale0
After=docker.service tailscaled.service
Wants=docker.service tailscaled.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/tailscale-docker-snat.sh --apply-only
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
UNIT
if [[ "${1:-}" != "--apply-only" ]]; then
  install -m 0755 "$0" /usr/local/sbin/tailscale-docker-snat.sh
  systemctl daemon-reload
  systemctl enable tailscale-docker-snat.service >/dev/null
fi
echo "ok: SNAT rules in place"
