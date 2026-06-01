# Spire: Product Requirements Document

**Author:** Ethan Tan
**Last updated:** 2026-06-01
**Status:** Pre-build, engineering architecture approved
**Audience:** Co-founder / design partner onboarding

---

## 1. Executive Summary

Spire is a voice-first reflection journaling app for Gen-Z professionals (22-30) who know they should journal but don't. We believe the 75% journaling dropout rate is a product design failure, not a motivation failure, driven by three structural barriers: friction (typing feels like work), blank-page paralysis (not knowing what to write), and delayed gratification (benefits take weeks to feel).

Spire attacks all three in a single product: voice input eliminates friction, calendar context eliminates the blank page, and AI-powered theme extraction delivers immediate insight.

This is a conviction bet. No prototype exists. No users have asked for this. The closest analogs are Duolingo (created a learning habit from nothing) and Headspace (created a meditation habit from nothing). Both succeeded by making the first session magical and the daily commitment tiny. That's the playbook.

---

## 2. Target User

**Primary persona:** Early-career professionals, 22-30, wellness and self-improvement oriented. They've heard journaling is good for them. Some have tried (Day One, Notion, paper notebooks) and quit within weeks. Most never started.

**Key behavioral insight:** The competitor is not another journaling app. The competitor is *doing nothing*. The target user processes their day by scrolling Instagram at 10pm and going to bed feeling vaguely unfulfilled. There is no active pain to replace — only a latent belief that journaling would be good for them.

**What makes them hard to convert:** No active pain means no urgency. The entire product lives or dies on whether the first 3 minutes feel magical enough to create a second session.

---

## 3. Core Thesis

| Premise | Confidence | How we validate |
|---------|-----------|-----------------|
| Voice input meaningfully lowers friction vs. typing — enough to convert non-journalers | High (intuitive) | Day-2 return rate among non-journalers |
| Calendar context creates better prompts than generic "How was your day?" | Medium | Qualitative feedback; compare prompted vs. unprompted entry depth |
| Immediate theme extraction provides enough "reward" to replace delayed gratification | Medium | Post-session sentiment; do users mention themes unprompted? |
| The primary competition is inertia, not other apps | High | Tester recruitment: target people who quit, not people who switched |
| The interface wins session 1; light gamification bridges week 1; accumulated analytics own week 2+ | Theoretical | Longitudinal retention curve (requires Sprint 2 to fully test) |

**Pre-build validation step:** Before writing code, find 5 people who tried journaling and quit. Ask them why. If 3+ cite friction, blank pages, or delayed gratification, the thesis has qualitative support and those 5 become beta testers.

---

## 4. Product Vision

**The wedge (V1):** A single, magical voice journal entry experience. Calendar events, contextual prompt, 30-120 seconds of talking, transcript + 3 themes. Under 90 seconds. Zero typing. If this is compelling enough to drive unprompted return, everything else can be built on top.

**The full product (future):** A daily reflection practice with pattern recognition over time. Weekly and monthly analytics that surface recurring themes. A private record of personal growth that gets more valuable the longer you use it.

---

## 5. V1 MVP Requirements

### 5.1 User Journey

```
Open app → [Optional: upload calendar screenshot] → See calendar events
    → Tap event → Hear contextual prompt (Q1, spoken by AI voice)
    → Hold button, talk → Release → Transcript appears
    → Hear Q2 → Record → ... → Q6 → Record
    → See all 6 transcripts + 3 extracted themes
    → Entry saved. Session complete.
```

**Total session time target:** Under 7 minutes for all 6 questions.
**Time to first insight:** Under 90 seconds (Q1 alone).

### 5.2 The 6-Question Guided Session

| # | Question | Source | Purpose |
|---|----------|--------|---------|
| Q1 | Context-aware: "You had a meeting with Sarah today — what stood out?" | Dynamic (ElevenLabs TTS at session start, uses calendar context) | Anchor reflection to a real event |
| Q2 | "How did those things make you feel? What emotions stemmed from today?" | Static (pre-generated audio file) | Emotional processing |
| Q3 | "What memories did you make today? What stuck with you?" | Static | Highlight memorable moments |
| Q4 | "Was there anything interesting you learned today?" | Static | Intellectual growth |
| Q5 | "Was there anything interesting you learned about *yourself* today? What caused it?" | Static | Self-awareness |
| Q6 | "Anything else?" | Static | Open-ended capture |

**Calendar fallback:** When events have low-information titles ("Meeting", "Busy"), fall back to time-of-day heuristics ("It's the end of your workday — what's on your mind?") or a short prompt menu ("Work", "Relationships", "Something on my mind").

