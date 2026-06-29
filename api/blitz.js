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

  const makeHash = async (seed) => {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(seed)
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  };

  try {
    const liveRes = await fetch("https://ukwx.duckdns.org/lightning/europe", {
      headers: { "User-Agent": "lightning-api" },
      signal: AbortSignal.timeout(10000),
    });
    if (!liveRes.ok) throw new Error(`HTTP ${liveRes.status}`);
    const liveData = await liveRes.json();

    const count = (liveData.points ?? []).filter(
      (p) => haversine(latNum, lonNum, p.lat, p.lon) <= RADIUS
    ).length;

    const active = count > 0;

    if (!active) {
      return res.status(200).json({ active: false });
    }

    // Hash-Seed: lat+lon+Stunde → stabil für 1h, dann neue Warnung
    const now = new Date();
    const hourStamp = `${now.getUTCFullYear()}${String(now.getUTCMonth()+1).padStart(2,"0")}${String(now.getUTCDate()).padStart(2,"0")}${String(now.getUTCHours()).padStart(2,"0")}`;
    const seed = `${latNum}:${lonNum}:${hourStamp}`;
    const hash = await makeHash(seed);

    const timestamp = now.toLocaleString("de-DE", {
      timeZone: "Europe/Berlin",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    }) + " Uhr";

    return res.status(200).json({ active: true, hash, timestamp });

  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
