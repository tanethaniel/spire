# Pattern Notes System

Spire's pattern recognition engine. Extracts signals from journal entries, finds recurring themes across days, and surfaces them as human-readable "pattern cards" in the Review tab.

---

## Architecture Overview

```
Journal Entry → extract-entry-signals (Edge Function)
                      ↓
                entry_signals table
                      ↓
              generate-patterns (Edge Function)
                      ↓
         ┌────────────┼────────────┐
    Candidates   LLM Clustering   Quality Gate
         └────────────┼────────────┘
                      ↓
              ┌───────┼───────┐
         LLM Writing   Safety Validation
              └───────┼───────┘
                      ↓
            pattern_insights table
                      ↓
            usePatternNotes hook → InsightsPage UI
```

Two Supabase Edge Functions power the pipeline:
1. **extract-entry-signals** — pulls atomic signals from a single entry's transcripts
2. **generate-patterns** — builds candidates from signals, clusters them, writes notes via LLM

Both use Claude Sonnet 4.6.

---

## Database Schema

### `entry_signals`

Atomic observations extracted from journal transcripts.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| journal_entry_id | uuid | FK → journal_entries (CASCADE) |
| question_index | integer | Which question (0-5) |
| source_transcript | text | Raw transcript text |
| quote | text | Exact substring from transcript |
| signal_type | text | One of: activity, emotion, energy, stress, relationship, work, health, recovery, self_belief, need, value, avoidance, gratitude, learning, memory, social_context |
| signal_value | text | Raw value ("working out") |
| normalized_value | text | Canonical form ("gym") |
| sentiment | integer | -2 to 2, NULL if neutral |
| confidence | numeric | 0 to 1 |
| created_at | timestamptz | |

### `daily_calendar_signals`

Pre-computed calendar metadata per day.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| date | date | Unique per user |
| event_count | integer | |
| scheduled_minutes | integer | |
| meeting_minutes | integer | |
| focus_minutes | integer | |
| social_count | integer | |
| health_count | integer | |
| after_work_count | integer | |
| context_switch_count | integer | |
| day_density | text | light, balanced, busy, packed |
| fragmentation_score | numeric | |
| top_event_categories | text[] | |

### `pattern_insights`

The pattern cards themselves.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → auth.users |
| pattern_type | text | Candidate type that generated this card |
| title | text | Max 80 chars. **Immutable after creation.** |
| note | text | Legacy field, mapped to preview_note. |
| preview_note | text | Max 220 chars. Card preview copy. |
| full_note | text | Max 600 chars. Detail view copy with nuance. |
| goal_connection | text | Required for main patterns when goal exists. Woven into full_note. |
| personality_framing | text | Max 280 chars. MBTI-driven suggestion. |
| evidence_summary | text | Human-readable evidence description. |
| confidence | text | early_signal, emerging_pattern, strong_pattern |
| confidence_reason | text | e.g. "5 entries across 2 weeks" |
| evidence_count | integer | Number of quotes |
| entry_count | integer | Number of distinct days |
| date_range_start | date | |
| date_range_end | date | |
| supporting_entry_ids | uuid[] | All contributing entry IDs |
| supporting_quotes | jsonb | Array of {quote, date, question_index} |
| related_calendar_context | jsonb | {day_density, common_context} |
| related_tags | text[] | Semantic tags for deduplication |
| mood_delta | numeric | Positive = mood lift, negative = mood drop |
| reflection_prompt | text | Max 180 chars. Question for user to sit with. |
| suggested_experiment | text | Max 250 chars. Concrete weekly action. |
| suggested_if_then_plan | jsonb | Optional {ifCue, thenResponse} |
| status | text | active, saved, dismissed, watching, archived |
| user_feedback | text | true, kind_of, not_really |
| created_at | timestamptz | |
| updated_at | timestamptz | Changes on evidence refresh, NOT user interaction |
| last_interacted_at | timestamptz | Tracks feedback, save, open events |

### `pattern_actions` (optional)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| pattern_insight_id | uuid | FK → pattern_insights (CASCADE) |
| action_type | text | reflection, experiment, if_then_plan |
| text | text | |
| if_cue / then_response | text | For if-then plans |
| status | text | suggested, accepted, completed, dismissed |

