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
  limit,
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
 * Helper to convert Firestore Timestamp / Date / string to millis safely.
 */
const safeToMillis = (ts: any): number => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  const parsed = new Date(ts).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Fetches all live lessons created by a teacher.
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
    return lessons.sort((a, b) => safeToMillis(b.scheduledAt) - safeToMillis(a.scheduledAt));
  } catch (error) {
    console.error('Error fetching teacher live lessons:', error);
    throw error;
  }
};

interface SharedLessonChannel {
  listeners: Set<(lessons: LiveLesson[]) => void>;
  errorListeners: Set<(err: Error) => void>;
  latestData: LiveLesson[] | null;
  unsubscribeFirestore: () => void;
}

const teacherLessonChannels = new Map<string, SharedLessonChannel>();
const studentLessonChannels = new Map<string, SharedLessonChannel>();

/**
 * Real-time listener for teacher's lessons (multiplexed across subscribers).
 */
export const subscribeToTeacherLiveLessons = (
  teacherId: string,
  onUpdate: (lessons: LiveLesson[]) => void,
  onError?: (err: Error) => void
) => {
  if (!teacherId) {
    onUpdate([]);
    return () => {};
  }

  let channel = teacherLessonChannels.get(teacherId);
  if (!channel) {
    const listeners = new Set<(lessons: LiveLesson[]) => void>();
    const errorListeners = new Set<(err: Error) => void>();
    const q = query(
      collection(db, COLLECTION_NAME),
      where('teacherId', '==', teacherId),
      limit(100)
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const lessons: LiveLesson[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LiveLesson, 'id'>),
        }));
        lessons.sort((a, b) => safeToMillis(b.scheduledAt) - safeToMillis(a.scheduledAt));
        if (channel) {
          channel.latestData = lessons;
        }
        listeners.forEach((cb) => cb(lessons));
      },
      (err) => {
        console.error('Error in subscribeToTeacherLiveLessons:', err);
        errorListeners.forEach((cb) => cb(err));
      }
    );

    channel = {
      listeners,
      errorListeners,
      latestData: null,
      unsubscribeFirestore: unsub,
    };
    teacherLessonChannels.set(teacherId, channel);
  }

  channel.listeners.add(onUpdate);
  if (onError) channel.errorListeners.add(onError);
  if (channel.latestData !== null) {
    onUpdate(channel.latestData);
  }

  const currentChannel = channel;
  return () => {
    currentChannel.listeners.delete(onUpdate);
    if (onError) currentChannel.errorListeners.delete(onError);
    if (currentChannel.listeners.size === 0) {
      currentChannel.unsubscribeFirestore();
      teacherLessonChannels.delete(teacherId);
    }
  };
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
    where('role', 'in', ['student', 'free', 'premium', 'course']),
    limit(200)
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
 * Real-time listener for active and scheduled lessons available to students (multiplexed across subscribers).
 * Combines public lessons ('all'), individual lessons targeted to studentId, and course lessons.
 */
