import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('SITE_URL') || 'http://localhost:5173';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_PATTERNS_PER_DAY = 5;
const MAX_CANDIDATES = 10;
const MAX_ACTIVE_CARDS = 7;
const AUTO_ARCHIVE_DAYS = 14;
const MIN_ACTIVE_FLOOR = 2;

const TRANSCRIPT_FIELDS = [
  'q1_transcript', 'q2_transcript', 'q3_transcript',
  'q4_transcript', 'q5_transcript', 'q6_transcript',
] as const;

const NEGATIVE_EMOTIONS = new Set([
  'tired', 'anxious', 'overwhelmed', 'stressed', 'scattered', 'drained', 'sad', 'angry', 'bored',
]);

const RECOVERY_ACTIVITIES = new Set([
  'gym', 'walking', 'rest', 'reading', 'friends', 'sleep', 'yoga', 'running', 'cooking', 'creative work', 'partner', 'family',
]);

const RELATIONSHIP_CONTEXTS = new Set([
  'manager', 'coworkers', 'friends', 'family', 'partner',
]);

const GOAL_SIGNAL_MAP: Record<string, string[]> = {
  'feel more grounded': ['recovery', 'energy'],
  'understand my emotions': ['emotion', 'self_belief'],
  'build better habits': ['activity', 'recovery'],
  'process relationships': ['relationship', 'social_context'],
  'reflect on work': ['work', 'stress'],
  'find more balance': ['energy', 'recovery', 'stress'],
};

interface Candidate {
  type: string;
  signal: string;
  confidence: 'early_signal' | 'emerging_pattern' | 'strong_pattern';
  confidence_reason: string;
  supporting_days: number;
  mood_delta: number | null;
  calendar_context: { day_density: string; common_context: string } | null;
  quotes: { date: string; question_index: number; quote: string }[];
  entry_ids: string[];
  tags: string[];
  evidence_summary: string;
}

interface SignalRow {
  id: string;
  entry_id: string;
  signal_type: string;
  signal_value: string;
  normalized_value: string;
  quote: string;
  question_index: number;
  sentiment: number | null;
  confidence: number;
  journal_entries: {
    id: string;
    created_at: string;
    mood_score: number | null;
    emotion_tag: string | null;
    activity_tags: string[] | null;
    keyword_tags: string[] | null;
    themes: string[] | null;
    event_context: string | null;
  } | null;
}

interface EntryRow {
  id: string;
  created_at: string;
  mood_score: number | null;
  emotion_tag: string | null;
  activity_tags: string[] | null;
  keyword_tags: string[] | null;
  themes: string[] | null;
  event_context: string | null;
  q1_transcript: string | null;
  q2_transcript: string | null;
  q3_transcript: string | null;
  q4_transcript: string | null;
  q5_transcript: string | null;
  q6_transcript: string | null;
}

interface CalendarSignal {
  id: string;
  date: string;
  day_density: string | null;
  event_count: number | null;
  common_context: string | null;
}

interface PatternInsight {
  id: string;
  pattern_type: string;
  related_tags: string[] | null;
  status: string;
  user_feedback: string | null;
  title: string | null;
  note: string | null;
  supporting_entry_ids: string[] | null;
  confidence: string | null;
  evidence_count: number | null;
  updated_at: string | null;
  last_interacted_at: string | null;
}

const CONFIDENCE_RANK: Record<string, number> = {
  strong_pattern: 3,
  emerging_pattern: 2,
  early_signal: 1,
};

function toDateStr(d: string): string {
  return d.slice(0, 10);
}

function assignConfidence(
  entryCount: number,
  distinctDays: number,
  spanWeeks: number,
): { confidence: Candidate['confidence']; reason: string } {
  if (entryCount >= 5 || spanWeeks >= 3) {
    return { confidence: 'strong_pattern', reason: `${entryCount} entries across ${spanWeeks}+ weeks` };
  }
  if (entryCount >= 3 && distinctDays >= 2) {
    return { confidence: 'emerging_pattern', reason: `${entryCount} entries across ${distinctDays} days` };
  }
  return { confidence: 'early_signal', reason: `${entryCount} supporting entries` };
}

function distinctDaysFromDates(dates: string[]): number {
  return new Set(dates.map(toDateStr)).size;
}

function weekSpan(dates: string[]): number {
  if (dates.length < 2) return 0;
  const sorted = dates.map(d => new Date(d).getTime()).sort((a, b) => a - b);
  return Math.floor((sorted[sorted.length - 1] - sorted[0]) / (7 * 24 * 60 * 60 * 1000));
}

