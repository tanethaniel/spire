import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { SessionState, type CalendarEvent } from './types/session';
import { useSession } from './hooks/useSession';
import { supabase } from './lib/supabase';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { SessionPage } from './pages/SessionPage';
import { ResultPage } from './pages/ResultPage';

function App() {
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const {
    session,
    setCalendarEvents,
    startSession,
    onTTSDone,
    startRecording,
    stopRecording,
    skipQuestion,
    runAnalysis,
  } = useSession();

  const handleStart = useCallback((events: CalendarEvent[] | null) => {
    if (events) setCalendarEvents(events);
    startSession();
  }, [setCalendarEvents, startSession]);

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
    return <HomePage onStart={handleStart} />;
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
      onStartRecording={startRecording}
      onStopRecording={stopRecording}
      onSkip={skipQuestion}
      onBack={handleBack}
      onTTSDone={onTTSDone}
    />
  );
}

export default App;
