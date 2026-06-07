import { supabase } from './supabase';
import type { CalendarEvent, JournalEntry, UserSettings, PatternNote, PatternFeedback, PatternStatus } from '../types/session';

const EDGE_FUNCTION_BASE = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

// Calendar events are fetched server-side via the fetch-calendar edge function.
// The Google provider token never persists in browser storage.
export async function fetchCalendarEvents(): Promise<CalendarEvent[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

  const res = await fetch(`${EDGE_FUNCTION_BASE}/fetch-calendar`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      provider_token: session.provider_token ?? null,
      refresh_token: sessionStorage.getItem('google_refresh_token') ?? null,
    }),
  });

  if (!res.ok) throw new Error(`calendar API failed: ${res.status}`);

  const data = await res.json();
  if (data.error === 'token_expired' || data.error === 'calendar_scope_missing') {
    throw new Error(data.error);
  }
  return data.events ?? [];
}

export async function textToSpeech(text: string, instructions?: string): Promise<ArrayBuffer> {
  const headers = await getAuthHeaders();
  const body: Record<string, string> = { text };
  if (instructions) body.instructions = instructions;
  const res = await fetch(`${EDGE_FUNCTION_BASE}/text-to-speech`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`text-to-speech failed: ${res.status}`);
  return res.arrayBuffer();
}

export async function processEntry(
  audioBlob: Blob,
  questionIndex: number,
  mimeType: string,
): Promise<{ transcript: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const formData = new FormData();
  const ext = mimeType.startsWith('audio/mp4') ? 'mp4' : 'webm';
  formData.append('audio', audioBlob, `recording.${ext}`);
  formData.append('question_index', String(questionIndex));

  const res = await fetch(`${EDGE_FUNCTION_BASE}/process-entry`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: formData,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`process-entry failed: ${res.status} ${detail}`);
  }
  return res.json();
}

export interface AnalysisResult {
  themes: string[];
  insight: string | null;
  mood_score: number | null;
  emotion_tag: string | null;
  activity_tags: string[];
  summary: string | null;
  keyword_tags: string[];
}

export async function analyzeSession(
  transcripts: (string | null)[],
): Promise<AnalysisResult> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${EDGE_FUNCTION_BASE}/analyze-session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ transcripts }),
  });
  if (!res.ok) throw new Error(`analyze-session failed: ${res.status}`);
  return res.json();
}

export async function saveJournalEntry(entry: {
  sessionId: string;
  transcripts: (string | null)[];
  themes: string[] | null;
  insight: string | null;
  mood_score: number | null;
  emotion_tag: string | null;
  activity_tags: string[] | null;
  summary: string | null;
  keyword_tags: string[] | null;
  event_context: CalendarEvent[] | null;
  duration_ms: number;
  emotion_tag: string | null;
}): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Dedup on session UUID: skip if this session was already saved.
  const { count } = await supabase
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('session_id', entry.sessionId);
  if ((count ?? 0) > 0) return null;

  const row: Record<string, unknown> = {
    user_id: user.id,
    session_id: entry.sessionId,
    event_context: entry.event_context,
    themes: entry.themes,
    insight: entry.insight,
    mood_score: entry.mood_score,
    emotion_tag: entry.emotion_tag,
    activity_tags: entry.activity_tags,
    summary: entry.summary,
    keyword_tags: entry.keyword_tags,
    duration_ms: entry.duration_ms,
  };
  entry.transcripts.forEach((t, i) => {
    row[`q${i + 1}_transcript`] = t;
  });

  const { data, error } = await supabase.from('journal_entries').insert(row).select('id').single();
  if (error) throw error;
  return data?.id ?? null;
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('journal_entries')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw error;
}

// --- Settings (synced, server-enforced interpretation toggle) ---

export async function getUserSettings(): Promise<UserSettings> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('user_settings')
    .select('interpretation_enabled, mbti, onboarding_completed, goal')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;

  return {
    interpretationEnabled: data ? data.interpretation_enabled : true,
    mbti: data?.mbti ?? null,
    onboardingCompleted: data?.onboarding_completed ?? false,
    goal: data?.goal ?? null,
  };
}

