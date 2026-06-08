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

Rules:
1. Every signal MUST have a direct quote from the transcript as evidence
2. Quotes must be exact or near-exact substrings from the transcript
3. Do not infer signals that aren't supported by the text
4. Do not create signals for skipped or empty answers
5. Normalize signal values to lowercase
6. Each signal should map to one of the canonical signal types

Signal types: activity, emotion, energy, stress, relationship, work, health, recovery, self_belief, need, value, avoidance, gratitude, learning, memory, social_context

Canonical activity values (prefer these): gym, running, walking, yoga, work, meetings, deep work, reading, cooking, friends, family, partner, coding, creative work, learning, commuting, errands, rest, sleep

Canonical emotion values: happy, sad, angry, tired, anxious, bored, focused, okay, peaceful

Canonical energy values: energized, steady, tired, drained, restless, overwhelmed, clear, scattered

Return JSON only with this shape:
{"signals": [{"question_index": 0, "quote": "exact quote from transcript", "signal_type": "activity", "signal_value": "working out", "normalized_value": "gym", "sentiment": 1, "confidence": 0.85}]}

sentiment: -2 to 2 (very negative to very positive), or null if neutral
confidence: 0 to 1`;

interface RawSignal {
  question_index?: unknown;
  quote?: unknown;
  signal_type?: unknown;
  signal_value?: unknown;
  normalized_value?: unknown;
  sentiment?: unknown;
  confidence?: unknown;
}

interface ValidSignal {
  question_index: number;
  quote: string;
  signal_type: string;
  signal_value: string;
  normalized_value: string;
  sentiment: number | null;
  confidence: number;
}

function validateSignal(raw: RawSignal): ValidSignal | null {
  // quote must be a non-empty string
  if (typeof raw.quote !== 'string' || raw.quote.trim().length === 0) return null;

  // signal_type must be in the allowed list
  if (typeof raw.signal_type !== 'string' || !ALLOWED_SIGNAL_TYPES.has(raw.signal_type)) return null;

  // question_index should be a number 0-5
  const qi = typeof raw.question_index === 'number' ? raw.question_index : 0;

  // signal_value
  const signalValue = typeof raw.signal_value === 'string'
    ? raw.signal_value.trim().slice(0, 50)
    : '';

  // normalized_value: lowercase, trimmed, max 50 chars
  const normalizedValue = typeof raw.normalized_value === 'string'
    ? raw.normalized_value.toLowerCase().trim().slice(0, 50)
    : signalValue.toLowerCase().trim().slice(0, 50);

  if (normalizedValue.length === 0) return null;

  // confidence: 0 to 1, default 0.5
  let confidence = 0.5;
  if (typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)) {
    confidence = Math.max(0, Math.min(1, raw.confidence));
  }

  // sentiment: -2 to 2 or null
  let sentiment: number | null = null;
  if (typeof raw.sentiment === 'number' && Number.isFinite(raw.sentiment)) {
    sentiment = Math.max(-2, Math.min(2, Math.round(raw.sentiment)));
  }

  return {
    question_index: qi,
    quote: raw.quote.trim(),
    signal_type: raw.signal_type,
    signal_value: signalValue || normalizedValue,
    normalized_value: normalizedValue,
    sentiment,
    confidence,
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
      .select('id, user_id, q1_transcript, q2_transcript, q3_transcript, q4_transcript, q5_transcript, q6_transcript')
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

    // Build transcript text from q1-q6 (skip nulls)
    const transcripts: (string | null)[] = TRANSCRIPT_FIELDS.map(
      (field) => entry[field] as string | null,
    );
    const filledTranscripts = transcripts
      .map((t, i) => t ? `Q${i + 1}: ${t}` : null)
      .filter(Boolean)
      .join('\n\n');

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
      const { error: insertError } = await supabase
        .from('entry_signals')
        .insert({
          user_id: user.id,
          journal_entry_id: entryId,
          question_index: signal.question_index,
          source_transcript: transcripts[signal.question_index] || null,
          quote: signal.quote,
          signal_type: signal.signal_type,
          signal_value: signal.signal_value,
          normalized_value: signal.normalized_value,
          sentiment: signal.sentiment,
          confidence: signal.confidence,
        });

      if (insertError) {
        console.error('[extract-entry-signals] Insert failed for signal:', insertError.message);
        // Continue with remaining signals
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
