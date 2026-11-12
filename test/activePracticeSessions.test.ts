import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { 
  saveActivePracticeSession, 
  getActivePracticeSession, 
  deleteActivePracticeSession,
  getUserActivePracticeSessions
} from '../src/services/practiceService';
import { ActivePracticeSession } from '../src/types';

// Mock localStorage for Node environment if not present
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; }
  } as Storage;
}

test('Active practice session saves and retrieves correctly from storage', async () => {
  localStorage.clear();

  const mockSession: ActivePracticeSession = {
    studentId: 'student_123',
    subtopicId: 'subtopic_linearni_rovnice',
    topicId: 'topic_algebra',
    subjectId: 'Matematika',
    questionIds: ['q1', 'q2', 'q3'],
    currentIndex: 1,
    answersMap: {
      '0': {
        userAnswer: '4',
        selectedOptionIndex: 1,
        isCorrect: true,
        usedHint: false,
        isSubmitted: true,
        tutorFeedback: 'Správně!'
      }
    },
    openInputs: {
      '1': 'x = '
    },
    showHintMap: {
      '1': true
    },
    bookmarkedIndices: [2],
    answeredCount: 1,
    totalCount: 3,
    updatedAt: new Date()
  };

  await saveActivePracticeSession(mockSession);

  const retrieved = await getActivePracticeSession('subtopic_linearni_rovnice');
  assert.ok(retrieved, 'Session should be found');
  assert.equal(retrieved?.subtopicId, 'subtopic_linearni_rovnice');
  assert.equal(retrieved?.currentIndex, 1);
  assert.equal(retrieved?.answeredCount, 1);
  assert.equal(retrieved?.totalCount, 3);
  assert.deepEqual(retrieved?.questionIds, ['q1', 'q2', 'q3']);
  assert.equal(retrieved?.answersMap['0']?.userAnswer, '4');
  assert.equal(retrieved?.answersMap['0']?.isCorrect, true);
  assert.equal(retrieved?.openInputs?.['1'], 'x = ');
  assert.equal(retrieved?.showHintMap?.['1'], true);
  assert.deepEqual(retrieved?.bookmarkedIndices, [2]);
});

test('getUserActivePracticeSessions aggregates in-progress subtopics', async () => {
  localStorage.clear();

  const session1: ActivePracticeSession = {
    studentId: 'student_abc',
    subtopicId: 'sub_1',
    topicId: 'top_1',
    subjectId: 'Matematika',
    questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
    currentIndex: 2,
    answersMap: {
      '0': { userAnswer: 'a', isCorrect: true, usedHint: false, isSubmitted: true },
      '1': { userAnswer: 'b', isCorrect: false, usedHint: true, isSubmitted: true }
    },
    answeredCount: 2,
    totalCount: 5,
    updatedAt: new Date()
  };

  const session2Empty: ActivePracticeSession = {
    studentId: 'student_abc',
    subtopicId: 'sub_2',
    topicId: 'top_1',
    subjectId: 'Matematika',
    questionIds: ['q6', 'q7'],
    currentIndex: 0,
    answersMap: {},
    answeredCount: 0,
    totalCount: 2,
    updatedAt: new Date()
  };

  await saveActivePracticeSession(session1);
  await saveActivePracticeSession(session2Empty);

  const activeSessions = await getUserActivePracticeSessions('student_abc');
  assert.ok(activeSessions['sub_1'], 'sub_1 should be listed in active sessions');
  assert.equal(activeSessions['sub_1']?.answeredCount, 2);
  assert.equal(activeSessions['sub_1']?.totalCount, 5);

  assert.equal(activeSessions['sub_2'], undefined, 'sub_2 with 0 answered should not be listed as active');
});

test('deleteActivePracticeSession removes active session from storage', async () => {
  localStorage.clear();

  const session: ActivePracticeSession = {
    studentId: 'student_xyz',
    subtopicId: 'sub_xyz',
    topicId: 'top_xyz',
    subjectId: 'Čeština',
    questionIds: ['q1', 'q2'],
    currentIndex: 1,
    answersMap: {
      '0': { userAnswer: 'mě', isCorrect: true, usedHint: false, isSubmitted: true }
    },
    answeredCount: 1,
    totalCount: 2,
    updatedAt: new Date()
  };

  await saveActivePracticeSession(session);
  let retrieved = await getActivePracticeSession('sub_xyz');
  assert.ok(retrieved, 'Should exist before deletion');

  await deleteActivePracticeSession('sub_xyz');
  retrieved = await getActivePracticeSession('sub_xyz');
  assert.equal(retrieved, null, 'Should be null after deletion');
});

test('firestore.rules defines isValidActivePracticeSession and activePracticeSessions collection with correct security', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  // Must have isValidActivePracticeSession function
  assert.ok(rulesContent.includes('function isValidActivePracticeSession(data)'), 'isValidActivePracticeSession helper must exist');
  assert.ok(rulesContent.includes('data.studentId == request.auth.uid'), 'Must enforce student ownership');
  assert.ok(rulesContent.includes('data.questionIds is list'), 'Must validate questionIds is list');
  assert.ok(rulesContent.includes('data.currentIndex is number'), 'Must validate currentIndex');
  assert.ok(rulesContent.includes('data.answeredCount is number'), 'Must validate answeredCount');
  assert.ok(rulesContent.includes('data.totalCount is number'), 'Must validate totalCount');
  assert.ok(rulesContent.includes('data.answersMap is map'), 'Must validate answersMap is map');

  // Must have match block for /activePracticeSessions/{sessionId}
  assert.ok(rulesContent.includes('match /activePracticeSessions/{sessionId}'), 'Must have activePracticeSessions collection match');
  assert.ok(rulesContent.includes('keepsImmutableFields()'), 'Must enforce immutable fields on update');
  assert.ok(rulesContent.includes("unchanged('subtopicId')"), 'Must enforce unchanged subtopicId on update');
});
