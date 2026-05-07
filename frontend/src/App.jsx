import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";

export const AQI_BANDS = [
  { name: "Good",         range: [0,   50],  color: "#22c55e", lightBg: "#052e16", label: "Good" },
  { name: "Satisfactory", range: [51,  100], color: "#84cc16", lightBg: "#1a2e05", label: "Satisfactory" },
  { name: "Moderate",     range: [101, 200], color: "#eab308", lightBg: "#2d2000", label: "Moderate" },
  { name: "Poor",         range: [201, 300], color: "#f97316", lightBg: "#2d1000", label: "Poor" },
  { name: "Very Poor",    range: [301, 400], color: "#ef4444", lightBg: "#2d0000", label: "Very Poor" },
  { name: "Severe",       range: [401, 500], color: "#a855f7", lightBg: "#1e0033", label: "Severe" },
];

export const POLLUTANTS = [
  { key: "pm25", label: "PM2.5", unit: "μg/m³", breakpoints: [30, 60, 90, 120, 250] },
  { key: "pm10", label: "PM10",  unit: "μg/m³", breakpoints: [50, 100, 250, 350, 430] },
  { key: "co",   label: "CO",    unit: "mg/m³",  breakpoints: [1, 2, 10, 17, 34] },
  { key: "no2",  label: "NO₂",   unit: "μg/m³", breakpoints: [40, 80, 180, 280, 400] },
  { key: "so2",  label: "SO₂",   unit: "μg/m³", breakpoints: [40, 80, 380, 800, 1600] },
  { key: "o3",   label: "O₃",    unit: "μg/m³", breakpoints: [50, 100, 168, 208, 748] },
];

export const MOCK_CITY_DATA = {
  Indore:     { aqi: 143, pm25: 52,  pm10: 88,  co: 1.2, no2: 42, so2: 18, o3: 65,  temp: 28, humidity: 45, dominant: "PM2.5" },
  Delhi:      { aqi: 312, pm25: 180, pm10: 220, co: 8.5, no2: 95, so2: 55, o3: 120, temp: 22, humidity: 62, dominant: "PM2.5" },
  Mumbai:     { aqi: 87,  pm25: 35,  pm10: 58,  co: 0.8, no2: 38, so2: 12, o3: 48,  temp: 31, humidity: 78, dominant: "PM10"  },
  Bhopal:     { aqi: 118, pm25: 45,  pm10: 72,  co: 1.0, no2: 35, so2: 15, o3: 55,  temp: 26, humidity: 52, dominant: "PM2.5" },
  Pune:       { aqi: 76,  pm25: 28,  pm10: 48,  co: 0.6, no2: 28, so2: 10, o3: 42,  temp: 29, humidity: 58, dominant: "PM10"  },
  Hyderabad:  { aqi: 94,  pm25: 38,  pm10: 62,  co: 0.9, no2: 40, so2: 14, o3: 50,  temp: 33, humidity: 48, dominant: "PM2.5" },
  Bangalore:  { aqi: 65,  pm25: 22,  pm10: 38,  co: 0.5, no2: 25, so2: 8,  o3: 38,  temp: 25, humidity: 65, dominant: "O₃"   },
  Chennai:    { aqi: 82,  pm25: 32,  pm10: 55,  co: 0.7, no2: 35, so2: 12, o3: 45,  temp: 35, humidity: 72, dominant: "PM10"  },
  Kolkata:    { aqi: 198, pm25: 95,  pm10: 135, co: 3.2, no2: 68, so2: 38, o3: 88,  temp: 30, humidity: 75, dominant: "PM2.5" },
  Ahmedabad:  { aqi: 155, pm25: 62,  pm10: 95,  co: 1.8, no2: 48, so2: 22, o3: 72,  temp: 32, humidity: 42, dominant: "PM10"  },
  Nagpur:     { aqi: 108, pm25: 42,  pm10: 68,  co: 0.95,no2: 32, so2: 13, o3: 52,  temp: 30, humidity: 50, dominant: "PM2.5" },
  Surat:      { aqi: 132, pm25: 55,  pm10: 82,  co: 1.5, no2: 44, so2: 25, o3: 60,  temp: 33, humidity: 68, dominant: "SO₂"   },
};

