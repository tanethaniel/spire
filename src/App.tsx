import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { SessionState, type CalendarEvent } from './types/session';
import { useSession } from './hooks/useSession';
import { useMicPermission } from './hooks/useMicPermission';
import { useSettings } from './hooks/useSettings';
import { usePatternNotes } from './hooks/usePatternNotes';
import { useEntries } from './hooks/useEntries';
import { supabase } from './lib/supabase';
import { deleteJournalEntry } from './lib/api';
import { cleanupStaleAudio } from './lib/audioDb';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { SessionPage } from './pages/SessionPage';
import { ResultPage } from './pages/ResultPage';
import { HistoryPage } from './pages/HistoryPage';
import { InsightsPage } from './pages/InsightsPage';
import { MicPermission } from './components/MicPermission';
import { BottomNav, type AppView } from './components/BottomNav';
import { ProfileSheet } from './components/ProfileSheet';
import { OnboardingFlow } from './components/OnboardingFlow';
import { dayKey, currentStreak, getStreakMilestone } from './lib/stats';

function App() {
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<AppView>('home');
  const [profileOpen, setProfileOpen] = useState(false);

  // Clean up any orphaned voice recordings left from failed transcription sessions
  useEffect(() => { cleanupStaleAudio(); }, []);

  // Extract Google refresh token from the OAuth redirect hash. The access token
  // is handled by Supabase's session; the refresh token is stored in sessionStorage
  // (tab-scoped, cleared on close) so the edge function can refresh expired tokens.
  useEffect(() => {
    if (window.location.hash) {
      const params = new URLSearchParams(window.location.hash.substring(1));
      const prt = params.get('provider_refresh_token');
      if (prt) sessionStorage.setItem('google_refresh_token', prt);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.provider_refresh_token) {
        sessionStorage.setItem('google_refresh_token', session.provider_refresh_token);
      }
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
      setAuthSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.provider_refresh_token) {
        sessionStorage.setItem('google_refresh_token', session.provider_refresh_token);
      }
      if (!session) {
        sessionStorage.removeItem('google_refresh_token');
      }
      setAuthSession(session);
      if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const authed = !!authSession;
  const { status: micStatus, requestMic } = useMicPermission();
  const [showMicPrompt, setShowMicPrompt] = useState(false);
  const { interpretationEnabled, setInterpretationEnabled, mbti, setMbti, onboardingCompleted, completeOnboarding, goals, loaded: settingsLoaded } = useSettings(authed);
  const { entries, loading: entriesLoading, error: entriesError, refresh: refreshEntries } = useEntries(authed);
  const { patterns, loading: patternsLoading, refreshing: patternsRefreshing, refresh: refreshPatterns, submitFeedback, setStatus } = usePatternNotes(authed, interpretationEnabled);

  const profileUser = authSession ? {
    name: authSession.user.user_metadata?.full_name ?? authSession.user.email ?? '',
    avatarUrl: (authSession.user.user_metadata?.avatar_url as string | undefined) ?? null,
    email: authSession.user.email ?? '',
    createdAt: authSession.user.created_at,
  } : null;

  const profileStats = {
    streak: currentStreak(new Set(entries.filter(e => e.transcripts.some(Boolean)).map(e => dayKey(new Date(e.createdAt))))),
    totalSessions: entries.filter(e => e.transcripts.some(Boolean)).length,
  };

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
    clearRecordingError,
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
    // Pattern generation runs in background after session save;
    // delay the fetch so new patterns are ready when we read them.
    setTimeout(refreshPatterns, 5000);
  }, [resetSession, refreshEntries, refreshPatterns]);

  const handleBack = useCallback(() => {
    resetSession();
    setView('home');
  }, [resetSession]);

  const handleDeleteEntry = useCallback(async (id: string) => {
    await deleteJournalEntry(id);
    refreshEntries();
  }, [refreshEntries]);

  const effectiveView: AppView = view;

  useEffect(() => {
    if (session.state === SessionState.ANALYZING) {
      runAnalysis(interpretationEnabled);
    }
  }, [session.state, interpretationEnabled, runAnalysis]);

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

  if (settingsLoaded && !onboardingCompleted) {
    return (
      <OnboardingFlow
        onComplete={(selectedGoals, selectedMbti, interpretEnabled) => completeOnboarding(selectedGoals, selectedMbti, interpretEnabled)}
        onSkip={() => completeOnboarding([], null, interpretationEnabled)}
        interpretationEnabled={interpretationEnabled}
      />
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
        interpretationEnabled={interpretationEnabled}
        streak={profileStats.streak + 1}
        onDone={handleDone}
      />
    );
  }

  // Analyzing: show a dedicated loading screen instead of the last question
  if (session.state === SessionState.ANALYZING) {
    return (
      <div style={{ width: '100%', maxWidth: 430, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '0 32px' }}>
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          <circle cx="18" cy="18" r="15" stroke="var(--accent-primary)" strokeWidth="1.5" strokeDasharray="94" strokeDashoffset="0" style={{ animation: 'spin 1.2s linear infinite', transformOrigin: 'center' }} />
        </svg>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.3, textAlign: 'center' as const }}>Reflecting on your session…</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', textAlign: 'center' as const }}>This takes a moment</div>
      </div>
    );
  }

  // Active session (TTS / recording / transcribing): full-screen flow.
  if (session.state !== SessionState.IDLE) {
    const currentRound = session.rounds[Math.min(session.currentQuestion, session.rounds.length - 1)];
    return (
      <SessionPage
        currentQuestion={session.currentQuestion}
        round={currentRound}
        state={session.state}
        micStream={micStream}
        calendarEvents={session.calendarEvents}
        recordingError={session.recordingError ?? null}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onSkip={skipQuestion}
        onBack={handleBack}
        onTTSDone={onTTSDone}
        onClearRecordingError={clearRecordingError}
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
      {profileOpen && profileUser && (
        <ProfileSheet
          user={profileUser}
          stats={profileStats}
          interpretationEnabled={interpretationEnabled}
          onToggle={setInterpretationEnabled}
          mbti={mbti}
          onMbtiChange={setMbti}
          goals={goals}
          onClose={() => setProfileOpen(false)}
        />
      )}

      <div style={shell.root}>
        <div style={shell.viewport}>
          {effectiveView === 'home' && (
            <HomePage onStart={handleStart} onOpenProfile={() => setProfileOpen(true)} avatarUrl={profileUser?.avatarUrl ?? null} userName={profileUser?.name ?? ''} />
          )}
          {effectiveView === 'history' && (
            <HistoryPage
              entries={entries}
              loading={entriesLoading}
              error={entriesError}
              visible={effectiveView === 'history'}
              onOpenProfile={() => setProfileOpen(true)}
              avatarUrl={profileUser?.avatarUrl ?? null}
              userName={profileUser?.name ?? ''}
              onDeleteEntry={handleDeleteEntry}
            />
          )}
          {effectiveView === 'insights' && (
            <InsightsPage
              entries={entries}
              loading={entriesLoading}
              onOpenProfile={() => setProfileOpen(true)}
              avatarUrl={profileUser?.avatarUrl ?? null}
              userName={profileUser?.name ?? ''}
              mbti={mbti}
              interpretationEnabled={interpretationEnabled}
              patterns={patterns}
              patternsLoading={patternsLoading}
              patternsRefreshing={patternsRefreshing}
              onRefreshPatterns={refreshPatterns}
              onPatternFeedback={submitFeedback}
              onPatternSave={(id) => setStatus(id, 'saved')}
              onPatternDismiss={(id) => setStatus(id, 'dismissed')}
            />
          )}
        </div>
        <BottomNav view={effectiveView} onChange={setView} />
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
