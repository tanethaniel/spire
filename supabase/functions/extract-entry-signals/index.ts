import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('SITE_URL') || 'http://localhost:5173';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Maximum number of extractions a user can perform per day
const MAX_EXTRACTIONS_PER_DAY = 50;

// Maximum number of signals allowed per entry
const MAX_SIGNALS_PER_ENTRY = 30;

const ALLOWED_SIGNAL_TYPES = new Set([
  'activity', 'emotion', 'energy', 'stress', 'relationship', 'work',
  'health', 'recovery', 'self_belief', 'need', 'value', 'avoidance',
  'gratitude', 'learning', 'memory', 'social_context',
]);

const TRANSCRIPT_FIELDS = [
  'q1_transcript', 'q2_transcript', 'q3_transcript',
  'q4_transcript', 'q5_transcript', 'q6_transcript',
] as const;

const SYSTEM_PROMPT = `You are a signal extraction engine for a private voice journal. Your job is to extract grounded signals from journal transcripts.

You extract THREE kinds of signals:

## 1. Flat signals (signal_kind: "flat")
Traditional tag extraction. Every signal MUST have a direct quote as evidence.

Signal types: activity, emotion, energy, stress, relationship, work, health, recovery, self_belief, need, value, avoidance, gratitude, learning, memory, social_context

Canonical activity values (prefer these): gym, running, walking, yoga, work, meetings, deep work, reading, cooking, friends, family, partner, coding, creative work, learning, commuting, errands, rest, sleep
Canonical emotion values: happy, sad, angry, tired, anxious, bored, focused, okay, peaceful
Canonical energy values: energized, steady, tired, drained, restless, overwhelmed, clear, scattered

## 2. Behavioral links (signal_kind: "behavioral_link")
Connections between a context/trigger, a response/action, and an emotional outcome. These can be POSITIVE or NEGATIVE.
Extract these when the user describes doing something IN RESPONSE to a situation and mentions how it felt.
Examples:
- "After all those meetings I just needed to move my body, and I felt so much better after the gym" → trigger: "packed meetings", response: "gym", emotional_outcome: "felt much better, cleared head", outcome_valence: 1
- "Calling my sister always makes the week feel lighter" → trigger: "tough week", response: "called sister", emotional_outcome: "felt lighter and more connected", outcome_valence: 2
- "I skipped lunch again because of back-to-back meetings and felt awful by 4pm" → trigger: "back-to-back meetings", response: "skipped lunch", emotional_outcome: "felt awful, drained", outcome_valence: -2

Only extract behavioral links when ALL THREE parts (trigger, response, outcome) are present or strongly implied in the text. Do not fabricate any part.

## 3. Emotional themes (signal_kind: "emotional_theme")
Recurring inner states, beliefs, or emotional patterns. These include BOTH positive and negative inner states — pride, gratitude, growing confidence, self-doubt, longing, or unresolved feelings.
Extract these when the user expresses an emotional state that goes deeper than a momentary mood.
Examples:
- "I keep wondering if I'm actually good enough for this role" → theme: "self-doubt about competence", intensity: "strong", context: "work role"
- "I'm starting to feel like I actually belong here" → theme: "growing sense of belonging", intensity: "moderate", context: "work"
- "Every time I make something with my hands I feel like myself again" → theme: "creative fulfillment as identity", intensity: "strong", context: "hobbies"

Only extract emotional themes when the language carries genuine emotional weight. "Work was fine" is NOT a theme. "I can't shake this feeling that I'm falling behind" IS. "I genuinely feel proud of how I handled that" also IS.

Rules:
1. Every signal MUST have a direct quote from the transcript as evidence
2. Quotes must be exact or near-exact substrings from the transcript
3. Do not infer signals that aren't supported by the text
4. Do not create signals for skipped or empty answers
5. Normalize values to lowercase
6. Prioritize behavioral_link and emotional_theme signals — these are more valuable than flat signals
7. A single passage can produce both a flat signal AND a behavioral_link or emotional_theme
8. Be selective with emotional_theme: only extract when the language shows real emotional weight — positive (pride, gratitude, growth) or negative (doubt, frustration, loss). Neutral observations are not themes

Return JSON only:
{"signals": [
  {"signal_kind": "flat", "question_index": 0, "quote": "exact quote", "signal_type": "activity", "signal_value": "working out", "normalized_value": "gym", "sentiment": 1, "confidence": 0.85},
  {"signal_kind": "behavioral_link", "question_index": 0, "quote": "exact quote", "trigger_context": "packed meetings", "response": "gym", "emotional_outcome": "felt clearer and calmer", "outcome_valence": 1, "confidence": 0.9},
  {"signal_kind": "emotional_theme", "question_index": 2, "quote": "exact quote", "theme": "self-doubt about competence", "intensity": "strong", "context": "work feedback", "confidence": 0.85}
]}

sentiment / outcome_valence: -2 to 2 (very negative to very positive), or null if neutral
confidence: 0 to 1
intensity: "low", "moderate", or "strong"`;

