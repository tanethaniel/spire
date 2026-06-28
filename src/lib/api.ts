import { supabase } from './supabase';
import { captureException } from './posthog';
import type { CalendarEvent, JournalEntry, UserSettings, PatternNote, PatternFeedback, PatternStatus, SessionFormat } from '../types/session';

const EDGE_FUNCTION_BASE = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

async function fetchWithAuth(url: string, options: RequestInit): Promise<Response> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, { ...options, headers: { ...options.headers, ...headers } });

  if (res.status === 401) {
    const { error } = await supabase.auth.refreshSession();
    if (error) {
      window.dispatchEvent(new CustomEvent('spire:auth-expired'));
      return res;
    }
    const freshHeaders = await getAuthHeaders();
    const retry = await fetch(url, { ...options, headers: { ...options.headers, ...freshHeaders } });
    if (retry.status === 401) {
      window.dispatchEvent(new CustomEvent('spire:auth-expired'));
    }
    return retry;
  }

  return res;
}

const DEFAULT_TIMEOUT = 15_000;
const LONG_TIMEOUT = 45_000;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  { timeout = DEFAULT_TIMEOUT, maxRetries = 2 }: { timeout?: number; maxRetries?: number } = {},
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetchWithAuth(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (res.status >= 500 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }
  captureException(lastError, { endpoint: url, retries: maxRetries });
  throw lastError;
}

// Calendar events are fetched server-side via the fetch-calendar edge function.
// The Google provider token never persists in browser storage.
export async function fetchCalendarEvents(targetDate?: Date): Promise<CalendarEvent[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const day = targetDate ?? new Date();
  const timeMin = new Date(day.getFullYear(), day.getMonth(), day.getDate()).toISOString();
  const timeMax = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).toISOString();

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
  const body: Record<string, string> = { text };
  if (instructions) body.instructions = instructions;
  const res = await fetchWithRetry(`${EDGE_FUNCTION_BASE}/text-to-speech`, {
    method: 'POST',
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LONG_TIMEOUT);
  const res = await fetch(`${EDGE_FUNCTION_BASE}/process-entry`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: formData,
    signal: controller.signal,
  });
  clearTimeout(timer);
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
  crisis_flag?: boolean;
}

export async function analyzeSession(
  transcripts: (string | null)[],
  format?: SessionFormat,
): Promise<AnalysisResult> {
  const res = await fetchWithRetry(`${EDGE_FUNCTION_BASE}/analyze-session`, {
    method: 'POST',
    body: JSON.stringify({ transcripts, format }),
  });
  if (!res.ok) throw new Error(`analyze-session failed: ${res.status}`);
  return res.json();
}

export interface FollowUp {
  question: string;
  subPrompt: string;
  toneInstruction: string;
}