---

## Signal Extraction

**Edge Function:** `supabase/functions/extract-entry-signals/index.ts`

Called per journal entry after transcription completes. Sends Q1-Q6 transcripts to Claude Sonnet, which returns atomic signals grounded in exact quotes.

### Constraints

- Max 30 signals per entry
- Max 50 entries extracted per user per day
- Quotes must be exact or near-exact substrings (no invented evidence)
- Confidence: 0.0-1.0 (default 0.5)
- Sentiment: -2 to 2 or null

### Canonical Normalized Values

| Type | Values |
|------|--------|
| Activities | gym, running, walking, yoga, work, meetings, deep work, reading, cooking, friends, family, partner, coding, creative work, learning, commuting, errands, rest, sleep |
| Emotions | happy, sad, angry, tired, anxious, bored, focused, okay, peaceful |
| Energy | energized, steady, tired, drained, restless, overwhelmed, clear, scattered |

---

## Pattern Generation

**Edge Function:** `supabase/functions/generate-patterns/index.ts`

### Trigger Points

- After a journal session completes (via trickle from frontend)
- When user taps "Update" on the Insights page
- On first load when no active patterns exist (backfill flow)

### Request

```json
{
  "force_refresh": false,
  "rewrite_mbti": false,
  "lookback_days": 30
}
```

### Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| MAX_PATTERNS_PER_DAY | 5 | Daily rate limit (bypassed by force_refresh) |
| MAX_CANDIDATES | 10 | Max candidates after clustering |
| MAX_MAIN_PATTERNS | 5 | Max main pattern cards (cap, not target) |
| MAX_THINGS_TO_WATCH | 3 | Max "things to watch" cards |
| MAX_ACTIVE_CARDS | 7 | Hard safety cap on total active cards |
| AUTO_ARCHIVE_DAYS | 14 | Stale card deletion threshold |
| MIN_ACTIVE_FLOOR | 2 | Never auto-delete below this count |
| MAX_PATTERNS_PER_LIFE_CATEGORY | 2 | Max patterns from one life area |
| MAX_WORK_PATTERNS | 2 | Cap on work-related patterns |

### Pipeline

1. **Auth & Settings** — fetch user goal, MBTI, daily pattern count
2. **Rate Limit** — 5 patterns/day unless force_refresh
3. **Cleanup** — delete dismissed patterns older than 14 days
4. **Fetch Data** (parallel) — journal entries, entry_signals, calendar signals, existing patterns
5. **Build Candidates** — 10 deterministic candidate generators
6. **Deduplicate** — remove semantic duplicates, filter dismissed/saved overlap
7. **LLM Cluster** — Claude merges similar candidates
8. **Quality Gate** — score usefulness, classify display tiers (main/watch/hide), apply life category caps, select balanced set
9. **Auto-Delete Stale** — remove untouched active cards >14 days old
10. **Match Updates** — find existing patterns by tag/title overlap, with drift detection
11. **LLM Write Notes** — generate human-readable notes with safety validation + retry
12. **Goal Check** — enforce goal_connection for main patterns (retry once, then demote)
13. **Save** — update existing rows (preserving title), insert new rows

---

## Candidate Types

All candidates are generated deterministically from signals. The LLM only handles clustering and writing — it never decides what patterns exist.

### 1. `recurring_theme`
A signal value appears on 2+ distinct days OR in ≥30% of entries.

### 2. `mood_driver`
Signal with mood delta ≥ 0.5 (difference between avg mood on days with vs without the signal). Requires 2+ distinct days.

### 3. `calendar_load`
3+ busy/packed calendar days co-occur with negative emotions (tired, anxious, overwhelmed, stressed, scattered, drained, sad, angry, bored).

### 4. `recovery_signal`
Recovery activities appear on 2+ days with above-average mood (≥ avgMood + 0.5). Activities: gym, walking, rest, reading, friends, sleep, yoga, running, cooking, creative work, partner, family.

