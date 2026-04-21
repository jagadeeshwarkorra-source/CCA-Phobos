/**
 * Detailed View page — summary panels (by Distributor / Category) + paginated row table.
 *
 * Data fetched via dashboardService.getDetails().
 * Formatting delegated to utils/formatting.ts.
 * Colours from constants/colors.ts.
 * Config (rows per page) from constants/config.ts.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { FileDown, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';

import { useAppContext } from '../context/AppContext';
import { getDetails, exportToExcel } from '../services/dashboardService';
import { fmtVal, calcDoh } from '../utils/formatting';
import { TABLE_COLORS } from '../constants/colors';
import { ROWS_PER_PAGE } from '../constants/config';
import type { DetailRow } from '../types';

// ── Aggregation helper ────────────────────────────────────────────────────────
/**
 * Group rows by a key function and sum financial/inventory columns.
 *
 * rawSo and rawEnd are always kept in cases (not multiplied by price) so that
 * DOH can be computed from the ratio (price cancels in the division).
 *
 * @param rows   - Flat array of DetailRow records.
 * @param keyFn  - Function that returns the group key for a row.
 * @param isGSV  - When true, multiplies volume columns by row.price.
 * @returns      Array of aggregated group objects sorted by label.
 */
const aggByKey = (rows: DetailRow[], keyFn: (r: DetailRow) => string, isGSV: boolean) => {
  const map: Record<string, any> = {};
  rows.forEach(row => {
    const key = keyFn(row) || 'Unknown';
    const p   = isGSV ? (Number(row.price) || 0) : 1;
    if (!map[key]) map[key] = { label: key, beg: 0, si: 0, so: 0, it: 0, woh: 0, end: 0, rawSo: 0, rawEnd: 0 };
    map[key].beg   += Number(row.Beginning_inventory    || 0) * p;
    map[key].si    += Number(row.Sell_In_Forecast_Qty   || 0) * p;
    map[key].so    += Number(row.Sell_Out_forecast_Qty  || 0) * p;
    map[key].it    += Number(row.In_transit             || 0) * p;
    map[key].woh   += Number(row.WoH_Inventory_Required || 0) * p;
    map[key].end   += Number(row.Ending_inventory       || 0) * p;
    map[key].rawSo += Number(row.Sell_Out_forecast_Qty  || 0);  // cases for DOH
    map[key].rawEnd+= Number(row.Ending_inventory       || 0);  // cases for DOH
  });
  return Object.values(map).sort((a, b) => a.label.localeCompare(b.label));
};

