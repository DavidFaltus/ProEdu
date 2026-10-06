import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  Timestamp 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { LiveLesson, LiveLessonStatus } from '../types';

const COLLECTION_NAME = 'liveLessons';

/**
 * Creates a new live lesson in Firestore.
 */
export const createLiveLesson = async (
  lessonData: Omit<LiveLesson, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const currentUid = auth.currentUser?.uid || lessonData.teacherId;
  const rawPayload: any = {
    ...lessonData,
    teacherId: currentUid,
    createdAt: Timestamp.now(),
  };

  const payload: any = {};
  Object.keys(rawPayload).forEach((key) => {
    if (rawPayload[key] !== undefined) {
      payload[key] = rawPayload[key];
    }
  });

  const docRef = await addDoc(collection(db, COLLECTION_NAME), payload);
  return docRef.id;
};

/**
 * Updates an existing live lesson.
 */
export const updateLiveLesson = async (
  lessonId: string,
  updates: Partial<Omit<LiveLesson, 'id' | 'createdAt' | 'teacherId'>>
): Promise<void> => {
  const lessonRef = doc(db, COLLECTION_NAME, lessonId);
  const rawPayload: any = {
    ...updates,
    updatedAt: Timestamp.now(),
  };

  const payload: any = {};
  Object.keys(rawPayload).forEach((key) => {
    if (rawPayload[key] !== undefined) {
      payload[key] = rawPayload[key];
    }
  });

  await updateDoc(lessonRef, payload);
};

/**
 * Updates lesson status (e.g. 'scheduled' -> 'live' -> 'completed').
 */
export const updateLessonStatus = async (
  lessonId: string,
  status: LiveLessonStatus
): Promise<void> => {
  const lessonRef = doc(db, COLLECTION_NAME, lessonId);
  await updateDoc(lessonRef, {
    status,
    updatedAt: Timestamp.now(),
  });
};

/**
 * Deletes a live lesson document.
 */
export const deleteLiveLesson = async (lessonId: string): Promise<void> => {
  const lessonRef = doc(db, COLLECTION_NAME, lessonId);
  await deleteDoc(lessonRef);
};

/**
 * Fetches all lessons for a specific teacher.
 */
export const getTeacherLiveLessons = async (teacherId: string): Promise<LiveLesson[]> => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('teacherId', '==', teacherId)
    );
    const snapshot = await getDocs(q);
    const lessons: LiveLesson[] = snapshot.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<LiveLesson, 'id'>),
    }));

    // Sort by scheduledAt desc locally
    return lessons.sort((a, b) => b.scheduledAt.toMillis() - a.scheduledAt.toMillis());
  } catch (error) {
    console.error('Error fetching teacher live lessons:', error);
    throw error;
  }
};

/**
 * Real-time listener for teacher's lessons.
 */
export const subscribeToTeacherLiveLessons = (
  teacherId: string,
  onUpdate: (lessons: LiveLesson[]) => void,
  onError?: (err: Error) => void
) => {
  const q = query(
    collection(db, COLLECTION_NAME),
    where('teacherId', '==', teacherId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const lessons: LiveLesson[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<LiveLesson, 'id'>),
      }));
      lessons.sort((a, b) => b.scheduledAt.toMillis() - a.scheduledAt.toMillis());
      onUpdate(lessons);
    },
    (err) => {
      console.error('Error in subscribeToTeacherLiveLessons:', err);
      if (onError) onError(err);
    }
  );
};

export interface StudentUserItem {
  id: string;
  name: string;
  email: string;
}

/**
 * Fetches all registered students for teacher to assign to lessons.
 */
export const getAllStudents = async (): Promise<StudentUserItem[]> => {
  const q = query(
    collection(db, 'users'),
    where('role', '==', 'student')
  );
  const snapshot = await getDocs(q);
  const students: StudentUserItem[] = snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name || 'Student',
      email: data.email || '',
    };
  });
  return students.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
};

/**
 * Real-time listener for active and scheduled lessons available to students.
 * Combines public lessons ('all') and individual lessons targeted to studentId.
 */
export const subscribeToStudentLiveLessons = (
  studentId: string | undefined,
  onUpdate: (lessons: LiveLesson[]) => void,
  onError?: (err: Error) => void
) => {
  let publicLessons: LiveLesson[] = [];
  let individualLessons: LiveLesson[] = [];

  const updateCombined = () => {
    const map = new Map<string, LiveLesson>();
    publicLessons.forEach((l) => { if (l.id) map.set(l.id, l); });
    individualLessons.forEach((l) => { if (l.id) map.set(l.id, l); });

    const combined = Array.from(map.values());
    combined.sort((a, b) => {
      if (a.status === 'live' && b.status !== 'live') return -1;
      if (b.status === 'live' && a.status !== 'live') return 1;
      const aTime = a.scheduledAt?.toMillis ? a.scheduledAt.toMillis() : (a.scheduledAt?.seconds ? a.scheduledAt.seconds * 1000 : 0);
      const bTime = b.scheduledAt?.toMillis ? b.scheduledAt.toMillis() : (b.scheduledAt?.seconds ? b.scheduledAt.seconds * 1000 : 0);
      return aTime - bTime;
    });
    onUpdate(combined);
  };

  const qPublic = query(
    collection(db, COLLECTION_NAME),
    where('targetAudience', '==', 'all'),
    where('status', 'in', ['live', 'scheduled'])
  );

  const unsubPublic = onSnapshot(
    qPublic,
    (snapshot) => {
      publicLessons = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<LiveLesson, 'id'>),
      }));
      updateCombined();
    },
    (err) => {
      console.error('Error in subscribeToStudentLiveLessons (public):', err);
      if (onError) onError(err);
    }
  );

  let unsubIndiv = () => {};
  if (studentId) {
    const qIndiv = query(
      collection(db, COLLECTION_NAME),
      where('studentIds', 'array-contains', studentId),
      where('status', 'in', ['live', 'scheduled'])
    );
    unsubIndiv = onSnapshot(
      qIndiv,
      (snapshot) => {
        individualLessons = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LiveLesson, 'id'>),
        }));
        updateCombined();
      },
      (err) => {
        console.error('Error in subscribeToStudentLiveLessons (individual):', err);
      }
    );
  }

  return () => {
    unsubPublic();
    unsubIndiv();
  };
};
