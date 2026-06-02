import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { SessionState, type CalendarEvent } from './types/session';
import { useSession } from './hooks/useSession';
import { useMicPermission } from './hooks/useMicPermission';
import { supabase } from './lib/supabase';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { SessionPage } from './pages/SessionPage';
import { ResultPage } from './pages/ResultPage';
import { MicPermission } from './components/MicPermission';

function App() {
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    // Handle magic link callback — Supabase puts tokens in the URL hash
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthSession(session);
      setAuthLoading(false);
      // Clean up the URL hash after auth (removes #error=... or #access_token=...)
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const { status: micStatus, requestMic } = useMicPermission();
  const [showMicPrompt, setShowMicPrompt] = useState(false);

  const {
    session,
    micStream,
    setCalendarEvents,
    startSession,
    onTTSDone,
    startRecording,
    stopRecording,
    skipQuestion,
    runAnalysis,
  } = useSession();

  const handleStart = useCallback(async (events: CalendarEvent[] | null) => {
    if (events) setCalendarEvents(events);

    if (micStatus !== 'granted') {
      const granted = await requestMic();
      if (!granted) {
        setShowMicPrompt(true);
        return;
      }
    }

    startSession();
  }, [setCalendarEvents, startSession, micStatus, requestMic]);

  const handleDone = useCallback(() => {
    window.location.reload();
  }, []);

  const handleBack = useCallback(() => {
    window.location.reload();
  }, []);

  useEffect(() => {
    if (session.state === SessionState.ANALYZING) {
      runAnalysis();
    }
  }, [session.state, runAnalysis]);

  if (authLoading) {
    return (
      <div style={{ width: '100%', maxWidth: 430, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
          spire<span style={{ color: 'var(--accent-primary)' }}>.</span>
        </div>
      </div>
    );
  }

  if (!authSession) {
    return <LoginPage onLogin={() => {}} />;
  }

  if (session.state === SessionState.IDLE) {
    return (
      <>
        {showMicPrompt && (
          <MicPermission
            status={micStatus === 'denied' ? 'denied' : 'prompt'}
            onRequest={async () => {
              const granted = await requestMic();
              if (granted) {
                setShowMicPrompt(false);
                startSession();
              }
            }}
          />
        )}
        <HomePage onStart={handleStart} />
      </>
    );
  }

  if (session.state === SessionState.RESULT) {
    return (
      <ResultPage
        rounds={session.rounds}
        themes={session.themes}
        insight={session.insight}
        startedAt={session.startedAt}
        completedAt={session.completedAt}
        onDone={handleDone}
      />
    );
  }

  const currentRound = session.rounds[Math.min(session.currentQuestion, session.rounds.length - 1)];

  return (
    <SessionPage
      currentQuestion={session.currentQuestion}
      round={currentRound}
      state={session.state}
      micStream={micStream}
      onStartRecording={startRecording}
      onStopRecording={stopRecording}
      onSkip={skipQuestion}
      onBack={handleBack}
      onTTSDone={onTTSDone}
    />
  );
}

export default App;
