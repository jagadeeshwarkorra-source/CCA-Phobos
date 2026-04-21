"""
Data agent for the CCA DRP Dashboard.

Handles all read-only data actions routed through the LangGraph:
  - get_filter_options   → distinct values for each filter dropdown
  - get_overview         → by-distributor + by-period aggregations with GSV
  - get_details          → flat row data for the Detailed View table
  - get_scenario_details → flat row data scoped to P+0 and forward
  - export_to_excel      → base64-encoded XLSX file for download
  - upload_scenario_excel→ parse uploaded XLSX into override dict
  - get_accuracy_comparison → wMAPE/bias metrics across P-3 to P-1

All magic numbers (period thresholds, column names) are imported from
src.config. Logging uses the centralised logger — never print().
"""

from typing import Dict, Any

import pandas as pd

from ..config import (
    ACCURACY_MAX_PERIOD,
    ACCURACY_MIN_PERIOD,
    CHART_MAX_PERIOD,
    CHART_MIN_PERIOD,
    DETAILED_MIN_PERIOD,
    OVERVIEW_MIN_PERIOD,
    SCENARIO_MIN_PERIOD,
    SO_ACTUALS_COL_LEGACY,
    SO_ACTUALS_COL_NEW,
)
from ..logger import get_logger
from ..state import GraphState
from ..tools.data_tools import load_data

logger = get_logger(__name__)


def _resolve_so_actuals_col(df: pd.DataFrame) -> str:
    """
    Return the sell-out actuals column name present in df.

    Prefers the new canonical name; falls back to the legacy alias.

    Args:
        df: The loaded DataFrame.

    Returns:
        Column name string (SO_ACTUALS_COL_NEW or SO_ACTUALS_COL_LEGACY).
    """
    return SO_ACTUALS_COL_NEW if SO_ACTUALS_COL_NEW in df.columns else SO_ACTUALS_COL_LEGACY


def _parse_period_val(p_str: Any) -> int:
    """
    Parse a Rolling_Period label like 'P+1', 'P-3', 'P+0' into an integer.

    Args:
        p_str: Rolling period string from the DataFrame.

    Returns:
        Integer period value, or 999 on parse failure.
    """
    try:
        if not isinstance(p_str, str):
            return 999
        cleaned = p_str.upper().strip()
        if cleaned.startswith("P"):
            return int(cleaned[1:].replace("+", ""))
        return int(cleaned)
    except (ValueError, TypeError):
        return 999


def _get_unique(df: pd.DataFrame, col: str) -> list:
    """
    Return sorted unique non-null Python scalars from a DataFrame column.

    Args:
        df:  Source DataFrame.
        col: Column name to extract.

    Returns:
        Sorted list of unique values. Falls back to string sort on error.
    """
    import numpy as np  # local import — already a transitive dep

    if col not in df.columns:
        return []

    vals = []
    for v in df[col].unique():
        if pd.isnull(v) or str(v).lower() == "nan":
            continue
        vals.append(v.item() if hasattr(v, "item") else v)

    try:
        return sorted(vals)
    except TypeError:
        return sorted(str(v) for v in vals)


