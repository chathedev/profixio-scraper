const express = require("express");
const { chromium } = require("playwright");

const app = express();
let cachedMatches = [];

async function scrapeMatches() {
  try {
    const browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox"
      ]
    });
    const page = await browser.newPage();

    await page.goto("https://www.profixio.com/app/tournaments?klubbid=26031", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // Wait for at least one match row (inspect Profixio HTML: they use <tr> inside tbody)
    await page.waitForSelector("table tbody tr", { timeout: 20000 });

    // Scrape rows
    const matches = await page.$$eval("table tbody tr", rows =>
      rows.map(row => {
        const cols = Array.from(row.querySelectorAll("td"));
        if (cols.length >= 4) {
          return {
            date: cols[0].innerText.trim(),
            time: cols[1].innerText.trim(),
            teams: cols[2].innerText.trim(),
            result: cols[3].innerText.trim()
          };
        }
        return null;
      }).filter(Boolean)
    );

    cachedMatches = matches;
    console.log("✅ Updated:", matches.length, "matches");

    await browser.close();
  } catch (err) {
    console.error("❌ Scrape failed:", err.message);
  }
}

// run every 10 minutes instead of 15s
setInterval(scrapeMatches, 10 * 60 * 1000);
scrapeMatches();

// API route
app.get("/matches", (req, res) => {
  res.json(cachedMatches);
});

// Health check
app.get("/", (req, res) => {
  res.send("✅ Profixio scraper is running. Go to /matches for data.");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running on port", process.env.PORT || 3000);
});
