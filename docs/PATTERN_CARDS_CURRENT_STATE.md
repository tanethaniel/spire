# Pattern Cards — Current State & Behaviour

> Generated from codebase analysis, June 2026. For review and debugging.

---

## End-to-End Flow

```
User completes journal session (6 questions)
  │
  ▼
analyze-session edge function
  → mood_score, emotion_tag, activity_tags, keyword_tags, themes, summary
  → Stored in journal_entries
  │
  ▼
extract-entry-signals edge function (called via backfillEntrySignals)
  → LLM extracts fine-grained signals (activity, emotion, self_belief, etc.)
  → Each signal has: quote, normalized_value, signal_type, sentiment, confidence
  → Stored in entry_signals
  │
  ▼
usePatternNotes hook calls triggerTrickle()
  │
  ▼
generate-patterns edge function (force_refresh=true)
  1. Fetch entries, signals, calendar signals, existing patterns (last 30 days)
  2. buildCandidates() — deterministic, no LLM
  3. Filter out candidates overlapping with saved pattern tags
  4. clusterCandidates() — LLM merges semantically similar candidates
  5. selectBalancedPatterns() — scoring + life category caps
  6. Dismiss ALL active cards (fresh generation)
  7. For each selected candidate: LLM writes note → safety validation → insert
  │
  ▼
Client receives new patterns → displays on InsightsPage
```

---

## When Generation is Triggered

| Trigger | Where | What Happens |
|---------|-------|-------------|
| **First load** (no patterns exist) | `usePatternNotes` init effect | `backfillAnalysis()` → `backfillEntrySignals()` → `generatePatterns(true)` |
| **After completing a journal session** | `handleSessionComplete` in App.tsx | Calls `triggerTrickle()` which does `backfillEntrySignals()` → `generatePatterns(true)` |
| **User saves a pattern** | `toggleSave()` in usePatternNotes | After API call, fires `triggerTrickle()` in background |
| **User dismisses a pattern** | `dismiss()` in usePatternNotes | After API call, fires `triggerTrickle()` in background |
| **User clicks "Update" button** | InsightsPage → `onUpdatePatterns` | Calls `update()` which wraps `triggerTrickle()` |

**Important:** Every trigger calls `generatePatterns(true)` which means `force_refresh=true`, bypassing the rate limit of 5 patterns/day. The rate limit only applies when `force_refresh=false`, which is never used in the current flow.

---

## Candidate Generation (Deterministic)

`buildCandidates()` generates candidates from 9 signal types:

| Type | Data Source | Minimum Threshold | What It Detects |
|------|------------|-------------------|-----------------|
| `recurring_theme` | entry_signals by canonical group | 2 distinct days OR 30% of entries | Any signal value appearing repeatedly |
| `mood_driver` | entry_signals + mood_score | 2 days, mood delta ≥ 0.5, 1+ quote | Signals that co-occur with higher/lower mood |
| `calendar_load` | daily_calendar_signals + negative emotions | 3+ busy days, 2+ negative emotion signals | Busy calendar days paired with stress/tiredness |
| `recovery_signal` | entry_signals matching RECOVERY_ACTIVITIES | 2+ days with mood ≥ avg + 0.5 | Activities that correlate with above-average mood |
| `relationship_pattern` | signals with type=relationship/social_context | 2+ days, must have co-occurring emotion/need/self_belief | Relationship contexts paired with emotional themes |
| `self_belief` | signals with type=self_belief | 2+ signals with quotes | Self-advocacy, confidence, discipline themes |
| `goal_alignment` | signals matching GOAL_SIGNAL_MAP types | 2+ signals of same normalized_value | Recurring signals relevant to user's stated goal |
| `emotion_trend` | journal_entries.emotion_tag | 2+ distinct days | Emotions appearing frequently, with co-occurring activities |
| `activity_mood_link` | journal_entries.activity_tags + mood_score | 2+ days, mood delta ≥ 0.4 vs. overall average | Activities with consistent mood impact |

**Additional:** An "activity-emotion correlation" variant also scans `activity_tags + keyword_tags` for activities not already covered by `activity_mood_link`, looking for co-occurring emotions.

### Deduplication (Pre-Clustering)

After all candidates are generated, exact-signal duplicates are collapsed:
- Groups by `signal.toLowerCase()`
- Keeps the best candidate per group (highest confidence, most quotes)
- Sorts: strong > emerging > early, then by quote count

---

## Synonym Normalization

Signals are grouped by canonical synonym before candidate generation:

```
gym, running, tennis, boxing, yoga, swimming, cycling, hiking, pilates → "exercise"
tired, exhausted, fatigued, drained, burnt out, burnout, sleepy → "tired"
anxious, nervous, worried, unsettled, uneasy, on edge → "anxious"
friends, friend time, hanging out, socializing → "social"
rest, relaxing, day off, downtime, taking it easy, recovery → "rest"
focused, clear, in the zone, deep work, flow → "focused"
stressed, under pressure, pressure, tense → "stressed"
...etc (see SYNONYM_MAP in generate-patterns)
```

