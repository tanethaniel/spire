import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatternNote, PatternFeedback, PatternStatus } from '../types/session';
import { fetchPatternNotes, fetchAllPatternNotes, updatePatternFeedback, updatePatternStatus, generatePatterns, backfillEntrySignals, backfillAnalysis } from '../lib/api';

export function usePatternNotes(authed: boolean, interpretationEnabled: boolean) {
  const [patterns, setPatterns] = useState<PatternNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const backfillRanRef = useRef(false);

  useEffect(() => {
    if (!authed || !interpretationEnabled) {
      setPatterns([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const notes = await fetchPatternNotes();
        if (cancelled) return;
        setPatterns(notes);

        if (notes.length === 0 && !backfillRanRef.current) {
          backfillRanRef.current = true;
          console.log('[patterns] No patterns found, starting backfill…');
          setLoading(true);
          const analyzed = await backfillAnalysis();
          console.log(`[patterns] Backfilled analysis for ${analyzed} entries`);
          const extracted = await backfillEntrySignals();
          console.log(`[patterns] Backfilled signals for ${extracted} entries`);
          if (analyzed > 0 || extracted > 0) {
            console.log('[patterns] Generating patterns…');
            const generated = await generatePatterns(true);
            console.log(`[patterns] Generated ${generated.length} patterns`);
            if (!cancelled) {
              if (generated.length > 0) {
                setPatterns(generated);
              } else {
                const fetched = await fetchPatternNotes();
                setPatterns(fetched);
              }
            }
          }
        }
      } catch (err) {
        console.error('[patterns] failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authed, interpretationEnabled]);

  const reset = useCallback(async () => {
    if (!interpretationEnabled) return;
    setLoading(true);
    try {
      const all = await fetchAllPatternNotes();
      setPatterns(all);
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, [interpretationEnabled]);

  const update = useCallback(async () => {
    if (!interpretationEnabled) return;
    setUpdating(true);
    try {
      await backfillEntrySignals();
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
      setUpdating(false);
    }
  }, [interpretationEnabled]);

  const submitFeedback = useCallback(async (patternId: string, feedback: PatternFeedback) => {
    await updatePatternFeedback(patternId, feedback);
    setPatterns(prev => prev.map(p => p.id === patternId ? { ...p, userFeedback: feedback } : p));
  }, []);

  const toggleSave = useCallback(async (patternId: string) => {
    const pattern = patterns.find(p => p.id === patternId);
    if (!pattern) return;
    const nextStatus: PatternStatus = pattern.status === 'saved' ? 'active' : 'saved';
    await updatePatternStatus(patternId, nextStatus);
    setPatterns(prev => prev.map(p => p.id === patternId ? { ...p, status: nextStatus } : p));
  }, [patterns]);

  const dismiss = useCallback(async (patternId: string) => {
    await updatePatternStatus(patternId, 'dismissed');
    setPatterns(prev => prev.filter(p => p.id !== patternId));
  }, []);

  return { patterns, loading, updating, reset, update, submitFeedback, toggleSave, dismiss };
}
