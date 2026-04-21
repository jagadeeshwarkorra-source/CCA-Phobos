/**
 * Period threshold constants — mirrors the values in backend/src/config.py.
 *
 * All period_val comparisons in chart and table components must reference
 * these constants instead of hardcoded integers.
 */

/** Earliest period shown in the rolling chart (P-3). */
export const CHART_MIN_PERIOD = -3;

/** Latest period shown in the rolling chart (P+12). */
export const CHART_MAX_PERIOD = 12;

/** P+0 onward is "future" (uses forecast values). */
export const FUTURE_PERIOD_START = 0;

/** Bridge chart actuals window: P-3 to P-1. */
export const BRIDGE_ACTUALS_MIN  = -3;
export const BRIDGE_ACTUALS_MAX  = -1;

/** Bridge chart forecast window: P+0 to P+2. */
export const BRIDGE_FORECAST_MIN = 0;
export const BRIDGE_FORECAST_MAX = 2;

/** Scenario Builder: locked periods that cannot be edited. */
export const LOCKED_PERIOD_MAX = 2;

/** KPI forward horizon: P+0 to P+12. */
export const KPI_HORIZON_MIN = 0;
export const KPI_HORIZON_MAX = 12;
