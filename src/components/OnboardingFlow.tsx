import { useCallback, useState } from 'react';
import { PrivacyBullet } from './PrivacyBullet';

interface OnboardingFlowProps {
  onComplete: (goals: string[], mbti: string | null, interpretationEnabled: boolean) => void;
  onSkip: () => void;
  interpretationEnabled: boolean;
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

export function OnboardingFlow({ onComplete, onSkip, interpretationEnabled }: OnboardingFlowProps) {
  const [step, setStep] = useState(0);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [mbtiLetters, setMbtiLetters] = useState<[string, string, string, string] | null>(null);
  const [interpret, setInterpret] = useState(interpretationEnabled);

  const next = useCallback(() => setStep(s => Math.min(s + 1, 4)), []);
  const back = useCallback(() => setStep(s => Math.max(s - 1, 0)), []);

  const toggleGoal = useCallback((g: string) => {
    setSelectedGoals(prev =>
      prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]
    );
  }, []);

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
    onComplete(selectedGoals, mbtiString, interpret);
  }, [selectedGoals, mbtiLetters, interpret, onComplete]);

  return (
    <div style={styles.container}>
      {/* Top bar */}
      <div style={styles.topBar}>
        {step > 0 ? (
          <button style={styles.back} onClick={back}>{'‹'} Back</button>
        ) : (
          <div />
        )}
        <div style={styles.dotsRow}>
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} style={{
              ...styles.dot,
              ...(i === step ? styles.dotActive : {}),
              ...(i < step ? styles.dotDone : {}),
            }} />
          ))}
        </div>
        <button style={styles.skip} onClick={onSkip}>Skip</button>
      </div>

      {/* Screen content */}
      <div style={styles.content} key={step}>
        {step === 0 && <WelcomeScreen onNext={next} />}
        {step === 1 && <HowItWorksScreen onNext={next} />}
        {step === 2 && (
          <PrivacyScreen
            onNext={next}
            interpretationEnabled={interpret}
            onToggleInterpretation={setInterpret}
          />
        )}
        {step === 3 && <PatternCardsScreen onNext={next} />}
        {step === 4 && (
          <PersonalizeScreen
            selectedGoals={selectedGoals}
            onToggleGoal={toggleGoal}
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
        {[
          {
            icon: (
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M8 22V10a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H10a2 2 0 01-2-2z" stroke="var(--accent-primary)" strokeWidth="1.5" />
                <path d="M12 14h8M12 18h5" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ),
            label: 'Listen',
            sub: 'Spire asks you a question',
          },
          {
            icon: (
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect x="13" y="6" width="6" height="14" rx="3" stroke="var(--accent-primary)" strokeWidth="1.5" />
                <path d="M10 17a6 6 0 0012 0" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M16 23v3" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ),
            label: 'Reflect',
            sub: 'Speak your answer',
          },
          {
            icon: (
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="10" stroke="var(--accent-primary)" strokeWidth="1.5" />
                <path d="M12 16l3 3 5-6" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ),
            label: 'Discover',
            sub: 'See themes and insights',
          },
        ].map((item, i) => (
          <div
            key={i}
            style={{
              ...styles.demoStep,
              animation: `onboardSlideIn 0.5s ease ${i * 0.2}s both`,
            }}
          >
            <div style={styles.demoIcon}>{item.icon}</div>
            <div style={styles.demoText}>
              <div style={styles.demoLabel}>{item.label}</div>
              <div style={styles.demoSub}>{item.sub}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={styles.demoNote}>6 questions. ~5 minutes. Your voice, your story.</div>
      <div style={styles.demoHint}>Missed a day? You can always log for yesterday.</div>
      <button style={styles.cta} onClick={onNext}>Next</button>
    </div>
  );
}

function PrivacyScreen({
  onNext,
  interpretationEnabled,
  onToggleInterpretation,
}: {
  onNext: () => void;
  interpretationEnabled: boolean;
  onToggleInterpretation: (v: boolean) => void;
}) {
  return (
    <div style={styles.screen}>
      <div style={styles.sectionTitle}>Your reflections stay private.</div>
      <div style={styles.privacyList}>
        {PRIVACY_ITEMS.map((item, i) => (
          <PrivacyBullet key={i} icon={item.icon} title={item.title} detail={item.detail} />
        ))}
      </div>

      {/* Interpretation toggle */}
      <div style={styles.interpretRow}>
        <div style={styles.interpretText}>
          <div style={styles.interpretLabel}>Interpret my reflections</div>
          <div style={styles.interpretSub}>
            {interpretationEnabled
              ? 'Spire finds themes, insights, and patterns in your words.'
              : 'Log mode — your words are saved but never analyzed.'}
          </div>
        </div>
        <button
          role="switch"
          aria-checked={interpretationEnabled}
          onClick={() => onToggleInterpretation(!interpretationEnabled)}
          style={{
            ...styles.toggle,
            ...(interpretationEnabled ? styles.toggleOn : {}),
          }}
        >
          <span style={{
            ...styles.knob,
            ...(interpretationEnabled ? styles.knobOn : {}),
          }} />
        </button>
      </div>

      <button style={styles.cta} onClick={onNext}>I understand</button>
    </div>
  );
}

function PersonalizeScreen({
  selectedGoals,
  onToggleGoal,
  mbtiLetters,
  onToggleMbti,
  onFinish,
}: {
  selectedGoals: string[];
  onToggleGoal: (g: string) => void;
  mbtiLetters: [string, string, string, string] | null;
  onToggleMbti: (i: number, l: string) => void;
  onFinish: () => void;
}) {
  const hasMbti = mbtiLetters !== null;

  return (
    <div style={styles.screen}>
      {/* Goals */}
      <div style={styles.sectionTitle}>What brings you to Spire?</div>
      <div style={styles.goalGrid}>
        {GOALS.map(g => {
          const active = selectedGoals.includes(g);
          return (
            <button
              key={g}
              style={{
                ...styles.goalPill,
                ...(active ? styles.goalPillActive : {}),
              }}
              onClick={() => onToggleGoal(g)}
            >
              {g}
            </button>
          );
        })}
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

function PatternCardsScreen({ onNext }: { onNext: () => void }) {
  return (
    <div style={styles.screen}>
      <div style={styles.sectionTitle}>Pattern Cards</div>
      <div style={styles.patternSubtitle}>As you journal, Spire spots connections across your entries.</div>

      {/* Mock pattern card */}
      <div style={{ ...styles.mockCard, animation: 'onboardSlideIn 0.5s ease 0s both' }}>
        <div style={styles.mockBadge}>EMERGING PATTERN</div>
        <div style={styles.mockTitle}>Meetings take a toll on your energy</div>
        <div style={styles.mockNote}>Your mood tends to dip on meeting-heavy days. On lighter days, you mention feeling more focused and calm.</div>
      </div>

      {/* Info items */}
      <div style={styles.patternInfoList}>
        {[
          {
            icon: (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <rect x="5" y="3" width="10" height="14" rx="2" stroke="var(--accent-primary)" strokeWidth="1.5" />
                <path d="M8 10h4M10 8v4" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ),
            text: 'Unlock after 7 entries across 7 days',
          },
          {
            icon: (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 3l2.4 4.8 5.3.8-3.85 3.75.9 5.3L10 15.2l-4.75 2.5.9-5.3L2.3 8.6l5.3-.8L10 3z" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            ),
            text: 'Save patterns that resonate',
          },
          {
            icon: (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M6 10l3 3 5-6" stroke="var(--accent-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="10" cy="10" r="7.5" stroke="var(--accent-primary)" strokeWidth="1.5" />
              </svg>
            ),
            text: 'Give feedback to improve insights',
          },
        ].map((item, i) => (
          <div
            key={i}
            style={{
              ...styles.patternInfoItem,
              animation: `onboardSlideIn 0.5s ease ${0.3 + i * 0.2}s both`,
            }}
          >
            <div style={styles.patternInfoIcon}>{item.icon}</div>
            <div style={styles.patternInfoText}>{item.text}</div>
          </div>
        ))}
      </div>

      <button style={styles.cta} onClick={onNext}>Next</button>
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
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 18,
    marginBottom: 4,
  },
  back: {
    background: 'none',
    border: 'none',
    fontSize: 14,
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '4px 8px',
    minWidth: 50,
  },
  dotsRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
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
    background: 'none',
    border: 'none',
    fontSize: 14,
    color: 'var(--text-ghost)',
    cursor: 'pointer',
    padding: '4px 8px',
    minWidth: 50,
    textAlign: 'right' as const,
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
    marginBottom: 4,
  },
  demoHint: {
    fontSize: 13,
    color: 'var(--text-ghost)',
    textAlign: 'center' as const,
    marginBottom: 8,
  },
  // Privacy
  privacyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    flex: 1,
  },
  // Interpretation toggle
  interpretRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginTop: 20,
    marginBottom: 20,
    padding: '14px 16px',
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 14,
    boxShadow: 'var(--glass-shadow)',
  },
  interpretText: {
    flex: 1,
  },
  interpretLabel: {
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 3,
  },
  interpretSub: {
    fontSize: 12,
    color: 'var(--text-muted)',
    lineHeight: 1.4,
  },
  toggle: {
    width: 52,
    height: 30,
    borderRadius: 15,
    border: 'none',
    background: 'rgba(0,0,0,0.12)',
    position: 'relative' as const,
    flexShrink: 0,
    transition: 'background 0.2s',
    cursor: 'pointer',
  },
  toggleOn: {
    background: 'var(--accent-primary)',
  },
  knob: {
    position: 'absolute' as const,
    top: 3,
    left: 3,
    width: 24,
    height: 24,
    borderRadius: '50%',
    background: '#fff',
    transition: 'transform 0.2s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
  },
  knobOn: {
    transform: 'translateX(22px)',
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
    background: 'rgba(255,255,255,0.12)',
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
    background: 'var(--accent-primary)',
    border: '1px solid var(--accent-primary)',
    color: '#fff',
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
  // Pattern Cards screen
  patternSubtitle: {
    fontSize: 15,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
    marginBottom: 24,
    marginTop: -12,
  },
  mockCard: {
    background: 'var(--bg-surface)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid var(--border-glass)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 16,
    boxShadow: 'var(--glass-shadow)',
    padding: '18px 20px',
    marginBottom: 24,
  },
  mockBadge: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--accent-primary)',
    background: 'rgba(107,191,168,0.12)',
    padding: '4px 8px',
    borderRadius: 6,
    display: 'inline-block',
    marginBottom: 10,
  },
  mockTitle: {
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: -0.3,
    marginBottom: 8,
    lineHeight: 1.3,
  },
  mockNote: {
    fontSize: 14,
    color: 'var(--text-muted)',
    lineHeight: 1.5,
  },
  patternInfoList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
    flex: 1,
  },
  patternInfoItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  patternInfoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'rgba(107,191,168,0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  patternInfoText: {
    fontSize: 14,
    color: 'var(--text-secondary)',
    fontWeight: 500,
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
