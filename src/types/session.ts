// Const-object enum pattern (compatible with erasableSyntaxOnly). Behaves like
// the previous string enum: SessionState.IDLE is the value, SessionState is the type.
export const SessionState = {
  IDLE: 'IDLE',
  CALENDAR_UPLOAD: 'CALENDAR_UPLOAD',
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

// Sanitize event titles before using in question text — calendar data is untrusted
function sanitizeTitle(raw: string): string {
  return raw.replace(/[^\w\s,.'&:()-]/g, '').trim().slice(0, 80);
}

export function getQ1WithContext(events: CalendarEvent[] | null): { question: string; subPrompt: string } {
  if (!events || events.length === 0) {
    return QUESTIONS[0];
  }
  const safeTitle = sanitizeTitle(events[0].title);
  if (!safeTitle) return QUESTIONS[0];
  return {
    question: `You had ${safeTitle} today — what stood out to you?`,
    subPrompt: 'Take your time. There\'s no wrong answer.',
  };
}
