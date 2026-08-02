// Vercel Serverless Function
// Datei: api/strikes.js
// Abruf: /api/strikes
//
// Logik:
// - "jetzt" wird auf den letzten 5-Minuten-Schritt abgerundet -> Referenzzeitpunkt.
//   Beispiel: aktuelle Uhrzeit 18:54 -> Referenzzeitpunkt wird 18:50.
// - Es wird NUR das Fenster [Referenzzeitpunkt - 5min, Referenzzeitpunkt] zurückgegeben.
//   Also z.B. Blitze von 18:45 bis 18:50 - nicht mehr, nicht weniger.
// - Innerhalb des aktuellen 5-Minuten-Fensters ändert sich das Ergebnis nicht (stabil/cachebar),
//   erst wenn die nächste 5-Minuten-Marke erreicht wird, springt der Referenzzeitpunkt weiter.

const DE_BBOX = { latMin: 45.5, latMax: 55.55, lonMin: 5.5, lonMax: 15.55 };
const STEP_MIN = 5;

const inGermany = (p) =>
  p.lat >= DE_BBOX.latMin && p.lat <= DE_BBOX.latMax &&
  p.lon >= DE_BBOX.lonMin && p.lon <= DE_BBOX.lonMax;

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    const realNow = new Date();
    const realNowMs = realNow.getTime();

    // "jetzt" auf den letzten 5-Minuten-Schritt abrunden -> Referenzzeitpunkt
    const stepMs = STEP_MIN * 60 * 1000;
    const roundedNowMs = Math.floor(realNowMs / stepMs) * stepMs;
    const refDate = new Date(roundedNowMs);
    const refSec = Math.floor(roundedNowMs / 1000);

    // Fenster: genau 5 Minuten vor dem Referenzzeitpunkt bis zum Referenzzeitpunkt
    const vonSec = refSec - stepMs / 1000;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let liveData;
    try {
      const liveRes = await fetch("https://ukwx.duckdns.org/lightning/europe", {
        headers: { "User-Agent": "lightning-api" },
        signal: controller.signal,
      });
      if (!liveRes.ok) throw new Error(`HTTP ${liveRes.status} vom Live-Endpoint`);
      liveData = await liveRes.json();
    } finally {
      clearTimeout(timeout);
    }

    const allPoints = liveData.points ?? [];

    // Nur Deutschland + genau das 5-Minuten-Fenster [vonSec, refSec]
    const filtered = allPoints
      .filter((p) => inGermany(p) && p.t >= vonSec && p.t <= refSec)
      .map((p) => ({
        lat: p.lat,
        lon: p.lon,
        time: new Date(p.t * 1000).toISOString(),
      }));

    res.status(200).json({
      meta: {
        referenzZeitpunkt: refDate.toISOString(), // gerundeter Bezugspunkt (z.B. 18:50)
        echteAbrufzeit: realNow.toISOString(),      // tatsächliche Serverzeit (z.B. 18:54)
        von: new Date(vonSec * 1000).toISOString(),
        bis: refDate.toISOString(),
        anzahl: filtered.length,
      },
      strikes: filtered,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
