"""
train.py — SAQHAS AQI Forecasting Model
────────────────────────────────────────────────────────────────────────────────
Trains a scikit-learn Random Forest model on historical AQI readings stored
in MongoDB Atlas. Outputs a trained model artifact (model.pkl) for serving
via the Flask microservice (app.py).

REQ-FCT-001: POST /predict returns +6h and +12h AQI predictions
REQ-FCT-002: scikit-learn model; deployed only if MAE ≤ 20 AQI units
REQ-FCT-003: Reads hourly AQI readings from MongoDB
TBD-001:     Final model choice resolved here after EDA

Run:
    pip install -r requirements.txt
    python train.py
"""

import os
import pickle
import warnings
from datetime import datetime

import numpy as np
import pandas as pd
from pymongo import MongoClient
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import mean_absolute_error, root_mean_squared_error
from sklearn.preprocessing import StandardScaler
from dotenv import load_dotenv

warnings.filterwarnings("ignore")
load_dotenv()

# ─────────────────────────────────────────────────────────────────────────────
# 1. LOAD DATA FROM MONGODB
# ─────────────────────────────────────────────────────────────────────────────

def load_data_from_mongodb(city: str | None = None) -> pd.DataFrame:
    """
    Fetches AQI readings from MongoDB Atlas.
    Each document: { city, aqi, pm25, pm10, co, no2, so2, o3, temp, humidity, timestamp }
    """
    client = MongoClient(os.getenv("MONGODB_URI"))
    db     = client["saqhas"]
    query  = {"city": city} if city else {}

    records = list(db["aqireadings"].find(query, {"_id": 0}).sort("timestamp", 1))
    client.close()

    if not records:
        raise ValueError("No records found in MongoDB. Run the backend first to accumulate data.")

    df = pd.DataFrame(records)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    return df


def generate_synthetic_data(n: int = 5000) -> pd.DataFrame:
    """
    Generates synthetic training data for development/testing.
    Simulates realistic AQI patterns:
      - Morning/evening peaks (rush hours)
      - Weekend dips
      - Random pollutant correlations
    TBD-002: Replace with real MongoDB data once ≥1000 readings are available.
    """
    print("  ⚠  Using synthetic data (no MongoDB connection). Replace with real data.")

    np.random.seed(42)
    timestamps = pd.date_range("2025-01-01", periods=n, freq="h")
    hour       = timestamps.hour
    weekday    = timestamps.dayofweek  # 0=Mon, 6=Sun

    # Realistic AQI baseline with time-of-day patterns
    base_aqi = 120 + 40 * np.sin((hour - 8) * np.pi / 12) + np.random.normal(0, 20, n)
    base_aqi -= 20 * (weekday >= 5).astype(float)  # Weekend dip
    base_aqi  = np.clip(base_aqi, 20, 480)

    df = pd.DataFrame({
        "city":      np.random.choice(["Indore", "Delhi", "Mumbai", "Bhopal"], n),
        "aqi":       base_aqi.round(1),
        "pm25":      (base_aqi * 0.38 + np.random.normal(0, 5, n)).clip(5, 250),
        "pm10":      (base_aqi * 0.62 + np.random.normal(0, 8, n)).clip(10, 430),
        "co":        (base_aqi * 0.012 + np.random.normal(0, 0.2, n)).clip(0.2, 34),
        "no2":       (base_aqi * 0.30 + np.random.normal(0, 6, n)).clip(5, 400),
        "so2":       (base_aqi * 0.12 + np.random.normal(0, 4, n)).clip(2, 200),
        "o3":        (base_aqi * 0.25 + np.random.normal(0, 5, n)).clip(10, 300),
        "temp":      (22 + 8 * np.sin((hour - 6) * np.pi / 12) + np.random.normal(0, 2, n)).clip(10, 45),
        "humidity":  np.random.uniform(30, 85, n).round(1),
        "timestamp": timestamps,
    })

    return df


