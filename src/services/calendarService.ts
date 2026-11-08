import { db } from '../lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import {
  addDays,
  startOfDay,
  setHours,
  setMinutes,
  getDay,
  isSameDay,
  isBefore,
} from 'date-fns';
import {
  LiveLesson,
  TodoItem,
  ScheduleConfig,
  GeneratedScheduleItem,
} from '../types';
import { safeToDate } from '../lib/utils';

export const getGoogleAccessToken = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId || clientId === 'MY_GOOGLE_CLIENT_ID' || clientId.includes('333169829281')) {
        throw new Error(
          'V konfiguraci aplikace chybí VITE_GOOGLE_CLIENT_ID (Google OAuth Client ID z Google Cloud Console). Můžete využít přímé přidání do Google kalendáře přes webový odkaz.'
        );
      }
      
      // Combine default identity scopes with required Workspace scopes.
      const SCOPES = [
        'openid',
        'email',
        'profile',
        'https://www.googleapis.com/auth/calendar.events',
      ].join(' ');

      // @ts-ignore - google is loaded from external script in index.html
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.access_token) {
            resolve(response.access_token);
          } else {
            reject(new Error('Failed to get access token: ' + (response.error || 'Unknown error')));
          }
        },
      });
      client.requestAccessToken();
    } catch (error) {
      reject(error);
    }
  });
};

export const syncEventToGoogleCalendar = async (
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    location?: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
  }
) => {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Nepodařilo se uložit událost do Google Kalendáře');
  }

  return await res.json();
};

/**
 * Syncs a LiveLesson to the user's Google Calendar via Google Calendar API.
 */
