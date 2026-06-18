import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('SITE_URL') || 'http://localhost:5173';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_PATTERNS_PER_DAY = 5;
const MAX_CANDIDATES = 10;
const MAX_MAIN_PATTERNS = 5;
const MAX_THINGS_TO_WATCH = 3;
const MAX_ACTIVE_CARDS = 7; // hard safety cap
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
  'exercise', 'social', 'tennis', 'boxing', 'swimming', 'cycling', 'hiking',
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

type LifeCategory = 'work' | 'relationships' | 'recovery' | 'health' | 'energy' | 'self_belief' | 'emotion' | 'calendar_load' | 'growth' | 'creativity' | 'routine' | 'other';

const LIFE_CATEGORY_MAP: Record<string, LifeCategory> = {
  // Work
  work: 'work', meetings: 'work', manager: 'work', coworkers: 'work',
  deadline: 'work', project: 'work', presentation: 'work', feedback: 'work',
  career: 'work', productivity: 'work',
  // Relationships
  friends: 'relationships', family: 'relationships', partner: 'relationships',
  social: 'relationships', connection: 'relationships', conflict: 'relationships',
  loneliness: 'relationships', community: 'relationships',
  // Recovery
  rest: 'recovery', sleep: 'recovery', walking: 'recovery', quiet: 'recovery',
  'alone time': 'recovery', reading: 'recovery', prayer: 'recovery',
  meditation: 'recovery', reset: 'recovery',
  // Health
  gym: 'health', running: 'health', yoga: 'health', cooking: 'health',
  exercise: 'health', movement: 'health', tennis: 'health', boxing: 'health',
  swimming: 'health', cycling: 'health', hiking: 'health',
  // Energy
  tired: 'energy', drained: 'energy', energized: 'energy', clear: 'energy',
  scattered: 'energy', overwhelmed: 'energy',
  // Self-belief
  confidence: 'self_belief', 'self-doubt': 'self_belief', 'proving myself': 'self_belief',
  discipline: 'self_belief', 'self-discipline': 'self_belief',
  'self-advocacy': 'self_belief', 'standing up for myself': 'self_belief',
  'pushing back': 'self_belief', 'setting boundaries': 'self_belief',
  boundaries: 'self_belief', assertiveness: 'self_belief',
  avoidance: 'self_belief', pressure: 'self_belief', pride: 'self_belief',
  // Calendar load
  'busy day': 'calendar_load', 'packed day': 'calendar_load',
  'fragmented day': 'calendar_load', 'context switching': 'calendar_load',
  'back-to-back meetings': 'calendar_load',
  // Growth
  learning: 'growth', reflection: 'growth', values: 'growth',
  progress: 'growth', identity: 'growth',
  // Creativity
  coding: 'creativity', writing: 'creativity', 'creative work': 'creativity',
  filming: 'creativity', design: 'creativity', building: 'creativity',
  // Routine
  morning: 'routine', evening: 'routine', commute: 'routine',
  chores: 'routine', errands: 'routine', 'meal prep': 'routine',
};

const MAX_PATTERNS_PER_LIFE_CATEGORY = 2;
const MAX_WORK_PATTERNS = 2;

const EMOTION_KEYWORDS = new Set([
  'feel', 'felt', 'feeling', 'mood', 'happy', 'sad', 'anxious', 'stressed',
  'proud', 'lonely', 'grateful', 'frustrated', 'calm', 'clear', 'drained',
  'lighter', 'heavier', 'reset', 'grounded', 'overwhelmed', 'scattered',
  'energized', 'tired', 'connected', 'disconnected', 'supported', 'peaceful',
]);

const TAG_LABELS: Record<string, string> = {
  gym: 'movement',
  exercise: 'exercise',
  meetings: 'meeting-heavy days',
  work: 'work',
  friends: 'friend time',
  social: 'social time',
  family: 'family',
  partner: 'partner time',
  'self-advocacy': 'self-advocacy',
  tired: 'feeling tired',
  anxious: 'feeling anxious',
  self_doubt: 'self-doubt',
  'self-doubt': 'self-doubt',
  self_advocacy: 'standing up for yourself',
  'self-advocacy': 'standing up for yourself',
  discipline: 'discipline',
  rest: 'recovery',
  walking: 'walking',
  scattered: 'feeling scattered',
  overwhelmed: 'feeling overwhelmed',
  drained: 'feeling drained',
  stressed: 'feeling stressed',
  running: 'running',
  yoga: 'yoga',
  cooking: 'cooking',
  reading: 'reading',
  coding: 'coding',
  'creative work': 'creative work',
  sleep: 'sleep',
  manager: 'your manager',
  coworkers: 'coworkers',
  deadline: 'deadlines',
  energized: 'feeling energized',
  clear: 'feeling clear',
  happy: 'feeling happy',
  sad: 'feeling sad',
  lonely: 'feeling lonely',
  proud: 'feeling proud',
  calm: 'feeling calm',
  focused: 'feeling focused',
};

function humanLabel(tag: string): string {
  return TAG_LABELS[tag.toLowerCase()] || tag;
}

// Category/type tags are structural, not semantic — exclude from dedup and evidence
const CATEGORY_TAGS = new Set([
  'recurring', 'mood_driver', 'activity_mood', 'calendar', 'stress',
  'emotion', 'self_belief', 'recurring_theme', 'mood_correlation',
  'activity_mood_link', 'calendar_pattern', 'self_perception',
  'contextual_blend',
]);

