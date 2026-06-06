import { supabase } from '../lib/supabase';

interface ProfileSheetProps {
  user: { name: string; avatarUrl: string | null; email: string; createdAt: string };
  stats: { streak: number; totalSessions: number };
  interpretationEnabled: boolean;
  onToggle: (next: boolean) => void;
  mbti: string | null;
  onMbtiChange: (mbti: string | null) => void;
  goals: string[];
  onClose: () => void;
}

const MBTI_PAIRS: [string, string, string][] = [
  ['E', 'I', 'Energy'],
  ['S', 'N', 'Information'],
  ['T', 'F', 'Decisions'],
  ['J', 'P', 'Lifestyle'],
];

function parseMbti(mbti: string | null): [string, string, string, string] {
  if (!mbti || mbti.length !== 4) return ['E', 'S', 'T', 'J'];
  return [mbti[0].toUpperCase(), mbti[1].toUpperCase(), mbti[2].toUpperCase(), mbti[3].toUpperCase()];
}

function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function ProfileSheet({ user, stats, interpretationEnabled, onToggle, mbti, onMbtiChange, goals, onClose }: ProfileSheetProps) {
  const initial = (user.name || user.email || '?').charAt(0).toUpperCase();
  const mbtiLetters = parseMbti(mbti);
  const hasMbti = mbti !== null && mbti.length === 4;

  const toggleMbtiLetter = (pairIndex: number, letter: string) => {
    const next = [...mbtiLetters];
    next[pairIndex] = letter;
    onMbtiChange(next.join(''));
  };

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.sheet} onClick={e => e.stopPropagation()}>
        <div style={styles.handle} />

        {/* Identity */}
        <div style={styles.identity}>
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              style={styles.avatar}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div style={styles.avatarFallback}>{initial}</div>
          )}
          <div>
            <div style={styles.name}>{user.name}</div>
            <div style={styles.email}>{user.email}</div>
          </div>
        </div>

        {/* Stats */}
        <div style={styles.statsRow}>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.streak}</div>
            <div style={styles.statLabel}>day streak</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{stats.totalSessions}</div>
            <div style={styles.statLabel}>sessions</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statValue}>{formatMemberSince(user.createdAt)}</div>
            <div style={styles.statLabel}>member since</div>
          </div>
        </div>

        {/* Settings */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Settings</div>
          <div style={styles.row}>
            <div style={styles.rowText}>
              <div style={styles.rowLabel}>Interpret my reflections</div>
              <div style={styles.rowSub}>
                {interpretationEnabled
                  ? 'On — Spire finds themes, insights, and patterns in your words.'
                  : 'Off — Log mode. Your words are transcribed and saved, but never analyzed.'}
              </div>
            </div>
            <button
              role="switch"
              aria-checked={interpretationEnabled}
              onClick={() => onToggle(!interpretationEnabled)}
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
        </div>

        {/* Goals */}
        {goals.length > 0 && (
          <div style={styles.goalsSection}>
            <div style={styles.row}>
              <div style={styles.rowText}>
                <div style={styles.rowLabel}>Your goals</div>
              </div>
            </div>
            <div style={styles.goalsGrid}>
              {goals.map(g => (
                <span key={g} style={styles.goalPill}>{g}</span>
              ))}
            </div>
          </div>
        )}

        {/* MBTI */}
        <div style={styles.mbtiSection}>
          <div style={styles.row}>
            <div style={styles.rowText}>
              <div style={styles.rowLabel}>Personality type</div>
              <div style={styles.rowSub}>
                {hasMbti
                  ? `Your type: ${mbti}`
                  : 'Set your MBTI to unlock richer insights.'}
              </div>
            </div>
          </div>
          <div style={styles.mbtiGrid}>
            {MBTI_PAIRS.map(([a, b], i) => {
              const selected = mbtiLetters[i];
              return (
                <div key={i} style={styles.mbtiPair}>
                  <button
                    style={{
                      ...styles.mbtiBtn,
                      ...(hasMbti && selected === a ? styles.mbtiBtnActive : {}),
                    }}
                    onClick={() => toggleMbtiLetter(i, a)}
                  >
                    {a}
                  </button>
                  <button
                    style={{
                      ...styles.mbtiBtn,
                      ...(hasMbti && selected === b ? styles.mbtiBtnActive : {}),
                    }}
                    onClick={() => toggleMbtiLetter(i, b)}
                  >
                    {b}
                  </button>
                </div>
              );
            })}
          </div>
          {hasMbti && (
            <button style={styles.mbtiClear} onClick={() => onMbtiChange(null)}>
              Clear
            </button>
          )}
        </div>

        <button style={styles.done} onClick={onClose}>Done</button>

        <button
          style={styles.signOut}
          onClick={() => {
            localStorage.removeItem('google_provider_token');
            supabase.auth.signOut();
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.2)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    zIndex: 50,
  },
  sheet: {
    width: '100%',
    maxWidth: 430,
    background: 'rgba(255,255,255,0.35)',
    backdropFilter: 'blur(32px)',
    WebkitBackdropFilter: 'blur(32px)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTop: '1px solid rgba(255,255,255,0.4)',
    boxShadow: 'var(--glass-shadow-lg)',
    padding: '12px 24px 32px',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    background: 'rgba(0,0,0,0.12)',
    margin: '0 auto 20px',
  },
  // Identity
  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    objectFit: 'cover' as const,
    border: '2px solid rgba(255,255,255,0.4)',
    flexShrink: 0,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    background: 'var(--accent-primary)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    fontWeight: 700,
    flexShrink: 0,
    border: '2px solid rgba(255,255,255,0.4)',
  },
  name: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: -0.3,
  },
  email: {
    fontSize: 13,
    color: 'var(--text-muted)',
    marginTop: 2,
  },
  // Stats
  statsRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    background: 'rgba(255,255,255,0.15)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderTop: '1px solid rgba(255,255,255,0.35)',
    borderRadius: 14,
    padding: '12px 10px',
    textAlign: 'center' as const,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 11,
    color: 'var(--text-muted)',
    marginTop: 3,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  // Settings section
  section: {
    borderTop: '1px solid rgba(255,255,255,0.2)',
    paddingTop: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    marginBottom: 12,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    marginBottom: 14,
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 4,
  },
  rowSub: {
    fontSize: 13,
    color: 'var(--text-muted)',
    lineHeight: 1.45,
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
  done: {
    width: '100%',
    padding: 16,
    background: 'var(--accent-primary)',
    color: 'var(--text-primary)',
    border: 'none',
    borderRadius: 16,
    fontSize: 16,
    fontWeight: 600,
    boxShadow: '0 4px 16px rgba(107,191,168,0.25)',
    cursor: 'pointer',
  },
  // Goals
  goalsSection: {
    borderTop: '1px solid rgba(255,255,255,0.2)',
    paddingTop: 16,
    marginBottom: 16,
  },
  goalsGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  goalPill: {
    padding: '8px 14px',
    borderRadius: 20,
    background: 'var(--accent-primary)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
  },
  // MBTI
  mbtiSection: {
    borderTop: '1px solid rgba(255,255,255,0.2)',
    paddingTop: 16,
    marginBottom: 20,
  },
  mbtiGrid: {
    display: 'flex',
    gap: 8,
    marginTop: 8,
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
  mbtiClear: {
    background: 'none',
    border: 'none',
    fontSize: 13,
    color: 'var(--text-ghost)',
    cursor: 'pointer',
    marginTop: 8,
    padding: '4px 0',
  },
  signOut: {
    width: '100%',
    padding: 14,
    background: 'none',
    border: 'none',
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-muted)',
    marginTop: 8,
    cursor: 'pointer',
  },
};
