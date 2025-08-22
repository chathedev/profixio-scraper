const express = require("express");
const resp = await fetch(jsonEndpoint);

const app = express();
let cachedMatches = [];
let lastUpdated = null;

async function scrapeMatches() {
  try {
    console.log("📡 Starting full scrape...");

    // STEP 1: Visit tournament page to grab cookies
    const pageRes = await fetch("https://www.profixio.com/app/tournaments?term=&filters[open_registration]=0&filters[kampoppsett]=0&filters[land_id]=se&filters[type]=seriespill&filters[idrett]=HB&filters[listingtype]=matches&filters[season]=765&dateTo=2026-04-30&klubbid=26031&dateFrom=2025-08-16", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });

    const cookies = pageRes.headers.get("set-cookie") || "";
    const xsrf = cookies.match(/XSRF-TOKEN=([^;]+)/)?.[1];
    const session = cookies.match(/profixio_session=([^;]+)/)?.[1];

    if (!xsrf || !session) throw new Error("Could not get XSRF or session cookies");

    // STEP 2: Build payload (generic Livewire boot)
    const payload = {
      updates: [
        {
          type: "callMethod",
          payload: {
            method: "filter",
            params: {
              klubbid: "26031",
              season: "765",
              type: "seriespill",
              idrett: "HB"
            }
          }
        }
      ]
    };

    // STEP 3: POST to livewire/update
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

    const json = await livewireRes.json();

    // STEP 4: Extract table HTML inside Livewire JSON
    const html = json?.effects?.html || "";
    const matches = html.split("</tr>").map(row => {
      const cells = row.split("</td>").map(c => c.replace(/<[^>]+>/g, "").trim());
      if (cells.length >= 4) {
        return {
          date: cells[0],
          time: cells[1],
          teams: cells[2],
          result: cells[3]
        };
      }
    }).filter(Boolean);

    cachedMatches = matches;
    lastUpdated = new Date().toISOString();
    console.log(`✅ Updated: ${matches.length} matches`);

  } catch (err) {
    console.error("❌ Scrape failed:", err.message);
  }

  // Loop again after 5s
  setTimeout(scrapeMatches, 5000);
}

// Kick off loop automatically
scrapeMatches();

app.get("/matches", (req, res) => {
  res.json({
    updatedAt: lastUpdated,
    count: cachedMatches.length,
    matches: cachedMatches
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on port", process.env.PORT || 3000);
});
