const express = require("express");
const { chromium } = require("playwright");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));


const app = express();
let cachedMatches = [];
let lastUpdated = null;
let jsonEndpoint = null;

async function discoverJsonEndpoint() {
  console.log("🌍 Discovering Profixio JSON endpoint...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  page.on("response", async (resp) => {
    try {
      const url = resp.url();
      if (url.includes("profixio") && url.includes("json")) {
        console.log("📡 Found JSON endpoint:", url);
        jsonEndpoint = url;
      }
    } catch {}
  });

  await page.goto(
    "https://www.profixio.com/app/tournaments?klubbid=26031",
    { waitUntil: "networkidle", timeout: 60000 }
  );

  await new Promise((r) => setTimeout(r, 10000)); // give time for XHR
  await browser.close();
}

async function scrapeMatches() {
  while (true) {
    try {
      if (!jsonEndpoint) {
        await discoverJsonEndpoint();
      }

      if (jsonEndpoint) {
        console.log("📥 Fetching matches from JSON API...");
        const resp = await fetch(jsonEndpoint);
        const data = await resp.json();

        // Adapt this depending on JSON structure
        cachedMatches = data.map((m) => ({
          date: m.date || "",
          time: m.time || "",
          teams: `${m.home} - ${m.away}`,
          result: m.result || "",
        }));

        lastUpdated = new Date().toISOString();
        console.log(`✅ Updated: ${cachedMatches.length} matches`);
      }
    } catch (err) {
      console.error("❌ Scrape failed:", err.message);
    }

    await new Promise((r) => setTimeout(r, 10000)); // wait 10s, then repeat
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

app.get("/endpoint", (req, res) => {
  res.json({ jsonEndpoint });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});
