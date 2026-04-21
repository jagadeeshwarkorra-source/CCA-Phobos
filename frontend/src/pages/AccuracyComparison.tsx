/**
 * Accuracy Comparison page — wMAPE/bias KPIs, period combo chart,
 * distributor ranking, heatmap, category chart, and drill-down table.
 *
 * Data fetched via dashboardService.getAccuracyComparison().
 * Formatting delegated to utils/formatting.ts.
 * Colours from constants/colors.ts.
 */

import React, { useEffect, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Cell, ReferenceLine,
} from 'recharts';
import { Target, TrendingUp, TrendingDown, Award, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

import { useAppContext } from '../context/AppContext';
import { getAccuracyComparison } from '../services/dashboardService';
import { fmt, fmtBig } from '../utils/formatting';
import { BRAND, ACCURACY_COLORS } from '../constants/colors';

// ── Accuracy colour helpers ───────────────────────────────────────────────────
/**
 * Return Tailwind class pair and hex colour for an accuracy value.
 *
 * @param val - Accuracy % (0–100), or null/undefined.
 * @returns   { bg, text, hex } from ACCURACY_COLORS.
 */
function accuracyColor(val: number | null | undefined) {
  if (val == null)  return ACCURACY_COLORS.none;
  if (val >= 95)    return ACCURACY_COLORS.excellent;
  if (val >= 85)    return ACCURACY_COLORS.good;
  if (val >= 75)    return ACCURACY_COLORS.fair;
  if (val >= 60)    return ACCURACY_COLORS.poor;
  return ACCURACY_COLORS.bad;
}

/**
 * Return a Tailwind text colour class for a bias value.
 *
 * @param val - Bias % (positive = over-forecast, negative = under-forecast).
 * @returns   Tailwind colour class string.
 */
function biasColor(val: number | null | undefined): string {
  if (val == null)         return 'text-gray-400';
  if (Math.abs(val) <= 5)  return 'text-green-700';
  if (Math.abs(val) <= 15) return 'text-yellow-700';
  return val > 0 ? 'text-orange-700' : 'text-blue-700';
}

// Chart colours for this page
const COLORS = {
  forecast: BRAND.blue,
  actual:   BRAND.orange,
  accuracy: BRAND.navy,
  grid:     '#D9E1F2',
  axis:     '#6B7280',
} as const;

// ── Custom tooltip for forecast vs actual combo chart ─────────────────────────
const ComboTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-mars-blue-light rounded shadow-lg p-3 text-xs">
      <p className="font-bold text-mars-navy mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: p.color }} />
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-semibold">
            {p.name === 'Accuracy %' ? `${fmt(p.value)}%` : fmtBig(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
};

// ── KPI Card ──────────────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, icon: Icon, borderColor, iconBg, iconColor }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; borderColor: string; iconBg: string; iconColor: string;
}) => (
  <div className={`bg-white rounded-lg shadow-sm hover:shadow transition-shadow p-4 flex items-start gap-3 border border-gray-100 border-l-4 ${borderColor}`}>
    <div className={`p-2.5 rounded-lg ${iconBg} shrink-0`}>
      <Icon size={18} className={iconColor} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
      <p className="text-xl font-black text-mars-navy leading-tight truncate">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ── Main page ─────────────────────────────────────────────────────────────────
const AccuracyComparison: React.FC = () => {
  const { state } = useAppContext();
  const [accData,      setAccData     ] = useState<any | null>(null);
  const [loading,      setLoading     ] = useState(false);
  const [error,        setError       ] = useState<string | null>(null);
  const [detailOpen,   setDetailOpen  ] = useState(false);
  const [detailFilter, setDetailFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getAccuracyComparison(state.filters);
        if (!cancelled) setAccData(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [state.filters]);

  if (loading) return (
    <div className="flex justify-center items-center h-64 bg-white rounded-lg shadow border border-mars-blue-light">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-mars-blue-light border-t-mars-navy" />
    </div>
  );

  if (error) return (
    <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg">{error}</div>
  );

  if (!accData || !accData.kpis || !accData.by_period?.length) return (
    <div className="flex flex-col items-center justify-center h-64 bg-white rounded-lg shadow border border-mars-blue-light text-gray-400">
      <AlertCircle size={48} className="mb-3 opacity-30" />
      <p className="text-lg font-semibold">No accuracy data available</p>
      <p className="text-sm mt-1">No closed periods (P-3 → P-1) found for the selected filters.</p>
    </div>
  );

  const { kpis, by_period, by_distributor, by_category, by_period_distributor, periods, detail } = accData;
  const filteredDetail = (detail || []).filter((r: any) =>
    !detailFilter ||
    r.distributor?.toLowerCase().includes(detailFilter.toLowerCase()) ||
    r.zrep?.toLowerCase().includes(detailFilter.toLowerCase())
  );

  return (
    <div className="space-y-5">

      {/* KPI header */}
      <div className="rounded-lg shadow overflow-hidden border border-mars-blue-light">
        <div className="mars-section-header flex items-center gap-2">
          <Target size={16} />
          Accuracy Comparison — Sell-Out Forecast vs Actuals &nbsp;
          <span className="text-white/60 font-normal text-xs">[{periods.join(', ')}]</span>
        </div>
        <div className="bg-mars-blue-pale p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <KpiCard label="Overall Accuracy"   value={`${fmt(kpis.overall_accuracy)}%`}                      sub={`MAPE: ${fmt(kpis.overall_mape)}%`}      icon={Target}     borderColor="border-green-400"     iconBg="bg-green-50"  iconColor="text-green-600" />
          <KpiCard label="Forecast Bias"      value={`${kpis.overall_bias >= 0 ? '+' : ''}${fmt(kpis.overall_bias)}%`} sub={kpis.overall_bias > 0 ? 'Over-forecast' : kpis.overall_bias < 0 ? 'Under-forecast' : 'Unbiased'} icon={kpis.overall_bias > 0 ? TrendingUp : TrendingDown} borderColor="border-mars-blue" iconBg="bg-blue-50" iconColor="text-mars-blue" />
          <KpiCard label="wMAPE"              value={`${fmt(kpis.overall_mape)}%`}                          sub="Weighted Abs % Error"                     icon={AlertCircle} borderColor="border-mars-orange"    iconBg="bg-orange-50" iconColor="text-mars-orange" />
          <KpiCard label="Best Distributor"   value={kpis.best_distributor}                                 sub={`Acc: ${fmt(by_distributor?.[0]?.accuracy)}%`} icon={Award} borderColor="border-green-400"     iconBg="bg-green-50"  iconColor="text-green-600" />
          <KpiCard label="Worst Distributor"  value={kpis.worst_distributor}                                sub={`Acc: ${fmt(by_distributor?.slice(-1)?.[0]?.accuracy)}%`} icon={AlertCircle} borderColor="border-red-400" iconBg="bg-red-50" iconColor="text-red-500" />
        </div>
      </div>

      {/* Combo chart + distributor ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-lg shadow overflow-hidden border border-mars-blue-light">
          <div className="mars-section-header">Forecast vs Actual by Period</div>
          <div className="bg-white p-4">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={by_period} margin={{ top: 10, right: 40, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid} />
                  <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: COLORS.axis, fontSize: 12 }} />
                  <YAxis yAxisId="vol" axisLine={false} tickLine={false} tick={{ fill: COLORS.axis, fontSize: 11 }} tickFormatter={(v: number) => fmtBig(v)}
                    label={{ value: 'Volume', angle: -90, position: 'insideLeft', fill: COLORS.axis, fontSize: 10, dy: 30 }} />
                  <YAxis yAxisId="acc" orientation="right" domain={[0, 100]} axisLine={false} tickLine={false}
                    tick={{ fill: COLORS.accuracy, fontSize: 11 }} tickFormatter={v => `${v}%`}
                    label={{ value: 'Accuracy %', angle: 90, position: 'insideRight', fill: COLORS.accuracy, fontSize: 10, dy: -35 }} />
                  <Tooltip content={<ComboTooltip />} />
                  <Bar yAxisId="vol" dataKey="forecast" name="Forecast"   fill={COLORS.forecast} radius={[3,3,0,0]} />
                  <Bar yAxisId="vol" dataKey="actual"   name="Actual"     fill={COLORS.actual}   radius={[3,3,0,0]} />
                  <Line yAxisId="acc" type="monotone" dataKey="accuracy" name="Accuracy %"
                    stroke={COLORS.accuracy} strokeWidth={2.5} dot={{ r: 5, fill: COLORS.accuracy, strokeWidth: 0 }} activeDot={{ r: 7 }} />
                  <ReferenceLine yAxisId="acc" y={95} stroke="#22C55E" strokeDasharray="4 3" strokeWidth={1.5}
                    label={{ value: '95% target', fill: '#22C55E', fontSize: 10, position: 'right' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-4 justify-center mt-2 text-xs font-semibold">
              {[
                { color: COLORS.forecast, label: 'Forecast' },
                { color: COLORS.actual,   label: 'Actual'   },
                { color: COLORS.accuracy, label: 'Accuracy %', line: true },
              ].map(({ color, label, line }) => (
                <span key={label} className="flex items-center gap-1.5 text-gray-600">
                  {line
                    ? <span className="inline-block w-6 h-0.5 rounded" style={{ background: color }} />
                    : <span className="w-3 h-3 rounded-sm inline-block" style={{ background: color }} />}
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-lg shadow overflow-hidden border border-mars-blue-light">
          <div className="mars-section-header">Accuracy by Distributor (Ranked)</div>
          <div className="bg-white p-4">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[...by_distributor].reverse()} layout="vertical" margin={{ top: 5, right: 60, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={COLORS.grid} />
                  <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: COLORS.axis, fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="distributor" axisLine={false} tickLine={false} tick={{ fill: COLORS.axis, fontSize: 11 }} width={40} />
                  <Tooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="bg-white border border-mars-blue-light rounded shadow p-3 text-xs">
                        <p className="font-bold text-mars-navy mb-1">{label}</p>
                        <p>Accuracy: <b>{fmt(d.accuracy)}%</b></p>
                        <p>Bias: <b className={biasColor(d.bias)}>{d.bias >= 0 ? '+' : ''}{fmt(d.bias)}%</b></p>
                        <p>Forecast: <b>{fmtBig(d.forecast)}</b> | Actual: <b>{fmtBig(d.actual)}</b></p>
                      </div>
                    );
                  }} />
                  <Bar dataKey="accuracy" radius={[0, 3, 3, 0]}>
                    {[...by_distributor].reverse().map((entry: any, i: number) => (
                      <Cell key={i} fill={accuracyColor(entry.accuracy).hex} stroke="#CBD5E1" strokeWidth={0.5} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Heatmap + Category chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-lg shadow overflow-hidden border border-mars-blue-light">
          <div className="mars-section-header">Accuracy Heatmap — Distributor × Period</div>
          <div className="bg-white overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="mars-th w-28">Distributor</th>
                  {periods.map((p: string) => <th key={p} className="mars-th-right">{p}</th>)}
                  <th className="mars-th-right" style={{ background: '#1a4480' }}>Avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mars-blue-light">
                {by_period_distributor.map((row: any) => {
                  const vals = periods.map((p: string) => row[p]).filter((v: any) => v != null);
                  const avg  = vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
                  return (
                    <tr key={row.distributor} className="hover:bg-mars-blue-pale/40">
                      <td className="px-3 py-2.5 font-bold text-mars-navy border-r border-mars-blue-light">{row.distributor}</td>
                      {periods.map((p: string) => {
                        const v = row[p]; const c = accuracyColor(v); const bias = row[`${p}_bias`];
                        return (
                          <td key={p} className="px-3 py-2 text-center border-r border-mars-blue-light"
                              title={bias != null ? `Bias: ${bias >= 0 ? '+' : ''}${fmt(bias)}%` : ''}>
                            {v != null ? (
                              <div className={`inline-flex flex-col items-center rounded px-2 py-0.5 ${c.bg} ${c.text} font-bold text-xs`}>
                                <span>{fmt(v)}%</span>
                                {bias != null && <span className={`text-[9px] font-medium ${biasColor(bias)}`}>{bias >= 0 ? '+' : ''}{fmt(bias, 1)}</span>}
                              </div>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center">
                        {avg != null ? <span className={`inline-block rounded px-2 py-0.5 font-black text-xs ${accuracyColor(avg).bg} ${accuracyColor(avg).text}`}>{fmt(avg)}%</span> : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={periods.length + 2} className="px-3 py-2 bg-gray-50">
                    <div className="flex flex-wrap items-center gap-3 text-[10px] font-semibold">
                      <span className="text-gray-400 mr-1">Legend:</span>
                      {[
                        { label: '≥ 95%',  ...ACCURACY_COLORS.excellent },
                        { label: '85-94%', ...ACCURACY_COLORS.good      },
                        { label: '75-84%', ...ACCURACY_COLORS.fair      },
                        { label: '60-74%', ...ACCURACY_COLORS.poor      },
                        { label: '< 60%',  ...ACCURACY_COLORS.bad       },
                      ].map(({ label, bg, text }) => (
                        <span key={label} className={`px-2 py-0.5 rounded ${bg} ${text}`}>{label}</span>
                      ))}
                      <span className="text-gray-400 ml-2">Subscript = Bias %</span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="rounded-lg shadow overflow-hidden border border-mars-blue-light">
          <div className="mars-section-header">Accuracy by Category</div>
          <div className="bg-white p-4">
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[...by_category].reverse()} layout="vertical" margin={{ top: 5, right: 55, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={COLORS.grid} />
                  <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: COLORS.axis, fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <YAxis type="category" dataKey="category" axisLine={false} tickLine={false} tick={{ fill: COLORS.axis, fontSize: 11 }} width={50} />
                  <Tooltip content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    return (
                      <div className="bg-white border border-mars-blue-light rounded shadow p-3 text-xs">
                        <p className="font-bold text-mars-navy mb-1">{label}</p>
                        <p>Accuracy: <b>{fmt(d.accuracy)}%</b></p>
                        <p>Bias: <b className={biasColor(d.bias)}>{d.bias >= 0 ? '+' : ''}{fmt(d.bias)}%</b></p>
                      </div>
                    );
                  }} />
                  <Bar dataKey="accuracy" radius={[0, 3, 3, 0]}>
                    {[...by_category].reverse().map((entry: any, i: number) => (
                      <Cell key={i} fill={accuracyColor(entry.accuracy).hex} stroke="#CBD5E1" strokeWidth={0.5} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 border-t border-mars-blue-light pt-3 space-y-1.5">
              {by_category.map((cat: any) => (
                <div key={cat.category} className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-700 w-24 truncate">{cat.category}</span>
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${accuracyColor(cat.accuracy).bg} ${accuracyColor(cat.accuracy).text}`}>{fmt(cat.accuracy)}%</span>
                    <span className={`text-[10px] font-semibold w-12 text-right ${biasColor(cat.bias)}`}>{cat.bias >= 0 ? '+' : ''}{fmt(cat.bias)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Detail breakdown table */}
      <div className="rounded-lg shadow overflow-hidden border border-mars-blue-light">
        <div className="mars-section-header flex items-center justify-between cursor-pointer select-none"
          onClick={() => setDetailOpen(v => !v)}>
          <span>Detailed Breakdown — By Distributor / Product / Period</span>
          <div className="flex items-center gap-2">
            <span className="text-white/60 text-xs font-normal">{detail?.length ?? 0} records</span>
            {detailOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
        {detailOpen && (
          <div className="bg-white">
            <div className="px-4 py-2.5 border-b border-mars-blue-light bg-mars-blue-pale">
              <input type="text" placeholder="Filter by Distributor or Product..."
                value={detailFilter} onChange={e => setDetailFilter(e.target.value)}
                className="w-full max-w-sm px-3 py-1.5 border border-mars-blue-light rounded text-sm focus:outline-none focus:ring-1 focus:ring-mars-navy" />
            </div>
            <div className="overflow-x-auto max-h-[480px]">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="mars-th w-24">Distributor</th>
                    <th className="mars-th w-28">Product</th>
                    <th className="mars-th w-16">Category</th>
                    <th className="mars-th w-16">Period</th>
                    <th className="mars-th-right w-24">Forecast</th>
                    <th className="mars-th-right w-24">Actual</th>
                    <th className="mars-th-right w-24">Variance</th>
                    <th className="mars-th-right w-24" style={{ background: BRAND.blue }}>Accuracy %</th>
                    <th className="mars-th-right w-24" style={{ background: BRAND.orange }}>Bias %</th>
                    <th className="mars-th-right w-20">MAPE %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mars-blue-light">
                  {filteredDetail.map((row: any, idx: number) => {
                    const variance = (row.forecast ?? 0) - (row.actual ?? 0);
                    const acc      = accuracyColor(row.accuracy);
                    return (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white hover:bg-mars-blue-pale' : 'bg-mars-blue-pale hover:bg-mars-blue-light/30'}>
                        <td className="px-3 py-2 font-semibold text-mars-navy border-r border-mars-blue-light">{row.distributor}</td>
                        <td className="px-3 py-2 text-gray-700 text-xs border-r border-mars-blue-light">{row.zrep}</td>
                        <td className="px-3 py-2 text-gray-500 border-r border-mars-blue-light">{row.category}</td>
                        <td className="px-3 py-2 font-bold text-mars-blue border-r border-mars-blue-light">{row.period}</td>
                        <td className="px-3 py-2 text-right text-gray-600 border-r border-mars-blue-light">{fmtBig(row.forecast)}</td>
                        <td className="px-3 py-2 text-right text-gray-600 border-r border-mars-blue-light">{fmtBig(row.actual)}</td>
                        <td className={`px-3 py-2 text-right font-medium border-r border-mars-blue-light ${variance > 0 ? 'text-mars-orange' : variance < 0 ? 'text-mars-blue' : 'text-gray-500'}`}>
                          {variance >= 0 ? '+' : ''}{fmtBig(variance)}
                        </td>
                        <td className={`px-3 py-2 text-right font-bold border-r border-mars-blue-light ${acc.text} ${acc.bg}`}>{fmt(row.accuracy)}%</td>
                        <td className={`px-3 py-2 text-right font-semibold border-r border-mars-blue-light ${biasColor(row.bias)}`}>{row.bias >= 0 ? '+' : ''}{fmt(row.bias)}%</td>
                        <td className="px-3 py-2 text-right text-gray-600">{fmt(row.mape)}%</td>
                      </tr>
                    );
                  })}
                  {filteredDetail.length === 0 && (
                    <tr><td colSpan={10} className="px-6 py-10 text-center text-gray-400">No matching records.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccuracyComparison;
