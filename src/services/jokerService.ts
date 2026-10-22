import { doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';

export const DEFAULT_DAILY_JOKERS = 20;
export const BASE_JOKER_CAP = 20;
export const MAX_STREAK_DAYS = 10;
export const MAX_JOKER_CAP = 30; // 20 + 10 dní streaku
export const DAILY_GRANT_JOKERS = 5;
export const VIDEO_REWARD_JOKERS = 5;
export const REFERRAL_REWARD_JOKERS = 50;
export const SURVEY_REWARD_JOKERS = 20;
export const MAX_REFERRALS = 5;
export const GUEST_MAX_VIDEOS = 3;

const GUEST_STORAGE_KEY = 'proedu_guest_monetization';

export interface GuestState {
  videosWatched: number;
  completedSubtopics: string[];
}

/**
 * Vrátí dnešní datum ve formátu YYYY-MM-DD podle lokálního času
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Vrátí včerejší datum ve formátu YYYY-MM-DD podle lokálního času
 */
export function getYesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Vypočítá maximální limit žolíků na základě streaku (20 až 30)
 */
export function calculateMaxJokersCap(streak: number = 0): number {
  const safeStreak = Math.max(0, Math.min(MAX_STREAK_DAYS, streak || 0));
  return Math.min(MAX_JOKER_CAP, BASE_JOKER_CAP + safeStreak);
}

/**
 * Získá stav neregistrovaného návštěvníka z localStorage
 */
export function getGuestState(): GuestState {
  try {
    const raw = localStorage.getItem(GUEST_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Chyba při čtení stavu hosta:', err);
  }
  return { videosWatched: 0, completedSubtopics: [] };
}

/**
 * Uloží stav neregistrovaného návštěvníka do localStorage
 */
export function saveGuestState(state: GuestState): void {
  try {
    localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Chyba při ukládání stavu hosta:', err);
  }
}

/**
 * Zaznamená zhlédnutí videa u neregistrovaného hosta
 */
export function recordGuestVideo(): { videosWatched: number; reachedLimit: boolean } {
  const state = getGuestState();
  const newCount = (state.videosWatched || 0) + 1;
  const newState: GuestState = {
    ...state,
    videosWatched: newCount,
  };
  saveGuestState(newState);
  return {
    videosWatched: newCount,
    reachedLimit: newCount >= GUEST_MAX_VIDEOS,
  };
}

/**
 * Zaznamená dokončení cvičení u neregistrovaného hosta
 */
export function recordGuestCompletedSubtopic(subtopicId: string): void {
  const state = getGuestState();
  if (!state.completedSubtopics.includes(subtopicId)) {
    saveGuestState({
      ...state,
      completedSubtopics: [...state.completedSubtopics, subtopicId],
    });
  }
}

/**
 * Resetuje stav neregistrovaného hosta (pro testovací účely)
 */
export function resetGuestState(): void {
  try {
    localStorage.removeItem(GUEST_STORAGE_KEY);
  } catch (err) {
    console.error('Chyba při resetu stavu hosta:', err);
  }
}

/**
 * Kontrola, zda uživatel má neomezený přístup bez žolíků
 */
export function hasUnlimitedJokers(role?: string): boolean {
  return role === 'premium' || role === 'course' || role === 'teacher';
}

/**
 * Provede denní příděl +5 žolíků (do limitu 20–30 dle streaku) a kontrolu platnosti streaku
 */
export async function checkAndResetDailyJokers(profile: UserProfile): Promise<UserProfile> {
  if (hasUnlimitedJokers(profile.role)) {
    return profile;
  }

  const today = getTodayDateString();
  const yesterday = getYesterdayDateString();

  // Kontrola, zda streak nevypršel (pokud uživatel vynechal včerejšek i dnešek bez procvičování)
  let effectiveStreak = profile.streak || 0;
  if (
    profile.lastStreakPracticeDate &&
    profile.lastStreakPracticeDate !== today &&
    profile.lastStreakPracticeDate !== yesterday
  ) {
    effectiveStreak = 0;
  }

  const currentCap = calculateMaxJokersCap(effectiveStreak);
  const isNewGrantDay = profile.lastDailyGrantDate !== today;

  if (isNewGrantDay || effectiveStreak !== (profile.streak || 0)) {
    const existingJokers = profile.jokers !== undefined ? profile.jokers : BASE_JOKER_CAP;
    // Denní příděl +5 žolíků nepřekročí kapacitu danou streakem.
    // Pokud uživatel má více žolíků (např. z bonusů), nic se mu nestrhává, ale +5 se již nepřičte.
    const newJokers = isNewGrantDay
      ? (existingJokers >= currentCap ? existingJokers : Math.min(currentCap, existingJokers + DAILY_GRANT_JOKERS))
      : existingJokers;

    const shouldResetStreakDate = effectiveStreak === 0 && profile.lastStreakPracticeDate !== today && profile.lastStreakPracticeDate !== yesterday;
    const updates: Record<string, any> = {
      jokers: newJokers,
      streak: effectiveStreak,
      lastDailyGrantDate: today,
      lastJokerResetDate: today,
      dailyVideosWatched: isNewGrantDay ? 0 : (profile.dailyVideosWatched || 0),
    };

    if (shouldResetStreakDate) {
      updates.lastStreakPracticeDate = deleteField();
    }

    const localProfileUpdates: Partial<UserProfile> = {
      jokers: newJokers,
      streak: effectiveStreak,
      lastDailyGrantDate: today,
      lastJokerResetDate: today,
      dailyVideosWatched: isNewGrantDay ? 0 : (profile.dailyVideosWatched || 0),
      ...(shouldResetStreakDate ? { lastStreakPracticeDate: undefined } : {}),
    };

    try {
      const userRef = doc(db, 'users', profile.uid);
      await updateDoc(userRef, updates);
      return {
        ...profile,
        ...localProfileUpdates,
      };
    } catch (err) {
      console.error('Chyba při denním přídělu / kontrole streaku:', err);
      return {
        ...profile,
        ...localProfileUpdates,
      };
    }
  }

  return profile;
}

/**
 * Zaznamená úspěšné procvičování a prodlouží 10denní streak
 */
export async function recordPracticeStreak(
  profile: UserProfile
): Promise<{ updatedProfile: UserProfile; streakIncreased: boolean; newStreak: number }> {
  if (!profile || !profile.uid || profile.uid === 'guest-preview' || profile.role === 'teacher') {
    return { updatedProfile: profile, streakIncreased: false, newStreak: profile?.streak || 0 };
  }

  const today = getTodayDateString();
  const yesterday = getYesterdayDateString();

  // Pokud už dnes procvičoval, streak se již pro dnešek nezvyšuje
  if (profile.lastStreakPracticeDate === today) {
    return { updatedProfile: profile, streakIncreased: false, newStreak: profile.streak || 0 };
  }

  let newStreak = 1;
  if (profile.lastStreakPracticeDate === yesterday) {
    newStreak = Math.min(MAX_STREAK_DAYS, (profile.streak || 0) + 1);
  }

  const updates = {
    streak: newStreak,
    lastStreakPracticeDate: today,
  };

  try {
    const userRef = doc(db, 'users', profile.uid);
    await updateDoc(userRef, updates);
    return {
      updatedProfile: { ...profile, ...updates },
      streakIncreased: true,
      newStreak,
    };
  } catch (err) {
    console.error('Chyba při aktualizaci streaku:', err);
    return {
      updatedProfile: { ...profile, ...updates },
      streakIncreased: true,
      newStreak,
    };
  }
}

/**
 * Spotřebuje 1 žolík za zodpovězenou otázku
 */
export async function consumeJoker(
  profile: UserProfile
): Promise<{ success: boolean; remainingJokers: number }> {
  if (hasUnlimitedJokers(profile.role)) {
    return { success: true, remainingJokers: 999 };
  }

  const currentJokers = profile.jokers !== undefined ? profile.jokers : DEFAULT_DAILY_JOKERS;
  if (currentJokers <= 0) {
    return { success: false, remainingJokers: 0 };
  }

  const remainingJokers = Math.max(0, currentJokers - 1);
  try {
    const userRef = doc(db, 'users', profile.uid);
    await updateDoc(userRef, { jokers: remainingJokers });
  } catch (err) {
    console.error('Chyba při odečítání žolíku:', err);
  }

  return { success: true, remainingJokers };
}

/**
 * Přičte žolíky po zhlédnutí 15s videa (+5 do limitu 20–30 dle streaku)
 */
export async function rewardVideoJokers(
  profile: UserProfile
): Promise<{ success: boolean; newJokers: number; reachedCap: boolean; cap: number; added: number }> {
  const currentCap = calculateMaxJokersCap(profile.streak || 0);
  const currentJokers = profile.jokers !== undefined ? profile.jokers : BASE_JOKER_CAP;

  if (currentJokers >= currentCap) {
    return {
      success: false,
      newJokers: currentJokers,
      reachedCap: true,
      cap: currentCap,
      added: 0,
    };
  }

  const newJokers = Math.min(currentCap, currentJokers + VIDEO_REWARD_JOKERS);
  const added = newJokers - currentJokers;
  const newVideos = (profile.dailyVideosWatched || 0) + 1;

  try {
    const userRef = doc(db, 'users', profile.uid);
    await updateDoc(userRef, {
      jokers: newJokers,
      dailyVideosWatched: newVideos,
    });
  } catch (err) {
    console.error('Chyba při přičítání žolíků za video:', err);
  }

  return {
    success: true,
    newJokers,
    reachedCap: newJokers >= currentCap,
    cap: currentCap,
    added,
  };
}

/**
 * API volání pro uplatnění referral kódu
 */
export async function claimReferralCodeApi(
  referralCode: string,
  idToken: string
): Promise<{ success: boolean; reward: number; newJokers: number; referrerName: string }> {
  const response = await fetch('/api/referrals/claim', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ referralCode }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Nepodařilo se uplatnit kód doporučení.');
  }

  return data;
}

/**
 * API volání pro odeslání dotazníku "Odkud jste o nás slyšeli ?"
 */
export async function submitSurveyAnswerApi(
  answer: string,
  customAnswer: string | undefined,
  school: string,
  grade: string,
  idToken: string
): Promise<{ success: boolean; reward: number; newJokers: number; school?: string; grade?: string }> {
  const response = await fetch('/api/survey/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ answer, customAnswer, school, grade }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Nepodařilo se odeslat odpověď na dotazník.');
  }

  return data;
}