# ─────────────────────────────────────────────────────────────────────────────
# 2. FEATURE ENGINEERING
# ─────────────────────────────────────────────────────────────────────────────

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Creates time-series features for predicting AQI at +6h and +12h.
    Each row represents a window of recent readings.
    """
    df = df.sort_values("timestamp").reset_index(drop=True)

    # Lag features: AQI at t-1h, t-2h, t-3h, t-6h, t-12h
    for lag in [1, 2, 3, 6, 12]:
        df[f"aqi_lag_{lag}h"] = df["aqi"].shift(lag)

    # Rolling statistics (last 3h, 6h, 12h)
    for window in [3, 6, 12]:
        df[f"aqi_roll_mean_{window}h"] = df["aqi"].rolling(window).mean()
        df[f"aqi_roll_std_{window}h"]  = df["aqi"].rolling(window).std()

    # Cyclical time encoding (preserves periodicity)
    df["hour"]         = df["timestamp"].dt.hour
    df["hour_sin"]     = np.sin(2 * np.pi * df["hour"] / 24)
    df["hour_cos"]     = np.cos(2 * np.pi * df["hour"] / 24)
    df["weekday"]      = df["timestamp"].dt.dayofweek
    df["weekday_sin"]  = np.sin(2 * np.pi * df["weekday"] / 7)
    df["is_weekend"]   = (df["weekday"] >= 5).astype(int)

    # Current pollutant readings as features
    pollutant_cols = ["pm25", "pm10", "co", "no2", "so2", "o3", "temp", "humidity"]
    for col in pollutant_cols:
        if col in df.columns:
            df[col] = df[col].fillna(df[col].median())

    # Targets: AQI 6h and 12h ahead
    df["target_6h"]  = df["aqi"].shift(-6)
    df["target_12h"] = df["aqi"].shift(-12)

    # Drop rows with NaN (from lags and targets)
    df = df.dropna().reset_index(drop=True)

    return df


FEATURE_COLS = [
    "aqi_lag_1h", "aqi_lag_2h", "aqi_lag_3h", "aqi_lag_6h", "aqi_lag_12h",
    "aqi_roll_mean_3h", "aqi_roll_mean_6h", "aqi_roll_mean_12h",
    "aqi_roll_std_3h",  "aqi_roll_std_6h",  "aqi_roll_std_12h",
    "hour_sin", "hour_cos", "weekday_sin", "is_weekend",
    "pm25", "pm10", "co", "no2", "so2", "o3", "temp", "humidity",
]


# ─────────────────────────────────────────────────────────────────────────────
# 3. MODEL TRAINING
# ─────────────────────────────────────────────────────────────────────────────

def train_and_evaluate(X_train, X_test, y_train, y_test, target_name: str):
    """Trains RF and LR, picks best; REQ-FCT-002: deploy only if MAE ≤ 20."""

    models = {
        "RandomForest":     RandomForestRegressor(n_estimators=200, max_depth=12,
                                                   min_samples_leaf=5, random_state=42, n_jobs=-1),
        "LinearRegression": LinearRegression(),
    }

    results = {}
    for name, model in models.items():
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        mae    = mean_absolute_error(y_test, y_pred)
        rmse   = root_mean_squared_error(y_test, y_pred)
        results[name] = {"model": model, "mae": mae, "rmse": rmse}
        print(f"    {name:20s}  MAE={mae:.2f}  RMSE={rmse:.2f}")

    # Pick model with lower MAE (TBD-001)
    best_name  = min(results, key=lambda k: results[k]["mae"])
    best       = results[best_name]
    best_model = best["model"]
    best_mae   = best["mae"]

    print(f"  → Best model for {target_name}: {best_name} (MAE={best_mae:.2f})")

    # REQ-FCT-002: Deployment gate
    if best_mae > 20:
        print(f"  ✗ MAE {best_mae:.2f} exceeds threshold of 20 AQI units. Model NOT deployed.")
        print(f"    Accumulate more training data (TBD-002) before deploying.")
        return None, best_mae

    print(f"  ✓ MAE {best_mae:.2f} ≤ 20. Model approved for deployment.")
    return best_model, best_mae


def main():
    print("\n=== SAQHAS AQI Forecasting — Model Training ===\n")

    # 1. Load data
    print("1. Loading training data...")
    try:
        df = load_data_from_mongodb()
        print(f"   Loaded {len(df)} records from MongoDB.")
    except Exception as e:
        print(f"   MongoDB not available ({e}). Falling back to synthetic data.")
        df = generate_synthetic_data(n=8000)
        print(f"   Generated {len(df)} synthetic records.")

    # 2. Feature engineering
    print("\n2. Engineering features...")
    df = engineer_features(df)
    print(f"   Dataset shape after feature engineering: {df.shape}")

    features = [c for c in FEATURE_COLS if c in df.columns]
    X = df[features].values

    # 3. Train models for +6h and +12h targets
    artifacts = {}
    for target_col, label in [("target_6h", "+6h"), ("target_12h", "+12h")]:
        print(f"\n3. Training model for AQI prediction at {label}...")
        y = df[target_col].values

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        model, mae = train_and_evaluate(X_train, X_test, y_train, y_test, label)
        artifacts[target_col] = {"model": model, "mae": mae, "features": features}

    # 4. Save model artifacts
    print("\n4. Saving model artifacts...")
    os.makedirs("model", exist_ok=True)

    # Only save models that passed the MAE gate
    for target_col, art in artifacts.items():
        if art["model"] is not None:
            filepath = f"model/{target_col}.pkl"
            with open(filepath, "wb") as f:
                pickle.dump({"model": art["model"], "features": art["features"], "mae": art["mae"],
                             "trained_at": datetime.utcnow().isoformat()}, f)
            print(f"   Saved: {filepath}  (MAE={art['mae']:.2f})")
        else:
            print(f"   Skipped {target_col} — did not pass MAE gate.")

    print("\n=== Training complete ===\n")
    print("Next step: run `python app.py` to start the Flask prediction service.")


if __name__ == "__main__":
    main()
