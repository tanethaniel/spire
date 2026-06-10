import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatternNote, PatternFeedback } from '../types/session';
import { fetchPatternNotes, resetAllPatterns, updatePatternFeedback, updatePatternStatus, generatePatterns, backfillEntrySignals, backfillAnalysis } from '../lib/api';

const TOAST_STORAGE_KEY = 'spire_archive_toasts';
const MAX_SAVED = 20;

function dedupeByPrimaryTag(notes: PatternNote[]): PatternNote[] {
  const seen = new Set<string>();
  return notes.filter(p => {
    const tag = (p.relatedTags ?? [])[0]?.toLowerCase() ?? p.id;
    if (seen.has(tag)) return false;
    seen.add(tag);
    return true;
  });
}

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

        const active = dedupeByPrimaryTag(notes.filter(p => p.status === 'active' || p.status === 'watching'));
        const saved = dedupeByPrimaryTag(notes.filter(p => p.status === 'saved'));
        const archived = dedupeByPrimaryTag(notes.filter(p => p.status === 'archived'));
        setPatterns([...active, ...saved]);
        setArchivedPatterns(archived);

        if (active.length === 0 && saved.length === 0 && !backfillRanRef.current) {
          backfillRanRef.current = true;
          setLoading(true);
          try { await backfillAnalysis(); } catch { /* continue */ }
          try { await backfillEntrySignals(); } catch { /* continue */ }
          const { patterns: generated } = await generatePatterns(true);
          if (!cancelled) {
            if (generated.length > 0) {
              setPatterns(generated);
            } else {
              const fresh = await fetchPatternNotes();
              const freshActive = dedupeByPrimaryTag(fresh.filter(p => p.status === 'active' || p.status === 'watching'));
              const freshSaved = dedupeByPrimaryTag(fresh.filter(p => p.status === 'saved'));
              const freshArchived = dedupeByPrimaryTag(fresh.filter(p => p.status === 'archived'));
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
      const { archivedTitles } = await generatePatterns(true);

      if (archivedTitles.length > 0) {
        setArchivedToasts(prev => {
          const next = [...prev, ...archivedTitles];
          storeToasts(next);
          return next;
        });
      }

      const allNotes = await fetchPatternNotes();
      const updatedActive = dedupeByPrimaryTag(allNotes.filter(p => p.status === 'active' || p.status === 'watching'));
      const updatedArchived = dedupeByPrimaryTag(allNotes.filter(p => p.status === 'archived'));

      setPatterns(prev => {
        const savedFromCurrent = prev.filter(p => p.status === 'saved');
        return [...updatedActive, ...savedFromCurrent];
      });
      setArchivedPatterns(updatedArchived);
    } catch (err) {
      console.error('[patterns] trickle failed:', err);
    }
  }, [interpretationEnabled]);

  const submitFeedback = useCallback(async (patternId: string, feedback: PatternFeedback) => {
    await updatePatternFeedback(patternId, feedback);
    setPatterns(prev => prev.map(p => p.id === patternId ? { ...p, userFeedback: feedback } : p));
  }, []);

  const toggleSave = useCallback(async (patternId: string) => {
    let targetPattern: PatternNote | undefined;
    let currentSavedCount = 0;

    setPatterns(prev => {
      targetPattern = prev.find(p => p.id === patternId);
      currentSavedCount = prev.filter(p => p.status === 'saved').length;
      return prev;
    });

    if (!targetPattern) {
      setArchivedPatterns(prev => {
        targetPattern = prev.find(p => p.id === patternId);
        return prev;
      });
    }

    if (!targetPattern) return;

    if (targetPattern.status !== 'saved' && currentSavedCount >= MAX_SAVED) return;

    const nextStatus = targetPattern.status === 'saved' ? 'active' : 'saved';
    await updatePatternStatus(patternId, nextStatus);

    if (targetPattern.status === 'archived') {
      setArchivedPatterns(prev => prev.filter(p => p.id !== patternId));
      setPatterns(prev => [...prev, { ...targetPattern!, status: 'saved' }]);
    } else {
      setPatterns(prev => prev.map(p => p.id === patternId ? { ...p, status: nextStatus as PatternNote['status'] } : p));
    }
  }, []);

  const archive = useCallback(async (patternId: string) => {
    await updatePatternStatus(patternId, 'archived');
    setPatterns(prev => {
      const pattern = prev.find(p => p.id === patternId);
      if (pattern) {
        setArchivedPatterns(ap => [{ ...pattern, status: 'archived' }, ...ap]);
      }
      return prev.filter(p => p.id !== patternId);
    });
  }, []);

  const dismissToast = useCallback((title: string) => {
    setArchivedToasts(prev => {
      const next = prev.filter(t => t !== title);
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
