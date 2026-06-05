import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('SITE_URL') || 'http://localhost:5173';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sanitize calendar event titles before using in spoken/text content.
// Strips characters that could alter TTS pronunciation unexpectedly or
// be used for injection into downstream prompts.
function sanitizeForSpeech(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^\w\s,.'&:()-]/g, '').trim().slice(0, 80);
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

    // Rate limit: max 15 TTS calls per user per day
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('user_events')
      .select('id', { count: 'exact', head: true })
      .eq('event', 'question_started')
      .gte('created_at', todayStart.toISOString());
    if ((count ?? 0) >= 15) {
      return new Response(JSON.stringify({ error: 'Daily TTS limit reached' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const events = body?.events;

    const elevenlabsKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!elevenlabsKey) {
      console.error('[generate-q1] ELEVENLABS_API_KEY not configured');
      return new Response(JSON.stringify({ error: 'Service unavailable' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sanitize the event title before using in spoken text — it is user-controlled data
    let q1Text: string;
    if (Array.isArray(events) && events.length > 0) {
      const safeTitle = sanitizeForSpeech(events[0]?.title);
      q1Text = safeTitle
        ? `You had ${safeTitle} today. What stood out to you?`
        : 'What did you do today?';
    } else {
      q1Text = 'What did you do today?';
    }

    const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') || 'MClEFoImJXBTgLwdLI5n';
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': elevenlabsKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: q1Text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75,
          },
        }),
      },
    );

    if (!ttsRes.ok) {
      console.error('[generate-q1] ElevenLabs error:', ttsRes.status);
      return new Response(JSON.stringify({ error: 'TTS unavailable' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const audioBuffer = await ttsRes.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
      },
    });
  } catch (err) {
    console.error('[generate-q1] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Something went wrong' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
