#!/bin/bash

# ==========================================
# 🇯🇵 Japan ERP - One-Click Deployment Script
# ==========================================
# Usage: ./scripts/deploy-aws.sh <path-to-pem-file>

PEM_KEY=$1
SERVER_IP="3.106.207.186" # From your screenshot
USER="ec2-user" # Standard for Amazon Linux
REMOTE_DIR="/var/www/japan-erp"

if [ -z "$PEM_KEY" ]; then
  echo "❌ Error: Please provide the path to your .pem key file."
  echo "Usage: ./scripts/deploy-aws.sh ~/Downloads/my-key.pem"
  exit 1
fi

echo "🚀 Deploying to AWS ($SERVER_IP)..."

# 1. Sync Files (Exclude heavy folders)
echo "📡 Syncing files..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude 'dist' \
  --exclude '.git' \
  --exclude '.env' \
  --exclude 'venv' \
  -e "ssh -i $PEM_KEY -o StrictHostKeyChecking=no" \
  ./ $USER@$SERVER_IP:$REMOTE_DIR

# 2. Upload .env (Create production env if needed)
# echo "🔐 Uploading .env..."
# scp -i $PEM_KEY .env.production $USER@$SERVER_IP:$REMOTE_DIR/.env

# 3. Run Build & Restart on Server
echo "🏗 Building and Restarting on Server..."
ssh -i $PEM_KEY $USER@$SERVER_IP << EOF
  cd $REMOTE_DIR
  
  # Install Dependencies
  echo "📦 Installing dependencies..."
  npm install

  # Build Projects
  echo "🛠 Building Backend..."
  npx nx build api-core
  
  echo "🛠 Building Frontend..."
  npx nx build web-client

  # Setup Python
  echo "🐍 Setting up Python..."
  cd apps/ai-service
  python3 -m venv venv
  source venv/bin/activate
  pip install -r requirements.txt
  cd ../..

  # Start/Restart PM2
  echo "🔄 Restarting services..."
  # Generate PM2 config if not exists
  if [ ! -f ecosystem.config.js ]; then
    cat > ecosystem.config.js << EOL
module.exports = {
  apps: [
    {
      name: "api-core",
      script: "dist/apps/api-core/src/main.js",
      env: { PORT: 4000 }
    },
    {
      name: "web-client",
      script: "node_modules/next/dist/bin/next",
      args: "start apps/web-client -p 3000",
      env: { NODE_ENV: "production" }
    },
    {
      name: "ai-service",
      script: "apps/ai-service/main.py",
      interpreter: "python3"
    }
  ]
};
EOL
  fi

  pm2 reload ecosystem.config.js || pm2 start ecosystem.config.js
  pm2 save
EOF

echo "=========================================="
echo "✅ Deployment Complete!"
echo "🌍 Access your site at: http://$SERVER_IP"
echo "=========================================="

