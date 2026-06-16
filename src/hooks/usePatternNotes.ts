import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatternNote, PatternFeedback } from '../types/session';
import { fetchPatternNotes, updatePatternFeedback, updatePatternStatus, deletePattern, generatePatterns, backfillEntrySignals, backfillAnalysis, rewritePatternsSplit } from '../lib/api';

const MAX_SAVED = 20;

const CATEGORY_TAGS = new Set([
  'recurring', 'mood_driver', 'activity_mood', 'calendar', 'stress',
  'emotion', 'self_belief', 'recurring_theme', 'mood_correlation',
  'activity_mood_link', 'calendar_pattern', 'self_perception', 'contextual_blend',
]);

function dedupeByPrimaryTag(notes: PatternNote[]): PatternNote[] {
  const seenIds = new Set<string>();
  const seenTags = new Set<string>();
  return notes.filter(p => {
    if (seenIds.has(p.id)) return false;
    seenIds.add(p.id);
    const tags = (p.relatedTags ?? []).map(t => t.toLowerCase()).filter(t => !CATEGORY_TAGS.has(t));
    if (tags.length === 0) return true;
    if (tags.some(t => seenTags.has(t))) return false;
    for (const t of tags) seenTags.add(t);
    return true;
  });
}

export function usePatternNotes(authed: boolean, interpretationEnabled: boolean) {
  const [patterns, setPatterns] = useState<PatternNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const backfillRanRef = useRef(false);
  const trickleInFlight = useRef(false);
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

        const active = dedupeByPrimaryTag(notes.filter(p => p.status === 'active' || p.status === 'watching'));
        const saved = dedupeByPrimaryTag(notes.filter(p => p.status === 'saved'));
        setPatterns([...active, ...saved]);

        // One-time migration: rewrite patterns to populate proper preview/full notes
        // Detect by checking if full_note equals note (migration backfill copies note → full_note)
        const needsSplit = [...active, ...saved].some(p => !p.fullNote || p.fullNote === p.note);
        if (needsSplit && !backfillRanRef.current) {
          rewritePatternsSplit().then(async (count) => {
            if (count > 0 && !cancelled) {
              const refreshed = await fetchPatternNotes();
              const rActive = dedupeByPrimaryTag(refreshed.filter(p => p.status === 'active' || p.status === 'watching'));
              const rSaved = dedupeByPrimaryTag(refreshed.filter(p => p.status === 'saved'));
              setPatterns([...rActive, ...rSaved]);
            }
          }).catch(() => {});
        }

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
              setPatterns([...freshActive, ...freshSaved]);
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

  const triggerTrickle = useCallback(async () => {
    if (!interpretationEnabled) return;
    if (trickleInFlight.current) return;
    trickleInFlight.current = true;
    try {
      await backfillEntrySignals();
      await generatePatterns(true);

      const allNotes = await fetchPatternNotes();
      const updatedActive = dedupeByPrimaryTag(allNotes.filter(p => p.status === 'active' || p.status === 'watching'));

      setPatterns(prev => {
        const savedFromCurrent = prev.filter(p => p.status === 'saved');
        return [...updatedActive, ...savedFromCurrent];
      });
    } finally {
      trickleInFlight.current = false;
    }
  }, [interpretationEnabled]);

  const update = useCallback(async (): Promise<'updated' | 'error'> => {
    if (!interpretationEnabled) return 'error';
    setLoading(true);
    try {
      await triggerTrickle();
      return 'updated';
    } catch {
      return 'error';
    } finally {
      setLoading(false);
    }
  }, [interpretationEnabled, triggerTrickle]);

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
    const targetPattern = patternsRef.current.find(p => p.id === patternId);
    if (!targetPattern) return;

    const currentSavedCount = patternsRef.current.filter(p => p.status === 'saved').length;
    if (targetPattern.status !== 'saved' && currentSavedCount >= MAX_SAVED) return;

    const prev = patternsRef.current;
    const nextStatus = targetPattern.status === 'saved' ? 'active' : 'saved';
    setPatterns(ps => ps.map(p => p.id === patternId ? { ...p, status: nextStatus as PatternNote['status'] } : p));
    try {
      await updatePatternStatus(patternId, nextStatus);
      if (nextStatus === 'saved') {
        triggerTrickle().catch(() => {});
      }
    } catch {
      setPatterns(prev);
      setLastError('Could not update pattern. Please try again.');
    }
  }, [triggerTrickle]);

  const dismiss = useCallback(async (patternId: string) => {
    const prev = patternsRef.current;
    setPatterns(ps => ps.filter(p => p.id !== patternId));
    try {
      await deletePattern(patternId);
      triggerTrickle().catch(() => {});
    } catch {
      setPatterns(prev);
      setLastError('Could not dismiss pattern. Please try again.');
    }
  }, [triggerTrickle]);

  const savedCount = patterns.filter(p => p.status === 'saved').length;

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
    triggerTrickle,
  };
}
