/**
 * Global application context — persona, unit toggle, filters, filter options.
 *
 * All types are imported from src/types/index.ts — no local type definitions here.
 * Inject via useAppContext() hook; never consume AppContext directly.
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { AppState, AppContextType, FilterState, FilterOptions, Persona, Unit } from '../types';

// ── Initial state ─────────────────────────────────────────────────────────────
const emptyFilters: FilterState = {
  Distributor:   [],
  ZREP:          [],
  Year:          [],
  Period:        [],
  Category:      [],
  Planner_group: [],
};

const initialState: AppState = {
  persona:       'Demand Planner',
  unit:          'Cases',
  filters:       emptyFilters,
  filterOptions: emptyFilters,
};

// ── Context creation ──────────────────────────────────────────────────────────
const AppContext = createContext<AppContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────
/**
 * Wrap the application root with AppProvider to expose global state.
 *
 * Args:    children — React subtree that can consume AppContext.
 * Returns: Context provider element.
 */
export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(initialState);

  const setPersona = (persona: Persona) =>
    setState(prev => ({ ...prev, persona }));

  const setUnit = (unit: Unit) =>
    setState(prev => ({ ...prev, unit }));

  const setFilter = (key: keyof FilterState, value: string[] | number[]) =>
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, [key]: value },
    }));

  const setFilterOptions = (filterOptions: FilterOptions) =>
    setState(prev => ({ ...prev, filterOptions }));

  const clearFilters = () =>
    setState(prev => ({ ...prev, filters: emptyFilters }));

  return (
    <AppContext.Provider value={{ state, setPersona, setUnit, setFilter, setFilterOptions, clearFilters }}>
      {children}
    </AppContext.Provider>
  );
};

// ── Consumer hook ─────────────────────────────────────────────────────────────
/**
 * Access the global app context from any child component.
 *
 * Returns: AppContextType — { state, setPersona, setUnit, setFilter, ... }
 * Throws:  Error if called outside an AppProvider.
 */
export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
