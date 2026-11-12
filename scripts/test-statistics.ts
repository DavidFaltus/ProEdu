import assert from 'node:assert/strict';
import {
  computeStudentStatistics,
  STATS_THRESHOLDS,
  getDemoStatisticsPreview,
  StudentAttemptRecord
} from '../src/services/statisticsService';
import { PracticeTopic, PracticeSubtopic } from '../src/types';

const mockTopics: PracticeTopic[] = [
  {
    id: 'topic-math-1',
    title: '1. Čísla a početní operace',
    subjectId: 'matematika',
    order: 1
  },
  {
    id: 'topic-math-2',
    title: '2. Algebra a rovnice',
    subjectId: 'matematika',
    order: 2
  },
  {
    id: 'topic-czech-1',
    title: '1. Pravopis a mluvnice',
    subjectId: 'cestina',
    order: 1
  }
];

const mockSubtopics: PracticeSubtopic[] = [
  {
    id: 'sub-zlomky',
    topicId: 'topic-math-1',
    subjectId: 'matematika',
    title: 'Zlomky a smíšená čísla',
    description: 'Procvičování zlomků',
    order: 1,
    hasStudyMaterial: true
  },
  {
    id: 'sub-procenta',
    topicId: 'topic-math-1',
    subjectId: 'matematika',
    title: 'Procenta a trojčlenka',
    description: 'Procvičování procent',
    order: 2,
    hasStudyMaterial: false
  },
  {
    id: 'sub-rovnice',
    topicId: 'topic-math-2',
    subjectId: 'matematika',
    title: 'Lineární rovnice',
    description: 'Procvičování rovnic',
    order: 1,
    hasStudyMaterial: true
  },
  {
    id: 'sub-vyjmenovana',
    topicId: 'topic-czech-1',
    subjectId: 'cestina',
    title: 'Vyjmenovaná slova',
    description: 'Procvičování vyjmenovaných slov',
    order: 1,
    hasStudyMaterial: true
  }
];

function createMockAttempt(overrides: Partial<StudentAttemptRecord> = {}): StudentAttemptRecord {
  return {
    id: 'att-1',
    subtopicId: 'sub-zlomky',
    subtopicTitle: 'Zlomky a smíšená čísla',
    topicId: 'topic-math-1',
    topicTitle: '1. Čísla a početní operace',
    subject: 'Matematika',
    score: 8,
    totalQuestions: 10,
    percentage: 80,
    createdAt: new Date(),
    hasStudyMaterial: true,
    durationSeconds: 120,
    detailedAnswers: [
      {
        questionId: 'q1',
        questionText: 'Kolik je 1/2 + 1/4?',
        userAnswer: '3/4',
        correctAnswer: '3/4',
        isCorrect: true,
        timeSpentMs: 12000,
        explanation: 'Společný jmenovatel je 4.'
      },
      {
        questionId: 'q2',
        questionText: 'Kolik je 1/3 * 3?',
        userAnswer: '1',
        correctAnswer: '1',
        isCorrect: true,
        timeSpentMs: 8000
      }
    ],
    ...overrides
  };
}

console.log('--- Starting Statistics Engine Unit Tests ---');

// Test 1: Configurable Thresholds verification
console.log('Test 1: Configurable Threshold constants');
assert.equal(STATS_THRESHOLDS.MIN_ANSWERS_FOR_ACCURACY, 10);
assert.equal(STATS_THRESHOLDS.MIN_DAYS_FOR_TIMELINE, 3);
assert.equal(STATS_THRESHOLDS.MIN_ANSWERS_FOR_INSIGHTS, 10);
assert.equal(STATS_THRESHOLDS.MASTERY_PERCENTAGE, 80);
assert.equal(STATS_THRESHOLDS.CRITICAL_PERCENTAGE, 50);
console.log('✓ Configurable thresholds verified');

// Test 2: Minimum data rule (<10 answers) -> hasEnoughData is false, neutral badge
console.log('Test 2: Minimum data rule (< 10 answers)');
const lowDataAttempt = createMockAttempt({
  score: 1,
  totalQuestions: 4, // only 4 questions total
  percentage: 25
});
const rawLowData = {
  topics: mockTopics,
  subtopics: mockSubtopics,
  attempts: [lowDataAttempt]
};

const lowDataStats = computeStudentStatistics(rawLowData, 'Vše', 'all');
assert.equal(lowDataStats.kpi.accuracy.hasEnoughData, false);
assert.equal(lowDataStats.kpi.accuracy.totalAnswers, 4);
assert.match(lowDataStats.kpi.accuracy.description, /Zatím málo dat/);