function buildCandidates(
  entries: EntryRow[],
  signals: SignalRow[],
  calendarSignals: CalendarSignal[],
  existingPatterns: PatternInsight[],
  goal: string | null,
): Candidate[] {
  const candidates: Candidate[] = [];

  // Index signals by normalized_value
  const signalsByValue = new Map<string, SignalRow[]>();
  const signalsByType = new Map<string, SignalRow[]>();
  for (const s of signals) {
    const key = s.normalized_value?.toLowerCase() || '';
    if (!signalsByValue.has(key)) signalsByValue.set(key, []);
    signalsByValue.get(key)!.push(s);
    const t = s.signal_type;
    if (!signalsByType.has(t)) signalsByType.set(t, []);
    signalsByType.get(t)!.push(s);
  }

  // Compute overall average mood
  const moodEntries = entries.filter(e => e.mood_score != null);
  const avgMood = moodEntries.length > 0
    ? moodEntries.reduce((sum, e) => sum + e.mood_score!, 0) / moodEntries.length
    : null;

  // Build calendar day map
  const busyDays = new Map<string, CalendarSignal>();
  for (const cs of calendarSignals) {
    if (cs.day_density === 'busy' || cs.day_density === 'packed') {
      busyDays.set(cs.date, cs);
    }
  }

  // --- Candidate: Recurring Theme ---
  for (const [value, sigs] of signalsByValue) {
    if (!value) continue;
    const days = distinctDaysFromDates(sigs.map(s => s.journal_entries?.created_at || '').filter(Boolean));
    const pct = entries.length > 0 ? sigs.length / entries.length : 0;
    if (days >= 2 || pct >= 0.3) {
      const dates = sigs.map(s => s.journal_entries?.created_at || '').filter(Boolean);
      const { confidence, reason } = assignConfidence(sigs.length, days, weekSpan(dates));
      candidates.push({
        type: 'recurring_theme',
        signal: value,
        confidence,
        confidence_reason: reason,
        supporting_days: days,
        mood_delta: null,
        calendar_context: null,
        quotes: sigs.slice(0, 5).map(s => ({
          date: s.journal_entries?.created_at || '',
          question_index: s.question_index,
          quote: s.quote,
        })),
        entry_ids: [...new Set(sigs.map(s => s.entry_id))],
        tags: [value, sigs[0].signal_type],
        evidence_summary: `"${value}" appeared on ${days} distinct days (${sigs.length} mentions).`,
      });
    }
  }

  // --- Candidate: Mood Driver ---
  for (const [value, sigs] of signalsByValue) {
    if (!value) continue;
    const entryIdsWithTag = new Set(sigs.map(s => s.entry_id));
    const daysWithTag = distinctDaysFromDates(
      sigs.map(s => s.journal_entries?.created_at || '').filter(Boolean),
    );
    if (daysWithTag < 2) continue;

    const withTagMoods: number[] = [];
    const withoutTagMoods: number[] = [];
    for (const e of entries) {
      if (e.mood_score == null) continue;
      if (entryIdsWithTag.has(e.id)) {
        withTagMoods.push(e.mood_score);
      } else {
        withoutTagMoods.push(e.mood_score);
      }
    }
    if (withoutTagMoods.length < 2) continue;
    const avgWith = withTagMoods.reduce((a, b) => a + b, 0) / withTagMoods.length;
    const avgWithout = withoutTagMoods.reduce((a, b) => a + b, 0) / withoutTagMoods.length;
    const delta = avgWith - avgWithout;
    if (Math.abs(delta) < 0.5) continue;

    const quoteSigs = sigs.filter(s => s.quote);
    if (quoteSigs.length < 1) continue;

    const dates = sigs.map(s => s.journal_entries?.created_at || '').filter(Boolean);
    const { confidence, reason } = assignConfidence(sigs.length, daysWithTag, weekSpan(dates));
    candidates.push({
      type: 'mood_driver',
      signal: value,
      confidence,
      confidence_reason: reason,
      supporting_days: daysWithTag,
      mood_delta: Math.round(delta * 100) / 100,
      calendar_context: null,
      quotes: quoteSigs.slice(0, 5).map(s => ({
        date: s.journal_entries?.created_at || '',
        question_index: s.question_index,
        quote: s.quote,
      })),
      entry_ids: [...entryIdsWithTag],
      tags: [value, sigs[0].signal_type],
      evidence_summary: `Mood is ${delta > 0 ? 'higher' : 'lower'} by ${Math.abs(delta).toFixed(1)} on days with "${value}" (${daysWithTag} days).`,
    });
  }

  // --- Candidate: Calendar Load ---
  if (busyDays.size >= 3) {
    const busyDateStrs = new Set([...busyDays.keys()]);
    const negativeOnBusy: SignalRow[] = [];
    for (const s of signals) {
      const entryDate = toDateStr(s.journal_entries?.created_at || '');
      if (busyDateStrs.has(entryDate) && NEGATIVE_EMOTIONS.has(s.normalized_value)) {
        negativeOnBusy.push(s);
      }
    }
    if (negativeOnBusy.length >= 2) {
      const dates = negativeOnBusy.map(s => s.journal_entries?.created_at || '').filter(Boolean);
      const days = distinctDaysFromDates(dates);
      const { confidence, reason } = assignConfidence(negativeOnBusy.length, days, weekSpan(dates));
      const commonContexts = [...busyDays.values()]
        .map(c => c.common_context)
        .filter(Boolean)
        .slice(0, 3);
      candidates.push({
        type: 'calendar_load',
        signal: 'busy days + negative emotion',
        confidence,
        confidence_reason: reason,
        supporting_days: days,
        mood_delta: null,
        calendar_context: {
          day_density: 'busy/packed',
          common_context: commonContexts.join(', ') || 'meetings',
        },
        quotes: negativeOnBusy.slice(0, 5).map(s => ({
          date: s.journal_entries?.created_at || '',
          question_index: s.question_index,
          quote: s.quote,
        })),
        entry_ids: [...new Set(negativeOnBusy.map(s => s.entry_id))],
        tags: ['calendar', 'stress', ...negativeOnBusy.map(s => s.normalized_value).filter(Boolean)],
        evidence_summary: `${busyDays.size} busy/packed calendar days co-occurred with negative emotions (${negativeOnBusy.length} signals).`,
      });
    }
  }

  // --- Candidate: Recovery Signal ---
  if (avgMood != null) {
    const recoverySignals: SignalRow[] = [];
    for (const s of signals) {
      if (RECOVERY_ACTIVITIES.has(s.normalized_value) && s.journal_entries?.mood_score != null) {
        if (s.journal_entries.mood_score >= avgMood + 0.5) {
          recoverySignals.push(s);
        }
      }
    }
    const days = distinctDaysFromDates(
      recoverySignals.map(s => s.journal_entries?.created_at || '').filter(Boolean),
    );
    if (days >= 2) {
      const dates = recoverySignals.map(s => s.journal_entries?.created_at || '').filter(Boolean);
      const { confidence, reason } = assignConfidence(recoverySignals.length, days, weekSpan(dates));
      const activities = [...new Set(recoverySignals.map(s => s.normalized_value))].slice(0, 4);
      candidates.push({
        type: 'recovery_signal',
        signal: activities.join(', '),
        confidence,
        confidence_reason: reason,
        supporting_days: days,
        mood_delta: null,
        calendar_context: null,
        quotes: recoverySignals.slice(0, 5).map(s => ({
          date: s.journal_entries?.created_at || '',
          question_index: s.question_index,
          quote: s.quote,
        })),
        entry_ids: [...new Set(recoverySignals.map(s => s.entry_id))],
        tags: activities,
        evidence_summary: `Activities like ${activities.join(', ')} appeared on ${days} days with above-average mood.`,
      });
    }
  }

  // --- Candidate: Relationship Pattern ---
  for (const ctx of RELATIONSHIP_CONTEXTS) {
    const relSignals = signals.filter(s =>
      s.signal_type === 'relationship' || s.signal_type === 'social_context'
    ).filter(s => s.normalized_value === ctx);
    const days = distinctDaysFromDates(
      relSignals.map(s => s.journal_entries?.created_at || '').filter(Boolean),
    );
    if (days < 2) continue;

    // Find co-occurring emotion/need/self_belief signals on same entries
    const relEntryIds = new Set(relSignals.map(s => s.entry_id));
    const coSignals = signals.filter(s =>
      relEntryIds.has(s.entry_id) &&
      (s.signal_type === 'emotion' || s.signal_type === 'need' || s.signal_type === 'self_belief'),
    );
    if (coSignals.length === 0) continue;

    const dates = relSignals.map(s => s.journal_entries?.created_at || '').filter(Boolean);
    const { confidence, reason } = assignConfidence(relSignals.length, days, weekSpan(dates));
    const coEmotions = [...new Set(coSignals.map(s => s.normalized_value))].slice(0, 4);
    candidates.push({
      type: 'relationship_pattern',
      signal: ctx,
      confidence,
      confidence_reason: reason,
      supporting_days: days,
      mood_delta: null,
      calendar_context: null,
      quotes: relSignals.slice(0, 5).map(s => ({
        date: s.journal_entries?.created_at || '',
        question_index: s.question_index,
        quote: s.quote,
      })),
      entry_ids: [...relEntryIds],
      tags: [ctx, ...coEmotions],
      evidence_summary: `"${ctx}" appeared ${days} days, co-occurring with ${coEmotions.join(', ')}.`,
    });
  }

  // --- Candidate: Self-Belief Pattern ---
  const selfBeliefSignals = signalsByType.get('self_belief') || [];
  if (selfBeliefSignals.length >= 2) {
    const quotedSigs = selfBeliefSignals.filter(s => s.quote);
    if (quotedSigs.length >= 2) {
      const dates = quotedSigs.map(s => s.journal_entries?.created_at || '').filter(Boolean);
      const days = distinctDaysFromDates(dates);
      const { confidence, reason } = assignConfidence(quotedSigs.length, days, weekSpan(dates));
      const values = [...new Set(quotedSigs.map(s => s.normalized_value))].slice(0, 4);
      candidates.push({
        type: 'self_belief',
        signal: values.join(', '),
        confidence,
        confidence_reason: reason,
        supporting_days: days,
        mood_delta: null,
        calendar_context: null,
        quotes: quotedSigs.slice(0, 5).map(s => ({
          date: s.journal_entries?.created_at || '',
          question_index: s.question_index,
          quote: s.quote,
        })),
        entry_ids: [...new Set(quotedSigs.map(s => s.entry_id))],
        tags: ['self_belief', ...values],
        evidence_summary: `Self-belief signals (${values.join(', ')}) appeared with ${quotedSigs.length} direct quotes.`,
      });
    }
  }

  // --- Candidate: Goal Alignment ---
  if (goal) {
    const goalLower = goal.toLowerCase();
    const relevantTypes: string[] = [];
    for (const [key, types] of Object.entries(GOAL_SIGNAL_MAP)) {
      if (goalLower.includes(key) || key.includes(goalLower)) {
        relevantTypes.push(...types);
      }
    }
    // Fallback: if no exact match, try partial matching
    if (relevantTypes.length === 0) {
      for (const [key, types] of Object.entries(GOAL_SIGNAL_MAP)) {
        const words = key.split(' ');
        if (words.some(w => goalLower.includes(w))) {
          relevantTypes.push(...types);
        }
      }
    }
    if (relevantTypes.length > 0) {
      const uniqueTypes = [...new Set(relevantTypes)];
      const goalSignals: SignalRow[] = [];
      for (const t of uniqueTypes) {
        const sigs = signalsByType.get(t) || [];
        goalSignals.push(...sigs);
      }
      // Look for recurring values in goal-relevant signals
      const valueCounts = new Map<string, SignalRow[]>();
      for (const s of goalSignals) {
        const v = s.normalized_value;
        if (!valueCounts.has(v)) valueCounts.set(v, []);
        valueCounts.get(v)!.push(s);
      }
      for (const [value, sigs] of valueCounts) {
        if (sigs.length < 2) continue;
        const dates = sigs.map(s => s.journal_entries?.created_at || '').filter(Boolean);
        const days = distinctDaysFromDates(dates);
        const { confidence, reason } = assignConfidence(sigs.length, days, weekSpan(dates));
        candidates.push({
          type: 'goal_alignment',
          signal: value,
          confidence,
          confidence_reason: reason,
          supporting_days: days,
          mood_delta: null,
          calendar_context: null,
          quotes: sigs.slice(0, 5).map(s => ({
            date: s.journal_entries?.created_at || '',
            question_index: s.question_index,
            quote: s.quote,
          })),
          entry_ids: [...new Set(sigs.map(s => s.entry_id))],
          tags: [value, ...uniqueTypes],
          evidence_summary: `"${value}" appeared ${sigs.length} times and relates to your goal: "${goal}".`,
        });
        break; // One goal alignment candidate is enough
      }
    }
  }

  // --- Candidate: Emotion Trend ---
  const emotionCounts = new Map<string, EntryRow[]>();
  for (const e of entries) {
    if (e.emotion_tag) {
      const tag = e.emotion_tag.toLowerCase();
      if (!emotionCounts.has(tag)) emotionCounts.set(tag, []);
      emotionCounts.get(tag)!.push(e);
    }
  }
  for (const [emotion, ents] of emotionCounts) {
    const days = distinctDaysFromDates(ents.map(e => e.created_at));
    if (days < 2) continue;
    const dates = ents.map(e => e.created_at);
    const { confidence, reason } = assignConfidence(ents.length, days, weekSpan(dates));
    const entryIdSet = new Set(ents.map(e => e.id));
    const relatedSigs = signals.filter(s => entryIdSet.has(s.entry_id) && s.quote);

    // Find co-occurring activities on these emotion days
    const coActivities = new Map<string, number>();
    for (const e of ents) {
      const tags = [...(e.activity_tags || []), ...(e.keyword_tags || [])];
      for (const t of tags) {
        const norm = t.toLowerCase().trim();
        if (norm) coActivities.set(norm, (coActivities.get(norm) || 0) + 1);
      }
    }
    const topActivities = [...coActivities.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([act]) => act);

    const activityNote = topActivities.length > 0
      ? ` Often alongside: ${topActivities.join(', ')}.`
      : '';

    candidates.push({
      type: 'emotion_trend',
      signal: emotion,
      confidence,
      confidence_reason: reason,
      supporting_days: days,
      mood_delta: null,
      calendar_context: null,
      quotes: relatedSigs.slice(0, 5).map(s => ({
        date: s.journal_entries?.created_at || '',
        question_index: s.question_index,
        quote: s.quote,
      })),
      entry_ids: [...entryIdSet],
      tags: [emotion, 'emotion', ...topActivities],
      evidence_summary: `Emotion "${emotion}" appeared on ${days} distinct days.${activityNote}`,
    });
  }

  // --- Candidate: Activity-Mood Link ---
  // Uses structured activity_tags to find activities with consistent mood impact
  const activityMoodMap = new Map<string, { moods: number[]; entryIds: string[]; dates: string[] }>();
  for (const e of entries) {
    if (e.mood_score == null || !e.activity_tags) continue;
    for (const tag of e.activity_tags) {
      const norm = tag.toLowerCase().trim();
      if (!norm) continue;
      const rec = activityMoodMap.get(norm) || { moods: [], entryIds: [], dates: [] };
      rec.moods.push(e.mood_score);
      rec.entryIds.push(e.id);
      rec.dates.push(e.created_at);
      activityMoodMap.set(norm, rec);
    }
  }
  if (avgMood != null) {
    for (const [activity, data] of activityMoodMap) {
      const days = distinctDaysFromDates(data.dates);
      if (days < 2 || data.moods.length < 2) continue;
      const actAvg = data.moods.reduce((a, b) => a + b, 0) / data.moods.length;
      const delta = actAvg - avgMood;
      if (Math.abs(delta) < 0.4) continue;

      const { confidence, reason } = assignConfidence(data.moods.length, days, weekSpan(data.dates));
      const entryIdSet = new Set(data.entryIds);
      const relatedQuotes = signals
        .filter(s => entryIdSet.has(s.entry_id) && s.quote)
        .slice(0, 5);

      candidates.push({
        type: 'activity_mood_link',
        signal: activity,
        confidence,
        confidence_reason: reason,
        supporting_days: days,
        mood_delta: Math.round(delta * 100) / 100,
        calendar_context: null,
        quotes: relatedQuotes.map(s => ({
          date: s.journal_entries?.created_at || '',
          question_index: s.question_index,
          quote: s.quote,
        })),
        entry_ids: [...entryIdSet],
        tags: [activity, 'activity_mood'],
        evidence_summary: `Your mood is ${delta > 0 ? 'higher' : 'lower'} by ${Math.abs(delta).toFixed(1)} on days involving "${activity}" (${days} days, avg mood ${actAvg.toFixed(1)} vs overall ${avgMood.toFixed(1)}).`,
      });
    }
  }

  // --- Deduplicate candidates by primary signal ---
  // Multiple candidate types can fire for the same signal (e.g. "coding"
  // triggers recurring_theme + mood_driver + activity_mood_link).
  // Keep the strongest candidate per signal.
  const confidenceOrder: Record<string, number> = { strong_pattern: 0, emerging_pattern: 1, early_signal: 2 };
  const bestBySignal = new Map<string, Candidate>();
  for (const c of candidates) {
    const key = c.signal.toLowerCase();
    const existing = bestBySignal.get(key);
    if (!existing) {
      bestBySignal.set(key, c);
      continue;
    }
    const cScore = (confidenceOrder[c.confidence] ?? 3) * 100 - c.quotes.length;
    const eScore = (confidenceOrder[existing.confidence] ?? 3) * 100 - existing.quotes.length;
    if (cScore < eScore) {
      bestBySignal.set(key, c);
    }
  }
  const deduped = [...bestBySignal.values()];

  // --- Filter against existing patterns ---
  const dismissedPatterns = existingPatterns.filter(p => p.status === 'dismissed');

  const filtered = deduped.filter(c => {
    // Never resurface dismissed patterns (reset handles that separately)
    for (const d of dismissedPatterns) {
      if (d.related_tags?.some(t => c.tags.includes(t))) {
        return false;
      }
    }
    return true;
  });

  // Sort: strong > emerging > early, then by evidence count
  filtered.sort((a, b) => {
    const co = (confidenceOrder[a.confidence] ?? 3) - (confidenceOrder[b.confidence] ?? 3);
    if (co !== 0) return co;
    return b.quotes.length - a.quotes.length;
  });

  return filtered;
}

