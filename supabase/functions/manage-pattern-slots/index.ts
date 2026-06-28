import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const allowedOrigin = '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_ACTIVE_SLOTS = 5;
const DECAY_THRESHOLD_DAYS = 7;
const DECAY_REMOVAL_DAYS = 7;
const DISMISS_COOLDOWN_DAYS = 30;
const MIN_SESSION_COUNT = 2;
const MIN_MOOD_DELTA = 0.4;

// ── Safety validation (extracted from generate-patterns) ──

const UNSAFE_CAUSAL_PATTERNS = [
  /\b(leads?\s+to|causes?|makes?\s+you\s+feel|results?\s+in)\b/i,
  /\b(lower|worse|bad|negative)\s+(mood|energy|mental\s+health)\b/i,
  /\b(pulls?|drags?|tanks?|kills?|ruins?|wrecks?|hurts?)\s+(your\s+)?(mood|energy)\b/i,
  /\bkeeps?\s+(pulling|dragging|tanking|killing|ruining|wrecking|hurting|lowering|dropping)\s+(your\s+)?(mood|energy)\b/i,
  /\b(mood|energy)\s+(drops?|tanks?|crashes?|plummets?|nosedives?)\b/i,
];

const GENERIC_FILLER_PATTERNS = [
  /\bfor\s+someone\s+(tracking|monitoring|watching|journaling)\b/i,
  /\bthat'?s?\s+worth\s+(paying\s+attention\s+to|noting|watching)\b/i,
  /\bthis\s+is\s+worth\s+(watching|noting|paying\s+attention)\b/i,
  /\bif\s+you'?re?\s+(someone\s+who|the\s+kind\s+of\s+person)\b/i,
  /\bas\s+you\s+continue\s+(to\s+)?(journal|reflect|track)\b/i,
];

const HEALTHY_BEHAVIORS = new Set([
  'self-advocacy', 'self advocacy', 'discipline', 'boundaries', 'exercise',
  'gym', 'rest', 'standing up', 'speaking up', 'saying no', 'asserting',
  'running', 'yoga', 'walking', 'meditation', 'sleep',
]);

const MBTI_CAUSAL_PATTERNS = [
  /\bbecause\s+you\s+are\s+\w{4}\b/i,
  /\b\w{4}\s+people\b/i,
  /\byour\s+type\s+means\b/i,
  /\bas\s+an?\s+\w{4},\s+you\s+are\b/i,
];

const RAW_SCORE_PATTERNS = [
  /\b\d+\.\d+\b/,
  /\baverage[ds]?\s+\d/i,
  /\bscores?\s+\d/i,
  /\bcorrelat/i,
  /\bmood\s+delta\b/i,
  /\bstatistic/i,
  /\bconfidence\s+score\b/i,
];

const DIAGNOSTIC_PATTERNS = [
  /\bdiagnos/i, /\bdisorder\b/i, /\bsymptoms?\s+of\b/i,
  /\bclinical/i, /\btherapy\b/i, /\btreatment\b/i,
];

function validatePatternSafety(llmResult: Record<string, unknown>): { safe: boolean; flags: string[] } {
  const flags: string[] = [];
  const allText = [
    llmResult.title, llmResult.preview_note, llmResult.full_note,
    llmResult.personality_framing, llmResult.reflection_prompt,
    llmResult.suggested_experiment,
  ].filter(Boolean).join(' ');

  for (const p of UNSAFE_CAUSAL_PATTERNS) { if (p.test(allText)) { flags.push('negative_causal_claim'); break; } }

  const titleAndNote = `${llmResult.title || ''} ${llmResult.preview_note || ''} ${llmResult.full_note || ''}`.toLowerCase();
  for (const behavior of HEALTHY_BEHAVIORS) {
    if (titleAndNote.includes(behavior) && /\b(bad|harmful|worse|lower|negative|hurts?|damage)\b/i.test(titleAndNote)) {
      flags.push('healthy_behavior_framed_as_bad'); break;
    }
  }

  for (const p of MBTI_CAUSAL_PATTERNS) { if (p.test(allText)) { flags.push('mbti_causal_claim'); break; } }
  for (const p of RAW_SCORE_PATTERNS) { if (p.test(allText)) { flags.push('raw_score_exposed'); break; } }
  for (const p of DIAGNOSTIC_PATTERNS) { if (p.test(allText)) { flags.push('diagnostic_language'); break; } }
  for (const p of GENERIC_FILLER_PATTERNS) { if (p.test(allText)) { flags.push('generic_filler'); break; } }

  const llmFlags = llmResult.safety_flags;
  if (Array.isArray(llmFlags)) {
    for (const f of llmFlags) { if (typeof f === 'string' && f.length > 0) flags.push(f); }
  }

  return { safe: flags.length === 0, flags };
}

