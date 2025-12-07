"""
Japan Omni-EC ERP - AI Service
FastAPI service for sales forecasting and intelligent restock suggestions
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Try to import Prophet (may not be installed in all environments)
try:
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False
    logger.warning("Prophet not available. Using fallback forecasting.")

app = FastAPI(
    title="Japan ERP AI Service",
    description="AI-powered sales forecasting and restock suggestions for Japanese e-commerce",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:4000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================
# Data Models
# ============================================

class SalesData(BaseModel):
    ds: List[str]  # Dates in ISO format
    y: List[float]  # Sales quantities
    periods: Optional[int] = 30  # Forecast period in days


class ForecastResult(BaseModel):
    ds: str
    yhat: float
    yhat_lower: float
    yhat_upper: float
    trend: Optional[str] = None


class ForecastResponse(BaseModel):
    predictions: List[ForecastResult]
    metrics: dict
    model_used: str


class DemandAnalysisRequest(BaseModel):
    sku: str
    sales_history: List[dict]  # [{"date": "2023-12-01", "qty": 10}, ...]


class DemandAnalysisResponse(BaseModel):
    sku: str
    avg_daily_sales: float
    std_deviation: float
    seasonality_detected: bool
    peak_days: List[str]
    recommendation: str


class RestockRequest(BaseModel):
    product_id: str
    current_stock: int
    lead_time_days: int
    safety_stock: int
    forecast: List[float]


class RestockResponse(BaseModel):
    should_restock: bool
    suggested_quantity: int
    suggested_order_date: str
    urgency: str
    reasoning: str


class SocialTrendRequest(BaseModel):
    keyword: str
    platforms: List[str] = ["Twitter", "Instagram", "TikTok"]


class SocialTrendResponse(BaseModel):
    keyword: str
    trend_direction: str
    mention_volume: int
    sentiment_score: float  # -1.0 to 1.0
    top_hashtags: List[str]
    content_ideas: List[str]


# ============================================
# API Endpoints
# ============================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "prophet_available": PROPHET_AVAILABLE,
        "timestamp": datetime.now().isoformat(),
    }


@app.post("/analyze/social-trends", response_model=SocialTrendResponse)
async def analyze_social_trends(data: SocialTrendRequest):
    """
    SNSトレンド分析 (Mock implementation for now)
    Analyzes social media trends for a keyword
    """
    # In a real implementation, this would scrape or use official APIs
    # Here we mock the analysis logic
    
    sentiment_score = 0.65  # Positive
    trend_direction = "UP"
    volume = 12500
    
    return SocialTrendResponse(
        keyword=data.keyword,
        trend_direction=trend_direction,
        mention_volume=volume,
        sentiment_score=sentiment_score,
        top_hashtags=[f"#{data.keyword}", "#おすすめ", "#日本限定", "#新作"],
        content_ideas=[
            f"Create a 15s TikTok showing {data.keyword} unboxing",
            f"Focus on 'limited time' in Instagram stories for {data.keyword}",
            f"Highlight 'Made in Japan' quality in Twitter threads",
        ]
    )


@app.post("/predict/forecast", response_model=ForecastResponse)
async def forecast_sales(data: SalesData):
    """
    売上予測 API
    Generate sales forecast using Prophet or fallback method
    """
    logger.info(f"Received forecast request with {len(data.ds)} data points")
    
    if len(data.ds) < 10:
        raise HTTPException(
            status_code=400,
            detail="Minimum 10 data points required for forecasting"
        )
    
    if len(data.ds) != len(data.y):
        raise HTTPException(
            status_code=400,
            detail="ds and y arrays must have the same length"
        )
    
    try:
        # Prepare DataFrame
        df = pd.DataFrame({
            'ds': pd.to_datetime(data.ds),
            'y': data.y
        })
        
        if PROPHET_AVAILABLE:
            predictions, metrics = forecast_with_prophet(df, data.periods)
            model_used = "PROPHET"
        else:
            predictions, metrics = forecast_with_fallback(df, data.periods)
            model_used = "MOVING_AVERAGE"
        
        return ForecastResponse(
            predictions=predictions,
            metrics=metrics,
            model_used=model_used
        )
        
    except Exception as e:
        logger.error(f"Forecast error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


def forecast_with_prophet(df: pd.DataFrame, periods: int) -> tuple:
    """Use Prophet for forecasting"""
    logger.info("Using Prophet for forecasting")
    
    # Initialize Prophet with Japanese market settings
    model = Prophet(
        daily_seasonality=True,
        weekly_seasonality=True,
        yearly_seasonality=True,
        seasonality_mode='multiplicative',
        changepoint_prior_scale=0.05,
    )
    
    # Add Japanese holidays (simplified)
    # model.add_country_holidays(country_name='JP')
    
    # Fit model
    model.fit(df)
    
    # Make future dataframe
    future = model.make_future_dataframe(periods=periods)
    forecast = model.predict(future)
    
    # Extract predictions for future dates only
    future_forecast = forecast.tail(periods)
    
    predictions = []
    for _, row in future_forecast.iterrows():
        # Determine trend
        if len(predictions) > 0:
            prev_value = predictions[-1].yhat
            trend = "INCREASING" if row['yhat'] > prev_value else "DECREASING" if row['yhat'] < prev_value else "STABLE"
        else:
            trend = "STABLE"
        
        predictions.append(ForecastResult(
            ds=row['ds'].strftime('%Y-%m-%d'),
            yhat=round(max(0, row['yhat']), 2),
            yhat_lower=round(max(0, row['yhat_lower']), 2),
            yhat_upper=round(max(0, row['yhat_upper']), 2),
            trend=trend
        ))
    
    # Calculate metrics
    metrics = {
        "mape": calculate_mape(df['y'].values, model.predict(df)['yhat'].values),
        "data_points": len(df),
        "forecast_days": periods,
    }
    
    return predictions, metrics


def forecast_with_fallback(df: pd.DataFrame, periods: int) -> tuple:
    """Fallback forecasting using moving average"""
    logger.info("Using fallback (moving average) for forecasting")
    
    # Calculate 7-day moving average
    recent_avg = df['y'].tail(7).mean()
    std = df['y'].tail(30).std()
    
    # Add some seasonality (day of week pattern)
    dow_pattern = df.groupby(df['ds'].dt.dayofweek)['y'].mean()
    overall_mean = df['y'].mean()
    dow_factors = (dow_pattern / overall_mean).to_dict()
    
    predictions = []
    last_date = df['ds'].max()
    
    for i in range(1, periods + 1):
        forecast_date = last_date + timedelta(days=i)
        dow = forecast_date.dayofweek
        factor = dow_factors.get(dow, 1.0)
        
        yhat = recent_avg * factor
        yhat_lower = max(0, yhat - 1.96 * std)
        yhat_upper = yhat + 1.96 * std
        
        trend = "STABLE"
        if i > 1:
            prev = predictions[-1].yhat
            trend = "INCREASING" if yhat > prev else "DECREASING" if yhat < prev else "STABLE"
        
        predictions.append(ForecastResult(
            ds=forecast_date.strftime('%Y-%m-%d'),
            yhat=round(max(0, yhat), 2),
            yhat_lower=round(yhat_lower, 2),
            yhat_upper=round(yhat_upper, 2),
            trend=trend
        ))
    
    metrics = {
        "method": "moving_average_7d",
        "data_points": len(df),
        "forecast_days": periods,
        "recent_average": round(recent_avg, 2),
    }
    
    return predictions, metrics


def calculate_mape(actual: np.ndarray, predicted: np.ndarray) -> float:
    """Calculate Mean Absolute Percentage Error"""
    mask = actual != 0
    if mask.sum() == 0:
        return 0.0
    return round(np.mean(np.abs((actual[mask] - predicted[mask]) / actual[mask])) * 100, 2)


@app.post("/analyze/demand", response_model=DemandAnalysisResponse)
async def analyze_demand(data: DemandAnalysisRequest):
    """
    需要分析 API
    Analyze sales patterns and demand characteristics
    """
    if len(data.sales_history) < 14:
        raise HTTPException(
            status_code=400,
            detail="Minimum 14 days of data required for demand analysis"
        )
    
    df = pd.DataFrame(data.sales_history)
    df['date'] = pd.to_datetime(df['date'])
    df['dow'] = df['date'].dt.day_name()
    
    avg_daily = df['qty'].mean()
    std_dev = df['qty'].std()
    cv = std_dev / avg_daily if avg_daily > 0 else 0  # Coefficient of variation
    
    # Detect seasonality
    dow_sales = df.groupby('dow')['qty'].mean()
    seasonality_detected = cv > 0.3 and dow_sales.std() > avg_daily * 0.2
    
    # Find peak days
    peak_threshold = avg_daily * 1.3
    peak_days = dow_sales[dow_sales > peak_threshold].index.tolist()
    
    # Generate recommendation
    if cv > 0.5:
        recommendation = "高変動商品：安全在庫を増やし、頻繁な発注を推奨"
    elif seasonality_detected:
        recommendation = f"季節性あり：{', '.join(peak_days)}に向けて在庫を増強"
    else:
        recommendation = "安定需要：定期的な発注サイクルで対応可能"
    
    return DemandAnalysisResponse(
        sku=data.sku,
        avg_daily_sales=round(avg_daily, 2),
        std_deviation=round(std_dev, 2),
        seasonality_detected=seasonality_detected,
        peak_days=peak_days,
        recommendation=recommendation
    )


@app.post("/restock/calculate", response_model=RestockResponse)
async def calculate_restock(data: RestockRequest):
    """
    補充計算 API
    Calculate optimal restock quantity and timing
    """
    # Calculate expected demand during lead time
    lead_time_demand = sum(data.forecast[:data.lead_time_days])
    
    # Calculate reorder point
    reorder_point = lead_time_demand + data.safety_stock
    
    # Determine if restock is needed
    should_restock = data.current_stock <= reorder_point
    
    # Calculate suggested quantity (EOQ-like calculation)
    avg_demand = np.mean(data.forecast) if data.forecast else 0
    suggested_quantity = max(
        int(avg_demand * data.lead_time_days * 1.5),  # 1.5x buffer
        data.safety_stock * 2
    )
    
    # Calculate optimal order date
    days_until_stockout = (
        int(data.current_stock / avg_demand) if avg_demand > 0 else 999
    )
    order_days_before = max(0, days_until_stockout - data.lead_time_days)
    order_date = datetime.now() + timedelta(days=order_days_before)
    
    # Determine urgency
    if days_until_stockout <= data.safety_stock:
        urgency = "CRITICAL"
        reasoning = "在庫が安全在庫を下回る見込み。即時発注が必要。"
    elif days_until_stockout <= data.lead_time_days:
        urgency = "HIGH"
        reasoning = f"リードタイム({data.lead_time_days}日)以内に欠品の恐れ。"
    elif should_restock:
        urgency = "MEDIUM"
        reasoning = "発注点に達しました。計画的な発注を推奨。"
    else:
        urgency = "LOW"
        reasoning = "在庫は十分です。次回発注まで余裕があります。"
    
    return RestockResponse(
        should_restock=should_restock,
        suggested_quantity=suggested_quantity,
        suggested_order_date=order_date.strftime('%Y-%m-%d'),
        urgency=urgency,
        reasoning=reasoning
    )


# ============================================
# Main Entry Point
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)

