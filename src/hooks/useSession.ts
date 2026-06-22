import { useCallback, useRef, useState } from 'react';
import { SessionState, type CalendarEvent, type QuestionRound, type SessionData, type SessionFormat, QUESTIONS, getQ1WithContext } from '../types/session';
import { getSupportedMimeType } from '../lib/audio';
import { saveAudio, deleteAudio } from '../lib/audioDb';
import { processEntry, analyzeSession, saveJournalEntry, extractEntrySignals, matchPatternEvidence, generateFollowups } from '../lib/api';
import { trackEvent } from '../lib/events';

function createGuidedRounds(): QuestionRound[] {
  return QUESTIONS.map((q, i) => ({
    index: i,
    roundType: 'guided' as const,
    question: q.question,
    subPrompt: q.subPrompt,
    toneInstruction: q.toneInstruction,
    transcript: null,
    audioKey: null,
    status: 'pending',
  }));
}

function createBranchingRounds(events: CalendarEvent[] | null, isYesterday: boolean): QuestionRound[] {
  const q1 = getQ1WithContext(events, isYesterday);
  return [{
    index: 0,
    roundType: 'open' as const,
    question: q1.question,
    subPrompt: q1.subPrompt,
    toneInstruction: 'Speak like you\'re greeting a close friend you haven\'t seen all day. Warm, relaxed, genuinely curious. Let the words breathe — pause naturally between phrases. Don\'t rush the ending, let it trail off gently like a real question.',
    transcript: null,
    audioKey: null,
    status: 'pending',
  }];
}

function createInitialRounds(): QuestionRound[] {
  return createGuidedRounds();
}

export type PatternGenPromise = Promise<void> | null;

