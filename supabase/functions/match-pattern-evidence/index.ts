import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FILLER_WORDS = new Set([
  'a', 'an', 'the', 'my', 'your', 'i', 'me', 'was', 'were', 'been',
  'is', 'am', 'are', 'had', 'have', 'has', 'just', 'really', 'very',
  'so', 'too', 'also', 'then', 'some', 'like', 'kind', 'of', 'to',
  'and', 'but', 'or', 'in', 'on', 'at', 'for', 'with', 'about',
  'that', 'this', 'it', 'felt', 'feel', 'feeling', 'got', 'get',
]);

function canonicalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => !FILLER_WORDS.has(w) && w.length > 1)
    .sort()
    .join('_');
}

function computeSignature(signal: SignalRow): string | null {
  if (signal.signal_kind === 'behavioral_link') {
    const trigger = canonicalize(signal.trigger_context || '');
    const response = canonicalize(signal.response || '');
    if (!trigger || !response) return null;
    return `bl:${trigger}→${response}`;
  }
  if (signal.signal_kind === 'emotional_theme') {
    const theme = canonicalize(signal.theme || '');
    const context = canonicalize(signal.trigger_context || '');
    if (!theme) return null;
    return context ? `et:${theme}@${context}` : `et:${theme}`;
  }
  return null;
}

interface SignalRow {
  id: string;
  journal_entry_id: string;
  signal_kind: string;
  signal_type: string;
  signal_value: string;
  normalized_value: string;
  quote: string;
  trigger_context: string | null;
  response: string | null;
  emotional_outcome: string | null;
  outcome_valence: number | null;
  theme: string | null;
  intensity: string | null;
  sentiment: number | null;
  confidence: number;
}

interface PoolRow {
  id: string;
  signature: string;
  pattern_kind: string;
  slot_state: string;
  evidence_count: number;
  session_count: number;
  related_tags: string[];
  supporting_entry_ids: string[];
}

function extractTags(signal: SignalRow): string[] {
  const tags: string[] = [];
  if (signal.signal_kind === 'behavioral_link') {
    if (signal.trigger_context) tags.push(signal.trigger_context.toLowerCase());
    if (signal.response) tags.push(signal.response.toLowerCase());
  } else if (signal.signal_kind === 'emotional_theme') {
    if (signal.theme) tags.push(signal.theme.toLowerCase());
    if (signal.trigger_context) tags.push(signal.trigger_context.toLowerCase());
  }
  return tags;
}

