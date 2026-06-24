import posthog from 'posthog-js';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

let initialized = false;

export function initPostHog() {
  if (!POSTHOG_KEY || initialized) return;
  posthog.init(POSTHOG_KEY, {
    persistence: 'localStorage',
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true,
  });
  initialized = true;
}

export function identifyUser(userId: string) {
  if (!initialized) return;
  posthog.identify(userId);
}

export function resetUser() {
  if (!initialized) return;
  posthog.reset();
}

export function captureEvent(name: string, properties?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(name, properties);
}

function sanitizeError(message: string): string {
  let s = message;
  s = s.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]');
  s = s.replace(/(\b\d{3}\b).{0,20}$/s, '$1 [truncated]');
  if (s.length > 200) s = s.slice(0, 200) + '…[truncated]';
  return s;
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (!initialized) return;
  const raw = error instanceof Error ? error.message : String(error);
  posthog.capture('$exception', {
    $exception_message: sanitizeError(raw),
    $exception_type: error instanceof Error ? error.constructor.name : 'Unknown',
    ...context,
  });
}
