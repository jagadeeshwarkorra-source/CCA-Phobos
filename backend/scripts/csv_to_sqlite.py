"""
One-time migration: mock_data.csv  ->  drp.db (SQLite).

Usage (run from project root or backend/):
    python -m scripts.csv_to_sqlite
    # or
    python backend/scripts/csv_to_sqlite.py

What it does:
  1. Reads mock_data.csv using the same canonical-rename logic as data_tools.py.
  2. Creates (or replaces) the `demand_data` table in drp.db.
  3. Loads all rows into the table with explicit column types.
  4. Creates indexes on Distributor+ZREP and year+period for fast filtering.

After running this script the backend can be switched from CSV to SQLite by
updating data_tools.py — no other changes are required.
"""

import os
import sqlite3
import sys

import numpy as np
import pandas as pd

# ── Resolve paths regardless of cwd ──────────────────────────────────────────
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.dirname(_SCRIPT_DIR)
_DATA_DIR    = os.path.join(_BACKEND_DIR, "src", "data")
CSV_PATH     = os.path.join(_DATA_DIR, "mock_data.csv")
DB_PATH      = os.path.join(_DATA_DIR, "drp.db")

# ── Canonical column map (mirrors src/config.py CANONICAL_MAP) ────────────────
CANONICAL_MAP: dict = {
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
    "demand segment":               "Demand_segment",
    "demand_segment":               "Demand_segment",
    "planner_group":                "Planner_group",
    "planner group":                "Planner_group",
    "sell_out_forecast_qty":        "Sell_Out_forecast_Qty",
    "sell_out_forecast_qty_deimos": "Sell_Out_forecast_qty_deimos",
    "sell_out_actuals_qty":         "Sell_Out_Actuals_Qty",
    "sell_out_actuals":             "Sell_Out_Actuals_Qty",
    "sell_out_forecast_value":      "Sell_Out_forecast_value",
    "sell_in_actuals_qty":          "Sell_In_Actuals_Qty",
    "sell_in_forecast_qty":         "Sell_In_Forecast_Qty",
    "sell_in_forecast_value":       "Sell_In_Forecast_value",
    "in_transit":                   "In_transit",
    "beginning_inventory":          "Beginning_inventory",
    "ending_inventory":             "Ending_inventory",
    "target_inventory":             "Target_inventory",
    "woh_inventory_required":       "WoH_Inventory_Required",
    "price":                        "price",
    "doh":                          "DOH",
}

NUMERIC_COLS: list = [
    "year", "period",
    "sell_in_actuals_qty", "sell_in_forecast_qty",
    "sell_out_actuals_qty", "sell_out_forecast_qty", "sell_out_forecast_qty_deimos",
    "in_transit", "beginning_inventory", "ending_inventory",
    "target_inventory", "woh_inventory_required", "price", "doh",
]