// Semantic synonym groups: map granular normalized_values to canonical concepts.
// Signals sharing a canonical group are counted together in candidate generation.
const SYNONYM_MAP: Record<string, string> = {
  // Exercise / movement
  gym: 'exercise', running: 'exercise', tennis: 'exercise', boxing: 'exercise',
  yoga: 'exercise', 'working out': 'exercise', workout: 'exercise',
  'weight training': 'exercise', lifting: 'exercise', swimming: 'exercise',
  cycling: 'exercise', hiking: 'exercise', pilates: 'exercise',
  // Tiredness cluster
  tired: 'tired', exhausted: 'tired', fatigued: 'tired', drained: 'tired',
  'burnt out': 'tired', burnout: 'tired', sleepy: 'tired',
  // Anxiety cluster
  anxious: 'anxious', nervous: 'anxious', worried: 'anxious',
  unsettled: 'anxious', uneasy: 'anxious', 'on edge': 'anxious',
  // Overwhelm cluster
  overwhelmed: 'overwhelmed', 'too much': 'overwhelmed', overloaded: 'overwhelmed',
  // Self-advocacy / assertiveness
  'self-advocacy': 'self-advocacy', 'self advocacy': 'self-advocacy',
  'standing up for myself': 'self-advocacy', 'pushing back': 'self-advocacy',
  'setting boundaries': 'self-advocacy', boundaries: 'self-advocacy',
  'speaking up': 'self-advocacy', assertiveness: 'self-advocacy',
  'advocating for myself': 'self-advocacy',
  // Discipline / structure
  discipline: 'discipline', 'self-discipline': 'discipline',
  consistency: 'discipline', routine: 'discipline', structure: 'discipline',
  // Rest / downtime
  rest: 'rest', relaxing: 'rest', 'day off': 'rest', downtime: 'rest',
  'taking it easy': 'rest', recovery: 'rest',
  // Social connection
  friends: 'social', 'friend time': 'social', 'hanging out': 'social',
  socializing: 'social',
  // Stress
  stressed: 'stressed', 'under pressure': 'stressed', pressure: 'stressed',
  tense: 'stressed',
  // Focus / clarity
  focused: 'focused', clear: 'focused', 'in the zone': 'focused',
  'deep work': 'focused', flow: 'focused',
  // Scattered
  scattered: 'scattered', distracted: 'scattered', unfocused: 'scattered',
  'context switching': 'scattered',
};

function canonicalize(value: string): string {
  const lower = value.toLowerCase().trim();
  return SYNONYM_MAP[lower] || lower;
}

function buildUserFacingEvidenceSummary(candidate: Candidate): string {
  const days = candidate.supporting_days;
  const quoteCount = candidate.quotes.length;
  const tags = candidate.tags
    .filter(t => !CATEGORY_TAGS.has(t))
    .map(humanLabel);

  switch (candidate.type) {
    case 'recovery_signal': {
      const activities = tags.filter(t => !t.startsWith('feeling')).slice(0, 3);
      const emotions = candidate.quotes
        .map(q => q.quote.toLowerCase())
        .join(' ');
      const hasPositive = /clear|reset|lighter|calm|energized|better/.test(emotions);
      return `Based on ${quoteCount} reflections where ${activities.join(' and ')} showed up${hasPositive ? " alongside words like 'clear' and 'reset'" : ''}.`;
    }
    case 'calendar_load': {
      return `Based on several packed calendar days where your reflections mentioned feeling drained or scattered.`;
    }
    case 'relationship_pattern': {
      const who = tags.find(t => !t.startsWith('feeling')) || 'people close to you';
      return `Based on ${quoteCount} reflections where ${who} came up alongside emotional themes.`;
    }
    case 'self_belief': {
      return `Based on ${quoteCount} reflections where you described ${tags.slice(0, 2).join(' and ')}.`;
    }
    case 'mood_driver':
    case 'activity_mood_link': {
      const activity = humanLabel(candidate.signal);
      const direction = candidate.mood_delta != null && candidate.mood_delta > 0 ? 'lighter' : 'heavier';
      return `Based on ${days} days where ${activity} showed up and your reflections felt ${direction}.`;
    }
    case 'emotion_trend': {
      const emotion = humanLabel(candidate.signal);
      const coActivities = tags.filter(t => !t.startsWith('feeling') && t !== candidate.signal).slice(0, 2);
      const actNote = coActivities.length > 0 ? `, often alongside ${coActivities.join(' and ')}` : '';
      return `Based on ${days} days where ${emotion} kept showing up${actNote}.`;
    }
    case 'goal_alignment': {
      return `Based on ${quoteCount} reflections that connect to what you told Spire you care about.`;
    }
    default: {
      return `Based on ${quoteCount} reflections across ${days} days.`;
    }
  }
}

interface SafetyResult {
  safe: boolean;
  flags: string[];
}

const UNSAFE_CAUSAL_PATTERNS = [
  /\b(leads?\s+to|causes?|makes?\s+you\s+feel|results?\s+in)\b/i,
  /\b(lower|worse|bad|negative)\s+(mood|energy|mental\s+health)\b/i,
  /\b(pulls?|drags?|tanks?|kills?|ruins?|wrecks?|hurts?)\s+(your\s+)?(mood|energy)\b/i,
  /\bkeeps?\s+(pulling|dragging|tanking|killing|ruining|wrecking|hurting|lowering|dropping)\s+(your\s+)?(mood|energy)\b/i,
  /\b(mood|energy)\s+(drops?|tanks?|crashes?|plummets?|nosedives?)\b/i,
];

const GENERIC_FILLER_PATTERNS = [
  /\bfor\s+someone\s+(tracking|monitoring|watching|journaling)\b/i,
  /\bthat'?s?\s+worth\s+(paying\s+attention\s+to|noting|watching)\b/i,
  /\bthis\s+is\s+worth\s+(watching|noting|paying\s+attention)\b/i,
  /\bif\s+you'?re?\s+(someone\s+who|the\s+kind\s+of\s+person)\b/i,
  /\bas\s+you\s+continue\s+(to\s+)?(journal|reflect|track)\b/i,
];

const HEALTHY_BEHAVIORS = new Set([
  'self-advocacy', 'self advocacy', 'discipline', 'boundaries', 'exercise',
  'gym', 'rest', 'standing up', 'speaking up', 'saying no', 'asserting',
  'running', 'yoga', 'walking', 'meditation', 'sleep',
]);

const MBTI_CAUSAL_PATTERNS = [
  /\bbecause\s+you\s+are\s+\w{4}\b/i,
  /\b\w{4}\s+people\b/i,
  /\byour\s+type\s+means\b/i,
  /\bas\s+an?\s+\w{4},\s+you\s+are\b/i,
];

