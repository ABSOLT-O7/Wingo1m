const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// Poll the upstream history continuously, even when no client is calling the API.
// Override with POLL_INTERVAL_MS if needed; 10 seconds is the default.
const POLL_INTERVAL_MS = Math.max(5000, Number.parseInt(process.env.POLL_INTERVAL_MS || "10000", 10) || 10000);
const REQUEST_TIMEOUT_MS = 10000;
const SOURCE_URL = "https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json";

app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

let latestResult = null;
let lastFetchAttemptAt = null;
let lastSuccessfulFetchAt = null;
let lastFetchError = null;
let fetchInProgress = false;

async function fetchLatestResult() {
  // Avoid overlapping upstream requests if one is slow.
  if (fetchInProgress) return;
  fetchInProgress = true;
  lastFetchAttemptAt = new Date().toISOString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${SOURCE_URL}?ts=${Date.now()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-cache",
        "User-Agent": "Mozilla/5.0 (compatible; WinGoResultAPI/1.0)"
      },
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`Upstream HTTP ${response.status}`);

    const payload = await response.json();
    const list = payload?.data?.list;
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error("Upstream history list is missing or empty");
    }

    // Use the newest entry in the returned history, not a cached prior response.
    const newest = list[0];
    if (newest?.number === undefined || newest?.issueNumber === undefined) {
      throw new Error("Latest history entry is missing number or issueNumber");
    }

    const number = Number.parseInt(newest.number, 10);
    if (!Number.isInteger(number) || number < 0 || number > 9) {
      throw new Error("Upstream returned an invalid result number");
    }

    const fetchedAt = new Date().toISOString();
    const size = number <= 4 ? "SMALL" : "BIG";
    latestResult = {
      ok: true,
      game: "wingo1M",
      period: String(newest.issueNumber),
      number,
      size,
      color: size === "BIG" ? "RED" : "GREEN",
      updatedAt: fetchedAt,
      source: "upstream-latest-result"
    };
    lastSuccessfulFetchAt = fetchedAt;
    lastFetchError = null;
    console.log(`[poll] Latest period=${latestResult.period}, number=${number}, fetchedAt=${fetchedAt}`);
  } catch (error) {
    lastFetchError = error?.name === "AbortError"
      ? "Upstream request timed out"
      : (error?.message || "Unable to fetch upstream result");
    console.error(`[poll] Fetch failed: ${lastFetchError}`);
  } finally {
    clearTimeout(timeout);
    fetchInProgress = false;
  }
}

app.get("/", (_req, res) => res.json({
  ok: true,
  service: "WinGo 1M JSON API",
  endpoint: "/api/wingo1M",
  pollIntervalMs: POLL_INTERVAL_MS
}));

// Returns the most recently fetched result. Background polling updates it continuously.
app.get("/api/wingo1M", (_req, res) => {
  if (!latestResult) {
    return res.status(503).json({
      ok: false,
      error: "Waiting for the first successful upstream fetch",
      lastFetchAttemptAt,
      lastFetchError
    });
  }

  return res.json({
    ...latestResult,
    lastFetchAttemptAt,
    lastSuccessfulFetchAt,
    lastFetchError,
    pollIntervalMs: POLL_INTERVAL_MS
  });
});

app.get("/health", (_req, res) => res.json({
  ok: true,
  service: "WinGo 1M JSON API",
  pollIntervalMs: POLL_INTERVAL_MS,
  lastFetchAttemptAt,
  lastSuccessfulFetchAt,
  lastFetchError,
  latestPeriod: latestResult?.period ?? null,
  latestNumber: latestResult?.number ?? null
}));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on port ${PORT}; polling every ${POLL_INTERVAL_MS} ms`);
  // Fetch immediately at startup, then continue polling while the service is running.
  void fetchLatestResult();
  setInterval(() => void fetchLatestResult(), POLL_INTERVAL_MS);
});
