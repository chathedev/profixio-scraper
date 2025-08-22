const express = require("express");
const { chromium } = require("playwright");

const app = express();
let cachedMatches = [];
let lastUpdated = null;
let lastHTML = ""; // store HTML for debugging

async function scrapeMatches() {
  try {
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"], // required on Railway
    });
    const page = await browser.newPage();

    console.log("🌍 Navigating to Profixio...");
    await page.goto(
      "https://www.profixio.com/app/tournaments?klubbid=26031",
      { waitUntil: "networkidle", timeout: 60000 }
    );

    // wait for table cells (more robust than tbody rows)
    await page.waitForSelector("table td", { timeout: 60000 });

    // grab raw HTML for debugging
    lastHTML = await page.content();

    const matches = await page.$$eval("table tr", rows =>
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

    cachedMatches = matches;
    lastUpdated = new Date().toISOString();

    console.log(`✅ Scrape updated: ${matches.length} matches`);
    await browser.close();
  } catch (err) {
    console.error("❌ Scrape failed:", err.message);
  }
}

// run every 5 min
setInterval(scrapeMatches, 5 * 60 * 1000);
scrapeMatches();

// endpoint: matches
app.get("/matches", (req, res) => {
  res.json({
    updatedAt: lastUpdated,
    count: cachedMatches.length,
    matches: cachedMatches,
  });
});

// endpoint: debug raw HTML
app.get("/debug-html", (req, res) => {
  res.send(lastHTML || "⚠️ No HTML cached yet.");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});
