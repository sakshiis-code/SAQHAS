/**
 * utils/aqi.js — CPCB AQI computation for Node.js backend
 * Mirrors frontend/src/utils/aqi.js for use in Express routes.
 *
 * REQ-AQI-003: Compute AQI using CPCB sub-index breakpoints
 * REQ-AQI-004: Classify into six bands
 */

const BREAKPOINTS = {
  pm25: [30, 60, 90, 120, 250],
  pm10: [50, 100, 250, 350, 430],
  no2:  [40, 80, 180, 280, 400],
  o3:   [50, 100, 168, 208, 748],
  co:   [1.0, 2.0, 10.0, 17.0, 34.0],
  so2:  [40, 80, 380, 800, 1600],
};

export function computeSubIndex(pollutant, concentration) {
  const bps = BREAKPOINTS[pollutant];
  if (!bps) return 0;
  if (concentration <= 0) return 0;

  const [b1, b2, b3, b4, b5] = bps;
  if (concentration <= b1) return Math.round((concentration / b1) * 50);
  if (concentration <= b2) return Math.round(51  + ((concentration - b1) / (b2 - b1)) * 49);
  if (concentration <= b3) return Math.round(101 + ((concentration - b2) / (b3 - b2)) * 99);
  if (concentration <= b4) return Math.round(201 + ((concentration - b3) / (b4 - b3)) * 99);
  if (concentration <= b5) return Math.round(301 + ((concentration - b4) / (b5 - b4)) * 99);
  return 500;
}

export function computeAQI(concentrations) {
  let maxSI     = 0;
  let dominant  = "PM2.5";
  const subIndices = {};

  for (const [pollutant, value] of Object.entries(concentrations)) {
    if (value == null || !BREAKPOINTS[pollutant]) continue;
    const si = computeSubIndex(pollutant, value);
    subIndices[pollutant] = si;
    if (si > maxSI) {
      maxSI    = si;
      dominant = pollutant.toUpperCase().replace("PM25", "PM2.5");
    }
  }

  return { aqi: maxSI, dominant, subIndices };
}

export function classifyAQI(aqi) {
  if (aqi <=  50) return { name: "Good",         description: "Minimal impact on health." };
  if (aqi <= 100) return { name: "Satisfactory",  description: "Minor discomfort for sensitive individuals." };
  if (aqi <= 200) return { name: "Moderate",      description: "Breathing discomfort for sensitive groups." };
  if (aqi <= 300) return { name: "Poor",           description: "Breathing difficulty for most people." };
  if (aqi <= 400) return { name: "Very Poor",      description: "Respiratory illness on prolonged exposure." };
  return           { name: "Severe",              description: "Affects healthy people; seriously impacts diseased." };
}
