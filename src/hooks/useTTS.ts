import { useCallback, useEffect, useRef } from 'react';
import { textToSpeech } from '../lib/api';
import { getSharedAudio } from '../lib/audioPlayer';

const FALLBACK_AUDIO: Record<number, string> = {
  0: '/audio/q1.wav',
  1: '/audio/q2.wav',
  2: '/audio/q3.wav',
  3: '/audio/q4.wav',
  4: '/audio/q5.wav',
  5: '/audio/q6.wav',
};

export function useTTS() {
  const abortRef = useRef(false);
  const callIdRef = useRef(0);
  const cacheRef = useRef<Map<number, Promise<ArrayBuffer | null>>>(new Map());

  useEffect(() => {
    return () => {
      abortRef.current = true;
      getSharedAudio().pause();
      cacheRef.current.clear();
    };
  }, []);

  const prefetch = useCallback((text: string, questionIndex: number, instructions?: string) => {
    if (cacheRef.current.has(questionIndex)) return;
    const promise = textToSpeech(text, instructions).catch(() => null);
    cacheRef.current.set(questionIndex, promise);
  }, []);

  const speak = useCallback(async (
    text: string,
    questionIndex: number,
    onDone: () => void,
    instructions?: string,
  ) => {
    const myId = ++callIdRef.current;
    abortRef.current = false;

    const player = getSharedAudio();
    player.pause();

    const finish = () => {
      if (abortRef.current || callIdRef.current !== myId) return;
      abortRef.current = true;
      onDone();
    };

    try {
      let bufferPromise = cacheRef.current.get(questionIndex);
      if (!bufferPromise) {
        bufferPromise = textToSpeech(text, instructions).catch(() => null);
        cacheRef.current.set(questionIndex, bufferPromise);
      }
      const buffer = await bufferPromise;
      if (abortRef.current || callIdRef.current !== myId) return;
      if (!buffer) throw new Error('TTS fetch failed');

      const blob = new Blob([buffer], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      player.muted = false;
      player.src = url;

      player.onended = () => { URL.revokeObjectURL(url); finish(); };
      player.onerror = () => { URL.revokeObjectURL(url); finish(); };

      await player.play();
      return;
    } catch {
      if (abortRef.current || callIdRef.current !== myId) return;
      cacheRef.current.delete(questionIndex);
    }

    // Fallback: static WAV file
    const fallbackSrc = FALLBACK_AUDIO[questionIndex];
    if (fallbackSrc) {
      try {
        player.muted = false;
        player.src = fallbackSrc;

        player.onended = finish;
        player.onerror = () => {
          trySpeechSynthesis(text, finish);
        };

        await player.play();
        return;
      } catch {
        if (abortRef.current) return;
      }
    }

    trySpeechSynthesis(text, finish);
  }, []);

  const cancel = useCallback(() => {
    ++callIdRef.current;
    abortRef.current = true;
    getSharedAudio().pause();
    window.speechSynthesis?.cancel();
  }, []);

  return { speak, cancel, prefetch };
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

  const estimate = Math.min(Math.max(text.length * 90, 4000), 15000);
  const timer = setTimeout(() => {
    synth.cancel();
    onDone();
  }, estimate);

  const origEnd = utt.onend;
  utt.onend = (e) => { clearTimeout(timer); if (origEnd) (origEnd as (e: SpeechSynthesisEvent) => void)(e); };
  utt.onerror = () => { clearTimeout(timer); onDone(); };
}