export const syncLiveLessonToGoogleCalendar = async (
  accessToken: string,
  lesson: LiveLesson
) => {
  const startDate = lesson.scheduledAt?.toDate ? lesson.scheduledAt.toDate() : new Date();
  const durationMs = (lesson.durationMinutes || 45) * 60 * 1000;
  const endDate = new Date(startDate.getTime() + durationMs);

  const eventPayload = {
    summary: `ProEdu: ${lesson.title}`,
    description: [
      lesson.description ? `${lesson.description}\n` : '',
      `📚 Předmět: ${lesson.subject || 'Výuka'}`,
      `👨‍🏫 Lektor: ${lesson.teacherName || 'ProEdu Lektor'}`,
      `🔗 Odkaz na Google Meet: ${lesson.meetUrl}`,
      `\nVytvořeno prostřednictvím aplikace ProEdu.`
    ].filter(Boolean).join('\n'),
    location: lesson.meetUrl,
    start: {
      dateTime: startDate.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  };

  return await syncEventToGoogleCalendar(accessToken, eventPayload);
};

/**
 * Synchronizes a LiveLesson to the student's in-app calendar (Firestore `todos` collection).
 * Prevents duplicates by checking if an item with `referenceId == lesson.id` already exists.
 */
export const syncLiveLessonToInAppCalendar = async (
  studentId: string,
  lesson: LiveLesson
): Promise<{ success: boolean; alreadyExists: boolean; todoId?: string }> => {
  if (!studentId || !lesson?.id) {
    throw new Error('Chybí ID studenta nebo lekce.');
  }

  // Check if already in todos
  const q = query(
    collection(db, 'todos'),
    where('studentId', '==', studentId),
    where('referenceId', '==', lesson.id)
  );
  const snap = await getDocs(q);

  if (!snap.empty) {
    return { success: true, alreadyExists: true, todoId: snap.docs[0].id };
  }

  // Add new in-app calendar todo item
  const docRef = await addDoc(collection(db, 'todos'), {
    studentId,
    title: `Online lekce: ${lesson.title}`,
    type: 'course_lesson',
    completed: false,
    addedBy: studentId,
    createdAt: serverTimestamp(),
    dueDate: lesson.scheduledAt,
    referenceId: lesson.id,
  });

  return { success: true, alreadyExists: false, todoId: docRef.id };
};

/**
 * Generates a prefilled Google Calendar Web URL for instant 1-click addition without OAuth.
 */
export const getGoogleCalendarWebUrl = (lesson: LiveLesson): string => {
  const startDate = lesson.scheduledAt?.toDate ? lesson.scheduledAt.toDate() : new Date();
  const durationMs = (lesson.durationMinutes || 45) * 60 * 1000;
  const endDate = new Date(startDate.getTime() + durationMs);

  const formatGCal = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');
  const startStr = formatGCal(startDate);
  const endStr = formatGCal(endDate);

  const desc = [
    lesson.description ? `${lesson.description}\n` : '',
    `Předmět: ${lesson.subject || 'Výuka'}`,
    `Lektor: ${lesson.teacherName || 'ProEdu'}`,
    `Google Meet: ${lesson.meetUrl}`,
  ].filter(Boolean).join('\n');

  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', `ProEdu: ${lesson.title}`);
  url.searchParams.set('dates', `${startStr}/${endStr}`);
  url.searchParams.set('details', desc);
  if (lesson.meetUrl) {
    url.searchParams.set('location', lesson.meetUrl);
  }

  return url.toString();
};

/**
 * Downloads standard .ics calendar file for Apple Calendar, Outlook, mobile devices, etc.
 */
export const downloadLessonIcsFile = (lesson: LiveLesson) => {
  const startDate = lesson.scheduledAt?.toDate ? lesson.scheduledAt.toDate() : new Date();
  const durationMs = (lesson.durationMinutes || 45) * 60 * 1000;
  const endDate = new Date(startDate.getTime() + durationMs);

  const formatIcs = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '');

  const desc = [
    lesson.description || '',
    `Předmět: ${lesson.subject || 'Výuka'}`,
    `Lektor: ${lesson.teacherName || 'ProEdu'}`,
    `Google Meet: ${lesson.meetUrl}`,
  ].filter(Boolean).join('\\n');

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ProEdu//Online Lekce//CS',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:proedu-lesson-${lesson.id}@proedu.cz`,
    `DTSTAMP:${formatIcs(new Date())}`,
    `DTSTART:${formatIcs(startDate)}`,
    `DTEND:${formatIcs(endDate)}`,
    `SUMMARY:ProEdu: ${lesson.title.replace(/\n/g, ' ')}`,
    `DESCRIPTION:${desc}`,
    lesson.meetUrl ? `LOCATION:${lesson.meetUrl}` : '',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');

  const blob = new Blob([icsLines], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', `${lesson.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.ics`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
};

export const createGoogleMeetCalendarEvent = async (
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
  }
): Promise<{ eventId: string; meetUrl: string }> => {
  const requestId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `meet-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const body = {
    ...event,
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: {
          type: 'hangoutsMeet',
        },
      },
    },
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Nepodařilo se vytvořit schůzku v Google Kalendáři.');
  }

  const data = await res.json();
  const meetUrl =
    data.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri ||
    data.hangoutLink ||
    '';

  if (!meetUrl) {
    throw new Error('Google Kalendář schůzku vytvořil, ale nevrátil platný odkaz na Google Meet. Zkontrolujte prosím oprávnění účtu.');
  }

  return {
    eventId: data.id,
    meetUrl,
  };
};

/**
 * Pure function that generates a preview/list of scheduled practice items
 * based on user configuration (interval, repetitions, sequencing, daily quota, collision handling).
 */
export const generatePracticeSchedule = (
  config: ScheduleConfig,
  existingTodos: TodoItem[] = []
): GeneratedScheduleItem[] => {
  const activeSelections = (config.selections || []).filter(
    (s) => s.repetitions > 0
  );
  if (activeSelections.length === 0) return [];

  // 1. Build ordered queue according to sequencingMode ('blocks' vs 'interleaved')
  const queue: Omit<GeneratedScheduleItem, 'dueDate'>[] = [];

  if (config.sequencingMode === 'interleaved') {
    const maxReps = Math.max(...activeSelections.map((s) => s.repetitions));
    for (let rep = 1; rep <= maxReps; rep++) {
      for (const sel of activeSelections) {
        if (rep <= sel.repetitions) {
          const suffix =
            sel.repetitions > 1 ? ` (${rep}/${sel.repetitions})` : '';
          queue.push({
            subtopicId: sel.subtopicId,
            subtopicTitle: sel.subtopicTitle,
            topicId: sel.topicId,
            subjectId: sel.subjectId,
            title: `${sel.subtopicTitle}${suffix}`.slice(0, 250),
            repetitionIndex: rep,
            totalRepetitions: sel.repetitions,
          });
        }
      }
    }
  } else {
    // Default: 'blocks' (repeat subtopic A for its full count/week before moving to subtopic B)
    for (const sel of activeSelections) {
      for (let rep = 1; rep <= sel.repetitions; rep++) {
        const suffix =
          sel.repetitions > 1 ? ` (${rep}/${sel.repetitions})` : '';
        queue.push({
          subtopicId: sel.subtopicId,
          subtopicTitle: sel.subtopicTitle,
          topicId: sel.topicId,
          subjectId: sel.subjectId,
          title: `${sel.subtopicTitle}${suffix}`.slice(0, 250),
          repetitionIndex: rep,
          totalRepetitions: sel.repetitions,
        });
      }
    }
  }

  // 2. Determine start date (considering collisionStrategy === 'append_after')
  let cursorDate = startOfDay(config.startDate || new Date());

  if (config.collisionStrategy === 'append_after' && existingTodos.length > 0) {
    let latestDate: Date | null = null;
    for (const todo of existingTodos) {
      if (todo.type === 'practice' && !todo.completed && todo.dueDate) {
        const d = safeToDate(todo.dueDate);
        if (d && !isBefore(startOfDay(d), cursorDate)) {
          if (!latestDate || d.getTime() > latestDate.getTime()) {
            latestDate = d;
          }
        }
      }
    }
    if (latestDate) {
      cursorDate = addDays(startOfDay(latestDate), 1);
    }
  }

  // 3. Distribute queue across calendar days
  const result: GeneratedScheduleItem[] = [];
  let queueIndex = 0;
  const dailyQuota = Math.max(1, Math.min(5, config.dailyQuota || 1));
  const preferredHour =
    typeof config.preferredHour === 'number' &&
    config.preferredHour >= 0 &&
    config.preferredHour <= 23
      ? config.preferredHour
      : 16;

  const stepDays =
    config.intervalMode === 'daily'
      ? 1
      : Math.max(1, config.customIntervalDays || 2);

  const validWeekdays =
    config.selectedWeekdays && config.selectedWeekdays.length > 0
      ? config.selectedWeekdays
      : [1, 2, 3, 4, 5]; // fallback Mon-Fri if empty

  let safetyCounter = 0;
  while (queueIndex < queue.length && safetyCounter < 1500) {
    safetyCounter++;

    const isDayAllowed =
      config.intervalMode !== 'weekdays' ||
      validWeekdays.includes(getDay(cursorDate));

    if (isDayAllowed) {
      for (let q = 0; q < dailyQuota && queueIndex < queue.length; q++) {
        const entry = queue[queueIndex++];
        const dueDate = setMinutes(setHours(cursorDate, preferredHour), 0);
        result.push({
          ...entry,
          dueDate,
        });
      }
      cursorDate = addDays(
        cursorDate,
        config.intervalMode === 'weekdays' ? 1 : stepDays
      );
    } else {
      cursorDate = addDays(cursorDate, 1);
    }
  }

  return result;
};

/**
 * Checks whether a schedule (if merged from startDate) collides with existing uncompleted practice todos.
 */
export const detectScheduleCollision = (
  config: ScheduleConfig,
  existingTodos: TodoItem[] = []
): {
  hasCollision: boolean;
  collidingDaysCount: number;
  latestExistingDate: Date | null;
} => {
  const activePracticeTodos = existingTodos.filter(
    (t) => t.type === 'practice' && !t.completed && t.dueDate
  );
  if (activePracticeTodos.length === 0) {
    return {
      hasCollision: false,
      collidingDaysCount: 0,
      latestExistingDate: null,
    };
  }

  const mergePreview = generatePracticeSchedule(
    { ...config, collisionStrategy: 'merge' },
    []
  );

  let latestExistingDate: Date | null = null;
  const existingDates: Date[] = [];

  for (const t of activePracticeTodos) {
    const d = safeToDate(t.dueDate);
    if (d) {
      existingDates.push(d);
      if (!latestExistingDate || d.getTime() > latestExistingDate.getTime()) {
        latestExistingDate = d;
      }
    }
  }

  const collidingDayKeys = new Set<string>();
  for (const item of mergePreview) {
    if (existingDates.some((ed) => isSameDay(ed, item.dueDate))) {
      collidingDayKeys.add(startOfDay(item.dueDate).toISOString());
    }
  }

  return {
    hasCollision: collidingDayKeys.size > 0,
    collidingDaysCount: collidingDayKeys.size,
    latestExistingDate,
  };
};

/**
 * Atomically saves generated practice schedule items into the Firestore `todos` collection.
 */
export const savePracticeScheduleToCalendar = async (
  studentId: string,
  items: GeneratedScheduleItem[]
): Promise<{ planId: string; count: number }> => {
  if (!studentId) {
    throw new Error('Pro uložení rozvrhu musíte být přihlášeni.');
  }
  if (!items || items.length === 0) {
    throw new Error('Rozvrh neobsahuje žádná cvičení k uložení.');
  }

  const planId = `plan-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const CHUNK_SIZE = 450;

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const item of chunk) {
      const ref = doc(collection(db, 'todos'));
      batch.set(ref, {
        studentId,
        title: item.title.slice(0, 256),
        type: 'practice',
        completed: false,
        addedBy: studentId,
        createdAt: serverTimestamp(),
        dueDate: Timestamp.fromDate(item.dueDate),
        referenceId: item.subtopicId,
        subjectId: item.subjectId,
        topicId: item.topicId,
        planId,
        repetitionIndex: item.repetitionIndex,
        totalRepetitions: item.totalRepetitions,
      });
    }

    await batch.commit();
  }

  return { planId, count: items.length };
};