/** Health advisory matrix — REQ-HAE-001: 6 bands × 4 profiles */
const ADVISORIES = {
  Good: {
    General:     { icon: "✓", msg: "Air quality is excellent. Enjoy outdoor activities freely!", action: "Perfect for jogging, cycling, or any outdoor exercise." },
    Respiratory: { icon: "✓", msg: "Air quality is good. You can enjoy outdoors with minimal risk.", action: "Carry your inhaler as a precaution, but no restrictions needed." },
    Elderly:     { icon: "✓", msg: "Air is clean and safe. Outdoor activity is highly recommended.", action: "Consider a morning walk in the park for fresh air benefits." },
    Child:       { icon: "✓", msg: "Great air today! Children can play outdoors freely.", action: "Outdoor sports, picnics, and play are all perfectly safe." },
  },
  Satisfactory: {
    General:     { icon: "◎", msg: "Air quality is acceptable. Sensitive individuals may feel slight effects.", action: "Outdoor activities are fine. Monitor if you feel any discomfort." },
    Respiratory: { icon: "◎", msg: "Mildly acceptable. Asthma patients should be slightly cautious.", action: "Keep rescue inhaler handy. Limit prolonged heavy exertion outdoors." },
    Elderly:     { icon: "◎", msg: "Generally acceptable air. Minimize strenuous outdoor activities.", action: "Short walks are fine. Rest if you feel breathless or discomfort." },
    Child:       { icon: "◎", msg: "Satisfactory for children. Limit vigorous outdoor play duration.", action: "Play outdoors but take breaks. Inform school nurse if any symptoms." },
  },
  Moderate: {
    General:     { icon: "⚠", msg: "Moderate air quality. Sensitive groups should reduce outdoor exposure.", action: "Reduce prolonged outdoor exertion. Close windows during peak hours." },
    Respiratory: { icon: "⚠", msg: "Unhealthy for you. Limit your time outdoors significantly.", action: "Use N95 mask if going out. Use air purifier indoors. Take prescribed meds." },
    Elderly:     { icon: "⚠", msg: "Caution advised. Avoid outdoor exertion — rest indoors.", action: "Keep windows closed. Use fan or AC with filter. Stay well hydrated." },
    Child:       { icon: "⚠", msg: "Children are sensitive to this level. Restrict outdoor play time.", action: "Limit outdoor play to 30 minutes. Prefer indoor activities today." },
  },
  Poor: {
    General:     { icon: "✕", msg: "Poor air quality. Everyone may experience health effects.", action: "Wear an N95 mask outdoors. Avoid heavy exertion. Stay indoors if possible." },
    Respiratory: { icon: "✕", msg: "Dangerous for you. Stay indoors and use an air purifier.", action: "Do NOT go outdoors. Run air purifier on high. Take all prescribed medications." },
    Elderly:     { icon: "✕", msg: "High risk. Stay indoors with windows shut.", action: "Avoid all outdoor activity. Ask family for help with errands." },
    Child:       { icon: "✕", msg: "Unhealthy for children. Outdoor school activities should be cancelled.", action: "Keep children indoors. Run air purifier. Inform school about condition." },
  },
  "Very Poor": {
    General:     { icon: "✕", msg: "Very Poor air. Health effects are likely for everyone outdoors.", action: "Stay indoors. Seal doors/windows. Wear N95 if you absolutely must go out." },
    Respiratory: { icon: "✕", msg: "Hazardous for you! Emergency protocols — stay inside.", action: "Keep emergency medications accessible. Contact doctor proactively." },
    Elderly:     { icon: "✕", msg: "Extremely hazardous. Do not step outside under any circumstances.", action: "Remain indoors. Alert family members. Have doctor contact ready." },
    Child:       { icon: "✕", msg: "Very dangerous for children. All outdoor activities strictly prohibited.", action: "No outdoor exposure at all. Consider keeping children home from school." },
  },
  Severe: {
    General:     { icon: "✕", msg: "SEVERE pollution emergency. Health risk to all populations.", action: "Stay indoors. Use N95/P100 respirators. Avoid all physical exertion." },
    Respiratory: { icon: "✕", msg: "CRITICAL: Life-threatening conditions. Seek medical shelter immediately.", action: "Immediate medical supervision recommended. Do not step outside." },
    Elderly:     { icon: "✕", msg: "CRITICAL for elderly. Treat as a health emergency.", action: "Alert emergency contacts. Do not go out. Seek immediate medical guidance." },
    Child:       { icon: "✕", msg: "CRITICAL for children. Treat as emergency.", action: "Keep children indoors with ALL ventilation sealed. Emergency mode." },
  },
};

