// Shared, persistent <audio> element so TTS playback works on iOS Safari.
//
// iOS blocks audio that isn't started synchronously inside a user gesture.
// Our TTS plays *after* an async fetch, so the gesture context is lost. The
// workaround: keep ONE audio element, "unlock" it during the start tap by
// playing a silent clip, then reuse that same (now-blessed) element for the
// real TTS playback later. Once unlocked within a gesture, an element can be
// re-sourced and replayed programmatically for the rest of the session.

// A valid zero-length WAV — plays instantly and silently.
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

let sharedAudio: HTMLAudioElement | null = null;

export function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) sharedAudio = new Audio();
  return sharedAudio;
}

// Call this synchronously inside a user gesture (e.g. the start-session tap).
export function unlockAudio(): void {
  const a = getSharedAudio();
  try {
    a.muted = true;
    a.src = SILENT_WAV;
    const p = a.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        a.pause();
        try { a.currentTime = 0; } catch { /* ignore */ }
        a.muted = false;
      }).catch(() => { a.muted = false; });
    } else {
      a.muted = false;
    }
  } catch {
    a.muted = false;
  }
}
