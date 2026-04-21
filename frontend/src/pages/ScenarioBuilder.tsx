import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { executeGraph } from '../api';
import { useAppContext } from '../context/AppContext';
import { Save, AlertTriangle, FileDown, UploadCloud, ChevronLeft, ChevronRight, RotateCcw, Filter } from 'lucide-react';

const ScenarioBuilder = () => {
  const { state } = useAppContext();
  const [data, setData]                   = useState<any[]>([]);
  const [manualOverrides, setManualOverrides] = useState<Record<string, any>>({});
  const [modifications, setModifications] = useState<Record<string, any>>({});
  const [loading, setLoading]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [name, setName]                   = useState("");
  const [reason, setReason]               = useState("");
  const [successMsg, setSuccessMsg]       = useState("");
  const [exporting, setExporting]         = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [bulkVal, setBulkVal]             = useState("");
  const [bulkType, setBulkType]           = useState<"percent" | "absolute">("percent");
  const [showWarning, setShowWarning]     = useState(false);
  const [showChangesOnly, setShowChangesOnly] = useState(false);
  const [currentPage, setCurrentPage]     = useState(1);
  const rowsPerPage = 100;

  // ── Performance: debounce the expensive cascade so typing feels instant ──
  // latestManualsRef always holds the most current overrides without closure staleness
  const cascadeTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestManualsRef = useRef<Record<string, any>>({});

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    setManualOverrides({});
    setModifications({});
    latestManualsRef.current = {};
    if (cascadeTimerRef.current) clearTimeout(cascadeTimerRef.current);
    try {
      const result = await executeGraph('get_scenario_details', { filters: state.filters });
      if (result.status === 'success' && result.data) {
        const standardized = result.data.map((row: any) => ({
          ...row,
          Distributor:          row.Distributor    || row.distributor    || "",
          ZREP:                 row.ZREP           || row.zrep           || row.Product || row.product || "Unknown",
          Rolling_Period:       row.Rolling_Period || row.rolling_period || `P${row.period}`,
          In_transit_Actual:    row.In_transit     || row.in_transit     || 0,
          Sell_In_Actuals_Qty:  row.Sell_In_Actuals_Qty  || row.sell_in_actuals_qty  || 0,
          Sell_In_Forecast_Qty: row.Sell_In_Forecast_Qty || row.sell_in_forecast_qty || 0,
        }));
        setData(standardized);
        setCurrentPage(1);
      } else {
        setError(result.error || 'Failed to load data');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [state.filters]);

  // Filtered view: when showChangesOnly, only show rows that have modifications
  const filteredData = useMemo(() => {
    if (!showChangesOnly) return data;
    return data.filter(row => {
      const rowId = `${row.Distributor}_${row.ZREP}_${row.year}_${row.period}`;
      return !!modifications[rowId];
    });
  }, [data, modifications, showChangesOnly]);

  const indexOfLastRow  = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows     = filteredData.slice(indexOfFirstRow, indexOfLastRow);
  const totalPages      = Math.ceil(filteredData.length / rowsPerPage);
  const paginate        = (n: number) => setCurrentPage(n);

  // ── Cascade / Optimization ───────────────────────────────────────────
  // Wrapped in useCallback so handleModification's dep array stays stable between renders
  const applyCascades = useCallback((currentManualMods: Record<string, any>) => {
    const newMods: Record<string, any> = {};
    const grouped: Record<string, any[]> = {};
    data.forEach(row => {
      const key = `${row.Distributor}_${row.ZREP}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    });

    for (const key in grouped) {
      const rows = grouped[key].sort((a, b) => a.period_val - b.period_val);

      // ── Skip groups with no manual overrides entirely ──
      // Without this guard, the cascade re-computes Ending/Beginning inventory
      // for every product from actuals, and any floating-point mismatch in the
      // raw data causes unmodified products to appear as "changed".
      const hasGroupOverride = rows.some(row => {
        const rowId = `${row.Distributor}_${row.ZREP}_${row.year}_${row.period}`;
        return !!currentManualMods[rowId];
      });
      if (!hasGroupOverride) continue;

      let prevEndInv = -1;
      let hasManualTrigger = false;

      for (const row of rows) {
        const rowId   = `${row.Distributor}_${row.ZREP}_${row.year}_${row.period}`;
        let rowMod: any = { ...row };

        rowMod.Beginning_inventory_Proposed = prevEndInv !== -1 ? prevEndInv : row.Beginning_inventory;
        const manual = currentManualMods[rowId];

        if (manual) {
          rowMod.Sell_In_Forecast_Qty_Proposed = typeof manual.Sell_In_Forecast_Qty_Proposed !== 'undefined'
            ? (hasManualTrigger = true, manual.Sell_In_Forecast_Qty_Proposed)
            : row.Sell_In_Forecast_Qty;
          rowMod.In_transit_Proposed = typeof manual.In_transit_Proposed !== 'undefined'
            ? (hasManualTrigger = true, manual.In_transit_Proposed)
            : row.In_transit;
        } else if (hasManualTrigger) {
          const flow = rowMod.Beginning_inventory_Proposed + row.In_transit - row.Sell_Out_forecast_Qty;
          rowMod.Sell_In_Forecast_Qty_Proposed = Math.max(0, row.WoH_Inventory_Required - flow);
          rowMod.In_transit_Proposed           = row.In_transit;
        } else {
          rowMod.Sell_In_Forecast_Qty_Proposed = row.Sell_In_Forecast_Qty;
          rowMod.In_transit_Proposed           = row.In_transit;
        }

        rowMod.Ending_inventory_Proposed = Number((
          rowMod.Beginning_inventory_Proposed +
          rowMod.Sell_In_Forecast_Qty_Proposed -
          row.Sell_Out_forecast_Qty +
          rowMod.In_transit_Proposed
        ).toFixed(1));

        const isDiff =
          Math.abs(rowMod.Sell_In_Forecast_Qty_Proposed   - row.Sell_In_Forecast_Qty)   > 0.01 ||
          Math.abs(rowMod.In_transit_Proposed             - row.In_transit)              > 0.01 ||
          Math.abs(rowMod.Ending_inventory_Proposed       - row.Ending_inventory)        > 0.01 ||
          Math.abs(rowMod.Beginning_inventory_Proposed    - row.Beginning_inventory)     > 0.01;

        if (isDiff || currentManualMods[rowId]) newMods[rowId] = rowMod;
        prevEndInv = rowMod.Ending_inventory_Proposed;
      }
    }
    return newMods;
  }, [data]);   // re-create only when base data changes (not on every render)

  const handleBulkApply = () => {
    if (!bulkVal || isNaN(Number(bulkVal)) || data.length === 0) return;
    const amount = Number(bulkVal);
    const updatedManuals = { ...latestManualsRef.current };
    data.forEach(row => {
      const rowId = `${row.Distributor}_${row.ZREP}_${row.year}_${row.period}`;
      const cur = latestManualsRef.current[rowId]?.Sell_In_Forecast_Qty_Proposed ?? row.Sell_In_Forecast_Qty;
      const next = bulkType === 'percent' ? cur * (1 + amount / 100) : cur + amount;
      if (!updatedManuals[rowId]) updatedManuals[rowId] = {};
      updatedManuals[rowId].Sell_In_Forecast_Qty_Proposed = Math.max(0, next);
    });
    latestManualsRef.current = updatedManuals;   // keep ref in sync
    setManualOverrides(updatedManuals);
    setModifications(applyCascades(updatedManuals));
  };

  const handleModification = useCallback((rowId: string, field: string, value: string) => {
    const numValue = value === "" ? 0 : parseFloat(value);
    const safeVal  = isNaN(numValue) ? 0 : numValue;

    // Build updated overrides from ref (avoids stale closures across rapid keystrokes)
    const updated = {
      ...latestManualsRef.current,
      [rowId]: { ...latestManualsRef.current[rowId], [field]: safeVal },
    };
    latestManualsRef.current = updated;

    // Update display immediately (single render, no cascade yet)
    setManualOverrides(updated);

    // Debounce the expensive O(n) cascade — fires 200ms after last keystroke
    if (cascadeTimerRef.current) clearTimeout(cascadeTimerRef.current);
    cascadeTimerRef.current = setTimeout(() => {
      setModifications(applyCascades(latestManualsRef.current));
    }, 200);
  }, [applyCascades]);

  const getDisplayValue = (rowId: string, field: string, originalValue: number) => {
    return modifications[rowId] && typeof modifications[rowId][field] !== 'undefined'
      ? modifications[rowId][field]
      : originalValue;
  };

  const triggerSave = async () => {
    if (!name.trim() || !reason.trim()) { alert("Please provide both a Scenario Name and Reason."); return; }

    // Find every Distributor+ZREP group that has at least one planner modification
    const affectedGroups = new Set<string>();
    Object.keys(modifications).forEach(rowId => {
      const row = data.find((d: any) => `${d.Distributor}_${d.ZREP}_${d.year}_${d.period}` === rowId);
      if (row) affectedGroups.add(`${row.Distributor}_${row.ZREP}`);
    });
    if (affectedGroups.size === 0) { alert("No modifications made."); return; }

    // Carry ALL future periods (period_val >= 0) for each affected group so that
    // the Demand Lead can see and edit the full horizon in Scenario Confirmation,
    // and downstream cascade is complete even if only one period was touched.
    const modsToSave = data
      .filter((row: any) =>
        affectedGroups.has(`${row.Distributor}_${row.ZREP}`) && row.period_val >= 0
      )
      .map((row: any) => {
        const rowId   = `${row.Distributor}_${row.ZREP}_${row.year}_${row.period}`;
        const modData = modifications[rowId];  // undefined for unmodified rows
        return {
          Distributor: row.Distributor,
          ZREP:        row.ZREP,
          year:        row.year,
          period:      row.period,
          // true  → planner explicitly changed this row (highlight for Lead)
          // false → included for cascade completeness only
          is_planner_modified: !!modData,
          modifications: {
            Sell_In_Forecast_Qty_Proposed: modData?.Sell_In_Forecast_Qty_Proposed  ?? row.Sell_In_Forecast_Qty,
            In_transit_Proposed:           modData?.In_transit_Proposed            ?? row.In_transit,
            Ending_inventory_Proposed:     modData?.Ending_inventory_Proposed      ?? row.Ending_inventory,
            Beginning_inventory_Proposed:  modData?.Beginning_inventory_Proposed   ?? row.Beginning_inventory,
          },
        };
      });

    if (modsToSave.length === 0) { alert("No modifications made."); return; }
    setSaving(true);
    try {
      const res = await executeGraph('save_scenario', { scenario_name: name, scenario_reason: reason, modifications: modsToSave });
      if (res.status === 'success') {
        setSuccessMsg(`Scenario '${name}' saved successfully. Demand Lead will review it.`);
        setModifications({}); setName(""); setReason(""); setBulkVal(""); setShowWarning(false);
        setTimeout(() => setSuccessMsg(""), 5000);
      } else { setError(res.error || 'Failed to save scenario'); }
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const handleSaveScenario = () => {
    let hasWarning = false;
    for (const [rowId, modData] of Object.entries(modifications) as [string, any][]) {
      const row = data.find(d => `${d.Distributor}_${d.ZREP}_${d.year}_${d.period}` === rowId);
      if (row) {
        const endInv = modData.Ending_inventory_Proposed ?? row.Ending_inventory;
        if (endInv < row.WoH_Inventory_Required) { hasWarning = true; break; }
      }
    }
    hasWarning ? setShowWarning(true) : triggerSave();
  };

  const handleExportTemplate = async () => {
    setExporting(true);
    try {
      const result = await executeGraph('export_to_excel', { filters: state.filters, is_scenario: true });
      if (result.status === 'success' && result.excel_file) {
        const blob = await fetch(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.excel_file}`).then(r => r.blob());
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = result.filename || "Scenario_Template.xlsx";
        document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url);
      } else { alert(result.error || "Export failed"); }
    } catch (err: any) { alert("Export error: " + err.message); } finally { setExporting(false); }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(''); setSuccessMsg('');
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = ev => { const b64 = (ev.target?.result as string).split(',')[1]; b64 ? resolve(b64) : reject(new Error('Could not read file')); };
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsDataURL(file);
      });
      const result = await executeGraph('upload_scenario_excel', { excel_file: base64 });
      if (result.status === 'success' && result.uploaded_overrides) {
        const filtered: Record<string, any> = {};
        let count = 0;
        for (const [rowId, mod] of Object.entries(result.uploaded_overrides as Record<string, any>)) {
          const orig = data.find(d => `${d.Distributor}_${d.ZREP}_${d.year}_${d.period}` === rowId);
          if (!orig) continue;
          const si = mod.Sell_In_Forecast_Qty_Proposed !== undefined && Math.abs(mod.Sell_In_Forecast_Qty_Proposed - (orig.Sell_In_Forecast_Qty ?? 0)) > 0.01;
          const it = mod.In_transit_Proposed           !== undefined && Math.abs(mod.In_transit_Proposed           - (orig.In_transit           ?? 0)) > 0.01;
          if (si || it) { filtered[rowId] = mod; count++; }
        }
        if (count === 0) { setError('No changes detected in the uploaded Excel.'); return; }
        const newOverrides = { ...manualOverrides, ...filtered };
        setManualOverrides(newOverrides);
        setModifications(applyCascades(newOverrides));
        setSuccessMsg(`Excel uploaded: ${count} row(s) changed. Review below, then Save.`);
      } else { setError(result.error || 'Upload failed'); }
    } catch (err: any) { setError('Upload error: ' + err.message); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const hasModifications = Object.keys(manualOverrides).length > 0;

  return (
    <div className="rounded-lg shadow overflow-hidden border border-mars-blue-light">

      {/* ── Section Header ── */}
      <div className="mars-section-header">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold tracking-wide mr-2">Scenario Builder</span>
          {data.length > 0 && (
            <span className="text-xs text-white/50 font-normal mr-1">
              {filteredData.length.toLocaleString()} rows
              {Object.keys(modifications).length > 0 && (
                <span className="ml-2 text-mars-gold font-bold">· {Object.keys(modifications).length} modified</span>
              )}
            </span>
          )}

          {/* Scenario name + reason */}
          <input
            type="text" placeholder="Scenario Name…" value={name} onChange={e => setName(e.target.value)}
            className="flex-1 min-w-[130px] px-2.5 py-1 bg-white/10 border border-white/20 rounded text-white placeholder-white/50 text-sm focus:outline-none focus:bg-white/20"
          />
          <input
            type="text" placeholder="Reason for scenario…" value={reason} onChange={e => setReason(e.target.value)}
            className="flex-1 min-w-[140px] px-2.5 py-1 bg-white/10 border border-white/20 rounded text-white placeholder-white/50 text-sm focus:outline-none focus:bg-white/20"
          />

          {/* Reset */}
          <button
            onClick={() => {
              if (cascadeTimerRef.current) clearTimeout(cascadeTimerRef.current);
              latestManualsRef.current = {};
              setManualOverrides({}); setModifications({}); setBulkVal(''); setShowWarning(false); setShowChangesOnly(false);
            }}
            disabled={!hasModifications}
            className="flex items-center gap-1 px-3 py-1 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded text-sm font-medium disabled:opacity-40 transition-colors"
          >
            <RotateCcw size={13} /> Reset
          </button>

          {/* Save */}
          <button
            onClick={handleSaveScenario}
            disabled={saving || !hasModifications}
            className="flex items-center gap-1 px-3 py-1 bg-white text-mars-navy rounded text-sm font-bold disabled:opacity-40 hover:bg-mars-blue-light transition-colors"
          >
            <Save size={13} />
            {saving ? 'Saving…' : 'Save Scenario'}
          </button>
        </div>
      </div>

      {/* ── Toolbar (Bulk + Export/Upload + Pagination) ── */}
      <div className="bg-white border-b border-mars-blue-light px-4 py-2.5 flex flex-wrap items-center gap-2">

        {/* Bulk Apply */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-mars-navy uppercase tracking-wide">Bulk:</span>
          <input
            type="number" placeholder="Value" value={bulkVal} onChange={e => setBulkVal(e.target.value)}
            className="w-24 px-2 py-1 border border-mars-blue-light rounded text-sm focus:outline-none focus:ring-1 focus:ring-mars-navy"
          />
          <select
            value={bulkType} onChange={e => setBulkType(e.target.value as any)}
            className="border border-mars-blue-light text-sm rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-mars-navy"
          >
            <option value="percent">% Inc</option>
            <option value="absolute">Abs Inc</option>
          </select>
          <button
            onClick={handleBulkApply}
            className="px-3 py-1 bg-mars-navy text-white text-sm font-semibold rounded hover:bg-mars-navy-dark transition-colors"
          >
            Apply
          </button>
        </div>

        {/* Show Changes Only toggle */}
        <button
          onClick={() => { setShowChangesOnly(prev => !prev); setCurrentPage(1); }}
          disabled={Object.keys(modifications).length === 0}
          className={`flex items-center gap-1.5 px-3 py-1 border rounded text-sm font-semibold transition-colors disabled:opacity-40
            ${showChangesOnly
              ? 'bg-mars-navy text-white border-mars-navy'
              : 'bg-white text-mars-navy border-mars-blue-light hover:bg-mars-blue-pale'
            }`}
        >
          <Filter size={13} />
          {showChangesOnly
            ? `Changes Only (${Object.keys(modifications).length})`
            : 'Show Changes'}
        </button>

        {/* Export / Upload */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleExportTemplate}
            disabled={exporting || data.length === 0}
            className="flex items-center gap-1.5 px-3 py-1 bg-mars-blue-pale text-mars-navy border border-mars-blue-light hover:bg-mars-blue-light rounded text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {exporting ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-mars-navy border-t-transparent" /> : <FileDown size={14} />}
            Download Template
          </button>
          <label className={`flex items-center gap-1.5 px-3 py-1 border rounded text-sm font-semibold transition-colors ${uploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200' : 'bg-mars-orange/10 text-mars-orange border-mars-orange/30 hover:bg-mars-orange/20 cursor-pointer'}`}>
            {uploading ? <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-mars-orange border-t-transparent" /> : <UploadCloud size={14} />}
            Upload Excel
            <input type="file" accept=".xlsx,.xls" hidden onChange={handleFileUpload} disabled={uploading} />
          </label>
        </div>

        {/* Pagination */}
        {filteredData.length > 0 && (
          <div className="flex items-center gap-1.5 ml-4 text-sm text-gray-500 border-l border-mars-blue-light pl-4">
            <span>{indexOfFirstRow + 1}–{Math.min(indexOfLastRow, filteredData.length)} of {filteredData.length}{showChangesOnly ? ' changed' : ''}</span>
            <button onClick={() => paginate(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="p-0.5 rounded disabled:opacity-40 hover:bg-mars-blue-pale">
              <ChevronLeft size={16} />
            </button>
            <span className="font-semibold text-mars-navy">{currentPage}/{totalPages}</span>
            <button onClick={() => paginate(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="p-0.5 rounded disabled:opacity-40 hover:bg-mars-blue-pale">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* ── Status Messages ── */}
      {successMsg && (
        <div className="px-4 py-2.5 bg-green-50 text-green-800 border-b border-green-200 text-sm font-medium">{successMsg}</div>
      )}
      {error && (
        <div className="px-4 py-2.5 bg-red-50 text-red-700 border-b border-red-200 text-sm">{error}</div>
      )}

      {/* ── Warning Modal ── */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6 border-t-4 border-mars-orange">
            <div className="flex items-center text-mars-orange mb-4 gap-2">
              <AlertTriangle size={22} />
              <h3 className="text-lg font-bold">Inventory Warning</h3>
            </div>
            <p className="text-gray-600 mb-6 text-sm leading-relaxed">
              One or more proposed changes will result in an Ending Inventory below the{' '}
              <strong>Weeks on Hand (WoH) Minimum Requirement</strong>. Do you want to proceed?
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowWarning(false)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-sm font-medium">Cancel</button>
              <button
                onClick={() => { setShowWarning(false); triggerSave(); }}
                className="flex items-center gap-2 px-4 py-2 bg-mars-orange text-white rounded hover:opacity-90 text-sm font-bold"
              >
                <Save size={14} /> Proceed & Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Data Table ── */}
      {loading ? (
        <div className="flex justify-center items-center h-64 bg-white">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-mars-blue-light border-t-mars-navy" />
        </div>
      ) : (
        <div className="overflow-x-auto h-[550px] bg-white">
          <table className="min-w-full table-fixed">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="mars-th-group" colSpan={4}>Identifiers</th>
                <th className="mars-th-group border-l border-white/10" colSpan={2}>Read-Only Actuals</th>
                <th className="mars-th-group border-l border-white/10" colSpan={2} style={{ background: '#3060A8' }}>Sell-In</th>
                <th className="mars-th-group border-l border-white/10" colSpan={2} style={{ background: '#6B3EA0' }}>In-Transit</th>
                <th className="mars-th-group border-l border-white/10" colSpan={3} style={{ background: '#1a4480' }}>Inventory</th>
              </tr>
              <tr>
                <th className="mars-th  w-16" title="Distributor">Dist</th>
                <th className="mars-th  w-20" title="Product (ZREP)">ZREP</th>
                <th className="mars-th  w-20" title="Year-Period">Per</th>
                <th className="mars-th  w-20" style={{ background: '#1a4480' }}>Rolling</th>
                <th className="mars-th-right w-20" title="Beginning Inventory">Beg Inv</th>
                <th className="mars-th-right w-20" title="Sell-Out Forecast">Sell Out</th>
                <th className="mars-th-right w-20" title="Sell-In Actuals (sell_in_actuals_qty — read-only)" style={{ background: '#5B6D8A' }}>Sell In (A)</th>
                <th className="mars-th-right w-24" title="Sell-In Forecast Proposed (editable)" style={{ background: '#3060A8' }}>Sell In (P)</th>
                <th className="mars-th-right w-20" title="In-Transit Actual (read-only)" style={{ background: '#6B3EA0' }}>In Tr (A)</th>
                <th className="mars-th-right w-24" title="In-Transit Proposed (editable)" style={{ background: '#8B4FBF' }}>In Tr (P)</th>
                <th className="mars-th-right w-20" title="Days on Hand = (End Inv / Sell Out) × 28" style={{ background: '#2DC274' }}>DOH</th>
                <th className="mars-th-right w-20" title="Weeks on Hand Required" style={{ background: '#C0721A' }}>WoH Req</th>
                <th className="mars-th-right w-24" title="Proposed Ending Inventory (auto-calculated)" style={{ background: '#3060A8' }}>End Inv (P)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mars-blue-light text-sm">
              {currentRows.map((row) => {
                const rowId     = `${row.Distributor}_${row.ZREP}_${row.year}_${row.period}`;
                const isModified = !!modifications[rowId];
                const begInvP    = getDisplayValue(rowId, 'Beginning_inventory_Proposed', row.Beginning_inventory);
                const endInvP    = getDisplayValue(rowId, 'Ending_inventory_Proposed',    row.Ending_inventory);
                const isBelowWoH = endInvP < row.WoH_Inventory_Required;

                return (
                  <tr
                    key={rowId}
                    className={
                      isModified
                        ? 'bg-mars-gold-light'
                        : 'bg-white hover:bg-mars-blue-pale'
                    }
                  >
                    <td className="px-2 py-2 font-semibold text-mars-navy border-r border-mars-blue-light">{row.Distributor}</td>
                    <td className="px-2 py-2 text-gray-700 text-xs          border-r border-mars-blue-light">{row.ZREP}</td>
                    <td className="px-2 py-2 text-gray-500                  border-r border-mars-blue-light">{row.year}-P{row.period}</td>
                    <td className="px-2 py-2 font-bold border-r border-mars-blue-light text-mars-blue">
                      {row.Rolling_Period}
                    </td>
                    <td className="px-2 py-2 text-right text-mars-navy font-medium border-r border-mars-blue-light">{Number(begInvP || 0).toFixed(1)}</td>
                    <td className="px-2 py-2 text-right text-gray-600       border-r border-mars-blue-light">{Number(row.Sell_Out_forecast_Qty || 0).toFixed(1)}</td>

                    {/* Sell-In Actuals (read-only) */}
                    <td className="px-2 py-2 text-right text-gray-400 bg-mars-blue-pale/40 border-r border-mars-blue-light">{Number(row.Sell_In_Actuals_Qty || 0).toFixed(1)}</td>

                    {/* Proposed Sell-In (editable) */}
                    <td className="px-1 py-1 border-r border-blue-200 bg-blue-50">
                      <input
                        type="number"
                        disabled={saving}
                        value={getDisplayValue(rowId, 'Sell_In_Forecast_Qty_Proposed', row.Sell_In_Forecast_Qty_Proposed)}
                        onChange={e => handleModification(rowId, 'Sell_In_Forecast_Qty_Proposed', e.target.value)}
                        className="w-full px-1 py-0.5 border border-mars-blue rounded text-right focus:outline-none focus:ring-1 focus:ring-mars-navy font-semibold text-mars-navy text-sm bg-white"
                      />
                    </td>

                    {/* Actual In-Transit (read-only) */}
                    <td className="px-2 py-2 text-right border-r border-purple-200 bg-purple-50/30" style={{ color: '#9B59B6' }}>{Number(row.In_transit_Actual || 0).toFixed(1)}</td>

                    {/* Proposed In-Transit (editable) */}
                    <td className="px-1 py-1 border-r border-purple-200 bg-purple-50">
                      <input
                        type="number"
                        disabled={saving}
                        value={getDisplayValue(rowId, 'In_transit_Proposed', row.In_transit_Proposed || row.In_transit)}
                        onChange={e => handleModification(rowId, 'In_transit_Proposed', e.target.value)}
                        className="w-full px-1 py-0.5 border border-purple-400 rounded text-right focus:outline-none focus:ring-1 focus:ring-purple-600 font-semibold text-sm bg-white"
                        style={{ color: '#7B3FAF' }}
                      />
                    </td>

                    <td className="px-2 py-2 text-right font-medium border-r border-mars-blue-light" style={{ color: '#1A7A4A' }}>
                      {row.Sell_Out_forecast_Qty > 0 ? ((endInvP / row.Sell_Out_forecast_Qty) * 28).toFixed(1) : '—'}
                    </td>
                    <td className="px-2 py-2 text-right font-medium border-r border-mars-blue-light" style={{ color: '#C0721A' }}>{Number(row.WoH_Inventory_Required || 0).toFixed(1)}</td>

                    {/* Proposed End Inv */}
                    <td className={`px-2 py-2 text-right font-bold border-l-2 ${isBelowWoH ? 'bg-red-50 border-red-400 text-red-700' : 'bg-blue-50 border-mars-blue text-mars-blue'}`}>
                      {Number(endInvP || 0).toFixed(1)}
                      {isBelowWoH && <AlertTriangle size={11} className="inline ml-1 text-red-600" />}
                    </td>
                  </tr>
                );
              })}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center text-gray-400">
                    {showChangesOnly
                      ? 'No modifications yet. Edit Sell-In or In-Transit values to see changes here.'
                      : 'No data available for the selected filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ScenarioBuilder;
