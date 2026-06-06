import { supabase } from './supabase';
import type { CalendarEvent, JournalEntry, UserSettings } from '../types/session';

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
  activity_tags: string[];
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
  activity_tags: string[] | null;
  event_context: CalendarEvent[] | null;
  duration_ms: number;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Dedup on session UUID: skip if this session was already saved.
  const { count } = await supabase
    .from('journal_entries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('session_id', entry.sessionId);
  if ((count ?? 0) > 0) return;

  const row: Record<string, unknown> = {
    user_id: user.id,
    session_id: entry.sessionId,
    event_context: entry.event_context,
    themes: entry.themes,
    insight: entry.insight,
    mood_score: entry.mood_score,
    activity_tags: entry.activity_tags,
    duration_ms: entry.duration_ms,
  };
  entry.transcripts.forEach((t, i) => {
    row[`q${i + 1}_transcript`] = t;
  });

  const { error } = await supabase.from('journal_entries').insert(row);
  if (error) throw error;
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
    .select('interpretation_enabled')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;

  // Default to Interpreted mode when no row exists yet.
  return { interpretationEnabled: data ? data.interpretation_enabled : true };
}

export async function setUserSettings(settings: UserSettings): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('user_settings').upsert({
    user_id: user.id,
    interpretation_enabled: settings.interpretationEnabled,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// --- History (past entries for History + Insights views) ---

const META_WORDS = /\b(transcript|session|entry|data|record|absent|empty|incomplete|brief response)/i;

function filterMetaThemes(themes: string[]): string[] {
  return themes.filter(t => !META_WORDS.test(t));
}

function filterMetaInsight(insight: string | null): string | null {
  if (!insight) return null;
  return META_WORDS.test(insight) ? null : insight;
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
    activityTags: row.activity_tags ?? null,
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
