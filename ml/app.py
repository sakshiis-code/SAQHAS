"""
app.py — SAQHAS Flask ML Microservice
────────────────────────────────────────────────────────────────────────────────
Exposes POST /predict endpoint consumed by Node.js backend.

REQ-FCT-001: Returns predicted AQI for +6h and +12h
REQ-FCT-002: Model deployed only if trained MAE ≤ 20 AQI units
REQ-FCT-004: Hidden gracefully in UI if this service is down

Deploy on Render (free tier):
  - Build Command: pip install -r requirements.txt && python train.py
  - Start Command: gunicorn app:app
  - Add environment variable MONGODB_URI

Performance target (SRS 5.1): Flask ML prediction < 2 seconds
"""

import os
import pickle
import logging
from pathlib import Path
from datetime import datetime

import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("saqhas-ml")

app = Flask(__name__)
CORS(app, origins=[os.getenv("BACKEND_URL", "http://localhost:5000")])

# ─────────────────────────────────────────────────────────────────────────────
# Load pre-trained model artifacts at startup
# ─────────────────────────────────────────────────────────────────────────────

MODELS = {}
MODEL_DIR = Path("model")

for target in ["target_6h", "target_12h"]:
    filepath = MODEL_DIR / f"{target}.pkl"
    if filepath.exists():
        with open(filepath, "rb") as f:
            MODELS[target] = pickle.load(f)
        mae = MODELS[target].get("mae", "N/A")
        logger.info(f"✓ Loaded model: {target}  (MAE={mae})")
    else:
        logger.warning(f"✗ Model not found: {filepath}  — run train.py first")


def build_feature_vector(readings: list[dict], feature_cols: list[str]) -> np.ndarray:
    """
    Converts a list of recent AQI readings into the feature vector
    expected by the trained model.

    :param readings: List of recent hourly readings, newest first.
                     Each dict: { aqi, pm25, pm10, co, no2, so2, o3, temp, humidity, timestamp }
    :param feature_cols: Feature columns the model was trained on.
    :returns: 2D numpy array shape (1, n_features)
    """
    if not readings:
        raise ValueError("At least 1 reading required.")

    # Sort oldest → newest
    readings_sorted = sorted(readings, key=lambda r: r.get("timestamp", ""))
    aqi_series      = [r["aqi"] for r in readings_sorted]
    latest          = readings_sorted[-1]

    def lag(n):
        idx = -(n + 1)
        return aqi_series[idx] if len(aqi_series) > n else aqi_series[0]

    def roll_mean(w):
        window = aqi_series[-w:] if len(aqi_series) >= w else aqi_series
        return float(np.mean(window))

    def roll_std(w):
        window = aqi_series[-w:] if len(aqi_series) >= w else aqi_series
        return float(np.std(window)) if len(window) > 1 else 0.0

    # Parse timestamp for cyclical time features
    ts    = datetime.fromisoformat(latest.get("timestamp", datetime.utcnow().isoformat()))
    hour  = ts.hour
    wday  = ts.weekday()

    feature_map = {
        "aqi_lag_1h":         lag(1),
        "aqi_lag_2h":         lag(2),
        "aqi_lag_3h":         lag(3),
        "aqi_lag_6h":         lag(6),
        "aqi_lag_12h":        lag(12),
        "aqi_roll_mean_3h":   roll_mean(3),
        "aqi_roll_mean_6h":   roll_mean(6),
        "aqi_roll_mean_12h":  roll_mean(12),
        "aqi_roll_std_3h":    roll_std(3),
        "aqi_roll_std_6h":    roll_std(6),
        "aqi_roll_std_12h":   roll_std(12),
        "hour_sin":           float(np.sin(2 * np.pi * hour / 24)),
        "hour_cos":           float(np.cos(2 * np.pi * hour / 24)),
        "weekday_sin":        float(np.sin(2 * np.pi * wday / 7)),
        "is_weekend":         int(wday >= 5),
        "pm25":               latest.get("pm25", 50.0),
        "pm10":               latest.get("pm10", 80.0),
        "co":                 latest.get("co", 1.0),
        "no2":                latest.get("no2", 40.0),
        "so2":                latest.get("so2", 15.0),
        "o3":                 latest.get("o3", 50.0),
        "temp":               latest.get("temp", 28.0),
        "humidity":           latest.get("humidity", 55.0),
    }

    vector = np.array([[feature_map.get(col, 0.0) for col in feature_cols]])
    return vector


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status":         "ok",
        "models_loaded":  list(MODELS.keys()),
        "timestamp":      datetime.utcnow().isoformat(),
    })


@app.route("/predict", methods=["POST"])
def predict():
    """
    POST /predict
    Body: { "city": "Indore", "readings": [...] }
    Returns: { "city", "forecast_6h", "forecast_12h", "model", "mae_6h", "mae_12h" }
    """
    data = request.get_json(silent=True)

    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    city     = data.get("city", "Unknown")
    readings = data.get("readings", [])

    if not readings:
        return jsonify({"error": "readings list is required."}), 400

    if not MODELS:
        return jsonify({"error": "No models are loaded. Run train.py first."}), 503

    results = {}

    for target, label in [("target_6h", "forecast_6h"), ("target_12h", "forecast_12h")]:
        if target not in MODELS:
            results[label] = None
            continue

        artifact = MODELS[target]
        model    = artifact["model"]
        features = artifact["features"]

        try:
            X      = build_feature_vector(readings, features)
            y_pred = model.predict(X)[0]
            y_pred = float(np.clip(round(y_pred), 10, 500))
            results[label] = y_pred
        except Exception as e:
            logger.error(f"Prediction error for {target}: {e}")
            results[label] = None

    response = {
        "city":        city,
        "forecast_6h":  results.get("forecast_6h"),
        "forecast_12h": results.get("forecast_12h"),
        "model":        "RandomForest (scikit-learn)",
        "mae_6h":       MODELS.get("target_6h", {}).get("mae"),
        "mae_12h":      MODELS.get("target_12h", {}).get("mae"),
        "predicted_at": datetime.utcnow().isoformat(),
    }

    logger.info(f"Predicted for {city}: +6h={results.get('forecast_6h')}, +12h={results.get('forecast_12h')}")
    return jsonify(response)


# ─────────────────────────────────────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port = int(os.getenv("PORT", 6000))
    logger.info(f"Starting SAQHAS ML service on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
