const BREAKPOINTS = {
  pm25: { bps: [30, 60, 90, 120, 250],          unit: "μg/m³" },
  pm10: { bps: [50, 100, 250, 350, 430],         unit: "μg/m³" },
  no2:  { bps: [40, 80, 180, 280, 400],          unit: "μg/m³" },
  o3:   { bps: [50, 100, 168, 208, 748],         unit: "μg/m³" },
  co:   { bps: [1.0, 2.0, 10.0, 17.0, 34.0],    unit: "mg/m³" },
  so2:  { bps: [40, 80, 380, 800, 1600],         unit: "μg/m³" },
};

/**
 * Compute sub-index for a single pollutant using linear interpolation
 * between CPCB AQI breakpoints.
 *
 * @param {string} pollutant - key: "pm25" | "pm10" | "no2" | "o3" | "co" | "so2"
 * @param {number} concentration - measured concentration
 * @returns {number} sub-index in range [0, 500]
 */
export function computeSubIndex(pollutant, concentration) {
  const config = BREAKPOINTS[pollutant];
  if (!config) throw new Error(`Unknown pollutant: ${pollutant}`);
  if (concentration <= 0) return 0;

  const [b1, b2, b3, b4, b5] = config.bps;

  if (concentration <= b1) return Math.round((concentration / b1) * 50);
  if (concentration <= b2) return Math.round(51  + ((concentration - b1) / (b2 - b1)) * 49);
  if (concentration <= b3) return Math.round(101 + ((concentration - b2) / (b3 - b2)) * 99);
  if (concentration <= b4) return Math.round(201 + ((concentration - b3) / (b4 - b3)) * 99);
  if (concentration <= b5) return Math.round(301 + ((concentration - b4) / (b5 - b4)) * 99);
  return 500;
}

/**
 * Compute overall AQI as max of all pollutant sub-indices (CPCB method).
 *
 * @param {Object} concentrations - { pm25, pm10, no2, o3, co, so2 }
 * @returns {{ aqi: number, dominant: string, subIndices: Object }}
 */
export function computeAQI(concentrations) {
  const subIndices = {};
  let maxSubIndex  = 0;
  let dominant     = "PM2.5";

  for (const [pollutant, value] of Object.entries(concentrations)) {
    if (value == null || !BREAKPOINTS[pollutant]) continue;
    const si = computeSubIndex(pollutant, value);
    subIndices[pollutant] = si;
    if (si > maxSubIndex) {
      maxSubIndex = si;
      dominant    = pollutant.toUpperCase().replace("PM25", "PM2.5").replace("PM10", "PM10");
    }
  }

  return { aqi: maxSubIndex, dominant, subIndices };
}

/**
 * Classify AQI value into a CPCB band.
 *
 * @param {number} aqi
 * @returns {{ name: string, color: string, description: string }}
 */
export function classifyAQI(aqi) {
  if (aqi <=  50) return { name: "Good",         description: "Minimal impact on health." };
  if (aqi <= 100) return { name: "Satisfactory",  description: "Minor discomfort to sensitive individuals." };
  if (aqi <= 200) return { name: "Moderate",      description: "Breathing discomfort for sensitive groups." };
  if (aqi <= 300) return { name: "Poor",           description: "Breathing difficulty for most people." };
  if (aqi <= 400) return { name: "Very Poor",      description: "Respiratory illness on prolonged exposure." };
  return           { name: "Severe",              description: "Affects healthy people; seriously impacts diseased." };
}

if (typeof module !== "undefined") {
  module.exports = { computeSubIndex, computeAQI, classifyAQI };
}
