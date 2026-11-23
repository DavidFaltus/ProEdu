import { describe, test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  Timestamp,
  setLogLevel,
} from 'firebase/firestore';

const emulatorHostRaw = (process.env.FIRESTORE_EMULATOR_HOST || '').trim();
const hasEmulator = emulatorHostRaw.length > 0;

function parseEmulatorHostPort(raw: string): { host: string; port: number } {
  if (raw.startsWith('[')) {
    const endBracket = raw.indexOf(']');
    const host = raw.slice(1, endBracket);
    const port = Number(raw.slice(endBracket + 2)) || 8080;
    return { host, port };
  }
  const lastColon = raw.lastIndexOf(':');
  if (lastColon === -1) return { host: raw, port: 8080 };
  return {
    host: raw.slice(0, lastColon),
    port: Number(raw.slice(lastColon + 1)) || 8080,
  };
}

function makeLargeMap(count: number): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    obj[`k${i}`] = `v${i}`;
  }
  return obj;
}

describe('P0 Firestore Security Rules (Emulator)', { skip: !hasEmulator }, () => {
  let testEnv: RulesTestEnvironment;

  before(async () => {
    setLogLevel('error');
    const { host, port } = parseEmulatorHostPort(emulatorHostRaw);
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: 'proedu-p0-rules-test',
      firestore: { host, port, rules },
    });
  });

  after(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  const unauthDb = () => testEnv.unauthenticatedContext().firestore();
  const freeDb = (uid = 'student_free') =>
    testEnv.authenticatedContext(uid, { role: 'free', email: `${uid}@example.com` }).firestore();
  const premiumDb = (uid = 'student_premium') =>
    testEnv.authenticatedContext(uid, { role: 'premium', email: `${uid}@example.com` }).firestore();
  const teacherDb = (uid = 'teacher_1') =>
    testEnv.authenticatedContext(uid, { role: 'teacher', email: `${uid}@example.com` }).firestore();

  // =========================================================================
  // SEC-03: Catalog & Study collections locked to teachers only
  // =========================================================================
  test('SEC-03: practiceSubtopics, customTopics, practiceTopics, customSubjects deny unauth/free/premium and allow teacher', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, 'practiceSubtopics', 'sub1'), {
        title: 'Zlomky',
        topicId: 'top1',
        subjectId: 'Matematika',
        studyTheory: 'Placený výklad',
        studySteps: [{ title: 'Krok 1', content: 'Text', correctAnswer: '42' }],
        createdAt: now,
        createdBy: 'teacher_1',
      });
      await setDoc(doc(adminDb, 'customTopics', 'top1'), {
        title: 'Aritmetika',
        subjectId: 'Matematika',
        isHidden: true,
        createdAt: now,
        createdBy: 'teacher_1',
      });
      await setDoc(doc(adminDb, 'practiceTopics', 'ptop1'), {
        title: 'Legacy téma',
        subjectId: 'Matematika',
        createdAt: now,
        createdBy: 'teacher_1',
      });
      await setDoc(doc(adminDb, 'customSubjects', 'subj1'), {
        title: 'Matematika',
        createdAt: now,
        createdBy: 'teacher_1',
      });
    });

    const targets: Array<[string, string]> = [
      ['practiceSubtopics', 'sub1'],
      ['customTopics', 'top1'],
      ['practiceTopics', 'ptop1'],
      ['customSubjects', 'subj1'],
    ];

    for (const [col, id] of targets) {
      await assertFails(getDoc(doc(unauthDb(), col, id)));
      await assertFails(getDocs(collection(unauthDb(), col)));
      await assertFails(getDoc(doc(freeDb(), col, id)));
      await assertFails(getDocs(collection(freeDb(), col)));
      await assertFails(getDoc(doc(premiumDb(), col, id)));
      await assertFails(getDocs(collection(premiumDb(), col)));

      await assertSucceeds(getDoc(doc(teacherDb(), col, id)));
      await assertSucceeds(getDocs(collection(teacherDb(), col)));
    }
  });

  // =========================================================================
  // SEC-04: questions collection locked to teachers only
  // =========================================================================
  test('SEC-04: questions denies unauth, free, and premium reads; allows teacher reads', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'questions', 'q1'), {
        question: 'Kolik je 2 + 2?',
        type: 'open',
        correctAnswer: '4',
        explanation: 'Dvě plus dvě jsou čtyři.',
        subtopicId: 'sub1',
        createdAt: Timestamp.now(),
        createdBy: 'teacher_1',
      });
    });

    await assertFails(getDoc(doc(unauthDb(), 'questions', 'q1')));
    await assertFails(getDocs(collection(unauthDb(), 'questions')));
    await assertFails(getDoc(doc(freeDb(), 'questions', 'q1')));
    await assertFails(getDocs(collection(freeDb(), 'questions')));
    await assertFails(getDoc(doc(premiumDb(), 'questions', 'q1')));
    await assertFails(getDocs(collection(premiumDb(), 'questions')));

    await assertSucceeds(getDoc(doc(teacherDb(), 'questions', 'q1')));
    await assertSucceeds(getDocs(collection(teacherDb(), 'questions')));
  });

  // =========================================================================
  // SEC-08: users/{uid} create blocked & photoURL sanitized
  // =========================================================================
  test('SEC-08: client & teacher users/{uid} create is denied; javascript:/svg/oversized photoURL denied; valid photoURL allowed', async () => {
    // 1. Self-create DENIED (even with valid payload)
    await assertFails(
      setDoc(doc(freeDb('new_user'), 'users', 'new_user'), {
        uid: 'new_user',
        email: 'new_user@example.com',
        name: 'Spoofed',
        role: 'free',
        jokers: 5,
        streak: 0,
        createdAt: Timestamp.now(),
      })
    );

    // 2. Teacher direct client create DENIED (creation is backend Admin SDK only)
    await assertFails(
      setDoc(doc(teacherDb(), 'users', 'new_user_2'), {
        uid: 'new_user_2',
        email: 'new_user_2@example.com',
        role: 'free',
        createdAt: Timestamp.now(),
      })
    );

    // Seed existing user doc via Admin SDK
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'student_free'), {
        uid: 'student_free',
        email: 'student_free@example.com',
        name: 'Jan',
        role: 'free',
        jokers: 5,
        streak: 0,
        createdAt: Timestamp.now(),
      });
    });

    const uRef = doc(freeDb('student_free'), 'users', 'student_free');

    // Malicious / invalid photoURL values DENIED
    await assertFails(updateDoc(uRef, { photoURL: 'javascript:alert(1)' }));
    await assertFails(updateDoc(uRef, { photoURL: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }));
    await assertFails(updateDoc(uRef, { photoURL: 'data:text/html;base64,PHNjcmlwdD4=' }));
    await assertFails(updateDoc(uRef, { photoURL: 'http://insecure.example/avatar.png' }));
    await assertFails(updateDoc(uRef, { photoURL: 'data:image/jpeg;base64,' + 'A'.repeat(160000) }));

    // Privilege escalation DENIED
    await assertFails(updateDoc(uRef, { role: 'premium' }));
    await assertFails(updateDoc(uRef, { jokers: 999 }));

    // Valid photoURL & profile updates ALLOWED
    await assertSucceeds(updateDoc(uRef, { photoURL: 'https://lh3.googleusercontent.com/a/avatar123' }));
    await assertSucceeds(updateDoc(uRef, { photoURL: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==' }));
    await assertSucceeds(updateDoc(uRef, { photoURL: '' }));
    await assertSucceeds(updateDoc(uRef, { photoURL: null, name: 'Jan Novák', updatedAt: Timestamp.now() }));
  });

  // =========================================================================
  // SEC-12: Write hardening across todos, timestamps, sessions, studyProgress, bugReports, assignedTests
  // =========================================================================
  test('SEC-12: todos blocks cross-user userId injection and restricts types by tier', async () => {
    const now = Timestamp.now();

    // Cross-user userId injection DENIED
    await assertFails(
      addDoc(collection(freeDb('attacker'), 'todos'), {
        studentId: 'attacker',
        userId: 'victim_uid',
        title: 'Podvržený úkol',
        type: 'custom',
        completed: false,
        addedBy: 'attacker',
        createdAt: now,
      })
    );

    // Free user creating non-custom todos DENIED
    for (const forbiddenType of ['test', 'practice', 'lesson', 'course_lesson']) {
      await assertFails(
        addDoc(collection(freeDb('student_free'), 'todos'), {
          studentId: 'student_free',
          title: `Zakázaný ${forbiddenType}`,
          type: forbiddenType,
          completed: false,
          addedBy: 'student_free',
          createdAt: now,
        })
      );
    }

    // Free user creating custom todo (with or without own userId) ALLOWED
    await assertSucceeds(
      addDoc(collection(freeDb('student_free'), 'todos'), {
        studentId: 'student_free',
        title: 'Můj vlastní úkol',
        type: 'custom',
        completed: false,
        addedBy: 'student_free',
        createdAt: now,
      })
    );
    await assertSucceeds(
      addDoc(collection(freeDb('student_free'), 'todos'), {
        studentId: 'student_free',
        userId: 'student_free',
        title: 'Můj úkol s vlastním userId',
        type: 'custom',
        completed: false,
        addedBy: 'student_free',
        createdAt: now,
      })
    );

    // Premium user: practice & course_lesson ALLOWED, test DENIED
    await assertSucceeds(
      addDoc(collection(premiumDb('student_premium'), 'todos'), {
        studentId: 'student_premium',
        title: 'Naplánované procvičování',
        type: 'practice',
        completed: false,
        addedBy: 'student_premium',
        createdAt: now,
      })
    );
    await assertSucceeds(
      addDoc(collection(premiumDb('student_premium'), 'todos'), {
        studentId: 'student_premium',
        title: 'Online lekce: Matematika',
        type: 'course_lesson',
        completed: false,
        addedBy: 'student_premium',
        referenceId: 'lesson_1',
        createdAt: now,
      })
    );
    await assertFails(
      addDoc(collection(premiumDb('student_premium'), 'todos'), {
        studentId: 'student_premium',
        title: 'Falešný test',
        type: 'test',
        completed: false,
        addedBy: 'student_premium',
        createdAt: now,
      })
    );

    // Teacher creating test todo for student ALLOWED
    await assertSucceeds(
      addDoc(collection(teacherDb(), 'todos'), {
        studentId: 'student_free',
        title: 'Zadaný test z algebry',
        type: 'test',
        completed: false,
        addedBy: 'teacher_1',
        assignedTestId: 'atest_1',
        createdAt: now,
      })
    );
  });

  test('SEC-12: isTimestampOrString rejects 500-char strings and accepts valid ISO/Timestamp values', async () => {
    const longStr = 'A'.repeat(500);

    await assertFails(
      addDoc(collection(freeDb('student_free'), 'todos'), {
        studentId: 'student_free',
        title: 'Spam timestamp',
        type: 'custom',
        completed: false,
        addedBy: 'student_free',
        createdAt: longStr,
      })
    );

    await assertSucceeds(
      addDoc(collection(freeDb('student_free'), 'todos'), {
        studentId: 'student_free',
        title: 'Valid ISO timestamp',
        type: 'custom',
        completed: false,
        addedBy: 'student_free',
        createdAt: '2026-11-23T15:00:00.000Z',
      })
    );
  });

  test('SEC-12: activePracticeSessions enforces sessionId prefix and map size caps (<= 100)', async () => {
    const baseSession = {
      studentId: 'student_free',
      subtopicId: 'sub_math_1',
      topicId: 'top_1',
      subjectId: 'Matematika',
      questionIds: ['q1', 'q2'],
      currentIndex: 0,
      answeredCount: 1,
      totalCount: 2,
      answersMap: { '0': { isCorrect: true } },
      openInputs: { '1': 'x=2' },
      showHintMap: { '0': false },
      bookmarkedIndices: [],
      updatedAt: Timestamp.now(),
    };

    // Wrong sessionId DENIED
    await assertFails(
      setDoc(doc(freeDb('student_free'), 'activePracticeSessions', 'arbitrary_id'), baseSession)
    );
    await assertFails(
      setDoc(doc(freeDb('student_free'), 'activePracticeSessions', 'other_user_sub_math_1'), baseSession)
    );

    // Oversized maps (> 100 keys) DENIED
    await assertFails(
      setDoc(doc(freeDb('student_free'), 'activePracticeSessions', 'student_free_sub_math_1'), {
        ...baseSession,
        answersMap: makeLargeMap(101),
      })
    );
    await assertFails(
      setDoc(doc(freeDb('student_free'), 'activePracticeSessions', 'student_free_sub_math_1'), {
        ...baseSession,
        openInputs: makeLargeMap(101),
      })
    );
    await assertFails(
      setDoc(doc(freeDb('student_free'), 'activePracticeSessions', 'student_free_sub_math_1'), {
        ...baseSession,
        showHintMap: makeLargeMap(101),
      })
    );

    // Valid sessionId & bounded maps ALLOWED
    await assertSucceeds(
      setDoc(doc(freeDb('student_free'), 'activePracticeSessions', 'student_free_sub_math_1'), baseSession)
    );
  });

  test('SEC-12: studyProgress caps verifiedAnswers <= 100', async () => {
    const validRef = doc(freeDb('student_free'), 'users', 'student_free', 'studyProgress', 'sub1');

    await assertFails(
      setDoc(validRef, {
        uid: 'student_free',
        subtopicId: 'sub1',
        completedSteps: [0, 1],
        verifiedAnswers: makeLargeMap(101),
        totalSteps: 5,
        updatedAt: Timestamp.now(),
      })
    );

    await assertSucceeds(
      setDoc(validRef, {
        uid: 'student_free',
        subtopicId: 'sub1',
        completedSteps: [0, 1],
        verifiedAnswers: { '0': 'ano', '1': 'bylina' },
        totalSteps: 5,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
    );
  });

  test('SEC-12: direct client bugReports create and student assignedTests update are DENIED', async () => {
    const now = Timestamp.now();

    // Direct bugReports create DENIED (must use POST /api/bug-reports/submit)
    await assertFails(
      addDoc(collection(freeDb('student_free'), 'bugReports'), {
        userId: 'student_free',
        category: 'technical',
        description: 'Direct client bypass attempt',
        pageUrl: 'javascript:alert(1)',
        status: 'pending',
        createdAt: now,
      })
    );

    // Seed assignedTest via Admin SDK
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'assignedTests', 'test_1'), {
        studentId: 'student_free',
        teacherId: 'teacher_1',
        title: 'Test z algebry',
        status: 'assigned',
        questions: [{ id: 'q1', question: '2+2', correctAnswer: '4' }],
        createdBy: 'teacher_1',
        createdAt: now,
      });
    });

    // Student direct update/submit DENIED (must use POST /api/assigned-tests/:id/submit)
    await assertFails(
      updateDoc(doc(freeDb('student_free'), 'assignedTests', 'test_1'), {
        status: 'submitted',
        answers: { q1: '4' },
        submittedAt: now,
      })
    );
    await assertFails(
      updateDoc(doc(freeDb('student_free'), 'assignedTests', 'test_1'), {
        status: 'in_progress',
        startedAt: now,
      })
    );
  });

  // =========================================================================
  // SEC-13: Heavily populated document updates stay well under 1000-expression ceiling
  // =========================================================================
  test('SEC-13: heavily populated learningSheets updates succeed without hitting 1000-expression limit', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'learningSheets', 'sheet_full'), {
        id: 'sheet_full',
        title: 'Kompletní pracovní list: Zlomky',
        subject: 'Matematika',
        subjectId: 'Matematika',
        topic: 'Zlomky a desetinná čísla',
        topicId: 'top_zlomky',
        subtopicId: 'sub_zlomky_1',
        studyTheory: 'Teorie ke zlomkům...',
        content: JSON.stringify({ studyTheory: 'Teorie', svgContent: '<svg></svg>' }),
        svgContent: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>',
        studySteps: [{ title: 'Krok 1', content: 'Sčítání zlomků' }],
        hiddenFromLibrary: false,
        isHidden: false,
        materialType: 'worksheet',
        grade: '9',
        order: 1,
        pageCount: 4,
        isFreeSample: false,
        isExamPrep: true,
        activeChunkPrefix: 'v1_chunk_',
        status: 'ready',
        errorMessage: null,
        originalName: 'zlomky.pdf',
        fileType: 'application/pdf',
        fileSize: 450000,
        thumbnailUrl: '/api/materials/sheet_full/thumbnail',
        fileUrl: '/api/materials/sheet_full/file',
        pdfUrl: '/api/materials/sheet_full/file',
        svgUrl: null,
        downloadUrl: '/api/materials/sheet_full/download',
        hasStudyMaterial: true,
        hasThumbnailChunk: true,
        chunkCount: 3,
        chunkedPdf: true,
        createdBy: 'teacher_1',
        createdAt: now,
        updatedAt: now,
      });
    });

    const sheetRef = doc(teacherDb(), 'learningSheets', 'sheet_full');

    // 1. Partial teacher update
    await assertSucceeds(
      updateDoc(sheetRef, {
        title: 'Aktualizovaný pracovní list: Zlomky',
        order: 2,
        updatedAt: Timestamp.now(),
      })
    );

    // 2. Full saveMaterial-style multi-field update (20+ fields changed at once!)
    await assertSucceeds(
      updateDoc(sheetRef, {
        title: 'Kompletně upravený list',
        subject: 'Matematika',
        topic: 'Zlomky 2',
        topicId: 'top_zlomky_2',
        subtopicId: 'sub_zlomky_2',
        materialType: 'cheatsheet',
        grade: '7',
        order: 3,
        pageCount: 5,
        isFreeSample: true,
        isExamPrep: false,
        hiddenFromLibrary: true,
        studyTheory: 'Nová teorie',
        svgContent: '<svg viewBox="0 0 50 50"></svg>',
        fileUrl: '/api/materials/sheet_full/file?v=2',
        pdfUrl: '/api/materials/sheet_full/file?v=2',
        downloadUrl: '/api/materials/sheet_full/download?v=2',
        thumbnailUrl: '/api/materials/sheet_full/thumbnail?v=2',
        fileType: 'application/pdf',
        hasStudyMaterial: true,
        content: '{"v":2}',
        updatedAt: Timestamp.now(),
      })
    );

    // 3. Immutable createdBy change DENIED
    await assertFails(updateDoc(sheetRef, { createdBy: 'another_teacher' }));
  });

  test('SEC-13: heavily populated assignedTests teacher updates succeed without hitting 1000-expression limit', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'assignedTests', 'atest_full'), {
        studentId: 'student_free',
        studentName: 'Jan Novák',
        teacherId: 'teacher_1',
        createdBy: 'teacher_1',
        testId: 'tpl_1',
        title: 'Přijímačkový test nanečisto',
        testTitle: 'Přijímačkový test nanečisto',
        description: 'Kompletní cvičný test',
        subjectId: 'Matematika',
        topicId: 'top_1',
        subtopicId: 'sub_1',
        courseId: 'course_math',
        autoGrade: true,
        questions: [{ id: 'q1', question: '2+2', correctAnswer: '4' }],
        answers: { q1: '4' },
        status: 'submitted',
        grade: null,
        score: 1,
        maxScore: 1,
        feedback: null,
        dueDate: now,
        assignedAt: now,
        startedAt: now,
        submittedAt: now,
        gradedAt: null,
        timeSpentSeconds: 120,
        createdAt: now,
        updatedAt: now,
      });
    });

    const testRef = doc(teacherDb(), 'assignedTests', 'atest_full');

    // Teacher grading update succeeds cleanly
    await assertSucceeds(
      updateDoc(testRef, {
        status: 'graded',
        grade: '1',
        score: 1,
        feedback: 'Výborná práce!',
        gradedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
    );

    // Teacher cannot mutate immutable studentId
    await assertFails(updateDoc(testRef, { studentId: 'other_student' }));
  });

  test('SEC-13: heavily populated users doc owner & teacher updates succeed without hitting 1000-expression limit', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'student_heavy'), {
        uid: 'student_heavy',
        email: 'heavy@example.com',
        name: 'Karel',
        displayName: 'Karel Dvořák',
        photoURL: 'https://lh3.googleusercontent.com/avatar',
        avatarEmoji: '🦊',
        avatarBgColor: '#FEF3C7',
        role: 'premium',
        jokers: 15,
        streak: 12,
        dailyVideosWatched: 2,
        lastDailyGrantDate: '2026-11-23',
        lastJokerResetDate: '2026-11-23',
        lastViewedActivityAt: now,
        notificationsReadAt: now,
        referralCode: 'KAREL123',
        referralsCount: 3,
        referredBy: 'FRIEND1',
        enrolledCourseIds: ['course_math', 'course_czech'],
        courseId: 'course_math',
        subscriptionStatus: 'active',
        subscriptionPeriodEnd: '2026-12-23T00:00:00.000Z',
        subscriptionExpiresAt: '2026-12-23T00:00:00.000Z',
        initRecurringTransId: 'TR_12345',
        recurringCancelled: false,
        iuctoCustomerId: '99123',
        premiumSince: '2026-01-01T00:00:00.000Z',
        surveyCompleted: true,
        surveyAnswer: 'google',
        surveySubmittedAt: now,
        xp: 2500,
        gardenPlants: [{ id: 'p1', type: 'oak' }],
        focusAreas: ['Zlomky', 'Rovnice'],
        year: 9,
        targetSchool: 'Gymnázium',
        goalGrade: '1',
        weeklyGoal: 5,
        dailyGoalMinutes: 30,
        preferredDifficulty: 'medium',
        onboardingCompleted: true,
        preferredPaymentMethod: 'comgate',
        billingDetails: {
          clientName: 'Karel Dvořák',
          invoiceEmail: 'heavy@example.com',
          street: 'Hlavní 1',
          city: 'Praha',
          zip: '11000',
          country: 'CZ',
        },
        createdAt: now,
        updatedAt: now,
      });
    });

    const ownerRef = doc(premiumDb('student_heavy'), 'users', 'student_heavy');

    // 1. Owner partial update
    await assertSucceeds(
      updateDoc(ownerRef, {
        name: 'Karel Dvořák ml.',
        lastViewedActivityAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
    );

    // 2. Owner large multi-field profile update (14 allowed fields + billingDetails + base64 photoURL)
    await assertSucceeds(
      updateDoc(ownerRef, {
        displayName: 'Karel D.',
        name: 'Karel D.',
        photoURL: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
        avatarEmoji: '🚀',
        avatarBgColor: '#E0F2FE',
        year: 9,
        targetSchool: 'Gymnázium Brno',
        goalGrade: '1',
        weeklyGoal: 7,
        dailyGoalMinutes: 45,
        preferredDifficulty: 'hard',
        onboardingCompleted: true,
        focusAreas: ['Zlomky', 'Geometrie', 'Slovní úlohy'],
        preferredPaymentMethod: 'comgate',
        billingDetails: {
          clientName: 'Karel D.',
          invoiceEmail: 'heavy@example.com',
          street: 'Nová 2',
          city: 'Brno',
          zip: '60200',
          country: 'CZ',
        },
        updatedAt: Timestamp.now(),
      })
    );

    // 3. Teacher update on heavily populated user doc
    await assertSucceeds(
      updateDoc(doc(teacherDb(), 'users', 'student_heavy'), {
        surveyCompleted: false,
        surveyAnswer: null,
        updatedAt: Timestamp.now(),
      })
    );
  });

  test('SEC-13: heavily populated practiceSubtopics teacher updates succeed without hitting 1000-expression limit', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'practiceSubtopics', 'sub_heavy'), {
        id: 'sub_heavy',
        title: 'Lineární rovnice',
        topicId: 'top_alg',
        topic: 'Algebra',
        subjectId: 'Matematika',
        description: 'Řešení lineárních rovnic',
        order: 1,
        isHidden: false,
        hasStudyMaterial: true,
        materialId: 'mat_1',
        pairedMaterialId: 'mat_lib_1',
        fileUrl: '/api/materials/mat_1/file',
        pdfUrl: '/api/materials/mat_1/file',
        downloadUrl: '/api/materials/mat_1/download',
        thumbnailUrl: '/api/materials/mat_1/thumbnail',
        fileType: 'application/pdf',
        originalName: 'rovnice.pdf',
        svgUrl: null,
        svgContent: '<svg></svg>',
        studyTheory: 'Ekvivalentní úpravy rovnic...',
        studySteps: [{ title: 'Krok 1', content: 'Převod členů' }],
        studyTips: ['Zkouška!'],
        studyImages: [],
        studyVideos: [],
        sampleProblem: { problem: '2x = 6', correctAnswer: '3' },
        practiceConfig: { totalCount: 10 },
        createdBy: 'teacher_1',
        createdAt: now,
        updatedAt: now,
      });
    });

    const subRef = doc(teacherDb(), 'practiceSubtopics', 'sub_heavy');
    await assertSucceeds(updateDoc(subRef, { order: 4, isHidden: true, updatedAt: Timestamp.now() }));
    await assertFails(updateDoc(subRef, { createdBy: 'hijacked_uid' }));
  });
});