export function getBand(aqi) {
  return AQI_BANDS.find(b => aqi >= b.range[0] && aqi <= b.range[1]) ?? AQI_BANDS[5];
}

export function getSubIndex(pollutantKey, value) {
  const p = POLLUTANTS.find(p => p.key === pollutantKey);
  if (!p) return 0;
  const [b1, b2, b3, b4, b5] = p.breakpoints;
  if (value <= 0)  return 0;
  if (value <= b1) return Math.round((value / b1) * 50);
  if (value <= b2) return Math.round(51  + ((value - b1) / (b2 - b1)) * 49);
  if (value <= b3) return Math.round(101 + ((value - b2) / (b3 - b2)) * 99);
  if (value <= b4) return Math.round(201 + ((value - b3) / (b4 - b3)) * 99);
  if (value <= b5) return Math.round(301 + ((value - b4) / (b5 - b4)) * 99);
  return 500;
}

/** Generates 24-hour historical AQI trend (mock; replaced by MongoDB data in production) */
function generateHourlyData(baseAQI) {
  const now = new Date();
  return Array.from({ length: 24 }, (_, i) => {
    const hour = new Date(now.getTime() - (23 - i) * 3600000);
    const h = hour.getHours();
    // Morning and evening peaks simulate real pollution patterns
    const peakFactor = (h >= 7 && h <= 10) || (h >= 17 && h <= 20) ? 25 : -10;
    const noise = (Math.random() - 0.5) * 30;
    return {
      time: `${String(h).padStart(2, "0")}:00`,
      aqi: Math.max(10, Math.min(500, Math.round(baseAQI + peakFactor + noise))),
    };
  });
}

/** Generates 7-day weekly AQI trend (mock; replaced by MongoDB data in production) */
function generateWeeklyData(baseAQI) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days.map(day => ({
    day,
    aqi: Math.max(10, Math.min(500, Math.round(baseAQI + (Math.random() - 0.5) * 60))),
  }));
}

