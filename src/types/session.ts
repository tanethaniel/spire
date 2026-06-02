export enum SessionState {
  IDLE = 'IDLE',
  CALENDAR_UPLOAD = 'CALENDAR_UPLOAD',
  GENERATING_Q1 = 'GENERATING_Q1',
  TTS_PLAYING = 'TTS_PLAYING',
  RECORDING = 'RECORDING',
  BACKGROUND_TRANSCRIBING = 'BACKGROUND_TRANSCRIBING',
  ANALYZING = 'ANALYZING',
  RESULT = 'RESULT',
  ERROR = 'ERROR',
}

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

export function getQ1WithContext(events: CalendarEvent[] | null): { question: string; subPrompt: string } {
  if (!events || events.length === 0) {
    return QUESTIONS[0];
  }
  const topEvent = events[0];
  return {
    question: `You had ${topEvent.title} today — what stood out to you?`,
    subPrompt: 'Take your time. There\'s no wrong answer.',
  };
}
