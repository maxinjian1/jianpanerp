import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { prisma } from '@japan-erp/database';
import axios from 'axios';

interface ForecastRequest {
  ds: string[];
  y: number[];
}

interface ForecastResult {
  ds: string;
  yhat: number;
  yhat_lower?: number;
  yhat_upper?: number;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiServiceUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.aiServiceUrl = this.configService.get('AI_SERVICE_URL', 'http://localhost:8000');
  }

  /**
   * 売上予測を取得
   * Get sales forecast for a product
   */
  async getForecast(productId: string, days: number = 30) {
    // Get historical sales data
    const history = await this.getSalesHistory(productId, 365);

    if (history.length < 30) {
      return {
        success: false,
        message: 'Not enough historical data (minimum 30 days required)',
      };
    }

    try {
      // Call Python AI service
      const response = await axios.post<ForecastResult[]>(
        `${this.aiServiceUrl}/predict/forecast`,
        {
          ds: history.map((h) => h.date),
          y: history.map((h) => h.qty),
          periods: days,
        },
        { timeout: 30000 },
      );

      // Save forecast results
      await prisma.forecastResult.create({
        data: {
          productId,
          sku: history[0]?.sku || '',
          forecastDate: new Date(),
          predictions: JSON.stringify(response.data),
          metrics: JSON.stringify({
            dataPoints: history.length,
            forecastDays: days,
          }),
          modelUsed: 'PROPHET',
          confidence: 0.85,
        },
      });

      return {
        success: true,
        predictions: response.data,
        historicalDataPoints: history.length,
        forecastDays: days,
      };
    } catch (error) {
      this.logger.error(`Forecast failed for product ${productId}`, error);
      
      // Return mock forecast for development
      return this.generateMockForecast(days);
    }
  }

  /**
   * 補充提案を生成
   * Generate restock suggestions
   */
  async generateRestockSuggestions() {
    // Get all products with low stock
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: {
        inventories: {
          select: {
            quantity: true,
            reservedQty: true,
          },
        },
      },
    });

    const suggestions = [];

    for (const product of products) {
      const totalStock = product.inventories.reduce((sum, inv) => sum + inv.quantity, 0);
      const reservedStock = product.inventories.reduce((sum, inv) => sum + inv.reservedQty, 0);
      const availableStock = totalStock - reservedStock;

      // Check if needs restock
      if (availableStock <= product.reorderPoint) {
        // Get forecast for this product
        const history = await this.getSalesHistory(product.id, 90);
        const avgDailySales = history.reduce((sum, h) => sum + h.qty, 0) / Math.max(history.length, 1);
        
        const daysUntilStockout = avgDailySales > 0 
          ? Math.floor(availableStock / avgDailySales) 
          : 999;

        const forecastedDemand = Math.ceil(avgDailySales * product.leadTimeDays * 1.2); // 20% safety buffer
        const suggestedOrderQty = Math.max(product.reorderQuantity, forecastedDemand);

        const urgency = daysUntilStockout <= product.safetyStock 
          ? 'CRITICAL'
          : daysUntilStockout <= product.leadTimeDays 
            ? 'HIGH'
            : daysUntilStockout <= product.leadTimeDays * 2 
              ? 'MEDIUM' 
              : 'LOW';

        // Create suggestion
        const suggestion = await prisma.restockSuggestion.create({
          data: {
            productId: product.id,
            sku: product.sku,
            productName: product.name,
            currentStock: availableStock,
            forecastedDemand,
            daysUntilStockout,
            suggestedOrderQty,
            suggestedOrderDate: new Date(Date.now() + Math.max(0, daysUntilStockout - product.leadTimeDays) * 24 * 60 * 60 * 1000),
            urgency: urgency as any,
            estimatedCost: suggestedOrderQty * Number(product.costPrice),
            potentialLostSales: Math.max(0, forecastedDemand - availableStock) * Number(product.retailPrice),
          },
        });

        suggestions.push(suggestion);
      }
    }

    return {
      totalSuggestions: suggestions.length,
      byUrgency: {
        critical: suggestions.filter((s) => s.urgency === 'CRITICAL').length,
        high: suggestions.filter((s) => s.urgency === 'HIGH').length,
        medium: suggestions.filter((s) => s.urgency === 'MEDIUM').length,
        low: suggestions.filter((s) => s.urgency === 'LOW').length,
      },
      suggestions,
    };
  }

  /**
   * 補充提案を取得
   */
  async getRestockSuggestions(urgency?: string) {
    const where: any = { status: 'PENDING' };
    if (urgency) {
      where.urgency = urgency;
    }

    return prisma.restockSuggestion.findMany({
      where,
      orderBy: [
        { urgency: 'asc' },
        { daysUntilStockout: 'asc' },
      ],
    });
  }

  /**
   * 補充提案を承認
   */
  async approveSuggestion(suggestionId: string, userId: string) {
    return prisma.restockSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
      },
    });
  }

  /**
   * 販売履歴を取得
   */
  private async getSalesHistory(productId: string, days: number) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const orderItems = await prisma.orderItem.findMany({
      where: {
        productId,
        order: {
          orderedAt: { gte: startDate },
          status: { notIn: ['CANCELLED', 'RETURNED'] },
        },
      },
      include: {
        order: {
          select: {
            orderedAt: true,
          },
        },
        product: {
          select: {
            sku: true,
          },
        },
      },
    });

    // Aggregate by date
    const salesByDate = new Map<string, number>();
    orderItems.forEach((item) => {
      const date = item.order.orderedAt.toISOString().slice(0, 10);
      salesByDate.set(date, (salesByDate.get(date) || 0) + item.quantity);
    });

    // Fill in missing dates with 0
    const result = [];
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      result.push({
        date: dateStr,
        qty: salesByDate.get(dateStr) || 0,
        sku: orderItems[0]?.product?.sku || '',
      });
    }

    return result;
  }

  private generateMockForecast(days: number) {
    const predictions = [];
    const today = new Date();

    for (let i = 1; i <= days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);

      // Generate mock prediction with some variance
      const baseValue = 10 + Math.random() * 5;
      predictions.push({
        ds: date.toISOString().slice(0, 10),
        yhat: Math.round(baseValue * 10) / 10,
        yhat_lower: Math.round((baseValue * 0.7) * 10) / 10,
        yhat_upper: Math.round((baseValue * 1.3) * 10) / 10,
      });
    }

    return {
      success: true,
      predictions,
      note: 'Mock forecast (AI service not available)',
    };
  }
}