interface RawSignal {
  signal_kind?: unknown;
  question_index?: unknown;
  quote?: unknown;
  // flat signal fields
  signal_type?: unknown;
  signal_value?: unknown;
  normalized_value?: unknown;
  sentiment?: unknown;
  confidence?: unknown;
  // behavioral_link fields
  trigger_context?: unknown;
  response?: unknown;
  emotional_outcome?: unknown;
  outcome_valence?: unknown;
  // emotional_theme fields
  theme?: unknown;
  intensity?: unknown;
  context?: unknown;
}

type SignalKind = 'flat' | 'behavioral_link' | 'emotional_theme';

interface ValidFlatSignal {
  signal_kind: 'flat';
  question_index: number;
  quote: string;
  signal_type: string;
  signal_value: string;
  normalized_value: string;
  sentiment: number | null;
  confidence: number;
}

interface ValidBehavioralLink {
  signal_kind: 'behavioral_link';
  question_index: number;
  quote: string;
  trigger_context: string;
  response: string;
  emotional_outcome: string;
  outcome_valence: number;
  confidence: number;
}

interface ValidEmotionalTheme {
  signal_kind: 'emotional_theme';
  question_index: number;
  quote: string;
  theme: string;
  intensity: 'low' | 'moderate' | 'strong';
  context: string;
  confidence: number;
}

type ValidSignal = ValidFlatSignal | ValidBehavioralLink | ValidEmotionalTheme;

const VALID_INTENSITIES = new Set(['low', 'moderate', 'strong']);

function clampConfidence(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, Math.min(1, raw));
  }
  return 0.5;
}

function clampValence(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(-2, Math.min(2, Math.round(raw)));
  }
  return null;
}

function trimStr(raw: unknown, maxLen: number): string {
  return typeof raw === 'string' ? raw.trim().slice(0, maxLen) : '';
}

