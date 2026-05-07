/**
 * routes/aqi.js — AQI data routes
 *
 * REQ-AQI-001: Fetch PM2.5, PM10, CO, NO2, SO2, O3 from OpenWeatherMap
 * REQ-AQI-002: Fetch AQI + dominant pollutant from IQAir
 * REQ-AQI-003: Compute overall AQI using CPCB sub-index breakpoints
 * REQ-AQI-004: Classify into six bands: Good → Severe
 * REQ-AQI-005: Cache API responses min 10 minutes per city
 * REQ-AQI-006: Return last-updated timestamp; stale warning if > 1 hour
 * REQ-FCT-001: Proxy POST /forecast to Flask ML microservice
 * REQ-FCT-003: Hourly scheduled job stores AQI reading in MongoDB
 */

import express   from "express";
import axios     from "axios";
import NodeCache from "node-cache";
import mongoose  from "mongoose";
import { computeAQI, classifyAQI } from "../utils/aqi.js";

const router = express.Router();

// Cache: 10-minute TTL per city (REQ-AQI-005)
const aqiCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// ── MongoDB Schema — hourly AQI readings for ML training ───────────────────
const aqiReadingSchema = new mongoose.Schema({
  city:      { type: String, required: true, index: true },
  aqi:       { type: Number, required: true },
  pm25:      Number,
  pm10:      Number,
  co:        Number,
  no2:       Number,
  so2:       Number,
  o3:        Number,
  temp:      Number,
  humidity:  Number,
  dominant:  String,
  timestamp: { type: Date, default: Date.now, index: true },
});

const AQIReading = mongoose.model("AQIReading", aqiReadingSchema);

// ── Helper: Fetch OpenWeatherMap Air Pollution ─────────────────────────────

async function fetchOWMAirPollution(lat, lon) {
  const url = "https://api.openweathermap.org/data/2.5/air_pollution";
  const { data } = await axios.get(url, {
    params: { lat, lon, appid: process.env.OWM_API_KEY },
    timeout: 8000,
  });

  const comp = data.list[0].components; // μg/m³ (except co which is μg/m³ → convert to mg/m³)
  return {
    pm25: comp.pm2_5,
    pm10: comp.pm10,
    co:   comp.co / 1000,    // μg/m³ → mg/m³
    no2:  comp.no2,
    so2:  comp.so2,
    o3:   comp.o3,
  };
}

// ── Helper: Fetch IQAir AQI + dominant pollutant ───────────────────────────

async function fetchIQAirData(city, state, country = "India") {
  const url = "https://api.airvisual.com/v2/city";
  const { data } = await axios.get(url, {
    params: { city, state, country, key: process.env.IQAIR_API_KEY },
    timeout: 8000,
  });

  const pollution = data.data.current.pollution;
  return {
    iqairAQI:  pollution.aqius,   // US AQI (reference; we compute CPCB ourselves)
    dominant:  pollution.mainus,
    weather: {
      temp:     data.data.current.weather.tp,
      humidity: data.data.current.weather.hu,
    },
  };
}

// ── Helper: City geocoding (simple lookup for Indian cities) ──────────────

const CITY_COORDS = {
  Indore:    { lat: 22.7196, lon: 75.8577, state: "Madhya Pradesh" },
  Delhi:     { lat: 28.6139, lon: 77.2090, state: "Delhi" },
  Mumbai:    { lat: 19.0760, lon: 72.8777, state: "Maharashtra" },
  Bhopal:    { lat: 23.2599, lon: 77.4126, state: "Madhya Pradesh" },
  Pune:      { lat: 18.5204, lon: 73.8567, state: "Maharashtra" },
  Hyderabad: { lat: 17.3850, lon: 78.4867, state: "Telangana" },
  Bangalore: { lat: 12.9716, lon: 77.5946, state: "Karnataka" },
  Chennai:   { lat: 13.0827, lon: 80.2707, state: "Tamil Nadu" },
  Kolkata:   { lat: 22.5726, lon: 88.3639, state: "West Bengal" },
  Ahmedabad: { lat: 23.0225, lon: 72.5714, state: "Gujarat" },
  Nagpur:    { lat: 21.1458, lon: 79.0882, state: "Maharashtra" },
  Surat:     { lat: 21.1702, lon: 72.8311, state: "Gujarat" },
};

