import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { SessionState, type CalendarEvent, type SessionFormat } from './types/session';
import { useSession } from './hooks/useSession';
import { useMicPermission } from './hooks/useMicPermission';
import { useSettings } from './hooks/useSettings';
import { usePatternNotes } from './hooks/usePatternNotes';
import { useEntries } from './hooks/useEntries';
import { supabase } from './lib/supabase';
import { deleteJournalEntry, matchPatternEvidence } from './lib/api';
import { cleanupStaleAudio } from './lib/audioDb';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { SessionPage } from './pages/SessionPage';
import { HistoryPage } from './pages/HistoryPage';
import { InsightsPage } from './pages/InsightsPage';
import { MicPermission } from './components/MicPermission';
import { BottomNav, type AppView } from './components/BottomNav';
import { ProfileSheet } from './components/ProfileSheet';
import { CompletionScreen } from './components/CompletionScreen';
import { Tooltip, useTooltipSeen } from './components/Tooltip';
import { OnboardingFlow } from './components/OnboardingFlow';
import { ErrorBoundary } from './components/ErrorBoundary';
import { dayKey, currentStreak } from './lib/stats';
import { CrisisBanner } from './components/CrisisBanner';

function App() {
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<AppView>('home');
  const [profileOpen, setProfileOpen] = useState(false);
  const [showCrisisBanner, setShowCrisisBanner] = useState(false);

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

  // Sign out when the global auth error handler detects an unrecoverable 401
  useEffect(() => {
    const handleAuthExpired = () => { supabase.auth.signOut(); };
    window.addEventListener('spire:auth-expired', handleAuthExpired);
    return () => window.removeEventListener('spire:auth-expired', handleAuthExpired);
  }, []);

  const authed = !!authSession;
  const { status: micStatus, requestMic } = useMicPermission();
  const [showMicPrompt, setShowMicPrompt] = useState(false);
  const { interpretationEnabled, setInterpretationEnabled, mbti, setMbti, onboardingCompleted, completeOnboarding, goals, loaded: settingsLoaded } = useSettings(authed);
  const { entries, loading: entriesLoading, error: entriesError, refresh: refreshEntries } = useEntries(authed);
  const { patterns, savedCount, loading: patternsLoading, lastError: patternsError, clearError: clearPatternsError, update: updatePatterns, submitFeedback, toggleSave, dismiss, markSeen, triggerTrickle } = usePatternNotes(authed, interpretationEnabled);
  const [tabsSeen, markTabsSeen] = useTooltipSeen('tabs');

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
    submitTextEntry,
    runAnalysis,
    resetSession,
    clearRecordingError,
    patternGenRef,
    handleFollowupGeneration,
  } = useSession();

  const pendingStartRef = useRef<{ events: CalendarEvent[] | null; targetDate: string | null; format: SessionFormat } | null>(null);

  const handleStart = useCallback(async (events: CalendarEvent[] | null, targetDate: string | null = null, format: SessionFormat = 'structured') => {
    const isYesterday = !!targetDate;
    if (events) setCalendarEvents(events, isYesterday);

    if (micStatus !== 'granted') {
      pendingStartRef.current = { events, targetDate, format };
      const granted = await requestMic();
      if (!granted) {
        setShowMicPrompt(true);
        return;
      }
    }

    startSession(targetDate, format);
  }, [setCalendarEvents, startSession, micStatus, requestMic]);

  const handleSessionComplete = useCallback(() => {
    if (session.crisisFlag) setShowCrisisBanner(true);
    resetSession();
    refreshEntries();
    setView('history');
    const pending = patternGenRef.current;
    if (pending) {
      pending.then(() => triggerTrickle()).catch(() => triggerTrickle());
    } else {
      triggerTrickle();
    }
  }, [session.crisisFlag, resetSession, refreshEntries, triggerTrickle, patternGenRef]);

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
    if (session.state === SessionState.GENERATING_FOLLOWUPS) {
      handleFollowupGeneration();
    }
    if (session.state === SessionState.ANALYZING) {
      if (micStream) {
        micStream.getTracks().forEach(t => t.stop());
      }
      runAnalysis(interpretationEnabled);
    }
  }, [session.state, interpretationEnabled, runAnalysis, micStream, handleFollowupGeneration]);

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

  if (session.state === SessionState.RESULT || session.state === SessionState.ANALYZING) {
    return (
      <CompletionScreen
        streak={profileStats.streak + 1}
        onComplete={handleSessionComplete}
      />
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
        sessionFormat={session.sessionFormat}
        totalRounds={session.rounds.length}
        onStartRecording={startRecording}
        onStopRecording={stopRecording}
        onSkip={skipQuestion}
        onBack={handleBack}
        onTTSDone={onTTSDone}
        onClearRecordingError={clearRecordingError}
        onSubmitText={submitTextEntry}
        micDenied={micStatus === 'denied'}
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
              startSession(pendingStartRef.current?.targetDate, pendingStartRef.current?.format ?? 'structured');
              pendingStartRef.current = null;
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
          {showCrisisBanner && (
            <div style={{ padding: '16px 24px 0' }}>
              <CrisisBanner onDismiss={() => setShowCrisisBanner(false)} />
            </div>
          )}
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
              savedCount={savedCount}
              patternsLoading={patternsLoading}
              onUpdatePatterns={updatePatterns}
              onPatternFeedback={submitFeedback}
              onPatternSave={(id) => toggleSave(id)}
              onPatternDismiss={(id) => dismiss(id)}
              onPatternMarkSeen={(id) => markSeen(id)}
              patternsError={patternsError}
              onClearPatternsError={clearPatternsError}
            />
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <Tooltip
            visible={!tabsSeen && onboardingCompleted}
            onDismiss={markTabsSeen}
            text={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><strong>Reflect</strong> — Record your thoughts</div>
                <div><strong>Review</strong> — See patterns & insights</div>
                <div><strong>Receipts</strong> — Your past entries</div>
              </div>
            }
            style={{ position: 'absolute', bottom: '100%', left: 16, right: 16, marginBottom: 8, zIndex: 60 }}
          />
          <BottomNav view={effectiveView} onChange={setView} />
        </div>
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

function AppWithBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithBoundary;