/**
 * Automatically marks a scheduled practice todo as completed when the student finishes a PracticeSession.
 * Priority:
 * 1. Uncompleted todo for this subtopic scheduled for TODAY
 * 2. Earliest overdue uncompleted todo for this subtopic
 * 3. Earliest upcoming uncompleted todo for this subtopic
 */
export const completeScheduledPracticeTodo = async (
  studentId: string,
  subtopicId: string,
  isPremiumUser = true
): Promise<{
  completedTodoId: string | null;
  quotaMetToday: boolean;
  completedTodayCount: number;
  totalTodayCount: number;
}> => {
  if (!studentId || !subtopicId) {
    return {
      completedTodoId: null,
      quotaMetToday: false,
      completedTodayCount: 0,
      totalTodayCount: 0,
    };
  }

  const q = query(collection(db, 'todos'), where('studentId', '==', studentId));
  const snap = await getDocs(q);

  const now = new Date();
  const todayStart = startOfDay(now);

  const allPracticeTodos: (TodoItem & { parsedDate: Date | null })[] =
    snap.docs
      .map((d) => {
        const data = d.data() as Omit<TodoItem, 'id'>;
        return {
          id: d.id,
          ...data,
          parsedDate: safeToDate(data.dueDate),
        };
      })
      .filter(
        (t) =>
          t.type === 'practice' &&
          (isPremiumUser || (t.addedBy && t.addedBy !== studentId))
      );

  const uncompletedForSubtopic = allPracticeTodos.filter(
    (t) => !t.completed && t.referenceId === subtopicId && t.parsedDate
  );

  let targetTodo: (TodoItem & { parsedDate: Date | null }) | null = null;

  if (uncompletedForSubtopic.length > 0) {
    // 1. Today's scheduled items
    const todayCandidates = uncompletedForSubtopic
      .filter((t) => t.parsedDate && isSameDay(t.parsedDate, now))
      .sort(
        (a, b) =>
          (a.repetitionIndex || 1) - (b.repetitionIndex || 1) ||
          (a.parsedDate?.getTime() || 0) - (b.parsedDate?.getTime() || 0)
      );

    if (todayCandidates.length > 0) {
      targetTodo = todayCandidates[0];
    } else {
      // 2. Overdue items (oldest first)
      const overdueCandidates = uncompletedForSubtopic
        .filter((t) => t.parsedDate && isBefore(startOfDay(t.parsedDate), todayStart))
        .sort(
          (a, b) =>
            (a.parsedDate?.getTime() || 0) - (b.parsedDate?.getTime() || 0)
        );

      if (overdueCandidates.length > 0) {
        targetTodo = overdueCandidates[0];
      } else {
        // 3. Nearest upcoming item
        const upcomingCandidates = uncompletedForSubtopic.sort(
          (a, b) =>
            (a.parsedDate?.getTime() || 0) - (b.parsedDate?.getTime() || 0)
        );
        targetTodo = upcomingCandidates[0] || null;
      }
    }
  }

  if (targetTodo) {
    await updateDoc(doc(db, 'todos', targetTodo.id), {
      completed: true,
      completedAt: serverTimestamp(),
    });
    targetTodo.completed = true;
  }

  // Calculate today's practice quota status
  const todayTodos = allPracticeTodos.filter(
    (t) => t.parsedDate && isSameDay(t.parsedDate, now)
  );
  const totalTodayCount = todayTodos.length;
  const completedTodayCount = todayTodos.filter((t) => t.completed).length;
  const quotaMetToday =
    totalTodayCount > 0 && completedTodayCount === totalTodayCount;

  return {
    completedTodoId: targetTodo ? targetTodo.id : null,
    quotaMetToday,
    completedTodayCount,
    totalTodayCount,
  };
};

