/**
 * Custom hook — fetches and populates global filter dropdown options.
 *
 * Abstracts the filter-options API call out of App.tsx so the layout
 * component stays focused on orchestration, not data fetching.
 *
 * Usage:
 *   const { loading, error } = useFilterOptions();
 */

import { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { getFilterOptions } from '../services/dashboardService';

interface UseFilterOptionsResult {
  /** True while the initial options fetch is in-flight. */
  loading: boolean;
  /** Error message if the fetch failed; null otherwise. */
  error:   string | null;
}

/**
 * Fetches filter options once on mount and populates AppContext.
 *
 * Args:    None — reads context internally.
 * Returns: { loading, error } status flags.
 */
const useFilterOptions = (): UseFilterOptionsResult => {
  const { setFilterOptions } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [error,   setError  ] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const options = await getFilterOptions();
        if (!cancelled) setFilterOptions(options);
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? 'Failed to load filter options');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetch();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { loading, error };
};

export default useFilterOptions;
