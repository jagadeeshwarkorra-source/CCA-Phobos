/**
 * Thin re-export shim for backwards compatibility.
 *
 * New code should import directly from '../services/dashboardService'.
 * This file keeps existing imports working during the transition.
 */

export { executeGraph } from './services/dashboardService';
export type { FilterPayload } from './types';
