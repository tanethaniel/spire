import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatternNote, PatternFeedback } from '../types/session';
import { fetchPatternNotes, updatePatternFeedback, clearNewEvidence, refreshPatternSlots } from '../lib/api';

const MAX_SAVED = 20;

export function usePatternNotes(authed: boolean, interpretationEnabled: boolean) {
  const [patterns, setPatterns] = useState<PatternNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const refreshing = useRef(false);
  const patternsRef = useRef<PatternNote[]>([]);
  patternsRef.current = patterns;

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

        if (notes.length === 0) {
          setLoading(true);
          const refreshed = await refreshPatternSlots('refresh');
          if (!cancelled) setPatterns(refreshed);
        } else {
          setPatterns(notes);
        }
      } catch (err) {
        console.error('[patterns] failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authed, interpretationEnabled]);

  const refresh = useCallback(async () => {
    if (!interpretationEnabled || refreshing.current) return;
    refreshing.current = true;
    try {
      const updated = await refreshPatternSlots('refresh');
      setPatterns(updated);
    } finally {
      refreshing.current = false;
    }
  }, [interpretationEnabled]);

  const update = useCallback(async (): Promise<'updated' | 'error'> => {
    if (!interpretationEnabled) return 'error';
    setLoading(true);
    try {
      await refresh();
      return 'updated';
    } catch {
      return 'error';
    } finally {
      setLoading(false);
    }
  }, [interpretationEnabled, refresh]);

  const submitFeedback = useCallback(async (patternId: string, feedback: PatternFeedback) => {
    const prev = patternsRef.current;
    setPatterns(ps => ps.map(p => p.id === patternId ? { ...p, userFeedback: feedback } : p));
    try {
      await updatePatternFeedback(patternId, feedback);
    } catch {
      setPatterns(prev);
      setLastError('Could not save feedback. Please try again.');
    }
  }, []);

  const toggleSave = useCallback(async (patternId: string) => {
    const target = patternsRef.current.find(p => p.id === patternId);
    if (!target) return;

    const savedCount = patternsRef.current.filter(p => p.slotState === 'saved').length;
    if (target.slotState !== 'saved' && savedCount >= MAX_SAVED) return;

    const prev = patternsRef.current;
    const nextAction = target.slotState === 'saved' ? 'refresh' : 'save';

    if (nextAction === 'save') {
      setPatterns(ps => ps.map(p => p.id === patternId ? { ...p, slotState: 'saved', status: 'saved' } : p));
    }

    try {
      const updated = await refreshPatternSlots(nextAction as 'save' | 'refresh', patternId);
      setPatterns(updated);
    } catch {
      setPatterns(prev);
      setLastError('Could not update pattern. Please try again.');
    }
  }, []);

  const dismiss = useCallback(async (patternId: string) => {
    const prev = patternsRef.current;
    setPatterns(ps => ps.filter(p => p.id !== patternId));
    try {
      const updated = await refreshPatternSlots('dismiss', patternId);
      setPatterns(updated);
    } catch {
      setPatterns(prev);
      setLastError('Could not dismiss pattern. Please try again.');
    }
  }, []);

  const markSeen = useCallback(async (patternId: string) => {
    setPatterns(ps => ps.map(p => p.id === patternId ? { ...p, hasNewEvidence: false } : p));
    try {
      await clearNewEvidence(patternId);
    } catch { /* non-critical */ }
  }, []);

  const savedCount = patterns.filter(p => p.slotState === 'saved').length;

  return {
    patterns,
    savedCount,
    loading,
    lastError,
    clearError: useCallback(() => setLastError(null), []),
    update,
    submitFeedback,
    toggleSave,
    dismiss,
    markSeen,
    triggerTrickle: refresh,
  };
}