# ── SQLite CREATE TABLE statement ─────────────────────────────────────────────
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS demand_data (
    id                           INTEGER PRIMARY KEY AUTOINCREMENT,
    Distributor                  TEXT    NOT NULL,
    ZREP                         TEXT    NOT NULL,
    category                     TEXT,
    Demand_segment               TEXT,
    year                         INTEGER NOT NULL,
    period                       INTEGER NOT NULL,
    Rolling_Period               TEXT,
    Sell_Out_Actuals_Qty         REAL    DEFAULT 0,
    Sell_Out_forecast_qty_deimos REAL    DEFAULT 0,
    Sell_Out_forecast_Qty        REAL    DEFAULT 0,
    price                        REAL    DEFAULT 0,
    In_transit                   REAL    DEFAULT 0,
    Target_inventory             REAL    DEFAULT 0,
    Beginning_inventory          REAL    DEFAULT 0,
    WoH_Inventory_Required       REAL    DEFAULT 0,
    Sell_In_Actuals_Qty          REAL    DEFAULT 0,
    Sell_In_Forecast_Qty         REAL    DEFAULT 0,
    Ending_inventory             REAL    DEFAULT 0,
    Planner_group                TEXT,
    DOH                          REAL    DEFAULT 0
)
"""

CREATE_INDEXES_SQL = [
    "CREATE INDEX IF NOT EXISTS idx_dist_zrep   ON demand_data(Distributor, ZREP)",
    "CREATE INDEX IF NOT EXISTS idx_year_period ON demand_data(year, period)",
    "CREATE INDEX IF NOT EXISTS idx_dist_zrep_year_period ON demand_data(Distributor, ZREP, year, period)",
]


def _load_and_normalise_csv(csv_path: str) -> pd.DataFrame:
    """
    Read mock_data.csv and apply the same canonical-rename logic as data_tools.py.

    Args:
        csv_path: Absolute path to mock_data.csv.

    Returns:
        Normalised DataFrame with canonical column names.
    """
    print(f"  Reading CSV: {csv_path}")
    df = pd.read_csv(csv_path)
    print(f"  Rows: {len(df):,}   Columns: {list(df.columns)}")

    # Strip commas / dollar signs from text columns
    for col in df.columns:
        if df[col].dtype == object:
            df[col] = (
                df[col]
                .astype(str)
                .str.replace(",", "", regex=False)
                .str.replace("$", "", regex=False)
                .str.strip()
            )

    # Coerce numeric columns
    for col in NUMERIC_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Lowercase all headers
    df.columns = [c.lower() for c in df.columns]

    # Apply canonical rename
    rename_dict: dict = {}
    for alias, canonical in CANONICAL_MAP.items():
        if alias in df.columns:
            if canonical not in df.columns or alias != canonical.lower():
                rename_dict[alias] = canonical
    if rename_dict:
        df = df.rename(columns=rename_dict)
        print(f"  Renamed {len(rename_dict)} columns: {rename_dict}")

    # Fill in any missing canonical columns with 0
    for canon in set(CANONICAL_MAP.values()):
        if canon not in df.columns:
            df[canon] = 0

    # Replace NaN / inf with 0
    df = df.replace([np.inf, -np.inf], np.nan).fillna(0)

    return df


def migrate(csv_path: str = CSV_PATH, db_path: str = DB_PATH) -> None:
    """
    Run the full CSV → SQLite migration.

    Args:
        csv_path: Source CSV file path.
        db_path:  Destination SQLite database path.

    Returns:
        None. Prints progress to stdout.
    """
    print("=" * 60)
    print("CCA DRP -- CSV -> SQLite migration")
    print("=" * 60)

    if not os.path.exists(csv_path):
        print(f"ERROR: CSV not found at {csv_path}")
        sys.exit(1)

    # 1. Load and normalise
    df = _load_and_normalise_csv(csv_path)

    # 2. Keep only the columns we want in the DB (match CREATE TABLE)
    db_columns = [
        "Distributor", "ZREP", "category", "Demand_segment", "year", "period",
        "Rolling_Period", "Sell_Out_Actuals_Qty", "Sell_Out_forecast_qty_deimos",
        "Sell_Out_forecast_Qty", "price", "In_transit", "Target_inventory",
        "Beginning_inventory", "WoH_Inventory_Required", "Sell_In_Actuals_Qty",
        "Sell_In_Forecast_Qty", "Ending_inventory", "Planner_group", "DOH",
    ]
    # Only keep columns that exist in the DataFrame
    cols_to_write = [c for c in db_columns if c in df.columns]
    missing = [c for c in db_columns if c not in df.columns]
    if missing:
        print(f"  Warning: Missing columns (will be 0): {missing}")
        for c in missing:
            df[c] = 0
    df = df[db_columns]

    # 3. Create / overwrite the SQLite database
    if os.path.exists(db_path):
        print(f"  Removing existing database: {db_path}")
        os.remove(db_path)

    print(f"  Creating database: {db_path}")
    conn = sqlite3.connect(db_path)
    try:
        conn.execute(CREATE_TABLE_SQL)
        for idx_sql in CREATE_INDEXES_SQL:
            conn.execute(idx_sql)
        conn.commit()

        # 4. Write rows in chunks for memory efficiency
        chunk_size = 5_000
        total = len(df)
        for start in range(0, total, chunk_size):
            chunk = df.iloc[start : start + chunk_size]
            chunk.to_sql("demand_data", conn, if_exists="append", index=False)
            pct = min(100, int((start + chunk_size) / total * 100))
            print(f"  Written {min(start + chunk_size, total):,}/{total:,} rows ({pct}%)", end="\r")

        conn.commit()
        print(f"\n  All {total:,} rows loaded successfully.")

        # 5. Verify
        row_count = conn.execute("SELECT COUNT(*) FROM demand_data").fetchone()[0]
        print(f"  DB verification: {row_count:,} rows in demand_data table.")
        print(f"  DB file size: {os.path.getsize(db_path) / 1_048_576:.1f} MB")

    finally:
        conn.close()

    print("=" * 60)
    print("Migration complete.")
    print(f"  Database: {db_path}")
    print("=" * 60)


if __name__ == "__main__":
    migrate()
