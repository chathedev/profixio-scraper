const express = require("express");
const { chromium } = require("playwright");

const app = express();
let cachedMatches = [];

async function scrapeMatches() {
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto("https://www.profixio.com/app/tournaments?klubbid=26031", {
      waitUntil: "networkidle"
    });

    await page.waitForSelector("table");

    const matches = await page.$$eval("tr", rows =>
      rows.map(row => {
        const cols = Array.from(row.querySelectorAll("td"));
        if (cols.length > 3) {
          return {
            date: cols[0].innerText.trim(),
            time: cols[1].innerText.trim(),
            teams: cols[2].innerText.trim(),
            result: cols[3].innerText.trim()
          };
        }
      }).filter(Boolean)
    );

    cachedMatches = matches;
    console.log("Updated:", matches.length, "matches");

    await browser.close();
  } catch (err) {
    console.error("Scrape failed:", err.message);
  }
}

// run every 15s
setInterval(scrapeMatches, 15000);
scrapeMatches();

app.get("/matches", (req, res) => {
  res.json(cachedMatches);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server running on port", process.env.PORT || 3000);
});