export const subscribeToStudentLiveLessons = (
  studentId: string | undefined,
  onUpdate: (lessons: LiveLesson[]) => void,
  onError?: (err: Error) => void,
  enrolledCourseIds?: string[]
) => {
  if (!studentId) {
    onUpdate([]);
    return () => {};
  }

  const cleanCourseIds = Array.isArray(enrolledCourseIds)
    ? Array.from(new Set(enrolledCourseIds.filter((c) => typeof c === 'string' && c.trim().length > 0)))
        .sort()
        .slice(0, 10)
    : [];
  const channelKey = `${studentId}:${cleanCourseIds.join(',')}`;

  let channel = studentLessonChannels.get(channelKey);
  if (!channel) {
    const listeners = new Set<(lessons: LiveLesson[]) => void>();
    const errorListeners = new Set<(err: Error) => void>();

    let publicLessons: LiveLesson[] = [];
    let individualLessons: LiveLesson[] = [];
    let courseLessons: LiveLesson[] = [];

    const updateCombined = () => {
      const map = new Map<string, LiveLesson>();
      publicLessons.forEach((l) => { if (l.id) map.set(l.id, l); });
      individualLessons.forEach((l) => { if (l.id) map.set(l.id, l); });
      courseLessons.forEach((l) => { if (l.id) map.set(l.id, l); });

      const combined = Array.from(map.values());
      combined.sort((a, b) => {
        if (a.status === 'live' && b.status !== 'live') return -1;
        if (b.status === 'live' && a.status !== 'live') return 1;
        return safeToMillis(a.scheduledAt) - safeToMillis(b.scheduledAt);
      });
      if (channel) {
        channel.latestData = combined;
      }
      listeners.forEach((cb) => cb(combined));
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
        errorListeners.forEach((cb) => cb(err));
      }
    );

    const qIndiv = query(
      collection(db, COLLECTION_NAME),
      where('studentIds', 'array-contains', studentId),
      where('status', 'in', ['live', 'scheduled'])
    );
    const unsubIndiv = onSnapshot(
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

    let unsubCourse = () => {};
    if (cleanCourseIds.length > 0) {
      const qCourse = query(
        collection(db, COLLECTION_NAME),
        where('courseId', 'in', cleanCourseIds),
        where('status', 'in', ['live', 'scheduled'])
      );
      unsubCourse = onSnapshot(
        qCourse,
        (snapshot) => {
          courseLessons = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<LiveLesson, 'id'>),
          }));
          updateCombined();
        },
        (err) => {
          console.error('Error in subscribeToStudentLiveLessons (course):', err);
        }
      );
    }

    channel = {
      listeners,
      errorListeners,
      latestData: null,
      unsubscribeFirestore: () => {
        unsubPublic();
        unsubIndiv();
        unsubCourse();
      },
    };
    studentLessonChannels.set(channelKey, channel);
  }

  channel.listeners.add(onUpdate);
  if (onError) channel.errorListeners.add(onError);
  if (channel.latestData !== null) {
    onUpdate(channel.latestData);
  }

  const currentChannel = channel;
  return () => {
    currentChannel.listeners.delete(onUpdate);
    if (onError) currentChannel.errorListeners.delete(onError);
    if (currentChannel.listeners.size === 0) {
      currentChannel.unsubscribeFirestore();
      studentLessonChannels.delete(channelKey);
    }
  };
};

interface SharedTodoChannel {
  listeners: Set<(todos: any[]) => void>;
  errorListeners: Set<(err: Error) => void>;
  latestData: any[] | null;
  unsubscribeFirestore: () => void;
}

const studentTodoChannels = new Map<string, SharedTodoChannel>();

/**
 * Multiplexed real-time listener for a student's todos collection so StudentDashboard,
 * Practice, and useNotifications share a single Firestore onSnapshot listener.
 */
export const subscribeToStudentTodos = (
  studentId: string | undefined,
  onUpdate: (todos: any[]) => void,
  onError?: (err: Error) => void
) => {
  if (!studentId) {
    onUpdate([]);
    return () => {};
  }

  let channel = studentTodoChannels.get(studentId);
  if (!channel) {
    const listeners = new Set<(todos: any[]) => void>();
    const errorListeners = new Set<(err: Error) => void>();

    const qTodos = query(
      collection(db, 'todos'),
      where('studentId', '==', studentId),
      limit(300)
    );

    const unsub = onSnapshot(
      qTodos,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (channel) {
          channel.latestData = items;
        }
        listeners.forEach((cb) => cb(items));
      },
      (err) => {
        console.warn('Error in subscribeToStudentTodos:', err);
        errorListeners.forEach((cb) => cb(err));
      }
    );

    channel = {
      listeners,
      errorListeners,
      latestData: null,
      unsubscribeFirestore: unsub,
    };
    studentTodoChannels.set(studentId, channel);
  }

  channel.listeners.add(onUpdate);
  if (onError) channel.errorListeners.add(onError);
  if (channel.latestData !== null) {
    onUpdate(channel.latestData);
  }

  const currentChannel = channel;
  return () => {
    currentChannel.listeners.delete(onUpdate);
    if (onError) currentChannel.errorListeners.delete(onError);
    if (currentChannel.listeners.size === 0) {
      currentChannel.unsubscribeFirestore();
      studentTodoChannels.delete(studentId);
    }
  };
};
