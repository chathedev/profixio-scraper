const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
let cachedMatches = [];
let lastUpdated = null;

async function scrapeMatches() {
  try {
    console.log("📡 Fetching matches from Livewire...");

    // STEP 1: Get cookies from initial GET
    const res = await fetch("https://www.profixio.com/app/tournaments?klubbid=26031", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const cookies = res.headers.get("set-cookie") || "";
    const xsrf = cookies.match(/XSRF-TOKEN=([^;]+)/)?.[1];
    const session = cookies.match(/profixio_session=([^;]+)/)?.[1];

    if (!xsrf || !session) {
      throw new Error("Missing cookies");
    }

    // STEP 2: Build payload (taken from DevTools → Network → livewire/update)
    const payload = {
      updates: [
        {
          type: "callMethod",
          payload: {
            method: "filterMatches",
            params: { klubbid: 26031, season: 765 }
          }
        }
      ]
    };

    // STEP 3: POST to Livewire endpoint
    const livewireRes = await fetch("https://www.profixio.com/app/livewire/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Livewire": "true",
        "X-CSRF-TOKEN": decodeURIComponent(xsrf),
        "Cookie": `XSRF-TOKEN=${xsrf}; profixio_session=${session}`,
        "User-Agent": "Mozilla/5.0"
      },
      body: JSON.stringify(payload)
    });

    const data = await livewireRes.json();

    // STEP 4: Parse response → matches
    // Adjust this according to actual Livewire JSON
    cachedMatches = (data?.effects?.html || "")
      .split("</tr>")
      .map(row => {
        const cells = row.split("</td>").map(c => c.replace(/<[^>]+>/g, "").trim());
        if (cells.length >= 4) {
          return {
            date: cells[0],
            time: cells[1],
            teams: cells[2],
            result: cells[3]
          };
        }
      })
      .filter(Boolean);

    lastUpdated = new Date().toISOString();
    console.log(`✅ Updated: ${cachedMatches.length} matches`);

  } catch (err) {
    console.error("❌ Scrape failed:", err.message);
  }

  // repeat directly after finishing
  setTimeout(scrapeMatches, 5000);
}

// start loop
scrapeMatches();

app.get("/matches", (req, res) => {
  res.json({
    updatedAt: lastUpdated,
    count: cachedMatches.length,
    matches: cachedMatches,
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});
