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
  transcript: string | null;
  audioKey: string | null;
  status: 'pending' | 'tts_playing' | 'recording' | 'transcribing' | 'done' | 'skipped';
  transcriptFailed?: boolean;
}

export interface SessionData {
  state: SessionState;
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
}

// Minimum days of entries before correlation tips unlock.
export const TIPS_MIN_DAYS = 7;

export const QUESTIONS: { question: string; subPrompt: string }[] = [
  {
    question: 'What did you do today?',
    subPrompt: 'Take your time. There\'s no wrong answer.',
  },
  {
    question: 'How did those things make you feel? What emotions stemmed from today?',
    subPrompt: 'Whatever comes to mind first.',
  },
  {
    question: 'What memories did you make today? What stuck with you?',
    subPrompt: 'Big or small — anything that comes back to you.',
  },
  {
    question: 'Was there anything interesting you learned today?',
    subPrompt: 'Something new, surprising, or useful.',
  },
  {
    question: 'Was there anything interesting you learned about yourself today? What caused it?',
    subPrompt: 'Even a small realization counts.',
  },
  {
    question: 'Anything else?',
    subPrompt: 'Whatever\'s still on your mind.',
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

const CATEGORY_LABELS: Record<EventCategory, { singular: string; plural: string; full: string }> = {
  meetings: { singular: 'a meeting', plural: 'meetings', full: 'a full day of meetings' },
  social:   { singular: 'some social time', plural: 'some social time', full: 'a lot of social time' },
  health:   { singular: 'a health appointment', plural: 'some wellness time', full: 'a wellness-filled day' },
  personal: { singular: 'an errand', plural: 'some errands', full: 'a day of errands' },
  focus:    { singular: 'some focus time', plural: 'some focus time', full: 'a lot of focus time' },
  other:    { singular: 'something on your calendar', plural: 'some things on your calendar', full: 'a busy day' },
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
  if (count >= 4) return labels.full;
  if (count >= 2) return labels.plural;
  return labels.singular;
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

const Q1_TEMPLATES = [
  (s: string, t: string) => `You had ${s} ${t} — how did it all go?`,
  (s: string, t: string) => `Looks like ${s} ${t} — what stood out to you?`,
  (s: string, t: string) => `You had ${s} ${t} — how are you feeling about it?`,
  (s: string, t: string) => `${s.charAt(0).toUpperCase() + s.slice(1)} ${t} — how was it?`,
];

function buildQ1(events: CalendarEvent[]): string {
  const counts: Record<EventCategory, number> = {
    meetings: 0, social: 0, health: 0, personal: 0, focus: 0, other: 0,
  };
  for (const ev of events) counts[categorizeEvent(ev.title)]++;

  const timeframe = getTimeframe(events);
  const totalHours = computeTotalHours(events);
  const templateIdx = new Date().getDay() % Q1_TEMPLATES.length;

  // Packed day: 5+ events AND 5+ hours
  if (events.length >= 5 && totalHours >= 5) {
    if (events.length >= 10) return `You had a really packed ${timeframe} — how are you holding up?`;
    return Q1_TEMPLATES[templateIdx]('a packed day', timeframe);
  }

  // Rank categories by count, drop zeros
  const ranked = (Object.entries(counts) as [EventCategory, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  if (ranked.length === 0) return QUESTIONS[0].question;

  // If 'other' dominates or is the only category
  const otherCount = counts.other;
  const namedCategories = ranked.filter(([cat]) => cat !== 'other');

  if (namedCategories.length === 0) {
    return Q1_TEMPLATES[templateIdx]('a busy day', timeframe);
  }

  if (otherCount > 0 && namedCategories.length > 0 && otherCount > namedCategories[0][1]) {
    return Q1_TEMPLATES[templateIdx]('a busy day', timeframe);
  }

  // Build summary from top 1-2 named categories
  const top = namedCategories.slice(0, 2);

  // 3+ named categories → packed-style phrasing
  if (namedCategories.length >= 3) {
    return Q1_TEMPLATES[templateIdx]('a packed day', timeframe);
  }

  let summary: string;
  if (top.length === 1) {
    summary = getCategoryLabel(top[0][0], top[0][1]);
  } else {
    summary = `${getCategoryLabel(top[0][0], top[0][1])} and ${getCategoryLabel(top[1][0], top[1][1])}`;
  }

  // Single event → simpler phrasing
  if (events.length === 1) {
    return `You had ${summary} ${timeframe} — how did it go?`;
  }

  return Q1_TEMPLATES[templateIdx](summary, timeframe);
}

// Sanitize event titles before using in question text — calendar data is untrusted
function sanitizeTitle(raw: string): string {
  return raw.replace(/[^\w\s,.'&:()-]/g, '').trim().slice(0, 80);
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
