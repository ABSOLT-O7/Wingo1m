# WinGo 1M JSON API (Render)

This service continuously polls the upstream WinGo 1M history endpoint while the Node process is running. It fetches once at startup and then every 10 seconds by default, even if no client is requesting the API.

## Endpoints
- `GET /api/wingo1M` — returns the latest result fetched by the background poller.
- `GET /health` — shows poll interval, last attempt/success, most recent fetch error, and latest period/number.

## Deploy on Render
1. Upload `server.js`, `package.json`, and `README.md` to the connected GitHub repository.
2. In Render, use **New + → Web Service** and connect the repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Deploy and wait for the first successful fetch in the logs.

Endpoint: `https://YOUR-SERVICE.onrender.com/api/wingo1M`
Health: `https://YOUR-SERVICE.onrender.com/health`

## Poll interval
Default is 10,000 ms (10 seconds). To change it, set the Render environment variable `POLL_INTERVAL_MS`, for example `10000`. Values below 5,000 ms are clamped to 5 seconds to avoid excessive upstream requests.

## Important limitations
- The service polls continuously only while the Render instance is running. Free services may sleep when idle; after waking, polling resumes.
- If the upstream history endpoint returns stale data or fails, the API cannot invent a new result. `/health` exposes the last fetch error and last successful fetch time.
- This reports published game history; it does not predict future results.
- Existing classification is preserved: 0–4 = SMALL and 5–9 = BIG; `color` remains the original size-based label (SMALL → GREEN, BIG → RED). This is a simple label, not a full official WinGo color classification.
