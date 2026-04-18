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

        res.json(response.data.articles);
    } catch (err) {
        res.status(500).send("Error fetching news");
    }
});

app.listen(3000, () => console.log("Server running on port 3000"));

function analyzeSentiment(text) {
    const bullishWords = ["rise", "gain", "bullish", "surge"];
    const bearishWords = ["fall", "drop", "bearish", "crash"];

    let score = 0;

    bullishWords.forEach(word => {
        if (text.includes(word)) score++;
    });

    bearishWords.forEach(word => {
        if (text.includes(word)) score--;
    });

    if (score > 0) return "BULLISH";
    if (score < 0) return "BEARISH";
    return "NEUTRAL";
}

