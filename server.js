const express = require("express");
const { chromium } = require("playwright");

const app = express();
let cachedMatches = [];
let lastUpdated = null;
let lastHTML = "";

async function scrapeMatches() {
  while (true) {
    try {
      console.log("🌍 Starting scrape...");
      const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        locale: "sv-SE",
      });

      const page = await context.newPage();

      // Capture all API requests (may reveal JSON endpoint)
      page.on("response", async (resp) => {
        try {
          const url = resp.url();
          if (url.includes("profixio") && url.includes("json")) {
            console.log("📡 Found JSON endpoint:", url);
          }
        } catch {}
      });

      await page.goto(
        "https://www.profixio.com/app/tournaments?klubbid=26031",
        { waitUntil: "networkidle", timeout: 60000 }
      );

      await page.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
      });

      // dump HTML
      lastHTML = await page.content();

      // Try scraping table if it exists
      const rows = await page.$$("table tr");
      if (rows.length === 0) {
        console.warn("⚠️ No <table> rows found! Profixio may load via XHR.");
      }

      const matches = await page.$$eval("table tr", (rows) =>
        rows
          .map((row) => {
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
      console.log(`✅ Updated: ${matches.length} matches`);

      await browser.close();
    } catch (err) {
      console.error("❌ Scrape failed:", err.message);
    }

    await new Promise((r) => setTimeout(r, 10000)); // 10s between tries
  }
}

scrapeMatches();

app.get("/matches", (req, res) => {
  res.json({
    updatedAt: lastUpdated,
    count: cachedMatches.length,
    matches: cachedMatches,
  });
});

// debug endpoint: see raw HTML
app.get("/debug-html", (req, res) => {
  res.send(lastHTML || "⚠️ No HTML cached yet.");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});
