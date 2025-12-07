#!/bin/bash

# Function to clean up background processes
cleanup() {
  echo ""
  echo "🛑 Shutting down all services..."
  pkill -f "node dist/apps/api-core/src/simple-main.js"
  pkill -f "ts-node src/simple-main.ts"
  pkill -f "next-server" # Next.js production
  pkill -f "next dev"    # Next.js dev
  pkill -f "uvicorn main:app" # Python AI
  pkill -f "cloudflared tunnel" # Cloudflare
  exit 0
}

# Trap SIGINT (Ctrl+C) and call cleanup function
trap cleanup SIGINT

echo "================================================================"
echo "🚀 Japan ERP Universal Start (LAN + Internet)"
echo "================================================================"

# 1. Get Local LAN IP (Try Wi-Fi first, then Ethernet)
LOCAL_IP=$(ipconfig getifaddr en0)
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP=$(ipconfig getifaddr en1)
fi
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP="127.0.0.1"
fi

# 2. Start Backend (API) - Listen on 0.0.0.0
echo "🔥 Starting Backend (API)..."
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "apps/api-core"
# Use simple-main for faster startup without build
npx ts-node src/simple-main.ts > backend.log 2>&1 &
BACKEND_PID=$!
cd ../..

# 3. Start Frontend (Web Client) - Listen on 0.0.0.0
echo "🎨 Starting Frontend (Web Client)..."
cd "apps/web-client"
# -H 0.0.0.0 allows access from other computers on LAN
npm run dev -- -p 3000 -H 0.0.0.0 > frontend.log 2>&1 &
FRONTEND_PID=$!
cd ../..

# 4. Start AI Service - Listen on 0.0.0.0
echo "🧠 Starting AI Service..."
cd "apps/ai-service"
if [ -d "venv" ]; then
    source venv/bin/activate
fi
uvicorn main:app --host 0.0.0.0 --port 8000 > ai-service.log 2>&1 &
AI_PID=$!
cd ../..

echo "⏳ Waiting for services to be ready..."

# Wait for backend
until curl -s http://127.0.0.1:4000/health > /dev/null; do
  echo -n "."
  sleep 2
done
echo -e "\n✅ Backend is UP!"

# Wait for frontend
until curl -s http://127.0.0.1:3000 > /dev/null; do
  echo -n "."
  sleep 2
done
echo -e "\n✅ Frontend is UP!"

echo ""
echo "================================================================"
echo "🎉 System Started Successfully!"
echo "================================================================"
echo "🏠 Internal Access (LAN/Wi-Fi):"
echo "   👉 http://$LOCAL_IP:3000"
echo "   (Share this link with colleagues on the same Wi-Fi)"
echo ""
echo "🌍 External Access (Public Internet):"
echo "   (Establishing secure tunnel...)"
echo "================================================================"

# 5. Start Cloudflare Tunnel (Blocks here until Ctrl+C)
# Points to localhost:3000 which is now reachable
cloudflared tunnel --url http://127.0.0.1:3000

