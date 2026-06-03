import { useCallback, useEffect, useRef } from 'react';
import { textToSpeech } from '../lib/api';

const FALLBACK_AUDIO: Record<number, string> = {
  0: '/audio/q1.wav',
  1: '/audio/q2.wav',
  2: '/audio/q3.wav',
  3: '/audio/q4.wav',
  4: '/audio/q5.wav',
  5: '/audio/q6.wav',
};

export function useTTS() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const speak = useCallback(async (
    text: string,
    questionIndex: number,
    onDone: () => void,
  ) => {
    abortRef.current = false;

    // Stop any previous playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const finish = () => {
      if (abortRef.current) return;
      abortRef.current = true;
      onDone();
    };

    // Try ElevenLabs API first
    try {
      const buffer = await textToSpeech(text);
      if (abortRef.current) return;

      const blob = new Blob([buffer], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => { URL.revokeObjectURL(url); finish(); };
      audio.onerror = () => { URL.revokeObjectURL(url); finish(); };

      await audio.play();
      return;
    } catch {
      if (abortRef.current) return;
    }

    // Fallback: static WAV file
    const fallbackSrc = FALLBACK_AUDIO[questionIndex];
    if (fallbackSrc) {
      try {
        const audio = new Audio(fallbackSrc);
        audioRef.current = audio;

        audio.onended = finish;
        audio.onerror = () => {
          // Last resort: browser speechSynthesis
          trySpeechSynthesis(text, finish);
        };

        await audio.play();
        return;
      } catch {
        if (abortRef.current) return;
      }
    }

    // Last resort: browser speechSynthesis
    trySpeechSynthesis(text, finish);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current = true;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
  }, []);

  return { speak, cancel };
}

function trySpeechSynthesis(text: string, onDone: () => void) {
  const synth = window.speechSynthesis;
  if (!synth) { onDone(); return; }

  synth.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.92;
  utt.pitch = 1;
  utt.volume = 1;
  utt.onend = onDone;
  utt.onerror = onDone;
  synth.speak(utt);

  // Watchdog in case speech stalls
  const estimate = Math.min(Math.max(text.length * 90, 4000), 15000);
  const timer = setTimeout(() => {
    synth.cancel();
    onDone();
  }, estimate);

  const origEnd = utt.onend;
  utt.onend = (e) => { clearTimeout(timer); if (origEnd) (origEnd as (e: SpeechSynthesisEvent) => void)(e); };
  utt.onerror = () => { clearTimeout(timer); onDone(); };
}
