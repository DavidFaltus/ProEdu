import { auth } from '../lib/firebase';
import { UserProfile } from '../types';

export const DEFAULT_DAILY_JOKERS = 10;
export const BASE_JOKER_CAP = 10;
export const MAX_STREAK_DAYS = 10;
export const MAX_JOKER_CAP = 15; // 10 základ + 5 navýšený limit za 10denní streak
export const DAILY_GRANT_JOKERS = 10;
export const VIDEO_REWARD_JOKERS = 5;
export const REFERRAL_REWARD_JOKERS = 30;
export const SURVEY_REWARD_JOKERS = 15;
export const MAX_REFERRALS = 5;
export const GUEST_MAX_VIDEOS = 3;

const GUEST_STORAGE_KEY = 'proedu_guest_monetization';

let activeVideoSessionToken: string | null = null;

export function getPendingVideoToken(): string | null {
  return activeVideoSessionToken;
}

export function consumePendingVideoToken(): string | null {
  const token = activeVideoSessionToken;
  activeVideoSessionToken = null;
  return token;
}

export interface GuestState {
  videosWatched: number;
  completedSubtopics: string[];
}

/**
 * Vrátí dnešní datum ve formátu YYYY-MM-DD podle časového pásma Europe/Prague (sjednoceno s backendem)
 */
export function getTodayDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Vrátí včerejší datum ve formátu YYYY-MM-DD podle časového pásma Europe/Prague (sjednoceno s backendem)
 */
export function getYesterdayDateString(): string {
  const todayPrague = getTodayDateString();
  const [y, m, d] = todayPrague.split('-').map(Number);
  const prevUtc = new Date(Date.UTC(y, m - 1, d - 1, 12, 0, 0));
  return getTodayDateString(prevUtc);
}

/**
 * Vypočítá maximální limit žolíků na základě streaku (10 nebo 15 při 10+ denním streaku)
 */
export function calculateMaxJokersCap(streak: number = 0): number {
  return (streak || 0) >= MAX_STREAK_DAYS ? MAX_JOKER_CAP : BASE_JOKER_CAP;
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
 * Vyžádá na serveru denní obnovu žolíků a kontrolu platnosti streaku (podle pražského času na backendu).
 * Klient nikdy nezapisuje jokers ani streak přímo do Firestore.
 */
export async function checkAndResetDailyJokers(profile: UserProfile): Promise<UserProfile> {
  if (!profile?.uid || profile.uid === 'guest-preview' || hasUnlimitedJokers(profile.role)) {
    return profile;
  }

  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return profile;

    const response = await fetch('/api/jokers/daily-reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      return profile;
    }

    const updatedFields = (data.profile && typeof data.profile === 'object' ? data.profile : data) as Partial<UserProfile>;
    return {
      ...profile,
      ...(typeof updatedFields.jokers === 'number' ? { jokers: updatedFields.jokers } : {}),
      ...(typeof updatedFields.streak === 'number' ? { streak: updatedFields.streak } : {}),
      ...(typeof updatedFields.dailyVideosWatched === 'number'
        ? { dailyVideosWatched: updatedFields.dailyVideosWatched }
        : {}),
      ...(updatedFields.lastDailyGrantDate !== undefined
        ? { lastDailyGrantDate: updatedFields.lastDailyGrantDate }
        : {}),
      ...(updatedFields.lastJokerResetDate !== undefined
        ? { lastJokerResetDate: updatedFields.lastJokerResetDate }
        : {}),
      ...(updatedFields.lastStreakPracticeDate !== undefined
        ? { lastStreakPracticeDate: updatedFields.lastStreakPracticeDate }
        : {}),
    };
  } catch (err) {
    console.error('Chyba při serverové kontrole denních žolíků:', err);
    return profile;
  }
}

/**
 * Streak se aktualizuje autoritativně na serveru při dokončení procvičování (/api/practice/finish).
 * Tento klientský helper pouze synchronizuje stav ze serveru a nikdy nezapisuje do Firestore.
 */
export async function recordPracticeStreak(
  profile: UserProfile
): Promise<{ updatedProfile: UserProfile; streakIncreased: boolean; newStreak: number }> {
  if (!profile || !profile.uid || profile.uid === 'guest-preview' || profile.role === 'teacher') {
    return { updatedProfile: profile, streakIncreased: false, newStreak: profile?.streak ?? 0 };
  }

  const synced = await checkAndResetDailyJokers(profile);
  const previousStreak = profile.streak ?? 0;
  const newStreak = synced.streak ?? previousStreak;
  return {
    updatedProfile: synced,
    streakIncreased: newStreak > previousStreak,
    newStreak,
  };
}

