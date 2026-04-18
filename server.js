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

            return {
                title: article.title,
                sentiment,
                impact,
                assets,
                signal
            };
        });

        res.json(analyzed);
    } catch (err) {
        res.status(500).send("Error fetching news");
    }
});


app.listen(3000, () => console.log("Server running on port 3000"));

function analyzeSentiment(text) {
    const bullishWords = ["rise", "gain", "bullish", "surge", "growth", "strong"];
    const bearishWords = ["fall", "drop", "bearish", "crash", "war", "crisis", "fear"];

    let score = 0;

    const lowerText = text.toLowerCase();

    bullishWords.forEach(word => {
        if (lowerText.includes(word)) score++;
    });

    bearishWords.forEach(word => {
        if (lowerText.includes(word)) score--;
    });

    if (score > 1) return "STRONG_BULLISH";
    if (score > 0) return "BULLISH";
    if (score < -1) return "STRONG_BEARISH";
    if (score < 0) return "BEARISH";
    return "NEUTRAL";
}


function detectAssets(text) {
    const lowerText = text.toLowerCase();

    const assets = [];

    if (lowerText.includes("oil") || lowerText.includes("energy")) {
        assets.push("OIL");
    }

    if (lowerText.includes("usd") || lowerText.includes("dollar") || lowerText.includes("fed")) {
        assets.push("USD");
    }

    if (lowerText.includes("stocks") || lowerText.includes("equities")) {
        assets.push("STOCKS");
    }

    if (lowerText.includes("gold")) {
        assets.push("GOLD");
    }

    if (lowerText.includes("bitcoin") || lowerText.includes("crypto")) {
        assets.push("CRYPTO");
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

