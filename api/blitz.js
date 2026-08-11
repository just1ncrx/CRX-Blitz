// api/lightning.js
// Abruf: /api/lightning?lat=48.5&lon=8.4
// Prüft ob in den letzten 30 Min Blitze im 20km Radius waren

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
  const RADIUS = 20; // km
  const LOOKBACK_MIN = 30;

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
    const nowMs = Date.now();
    const cutoffMs = nowMs - LOOKBACK_MIN * 60 * 1000; // letzte 30 Min

    // Schritt 1: index.json abrufen
    const indexRes = await fetch("https://radar.wetterstation-neustadt.de/index.json", {
      headers: { "User-Agent": "lightning-api" },
      signal: AbortSignal.timeout(10000),
    });
    if (!indexRes.ok) throw new Error(`HTTP ${indexRes.status} vom Index`);

    const indexData = await indexRes.json();
    const timestamps = indexData.timestamps ?? [];
    if (timestamps.length === 0) throw new Error("Keine Timestamps");

    // Schritt 2: Neuestes Timestamp
    const latestTimestamp = timestamps[0];

    // Schritt 3: Archive abrufen
    const archiveUrl = `https://radar.wetterstation-neustadt.de/blitze/archive/${latestTimestamp}.json`;
    const archiveRes = await fetch(archiveUrl, {
      headers: { "User-Agent": "lightning-api" },
      signal: AbortSignal.timeout(10000),
    });
    if (!archiveRes.ok) throw new Error(`HTTP ${archiveRes.status} vom Archive`);

    const archiveData = await archiveRes.json();
    const allStrikes = archiveData.strikes ?? [];

    // Schritt 4: Nach Radius und Zeit filtern
    const nearbyStrikes = allStrikes.filter((p) => {
      const isNearby = haversine(latNum, lonNum, p.lat, p.lon) <= RADIUS;
      const isRecent = p.t >= cutoffMs;
      return isNearby && isRecent;
    });

    return res.status(200).json({ 
      active: nearbyStrikes.length > 0,
      count: nearbyStrikes.length,
      radius_km: RADIUS,
      lookback_min: LOOKBACK_MIN,
      latest_archive: latestTimestamp
    });

  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
