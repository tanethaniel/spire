import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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

    const { transcripts } = await req.json();

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const filledTranscripts = transcripts
      .map((t: string | null, i: number) => t ? `Q${i + 1}: ${t}` : null)
      .filter(Boolean)
      .join('\n\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: `You are analyzing a voice journal session. The user answered 6 reflection questions about their day. Extract themes and generate one insight.

Rules for themes:
- Extract exactly 3 themes
- Each theme must be 2-4 words, a specific noun phrase
- Derive themes from the user's exact language
- Forbidden: single-word categories ("Work"), emotional adjectives ("Positive feelings"), universal labels ("Stress")
- Good examples: "Career confidence", "Q3 deadline pressure", "Manager relationship"

Rules for insight:
- Quote or closely paraphrase the user's actual words
- Ask a question that couldn't apply to anyone else
- Forbidden openers: "It sounds like you care about...", "You seem to value...", "Today was clearly..."
- The insight must be grounded in specific language from this session

Transcripts:
${filledTranscripts}

Return JSON with this exact shape:
{
  "themes": ["Theme 1", "Theme 2", "Theme 3"],
  "insight": "Your insight question here"
}

Only return the JSON, no other text.`,
        }],
      }),
    });

    const result = await response.json();
    const text = result.content?.[0]?.text || '{}';

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { themes: [], insight: null };
    }

    return new Response(JSON.stringify({
      themes: parsed.themes || [],
      insight: parsed.insight || null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