// Find the subtopic item
const zlomkyChapter = lowDataStats.topicChapters.find(c => c.topicId === 'topic-math-1');
assert.ok(zlomkyChapter);
const zlomkyItem = zlomkyChapter.subtopics.find(s => s.subtopicId === 'sub-zlomky');
assert.ok(zlomkyItem);
assert.equal(zlomkyItem.hasEnoughData, false);
assert.equal(zlomkyItem.statusBadge.text, 'Zatím málo dat');
assert.match(zlomkyItem.statusBadge.badgeClass, /amber/); // Neutral, NOT red!
console.log('✓ Minimum data rule enforced: topic hasEnoughData=false, badge="Zatím málo dat", not red');

// Test 3: Accuracy calculation & mastery thresholds (49% critical, 50% needs_practice, 80% mastered)
console.log('Test 3: Threshold boundaries (49% / 50% / 80%)');

// 3a: 49% average -> critical ("Zopakovat")
const criticalAttempt = createMockAttempt({
  subtopicId: 'sub-zlomky',
  score: 49,
  totalQuestions: 100,
  percentage: 49
});
const statsCritical = computeStudentStatistics({
  topics: mockTopics,
  subtopics: mockSubtopics,
  attempts: [criticalAttempt]
}, 'Vše', 'all');
const zlomkyCrit = statsCritical.topicChapters[0].subtopics.find(s => s.subtopicId === 'sub-zlomky')!;
assert.equal(zlomkyCrit.status, 'critical');
assert.equal(zlomkyCrit.statusBadge.text, 'Zopakovat');

// 3b: 50% average -> needs_practice ("Skoro to máš")
const fiftyAttempt = createMockAttempt({
  subtopicId: 'sub-zlomky',
  score: 5,
  totalQuestions: 10,
  percentage: 50
});
const stats50 = computeStudentStatistics({
  topics: mockTopics,
  subtopics: mockSubtopics,
  attempts: [fiftyAttempt]
}, 'Vše', 'all');
const zlomky50 = stats50.topicChapters[0].subtopics.find(s => s.subtopicId === 'sub-zlomky')!;
assert.equal(zlomky50.status, 'needs_practice');
assert.equal(zlomky50.statusBadge.text, 'Skoro to máš');

// 3c: 79% average -> needs_practice ("Skoro to máš")
const seventyNineAttempt = createMockAttempt({
  subtopicId: 'sub-zlomky',
  score: 79,
  totalQuestions: 100,
  percentage: 79
});
const stats79 = computeStudentStatistics({
  topics: mockTopics,
  subtopics: mockSubtopics,
  attempts: [seventyNineAttempt]
}, 'Vše', 'all');
const zlomky79 = stats79.topicChapters[0].subtopics.find(s => s.subtopicId === 'sub-zlomky')!;
assert.equal(zlomky79.status, 'needs_practice');
assert.equal(zlomky79.statusBadge.text, 'Skoro to máš');

// 3d: 80% average -> mastered ("Zvládnuto")
const eightyAttempt = createMockAttempt({
  subtopicId: 'sub-zlomky',
  score: 8,
  totalQuestions: 10,
  percentage: 80
});
const stats80 = computeStudentStatistics({
  topics: mockTopics,
  subtopics: mockSubtopics,
  attempts: [eightyAttempt]
}, 'Vše', 'all');
const zlomky80 = stats80.topicChapters[0].subtopics.find(s => s.subtopicId === 'sub-zlomky')!;
assert.equal(zlomky80.status, 'mastered');
assert.equal(zlomky80.statusBadge.text, 'Zvládnuto');
console.log('✓ Boundary classification verified: 49% = critical, 50% = needs_practice, 79% = needs_practice, 80% = mastered');

// Test 4: Pure average calculation across multiple attempts
console.log('Test 4: Pure average of all attempts in topic');
const attA = createMockAttempt({ subtopicId: 'sub-zlomky', score: 6, totalQuestions: 10, percentage: 60 });
const attB = createMockAttempt({ subtopicId: 'sub-zlomky', score: 8, totalQuestions: 10, percentage: 80 });
const attC = createMockAttempt({ subtopicId: 'sub-zlomky', score: 10, totalQuestions: 10, percentage: 100 });
const statsAvg = computeStudentStatistics({
  topics: mockTopics,
  subtopics: mockSubtopics,
  attempts: [attA, attB, attC]
}, 'Vše', 'all');
const zlomkyAvg = statsAvg.topicChapters[0].subtopics.find(s => s.subtopicId === 'sub-zlomky')!;
assert.equal(zlomkyAvg.averagePercentage, 80); // (60 + 80 + 100) / 3 = 80%
assert.equal(zlomkyAvg.attemptsCount, 3);
assert.equal(zlomkyAvg.totalAnswers, 30);
assert.equal(zlomkyAvg.correctAnswers, 24);
console.log('✓ Pure average accurately computed across multiple attempts: 80%');