**Progressive reveal:** Q1 transcript appears immediately after Q1 recording. All 6 transcripts + 3 themes surface after Q6 completes.

### 5.3 Functional Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|----|------------|----------|-------------------|
| F1 | Email magic link authentication | P0 | User enters email, receives link, taps to authenticate. No password. |
| F2 | Calendar context via screenshot upload | P0 | User uploads screenshot of calendar. Claude Vision extracts event titles. Events appear as tappable list. |
| F3 | Voice recording (hold-to-talk) | P0 | Press-and-hold button records audio. Release stops recording. Works on iOS Safari (in-browser + installed PWA) and Chrome. |
| F4 | Dynamic Q1 prompt via TTS | P0 | Edge Function sends calendar context to ElevenLabs. Audio plays within 3 seconds. |
| F5 | Static Q2-Q6 prompts | P0 | Pre-generated audio files load instantly from CDN. |
| F6 | Background transcription | P0 | Q1 audio uploads to Whisper while Q2 TTS plays. User never waits for transcription between questions. |
| F7 | Theme extraction | P0 | After Q6, Claude analyzes all 6 transcripts. Returns exactly 3 themes (e.g., "Career confidence", "Time pressure", "Manager relationship"). |
| F8 | Entry persistence | P0 | All 6 transcripts + themes + event context saved to Supabase. User can only access their own entries (RLS). |
| F9 | Audio buffering (IndexedDB) | P1 | Audio blobs stored locally per question. Deleted only after transcript is confirmed server-side. Enables retry on Whisper failure without re-recording. |
| F10 | Per-question completion logging | P1 | `question_started` and `question_completed` events logged to `user_events` table for funnel analysis. |
| F11 | Session open source tracking | P1 | `session_open` event includes `source` tag ("direct" vs. "email") to measure unprompted vs. prompted return. |
| F12 | Error resilience | P1 | Whisper timeout: retry button, audio preserved. ElevenLabs failure: question shown as text. Claude timeout: transcripts saved without themes. Mic denied: clear instructions. |

### 5.4 Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Time from app open to completed Q1 | < 90 seconds |
| Typing required for core flow | Zero |
| Mobile-first (iPhone Safari + Chrome) | Required |
| PWA installable | Required |
| Audio stored server-side | Never — streamed to Whisper, discarded |
| Data encrypted at rest | Yes (Supabase default) |
| User can delete all their data | Yes (RLS + delete endpoint) |

### 5.5 What's Explicitly NOT in V1

- Google Calendar OAuth (screenshot + Claude Vision workaround instead)
- Analytics dashboard or historical view
- Gamification, streaks, or badges
- Native mobile app
- AI-generated follow-up questions (standardized 6 questions only)
- CI/CD pipeline (manual Vercel deploy)
- Engagement emails within 48 hours of first session (to preserve metric integrity)

---

## 6. Data Model

### journal_entries
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users, RLS enforced |
| created_at | timestamp | |
| event_context | text | Calendar event title or summary |
| q1_transcript | text | |
| q2_transcript | text | |
| q3_transcript | text | |
| q4_transcript | text | |
| q5_transcript | text | |
| q6_transcript | text | |
| themes | text[] | Exactly 3 extracted themes |

### user_events
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| user_id | uuid | FK to auth.users |
| session_id | uuid | Groups events within a session |
| event | text | "session_open", "question_started", "question_completed" |
| question_index | integer | 1-6, nullable |
| source | text | "direct" or "email" (session_open only) |
| created_at | timestamp | |

---

## 7. Technical Architecture

```
BROWSER (PWA, mobile-first — React + Vite, deployed to Vercel)
    |
    |-- Optional: camera/upload --> calendar screenshot
    |-- MediaRecorder API --> audio (webm on Chrome, mp4 on Safari)
    |-- IndexedDB (idb) --> audio buffer per question
    |
    +-- Supabase Edge Functions (API proxy -- keys never in browser)
            |-- POST /extract-events  --> Claude Vision --> event list
            |-- POST /generate-q1     --> ElevenLabs TTS (dynamic)
            +-- POST /process-entry   --> Whisper + Claude (themes)

SUPABASE
    |-- Auth: email magic link
    |-- DB: journal_entries (RLS)
    +-- DB: user_events (metrics)

STATIC ASSETS (Vercel CDN)
    +-- public/audio/q2.mp3 ... q6.mp3
```

**Key architectural decisions:**
- **API keys live in Edge Functions only.** Never in the browser bundle.
- **RLS from day 1.** Users can only read/write their own rows. Not deferred.
- **No audio retention.** Edge Function streams to Whisper and discards. Privacy is load-bearing for emotionally vulnerable content.
- **iOS Safari codec detection at runtime.** `audio/webm` on Chrome, `audio/mp4` on Safari. Audio session must start in `touchstart` handler — no `setTimeout` delay.

