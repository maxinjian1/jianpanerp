# 🇯🇵 Japan Omni-EC Cloud ERP & Growth Platform

> AI-Driven SaaS ERP + Market Intelligence for Japan's Multi-channel E-commerce

A next-generation platform designed specifically for the Japanese market, combining **ERP (Order/Inventory Management)** with **Market Intelligence (Product Research/Social Trends)**.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND LAYER                           │
│  ┌─────────────────┐           ┌─────────────────┐              │
│  │   web-admin     │           │   web-client    │              │
│  │   (Next.js)     │           │   (Next.js)     │              │
│  │  SaaS Admin     │           │   Seller ERP    │              │
│  └────────┬────────┘           └────────┬────────┘              │
└───────────┼─────────────────────────────┼───────────────────────┘
            │                             │
            ▼                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                       BACKEND LAYER                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    api-core (NestJS)                     │    │
│  │  • Auth & Multi-tenant (SaaS)                           │    │
│  │  • Order & Inventory (OMS/WMS)                          │    │
│  │  • Logistics Routing (Yamato/Sagawa)                    │    │
│  │  • Market Research Module (New!)                        │    │
│  └────────────────────────┬────────────────────────────────┘    │
│                           │                                      │
│  ┌────────────────────────▼────────────────────────────────┐    │
│  │                 ai-service (FastAPI)                     │    │
│  │  • Sales Forecasting (Prophet)                           │    │
│  │  • Social Trend Analysis (NLP/Sentiment)                 │    │
│  │  • Content Generation (Japanese Copywriting)             │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## 📦 Modules

| Module | Type | Description |
|--------|------|-------------|
| **OMS** | Operation | Multi-channel order management (Amazon/Rakuten) |
| **WMS** | Operation | Warehouse management, PDA scanning, Lot control |
| **TMS** | Logistics | Smart routing (Yamato/Sagawa), Shift-JIS CSV generation |
| **Growth** | **Intelligence** | **Market Research & Social Trends (New)** |
| **AI** | Intelligence | Sales forecasting, Restock suggestions, Content generation |

## 🚀 Growth Module Features (New)

### 📊 Market Intelligence (Sorftime-like)
- **Category Analysis**: Identify high-potential/low-competition niches in Amazon JP/Rakuten.
- **Competitor Tracking**: Analyze top sellers, pricing strategies, and review trends.
- **Profitability Calculator**: Estimate ROI based on Japanese logistics costs and fees.

### 📱 Social & Content Marketing
- **Trend Monitoring**: Track keywords on Twitter(X), Instagram, and TikTok Japan.
- **Consumer Behavior**: Analyze Japanese consumer preferences (quality vs price, packaging).
- **Content Suggestions**: AI-generated Japanese listing copy and social media posts.

## 🚀 Quick Start

### Prerequisites

- Node.js >= 20.0.0
- Python >= 3.11
- PostgreSQL >= 15
- Redis >= 7.0

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp env.example.txt .env

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Start development servers (Frontend + Backend + AI)
./start-local.sh
```

## 📜 License

MIT License - See [LICENSE](LICENSE) for details.
