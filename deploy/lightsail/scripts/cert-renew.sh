#!/usr/bin/env bash
# japanerp.com 证书续期（certbot 容器 + webroot）。由 /etc/cron.d/japanerp-cert-renew 每周调用。
# 旧 cron 调用的是不存在的 compose 服务，静默失败；此脚本改为 docker run 并记录日志。
set -uo pipefail
cd /home/ubuntu/japan-erp
LOG=/var/log/japanerp-cert-renew.log
{
  echo "=== $(date -Is) renew start"
  docker run --rm \
    -v "$(pwd)/deploy/nginx/certbot/conf:/etc/letsencrypt" \
    -v "$(pwd)/deploy/nginx/certbot/www:/var/www/certbot" \
    certbot/certbot renew --quiet
  rc=$?
  echo "certbot rc=$rc"
  docker exec japan-erp-nginx nginx -s reload && echo "nginx reloaded"
  echo "=== $(date -Is) renew end"
} >>"$LOG" 2>&1
