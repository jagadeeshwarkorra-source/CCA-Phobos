/**
 * Overview page — rolling period chart, bridge chart, KPI cards.
 *
 * Data is fetched once per filter change via dashboardService.getOverview().
 * The Cases/GSV unit toggle recomputes chartData in-memory (no API call).
 *
 * Period thresholds are imported from constants/periods.ts.
 * Colours are imported from constants/colors.ts.
 * Formatting helpers are imported from utils/formatting.ts.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { TrendingUp, TrendingDown, Package, BarChart2, Layers } from 'lucide-react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, LabelList,
} from 'recharts';

import { useAppContext } from '../context/AppContext';
import { getOverview } from '../services/dashboardService';
import { fmtBig } from '../utils/formatting';
import { CHART_COLORS } from '../constants/colors';
import {
  CHART_MIN_PERIOD, CHART_MAX_PERIOD,
  KPI_HORIZON_MIN, KPI_HORIZON_MAX,
  BRIDGE_ACTUALS_MIN, BRIDGE_ACTUALS_MAX,
  BRIDGE_FORECAST_MIN, BRIDGE_FORECAST_MAX,
} from '../constants/periods';
import type { ByPeriodRow, ChartDataPoint } from '../types';

// ── KPI Card sub-component ────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, icon: Icon, borderColor, iconBg, iconColor }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; borderColor: string; iconBg: string; iconColor: string;
}) => (
  <div className={`bg-white rounded-lg border border-gray-100 border-l-4 ${borderColor} p-4 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow`}>
    <div className={`p-2.5 rounded-lg ${iconBg} shrink-0`}>
      <Icon size={18} className={iconColor} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
      <p className="text-2xl font-black text-mars-navy leading-tight truncate">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ── Overview page ─────────────────────────────────────────────────────────────
const Overview: React.FC = () => {
  const { state }  = useAppContext();
  const isGSV      = state.unit === 'GSV';

  const [rawPeriod, setRawPeriod] = useState<ByPeriodRow[]>([]);
  const [minYear,   setMinYear  ] = useState(0);
  const [loading,   setLoading  ] = useState(false);
  const [error,     setError    ] = useState<string | null>(null);

  // ── Fetch only on filter change — unit toggle recomputes without re-fetch ──
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const summary = await getOverview(state.filters);
        if (cancelled) return;
        const byPeriod = summary.by_period || [];
        const years    = byPeriod.map(r => Number(r.year)).filter(y => !isNaN(y));
        setRawPeriod(byPeriod);
        setMinYear(years.length ? Math.min(...years) : 0);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [state.filters]);

  // ── Build chart data — recomputes instantly on unit toggle ────────────────
  const chartData = useMemo((): ChartDataPoint[] => {
    if (!rawPeriod.length) return [];

    // Build a map keyed by a sequential index so we can look up the prior year
    const periodMap = new Map<number, ByPeriodRow>();
    rawPeriod.forEach(row => {
      const y = Number(row.year   || 0);
      const p = Number(row.period || 0);
      periodMap.set((y - minYear) * 13 + (p - 1), row);
    });

    return rawPeriod
      .slice()
      .sort((a, b) => {
        const ay = Number(a.year), ap = Number(a.period);
        const by = Number(b.year), bp = Number(b.period);
        return ay === by ? ap - bp : ay - by;
      })
      .map(row => {
        const y    = Number(row.year   || 0);
        const p    = Number(row.period || 0);
        const prev = periodMap.get((y - minYear) * 13 + (p - 1) - 13);
        const pVal = row.period_val ?? 0;

        // Past periods use actuals; future periods use forecast
        // Each tuple: [cases field, gsv field]
        const siKey: [keyof ByPeriodRow, keyof ByPeriodRow] = pVal < 0
          ? ['sell_in_actuals',     'gsv_sell_in_actuals']
          : ['sell_in_forecast',    'gsv_sell_in_forecast'];
        const soKey: [keyof ByPeriodRow, keyof ByPeriodRow] = pVal < 0
          ? ['sell_out_actuals_sum','gsv_sell_out_actuals']
          : ['sell_out_forecast',   'gsv_sell_out_forecast'];

        const pick = (r: ByPeriodRow, [ck, gk]: [keyof ByPeriodRow, keyof ByPeriodRow]) =>
          Number(isGSV ? (r[gk] ?? 0) : (r[ck] ?? 0));

        return {
          name:             row.Rolling_Period || `${y}-P${p}`,
          period_val:       pVal,
          SellIn:           pick(row, siKey),
          SellOut:          pick(row, soKey),
          SellIn_PrevYear:  prev ? pick(prev, siKey) : 0,
          SellOut_PrevYear: prev ? pick(prev, soKey) : 0,
          InTransit:        row.in_transit_sum != null ? Number(row.in_transit_sum) : undefined,
          DOH:              row.doh != null ? Number(row.doh) : undefined,
        } as ChartDataPoint;
      })
      .filter(d => d.period_val >= CHART_MIN_PERIOD && d.period_val <= CHART_MAX_PERIOD);
  }, [rawPeriod, minYear, isGSV]);

  // ── KPIs — forward horizon aggregates ────────────────────────────────────
  const kpis = useMemo(() => {
    const forward      = chartData.filter(d => d.period_val >= KPI_HORIZON_MIN && d.period_val <= KPI_HORIZON_MAX);
    const totalSellOut = forward.reduce((s, d) => s + d.SellOut, 0);
    const totalSellIn  = forward.reduce((s, d) => s + d.SellIn,  0);
    const prevSellOut  = forward.reduce((s, d) => s + d.SellOut_PrevYear, 0);
    const yoyGrowth    = prevSellOut > 0 ? ((totalSellOut - prevSellOut) / prevSellOut) * 100 : 0;
    const coverage     = totalSellOut > 0 ? totalSellIn / totalSellOut : 0;
    return { totalSellOut, totalSellIn, yoyGrowth, coverage };
  }, [chartData]);

  // ── Bridge growth % (actuals P-3→P-1 vs forecast P+0→P+2) ────────────────
  const bridgeGrowth = useMemo(() => {
    const avg = (rows: ChartDataPoint[], key: keyof ChartDataPoint) => {
      const vals = rows.map(d => d[key] as number).filter(v => v != null && !isNaN(v));
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    };
    const actuals  = chartData.filter(d => d.period_val >= BRIDGE_ACTUALS_MIN  && d.period_val <= BRIDGE_ACTUALS_MAX);
    const forecast = chartData.filter(d => d.period_val >= BRIDGE_FORECAST_MIN && d.period_val <= BRIDGE_FORECAST_MAX);
    const siAct = avg(actuals,  'SellIn');  const soAct = avg(actuals,  'SellOut');
    const siFc  = avg(forecast, 'SellIn');  const soFc  = avg(forecast, 'SellOut');
    return {
      sellIn:  siAct > 0 ? ((siFc - siAct) / siAct) * 100 : 0,
      sellOut: soAct > 0 ? ((soFc - soAct) / soAct) * 100 : 0,
    };
  }, [chartData]);

  // ── Bridge chart data ─────────────────────────────────────────────────────
  const bridgeData = useMemo(() => {
    const avg = (rows: ChartDataPoint[], key: keyof ChartDataPoint) => {
      const vals = rows.map(d => d[key] as number).filter(v => v != null && !isNaN(v));
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    };
    const actuals  = chartData.filter(d => d.period_val >= BRIDGE_ACTUALS_MIN  && d.period_val <= BRIDGE_ACTUALS_MAX);
    const forecast = chartData.filter(d => d.period_val >= BRIDGE_FORECAST_MIN && d.period_val <= BRIDGE_FORECAST_MAX);
    return [
      { name: 'Actuals (P-3→P-1)',   SellIn: avg(actuals, 'SellIn'),   SellOut: avg(actuals, 'SellOut'),   SellInFc: null, SellOutFc: null },
      { name: 'Forecast (P+0→P+2)',  SellIn: null, SellOut: null, SellInFc: avg(forecast, 'SellIn'), SellOutFc: avg(forecast, 'SellOut') },
    ];
  }, [chartData]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex justify-center items-center h-64 bg-white rounded-lg shadow">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-100 border-t-mars-navy" />
    </div>
  );

  if (error) return (
    <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg">{error}</div>
  );

  return (
    <div className="space-y-5">

      {/* ── KPI Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label={isGSV ? '12P Sell-Out GSV' : '12P Sell-Out Forecast'} value={fmtBig(kpis.totalSellOut, isGSV)} sub="P+0 → P+12 total" icon={TrendingUp} borderColor="border-mars-orange" iconBg="bg-orange-50" iconColor="text-mars-orange" />
        <KpiCard label={isGSV ? '12P Sell-In GSV'  : '12P Sell-In Plan'}     value={fmtBig(kpis.totalSellIn,  isGSV)} sub="P+0 → P+12 total" icon={Package}   borderColor="border-mars-blue"  iconBg="bg-blue-50"   iconColor="text-mars-blue" />
        <KpiCard label="YoY Sell-Out Δ" value={`${kpis.yoyGrowth >= 0 ? '+' : ''}${kpis.yoyGrowth.toFixed(1)}%`} sub="vs same periods prior year"
          icon={kpis.yoyGrowth >= 0 ? TrendingUp : TrendingDown}
          borderColor={kpis.yoyGrowth >= 0 ? 'border-green-500' : 'border-red-400'}
          iconBg={kpis.yoyGrowth >= 0 ? 'bg-green-50' : 'bg-red-50'}
          iconColor={kpis.yoyGrowth >= 0 ? 'text-green-600' : 'text-red-500'} />
        <KpiCard label="Sell-In Coverage" value={`${kpis.coverage.toFixed(2)}x`} sub="Sell-In ÷ Sell-Out" icon={Layers} borderColor="border-purple-400" iconBg="bg-purple-50" iconColor="text-purple-500" />
      </div>

      {/* ── Rolling Period Chart ── */}
      <div className="rounded-lg shadow overflow-hidden border border-gray-200">
        <div className="mars-section-header flex items-center gap-2">
          <TrendingUp size={16} />
          Sell-In vs Sell-Out (Rolling Period Comparison)
        </div>
        <div className="bg-white p-5">
          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs font-semibold mb-4">
            {[
              { color: CHART_COLORS.sellIn,      label: 'Sell-In (Current)',    type: 'bar'    },
              { color: CHART_COLORS.sellInPrev,  label: 'Sell-In (Prev Year)',  type: 'bar'    },
              { color: CHART_COLORS.sellOut,     label: 'Sell-Out (Current)',   type: 'bar'    },
              { color: CHART_COLORS.sellOutPrev, label: 'Sell-Out (Prev Year)', type: 'bar'    },
              { color: CHART_COLORS.inTransit,   label: 'In Transit (CY)',      type: 'dotted' },
              { color: CHART_COLORS.doh,         label: 'DOH (days)',           type: 'line'   },
            ].map(({ color, label, type }) => (
              <span key={label} className="flex items-center gap-1.5 text-gray-600">
                {type === 'bar'
                  ? <span className="w-3 h-3 rounded-sm inline-block" style={{ background: color }} />
                  : type === 'dotted'
                    ? <span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: color }} />
                    : <span className="inline-block w-5 h-0.5 rounded"           style={{ background: color }} />}
                {label}
              </span>
            ))}
          </div>

          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 55, left: 20, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
                <XAxis dataKey="name" axisLine={false} tickLine={false}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: 11 }}
                  interval={0} angle={-45} textAnchor="end" />
                <YAxis yAxisId={0} axisLine={false} tickLine={false}
                  tick={{ fill: CHART_COLORS.axisText, fontSize: 11 }}
                  tickFormatter={v => fmtBig(Number(v), isGSV)} />
                <YAxis yAxisId={1} orientation="right" axisLine={false} tickLine={false}
                  tick={{ fill: CHART_COLORS.doh, fontSize: 11 }}
                  tickFormatter={v => `${Number(v).toFixed(0)}d`} />
                <Tooltip
                  cursor={{ fill: '#EEF2FB' }}
                  contentStyle={{ borderRadius: '6px', border: `1px solid ${CHART_COLORS.grid}`, fontSize: '12px' }}
                  formatter={(val: any, name: any) =>
                    name === 'DOH (days)'
                      ? [`${Number(val).toFixed(1)}d`, name]
                      : [fmtBig(Number(val), isGSV), name]
                  }
                />
                <ReferenceLine x={chartData.find(d => d.period_val === 0)?.name}
                  stroke={CHART_COLORS.refLine} strokeDasharray="4 3" strokeWidth={2}
                  label={{ value: 'P+0', fill: CHART_COLORS.refLine, fontSize: 11 }} />
                <Bar yAxisId={0} dataKey="SellIn_PrevYear"  name="Sell-In (Prev Year)"  fill={CHART_COLORS.sellInPrev}  radius={[3,3,0,0]} />
                <Bar yAxisId={0} dataKey="SellIn"           name="Sell-In (Current)"    fill={CHART_COLORS.sellIn}      radius={[3,3,0,0]} />
                <Bar yAxisId={0} dataKey="SellOut_PrevYear" name="Sell-Out (Prev Year)" fill={CHART_COLORS.sellOutPrev} radius={[3,3,0,0]} />
                <Bar yAxisId={0} dataKey="SellOut"          name="Sell-Out (Current)"   fill={CHART_COLORS.sellOut}     radius={[3,3,0,0]} />
                <Line yAxisId={0} type="monotone" dataKey="InTransit" name="In Transit (CY)"
                  stroke={CHART_COLORS.inTransit} strokeWidth={2} strokeDasharray="5 4"
                  dot={false} connectNulls activeDot={{ r: 4, fill: CHART_COLORS.inTransit }} />
                <Line yAxisId={1} type="monotone" dataKey="DOH" name="DOH (days)"
                  stroke={CHART_COLORS.doh} strokeWidth={2.5}
                  dot={false} connectNulls activeDot={{ r: 4, fill: CHART_COLORS.doh }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Actuals vs Forecast Bridge ── */}
      {bridgeData.length > 0 && (
        <div className="rounded-lg shadow overflow-hidden border border-gray-200">
          <div className="mars-section-header flex items-center gap-2">
            <BarChart2 size={16} />
            Sell-In &amp; Sell-Out: Actuals vs Forecast
            <span className="text-xs font-normal opacity-70 ml-1">(P-3 to P+2)</span>
          </div>
          <div className="bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
              <div className="flex flex-wrap gap-5 text-xs font-semibold">
                {[
                  { color: CHART_COLORS.sellIn,      label: 'Sell-In Actuals'   },
                  { color: CHART_COLORS.sellInPrev,  label: 'Sell-In Forecast'  },
                  { color: CHART_COLORS.sellOut,     label: 'Sell-Out Actuals'  },
                  { color: CHART_COLORS.sellOutPrev, label: 'Sell-Out Forecast' },
                ].map(({ color, label }) => (
                  <span key={label} className="flex items-center gap-1.5 text-gray-600">
                    <span className="w-3 h-3 rounded-sm inline-block" style={{ background: color }} />
                    {label}
                  </span>
                ))}
              </div>
              <div className="flex gap-3 shrink-0">
                {[
                  { label: 'Sell-In Growth',  pct: bridgeGrowth.sellIn,  accent: CHART_COLORS.sellIn  },
                  { label: 'Sell-Out Growth', pct: bridgeGrowth.sellOut, accent: CHART_COLORS.sellOut },
                ].map(({ label, pct, accent }) => (
                  <div key={label}
                    className="flex flex-col items-center justify-center rounded-lg border px-4 py-2 shadow-sm bg-white min-w-[110px]"
                    style={{ borderLeftWidth: 4, borderLeftColor: accent }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{label}</p>
                    <p className={`text-lg font-black leading-tight ${pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-gray-400">Actuals → Forecast</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={bridgeData} margin={{ top: 28, right: 20, left: 20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: 13, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false}
                    tick={{ fill: CHART_COLORS.axisText, fontSize: 11 }}
                    tickFormatter={v => fmtBig(Number(v), isGSV)} />
                  <Tooltip
                    cursor={{ fill: '#EEF2FB' }}
                    contentStyle={{ borderRadius: '6px', border: `1px solid ${CHART_COLORS.grid}`, fontSize: '12px' }}
                    formatter={(val: any, name: any) => val !== null ? [fmtBig(Number(val), isGSV), name] : []}
                  />
                  <Bar dataKey="SellIn"    name="Sell-In Actuals"   fill={CHART_COLORS.sellIn}      radius={[4,4,0,0]} barSize={48}>
                    <LabelList dataKey="SellIn"    position="top" formatter={(v: any) => v != null ? fmtBig(Number(v), isGSV) : ''} style={{ fontSize: 12, fontWeight: 700, fill: CHART_COLORS.sellIn }} />
                  </Bar>
                  <Bar dataKey="SellOut"   name="Sell-Out Actuals"  fill={CHART_COLORS.sellOut}     radius={[4,4,0,0]} barSize={48}>
                    <LabelList dataKey="SellOut"   position="top" formatter={(v: any) => v != null ? fmtBig(Number(v), isGSV) : ''} style={{ fontSize: 12, fontWeight: 700, fill: CHART_COLORS.sellOut }} />
                  </Bar>
                  <Bar dataKey="SellInFc"  name="Sell-In Forecast"  fill={CHART_COLORS.sellInPrev}  radius={[4,4,0,0]} barSize={48}>
                    <LabelList dataKey="SellInFc"  position="top" formatter={(v: any) => v != null ? fmtBig(Number(v), isGSV) : ''} style={{ fontSize: 12, fontWeight: 700, fill: '#5B8AC4' }} />
                  </Bar>
                  <Bar dataKey="SellOutFc" name="Sell-Out Forecast" fill={CHART_COLORS.sellOutPrev} radius={[4,4,0,0]} barSize={48}>
                    <LabelList dataKey="SellOutFc" position="top" formatter={(v: any) => v != null ? fmtBig(Number(v), isGSV) : ''} style={{ fontSize: 12, fontWeight: 700, fill: '#C45A10' }} />
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Overview;
