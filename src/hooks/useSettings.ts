import { useCallback, useEffect, useState } from 'react';
import { getUserSettings, setUserSettings } from '../lib/api';

export function useSettings(authed: boolean) {
  const [interpretationEnabled, setInterpretation] = useState(true);
  const [mbti, setMbtiState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    getUserSettings()
      .then(s => {
        if (!cancelled) {
          setInterpretation(s.interpretationEnabled);
          setMbtiState(s.mbti);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [authed]);

  const setInterpretationEnabled = useCallback(async (next: boolean) => {
    const prev = interpretationEnabled;
    setInterpretation(next);
    try {
      await setUserSettings({ interpretationEnabled: next, mbti });
    } catch {
      setInterpretation(prev);
    }
  }, [interpretationEnabled, mbti]);

  const setMbti = useCallback(async (next: string | null) => {
    const prev = mbti;
    setMbtiState(next);
    try {
      await setUserSettings({ interpretationEnabled, mbti: next });
    } catch {
      setMbtiState(prev);
    }
  }, [interpretationEnabled, mbti]);

  return { interpretationEnabled, setInterpretationEnabled, mbti, setMbti, loaded };
}
