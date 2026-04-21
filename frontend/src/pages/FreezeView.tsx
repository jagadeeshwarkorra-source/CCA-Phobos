import { useEffect, useState, useCallback, useMemo } from 'react';
import { executeGraph } from '../api';
import { useAppContext } from '../context/AppContext';
import { RefreshCw, CheckCircle, Trash2, ClipboardList, AlertTriangle } from 'lucide-react';

/* ── helpers ──────────────────────────────────────────────────────────────── */
const fmt1 = (v: any) => (v == null || isNaN(Number(v)) ? '—' : Number(v).toFixed(1));

const rowKey = (r: any) => `${r.Distributor}_${r.ZREP}_${r.year}_${r.period}`;


/* ── component ────────────────────────────────────────────────────────────── */
const FreezeView = () => {
  const { state } = useAppContext();

  const [scenarios,        setScenarios]        = useState<any[]>([]);
  const [loading,          setLoading]          = useState(false);
  const [processing,       setProcessing]       = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<any | null>(null);

  // full actual-data rows (fetched when a scenario is selected)
  const [detailRows,   setDetailRows]   = useState<any[]>([]);
  const [loadingDetail,setLoadingDetail]= useState(false);

  // local editable overrides: rowKey → current + stored baseline (for delta calc)
  const [edits, setEdits] = useState<Record<string, {
    si: number; it: number;               // current (possibly lead-edited) values
    storedSi: number; storedIt: number;   // what the planner originally saved
    storedEndInv: number;                 // planner's cascaded end-inv (baseline)
  }>>({});

  /* ── fetch scenario list ─────────────────────────────────────────────── */
  const fetchScenarios = useCallback(async () => {
    setLoading(true);
    try {
      const res = await executeGraph('get_scenarios');
      if (res.status === 'success') setScenarios(res.scenarios || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (state.persona === 'Demand Lead') fetchScenarios();
  }, [state.persona, fetchScenarios]);

  /* ── when a scenario is selected, load full detail data ─────────────── */
  useEffect(() => {
    if (!selectedScenario) { setDetailRows([]); setEdits({}); return; }

    const loadDetail = async () => {
      setLoadingDetail(true);
      try {
        const res = await executeGraph('get_scenario_details', { filters: state.filters });
        if (res.status === 'success' && res.data) {
          const standardized = res.data.map((r: any) => ({
            ...r,
            Distributor:          r.Distributor    || r.distributor    || '',
            ZREP:                 r.ZREP           || r.zrep           || 'Unknown',
            Rolling_Period:       r.Rolling_Period || r.rolling_period || `P${r.period}`,
            In_transit:           r.In_transit     || r.in_transit     || 0,
            Sell_In_Actuals_Qty:  r.Sell_In_Actuals_Qty  || r.sell_in_actuals_qty  || 0,
            Sell_In_Forecast_Qty: r.Sell_In_Forecast_Qty || r.sell_in_forecast_qty || 0,
          }));
          setDetailRows(standardized);

          // initialise edits from the saved scenario modifications
          const init: Record<string, any> = {};
          selectedScenario.modifications.forEach((mod: any) => {
            const key      = `${mod.Distributor}_${mod.ZREP}_${mod.year}_${mod.period}`;
            const storedSi = mod.modifications?.Sell_In_Forecast_Qty_Proposed ?? 0;
            const storedIt = mod.modifications?.In_transit_Proposed           ?? 0;
            const storedEndInv = mod.modifications?.Ending_inventory_Proposed ?? 0;
            init[key] = { si: storedSi, it: storedIt, storedSi, storedIt, storedEndInv };
          });
          setEdits(init);
        }
      } catch (e) { console.error(e); }
      finally { setLoadingDetail(false); }
    };

    loadDetail();
  }, [selectedScenario?.id]);          // re-run only when the selected scenario changes

  /* ── build merged rows (only rows that appear in the scenario mods) ── */
  const mergedRows = useMemo(() => {
    if (!selectedScenario || detailRows.length === 0) return [];
    const modKeys = new Set(
      selectedScenario.modifications.map((m: any) =>
        `${m.Distributor}_${m.ZREP}_${m.year}_${m.period}`
      )
    );
    return detailRows.filter(r => modKeys.has(rowKey(r)));
  }, [selectedScenario, detailRows]);

  /**
   * Keys for rows the planner actually changed (vs. rows included only for
   * cascade completeness). Falls back to all keys for old-format scenarios
   * that don't carry the is_planner_modified flag.
   */
  const plannerModifiedKeys = useMemo(() => {
    if (!selectedScenario) return new Set<string>();
    const mods: any[] = selectedScenario.modifications ?? [];
    // Old scenarios don't have is_planner_modified → treat all rows as modified
    const hasFlag = mods.some((m: any) => m.is_planner_modified !== undefined);
    return new Set(
      mods
        .filter((m: any) => !hasFlag || m.is_planner_modified)
        .map((m: any) => `${m.Distributor}_${m.ZREP}_${m.year}_${m.period}`)
    );
  }, [selectedScenario]);

  /**
   * cascadeResults — walk ALL detailRows grouped by Dist/ZREP in period order.
   * For each group, carry `prevEndInv` forward so that every downstream row's
   * Beginning Inventory (P) = prior period's Ending Inventory (P).
   * Modified rows use the lead's editable SI / IT; unmodified rows use actuals.
   * Stores { begInvP, endInvP } for every row key (modified or not).
   */
  const cascadeResults = useMemo(() => {
    if (!selectedScenario || detailRows.length === 0) return {} as Record<string, { begInvP: number; endInvP: number }>;

    const modKeys = new Set(
      selectedScenario.modifications.map((m: any) =>
        `${m.Distributor}_${m.ZREP}_${m.year}_${m.period}`
      )
    );

    // Only cascade groups (Distributor+ZREP) that appear in scenario modifications.
    // This avoids walking all 19K+ rows when only a handful of products are modified.
    const affectedGroups = new Set(
      selectedScenario.modifications.map((m: any) => `${m.Distributor}_${m.ZREP}`)
    );

    const groups: Record<string, any[]> = {};
    for (const row of detailRows) {
      const gk = `${row.Distributor}_${row.ZREP}`;
      if (affectedGroups.has(gk)) (groups[gk] ??= []).push(row);  // skip irrelevant products
    }

    const results: Record<string, { begInvP: number; endInvP: number }> = {};

    for (const groupRows of Object.values(groups)) {
      // Sort ascending by year then period
      const sorted = [...groupRows].sort((a, b) =>
        a.year !== b.year ? a.year - b.year : a.period - b.period
      );

      let prevEndInv: number | null = null;

      for (const row of sorted) {
        const key        = rowKey(row);
        const isModified = modKeys.has(key);

        // Beg Inv: first row uses the stored actual; subsequent rows cascade from prev period
        const begInvP: number = prevEndInv !== null ? prevEndInv : (row.Beginning_inventory ?? 0);

        // SI / IT: lead-edited values for modified rows, actuals for all others
        const si      = (isModified && edits[key]) ? edits[key].si : (row.Sell_In_Forecast_Qty ?? 0);
        const it      = (isModified && edits[key]) ? edits[key].it : (row.In_transit          ?? 0);
        const sellOut = row.Sell_Out_forecast_Qty ?? 0;

        const endInvP: number = begInvP + si - sellOut + it;

        results[key] = { begInvP, endInvP };
        prevEndInv   = endInvP;
      }
    }

    return results;
  }, [detailRows, selectedScenario, edits]);

  /* ── approve ─────────────────────────────────────────────────────────── */
  const handleApprove = async () => {
    if (!selectedScenario) return;
    setProcessing(true);
    try {
      // build final modifications using lead's (possibly edited) proposed values
      // End Inv uses the fully-cascaded value from cascadeResults
      const finalMods = selectedScenario.modifications.map((mod: any) => {
        const key    = `${mod.Distributor}_${mod.ZREP}_${mod.year}_${mod.period}`;
        const edit   = edits[key];
        const si     = edit?.si ?? mod.modifications?.Sell_In_Forecast_Qty_Proposed ?? 0;
        const it     = edit?.it ?? mod.modifications?.In_transit_Proposed           ?? 0;
        const endInv = cascadeResults[key]?.endInvP ?? mod.modifications?.Ending_inventory_Proposed ?? 0;
        return {
          Distributor: mod.Distributor,
          ZREP:        mod.ZREP,
          year:        mod.year,
          period:      mod.period,
          modifications: {
            Sell_In_Forecast_Qty_Proposed: si,
            In_transit_Proposed:           it,
            Ending_inventory_Proposed:     endInv,
          },
        };
      });

      const res = await executeGraph('approve_scenario', {
        modifications: finalMods,
        scenario_id:   selectedScenario.id,
      });
      if (res.status === 'success') {
        alert('Scenario approved and data updated.');
        fetchScenarios();
        setSelectedScenario(null);
      } else { alert(res.error); }
    } catch (e) { console.error(e); }
    finally { setProcessing(false); }
  };

  /* ── reset all ───────────────────────────────────────────────────────── */
  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to reset and delete ALL scenarios?')) return;
    setProcessing(true);
    try {
      const res = await executeGraph('reset_scenarios');
      if (res.status === 'success') { fetchScenarios(); setSelectedScenario(null); }
    } catch (e) { console.error(e); }
    finally { setProcessing(false); }
  };

  /* ── handle cell edit ────────────────────────────────────────────────── */
  const handleEdit = useCallback((key: string, field: 'si' | 'it', raw: string) => {
    const num = raw === '' ? 0 : parseFloat(raw);
    setEdits(prev => {
      const cur = prev[key] || { si: 0, it: 0, storedSi: 0, storedIt: 0, storedEndInv: 0 };
      return { ...prev, [key]: { ...cur, [field]: isNaN(num) ? 0 : num } };
    });
  }, []);

  /* ── access guard ────────────────────────────────────────────────────── */
  if (state.persona !== 'Demand Lead') {
    return (
      <div className="p-10 text-center text-gray-500 bg-white rounded-lg shadow border border-mars-blue-light">
        <CheckCircle size={48} className="mx-auto mb-4 text-gray-300" />
        <p className="text-xl font-semibold">Access Denied</p>
        <p className="text-sm mt-1">Scenario Confirmation is available to Demand Lead only.</p>
      </div>
    );
  }

  /* ── render ──────────────────────────────────────────────────────────── */
  return (
    <div className="flex h-[calc(100vh-160px)] gap-5">

      {/* ── Left Sidebar: Scenario List ─────────────────────────────────── */}
      <div className="w-72 shrink-0 rounded-lg shadow overflow-hidden border border-mars-blue-light flex flex-col">
        <div className="mars-section-header flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList size={16} />
            <span>Pending Scenarios</span>
            {scenarios.length > 0 && (
              <span className="bg-mars-orange text-white text-xs font-bold rounded-full px-2 py-0.5 ml-1">
                {scenarios.length}
              </span>
            )}
          </div>
          <button
            onClick={fetchScenarios}
            className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/20 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-mars-blue-pale">
          {loading ? (
            <div className="flex justify-center items-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-4 border-mars-blue-light border-t-mars-navy" />
            </div>
          ) : scenarios.length === 0 ? (
            <div className="text-center text-gray-400 py-14">
              <ClipboardList size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No pending scenarios</p>
            </div>
          ) : (
            scenarios.map((scen) => (
              <div
                key={scen.id}
                onClick={() => setSelectedScenario(scen)}
                className={`p-3.5 bg-white border rounded-md cursor-pointer transition-all ${
                  selectedScenario?.id === scen.id
                    ? 'border-mars-navy shadow-md ring-1 ring-mars-navy'
                    : 'border-mars-blue-light hover:border-mars-blue hover:shadow-sm'
                }`}
              >
                <div className="flex justify-between items-start mb-1.5">
                  <h3 className="font-bold text-mars-navy text-sm">{scen.name || 'Untitled'}</h3>
                  <span className="text-[10px] bg-mars-gold-light text-mars-navy font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {scen.status}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-1 leading-snug">
                  <span className="font-semibold text-gray-600">Reason:</span> {scen.reason}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs font-semibold text-mars-blue">
                    {scen.modifications.filter((m: any) => m.is_planner_modified !== false).length} row(s) modified
                  </span>
                  <span className="text-[10px] text-gray-300 font-mono">{scen.id.slice(0, 8)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-3 bg-white border-t border-mars-blue-light">
          <button
            onClick={handleReset}
            disabled={processing || scenarios.length === 0}
            className="w-full flex justify-center items-center gap-2 px-4 py-2 text-red-600 font-semibold text-sm hover:bg-red-50 border border-red-200 rounded-md disabled:opacity-40 transition-colors"
          >
            <Trash2 size={15} /> Reset All Scenarios
          </button>
        </div>
      </div>

      {/* ── Right Panel: Scenario Detail ────────────────────────────────── */}
      <div className="flex-1 min-w-0 rounded-lg shadow overflow-hidden border border-mars-blue-light flex flex-col">

        {selectedScenario ? (
          <>
            {/* Header */}
            <div className="mars-section-header flex items-center justify-between shrink-0">
              <div className="flex flex-col leading-tight">
                <span className="font-bold text-base">{selectedScenario.name}</span>
                <span className="text-white/70 text-xs font-normal mt-0.5">
                  Reason: <span className="text-white font-semibold">{selectedScenario.reason}</span>
                  <span className="ml-3 opacity-60">· {plannerModifiedKeys.size} modified · {selectedScenario.modifications.length} total</span>
                </span>
              </div>
              <button
                onClick={handleApprove}
                disabled={processing || loadingDetail || mergedRows.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-white text-mars-navy text-sm font-bold rounded hover:bg-mars-blue-light transition-colors disabled:opacity-50"
              >
                <CheckCircle size={15} />
                {processing ? 'Approving…' : 'Approve & Apply'}
              </button>
            </div>

            {/* Info strip */}
            <div className="mars-info-strip-amber shrink-0">
              <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
              <span>
                Review the proposed numbers below.{' '}
                <span className="bg-yellow-200 text-yellow-900 rounded px-1 font-semibold">Gold rows</span>{' '}
                were changed by the planner — all future periods are shown for full cascade visibility.
                You may adjust <strong>Sell-In (P)</strong> and <strong>In-Transit (P)</strong> for any period — End Inv recalculates automatically.
              </span>
            </div>

            {/* Table */}
            {loadingDetail ? (
              <div className="flex-1 flex items-center justify-center bg-white">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-mars-blue-light border-t-mars-navy" />
              </div>
            ) : (
              <div className="flex-1 overflow-auto bg-white">
                <table className="min-w-full table-fixed text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="mars-th-group" colSpan={4}>Identifiers</th>
                      <th className="mars-th-group border-l border-white/10" colSpan={3}>Read-Only Actuals</th>
                      <th className="mars-th-group border-l border-white/10" colSpan={2} style={{ background: '#3060A8' }}>Sell-In</th>
                      <th className="mars-th-group border-l border-white/10" colSpan={2} style={{ background: '#6B3EA0' }}>In-Transit</th>
                      <th className="mars-th-group border-l border-white/10" colSpan={4} style={{ background: '#1a4480' }}>Inventory</th>
                    </tr>
                    <tr>
                      <th className="mars-th w-16" title="Distributor">Dist</th>
                      <th className="mars-th w-20" title="Product (ZREP)">ZREP</th>
                      <th className="mars-th w-20" title="Year-Period">Period</th>
                      <th className="mars-th w-20" style={{ background: '#1a4480' }}>Rolling</th>
                      <th className="mars-th-right w-20" title="Beginning Inventory">Beg Inv</th>
                      <th className="mars-th-right w-20" title="Sell-Out Forecast">Sell Out</th>
                      <th className="mars-th-right w-20" title="Sell-In Actuals (sell_in_actuals_qty — read-only)" style={{ background: '#5B6D8A' }}>Sell In (A)</th>
                      <th className="mars-th-right w-24" title="Sell-In Forecast Proposed (editable)" style={{ background: '#3060A8' }}>Sell In (P)</th>
                      <th className="mars-th-right w-20" title="In-Transit Actual (read-only)" style={{ background: '#6B3EA0' }}>In Tr (A)</th>
                      <th className="mars-th-right w-24" title="In-Transit Proposed (editable)" style={{ background: '#8B4FBF' }}>In Tr (P)</th>
                      <th className="mars-th-right w-20" title="Days on Hand = (End Inv / Sell Out) × 28" style={{ background: '#2DC274' }}>DOH</th>
                      <th className="mars-th-right w-20" title="Weeks on Hand Required" style={{ background: '#C0721A' }}>WoH Req</th>
                      <th className="mars-th-right w-20" title="Original Ending Inventory">End Inv</th>
                      <th className="mars-th-right w-24" title="Proposed Ending Inventory (auto-cascaded)" style={{ background: '#3060A8' }}>End Inv (P)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mars-blue-light">
                    {mergedRows.length === 0 ? (
                      <tr>
                        <td colSpan={14} className="px-6 py-12 text-center text-gray-400">
                          No matching data rows found for this scenario.
                        </td>
                      </tr>
                    ) : (
                      mergedRows.map((row, idx) => {
                        const key        = rowKey(row);
                        const edit       = edits[key];
                        const siVal      = edit?.si ?? row.Sell_In_Forecast_Qty ?? 0;
                        const itVal      = edit?.it ?? row.In_transit           ?? 0;
                        const cascade    = cascadeResults[key];
                        const begInvP    = cascade?.begInvP ?? row.Beginning_inventory ?? 0;
                        const endInvP    = cascade?.endInvP ?? row.Ending_inventory    ?? 0;
                        const isBelowWoH = endInvP < (row.WoH_Inventory_Required ?? 0);
                        const isModified = plannerModifiedKeys.has(key);

                        return (
                          <tr
                            key={key}
                            className={
                              isModified
                                ? 'bg-mars-gold-light'
                                : idx % 2 === 0 ? 'bg-white hover:bg-mars-blue-pale' : 'bg-mars-blue-pale/40 hover:bg-mars-blue-pale'
                            }
                          >
                            {/* Identity */}
                            <td className="px-2 py-2 font-semibold text-mars-navy border-r border-mars-blue-light">{row.Distributor}</td>
                            <td className="px-2 py-2 text-gray-700 text-xs border-r border-mars-blue-light">{row.ZREP}</td>
                            <td className="px-2 py-2 text-gray-500 border-r border-mars-blue-light">{row.year}-P{row.period}</td>
                            <td className="px-2 py-2 font-bold border-r border-mars-blue-light text-mars-blue">
                              {row.Rolling_Period}
                            </td>

                            {/* Actuals (read-only) – Beg Inv shows cascaded proposed when it differs */}
                            <td className={`px-2 py-2 text-right font-medium border-r border-mars-blue-light ${Math.abs(begInvP - (row.Beginning_inventory ?? 0)) > 0.05 ? 'text-blue-700 bg-blue-50' : 'text-mars-navy'}`}>
                              {fmt1(begInvP)}
                            </td>
                            <td className="px-2 py-2 text-right text-gray-600 border-r border-mars-blue-light">{fmt1(row.Sell_Out_forecast_Qty)}</td>
                            <td className="px-2 py-2 text-right text-gray-400 bg-mars-blue-pale/40 border-r border-mars-blue-light">{fmt1(row.Sell_In_Actuals_Qty)}</td>

                            {/* Proposed Sell-In (editable) */}
                            <td className="px-1 py-1 border-r border-blue-200 bg-blue-50">
                              <input
                                type="number"
                                disabled={processing}
                                value={siVal}
                                onChange={e => handleEdit(key, 'si', e.target.value)}
                                className="w-full px-1 py-0.5 border rounded text-right focus:outline-none font-semibold text-sm border-mars-blue bg-white text-mars-navy focus:ring-1 focus:ring-mars-navy"
                              />
                            </td>

                            {/* Actual In-Transit (read-only) */}
                            <td className="px-2 py-2 text-right border-r border-purple-200 bg-purple-50/30" style={{ color: '#9B59B6' }}>{fmt1(row.In_transit)}</td>

                            {/* Proposed In-Transit (editable) */}
                            <td className="px-1 py-1 border-r border-purple-200 bg-purple-50">
                              <input
                                type="number"
                                disabled={processing}
                                value={itVal}
                                onChange={e => handleEdit(key, 'it', e.target.value)}
                                className="w-full px-1 py-0.5 border rounded text-right focus:outline-none font-semibold text-sm border-purple-400 bg-white focus:ring-1 focus:ring-purple-600"
                                style={{ color: '#7B3FAF' }}
                              />
                            </td>

                            {/* DOH / WoH (read-only) */}
                            <td className="px-2 py-2 text-right font-medium border-r border-mars-blue-light" style={{ color: '#1A7A4A' }}>
                              {(row.Sell_Out_forecast_Qty ?? 0) > 0 ? ((endInvP / row.Sell_Out_forecast_Qty) * 28).toFixed(1) : '—'}
                            </td>
                            <td className="px-2 py-2 text-right font-medium border-r border-mars-blue-light" style={{ color: '#C0721A' }}>{fmt1(row.WoH_Inventory_Required)}</td>

                            {/* Original End Inv */}
                            <td className="px-2 py-2 text-right text-gray-500 border-r border-mars-blue-light">{fmt1(row.Ending_inventory)}</td>

                            {/* Proposed End Inv (blue or red if below WoH) */}
                            <td className={`px-2 py-2 text-right font-bold border-l-2 ${isBelowWoH ? 'bg-red-50 border-red-400 text-red-700' : 'bg-blue-50 border-mars-blue text-mars-blue'}`}>
                              {fmt1(endInvP)}
                              {isBelowWoH && <AlertTriangle size={11} className="inline ml-1 text-red-600" />}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-white text-gray-300">
            <CheckCircle size={72} className="mb-4 opacity-20" />
            <p className="text-xl font-bold text-gray-400">Select a scenario to review</p>
            <p className="mt-1 text-sm text-gray-300">Review modifications and approve changes to core data.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FreezeView;
