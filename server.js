// server.js

const express = require("express");
const axios = require("axios");
require("dotenv").config();

const { RSI, SMA } = require("technicalindicators");

const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance();

const app = express();

const rsiCache = {};

const ExcelJS = require("exceljs");
const fs = require("fs");

app.get("/news", async (req, res) => {
    try {
        const response = await axios.get(
            `https://newsapi.org/v2/everything?q=forex OR stocks&apiKey=${process.env.NEWS_API_KEY}`
        );

        const analyzed = await Promise.all(
            response.data.articles.map(async (article) => {

                const text =
                    (article.title || "") +
                    " " +
                    (article.description || "");

                const sentiment = analyzeSentiment(text);
                const assets = detectAssets(text);
                const impact = detectImpact(text);
                const signal = generateSignal(sentiment, impact);

                const trades = [];

                const uniqueAssets = [...new Set(assets)];

                for (let asset of uniqueAssets) {

                    const baseTrade = mapToTrade(asset, sentiment);

                    if (baseTrade === "NO TRADE") {
                        continue;
                    }

                    // RSI + TREND
                    const rsi = await getRSIForAsset(asset);
                    const trend = await getTrendForAsset(asset);

                    // BUY / SELL
                    let action = "NONE";

                    if (baseTrade.includes("BUY")) {
                        action = "BUY";
                    } else if (baseTrade.includes("SELL")) {
                        action = "SELL";
                    }

                    // RSI filter
                    const finalTrade = filterTrade(baseTrade, rsi);

                    // Skip trades against trend
                    if (
                        (trend === "BULLISH" && action === "SELL") ||
                        (trend === "BEARISH" && action === "BUY")
                    ) {
                        continue;
                    }

                    const confidence = calculateConfidence(
                        sentiment,
                        impact,
                        rsi,
                        finalTrade
                    );

                    trades.push({
                        asset,
                        baseTrade,
                        action,
                        trend,
                        rsi,
                        finalTrade,
                        confidence
                    });
                }

                return {
                    title: article.title,
                    sentiment,
                    impact,
                    signal,
                    trades
                };
            })
        );

        console.log("========== ANALYZED ==========");
console.log(JSON.stringify(analyzed, null, 2));
console.log("================================");


        // FILTER LOW QUALITY
        const filtered = analyzed.map(item => ({
            ...item,
            trades: item.trades
        }))
        .filter(item => item.trades.length > 0);

        console.log(
  "TRADES AFTER FILTER:",
  JSON.stringify(filtered, null, 2)
);

        // GROUP SIMILAR TRADES
        const tradeMap = {};

        filtered.forEach(item => {
            item.trades.forEach(trade => {

                const key =
                    trade.asset + "_" + trade.baseTrade;

                if (!tradeMap[key]) {

                    tradeMap[key] = {
                        ...trade,
                        count: 1
                    };

                } else {

                    tradeMap[key].count = Math.min(
                        tradeMap[key].count + 1,
                        10
                    );

                    // Keep highest confidence
                    if (
                        trade.confidence >
                        tradeMap[key].confidence
                    ) {
                        tradeMap[key] = {
                            ...trade,
                            count: tradeMap[key].count
                        };
                    }
                }
            });
        });

        // RISK SETTINGS
        const ACCOUNT_BALANCE = 10000;
        const RISK_PER_TRADE = 0.02;

        function calculatePositionSize(confidence) {

            let riskMultiplier = 1;

            if (confidence >= 90) {
                riskMultiplier = 1;
            } else if (confidence >= 80) {
                riskMultiplier = 0.75;
            } else {
                riskMultiplier = 0.5;
            }

            const riskAmount =
                ACCOUNT_BALANCE *
                RISK_PER_TRADE *
                riskMultiplier;

            return Math.round(riskAmount);
        }

        function getStopLoss(rsi) {

              if (rsi == null) {
            return 2.5;
        }
            if (rsi > 70) return 1.5;
            if (rsi < 30) return 1.5;

            return 2.5;
        }

       const allTrades = Object.values(tradeMap)
    .filter(t => t.confidence > 0);

    const consensus = {};

allTrades.forEach(trade => {

    if (!consensus[trade.asset]) {
        consensus[trade.asset] = {
            asset: trade.asset,
            BUY: 0,
            SELL: 0,
            buyConfidence: 0,
            sellConfidence: 0
        };
    }

    if (trade.action === "BUY") {
        consensus[trade.asset].BUY += trade.count;
        consensus[trade.asset].buyConfidence += trade.confidence;
    }

    if (trade.action === "SELL") {
        consensus[trade.asset].SELL += trade.count;
        consensus[trade.asset].sellConfidence += trade.confidence;
    }

});

const finalSignals = [];

Object.values(consensus).forEach(asset => {

    const total = asset.BUY + asset.SELL;

    if (total === 0) return;

    const action =
        asset.BUY > asset.SELL
            ? "BUY"
            : "SELL";

    const winningCount =
        Math.max(asset.BUY, asset.SELL);

    const strength =
        Math.round((winningCount / total) * 100);

    finalSignals.push({

        asset: asset.asset,

        action,

        strength,

        totalArticles: total

    });

});

res.json({
    bestTrade,
    finalSignals,
    allTrades
});

const bestTrade = allTrades.length
    ? allTrades.sort((a, b) => {
        const scoreA = a.confidence + Math.min(a.count * 3, 15);
        const scoreB = b.confidence + Math.min(b.count * 3, 15);
        return scoreB - scoreA;
    })[0]
    : null;

        // ADD RISK DATA
        if (bestTrade) {

            bestTrade.positionSize =
                calculatePositionSize(bestTrade.confidence);

            bestTrade.riskPercent =
                RISK_PER_TRADE * 100;

            bestTrade.stopLoss =
                getStopLoss(bestTrade.rsi);
        }

        await saveTradeHistory(bestTrade);


        res.json({
            bestTrade,
            allTrades
        });

    } catch (err) {

        console.error(err);

        res.status(500).send("Error fetching news");
    }
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});