// Test 5: Subject and Period filtering + Trend
console.log('Test 5: Period filtering and Trend calculation');
const now = Date.now();
const currentPeriodAtt = createMockAttempt({
  createdAt: new Date(now - 1 * 86400000), // 1 day ago
  score: 9,
  totalQuestions: 10,
  percentage: 90
});
const priorPeriodAtt = createMockAttempt({
  createdAt: new Date(now - 8 * 86400000), // 8 days ago (in prior 7-day window)
  score: 5,
  totalQuestions: 10,
  percentage: 50
});
const rawTrend = {
  topics: mockTopics,
  subtopics: mockSubtopics,
  attempts: [currentPeriodAtt, priorPeriodAtt]
};
const statsTrend7d = computeStudentStatistics(rawTrend, 'Vše', '7d');
assert.equal(statsTrend7d.kpi.accuracy.percentage, 90);
assert.equal(statsTrend7d.kpi.accuracy.trend, 40); // 90% - 50% = +40%

const statsTrendAll = computeStudentStatistics(rawTrend, 'Vše', 'all');
assert.equal(statsTrendAll.kpi.accuracy.trend, null); // Null for 'all'
console.log('✓ Trend calculation: +40% for 7d period, null for all history');

// Test 6: Priority Scoring & Recommendation Logic
console.log('Test 6: Priority scoring and Smart Recommendation');
const weakAttempt = createMockAttempt({
  subtopicId: 'sub-rovnice',
  subtopicTitle: 'Lineární rovnice',
  topicId: 'topic-math-2',
  topicTitle: '2. Algebra a rovnice',
  score: 3,
  totalQuestions: 10,
  percentage: 30, // Low accuracy (< 50) gives +50 pts
  createdAt: new Date(now - 5 * 86400000)
});
const masteredAttempt = createMockAttempt({
  subtopicId: 'sub-zlomky',
  subtopicTitle: 'Zlomky a smíšená čísla',
  topicId: 'topic-math-1',
  score: 10,
  totalQuestions: 10,
  percentage: 100, // Mastered gives -40 pts penalty
  createdAt: new Date(now - 1 * 86400000)
});
const statsRec = computeStudentStatistics({
  topics: mockTopics,
  subtopics: mockSubtopics,
  attempts: [weakAttempt, masteredAttempt]
}, 'Vše', 'all');

assert.ok(statsRec.primaryRecommendation, 'Primary recommendation should exist');
assert.equal(statsRec.primaryRecommendation.subtopicId, 'sub-rovnice');
assert.equal(statsRec.primaryRecommendation.category, 'weak');
console.log('✓ Weak topic (30% accuracy) awarded highest priority score and crowned primary recommendation');

// Test 7: Error code analysis & repeated mistakes
console.log('Test 7: CERMAT Error Code Analysis');
const correctDetailed = Array.from({ length: 9 }, (_, i) => ({
  questionId: `q-ok-${i}`,
  questionText: `Správná otázka ${i + 1}`,
  userAnswer: 'správně',
  correctAnswer: 'správně',
  isCorrect: true,
  timeSpentMs: 15000
}));

const failDetailed = {
  questionId: 'cermat-frac-1',
  questionText: 'Upravte výraz: (2/3 + 1/6) : 5/12 se zlomkem a krácením',
  userAnswer: '1/2',
  correctAnswer: '2',
  isCorrect: false,
  errorCode: 'FRACTION_REDUCTION',
  timeSpentMs: 75000,
  explanation: 'Při dělení zlomků násobíme převrácenou hodnotou.'
};

const attemptWithError = createMockAttempt({
  score: 9,
  totalQuestions: 10,
  percentage: 90,
  detailedAnswers: [...correctDetailed, failDetailed]
});

const statsErrors = computeStudentStatistics({
  topics: mockTopics,
  subtopics: mockSubtopics,
  attempts: [attemptWithError]
}, 'Vše', 'all');

assert.equal(statsErrors.insights.hasEnoughData, true);
assert.equal(statsErrors.insights.errorTypes.length, 1);
assert.equal(statsErrors.insights.errorTypes[0].id, 'fraction_reduction');
assert.equal(statsErrors.insights.errorTypes[0].count, 1);
assert.equal(statsErrors.insights.strugglingQuestions.length, 1);
assert.equal(statsErrors.insights.strugglingQuestions[0].questionId, 'cermat-frac-1');
console.log('✓ CERMAT error taxonomy and tactical exam advice correctly generated');

// Test 8: Non-premium demo generator
console.log('Test 8: Demo statistics generator');
const demo = getDemoStatisticsPreview();
assert.ok(demo.kpi.accuracy.percentage > 0);
assert.ok(demo.primaryRecommendation !== null);
assert.ok(demo.topicChapters.length > 0);
assert.ok(demo.timeline.hasEnoughData);
console.log('✓ Demo preview generated cleanly with high-fidelity mock data');

console.log('=== ALL 8 STATISTICS ENGINE TESTS PASSED PERFECTLY! ===');