---

## 8. Session State Machine

```
IDLE
  +-> CALENDAR_UPLOAD (optional)
        +-> GENERATING_Q1 (ElevenLabs TTS, ~1-3s)
              +-> [ROUND 1-6]
                    TTS_PLAYING -> RECORDING -> BACKGROUND_TRANSCRIBING -> next round
              +-> ANALYZING (Claude processes all 6 transcripts)
                    +-> RESULT | ERROR
```

Each state transition has defined error handling (see F12). The user never enters a dead end — every failure state has a recovery path that preserves their recorded audio.

---

## 9. Sprint 2 Roadmap (Post-Validation)

Sprint 2 is gated on V1 validation: day-2 unprompted return rate >40%. If V1 fails validation, Sprint 2 is replaced by thesis revision.

### 9.1 Google Calendar OAuth Integration

**What:** Replace screenshot + Claude Vision with direct Google Calendar API access via Supabase Auth's built-in Google OAuth provider (PKCE flow).

**Why:** Removes the last friction point in the entry flow. Events load automatically on app open — no screenshot step.

**Scope:** `calendar.readonly`. Read-only access to today's events.

**Risk:** Google OAuth consent screen requires verification (1-3 days, sometimes longer for new apps). Start the consent screen setup during V1 testing to avoid blocking Sprint 2.

**Acceptance criteria:** User authenticates once with Google. On every subsequent app open, today's calendar events appear automatically. Q1 prompt is generated from actual event data without any user action.

### 9.2 Analytics Dashboard

**What:** A view that surfaces patterns across journal entries over time. Recurring themes, emotional trends, question-level engagement patterns.

**Why:** This is the retention handoff. By week 2, the novelty of voice journaling fades. The analytics dashboard must provide a compelling reason to keep going — "look what Spire has learned about you."

**Open design questions:**
- What's the minimum number of entries before analytics feel meaningful? (Hypothesis: 5-7)
- What visualization makes theme recurrence feel like an insight, not a statistic?
- Does the dashboard feel rewarding or judgmental? (Critical for emotionally vulnerable content)

### 9.3 Light Gamification

**What:** Non-streak-based encouragement mechanics for week 1 bridging.

**Why:** The interface wins session 1. Analytics own week 2+. But something needs to bridge the gap in between. Traditional streaks are dangerous for journaling — breaking a streak creates guilt, and guilt is the #1 reason people abandon journaling.

**Design principles:**
- Never punish a missed day
- Celebrate return after absence, not consecutive days
- Frame progress as depth ("You've reflected on 12 moments this week") not frequency

### 9.4 Per-Question Funnel Optimization

**What:** Analyze per-question completion data from V1 (TODO-1) and optimize the question set.

**Why:** If Q4 has a 60% completion rate but Q5 has 30%, that's a signal to reorder, reword, or cut. The 6-question structure is a hypothesis, not a commitment.

---

## 10. Success Metrics

### V1 (Primary — answers "is this worth building?")

| Metric | Target | How measured |
|--------|--------|-------------|
| Day-2 unprompted return rate | >40% (8/20 users) | `session_open` events where `source = 'direct'` on day 2 |
| 7-day retention | 3+ users complete 7 consecutive days | `journal_entries` count per user per day |
| Qualitative sentiment | 1+ user describes experience as "magical" or "surprisingly easy" | Direct conversation with testers |
| Time to completed Q1 | < 90 seconds | Timestamp diff: `session_open` to `question_completed` where `question_index = 1` |
| Session completion rate | >60% reach Q6 | `question_completed` events at index 6 / `session_open` events |
| Build time | < 3 weekends | Calendar |

**Interpretation guide for day-2 return (n=20):**
- **>40% (8+ users):** Something real. Build Sprint 2.
- **20-40% (4-7 users):** Ambiguous. Dig into qualitative signal — text non-returners "did you try it again?" If 5+ say they wanted to but forgot, that's desire without habit (fixable with notifications/reminders, not a thesis failure).
- **<20% (0-3 users):** Thesis needs revision. Voice + calendar alone may not be enough.

### Sprint 2 (Secondary — answers "can this retain?")

| Metric | Target |
|--------|--------|
| Week-2 retention | >25% of V1 returners still active |
| Analytics engagement | >50% of active users view dashboard at least once per week |
| Calendar OAuth adoption | >80% of active users connect Google Calendar within first week |

---