const RAW_SCORE_PATTERNS = [
  /\b\d+\.\d+\b/,
  /\baverage[ds]?\s+\d/i,
  /\bscores?\s+\d/i,
  /\bcorrelat/i,
  /\bmood\s+delta\b/i,
  /\bstatistic/i,
  /\bconfidence\s+score\b/i,
];

const DIAGNOSTIC_PATTERNS = [
  /\bdiagnos/i,
  /\bdisorder\b/i,
  /\bsymptoms?\s+of\b/i,
  /\bclinical/i,
  /\btherapy\b/i,
  /\btreatment\b/i,
];

function validatePatternSafety(llmResult: Record<string, unknown>): SafetyResult {
  const flags: string[] = [];
  const allText = [
    llmResult.title,
    llmResult.note,
    llmResult.preview_note,
    llmResult.full_note,
    llmResult.personality_framing,
    llmResult.evidence_summary,
    llmResult.reflection_prompt,
    llmResult.suggested_experiment,
  ].filter(Boolean).join(' ');

  // Check for unsafe causal claims
  for (const pattern of UNSAFE_CAUSAL_PATTERNS) {
    if (pattern.test(allText)) {
      flags.push('negative_causal_claim');
      break;
    }
  }

  // Check if healthy behaviors are framed as harmful
  const titleAndNote = `${llmResult.title || ''} ${llmResult.note || ''}`.toLowerCase();
  for (const behavior of HEALTHY_BEHAVIORS) {
    if (titleAndNote.includes(behavior)) {
      if (/\b(bad|harmful|worse|lower|negative|hurts?|damage)\b/i.test(titleAndNote)) {
        flags.push('healthy_behavior_framed_as_bad');
        break;
      }
    }
  }

  // Check MBTI causal claims
  for (const pattern of MBTI_CAUSAL_PATTERNS) {
    if (pattern.test(allText)) {
      flags.push('mbti_causal_claim');
      break;
    }
  }

  // Check for raw scores
  for (const pattern of RAW_SCORE_PATTERNS) {
    if (pattern.test(allText)) {
      flags.push('raw_score_exposed');
      break;
    }
  }

  // Check diagnostic language
  for (const pattern of DIAGNOSTIC_PATTERNS) {
    if (pattern.test(allText)) {
      flags.push('diagnostic_language');
      break;
    }
  }

  // Check for generic filler phrasing
  for (const pattern of GENERIC_FILLER_PATTERNS) {
    if (pattern.test(allText)) {
      flags.push('generic_filler');
      break;
    }
  }

  // Check LLM-reported safety flags
  const llmFlags = llmResult.safety_flags;
  if (Array.isArray(llmFlags)) {
    for (const f of llmFlags) {
      if (typeof f === 'string' && f.length > 0) {
        flags.push(f);
      }
    }
  }

  return {
    safe: flags.length === 0,
    flags,
  };
}

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
  journal_entry_id: string;
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
  mood_delta: number | null;
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

  // Index signals by normalized_value AND by canonical group
  const signalsByValue = new Map<string, SignalRow[]>();
  const signalsByCanonical = new Map<string, SignalRow[]>();
  const signalsByType = new Map<string, SignalRow[]>();
  for (const s of signals) {
    const key = s.normalized_value?.toLowerCase() || '';
    if (!signalsByValue.has(key)) signalsByValue.set(key, []);
    signalsByValue.get(key)!.push(s);
    const canonical = canonicalize(key);
    if (!signalsByCanonical.has(canonical)) signalsByCanonical.set(canonical, []);
    signalsByCanonical.get(canonical)!.push(s);
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
  // Use canonical groups so "gym"+"running"+"tennis" are counted together as "exercise"
  for (const [canonical, sigs] of signalsByCanonical) {
    if (!canonical) continue;
    const days = distinctDaysFromDates(sigs.map(s => s.journal_entries?.created_at || '').filter(Boolean));
    const pct = entries.length > 0 ? sigs.length / entries.length : 0;
    if (days >= 2 || pct >= 0.3) {
      const dates = sigs.map(s => s.journal_entries?.created_at || '').filter(Boolean);
      const { confidence, reason } = assignConfidence(sigs.length, days, weekSpan(dates));
      const subValues = [...new Set(sigs.map(s => s.normalized_value?.toLowerCase()).filter(Boolean))];
      const signalLabel = subValues.length > 1 ? canonical : subValues[0] || canonical;
      const subTypes = [...new Set(sigs.map(s => s.signal_type))];
      candidates.push({
        type: 'recurring_theme',
        signal: signalLabel,
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
        entry_ids: [...new Set(sigs.map(s => s.journal_entry_id))],
        tags: [canonical, ...subValues.filter(v => v !== canonical), ...subTypes],
        evidence_summary: subValues.length > 1
          ? `${subValues.join(', ')} (grouped as "${canonical}") appeared on ${days} distinct days (${sigs.length} mentions).`
          : `"${canonical}" appeared on ${days} distinct days (${sigs.length} mentions).`,
      });
    }
  }

  // --- Candidate: Mood Driver ---
  // Use canonical groups so related signals are evaluated together for mood impact
  for (const [canonical, sigs] of signalsByCanonical) {
    if (!canonical) continue;
    const entryIdsWithTag = new Set(sigs.map(s => s.journal_entry_id));
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
    const subValues = [...new Set(sigs.map(s => s.normalized_value?.toLowerCase()).filter(Boolean))];
    const subTypes = [...new Set(sigs.map(s => s.signal_type))];
    candidates.push({
      type: 'mood_driver',
      signal: canonical,
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
      tags: [canonical, ...subValues.filter(v => v !== canonical), ...subTypes],
      evidence_summary: `Your mood tends to be ${describeMoodDelta(delta)} on days involving "${canonical}" (across ${daysWithTag} days).`,
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
        entry_ids: [...new Set(negativeOnBusy.map(s => s.journal_entry_id))],
        tags: ['calendar', 'stress', ...negativeOnBusy.map(s => s.normalized_value).filter(Boolean)],
        evidence_summary: `${busyDays.size} busy/packed calendar days co-occurred with negative emotions (${negativeOnBusy.length} signals).`,
      });
    }
  }

  // --- Candidate: Recovery Signal ---
  if (avgMood != null) {
    const recoverySignals: SignalRow[] = [];
    for (const s of signals) {
      if ((RECOVERY_ACTIVITIES.has(s.normalized_value) || RECOVERY_ACTIVITIES.has(canonicalize(s.normalized_value))) && s.journal_entries?.mood_score != null) {
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
        entry_ids: [...new Set(recoverySignals.map(s => s.journal_entry_id))],
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
    const relEntryIds = new Set(relSignals.map(s => s.journal_entry_id));
    const coSignals = signals.filter(s =>
      relEntryIds.has(s.journal_entry_id) &&
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
        entry_ids: [...new Set(quotedSigs.map(s => s.journal_entry_id))],
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
          entry_ids: [...new Set(sigs.map(s => s.journal_entry_id))],
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
    const relatedSigs = signals.filter(s => entryIdSet.has(s.journal_entry_id) && s.quote);

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
        .filter(s => entryIdSet.has(s.journal_entry_id) && s.quote)
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
        evidence_summary: `Your mood tends to be ${describeMoodDelta(delta)} on days involving "${activity}" (across ${days} days).`,
      });
    }
  }

  // --- Candidate: Activity-Emotion Correlation ---
  // Catches activities from keyword_tags + activity_tags and correlates with emotions
  const activityEmotionMap = new Map<string, { emotions: Map<string, number>; entryIds: string[]; dates: string[]; moods: number[] }>();
  for (const e of entries) {
    const allTags = [...(e.activity_tags || []), ...(e.keyword_tags || [])];
    if (allTags.length === 0) continue;
    for (const tag of allTags) {
      const norm = tag.toLowerCase().trim();
      if (!norm || RECOVERY_ACTIVITIES.has(norm)) continue; // skip recovery activities (handled above)
      const rec = activityEmotionMap.get(norm) || { emotions: new Map(), entryIds: [], dates: [], moods: [] };
      rec.entryIds.push(e.id);
      rec.dates.push(e.created_at);
      if (e.mood_score != null) rec.moods.push(e.mood_score);
      if (e.emotion_tag) {
        const emo = e.emotion_tag.toLowerCase();
        rec.emotions.set(emo, (rec.emotions.get(emo) || 0) + 1);
      }
      activityEmotionMap.set(norm, rec);
    }
  }
  for (const [activity, data] of activityEmotionMap) {
    const days = distinctDaysFromDates(data.dates);
    if (days < 2 || data.entryIds.length < 2) continue;
    // Already covered by activity_mood_link?
    if (activityMoodMap.has(activity)) continue;

    const topEmotions = [...data.emotions.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([emo]) => emo);
    if (topEmotions.length === 0 && data.moods.length < 2) continue;

    const { confidence, reason } = assignConfidence(data.entryIds.length, days, weekSpan(data.dates));
    const entryIdSet = new Set(data.entryIds);
    const relatedQuotes = signals
      .filter(s => entryIdSet.has(s.journal_entry_id) && s.quote)
      .slice(0, 5);

    const moodDelta = avgMood != null && data.moods.length >= 2
      ? (data.moods.reduce((a, b) => a + b, 0) / data.moods.length) - avgMood
      : null;

    const emotionNote = topEmotions.length > 0
      ? `When you do "${activity}", you often feel ${topEmotions.join(', ')}.`
      : `"${activity}" shows up across ${days} days in your entries.`;

    candidates.push({
      type: 'activity_mood_link',
      signal: activity,
      confidence,
      confidence_reason: reason,
      supporting_days: days,
      mood_delta: moodDelta != null ? Math.round(moodDelta * 100) / 100 : null,
      calendar_context: null,
      quotes: relatedQuotes.map(s => ({
        date: s.journal_entries?.created_at || '',
        question_index: s.question_index,
        quote: s.quote,
      })),
      entry_ids: [...entryIdSet],
      tags: [activity, 'activity_mood', ...topEmotions],
      evidence_summary: emotionNote + (moodDelta != null ? ` Your mood tends to be ${describeMoodDelta(moodDelta)} on these days.` : ''),
    });
  }

  // --- Lightweight dedup: keep best candidate per signal name ---
  // Semantic dedup is handled by clusterCandidates (LLM-based).
  // This pass only collapses exact-signal duplicates (e.g. same canonical
  // value generating both recurring_theme and mood_driver candidates).
  const confidenceOrder: Record<string, number> = { strong_pattern: 0, emerging_pattern: 1, early_signal: 2 };

  function candidateScore(c: Candidate): number {
    return (confidenceOrder[c.confidence] ?? 3) * 100 - c.quotes.length;
  }

  const signalGroups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = c.signal.toLowerCase();
    if (!signalGroups.has(key)) signalGroups.set(key, []);
    signalGroups.get(key)!.push(c);
  }

  const deduped = [...signalGroups.values()].map(group => {
    group.sort((a, b) => candidateScore(a) - candidateScore(b));
    return group[0];
  });

  // Sort: strong > emerging > early, then by evidence count
  deduped.sort((a, b) => {
    const co = (confidenceOrder[a.confidence] ?? 3) - (confidenceOrder[b.confidence] ?? 3);
    if (co !== 0) return co;
    return b.quotes.length - a.quotes.length;
  });

  return deduped;
}

