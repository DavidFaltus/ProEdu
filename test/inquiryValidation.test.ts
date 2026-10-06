import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInquiryPayload } from '../src/services/inquiryService';

test('validateInquiryPayload validates correct payload', () => {
  const input = {
    studentId: 'student_123',
    studentName: 'Jan Novák',
    questionId: 'q1',
    questionText: 'Kolik je 2 + 2?',
    topic: 'Počítání a čísla',
    comment: 'Nerozumím postupu'
  };

  const validated = validateInquiryPayload(input);
  assert.equal(validated.studentId, 'student_123');
  assert.equal(validated.studentName, 'Jan Novák');
  assert.equal(validated.comment, 'Nerozumím postupu');
  assert.equal(validated.status, 'pending');
});

test('validateInquiryPayload trims fields and applies safe defaults for optional/empty values', () => {
  const input = {
    studentId: 'student_123',
    studentName: '',
    questionId: '',
    questionText: undefined,
    topic: '',
    comment: '   Prosím o radu   '
  };

  const validated = validateInquiryPayload(input);
  assert.equal(validated.studentName, 'Student');
  assert.equal(validated.questionId, 'general');
  assert.equal(validated.questionText, 'Bez textu zadání');
  assert.equal(validated.topic, 'Procvičování');
  assert.equal(validated.comment, 'Prosím o radu');
});

test('validateInquiryPayload throws when comment or studentId is missing', () => {
  assert.throws(() => {
    validateInquiryPayload({ studentId: '', comment: 'hello' } as any);
  }, /studentId/);

  assert.throws(() => {
    validateInquiryPayload({ studentId: 's1', comment: '   ' } as any);
  }, /Chybí text dotazu/);
});
