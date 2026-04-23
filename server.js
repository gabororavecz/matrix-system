    // server.js
const express = require("express");
const axios = require("axios");
require("dotenv").config();

const { RSI } = require("technicalindicators");

const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance();

const rsiCache = {};

const app = express();

app.get("/news", async (req, res) => {
    try {
        const response = await axios.get(
            `https://newsapi.org/v2/everything?q=forex OR stocks&apiKey=${process.env.NEWS_API_KEY}`
        );

        const analyzed = await Promise.all(
            response.data.articles.map(async (article) => {
                const text = article.title + " " + article.description;

                const sentiment = analyzeSentiment(text);
                const assets = detectAssets(text);
                const impact = detectImpact(text);
                const signal = generateSignal(sentiment, impact);

                const trades = [];

                for (let asset of assets) {
                    const baseTrade = mapToTrade(asset, sentiment);
                    const rsi = await getRSIForAsset(asset);

                    const finalTrade = filterTrade(baseTrade, rsi);


                    trades.push({
                        asset,
                        baseTrade,
                        rsi,
                        finalTrade
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

        res.json(analyzed);

    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching news");
    }
});


app.listen(3000, () => console.log("Server running on port 3000"));

function analyzeSentiment(text) {
    const lowerText = text.toLowerCase();

    const strongBearish = [
        "war", "crisis", "collapse", "crash", "wiped off", "recession"
    ];

    const bearish = [
        "fall", "drop", "decline", "warning", "risk", "fear"
    ];

    const bullish = [
        "rise", "gain", "growth", "positive", "strong"
    ];

    const strongBullish = [
        "surge", "record high", "breakout", "boom"
    ];

    for (let word of strongBearish) {
        if (lowerText.includes(word)) return "STRONG_BEARISH";
    }

    for (let word of strongBullish) {
        if (lowerText.includes(word)) return "STRONG_BULLISH";
    }

    for (let word of bearish) {
        if (lowerText.includes(word)) return "BEARISH";
    }

    for (let word of bullish) {
        if (lowerText.includes(word)) return "BULLISH";
    }

    return "NEUTRAL";
}


function detectAssets(text) {
    const lowerText = text.toLowerCase();
    const assets = [];

    // Indices
    if (lowerText.includes("s&p") || lowerText.includes("nasdaq") || lowerText.includes("dow")) {
        assets.push("SPX500");
    }

    // Oil
    if (lowerText.includes("oil") || lowerText.includes("energy")) {
        assets.push("USOIL");
    }

    // Gold
    if (lowerText.includes("gold")) {
        assets.push("XAUUSD");
    }

    // USD (macro)
    if (lowerText.includes("fed") || lowerText.includes("dollar") || lowerText.includes("usd")) {
        assets.push("USD");
    }

    // Stocks generic
    if (lowerText.includes("stocks") || lowerText.includes("equities")) {
        assets.push("SPX500");
    }

    return assets;
}

function detectImpact(text) {
    const highImpactWords = ["war", "interest rate", "inflation", "crisis", "recession"];

    const lowerText = text.toLowerCase();

    for (let word of highImpactWords) {
        if (lowerText.includes(word)) return "HIGH";
    }

    return "MEDIUM";
}

function generateSignal(sentiment, impact) {
    let score = 0;

    if (sentiment === "STRONG_BULLISH") score += 2;
    if (sentiment === "BULLISH") score += 1;
    if (sentiment === "BEARISH") score -= 1;
    if (sentiment === "STRONG_BEARISH") score -= 2;

    if (impact === "HIGH") score *= 2;

    if (score >= 3) return "🔥 STRONG BUY";
    if (score >= 1) return "📈 BUY";
    if (score <= -3) return "🔥 STRONG SELL";
    if (score <= -1) return "📉 SELL";

    return "⚖️ HOLD";
}

function mapToTrade(asset, sentiment) {
    if (asset === "SPX500") {
        if (sentiment.includes("BEARISH")) return "SELL SPX500";
        if (sentiment.includes("BULLISH")) return "BUY SPX500";
    }

    if (asset === "USOIL") {
        if (sentiment.includes("BEARISH")) return "SELL OIL";
        if (sentiment.includes("BULLISH")) return "BUY OIL";
    }

    if (asset === "XAUUSD") {
        if (sentiment.includes("BEARISH")) return "SELL GOLD";
        if (sentiment.includes("BULLISH")) return "BUY GOLD";
    }

    return "NO TRADE";
}





function calculateRSI(prices) {
    if (!prices || prices.length < 20) return null;

    const rsi = RSI.calculate({
        values: prices,
        period: 14
    });

    return rsi.length ? rsi[rsi.length - 1] : null;
}

function filterTrade(signal, rsi) {
    if (rsi === null) return signal;

    // 🔴 Strong sell only when market is high
    if (signal.includes("SELL")) {
        if (rsi < 30) return "❌ BLOCKED (Oversold)";
        if (rsi < 45) return "⚠️ WEAK SELL (Low momentum)";
        if (rsi >= 45 && rsi <= 60) return "⛔ NO EDGE (Sideways market)";
        if (rsi > 65) return "🔥 STRONG SELL (Good timing)";
    }

    // 🟢 Strong buy only when market is low
    if (signal.includes("BUY")) {
    if (rsi > 70) return "❌ BLOCKED (Overbought)";
    if (rsi > 55) return "⚠️ WEAK BUY (High price)";
    if (rsi >= 40 && rsi <= 55) return "⛔ NO EDGE (Sideways market)";
    if (rsi < 35) return "🔥 STRONG BUY (Good timing)";
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
    if (!symbol) return null;

    if (rsiCache[symbol] !== undefined) {
        return rsiCache[symbol];
    }

    try {
        const prices = await getMarketData(symbol);

        console.log(`Prices for ${symbol}:`, prices.length); // ✅ correct debug

        const rsi = calculateRSI(prices);

        console.log(`RSI for ${symbol}:`, rsi); // ✅ debug

        rsiCache[symbol] = rsi;

        return rsi;
    } catch (err) {
        console.log("RSI error:", err.message);
        return null;
    }
}


async function getMarketData(symbol) {
    try {
        const result = await yahooFinance.historical(symbol, {
            period1: new Date("2024-01-01"),
            period2: new Date(), // ✅ THIS FIXES EVERYTHING
            interval: "1d"
        });

        return result.map(day => day.close).filter(Boolean);
    } catch (err) {
        console.log("Yahoo error:", err.message);
        return [];
    }
}

