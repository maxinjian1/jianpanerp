#!/bin/bash

# ==========================================
# 🇯🇵 Japan ERP - EC2 Server Setup Script
# ==========================================
# Run this script ON the EC2 instance to set up the environment.
# Usage: ./setup-ec2.sh

set -e # Exit on error

echo "🚀 Starting Server Setup..."

# 1. Update System
echo "📦 Updating system packages..."
sudo yum update -y
sudo yum install -y git ruby wget

# 2. Add Swap Space (Crucial for t3.micro to avoid crash during build)
if [ ! -f /swapfile ]; then
    echo "💾 Creating 2GB Swap file for better performance..."
    sudo dd if=/dev/zero of=/swapfile bs=128M count=16
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo "/swapfile swap swap defaults 0 0" | sudo tee -a /etc/fstab
    echo "✅ Swap created."
else
    echo "✅ Swap already exists."
fi

# 3. Install Node.js 20
echo "🟢 Installing Node.js 20..."
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
node -v
npm -v

# 4. Install Yarn & PM2
echo "🛠 Installing Yarn & PM2..."
sudo npm install -g yarn pm2

# 5. Install Python 3 & Pip
echo "🐍 Installing Python 3..."
sudo yum install -y python3 python3-pip

# 6. Install Nginx
echo "🌐 Installing Nginx..."
sudo amazon-linux-extras install nginx1 -y || sudo yum install nginx -y
sudo systemctl enable nginx
sudo systemctl start nginx

# 7. Create App Directory
echo "📂 Creating app directory..."
sudo mkdir -p /var/www/japan-erp
sudo chown -R ec2-user:ec2-user /var/www/japan-erp

echo "=========================================="
echo "🎉 Server Setup Complete!"
echo "=========================================="
echo "Next steps:"
echo "1. Logout and log back in."
echo "2. Run the deployment script from your local machine."