export async function generateFollowups(
  openTranscript: string,
  calendarEvents: CalendarEvent[] | null,
  targetDate: string | null,
): Promise<FollowUp[]> {
  const res = await fetchWithRetry(`${EDGE_FUNCTION_BASE}/generate-followups`, {
    method: 'POST',
    body: JSON.stringify({
      open_transcript: openTranscript,
      calendar_events: calendarEvents,
      target_date: targetDate,
    }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.followups) ? data.followups : [];
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
  targetDate?: string | null;
  session_format?: SessionFormat;
  freeform_transcript?: string | null;
  followup_transcripts?: { question: string; transcript: string }[];
}): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Dedup on session UUID: skip if this session was already saved.
  const { data: existing } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('user_id', user.id)
    .eq('session_id', entry.sessionId)
    .maybeSingle();
  if (existing) return existing.id;

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
  if (entry.targetDate) {
    row.created_at = entry.targetDate;
  }
  if (entry.session_format === 'branching') {
    row.session_format = 'branching';
    row.freeform_transcript = entry.freeform_transcript ?? null;
    row.followup_transcripts = entry.followup_transcripts ?? [];
  } else {
    entry.transcripts.forEach((t, i) => {
      row[`q${i + 1}_transcript`] = t;
    });
  }

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
    .select('interpretation_enabled, mbti, onboarding_completed, goal, tooltips_seen')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;

  return {
    interpretationEnabled: data ? data.interpretation_enabled : true,
    mbti: data?.mbti ?? null,
    onboardingCompleted: data?.onboarding_completed ?? false,
    goal: data?.goal ?? null,
    tooltipsSeen: Array.isArray(data?.tooltips_seen) ? data.tooltips_seen : [],
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
    tooltips_seen: settings.tooltipsSeen,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function saveGoogleRefreshToken(refreshToken: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('user_settings').upsert({
    user_id: user.id,
    google_refresh_token: refreshToken,
    updated_at: new Date().toISOString(),
  });
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

  const entries = (data ?? []).map((row): JournalEntry => {
    const isBranching = row.session_format === 'branching';
    const followups = Array.isArray(row.followup_transcripts) ? row.followup_transcripts : [];
    const transcripts = isBranching
      ? [row.freeform_transcript, ...followups.map((f: { transcript: string }) => f.transcript)]
      : [row.q1_transcript, row.q2_transcript, row.q3_transcript, row.q4_transcript, row.q5_transcript, row.q6_transcript];

    return {
      id: row.id,
      createdAt: row.created_at,
      transcripts,
      themes: row.themes ? filterMetaThemes(row.themes) : row.themes,
      insight: filterMetaInsight(row.insight),
      moodScore: row.mood_score ?? null,
      emotionTag: row.emotion_tag ?? null,
      activityTags: row.activity_tags ?? null,
      summary: filterMetaSummary(row.summary),
      keywordTags: row.keyword_tags ?? null,
      eventContext: row.event_context,
      durationMs: row.duration_ms,
      sessionFormat: row.session_format ?? 'structured',
      freeformTranscript: row.freeform_transcript ?? null,
      followupTranscripts: followups.length > 0 ? followups : null,
    };
  });

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

// --- Signal Extraction & Pattern Generation ---

export async function extractEntrySignals(entryId: string): Promise<void> {
  const res = await fetchWithRetry(`${EDGE_FUNCTION_BASE}/extract-entry-signals`, {
    method: 'POST',
    body: JSON.stringify({ entry_id: entryId }),
  });
  if (!res.ok) {
    console.error('[extractEntrySignals] failed:', res.status);
  }
}

export async function refreshPatternSlots(
  action: 'refresh' | 'save' | 'dismiss' = 'refresh',
  patternId?: string,
): Promise<PatternNote[]> {
  const res = await fetchWithRetry(`${EDGE_FUNCTION_BASE}/manage-pattern-slots`, {
    method: 'POST',
    body: JSON.stringify({ action, pattern_id: patternId }),
  });
  if (!res.ok) {
    console.error('[refreshPatternSlots] failed:', res.status);
    return [];
  }
  const data = await res.json();
  return (data.patterns ?? []).map(mapPatternNote);
}

export async function matchPatternEvidence(entryId: string): Promise<void> {
  await fetchWithRetry(`${EDGE_FUNCTION_BASE}/match-pattern-evidence`, {
    method: 'POST',
    body: JSON.stringify({ entry_id: entryId }),
  });
}

export async function fetchPatternNotes(): Promise<PatternNote[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('pattern_pool')
    .select('*')
    .eq('user_id', user.id)
    .in('slot_state', ['active', 'dimmed', 'saved'])
    .order('slot_promoted_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map(mapPatternNote);
}

export async function getLatestEntryDate(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('journal_entries')
    .select('created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return data?.created_at ?? null;
}

export async function updatePatternFeedback(
  patternId: string,
  feedback: PatternFeedback,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('pattern_pool')
    .update({ user_feedback: feedback, updated_at: now, last_interacted_at: now })
    .eq('id', patternId);
  if (error) throw error;
}

export async function clearNewEvidence(patternId: string): Promise<void> {
  const { error } = await supabase
    .from('pattern_pool')
    .update({ has_new_evidence: false })
    .eq('id', patternId);
  if (error) throw error;
}

export async function updatePatternStatus(
  patternId: string,
  status: PatternStatus,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('pattern_pool')
    .update({ slot_state: status, updated_at: now, last_interacted_at: now })
    .eq('id', patternId);
  if (error) throw error;
}

export async function deleteAccount(): Promise<void> {
  const res = await fetchWithRetry(`${EDGE_FUNCTION_BASE}/delete-account`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || `delete-account failed: ${res.status}`);
  }
  await supabase.auth.signOut();
}

export async function deletePattern(patternId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('pattern_pool')
    .update({ slot_state: 'dismissed', updated_at: now })
    .eq('id', patternId);
  if (error) throw error;
}

function mapPatternNote(row: Record<string, unknown>): PatternNote {
  const slotState = (row.slot_state as PatternNote['slotState']) ?? 'active';
  const previewNote = (row.preview_note as string) ?? null;

  return {
    id: String(row.id),
    patternKind: (row.pattern_kind as PatternNote['patternKind']) ?? 'behavioral_link',
    title: String(row.title ?? ''),
    previewNote,
    fullNote: (row.full_note as string) ?? null,
    goalConnection: row.goal_connection as string | null,
    personalityFraming: row.personality_framing as string | null,
    confidence: (row.confidence as PatternNote['confidence']) ?? 'early_signal',
    evidenceCount: (row.evidence_count as number) ?? 0,
    sessionCount: (row.session_count as number) ?? 0,
    slotState,
    hasNewEvidence: (row.has_new_evidence as boolean) ?? false,
    decayStartedAt: row.decay_started_at as string | null,
    relatedTags: row.related_tags as string[] | null,
    moodDelta: row.mood_delta as number | null,
    reflectionPrompt: row.reflection_prompt as string | null,
    suggestedExperiment: row.suggested_experiment as string | null,
    userFeedback: (row.user_feedback as PatternNote['userFeedback']) ?? null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    // Legacy compat
    status: slotState,
    note: previewNote ?? String(row.title ?? ''),
  };
}

