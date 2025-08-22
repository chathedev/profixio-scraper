const express = require("express");
const { chromium } = require("playwright");

const app = express();
let cachedMatches = [];
let lastUpdated = null;

async function scrapeMatches() {
  try {
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"], // Railway fix
    });
    const page = await browser.newPage();

    console.log("🌍 Navigating to Profixio...");
    await page.goto("https://www.profixio.com/app/tournaments?klubbid=26031", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // wait for rows inside table
    await page.waitForSelector("table tbody tr", { timeout: 60000 });

    const matches = await page.$$eval("table tbody tr", rows =>
      rows
        .map(row => {
          const cols = Array.from(row.querySelectorAll("td"));
          if (cols.length >= 4) {
            return {
              date: cols[0]?.innerText.trim(),
              time: cols[1]?.innerText.trim(),
              teams: cols[2]?.innerText.trim(),
              result: cols[3]?.innerText.trim() || null,
            };
          }
          return null;
        })
        .filter(Boolean)
    );

    // sort by date+time
    const sorted = matches.sort((a, b) => {
      const da = new Date(`${a.date} ${a.time}`);
      const db = new Date(`${b.date} ${b.time}`);
      return da - db;
    });

    cachedMatches = sorted;
    lastUpdated = new Date().toISOString();

    console.log(`✅ Scrape updated: ${sorted.length} matches`);
    await browser.close();
  } catch (err) {
    console.error("❌ Scrape failed:", err.message);
  }
}

// Run every 5 minutes
setInterval(scrapeMatches, 5 * 60 * 1000);
scrapeMatches();

// Routes
app.get("/matches", (req, res) => {
  res.json({
    lastUpdated,
    count: cachedMatches.length,
    matches: cachedMatches,
  });
});

app.get("/status", (req, res) => {
  res.json({
    lastUpdated,
    matchesCached: cachedMatches.length,
    healthy: cachedMatches.length > 0,
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});
