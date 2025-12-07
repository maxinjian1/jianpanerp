#!/bin/bash

# Kill running ports
pkill -f "next-server"
pkill -f "nest"
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:4000 | xargs kill -9 2>/dev/null

# Get Local IP
IP=$(ipconfig getifaddr en0)
if [ -z "$IP" ]; then
    IP=$(ipconfig getifaddr en1)
fi
if [ -z "$IP" ]; then
    echo "Could not detect Local IP. Please check network settings."
    IP="localhost"
fi

echo "================================================================"
echo "🚀 Starting Japan ERP in SHARING MODE"
echo "================================================================"
echo ""
echo "📡 Your Local IP is: $IP"
echo ""
echo "👉 Access the App from other devices at: http://$IP:3000"
echo "👉 Backend API is running at:            http://$IP:4000"
echo ""
echo "================================================================"

# Start Backend
echo "Starting Backend..."
cd apps/api-core
npm install
npx ts-node src/simple-main.ts > backend.log 2>&1 &
BACKEND_PID=$!
cd ../..

# Start Frontend
echo "Starting Frontend..."
cd apps/web-client
npm install
npm run dev:share