This means "gym" on day 1 and "running" on day 2 count as 2 days of "exercise" for candidate thresholds.

---

## Clustering (LLM-Based)

After deterministic candidate generation, an LLM groups semantically similar candidates:
- Input: candidate summaries (signal, type, evidence, tags, confidence)
- Output: groups of candidate indices to merge
- **Aggressive merging** — "fewer, stronger insights" is the directive
- If clustering LLM fails, unclustered candidates pass through unchanged

**Merge logic:** Takes best confidence, combines all quotes/tags/entry IDs, recalculates confidence from combined evidence.

---

## Quality Gate (selectBalancedPatterns)

### Scoring

Each candidate gets a usefulness score:

| Factor | Points | Condition |
|--------|--------|-----------|
| Multiple quotes | +20 | ≥ 2 quotes |
| Multiple days | +20 | ≥ 3 supporting days |
| Goal-connected | +20 | type is `goal_alignment` AND user has goal |
| Emotional quotes | +15 | Any quote contains emotion keywords (feel, happy, stressed, etc.) |
| Calendar context | +10 | Has calendar density info |
| Recovery angle | +10 | Type is `recovery_signal` |
| Self-understanding | +10 | Type is `self_belief` or `relationship_pattern` |
| Activity frequency only | -30 | Has quotes but no emotional content AND no mood delta |
| Low repetition | -15 | < 3 supporting days |
| Category saturated | -15 | Already 2 active patterns in same life category |

### Visibility Filter

Candidates must have:
- ≥ 1 quote OR calendar context
- ≥ 2 supporting days

### Life Category Caps

| Category | Max Patterns |
|----------|-------------|
| Work | 2 |
| All others | 2 each |

Hard cap: **MAX_ACTIVE_CARDS = 7** total.

### Life Categories

Candidates are mapped to life categories by their tags/signal/type:
- Work, Relationships, Recovery, Health, Energy, Self-Belief, Emotion, Calendar Load, Growth, Creativity, Routine, Other

---

## Fresh Generation Model

**Every generation dismisses ALL active cards and inserts new ones from scratch.**

1. All current `status='active'` patterns are set to `status='dismissed'`
2. If this dismiss fails, the function returns 500 (prevents duplicates)
3. New patterns are inserted as `status='active'`
4. Saved patterns (`status='saved'`) are never touched

### Saved Pattern Protection

Before clustering, candidates that overlap with any saved pattern's `related_tags` are filtered out:
- Computes a set of all lowercase tags from saved patterns
- Drops any candidate where ANY of its tags match a saved tag
- This prevents generating a new card that duplicates a saved insight

### Dismissed Pattern Handling

- Dismissed patterns are deleted after 14 days (cleanup at start of each generation run)
- Dismissed patterns are NOT checked during candidate filtering — they do not block new candidates
- A user dismissing "Exercise lifts your mood" today can see a new exercise-related pattern on the next generation

---

## LLM Note Writing

Each selected candidate gets an LLM call to produce:

| Field | Max Length | Purpose |
|-------|-----------|---------|
| `title` | 80 chars | Card headline — must name specific activity/emotion/context |
| `preview_note` | 220 chars | Card body (visible on InsightsPage) |
| `full_note` | 600 chars | Detail sheet body (visible when card is tapped) |
| `goal_connection` | — | Why pattern matters for user's goal (null if no goal) |
| `personality_framing` | 250 chars | MBTI-specific suggestion (null if no MBTI) |
| `reflection_prompt` | 180 chars | Question for user to consider |
| `suggested_experiment` | 250 chars | Concrete action to try this week |
| `safety_flags` | — | Self-reported safety issues |

### Safety Validation

After LLM writes the note, regex-based safety checks scan ALL text fields for:

| Flag | What It Catches |
|------|----------------|
| `negative_causal_claim` | "leads to", "causes", "pulls/drags/tanks mood" |
| `healthy_behavior_framed_as_bad` | Exercise/rest/self-advocacy described with "bad/harmful/worse" |
| `mbti_causal_claim` | "because you are INTJ", "your type means" |
| `raw_score_exposed` | Numbers like 0.4, "averaged 3", "correlation" |
| `diagnostic_language` | "diagnosis", "disorder", "symptoms of", "therapy" |
| `generic_filler` | "for someone tracking", "that's worth paying attention to" |

**If any flag fires:** retry once (LLM randomness usually fixes it). If retry also fails, pattern is **skipped** (not inserted).

---

## Client-Side Display

### usePatternNotes Hook

- Fetches all patterns with status `active`, `saved`, or `watching`
- Splits into active + saved arrays
- Applies `dedupeByPrimaryTag()` — drops patterns sharing any non-category tag with an earlier pattern in the list
- Active patterns shown first, then saved in collapsible section

### InsightsPage

