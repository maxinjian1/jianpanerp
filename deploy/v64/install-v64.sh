#!/usr/bin/env bash
# ANET V64 初始化（Ubuntu 24.04 全新系统，以 sudo 运行）
#   curl -fsSL <raw url>/deploy/v64/install-v64.sh | sudo bash -s -- [git-url] [branch]
# 做的事：NVIDIA 驱动 + Docker + nvidia-container-toolkit + Tailscale + 拉代码 + 启动全部服务 + 拉模型
# 幂等：可重复执行。
set -euo pipefail
REPO_URL="${1:-https://github.com/maxinjian1/jianpanerp.git}"
BRANCH="${2:-main}"
APP_DIR=/opt/jianpanerp
MODEL="${LOCAL_LLM_MODEL:-qwen3:30b-a3b}"

log() { echo -e "\n\033[1;36m==> $*\033[0m"; }
[[ $EUID -eq 0 ]] || { echo "请用 sudo 运行"; exit 1; }

log "基础包"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
  ca-certificates curl git gnupg lsb-release ubuntu-drivers-common jq

log "NVIDIA 驱动（V100 / Volta：550 系列，CUDA 12.x）"
if ! command -v nvidia-smi >/dev/null; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nvidia-driver-550-server
  NEED_REBOOT=1
fi

log "Docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
systemctl enable --now docker

log "nvidia-container-toolkit"
if ! dpkg -s nvidia-container-toolkit >/dev/null 2>&1; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
    > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nvidia-container-toolkit
  nvidia-ctk runtime configure --runtime=docker
  systemctl restart docker
fi

log "Tailscale（客户从 Mac 远程进来的唯一通道）"
if ! command -v tailscale >/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
systemctl enable --now tailscaled
if ! tailscale status >/dev/null 2>&1; then
  echo ">>> 请在浏览器打开下面的链接完成 Tailscale 授权："
  tailscale up --ssh --hostname "anet-v64-$(hostname | tr -cd 'a-z0-9' | tail -c 6)" || true
fi

log "代码 → $APP_DIR"
if [[ -d $APP_DIR/.git ]]; then
  git -C "$APP_DIR" fetch --depth=1 origin "$BRANCH" && git -C "$APP_DIR" checkout -q "$BRANCH" && git -C "$APP_DIR" pull -q
else
  git clone --depth=1 -b "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
if [[ ! -f .env ]]; then
  cp env.example.txt .env
  # V64：全部走本地模型；生成随机数据库密码与 JWT
  sed -i 's/^LLM_DEFAULT_PROVIDER=.*/LLM_DEFAULT_PROVIDER="local"/' .env
  sed -i 's/^LLM_PII_PROVIDER=.*/LLM_PII_PROVIDER="local"/' .env
  sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 16)/" .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=\"$(openssl rand -hex 32)\"|" .env
  grep -q '^LOCAL_LLM_MODEL=' .env || echo "LOCAL_LLM_MODEL=\"$MODEL\"" >> .env
  chmod 600 .env
  echo ">>> 已生成 .env（随机密码）。各平台 API Key 与中国模型 Key 之后再填。"
fi

if [[ "${NEED_REBOOT:-0}" == "1" ]]; then
  log "NVIDIA 驱动刚安装，需要重启。重启后再次运行本脚本即可继续。"
  exit 0
fi

log "GPU 检查"
nvidia-smi --query-gpu=name,memory.total --format=csv
docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi -L

log "启动服务"
docker compose -f docker-compose.v64.yml up -d --build

log "拉取本地模型 $MODEL（首次约 20–40 GB，耐心）"
docker compose -f docker-compose.v64.yml exec -T ollama ollama pull "$MODEL"

log "完成。访问（Tailscale 内网）："
IP=$(tailscale ip -4 2>/dev/null || hostname -I | awk '{print $1}')
echo "  ERP        http://$IP:3000"
echo "  API 文档   http://$IP:4000/docs"
echo "  Open WebUI http://$IP:8080"
echo "  Ollama     http://$IP:11434"
