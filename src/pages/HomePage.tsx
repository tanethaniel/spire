import { useCallback, useRef, useState } from 'react';
import type { CalendarEvent } from '../types/session';
import { extractEvents } from '../lib/api';
import { CalendarConsent } from '../components/CalendarConsent';

interface HomePageProps {
  onStart: (events: CalendarEvent[] | null) => void;
  onOpenSettings: () => void;
}

const TOPICS = [
  { icon: '💼', label: 'Work', hint: 'Career, projects, colleagues' },
  { icon: '🤝', label: 'People', hint: 'Friends, family, relationships' },
  { icon: '🌿', label: 'Mind & body', hint: 'Health, energy, mood' },
  { icon: '💭', label: 'On my mind', hint: 'Anything else' },
];

export function HomePage({ onStart, onOpenSettings }: HomePageProps) {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showCalendarConsent, setShowCalendarConsent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleCalendarZoneClick = useCallback(() => {
    setShowCalendarConsent(true);
  }, []);

  const handleCalendarConsentAccept = useCallback(() => {
    setShowCalendarConsent(false);
    fileRef.current?.click();
  }, []);

  const handleCalendarConsentDecline = useCallback(() => {
    setShowCalendarConsent(false);
  }, []);

  const handleCalendarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const events = await extractEvents(base64);
      setCalendarEvents(events);
    } catch {
      setUploadError('Couldn\'t read your calendar. You can skip this step.');
    } finally {
      setUploading(false);
    }
  }, []);

  const getTimeGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  };

  const getDayName = () => {
    return new Date().toLocaleDateString('en-US', { weekday: 'long' });
  };

  return (
    <div style={styles.page}>
      {showCalendarConsent && (
        <CalendarConsent
          onAccept={handleCalendarConsentAccept}
          onDecline={handleCalendarConsentDecline}
        />
      )}

      <div style={styles.header}>
        <div style={styles.wordmark}>spire<span style={{ color: 'var(--accent-primary)' }}>.</span></div>
        <button style={styles.gear} onClick={onOpenSettings} aria-label="Settings">⚙</button>
      </div>

      <div style={styles.greeting}>
        <div style={styles.greetingTime}>{getDayName()} {getTimeGreeting()}</div>
        <div style={styles.greetingText}>What's been on your mind today?</div>
      </div>

      <div style={styles.sectionLabel}>Today's context</div>

      {calendarEvents ? (
        <div style={styles.eventsCard}>
          <div style={styles.eventsHeader}>
            <span style={{ fontSize: 14 }}>📅</span>
            <span style={{ fontSize: 13, color: 'var(--accent-primary)' }}>
              {calendarEvents.length} event{calendarEvents.length !== 1 ? 's' : ''} found
            </span>
          </div>
          {calendarEvents.map((ev, i) => (
            <div key={i} style={styles.eventItem}>
              <span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 48 }}>{ev.time}</span>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{ev.title}</span>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div
            style={{
              ...styles.calendarZone,
              ...(uploading ? { borderColor: 'var(--accent-primary)', opacity: 0.7 } : {}),
            }}
            onClick={handleCalendarZoneClick}
          >
            <div style={styles.calIcon}>📅</div>
            <div>
              <div style={styles.calTitle}>
                {uploading ? 'Reading your calendar…' : 'Add today\'s calendar'}
              </div>
              <div style={styles.calSub}>Screenshot → better prompts</div>
            </div>
            <span style={{ color: 'var(--text-ghost)', fontSize: 18 }}>›</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleCalendarUpload}
          />
          {uploadError && (
            <div style={{ padding: '0 24px', fontSize: 13, color: 'var(--error)', marginTop: -12, marginBottom: 8 }}>
              {uploadError}
            </div>
          )}
          <button onClick={() => onStart(null)} style={styles.skipLink}>
            Skip — reflect without calendar
          </button>
        </>
      )}

      <div style={styles.divider}>
        <div style={styles.dividerLine} />
        <span style={styles.dividerText}>or choose a topic</span>
        <div style={styles.dividerLine} />
      </div>

      <div style={styles.promptGrid}>
        {TOPICS.map(t => (
          <button
            key={t.label}
            style={{
              ...styles.pill,
              ...(selectedTopic === t.label ? styles.pillSelected : {}),
            }}
            onClick={() => setSelectedTopic(t.label)}
          >
            <span style={{ fontSize: 20 }}>{t.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>{t.label}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.3 }}>{t.hint}</span>
          </button>
        ))}
      </div>

      <div style={styles.ctaArea}>
        <button
          style={styles.ctaButton}
          onClick={() => onStart(calendarEvents)}
        >
          <span>▶</span> Start reflecting
        </button>
        <div style={styles.ctaSub}>6 questions · ~7 minutes · voice only</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    width: '100%',
    maxWidth: 430,
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-base)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px 8px',
  },
  wordmark: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: -0.5,
  },
  gear: {
    background: 'none',
    border: 'none',
    fontSize: 20,
    color: 'var(--text-muted)',
    minHeight: 44,
    minWidth: 44,
  },
  greeting: {
    padding: '8px 24px 24px',
  },
  greetingTime: {
    fontSize: 13,
    color: 'var(--text-ghost)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  greetingText: {
    fontSize: 28,
    fontWeight: 600,
    letterSpacing: -0.5,
    lineHeight: 1.2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-muted)',
    padding: '0 24px',
    marginBottom: 12,
  },
  calendarZone: {
    margin: '0 24px 8px',
    border: '1.5px dashed #2A2A38',
    borderRadius: 16,
    padding: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    background: 'var(--bg-surface)',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
  },
  calIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: '#1A1A26',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
    flexShrink: 0,
  },
  calTitle: {
    fontSize: 15,
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: 2,
  },
  calSub: {
    fontSize: 13,
    color: 'var(--text-muted)',
  },
  eventsCard: {
    margin: '0 24px 16px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 16,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  eventsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  eventItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 4,
  },
  skipLink: {
    fontSize: 13,
    color: 'var(--text-ghost)',
    background: 'none',
    border: 'none',
    textAlign: 'center' as const,
    display: 'block',
    width: '100%',
    padding: '8px 24px 16px',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '0 24px 20px',
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'var(--border-subtle)',
  },
  dividerText: {
    fontSize: 12,
    color: 'var(--text-ghost)',
    letterSpacing: '0.05em',
  },
  promptGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    padding: '0 24px',
    marginBottom: 32,
  },
  pill: {
    background: 'var(--bg-elevated)',
    border: '1.5px solid var(--border-subtle)',
    borderRadius: 14,
    padding: '16px 14px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    textAlign: 'left' as const,
    transition: 'all 0.15s',
  },
  pillSelected: {
    borderColor: 'var(--accent-primary)',
    background: '#1A1A24',
  },
  ctaArea: {
    padding: '0 24px',
    marginTop: 'auto',
    paddingBottom: 40,
  },
  ctaButton: {
    width: '100%',
    padding: 18,
    background: 'var(--accent-primary)',
    color: 'var(--bg-base)',
    border: 'none',
    borderRadius: 18,
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: -0.2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    transition: 'all 0.15s',
  },
  ctaSub: {
    textAlign: 'center' as const,
    fontSize: 12,
    color: 'var(--text-ghost)',
    marginTop: 10,
  },
};
