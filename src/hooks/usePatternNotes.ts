import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatternNote, PatternFeedback } from '../types/session';
import { fetchPatternNotes, resetAllPatterns, updatePatternFeedback, updatePatternStatus, generatePatterns, backfillEntrySignals, backfillAnalysis } from '../lib/api';

const TOAST_STORAGE_KEY = 'spire_archive_toasts';
const MAX_SAVED = 20;

function loadStoredToasts(): string[] {
  try {
    const raw = localStorage.getItem(TOAST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function storeToasts(titles: string[]) {
  try {
    if (titles.length === 0) localStorage.removeItem(TOAST_STORAGE_KEY);
    else localStorage.setItem(TOAST_STORAGE_KEY, JSON.stringify(titles));
  } catch { /* ignore */ }
}

export function usePatternNotes(authed: boolean, interpretationEnabled: boolean) {
  const [patterns, setPatterns] = useState<PatternNote[]>([]);
  const [archivedPatterns, setArchivedPatterns] = useState<PatternNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [archivedToasts, setArchivedToasts] = useState<string[]>(loadStoredToasts);
  const backfillRanRef = useRef(false);

  useEffect(() => {
    if (!authed || !interpretationEnabled) {
      setPatterns([]);
      setArchivedPatterns([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const notes = await fetchPatternNotes();
        if (cancelled) return;

        const active = notes.filter(p => p.status === 'active' || p.status === 'watching');
        const saved = notes.filter(p => p.status === 'saved');
        const archived = notes.filter(p => p.status === 'archived');
        setPatterns([...active, ...saved]);
        setArchivedPatterns(archived);

        if (active.length === 0 && saved.length === 0 && !backfillRanRef.current) {
          backfillRanRef.current = true;
          setLoading(true);
          try { await backfillAnalysis(); } catch { /* continue */ }
          try { await backfillEntrySignals(); } catch { /* continue */ }
          const { patterns: generated } = await generatePatterns(true, 'full');
          if (!cancelled) {
            if (generated.length > 0) {
              setPatterns(generated);
            } else {
              const fresh = await fetchPatternNotes();
              const freshActive = fresh.filter(p => p.status === 'active' || p.status === 'watching');
              const freshSaved = fresh.filter(p => p.status === 'saved');
              const freshArchived = fresh.filter(p => p.status === 'archived');
              setPatterns([...freshActive, ...freshSaved]);
              setArchivedPatterns(freshArchived);
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
      const all = await resetAllPatterns();
      setPatterns(all);
      const fresh = await fetchPatternNotes();
      setArchivedPatterns(fresh.filter(p => p.status === 'archived'));
    } catch {
      // keep existing
    } finally {
      setLoading(false);
    }
  }, [interpretationEnabled]);

  const triggerTrickle = useCallback(async () => {
    if (!interpretationEnabled) return;
    try {
      await backfillEntrySignals();
      const { patterns: result, archivedTitles } = await generatePatterns(true, 'trickle');

      if (archivedTitles.length > 0) {
        const newToasts = [...archivedToasts, ...archivedTitles];
        setArchivedToasts(newToasts);
        storeToasts(newToasts);
      }

      // Merge: keep saved from current state, add fresh active
      const savedFromCurrent = patterns.filter(p => p.status === 'saved');
      if (result.length > 0) {
        const freshActive = result.filter(p => p.status === 'active');
        // Re-fetch to get updated active cards (trickle updates in place)
        const allNotes = await fetchPatternNotes();
        const updatedActive = allNotes.filter(p => p.status === 'active' || p.status === 'watching');
        const updatedArchived = allNotes.filter(p => p.status === 'archived');
        setPatterns([...updatedActive, ...savedFromCurrent]);
        setArchivedPatterns(updatedArchived);
      } else {
        // No new results, but re-fetch in case updates happened
        const allNotes = await fetchPatternNotes();
        const updatedActive = allNotes.filter(p => p.status === 'active' || p.status === 'watching');
        const updatedArchived = allNotes.filter(p => p.status === 'archived');
        setPatterns([...updatedActive, ...savedFromCurrent]);
        setArchivedPatterns(updatedArchived);
      }
    } catch (err) {
      console.error('[patterns] trickle failed:', err);
    }
  }, [interpretationEnabled, patterns, archivedToasts]);

  const submitFeedback = useCallback(async (patternId: string, feedback: PatternFeedback) => {
    await updatePatternFeedback(patternId, feedback);
    setPatterns(prev => prev.map(p => p.id === patternId ? { ...p, userFeedback: feedback } : p));
  }, []);

  const toggleSave = useCallback(async (patternId: string) => {
    const pattern = patterns.find(p => p.id === patternId)
      ?? archivedPatterns.find(p => p.id === patternId);
    if (!pattern) return;

    if (pattern.status !== 'saved') {
      // Check saved cap
      const savedCount = patterns.filter(p => p.status === 'saved').length;
      if (savedCount >= MAX_SAVED) return;
    }

    const nextStatus = pattern.status === 'saved' ? 'active' : 'saved';
    await updatePatternStatus(patternId, nextStatus);

    if (pattern.status === 'archived') {
      // Saving from archive: move to patterns list
      setArchivedPatterns(prev => prev.filter(p => p.id !== patternId));
      setPatterns(prev => [...prev, { ...pattern, status: 'saved' }]);
    } else {
      setPatterns(prev => prev.map(p => p.id === patternId ? { ...p, status: nextStatus } : p));
    }
  }, [patterns, archivedPatterns]);

  const archive = useCallback(async (patternId: string) => {
    await updatePatternStatus(patternId, 'archived');
    const pattern = patterns.find(p => p.id === patternId);
    setPatterns(prev => prev.filter(p => p.id !== patternId));
    if (pattern) {
      setArchivedPatterns(prev => [{ ...pattern, status: 'archived' }, ...prev]);
    }
  }, [patterns]);

  const dismissToast = useCallback((index: number) => {
    setArchivedToasts(prev => {
      const next = prev.filter((_, i) => i !== index);
      storeToasts(next);
      return next;
    });
  }, []);

  const savedCount = patterns.filter(p => p.status === 'saved').length;

  return {
    patterns,
    archivedPatterns,
    savedCount,
    loading,
    archivedToasts,
    dismissToast,
    reset,
    submitFeedback,
    toggleSave,
    archive,
    triggerTrickle,
  };
}
