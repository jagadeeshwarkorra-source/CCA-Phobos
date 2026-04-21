"""
Application-wide configuration constants for the CCA DRP Dashboard backend.

All magic numbers, thresholds, file paths, and column mappings live here.
No other module should hardcode these values — import from this file instead.
"""

import os

# ── File paths ───────────────────────────────────────────────────────────────
DATA_DIR       = os.path.join(os.path.dirname(__file__), "data")    # backend/src/data/
MOCK_DATA_PATH = os.path.join(DATA_DIR, "mock_data.csv")             # kept for reference / migration
DB_PATH        = os.path.join(DATA_DIR, "drp.db")
SCENARIOS_PATH = os.path.join(DATA_DIR, "scenarios.json")

# ── Data horizons (period_val relative to current period P+0) ────────────────
OVERVIEW_MIN_PERIOD = -20   # Buffer restore — expands range for YoY lookups
DETAILED_MIN_PERIOD = -15   # Historical context shown in Detailed View
SCENARIO_MIN_PERIOD =   0   # Scenario Builder starts at current period
ACCURACY_MIN_PERIOD =  -3   # Accuracy: last 3 closed periods (P-3)
ACCURACY_MAX_PERIOD =  -1   # Accuracy: up to most recent closed period (P-1)


# ── Overview chart display window ────────────────────────────────────────────
CHART_MIN_PERIOD = -3
CHART_MAX_PERIOD = 12

# ── Sell-out actuals column names (preferred + legacy fallback) ───────────────
SO_ACTUALS_COL_NEW    = "Sell_Out_Actuals_Qty"
SO_ACTUALS_COL_LEGACY = "Sell_Out_actuals"

# ── Canonical column mapping: lowercase CSV header → canonical DataFrame name ─
CANONICAL_MAP: dict = {
    # Identifiers
    "distributor":                  "Distributor",
    "zrep":                         "ZREP",
    "product":                      "ZREP",
    "item":                         "ZREP",
    "prod":                         "ZREP",
    "year":                         "year",
    "period":                       "period",
    "rolling_period":               "Rolling_Period",
    "rolling":                      "Rolling_Period",
    "category":                     "category",
    "cat":                          "category",
    "demand segment":               "Demand_segment",   # space in raw CSV header
    "demand_segment":               "Demand_segment",
    "planner_group":                "Planner_group",
    "planner group":                "Planner_group",
    # Sell-Out
    "sell_out_forecast_qty":        "Sell_Out_forecast_Qty",
    "sell_out_forecast_qty_deimos": "Sell_Out_forecast_qty_deimos",
    "sell_out_actuals_qty":         "Sell_Out_Actuals_Qty",
    "sell_out_actuals":             "Sell_Out_Actuals_Qty",          # legacy alias
    "sell_out_forecast_value":      "Sell_Out_forecast_value",
    # Sell-In
    "sell_in_actuals_qty":          "Sell_In_Actuals_Qty",           # real actuals
    "sell_in_forecast_qty":         "Sell_In_Forecast_Qty",
    "sell_in_forecast_value":       "Sell_In_Forecast_value",
    # Inventory / Logistics
    "in_transit":                   "In_transit",
    "beginning_inventory":          "Beginning_inventory",
    "ending_inventory":             "Ending_inventory",
    "target_inventory":             "Target_inventory",
    "woh_inventory_required":       "WoH_Inventory_Required",
    # Other
    "price":                        "price",
    "doh":                          "DOH",
}

# ── Numeric columns to coerce before canonical renaming ──────────────────────
NUMERIC_COLS: list = [
    # Lowercase (as they appear in raw CSV)
    "year", "period",
    "sell_in_actuals_qty", "sell_in_forecast_qty",
    "sell_out_actuals_qty", "sell_out_forecast_qty", "sell_out_forecast_qty_deimos",
    "in_transit", "beginning_inventory", "ending_inventory",
    "target_inventory", "woh_inventory_required",
    "price", "doh",
    # Legacy / alternate capitalizations (safe — guarded by `if col in df.columns`)
    "Sell_In_Forecast_Qty", "Sell_Out_forecast_Qty", "In_transit",
    "Beginning_inventory", "Ending_inventory", "Target_inventory", "WoH_Inventory_Required",
    "Sell_Out_actuals", "Sell_Out_forecast_value", "Sell_In_Forecast_value",
]

# ── Filter key → DataFrame column mapping ────────────────────────────────────
FILTER_KEY_MAP: dict = {
    "Year":        "year",
    "Period":      "period",
    "Category":    "category",
    "Distributor": "Distributor",
    "ZREP":        "ZREP",
    "Product":     "ZREP",
}
