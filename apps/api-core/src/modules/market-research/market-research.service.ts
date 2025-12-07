import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalyzeCategoryDto, KeywordTrendDto } from './dto/market-research.dto';

@Injectable()
export class MarketResearchService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Analyze a specific category (Sorftime-like)
   */
  async analyzeCategory(dto: AnalyzeCategoryDto) {
    // Mock data for development
    // In production, this would crawl Amazon/Rakuten or query a data warehouse
    return {
      categoryId: dto.categoryId,
      platform: dto.platform,
      marketSize: 'High', // High, Medium, Low
      competitionLevel: 'Medium',
      averagePrice: 3500,
      topBrands: ['Brand A', 'Brand B', 'Brand C'],
      opportunityScore: 85, // 0-100
      insights: [
        'Rising demand in winter season',
        'Customers complain about packaging often',
        'Video reviews boost conversion by 20%',
      ],
      priceDistribution: [
        { range: '0-2000', count: 150 },
        { range: '2001-5000', count: 450 }, // Sweet spot
        { range: '5000+', count: 120 },
      ],
    };
  }

  /**
   * Track social media trends for keywords
   */
  async getSocialTrends(dto: KeywordTrendDto) {
    // Mock data connecting to "AI Service" for social listening
    return {
      keyword: dto.keyword,
      platforms: ['Twitter', 'Instagram', 'TikTok'],
      trendDirection: 'UP', // UP, DOWN, FLAT
      mentionVolume: 12500,
      sentiment: {
        positive: 65,
        neutral: 25,
        negative: 10,
      },
      relatedHashtags: ['#日本限定', '#新作', '#おすすめ'],
      consumerDemographics: {
        gender: 'Female',
        ageGroup: '20-30',
      },
      contentSuggestions: [
        'Create a 15s TikTok showing unboxing',
        'Focus on "limited time" in Instagram stories',
        'Highlight "Made in Japan" quality in Twitter threads',
      ],
    };
  }

  /**
   * Calculate profitability for a potential product
   */
  async calculateProfitability(cost: number, price: number, size: string) {
    // Simplified Japan logistics calculation
    let shippingFee = 500;
    if (size === 'large') shippingFee = 1000;
    
    const platformFee = price * 0.10; // 10% average
    const profit = price - cost - shippingFee - platformFee;
    const margin = (profit / price) * 100;

    return {
      sellingPrice: price,
      cost,
      fees: {
        platform: platformFee,
        shipping: shippingFee,
      },
      profit,
      margin: Math.round(margin * 10) / 10,
      verdict: margin > 20 ? 'Viable' : 'Risky',
    };
  }
}