/**
 * Lokální kontrola kapacity žolíků; reálný atomický odpočet provádí výhradně backend
 * v /api/practice/check-answer a /api/practice/reveal-solution.
 */
export async function consumeJoker(
  profile: UserProfile
): Promise<{ success: boolean; remainingJokers: number }> {
  if (hasUnlimitedJokers(profile.role)) {
    return { success: true, remainingJokers: 999 };
  }

  const currentJokers = profile.jokers ?? 0;
  if (currentJokers <= 0) {
    return { success: false, remainingJokers: 0 };
  }

  return { success: true, remainingJokers: Math.max(0, currentJokers - 1) };
}

/**
 * Zahájí na serveru 15s relaci pro odměněné video a získá jednorázový videoToken.
 */
export async function startVideoSessionApi(): Promise<{ videoToken: string }> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Pro spuštění videa za žolíky se musíte přihlásit.');
  }

  const response = await fetch('/api/jokers/video-session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.videoToken) {
    const err = new Error(data?.error || 'Nepodařilo se zahájit relaci odměněného videa.') as Error & {
      limitReached?: boolean;
      reachedCap?: boolean;
    };
    err.limitReached = Boolean(data?.limitReached);
    err.reachedCap = Boolean(data?.reachedCap);
    throw err;
  }

  activeVideoSessionToken = String(data.videoToken);
  return { videoToken: activeVideoSessionToken };
}

/**
 * Přičte žolíky po zhlédnutí 15s videa přes autoritativní backend endpoint /api/jokers/video-reward.
 */
export async function rewardVideoJokers(
  profile: UserProfile,
  videoToken?: string
): Promise<{
  success: boolean;
  newJokers: number;
  reachedCap: boolean;
  cap: number;
  added: number;
  limitReached?: boolean;
  dailyVideosWatched?: number;
  error?: string;
}> {
  const currentCap = calculateMaxJokersCap(profile.streak ?? 0);
  const currentJokers = profile.jokers ?? 0;
  const resolvedToken = videoToken ?? consumePendingVideoToken();

  if (!resolvedToken) {
    return {
      success: false,
      newJokers: currentJokers,
      reachedCap: currentJokers >= currentCap,
      cap: currentCap,
      added: 0,
      error: 'Chybí ověřovací token odměněného videa.',
    };
  }

  try {
    const idToken = await auth.currentUser?.getIdToken();
    if (!idToken) {
      return {
        success: false,
        newJokers: currentJokers,
        reachedCap: false,
        cap: currentCap,
        added: 0,
        error: 'Chybí přihlášení uživatele.',
      };
    }

    const response = await fetch('/api/jokers/video-reward', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ videoToken: resolvedToken }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.success === false) {
      return {
        success: false,
        newJokers: typeof data?.newJokers === 'number' ? data.newJokers : currentJokers,
        reachedCap: Boolean(data?.reachedCap),
        cap: typeof data?.cap === 'number' ? data.cap : currentCap,
        added: 0,
        limitReached: Boolean(data?.limitReached),
        dailyVideosWatched:
          typeof data?.dailyVideosWatched === 'number' ? data.dailyVideosWatched : profile.dailyVideosWatched,
        error: data?.error || 'Nepodařilo se připsat žolíky za video.',
      };
    }

    if (activeVideoSessionToken === resolvedToken) {
      activeVideoSessionToken = null;
    }

    const nextJokers =
      typeof data?.newJokers === 'number'
        ? data.newJokers
        : typeof data?.jokers === 'number'
        ? data.jokers
        : currentJokers;

    return {
      success: true,
      newJokers: nextJokers,
      reachedCap: Boolean(data?.reachedCap ?? nextJokers >= currentCap),
      cap: typeof data?.cap === 'number' ? data.cap : currentCap,
      added: typeof data?.added === 'number' ? data.added : Math.max(0, nextJokers - currentJokers),
      dailyVideosWatched:
        typeof data?.dailyVideosWatched === 'number'
          ? data.dailyVideosWatched
          : (profile.dailyVideosWatched ?? 0) + 1,
    };
  } catch (err: any) {
    console.error('Chyba při přičítání žolíků za video:', err);
    return {
      success: false,
      newJokers: currentJokers,
      reachedCap: false,
      cap: currentCap,
      added: 0,
      error: err?.message || 'Nepodařilo se připsat žolíky za video.',
    };
  }
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