const SYSTEM_PROMPT = `You are writing a personalized Pattern Note for Spire, a private voice journaling app. The system has already assembled deterministic evidence. Your job is to write a warm, grounded, actionable reflection note based only on the provided evidence.

Rules:
1. Do not invent evidence or make claims beyond the data
2. Do not make clinical, diagnostic, or medical claims
3. Do not overstate certainty — match the confidence level
4. Use the user's stated goal to explain why the pattern may matter
5. Ground the note in the provided quotes or evidence
6. Do not mention "LLM", "model", "data", "transcripts", or "backend"
7. Do not mention skipped questions
8. Do not shame, judge, or optimize the user
9. Make the note feel personal, useful, and ACTIONABLE
10. Write in second person ("you", "your")

Confidence language:
- early_signal: "This may be showing up…", "This might be worth watching…"
- emerging_pattern: "Spire is starting to notice…", "This seems to be becoming…"
- strong_pattern: "This has shown up consistently…", "This appears to be a recurring…"

MBTI-driven suggestions (CRITICAL — this is what makes patterns useful):
- When MBTI is provided, use it to generate SPECIFIC, ACTIONABLE suggestions that fit the user's personality
- Don't just observe patterns — connect them to concrete things the user could try
- Extraverts (E types): suggest social/collaborative versions of solo activities. If they code alone, suggest pair programming, coding cafes, hackathons. If they exercise alone, suggest group classes or workout partners.
- Introverts (I types): suggest structured alone time, deeper solo versions. If they're drained by meetings, suggest async communication blocks or recovery time.
- Sensing (S types): suggest concrete, specific actions with clear steps
- Intuitive (N types): suggest exploring new possibilities, reframing
- Thinking (T types): suggest systems, experiments, tracking
- Feeling (F types): suggest connecting with values, relationships, meaning
- Judging (J types): suggest routines, schedules, planning
- Perceiving (P types): suggest flexibility, variety, spontaneous options
- personality_framing should be a SPECIFIC suggestion tied to their MBTI, not a generic observation
- Example: ENFP who codes a lot → "As someone who thrives on energy from others, you might enjoy coding at a cafe, joining a hackathon, or pair programming — it could make the work feel less draining"
- Example: INTJ who mentions stress → "You tend to process best with structured thinking time. Try blocking 20 minutes after stressful meetings to decompress with a clear framework"
- Omit MBTI framing if mbti is null

Previous feedback (learn from this):
- If the user marked a similar pattern "true", lean into that direction with deeper suggestions
- If the user marked something "kind_of", refine — the direction was right but the framing needs adjustment
- If the user marked something "not_really", avoid that angle and try a different interpretation
- Previous feedback is provided in the context — use it to calibrate tone and accuracy

suggested_experiment MUST be:
- A specific, concrete thing to try THIS WEEK (not vague advice)
- Tied to the pattern evidence AND the user's personality
- Something that would test or leverage the pattern
- Example: "Try coding at a coffee shop twice this week and note how your energy feels afterward"
- NOT: "Consider exploring social activities" (too vague)

Return JSON only:
{
  "title": "max 80 chars, warm and specific",
  "note": "max 280 chars, 2-3 sentences. Observational and warm — describe the pattern you see, grounded in evidence. No coaching, no generic advice, no 'this is worth tracking' language.",
  "personality_framing": "max 280 chars, SPECIFIC MBTI-based actionable suggestion, or null",
  "reflection_prompt": "max 180 chars, a specific question for the user to sit with",
  "suggested_experiment": "max 250 chars, a CONCRETE thing to try this week"
}`;

