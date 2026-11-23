import { describe, test, before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
  RulesTestContext,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  Timestamp,
  setLogLevel,
} from 'firebase/firestore';

const firestoreHostRaw = (process.env.FIRESTORE_EMULATOR_HOST || '').trim();
const storageHostRaw = (
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||
  process.env.STORAGE_EMULATOR_HOST ||
  ''
).trim();

const hasFirestoreEmulator = firestoreHostRaw.length > 0;
const hasStorageEmulator = storageHostRaw.length > 0;

function parseEmulatorHostPort(raw: string, defaultPort: number): { host: string; port: number } {
  const cleaned = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (cleaned.startsWith('[')) {
    const endBracket = cleaned.indexOf(']');
    const host = cleaned.slice(1, endBracket);
    const port = Number(cleaned.slice(endBracket + 2)) || defaultPort;
    return { host, port };
  }
  const lastColon = cleaned.lastIndexOf(':');
  if (lastColon === -1) return { host: cleaned, port: defaultPort };
  return {
    host: cleaned.slice(0, lastColon),
    port: Number(cleaned.slice(lastColon + 1)) || defaultPort,
  };
}

// Minimal valid bytes for upload tests
const SAMPLE_PDF_BYTES = new Uint8Array(Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n'));
const SAMPLE_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const SAMPLE_SVG_BYTES = new Uint8Array(
  Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
);

function putFile(
  st: ReturnType<RulesTestContext['storage']>,
  filePath: string,
  bytes: Uint8Array,
  metadata?: { contentType?: string; customMetadata?: Record<string, string> }
): Promise<unknown> {
  return Promise.resolve(st.ref(filePath).put(bytes, metadata));
}

// =============================================================================
// FIRESTORE RULES EMULATOR TESTS (SEC-11, SEC-22)
// =============================================================================
describe('P1 Firestore Security Rules (SEC-11, SEC-22 — Emulator)', { skip: !hasFirestoreEmulator }, () => {
  let testEnv: RulesTestEnvironment;

  before(async () => {
    setLogLevel('error');
    const { host, port } = parseEmulatorHostPort(firestoreHostRaw, 8080);
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: 'proedu-p1-firestore-test',
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

  // ---------------------------------------------------------------------------
  // SEC-11: Auth custom claim precedence & guarded userDoc() fallback
  // ---------------------------------------------------------------------------
  test('SEC-11: isTeacher() honors downgraded custom claim over stale Firestore doc, works without userDoc for claim-bearing teachers, and keeps legacy no-claim fallback', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, 'questions', 'q1'), {
        question: 'Kolik je 3 * 3?',
        type: 'open',
        correctAnswer: '9',
        subtopicId: 'sub1',
        createdAt: now,
        createdBy: 'teacher_claim',
      });
      await setDoc(doc(adminDb, 'learningSheets', 'sheet1'), {
        title: 'Zlomky',
        createdAt: now,
        createdBy: 'teacher_claim',
      });
      // Stale Firestore doc still says teacher, while Auth claim was downgraded to free
      await setDoc(doc(adminDb, 'users', 'demoted_teacher'), {
        uid: 'demoted_teacher',
        email: 'demoted@example.com',
        role: 'teacher',
        createdAt: now,
      });
      // Legacy teacher WITHOUT custom claim relies on Firestore user doc
      await setDoc(doc(adminDb, 'users', 'legacy_teacher'), {
        uid: 'legacy_teacher',
        email: 'legacy_teacher@example.com',
        role: 'teacher',
        createdAt: now,
      });
    });

    // 1. Demoted teacher with role:'free' claim MUST NOT fall through to stale users/{uid}.role == 'teacher'
    const demotedDb = testEnv
      .authenticatedContext('demoted_teacher', { role: 'free', email: 'demoted@example.com' })
      .firestore();
    await assertFails(getDoc(doc(demotedDb, 'questions', 'q1')));
    await assertFails(getDoc(doc(demotedDb, 'learningSheets', 'sheet1')));

    // 2. Claim-bearing teacher succeeds WITHOUT any users/{uid} document existing (0 extra reads)
    const claimTeacherDb = testEnv
      .authenticatedContext('teacher_claim', { role: 'teacher', email: 'teacher@example.com' })
      .firestore();
    await assertSucceeds(getDoc(doc(claimTeacherDb, 'questions', 'q1')));
    await assertSucceeds(getDoc(doc(claimTeacherDb, 'learningSheets', 'sheet1')));

    // 3. Legacy teacher without 'role' claim still works via guarded fallback
    const legacyTeacherDb = testEnv
      .authenticatedContext('legacy_teacher', { email: 'legacy_teacher@example.com' })
      .firestore();
    await assertSucceeds(getDoc(doc(legacyTeacherDb, 'questions', 'q1')));
    await assertSucceeds(getDoc(doc(legacyTeacherDb, 'learningSheets', 'sheet1')));
  });

  test('SEC-11: isPaidUser() / isPremiumOrAdmin() honors downgraded role claim over stale Firestore doc and keeps legacy no-claim fallback', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, 'users', 'refunded_user'), {
        uid: 'refunded_user',
        email: 'refunded@example.com',
        role: 'premium', // stale doc after refund/downgrade
        createdAt: now,
      });
      await setDoc(doc(adminDb, 'users', 'legacy_premium'), {
        uid: 'legacy_premium',
        email: 'legacy_premium@example.com',
        role: 'premium',
        createdAt: now,
      });
    });

    // 1. Refunded user with role:'free' claim MUST be denied paid-only practice todo creation
    const refundedDb = testEnv
      .authenticatedContext('refunded_user', { role: 'free', email: 'refunded@example.com' })
      .firestore();
    await assertFails(
      addDoc(collection(refundedDb, 'todos'), {
        studentId: 'refunded_user',
        title: 'Pokus po refundu',
        type: 'practice',
        completed: false,
        addedBy: 'refunded_user',
        createdAt: now,
      })
    );

    // 2. Claim-bearing premium user succeeds even with NO Firestore user doc
    const claimPremiumDb = testEnv
      .authenticatedContext('claim_premium', { role: 'premium', email: 'claim_premium@example.com' })
      .firestore();
    await assertSucceeds(
      addDoc(collection(claimPremiumDb, 'todos'), {
        studentId: 'claim_premium',
        title: 'Naplánované procvičování',
        type: 'practice',
        completed: false,
        addedBy: 'claim_premium',
        createdAt: now,
      })
    );

    // 3. Legacy user without 'role' claim still works via guarded Firestore fallback
    const legacyPremiumDb = testEnv
      .authenticatedContext('legacy_premium', { email: 'legacy_premium@example.com' })
      .firestore();
    await assertSucceeds(
      addDoc(collection(legacyPremiumDb, 'todos'), {
        studentId: 'legacy_premium',
        title: 'Legacy procvičování',
        type: 'practice',
        completed: false,
        addedBy: 'legacy_premium',
        createdAt: now,
      })
    );
  });

  test('SEC-11: isEnrolledInCourse() honors updated enrolledCourseIds claim over stale Firestore doc and keeps legacy fallback', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      // Course items are readable by enrolled students (courses itself is teacher-only in SEC-31)
      await setDoc(doc(adminDb, 'courseItems', 'item_math_1'), {
        courseId: 'course_math',
        title: 'Lekce 1: Zlomky',
        isHidden: false,
        createdAt: now,
      });
      await setDoc(doc(adminDb, 'courseItems', 'item_czech_1'), {
        courseId: 'course_czech',
        title: 'Lekce 1: Pravopis',
        isHidden: false,
        createdAt: now,
      });
      // Stale Firestore doc still lists course_math, but Auth token claim has empty enrolledCourseIds
      await setDoc(doc(adminDb, 'users', 'removed_from_course'), {
        uid: 'removed_from_course',
        email: 'removed@example.com',
        role: 'course',
        enrolledCourseIds: ['course_math'],
        createdAt: now,
      });
      // Legacy user without enrolledCourseIds claim in token
      await setDoc(doc(adminDb, 'users', 'legacy_course_user'), {
        uid: 'legacy_course_user',
        email: 'legacy_course@example.com',
        role: 'course',
        enrolledCourseIds: ['course_math'],
        createdAt: now,
      });
    });

    // 1. User removed from course (claim has enrolledCourseIds: []) MUST NOT fall back to stale Firestore doc
    const removedDb = testEnv
      .authenticatedContext('removed_from_course', {
        role: 'free',
        enrolledCourseIds: [],
        email: 'removed@example.com',
      })
      .firestore();
    await assertFails(getDoc(doc(removedDb, 'courseItems', 'item_math_1')));

    // 2. Claim-bearing enrolled student reads enrolled course item (no userDoc needed) and is denied other course
    const enrolledDb = testEnv
      .authenticatedContext('claim_course_user', {
        role: 'course',
        enrolledCourseIds: ['course_math'],
        email: 'claim_course@example.com',
      })
      .firestore();
    await assertSucceeds(getDoc(doc(enrolledDb, 'courseItems', 'item_math_1')));
    await assertFails(getDoc(doc(enrolledDb, 'courseItems', 'item_czech_1')));

    // 3. Legacy student without enrolledCourseIds claim falls back to userDoc
    const legacyCourseDb = testEnv
      .authenticatedContext('legacy_course_user', {
        role: 'course',
        email: 'legacy_course@example.com',
      })
      .firestore();
    await assertSucceeds(getDoc(doc(legacyCourseDb, 'courseItems', 'item_math_1')));
    await assertFails(getDoc(doc(legacyCourseDb, 'courseItems', 'item_czech_1')));
  });

  test('SEC-11: verifiedPracticeChecks and rateLimits collections are strictly deny-all even for teachers', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminDb = ctx.firestore();
      await setDoc(doc(adminDb, 'verifiedPracticeChecks', 'chk_1'), {
        uid: 'student_1',
        questionId: 'q1',
        createdAt: now,
      });
      await setDoc(doc(adminDb, 'rateLimits', 'rl_1'), {
        key: 'pwd_reset:user@example.com',
        count: 1,
        updatedAt: now,
      });
    });

    const contexts = [
      testEnv.unauthenticatedContext().firestore(),
      testEnv.authenticatedContext('student_1', { role: 'free' }).firestore(),
      testEnv.authenticatedContext('student_p', { role: 'premium' }).firestore(),
      testEnv.authenticatedContext('teacher_1', { role: 'teacher' }).firestore(),
    ];

    for (const db of contexts) {
      for (const [col, id] of [
        ['verifiedPracticeChecks', 'chk_1'],
        ['rateLimits', 'rl_1'],
      ] as const) {
        await assertFails(getDoc(doc(db, col, id)));
        await assertFails(setDoc(doc(db, col, 'new_doc'), { x: 1 }));
        await assertFails(updateDoc(doc(db, col, id), { x: 2 }));
        await assertFails(deleteDoc(doc(db, col, id)));
      }
    }
  });

  // ---------------------------------------------------------------------------
  // SEC-22: Strict single-address billingDetails.invoiceEmail validation
  // ---------------------------------------------------------------------------
  test('SEC-22: billingDetails.invoiceEmail rejects comma/semicolon/whitespace/angle-bracket/CRLF injections and accepts valid single emails', async () => {
    const now = Timestamp.now();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'student_billing'), {
        uid: 'student_billing',
        email: 'student_billing@example.com',
        name: 'Jan Novák',
        role: 'free',
        createdAt: now,
      });
    });

    const userRef = doc(
      testEnv
        .authenticatedContext('student_billing', { role: 'free', email: 'student_billing@example.com' })
        .firestore(),
      'users',
      'student_billing'
    );

    const maliciousEmails = [
      'victim@example.cz, attacker@evil.cz',
      'victim@example.cz,attacker@evil.cz',
      'victim@example.cz;attacker@evil.cz',
      'Faktura <victim@example.cz>',
      'victim@example.cz attacker@evil.cz',
      ' victim@example.cz ',
      'victim@example.cz\r\nBcc: attacker@evil.cz',
      'victim@example.cz\nBcc: attacker@evil.cz',
      'victim@example.cz\rBcc: attacker@evil.cz',
      'double@at@example.cz',
      'missing-tld@localhost',
      '   ',
      '"quoted"@example.cz',
      `${'a'.repeat(250)}@example.cz`,
    ];

    for (const badEmail of maliciousEmails) {
      await assertFails(
        updateDoc(userRef, {
          billingDetails: {
            clientName: 'Jan Novák',
            invoiceEmail: badEmail,
            street: 'Hlavní 1',
            city: 'Praha',
            zip: '11000',
          },
        })
      );
    }

    // Valid single-address emails + empty/null/omitted MUST SUCCEED
    const validBillingPayloads = [
      {
        clientName: 'Jan Novák',
        invoiceEmail: 'jan.novak+faktury@firma.cz',
        street: 'Hlavní 1',
        city: 'Praha',
        zip: '11000',
      },
      {
        clientName: 'Jan Novák',
        invoiceEmail: 'info@pro-edu.eu',
      },
      {
        clientName: 'Jan Novák',
        invoiceEmail: '',
      },
      {
        clientName: 'Jan Novák',
        invoiceEmail: null,
      },
      {
        clientName: 'Jan Novák',
        city: 'Brno',
      },
    ];

    for (const billingDetails of validBillingPayloads) {
      await assertSucceeds(updateDoc(userRef, { billingDetails }));
    }
  });
});

