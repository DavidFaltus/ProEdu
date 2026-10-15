import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';

export const DEFAULT_DAILY_JOKERS = 20;
export const VIDEO_REWARD_JOKERS = 5;
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
 * Provede Lazy Reset žolíků při prvním denním přístupu
 */
export async function checkAndResetDailyJokers(profile: UserProfile): Promise<UserProfile> {
  if (hasUnlimitedJokers(profile.role)) {
    return profile;
  }

  const today = getTodayDateString();
  if (profile.lastJokerResetDate !== today) {
    const updates = {
      jokers: DEFAULT_DAILY_JOKERS,
      lastJokerResetDate: today,
      dailyVideosWatched: 0,
    };

    try {
      const userRef = doc(db, 'users', profile.uid);
      await updateDoc(userRef, updates);
      return {
        ...profile,
        ...updates,
      };
    } catch (err) {
      console.error('Chyba při lazy resetu žolíků:', err);
      return {
        ...profile,
        ...updates,
      };
    }
  }

  return profile;
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
 * Přičte žolíky po zhlédnutí 15s videa (+5)
 */
export async function rewardVideoJokers(
  profile: UserProfile
): Promise<{ success: boolean; newJokers: number }> {
  const currentJokers = profile.jokers !== undefined ? profile.jokers : DEFAULT_DAILY_JOKERS;
  const newJokers = currentJokers + VIDEO_REWARD_JOKERS;
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

  return { success: true, newJokers };
}
