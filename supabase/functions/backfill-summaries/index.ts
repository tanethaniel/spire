import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('SITE_URL') || 'http://localhost:5173';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find entries missing summary
    const { data: entries, error: fetchError } = await supabase
      .from('journal_entries')
      .select('id, q1_transcript, q2_transcript, q3_transcript, q4_transcript, q5_transcript, q6_transcript')
      .eq('user_id', user.id)
      .is('summary', null)
      .order('created_at', { ascending: false });

    if (fetchError) throw fetchError;
    if (!entries || entries.length === 0) {
      return new Response(JSON.stringify({ message: 'No entries to backfill', updated: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let updated = 0;
    const errors: string[] = [];

    for (const entry of entries) {
      const transcripts = [
        entry.q1_transcript, entry.q2_transcript, entry.q3_transcript,
        entry.q4_transcript, entry.q5_transcript, entry.q6_transcript,
      ];

      const filled = transcripts
        .map((t: string | null, i: number) => t ? `Q${i + 1}: ${t}` : null)
        .filter(Boolean)
        .join('\n\n');

      if (!filled) continue;

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 512,
            system: `You analyze journal transcripts. Return JSON only, no other text.

Rules for summary:
- One sentence, max 20 words, capturing the emotional and factual essence
- Written in second person ("You had a quiet day...")
- Never reference the session, app, or missing questions

Rules for keyword_tags:
- 0 to 10 lowercase tags capturing context, schedule type, social dynamics, energy, recurring topics
- Include: activities ("gym", "work"), schedule ("busy", "balanced", "light day"), social ("alone", "with friends"), energy ("tired", "energized", "stressed"), themes ("work pressure", "creative flow")
- Lowercase, no punctuation, 1-3 words each
- Be consistent: always use "gym" not "working out"

Return: {"summary": "...", "keyword_tags": ["tag1", "tag2"]}`,
            messages: [{
              role: 'user',
              content: `Analyze these journal transcripts:\n\n<transcripts>\n${filled}\n</transcripts>`,
            }],
          }),
        });

        if (!response.ok) {
          errors.push(`Entry ${entry.id}: API ${response.status}`);
          continue;
        }

        const result = await response.json();
        let text = result.content?.[0]?.text || '{}';
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          errors.push(`Entry ${entry.id}: parse error`);
          continue;
        }

        const summary: string | null = typeof parsed.summary === 'string'
          ? parsed.summary.trim().slice(0, 200)
          : null;

        const keywordTags: string[] = Array.isArray(parsed.keyword_tags)
          ? parsed.keyword_tags
              .filter((t: unknown): t is string => typeof t === 'string')
              .map((t: string) => t.toLowerCase().replace(/[^\w\s-]/g, '').trim().slice(0, 50))
              .filter((t: string) => t.length > 0)
              .slice(0, 10)
          : [];

        const { error: updateError } = await supabase
          .from('journal_entries')
          .update({ summary, keyword_tags: keywordTags })
          .eq('id', entry.id)
          .eq('user_id', user.id);

        if (updateError) {
          errors.push(`Entry ${entry.id}: ${updateError.message}`);
        } else {
          updated++;
        }
      } catch (err) {
        errors.push(`Entry ${entry.id}: ${err}`);
      }
    }

    return new Response(JSON.stringify({
      message: `Backfill complete`,
      total: entries.length,
      updated,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[backfill-summaries] Error:', err);
    return new Response(JSON.stringify({ error: 'Something went wrong' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
