import { useCallback, useEffect, useRef, useState } from 'react';
import { SessionState, type QuestionRound } from '../types/session';
import { ProgressBar } from '../components/ProgressBar';
import { RecordButton } from '../components/RecordButton';

interface SessionPageProps {
  currentQuestion: number;
  round: QuestionRound;
  state: SessionState;
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
  onStartRecording,
  onStopRecording,
  onSkip,
  onBack,
  onTTSDone,
}: SessionPageProps) {
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [showShortWarning, setShowShortWarning] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isRecording = state === SessionState.RECORDING;
  const isTranscribing = state === SessionState.BACKGROUND_TRANSCRIBING;
  const buttonDisabled = ttsPlaying || isTranscribing;

  // Speak each question using browser TTS, falling back to static MP3 if available
  useEffect(() => {
    if (state !== SessionState.TTS_PLAYING) return;

    // Try static MP3 first (ElevenLabs pre-generated), fall back to browser speech
    const audioFile = currentQuestion > 0 ? `/audio/q${currentQuestion + 1}.mp3` : null;

    if (audioFile) {
      const audio = new Audio(audioFile);
      audioRef.current = audio;
      audio.play().then(() => {
        setTtsPlaying(true);
        audio.onended = () => { setTtsPlaying(false); onTTSDone(); };
      }).catch(() => speakWithBrowser(round.question));
    } else {
      speakWithBrowser(round.question);
    }

    function speakWithBrowser(text: string) {
      if (!window.speechSynthesis) { onTTSDone(); return; }
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate = 0.92;
      utt.pitch = 1;
      utt.volume = 1;
      setTtsPlaying(true);
      utt.onend = () => { setTtsPlaying(false); onTTSDone(); };
      utt.onerror = () => { setTtsPlaying(false); onTTSDone(); };
      window.speechSynthesis.speak(utt);
    }

    return () => {
      audioRef.current?.pause();
      window.speechSynthesis?.cancel();
    };
  }, [currentQuestion, state, onTTSDone, round.question]);

  const handleStart = useCallback(() => {
    setShowShortWarning(false);
    onStartRecording();
  }, [onStartRecording]);

  const handleStop = useCallback(() => {
    onStopRecording();
  }, [onStopRecording]);

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
          ) : isTranscribing ? (
            <span style={{ color: 'var(--accent-primary)' }}>✓ Saved — transcribing in background</span>
          ) : showShortWarning ? (
            <span style={{ color: 'var(--error)' }}>That was quick — hold longer to record</span>
          ) : (
            <span>Hold the button to answer</span>
          )}
        </div>
      </div>

      <div style={styles.recordArea}>
        <div style={styles.recordHint}>Hold to record · Release to stop</div>
        <RecordButton
          disabled={buttonDisabled}
          recording={isRecording}
          onStart={handleStart}
          onStop={handleStop}
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
    background: 'var(--bg-base)',
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
    border: '1px solid var(--border-subtle)',
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
    marginBottom: 24,
  },
  transcriptArea: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 14,
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
  recordHint: {
    fontSize: 12,
    color: 'var(--text-ghost)',
    letterSpacing: '0.04em',
  },
  skipQ: {
    fontSize: 13,
    color: '#3A3A48',
    background: 'none',
    border: 'none',
    padding: '10px 16px',
    minHeight: 44,
  },
};