// ── LLM note writing ──

const SYSTEM_PROMPT = `You are writing a Pattern Note for Spire, a private voice journaling app.
The system has detected a pattern in the user's journal entries. Your job is to translate the accumulated evidence into a warm, careful, useful, user-facing reflection note.

Rules:
1. Do not invent evidence.
2. Do not make clinical, diagnostic, or medical claims.
3. Do not claim causality unless the user explicitly said it.
4. Never frame healthy behaviours like self-advocacy, discipline, boundaries, exercise, or rest as bad.
5. If a healthy behaviour appears alongside lower mood, frame the emotional cost around the context, not the behaviour.
6. Use the user's stated goal to explain why the pattern might matter. Weave the goal connection naturally into the note.
7. If the user has a goal, the note should explain why this pattern matters for what they care about.
8. Use MBTI only as a communication and experiment-design lens, never as evidence.
9. Do not mention raw scores, averages, deltas, or scales. No numbers.
10. Reference specific activities, emotions, and contexts by name.
11. Every note should feel like it was written for this specific user.
12. If the evidence is early (early_signal), frame as "something to watch," not a conclusion.
13. Avoid generic advice and productivity guilt.
14. Never say "X leads to lower mood" or similar. Use correlational language: "your mood tends to dip when…"
15. Never imply a healthy behaviour is harmful.
16. Never use MBTI to explain why a pattern exists.
17. If "existing_title" is provided, the title is LOCKED — do not generate a new title.
18. If "existing_note" is provided, REFINE rather than rewrite. Keep the same voice and structure. Adjust confidence language if the confidence level changed.
19. Write in second person ("you", "your").
20. Do not mention "LLM", "model", "data", "transcripts", or "backend".
21. Never use filler like "For someone tracking their patterns" or "that's worth paying attention to."
22. Every card MUST reference specific activities, emotions, or contexts from the evidence. Vague cards are not useful.
23. Do not repeat the same opening phrase across cards. Vary your sentence structure.

For behavioral_link patterns: Frame around the trigger→response→outcome chain. What triggers it, what the user does, and how it affects them.
For emotional_theme patterns: Frame around the recurring inner state. What keeps showing up, in what contexts, and what it might mean.

Confidence framing (vary language, don't copy verbatim):
- early_signal: tentative, curious, "might", "may"
- emerging_pattern: warmer, "seems", "appears" — a trend forming
- strong_pattern: confident, direct — state the pattern clearly

Tone: Like a caring friend who has been paying close attention to your life.

MBTI-driven suggestions (if mbti provided):
- E: social/collaborative versions
- I: structured alone time, solo versions
- S: concrete actions with clear steps
- N: explore possibilities, reframe
- T: systems, experiments, tracking
- F: values, relationships, meaning
- J: routines, schedules, planning
- P: flexibility, variety, spontaneous options

suggested_experiment MUST be specific, concrete, tied to evidence AND personality.

If the output contains problems, add to safety_flags:
- "negative_causal_claim", "healthy_behavior_framed_as_bad", "generic_filler",
  "raw_score_exposed", "mbti_causal_claim", "diagnostic_language"

Return JSON only:
{
  "title": "max 80 chars, specific to evidence",
  "preview_note": "max 220 chars, concise card copy",
  "full_note": "max 600 chars, nuanced detail copy",
  "goal_connection": "why this matters for their goal, or null",
  "personality_framing": "max 250 chars, MBTI-based suggestion, or null",
  "reflection_prompt": "max 180 chars, specific question",
  "suggested_experiment": "max 250 chars, concrete action this week",
  "safety_flags": []
}`;

