import { useCallback, useRef, useState } from 'react';
import { SessionState, type CalendarEvent, type QuestionRound, type SessionData, QUESTIONS, getQ1WithContext } from '../types/session';
import { getSupportedMimeType } from '../lib/audio';
import { saveAudio, deleteAudio } from '../lib/audioDb';
import { processEntry, analyzeSession, saveJournalEntry } from '../lib/api';
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
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>(getSupportedMimeType());
  const recordStartRef = useRef<number>(0);
  const analysisRanRef = useRef(false);

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

        if (duration < 5000) {
          // Recording too short — let the component handle the UI prompt
          setSession(prev => ({ ...prev, state: SessionState.TTS_PLAYING }));
          updateRound(idx, { status: 'tts_playing' });
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
          // Surface the real failure to the console so transcription issues
          // are diagnosable instead of silently swallowed.
          console.error(`[transcription] Q${idx + 1} failed:`, err);
          updateRound(idx, { status: 'done', transcriptFailed: true });
          // Audio preserved in IndexedDB (cleaned up after 24h if not retried)
        }

        // Advance only if this question is still the active one.
        // A late-finishing background transcription must not move the pointer.
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

  // `interpret` reflects the user's Interpreted/Log preference. In Log mode we
  // never call analyze-session, so transcripts are never sent for analysis.
  //
  // Reads session data from refs (kept in sync above) so the callback is stable
  // (empty dep array → never recreated → effect never re-fires from reference
  // change). The analysisRanRef guard is a belt-and-suspenders safety net.
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

    if (!interpret) {
      setSession(prev => ({ ...prev, state: SessionState.RESULT, completedAt }));
      await saveJournalEntry({
        sessionId,
        transcripts,
        themes: null,
        insight: null,
        mood_score: null,
        activity_tags: null,
        event_context: calendarEvents,
        duration_ms: durationMs,
      });
      trackEvent({ event: 'session_completed', duration_ms: durationMs });
      return;
    }

    try {
      const { themes, insight, mood_score, activity_tags } = await analyzeSession(transcripts);

      setSession(prev => ({
        ...prev,
        state: SessionState.RESULT,
        themes,
        insight,
        completedAt,
      }));

      await saveJournalEntry({
        sessionId,
        transcripts,
        themes,
        insight,
        mood_score,
        activity_tags,
        event_context: calendarEvents,
        duration_ms: durationMs,
      });

      trackEvent({ event: 'session_completed', duration_ms: durationMs });
    } catch {
      setSession(prev => ({ ...prev, state: SessionState.RESULT, completedAt }));

      await saveJournalEntry({
        sessionId,
        transcripts,
        themes: null,
        insight: null,
        mood_score: null,
        activity_tags: null,
        event_context: calendarEvents,
        duration_ms: durationMs,
      });
    }
  }, []);

  const resetSession = useCallback(() => {
    analysisRanRef.current = false;
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
    });
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
  };
}
