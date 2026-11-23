import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { StudyProgressRecord } from '../types';

export function getStudyProgressLocalKey(uid: string | undefined | null, subtopicId: string): string {
  const uidPart = uid || 'guest';
  return `proedu_study_progress_${uidPart}_${subtopicId}`;
}

function normalizeStudyProgressData(
  subtopicId: string,
  raw: any,
  totalSteps?: number
): StudyProgressRecord {
  const rawCompleted: unknown[] = Array.isArray(raw?.completedSteps) ? raw.completedSteps : [];
  const maxStep = typeof totalSteps === 'number' && totalSteps > 0 ? totalSteps : 100;
  const filteredSteps = rawCompleted.filter(
    (idx): idx is number =>
      typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 && idx < maxStep
  );
  const completedSteps: number[] = Array.from(new Set<number>(filteredSteps)).sort(
    (a, b) => a - b
  );

  const verifiedAnswers: Record<number, string> = {};
  if (raw?.verifiedAnswers && typeof raw.verifiedAnswers === 'object') {
    for (const [k, v] of Object.entries(raw.verifiedAnswers)) {
      const idx = Number(k);
      if (Number.isInteger(idx) && idx >= 0 && idx < maxStep && typeof v === 'string') {
        verifiedAnswers[idx] = v;
      }
    }
  }

  return {
    subtopicId,
    completedSteps,
    verifiedAnswers,
    ...(typeof totalSteps === 'number' && totalSteps >= 0
      ? { totalSteps }
      : typeof raw?.totalSteps === 'number'
        ? { totalSteps: raw.totalSteps }
        : {}),
    updatedAt: raw?.updatedAt,
  };
}

function readLocalStudyProgress(
  uid: string | undefined | null,
  subtopicId: string,
  totalSteps?: number
): StudyProgressRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = getStudyProgressLocalKey(uid, subtopicId);
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeStudyProgressData(subtopicId, parsed, totalSteps);
  } catch {
    return null;
  }
}