interface PoolPattern {
  id: string;
  user_id: string;
  pattern_kind: string;
  signature: string;
  title: string | null;
  preview_note: string | null;
  full_note: string | null;
  evidence_count: number;
  session_count: number;
  confidence: string;
  first_evidence_at: string | null;
  last_evidence_at: string | null;
  supporting_entry_ids: string[];
  mood_delta: number | null;
  related_tags: string[];
  slot_state: string;
  slot_promoted_at: string | null;
  decay_started_at: string | null;
  has_new_evidence: boolean;
  user_feedback: string | null;
  goal_connection: string | null;
  personality_framing: string | null;
  reflection_prompt: string | null;
  suggested_experiment: string | null;
  updated_at: string;
}

interface EvidenceRow {
  entry_signal_id: string;
  entry_signals: {
    quote: string;
    signal_kind: string;
    trigger_context: string | null;
    response: string | null;
    emotional_outcome: string | null;
    outcome_valence: number | null;
    theme: string | null;
    intensity: string | null;
    journal_entries: {
      created_at: string;
      mood_score: number | null;
    } | null;
  } | null;
}

async function fetchEvidenceForPattern(
  supabase: ReturnType<typeof createClient>,
  poolId: string,
): Promise<EvidenceRow[]> {
  const { data } = await supabase
    .from('pattern_evidence')
    .select('entry_signal_id, entry_signals!inner(quote, signal_kind, trigger_context, response, emotional_outcome, outcome_valence, theme, intensity, journal_entries!inner(created_at, mood_score))')
    .eq('pattern_pool_id', poolId)
    .order('added_at', { ascending: false })
    .limit(10);
  return (data || []) as unknown as EvidenceRow[];
}

function buildEvidenceEntries(evidence: EvidenceRow[]): Record<string, unknown>[] {
  return evidence
    .filter(e => e.entry_signals)
    .map(e => {
      const s = e.entry_signals!;
      const base: Record<string, unknown> = {
        quote: s.quote,
        date: s.journal_entries?.created_at || '',
      };
      if (s.signal_kind === 'behavioral_link') {
        base.trigger = s.trigger_context;
        base.response = s.response;
        base.emotional_outcome = s.emotional_outcome;
      } else if (s.signal_kind === 'emotional_theme') {
        base.theme = s.theme;
        base.context = s.trigger_context;
        base.intensity = s.intensity;
      }
      return base;
    });
}

function computeWeekSpan(firstDate: string | null, lastDate: string | null): number {
  if (!firstDate || !lastDate) return 0;
  return Math.floor((new Date(lastDate).getTime() - new Date(firstDate).getTime()) / (7 * 24 * 60 * 60 * 1000));
}

async function writePatternNote(
  pattern: PoolPattern,
  evidence: EvidenceRow[],
  goal: string | null,
  mbti: string | null,
  anthropicKey: string,
): Promise<Record<string, unknown> | null> {
  const weekSpan = computeWeekSpan(pattern.first_evidence_at, pattern.last_evidence_at);

  const payload: Record<string, unknown> = {
    user_profile: { goal: goal || 'not set', mbti: mbti || null },
    pattern: {
      kind: pattern.pattern_kind,
      signature: pattern.signature,
      confidence: pattern.confidence,
      session_count: pattern.session_count,
      week_span: weekSpan,
      evidence_entries: buildEvidenceEntries(evidence),
      mood_delta: pattern.mood_delta,
    },
  };

  if (goal) {
    payload.goal_requirement = 'The user has a goal set. Include a goal_connection explaining why this pattern matters for their specific goal.';
  }
  if (pattern.title) {
    payload.existing_title = pattern.title;
  }
  if (pattern.full_note) {
    payload.existing_note = pattern.full_note;
    payload.update_instructions = 'This is an UPDATE. The title is locked. Refine the note with new evidence, adjust confidence language if needed, but keep the same voice.';
  }
  if (pattern.user_feedback) {
    payload.previous_feedback = [{ feedback: pattern.user_feedback, title: pattern.title }];
  }

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
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      }),
    });

    if (!res.ok) {
      console.error(`[manage-pattern-slots] LLM error: ${res.status}`);
      return null;
    }

    const result = await res.json();
    const text = result?.content?.[0]?.text;
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[manage-pattern-slots] LLM call failed:', err);
    return null;
  }
}