### 5. `relationship_pattern`
Relationship/social context (manager, coworkers, friends, family, partner) appears 2+ days with co-occurring emotion, need, or self_belief signals.

### 6. `self_belief`
Self-belief signals appear 2+ times with direct quotes.

### 7. `goal_alignment`
Goal-relevant signals appear 2+ times. Uses mapping:
- "feel more grounded" → recovery, energy
- "understand my emotions" → emotion, self_belief
- "build better habits" → activity, recovery
- "process relationships" → relationship, social_context
- "reflect on work" → work, stress
- "find more balance" → energy, recovery, stress

### 8. `emotion_trend`
An emotion tag appears on 2+ distinct days. Tracks co-occurring activities from activity_tags and keyword_tags.

### 9. `activity_mood_link`
An activity (from activity_tags) with consistent mood impact. Requires 2+ distinct days, 2+ mood readings, abs(delta) ≥ 0.4.

### 10. `activity_emotion_correlation`
An activity (from keyword_tags) with recurring co-occurring emotions. Fallback when activity_mood_link doesn't qualify. Requires 2+ distinct days, tracks top 3 emotions.

---

## Confidence Levels

| Level | Criteria | Language |
|-------|----------|----------|
| early_signal | 1+ entries | "This may be showing up...", "worth watching..." |
| emerging_pattern | 3+ entries AND 2+ days | "Spire is starting to notice...", "becoming a theme..." |
| strong_pattern | 5+ entries OR 3+ week span | "This keeps coming up...", "clear pattern here..." |

---

## Deduplication

Candidates carry `related_tags` — semantic tags describing the pattern's content. Category tags are excluded from dedup matching:

```
recurring, mood_driver, activity_mood, calendar, stress, emotion,
self_belief, recurring_theme, mood_correlation, activity_mood_link,
calendar_pattern, self_perception, contextual_blend
```

Only semantic tags (actual content like "gym", "happy", "morning-routine") are compared. Per semantic group, the highest-confidence candidate wins.

Dismissed patterns (soft-deleted, status='dismissed') block future candidates with overlapping tags for 14 days. Saved patterns are locked and excluded from regeneration.

---

## Quality Gate

After clustering, every candidate passes through a quality gate before reaching the LLM.

### Life Categories

Each candidate is assigned a primary life category:

| Category | Tags |
|----------|------|
| work | work, meetings, manager, coworkers, deadline, project, presentation, feedback, career, productivity |
| relationships | friends, family, partner, social, connection, conflict, loneliness, community |
| recovery | rest, sleep, walking, quiet, alone time, reading, prayer, meditation, reset |
| health | gym, running, yoga, cooking, exercise, movement |
| energy | tired, drained, energized, clear, scattered, overwhelmed |
| self_belief | confidence, self-doubt, proving myself, discipline, self-advocacy, avoidance, pressure, pride |
| calendar_load | busy day, packed day, fragmented day, context switching, back-to-back meetings |
| growth | learning, reflection, values, progress, identity |
| creativity | coding, writing, creative work, filming, design, building |
| routine | morning, evening, commute, chores, errands, meal prep |

### Usefulness Scoring

Each candidate gets a score based on:

**Positive factors:** multiple quotes (+20), 3+ distinct days (+20), goal-connected (+20), emotional meaning in quotes (+15), calendar context (+10), recovery angle (+10), self-understanding value (+10)

**Negative factors:** activity frequency only (-30), low repetition <3 days (-15), category already saturated (-15)

### Display Tiers

- **main_pattern** — score ≥65 with no risk flags, OR 3+ days with 2+ quotes and no risks
- **thing_to_watch** — score ≥40, or 2-day candidates with at least 1 quote
- **hide** — <2 days, no quotes + no calendar context, or activity frequency only

2-day candidates are thing_to_watch by default. They only become main patterns with 3+ strong quotes, goal connection, and no risk flags.

### Balanced Selection

- Max 5 main patterns
- Max 3 things to watch
- Max 2 patterns per life category
- Max 2 work patterns
- Excess main patterns demote to things to watch
- Category caps are ceilings, not floors — if only 1 good pattern exists, show 1