// --- Quality Gate: usefulness scoring, life category, display tier ---

function assignLifeCategory(candidate: Candidate): LifeCategory {
  // Check candidate type first for obvious mappings
  if (candidate.type === 'calendar_load') return 'calendar_load';
  if (candidate.type === 'recovery_signal') return 'recovery';
  if (candidate.type === 'self_belief') return 'self_belief';
  if (candidate.type === 'relationship_pattern') return 'relationships';

  // Check signal and tags against the map
  const allTerms = [candidate.signal, ...candidate.tags].map(t => t.toLowerCase());
  for (const term of allTerms) {
    if (LIFE_CATEGORY_MAP[term]) return LIFE_CATEGORY_MAP[term];
  }

  // Fallback based on candidate type
  if (candidate.type === 'emotion_trend') return 'emotion';
  if (candidate.type === 'activity_mood_link') return 'health';
  if (candidate.type === 'goal_alignment') return 'growth';

  return 'other';
}

function assignLifeCategoryFromPattern(pattern: PatternInsight): LifeCategory {
  const tags = (pattern.related_tags ?? []).map(t => t.toLowerCase());
  for (const tag of tags) {
    if (LIFE_CATEGORY_MAP[tag]) return LIFE_CATEGORY_MAP[tag];
  }
  if (pattern.pattern_type === 'calendar_load') return 'calendar_load';
  if (pattern.pattern_type === 'recovery_signal') return 'recovery';
  if (pattern.pattern_type === 'self_belief') return 'self_belief';
  if (pattern.pattern_type === 'relationship_pattern') return 'relationships';
  if (pattern.pattern_type === 'emotion_trend') return 'emotion';
  return 'other';
}

