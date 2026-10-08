import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { safeToDate } from '../lib/utils';
import { subscribeToStudentLiveLessons, subscribeToTeacherLiveLessons } from '../services/liveLessonService';
import { markInquiryAsRead } from '../services/inquiryService';
import { LiveLesson } from '../types';

export type NotificationType = 
  | 'todo' 
  | 'test' 
  | 'test_review' 
  | 'inquiry_answer' 
  | 'inquiry_new' 
  | 'sheet' 
  | 'lesson' 
  | 'test_submitted';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  timestamp: Date;
  isNew: boolean;
  link?: string;
  meetUrl?: string;
  tagText: string;
}

export function useNotifications() {
  const { profile, updateProfileData } = useAuth();
  const [todosList, setTodosList] = useState<any[]>([]);
  const [testsList, setTestsList] = useState<any[]>([]);
  const [sheetsList, setSheetsList] = useState<any[]>([]);
  const [inquiriesList, setInquiriesList] = useState<any[]>([]);
  const [lessonsList, setLessonsList] = useState<LiveLesson[]>([]);
  const [loading, setLoading] = useState(true);

  // Optimistic last viewed date for immediate UI updates without network delay
  const [optimisticLastViewed, setOptimisticLastViewed] = useState<Date | null>(() => {
    try {
      const stored = localStorage.getItem('proedu_last_viewed_activity');
      return stored ? new Date(stored) : null;
    } catch {
      return null;
    }
  });

  // Store lastViewed timestamp to compare against (takes the latest of profile or optimistic)
  const lastViewed = useMemo(() => {
    const profileDate = profile?.lastViewedActivityAt ? safeToDate(profile.lastViewedActivityAt) || new Date(0) : new Date(0);
    if (optimisticLastViewed && optimisticLastViewed.getTime() > profileDate.getTime()) {
      return optimisticLastViewed;
    }
    return profileDate;
  }, [profile?.lastViewedActivityAt, optimisticLastViewed]);

  const isTeacher = profile?.role === 'teacher';
  const uid = profile?.uid;

  // Realtime listeners based on role
  useEffect(() => {
    if (!uid) {
      setTodosList([]);
      setTestsList([]);
      setSheetsList([]);
      setInquiriesList([]);
      setLessonsList([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubs: (() => void)[] = [];

    if (!isTeacher) {
      // 1. Student Todos assigned by teacher
      try {
        const qTodos = query(
          collection(db, 'todos'),
          where('studentId', '==', uid)
        );
        const unsubTodos = onSnapshot(
          qTodos,
          (snap) => {
            const items = snap.docs
              .map(doc => ({ id: doc.id, ...doc.data() }))
              .filter((item: any) => item.addedBy !== uid && !item.completed);
            setTodosList(items);
          },
          (err) => console.warn('Error listening to notifications (todos):', err)
        );
        unsubs.push(unsubTodos);
      } catch (err) {
        console.warn('Failed to subscribe to todos notifications', err);
      }

      // 2. Student Assigned Tests (pending or graded)
      try {
        const qTests = query(
          collection(db, 'assignedTests'),
          where('studentId', '==', uid)
        );
        const unsubTests = onSnapshot(
          qTests,
          (snap) => {
            const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTestsList(items);
          },
          (err) => console.warn('Error listening to notifications (assignedTests):', err)
        );
        unsubs.push(unsubTests);
      } catch (err) {
        console.warn('Failed to subscribe to tests notifications', err);
      }

      // 3. Learning sheets
      try {
        const qSheets = query(collection(db, 'learningSheets'));
        const unsubSheets = onSnapshot(
          qSheets,
          (snap) => {
            const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSheetsList(items);
          },
          (err) => console.warn('Error listening to notifications (learningSheets):', err)
        );
        unsubs.push(unsubSheets);
      } catch (err) {
        console.warn('Failed to subscribe to sheets notifications', err);
      }

      // 4. Student Inquiries (answered)
      try {
        const qInquiries = query(
          collection(db, 'questionInquiries'),
          where('studentId', '==', uid)
        );
        const unsubInquiries = onSnapshot(
          qInquiries,
          (snap) => {
            const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setInquiriesList(items);
          },
          (err) => console.warn('Error listening to notifications (questionInquiries):', err)
        );
        unsubs.push(unsubInquiries);
      } catch (err) {
        console.warn('Failed to subscribe to student inquiries notifications', err);
      }

      // 5. Live lessons
      try {
        const unsubLessons = subscribeToStudentLiveLessons(
          uid,
          (lessons) => {
            setLessonsList(lessons.filter(l => l.status === 'live' || l.status === 'scheduled'));
          },
          (err) => console.warn('Error listening to notifications (liveLessons):', err)
        );
        unsubs.push(unsubLessons);
      } catch (err) {
        console.warn('Failed to subscribe to student live lessons notifications', err);
      }

    } else {
      // Teacher Notifications
      // 1. Pending student inquiries waiting for answer
      try {
        const qInquiries = query(
          collection(db, 'questionInquiries'),
          where('status', '==', 'pending')
        );
        const unsubInquiries = onSnapshot(
          qInquiries,
          (snap) => {
            const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setInquiriesList(items);
          },
          (err) => console.warn('Error listening to teacher inquiries notifications:', err)
        );
        unsubs.push(unsubInquiries);
      } catch (err) {
        console.warn('Failed to subscribe to teacher inquiries notifications', err);
      }

      // 2. Submitted tests waiting for review
      try {
        const qTests = query(
          collection(db, 'assignedTests'),
          where('status', '==', 'submitted')
        );
        const unsubTests = onSnapshot(
          qTests,
          (snap) => {
            const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTestsList(items);
          },
          (err) => console.warn('Error listening to teacher submitted tests:', err)
        );
        unsubs.push(unsubTests);
      } catch (err) {
        console.warn('Failed to subscribe to teacher tests notifications', err);
      }

      // 3. Teacher live lessons
      try {
        const unsubLessons = subscribeToTeacherLiveLessons(
          uid,
          (lessons) => {
            setLessonsList(lessons.filter(l => l.status === 'live' || l.status === 'scheduled'));
          },
          (err) => console.warn('Error listening to teacher live lessons:', err)
        );
        unsubs.push(unsubLessons);
      } catch (err) {
        console.warn('Failed to subscribe to teacher live lessons', err);
      }
    }

    setLoading(false);

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [uid, isTeacher]);

  // Aggregate into standardized notification objects
  const notifications = useMemo<AppNotification[]>(() => {
    const list: AppNotification[] = [];

    if (!isTeacher) {
      // Student notifications:
      // a) Todos
      todosList.forEach(todo => {
        const time = safeToDate(todo.createdAt) || new Date(0);
        list.push({
          id: `todo-${todo.id}`,
          type: 'todo',
          title: todo.title || 'Nový úkol od učitele',
          description: todo.dueDate ? `Termín do: ${safeToDate(todo.dueDate)?.toLocaleDateString('cs-CZ') || ''}` : 'Nový zadaný úkol v To-Do seznamu',
          timestamp: time,
          isNew: time > lastViewed,
          link: '/todo',
          tagText: 'Úkol',
        });
      });

      // b) Tests (Pending & Graded)
      testsList.forEach(test => {
        if (test.status === 'pending') {
          const time = safeToDate(test.assignedAt) || new Date(0);
          list.push({
            id: `test-pending-${test.id}`,
            type: 'test',
            title: test.testTitle || 'Přiřazený test',
            description: 'Nový test čeká na tvé vypracování',
            timestamp: time,
            isNew: time > lastViewed,
            link: `/test/${test.id}`,
            tagText: 'Test k vyřešení',
          });
        } else if (test.status === 'graded') {
          const time = safeToDate(test.gradedAt) || safeToDate(test.submittedAt) || new Date(0);
          list.push({
            id: `test-graded-${test.id}`,
            type: 'test_review',
            title: test.testTitle || 'Vyhodnocený test',
            description: test.grade ? `Výsledek: známka ${test.grade}` : (test.feedback ? `Hodnocení: ${test.feedback.slice(0, 50)}...` : 'Test byl opraven učitelem'),
            timestamp: time,
            isNew: time > lastViewed,
            link: `/review/${test.id}`,
            tagText: 'Hodnocení testu',
          });
        }
      });

      // c) Learning sheets (recent sheets)
      const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      sheetsList.forEach(sheet => {
        const time = safeToDate(sheet.createdAt) || new Date(0);
        if (time > twoWeeksAgo || time > lastViewed) {
          list.push({
            id: `sheet-${sheet.id}`,
            type: 'sheet',
            title: sheet.title || 'Nový studijní materiál',
            description: sheet.subject ? `${sheet.subject} • K dispozici v sekci Materiály` : 'Nový studijní materiál k procvičování',
            timestamp: time,
            isNew: time > lastViewed,
            link: '/learning',
            tagText: 'Materiál',
          });
        }
      });

      // d) Answered inquiries
      inquiriesList.forEach(inquiry => {
        if (inquiry.status === 'answered') {
          const time = safeToDate(inquiry.repliedAt) || safeToDate(inquiry.createdAt) || new Date(0);
          const isUnread = !inquiry.isReadByStudent && time > lastViewed;
          list.push({
            id: `inquiry-${inquiry.id}`,
            type: 'inquiry_answer',
            title: `Odpověď na: ${inquiry.topic || 'Dotaz k učivu'}`,
            description: inquiry.reply ? `"${inquiry.reply.slice(0, 60)}${inquiry.reply.length > 60 ? '...' : ''}"` : 'Učitel odpověděl na tvůj dotaz',
            timestamp: time,
            isNew: isUnread,
            link: '/',
            tagText: 'Odpověď na dotaz',
          });
        }
      });

      // e) Live lessons
      lessonsList.forEach(lesson => {
        const createdTime = safeToDate(lesson.createdAt) || safeToDate(lesson.scheduledAt) || new Date(0);
        const scheduledTime = safeToDate(lesson.scheduledAt);
        const isLive = lesson.status === 'live';
        list.push({
          id: `lesson-${lesson.id}`,
          type: 'lesson',
          title: lesson.title || 'Online hodina',
          description: isLive 
            ? `Lektor ${lesson.teacherName} čeká v hovoru Google Meet` 
            : `Plánováno: ${scheduledTime ? scheduledTime.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : ''} (${lesson.teacherName})`,
          timestamp: createdTime,
          isNew: createdTime > lastViewed,
          link: '/',
          meetUrl: lesson.meetUrl,
          tagText: isLive ? 'Právě probíhá' : 'Online lekce',
        });
      });

    } else {
      // Teacher notifications:
      // a) Student inquiries pending answer
      inquiriesList.forEach(inquiry => {
        const time = safeToDate(inquiry.createdAt) || new Date(0);
        list.push({
          id: `teacher-inquiry-${inquiry.id}`,
          type: 'inquiry_new',
          title: `${inquiry.studentName || 'Žák'}: ${inquiry.topic || 'Dotaz k učivu'}`,
          description: `"${(inquiry.comment || '').slice(0, 60)}${(inquiry.comment || '').length > 60 ? '...' : ''}"`,
          timestamp: time,
          isNew: time > lastViewed,
          link: '/teacher?tab=inquiries',
          tagText: 'Nový dotaz žáka',
        });
      });

      // b) Submitted tests waiting for grading
      testsList.forEach(test => {
        const time = safeToDate(test.submittedAt) || safeToDate(test.assignedAt) || new Date(0);
        list.push({
          id: `teacher-test-${test.id}`,
          type: 'test_submitted',
          title: `${test.testTitle || 'Odevzdaný test'}`,
          description: 'Žák odevzdal test, který čeká na tvé hodnocení',
          timestamp: time,
          isNew: time > lastViewed,
          link: '/teacher',
          tagText: 'K vyhodnocení',
        });
      });

      // c) Upcoming / live lessons
      lessonsList.forEach(lesson => {
        const createdTime = safeToDate(lesson.createdAt) || safeToDate(lesson.scheduledAt) || new Date(0);
        const scheduledTime = safeToDate(lesson.scheduledAt);
        const isLive = lesson.status === 'live';
        list.push({
          id: `teacher-lesson-${lesson.id}`,
          type: 'lesson',
          title: lesson.title || 'Online lekce',
          description: isLive 
            ? 'Tvá online lekce právě probíhá' 
            : `Plánováno na ${scheduledTime ? scheduledTime.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : ''}`,
          timestamp: createdTime,
          isNew: createdTime > lastViewed,
          link: '/teacher?tab=lessons',
          meetUrl: lesson.meetUrl,
          tagText: isLive ? 'Právě probíhá' : 'Plánovaná lekce',
        });
      });
    }

    // Sort descending by timestamp (newest first)
    list.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return list;
  }, [isTeacher, todosList, testsList, sheetsList, inquiriesList, lessonsList, lastViewed]);

  // Unread badge count
  const unreadCount = useMemo(() => {
    return notifications.filter(n => n.isNew).length;
  }, [notifications]);

  // Mark all as read by updating optimistic state immediately and persisting to Firestore
  const markAllAsRead = useCallback(async () => {
    const now = new Date();
    setOptimisticLastViewed(now);
    try {
      localStorage.setItem('proedu_last_viewed_activity', now.toISOString());
    } catch {}

    // Mark any unread inquiries as read for student
    if (!isTeacher && uid) {
      inquiriesList.forEach(inq => {
        if (inq.status === 'answered' && inq.isReadByStudent === false) {
          markInquiryAsRead(inq.id).catch(err => console.warn('Failed to mark inquiry as read:', err));
        }
      });
    }

    if (uid) {
      try {
        await updateProfileData({
          lastViewedActivityAt: Timestamp.fromDate(now)
        });
      } catch (err) {
        console.error('Failed to update lastViewedActivityAt:', err);
      }
    }
  }, [uid, isTeacher, inquiriesList, updateProfileData]);

  return {
    notifications,
    unreadCount,
    loading,
    markAllAsRead,
  };
}
