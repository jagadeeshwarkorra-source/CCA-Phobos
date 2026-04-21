/**
 * Centralised type definitions for the CCA DRP Dashboard.
 *
 * All shared interfaces and type aliases live here.
 * Page-specific prop types may be co-located in their own files,
 * but any type used across two or more modules belongs here.
 */

// ── App-level ──────────────────────────────────────────────────────────────
export type Persona = 'Demand Planner' | 'Demand Lead';
export type Unit    = 'Cases' | 'GSV';

// ── Filter state ───────────────────────────────────────────────────────────
export interface FilterState {
  Distributor:   string[];
  ZREP:          string[];
  Year:          number[];
  Period:        number[];
  Category:      string[];
  Planner_group: string[];
}

export type FilterOptions = FilterState; // same shape — distinct type alias for clarity

// ── App context ────────────────────────────────────────────────────────────
export interface AppState {
  persona:       Persona;
  unit:          Unit;
  filters:       FilterState;
  filterOptions: FilterOptions;
}

export interface AppContextType {
  state:           AppState;
  setPersona:      (persona: Persona) => void;
  setUnit:         (unit: Unit) => void;
  setFilter:       (key: keyof FilterState, value: string[] | number[]) => void;
  setFilterOptions:(options: FilterOptions) => void;
  clearFilters:    () => void;
}

// ── API payload ────────────────────────────────────────────────────────────
export interface FilterPayload {
  Distributor?:   string[];
  ZREP?:          string[];
  Year?:          number[];
  Period?:        number[];
  Category?:      string[];
  Planner_group?: string[];
}

// ── Overview data ──────────────────────────────────────────────────────────
export interface ByPeriodRow {
  Rolling_Period:       string;
  year:                 number;
  period:               number;
  period_val:           number;
  sell_in_actuals:      number;
  sell_in_forecast:     number;
  sell_out_actuals_sum: number;
  sell_out_forecast:    number;
  ending_inventory_sum: number;
  in_transit_sum?:      number;
  doh?:                 number | null;
  gsv_sell_in_actuals:  number;
  gsv_sell_in_forecast: number;
  gsv_sell_out_actuals: number;
  gsv_sell_out_forecast:number;
}

export interface ByDistributorRow {
  Distributor:           string;
  ZREP:                  string;
  year:                  number;
  period:                number;
  Rolling_Period:        string;
  period_val:            number;
  sell_in_actuals:       number;
  sell_in_forecast:      number;
  sell_out_actuals:      number;
  sell_out_forecast:     number;
  gsv_sell_in_actuals:   number;
  gsv_sell_in_forecast:  number;
  gsv_sell_out_actuals:  number;
  gsv_sell_out_forecast: number;
}

// ── Chart data (derived from ByPeriodRow) ──────────────────────────────────
export interface ChartDataPoint {
  name:             string;
  period_val:       number;
  SellIn:           number;
  SellOut:          number;
  SellIn_PrevYear:  number;
  SellOut_PrevYear: number;
  InTransit?:       number;
  DOH?:             number | null;
}

// ── Detail row (flat CSV row with canonical names) ─────────────────────────
export interface DetailRow {
  Distributor:           string;
  ZREP:                  string;
  year:                  number;
  period:                number;
  Rolling_Period:        string;
  period_val:            number;
  category:              string;
  Planner_group:         string;
  Beginning_inventory:   number;
  Sell_In_Forecast_Qty:  number;
  Sell_In_Actuals_Qty:   number;
  Sell_Out_forecast_Qty: number;
  Sell_Out_Actuals_Qty:  number;
  In_transit:            number;
  WoH_Inventory_Required:number;
  Ending_inventory:      number;
  Target_inventory:      number;
  price:                 number;
  // Proposed columns (added by load_data)
  Sell_In_Forecast_Qty_Proposed: number;
  In_transit_Proposed:           number;
}

// ── Scenario ───────────────────────────────────────────────────────────────
export interface ScenarioModification {
  Distributor:   string;
  ZREP:          string;
  year:          number;
  period:        number;
  modifications: {
    Sell_In_Forecast_Qty_Proposed?: number;
    In_transit_Proposed?:           number;
  };
}

export interface Scenario {
  id:            string;
  name:          string;
  reason:        string;
  modifications: ScenarioModification[];
  status:        'pending' | 'approved';
}

// ── Accuracy ───────────────────────────────────────────────────────────────
export interface AccuracyMetrics {
  forecast: number;
  actual:   number;
  accuracy: number;
  bias:     number;
  mape:     number;
}

export interface AccuracyKpis {
  overall_accuracy:  number;
  overall_bias:      number;
  overall_mape:      number;
  total_forecast:    number;
  total_actual:      number;
  best_distributor:  string;
  worst_distributor: string;
  periods_analyzed:  string[];
}
