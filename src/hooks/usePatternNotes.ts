import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatternNote, PatternFeedback } from '../types/session';
import { fetchPatternNotes, updatePatternFeedback, updatePatternStatus, deletePattern, generatePatterns, backfillEntrySignals, backfillAnalysis } from '../lib/api';

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

        const active = dedupeByPrimaryTag(notes.filter(p => p.status === 'active' || p.status === 'watching'));
        const saved = dedupeByPrimaryTag(notes.filter(p => p.status === 'saved'));
        setPatterns([...active, ...saved]);

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
    try {
      await backfillEntrySignals();
      await generatePatterns(true);

      const allNotes = await fetchPatternNotes();
      const updatedActive = dedupeByPrimaryTag(allNotes.filter(p => p.status === 'active' || p.status === 'watching'));

      setPatterns(prev => {
        const savedFromCurrent = prev.filter(p => p.status === 'saved');
        return [...updatedActive, ...savedFromCurrent];
      });
    } catch (err) {
      console.error('[patterns] trickle failed:', err);
    }
  }, [interpretationEnabled]);

  const update = useCallback(async () => {
    if (!interpretationEnabled) return;
    setLoading(true);
    try {
      await triggerTrickle();
    } finally {
      setLoading(false);
    }
  }, [interpretationEnabled, triggerTrickle]);

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

    if (!targetPattern) return;
    if (targetPattern.status !== 'saved' && currentSavedCount >= MAX_SAVED) return;

    const nextStatus = targetPattern.status === 'saved' ? 'active' : 'saved';
    await updatePatternStatus(patternId, nextStatus);
    setPatterns(prev => prev.map(p => p.id === patternId ? { ...p, status: nextStatus as PatternNote['status'] } : p));
  }, []);

  const dismiss = useCallback(async (patternId: string) => {
    await deletePattern(patternId);
    setPatterns(prev => prev.filter(p => p.id !== patternId));
  }, []);

  const savedCount = patterns.filter(p => p.status === 'saved').length;

  return {
    patterns,
    savedCount,
    loading,
    update,
    submitFeedback,
    toggleSave,
    dismiss,
    triggerTrickle,
  };
}
