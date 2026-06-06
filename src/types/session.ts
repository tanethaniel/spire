// Const-object enum pattern (compatible with erasableSyntaxOnly). Behaves like
// the previous string enum: SessionState.IDLE is the value, SessionState is the type.
export const SessionState = {
  IDLE: 'IDLE',
  GENERATING_Q1: 'GENERATING_Q1',
  TTS_PLAYING: 'TTS_PLAYING',
  RECORDING: 'RECORDING',
  BACKGROUND_TRANSCRIBING: 'BACKGROUND_TRANSCRIBING',
  ANALYZING: 'ANALYZING',
  RESULT: 'RESULT',
  ERROR: 'ERROR',
} as const;

export type SessionState = typeof SessionState[keyof typeof SessionState];

export interface CalendarEvent {
  title: string;
  time: string;
}

export interface QuestionRound {
  index: number;
  question: string;
  subPrompt: string;
  toneInstruction: string;
  transcript: string | null;
  audioKey: string | null;
  status: 'pending' | 'tts_playing' | 'recording' | 'transcribing' | 'done' | 'skipped';
  transcriptFailed?: boolean;
}

export interface SessionData {
  state: SessionState;
  sessionId: string | null;
  currentQuestion: number;
  rounds: QuestionRound[];
  calendarEvents: CalendarEvent[] | null;
  themes: string[] | null;
  insight: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

// User preference for whether Spire interprets entries (themes/insight/tips)
// or acts as a plain voice log. Synced via the user_settings table and
// enforced server-side in analyze-session.
export interface UserSettings {
  interpretationEnabled: boolean;
  mbti: string | null;
}

// A persisted past session, as read back for History and Insights.
export interface JournalEntry {
  id: string;
  createdAt: string;
  transcripts: (string | null)[];
  themes: string[] | null;
  insight: string | null;
  moodScore: number | null;      // -2..+2, null in Log mode
  activityTags: string[] | null; // normalized tags, null in Log mode
  summary: string | null;        // one-sentence session summary, null in Log mode
  keywordTags: string[] | null;  // richer tags for pattern recognition, null in Log mode
  eventContext: CalendarEvent[] | null;
  durationMs: number | null;
}

// A surfaced cross-session correlation, e.g. "better moods on gym days".
export interface CorrelationTip {
  tag: string;
  message: string;
  withTagAvg: number;
  withoutTagAvg: number;
  dayCount: number;
  category?: 'activity' | 'schedule' | 'social' | 'recurring' | 'trend';
}

// Minimum days of entries before correlation tips unlock.
export const TIPS_MIN_DAYS = 7;

export const QUESTIONS: { question: string; subPrompt: string; toneInstruction: string }[] = [
  {
    question: 'What did you do today?',
    subPrompt: 'Take your time. There\'s no wrong answer.',
    toneInstruction: 'Speak like you\'re greeting a close friend you haven\'t seen all day. Warm, relaxed, genuinely curious. Let the words breathe — pause naturally between phrases. Don\'t rush the ending, let it trail off gently like a real question.',
  },
  {
    question: 'How did those things make you feel? What emotions stemmed from today?',
    subPrompt: 'Whatever comes to mind first.',
    toneInstruction: 'Speak softly and slowly, like you\'re sitting next to someone in a quiet room. Tender, empathetic. Pause before "what emotions" as if you\'re giving them space to think. Let each word land.',
  },
  {
    question: 'What memories did you make today? What stuck with you?',
    subPrompt: 'Big or small — anything that comes back to you.',
    toneInstruction: 'Speak with quiet wonder, like you\'re both looking back on the day together. Slightly lighter energy, a gentle smile in your voice. Pause after "today" before the second question. Reflective, unhurried.',
  },
  {
    question: 'Was there anything interesting you learned today?',
    subPrompt: 'Something new, surprising, or useful.',
    toneInstruction: 'Speak with genuine curiosity, like you really want to know. A hint of playful interest — slightly more energy than before, but still calm. Lean into the word "interesting" with a little emphasis.',
  },
  {
    question: 'Was there anything interesting you learned about yourself today? What caused it?',
    subPrompt: 'Even a small realization counts.',
    toneInstruction: 'Speak thoughtfully and intimately, like sharing something personal. Slow down on "about yourself" — give it weight. Pause before "what caused it" as if the question just occurred to you. Contemplative, warm.',
  },
  {
    question: 'Anything else?',
    subPrompt: 'Whatever\'s still on your mind.',
    toneInstruction: 'Speak very gently and briefly, almost a whisper. Like you\'re giving them permission to say one more thing or to be done. Minimal energy, a soft exhale before speaking. Let the silence after feel comfortable.',
  },
];

// --- Event categorization for Q1 personalization ---

type EventCategory = 'meetings' | 'social' | 'health' | 'personal' | 'focus' | 'other';

const CATEGORY_KEYWORDS: { category: EventCategory; keywords: string[] }[] = [
  {
    category: 'social',
    keywords: [
      'lunch', 'dinner', 'coffee', 'drinks', 'happy hour', 'brunch',
      'catch up', 'catchup', 'hang out', 'hangout', 'party', 'birthday',
      'celebration', 'date', 'game night', 'movie', 'concert', 'show',
      'reunion', 'visit', ' with ',
    ],
  },
  {
    category: 'health',
    keywords: [
      'gym', 'workout', 'run', 'yoga', 'pilates', 'tennis', 'basketball',
      'soccer', 'swim', 'hike', 'walk', 'cycling', 'crossfit', 'meditation',
      'therapy', 'dentist', 'doctor', 'appointment', 'checkup', 'physio',
      'massage', 'chiropractor', 'vet',
    ],
  },
  {
    category: 'personal',
    keywords: [
      'pick up', 'pickup', 'drop off', 'dropoff', 'errands', 'grocery',
      'groceries', 'haircut', 'barber', 'bank', 'post office', 'dry clean',
      'laundry', 'car wash', 'oil change', 'repair', 'move', 'pack', 'clean',
      'cook', 'meal prep',
    ],
  },
  {
    category: 'focus',
    keywords: [
      'focus', 'deep work', 'heads down', 'writing', 'study', 'research',
      'reading', 'prep', 'block', 'no meetings',
    ],
  },
  {
    category: 'meetings',
    keywords: [
      'meeting', 'standup', 'stand-up', 'sync', '1:1', 'one-on-one',
      'retro', 'retrospective', 'sprint', 'scrum', 'kickoff', 'all-hands',
      'check-in', 'check in', 'huddle', 'debrief', 'review', 'planning',
      'demo', 'interview', 'workshop', 'brainstorm', 'status update',
      'weekly', 'daily', 'call', 'connect', 'discussion',
    ],
  },
];

const CATEGORY_LABELS: Record<EventCategory, { singular: string; plural: string }> = {
  meetings: { singular: 'a meeting', plural: 'some meetings' },
  social:   { singular: 'some social time', plural: 'some social time' },
  health:   { singular: 'a wellness appointment', plural: 'some wellness time' },
  personal: { singular: 'an errand', plural: 'some errands' },
  focus:    { singular: 'some focus time', plural: 'some focus time' },
  other:    { singular: 'something on your calendar', plural: 'a few things on your calendar' },
};

function categorizeEvent(title: string): EventCategory {
  const lower = title.toLowerCase();
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some(kw => lower.includes(kw))) return category;
  }
  return 'other';
}

