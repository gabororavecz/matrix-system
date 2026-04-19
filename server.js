// server.js
const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();

app.get("/news", async (req, res) => {
    try {
        const response = await axios.get(
            `https://newsapi.org/v2/everything?q=forex OR stocks&apiKey=${process.env.NEWS_API_KEY}`
        );

        const analyzed = response.data.articles.map(article => {
            const text = article.title + " " + article.description;

            const sentiment = analyzeSentiment(text);
            const assets = detectAssets(text);
            const impact = detectImpact(text);
            const signal = generateSignal(sentiment, impact);

            const trades = assets.map(asset => mapToTrade(asset, sentiment));

            return {
                title: article.title,
                sentiment,
                impact,
                assets,
                signal,
                trades
            };
        });

        res.json(analyzed);
    } catch (err) {
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

#