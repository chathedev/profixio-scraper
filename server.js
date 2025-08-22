const express = require("express");
const { chromium } = require("playwright");

const app = express();
let cachedMatches = [];

// scrape function
async function scrapeMatches() {
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log("🌍 Visiting Profixio...");
    await page.goto("https://www.profixio.com/app/tournaments?klubbid=26031", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // wait until at least one match row appears
    await page.waitForSelector("table tbody tr td", { timeout: 60000 });

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
    console.log("✅ Scraped:", matches.length, "matches");

    await browser.close();
  } catch (err) {
    console.error("❌ Scrape failed:", err.message);
  }
}

// scrape once on startup
scrapeMatches();
// refresh every 15 min (not 15s → avoids rate limits)
setInterval(scrapeMatches, 15 * 60 * 1000);

// endpoints
app.get("/", (req, res) => {
  res.send("✅ Profixio scraper is running.");
});

app.get("/matches", (req, res) => {
  res.json(cachedMatches.length ? cachedMatches : { status: "updating..." });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});