function getCategoryLabel(category: EventCategory, count: number): string {
  const labels = CATEGORY_LABELS[category];
  if (count >= 2) return labels.plural;
  return labels.singular;
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*[\[(].*?[\])]/, '')
    .replace(/\s*[-–—|:]\s*https?:\/\/\S+/, '')
    .trim();
}


type DayShape = 'light' | 'moderate' | 'full' | 'packed';

function getDayShape(eventCount: number, totalHours: number): DayShape {
  if (eventCount >= 8 || totalHours >= 7) return 'packed';
  if (eventCount >= 5 || totalHours >= 5) return 'full';
  if (eventCount >= 3 || totalHours >= 3) return 'moderate';
  return 'light';
}

function parseHour(timeStr: string): number | null {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return hour + parseInt(match[2], 10) / 60;
}

function computeTotalHours(events: CalendarEvent[]): number {
  let total = 0;
  for (const ev of events) {
    const parts = ev.time.split('–').map(s => s.trim());
    if (parts.length !== 2) continue;
    const start = parseHour(parts[0]);
    const end = parseHour(parts[1]);
    if (start !== null && end !== null && end > start) {
      total += end - start;
    }
  }
  return total;
}

function getTimeframe(events: CalendarEvent[]): string {
  let allMorning = true;
  let allEvening = true;
  for (const ev of events) {
    const hour = parseHour(ev.time);
    if (hour === null) { allMorning = false; allEvening = false; continue; }
    if (hour >= 12) allMorning = false;
    if (hour < 17) allEvening = false;
  }
  if (allMorning) return 'this morning';
  if (allEvening) return 'this evening';
  return 'today';
}

