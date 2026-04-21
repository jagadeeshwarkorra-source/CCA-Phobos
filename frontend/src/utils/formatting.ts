/**
 * Shared number formatting utilities for the CCA DRP Dashboard.
 *
 * All formatting functions live here — never duplicate them in page components.
 * Import the function you need rather than re-implementing locally.
 */

/**
 * Format a large number with K/M suffix, optionally as currency (GSV).
 *
 * @param v     - Numeric value to format.
 * @param isGSV - When true, prepends '$' prefix.
 * @returns     Formatted string, e.g. "1.2M", "$34.5K", or "—" for nullish.
 *
 * @example
 * fmtBig(1_500_000, false) // "1.5M"
 * fmtBig(34_500, true)     // "$34.5K"
 * fmtBig(null)             // "—"
 */
export const fmtBig = (v: number | null | undefined, isGSV = false): string => {
  if (v == null || (v !== 0 && !v)) return '—';
  const prefix = isGSV ? '$' : '';
  const abs    = Math.abs(v);
  if (abs >= 1_000_000) return `${prefix}${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${prefix}${(v / 1_000).toFixed(1)}K`;
  return `${prefix}${v.toFixed(0)}`;
};

/**
 * Format a value as integer cases or dollar GSV with K/M suffix.
 *
 * Used in Detailed View tables where Cases uses locale formatting
 * and GSV uses currency notation.
 *
 * @param v     - Numeric value to format.
 * @param isGSV - When true, formats as currency; otherwise as integer.
 * @returns     Formatted string.
 *
 * @example
 * fmtVal(12345, false) // "12,345"
 * fmtVal(12345, true)  // "$12.3K"
 */
export const fmtVal = (v: number | null | undefined, isGSV: boolean): string => {
  const n = Number(v ?? 0);
  if (!isGSV) return n.toLocaleString('en-AU', { maximumFractionDigits: 0 });
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

/**
 * Format a decimal number to a fixed number of decimal places.
 *
 * @param v   - Numeric value to format.
 * @param dec - Number of decimal places (default 1).
 * @returns   Formatted string, or "—" for null/undefined.
 *
 * @example
 * fmt(95.567)     // "95.6"
 * fmt(95.567, 2)  // "95.57"
 * fmt(null)       // "—"
 */
export const fmt = (v: number | null | undefined, dec = 1): string =>
  v != null ? v.toFixed(dec) : '—';

/**
 * Format a percentage change with a leading '+' for positive values.
 *
 * @param v   - Percentage value (e.g. 12.5 for 12.5%).
 * @param dec - Decimal places (default 1).
 * @returns   String like "+12.5%" or "-3.2%".
 */
export const fmtPct = (v: number, dec = 1): string =>
  `${v >= 0 ? '+' : ''}${v.toFixed(dec)}%`;

/**
 * Compute Days on Hand (DOH) from ending inventory and sell-out.
 *
 * Formula: (endInv / sellOut) × 28
 *
 * @param endInv  - Ending inventory (cases).
 * @param sellOut - Sell-out volume (cases). Must be > 0 for a valid result.
 * @returns       DOH in days (1 decimal place), or '—' when sell-out is zero.
 */
export const calcDoh = (endInv: number, sellOut: number): string =>
  sellOut > 0 ? ((endInv / sellOut) * 28).toFixed(1) : '—';
