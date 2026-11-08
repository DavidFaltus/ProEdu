import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, Timestamp, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { safeToDate } from '../lib/utils';
import { subscribeToStudentLiveLessons, subscribeToTeacherLiveLessons } from '../services/liveLessonService';
import { markInquiryAsRead } from '../services/inquiryService';
import { LiveLesson } from '../types';

export type NotificationType = 
  | 'practice'
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
  const [practiceList, setPracticeList] = useState<any[]>([]);
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

  const role = profile?.role || 'free';
  const isTeacher = role === 'teacher';
  const isCourseUser = role === 'course';
  const isPremium = role === 'premium' || isCourseUser;
  const isFree = !isTeacher && !isPremium;
  const uid = profile?.uid;

  // Enrolled courses for course student
  const enrolledCourseIds = useMemo(() => {
    const list: string[] = [];
    if (profile?.enrolledCourseIds && Array.isArray(profile.enrolledCourseIds)) {
      list.push(...profile.enrolledCourseIds);
    }
    if (profile?.courseId && !list.includes(profile.courseId)) {
      list.push(profile.courseId);
    }
    return list;
  }, [profile?.enrolledCourseIds, profile?.courseId]);

  // Registration timestamp of user - baseline before which no notification should be displayed
  const userCreatedAt = useMemo(() => {
    return profile?.createdAt ? safeToDate(profile.createdAt) || new Date() : new Date();
  }, [profile?.createdAt]);

  // Store lastViewed timestamp to compare against (takes the latest of profile or optimistic, defaults to registration date)
  const lastViewed = useMemo(() => {
    const profileDate = profile?.lastViewedActivityAt 
      ? safeToDate(profile.lastViewedActivityAt) || userCreatedAt 
      : userCreatedAt;
    if (optimisticLastViewed && optimisticLastViewed.getTime() > profileDate.getTime()) {
      return optimisticLastViewed;
    }
    return profileDate;
  }, [profile?.lastViewedActivityAt, optimisticLastViewed, userCreatedAt]);

  // Realtime listeners based on role
  useEffect(() => {
    if (!uid) {
      setTodosList([]);
      setTestsList([]);
      setSheetsList([]);
      setPracticeList([]);
      setInquiriesList([]);
      setLessonsList([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubs: (() => void)[] = [];

    // Helper: fetch only recent items, not older than 30 days and not older than registration
    const minTimestampDate = new Date(Math.max(userCreatedAt.getTime() - 60000, Date.now() - 30 * 24 * 60 * 60 * 1000));
    const minTimestamp = Timestamp.fromDate(minTimestampDate);

    if (isTeacher) {
      // Teacher Notifications (bounded to latest 25 items)
      // 1. Pending student inquiries waiting for answer
      try {
        const qInquiries = query(
          collection(db, 'questionInquiries'),
          where('status', '==', 'pending'),
          limit(25)
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
          where('status', '==', 'submitted'),
          limit(25)
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

    } else {
      // STUDENT NOTIFICATIONS

      // 1. New practice subtopics - available to ALL students (Free, Pro, Course)
      try {
        const qPractice = query(
          collection(db, 'practiceSubtopics'),
          where('createdAt', '>=', minTimestamp),
          limit(15)
        );
        const unsubPractice = onSnapshot(
          qPractice,
          (snap) => {
            const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPracticeList(items);
          },
          (err) => console.warn('Error listening to practice subtopics notifications:', err)
        );
        unsubs.push(unsubPractice);
      } catch (err) {
        console.warn('Failed to subscribe to practice subtopics notifications', err);
      }

      // 1b. Student Todos / Assigned Practice from Teacher (for ALL students including Free)
      try {
        const qTodos = query(
          collection(db, 'todos'),
          where('studentId', '==', uid),
          where('completed', '==', false),
          limit(100)
        );
        const unsubTodos = onSnapshot(
          qTodos,
          (snap) => {
            const items = snap.docs
              .map(doc => ({ id: doc.id, ...doc.data() }))
              .filter((item: any) => item.addedBy && item.addedBy !== uid && !item.completed);
            setTodosList(items);
          },
          (err) => console.warn('Error listening to notifications (todos):', err)
        );
        unsubs.push(unsubTodos);
      } catch (err) {
        console.warn('Failed to subscribe to todos notifications', err);
      }

      // If FREE, do NOT subscribe to anything else (no materials, inquiries, tests, live lessons)
      if (!isFree) {
        // PRO & COURSE STUDENTS:

        // 2. Learning sheets (recent sheets created after minTimestamp)
        try {
          const qSheets = query(
            collection(db, 'learningSheets'),
            where('createdAt', '>=', minTimestamp),
            limit(15)
          );
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

        // 3. Student Inquiries (answered, bounded)
        try {
          const qInquiries = query(
            collection(db, 'questionInquiries'),
            where('studentId', '==', uid),
            limit(20)
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

        // 5. Student Assigned Tests
        try {
          const qTests = query(
            collection(db, 'assignedTests'),
            where('studentId', '==', uid),
            limit(20)
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

        // 6. Live lessons
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
      }
    }

    setLoading(false);

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [uid, isTeacher, isFree, isCourseUser, userCreatedAt]);

  // Aggregate into standardized notification objects
  const notifications = useMemo<AppNotification[]>(() => {
    const list: AppNotification[] = [];

    if (!isTeacher) {
      // Student notifications:

      // 1. New Practice Subtopics (for Free, Pro, and Course)
      practiceList.forEach(subtopic => {
        const time = safeToDate(subtopic.createdAt) || new Date(0);
        // Strict check: only items created after user registration
        if (time.getTime() >= userCreatedAt.getTime()) {
          list.push({
            id: `practice-${subtopic.id}`,
            type: 'practice',
            title: subtopic.title ? `Nové procvičování: ${subtopic.title}` : 'Nové procvičování',
            description: subtopic.subjectId 
              ? `${subtopic.subjectId} • K dispozici v sekci Procvičování` 
              : 'Nové cvičení k procvičení látky',
            timestamp: time,
            isNew: time > lastViewed,
            link: `/practice/session/${subtopic.id}`,
            tagText: 'Nové cvičení',
          });
        }
      });

      // 1b. Teacher-assigned Practice & Todos (for ALL students including Free)
      const practicePlansMap = new Map<string, any[]>();
      const regularTodos: any[] = [];

      todosList.forEach(todo => {
        if (todo.type === 'practice') {
          const groupKey = todo.planId || `single-${todo.id}`;
          const existing = practicePlansMap.get(groupKey) || [];
          existing.push(todo);
          practicePlansMap.set(groupKey, existing);
        } else {
          regularTodos.push(todo);
        }
      });

      practicePlansMap.forEach((group, groupKey) => {
        if (group.length === 1) {
          const todo = group[0];
          const time = safeToDate(todo.createdAt) || new Date(0);
          const dueStr = safeToDate(todo.dueDate)?.toLocaleDateString('cs-CZ') || '';
          list.push({
            id: `todo-practice-${todo.id}`,
            type: 'practice',
            title: todo.title || 'Přiřazené procvičování od učitele',
            description: dueStr
              ? `Zadáno do kalendáře • Termín: ${dueStr}`
              : 'Učitel ti přiřadil cvičení do kalendáře',
            timestamp: time,
            isNew: time > lastViewed,
            link: todo.referenceId ? `/practice/session/${todo.referenceId}` : '/',
            tagText: 'Zadáno učitelem',
          });
        } else if (group.length > 1) {
          // Seskupená notifikace pro hromadně přiřazené téma / více cvičení od učitele
          const latestTime = group.reduce((maxDate, item) => {
            const d = safeToDate(item.createdAt) || new Date(0);
            return d > maxDate ? d : maxDate;
          }, new Date(0));

          const cleanTitles = group
            .slice(0, 2)
            .map((t: any) => (t.title || '').replace(/^Procvičování:\s*/i, ''))
            .filter(Boolean);
          const extraCount = group.length - cleanTitles.length;

          list.push({
            id: `todo-plan-${groupKey}`,
            type: 'practice',
            title: `Přiřazeno ${group.length} cvičení do kalendáře`,
            description:
              cleanTitles.length > 0
                ? `${cleanTitles.join(', ')}${extraCount > 0 ? ` a další (${extraCount})` : ''}`
                : 'Učitel ti naplánoval nová procvičování v kalendáři',
            timestamp: latestTime,
            isNew: latestTime > lastViewed,
            link: '/',
            tagText: 'Zadáno učitelem',
          });
        }
      });

      // If FREE, no other notifications
      if (!isFree) {
        // 2. Learning sheets (Pro & Course)
        sheetsList.forEach(sheet => {
          const time = safeToDate(sheet.createdAt) || new Date(0);
          if (time.getTime() >= userCreatedAt.getTime()) {
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

        // 3. Regular Todos (Course-tagged for course students, standard for Pro)
        regularTodos.forEach(todo => {
          const time = safeToDate(todo.createdAt) || new Date(0);
          const isCourseTodo = isCourseUser && (
            (typeof todo.type === 'string' && todo.type.startsWith('course_')) || 
            (todo.courseId && enrolledCourseIds.includes(todo.courseId))
          );
          list.push({
            id: `todo-${todo.id}`,
            type: 'todo',
            title: todo.title || (isCourseTodo ? 'Úkol ke kurzu' : 'Nový úkol od učitele'),
            description: todo.dueDate 
              ? `Termín do: ${safeToDate(todo.dueDate)?.toLocaleDateString('cs-CZ') || ''}` 
              : (isCourseTodo ? 'Nový úkol z tvého kurzu' : 'Nový zadaný úkol v To-Do seznamu'),
            timestamp: time,
            isNew: time > lastViewed,
            link: '/',
            tagText: isCourseTodo ? 'Úkol ke kurzu' : 'Úkol',
          });
        });

        // 4. Tests (Pending & Graded)
        testsList.forEach(test => {
          const isCourseTest = isCourseUser && Boolean(test.courseId && enrolledCourseIds.includes(test.courseId));
          if (test.status === 'pending') {
            const time = safeToDate(test.assignedAt) || new Date(0);
            list.push({
              id: `test-pending-${test.id}`,
              type: 'test',
              title: test.testTitle || (isCourseTest ? 'Test ke kurzu' : 'Přiřazený test'),
              description: isCourseTest ? 'Test z tvého kurzu čeká na tvé vypracování' : 'Nový test čeká na tvé vypracování',
              timestamp: time,
              isNew: time > lastViewed,
              link: `/test/${test.id}`,
              tagText: isCourseTest ? 'Test ke kurzu' : 'Test k vyřešení',
            });
          } else if (test.status === 'graded') {
            const time = safeToDate(test.gradedAt) || safeToDate(test.submittedAt) || new Date(0);
            list.push({
              id: `test-graded-${test.id}`,
              type: 'test_review',
              title: test.testTitle || (isCourseTest ? 'Vyhodnocený test z kurzu' : 'Vyhodnocený test'),
              description: test.grade 
                ? `Výsledek: známka ${test.grade}` 
                : (test.feedback ? `Hodnocení: ${test.feedback.slice(0, 50)}...` : 'Test byl opraven učitelem'),
              timestamp: time,
              isNew: time > lastViewed,
              link: `/review/${test.id}`,
              tagText: isCourseTest ? 'Hodnocení kurzu' : 'Hodnocení testu',
            });
          }
        });

        // 5. Answered inquiries
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

        // 6. Live lessons
        lessonsList.forEach(lesson => {
          const createdTime = safeToDate(lesson.createdAt) || safeToDate(lesson.scheduledAt) || new Date(0);
          const scheduledTime = safeToDate(lesson.scheduledAt);
          const isLive = lesson.status === 'live';
          const isCourseLesson = isCourseUser && (
            lesson.targetAudience === 'individual' || 
            Boolean(lesson.studentIds?.includes(uid))
          );
          list.push({
            id: `lesson-${lesson.id}`,
            type: 'lesson',
            title: lesson.title || (isCourseLesson ? 'Online lekce kurzu' : 'Online hodina'),
            description: isLive 
              ? `Lektor ${lesson.teacherName} čeká v hovoru Google Meet` 
              : `Plánováno: ${scheduledTime ? scheduledTime.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' }) : ''} (${lesson.teacherName})`,
            timestamp: createdTime,
            isNew: createdTime > lastViewed,
            link: '/',
            meetUrl: lesson.meetUrl,
            tagText: isLive ? 'Právě probíhá' : (isCourseLesson ? 'Lekce kurzu' : 'Online lekce'),
          });
        });
      }

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
  }, [isTeacher, isFree, isCourseUser, practiceList, todosList, testsList, sheetsList, inquiriesList, lessonsList, lastViewed, userCreatedAt, enrolledCourseIds, uid]);

  // Unread badge count
  const unreadCount = useMemo(() => {
    return notifications.filter(n => n.isNew).length;
  }, [notifications]);

  // Ref to access current unreadCount without re-creating markAllAsRead callback
  const unreadCountRef = useRef(0);
  unreadCountRef.current = unreadCount;

  // Mark all as read by updating optimistic state immediately and persisting to Firestore
  const markAllAsRead = useCallback(async () => {
    if (unreadCountRef.current === 0) return;

    const now = new Date();
    setOptimisticLastViewed(now);
    try {
      localStorage.setItem('proedu_last_viewed_activity', now.toISOString());
    } catch {}

    // Mark any unread inquiries as read for student
    if (!isTeacher && uid && !isFree) {
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
  }, [uid, isTeacher, isFree, inquiriesList, updateProfileData]);

  return {
    notifications,
    unreadCount,
    loading,
    markAllAsRead,
  };
}