function validateSignal(raw: RawSignal): ValidSignal | null {
  if (typeof raw.quote !== 'string' || raw.quote.trim().length === 0) return null;

  const qi = typeof raw.question_index === 'number' ? raw.question_index : 0;
  const kind: SignalKind = (raw.signal_kind === 'behavioral_link' || raw.signal_kind === 'emotional_theme')
    ? raw.signal_kind
    : 'flat';

  if (kind === 'behavioral_link') {
    const trigger = trimStr(raw.trigger_context, 100);
    const response = trimStr(raw.response, 100);
    const outcome = trimStr(raw.emotional_outcome, 150);
    if (!trigger || !response || !outcome) return null;

    const valence = clampValence(raw.outcome_valence);
    if (valence == null) return null;

    return {
      signal_kind: 'behavioral_link',
      question_index: qi,
      quote: raw.quote.trim(),
      trigger_context: trigger,
      response: response,
      emotional_outcome: outcome,
      outcome_valence: valence,
      confidence: clampConfidence(raw.confidence),
    };
  }

  if (kind === 'emotional_theme') {
    const theme = trimStr(raw.theme, 100);
    const context = trimStr(raw.context, 100);
    if (!theme) return null;

    const intensity = typeof raw.intensity === 'string' && VALID_INTENSITIES.has(raw.intensity)
      ? raw.intensity as 'low' | 'moderate' | 'strong'
      : 'moderate';

    return {
      signal_kind: 'emotional_theme',
      question_index: qi,
      quote: raw.quote.trim(),
      theme: theme.toLowerCase(),
      intensity,
      context: context.toLowerCase(),
      confidence: clampConfidence(raw.confidence),
    };
  }

  // Flat signal
  if (typeof raw.signal_type !== 'string' || !ALLOWED_SIGNAL_TYPES.has(raw.signal_type)) return null;

  const signalValue = trimStr(raw.signal_value, 50);
  const normalizedValue = typeof raw.normalized_value === 'string'
    ? raw.normalized_value.toLowerCase().trim().slice(0, 50)
    : signalValue.toLowerCase().trim().slice(0, 50);

  if (normalizedValue.length === 0) return null;

  return {
    signal_kind: 'flat',
    question_index: qi,
    quote: raw.quote.trim(),
    signal_type: raw.signal_type,
    signal_value: signalValue || normalizedValue,
    normalized_value: normalizedValue,
    sentiment: clampValence(raw.sentiment),
    confidence: clampConfidence(raw.confidence),
  };
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

    const body = await req.json();
    const entryId = body?.entry_id;

    if (!entryId || typeof entryId !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid request: entry_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limit: count distinct journal entries with signals today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: rateLimitData } = await supabase
      .from('entry_signals')
      .select('journal_entry_id')
      .eq('user_id', user.id)
      .gte('created_at', todayStart.toISOString());

    const distinctEntries = new Set(
      (rateLimitData ?? []).map((r: { journal_entry_id: string }) => r.journal_entry_id),
    );
    // Don't count the current entry if it already has signals (re-extraction)
    distinctEntries.delete(entryId);
    if (distinctEntries.size >= MAX_EXTRACTIONS_PER_DAY) {
      return new Response(JSON.stringify({ error: 'Daily limit reached' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the journal entry and verify ownership
    const { data: entry, error: entryError } = await supabase
      .from('journal_entries')
      .select('id, user_id, q1_transcript, q2_transcript, q3_transcript, q4_transcript, q5_transcript, q6_transcript, session_format, freeform_transcript, followup_transcripts')
      .eq('id', entryId)
      .single();

    if (entryError || !entry) {
      return new Response(JSON.stringify({ error: 'Entry not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (entry.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build transcript text from either branching or structured format
    let filledTranscripts: string;
    if (entry.freeform_transcript) {
      const parts: string[] = [`Open: ${entry.freeform_transcript}`];
      const followups = Array.isArray(entry.followup_transcripts) ? entry.followup_transcripts : [];
      for (let i = 0; i < followups.length; i++) {
        const f = followups[i] as { transcript?: string };
        if (f?.transcript) parts.push(`Follow-up ${i + 1}: ${f.transcript}`);
      }
      filledTranscripts = parts.join('\n\n');
    } else {
      const transcripts: (string | null)[] = TRANSCRIPT_FIELDS.map(
        (field) => entry[field] as string | null,
      );
      filledTranscripts = transcripts
        .map((t, i) => t ? `Q${i + 1}: ${t}` : null)
        .filter(Boolean)
        .join('\n\n');
    }

    if (!filledTranscripts) {
      return new Response(JSON.stringify({ signals: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      console.error('[extract-entry-signals] ANTHROPIC_API_KEY not configured');
      return new Response(JSON.stringify({ signals: [], error: 'extraction_failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call Claude to extract signals
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Extract signals from these journal transcripts:\n\n<transcripts>\n${filledTranscripts}\n</transcripts>`,
        }],
      }),
    });

    if (!response.ok) {
      console.error('[extract-entry-signals] Anthropic API error:', response.status);
      return new Response(JSON.stringify({ signals: [], error: 'extraction_failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    let text = result.content?.[0]?.text || '{}';

    // Strip markdown code fences if present
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) text = fenced[1].trim();
    else text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error('[extract-entry-signals] Failed to parse Claude response');
      return new Response(JSON.stringify({ signals: [], error: 'extraction_failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate and normalize signals
    const rawSignals: RawSignal[] = Array.isArray(parsed.signals) ? parsed.signals : [];
    const validSignals: ValidSignal[] = rawSignals
      .map(validateSignal)
      .filter((s): s is ValidSignal => s !== null)
      .slice(0, MAX_SIGNALS_PER_ENTRY);

    // Insert signals into entry_signals table
    const insertedSignals: ValidSignal[] = [];
    for (const signal of validSignals) {
      const row: Record<string, unknown> = {
        user_id: user.id,
        journal_entry_id: entryId,
        question_index: signal.question_index,
        source_transcript: transcripts[signal.question_index] || null,
        quote: signal.quote,
        signal_kind: signal.signal_kind,
        confidence: signal.confidence,
      };

      if (signal.signal_kind === 'flat') {
        row.signal_type = signal.signal_type;
        row.signal_value = signal.signal_value;
        row.normalized_value = signal.normalized_value;
        row.sentiment = signal.sentiment;
      } else if (signal.signal_kind === 'behavioral_link') {
        row.signal_type = 'behavioral_link';
        row.signal_value = signal.response;
        row.normalized_value = signal.response.toLowerCase();
        row.trigger_context = signal.trigger_context;
        row.response = signal.response;
        row.emotional_outcome = signal.emotional_outcome;
        row.outcome_valence = signal.outcome_valence;
      } else if (signal.signal_kind === 'emotional_theme') {
        row.signal_type = 'emotional_theme';
        row.signal_value = signal.theme;
        row.normalized_value = signal.theme;
        row.theme = signal.theme;
        row.intensity = signal.intensity;
        row.trigger_context = signal.context;
      }

      const { error: insertError } = await supabase
        .from('entry_signals')
        .insert(row);

      if (insertError) {
        console.error(`[extract-entry-signals] Insert failed for ${signal.signal_kind} signal:`, insertError.message);
      } else {
        insertedSignals.push(signal);
      }
    }

    return new Response(JSON.stringify({ signals: insertedSignals }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[extract-entry-signals] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Something went wrong' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
