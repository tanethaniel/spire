import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { SessionState, type CalendarEvent } from './types/session';
import { useSession } from './hooks/useSession';
import { useMicPermission } from './hooks/useMicPermission';
import { useSettings } from './hooks/useSettings';
import { useEntries } from './hooks/useEntries';
import { supabase } from './lib/supabase';
import { cleanupStaleAudio } from './lib/audioDb';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { SessionPage } from './pages/SessionPage';
import { ResultPage } from './pages/ResultPage';
import { HistoryPage } from './pages/HistoryPage';
import { InsightsPage } from './pages/InsightsPage';
import { MicPermission } from './components/MicPermission';
import { BottomNav, type AppView } from './components/BottomNav';
import { SettingsSheet } from './components/SettingsSheet';

function App() {
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<AppView>('home');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Clean up any orphaned voice recordings left from failed transcription sessions
  useEffect(() => { cleanupStaleAudio(); }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthSession(session);
      setAuthLoading(false);
      if (session?.provider_token) {
        localStorage.setItem('google_provider_token', session.provider_token);
      }
      if (session?.provider_refresh_token) {
        localStorage.setItem('google_refresh_token', session.provider_refresh_token);
      }
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session);
      if (session?.provider_token) {
        localStorage.setItem('google_provider_token', session.provider_token);
      }
      if (session?.provider_refresh_token) {
        localStorage.setItem('google_refresh_token', session.provider_refresh_token);
      }
      if (!session) {
        localStorage.removeItem('google_provider_token');
        localStorage.removeItem('google_refresh_token');
      }
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const authed = !!authSession;
  const { status: micStatus, requestMic } = useMicPermission();
  const [showMicPrompt, setShowMicPrompt] = useState(false);
  const { interpretationEnabled, setInterpretationEnabled } = useSettings(authed);
  const { entries, loading: entriesLoading, error: entriesError, refresh: refreshEntries } = useEntries(authed);

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
    resetSession,
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
    resetSession();
    refreshEntries();
    setView('home');
  }, [resetSession, refreshEntries]);

  const handleBack = useCallback(() => {
    resetSession();
    setView('home');
  }, [resetSession]);

  // Insights is hidden in Log mode; fall back to Home without storing a bad view.
  const effectiveView: AppView =
    !interpretationEnabled && view === 'insights' ? 'home' : view;

  useEffect(() => {
    if (session.state === SessionState.ANALYZING) {
      runAnalysis(interpretationEnabled);
    }
  }, [session.state, runAnalysis, interpretationEnabled]);

  if (authLoading) {
    return (
      <div style={{ width: '100%', maxWidth: 430, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>
          spire<span style={{ color: 'var(--accent-primary)' }}>.</span>
        </div>
      </div>
    );
  }

  if (!authSession) {
    return <LoginPage />;
  }

  if (session.state === SessionState.RESULT) {
    return (
      <ResultPage
        rounds={session.rounds}
        themes={session.themes}
        insight={session.insight}
        startedAt={session.startedAt}
        completedAt={session.completedAt}
        interpretationEnabled={interpretationEnabled}
        onDone={handleDone}
      />
    );
  }

  // Active session (TTS / recording / transcribing / analyzing): full-screen flow.
  if (session.state !== SessionState.IDLE) {
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

  // IDLE: tabbed shell with bottom navigation.
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
      {settingsOpen && (
        <SettingsSheet
          interpretationEnabled={interpretationEnabled}
          onToggle={setInterpretationEnabled}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <div style={shell.root}>
        <div style={shell.viewport}>
          {effectiveView === 'home' && (
            <HomePage onStart={handleStart} onOpenSettings={() => setSettingsOpen(true)} />
          )}
          {effectiveView === 'history' && (
            <HistoryPage
              entries={entries}
              loading={entriesLoading}
              error={entriesError}
              interpretationEnabled={interpretationEnabled}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}
          {effectiveView === 'insights' && (
            <InsightsPage
              entries={entries}
              loading={entriesLoading}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}
        </div>
        <BottomNav view={effectiveView} onChange={setView} showInsights={interpretationEnabled} />
      </div>
    </>
  );
}

const shell: Record<string, React.CSSProperties> = {
  root: {
    width: '100%',
    maxWidth: 430,
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
  },
};

export default App;
