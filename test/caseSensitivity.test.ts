import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStudentAnswer } from '../src/utils/mathEvaluator.ts';
import type { PracticeQuestion } from '../src/types/index.ts';

test('evaluateStudentAnswer with caseSensitive=false or omitted (default)', () => {
  // Czech words with different casing
  const res1 = evaluateStudentAnswer('Bylina', 'bylina');
  assert.equal(res1.isCorrect, true, 'Bylina should match bylina when caseSensitive is omitted');

  const res2 = evaluateStudentAnswer('bylina', 'Bylina', { caseSensitive: false });
  assert.equal(res2.isCorrect, true, 'bylina should match Bylina when caseSensitive is false');

  const res3 = evaluateStudentAnswer('starý mlynář', 'Starý mlynář', { caseSensitive: false });
  assert.equal(res3.isCorrect, true, 'starý mlynář should match Starý mlynář when caseSensitive is false');

  const res4 = evaluateStudentAnswer('PRAHA', 'praha');
  assert.equal(res4.isCorrect, true, 'PRAHA should match praha when caseSensitive is omitted');

  // Math equations still work
  const res5 = evaluateStudentAnswer('0.5', '1/2');
  assert.equal(res5.isCorrect, true, '0.5 should match 1/2');
});

test('evaluateStudentAnswer with caseSensitive=true', () => {
  // Exact match required
  const res1 = evaluateStudentAnswer('Praha', 'Praha', { caseSensitive: true });
  assert.equal(res1.isCorrect, true, 'Praha should match Praha with caseSensitive=true');

  const res2 = evaluateStudentAnswer('praha', 'Praha', { caseSensitive: true });
  assert.equal(res2.isCorrect, false, 'praha should NOT match Praha with caseSensitive=true');

  const res3 = evaluateStudentAnswer('PRAHA', 'Praha', { caseSensitive: true });
  assert.equal(res3.isCorrect, false, 'PRAHA should NOT match Praha with caseSensitive=true');

  // Multiple acceptable answers separated by ; or |
  const res4 = evaluateStudentAnswer('Václav Havel', 'Václav Havel; V. Havel', { caseSensitive: true });
  assert.equal(res4.isCorrect, true, 'Exact match in variants should succeed');

  const res5 = evaluateStudentAnswer('václav havel', 'Václav Havel; V. Havel', { caseSensitive: true });
  assert.equal(res5.isCorrect, false, 'Lowercase in variants should fail when caseSensitive=true');
});

test('PracticeQuestion interface supports caseSensitive field', () => {
  const q: PracticeQuestion = {
    id: 'test-q-1',
    subjectId: 'Čeština',
    topicId: 't1',
    subtopicId: 's1',
    type: 'open',
    question: 'Doplň hlavní město ČR:',
    correctAnswer: 'Praha',
    caseSensitive: true
  };

  assert.equal(q.caseSensitive, true);

  const q2: PracticeQuestion = {
    id: 'test-q-2',
    subjectId: 'Čeština',
    topicId: 't1',
    subtopicId: 's1',
    type: 'open',
    question: 'Napiš vyjmenované slovo po B:',
    correctAnswer: 'být',
    caseSensitive: false
  };

  assert.equal(q2.caseSensitive, false);
});