function analyzeSentiment(text) {

    const lowerText = text.toLowerCase();

    const strongBearish = [
        "war",
        "crisis",
        "collapse",
        "crash",
        "recession"
    ];

    const bearish = [
        "fall",
        "drop",
        "decline",
        "warning",
        "fear"
    ];

    const bullish = [
        "rise",
        "gain",
        "growth",
        "positive"
    ];

    const strongBullish = [
        "surge",
        "record high",
        "breakout",
        "boom"
    ];

    for (let word of strongBearish) {
        if (lowerText.includes(word)) {
            return "STRONG_BEARISH";
        }
    }

    for (let word of strongBullish) {
        if (lowerText.includes(word)) {
            return "STRONG_BULLISH";
        }
    }

    for (let word of bearish) {
        if (lowerText.includes(word)) {
            return "BEARISH";
        }
    }

    for (let word of bullish) {
        if (lowerText.includes(word)) {
            return "BULLISH";
        }
    }

    return "NEUTRAL";
}

function detectAssets(text) {

    const lowerText = text.toLowerCase();

    const assets = [];

    // INDEX
    if (
        lowerText.includes("s&p") ||
        lowerText.includes("nasdaq") ||
        lowerText.includes("dow") ||
        lowerText.includes("stocks")
    ) {
        assets.push("SPX500");
    }

    // OIL
    if (
        lowerText.includes("oil") ||
        lowerText.includes("energy")
    ) {
        assets.push("USOIL");
    }

    // GOLD
    if (lowerText.includes("gold")) {
        assets.push("XAUUSD");
    }

    return assets;
}

function detectImpact(text) {

    const lowerText = text.toLowerCase();

    const highImpactWords = [
        "war",
        "inflation",
        "interest rate",
        "crisis",
        "recession"
    ];

    for (let word of highImpactWords) {
        if (lowerText.includes(word)) {
            return "HIGH";
        }
    }

    return "MEDIUM";
}

function generateSignal(sentiment, impact) {

    let score = 0;

    if (sentiment === "STRONG_BULLISH") score += 2;
    if (sentiment === "BULLISH") score += 1;
    if (sentiment === "BEARISH") score -= 1;
    if (sentiment === "STRONG_BEARISH") score -= 2;

    if (impact === "HIGH") {
        score *= 2;
    }

    if (score >= 3) return "🔥 STRONG BUY";
    if (score >= 1) return "📈 BUY";
    if (score <= -3) return "🔥 STRONG SELL";
    if (score <= -1) return "📉 SELL";

    return "⚖️ HOLD";
}

function mapToTrade(asset, sentiment) {

    if (asset === "SPX500") {

        if (sentiment.includes("BEARISH")) {
            return "SELL SPX500";
        }

        if (sentiment.includes("BULLISH")) {
            return "BUY SPX500";
        }
    }

    if (asset === "USOIL") {

        if (sentiment.includes("BEARISH")) {
            return "SELL OIL";
        }

        if (sentiment.includes("BULLISH")) {
            return "BUY OIL";
        }
    }

    if (asset === "XAUUSD") {

        if (sentiment.includes("BEARISH")) {
            return "SELL GOLD";
        }

        if (sentiment.includes("BULLISH")) {
            return "BUY GOLD";
        }
    }

    return "NO TRADE";
}

function calculateRSI(prices) {

    if (!prices || prices.length < 20) {
        return null;
    }

    const rsi = RSI.calculate({
        values: prices,
        period: 14
    });

    return rsi.length
        ? rsi[rsi.length - 1]
        : null;
}