export async function setUserSettings(settings: UserSettings): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('user_settings').upsert({
    user_id: user.id,
    interpretation_enabled: settings.interpretationEnabled,
    mbti: settings.mbti,
    onboarding_completed: settings.onboardingCompleted,
    goal: settings.goal,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// --- History (past entries for History + Insights views) ---

const META_WORDS = /\b(transcript|journal entry|journal session|no data|absent entry|empty entry|incomplete entry|brief response)/i;

function filterMetaThemes(themes: string[]): string[] {
  return themes.filter(t => !META_WORDS.test(t));
}

function filterMetaInsight(insight: string | null): string | null {
  if (!insight) return null;
  return META_WORDS.test(insight) ? null : insight;
}

function filterMetaSummary(summary: string | null | undefined): string | null {
  if (!summary) return null;
  return META_WORDS.test(summary) ? null : summary;
}

export async function fetchJournalEntries(): Promise<JournalEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const entries = (data ?? []).map((row): JournalEntry => ({
    id: row.id,
    createdAt: row.created_at,
    transcripts: [
      row.q1_transcript, row.q2_transcript, row.q3_transcript,
      row.q4_transcript, row.q5_transcript, row.q6_transcript,
    ],
    themes: row.themes ? filterMetaThemes(row.themes) : row.themes,
    insight: filterMetaInsight(row.insight),
    moodScore: row.mood_score ?? null,
    emotionTag: row.emotion_tag ?? null,
    activityTags: row.activity_tags ?? null,
    summary: filterMetaSummary(row.summary),
    keywordTags: row.keyword_tags ?? null,
    eventContext: row.event_context,
    durationMs: row.duration_ms,
  }));

  // Deduplicate: entries with identical transcripts on the same day are dupes
  const seen = new Set<string>();
  return entries.filter(e => {
    const day = e.createdAt.slice(0, 10);
    const key = day + '|' + e.transcripts.map(t => t ?? '').join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- Pattern Notes ---

export async function extractEntrySignals(entryId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${EDGE_FUNCTION_BASE}/extract-entry-signals`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ entry_id: entryId }),
  });
  if (!res.ok) {
    console.error('[extractEntrySignals] failed:', res.status);
  }
}

export async function generatePatterns(forceRefresh = false): Promise<PatternNote[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${EDGE_FUNCTION_BASE}/generate-patterns`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ force_refresh: forceRefresh }),
  });
  if (!res.ok) {
    console.error('[generatePatterns] failed:', res.status);
    return [];
  }
  const data = await res.json();
  return (data.patterns ?? []).map(mapPatternNote);
}

export async function fetchPatternNotes(): Promise<PatternNote[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('pattern_insights')
    .select('*')
    .eq('user_id', user.id)
    .in('status', ['active', 'saved', 'watching'])
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map(mapPatternNote);
}

export async function updatePatternFeedback(
  patternId: string,
  feedback: PatternFeedback,
): Promise<void> {
  const { error } = await supabase
    .from('pattern_insights')
    .update({ user_feedback: feedback, updated_at: new Date().toISOString() })
    .eq('id', patternId);
  if (error) throw error;
}

export async function updatePatternStatus(
  patternId: string,
  status: PatternStatus,
): Promise<void> {
  const { error } = await supabase
    .from('pattern_insights')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', patternId);
  if (error) throw error;
}

function mapPatternNote(row: Record<string, unknown>): PatternNote {
  return {
    id: row.id as string,
    patternType: row.pattern_type as string,
    title: row.title as string,
    note: row.note as string,
    goalConnection: (row.goal_connection as string) ?? null,
    personalityFraming: (row.personality_framing as string) ?? null,
    evidenceSummary: (row.evidence_summary as string) ?? null,
    confidence: row.confidence as PatternNote['confidence'],
    confidenceReason: (row.confidence_reason as string) ?? null,
    evidenceCount: (row.evidence_count as number) ?? null,
    entryCount: (row.entry_count as number) ?? null,
    dateRangeStart: (row.date_range_start as string) ?? null,
    dateRangeEnd: (row.date_range_end as string) ?? null,
    supportingQuotes: (row.supporting_quotes as PatternNote['supportingQuotes']) ?? null,
    relatedCalendarContext: (row.related_calendar_context as Record<string, unknown>) ?? null,
    relatedTags: (row.related_tags as string[]) ?? null,
    moodDelta: (row.mood_delta as number) ?? null,
    reflectionPrompt: (row.reflection_prompt as string) ?? null,
    suggestedExperiment: (row.suggested_experiment as string) ?? null,
    suggestedIfThenPlan: (row.suggested_if_then_plan as PatternNote['suggestedIfThenPlan']) ?? null,
    status: row.status as PatternNote['status'],
    userFeedback: (row.user_feedback as PatternNote['userFeedback']) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
