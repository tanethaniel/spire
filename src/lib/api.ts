import { supabase } from './supabase';
import type { CalendarEvent } from '../types/session';

const EDGE_FUNCTION_BASE = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  };
}

export async function extractEvents(imageBase64: string): Promise<CalendarEvent[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${EDGE_FUNCTION_BASE}/extract-events`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ image: imageBase64 }),
  });
  if (!res.ok) throw new Error(`extract-events failed: ${res.status}`);
  const data = await res.json();
  return data.events;
}

export async function generateQ1Audio(events: CalendarEvent[]): Promise<ArrayBuffer> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${EDGE_FUNCTION_BASE}/generate-q1`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ events }),
  });
  if (!res.ok) throw new Error(`generate-q1 failed: ${res.status}`);
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
  if (!res.ok) throw new Error(`process-entry failed: ${res.status}`);
  return res.json();
}

export async function analyzeSession(
  transcripts: (string | null)[],
): Promise<{ themes: string[]; insight: string }> {
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
  transcripts: (string | null)[];
  themes: string[] | null;
  insight: string | null;
  event_context: CalendarEvent[] | null;
  duration_ms: number;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const row: Record<string, unknown> = {
    user_id: user.id,
    event_context: entry.event_context,
    themes: entry.themes,
    insight: entry.insight,
    duration_ms: entry.duration_ms,
  };
  entry.transcripts.forEach((t, i) => {
    row[`q${i + 1}_transcript`] = t;
  });

  const { error } = await supabase.from('journal_entries').insert(row);
  if (error) throw error;
}
