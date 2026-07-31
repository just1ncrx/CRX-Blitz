// api/lightning.js
// Abruf: /api/lightning
// Optional: /api/lightning?lat=48.5&lon=8.4&radius=20  (filtert Blitze im Umkreis in km)
//
// Quelle: https://radar.wetterstation-neustadt.de
//   1. index.json -> liefert "latest" (z.B. "2026-07-31-1915")
//   2. blitze/archive/{latest}.json -> liefert die eigentlichen Blitzdaten (strikes[])
//
// Ausgabeformat kompatibel zu applyStormTrackerLightningData() im Frontend:
//   { generated, latest, ts, count, window_min, buckets: { strikes: [{ time, lat, lon, pol }] } }

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { lat, lon, radius } = req.query;
  const hasLocationFilter = lat !== undefined && lon !== undefined;
  const latNum = hasLocationFilter ? parseFloat(lat) : null;
  const lonNum = hasLocationFilter ? parseFloat(lon) : null;
  const RADIUS = radius ? parseFloat(radius) : 20;

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
    // 1) Index abrufen, um den aktuellsten Zeitstempel zu ermitteln
    const indexRes = await fetch("https://radar.wetterstation-neustadt.de/index.json", {
      headers: { "User-Agent": "lightning-api" },
      signal: AbortSignal.timeout(10000),
    });
    if (!indexRes.ok) throw new Error(`Index HTTP ${indexRes.status}`);
    const indexData = await indexRes.json();
    const latest = indexData.latest;
    if (!latest) throw new Error("Kein 'latest'-Feld im Index gefunden");

    // 2) Passende Archiv-Datei mit den Blitzdaten abrufen
    const archiveRes = await fetch(
      `https://radar.wetterstation-neustadt.de/blitze/archive/${latest}.json`,
      {
        headers: { "User-Agent": "lightning-api" },
        signal: AbortSignal.timeout(10000),
      }
    );
    if (!archiveRes.ok) throw new Error(`Archive HTTP ${archiveRes.status}`);
    const archiveData = await archiveRes.json();
    const rawStrikes = archiveData.strikes || [];

    // 3) t (Epoch-Millisekunden) in ISO-Zeit umwandeln + optional nach Umkreis filtern
    const strikes = [];
    for (const s of rawStrikes) {
      if (hasLocationFilter && haversine(latNum, lonNum, s.lat, s.lon) > RADIUS) continue;
      strikes.push({
        lat: s.lat,
        lon: s.lon,
        time: new Date(s.t).toISOString(),
        pol: s.pol,
      });
    }

    return res.status(200).json({
      generated: indexData.generated,
      latest,
      ts: archiveData.ts,
      count: strikes.length,
      window_min: archiveData.window_min,
      buckets: {
        strikes,
      },
    });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
