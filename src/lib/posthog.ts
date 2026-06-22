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

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (!initialized) return;
  const message = error instanceof Error ? error.message : String(error);
  posthog.capture('$exception', {
    $exception_message: message,
    $exception_type: error instanceof Error ? error.constructor.name : 'Unknown',
    ...context,
  });
}
