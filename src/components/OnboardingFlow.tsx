import { useCallback, useState } from 'react';
import { PrivacyBullet } from './PrivacyBullet';

interface OnboardingFlowProps {
  onComplete: (goal: string | null, mbti: string | null) => void;
  onSkip: () => void;
}

const GOALS = [
  'Understand my patterns',
  'Track my mood',
  'Remember my days',
  'Build a journaling habit',
  'Personal growth',
];

const MBTI_PAIRS: [string, string][] = [
  ['E', 'I'],
  ['S', 'N'],
  ['T', 'F'],
  ['J', 'P'],
];

const PRIVACY_ITEMS = [
  {
    icon: '\u{1F399}',
    title: 'Your audio is transcribed, then immediately deleted.',
    detail: 'We use OpenAI Whisper to convert speech to text. Audio files are deleted from servers right after transcription. We never store recordings.',
  },
  {
    icon: '\u{1F512}',
    title: 'Your words are stored privately and encrypted.',
    detail: 'Journal entries are stored in your personal account with row-level security. Only you can access them.',
  },
  {
    icon: '\u{1F4C5}',
    title: 'We read your calendar to personalize questions.',
    detail: 'Spire uses read-only access to today\'s Google Calendar events to ask better first questions. We never modify your calendar.',
  },
  {
    icon: '\u{2728}',
    title: 'Themes and insights are generated privately.',
    detail: 'When interpretation is enabled, your transcripts are analyzed by AI to surface patterns. This data is never shared or used for training.',
  },
];

export function OnboardingFlow({ onComplete, onSkip }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [mbtiLetters, setMbtiLetters] = useState<[string, string, string, string] | null>(null);

  const next = useCallback(() => setStep(s => Math.min(s + 1, 3)), []);

  const toggleMbtiLetter = useCallback((pairIndex: number, letter: string) => {
    setMbtiLetters(prev => {
      const base: [string, string, string, string] = prev ?? ['E', 'S', 'T', 'J'];
      const next = [...base] as [string, string, string, string];
      next[pairIndex] = letter;
      return next;
    });
  }, []);

  const handleFinish = useCallback(() => {
    const mbtiString = mbtiLetters ? mbtiLetters.join('') : null;
    onComplete(selectedGoal, mbtiString);
  }, [selectedGoal, mbtiLetters, onComplete]);

  return (
    <div style={styles.container}>
      {/* Progress dots */}
      <div style={styles.dotsRow}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            ...styles.dot,
            ...(i === step ? styles.dotActive : {}),
            ...(i < step ? styles.dotDone : {}),
          }} />
        ))}
      </div>

      {/* Skip */}
      <button style={styles.skip} onClick={onSkip}>Skip</button>

      {/* Screen content */}
      <div style={styles.content}>
        {step === 0 && <WelcomeScreen onNext={next} />}
        {step === 1 && <HowItWorksScreen onNext={next} />}
        {step === 2 && <PrivacyScreen onNext={next} />}
        {step === 3 && (
          <PersonalizeScreen
            selectedGoal={selectedGoal}
            onSelectGoal={setSelectedGoal}
            mbtiLetters={mbtiLetters}
            onToggleMbti={toggleMbtiLetter}
            onFinish={handleFinish}
          />
        )}
      </div>
    </div>
  );
}

function WelcomeScreen({ onNext }: { onNext: () => void }) {
  return (
    <div style={styles.screen}>
      <div style={styles.welcomeTop}>
        <div style={styles.logo}>
          spire<span style={{ color: 'var(--accent-primary)' }}>.</span>
        </div>
        <div style={styles.tagline}>Your daily reflection, in your own voice.</div>
      </div>
      <button style={styles.cta} onClick={onNext}>Get started</button>
    </div>
  );
}

