import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSubtopicUpdatePayload } from '../src/services/practiceService';
import { PracticeSubtopic } from '../src/types';

test('buildSubtopicUpdatePayload preserves all existing fields when partial update only specifies studySteps', () => {
  const existing: PracticeSubtopic = {
    id: 'sub_123',
    title: 'Vyjmenovaná slova po B',
    topicId: 'topic_b',
    subjectId: 'Čeština',
    description: 'Pravopisná pravidla pro psaní y/i',
    order: 3,
    hasStudyMaterial: true,
    studyTheory: 'Základní výklad a seznam vyjmenovaných slov...',
    svgUrl: '/materials/shoda.svg',
    svgContent: '<svg>orig</svg>',
    studySteps: [
      { title: 'Krok 1', content: 'Rozdíl být a bít', tutorTip: 'Pozor na kontext věty' }
    ],
    sampleProblem: {
      problem: 'Vyber správné slovo: Starobylý hrad byl/bíl',
      correctAnswer: 'byl'
    },
    createdBy: 'original_teacher_uid',
    createdAt: { seconds: 1234567890, nanoseconds: 0 } as any
  };

  const partialUpdate: Partial<PracticeSubtopic> = {
    id: 'sub_123',
    studySteps: [
      { title: 'Krok 1', content: 'Rozdíl být a bít', tutorTip: 'Pozor na kontext věty' },
      { title: 'Krok 2', content: 'Bylina a příbuzná slova' }
    ],
    hasStudyMaterial: true
  };

  const merged = buildSubtopicUpdatePayload(existing, partialUpdate);

  // 1. Critical: topicId and title must NEVER be erased or defaulted
  assert.equal(merged.title, 'Vyjmenovaná slova po B');
  assert.equal(merged.topicId, 'topic_b');
  assert.equal(merged.subjectId, 'Čeština');

  // 2. Existing description, theory, SVG, order and sample problem must be retained
  assert.equal(merged.description, 'Pravopisná pravidla pro psaní y/i');
  assert.equal(merged.studyTheory, 'Základní výklad a seznam vyjmenovaných slov...');
  assert.equal(merged.svgUrl, '/materials/shoda.svg');
  assert.equal(merged.svgContent, '<svg>orig</svg>');
  assert.equal(merged.order, 3);
  assert.deepEqual(merged.sampleProblem, {
    problem: 'Vyber správné slovo: Starobylý hrad byl/bíl',
    correctAnswer: 'byl'
  });

  // 3. New studySteps must be applied
  assert.equal(merged.studySteps?.length, 2);
  assert.equal(merged.studySteps?.[1].title, 'Krok 2');

  // 4. Immutable ownership fields must NOT be overwritten
  assert.equal(merged.createdBy, 'original_teacher_uid');
  assert.equal((merged as any).studyTips, undefined);
});

test('buildSubtopicUpdatePayload allows updating explicit fields without erasing others', () => {
  const existing: PracticeSubtopic = {
    id: 'sub_456',
    title: 'Lineární rovnice',
    topicId: 'topic_equations',
    subjectId: 'Matematika',
    description: 'Úvod do rovnic',
    order: 1,
    hasStudyMaterial: true,
    studyTheory: 'Ekvivalentní úpravy',
    studySteps: [],
    createdBy: 'teacher_1'
  };

  const update: Partial<PracticeSubtopic> = {
    title: 'Lineární rovnice s jednou neznámou',
    description: 'Rozšířený popis rovnic'
  };

  const merged = buildSubtopicUpdatePayload(existing, update);

  assert.equal(merged.title, 'Lineární rovnice s jednou neznámou');
  assert.equal(merged.description, 'Rozšířený popis rovnic');
  assert.equal(merged.topicId, 'topic_equations');
  assert.equal(merged.subjectId, 'Matematika');
  assert.equal(merged.studyTheory, 'Ekvivalentní úpravy');
});
