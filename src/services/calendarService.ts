import { db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { LiveLesson } from '../types';

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