/**
 * Deletes a single scheduled todo item from the calendar.
 */
export const deleteScheduledTodo = async (todoId: string): Promise<void> => {
  if (!todoId) return;
  await deleteDoc(doc(db, 'todos', todoId));
};

/**
 * Deletes all uncompleted practice todos belonging to a specific planId (or all uncompleted practice todos if planId omitted).
 */
export const deleteScheduledPracticePlan = async (
  studentId: string,
  planId?: string
): Promise<number> => {
  if (!studentId) return 0;

  const q = query(collection(db, 'todos'), where('studentId', '==', studentId));
  const snap = await getDocs(q);

  const toDelete = snap.docs.filter((d) => {
    const data = d.data();
    if (data.type !== 'practice' || data.completed) return false;
    if (planId && data.planId !== planId) return false;
    return true;
  });

  if (toDelete.length === 0) return 0;

  const CHUNK_SIZE = 450;
  for (let i = 0; i < toDelete.length; i += CHUNK_SIZE) {
    const chunk = toDelete.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const docSnap of chunk) {
      batch.delete(docSnap.ref);
    }
    await batch.commit();
  }

  return toDelete.length;
};

export interface TeacherExerciseAssignmentInput {
  subtopicId: string;
  subtopicTitle: string;
  topicId: string;
  subjectId: string;
  dueDate: Date;
}

