import { useCallback, useEffect, useRef, useState } from 'react';
import { SessionState, QUESTIONS, type CalendarEvent, type QuestionRound, getQ1Categories } from '../types/session';
import { useTTS } from '../hooks/useTTS';
import { ProgressBar } from '../components/ProgressBar';
import { RecordButton } from '../components/RecordButton';
import { AudioWaveform } from '../components/AudioWaveform';

interface SessionPageProps {
  currentQuestion: number;
  round: QuestionRound;
  state: SessionState;
  micStream: MediaStream | null;
  calendarEvents: CalendarEvent[] | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onSkip: () => void;
  onBack: () => void;
  onTTSDone: () => void;
}

export function SessionPage({
  currentQuestion,
  round,
  state,
  micStream,
  calendarEvents,
  onStartRecording,
  onStopRecording,
  onSkip,
  onBack,
  onTTSDone,
}: SessionPageProps) {
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [showShortWarning, setShowShortWarning] = useState(false);
  const [locked, setLocked] = useState(false);
  const { speak, cancel: cancelTTS, prefetch } = useTTS();
  const ttsTriggeredRef = useRef(-1);

  const isRecording = state === SessionState.RECORDING;
  const isTranscribing = state === SessionState.BACKGROUND_TRANSCRIBING;
  const buttonDisabled = ttsPlaying || isTranscribing;

  // Reset lock state when recording stops
  useEffect(() => {
    if (!isRecording) setLocked(false);
  }, [isRecording]);

  // Play the question audio when entering TTS_PLAYING state
  useEffect(() => {
    if (state !== SessionState.TTS_PLAYING) return;
    if (ttsTriggeredRef.current === currentQuestion) return;
    ttsTriggeredRef.current = currentQuestion;

    setTtsPlaying(true);
    speak(round.question, currentQuestion, () => {
      setTtsPlaying(false);
      onTTSDone();
    }, round.toneInstruction);

    // Pre-fetch next question's audio while this one plays
    const next = currentQuestion + 1;
    if (next < QUESTIONS.length) {
      prefetch(QUESTIONS[next].question, next, QUESTIONS[next].toneInstruction);
    }

    return () => {
      cancelTTS();
    };
  }, [currentQuestion, state, onTTSDone, round.question, round.toneInstruction, speak, cancelTTS, prefetch]);

  const handleStart = useCallback(() => {
    setShowShortWarning(false);
    onStartRecording();
  }, [onStartRecording]);

  const handleStop = useCallback(() => {
    setLocked(false);
    onStopRecording();
  }, [onStopRecording]);

  const handleLock = useCallback(() => {
    setLocked(true);
  }, []);

  // Transition screen between questions
  if (isTranscribing) {
    return (
      <div style={styles.page}>
        <ProgressBar currentQuestion={currentQuestion} onBack={onBack} />
        <div style={styles.transitionScreen}>
          <div style={styles.transitionIcon}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" stroke="var(--accent-primary)" strokeWidth="1.5" strokeDasharray="88" strokeDashoffset="0" style={{ animation: 'spin 1.2s linear infinite', transformOrigin: 'center' }} />
              <path d="M10 16.5L14 20.5L22 12" stroke="var(--accent-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={styles.transitionTitle}>Saving your answer…</div>
          <div style={styles.transitionSub}>Transcribing in the background</div>
          {round.transcript && (
            <div style={styles.transitionTranscript}>{round.transcript}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <ProgressBar currentQuestion={currentQuestion} onBack={onBack} />

      <div style={styles.questionArea}>
        {ttsPlaying && (
          <div style={styles.speakingBadge}>
            <div style={styles.speakingWave}>
              {[8, 14, 10, 16, 8].map((h, i) => (
                <div key={i} style={{ ...styles.waveBar, height: h, animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
            Spire is speaking…
          </div>
        )}

        <div style={styles.qNumber}>Q{currentQuestion + 1}</div>
        <div style={styles.qText}>{round.question}</div>
        <div style={styles.qSub}>{round.subPrompt}</div>

        {currentQuestion === 0 && (() => {
          const cats = getQ1Categories(calendarEvents);
          if (cats.length === 0) return null;
          return (
            <div style={styles.categoryChips}>
              <span style={styles.includesLabel}>Includes:</span>
              {cats.map((label, i) => (
                <span key={i} style={styles.categoryChip}>{label}</span>
              ))}
            </div>
          );
        })()}

        <div style={styles.transcriptArea}>
          <div style={{
            ...styles.transcriptText,
            ...(round.transcript ? styles.transcriptActive : {}),
          }}>
            {round.transcript || 'Your words will appear here…'}
          </div>
        </div>

        <div style={{
          ...styles.statusLine,
          ...(isRecording ? { color: 'var(--error)' } : {}),
        }}>
          {isRecording ? (
            <>
              <div style={styles.recDot} />
              <span>Recording…</span>
            </>
          ) : showShortWarning ? (
            <span style={{ color: 'var(--error)' }}>That was quick — hold longer to record</span>
          ) : (
            <span>Hold the button to answer</span>
          )}
        </div>
      </div>

      <div style={styles.recordArea}>
        <AudioWaveform active={isRecording} stream={micStream} />
        <RecordButton
          disabled={buttonDisabled}
          recording={isRecording}
          locked={locked}
          onStart={handleStart}
          onStop={handleStop}
          onLock={handleLock}
        />
        <button onClick={onSkip} style={styles.skipQ}>
          Skip this question
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    maxWidth: 430,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  questionArea: {
    padding: '8px 24px 24px',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  speakingBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--bg-elevated)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderRadius: 20,
    padding: '5px 10px 5px 8px',
    marginBottom: 20,
    fontSize: 12,
    color: 'var(--text-ghost)',
    alignSelf: 'flex-start',
  },
  speakingWave: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  waveBar: {
    width: 2,
    borderRadius: 2,
    background: 'var(--accent-primary)',
    animation: 'wave 0.8s ease-in-out infinite',
  },
  qNumber: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--accent-primary)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    marginBottom: 10,
  },
  qText: {
    fontSize: 26,
    fontWeight: 600,
    lineHeight: 1.25,
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  qSub: {
    fontSize: 15,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    marginBottom: 12,
  },
  categoryChips: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  includesLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-ghost)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    marginRight: 2,
  },
  categoryChip: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    background: 'rgba(255,255,255,0.2)',
    border: '1px solid var(--border-glass)',
    borderRadius: 12,
    padding: '3px 10px',
  },
  transcriptArea: {
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 14,
    boxShadow: 'var(--glass-shadow)',
    padding: '14px 16px',
    minHeight: 80,
    marginBottom: 16,
    flex: 1,
    maxHeight: 180,
    overflowY: 'auto' as const,
  },
  transcriptText: {
    fontSize: 15,
    color: 'var(--text-ghost)',
    lineHeight: 1.6,
    fontStyle: 'italic',
  },
  transcriptActive: {
    color: 'var(--text-secondary)',
    fontStyle: 'normal',
  },
  statusLine: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontSize: 13,
    color: 'var(--text-muted)',
    marginBottom: 8,
    height: 20,
    transition: 'all 0.3s',
  },
  recDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--error)',
    animation: 'recpulse 1s infinite',
  },
  recordArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 48,
    marginTop: 'auto',
  },
  skipQ: {
    fontSize: 13,
    color: 'var(--text-ghost)',
    background: 'none',
    border: 'none',
    padding: '10px 16px',
    minHeight: 44,
  },
  // Transition screen
  transitionScreen: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 32px 80px',
    gap: 12,
  },
  transitionIcon: {
    marginBottom: 8,
  },
  transitionTitle: {
    fontSize: 22,
    fontWeight: 600,
    letterSpacing: -0.3,
    textAlign: 'center' as const,
  },
  transitionSub: {
    fontSize: 15,
    color: 'var(--text-muted)',
    textAlign: 'center' as const,
  },
  transitionTranscript: {
    marginTop: 24,
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 14,
    boxShadow: 'var(--glass-shadow)',
    padding: '14px 16px',
    fontSize: 15,
    color: 'var(--text-secondary)',
    lineHeight: 1.6,
    width: '100%',
    maxHeight: 160,
    overflowY: 'auto' as const,
  },
};
