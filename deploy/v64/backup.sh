#!/usr/bin/env bash
# V64 每日备份：pg_dump + Open WebUI 数据。放到 cron：0 3 * * * /opt/jianpanerp/deploy/v64/backup.sh
set -euo pipefail
cd /opt/jianpanerp
DEST=${BACKUP_DIR:-/var/backups/jianpanerp}; mkdir -p "$DEST"
STAMP=$(date +%F)
docker compose -f docker-compose.v64.yml exec -T postgres pg_dump -U "${POSTGRES_USER:-erp}" "${POSTGRES_DB:-japan_erp}" | gzip > "$DEST/db-$STAMP.sql.gz"
docker run --rm -v jianpanerp_openwebui:/src -v "$DEST":/dst alpine tar czf "/dst/openwebui-$STAMP.tgz" -C /src .
find "$DEST" -type f -mtime +30 -delete
echo "backup ok: $DEST/db-$STAMP.sql.gz"