// =============================================================================
// FIREBASE STORAGE RULES EMULATOR TESTS (SEC-30)
// =============================================================================
describe('P1 Firebase Storage Security Rules (SEC-30 — Emulator)', { skip: !hasStorageEmulator }, () => {
  let testEnv: RulesTestEnvironment;

  before(async () => {
    const { host, port } = parseEmulatorHostPort(storageHostRaw, 9199);
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: 'proedu-p1-storage-test',
      storage: { host, port, rules },
    });
  });

  after(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.clearStorage();
  });

  const unauthStorage = () => testEnv.unauthenticatedContext().storage();
  const freeStorage = (uid = 'student_free') =>
    testEnv.authenticatedContext(uid, { role: 'free' }).storage();
  const premiumStorage = (uid = 'student_premium') =>
    testEnv.authenticatedContext(uid, { role: 'premium' }).storage();
  const courseStorage = (uid = 'student_course', enrolledCourseIds: string[] = ['course_math']) =>
    testEnv.authenticatedContext(uid, { role: 'course', enrolledCourseIds }).storage();
  const teacherStorage = (uid = 'teacher_1') =>
    testEnv.authenticatedContext(uid, { role: 'teacher' }).storage();

  test('SEC-30: learningSheets, materials, questions, practice deny reads to paid/free/unauth users and allow teacher reads', async () => {
    const seededPaths = [
      'learningSheets/teacher_1/worksheet.pdf',
      'materials/teacher_1/cheatsheet.pdf',
      'questions/teacher_1/diagram.png',
      'practice/teacher_1/exercise.png',
    ];

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const adminSt = ctx.storage();
      for (const filePath of seededPaths) {
        const isPdf = filePath.endsWith('.pdf');
        await adminSt.ref(filePath).put(isPdf ? SAMPLE_PDF_BYTES : SAMPLE_PNG_BYTES, {
          contentType: isPdf ? 'application/pdf' : 'image/png',
          customMetadata: { ownerId: 'teacher_1' },
        });
      }
    });

    for (const filePath of seededPaths) {
      const prefix = filePath.split('/').slice(0, 2).join('/');

      // Unauth, free, premium, and course users MUST BE DENIED both get and list
      await assertFails(unauthStorage().ref(filePath).getDownloadURL());
      await assertFails(freeStorage().ref(filePath).getDownloadURL());
      await assertFails(premiumStorage().ref(filePath).getDownloadURL());
      await assertFails(premiumStorage().ref(prefix).listAll());
      await assertFails(courseStorage().ref(filePath).getDownloadURL());
      await assertFails(courseStorage().ref(prefix).listAll());

      // Teachers MUST BE ALLOWED get and list
      await assertSucceeds(teacherStorage('teacher_1').ref(filePath).getDownloadURL());
      await assertSucceeds(teacherStorage('teacher_2').ref(filePath).getDownloadURL());
      await assertSucceeds(teacherStorage('teacher_1').ref(prefix).listAll());
    }
  });

  test('SEC-30: teacher uploads reject image/svg+xml, missing/wrong ownerId metadata, wrong teacherUid namespace, and non-namespaced paths; valid PDF/PNG allowed', async () => {
    const t1 = teacherStorage('teacher_1');

    // 1. SVG upload DENIED (stored XSS prevention)
    await assertFails(
      putFile(t1, 'learningSheets/teacher_1/xss.svg', SAMPLE_SVG_BYTES, {
        contentType: 'image/svg+xml',
        customMetadata: { ownerId: 'teacher_1' },
      })
    );

    // 2. HTML upload DENIED
    await assertFails(
      putFile(t1, 'learningSheets/teacher_1/page.html', new Uint8Array(Buffer.from('<h1>x</h1>')), {
        contentType: 'text/html',
        customMetadata: { ownerId: 'teacher_1' },
      })
    );

    // 3. Missing ownerId custom metadata DENIED
    await assertFails(
      putFile(t1, 'learningSheets/teacher_1/no_owner.pdf', SAMPLE_PDF_BYTES, {
        contentType: 'application/pdf',
      })
    );

    // 4. Spoofed ownerId custom metadata DENIED
    await assertFails(
      putFile(t1, 'learningSheets/teacher_1/wrong_owner.pdf', SAMPLE_PDF_BYTES, {
        contentType: 'application/pdf',
        customMetadata: { ownerId: 'teacher_2' },
      })
    );

    // 5. Upload into another teacher's {teacherUid} namespace DENIED
    await assertFails(
      putFile(t1, 'learningSheets/teacher_2/hijack.pdf', SAMPLE_PDF_BYTES, {
        contentType: 'application/pdf',
        customMetadata: { ownerId: 'teacher_1' },
      })
    );

    // 6. Non-namespaced path DENIED
    await assertFails(
      putFile(t1, 'learningSheets/flat_unnamespaced.pdf', SAMPLE_PDF_BYTES, {
        contentType: 'application/pdf',
        customMetadata: { ownerId: 'teacher_1' },
      })
    );
    await assertFails(
      putFile(t1, 'learningSheets/teacher_1', SAMPLE_PDF_BYTES, {
        contentType: 'application/pdf',
        customMetadata: { ownerId: 'teacher_1' },
      })
    );

    // 7. Paid student attempting upload into teacher namespaces DENIED
    await assertFails(
      putFile(
        premiumStorage('student_premium'),
        'learningSheets/student_premium/cheat.pdf',
        SAMPLE_PDF_BYTES,
        {
          contentType: 'application/pdf',
          customMetadata: { ownerId: 'student_premium' },
        }
      )
    );

    // 8. Valid teacher PDF & PNG uploads with matching {teacherUid} and ownerId metadata SUCCEED across all 4 namespaces
    await assertSucceeds(
      putFile(t1, 'learningSheets/teacher_1/valid.pdf', SAMPLE_PDF_BYTES, {
        contentType: 'application/pdf',
        customMetadata: { ownerId: 'teacher_1' },
      })
    );
    await assertSucceeds(
      putFile(t1, 'materials/teacher_1/sheet.pdf', SAMPLE_PDF_BYTES, {
        contentType: 'application/pdf',
        customMetadata: { ownerId: 'teacher_1' },
      })
    );
    await assertSucceeds(
      putFile(t1, 'questions/teacher_1/img.png', SAMPLE_PNG_BYTES, {
        contentType: 'image/png',
        customMetadata: { ownerId: 'teacher_1' },
      })
    );
    await assertSucceeds(
      putFile(t1, 'practice/teacher_1/img.png', SAMPLE_PNG_BYTES, {
        contentType: 'image/png',
        customMetadata: { ownerId: 'teacher_1' },
      })
    );

    // 9. Teacher may delete own file, DENIED deleting another teacher's file
    await assertFails(teacherStorage('teacher_2').ref('learningSheets/teacher_1/valid.pdf').delete());
    await assertSucceeds(t1.ref('learningSheets/teacher_1/valid.pdf').delete());
  });

  test('SEC-30: courses/{courseId} separates allow get vs allow list for enrolled students', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await putFile(ctx.storage(), 'courses/course_math/lesson1.pdf', SAMPLE_PDF_BYTES, {
        contentType: 'application/pdf',
        customMetadata: { ownerId: 'teacher_1' },
      });
    });

    const enrolled = courseStorage('student_math', ['course_math']);
    const otherCourse = courseStorage('student_czech', ['course_czech']);
    const premium = premiumStorage('student_premium');
    const teacher = teacherStorage('teacher_1');

    // Enrolled student can get known path, NEVER list directory
    await assertSucceeds(enrolled.ref('courses/course_math/lesson1.pdf').getDownloadURL());
    await assertFails(enrolled.ref('courses/course_math').listAll());

    // Non-enrolled students (course or premium) cannot get or list
    await assertFails(otherCourse.ref('courses/course_math/lesson1.pdf').getDownloadURL());
    await assertFails(premium.ref('courses/course_math/lesson1.pdf').getDownloadURL());
    await assertFails(premium.ref('courses/course_math').listAll());

    // Teacher can get, list, and upload valid material with ownerId (but NOT SVG)
    await assertSucceeds(teacher.ref('courses/course_math/lesson1.pdf').getDownloadURL());
    await assertSucceeds(teacher.ref('courses/course_math').listAll());
    await assertSucceeds(
      putFile(teacher, 'courses/course_math/lesson2.pdf', SAMPLE_PDF_BYTES, {
        contentType: 'application/pdf',
        customMetadata: { ownerId: 'teacher_1' },
      })
    );
    await assertFails(
      putFile(teacher, 'courses/course_math/bad.svg', SAMPLE_SVG_BYTES, {
        contentType: 'image/svg+xml',
        customMetadata: { ownerId: 'teacher_1' },
      })
    );
  });

  test('SEC-30: users/{userId} & bugReports/{userId} enforce owner raster uploads (<=5MB), block student list, and lock unused bug-reports/**', async () => {
    const alice = freeStorage('alice');
    const bob = freeStorage('bob');
    const teacher = teacherStorage('teacher_1');

    // 1. Valid raster upload to own users/{uid} and bugReports/{uid} SUCCEEDS
    await assertSucceeds(
      putFile(alice, 'users/alice/avatar.png', SAMPLE_PNG_BYTES, {
        contentType: 'image/png',
      })
    );
    await assertSucceeds(
      putFile(alice, 'bugReports/alice/screenshot.png', SAMPLE_PNG_BYTES, {
        contentType: 'image/png',
        customMetadata: { ownerId: 'alice' },
      })
    );

    // 2. Upload to another user's namespace DENIED
    await assertFails(
      putFile(alice, 'users/bob/avatar.png', SAMPLE_PNG_BYTES, { contentType: 'image/png' })
    );
    await assertFails(
      putFile(alice, 'bugReports/bob/shot.png', SAMPLE_PNG_BYTES, { contentType: 'image/png' })
    );

    // 3. Disallowed MIME types (SVG, PDF, GIF) and oversized (> 5 MB) DENIED for user uploads
    await assertFails(
      putFile(alice, 'users/alice/xss.svg', SAMPLE_SVG_BYTES, { contentType: 'image/svg+xml' })
    );
    await assertFails(
      putFile(alice, 'users/alice/doc.pdf', SAMPLE_PDF_BYTES, { contentType: 'application/pdf' })
    );
    await assertFails(
      putFile(alice, 'bugReports/alice/anim.gif', SAMPLE_PNG_BYTES, { contentType: 'image/gif' })
    );
    const oversizedBytes = new Uint8Array(5 * 1024 * 1024 + 1);
    await assertFails(
      putFile(alice, 'users/alice/huge.png', oversizedBytes, { contentType: 'image/png' })
    );

    // 4. Spoofed ownerId metadata DENIED
    await assertFails(
      putFile(alice, 'users/alice/spoof.png', SAMPLE_PNG_BYTES, {
        contentType: 'image/png',
        customMetadata: { ownerId: 'bob' },
      })
    );

    // 5. Get own file SUCCEEDS; other user DENIED; owner list DENIED; teacher get & list SUCCEED
    await assertSucceeds(alice.ref('users/alice/avatar.png').getDownloadURL());
    await assertSucceeds(alice.ref('bugReports/alice/screenshot.png').getDownloadURL());
    await assertFails(bob.ref('users/alice/avatar.png').getDownloadURL());
    await assertFails(bob.ref('bugReports/alice/screenshot.png').getDownloadURL());
    await assertFails(alice.ref('users/alice').listAll());
    await assertFails(alice.ref('bugReports/alice').listAll());

    await assertSucceeds(teacher.ref('users/alice/avatar.png').getDownloadURL());
    await assertSucceeds(teacher.ref('users/alice').listAll());
    await assertSucceeds(teacher.ref('bugReports/alice/screenshot.png').getDownloadURL());
    await assertSucceeds(teacher.ref('bugReports/alice').listAll());

    // 6. Unused kebab-case bug-reports/{userId}/** is strictly deny-all (even owner & teacher!)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await putFile(ctx.storage(), 'bug-reports/alice/legacy.png', SAMPLE_PNG_BYTES, {
        contentType: 'image/png',
      });
    });
    await assertFails(
      putFile(alice, 'bug-reports/alice/new.png', SAMPLE_PNG_BYTES, { contentType: 'image/png' })
    );
    await assertFails(alice.ref('bug-reports/alice/legacy.png').getDownloadURL());
    await assertFails(teacher.ref('bug-reports/alice/legacy.png').getDownloadURL());
    await assertFails(teacher.ref('bug-reports/alice/legacy.png').delete());

    // 7. Unmanaged fallback path is strictly deny-all
    await assertFails(
      putFile(teacher, 'unmanaged/file.pdf', SAMPLE_PDF_BYTES, {
        contentType: 'application/pdf',
        customMetadata: { ownerId: 'teacher_1' },
      })
    );
  });
});