- **Unlock gate:** Patterns only shown after 7+ entries (checked against entry count, not distinct days)
- **Loading state:** 2 shimmer skeleton cards while generating
- **Empty state:** "No patterns yet" message
- **Update button:** Triggers full regeneration
- **Pattern cards:** Show title + preview_note (or note fallback)
- **Detail sheet:** Shows full_note, personality_framing, reflection_prompt, suggested_experiment
- **Feedback:** "Does this feel true?" — Yes / Kind of / Not really
- **Save/Unsave:** Bookmark button, max 20 saved
- **Dismiss:** X button with confirmation, triggers regeneration

### Error Handling

- `lastError` state surfaces API failures as auto-dismissing toast (5s)
- Optimistic rollback on save/dismiss/feedback failures

---

## Rate Limiting

| Limit | Value | Bypass |
|-------|-------|--------|
| Patterns per day | 5 (MAX_PATTERNS_PER_DAY) | `force_refresh=true` (always used) |
| Extractions per day | 50 (extract-entry-signals) | None |
| Analyses per day | 10 (analyze-session) | None |

**Note:** The rate limit of 5 patterns/day is effectively disabled because every call from the client uses `force_refresh=true`.

---

## Key Constants

```
MAX_PATTERNS_PER_DAY = 5        // rate limit (bypassed by force_refresh)
MAX_CANDIDATES = 10             // max candidates entering quality gate
MAX_MAIN_PATTERNS = 5           // (unused in current code — MAX_ACTIVE_CARDS is the real cap)
MAX_THINGS_TO_WATCH = 3         // (unused — thingsToWatch always returns [])
MAX_ACTIVE_CARDS = 7            // hard cap on active patterns
AUTO_ARCHIVE_DAYS = 14          // dismissed patterns deleted after 14 days
MIN_ACTIVE_FLOOR = 2            // (defined but unused in current code)
MAX_SAVED = 20                  // client-side cap on saved patterns
```

---

## Confidence Levels

Assigned by `assignConfidence()` based on entry count, distinct days, and week span:

| Level | Criteria | Framing |
|-------|----------|---------|
| `strong_pattern` | ≥ 5 entries OR ≥ 3 week span | Confident, direct statements |
| `emerging_pattern` | ≥ 3 entries AND ≥ 2 distinct days | "Seems", "appears" — trend forming |
| `early_signal` | Everything else | "Might", "may" — something to watch |

---

## Data Dependencies

### Tables Read

| Table | Fields Used | Purpose |
|-------|------------|---------|
| `journal_entries` | id, created_at, mood_score, emotion_tag, activity_tags, keyword_tags, themes, event_context, q1-q6_transcript | Source data for candidates |
| `entry_signals` | signal_type, normalized_value, quote, question_index, sentiment, confidence + joined journal_entries | Fine-grained signals for candidate building |
| `daily_calendar_signals` | date, day_density, event_count, common_context | Calendar load detection |
| `pattern_insights` | All columns | Existing patterns for overlap/feedback/category saturation |
| `user_settings` | goal, mbti | User profile for LLM personalization |

### Tables Written

| Table | Operation | When |
|-------|-----------|------|
| `pattern_insights` | UPDATE status='dismissed' | Fresh generation dismisses active cards |
| `pattern_insights` | INSERT | New patterns from generation |
| `pattern_insights` | DELETE | Cleanup dismissed patterns > 14 days old |
| `pattern_insights` | UPDATE feedback/status | User actions (save, dismiss, feedback) |

---

## Known Architectural Decisions

1. **Fresh generation over incremental updates:** Previous approach caused "ghost accumulation" — matching failures, drift inserts, patterns that should've been updated but weren't. Current approach: dismiss all active, generate fresh.

2. **Title immutability:** When updating existing patterns (MBTI/split rewrite modes), the title is locked. The LLM refines note content but cannot change the title.

3. **Supporting quotes are backend-only for LLM:** Quotes are stored in DB and sent to LLM for evidence, but are NOT displayed to users in the UI.

4. **Dismissed patterns don't block future candidates:** Only saved patterns block overlapping candidates. Dismissing a pattern means "not right now" — similar insights can surface again on the next generation.

5. **Client-side dedup by primary tag:** Even after backend clustering, the client drops patterns sharing semantic tags. This is a last-resort dedup to prevent the UI showing "Exercise lifts mood" and "Gym correlates with better days" side by side.

6. **"Things to watch" tier is unused:** `MAX_THINGS_TO_WATCH` and `thingsToWatch` exist in the code but `selectBalancedPatterns` always returns an empty array for it.

---

## One-Time Migration Modes

The generate-patterns endpoint has two special modes (not part of normal flow):

1. **`rewrite_mbti=true`:** Re-runs LLM note writing for all active/saved patterns using current MBTI. Title is locked. Used when user changes their MBTI setting.

2. **`rewrite_split=true`:** Populates `preview_note` and `full_note` from the old `note` field. Used for migrating patterns created before the preview/full split was added. Triggered automatically on first load if patterns have `full_note === note`.
