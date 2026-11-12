import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { 
  saveActivePracticeSession, 
  getActivePracticeSession, 
  deleteActivePracticeSession 
} from '../src/services/practiceService';
import { ActivePracticeSession, PracticeQuestion } from '../src/types';

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

test('ActivePracticeSession properly persists and retrieves self_check fields', async () => {
  localStorage.clear();

  const mockSession: ActivePracticeSession = {
    studentId: 'student_geo',
    subtopicId: 'subtopic_rysovani_trojuhelniku',
    topicId: 'topic_geometrie',
    subjectId: 'Matematika',
    questionIds: ['q_geo_1', 'q_geo_2', 'q_geo_3'],
    currentIndex: 1,
    answersMap: {
      '0': {
        userAnswer: 'self_check:correct',
        isCorrect: true,
        usedHint: false,
        isSubmitted: true,
        selfScore: 1,
        selfEvaluation: 'correct',
        solutionRevealed: true
      },
      '1': {
        userAnswer: 'self_check:partial',
        isCorrect: false,
        usedHint: false,
        isSubmitted: true,
        selfScore: 0.5,
        selfEvaluation: 'partial',
        solutionRevealed: true
      }
    },
    openInputs: {},
    showHintMap: {},
    bookmarkedIndices: [2],
    answeredCount: 2,
    totalCount: 3,
    updatedAt: new Date()
  };

  await saveActivePracticeSession(mockSession);

  const retrieved = await getActivePracticeSession('subtopic_rysovani_trojuhelniku');
  assert.ok(retrieved, 'Session should be retrieved from storage');
  assert.equal(retrieved.answersMap['0'].selfScore, 1);
  assert.equal(retrieved.answersMap['0'].selfEvaluation, 'correct');
  assert.equal(retrieved.answersMap['0'].solutionRevealed, true);
  assert.equal(retrieved.answersMap['0'].isCorrect, true);

  assert.equal(retrieved.answersMap['1'].selfScore, 0.5);
  assert.equal(retrieved.answersMap['1'].selfEvaluation, 'partial');
  assert.equal(retrieved.answersMap['1'].solutionRevealed, true);
  assert.equal(retrieved.answersMap['1'].isCorrect, false);

  await deleteActivePracticeSession('subtopic_rysovani_trojuhelniku');
  const afterDelete = await getActivePracticeSession('subtopic_rysovani_trojuhelniku');
  assert.equal(afterDelete, null);
});

test('Self-check scoring calculation handles 1, 0.5, and 0 points accurately', () => {
  // Simulate the practice session calculation in handleFinishPractice
  const answers: Array<{
    type: 'choice' | 'open' | 'self_check';
    isCorrect: boolean;
    selfScore?: number;
  }> = [
    { type: 'choice', isCorrect: true },           // 1 point
    { type: 'self_check', isCorrect: true, selfScore: 1 },    // 1 point
    { type: 'self_check', isCorrect: false, selfScore: 0.5 }, // 0.5 point
    { type: 'self_check', isCorrect: false, selfScore: 0 },   // 0 point
    { type: 'open', isCorrect: false }             // 0 point
  ];

  let earnedScore = 0;
  for (const ans of answers) {
    if (ans.type === 'self_check' && typeof ans.selfScore === 'number') {
      earnedScore += ans.selfScore;
    } else if (ans.isCorrect) {
      earnedScore += 1;
    }
  }

  assert.equal(earnedScore, 2.5, 'Earned score should equal 2.5 (1 + 1 + 0.5 + 0 + 0)');
  const percentage = Math.round((earnedScore / answers.length) * 100);
  assert.equal(percentage, 50, 'Percentage should be 50% for 2.5 / 5');
});

test('Self-check question structure supports solutionImageUrl and solutionSvgContent', () => {
  const selfCheckQuestion: PracticeQuestion = {
    id: 'geo_q1',
    subjectId: 'Matematika',
    topicId: 'topic_geometrie',
    subtopicId: 'sub_triangles',
    type: 'self_check',
    question: 'Sestrojte rovnoramenný trojúhelník ABC se základnou a = 6 cm a výškou va = 4 cm.',
    options: [],
    correctAnswer: 'self_check',
    explanation: '1. Narýsujeme úsečku BC o délce 6 cm.\n2. Najdeme střed S úsečky BC.\n3. Vztyčíme kolmici v bodě S a naneseme 4 cm...',
    solutionImageUrl: 'data:image/webp;base64,UklGRl...',
    solutionSvgContent: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,10 90,90 10,90" /></svg>',
    difficulty: 'Střední',
    order: 1
  };

  assert.equal(selfCheckQuestion.type, 'self_check');
  assert.equal(selfCheckQuestion.correctAnswer, 'self_check');
  assert.ok(selfCheckQuestion.solutionImageUrl?.startsWith('data:image/'));
  assert.ok(selfCheckQuestion.solutionSvgContent?.includes('<polygon'));
});

test('Firestore rules allow self_check type and validate solutionImageUrl/Svg length', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  // Verify that self_check is allowed in isValidQuestion rule
  assert.ok(
    rulesContent.includes("data.type == 'self_check'"),
    'firestore.rules must allow self_check in question type check'
  );

  // Verify solutionImageUrl limit (max 600KB)
  assert.ok(
    rulesContent.includes("data.solutionImageUrl is string && data.solutionImageUrl.size() <= 600000"),
    'firestore.rules must validate solutionImageUrl limit'
  );

  // Verify solutionSvgContent limit (max 500KB)
  assert.ok(
    rulesContent.includes("data.solutionSvgContent is string && data.solutionSvgContent.size() <= 500000"),
    'firestore.rules must validate solutionSvgContent limit'
  );
});
