"""
Data loading and persistence utilities for the CCA DRP Dashboard.

Responsibilities:
  - Load and cache the demand_data SQLite table with mtime-based invalidation.
  - Apply user-selected filters to the cached DataFrame.
  - Persist approved scenario modifications back to the SQLite database
    and cascade inventory recalculations.

All magic numbers and column mappings are imported from src.config.
All diagnostic output uses the centralised logger — never print().
"""

import json
import os
import sqlite3
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd

from ..config import (
    DATA_DIR,
    DB_PATH,
    FILTER_KEY_MAP,
    SCENARIOS_PATH,
)
from ..logger import get_logger

logger = get_logger(__name__)

# ── In-memory cache ───────────────────────────────────────────────────────────
# Avoids re-querying the database on every request.
# Invalidated automatically when drp.db mtime changes.
_CACHED_DF: Optional[pd.DataFrame] = None
_LAST_MTIME: float = 0


def load_data(filters: Optional[Dict[str, Any]] = None) -> pd.DataFrame:
    """
    Load the demand_data table from SQLite, apply filters, and return a DataFrame.

    The processed DataFrame is cached in memory and only reloaded when the
    database file changes (mtime comparison). A copy is always returned so
    callers cannot mutate the cache.

    The database stores canonical column names directly (populated by the
    csv_to_sqlite migration script), so no column renaming is required here.

    Args:
        filters: Optional dict of {frontend_key: [values]} to narrow the data.
                 Accepted keys: Distributor, ZREP, Year, Period, Category,
                 Planner_group.

    Returns:
        A filtered pandas DataFrame with canonical column names and two
        additional proposed-value columns:
          - Sell_In_Forecast_Qty_Proposed
          - In_transit_Proposed
    """
    global _CACHED_DF, _LAST_MTIME

    # Ensure scenarios file exists so other tools never 404 on it
    if not os.path.exists(SCENARIOS_PATH):
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(SCENARIOS_PATH, "w") as fh:
            json.dump([], fh)

    current_mtime = os.path.getmtime(DB_PATH) if os.path.exists(DB_PATH) else 0

    if _CACHED_DF is not None and current_mtime == _LAST_MTIME:
        df = _CACHED_DF.copy()
        logger.debug("Cache hit", extra={"rows": len(df)})
    else:
        logger.info("Loading data from database", extra={"path": DB_PATH})
        with sqlite3.connect(DB_PATH) as conn:
            df = pd.read_sql_query("SELECT * FROM demand_data", conn)

        # Drop the SQLite auto-increment surrogate key — not needed in the app
        if "id" in df.columns:
            df = df.drop(columns=["id"])

        # Replace inf and NaN with 0; fix stray string 'nan' values
        df = df.replace([np.inf, -np.inf], np.nan).fillna(0)
        df = df.replace({"nan": "Unknown", "NaN": "Unknown"})

        _CACHED_DF = df.copy()
        _LAST_MTIME = current_mtime
        logger.info("Data loaded and cached", extra={"rows": len(df), "cols": len(df.columns)})

    # ── Apply filters ─────────────────────────────────────────────────────────
    if filters:
        # Resolve Planner_group column name (may have space or underscore)
        planner_col = "Planner group" if "Planner group" in df.columns else "Planner_group"
        key_map = {**FILTER_KEY_MAP, "Planner_group": planner_col}

        for key, values in filters.items():
            actual_key = key_map.get(key, key)
            if values and actual_key in df.columns:
                df = df[df[actual_key].isin(values)]

        logger.debug("Filters applied", extra={"filters": filters, "rows_after": len(df)})

    # Append proposed-value columns initialised to current actuals/forecast
    df["Sell_In_Forecast_Qty_Proposed"] = df["Sell_In_Forecast_Qty"]
    df["In_transit_Proposed"] = df["In_transit"]

    return df


