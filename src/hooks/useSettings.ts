import { useCallback, useEffect, useState } from 'react';
import { getUserSettings, setUserSettings, rewritePatternsMbti } from '../lib/api';

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
      rewritePatternsMbti().catch(() => {});
    } catch {
      setMbtiState(prev);
    }
  }, [interpretationEnabled, mbti, onboardingCompleted, goal]);

  const completeOnboarding = useCallback(async (
    selectedGoals: string[],
    selectedMbti: string | null,
    interpretEnabled: boolean,
  ) => {
    setOnboardingState(true);
    const goalJson = selectedGoals.length > 0 ? JSON.stringify(selectedGoals) : null;
    setGoalState(goalJson);
    setInterpretation(interpretEnabled);
    if (selectedMbti) setMbtiState(selectedMbti);
    try {
      await setUserSettings({
        interpretationEnabled: interpretEnabled,
        mbti: selectedMbti ?? mbti,
        onboardingCompleted: true,
        goal: goalJson,
      });
    } catch {
      // Onboarding state is best-effort; don't revert to avoid re-showing
    }
  }, [mbti]);

  const goals: string[] = (() => {
    if (!goal) return [];
    try { return JSON.parse(goal); } catch { return []; }
  })();

  return {
    interpretationEnabled, setInterpretationEnabled,
    mbti, setMbti,
    onboardingCompleted, completeOnboarding,
    goals,
    loaded,
  };
}