const CLUSTER_PROMPT = `You are grouping pattern candidates for a voice journaling app. Given a list of candidate patterns, group ones that describe essentially the same theme or insight — even if worded differently or detected by different methods.

Rules:
1. Two candidates are "similar" if they describe the same underlying insight from the user's life (e.g. "friends lift mood" and "happiness around people" are the same theme)
2. Be aggressive about merging — fewer, stronger insights are better than many overlapping ones
3. Only keep candidates separate if they represent genuinely distinct life patterns
4. Return ONLY a JSON array of groups, where each group is an array of candidate indices (0-based)

Example input: 3 candidates about [friends+mood, work+stress, people+happiness]
Example output: [[0, 2], [1]]
(candidates 0 and 2 merged because both are about social connections → positive mood)

Return JSON array only, no explanation.`;

async function clusterCandidates(
  candidates: Candidate[],
  anthropicKey: string,
): Promise<Candidate[]> {
  if (candidates.length <= 1) return candidates;

  const summaries = candidates.map((c, i) => ({
    index: i,
    signal: c.signal,
    type: c.type,
    evidence_summary: c.evidence_summary,
    tags: c.tags,
    confidence: c.confidence,
  }));

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        system: CLUSTER_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(summaries) }],
      }),
    });

    if (!response.ok) {
      console.error(`[generate-patterns] Clustering LLM error: ${response.status}`);
      return candidates;
    }

    const result = await response.json();
    const text = result?.content?.[0]?.text;
    if (!text) return candidates;

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return candidates;

    const groups: number[][] = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(groups) || groups.length === 0) return candidates;

    return groups.map(group => {
      const valid = group.filter(i => typeof i === 'number' && i >= 0 && i < candidates.length);
      if (valid.length === 0) return null;
      if (valid.length === 1) return candidates[valid[0]];
      return mergeCandidates(valid.map(i => candidates[i]));
    }).filter(Boolean) as Candidate[];
  } catch (err) {
    console.error('[generate-patterns] Clustering failed, using unmerged candidates:', err);
    return candidates;
  }
}