// Identify pool candidates that semantically duplicate a pattern the user has
// already seen (active, saved, or recently dismissed). Tag-overlap filtering
// alone misses near-duplicates that share a theme but use different tags
// (e.g. "rest days bring guilt" vs "rest days bring restlessness"). Returns the
// set of candidate IDs to skip. One cheap Haiku call; fails open (empty set).
async function findSemanticDuplicates(
  candidates: PoolPattern[],
  references: { title: string; note: string }[],
  anthropicKey: string,
): Promise<Set<string>> {
  const dupes = new Set<string>();
  if (candidates.length === 0 || references.length === 0) return dupes;

  const payload = {
    existing_patterns: references.map((r, i) => ({ index: i, title: r.title, summary: r.note })),
    candidates: candidates.map((c, i) => ({
      index: i,
      title: c.title || '',
      summary: c.preview_note || c.full_note || '',
    })),
  };

  const SYSTEM = `You deduplicate personal-insight pattern cards for a journaling app. You are given EXISTING patterns already shown to the user and CANDIDATE patterns being considered for display (candidates are ordered by priority — lower index = stronger). Mark a candidate as a duplicate if it describes the same underlying pattern as (a) any existing pattern, OR (b) any earlier candidate in the list (lower index). "Same underlying pattern" means the same root insight even if worded differently: same behavioral link, same emotional dynamic, or same theme. For example "rest days bring guilt" and "rest days bring restlessness" are duplicates (both: rest triggers discomfort about not being productive). Keep only the strongest of any duplicate set. Return ONLY JSON: {"duplicate_candidate_indices": [<index>, ...]}. When uncertain, prefer marking as a duplicate — showing the user repetitive cards is worse than dropping one.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 256,
        system: SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      }),
    });
    if (!res.ok) {
      console.error(`[manage-pattern-slots] Dedup LLM error: ${res.status}`);
      return dupes;
    }
    const result = await res.json();
    const text = result?.content?.[0]?.text;
    if (!text) return dupes;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return dupes;
    const parsed = JSON.parse(m[0]);
    const idxs = Array.isArray(parsed.duplicate_candidate_indices) ? parsed.duplicate_candidate_indices : [];
    for (const i of idxs) {
      if (candidates[i]) dupes.add(candidates[i].id);
    }
    return dupes;
  } catch (err) {
    console.error('[manage-pattern-slots] Dedup call failed:', err);
    return dupes;
  }
}

async function writeAndValidate(
  pattern: PoolPattern,
  evidence: EvidenceRow[],
  goal: string | null,
  mbti: string | null,
  anthropicKey: string,
): Promise<{ result: Record<string, unknown>; safe: boolean } | null> {
  const result = await writePatternNote(pattern, evidence, goal, mbti, anthropicKey);
  if (!result) return null;

  const safety = validatePatternSafety(result);
  if (safety.safe) return { result, safe: true };

  console.log(`[manage-pattern-slots] Safety failed for "${pattern.signature}": ${safety.flags.join(', ')}. Retrying...`);
  const retry = await writePatternNote(pattern, evidence, goal, mbti, anthropicKey);
  if (!retry) return null;

  const retrySafety = validatePatternSafety(retry);
  if (retrySafety.safe) return { result: retry, safe: true };

  console.log(`[manage-pattern-slots] Safety retry failed for "${pattern.signature}": ${retrySafety.flags.join(', ')}`);
  return { result: retry, safe: false };
}

// ── Main handler ──

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

    let action = 'refresh';
    let patternId: string | null = null;
    try {
      const body = await req.json();
      if (body?.action) action = body.action;
      if (body?.pattern_id) patternId = body.pattern_id;
    } catch { /* empty body is fine */ }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: settings } = await supabase
      .from('user_settings')
      .select('goal, mbti')
      .eq('user_id', user.id)
      .maybeSingle();
    const goal: string | null = settings?.goal || null;
    const mbti: string | null = settings?.mbti || null;

    const now = new Date().toISOString();

    // ── Handle save/dismiss actions ──
    if (action === 'save' && patternId) {
      const { error } = await supabase
        .from('pattern_pool')
        .update({ slot_state: 'saved', last_interacted_at: now, updated_at: now })
        .eq('id', patternId)
        .eq('user_id', user.id);
      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to save' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Fall through to slot fill
    }

    if (action === 'dismiss' && patternId) {
      const { error } = await supabase
        .from('pattern_pool')
        .update({ slot_state: 'dismissed', last_interacted_at: now, updated_at: now })
        .eq('id', patternId)
        .eq('user_id', user.id);
      if (error) {
        return new Response(JSON.stringify({ error: 'Failed to dismiss' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Fall through to slot fill
    }

    // ── Fetch all pool patterns ──
    const { data: allPatterns } = await supabase
      .from('pattern_pool')
      .select('*')
      .eq('user_id', user.id);

    const patterns: PoolPattern[] = (allPatterns || []) as PoolPattern[];

    // ── A. Auto-decay check ──
    const decayThreshold = new Date(Date.now() - DECAY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const removalThreshold = new Date(Date.now() - DECAY_REMOVAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    for (const p of patterns) {
      if (p.slot_state === 'active' && p.last_evidence_at && p.last_evidence_at < decayThreshold && !p.decay_started_at) {
        await supabase
          .from('pattern_pool')
          .update({ slot_state: 'dimmed', decay_started_at: now, updated_at: now })
          .eq('id', p.id);
        p.slot_state = 'dimmed';
        p.decay_started_at = now;
        console.log(`[manage-pattern-slots] Dimmed pattern: ${p.signature}`);
      }

      if (p.slot_state === 'dimmed' && p.decay_started_at) {
        if (p.last_evidence_at && p.last_evidence_at > p.decay_started_at) {
          await supabase
            .from('pattern_pool')
            .update({ slot_state: 'active', decay_started_at: null, updated_at: now })
            .eq('id', p.id);
          p.slot_state = 'active';
          p.decay_started_at = null;
          console.log(`[manage-pattern-slots] Undimmed pattern (new evidence): ${p.signature}`);
        } else if (p.decay_started_at < removalThreshold) {
          await supabase
            .from('pattern_pool')
            .update({ slot_state: 'pool', decay_started_at: null, slot_promoted_at: null, updated_at: now })
            .eq('id', p.id);
          p.slot_state = 'pool';
          console.log(`[manage-pattern-slots] Removed decayed pattern: ${p.signature}`);
        }
      }
    }

    // ── C. Evolve active cards with new evidence ──
    const activeWithEvidence = patterns.filter(p => p.slot_state === 'active' && p.has_new_evidence);
    for (const p of activeWithEvidence) {
      const shouldRewrite = p.session_count % 3 === 0;
      if (!shouldRewrite) {
        // Just clear the flag without rewriting
        continue;
      }

      const evidence = await fetchEvidenceForPattern(supabase, p.id);
      const validated = await writeAndValidate(p, evidence, goal, mbti, anthropicKey);
      if (validated?.safe && validated.result) {
        const r = validated.result;
        await supabase
          .from('pattern_pool')
          .update({
            preview_note: r.preview_note || p.preview_note,
            full_note: r.full_note || p.full_note,
            goal_connection: r.goal_connection || p.goal_connection,
            personality_framing: r.personality_framing || p.personality_framing,
            reflection_prompt: r.reflection_prompt || p.reflection_prompt,
            suggested_experiment: r.suggested_experiment || p.suggested_experiment,
            model_version: 'claude-sonnet-4-6',
            prompt_version: 'v4',
            updated_at: now,
          })
          .eq('id', p.id);
        console.log(`[manage-pattern-slots] Evolved active pattern: ${p.signature}`);
      }
    }

    // ── B. Fill empty slots ──
    const activeCount = patterns.filter(p => p.slot_state === 'active' || p.slot_state === 'dimmed').length;
    const slotsToFill = MAX_ACTIVE_SLOTS - activeCount;

    if (slotsToFill > 0) {
      // Saved pattern tags — new patterns must not overlap
      const savedTags = new Set<string>();
      for (const p of patterns.filter(p => p.slot_state === 'saved')) {
        for (const t of (p.related_tags || [])) savedTags.add(t.toLowerCase());
      }

      // Active pattern tags — diversity check
      const activeTags = new Set<string>();
      for (const p of patterns.filter(p => p.slot_state === 'active' || p.slot_state === 'dimmed')) {
        for (const t of (p.related_tags || [])) activeTags.add(t.toLowerCase());
      }

      const dismissCutoff = new Date(Date.now() - DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

      // Find eligible pool patterns
      const candidates = patterns
        .filter(p => {
          if (p.slot_state !== 'pool') return false;
          if (p.session_count < MIN_SESSION_COUNT) return false;
          // Must have emotional weight
          // Check via related_tags or mood_delta (evidence signals are reflected in tags)
          if (p.mood_delta == null || Math.abs(p.mood_delta) < MIN_MOOD_DELTA) {
            // No mood delta — require that the pattern is emotional_theme or has evidence
            if (p.pattern_kind !== 'emotional_theme' && p.evidence_count < 2) return false;
          }
          // Not recently dismissed
          if (p.updated_at > dismissCutoff && patterns.some(
            dp => dp.signature === p.signature && dp.slot_state === 'dismissed'
          )) return false;
          // No overlap with saved patterns
          if ((p.related_tags || []).some(t => savedTags.has(t.toLowerCase()))) return false;
          return true;
        })
        .sort((a, b) => {
          // Sort by evidence count DESC, then last evidence date DESC
          if (b.evidence_count !== a.evidence_count) return b.evidence_count - a.evidence_count;
          return (b.last_evidence_at || '').localeCompare(a.last_evidence_at || '');
        });

      // Semantic dedup: candidates that duplicate a pattern the user has already
      // seen (active/dimmed/saved, or recently dismissed) are skipped, even when
      // their tags differ. This is what tag-overlap filtering misses.
      const references = patterns
        .filter(p =>
          p.slot_state === 'active' ||
          p.slot_state === 'dimmed' ||
          p.slot_state === 'saved' ||
          (p.slot_state === 'dismissed' && p.updated_at > dismissCutoff))
        .map(p => ({ title: p.title || '', note: p.preview_note || p.full_note || '' }))
        .filter(r => r.title || r.note);
      const duplicateIds = await findSemanticDuplicates(candidates, references, anthropicKey);

      let filled = 0;
      for (const candidate of candidates) {
        if (filled >= slotsToFill) break;

        // Diversity: skip if tags overlap with already-active patterns
        const candidateTags = (candidate.related_tags || []).map(t => t.toLowerCase());
        if (candidateTags.some(t => activeTags.has(t))) continue;

        // Semantic dedup: skip near-duplicates of already-seen patterns
        if (duplicateIds.has(candidate.id)) {
          console.log(`[manage-pattern-slots] Skipping semantic duplicate: ${candidate.signature}`);
          continue;
        }

        // Fetch evidence and generate LLM note
        const evidence = await fetchEvidenceForPattern(supabase, candidate.id);
        const validated = await writeAndValidate(candidate, evidence, goal, mbti, anthropicKey);
        if (!validated || !validated.safe) {
          console.log(`[manage-pattern-slots] Skipping unsafe candidate: ${candidate.signature}`);
          continue;
        }

        const r = validated.result;
        const { error: promoteErr } = await supabase
          .from('pattern_pool')
          .update({
            slot_state: 'active',
            slot_promoted_at: now,
            title: r.title || candidate.title,
            preview_note: r.preview_note || null,
            full_note: r.full_note || null,
            goal_connection: r.goal_connection || null,
            personality_framing: r.personality_framing || null,
            reflection_prompt: r.reflection_prompt || null,
            suggested_experiment: r.suggested_experiment || null,
            model_version: 'claude-sonnet-4-6',
            prompt_version: 'v4',
            updated_at: now,
          })
          .eq('id', candidate.id);

        if (promoteErr) {
          console.error(`[manage-pattern-slots] Promote failed:`, promoteErr.message);
          continue;
        }

        for (const t of candidateTags) activeTags.add(t);
        filled++;
        console.log(`[manage-pattern-slots] Promoted to slot: ${candidate.signature} (${r.title})`);
      }

      console.log(`[manage-pattern-slots] Filled ${filled}/${slotsToFill} slots`);
    }

    // ── Return current active + saved patterns ──
    const { data: resultPatterns } = await supabase
      .from('pattern_pool')
      .select('*')
      .eq('user_id', user.id)
      .in('slot_state', ['active', 'dimmed', 'saved'])
      .order('slot_promoted_at', { ascending: false });

    return new Response(JSON.stringify({ patterns: resultPatterns || [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[manage-pattern-slots] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