// ── GET /api/aqi/:city ─────────────────────────────────────────────────────

router.get("/:city", async (req, res) => {
  const cityName = req.params.city;
  const coords   = CITY_COORDS[cityName];

  if (!coords) {
    return res.status(400).json({ error: `City "${cityName}" is not supported yet.` });
  }

  // 1. Check cache (REQ-AQI-005)
  const cached = aqiCache.get(cityName);
  const now    = Date.now();

  if (cached) {
    const ageMinutes = (now - cached.fetchedAt) / 60000;
    const isStale    = ageMinutes > 60;               // REQ-AQI-006

    return res.json({
      ...cached.payload,
      fromCache:    true,
      cacheAgeMin:  Math.round(ageMinutes),
      staleWarning: isStale ? "Data older than 1 hour. APIs may be temporarily unavailable." : null,
    });
  }

  // 2. Fetch from both APIs
  try {
    const [owmData, iqairData] = await Promise.allSettled([
      fetchOWMAirPollution(coords.lat, coords.lon),
      fetchIQAirData(cityName, coords.state),
    ]);

    const pollutants = owmData.status === "fulfilled" ? owmData.value : null;
    const weather    = iqairData.status === "fulfilled" ? iqairData.value.weather : {};
    const dominant   = iqairData.status === "fulfilled" ? iqairData.value.dominant : null;

    if (!pollutants) {
      return res.status(502).json({ error: "Could not fetch pollutant data from OpenWeatherMap." });
    }

    // 3. Compute CPCB AQI (REQ-AQI-003)
    const { aqi, dominant: computedDominant, subIndices } = computeAQI(pollutants);

    // 4. Classify (REQ-AQI-004)
    const band = classifyAQI(aqi);

    const payload = {
      city:        cityName,
      aqi,
      band:        band.name,
      description: band.description,
      dominant:    dominant ?? computedDominant,
      pollutants,
      subIndices,
      weather,
      fetchedAt:   new Date().toISOString(),
    };

    // 5. Store in cache
    aqiCache.set(cityName, { payload, fetchedAt: now });

    // 6. Persist hourly reading asynchronously (REQ-FCT-003)
    new AQIReading({
      city: cityName,
      aqi,
      ...pollutants,
      temp:     weather.temp,
      humidity: weather.humidity,
      dominant: payload.dominant,
    }).save().catch(err => console.warn("MongoDB write failed:", err.message));

    res.json({ ...payload, fromCache: false, staleWarning: null });

  } catch (err) {
    console.error("AQI fetch error:", err.message);
    // Return cached stale data if available
    const stale = aqiCache.get(`stale_${cityName}`);
    if (stale) {
      return res.json({ ...stale.payload, fromCache: true, staleWarning: "API error — serving stale data." });
    }
    res.status(502).json({ error: "Failed to fetch AQI data. Please try again later." });
  }
});

// ── GET /api/aqi/:city/history — 24-hour readings from MongoDB ─────────────

router.get("/:city/history", async (req, res) => {
  const { city } = req.params;
  const since    = new Date(Date.now() - 24 * 3600 * 1000);

  try {
    const readings = await AQIReading.find({ city, timestamp: { $gte: since } })
      .sort({ timestamp: 1 })
      .select("aqi timestamp -_id")
      .limit(24);

    res.json({ city, history: readings });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch historical data." });
  }
});

// ── POST /api/aqi/forecast — Proxy to Flask ML service ───────────────────

router.post("/forecast", async (req, res) => {
  const { city, recentReadings } = req.body;

  if (!city || !recentReadings?.length) {
    return res.status(400).json({ error: "city and recentReadings are required." });
  }

  try {
    const flaskURL = process.env.ML_SERVICE_URL ?? "http://localhost:6000";
    const { data } = await axios.post(`${flaskURL}/predict`, {
      city,
      readings: recentReadings,
    }, { timeout: 5000 });

    // REQ-FCT-004: label as ML Estimate
    res.json({ ...data, source: "ML Estimate", model: "RandomForest (scikit-learn)" });

  } catch (err) {
    console.warn("ML service unavailable:", err.message);
    // REQ-FCT-004: gracefully hide if service is down
    res.status(503).json({
      error:     "ML forecast service is temporarily unavailable.",
      available: false,
    });
  }
});

export default router;