## 11. Risk Register

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| iOS Safari MediaRecorder breaks in PWA mode | High | Medium | TODO-3: Physical iPhone test gate before any tester sees the app. Test in-browser + installed PWA + screen lock recovery. |
| Voice feels awkward for vulnerable content | High | Medium | Validate in pre-build interviews. If users hesitate, explore text fallback or private-room framing. |
| Calendar events are low-information ("Meeting", "Busy") | Medium | High | Fallback prompts: time-of-day heuristics + manual topic picker. Calendar is preferred, not required. |
| 20 testers can't be recruited | Medium | Low | Start with 10 or even 5. Qualitative signal matters more than sample size at this stage. |
| ElevenLabs latency makes Q1 feel slow | Medium | Medium | Target < 3s. If consistently slow, pre-generate Q1 from calendar context at app open (before user taps an event). |
| Users don't finish all 6 questions | Medium | Medium | Per-question logging (TODO-1) identifies the drop-off point. Sprint 2 optimizes question set. |
| Privacy concerns with voice data | High | Low | No audio retained after transcription. All data encrypted at rest. User can delete all data anytime. Communicate this clearly in onboarding. |

---

## 12. Open Questions

1. **Will Gen-Z users actually talk into their phone for vulnerable reflection?** Voice memos are normalized for casual communication, but journaling is more intimate. Pre-build interviews should probe this directly.

2. **What does the analytics retention handoff look like concretely?** What insight at week 2 is compelling enough to sustain the habit? This is the hardest product design question and likely requires Sprint 2 experimentation.

3. **Is PWA sufficient for habit formation, or do native notifications become the bottleneck?** If retention data shows desire without habit ("I wanted to but forgot"), push notifications via native app may be the Sprint 3 priority.

4. **What's the right number of questions?** Six is a hypothesis. Completion funnel data from V1 will inform whether to cut, reorder, or make later questions optional.

---

## 13. Implementation Plan

### V1 Build (2-3 weekends)

Tasks can be parallelized across two lanes:

**Lane A+B (parallel, no dependencies):**
- T1: Supabase project setup — auth, DB schema, RLS policies, migrations
- T4: Edge Functions — `/extract-events`, `/generate-q1`, `/process-entry`

**Lane C (depends on A+B):**
- T2: React PWA shell — Vite setup, mobile-first layout, routing
- T3: Recording UI — hold-to-talk button, MediaRecorder, codec detection
- T5: Session flow — state machine, question progression, progressive reveal
- T6: Results screen — transcripts + themes display

**Lane D (depends on C):**
- T8: TTS integration — static Q2-Q6 audio files, dynamic Q1 via ElevenLabs

**Lane E (parallel with C):**
- T7: Metric tracking — `user_events` table, per-question logging, source tagging
- T9-T11: Test infrastructure and device testing

**Final gate:** TODO-3 — iOS device test on physical iPhone before any tester receives the URL.

### Distribution

- **Phase 1:** Manual Vercel deploy. Share URL directly with 20 contacts. No App Store.
- **Phase 2 (if validated):** iOS App Store (wellness demographic is iPhone-heavy). Consider ProductHunt for initial traction.

---

## 14. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-01 | Approach A (Voice-First MVP) over Approach B (Full Loop) | Validate core thesis in 1 weekend, not 6 weeks. If voice + calendar alone isn't magical, analytics won't save it. |
| 2026-06-01 | PWA over native app | Fastest to ship and share. URL distribution, no App Store gatekeeping. Reassess after V1 validation. |
| 2026-06-01 | Screenshot + Claude Vision over Google Calendar OAuth for V1 | Avoid OAuth setup cost and consent screen delay. Preserves calendar context quality with minimal engineering. |
| 2026-06-01 | 6 standardized questions over AI-generated follow-ups | Reduce V1 scope and latency. AI follow-ups are a Sprint 2 experiment if the core flow validates. |
| 2026-06-01 | No streaks or streak-based gamification | Journaling is private and emotionally demanding. Breaking a streak creates guilt — the #1 journaling abandonment driver. Use celebration-of-return mechanics instead. |
| 2026-06-01 | No engagement emails for 48h post-first-session | Preserves metric integrity. Day-2 return must be unprompted to validate the thesis. |
| 2026-06-01 | RLS enabled from migration 001 | Privacy is load-bearing for emotionally vulnerable content. Not something to "add later." |
| 2026-06-01 | No audio stored server-side | Edge Function streams to Whisper and discards. Users must trust that their voice recordings are not retained. |

---

*This PRD synthesizes the product design (DESIGN.md), engineering architecture (eng review), and implementation backlog (TODOS.md) into a single reference document for onboarding a design partner or co-founder.*