---

## Safety Validation

After the LLM writes a note, deterministic safety validation checks for:

- **negative_causal_claim** — "X leads to/causes lower mood"
- **healthy_behavior_framed_as_bad** — self-advocacy, discipline, rest, exercise framed as harmful
- **mbti_causal_claim** — "because you are ENFP", "your type means"
- **raw_score_exposed** — decimal numbers, averages, correlation language
- **diagnostic_language** — clinical/medical terminology

The LLM also self-reports safety_flags in its output (activity_frequency_only, generic_advice, etc.).

If unsafe: retry once with the same prompt. If still unsafe: skip the pattern entirely.

---

## LLM Clustering

Before writing notes, Claude groups similar candidates that describe the same underlying insight. Example: "friends lift mood" + "happiness around people" merge into one social-connection pattern.

Input: array of candidate summaries. Output: groups of candidate indices.

---

## LLM Note Writing

### Rules

1. No invented evidence, no clinical claims
2. Match confidence level in language
3. Reference user's goal to explain relevance
4. Ground everything in provided evidence
5. Never mention "LLM", "data", "transcripts", "backend", raw numbers, or scales
6. Reference actual activities/emotions/tags by name
7. Structure: (1) what pattern, (2) why it matters emotionally, (3) what to try
8. If `existing_title` provided, title is locked — only refine the note
9. MBTI suggestions must be concrete and personality-aligned

### MBTI Framing

| Dimension | Direction |
|-----------|-----------|
| E (Extravert) | Social/collaborative suggestions |
| I (Introvert) | Structured solo time, deeper individual versions |
| S (Sensing) | Concrete actions with clear steps |
| N (Intuitive) | Explore possibilities, reframe |
| T (Thinking) | Systems, experiments, tracking |
| F (Feeling) | Connect with values, relationships, meaning |
| J (Judging) | Routines, schedules, planning |
| P (Perceiving) | Flexibility, variety, spontaneous options |

### Output

```json
{
  "title": "max 80 chars",
  "note": "max 280 chars, 2-3 sentences",
  "personality_framing": "max 280 chars or null",
  "reflection_prompt": "max 180 chars",
  "suggested_experiment": "max 250 chars"
}
```

### Good vs Bad

**Good:** "Your mood lifts noticeably on days you hit the gym before work. When you skip it, you tend to mention feeling sluggish by afternoon. Even a short morning walk might keep that energy up."

**Bad:** "On days with exercise, your mood averaged 0.8 compared to 0.4 on other days. Physical activity appears to correlate with improved emotional states."

---

## Title Immutability

Pattern card titles are generated once and never change. On updates:
- The existing title is passed to the LLM as `existing_title`
- The LLM is instructed to keep the same theme
- The DB update query excludes the `title` column
- Same rule applies during MBTI rewrites

If a pattern drifts enough that the title feels stale, the user must dismiss it and let a new one generate.

---

## Update vs Insert

When new candidates are generated, each is checked against existing active patterns:

**Match criteria (update):**
1. Tag overlap — any semantic tag in the candidate matches an active pattern's tags
2. Signal word overlap — title words (>3 chars) match the candidate's signal value
3. New evidence exists — candidate has entry IDs not already in the pattern
4. **Drift check passes** — life category matches, semantic tags overlap, mood direction hasn't flipped

If matched + no drift → update the existing pattern's note, evidence, quotes (title stays).
If matched + drift detected → insert as new pattern instead of overwriting.
If unmatched → insert a new card (only if under the cap).

### Drift Detection

Before updating an existing pattern, the system checks:
- **Life category match** — candidate and existing pattern must belong to the same life category (or one is "other")
- **Semantic tag overlap** — at least one semantic tag must overlap
- **Mood direction** — if both have mood_delta, direction (positive/negative) must match

If drift is detected, the candidate inserts as a new pattern rather than corrupting an existing one.

---

## Auto-Delete (Stale Cards)

Runs at the start of each generation cycle.

**Criteria:**
- Status = active
- No user feedback submitted
- `last_interacted_at` > 14 days ago
- Total active count > 2 (safety floor)

