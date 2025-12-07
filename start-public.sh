#!/bin/bash

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit
}
trap cleanup SIGINT

# Kill running ports
echo "🧹 Cleaning up old processes..."
pkill -f "next-server"
pkill -f "nest"
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:4000 | xargs kill -9 2>/dev/null

echo "================================================================"
echo "🚀 Starting Japan ERP in PUBLIC MODE (Robust)"
echo "================================================================"

# Start Backend
echo "🔥 Starting Backend (API)..."
cd apps/api-core
# Install only if needed
if [ ! -d "node_modules" ]; then
    npm install
fi
# Force IPv4
npx ts-node src/simple-main.ts > backend.log 2>&1 &
BACKEND_PID=$!
cd ../..

# Start Frontend
echo "🎨 Starting Frontend (Web Client)..."
cd apps/web-client
if [ ! -d "node_modules" ]; then
    npm install
fi
# Force IPv4 on 127.0.0.1
npm run dev -- -p 3000 -H 127.0.0.1 > frontend.log 2>&1 &
FRONTEND_PID=$!
cd ../..

echo "⏳ Waiting for servers to initialize (this may take 30-60s)..."

# Loop to check if Backend is up
while ! curl -s http://127.0.0.1:4000/health > /dev/null; do
  echo -n "."
  sleep 2
done
echo ""
echo "✅ Backend is UP!"

# Loop to check if Frontend is up
while ! curl -s http://127.0.0.1:3000 > /dev/null; do
  echo -n "."
  sleep 2
done
echo ""
echo "✅ Frontend is UP!"

echo ""
echo "🌍 Establishing Secure Tunnel..."
echo "----------------------------------------------------------------"
echo "👇 COPY THE LINK BELOW to share with your friend:"
echo "----------------------------------------------------------------"

# Run cloudflared specifically pointing to the IPv4 address
cloudflared tunnel --url http://127.0.0.1:3000
