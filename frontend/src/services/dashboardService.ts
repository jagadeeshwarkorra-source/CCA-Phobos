/**
 * Dashboard API service layer.
 *
 * All API calls for the CCA DRP Dashboard funnel through this module.
 * Components should never call fetch() directly — import from here instead.
 *
 * This satisfies the engineering standard:
 *   "API calls must live inside services"
 *   "Avoid hard-coded API calls inside components"
 */

import { API_BASE } from '../constants/config';
import type { FilterPayload, FilterOptions, ByPeriodRow, ByDistributorRow, DetailRow, Scenario, ScenarioModification } from '../types';

// ── Generic executor ──────────────────────────────────────────────────────────

/**
 * Post an action payload to the backend graph endpoint.
 *
 * @param action  - Action identifier string (e.g. 'get_overview').
 * @param payload - Additional fields merged into the request body.
 * @returns       Parsed JSON response from the backend.
 * @throws        Error with message from backend detail or network failure.
 */
export const executeGraph = async (action: string, payload: Record<string, unknown> = {}): Promise<any> => {
  const response = await fetch(`${API_BASE}/execute`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action, ...payload }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || 'API request failed');
  }

  return response.json();
};

// ── Typed service methods ─────────────────────────────────────────────────────

/**
 * Fetch distinct values for every filter dropdown.
 *
 * @returns FilterOptions populated with sorted unique values per dimension.
 */
export const getFilterOptions = async (): Promise<FilterOptions> => {
  const result = await executeGraph('get_filter_options', {});
  if (result.status !== 'success') throw new Error(result.error || 'Failed to load filter options');
  return result.filter_options as FilterOptions;
};

/**
 * Fetch the overview aggregations (by-distributor + by-period).
 *
 * @param filters - Active filter selections.
 * @returns Object with by_distributor and by_period arrays.
 */
export const getOverview = async (filters: FilterPayload): Promise<{
  by_distributor: ByDistributorRow[];
  by_period:      ByPeriodRow[];
}> => {
  const result = await executeGraph('get_overview', { filters });
  if (result.status !== 'success') throw new Error(result.error || 'Failed to load overview');
  return result.overview_summary;
};

/**
 * Fetch flat row data for the Detailed View (P-15 → P+12).
 *
 * @param filters - Active filter selections.
 * @returns Array of DetailRow records.
 */
export const getDetails = async (filters: FilterPayload): Promise<DetailRow[]> => {
  const result = await executeGraph('get_details', { filters });
  if (result.status !== 'success') throw new Error(result.error || 'Failed to load details');
  return result.data as DetailRow[];
};

/**
 * Fetch flat row data for the Scenario Builder (P+0 → P+12).
 *
 * @param filters - Active filter selections.
 * @returns Array of DetailRow records scoped to current period forward.
 */
export const getScenarioDetails = async (filters: FilterPayload): Promise<DetailRow[]> => {
  const result = await executeGraph('get_scenario_details', { filters });
  if (result.status !== 'success') throw new Error(result.error || 'Failed to load scenario details');
  return result.data as DetailRow[];
};

/**
 * Export the current view data as a base64-encoded XLSX file.
 *
 * @param filters     - Active filter selections.
 * @param isScenario  - When true, exports scenario column set; otherwise detail columns.
 * @returns           Object with excel_file (base64 string) and filename.
 */
export const exportToExcel = async (
  filters: FilterPayload,
  isScenario: boolean
): Promise<{ excel_file: string; filename: string }> => {
  const result = await executeGraph('export_to_excel', { filters, is_scenario: isScenario });
  if (result.status !== 'success') throw new Error(result.error || 'Export failed');
  return { excel_file: result.excel_file, filename: result.filename };
};

/**
 * Upload an edited scenario XLSX and receive an override map.
 *
 * @param base64Excel - Base64-encoded XLSX file content.
 * @returns           Map of row_id → modification values.
 */
export const uploadScenarioExcel = async (
  base64Excel: string
): Promise<Record<string, { Sell_In_Forecast_Qty_Proposed?: number; In_transit_Proposed?: number }>> => {
  const result = await executeGraph('upload_scenario_excel', { excel_file: base64Excel });
  if (result.status !== 'success') throw new Error(result.error || 'Upload failed');
  return result.uploaded_overrides;
};

/**
 * Save a new scenario for Demand Lead review.
 *
 * @param name          - Scenario name entered by the planner.
 * @param reason        - Business justification.
 * @param modifications - Array of row-level edits.
 * @returns             The UUID assigned to the new scenario.
 */
export const saveScenario = async (
  name: string,
  reason: string,
  modifications: ScenarioModification[]
): Promise<string> => {
  const result = await executeGraph('save_scenario', { scenario_name: name, scenario_reason: reason, modifications });
  if (result.status !== 'success') throw new Error(result.error || 'Failed to save scenario');
  return result.scenario_id as string;
};

/**
 * Retrieve all pending scenarios for the Demand Lead Freeze View.
 *
 * @returns Array of Scenario records.
 */
export const getScenarios = async (): Promise<Scenario[]> => {
  const result = await executeGraph('get_scenarios', {});
  if (result.status !== 'success') throw new Error(result.error || 'Failed to load scenarios');
  return result.scenarios as Scenario[];
};

/**
 * Approve a scenario — applies modifications to the baseline and deletes the record.
 *
 * @param scenarioId    - UUID of the scenario to approve.
 * @param modifications - Full modifications list from the scenario record.
 */
export const approveScenario = async (
  scenarioId: string,
  modifications: ScenarioModification[]
): Promise<void> => {
  const result = await executeGraph('approve_scenario', { scenario_id: scenarioId, modifications });
  if (result.status !== 'success') throw new Error(result.error || 'Approval failed');
};

/**
 * Fetch accuracy comparison data (wMAPE / bias across P-3 → P-1).
 *
 * @param filters - Active filter selections.
 * @returns       Accuracy data object with kpis, by_period, by_distributor, etc.
 */
export const getAccuracyComparison = async (filters: FilterPayload): Promise<any> => {
  const result = await executeGraph('get_accuracy_comparison', { filters });
  if (result.status !== 'success') throw new Error(result.error || 'Failed to load accuracy data');
  return result.accuracy_data;
};
