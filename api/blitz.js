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
    const cutoffMs = nowMs - LOOKBACK_MIN * 60 * 1000;

    // Index schnell laden (5s timeout OK)
    const indexRes = await fetch("https://radar.wetterstation-neustadt.de/index.json", {
      signal: AbortSignal.timeout(5000),
    });
    if (!indexRes.ok) throw new Error(`HTTP ${indexRes.status}`);

    const indexData = await indexRes.json();
    const latestTimestamp = indexData.timestamps?.[0];
    if (!latestTimestamp) throw new Error("Keine Timestamps");

    // Archive ohne Timeout laden (kann länger dauern)
    const archiveRes = await fetch(
      `https://radar.wetterstation-neustadt.de/blitze/archive/${latestTimestamp}.json`
    );
    if (!archiveRes.ok) throw new Error(`HTTP ${archiveRes.status}`);

    const archiveData = await archiveRes.json();
    const allStrikes = archiveData.strikes ?? [];

    const nearbyStrikes = allStrikes.filter((p) => 
      p.t >= cutoffMs && haversine(latNum, lonNum, p.lat, p.lon) <= RADIUS
    );

    return res.status(200).json({ 
      active: nearbyStrikes.length > 0,
      count: nearbyStrikes.length,
    });

  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