function writeLocalStudyProgress(
  uid: string | undefined | null,
  subtopicId: string,
  record: StudyProgressRecord
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = getStudyProgressLocalKey(uid, subtopicId);
    window.localStorage.setItem(
      key,
      JSON.stringify({
        completedSteps: record.completedSteps,
        verifiedAnswers: record.verifiedAnswers,
        totalSteps: record.totalSteps,
        updatedAt: Date.now(),
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

function mergeStudyProgressRecords(
  subtopicId: string,
  localRec: StudyProgressRecord | null,
  remoteRec: StudyProgressRecord | null,
  totalSteps?: number
): StudyProgressRecord {
  const mergedSteps = Array.from(
    new Set([
      ...(localRec?.completedSteps || []),
      ...(remoteRec?.completedSteps || []),
    ])
  ).sort((a, b) => a - b);

  const mergedAnswers: Record<number, string> = {
    ...(localRec?.verifiedAnswers || {}),
    ...(remoteRec?.verifiedAnswers || {}),
  };

  return normalizeStudyProgressData(
    subtopicId,
    {
      completedSteps: mergedSteps,
      verifiedAnswers: mergedAnswers,
      totalSteps: totalSteps ?? remoteRec?.totalSteps ?? localRec?.totalSteps,
    },
    totalSteps
  );
}

/**
 * Loads study step progress from localStorage and (for signed-in users) merges with Firestore.
 */
export async function loadStudyProgress(
  uid: string | undefined | null,
  subtopicId: string,
  totalSteps?: number
): Promise<StudyProgressRecord> {
  const localRec = readLocalStudyProgress(uid, subtopicId, totalSteps);

  if (!uid) {
    return localRec || { subtopicId, completedSteps: [], verifiedAnswers: {}, totalSteps };
  }

  try {
    const ref = doc(db, 'users', uid, 'studyProgress', subtopicId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      if (localRec && localRec.completedSteps.length > 0) {
        // Backfill existing local progress to Firestore in the background
        saveStudyProgress(uid, subtopicId, localRec).catch(() => {});
      }
      return localRec || { subtopicId, completedSteps: [], verifiedAnswers: {}, totalSteps };
    }

    const remoteRec = normalizeStudyProgressData(subtopicId, snap.data(), totalSteps);
    const merged = mergeStudyProgressRecords(subtopicId, localRec, remoteRec, totalSteps);
    writeLocalStudyProgress(uid, subtopicId, merged);

    if (merged.completedSteps.length > remoteRec.completedSteps.length) {
      saveStudyProgress(uid, subtopicId, merged).catch(() => {});
    }

    return merged;
  } catch (err) {
    console.warn('[StudyProgress] Firestore read fallback to localStorage:', err);
    return localRec || { subtopicId, completedSteps: [], verifiedAnswers: {}, totalSteps };
  }
}

/**
 * Saves study step progress immediately to localStorage and syncs to Firestore for signed-in users.
 */
export async function saveStudyProgress(
  uid: string | undefined | null,
  subtopicId: string,
  data: {
    completedSteps: number[];
    verifiedAnswers: Record<number, string>;
    totalSteps?: number;
  }
): Promise<void> {
  const normalized = normalizeStudyProgressData(subtopicId, data, data.totalSteps);
  writeLocalStudyProgress(uid, subtopicId, normalized);

  if (!uid) return;

  try {
    const ref = doc(db, 'users', uid, 'studyProgress', subtopicId);
    const existing = await getDoc(ref);
    const stringKeyedAnswers: Record<string, string> = {};
    for (const [k, v] of Object.entries(normalized.verifiedAnswers)) {
      stringKeyedAnswers[String(k)] = v;
    }

    const payload: Record<string, any> = {
      uid,
      subtopicId,
      completedSteps: normalized.completedSteps,
      verifiedAnswers: stringKeyedAnswers,
      ...(typeof normalized.totalSteps === 'number' ? { totalSteps: normalized.totalSteps } : {}),
      updatedAt: serverTimestamp(),
    };
    if (!existing.exists()) {
      payload.createdAt = serverTimestamp();
    }
    await setDoc(ref, payload, { merge: true });
  } catch (err) {
    console.warn('[StudyProgress] Failed to sync progress to Firestore:', err);
  }
}

/**
 * Clears study step progress from both localStorage and Firestore.
 */
export async function resetStudyProgress(
  uid: string | undefined | null,
  subtopicId: string
): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(getStudyProgressLocalKey(uid, subtopicId));
    } catch {
      // Ignore storage errors
    }
  }

  if (!uid) return;

  try {
    await deleteDoc(doc(db, 'users', uid, 'studyProgress', subtopicId));
  } catch (err) {
    console.warn('[StudyProgress] Failed to delete Firestore progress:', err);
  }
}

/**
 * Fetches all studyProgress records for a user from Firestore and merges with any local keys.
 */
export async function fetchAllUserStudyProgress(
  uid: string | undefined | null
): Promise<Record<string, StudyProgressRecord>> {
  const result: Record<string, StudyProgressRecord> = {};
  const uidPart = uid || 'guest';
  const prefix = `proedu_study_progress_${uidPart}_`;

  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        const subtopicId = key.slice(prefix.length);
        if (!subtopicId) continue;
        const localRec = readLocalStudyProgress(uid, subtopicId);
        if (localRec) {
          result[subtopicId] = localRec;
        }
      }
    } catch {
      // Ignore storage read errors
    }
  }

  if (!uid) return result;

  try {
    const snap = await getDocs(collection(db, 'users', uid, 'studyProgress'));
    for (const d of snap.docs) {
      const subtopicId = d.id;
      const remoteRec = normalizeStudyProgressData(subtopicId, d.data());
      const merged = mergeStudyProgressRecords(subtopicId, result[subtopicId] || null, remoteRec);
      result[subtopicId] = merged;
    }
  } catch (err) {
    console.warn('[StudyProgress] Failed to fetch all Firestore progress:', err);
  }

  return result;
}
