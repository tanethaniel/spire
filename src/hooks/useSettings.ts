import { useCallback, useEffect, useState } from 'react';
import { getUserSettings, setUserSettings } from '../lib/api';

// Loads and persists the synced interpretation preference. Defaults to
// Interpreted mode (true) until the server responds, so first-run users get
// the full experience. Writes are optimistic and reverted on failure.
export function useSettings(authed: boolean) {
  const [interpretationEnabled, setInterpretation] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    getUserSettings()
      .then(s => { if (!cancelled) setInterpretation(s.interpretationEnabled); })
      .catch(() => { /* keep default */ })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [authed]);

  const setInterpretationEnabled = useCallback(async (next: boolean) => {
    const prev = interpretationEnabled;
    setInterpretation(next); // optimistic
    try {
      await setUserSettings({ interpretationEnabled: next });
    } catch {
      setInterpretation(prev); // revert on failure
    }
  }, [interpretationEnabled]);

  return { interpretationEnabled, setInterpretationEnabled, loaded };
}