function buildQ1(events: CalendarEvent[]): string {
  const timeframe = getTimeframe(events);
  const totalHours = computeTotalHours(events);
  const shape = getDayShape(events.length, totalHours);

  if (shape === 'packed') {
    return `You had a really packed ${timeframe} — how are you holding up?`;
  }

  if (shape === 'full') {
    return `You had a full ${timeframe} — how are you feeling about it all?`;
  }

  if (shape === 'light') {
    const counts: Record<EventCategory, number> = {
      meetings: 0, social: 0, health: 0, personal: 0, focus: 0, other: 0,
    };
    for (const ev of events) counts[categorizeEvent(ev.title)]++;

    const cats = (Object.entries(counts) as [EventCategory, number][])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);

    const parts: string[] = cats.map(([cat, n]) => getCategoryLabel(cat, n));
    const summary = parts.length === 1 ? parts[0] : `${parts[0]} and ${parts[1]}`;

    if (events.length === 1) {
      return `You had ${summary} ${timeframe} — how did it go?`;
    }
    return `You had ${summary} ${timeframe} — how did it all go?`;
  }

  // Moderate (3-4 events or 3-5h): use category summaries for top categories,
  // then mention remaining event names
  const counts: Record<EventCategory, number> = {
    meetings: 0, social: 0, health: 0, personal: 0, focus: 0, other: 0,
  };
  const otherEvents: CalendarEvent[] = [];
  for (const ev of events) {
    const cat = categorizeEvent(ev.title);
    counts[cat]++;
    if (cat === 'other') otherEvents.push(ev);
  }

  const named = (Object.entries(counts) as [EventCategory, number][])
    .filter(([cat, n]) => n > 0 && cat !== 'other')
    .sort((a, b) => b[1] - a[1]);

  const parts: string[] = [];
  for (const [cat, n] of named.slice(0, 2)) {
    parts.push(getCategoryLabel(cat, n));
  }
  for (const ev of otherEvents.slice(0, 2 - parts.length)) {
    parts.push(cleanTitle(ev.title));
  }

  if (parts.length === 0) {
    return `You had a few things on your calendar ${timeframe} — how did they go?`;
  }

  const summary = parts.length === 1 ? parts[0] : `${parts[0]} and ${parts[1]}`;
  return `Looks like you had ${summary} ${timeframe} — what stood out to you?`;
}

const CATEGORY_CHIP_LABELS: Record<EventCategory, string> = {
  meetings: 'Work & Meetings',
  social: 'Social',
  health: 'Health & Fitness',
  personal: 'Personal Errands',
  focus: 'Focus Time',
  other: 'Other',
};

export function getQ1Categories(events: CalendarEvent[] | null): string[] {
  if (!events || events.length === 0) return [];
  const counts: Record<EventCategory, number> = {
    meetings: 0, social: 0, health: 0, personal: 0, focus: 0, other: 0,
  };
  for (const ev of events) counts[categorizeEvent(ev.title)]++;

  return (Object.entries(counts) as [EventCategory, number][])
    .filter(([cat, n]) => n > 0 && cat !== 'other')
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => CATEGORY_CHIP_LABELS[cat]);
}

export function getQ1WithContext(events: CalendarEvent[] | null): { question: string; subPrompt: string } {
  if (!events || events.length === 0) {
    return QUESTIONS[0];
  }
  return {
    question: buildQ1(events),
    subPrompt: 'Take your time. There\'s no wrong answer.',
  };
}
