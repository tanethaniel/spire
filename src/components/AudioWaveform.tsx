import { useEffect, useRef, useState } from 'react';

interface AudioWaveformProps {
  active: boolean;
  stream: MediaStream | null;
}

const BAR_COUNT = 28;

export function AudioWaveform({ active, stream }: AudioWaveformProps) {
  const [bars, setBars] = useState<number[]>(Array(BAR_COUNT).fill(3));
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!active || !stream) {
      // Idle animation — gentle random pulse
      let t = 0;
      const idle = () => {
        t += 0.06;
        setBars(Array.from({ length: BAR_COUNT }, (_, i) =>
          3 + Math.sin(t + i * 0.4) * 2 + Math.random() * 1.5
        ));
        animFrameRef.current = requestAnimationFrame(idle);
      };
      animFrameRef.current = requestAnimationFrame(idle);
      return () => cancelAnimationFrame(animFrameRef.current);
    }

    // Live audio analysis
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.8;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      contextRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        analyser.getByteFrequencyData(dataArray);
        const newBars = Array.from({ length: BAR_COUNT }, (_, i) => {
          const idx = Math.floor((i / BAR_COUNT) * dataArray.length * 0.6);
          const val = dataArray[idx] / 255;
          return 3 + val * 44;
        });
        setBars(newBars);
        animFrameRef.current = requestAnimationFrame(draw);
      };
      animFrameRef.current = requestAnimationFrame(draw);
    } catch {
      // Fallback idle if AudioContext fails
    }

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      contextRef.current?.close();
    };
  }, [active, stream]);

  return (
    <div style={styles.wrapper}>
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            ...styles.bar,
            height: h,
            opacity: active ? 0.9 : 0.25,
            background: active ? 'var(--error)' : 'var(--accent-primary)',
            transition: active ? 'height 0.05s ease' : 'height 0.15s ease',
          }}
        />
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 52,
    width: '100%',
  },
  bar: {
    width: 3,
    borderRadius: 3,
    transition: 'height 0.05s ease',
  },
};