function assignConfidence(sessionCount: number, firstDate: string | null, lastDate: string | null): string {
  const weekSpan = firstDate && lastDate
    ? Math.floor((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (7 * 24 * 60 * 60 * 1000))
    : 0;
  if (sessionCount >= 5 || weekSpan >= 3) return 'strong_pattern';
  if (sessionCount >= 3) return 'emerging_pattern';
  return 'early_signal';
}

async function matchWithLLM(
  unmatched: { signal: SignalRow; signature: string }[],
  existingPool: PoolRow[],
  anthropicKey: string,
): Promise<Map<string, string>> {
  if (unmatched.length === 0 || existingPool.length === 0) return new Map();

  const prompt = `You are matching new journal signals to existing pattern themes.

Given NEW signals and EXISTING patterns, determine if any new signal describes the same underlying pattern as an existing one — even if worded differently.

NEW signals:
${unmatched.map((u, i) => `${i}: [${u.signal.signal_kind}] sig="${u.signature}" ${u.signal.signal_kind === 'behavioral_link' ? `trigger="${u.signal.trigger_context}" response="${u.signal.response}" outcome="${u.signal.emotional_outcome}"` : `theme="${u.signal.theme}" context="${u.signal.trigger_context}"`}`).join('\n')}

EXISTING patterns:
${existingPool.map((p, i) => `${i}: [${p.pattern_kind}] sig="${p.signature}" tags=${JSON.stringify(p.related_tags)}`).join('\n')}

Return JSON only — an array of matches: [{"new_index": 0, "existing_index": 2}]
Only include matches where the signals genuinely describe the same life pattern. If no matches, return [].`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error(`[match-pattern-evidence] LLM match error: ${res.status}`);
      return new Map();
    }

    const result = await res.json();
    const text = result?.content?.[0]?.text;
    if (!text) return new Map();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return new Map();

    const matches: { new_index: number; existing_index: number }[] = JSON.parse(jsonMatch[0]);
    const mapping = new Map<string, string>();
    for (const m of matches) {
      if (m.new_index >= 0 && m.new_index < unmatched.length &&
          m.existing_index >= 0 && m.existing_index < existingPool.length) {
        mapping.set(unmatched[m.new_index].signature, existingPool[m.existing_index].id);
      }
    }
    return mapping;
  } catch (err) {
    console.error('[match-pattern-evidence] LLM match failed:', err);
    return new Map();
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const entryId = body?.entry_id;
    if (!entryId) {
      return new Response(JSON.stringify({ error: 'entry_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch new signals from this entry (behavioral_link + emotional_theme only)
    const { data: newSignals, error: sigErr } = await supabase
      .from('entry_signals')
      .select('*')
      .eq('journal_entry_id', entryId)
      .in('signal_kind', ['behavioral_link', 'emotional_theme']);

    if (sigErr) {
      console.error('[match-pattern-evidence] Failed to fetch signals:', sigErr.message);
      return new Response(JSON.stringify({ error: 'Failed to fetch signals' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!newSignals || newSignals.length === 0) {
      return new Response(JSON.stringify({ matched: 0, created: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch existing pool patterns for this user
    const { data: existingPool } = await supabase
      .from('pattern_pool')
      .select('id, signature, pattern_kind, slot_state, evidence_count, session_count, related_tags, supporting_entry_ids')
      .eq('user_id', user.id);

    const poolPatterns: PoolRow[] = existingPool || [];
    const signatureToPool = new Map<string, PoolRow>();
    for (const p of poolPatterns) {
      signatureToPool.set(p.signature, p);
    }

    // Compute signatures and attempt exact matching
    const exactMatched: { signal: SignalRow; poolId: string }[] = [];
    const unmatched: { signal: SignalRow; signature: string }[] = [];

    for (const signal of newSignals as SignalRow[]) {
      const sig = computeSignature(signal);
      if (!sig) continue;

      const existing = signatureToPool.get(sig);
      if (existing) {
        exactMatched.push({ signal, poolId: existing.id });
      } else {
        unmatched.push({ signal, signature: sig });
      }
    }

    // LLM fuzzy matching for unmatched signals
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    let llmMatches = new Map<string, string>();
    if (unmatched.length > 0 && poolPatterns.length > 0 && anthropicKey) {
      llmMatches = await matchWithLLM(unmatched, poolPatterns, anthropicKey);
    }

    const stillUnmatched: { signal: SignalRow; signature: string }[] = [];
    for (const u of unmatched) {
      const matchedPoolId = llmMatches.get(u.signature);
      if (matchedPoolId) {
        exactMatched.push({ signal: u.signal, poolId: matchedPoolId });
      } else {
        stillUnmatched.push(u);
      }
    }

    let matched = 0;
    let created = 0;
    const now = new Date().toISOString();

    // Add evidence to matched pool patterns
    for (const { signal, poolId } of exactMatched) {
      const pool = poolPatterns.find(p => p.id === poolId);
      if (!pool) continue;

      // Insert evidence link (ignore conflict on unique constraint)
      const { error: evErr } = await supabase
        .from('pattern_evidence')
        .insert({
          pattern_pool_id: poolId,
          entry_signal_id: signal.id,
          journal_entry_id: signal.journal_entry_id,
        });
      if (evErr && !evErr.message.includes('duplicate')) {
        console.error(`[match-pattern-evidence] Evidence insert failed:`, evErr.message);
        continue;
      }

      // Update pool pattern: increment counts, update dates, set has_new_evidence
      const entryIds = [...new Set([...(pool.supporting_entry_ids || []), signal.journal_entry_id])];
      const newTags = [...new Set([...(pool.related_tags || []), ...extractTags(signal)])];
      const newSessionCount = pool.session_count + 1;
      const confidence = assignConfidence(
        newSessionCount,
        pool.supporting_entry_ids?.[0] ? now : now,
        now,
      );

      const { error: updateErr } = await supabase
        .from('pattern_pool')
        .update({
          evidence_count: pool.evidence_count + 1,
          session_count: newSessionCount,
          last_evidence_at: now,
          supporting_entry_ids: entryIds,
          related_tags: newTags,
          confidence,
          has_new_evidence: pool.slot_state === 'active' || pool.slot_state === 'dimmed',
          updated_at: now,
        })
        .eq('id', poolId);

      if (updateErr) {
        console.error(`[match-pattern-evidence] Pool update failed:`, updateErr.message);
      } else {
        matched++;
      }
    }

    // Create new pool entries for unmatched signals
    for (const { signal, signature } of stillUnmatched) {
      const kind = signal.signal_kind === 'behavioral_link' ? 'behavioral_link' : 'emotional_theme';
      const tags = extractTags(signal);

      const { data: inserted, error: insertErr } = await supabase
        .from('pattern_pool')
        .insert({
          user_id: user.id,
          pattern_kind: kind,
          signature,
          evidence_count: 1,
          session_count: 1,
          first_evidence_at: now,
          last_evidence_at: now,
          supporting_entry_ids: [signal.journal_entry_id],
          related_tags: tags,
          confidence: 'early_signal',
          slot_state: 'pool',
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single();

      if (insertErr) {
        if (insertErr.message.includes('duplicate')) {
          console.log(`[match-pattern-evidence] Signature collision (concurrent insert), skipping: ${signature}`);
        } else {
          console.error(`[match-pattern-evidence] Pool insert failed:`, insertErr.message);
        }
        continue;
      }

      if (inserted) {
        // Link evidence
        await supabase
          .from('pattern_evidence')
          .insert({
            pattern_pool_id: inserted.id,
            entry_signal_id: signal.id,
            journal_entry_id: signal.journal_entry_id,
          });
        created++;
      }
    }

    console.log(`[match-pattern-evidence] entry=${entryId}: ${matched} matched, ${created} new pool entries`);

    return new Response(JSON.stringify({ matched, created }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[match-pattern-evidence] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