function calculateTrend(prices) {

    if (!prices || prices.length < 200) {
        return "UNKNOWN";
    }

    const sma50 = SMA.calculate({
        period: 50,
        values: prices
    });

    const sma200 = SMA.calculate({
        period: 200,
        values: prices
    });

    const latest50 =
        sma50[sma50.length - 1];

    const latest200 =
        sma200[sma200.length - 1];

    if (latest50 > latest200) {
        return "BULLISH";
    }

    if (latest50 < latest200) {
        return "BEARISH";
    }

    return "SIDEWAYS";
}

function filterTrade(signal, rsi) {

    if (rsi === null) {
        return signal;
    }

    // SELL
    if (signal.includes("SELL")) {

        if (rsi < 30) {
            return "❌ BLOCKED (Oversold)";
        }

        if (rsi < 45) {
            return "⚠️ WEAK SELL";
        }

        if (rsi >= 45 && rsi <= 60) {
            return "⛔ NO EDGE";
        }

        if (rsi > 65) {
            return "🔥 STRONG SELL (Good timing)";
        }
    }

    // BUY
    if (signal.includes("BUY")) {

        if (rsi > 70) {
            return "❌ BLOCKED (Overbought)";
        }

        if (rsi > 55) {
            return "⚠️ WEAK BUY";
        }

        if (rsi >= 47.5 && rsi <= 52.5) {
            return "⛔ NO EDGE";
        }

        if (rsi < 35) {
            return "🔥 STRONG BUY (Good timing)";
        }
    }

    return signal;
}

function mapToApiSymbol(asset) {

    if (asset === "SPX500") return "SPY";
    if (asset === "USOIL") return "USO";
    if (asset === "XAUUSD") return "GLD";

    return null;
}

async function getRSIForAsset(asset) {

    const symbol = mapToApiSymbol(asset);

    if (!symbol) {
        return null;
    }

    if (rsiCache[symbol] !== undefined) {
        return rsiCache[symbol];
    }

    try {

        const prices =
            await getMarketData(symbol);

        

            console.log(symbol);
            console.log(prices.length);
            console.log(prices.slice(-5));

        const rsi =
            calculateRSI(prices);

        rsiCache[symbol] = rsi;

        return rsi;

    } catch (err) {

        console.log("RSI error:", err.message);

        return null;
    }
}

async function getTrendForAsset(asset) {

    const symbol = mapToApiSymbol(asset);

    if (!symbol) {
        return "UNKNOWN";
    }

    try {

        const prices =
            await getMarketData(symbol);

        return calculateTrend(prices);

    } catch (err) {

        console.log("Trend error:", err.message);

        return "UNKNOWN";
    }
}

async function getMarketData(symbol) {

    try {

        const result =
            await yahooFinance.historical(symbol, {
                period1: new Date("2024-01-01"),
                period2: new Date(),
                interval: "1d"
            });

        return result
            .map(day => day.close)
            .filter(Boolean);

    } catch (err) {

        console.log("Yahoo error:", err.message);

        return [];
    }
}

function calculateConfidence(
    sentiment,
    impact,
    rsi,
    finalTrade
) {

    if (
        finalTrade.includes("BLOCKED") ||
        finalTrade.includes("NO EDGE")
    ) {
        return 0;
    }

    let score = 0;

    // SENTIMENT
    if (sentiment.includes("STRONG")) {
        score += 40;
    } else if (sentiment !== "NEUTRAL") {
        score += 25;
    }

    // IMPACT
    if (impact === "HIGH") {
        score += 20;
    } else {
        score += 10;
    }

    // RSI
    if (rsi === null) {
    score -= 10; // Missing market confirmation
} else {

    if (rsi > 65 || rsi < 35) {
        score += 40;
    } else if (rsi > 55 || rsi < 45) {
        score += 25;
    } else {
        score += 10;
    }
}

    return Math.min(score, 95);
}

async function saveTradeHistory(bestTrade) {
    if (!bestTrade) return;

    const filePath = "trade-history.xlsx";
    const workbook = new ExcelJS.Workbook();

    if (fs.existsSync(filePath)) {
        await workbook.xlsx.readFile(filePath);
    }

    const sheet = workbook.getWorksheet("Trades") || workbook.addWorksheet("Trades");

    if (sheet.rowCount === 0) {
        sheet.addRow([
            "Date",
            "Asset",
            "Action",
            "RSI",
            "Trend",
            "Confidence",
            "Final Trade",
            "Position Size",
            "Stop Loss"
        ]);
    }

    sheet.addRow([
        new Date().toISOString(),
        bestTrade.asset,
        bestTrade.action,
        bestTrade.rsi,
        bestTrade.trend,
        bestTrade.confidence,
        bestTrade.finalTrade,
        bestTrade.positionSize,
        bestTrade.stopLoss
    ]);

    await workbook.xlsx.writeFile(filePath);
}