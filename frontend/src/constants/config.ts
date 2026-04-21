/**
 * Application configuration constants.
 *
 * All environment-specific values (API URL, feature flags, etc.) live here.
 * Never hardcode these values directly in component or service files.
 */

/** Base URL for the FastAPI backend. Reads from VITE_API_BASE env var in production. */
export const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8001/api';

/** Number of rows displayed per page in paginated tables. */
export const ROWS_PER_PAGE = 100;

/** Brand name shown in the top bar. */
export const APP_BRAND  = 'CCA';
export const APP_TITLE  = 'DRP Dashboard';
export const APP_SUBTITLE = 'Demand & Replenishment';
