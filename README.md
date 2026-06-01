# Spire

A reflection-based journaling app that helps people process their days, notice patterns, and iterate on who they want to become.

Voice-based journaling, connected to your calendar, with analytics that surface insights over time.

## The Problem

75% of people who try journaling quit. Three barriers:
- **Friction** — typing feels like work
- **Blank page** — not knowing what to write
- **Delayed gratification** — benefits take weeks to feel

Spire bets these are product design failures, not motivation failures.

## How It Works

1. Open the app — see today's calendar events
2. Tap an event to get a contextual prompt
3. Hold a button and talk for 30–120 seconds
4. See your transcript, extracted themes, and one AI follow-up question
5. Done — entry saved, patterns tracked over time

No typing required. End-to-end in under 90 seconds.

## Status

Pre-product. Building the Voice-First MVP.

See [`DESIGN.md`](./DESIGN.md) for the full product design doc.

## Stack (planned)

- **Frontend:** Mobile-first PWA
- **Speech-to-text:** Whisper API (OpenAI)
- **AI prompts + themes:** Claude API
- **Calendar context:** Google Calendar API
- **Auth + storage:** Supabase

## Validation Target

Ship to 20 testers. Measure unprompted day-2 return rate.
- >40% = something real, build the full loop
- <20% = thesis needs revision
