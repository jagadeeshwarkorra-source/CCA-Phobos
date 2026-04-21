/**
 * Application root — routing, layout, global nav, filter bar.
 *
 * Data fetching (filter options) is delegated to useFilterOptions hook.
 * API calls are injected via dashboardService — no direct fetch() here.
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { AppProvider, useAppContext } from './context/AppContext';
import { MultiSelect } from './components/MultiSelect';
import ErrorBoundary from './components/ErrorBoundary';
import useFilterOptions from './hooks/useFilterOptions';
import Overview from './pages/Overview';
import DetailedView from './pages/DetailedView';
import ScenarioBuilder from './pages/ScenarioBuilder';
import FreezeView from './pages/FreezeView';
import AccuracyComparison from './pages/AccuracyComparison';
import { LayoutDashboard, Table, Sliders, CheckSquare, UserCircle, Target } from 'lucide-react';
import { BRAND } from './constants/colors';
import { APP_BRAND, APP_TITLE, APP_SUBTITLE } from './constants/config';

// ── Nav link style helper ─────────────────────────────────────────────────────
const navCls = (isActive: boolean, activeBorder = 'border-mars-navy', activeBg = 'bg-mars-blue-pale') =>
  `flex items-center gap-1.5 px-4 h-full text-sm font-semibold border-b-[3px] transition-colors ${
    isActive
      ? `${activeBorder} text-mars-navy ${activeBg}`
      : 'border-transparent text-gray-500 hover:text-mars-navy hover:bg-mars-blue-pale'
  }`;

// ── Main layout ───────────────────────────────────────────────────────────────
const MainLayout: React.FC = () => {
  const { state, setPersona, setUnit, setFilter } = useAppContext();
  const location    = useLocation();
  const isOverview  = location.pathname === '/';
  const showToggle  = location.pathname === '/' || location.pathname === '/details';

  // Filter options are loaded once on mount via the custom hook
  useFilterOptions();

  return (
    <div className="min-h-screen flex flex-col bg-mars-blue-pale">

      {/* ── Top Brand Bar ── */}
      <div className="text-white px-6 py-2 flex justify-between items-center"
           style={{ backgroundColor: BRAND.navy }}>
        <div className="flex items-center gap-3">
          <div className="flex flex-col leading-none">
            <span className="text-base font-black tracking-widest text-white">{APP_BRAND}</span>
            <span className="text-[10px] font-semibold tracking-wider text-mars-blue-light uppercase">{APP_SUBTITLE}</span>
          </div>
          <div className="w-px h-8 bg-white/20 mx-2" />
          <span className="text-lg font-bold tracking-wide text-white">{APP_TITLE}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Persona switcher */}
          <div className="flex items-center text-xs border border-white/30 rounded overflow-hidden">
            {(['Demand Planner', 'Demand Lead'] as const).map(p => (
              <button
                key={p}
                className={`px-3 py-1.5 font-semibold transition-colors ${
                  state.persona === p ? 'bg-white text-mars-navy' : 'bg-transparent text-white/80 hover:bg-white/10'
                }`}
                onClick={() => setPersona(p)}
              >
                {p}
              </button>
            ))}
          </div>
          <UserCircle className="text-white/60" size={28} />
        </div>
      </div>

      {/* ── Navigation Tab Bar ── */}
      <div className="bg-white border-b-2 border-mars-blue-light shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 flex items-center h-11">
          <nav className="flex h-full flex-1">
            <NavLink to="/" end className={({ isActive }) => navCls(isActive)}>
              <LayoutDashboard size={15} /> Overview
            </NavLink>
            <NavLink to="/details" className={({ isActive }) => navCls(isActive)}>
              <Table size={15} /> Detailed View
            </NavLink>
            <NavLink to="/scenario" className={({ isActive }) => navCls(isActive)}>
              <Sliders size={15} /> Scenario Builder
            </NavLink>
            <NavLink to="/accuracy"
              className={({ isActive }) => navCls(isActive, 'border-green-600', 'bg-green-50') + (isActive ? '' : ' hover:text-green-700 hover:bg-green-50')}>
              <Target size={15} /> Accuracy
            </NavLink>
            {state.persona === 'Demand Lead' && (
              <NavLink to="/freeze"
                className={({ isActive }) => navCls(isActive, 'border-mars-orange', 'bg-orange-50') + (isActive ? '' : ' hover:text-mars-orange hover:bg-orange-50')}>
                <CheckSquare size={15} /> Scenario Confirmation
              </NavLink>
            )}
          </nav>

          {/* Cases / GSV toggle — Overview and Detailed View only */}
          {showToggle && (
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Unit</span>
              <div className="flex items-center border border-mars-blue-light rounded overflow-hidden text-xs">
                {(['Cases', 'GSV'] as const).map((u, i) => (
                  <button
                    key={u}
                    className={`px-3 py-1 font-bold transition-colors ${i > 0 ? 'border-l border-mars-blue-light' : ''} ${
                      state.unit === u ? 'bg-mars-navy text-white' : 'text-gray-500 hover:bg-mars-blue-pale'
                    }`}
                    onClick={() => setUnit(u)}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Global Filters Bar ── */}
      <div className="bg-white border-b border-gray-200 shadow-sm relative z-30 px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-4 items-end">
          <MultiSelect label="Variety / Distributor" options={state.filterOptions.Distributor}            selected={state.filters.Distributor}          onChange={v => setFilter('Distributor', v)} />
          <MultiSelect label="Network / ZREP"         options={state.filterOptions.ZREP}                 selected={state.filters.ZREP}                 onChange={v => setFilter('ZREP', v)} />
          {!isOverview && <MultiSelect label="Year"   options={state.filterOptions.Year.map(String)}     selected={state.filters.Year.map(String)}     onChange={v => setFilter('Year', v.map(Number))} />}
          {!isOverview && <MultiSelect label="Period" options={state.filterOptions.Period.map(String)}   selected={state.filters.Period.map(String)}   onChange={v => setFilter('Period', v.map(Number))} />}
          <MultiSelect label="Category"               options={state.filterOptions.Category}             selected={state.filters.Category}              onChange={v => setFilter('Category', v)} />
          <MultiSelect label="Planner Group"          options={state.filterOptions.Planner_group}        selected={state.filters.Planner_group}         onChange={v => setFilter('Planner_group', v)} />
        </div>
      </div>

      {/* ── Main Content ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Routes>
          <Route path="/"         element={<Overview />} />
          <Route path="/details"  element={<DetailedView />} />
          <Route path="/scenario" element={<ScenarioBuilder />} />
          <Route path="/accuracy" element={<AccuracyComparison />} />
          {state.persona === 'Demand Lead' && (
            <Route path="/freeze" element={<FreezeView />} />
          )}
        </Routes>
      </main>
    </div>
  );
};

// ── App root ──────────────────────────────────────────────────────────────────
function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AppProvider>
          <MainLayout />
        </AppProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