function scoreCandidateUsefulness(
  candidate: Candidate,
  goal: string | null,
  existingPatterns: PatternInsight[],
): { score: number; reasons: string[]; riskFlags: string[] } {
  let score = 0;
  const reasons: string[] = [];
  const riskFlags: string[] = [];

  // Positive factors
  if (candidate.quotes.length >= 2) {
    score += 20;
    reasons.push('multiple_quotes');
  }
  if (candidate.supporting_days >= 3) {
    score += 20;
    reasons.push('multiple_days');
  }
  if (goal && candidate.type === 'goal_alignment') {
    score += 20;
    reasons.push('goal_connected');
  }
  // Check if quotes contain emotional language (not just activity mentions)
  const hasEmotionalQuotes = candidate.quotes.some(q => {
    const words = q.quote.toLowerCase().split(/\s+/);
    return words.some(w => EMOTION_KEYWORDS.has(w));
  });
  if (hasEmotionalQuotes) {
    score += 15;
    reasons.push('emotional_meaning');
  }
  if (candidate.calendar_context) {
    score += 10;
    reasons.push('calendar_context');
  }
  if (candidate.type === 'recovery_signal') {
    score += 10;
    reasons.push('recovery_angle');
  }
  if (candidate.type === 'self_belief' || candidate.type === 'relationship_pattern') {
    score += 10;
    reasons.push('self_understanding');
  }

  // Negative factors
  // Activity frequency only: has quotes but they lack emotional content
  if (candidate.quotes.length > 0 && !hasEmotionalQuotes && candidate.mood_delta == null) {
    score -= 30;
    riskFlags.push('activity_frequency_only');
  }
  if (candidate.supporting_days < 3) {
    score -= 15;
    riskFlags.push('low_repetition');
  }
  // Check overlap with existing active patterns in same life category
  const candidateCategory = assignLifeCategory(candidate);
  const sameCategoryActive = existingPatterns.filter(
    p => p.status === 'active' && assignLifeCategoryFromPattern(p) === candidateCategory
  );
  if (sameCategoryActive.length >= MAX_PATTERNS_PER_LIFE_CATEGORY) {
    score -= 15;
    riskFlags.push('category_saturated');
  }

  return { score, reasons, riskFlags };
}

interface RatedCandidate {
  candidate: Candidate;
  score: number;
  reasons: string[];
  riskFlags: string[];
  lifeCategory: LifeCategory;
}

function selectBalancedPatterns(
  candidates: Candidate[],
  existingPatterns: PatternInsight[],
  goal: string | null,
): { mainPatterns: Candidate[]; thingsToWatch: Candidate[]; hidden: Candidate[] } {
  const rated: RatedCandidate[] = candidates.map(c => {
    const { score, reasons, riskFlags } = scoreCandidateUsefulness(c, goal, existingPatterns);
    const lifeCategory = assignLifeCategory(c);
    return { candidate: c, score, reasons, riskFlags, lifeCategory };
  });

  // Only hide candidates with zero evidence
  const visible = rated
    .filter(r => r.candidate.quotes.length > 0 || r.candidate.calendar_context)
    .filter(r => r.candidate.supporting_days >= 2)
    .sort((a, b) => b.score - a.score);
  const hidden = rated.filter(r =>
    (r.candidate.quotes.length === 0 && !r.candidate.calendar_context) ||
    r.candidate.supporting_days < 2
  );

  // Apply life category caps for diversity
  const categoryCounts = new Map<LifeCategory, number>();
  const selected: RatedCandidate[] = [];

  for (const r of visible) {
    const catCount = categoryCounts.get(r.lifeCategory) || 0;
    const catLimit = r.lifeCategory === 'work' ? MAX_WORK_PATTERNS : MAX_PATTERNS_PER_LIFE_CATEGORY;
    if (catCount >= catLimit) continue;
    if (selected.length >= MAX_ACTIVE_CARDS) break;
    selected.push(r);
    categoryCounts.set(r.lifeCategory, catCount + 1);
  }

  return {
    mainPatterns: selected.map(r => ({ ...r.candidate })),
    thingsToWatch: [],
    hidden: hidden.map(r => r.candidate),
  };
}