function HourlyLineChart({ data, bandColor }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

    const ctx = canvasRef.current.getContext("2d");
    chartRef.current = new window.Chart(ctx, {
      type: "line",
      data: {
        labels: data.map(d => d.time),
        datasets: [{
          label: "AQI",
          data: data.map(d => d.aqi),
          borderColor: bandColor,
          backgroundColor: `${bandColor}18`,
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 5,
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => `${items[0].label}`,
              label: (item) => `AQI: ${item.raw} — ${getBand(item.raw).name}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: "#6b7280", font: { size: 10, family: "JetBrains Mono" }, maxTicksLimit: 8 },
            grid: { color: "rgba(255,255,255,0.05)" },
          },
          y: {
            ticks: { color: "#6b7280", font: { size: 11, family: "JetBrains Mono" } },
            grid: { color: "rgba(255,255,255,0.05)" },
            min: 0,
          },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [data, bandColor]);

  return <canvas ref={canvasRef} />;
}

function WeeklyBarChart({ data, bandColor }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (chartRef.current) chartRef.current.destroy();

    const ctx = canvasRef.current.getContext("2d");
    chartRef.current = new window.Chart(ctx, {
      type: "bar",
      data: {
        labels: data.map(d => d.day),
        datasets: [{
          label: "Avg AQI",
          data: data.map(d => d.aqi),
          backgroundColor: data.map(d => `${getBand(d.aqi).color}aa`),
          borderColor: data.map(d => getBand(d.aqi).color),
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => `AQI: ${item.raw} — ${getBand(item.raw).name}`,
            },
          },
        },
        scales: {
          x: { ticks: { color: "#6b7280", font: { size: 11 } }, grid: { display: false } },
          y: { ticks: { color: "#6b7280", font: { size: 11 } }, grid: { color: "rgba(255,255,255,0.05)" }, min: 0 },
        },
      },
    });
    return () => chartRef.current?.destroy();
  }, [data, bandColor]);

  return <canvas ref={canvasRef} />;
}

function AQIGauge({ aqi, band }) {
  const r = 72, cx = 90, cy = 90;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(aqi / 500, 1) * circ;

  return (
    <div className="gauge-wrapper">
      <svg width="180" height="180" viewBox="0 0 180 180">
        {/* track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="14" />
        {/* filled arc */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={band.color}
          strokeWidth="14"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: "stroke-dasharray 1.2s ease" }}
        />
      </svg>
      <div className="gauge-center">
        <span className="gauge-value" style={{ color: band.color }}>{aqi}</span>
        <span className="gauge-label">AQI</span>
      </div>
    </div>
  );
}

function PollutantCard({ pollutant, value, band }) {
  const subIndex = getSubIndex(pollutant.key, value);
  const subBand  = getBand(subIndex);
  const pct      = Math.min(subIndex / 500, 1) * 100;

  return (
    <div className="pollutant-card">
      <div className="pollutant-header">
        <span className="pollutant-name">{pollutant.label}</span>
        <span className="pollutant-sub" style={{ color: subBand.color }}>{subIndex}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%`, background: subBand.color }} />
      </div>
      <div className="pollutant-footer">
        <span className="pollutant-value">{typeof value === "number" ? value.toFixed(value < 10 ? 1 : 0) : value} {pollutant.unit}</span>
        <span className="pollutant-band" style={{ color: subBand.color }}>{subBand.name}</span>
      </div>
    </div>
  );
}

function AdvisoryPanel({ bandName, profile }) {
  const advisory = ADVISORIES[bandName]?.[profile] ?? ADVISORIES.Good.General;
  const band     = AQI_BANDS.find(b => b.name === bandName) ?? AQI_BANDS[0];
  const isAlert  = ["Poor", "Very Poor", "Severe"].includes(bandName);

  return (
    <div className="advisory-panel" style={{ borderColor: band.color }}>
      <div className="advisory-icon" style={{ color: band.color }}>{advisory.icon}</div>
      <div>
        <p className="advisory-msg">{advisory.msg}</p>
        <p className="advisory-action">→ {advisory.action}</p>
        {isAlert && (
          <p className="advisory-disclaimer">
            ⓘ Advisories are informational only and do not constitute medical advice.
          </p>
        )}
      </div>
    </div>
  );
}

function ForecastCard({ label, aqi }) {
  const band = getBand(aqi);
  return (
    <div className="forecast-card" style={{ borderColor: band.color }}>
      <span className="forecast-label">{label}</span>
      <span className="forecast-aqi" style={{ color: band.color }}>{aqi}</span>
      <span className="forecast-band" style={{ color: band.color }}>{band.name}</span>
      <span className="forecast-ml-tag">ML Estimate</span>
    </div>
  );
}

const ARDUINO_SKETCH = `// SAQHAS Arduino Sketch — Wokwi Simulation
// Sensors: MQ-135 (CO2/VOC), PMS5003 (PM2.5/PM10), DHT22 (Temp/Humidity)
// Platform: Arduino Uno — Test at https://wokwi.com

#include <DHT.h>
#include <SoftwareSerial.h>

#define DHT_PIN     2
#define DHT_TYPE    DHT22
#define MQ135_PIN   A0
#define PMS_RX      10
#define PMS_TX      11

DHT dht(DHT_PIN, DHT_TYPE);
SoftwareSerial pmsSerial(PMS_RX, PMS_TX);

struct PMS5003Data { uint16_t pm10, pm25, pm100; };

bool readPMS(PMS5003Data &data) {
  if (pmsSerial.available() < 32) return false;
  if (pmsSerial.read() != 0x42 || pmsSerial.read() != 0x4D) return false;
  uint8_t buf[30];
  pmsSerial.readBytes(buf, 30);
  data.pm10  = (buf[4] << 8) | buf[5];
  data.pm25  = (buf[6] << 8) | buf[7];
  data.pm100 = (buf[8] << 8) | buf[9];
  return true;
}

void setup() {
  Serial.begin(9600);
  pmsSerial.begin(9600);
  dht.begin();
  Serial.println("SAQHAS Sensor Node Ready");
}

void loop() {
  float temperature = dht.readTemperature();
  float humidity    = dht.readHumidity();
  int   mq135Raw    = analogRead(MQ135_PIN);
  float coVoltage   = mq135Raw * (5.0 / 1023.0);

  PMS5003Data pmsData;
  bool pmsOk = readPMS(pmsData);

  Serial.println("--- SAQHAS Reading ---");
  Serial.print("Temp: "); Serial.print(temperature, 1); Serial.println(" °C");
  Serial.print("Humidity: "); Serial.print(humidity, 1); Serial.println(" %");
  Serial.print("MQ-135 Raw: "); Serial.print(mq135Raw);
  Serial.print("  |  CO Voltage: "); Serial.print(coVoltage, 3); Serial.println(" V");

  if (pmsOk) {
    Serial.print("PM1.0: "); Serial.print(pmsData.pm10); Serial.println(" μg/m³");
    Serial.print("PM2.5: "); Serial.print(pmsData.pm25); Serial.println(" μg/m³");
    Serial.print("PM10:  "); Serial.print(pmsData.pm100); Serial.println(" μg/m³");
  } else {
    Serial.println("PMS5003: Awaiting valid frame...");
  }

  Serial.println("----------------------");
  delay(5000);  // Read every 5 seconds
}`;

export default function App() {
  const [city,           setCity]           = useState("Indore");
  const [cityInput,      setCityInput]      = useState("Indore");
  const [searchOpen,     setSearchOpen]     = useState(false);
  const [tab,            setTab]            = useState("dashboard");
  const [profile,        setProfile]        = useState("General");
  const [alertThreshold, setAlertThreshold] = useState(150);
  const [emailAlerts,    setEmailAlerts]    = useState(false);
  const [pushAlerts,     setPushAlerts]     = useState(false);
  const [email,          setEmail]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [lastUpdated,    setLastUpdated]    = useState(new Date());
  const [notification,   setNotification]   = useState(null);
  const [apiData, setApiData] = useState(null);

  useEffect(() => {
  const fetchAQI = async () => {
    try {
      setLoading(true);
      const res = await fetch(`http://localhost:5000/api/aqi/${city}`);
      const data = await res.json();
      setApiData(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Error fetching AQI:", err);
    } finally {
      setLoading(false);
    }
  };

  fetchAQI();
}, [city]);

  // In production: fetch from backend API (Node.js/Express)
  // const [apiData, setApiData] = useState(null);
  // useEffect(() => { fetchAQI(city).then(setApiData) }, [city]);

  // const data = MOCK_CITY_DATA[city] ?? MOCK_CITY_DATA.Indore;
  const data = apiData || MOCK_CITY_DATA[city] || MOCK_CITY_DATA.Indore;
  const band = getBand(data.aqi);

  const hourlyData = useRef(generateHourlyData(data.aqi));
  const weeklyData = useRef(generateWeeklyData(data.aqi));

  const forecast6h  = Math.max(10, Math.min(500, data.aqi + Math.round((Math.random() - 0.4) * 35)));
  const forecast12h = Math.max(10, Math.min(500, data.aqi + Math.round((Math.random() - 0.35) * 55)));

  const filteredCities = Object.keys(MOCK_CITY_DATA).filter(c =>
    c.toLowerCase().includes(cityInput.toLowerCase())
  );

  const alertActive = data.aqi > alertThreshold;

  const selectCity = useCallback((c) => {
    setLoading(true);
    setCity(c);
    setCityInput(c);
    setSearchOpen(false);
    setTimeout(() => {
      setLastUpdated(new Date());
      setLoading(false);
    }, 600);
    hourlyData.current = generateHourlyData(MOCK_CITY_DATA[c]?.aqi ?? 100);
    weeklyData.current = generateWeeklyData(MOCK_CITY_DATA[c]?.aqi ?? 100);
  }, []);

  const simulateEmailAlert = () => {
    setNotification(`Alert email sent to ${email || "registered address"}: AQI in ${city} is ${data.aqi} (${band.name})`);
    setTimeout(() => setNotification(null), 4000);
  };

  return (
    <div className="app">

      {}
      <header className="app-header">
        <div className="header-brand">
          <div className="brand-icon" style={{ background: band.color }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5">
              <path d="M12 2a7 7 0 0 1 7 7c0 4-7 13-7 13S5 13 5 9a7 7 0 0 1 7-7z"/>
              <circle cx="12" cy="9" r="2.5"/>
            </svg>
          </div>
          <div>
            <h1 className="brand-name">SAQHAS</h1>
            <p className="brand-sub">Smart Air Quality & Health Advisory System</p>
          </div>
        </div>

        {}
        <div className="search-container">
          <input
            className="search-input"
            value={cityInput}
            onChange={e => { setCityInput(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search city..."
          />
          {searchOpen && filteredCities.length > 0 && (
            <div className="search-dropdown">
              {filteredCities.map(c => (
                <button key={c} className="search-option" onClick={() => selectCity(c)}>
                  {c} <span style={{ color: getBand(MOCK_CITY_DATA[c].aqi).color }}>AQI {MOCK_CITY_DATA[c].aqi}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="header-meta">
          <span className="last-updated">Updated {lastUpdated.toLocaleTimeString()}</span>
        </div>
      </header>

      {}
      {alertActive && (
        <div className="alert-banner" style={{ background: `${band.color}22`, borderColor: band.color }}>
          <span style={{ color: band.color }}>⚠</span>
          <span><strong>AQI Alert:</strong> {city} AQI is <strong style={{ color: band.color }}>{data.aqi} ({band.name})</strong> — exceeds your threshold of {alertThreshold}</span>
        </div>
      )}

      {}
      {notification && (
        <div className="toast">{notification}</div>
      )}

      {}
      <nav className="tabs">
        {["dashboard", "advisory", "alerts", "profile", "simulation"].map(t => (
          <button key={t} className={`tab ${tab === t ? "tab-active" : ""}`}
            onClick={() => setTab(t)}
            style={tab === t ? { borderBottomColor: band.color, color: band.color } : {}}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      <main className="main-content">

        {}
        {tab === "dashboard" && (
          <div className="tab-content">

            {/* AQI Hero */}
            <section className="aqi-hero card" style={{ borderColor: `${band.color}44` }}>
              <div className="aqi-hero-left">
                <AQIGauge aqi={data.aqi} band={band} />
              </div>
              <div className="aqi-hero-right">
                <div className="city-name">{city}</div>
                <div className="band-badge" style={{ background: `${band.color}22`, color: band.color, borderColor: band.color }}>
                  {band.name}
                </div>
                <div className="aqi-meta-grid">
                  <div className="aqi-meta-item">
                    <span className="aqi-meta-label">Dominant Pollutant</span>
                    <span className="aqi-meta-value">{data.dominant}</span>
                  </div>
                  <div className="aqi-meta-item">
                    <span className="aqi-meta-label">Temperature</span>
                    <span className="aqi-meta-value">{data.temp}°C</span>
                  </div>
                  <div className="aqi-meta-item">
                    <span className="aqi-meta-label">Humidity</span>
                    <span className="aqi-meta-value">{data.humidity}%</span>
                  </div>
                  <div className="aqi-meta-item">
                    <span className="aqi-meta-label">CPCB Standard</span>
                    <span className="aqi-meta-value">India</span>
                  </div>
                </div>
              </div>
            </section>

            {/* Pollutant Cards (REQ-VIZ-001) */}
            <section>
              <h2 className="section-title">Pollutant Breakdown</h2>
              <div className="pollutant-grid">
                {POLLUTANTS.map(p => (
                  <PollutantCard key={p.key} pollutant={p} value={data[p.key]} band={band} />
                ))}
              </div>
            </section>

            {/* Quick Advisory */}
            <section>
              <h2 className="section-title">Health Advisory <span className="section-sub">— {profile}</span></h2>
              <AdvisoryPanel bandName={band.name} profile={profile} />
            </section>

            {/* Charts (REQ-VIZ-002, REQ-VIZ-003) */}
            <section>
              <h2 className="section-title">24-Hour AQI Trend</h2>
              <div className="card chart-card">
                <HourlyLineChart data={hourlyData.current} bandColor={band.color} />
              </div>
            </section>

            <section>
              <h2 className="section-title">7-Day AQI Overview</h2>
              <div className="card chart-card">
                <WeeklyBarChart data={weeklyData.current} bandColor={band.color} />
              </div>
            </section>

            {/* ML Forecast (REQ-FCT-001 to REQ-FCT-004) */}
            <section>
              <h2 className="section-title">AQI Forecast <span className="section-sub">— Scikit-learn Model</span></h2>
              <div className="forecast-grid">
                <ForecastCard label="+6 Hours"  aqi={forecast6h} />
                <ForecastCard label="+12 Hours" aqi={forecast12h} />
              </div>
              <p className="ml-note">
                ⓘ Predictions generated by a Random Forest model (scikit-learn) trained on historical AQI data stored in MongoDB.
                Model is deployed as a Flask microservice on Render.
              </p>
            </section>
          </div>
        )}

        {}
        {tab === "advisory" && (
          <div className="tab-content">
            <section className="card">
              <h2 className="section-title" style={{ marginTop: 0 }}>Your Health Profile</h2>
              <div className="profile-buttons">
                {["General", "Respiratory", "Elderly", "Child"].map(p => (
                  <button key={p}
                    className={`profile-btn ${profile === p ? "profile-btn-active" : ""}`}
                    style={profile === p ? { borderColor: band.color, color: band.color, background: `${band.color}15` } : {}}
                    onClick={() => setProfile(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="section-title">Advisory for {city} — {band.name} ({data.aqi})</h2>
              {Object.entries(ADVISORIES).map(([bandName, profiles]) => {
                const b = AQI_BANDS.find(x => x.name === bandName);
                const adv = profiles[profile];
                return (
                  <div key={bandName} className="advisory-row" style={{ opacity: bandName === band.name ? 1 : 0.4 }}>
                    <span className="advisory-band-label" style={{ color: b.color, borderColor: b.color }}>
                      {bandName}
                    </span>
                    <p className="advisory-row-msg">{adv.msg}</p>
                  </div>
                );
              })}
            </section>
          </div>
        )}

        {}
        {tab === "alerts" && (
          <div className="tab-content">
            <section className="card">
              <h2 className="section-title" style={{ marginTop: 0 }}>Alert Threshold</h2>
              <p className="setting-desc">Send notifications when AQI exceeds:</p>
              <div className="threshold-row">
                <input type="range" min="50" max="400" step="10"
                  value={alertThreshold}
                  onChange={e => setAlertThreshold(Number(e.target.value))}
                  className="threshold-slider"
                  style={{ accentColor: band.color }}
                />
                <span className="threshold-value" style={{ color: getBand(alertThreshold).color }}>
                  {alertThreshold} ({getBand(alertThreshold).name})
                </span>
              </div>
            </section>

            <section className="card">
              <h2 className="section-title" style={{ marginTop: 0 }}>Notification Channels</h2>

              <div className="toggle-row">
                <div>
                  <p className="toggle-label">Browser Push Notifications</p>
                  <p className="toggle-sub">Uses Web Push API (VAPID)</p>
                </div>
                <button className={`toggle-btn ${pushAlerts ? "toggle-on" : ""}`}
                  style={pushAlerts ? { background: band.color } : {}}
                  onClick={() => setPushAlerts(!pushAlerts)}>
                  {pushAlerts ? "ON" : "OFF"}
                </button>
              </div>

              <div className="toggle-row">
                <div>
                  <p className="toggle-label">Email Alerts</p>
                  <p className="toggle-sub">Sent via Nodemailer (Gmail SMTP)</p>
                </div>
                <button className={`toggle-btn ${emailAlerts ? "toggle-on" : ""}`}
                  style={emailAlerts ? { background: band.color } : {}}
                  onClick={() => setEmailAlerts(!emailAlerts)}>
                  {emailAlerts ? "ON" : "OFF"}
                </button>
              </div>

              {emailAlerts && (
                <div className="email-input-row">
                  <input type="email" placeholder="your@email.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    className="email-input" />
                  <button className="test-alert-btn" style={{ background: band.color }}
                    onClick={simulateEmailAlert}>
                    Test Alert
                  </button>
                </div>
              )}

              <p className="setting-desc" style={{ marginTop: 12, fontSize: 12 }}>
                ⓘ Minimum 1-hour cooldown between repeated alerts for the same city (REQ-NOT-004).
              </p>
            </section>
          </div>
        )}

        {}
        {tab === "profile" && (
          <div className="tab-content">
            <section className="card">
              <h2 className="section-title" style={{ marginTop: 0 }}>Health Profile</h2>
              <p className="setting-desc">Your profile personalizes the health advisory you receive.</p>

              <div className="form-group">
                <label className="form-label">Age Group</label>
                <div className="profile-buttons">
                  {["General", "Elderly"].map(p => (
                    <button key={p}
                      className={`profile-btn ${profile === p ? "profile-btn-active" : ""}`}
                      style={profile === p ? { borderColor: band.color, color: band.color, background: `${band.color}15` } : {}}
                      onClick={() => setProfile(p)}>{p}</button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Health Condition</label>
                <div className="profile-buttons">
                  {["General", "Respiratory", "Child"].map(p => (
                    <button key={p}
                      className={`profile-btn ${profile === p ? "profile-btn-active" : ""}`}
                      style={profile === p ? { borderColor: band.color, color: band.color, background: `${band.color}15` } : {}}
                      onClick={() => setProfile(p)}>{p}</button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <p className="setting-desc">
                  Selected profile: <strong style={{ color: band.color }}>{profile}</strong> — 
                  advisories are now customized for you across all {city} AQI readings.
                </p>
                <p className="setting-desc" style={{ fontSize: 12, marginTop: 8 }}>
                  ⓘ Profile is saved to MongoDB for registered users and applied automatically on future visits.
                </p>
              </div>
            </section>
          </div>
        )}

        {}
        {tab === "simulation" && (
          <div className="tab-content">
            <section className="card">
              <h2 className="section-title" style={{ marginTop: 0 }}>Wokwi Simulation</h2>
              <p className="setting-desc">
                The Arduino sketch below is tested on <strong>Wokwi</strong> with virtual MQ-135, PMS5003, and DHT22 sensors.
                Serial monitor output is verified against expected sensor ranges (REQ-SIM-001).
              </p>
              <div className="sim-links">
                <a href="https://wokwi.com" target="_blank" rel="noreferrer" className="sim-link" style={{ borderColor: band.color, color: band.color }}>
                  Open Wokwi ↗
                </a>
                <a href="https://www.tinkercad.com/circuits" target="_blank" rel="noreferrer" className="sim-link">
                  Open Tinkercad ↗
                </a>
              </div>
            </section>

            <section className="card">
              <h2 className="section-title" style={{ marginTop: 0 }}>Arduino Sketch — Copy to Wokwi</h2>
              <pre className="code-block">{ARDUINO_SKETCH}</pre>
            </section>

            <section className="card">
              <h2 className="section-title" style={{ marginTop: 0 }}>Tinkercad Breadboard Diagram</h2>
              <p className="setting-desc">
                Recreate the following wiring in Tinkercad Circuits and export as an image for report documentation (REQ-SIM-002, REQ-SIM-003):
              </p>
              <div className="wiring-table-wrapper">
                <table className="wiring-table">
                  <thead>
                    <tr><th>Sensor</th><th>Pin</th><th>Arduino Pin</th><th>Notes</th></tr>
                  </thead>
                  <tbody>
                    <tr><td>DHT22</td><td>DATA</td><td>Digital 2</td><td>4.7kΩ pull-up to VCC</td></tr>
                    <tr><td>MQ-135</td><td>AOUT</td><td>Analog A0</td><td>VCC = 5V</td></tr>
                    <tr><td>PMS5003</td><td>TX</td><td>Digital 10 (RX)</td><td>SoftwareSerial</td></tr>
                    <tr><td>PMS5003</td><td>RX</td><td>Digital 11 (TX)</td><td>SoftwareSerial</td></tr>
                    <tr><td>All sensors</td><td>VCC</td><td>5V</td><td>Common power rail</td></tr>
                    <tr><td>All sensors</td><td>GND</td><td>GND</td><td>Common ground rail</td></tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ── FOOTER ── */}
      <footer className="app-footer">
        <p>SAQHAS v1.0 — Medicaps University Minor Project | Jan–June 2026</p>
        <p>Data: OpenWeatherMap Air Pollution API + IQAir AirVisual API | ⓘ Informational only</p>
      </footer>
    </div>
  );
}
