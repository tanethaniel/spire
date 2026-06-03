# TODOS

Captured during `/plan-eng-review` on 2026-06-01. Each item has context for whoever picks it up.

---

## TODO-1: Per-question completion rate logging

**What:** Add `question_started` and `question_completed` events to the `user_events` table for each of the 6 questions per session.

**Why:** Without this, you can't tell which question is causing mid-session dropout. You need to know if users are abandoning at Q4 before you can decide whether to cut or reorder questions in Sprint 2.

**Context:** The `user_events` table is already being built for source-tagged day-2 return tracking (D17). This is a zero-infrastructure addition: 2 extra event types in the same table. Supabase query: `SELECT question_index, COUNT(*) FROM user_events WHERE event = 'question_completed' GROUP BY question_index` gives you a full funnel.

**Pros:** Immediate signal on which questions are too hard/long. Zero extra infrastructure.
**Cons:** None meaningful — it's 10 extra lines of event logging.

**Depends on:** `user_events` table from metric tracking implementation.

**Build in:** V1 (same sprint as events table).

---

## TODO-2: Google Calendar OAuth for Sprint 2

**What:** Replace the screenshot + Claude Vision flow with Google Calendar API direct integration. Supabase Auth handles OAuth2 PKCE flow for Google. Remove the screenshot upload step entirely.

**Why:** The screenshot workaround preserves contextual prompt quality for V1 without the OAuth setup cost. If day-2 return is >40%, Sprint 2 removes all remaining friction from the calendar context feature — events load automatically on app open.

**Context:** Use Supabase Auth's Google OAuth provider (already built-in). Scope: `https://www.googleapis.com/auth/calendar.readonly`. PKCE flow is handled by Supabase — no custom OAuth code needed. The Google OAuth consent screen requires verification (1-3 days, sometimes manual review for new apps). Start the consent screen setup while V1 is in testing.

**Pros:** Zero friction for calendar context. Users don't need to screenshot anything.
**Cons:** Google consent screen review can be slow. Don't start this until the V1 thesis is validated.

**Depends on:** V1 validation (>40% day-2 return). Start consent screen setup in parallel during V1 testing.

**Build in:** Sprint 2 (post-validation).

---

## TODO-3: iOS device test gate before first tester ship

**What:** Before sending the link to 20 testers, test recording + transcription on an actual iPhone in two modes:
1. Safari in-browser (just open the URL in Safari)
2. Installed PWA (use Safari's "Add to Home Screen" — the app icon appears on the home screen)

**Why:** iOS Safari's MediaRecorder implementation has different behavior in installed PWA mode vs. in-browser. Several PWA audio apps have been broken by this difference. Silent failure means every tester who installs the app hits a broken experience.

**Context:** Test checklist:
- [ ] Open URL in Safari → hold record button → speak → release → transcript appears
- [ ] Add to Home Screen → open from home screen → hold record button → speak → release → transcript appears
- [ ] Test with screen lock mid-recording → reopen → IndexedDB recovery prompt appears
- [ ] Test on iOS 16+ (most common) and iOS 15 if available

If either mode fails: investigate `MediaRecorder.onerror` handler and test `audio/mp4` vs `audio/mp4;codecs=aac` MIME type variants.

**Pros:** Catches the #1 risk to your primary target user (iPhone) before anyone else sees it.
**Cons:** Requires a physical iPhone (can't fully simulate in Playwright).

**Depends on:** MVP build complete, Vercel deploy live.

**Build in:** Final gate before first tester onboarding.

---

## TODO-4: Quality eval for mood + activity-tag extraction

**What:** Add an eval suite for the new structured signals returned by `analyze-session` (`mood_score` -2..+2 and `activity_tags`). Feed a set of fixed sample transcripts and assert the model returns sensible, stable mood scores and normalized tags.

**Why:** The correlation tips ("better moods on gym days") are only as good as the per-entry mood/tag extraction. A drifting prompt or model update could silently degrade tag normalization (e.g. "gym" vs "the gym" vs "working out") and break correlations without any error surfacing.

**Context:** Prompt lives in `supabase/functions/analyze-session/index.ts`. Tags are correlated in `src/lib/correlations.ts` (already unit-tested for the math). The gap is extraction quality, which needs an LLM eval, not a unit test. Consider a small fixture of 8-10 transcripts with expected mood ranges and expected tag sets, run against the live function.

**Build in:** Before tips are heavily promoted to users.

---

## TODO-5: Replace full-reload on session Done with in-app state reset

**What:** `handleDone`/`handleBack` in `src/App.tsx` currently call `window.location.reload()` to return Home and refresh history. Replace with an in-app session reset + `useEntries.refresh()` so the transition is instant and preserves PWA state.

**Why:** A full reload re-downloads the bundle, re-runs auth, and flashes the loading screen — janky on mobile and wasteful offline. We already have `refresh()` wired in `useEntries`; we just need a `resetSession()` in `useSession`.

**Context:** `useSession` has no reset today. Add one that returns state to IDLE with fresh rounds, call it from `handleDone`, then `refresh()` to pull the just-saved entry into History.

**Build in:** Next polish pass.
