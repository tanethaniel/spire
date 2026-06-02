import { supabase } from './supabase';

type EventType =
  | 'session_open'
  | 'question_started'
  | 'question_completed'
  | 'question_skipped'
  | 'session_completed'
  | 'session_abandoned';

interface EventPayload {
  event: EventType;
  question_index?: number;
  source?: 'direct' | 'email' | 'unknown';
  duration_ms?: number;
  metadata?: Record<string, unknown>;
}

function getSessionSource(): 'direct' | 'email' | 'unknown' {
  const params = new URLSearchParams(window.location.search);
  if (params.get('utm_source') === 'email') return 'email';
  if (params.get('ref') === 'email') return 'email';
  if (document.referrer === '') return 'direct';
  return 'unknown';
}

export async function trackEvent(payload: EventPayload): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('user_events').insert({
      user_id: user.id,
      event: payload.event,
      question_index: payload.question_index ?? null,
      source: payload.source ?? (payload.event === 'session_open' ? getSessionSource() : null),
      duration_ms: payload.duration_ms ?? null,
      metadata: payload.metadata ?? null,
    });
  } catch {
    // Event tracking is best-effort — never block the user
  }
}
