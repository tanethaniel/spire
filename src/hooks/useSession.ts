import { useCallback, useRef, useState } from 'react';
import { SessionState, type CalendarEvent, type QuestionRound, type SessionData, QUESTIONS, getQ1WithContext } from '../types/session';
import { getSupportedMimeType } from '../lib/audio';
import { saveAudio, deleteAudio } from '../lib/audioDb';
import { processEntry, analyzeSession, saveJournalEntry, extractEntrySignals, generatePatterns } from '../lib/api';
import { trackEvent } from '../lib/events';

function createInitialRounds(): QuestionRound[] {
  return QUESTIONS.map((q, i) => ({
    index: i,
    question: q.question,
    subPrompt: q.subPrompt,
    toneInstruction: q.toneInstruction,
    transcript: null,
    audioKey: null,
    status: 'pending',
  }));
}

export type PatternGenPromise = Promise<void> | null;

export function useSession() {
  const [session, setSession] = useState<SessionData>({
    state: SessionState.IDLE,
    sessionId: null,
    currentQuestion: 0,
    rounds: createInitialRounds(),
    calendarEvents: null,
    themes: null,
    insight: null,
    startedAt: null,
    completedAt: null,
    recordingError: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>(getSupportedMimeType());
  const recordStartRef = useRef<number>(0);
  const analysisRanRef = useRef(false);
  const patternGenRef = useRef<PatternGenPromise>(null);

  // Keep refs in sync so runAnalysis always reads fresh data without
  // needing session.rounds/startedAt/calendarEvents in its dep array.
  const roundsRef = useRef(session.rounds);
  const startedAtRef = useRef(session.startedAt);
  const calendarEventsRef = useRef(session.calendarEvents);
  const sessionIdRef = useRef(session.sessionId);
  roundsRef.current = session.rounds;
  startedAtRef.current = session.startedAt;
  calendarEventsRef.current = session.calendarEvents;
  sessionIdRef.current = session.sessionId;

  const updateRound = useCallback((index: number, updates: Partial<QuestionRound>) => {
    setSession(prev => ({
      ...prev,
      rounds: prev.rounds.map((r, i) => i === index ? { ...r, ...updates } : r),
    }));
  }, []);

  const setCalendarEvents = useCallback((events: CalendarEvent[]) => {
    const q1 = getQ1WithContext(events);
    setSession(prev => ({
      ...prev,
      calendarEvents: events,
      rounds: prev.rounds.map((r, i) =>
        i === 0 ? { ...r, question: q1.question, subPrompt: q1.subPrompt } : r
      ),
    }));
  }, []);

  const startSession = useCallback(() => {
    trackEvent({ event: 'session_open' });
    setSession(prev => ({
      ...prev,
      state: SessionState.TTS_PLAYING,
      sessionId: crypto.randomUUID(),
      startedAt: new Date().toISOString(),
      currentQuestion: 0,
    }));
  }, []);

  const onTTSDone = useCallback(() => {
    setSession(prev => {
      const idx = prev.currentQuestion;
      return {
        ...prev,
        state: SessionState.TTS_PLAYING,
        rounds: prev.rounds.map((r, i) =>
          i === idx ? { ...r, status: 'tts_playing' } : r
        ),
      };
    });
    // The component will transition to ready-to-record after TTS audio ends
  }, []);

  const startRecording = useCallback(async () => {
    const idx = session.currentQuestion;
    trackEvent({ event: 'question_started', question_index: idx });
    updateRound(idx, { status: 'recording' });
    setSession(prev => ({ ...prev, state: SessionState.RECORDING }));

    chunksRef.current = [];
    recordStartRef.current = Date.now();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(stream);
      const mimeType = mimeTypeRef.current;
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setMicStream(null);

        const blob = new Blob(chunksRef.current, { type: mimeType });
        const duration = Date.now() - recordStartRef.current;

        if (duration < 8000) {
          setSession(prev => ({ ...prev, state: SessionState.TTS_PLAYING, recordingError: 'too_short' }));
          updateRound(idx, { status: 'pending' });
          return;
        }

        const audioKey = await saveAudio(idx, blob, mimeType);
        updateRound(idx, { audioKey, status: 'transcribing' });
        setSession(prev => ({ ...prev, state: SessionState.BACKGROUND_TRANSCRIBING }));

        trackEvent({ event: 'question_completed', question_index: idx, duration_ms: duration });

        // Background transcription
        try {
          const { transcript } = await processEntry(blob, idx, mimeType);
          updateRound(idx, { transcript, status: 'done', transcriptFailed: false });
          await deleteAudio(audioKey);
        } catch (err) {
          console.error(`[transcription] Q${idx + 1} failed:`, err);
          updateRound(idx, { status: 'pending', transcriptFailed: true });
          setSession(prev => ({ ...prev, state: SessionState.TTS_PLAYING, recordingError: 'transcription_failed' }));
          return;
        }

        setSession(prev => {
          if (prev.currentQuestion !== idx) return prev;
          const next = idx + 1;
          if (next >= QUESTIONS.length) {
            return { ...prev, state: SessionState.ANALYZING, currentQuestion: next };
          }
          return { ...prev, state: SessionState.TTS_PLAYING, currentQuestion: next };
        });
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch {
      setSession(prev => ({ ...prev, state: SessionState.ERROR }));
    }
  }, [session.currentQuestion, updateRound]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const skipQuestion = useCallback(() => {
    const idx = session.currentQuestion;
    trackEvent({ event: 'question_skipped', question_index: idx });
    updateRound(idx, { status: 'skipped' });

    setSession(prev => {
      const next = prev.currentQuestion + 1;
      if (next >= QUESTIONS.length) {
        return { ...prev, state: SessionState.ANALYZING, currentQuestion: next };
      }
      return { ...prev, state: SessionState.TTS_PLAYING, currentQuestion: next };
    });
  }, [session.currentQuestion, updateRound]);

  // Always run AI analysis to populate mood/tags/themes — these feed the
  // pattern pipeline. The `interpret` flag controls whether insights are
  // shown to the user on the result screen, not whether analysis happens.
  const runAnalysis = useCallback(async (interpret: boolean) => {
    if (analysisRanRef.current) return;
    analysisRanRef.current = true;

    const transcripts = roundsRef.current.map(r => r.transcript);
    const calendarEvents = calendarEventsRef.current;
    const startedAt = startedAtRef.current;
    const sessionId = sessionIdRef.current ?? crypto.randomUUID();
    const completedAt = new Date().toISOString();
    const durationMs = startedAt
      ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
      : 0;

    const triggerPatterns = (entryId: string | null) => {
      if (!entryId) return;
      const p = extractEntrySignals(entryId)
        .then(() => generatePatterns(true))
        .then(() => { patternGenRef.current = null; })
        .catch(err => {
          console.error('[patterns] background generation failed:', err);
          patternGenRef.current = null;
        });
      patternGenRef.current = p;
    };

    let analysis: {
      themes: string[] | null;
      insight: string | null;
      mood_score: number | null;
      emotion_tag: string | null;
      activity_tags: string[] | null;
      summary: string | null;
      keyword_tags: string[] | null;
    } = { themes: null, insight: null, mood_score: null, emotion_tag: null, activity_tags: null, summary: null, keyword_tags: null };

    try {
      const result = await analyzeSession(transcripts);
      analysis = result;
    } catch (err) {
      console.error('[runAnalysis] analysis failed, saving entry without analysis:', err);
    }

    // In Log mode, show result without insights; in Interpreted mode, show them
    setSession(prev => ({
      ...prev,
      state: SessionState.RESULT,
      themes: interpret ? analysis.themes : null,
      insight: interpret ? analysis.insight : null,
      completedAt,
    }));

    const entryId = await saveJournalEntry({
      sessionId,
      transcripts,
      themes: analysis.themes,
      insight: analysis.insight,
      mood_score: analysis.mood_score,
      emotion_tag: analysis.emotion_tag,
      activity_tags: analysis.activity_tags,
      summary: analysis.summary,
      keyword_tags: analysis.keyword_tags,
      event_context: calendarEvents,
      duration_ms: durationMs,
    });

    trackEvent({ event: 'session_completed', duration_ms: durationMs });
    triggerPatterns(entryId);
  }, []);

  const resetSession = useCallback(() => {
    analysisRanRef.current = false;

    // Stop mic and recorder if still active
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    setMicStream(prev => {
      if (prev) prev.getTracks().forEach(t => t.stop());
      return null;
    });

    setSession({
      state: SessionState.IDLE,
      sessionId: null,
      currentQuestion: 0,
      rounds: createInitialRounds(),
      calendarEvents: null,
      themes: null,
      insight: null,
      startedAt: null,
      completedAt: null,
      recordingError: null,
    });
  }, []);

  const clearRecordingError = useCallback(() => {
    setSession(prev => ({ ...prev, recordingError: null }));
  }, []);

  return {
    session,
    micStream,
    setCalendarEvents,
    startSession,
    onTTSDone,
    startRecording,
    stopRecording,
    skipQuestion,
    runAnalysis,
    resetSession,
    clearRecordingError,
    patternGenRef,
  };
}
