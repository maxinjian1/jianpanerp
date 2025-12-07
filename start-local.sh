#!/bin/bash

# ============================================
# Japan Omni-EC ERP - 本地启动脚本
# Local Development Startup Script
# ============================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Set PATH for Node.js and PostgreSQL
export PATH="/opt/homebrew/opt/node@20/bin:/opt/homebrew/opt/postgresql@15/bin:$PATH"

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  🇯🇵 Japan Omni-EC ERP - 本地开发环境启动               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Function to check if a port is in use
check_port() {
    lsof -i :$1 > /dev/null 2>&1
    return $?
}

# Check PostgreSQL
echo -e "${YELLOW}[1/4] 检查 PostgreSQL 数据库...${NC}"
if check_port 5432; then
    echo -e "${GREEN}  ✓ PostgreSQL 运行中 (端口 5432)${NC}"
else
    echo -e "${YELLOW}  ⚠ PostgreSQL 未运行，正在启动...${NC}"
    brew services start postgresql@15
    sleep 2
fi

# Check Redis (optional)
echo -e "${YELLOW}[2/4] 检查 Redis (可选)...${NC}"
if check_port 6379; then
    echo -e "${GREEN}  ✓ Redis 运行中 (端口 6379)${NC}"
else
    echo -e "${YELLOW}  ⚠ Redis 未运行 (队列功能暂不可用)${NC}"
fi

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}现在请打开 3 个终端窗口，分别运行以下命令:${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${YELLOW}【终端窗口 1】启动后端 API (NestJS) - 端口 4000${NC}"
echo -e "  cd \"$SCRIPT_DIR/apps/api-core\""
echo -e "  export PATH=\"/opt/homebrew/opt/node@20/bin:\$PATH\""
echo -e "  npm run dev"
echo ""

echo -e "${YELLOW}【终端窗口 2】启动前端 (Next.js) - 端口 3000${NC}"
echo -e "  cd \"$SCRIPT_DIR/apps/web-client\""
echo -e "  export PATH=\"/opt/homebrew/opt/node@20/bin:\$PATH\""
echo -e "  npm run dev"
echo ""

echo -e "${YELLOW}【终端窗口 3】启动 AI 服务 (Python) - 端口 8000${NC}"
echo -e "  cd \"$SCRIPT_DIR/apps/ai-service\""
echo -e "  source venv/bin/activate"
echo -e "  python main.py"
echo ""

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}启动成功后，在浏览器打开:${NC}"
echo -e "  🌐 前端界面: ${YELLOW}http://localhost:3000${NC}"
echo -e "  📚 API文档:  ${YELLOW}http://localhost:4000/docs${NC}"
echo -e "  🤖 AI服务:   ${YELLOW}http://localhost:8000/docs${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