function mergeCandidates(group: Candidate[]): Candidate {
  const confidenceOrder: Record<string, number> = { strong_pattern: 0, emerging_pattern: 1, early_signal: 2 };
  group.sort((a, b) => (confidenceOrder[a.confidence] ?? 3) - (confidenceOrder[b.confidence] ?? 3));

  const best = group[0];
  const allQuotes = new Map<string, typeof best.quotes[0]>();
  const allEntryIds = new Set<string>();
  const allTags = new Set<string>();
  const allDates: string[] = [];

  for (const c of group) {
    for (const q of c.quotes) {
      const key = q.quote.slice(0, 60);
      if (!allQuotes.has(key)) allQuotes.set(key, q);
    }
    for (const id of c.entry_ids) allEntryIds.add(id);
    for (const t of c.tags) allTags.add(t);
    allDates.push(...c.quotes.map(q => q.date).filter(Boolean));
  }

  const distinctDays = new Set(allDates.map(d => d.slice(0, 10))).size;
  const weeks = weekSpan(allDates);
  const entryCount = allEntryIds.size;
  const { confidence, reason } = assignConfidence(entryCount, distinctDays, weeks);

  const evidenceParts = group.map(c => c.evidence_summary).filter(Boolean);

  return {
    type: best.type,
    signal: group.map(c => c.signal).join(' + '),
    confidence: (confidenceOrder[confidence] ?? 3) <= (confidenceOrder[best.confidence] ?? 3) ? confidence : best.confidence,
    confidence_reason: reason,
    supporting_days: distinctDays,
    mood_delta: best.mood_delta,
    calendar_context: best.calendar_context,
    quotes: [...allQuotes.values()],
    entry_ids: [...allEntryIds],
    tags: [...allTags],
    evidence_summary: evidenceParts.join(' Additionally, '),
  };
}

