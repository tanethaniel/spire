import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatternNote, PatternFeedback, PatternStatus } from '../types/session';
import { fetchPatternNotes, updatePatternFeedback, updatePatternStatus, generatePatterns, backfillEntrySignals } from '../lib/api';

export function usePatternNotes(authed: boolean, interpretationEnabled: boolean) {
  const [patterns, setPatterns] = useState<PatternNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const backfillRanRef = useRef(false);

  useEffect(() => {
    if (!authed || !interpretationEnabled) {
      setPatterns([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchPatternNotes()
      .then(async (notes) => {
        if (cancelled) return;
        setPatterns(notes);
        // If no patterns exist and we haven't backfilled yet, extract
        // signals from older entries and generate patterns automatically.
        if (notes.length === 0 && !backfillRanRef.current) {
          backfillRanRef.current = true;
          try {
            const extracted = await backfillEntrySignals();
            if (extracted > 0) {
              const generated = await generatePatterns(true);
              if (!cancelled && generated.length > 0) {
                setPatterns(generated);
              } else if (!cancelled) {
                const fetched = await fetchPatternNotes();
                setPatterns(fetched);
              }
            }
          } catch (err) {
            console.error('[usePatternNotes] backfill failed:', err);
          }
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authed, interpretationEnabled]);

  const refresh = useCallback(async () => {
    if (!interpretationEnabled) return;
    setRefreshing(true);
    try {
      const notes = await generatePatterns(true);
      if (notes.length > 0) {
        setPatterns(notes);
      } else {
        const fetched = await fetchPatternNotes();
        setPatterns(fetched);
      }
    } catch {
      // keep existing patterns
    } finally {
      setRefreshing(false);
    }
  }, [interpretationEnabled]);

  const submitFeedback = useCallback(async (patternId: string, feedback: PatternFeedback) => {
    await updatePatternFeedback(patternId, feedback);
    setPatterns(prev => prev.map(p => p.id === patternId ? { ...p, userFeedback: feedback } : p));
  }, []);

  const setStatus = useCallback(async (patternId: string, status: PatternStatus) => {
    await updatePatternStatus(patternId, status);
    if (status === 'dismissed' || status === 'archived') {
      setPatterns(prev => prev.filter(p => p.id !== patternId));
    } else {
      setPatterns(prev => prev.map(p => p.id === patternId ? { ...p, status } : p));
    }
  }, []);

  return { patterns, loading, refreshing, refresh, submitFeedback, setStatus };
}
