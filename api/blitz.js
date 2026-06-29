// api/lightning.js
// Abruf: /api/lightning?lat=48.5&lon=8.4

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: "lat und lon sind erforderlich" });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  const RADIUS = 20;

  const haversine = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  try {
    const liveRes = await fetch("https://ukwx.duckdns.org/lightning/europe", {
      headers: { "User-Agent": "lightning-api" },
      signal: AbortSignal.timeout(10000),
    });
    if (!liveRes.ok) throw new Error(`HTTP ${liveRes.status}`);
    const liveData = await liveRes.json();

    const nowSec = Math.floor(Date.now() / 1000);
    const cutoff = nowSec - 60 * 60;

    const count = (liveData.points ?? []).filter(
      (p) => p.t >= cutoff && haversine(latNum, lonNum, p.lat, p.lon) <= RADIUS
    ).length;

    return res.status(200).json({ active: count > 0 });

  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