def save_approved_data(modifications: List[Dict[str, Any]]) -> None:
    """
    Apply approved scenario modifications to the SQLite database and cascade inventory.

    For each (Distributor, ZREP) group that was modified, recalculates
    Ending_inventory from the earliest changed period forward so the
    inventory chain remains consistent:
      Ending_inventory = Beginning_inventory + Sell_In - Sell_Out + In_Transit

    Note: WoH_Inventory_Required is demand-driven (sell-out) and is
    deliberately NOT recalculated here.

    Args:
        modifications: List of modification dicts, each containing:
            {
              "Distributor": str,
              "ZREP": str,
              "year": int,
              "period": int,
              "modifications": {
                  "Sell_In_Forecast_Qty_Proposed": float,  # optional
                  "In_transit_Proposed": float,             # optional
              }
            }

    Returns:
        None. Writes directly to DB_PATH and invalidates cache.
    """
    global _CACHED_DF, _LAST_MTIME

    logger.info("Applying approved modifications", extra={"count": len(modifications)})

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        # Step 1: Apply Sell_In and In_Transit changes via targeted UPDATE statements
        for mod in modifications:
            mods = mod["modifications"]
            if "Sell_In_Forecast_Qty_Proposed" in mods:
                conn.execute(
                    "UPDATE demand_data SET Sell_In_Forecast_Qty = ? "
                    "WHERE Distributor = ? AND ZREP = ? AND year = ? AND period = ?",
                    (
                        mods["Sell_In_Forecast_Qty_Proposed"],
                        mod["Distributor"], mod["ZREP"], mod["year"], mod["period"],
                    ),
                )
            if "In_transit_Proposed" in mods:
                conn.execute(
                    "UPDATE demand_data SET In_transit = ? "
                    "WHERE Distributor = ? AND ZREP = ? AND year = ? AND period = ?",
                    (
                        mods["In_transit_Proposed"],
                        mod["Distributor"], mod["ZREP"], mod["year"], mod["period"],
                    ),
                )
        conn.commit()

        # Step 2: Cascade inventory for each modified (Distributor, ZREP) group
        touched_groups = {(m["Distributor"], m["ZREP"]) for m in modifications}

        for dist, zrep in touched_groups:
            group_mods = [m for m in modifications if m["Distributor"] == dist and m["ZREP"] == zrep]
            if not group_mods:
                continue

            earliest = min(group_mods, key=lambda m: (m["year"], m["period"]))
            start_year, start_period = earliest["year"], earliest["period"]

            # Fetch all rows for this group from the earliest changed period onward
            rows = conn.execute(
                "SELECT id, year, period, Beginning_inventory, Sell_In_Forecast_Qty, "
                "Sell_Out_forecast_Qty, In_transit "
                "FROM demand_data "
                "WHERE Distributor = ? AND ZREP = ? "
                "  AND (year > ? OR (year = ? AND period >= ?)) "
                "ORDER BY year, period",
                (dist, zrep, start_year, start_year, start_period),
            ).fetchall()

            prev_end_inv: Optional[float] = None
            for row in rows:
                beg_inv = prev_end_inv if prev_end_inv is not None else float(row["Beginning_inventory"])
                end_inv = (
                    beg_inv
                    + float(row["Sell_In_Forecast_Qty"])
                    - float(row["Sell_Out_forecast_Qty"])
                    + float(row["In_transit"])
                )
                conn.execute(
                    "UPDATE demand_data SET Beginning_inventory = ?, Ending_inventory = ? WHERE id = ?",
                    (beg_inv, end_inv, row["id"]),
                )
                prev_end_inv = end_inv

            conn.commit()
            logger.debug("Inventory cascaded", extra={"distributor": dist, "zrep": zrep})

    finally:
        conn.close()

    # Invalidate the in-memory cache so next request reloads from disk
    _CACHED_DF = None
    _LAST_MTIME = 0
    logger.info("Modifications saved and cache invalidated")