def process_data_request(state: GraphState) -> GraphState:
    """
    Entry point for all data-related LangGraph actions.

    Dispatches to the appropriate handler based on state["action"].
    Sets state["status"] = "success" on completion, or
    state["status"] = "failed" / state["error"] = <message> on failure.

    Args:
        state: Mutable LangGraph state dict containing at minimum "action"
               and optionally "filters", "is_scenario", "excel_file".

    Returns:
        Updated state dict with results populated under the relevant key
        (overview_summary, data, filter_options, excel_file, etc.).
    """
    action = state.get("action")
    filters = state.get("filters", {})

    allowed_actions = [
        "get_overview", "get_details", "get_filter_options",
        "get_scenario_details", "export_to_excel", "upload_scenario_excel",
        "get_accuracy_comparison",
    ]
    if action not in allowed_actions:
        return state

    logger.info("Processing data request", extra={"action": action})

    try:
        # ── get_filter_options ────────────────────────────────────────────────
        if action == "get_filter_options":
            df = load_data()
            state["filter_options"] = {
                "Distributor":  _get_unique(df, "Distributor"),
                "ZREP":         _get_unique(df, "ZREP"),
                "Year":         _get_unique(df, "year"),
                "Period":       _get_unique(df, "period"),
                "Category":     _get_unique(df, "category"),
                "Planner_group":_get_unique(df, "Planner_group"),
            }
            state["status"] = "success"
            logger.info("Filter options built")
            return state

        # ── Load & enrich data (shared by all remaining actions) ──────────────
        df = load_data(filters)

        if "Rolling_Period" in df.columns:
            df["period_val"] = df["Rolling_Period"].apply(_parse_period_val)
        else:
            df["period_val"] = 0

        # Ensure year/period are ints for grouping/sorting
        for col in ("year", "period"):
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

        # ── get_overview ──────────────────────────────────────────────────────
        if action == "get_overview":
            df = df[df["period_val"] >= OVERVIEW_MIN_PERIOD]

            group_cols = [c for c in ["Distributor", "ZREP", "year", "period", "Rolling_Period", "period_val"] if c in df.columns]
            so_actuals_col = _resolve_so_actuals_col(df)

            # Compute per-row GSV before aggregation so mixed-price ZREPs are correct
            _price = df["price"] if "price" in df.columns else 0.0
            df["_gsv_si_actuals"]  = df["Sell_In_Actuals_Qty"]  * _price
            df["_gsv_si_forecast"] = df["Sell_In_Forecast_Qty"] * _price
            df["_gsv_so_actuals"]  = df[so_actuals_col]          * _price
            df["_gsv_so_forecast"] = df["Sell_Out_forecast_Qty"] * _price

            overview = df.groupby(group_cols).agg(**{
                "sell_in_actuals":       ("Sell_In_Actuals_Qty",  "sum"),
                "sell_in_forecast":      ("Sell_In_Forecast_Qty", "sum"),
                "sell_out_actuals":      (so_actuals_col,          "sum"),
                "sell_out_forecast":     ("Sell_Out_forecast_Qty", "sum"),
                "gsv_sell_in_actuals":   ("_gsv_si_actuals",       "sum"),
                "gsv_sell_in_forecast":  ("_gsv_si_forecast",      "sum"),
                "gsv_sell_out_actuals":  ("_gsv_so_actuals",       "sum"),
                "gsv_sell_out_forecast": ("_gsv_so_forecast",      "sum"),
            }).reset_index()

            period_group = [c for c in ["Rolling_Period", "year", "period", "period_val"] if c in df.columns]
            agg_dict: Dict[str, Any] = {
                "sell_in_actuals":       ("Sell_In_Actuals_Qty",  "sum"),
                "sell_in_forecast":      ("Sell_In_Forecast_Qty", "sum"),
                "sell_out_actuals_sum":  (so_actuals_col,          "sum"),
                "sell_out_forecast":     ("Sell_Out_forecast_Qty", "sum"),
                "ending_inventory_sum":  ("Ending_inventory",      "sum"),
                "gsv_sell_in_actuals":   ("_gsv_si_actuals",       "sum"),
                "gsv_sell_in_forecast":  ("_gsv_si_forecast",      "sum"),
                "gsv_sell_out_actuals":  ("_gsv_so_actuals",       "sum"),
                "gsv_sell_out_forecast": ("_gsv_so_forecast",      "sum"),
            }
            if "In_transit" in df.columns:
                agg_dict["in_transit_sum"] = ("In_transit", "sum")

            overview_period = df.groupby(period_group).agg(**agg_dict).reset_index()

            # Compute DOH per period:
            #   Past  (period_val < 0)  → DOH = (Ending_inventory / Sell_Out_actuals)  × 28
            #   Future (period_val >= 0) → DOH = (Ending_inventory / Sell_Out_forecast) × 28
            period_records = overview_period.to_dict(orient="records")
            for row in period_records:
                pval    = float(row.get("period_val", 0) or 0)
                end_inv = float(row.get("ending_inventory_sum", 0) or 0)
                denom   = float(
                    row.get("sell_out_forecast", 0) if pval >= 0
                    else row.get("sell_out_actuals_sum", 0)
                ) or 0
                row["doh"] = round(end_inv / denom * 28, 1) if denom > 0 else None

            state["overview_summary"] = {
                "by_distributor": overview.to_dict(orient="records"),
                "by_period":      period_records,
            }
            state["status"] = "success"
            logger.info("Overview built", extra={"by_period_rows": len(period_records)})

        # ── get_details ───────────────────────────────────────────────────────
        elif action == "get_details":
            df = df[df["period_val"] >= DETAILED_MIN_PERIOD]
            state["data"]   = df.to_dict(orient="records")
            state["status"] = "success"
            logger.info("Details loaded", extra={"rows": len(df)})

        # ── get_scenario_details ──────────────────────────────────────────────
        elif action == "get_scenario_details":
            df = df[df["period_val"] >= SCENARIO_MIN_PERIOD]
            state["data"]   = df.to_dict(orient="records")
            state["status"] = "success"
            logger.info("Scenario details loaded", extra={"rows": len(df)})

        # ── export_to_excel ───────────────────────────────────────────────────
        elif action == "export_to_excel":
            import base64
            import io

            is_scenario = state.get("is_scenario", False)
            if is_scenario:
                df = df[df["period_val"] >= SCENARIO_MIN_PERIOD]
                cols = [
                    "Distributor", "ZREP", "year", "period", "Rolling_Period",
                    "Sell_In_Forecast_Qty_Proposed", "In_transit_Proposed",
                    "Beginning_inventory", "Sell_Out_forecast_Qty", "In_transit",
                    "WoH_Inventory_Required", "Ending_inventory",
                ]
            else:
                df = df[df["period_val"] >= DETAILED_MIN_PERIOD]
                cols = [
                    "Distributor", "ZREP", "year", "period", "Rolling_Period",
                    "Beginning_inventory", "Sell_In_Forecast_Qty", "Sell_Out_forecast_Qty",
                    "In_transit", "WoH_Inventory_Required", "Ending_inventory",
                ]

            cols       = [c for c in cols if c in df.columns]
            export_df  = df[cols].copy()
            for col in export_df.select_dtypes(include=["number"]).columns:
                export_df[col] = export_df[col].round(1)

            buf = io.BytesIO()
            with pd.ExcelWriter(buf, engine="openpyxl") as writer:
                export_df.to_excel(writer, index=False, sheet_name="Dashboard Data")

            state["excel_file"] = base64.b64encode(buf.getvalue()).decode("utf-8")
            state["filename"]   = "Scenario_Template.xlsx" if is_scenario else "Detailed_View_Data.xlsx"
            state["status"]     = "success"
            logger.info("Excel exported", extra={"rows": len(export_df), "is_scenario": is_scenario})

        # ── upload_scenario_excel ─────────────────────────────────────────────
        elif action == "upload_scenario_excel":
            import base64
            import io

            excel_b64 = state.get("excel_file")
            if not excel_b64:
                raise ValueError("No excel_file provided in request payload")

            upload_df = pd.read_excel(io.BytesIO(base64.b64decode(excel_b64)))

            required = ["Distributor", "ZREP", "year", "period"]
            for col in required:
                if col not in upload_df.columns:
                    raise ValueError(f"Missing required column in uploaded file: {col}")

            overrides: Dict[str, Any] = {}
            for _, row in upload_df.iterrows():
                row_id = f"{row['Distributor']}_{row['ZREP']}_{row['year']}_{row['period']}"
                mods: Dict[str, float] = {}
                if "Sell_In_Forecast_Qty_Proposed" in upload_df.columns:
                    mods["Sell_In_Forecast_Qty_Proposed"] = float(row["Sell_In_Forecast_Qty_Proposed"])
                if "In_transit_Proposed" in upload_df.columns:
                    mods["In_transit_Proposed"] = float(row["In_transit_Proposed"])
                if mods:
                    overrides[row_id] = mods

            state["uploaded_overrides"] = overrides
            state["status"]             = "success"
            logger.info("Excel upload parsed", extra={"overrides": len(overrides)})

        # ── get_accuracy_comparison ───────────────────────────────────────────
        elif action == "get_accuracy_comparison":
            import numpy as np

            df_acc = df[
                (df["period_val"] >= ACCURACY_MIN_PERIOD)
                & (df["period_val"] <= ACCURACY_MAX_PERIOD)
            ].copy()

            so_actuals_col = _resolve_so_actuals_col(df_acc)
            if so_actuals_col in df_acc.columns:
                df_acc = df_acc[df_acc[so_actuals_col].notna() & (df_acc[so_actuals_col] > 0)]

            if df_acc.empty:
                state["accuracy_data"] = {
                    "kpis": {}, "by_period": [], "by_distributor": [],
                    "by_category": [], "by_period_distributor": [], "periods": [], "detail": [],
                }
                state["status"] = "success"
                logger.info("Accuracy: no closed periods found")
                return state

            def calc_metrics(sub: pd.DataFrame) -> dict:
                """
                Compute wMAPE, bias, and accuracy for a subset of rows.

                Args:
                    sub: DataFrame subset with Sell_Out_forecast_Qty and
                         sell-out actuals column present.

                Returns:
                    Dict with keys: forecast, actual, accuracy, bias, mape.
                """
                fc      = sub["Sell_Out_forecast_Qty"].values.astype(float)
                act     = sub[so_actuals_col].values.astype(float)
                tot_fc  = float(np.sum(fc))
                tot_act = float(np.sum(act))
                # wMAPE: sum(|fc - act|) / sum(act) — volume-weighted, robust to low-volume SKUs
                wmape   = float(np.sum(np.abs(fc - act)) / max(tot_act, 1.0) * 100)
                bias    = float((tot_fc - tot_act) / max(tot_act, 1.0) * 100)
                acc     = float(max(0.0, 100.0 - wmape))
                return {
                    "forecast": round(tot_fc, 1),
                    "actual":   round(tot_act, 1),
                    "accuracy": round(acc, 1),
                    "bias":     round(bias, 1),
                    "mape":     round(wmape, 1),
                }

            overall = calc_metrics(df_acc)

            by_period = []
            for pval in sorted(df_acc["period_val"].unique()):
                sub  = df_acc[df_acc["period_val"] == pval]
                m    = calc_metrics(sub)
                m["period"]     = sub["Rolling_Period"].mode().iloc[0] if not sub.empty else f"P{pval:+d}"
                m["period_val"] = int(pval)
                by_period.append(m)

            periods = [p["period"] for p in by_period]

            by_dist = []
            for dist in sorted(df_acc["Distributor"].unique()):
                m = calc_metrics(df_acc[df_acc["Distributor"] == dist])
                m["distributor"] = dist
                by_dist.append(m)
            by_dist.sort(key=lambda x: -x["accuracy"])

            by_cat = []
            for cat in sorted(df_acc["category"].unique()):
                m = calc_metrics(df_acc[df_acc["category"] == cat])
                m["category"] = cat
                by_cat.append(m)
            by_cat.sort(key=lambda x: -x["accuracy"])

            heatmap = []
            for dist in sorted(df_acc["Distributor"].unique()):
                row: Dict[str, Any] = {"distributor": dist}
                for p_info in by_period:
                    rp  = p_info["period"]
                    pv  = p_info["period_val"]
                    sub = df_acc[(df_acc["Distributor"] == dist) & (df_acc["period_val"] == pv)]
                    if not sub.empty:
                        m = calc_metrics(sub)
                        row[rp]               = m["accuracy"]
                        row[f"{rp}_bias"]     = m["bias"]
                        row[f"{rp}_forecast"] = m["forecast"]
                        row[f"{rp}_actual"]   = m["actual"]
                    else:
                        row[rp] = None
                heatmap.append(row)

            detail = []
            for keys, sub in df_acc.groupby(["Distributor", "ZREP", "period_val"]):
                dist, zrep, pv = keys
                p_info = next((p for p in by_period if p["period_val"] == pv), {})
                m = calc_metrics(sub)
                m.update({
                    "distributor": dist,
                    "zrep":        zrep,
                    "period":      p_info.get("period", f"P{pv:+d}"),
                    "period_val":  int(pv),
                    "category":    sub["category"].iloc[0] if "category" in sub.columns else "",
                })
                detail.append(m)
            detail.sort(key=lambda x: (x["distributor"], x["zrep"], x["period_val"]))

            state["accuracy_data"] = {
                "kpis": {
                    "overall_accuracy":  overall["accuracy"],
                    "overall_bias":      overall["bias"],
                    "overall_mape":      overall["mape"],
                    "total_forecast":    overall["forecast"],
                    "total_actual":      overall["actual"],
                    "best_distributor":  by_dist[0]["distributor"]  if by_dist else "N/A",
                    "worst_distributor": by_dist[-1]["distributor"] if by_dist else "N/A",
                    "periods_analyzed":  periods,
                },
                "by_period":             by_period,
                "by_distributor":        by_dist,
                "by_category":           by_cat,
                "by_period_distributor": heatmap,
                "periods":               periods,
                "detail":                detail[:1000],
            }
            state["status"] = "success"
            logger.info("Accuracy comparison built", extra={"periods": periods})

    except Exception as exc:
        logger.error("Data request failed", extra={"action": action, "error": str(exc)})
        state["error"]  = str(exc)
        state["status"] = "failed"

    return state
