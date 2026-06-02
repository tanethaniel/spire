import { useCallback, useEffect, useState } from 'react';

type MicStatus = 'unknown' | 'granted' | 'denied' | 'prompt';

export function useMicPermission() {
  const [status, setStatus] = useState<MicStatus>('unknown');

  useEffect(() => {
    if (!navigator.permissions) {
      setStatus('prompt');
      return;
    }

    navigator.permissions.query({ name: 'microphone' as PermissionName }).then(result => {
      setStatus(result.state as MicStatus);
      result.onchange = () => setStatus(result.state as MicStatus);
    }).catch(() => {
      setStatus('prompt');
    });
  }, []);

  const requestMic = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      setStatus('granted');
      return true;
    } catch {
      setStatus('denied');
      return false;
    }
  }, []);

  return { status, requestMic };
}