function HowItWorksScreen({ onNext }: { onNext: () => void }) {
  return (
    <div style={styles.screen}>
      <div style={styles.sectionTitle}>How it works</div>
      <div style={styles.demoContainer}>
        <div style={styles.demoStep}>
          <div style={{ ...styles.demoIcon, animationDelay: '0s' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M8 22V10a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H10a2 2 0 01-2-2z" stroke="var(--accent-primary)" strokeWidth="1.5" />
              <path d="M12 14h8M12 18h5" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div style={styles.demoText}>
            <div style={styles.demoLabel}>Listen</div>
            <div style={styles.demoSub}>Spire asks you a question</div>
          </div>
        </div>
        <div style={styles.demoStep}>
          <div style={{ ...styles.demoIcon, animationDelay: '0.15s' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="13" y="6" width="6" height="14" rx="3" stroke="var(--accent-primary)" strokeWidth="1.5" />
              <path d="M10 17a6 6 0 0012 0" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M16 23v3" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <div style={styles.demoText}>
            <div style={styles.demoLabel}>Reflect</div>
            <div style={styles.demoSub}>Speak your answer</div>
          </div>
        </div>
        <div style={styles.demoStep}>
          <div style={{ ...styles.demoIcon, animationDelay: '0.3s' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="10" stroke="var(--accent-primary)" strokeWidth="1.5" />
              <path d="M12 16l3 3 5-6" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={styles.demoText}>
            <div style={styles.demoLabel}>Discover</div>
            <div style={styles.demoSub}>See themes and insights</div>
          </div>
        </div>
      </div>
      <div style={styles.demoNote}>6 questions. ~5 minutes. Your voice, your story.</div>
      <button style={styles.cta} onClick={onNext}>Next</button>
    </div>
  );
}

function PrivacyScreen({ onNext }: { onNext: () => void }) {
  return (
    <div style={styles.screen}>
      <div style={styles.sectionTitle}>Your reflections stay private.</div>
      <div style={styles.privacyList}>
        {PRIVACY_ITEMS.map((item, i) => (
          <PrivacyBullet key={i} icon={item.icon} title={item.title} detail={item.detail} />
        ))}
      </div>
      <button style={styles.cta} onClick={onNext}>I understand</button>
    </div>
  );
}

function PersonalizeScreen({
  selectedGoal,
  onSelectGoal,
  mbtiLetters,
  onToggleMbti,
  onFinish,
}: {
  selectedGoal: string | null;
  onSelectGoal: (g: string) => void;
  mbtiLetters: [string, string, string, string] | null;
  onToggleMbti: (i: number, l: string) => void;
  onFinish: () => void;
}) {
  const hasMbti = mbtiLetters !== null;

  return (
    <div style={styles.screen}>
      {/* Goal */}
      <div style={styles.sectionTitle}>What brings you to Spire?</div>
      <div style={styles.goalGrid}>
        {GOALS.map(g => (
          <button
            key={g}
            style={{
              ...styles.goalPill,
              ...(selectedGoal === g ? styles.goalPillActive : {}),
            }}
            onClick={() => onSelectGoal(g)}
          >
            {g}
          </button>
        ))}
      </div>

      {/* MBTI */}
      <div style={styles.mbtiBlock}>
        <div style={styles.mbtiHeader}>
          <span style={styles.mbtiTitle}>Know your personality type?</span>
          <span style={styles.mbtiOptional}>Optional</span>
        </div>
        <div style={styles.mbtiGrid}>
          {MBTI_PAIRS.map(([a, b], i) => {
            const selected = mbtiLetters?.[i];
            return (
              <div key={i} style={styles.mbtiPair}>
                <button
                  style={{
                    ...styles.mbtiBtn,
                    ...(hasMbti && selected === a ? styles.mbtiBtnActive : {}),
                  }}
                  onClick={() => onToggleMbti(i, a)}
                >
                  {a}
                </button>
                <button
                  style={{
                    ...styles.mbtiBtn,
                    ...(hasMbti && selected === b ? styles.mbtiBtnActive : {}),
                  }}
                  onClick={() => onToggleMbti(i, b)}
                >
                  {b}
                </button>
              </div>
            );
          })}
        </div>
        <div style={styles.mbtiHint}>You can change this anytime in your profile.</div>
      </div>

      <button style={styles.cta} onClick={onFinish}>Start reflecting</button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    maxWidth: 430,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    padding: '0 24px',
  },
  dotsRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 20,
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.25)',
    transition: 'all 0.3s',
  },
  dotActive: {
    background: 'var(--accent-primary)',
    transform: 'scale(1.25)',
  },
  dotDone: {
    background: 'var(--accent-soft)',
  },
  skip: {
    position: 'absolute' as const,
    top: 18,
    right: 24,
    background: 'none',
    border: 'none',
    fontSize: 14,
    color: 'var(--text-ghost)',
    cursor: 'pointer',
    padding: '4px 8px',
    zIndex: 10,
  },
  content: {
    flex: 1,
    display: 'flex',
  },
  screen: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 32,
    paddingBottom: 40,
    animation: 'fadeIn 0.3s ease',
  },
  // Welcome
  welcomeTop: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  logo: {
    fontSize: 48,
    fontWeight: 700,
    letterSpacing: -1.5,
  },
  tagline: {
    fontSize: 17,
    color: 'var(--text-muted)',
    textAlign: 'center' as const,
    lineHeight: 1.5,
  },
  // How it works
  sectionTitle: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: -0.3,
    marginBottom: 24,
  },
  demoContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
    flex: 1,
    justifyContent: 'center',
  },
  demoStep: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 16,
    boxShadow: 'var(--glass-shadow)',
    padding: '16px 18px',
  },
  demoIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    background: 'rgba(107,191,168,0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    animation: 'slideUp 0.5s ease both',
  },
  demoText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  demoLabel: {
    fontSize: 16,
    fontWeight: 700,
  },
  demoSub: {
    fontSize: 13,
    color: 'var(--text-muted)',
  },
  demoNote: {
    fontSize: 14,
    color: 'var(--text-muted)',
    textAlign: 'center' as const,
    marginTop: 16,
    marginBottom: 8,
  },
  // Privacy
  privacyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    flex: 1,
  },
  // Personalize — goals
  goalGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
    marginBottom: 28,
  },
  goalPill: {
    padding: '10px 16px',
    borderRadius: 20,
    background: 'rgba(255,255,255,0.1)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.2)',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  goalPillActive: {
    background: 'rgba(107,191,168,0.3)',
    borderColor: 'var(--accent-primary)',
    color: 'var(--text-primary)',
    fontWeight: 600,
  },
  // Personalize — MBTI
  mbtiBlock: {
    marginBottom: 24,
  },
  mbtiHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 12,
  },
  mbtiTitle: {
    fontSize: 16,
    fontWeight: 600,
  },
  mbtiOptional: {
    fontSize: 12,
    color: 'var(--text-ghost)',
    fontStyle: 'italic',
  },
  mbtiGrid: {
    display: 'flex',
    gap: 8,
  },
  mbtiPair: {
    flex: 1,
    display: 'flex',
    borderRadius: 12,
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(255,255,255,0.08)',
  },
  mbtiBtn: {
    flex: 1,
    padding: '10px 0',
    border: 'none',
    background: 'transparent',
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  mbtiBtnActive: {
    background: 'var(--accent-primary)',
    color: '#fff',
  },
  mbtiHint: {
    fontSize: 12,
    color: 'var(--text-ghost)',
    marginTop: 10,
    fontStyle: 'italic',
  },
  // CTA
  cta: {
    width: '100%',
    padding: 16,
    background: 'var(--accent-primary)',
    color: '#fff',
    border: 'none',
    borderRadius: 16,
    fontSize: 16,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(107,191,168,0.25)',
    marginTop: 'auto',
  },
};