Oldest stale cards deleted first, up to (active_count - 2) removals max.

---

## MBTI Rewrite

Triggered when user changes their MBTI type in settings. Re-runs LLM writing for all active/saved/watching patterns with the new personality type. Updates note, personality_framing, reflection_prompt, and suggested_experiment. Does **not** regenerate titles or candidates.

---

## Frontend

### Unlock Requirements

Patterns appear in the Review tab after:
- 7+ journal entries
- Across 7+ distinct days

Before unlock, users see a progress bar.

### Hook: `usePatternNotes`

```typescript
{
  patterns: PatternNote[],
  savedCount: number,
  loading: boolean,
  update: () => Promise<'updated' | 'error'>,
  submitFeedback: (id, feedback) => Promise<void>,
  toggleSave: (id) => Promise<void>,
  dismiss: (id) => Promise<void>,
  triggerTrickle: () => Promise<void>,
}
```

**Backfill on first load:** If 0 active patterns exist, runs backfillAnalysis → backfillEntrySignals → generatePatterns(force_refresh) automatically.

**Trickle:** Called after each journal session completes. Runs the same backfill + generate pipeline.

### UI Layout (InsightsPage)

1. **Main patterns** — non-early, non-saved active cards
2. **Things to Watch** — lower confidence active cards (early_signal)
3. **Saved** — separate collapsible section at bottom

Each card shows: confidence badge, title (2-line clamp), preview_note (3-line clamp), first supporting quote. Tap opens detail sheet showing full_note with goal connection woven in.

### User Actions

| Action | Effect |
|--------|--------|
| Tap card | Opens detail sheet, updates `last_interacted_at` |
| Save | status → saved (max 20). Excluded from regeneration. |
| Dismiss | Soft-delete (status → dismissed). Tags block similar candidates for 14 days. Triggers trickle to check for replacements. |
| Feedback (Yes / Kind of / Not really) | Stored in `user_feedback`, passed to LLM on next generation. Updates `last_interacted_at`. |
| Update button | Triggers full trickle (backfill + regenerate). Shows toast: "Updated your patterns..." / "Patterns could not update..." |

### API Calls

| Function | Purpose |
|----------|---------|
| `fetchPatternNotes()` | Get all active/saved/watching patterns |
| `generatePatterns(forceRefresh?)` | Run the generation pipeline |
| `extractEntrySignals(entryId)` | Extract signals from one entry |
| `updatePatternFeedback(id, feedback)` | Submit feedback |
| `updatePatternStatus(id, status)` | Change status (save/unsave) |
| `deletePattern(id)` | Soft-delete (sets status to dismissed) |
| `rewritePatternsMbti()` | Re-run LLM with new MBTI |
| `rewritePatternsSplit()` | One-time migration: populate preview_note + full_note |
| `backfillAnalysis()` | Fill missing mood/themes on entries |
| `backfillEntrySignals()` | Extract signals from recent entries |

---

## Data Sanitization

Before any data reaches the LLM for note writing:

1. **`describeMoodDelta()`** converts numeric mood deltas to natural language: "significantly higher", "noticeably lower", "somewhat higher", "slightly lower"
2. **`buildUserFacingEvidenceSummary()`** generates human-readable evidence descriptions per candidate type (e.g., "Based on 3 reflections where movement showed up alongside words like 'clear' and 'reset'")
3. **`TAG_LABELS`** map translates internal tags to human language (gym → movement, meetings → meeting-heavy days, self_advocacy → standing up for yourself)
4. The `mood_impact` field (string) replaces `mood_delta` (number) in the LLM payload
5. Post-write **`validatePatternSafety()`** catches any raw scores, causal claims, or unsafe framing that slipped through

This ensures pattern cards never contain raw numbers, scales, metrics, or harmful framing.

---

## Onboarding

Pattern cards have a dedicated onboarding screen (step 3 of 5) showing:
- A mock "EMERGING PATTERN" card
- Three info items: unlock requirements, save feature, feedback feature

A first-use tooltip appears when patterns first unlock: "Save patterns you like, dismiss the rest, and give feedback to improve future insights."
