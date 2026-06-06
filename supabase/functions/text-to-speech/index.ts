import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('SITE_URL') || 'http://localhost:5173';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Warm, calm narrator for a journaling app. Both are overridable via secrets.
const DEFAULT_VOICE = Deno.env.get('OPENAI_TTS_VOICE') || 'nova';
const DEFAULT_MODEL = Deno.env.get('OPENAI_TTS_MODEL') || 'gpt-4o-mini-tts';
const TONE = 'Speak in a warm, calm, gentle and unhurried tone, like a thoughtful friend guiding a quiet reflection.';
const MAX_TTS_PER_DAY = 15;

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

    // Rate limit: max TTS calls per user per day
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('user_events')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'question_started')
      .gte('created_at', todayStart.toISOString());
    if ((count ?? 0) >= MAX_TTS_PER_DAY) {
      return new Response(JSON.stringify({ error: 'Daily TTS limit reached' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const text = typeof body?.text === 'string' ? body.text.trim().slice(0, 500) : '';
    const toneInstructions = typeof body?.instructions === 'string'
      ? body.instructions.trim().slice(0, 300)
      : TONE;
    if (!text) {
      return new Response(JSON.stringify({ error: 'Missing text' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
      console.error('[text-to-speech] OPENAI_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'TTS not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: Record<string, unknown> = {
      model: DEFAULT_MODEL,
      voice: DEFAULT_VOICE,
      input: text,
      response_format: 'mp3',
    };
    // The gpt-4o-mini-tts model supports tone steering via `instructions`.
    if (DEFAULT_MODEL.includes('gpt-4o')) {
      payload.instructions = toneInstructions;
    }

    const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!ttsRes.ok) {
      const detail = await ttsRes.text().catch(() => '');
      console.error('[text-to-speech] OpenAI error:', ttsRes.status, detail);
      return new Response(JSON.stringify({ error: 'TTS failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(await ttsRes.arrayBuffer(), {
      headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg' },
    });
  } catch (err) {
    console.error('[text-to-speech] Error:', err);
    return new Response(JSON.stringify({ error: 'Something went wrong' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
