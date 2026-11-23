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
  deleteDoc,
  Timestamp,
  setLogLevel,
} from 'firebase/firestore';

const emulatorHostRaw = (process.env.FIRESTORE_EMULATOR_HOST || '').trim();
const hasEmulator = emulatorHostRaw.length > 0;

function parseEmulatorHostPort(raw: string): { host: string; port: number } {
  const cleaned = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (cleaned.startsWith('[')) {
    const endBracket = cleaned.indexOf(']');
    const host = cleaned.slice(1, endBracket);
    const port = Number(cleaned.slice(endBracket + 2)) || 8080;
    return { host, port };
  }
  const lastColon = cleaned.lastIndexOf(':');
  if (lastColon === -1) return { host: cleaned, port: 8080 };
  return {
    host: cleaned.slice(0, lastColon),
    port: Number(cleaned.slice(lastColon + 1)) || 8080,
  };
}

// =============================================================================
// NON-EMULATOR STRUCTURAL VERIFICATION (SEC-42 Composite Index)
// =============================================================================
describe('P2 Firestore Indexes Verification (SEC-42)', () => {
  test('firestore.indexes.json contains composite index on liveLessons (courseId ASC, status ASC) without duplicates', () => {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'firestore.indexes.json'), 'utf8');
    const parsed = JSON.parse(raw) as {
      indexes: Array<{
        collectionGroup: string;
        queryScope: string;
        fields: Array<{ fieldPath: string; order?: string; arrayConfig?: string }>;
      }>;
    };

    assert.ok(Array.isArray(parsed.indexes), 'indexes must be an array');

    // Ensure no duplicate composite index definitions exist
    const seen = new Set<string>();
    for (const idx of parsed.indexes) {
      const sig = `${idx.collectionGroup}:${idx.queryScope}:${idx.fields
        .map((f) => `${f.fieldPath}=${f.order || f.arrayConfig}`)
        .join(',')}`;
      assert.equal(seen.has(sig), false, `Duplicate Firestore index definition found: ${sig}`);
      seen.add(sig);
    }

    const liveCourseStatusIndex = parsed.indexes.find(
      (idx) =>
        idx.collectionGroup === 'liveLessons' &&
        idx.fields.length === 2 &&
        idx.fields[0].fieldPath === 'courseId' &&
        idx.fields[0].order === 'ASCENDING' &&
        idx.fields[1].fieldPath === 'status' &&
        idx.fields[1].order === 'ASCENDING'
    );

    assert.ok(
      liveCourseStatusIndex,
      'firestore.indexes.json must include composite index on liveLessons (courseId ASC, status ASC)'
    );
  });
});

