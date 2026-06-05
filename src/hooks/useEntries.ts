import { useCallback, useEffect, useState } from 'react';
import type { JournalEntry } from '../types/session';
import { fetchJournalEntries } from '../lib/api';

// Loads the user's past entries for History and Insights. Exposes a refresh so
// a freshly completed session can show up without a full reload.
export function useEntries(authed: boolean) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setEntries(await fetchJournalEntries());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount is the intended pattern here; refresh sets loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (authed) refresh();
  }, [authed, refresh]);

  return { entries, loading, error, refresh };
}
