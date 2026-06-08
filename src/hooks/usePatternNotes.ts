import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatternNote, PatternFeedback } from '../types/session';
import { fetchPatternNotes, resetAllPatterns, updatePatternFeedback, updatePatternStatus, generatePatterns, backfillEntrySignals, backfillAnalysis, getLatestEntryDate } from '../lib/api';

export function usePatternNotes(authed: boolean, interpretationEnabled: boolean) {
  const [patterns, setPatterns] = useState<PatternNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const backfillRanRef = useRef(false);
  const lastGeneratedRef = useRef<string | null>(null);

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
          setLoading(true);
          try { await backfillAnalysis(); } catch { /* continue */ }
          try { await backfillEntrySignals(); } catch { /* continue */ }
          // Always attempt generation — even if backfill found nothing,
          // there may be entries with existing analysis that can produce patterns.
          const generated = await generatePatterns(true);
          if (!cancelled) {
            lastGeneratedRef.current = new Date().toISOString();
            if (generated.length > 0) {
              setPatterns(generated);
            } else {
              setPatterns(await fetchPatternNotes());
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

  // Reset: restore dismissed cards to active, move saved back to active.
  // Keeps feedback. No regeneration.
  const reset = useCallback(async () => {
    if (!interpretationEnabled) return;
    setLoading(true);
    try {
      const all = await resetAllPatterns();
      setPatterns(all);
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, [interpretationEnabled]);

  // Update: regenerate non-saved cards + potentially create new ones.
  // Skips if no new entries since last generation.
  const update = useCallback(async () => {
    if (!interpretationEnabled) return;
    setUpdating(true);
    try {
      // Check if there are new entries since last generation
      if (lastGeneratedRef.current) {
        const latestEntry = await getLatestEntryDate();
        if (latestEntry && latestEntry <= lastGeneratedRef.current) {
          setUpdating(false);
          return;
        }
      }

      await backfillEntrySignals();
      const notes = await generatePatterns(true);
      lastGeneratedRef.current = new Date().toISOString();

      // Merge: keep saved patterns from current state, add new active ones
      const savedFromCurrent = patterns.filter(p => p.status === 'saved');
      const freshActive = notes.length > 0
        ? notes.filter((n: PatternNote) => n.status === 'active')
        : (await fetchPatternNotes()).filter(p => p.status === 'active');

      setPatterns([...freshActive, ...savedFromCurrent]);
    } catch {
      // keep existing patterns
    } finally {
      setUpdating(false);
    }
  }, [interpretationEnabled, patterns]);

  const submitFeedback = useCallback(async (patternId: string, feedback: PatternFeedback) => {
    await updatePatternFeedback(patternId, feedback);
    setPatterns(prev => prev.map(p => p.id === patternId ? { ...p, userFeedback: feedback } : p));
  }, []);

  const toggleSave = useCallback(async (patternId: string) => {
    const pattern = patterns.find(p => p.id === patternId);
    if (!pattern) return;
    const nextStatus = pattern.status === 'saved' ? 'active' : 'saved';
    await updatePatternStatus(patternId, nextStatus);
    setPatterns(prev => prev.map(p => p.id === patternId ? { ...p, status: nextStatus } : p));
  }, [patterns]);

  const dismiss = useCallback(async (patternId: string) => {
    await updatePatternStatus(patternId, 'dismissed');
    setPatterns(prev => prev.filter(p => p.id !== patternId));
  }, []);

  return { patterns, loading, updating, reset, update, submitFeedback, toggleSave, dismiss };
}