// =============================================================================
// REAL FIRESTORE EMULATOR TESTS (SEC-29, SEC-31, SEC-33, SEC-42)
// =============================================================================
describe('P2 Firestore Rules & Schema Reconciliation (SEC-29, SEC-31, SEC-33, SEC-42 — Emulator)', { skip: !hasEmulator }, () => {
  let testEnv: RulesTestEnvironment;

  before(async () => {
    setLogLevel('error');
    const { host, port } = parseEmulatorHostPort(emulatorHostRaw);
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: 'proedu-p2-rules-schema-test',
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
  const courseDb = (uid = 'student_course', enrolledCourseIds: string[] = ['course_math']) =>
    testEnv
      .authenticatedContext(uid, { role: 'course', enrolledCourseIds, email: `${uid}@example.com` })
      .firestore();
  const teacherDb = (uid = 'teacher_1') =>
    testEnv.authenticatedContext(uid, { role: 'teacher', email: `${uid}@example.com` }).firestore();

  // =========================================================================
  // SEC-29: Reconcile live schema drift across all 8 collections
  // =========================================================================

  test('SEC-29 (1/8): populated todos with assignedTestId & courseId allow teacher and student updates', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'todos', 'todo_test_1'), {
        studentId: 'student_free',
        userId: 'student_free',
        title: 'Zadaný test: Zlomky',
        description: 'Vypracuj test do pátku',
        type: 'test',
        completed: false,
        addedBy: 'teacher_1',
        assignedTestId: 'atest_123',
        courseId: 'course_math',
        referenceId: 'sub_zlomky',
        subjectId: 'Matematika',
        topicId: 'top_zlomky',
        planId: 'plan_1',
        repetitionIndex: 1,
        totalRepetitions: 3,
        dueDate: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    // Teacher reschedules populated todo with assignedTestId + courseId
    await assertSucceeds(
      updateDoc(doc(teacherDb(), 'todos', 'todo_test_1'), {
        dueDate: Timestamp.fromMillis(now.toMillis() + 86400000),
        updatedAt: Timestamp.now(),
      })
    );

    // Student marks teacher-assigned todo with assignedTestId + courseId as completed
    await assertSucceeds(
      updateDoc(doc(freeDb('student_free'), 'todos', 'todo_test_1'), {
        completed: true,
        completedAt: Timestamp.now(),
      })
    );

    // Student cannot tamper with assignedTestId or courseId
    await assertFails(
      updateDoc(doc(freeDb('student_free'), 'todos', 'todo_test_1'), {
        assignedTestId: 'hijacked_test',
      })
    );
  });

  test('SEC-29 (2/8): assignedTests supports testTitle, testDescription, autoGrade, courseId, topic, status:pending on create & partial-safe update', async () => {
    const now = Timestamp.now();
    const testRef = doc(teacherDb(), 'assignedTests', 'atest_p2');

    // Create fully populated assignedTest with all SEC-29 fields
    await assertSucceeds(
      setDoc(testRef, {
        studentId: 'student_free',
        studentName: 'Jan Novák',
        teacherId: 'teacher_1',
        createdBy: 'teacher_1',
        testId: 'tpl_9',
        title: 'Přijímačkový test',
        testTitle: 'Přijímačkový test: Lineární rovnice',
        description: 'Krátký popis',
        testDescription: 'Podrobný popis zadaného testu z kurzu matematiky',
        subjectId: 'Matematika',
        topicId: 'top_alg',
        topic: 'Algebra a rovnice',
        subtopicId: 'sub_lin_eq',
        courseId: 'course_math',
        autoGrade: true,
        questions: [{ id: 'q1', question: '2x = 6', correctAnswer: '3' }],
        answers: {},
        status: 'pending',
        grade: null,
        score: 0,
        maxScore: 1,
        feedback: null,
        dueDate: now,
        assignedAt: now,
        startedAt: null,
        submittedAt: null,
        gradedAt: null,
        timeSpentSeconds: 0,
        createdAt: now,
        updatedAt: now,
      })
    );

    // Partial-safe update modifying SEC-29 fields stays well under 1000 expressions
    await assertSucceeds(
      updateDoc(testRef, {
        testTitle: 'Aktualizovaný název testu',
        testDescription: 'Aktualizovaný popis testu',
        topic: 'Lineární rovnice a nerovnice',
        autoGrade: false,
        courseId: 'course_combo',
        status: 'graded',
        grade: '1',
        feedback: 'Skvělá práce!',
        gradedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      })
    );

    // Reject invalid status or unexpected field
    await assertFails(updateDoc(testRef, { status: 'invalid_status' }));
    await assertFails(updateDoc(testRef, { unknownField: 'nope' }));
    // Reject mutating immutable fields
    await assertFails(updateDoc(testRef, { studentId: 'other_student' }));
    await assertFails(updateDoc(testRef, { createdAt: Timestamp.fromMillis(1000) }));
  });

  test('SEC-29 (3/8): courseItems allows addedBy, attachments (<=20), date on create & partial-safe update', async () => {
    const now = Timestamp.now();
    const itemRef = doc(teacherDb(), 'courseItems', 'item_p2');

    // Create populated courseItem with addedBy, attachments (3 items), and date
    await assertSucceeds(
      setDoc(itemRef, {
        courseId: 'course_math',
        title: 'Týden 1: Zlomky a desetinná čísla',
        description: 'Úvodní hodina kurzu',
        type: 'lesson',
        order: 1,
        url: 'https://www.proeducator.eu/learning',
        fileUrl: '/api/materials/mat_1/file',
        meetUrl: 'https://meet.google.com/abc-defg-hij',
        materialId: 'mat_1',
        subtopicId: 'sub_zlomky',
        content: 'Obsah lekce...',
        isHidden: false,
        dueDate: now,
        scheduledAt: now,
        date: '2026-11-25T17:00:00.000Z',
        attachments: [
          { name: 'list.pdf', url: '/api/materials/mat_1/file' },
          { name: 'ukol.pdf', url: '/api/materials/mat_2/file' },
        ],
        addedBy: 'teacher_1',
        createdBy: 'teacher_1',
        createdAt: now,
        updatedAt: now,
      })
    );

    // Partial-safe update with Timestamp date and updated attachments
    await assertSucceeds(
      updateDoc(itemRef, {
        title: 'Týden 1 (upraveno)',
        date: Timestamp.now(),
        attachments: Array.from({ length: 20 }, (_, i) => ({ name: `f${i}.pdf` })),
        addedBy: 'teacher_1',
        updatedAt: Timestamp.now(),
      })
    );

    // Reject attachments list > 20 items
    await assertFails(
      updateDoc(itemRef, {
        attachments: Array.from({ length: 21 }, (_, i) => ({ name: `f${i}.pdf` })),
      })
    );

    // Reject oversized date string (> 40 chars)
    await assertFails(updateDoc(itemRef, { date: '2026-11-25'.repeat(10) }));

    // Enrolled student reads non-hidden courseItem; unenrolled student is denied
    await assertSucceeds(getDoc(doc(courseDb('student_math', ['course_math']), 'courseItems', 'item_p2')));
    await assertFails(getDoc(doc(courseDb('student_cz', ['course_czech']), 'courseItems', 'item_p2')));
  });

  test('SEC-29 (4/8): practiceCourses & courses allow isVisible, topic, topics (<=100), numeric & string price without hitting expression limit', async () => {
    const now = Timestamp.now();
    const pcRef = doc(teacherDb(), 'practiceCourses', 'pc_math_9');
    const cRef = doc(teacherDb(), 'courses', 'course_math_9');

    const fullCourseDoc = {
      id: 'pc_math_9',
      title: 'Intenzivní příprava z matematiky',
      description: 'Kompletní příprava na CERMAT',
      subject: 'Matematika',
      topic: 'Algebra',
      topics: ['Zlomky', 'Rovnice', 'Geometrie', 'Slovní úlohy'],
      price: 2490,
      difficulty: 'Střední',
      schedule: 'Úterý 17:00 – 18:30',
      instructorName: 'Mgr. Petr Horák',
      startDate: '2026-10-01',
      endDate: '2027-04-10',
      badge: 'Matematika',
      color: 'blue',
      meetUrl: 'https://meet.google.com/abc-defg-hij',
      syllabus: ['Téma 1', 'Téma 2'],
      teacherId: 'teacher_1',
      studentIds: ['student_1', 'student_2'],
      studentCount: 2,
      isHidden: false,
      isVisible: true,
      category: '9. třída',
      duration: '20 týdnů',
      lessonsCount: 20,
      createdBy: 'teacher_1',
      createdAt: now,
      updatedAt: now,
    };

    // Create & partial update on practiceCourses
    await assertSucceeds(setDoc(pcRef, fullCourseDoc));
    await assertSucceeds(
      updateDoc(pcRef, {
        isVisible: false,
        topic: 'Geometrie',
        topics: Array.from({ length: 100 }, (_, i) => `Téma ${i + 1}`),
        updatedAt: Timestamp.now(),
      })
    );

    // Reject topics > 100
    await assertFails(
      updateDoc(pcRef, {
        topics: Array.from({ length: 101 }, (_, i) => `Téma ${i + 1}`),
      })
    );

    // Create & update on courses with both string price (CoursesManager UI) and numeric price
    await assertSucceeds(setDoc(cRef, { ...fullCourseDoc, id: 'course_math_9', price: '2 490 Kč / sezóna' }));
    await assertSucceeds(updateDoc(cRef, { price: 2490, isVisible: true, topic: 'Kompletní matematika' }));

    // Immutable createdBy cannot be modified
    await assertFails(updateDoc(cRef, { createdBy: 'other_teacher' }));
  });

  test('SEC-29 (5/8): learningSheets confirms svgContent allowed on create and partial update', async () => {
    const now = Timestamp.now();
    const sheetRef = doc(teacherDb(), 'learningSheets', 'sheet_svg_p2');

    await assertSucceeds(
      setDoc(sheetRef, {
        title: 'Geometrie — přehled',
        subject: 'Matematika',
        svgContent: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>',
        createdBy: 'teacher_1',
        createdAt: now,
        updatedAt: now,
      })
    );

    await assertSucceeds(
      updateDoc(sheetRef, {
        svgContent: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="50" cy="50" r="40"/></svg>',
        updatedAt: Timestamp.now(),
      })
    );
  });

  test('SEC-29 (6/8): activePracticeSessions allows setDoc omitting createdAt or keeping it unchanged, while rejecting changing createdAt', async () => {
    const originalCreatedAt = Timestamp.fromMillis(1700000000000);
    const sessionId = 'student_free_sub_zlomky';

    // Seed an existing activePracticeSessions document WITH createdAt
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'activePracticeSessions', sessionId), {
        studentId: 'student_free',
        subtopicId: 'sub_zlomky',
        topicId: 'top_1',
        subjectId: 'Matematika',
        questionIds: ['q1', 'q2', 'q3'],
        currentIndex: 0,
        answeredCount: 0,
        totalCount: 3,
        answersMap: {},
        openInputs: {},
        showHintMap: {},
        bookmarkedIndices: [],
        createdAt: originalCreatedAt,
        updatedAt: originalCreatedAt,
      });
    });

    const sRef = doc(freeDb('student_free'), 'activePracticeSessions', sessionId);

    // 1. updateDoc keeping createdAt untouched SUCCEEDS
    await assertSucceeds(
      updateDoc(sRef, {
        currentIndex: 1,
        answeredCount: 1,
        answersMap: { '0': { isCorrect: true } },
        updatedAt: Timestamp.now(),
      })
    );

    // 2. Attempting to change existing createdAt to a DIFFERENT timestamp is DENIED
    await assertFails(
      updateDoc(sRef, {
        createdAt: Timestamp.fromMillis(1800000000000),
        updatedAt: Timestamp.now(),
      })
    );
    await assertFails(
      setDoc(sRef, {
        studentId: 'student_free',
        subtopicId: 'sub_zlomky',
        topicId: 'top_1',
        subjectId: 'Matematika',
        questionIds: ['q1', 'q2', 'q3'],
        currentIndex: 2,
        answeredCount: 2,
        totalCount: 3,
        answersMap: { '0': { isCorrect: true }, '1': { isCorrect: false } },
        openInputs: {},
        showHintMap: {},
        bookmarkedIndices: [],
        createdAt: Timestamp.fromMillis(1900000000000),
        updatedAt: Timestamp.now(),
      })
    );
    await assertFails(
      updateDoc(sRef, {
        createdAt: null,
      })
    );

    // 3. setDoc() OMITTING createdAt (exact behavior of practiceService.saveActivePracticeSession) SUCCEEDS!
    await assertSucceeds(
      setDoc(sRef, {
        studentId: 'student_free',
        subtopicId: 'sub_zlomky',
        topicId: 'top_1',
        subjectId: 'Matematika',
        questionIds: ['q1', 'q2', 'q3'],
        currentIndex: 2,
        answeredCount: 2,
        totalCount: 3,
        answersMap: { '0': { isCorrect: true }, '1': { isCorrect: true } },
        openInputs: { '2': 'x = 5' },
        showHintMap: { '1': true },
        bookmarkedIndices: [2],
        updatedAt: Timestamp.now(),
      })
    );
  });

  test('SEC-29 (7/8): questionInquiries enforces 2000-char comment cap', async () => {
    const now = Timestamp.now();

    // Exact 2000-char comment ALLOWED
    await assertSucceeds(
      addDoc(collection(freeDb('student_free'), 'questionInquiries'), {
        studentId: 'student_free',
        studentName: 'Jan',
        questionId: 'q1',
        questionText: '2 + 2 = ?',
        topic: 'Aritmetika',
        comment: 'A'.repeat(2000),
        status: 'pending',
        isReadByStudent: false,
        senderRole: 'student',
        createdAt: now,
      })
    );

    // 2001-char comment DENIED
    await assertFails(
      addDoc(collection(freeDb('student_free'), 'questionInquiries'), {
        studentId: 'student_free',
        studentName: 'Jan',
        questionId: 'q1',
        questionText: '2 + 2 = ?',
        topic: 'Aritmetika',
        comment: 'A'.repeat(2001),
        status: 'pending',
        isReadByStudent: false,
        senderRole: 'student',
        createdAt: now,
      })
    );
  });

  // =========================================================================
  // SEC-31: Teacher CRUD hardening on users & peer studentIds UID isolation
  // =========================================================================

  test('SEC-31 & SEC-29 (8/8): users blocks teacher direct delete, role promotion, isAdmin, unvalidated fields, and cross-teacher edits while allowing valid survey resets', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, 'users', 'student_target'), {
        uid: 'student_target',
        email: 'target@example.com',
        name: 'Petr Svoboda',
        role: 'free',
        jokers: 10,
        streak: 4,
        enrolledCourseIds: [],
        surveyCompleted: true,
        surveyAnswer: 'other',
        surveyAnswerCustom: 'Od kamaráda',
        surveyCustomAnswer: 'Legacy text',
        surveySchool: 'ZŠ Praha',
        surveyGrade: '9',
        createdAt: now,
        updatedAt: now,
      });
      await setDoc(doc(adminDb, 'users', 'teacher_colleague'), {
        uid: 'teacher_colleague',
        email: 'colleague@example.com',
        name: 'Mgr. Kolega',
        role: 'teacher',
        createdAt: now,
        updatedAt: now,
      });
    });

    const tDb = teacherDb('teacher_1');
    const studentRef = doc(tDb, 'users', 'student_target');
    const colleagueRef = doc(tDb, 'users', 'teacher_colleague');

    // 1. Direct user deletion DENIED even for teachers (must use DELETE /api/students/:id)
    await assertFails(deleteDoc(studentRef));
    await assertFails(deleteDoc(colleagueRef));

    // 2. Direct client role promotion / modification DENIED (must use POST /api/students/:id/update-access)
    await assertFails(updateDoc(studentRef, { role: 'teacher' }));
    await assertFails(updateDoc(studentRef, { role: 'premium' }));
    await assertFails(updateDoc(studentRef, { role: 'course' }));

    // 3. Setting isAdmin, tampering with privileges/billing/immutable fields, or writing unvalidated fields DENIED
    await assertFails(updateDoc(studentRef, { isAdmin: true }));
    await assertFails(updateDoc(studentRef, { uid: 'spoofed_uid' }));
    await assertFails(updateDoc(studentRef, { createdAt: Timestamp.fromMillis(1000) }));
    await assertFails(updateDoc(studentRef, { email: 'hijacked@evil.com' }));
    await assertFails(updateDoc(studentRef, { jokers: 9999 }));
    await assertFails(updateDoc(studentRef, { enrolledCourseIds: ['course_math'] }));
    await assertFails(updateDoc(studentRef, { arbitraryInjection: 'payload' }));

    // 4. Cross-teacher modification DENIED
    await assertFails(updateDoc(colleagueRef, { name: 'Tampered Colleague' }));

    // 5. Legitimate teacher survey reset (SurveyResponsesManager) including surveyAnswerCustom & surveyCustomAnswer SUCCEEDS
    await assertSucceeds(
      updateDoc(studentRef, {
        surveyCompleted: false,
        surveyAnswer: null,
        surveyAnswerCustom: null,
        surveyCustomAnswer: null,
        surveySchool: null,
        surveyGrade: null,
        updatedAt: Timestamp.now(),
      })
    );
  });

  test('SEC-31: courses and practiceCourses deny direct Firestore reads to non-teachers (eliminating peer studentIds UID leakage)', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, 'courses', 'course_math'), {
        title: 'Kurz Matematika',
        studentIds: ['student_course', 'peer_student_secret_uid'],
        meetUrl: 'https://meet.google.com/secret-room',
        createdAt: now,
      });
      await setDoc(doc(adminDb, 'practiceCourses', 'course_math'), {
        title: 'Procvičovací kurz Matematika',
        studentIds: ['student_course', 'peer_student_secret_uid'],
        isVisible: true,
        createdAt: now,
      });
    });

    for (const col of ['courses', 'practiceCourses'] as const) {
      // Unauth, free, premium, and even enrolled course students MUST use /api/courses
      await assertFails(getDoc(doc(unauthDb(), col, 'course_math')));
      await assertFails(getDocs(collection(unauthDb(), col)));
      await assertFails(getDoc(doc(freeDb(), col, 'course_math')));
      await assertFails(getDoc(doc(premiumDb(), col, 'course_math')));
      await assertFails(getDoc(doc(courseDb('student_course', ['course_math']), col, 'course_math')));
      await assertFails(getDocs(collection(courseDb('student_course', ['course_math']), col)));

      // Teachers CAN read directly for admin management
      await assertSucceeds(getDoc(doc(teacherDb(), col, 'course_math')));
      await assertSucceeds(getDocs(collection(teacherDb(), col)));
    }
  });

  // =========================================================================
  // SEC-42: Collection hygiene (studyMaterials, videoSessions, liveLessons delete)
  // =========================================================================

  test('SEC-42: studyMaterials denies paid/free/unauth reads and allows teachers', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'studyMaterials', 'sm_1'), {
        title: 'Legacy studijní materiál',
        createdAt: now,
        createdBy: 'teacher_1',
      });
    });

    await assertFails(getDoc(doc(unauthDb(), 'studyMaterials', 'sm_1')));
    await assertFails(getDoc(doc(freeDb(), 'studyMaterials', 'sm_1')));
    await assertFails(getDoc(doc(premiumDb(), 'studyMaterials', 'sm_1')));
    await assertFails(getDocs(collection(premiumDb(), 'studyMaterials')));
    await assertFails(getDoc(doc(courseDb(), 'studyMaterials', 'sm_1')));

    await assertSucceeds(getDoc(doc(teacherDb(), 'studyMaterials', 'sm_1')));
    await assertSucceeds(getDocs(collection(teacherDb(), 'studyMaterials')));
  });

  test('SEC-42: videoSessions is explicitly deny-all for everyone including teachers', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'videoSessions', 'nonce_abc'), {
        uid: 'student_free',
        consumed: false,
        createdAt: now,
      });
    });

    const dbs = [unauthDb(), freeDb(), premiumDb(), teacherDb()];
    for (const db of dbs) {
      await assertFails(getDoc(doc(db, 'videoSessions', 'nonce_abc')));
      await assertFails(getDocs(collection(db, 'videoSessions')));
      await assertFails(setDoc(doc(db, 'videoSessions', 'forged_nonce'), { uid: 'x', consumed: false }));
      await assertFails(updateDoc(doc(db, 'videoSessions', 'nonce_abc'), { consumed: true }));
      await assertFails(deleteDoc(doc(db, 'videoSessions', 'nonce_abc')));
    }
  });

  test('SEC-42: liveLessons delete is restricted to owning teacher (symmetric with update)', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, 'liveLessons', 'lesson_t1'), {
        title: 'Živá hodina — Matematika',
        teacherId: 'teacher_1',
        provider: 'google_meet',
        meetUrl: 'https://meet.google.com/abc-defg-hij',
        scheduledAt: now,
        durationMinutes: 60,
        status: 'scheduled',
        targetAudience: 'all',
        createdAt: now,
      });
      await setDoc(doc(adminDb, 'liveLessons', 'lesson_legacy_no_owner'), {
        title: 'Starší lekce bez teacherId',
        provider: 'google_meet',
        meetUrl: 'https://meet.google.com/old-room-xyz',
        scheduledAt: now,
        durationMinutes: 60,
        status: 'scheduled',
        targetAudience: 'all',
        createdAt: now,
      });
    });

    // Non-teacher student CANNOT delete
    await assertFails(deleteDoc(doc(premiumDb(), 'liveLessons', 'lesson_t1')));

    // Another teacher (teacher_2) CANNOT delete teacher_1's lesson
    await assertFails(deleteDoc(doc(teacherDb('teacher_2'), 'liveLessons', 'lesson_t1')));

    // Owning teacher (teacher_1) CAN delete own lesson
    await assertSucceeds(deleteDoc(doc(teacherDb('teacher_1'), 'liveLessons', 'lesson_t1')));

    // Legacy lesson without teacherId CAN be deleted by any teacher (symmetric with update)
    await assertSucceeds(deleteDoc(doc(teacherDb('teacher_2'), 'liveLessons', 'lesson_legacy_no_owner')));
  });
});