const SYSTEM_PROMPT = `You are writing a Pattern Note for Spire, a private voice journaling app.
The system has already determined that a candidate may be worth showing. Your job is not to decide whether a pattern exists. Your job is to translate evidence into a warm, careful, useful, user-facing reflection note.

Rules:
1. Do not invent evidence.
2. Do not make clinical, diagnostic, or medical claims.
3. Do not claim causality unless the user explicitly said it.
4. Never frame healthy behaviours like self-advocacy, discipline, boundaries, exercise, or rest as bad.
5. If a healthy behaviour appears alongside lower mood, frame the emotional cost around the context, not the behaviour. Example: "Standing up for yourself may be taking more energy than it should" — NOT "Self-advocacy leads to lower mood."
6. Use the user's stated goal to explain why the pattern might matter. Weave the goal connection naturally into the note.
7. If the user has a goal, the note should explain why this pattern matters for what they care about.
8. Use MBTI only as a communication and experiment-design lens, never as evidence. Never say "because you are [MBTI]" or "your type means." Instead: "Since you identify as [MBTI], you may prefer..."
9. Do not mention raw scores, averages, deltas, or scales. No numbers like "0.4", "averaged 0.8", or "scored 3/5".
10. Use direct quotes, tags, and calendar context in natural language. Reference specific activities and emotions by name.
11. Every note should feel like it was written for this specific user, not a generic observation.
12. If the evidence is weak (early_signal), frame as "something to watch," not a conclusion.
13. Avoid generic advice and productivity guilt.
14. Never say "X leads to lower mood" or "X makes you feel worse." Never use verbs like "pulls", "drags", "pushes", "tanks", "kills" with mood or energy. Never write "keeps [verb]ing your mood." Use correlational language: "your mood tends to dip when…"
15. Never imply a healthy behaviour is harmful.
16. Never use MBTI to explain why a pattern exists.
17. If "existing_title" is provided, this is an UPDATE to an existing card. The title is LOCKED — do not generate a new title. Refine the note to stay aligned with the existing title.
18. Write in second person ("you", "your").
19. Do not mention "LLM", "model", "data", "transcripts", or "backend".
20. Never use filler like "For someone tracking their patterns", "that's worth paying attention to", "as you continue to journal", or "if you're someone who." Get to the point.
21. Every card MUST reference specific activities, emotions, or quotes from the user's entries. If the title says "light days", name what made the day light. If the evidence mentions "tired", say what the user was tired from. Vague cards that could apply to anyone are not useful.
22. Do not repeat the same opening phrase across cards. Vary your sentence structure.

Confidence framing (DO NOT copy these phrases verbatim — vary your language):
- early_signal: tentative, curious, "might", "may" — frame as something to keep an eye on
- emerging_pattern: warmer, "seems", "appears" — a trend forming but not certain
- strong_pattern: confident, direct — state the pattern clearly without hedging

Tone:
- Like a caring friend who has been paying close attention to your life.
- The reader should think "this really knows me" — not "this is a data report."
- Warm but direct. Specific but not clinical. Actionable but not preachy.

MBTI-driven suggestions:
- Extraverts (E): suggest social/collaborative versions
- Introverts (I): suggest structured alone time, deeper solo versions
- Sensing (S): concrete actions with clear steps
- Intuitive (N): explore new possibilities, reframe
- Thinking (T): systems, experiments, tracking
- Feeling (F): connect with values, relationships, meaning
- Judging (J): routines, schedules, planning
- Perceiving (P): flexibility, variety, spontaneous options
- personality_framing should be a SPECIFIC suggestion tied to their MBTI, not generic
- Omit MBTI framing if mbti is null

Previous feedback:
- "true": lean into that direction with deeper suggestions
- "kind_of": refine — direction was right but framing needs adjustment
- "not_really": avoid that angle and try a different interpretation

suggested_experiment MUST be:
- A specific, concrete thing to try THIS WEEK
- Tied to the pattern evidence AND the user's personality
- Example: "Try coding at a coffee shop twice this week and note how your energy feels afterward"
- NOT: "Consider exploring social activities" (too vague)

If the output contains any of these problems, add the relevant string to safety_flags:
- "negative_causal_claim" — says X leads to/causes/pulls/drags/tanks bad mood
- "healthy_behavior_framed_as_bad" — frames self-advocacy/discipline/rest/exercise as harmful
- "activity_frequency_only" — pattern is just counting how often an activity appears
- "generic_advice" — suggestion could apply to anyone
- "generic_filler" — uses filler phrases like "for someone tracking their patterns" or "that's worth paying attention to"
- "raw_score_exposed" — raw numbers appear
- "mbti_causal_claim" — MBTI used as evidence, not framing

Return JSON only:
{
  "title": "max 80 chars, safe, warm, specific — MUST name a concrete activity, emotion, or context from the evidence. Never vague like 'light days' or 'feeling tired'.",
  "preview_note": "max 220 chars, concise card copy. The most important takeaway in 1-2 sentences.",
  "full_note": "max 600 chars, nuanced detail view copy. Structure: what pattern → why it matters emotionally → goal connection (if goal exists) → what to try.",
  "goal_connection": "required if user goal exists — explain why this pattern matters for their specific goal. Not generic. null if no goal.",
  "personality_framing": "max 250 chars, SPECIFIC MBTI-based suggestion (never causal), or null",
  "reflection_prompt": "max 180 chars, a specific question for the user",
  "suggested_experiment": "max 250 chars, a CONCRETE thing to try this week",
  "safety_flags": []
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

function describeMoodDelta(delta: number | null): string | null {
  if (delta == null) return null;
  const abs = Math.abs(delta);
  const dir = delta > 0 ? 'higher' : 'lower';
  if (abs >= 1.0) return `significantly ${dir}`;
  if (abs >= 0.7) return `noticeably ${dir}`;
  if (abs >= 0.4) return `somewhat ${dir}`;
  return `slightly ${dir}`;
}

function stripNumbersFromEvidence(summary: string): string {
  return summary
    .replace(/\bavg mood \d+(\.\d+)?\s*vs\s*overall\s*\d+(\.\d+)?/gi, '')
    .replace(/\bby \d+(\.\d+)?/g, '')
    .replace(/\b\d+(\.\d+)?\s*compared to\s*\d+(\.\d+)?/gi, '')
    .replace(/\b(averaged?|scores?|rating)\s*\d+(\.\d+)?/gi, '')
    .replace(/\b\d+\.\d+\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\(\s*\)/g, '')
    .trim();
}

async function writePatternNote(
  candidate: Candidate,
  goal: string | null,
  mbti: string | null,
  anthropicKey: string,
  feedbackHistory: FeedbackEntry[],
  existingTitle?: string | null,
): Promise<Record<string, unknown> | null> {
  const moodDescription = describeMoodDelta(candidate.mood_delta);
  const cleanEvidence = buildUserFacingEvidenceSummary(candidate);

  const payload: Record<string, unknown> = {
    user_profile: { goal: goal || 'not set', mbti: mbti || null },
    candidate_pattern: {
      type: candidate.type,
      signal: candidate.signal,
      confidence: candidate.confidence,
      supporting_days: candidate.supporting_days,
      mood_impact: moodDescription,
      related_calendar_context: candidate.calendar_context,
      quotes: candidate.quotes,
      evidence_summary: cleanEvidence,
    },
    previous_feedback: feedbackHistory.length > 0 ? feedbackHistory : undefined,
  };
  if (goal) {
    payload.goal_requirement = 'The user has a goal set. You MUST include a goal_connection that explains why this pattern matters for their specific goal. Do not restate the goal generically.';
  }
  if (existingTitle) {
    payload.existing_title = existingTitle;
    payload.update_instructions = 'This is an UPDATE to an existing pattern card. The title is locked — keep the same theme. Refresh the note, personality_framing, reflection_prompt, and suggested_experiment with updated evidence, but stay aligned with the original title.';
  }
  const userMessage = JSON.stringify(payload);

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

async function writeAndValidatePatternNote(
  candidate: Candidate,
  goal: string | null,
  mbti: string | null,
  anthropicKey: string,
  feedbackHistory: FeedbackEntry[],
  existingTitle?: string | null,
): Promise<{ result: Record<string, unknown>; safe: boolean } | null> {
  const result = await writePatternNote(candidate, goal, mbti, anthropicKey, feedbackHistory, existingTitle);
  if (!result) return null;

  const safety = validatePatternSafety(result);
  if (safety.safe) return { result, safe: true };

  console.log(`[generate-patterns] Safety validation failed for "${candidate.signal}": ${safety.flags.join(', ')}. Retrying...`);

  // Retry once — the same prompt but LLM randomness usually produces a different phrasing
  const retryResult = await writePatternNote(candidate, goal, mbti, anthropicKey, feedbackHistory, existingTitle);
  if (!retryResult) return null;

  const retrySafety = validatePatternSafety(retryResult);
  if (retrySafety.safe) return { result: retryResult, safe: true };

  console.log(`[generate-patterns] Safety retry still failed for "${candidate.signal}": ${retrySafety.flags.join(', ')}. Demoting.`);
  return { result: retryResult, safe: false };
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
    let rewriteMbti = false;
    let rewriteSplit = false;
    try {
      const body = await req.json();
      if (body?.force_refresh === true) forceRefresh = true;
      if (body?.rewrite_mbti === true) rewriteMbti = true;
      if (body?.rewrite_split === true) rewriteSplit = true;
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

    // --- MBTI Rewrite Mode ---
    // Re-run LLM note writing for all active+saved patterns with the current MBTI
    if (rewriteMbti) {
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!anthropicKey) {
        return new Response(JSON.stringify({ error: 'Server configuration error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: patternsToRewrite } = await supabase
        .from('pattern_insights')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['active', 'saved', 'watching']);

      if (!patternsToRewrite || patternsToRewrite.length === 0) {
        return new Response(JSON.stringify({ rewritten: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let rewritten = 0;
      for (const pattern of patternsToRewrite) {
        const candidate: Candidate = {
          type: pattern.pattern_type || 'recurring_theme',
          signal: pattern.title || '',
          confidence: pattern.confidence || 'early_signal',
          confidence_reason: pattern.confidence_reason || '',
          supporting_days: pattern.entry_count || 0,
          mood_delta: pattern.mood_delta || null,
          calendar_context: pattern.related_calendar_context || null,
          quotes: (pattern.supporting_quotes || []).map((q: Record<string, string>) => ({
            quote: q.quote || q.text || '',
            date: q.date || q.entryDate || '',
          })),
          evidence_summary: pattern.evidence_summary || '',
          tags: pattern.related_tags || [],
          entry_ids: pattern.supporting_entry_ids || [],
        };

        const llmResult = await writePatternNote(candidate, goal, mbti, anthropicKey, [], pattern.title);
        if (!llmResult) continue;

        await supabase
          .from('pattern_insights')
          .update({
            note: llmResult.preview_note || llmResult.note,
            goal_connection: llmResult.goal_connection || null,
            preview_note: llmResult.preview_note || llmResult.note || null,
            full_note: llmResult.full_note || llmResult.note || null,
            personality_framing: llmResult.personality_framing || null,
            reflection_prompt: llmResult.reflection_prompt || null,
            suggested_experiment: llmResult.suggested_experiment || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pattern.id);

        rewritten++;
      }

      console.log(`[generate-patterns] MBTI rewrite: ${rewritten}/${patternsToRewrite.length} patterns updated`);
      return new Response(JSON.stringify({ rewritten }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // --- One-time split rewrite: populate preview_note + full_note ---
    if (rewriteSplit) {
      const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
      if (!anthropicKey) {
        return new Response(JSON.stringify({ error: 'Server configuration error' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: allPatterns } = await supabase
        .from('pattern_insights')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['active', 'saved', 'watching']);

      // Find patterns that need rewriting: full_note is null or same as note (migration backfill)
      const patternsToSplit = (allPatterns || []).filter(
        p => !p.full_note || p.full_note === p.note
      );

      if (patternsToSplit.length === 0) {
        return new Response(JSON.stringify({ rewritten: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let rewrittenCount = 0;
      for (const pattern of patternsToSplit) {
        const candidate: Candidate = {
          type: pattern.pattern_type || 'recurring_theme',
          signal: pattern.title || '',
          confidence: pattern.confidence || 'early_signal',
          confidence_reason: pattern.confidence_reason || '',
          supporting_days: pattern.entry_count || 0,
          mood_delta: pattern.mood_delta || null,
          calendar_context: pattern.related_calendar_context || null,
          quotes: (pattern.supporting_quotes || []).map((q: Record<string, string>) => ({
            quote: q.quote || q.text || '',
            date: q.date || q.entryDate || '',
            question_index: 0,
          })),
          evidence_summary: pattern.evidence_summary || '',
          tags: pattern.related_tags || [],
          entry_ids: pattern.supporting_entry_ids || [],
        };

        const llmResult = await writePatternNote(candidate, goal, mbti, anthropicKey, [], pattern.title);
        if (!llmResult) continue;

        await supabase
          .from('pattern_insights')
          .update({
            note: llmResult.preview_note || llmResult.note || pattern.note,
            preview_note: llmResult.preview_note || llmResult.note || pattern.note,
            full_note: llmResult.full_note || llmResult.note || pattern.note,
            goal_connection: llmResult.goal_connection || pattern.goal_connection || null,
            personality_framing: llmResult.personality_framing || null,
            reflection_prompt: llmResult.reflection_prompt || null,
            suggested_experiment: llmResult.suggested_experiment || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pattern.id);

        rewrittenCount++;
      }

      console.log(`[generate-patterns] Split rewrite: ${rewrittenCount}/${patternsToSplit.length} patterns updated`);
      return new Response(JSON.stringify({ rewritten: rewrittenCount }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // Clean up dismissed patterns older than 14 days
    await supabase
      .from('pattern_insights')
      .delete()
      .eq('user_id', user.id)
      .eq('status', 'dismissed')
      .lt('updated_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());

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
        .select('id, journal_entry_id, signal_type, signal_value, normalized_value, quote, question_index, sentiment, confidence, journal_entries!inner(id, created_at, mood_score, emotion_tag, activity_tags, keyword_tags, themes, event_context)')
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

    const debug: Record<string, unknown> = {
      entries_count: entries.length,
      signals_count: signals.length,
      calendar_signals_count: calendarSignals.length,
      existing_patterns_count: existingPatterns.length,
      existing_active: existingPatterns.filter(p => p.status === 'active').map(p => ({ id: p.id, title: p.title, tags: p.related_tags })),
      existing_saved: existingPatterns.filter(p => p.status === 'saved').map(p => ({ id: p.id, title: p.title })),
      candidates_generated: candidates.map(c => ({ type: c.type, signal: c.signal, confidence: c.confidence, days: c.supporting_days, tags: c.tags })),
    };

    if (candidates.length === 0) {
      console.log('[generate-patterns] No candidates found', JSON.stringify(debug));
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
    debug.saved_tags_filter = { saved_tags: [...savedTagsLower], before: candidates.length, after: unsavedCandidates.length };

    // Cluster semantically similar candidates before limiting
    const clusteredCandidates = await clusterCandidates(unsavedCandidates, anthropicKey);
    console.log(`[generate-patterns] Clustered ${unsavedCandidates.length} candidates → ${clusteredCandidates.length} groups`);
    debug.after_clustering = clusteredCandidates.map(c => ({ type: c.type, signal: c.signal, confidence: c.confidence, tags: c.tags }));

    // Quality gate: score, classify, and select balanced set
    const { mainPatterns: selectedMain, thingsToWatch: selectedWatch } = selectBalancedPatterns(
      clusteredCandidates.slice(0, MAX_CANDIDATES),
      existingPatterns,
      goal,
    );
    const limitedCandidates = [...selectedMain, ...selectedWatch];
    console.log(`[generate-patterns] Quality gate: ${selectedMain.length} main, ${selectedWatch.length} watch, from ${clusteredCandidates.length} clustered`);
    debug.quality_gate = { main: selectedMain.length, watch: selectedWatch.length, limited: limitedCandidates.map(c => ({ signal: c.signal, type: c.type })) };

    // --- Fresh generation: dismiss all active cards, insert new ones ---
    // Previous incremental update logic caused ghost accumulation (matching failures,
    // drift inserts, no-new-evidence skips). Clean slate approach: dismiss active cards
    // that won't be regenerated, insert fresh candidates.
    // Saved cards are never touched.
    const archivedTitles: string[] = [];

    if (activePatternsList.length > 0) {
      const activeIds = activePatternsList.map(p => p.id);
      console.log(`[generate-patterns] Dismissing ${activeIds.length} active cards for fresh generation`);
      await supabase
        .from('pattern_insights')
        .update({ status: 'dismissed', updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .in('id', activeIds);
      for (const p of activePatternsList) {
        if (p.title) archivedTitles.push(p.title);
      }
    }
    debug.dismissed_active = activePatternsList.length;

    const resultPatterns: Record<string, unknown>[] = [];
    let currentActiveCount = 0;

    for (const candidate of limitedCandidates) {
      if (currentActiveCount >= MAX_ACTIVE_CARDS) break;

      const validated = await writeAndValidatePatternNote(candidate, goal, mbti, anthropicKey, feedbackHistory);
      if (!validated) continue;
      if (!validated.safe) {
        console.log(`[generate-patterns] Hiding unsafe new pattern for signal: ${candidate.signal}`);
        continue;
      }
      const llmResult = validated.result;

      const allDates = candidate.quotes.map(q => q.date).filter(Boolean).sort();
      const row = {
        user_id: user.id,
        pattern_type: candidate.type,
        title: llmResult.title,
        note: llmResult.preview_note || llmResult.note,
        goal_connection: llmResult.goal_connection || null,
        preview_note: llmResult.preview_note || llmResult.note || null,
        full_note: llmResult.full_note || llmResult.note || null,
        personality_framing: llmResult.personality_framing || null,
        evidence_summary: buildUserFacingEvidenceSummary(candidate),
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
      } else if (insertError) {
        console.error(`[generate-patterns] Insert failed for ${candidate.signal}:`, insertError.message);
      }
    }

    debug.result_count = resultPatterns.length;
    debug.active_count_before = activePatternsList.length;
    console.log(`[generate-patterns] Fresh generation: ${limitedCandidates.length} candidates, ${resultPatterns.length} inserted`, JSON.stringify(debug));

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
