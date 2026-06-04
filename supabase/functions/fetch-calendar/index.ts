import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = Deno.env.get('SITE_URL') || 'http://localhost:5173';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sanitizeEventTitle(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[^\w\s,.'&:()\-@]/g, '').trim().slice(0, 100);
}

function formatEventTime(event: Record<string, unknown>): string {
  const start = event.start as Record<string, string> | undefined;
  if (!start) return '';
  const dt = start.dateTime || start.date || '';
  if (!dt) return '';
  try {
    const d = new Date(dt);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
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
    const { timeMin, timeMax } = body;
    if (!timeMin || !timeMax) {
      return new Response(JSON.stringify({ error: 'Missing timeMin/timeMax' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Read the user's Google identity to get the provider access token.
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: identities, error: idError } = await adminClient
      .from('auth.identities')
      .select('identity_data')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .limit(1);

    // Fallback: use admin API if the direct query doesn't work
    let googleAccessToken: string | null = null;

    if (idError || !identities || identities.length === 0) {
      const { data: adminUser } = await adminClient.auth.admin.getUserById(user.id);
      const googleIdentity = adminUser?.user?.identities?.find(
        (i: { provider: string }) => i.provider === 'google'
      );
      if (googleIdentity?.identity_data) {
        googleAccessToken = (googleIdentity.identity_data as Record<string, string>).provider_token ?? null;
      }
    } else {
      googleAccessToken = (identities[0].identity_data as Record<string, string>)?.provider_token ?? null;
    }

    // Try using the user's session provider_token passed from client as fallback
    if (!googleAccessToken) {
      const providerToken = body.provider_token;
      if (typeof providerToken === 'string' && providerToken.length > 0) {
        googleAccessToken = providerToken;
      }
    }

    if (!googleAccessToken) {
      return new Response(JSON.stringify({ events: [], error: 'calendar_scope_missing' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const calUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    calUrl.searchParams.set('timeMin', timeMin);
    calUrl.searchParams.set('timeMax', timeMax);
    calUrl.searchParams.set('singleEvents', 'true');
    calUrl.searchParams.set('orderBy', 'startTime');
    calUrl.searchParams.set('maxResults', '20');

    const calRes = await fetch(calUrl.toString(), {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });

    if (calRes.status === 401 || calRes.status === 403) {
      return new Response(JSON.stringify({ events: [], error: 'token_expired' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!calRes.ok) {
      console.error('[fetch-calendar] Google Calendar API error:', calRes.status);
      return new Response(JSON.stringify({ events: [], error: 'calendar_unavailable' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const calData = await calRes.json();
    const rawItems = Array.isArray(calData.items) ? calData.items : [];

    const events = rawItems
      .map((item: Record<string, unknown>) => ({
        title: sanitizeEventTitle(item.summary),
        time: formatEventTime(item),
      }))
      .filter((e: { title: string }) => e.title.length > 0);

    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[fetch-calendar] Unhandled error:', err);
    return new Response(JSON.stringify({ events: [], error: 'Something went wrong' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
