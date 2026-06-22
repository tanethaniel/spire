import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('SITE_URL') || 'http://localhost:5173';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a journaling companion deciding what follow-up questions to ask after someone shares about their day. You will receive their initial open-ended response about what they did today.

Your job: figure out what dimensions are missing and generate 0-3 follow-up questions.

## Dimensions to check
- **Activities**: Did they describe what they did? (usually yes since the opener asks this)
- **Emotions**: Did they express how things made them feel? Look for emotional language, tone shifts, enthusiasm, frustration, etc.
- **Reflection**: Did they share any deeper thoughts — what they learned, what surprised them, what they noticed about themselves?
- **Social context**: Did they mention people, relationships, interactions?
- **Energy/state**: Did they mention how they're feeling physically or energetically?

## Rules for generating follow-ups

1. **Dig deeper into what the user actually said.** Your primary job is to pick up on interesting threads and explore them further. If they mentioned a meeting, a person, a decision, a moment — follow that thread.
2. If the user covered activities + emotions + some reflection naturally → 0 follow-ups. They're done.
3. If they mentioned interesting things but stayed surface-level → ask about the specifics. "You mentioned the conversation with your manager — what was that about?"
4. Only ask about feelings when the user hasn't expressed any emotional dimension at all. Don't force emotional questions if they've already shared how they feel.
5. ALWAYS reference something specific the user said. Never ask generic questions.
6. You CAN ask about feelings — just do it naturally and specifically. "You mentioned the meeting ran long — how did that sit with you?" is good. "How did that make you feel?" is banned.
7. Vary the question style: "What was going through your mind when...", "Was there a moment that stood out...", "How are you feeling about...", "What did you take away from...", "Tell me more about..."
8. Keep questions short and conversational — one sentence, no preamble.
9. The final follow-up can be a gentle "Anything else on your mind?" if appropriate, but only if the user seems to have more to say.
10. Maximum 3 follow-ups. Often 1-2 is plenty.

## Output format
Return a JSON object with this exact shape:
{"followups": [{"question": "...", "subPrompt": "...", "toneInstruction": "..."}]}

- question: The follow-up question (one sentence)
- subPrompt: A brief encouragement shown below the question (5-10 words max, e.g., "Whatever comes to mind.", "Take your time.")
- toneInstruction: TTS voice direction (e.g., "Speak warmly and curiously, like you genuinely want to know more. Pause naturally.")

Return ONLY the JSON object, no other text.`;

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
    const openTranscript = typeof body?.open_transcript === 'string' ? body.open_transcript.trim() : '';
    const calendarEvents = Array.isArray(body?.calendar_events) ? body.calendar_events : null;

    if (!openTranscript) {
      return new Response(JSON.stringify({ followups: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      console.error('[generate-followups] ANTHROPIC_API_KEY not configured');
      return new Response(JSON.stringify({ followups: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let calendarContext = '';
    if (calendarEvents && calendarEvents.length > 0) {
      const eventList = calendarEvents
        .slice(0, 8)
        .map((e: { title: string; time: string }) => `- ${e.title} (${e.time})`)
        .join('\n');
      calendarContext = `\n\nTheir calendar today:\n${eventList}`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Here is what the user shared about their day:\n\n<transcript>\n${openTranscript}\n</transcript>${calendarContext}`,
        }],
      }),
    });

    if (!response.ok) {
      console.error('[generate-followups] Anthropic API error:', response.status);
      return new Response(JSON.stringify({ followups: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await response.json();
    let text = result.content?.[0]?.text || '{}';
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) text = fenced[1].trim();
    else text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error('[generate-followups] Failed to parse LLM response:', text);
      return new Response(JSON.stringify({ followups: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const followups = Array.isArray(parsed.followups)
      ? parsed.followups
          .filter((f: unknown) => typeof f === 'object' && f !== null && typeof (f as Record<string, unknown>).question === 'string')
          .slice(0, 3)
          .map((f: Record<string, unknown>) => ({
            question: String(f.question).trim().slice(0, 300),
            subPrompt: typeof f.subPrompt === 'string' ? f.subPrompt.trim().slice(0, 100) : 'Whatever comes to mind.',
            toneInstruction: typeof f.toneInstruction === 'string'
              ? f.toneInstruction.trim().slice(0, 300)
              : 'Speak warmly and curiously, pausing naturally between phrases.',
          }))
      : [];

    return new Response(JSON.stringify({ followups }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[generate-followups] Unhandled error:', err);
    return new Response(JSON.stringify({ followups: [] }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