// ── Summary table sub-component ───────────────────────────────────────────────
const SummaryTable = ({
  title, rows, groupKey, color, isGSV,
}: {
  title: string; rows: any[]; groupKey: string; color: string; isGSV: boolean;
}) => {
  const [open, setOpen] = useState(true);
  const f = (v: number) => fmtVal(v, isGSV);

  return (
    <div className="border border-mars-blue-light rounded-lg overflow-hidden shadow-sm">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2 text-white text-sm font-bold"
        style={{ background: color }}>
        <span>{title}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs font-normal opacity-75">{rows.length} group{rows.length !== 1 ? 's' : ''}</span>
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed text-xs">
            <thead>
              <tr style={{ background: color + '18' }}>
                <th className="px-3 py-2 text-left  font-bold text-mars-navy  border-r border-mars-blue-light w-32">{groupKey}</th>
                <th className="px-3 py-2 text-right font-bold text-gray-600   border-r border-mars-blue-light w-24">Beg. Inv</th>
                <th className="px-3 py-2 text-right font-bold text-gray-600   border-r border-mars-blue-light w-24">Sell In</th>
                <th className="px-3 py-2 text-right font-bold text-gray-600   border-r border-mars-blue-light w-24">Sell Out</th>
                <th className="px-3 py-2 text-right font-bold text-gray-600   border-r border-mars-blue-light w-24">In Transit</th>
                <th className="px-3 py-2 text-right font-bold border-r border-mars-blue-light w-24" style={{ color: TABLE_COLORS.dohCell }}>DOH (days)</th>
                <th className="px-3 py-2 text-right font-bold border-r border-mars-blue-light w-24" style={{ color: TABLE_COLORS.wohCell }}>WoH Req</th>
                <th className="px-3 py-2 text-right font-bold w-24"           style={{ color: TABLE_COLORS.endInvCell }}>End Inv</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mars-blue-light">
              {rows.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-mars-blue-pale/30'}>
                  <td className="px-3 py-1.5 font-semibold text-mars-navy border-r border-mars-blue-light truncate">{row.label}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600 border-r border-mars-blue-light">{f(row.beg)}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600 border-r border-mars-blue-light">{f(row.si)}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600 border-r border-mars-blue-light">{f(row.so)}</td>
                  <td className="px-3 py-1.5 text-right text-gray-600 border-r border-mars-blue-light">{f(row.it)}</td>
                  <td className="px-3 py-1.5 text-right font-medium  border-r border-mars-blue-light" style={{ color: TABLE_COLORS.dohCell }}>{calcDoh(row.rawEnd, row.rawSo)}</td>
                  <td className="px-3 py-1.5 text-right font-medium  border-r border-mars-blue-light" style={{ color: TABLE_COLORS.wohCell }}>{f(row.woh)}</td>
                  <td className="px-3 py-1.5 text-right font-bold"   style={{ color: TABLE_COLORS.endInvCell }}>{f(row.end)}</td>
                </tr>
              ))}
              {/* Grand total */}
              <tr className="border-t-2 border-mars-blue-light" style={{ background: color + '18' }}>
                <td className="px-3 py-1.5 font-bold text-mars-navy border-r border-mars-blue-light">TOTAL</td>
                <td className="px-3 py-1.5 text-right font-bold text-mars-navy border-r border-mars-blue-light">{f(rows.reduce((s, r) => s + r.beg, 0))}</td>
                <td className="px-3 py-1.5 text-right font-bold text-mars-navy border-r border-mars-blue-light">{f(rows.reduce((s, r) => s + r.si,  0))}</td>
                <td className="px-3 py-1.5 text-right font-bold text-mars-navy border-r border-mars-blue-light">{f(rows.reduce((s, r) => s + r.so,  0))}</td>
                <td className="px-3 py-1.5 text-right font-bold text-mars-navy border-r border-mars-blue-light">{f(rows.reduce((s, r) => s + r.it,  0))}</td>
                <td className="px-3 py-1.5 text-right font-bold border-r border-mars-blue-light" style={{ color: TABLE_COLORS.dohCell }}>
                  {calcDoh(rows.reduce((s, r) => s + r.rawEnd, 0), rows.reduce((s, r) => s + r.rawSo, 0))}
                </td>
                <td className="px-3 py-1.5 text-right font-bold border-r border-mars-blue-light" style={{ color: TABLE_COLORS.wohCell }}>{f(rows.reduce((s, r) => s + r.woh, 0))}</td>
                <td className="px-3 py-1.5 text-right font-bold"   style={{ color: TABLE_COLORS.endInvCell }}>{f(rows.reduce((s, r) => s + r.end, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── Page component ────────────────────────────────────────────────────────────
const DetailedView: React.FC = () => {
  const { state }  = useAppContext();
  const isGSV      = state.unit === 'GSV';

  const [data,        setData       ] = useState<DetailRow[]>([]);
  const [loading,     setLoading    ] = useState(false);
  const [exporting,   setExporting  ] = useState(false);
  const [error,       setError      ] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await getDetails(state.filters);
        if (cancelled) return;
        const standardized = rows.map(row => ({
          ...row,
          Distributor:    row.Distributor    || '',
          ZREP:           row.ZREP           || 'Unknown',
          Rolling_Period: row.Rolling_Period || `P${row.period}`,
        }));
        setData(standardized);
        setCurrentPage(1);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [state.filters]);

  const distSummary = useMemo(() => aggByKey(data, r => r.Distributor, isGSV),          [data, isGSV]);
  const catSummary  = useMemo(() => aggByKey(data, r => r.category || '', isGSV),        [data, isGSV]);

  const indexOfLastRow  = currentPage * ROWS_PER_PAGE;
  const indexOfFirstRow = indexOfLastRow - ROWS_PER_PAGE;
  const currentRows     = data.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages      = Math.ceil(data.length / ROWS_PER_PAGE);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const { excel_file, filename } = await exportToExcel(state.filters, false);
      const blob = await fetch(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excel_file}`).then(r => r.blob());
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = filename || 'Detailed_View_Data.xlsx';
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">

      {/* Summary panels */}
      {!loading && !error && data.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <SummaryTable title="Distributor Summary" rows={distSummary} groupKey="Distributor" color={TABLE_COLORS.distributor} isGSV={isGSV} />
          <SummaryTable title="Category Summary"    rows={catSummary}  groupKey="Category"    color={TABLE_COLORS.category}    isGSV={isGSV} />
        </div>
      )}

      {exportError && (
        <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">{exportError}</div>
      )}

      {/* Detail table */}
      <div className="rounded-lg shadow overflow-hidden border border-mars-blue-light">
        <div className="mars-section-header flex items-center justify-between">
          <span>Detailed View</span>
          <div className="flex items-center gap-3">
            {data.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-white/80">
                <span>{indexOfFirstRow + 1}–{Math.min(indexOfLastRow, data.length)} of {data.length}</span>
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                  className="p-0.5 rounded disabled:opacity-40 hover:bg-white/20 transition-colors">
                  <ChevronLeft size={16} />
                </button>
                <span className="font-semibold text-white">{currentPage}/{totalPages}</span>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                  className="p-0.5 rounded disabled:opacity-40 hover:bg-white/20 transition-colors">
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
            <button onClick={handleExport} disabled={exporting || data.length === 0}
              className="flex items-center gap-1.5 px-3 py-1 bg-white text-mars-navy text-xs font-bold rounded hover:bg-mars-blue-light transition-colors disabled:opacity-50">
              {exporting
                ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-mars-navy border-t-transparent" />
                : <FileDown size={14} />}
              Download Excel
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64 bg-white">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-mars-blue-light border-t-mars-navy" />
          </div>
        ) : error ? (
          <div className="p-4 bg-red-50 text-red-700 border-t border-red-200">{error}</div>
        ) : (
          <div className="overflow-x-auto h-[500px] bg-white">
            <table className="min-w-full table-fixed">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="mars-th-group border-r border-white/10" colSpan={6}>Identifiers</th>
                  <th className="mars-th-group border-r border-white/10" colSpan={4}>{isGSV ? 'GSV ($)' : 'Volumes (Cases)'}</th>
                  <th className="mars-th-group border-r border-white/10" colSpan={1} style={{ background: TABLE_COLORS.dohCell,    color: 'rgba(255,255,255,0.85)' }}>Cover</th>
                  <th className="mars-th-group border-r border-white/10" colSpan={1} style={{ background: TABLE_COLORS.wohCell,    color: 'rgba(255,255,255,0.85)' }}>Req</th>
                  <th className="mars-th-group"                           colSpan={1} style={{ background: TABLE_COLORS.endInvCell, color: 'rgba(255,255,255,0.85)' }}>Output</th>
                </tr>
                <tr>
                  <th className="mars-th  w-24" title="Distributor">Dist</th>
                  <th className="mars-th  w-24" title="Product (ZREP)">ZREP</th>
                  <th className="mars-th  w-20">Year</th>
                  <th className="mars-th  w-14">Per</th>
                  <th className="mars-th  w-20" style={{ background: '#1a4480' }}>Rolling</th>
                  <th className="mars-th  w-24" title="Category">Cat</th>
                  <th className="mars-th-right w-24" title="Beginning Inventory">Beg. Inv</th>
                  <th className="mars-th-right w-24" title="Sell-In Forecast Qty">Sell In</th>
                  <th className="mars-th-right w-24" title="Sell-Out Forecast Qty">Sell Out</th>
                  <th className="mars-th-right w-24" title="In-Transit Stock">In Transit</th>
                  <th className="mars-th-right w-24" title="Days on Hand = (End Inv / Sell Out) × 28" style={{ background: TABLE_COLORS.dohCell }}>DOH</th>
                  <th className="mars-th-right w-24" title="Weeks on Hand Required"                   style={{ background: TABLE_COLORS.wohCell }}>WoH Req</th>
                  <th className="mars-th-right w-24" title="Ending Inventory"                         style={{ background: TABLE_COLORS.endInvCell }}>End Inv</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mars-blue-light text-sm">
                {currentRows.map((row, idx) => {
                  const p   = isGSV ? (Number(row.price) || 0) : 1;
                  const gv  = (qty: number) => fmtVal(Number(qty || 0) * p, isGSV);
                  const so  = Number(row.Sell_Out_forecast_Qty || 0);
                  const end = Number(row.Ending_inventory       || 0);
                  return (
                    <tr key={idx}
                      className={idx % 2 === 0 ? 'bg-white hover:bg-mars-blue-pale' : 'bg-mars-blue-pale hover:bg-mars-blue-light/30'}>
                      <td className="px-3 py-2 font-semibold text-mars-navy border-r border-mars-blue-light">{row.Distributor}</td>
                      <td className="px-3 py-2 text-gray-700               border-r border-mars-blue-light">{row.ZREP}</td>
                      <td className="px-3 py-2 text-gray-500               border-r border-mars-blue-light">{row.year}</td>
                      <td className="px-3 py-2 text-gray-500               border-r border-mars-blue-light">{row.period}</td>
                      <td className="px-3 py-2 font-bold text-mars-blue    border-r border-mars-blue-light bg-mars-blue-pale/60">{row.Rolling_Period}</td>
                      <td className="px-3 py-2 text-gray-500               border-r border-mars-blue-light">{row.category}</td>
                      <td className="px-3 py-2 text-right text-gray-600    border-r border-mars-blue-light">{gv(row.Beginning_inventory)}</td>
                      <td className="px-3 py-2 text-right text-gray-600    border-r border-mars-blue-light">{gv(row.Sell_In_Forecast_Qty)}</td>
                      <td className="px-3 py-2 text-right text-gray-600    border-r border-mars-blue-light">{gv(row.Sell_Out_forecast_Qty)}</td>
                      <td className="px-3 py-2 text-right text-gray-600    border-r border-mars-blue-light">{gv(row.In_transit)}</td>
                      <td className="px-3 py-2 text-right font-semibold    border-r border-mars-blue-light" style={{ color: TABLE_COLORS.dohCell }}>
                        {calcDoh(end, so)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium      border-r border-mars-blue-light" style={{ color: TABLE_COLORS.wohCell }}>{gv(row.WoH_Inventory_Required)}</td>
                      <td className="px-3 py-2 text-right font-bold"       style={{ color: TABLE_COLORS.endInvCell }}>{gv(row.Ending_inventory)}</td>
                    </tr>
                  );
                })}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-6 py-12 text-center text-gray-400">No data available for the selected filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default DetailedView;