interface FeedbackEntry {
  pattern_type: string;
  title: string;
  feedback: string;
}

async function writePatternNote(
  candidate: Candidate,
  goal: string | null,
  mbti: string | null,
  anthropicKey: string,
  feedbackHistory: FeedbackEntry[],
): Promise<Record<string, unknown> | null> {
  const userMessage = JSON.stringify({
    user_profile: { goal: goal || 'not set', mbti: mbti || null },
    candidate_pattern: {
      type: candidate.type,
      signal: candidate.signal,
      confidence: candidate.confidence,
      supporting_days: candidate.supporting_days,
      mood_delta: candidate.mood_delta,
      related_calendar_context: candidate.calendar_context,
      quotes: candidate.quotes,
      evidence_summary: candidate.evidence_summary,
    },
    previous_feedback: feedbackHistory.length > 0 ? feedbackHistory : undefined,
  });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      console.error(`[generate-patterns] LLM API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const result = await response.json();
    const text = result?.content?.[0]?.text;
    if (!text) {
      console.error('[generate-patterns] LLM returned no text');
      return null;
    }

    // Extract JSON from response (handle possible markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[generate-patterns] Could not parse JSON from LLM response');
      return null;
    }

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[generate-patterns] LLM call failed:', err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    let forceRefresh = false;
    let lookbackDays = 30;
    try {
      const body = await req.json();
      if (body?.force_refresh === true) forceRefresh = true;
      if (typeof body?.lookback_days === 'number' && body.lookback_days > 0) {
        lookbackDays = body.lookback_days;
      }
    } catch {
      // Empty body is fine, use defaults
    }

    // 1. Auth & Settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('goal, mbti')
      .eq('user_id', user.id)
      .maybeSingle();

    const goal: string | null = settings?.goal || null;
    const mbti: string | null = settings?.mbti || null;

    // Rate limit: max 5 pattern generations per user per day
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: todayCount } = await supabase
      .from('pattern_insights')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', todayStart.toISOString());

    if ((todayCount || 0) >= MAX_PATTERNS_PER_DAY && !forceRefresh) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded', patterns: [] }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Fetch Data
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    const cutoffStr = cutoff.toISOString();

    const [entriesRes, signalsRes, calendarRes, existingRes] = await Promise.all([
      supabase
        .from('journal_entries')
        .select('id, created_at, mood_score, emotion_tag, activity_tags, keyword_tags, themes, event_context, q1_transcript, q2_transcript, q3_transcript, q4_transcript, q5_transcript, q6_transcript')
        .eq('user_id', user.id)
        .gte('created_at', cutoffStr)
        .order('created_at', { ascending: false }),
      supabase
        .from('entry_signals')
        .select('id, entry_id, signal_type, signal_value, normalized_value, quote, question_index, sentiment, confidence, journal_entries!inner(id, created_at, mood_score, emotion_tag, activity_tags, keyword_tags, themes, event_context)')
        .eq('journal_entries.user_id', user.id)
        .gte('journal_entries.created_at', cutoffStr),
      supabase
        .from('daily_calendar_signals')
        .select('id, date, day_density, event_count, common_context')
        .eq('user_id', user.id)
        .gte('date', cutoff.toISOString().slice(0, 10)),
      supabase
        .from('pattern_insights')
        .select('id, pattern_type, related_tags, status, user_feedback, title, note, supporting_entry_ids, confidence, evidence_count, updated_at, last_interacted_at')
        .eq('user_id', user.id),
    ]);

    const entries: EntryRow[] = entriesRes.data || [];
    const signals: SignalRow[] = signalsRes.data || [];
    const calendarSignals: CalendarSignal[] = calendarRes.data || [];
    const existingPatterns: PatternInsight[] = existingRes.data || [];

    if (entries.length === 0) {
      console.log('[generate-patterns] No entries found in lookback window');
      return new Response(JSON.stringify({ patterns: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Deterministic Candidate Generation
    const candidates = buildCandidates(
      entries, signals, calendarSignals, existingPatterns, goal,
    );

    if (candidates.length === 0) {
      console.log('[generate-patterns] No candidates found');
      return new Response(JSON.stringify({ patterns: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. LLM Note Writing
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      console.error('[generate-patterns] ANTHROPIC_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build feedback history from previous patterns the user responded to.
    // Feedback influences future cards, not existing ones.
    const feedbackHistory: FeedbackEntry[] = existingPatterns
      .filter(p => p.user_feedback && p.title)
      .map(p => ({
        pattern_type: p.pattern_type,
        title: p.title!,
        feedback: p.user_feedback!,
      }));

    // Saved patterns are locked — skip candidates that overlap with them.
    const savedPatternsList = existingPatterns.filter(p => p.status === 'saved');
    let activePatternsList = existingPatterns.filter(p => p.status === 'active');

    const savedTagsLower = new Set<string>();
    for (const p of savedPatternsList) {
      for (const t of (p.related_tags ?? [])) savedTagsLower.add(t.toLowerCase());
    }

    // Filter out candidates that overlap with saved patterns (any tag overlap)
    const unsavedCandidates = candidates.filter(c => {
      return !c.tags.some(t => savedTagsLower.has(t.toLowerCase()));
    });

    // Cluster semantically similar candidates before limiting
    const clusteredCandidates = await clusterCandidates(unsavedCandidates, anthropicKey);
    console.log(`[generate-patterns] Clustered ${unsavedCandidates.length} candidates → ${clusteredCandidates.length} groups`);
    const limitedCandidates = clusteredCandidates.slice(0, MAX_CANDIDATES);

    // --- Auto-archive stale cards ---
    // Safety: never auto-archive if it would leave fewer than MIN_ACTIVE_FLOOR active cards
    const archivedTitles: string[] = [];
    const staleThreshold = new Date();
    staleThreshold.setDate(staleThreshold.getDate() - AUTO_ARCHIVE_DAYS);
    const staleCards = activePatternsList.filter(p => {
      const interactedAt = p.last_interacted_at ? new Date(p.last_interacted_at) : null;
      return !p.user_feedback && interactedAt && interactedAt < staleThreshold;
    });
    const safeToArchive = Math.max(0, activePatternsList.length - MIN_ACTIVE_FLOOR);
    const archiveCount = Math.min(staleCards.length, safeToArchive);
    if (archiveCount > 0) {
      const toArchive = staleCards.slice(0, archiveCount);
      await supabase
        .from('pattern_insights')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .in('id', toArchive.map(p => p.id));
      for (const p of toArchive) {
        if (p.title) archivedTitles.push(p.title);
      }
      activePatternsList = activePatternsList.filter(p => !toArchive.some(s => s.id === p.id));
    }

    // Build index of active patterns — map every tag to its pattern for matching
    const activeTagIndex = new Map<string, PatternInsight>();
    for (const p of activePatternsList) {
      for (const t of (p.related_tags ?? [])) {
        activeTagIndex.set(t.toLowerCase(), p);
      }
    }

    const toUpdate: { pattern: PatternInsight; candidate: Candidate }[] = [];
    const toInsert: Candidate[] = [];
    const alreadyMatched = new Set<string>();

    for (const candidate of limitedCandidates) {
      // Find matching active pattern by ANY tag overlap (not just primary)
      let matchingActive: PatternInsight | undefined;
      for (const tag of candidate.tags) {
        const match = activeTagIndex.get(tag.toLowerCase());
        if (match && !alreadyMatched.has(match.id)) {
          matchingActive = match;
          break;
        }
      }

      if (matchingActive) {
        alreadyMatched.add(matchingActive.id);
        const oldEntryIds = new Set(matchingActive.supporting_entry_ids ?? []);
        const hasNewEvidence = candidate.entry_ids.some(id => !oldEntryIds.has(id));
        if (hasNewEvidence) {
          toUpdate.push({ pattern: matchingActive, candidate });
        }
      } else {
        toInsert.push(candidate);
      }
    }

    const resultPatterns: Record<string, unknown>[] = [];

    // Update existing active cards in place
    for (const { pattern, candidate } of toUpdate) {
      const llmResult = await writePatternNote(candidate, goal, mbti, anthropicKey, feedbackHistory);
      if (!llmResult) continue;

      const allDates = candidate.quotes.map(q => q.date).filter(Boolean).sort();
      const { error: updateError } = await supabase
        .from('pattern_insights')
        .update({
          pattern_type: candidate.type,
          title: llmResult.title,
          note: llmResult.note,
          personality_framing: llmResult.personality_framing || null,
          evidence_summary: candidate.evidence_summary,
          confidence: candidate.confidence,
          confidence_reason: candidate.confidence_reason,
          evidence_count: candidate.quotes.length,
          entry_count: candidate.supporting_days,
          date_range_start: allDates[0] || null,
          date_range_end: allDates[allDates.length - 1] || null,
          supporting_entry_ids: candidate.entry_ids,
          supporting_quotes: candidate.quotes,
          related_calendar_context: candidate.calendar_context,
          related_tags: candidate.tags,
          mood_delta: candidate.mood_delta,
          reflection_prompt: llmResult.reflection_prompt || null,
          suggested_experiment: llmResult.suggested_experiment || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pattern.id)
        .eq('status', 'active');

      if (!updateError) {
        const { data: updated } = await supabase
          .from('pattern_insights').select().eq('id', pattern.id).single();
        if (updated) resultPatterns.push(updated);
      }
    }

    // Insert genuinely new cards (respecting cap)
    let currentActiveCount = activePatternsList.length;
    for (const candidate of toInsert) {
      if (currentActiveCount >= MAX_ACTIVE_CARDS) {
        // Archive the weakest active card to make room
        const weakest = [...activePatternsList]
          .sort((a, b) => {
            const rankDiff = (CONFIDENCE_RANK[a.confidence ?? ''] ?? 0) - (CONFIDENCE_RANK[b.confidence ?? ''] ?? 0);
            if (rankDiff !== 0) return rankDiff;
            const timeDiff = new Date(a.updated_at ?? 0).getTime() - new Date(b.updated_at ?? 0).getTime();
            if (timeDiff !== 0) return timeDiff;
            return (a.evidence_count ?? 0) - (b.evidence_count ?? 0);
          })[0];

        if (weakest) {
          await supabase
            .from('pattern_insights')
            .update({ status: 'archived', updated_at: new Date().toISOString() })
            .eq('id', weakest.id);
          if (weakest.title) archivedTitles.push(weakest.title);
          activePatternsList = activePatternsList.filter(p => p.id !== weakest.id);
          currentActiveCount--;
        }
      }

      const llmResult = await writePatternNote(candidate, goal, mbti, anthropicKey, feedbackHistory);
      if (!llmResult) continue;

      const allDates = candidate.quotes.map(q => q.date).filter(Boolean).sort();
      const row = {
        user_id: user.id,
        pattern_type: candidate.type,
        title: llmResult.title,
        note: llmResult.note,
        goal_connection: null,
        personality_framing: llmResult.personality_framing || null,
        evidence_summary: candidate.evidence_summary,
        confidence: candidate.confidence,
        confidence_reason: candidate.confidence_reason,
        evidence_count: candidate.quotes.length,
        entry_count: candidate.supporting_days,
        date_range_start: allDates[0] || null,
        date_range_end: allDates[allDates.length - 1] || null,
        supporting_entry_ids: candidate.entry_ids,
        supporting_quotes: candidate.quotes,
        related_calendar_context: candidate.calendar_context,
        related_tags: candidate.tags,
        mood_delta: candidate.mood_delta,
        reflection_prompt: llmResult.reflection_prompt || null,
        suggested_experiment: llmResult.suggested_experiment || null,
        suggested_if_then_plan: null,
        status: 'active',
        updated_at: new Date().toISOString(),
      };
      const { data: inserted, error: insertError } = await supabase
        .from('pattern_insights').insert(row).select().single();
      if (!insertError && inserted) {
        resultPatterns.push(inserted);
        currentActiveCount++;
      }
    }

    console.log(`[generate-patterns] Trickle: ${toUpdate.length} updated, ${toInsert.length} new candidates, ${resultPatterns.length} result patterns`);

    return new Response(JSON.stringify({ patterns: resultPatterns, archived_titles: archivedTitles }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[generate-patterns] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