/**
 * Assigns selected practice exercises (or whole topics) from a teacher to one or more students,
 * writing them directly into each student's `todos` calendar collection with `addedBy = teacherId`.
 */
export const assignPracticeToStudentsByTeacher = async (
  teacherId: string,
  studentIds: string[],
  assignments: TeacherExerciseAssignmentInput[]
): Promise<{ planId: string; totalCreated: number }> => {
  if (!teacherId) {
    throw new Error('Chybí identifikace učitele.');
  }
  const uniqueStudents = Array.from(new Set(studentIds.filter(Boolean)));
  if (uniqueStudents.length === 0) {
    throw new Error('Vyberte prosím alespoň jednoho studenta.');
  }
  if (!assignments || assignments.length === 0) {
    throw new Error('Vyberte prosím alespoň jedno procvičování k přiřazení.');
  }

  const planId = `teacher-plan-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // Count how many times the same subtopic is assigned to compute repetitionIndex / totalRepetitions
  const subtopicTotals = new Map<string, number>();
  for (const a of assignments) {
    subtopicTotals.set(a.subtopicId, (subtopicTotals.get(a.subtopicId) || 0) + 1);
  }

  const payloads: Record<string, any>[] = [];

  for (const studentId of uniqueStudents) {
    const subtopicCounters = new Map<string, number>();
    for (const item of assignments) {
      const totalReps = subtopicTotals.get(item.subtopicId) || 1;
      const currentRep = (subtopicCounters.get(item.subtopicId) || 0) + 1;
      subtopicCounters.set(item.subtopicId, currentRep);

      const suffix = totalReps > 1 ? ` (${currentRep}/${totalReps})` : '';
      const dueDateWithHour = setMinutes(setHours(startOfDay(item.dueDate), 16), 0);

      payloads.push({
        studentId,
        title: `${item.subtopicTitle}${suffix}`.slice(0, 256),
        type: 'practice',
        completed: false,
        addedBy: teacherId,
        createdAt: serverTimestamp(),
        dueDate: Timestamp.fromDate(dueDateWithHour),
        referenceId: item.subtopicId,
        subjectId: item.subjectId,
        topicId: item.topicId || '',
        planId,
        repetitionIndex: currentRep,
        totalRepetitions: totalReps,
      });
    }
  }

  const CHUNK_SIZE = 450;
  for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
    const chunk = payloads.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const data of chunk) {
      const ref = doc(collection(db, 'todos'));
      batch.set(ref, data);
    }
    await batch.commit();
  }

  return { planId, totalCreated: payloads.length };
};

/**
 * Fetches all scheduled practice todos for a specific student (used in Teacher's StudentsProgressManager).
 */
export const getStudentPracticeTodos = async (
  studentId: string
): Promise<TodoItem[]> => {
  if (!studentId) return [];
  const q = query(collection(db, 'todos'), where('studentId', '==', studentId));
  const snap = await getDocs(q);

  const items: TodoItem[] = snap.docs
    .map((d) => ({
      id: d.id,
      ...(d.data() as Omit<TodoItem, 'id'>),
    }))
    .filter((t) => t.type === 'practice');

  items.sort((a, b) => {
    const da = safeToDate(a.dueDate)?.getTime() || 0;
    const dbDate = safeToDate(b.dueDate)?.getTime() || 0;
    return da - dbDate;
  });

  return items;
};

/**
 * Updates the dueDate of a scheduled todo item (used by Teacher to reschedule an assigned exercise).
 */
export const updateScheduledTodoDueDate = async (
  todoId: string,
  newDate: Date
): Promise<void> => {
  if (!todoId || !newDate) return;
  const dueDateWithHour = setMinutes(setHours(startOfDay(newDate), 16), 0);
  await updateDoc(doc(db, 'todos', todoId), {
    dueDate: Timestamp.fromDate(dueDateWithHour),
  });
};