export function useSession() {
  const [session, setSession] = useState<SessionData>({
    state: SessionState.IDLE,
    sessionId: null,
    sessionFormat: 'structured',
    currentQuestion: 0,
    rounds: createInitialRounds(),
    followUpCount: 0,
    calendarEvents: null,
    themes: null,
    insight: null,
    startedAt: null,
    completedAt: null,
    recordingError: null,
    targetDate: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>(getSupportedMimeType());
  const recordStartRef = useRef<number>(0);
  const analysisRanRef = useRef(false);
  const patternGenRef = useRef<PatternGenPromise>(null);
  const sessionFormatRef = useRef<SessionFormat>('structured');

  const roundsRef = useRef(session.rounds);
  const startedAtRef = useRef(session.startedAt);
  const calendarEventsRef = useRef(session.calendarEvents);
  const sessionIdRef = useRef(session.sessionId);
  const targetDateRef = useRef(session.targetDate);
  roundsRef.current = session.rounds;
  startedAtRef.current = session.startedAt;
  calendarEventsRef.current = session.calendarEvents;
  sessionIdRef.current = session.sessionId;
  targetDateRef.current = session.targetDate;
  sessionFormatRef.current = session.sessionFormat;

  const updateRound = useCallback((index: number, updates: Partial<QuestionRound>) => {
    setSession(prev => ({
      ...prev,
      rounds: prev.rounds.map((r, i) => i === index ? { ...r, ...updates } : r),
    }));
  }, []);

  const setCalendarEvents = useCallback((events: CalendarEvent[], isYesterday = false) => {
    const q1 = getQ1WithContext(events, isYesterday);
    setSession(prev => ({
      ...prev,
      calendarEvents: events,
      rounds: prev.rounds.map((r, i) =>
        i === 0 ? { ...r, question: q1.question, subPrompt: q1.subPrompt } : r
      ),
    }));
  }, []);

  const startSession = useCallback((targetDate?: string | null, format: SessionFormat = 'structured') => {
    trackEvent({ event: 'session_open' });
    const isYesterday = !!targetDate;
    const rounds = format === 'branching'
      ? createBranchingRounds(calendarEventsRef.current, isYesterday)
      : createGuidedRounds();

    if (format === 'structured' && calendarEventsRef.current) {
      const q1 = getQ1WithContext(calendarEventsRef.current, isYesterday);
      rounds[0] = { ...rounds[0], question: q1.question, subPrompt: q1.subPrompt };
    }

    setSession(prev => ({
      ...prev,
      state: SessionState.TTS_PLAYING,
      sessionId: crypto.randomUUID(),
      sessionFormat: format,
      startedAt: new Date().toISOString(),
      currentQuestion: 0,
      rounds,
      followUpCount: 0,
      targetDate: targetDate ?? null,
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
  }, []);

  const advanceAfterTranscription = useCallback((idx: number) => {
    setSession(prev => {
      if (prev.currentQuestion !== idx) return prev;

      if (prev.sessionFormat === 'branching' && idx === 0) {
        return { ...prev, state: SessionState.GENERATING_FOLLOWUPS };
      }

      const next = idx + 1;
      const totalRounds = prev.rounds.length;
      if (next >= totalRounds) {
        return { ...prev, state: SessionState.ANALYZING, currentQuestion: next };
      }
      return { ...prev, state: SessionState.TTS_PLAYING, currentQuestion: next };
    });
  }, []);

  const handleFollowupGeneration = useCallback(async () => {
    const rounds = roundsRef.current;
    const openTranscript = rounds[0]?.transcript;
    if (!openTranscript) {
      setSession(prev => ({ ...prev, state: SessionState.ANALYZING }));
      return;
    }

    try {
      const followups = await generateFollowups(
        openTranscript,
        calendarEventsRef.current,
        targetDateRef.current,
      );

      if (followups.length === 0) {
        setSession(prev => ({ ...prev, state: SessionState.ANALYZING }));
        return;
      }

      const newRounds: QuestionRound[] = followups.map((f, i) => ({
        index: 1 + i,
        roundType: 'followup' as const,
        question: f.question,
        subPrompt: f.subPrompt,
        toneInstruction: f.toneInstruction,
        transcript: null,
        audioKey: null,
        status: 'pending' as const,
      }));

      setSession(prev => ({
        ...prev,
        state: SessionState.TTS_PLAYING,
        currentQuestion: 1,
        rounds: [...prev.rounds, ...newRounds],
        followUpCount: followups.length,
      }));
    } catch (err) {
      console.error('[followups] generation failed, skipping to analysis:', err);
      setSession(prev => ({ ...prev, state: SessionState.ANALYZING }));
    }
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

        advanceAfterTranscription(idx);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
    } catch {
      setSession(prev => ({ ...prev, state: SessionState.ERROR }));
    }
  }, [session.currentQuestion, updateRound, advanceAfterTranscription]);

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
      if (prev.sessionFormat === 'branching' && idx === 0) {
        return { ...prev, state: SessionState.ANALYZING, currentQuestion: idx + 1 };
      }
      const next = prev.currentQuestion + 1;
      const totalRounds = prev.rounds.length;
      if (next >= totalRounds) {
        return { ...prev, state: SessionState.ANALYZING, currentQuestion: next };
      }
      return { ...prev, state: SessionState.TTS_PLAYING, currentQuestion: next };
    });
  }, [session.currentQuestion, updateRound]);

  const submitTextEntry = useCallback((questionIndex: number, text: string) => {
    trackEvent({ event: 'question_completed', question_index: questionIndex, duration_ms: 0 });
    updateRound(questionIndex, { transcript: text, status: 'done', transcriptFailed: false });

    setSession(prev => {
      if (prev.sessionFormat === 'branching' && questionIndex === 0) {
        return { ...prev, state: SessionState.GENERATING_FOLLOWUPS };
      }
      const next = prev.currentQuestion + 1;
      const totalRounds = prev.rounds.length;
      if (next >= totalRounds) {
        return { ...prev, state: SessionState.ANALYZING, currentQuestion: next };
      }
      return { ...prev, state: SessionState.TTS_PLAYING, currentQuestion: next };
    });
  }, [updateRound]);

  const runAnalysis = useCallback(async (interpret: boolean) => {
    if (analysisRanRef.current) return;
    analysisRanRef.current = true;

    const rounds = roundsRef.current;
    const format = sessionFormatRef.current;
    const transcripts = rounds.map(r => r.transcript);
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
        .then(() => matchPatternEvidence(entryId))
        .then(() => { patternGenRef.current = null; })
        .catch(err => {
          console.error('[patterns] signal/evidence pipeline failed:', err);
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
      crisis_flag?: boolean;
    } = { themes: null, insight: null, mood_score: null, emotion_tag: null, activity_tags: null, summary: null, keyword_tags: null };

    try {
      const result = await analyzeSession(transcripts, format);
      analysis = result;
    } catch (err) {
      console.error('[runAnalysis] analysis failed, saving entry without analysis:', err);
    }

    setSession(prev => ({
      ...prev,
      state: SessionState.RESULT,
      themes: interpret ? analysis.themes : null,
      insight: interpret ? analysis.insight : null,
      completedAt,
      crisisFlag: analysis.crisis_flag === true,
    }));

    const savePayload: Parameters<typeof saveJournalEntry>[0] = {
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
      targetDate: targetDateRef.current,
      session_format: format,
    };

    if (format === 'branching') {
      savePayload.freeform_transcript = rounds[0]?.transcript ?? null;
      savePayload.followup_transcripts = rounds
        .filter(r => r.roundType === 'followup' && r.transcript)
        .map(r => ({ question: r.question, transcript: r.transcript! }));
    }

    const entryId = await saveJournalEntry(savePayload);

    trackEvent({ event: 'session_completed', duration_ms: durationMs });
    triggerPatterns(entryId);
  }, []);

  const resetSession = useCallback(() => {
    analysisRanRef.current = false;

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
      sessionFormat: 'structured',
      currentQuestion: 0,
      rounds: createInitialRounds(),
      followUpCount: 0,
      calendarEvents: null,
      themes: null,
      insight: null,
      startedAt: null,
      completedAt: null,
      recordingError: null,
      targetDate: null,
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
    submitTextEntry,
    runAnalysis,
    resetSession,
    clearRecordingError,
    patternGenRef,
    handleFollowupGeneration,
  };
}
