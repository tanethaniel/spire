import { useCallback, useEffect, useState } from 'react';
import { getUserSettings, setUserSettings } from '../lib/api';

export function useSettings(authed: boolean) {
  const [interpretationEnabled, setInterpretation] = useState(true);
  const [mbti, setMbtiState] = useState<string | null>(null);
  const [onboardingCompleted, setOnboardingState] = useState(true);
  const [goal, setGoalState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    getUserSettings()
      .then(s => {
        if (!cancelled) {
          setInterpretation(s.interpretationEnabled);
          setMbtiState(s.mbti);
          setOnboardingState(s.onboardingCompleted);
          setGoalState(s.goal);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [authed]);

  const currentSettings = () => ({
    interpretationEnabled,
    mbti,
    onboardingCompleted,
    goal,
  });

  const setInterpretationEnabled = useCallback(async (next: boolean) => {
    const prev = interpretationEnabled;
    setInterpretation(next);
    try {
      await setUserSettings({ ...currentSettings(), interpretationEnabled: next });
    } catch {
      setInterpretation(prev);
    }
  }, [interpretationEnabled, mbti, onboardingCompleted, goal]);

  const setMbti = useCallback(async (next: string | null) => {
    const prev = mbti;
    setMbtiState(next);
    try {
      await setUserSettings({ ...currentSettings(), mbti: next });
    } catch {
      setMbtiState(prev);
    }
  }, [interpretationEnabled, mbti, onboardingCompleted, goal]);

  const completeOnboarding = useCallback(async (selectedGoal: string | null, selectedMbti: string | null) => {
    setOnboardingState(true);
    setGoalState(selectedGoal);
    if (selectedMbti) setMbtiState(selectedMbti);
    try {
      await setUserSettings({
        interpretationEnabled,
        mbti: selectedMbti ?? mbti,
        onboardingCompleted: true,
        goal: selectedGoal,
      });
    } catch {
      // Onboarding state is best-effort; don't revert to avoid re-showing
    }
  }, [interpretationEnabled, mbti]);

  return {
    interpretationEnabled, setInterpretationEnabled,
    mbti, setMbti,
    onboardingCompleted, completeOnboarding,
    goal,
    loaded,
  };
}
