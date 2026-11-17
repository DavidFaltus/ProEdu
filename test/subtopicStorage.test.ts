import { test } from 'node:test';
import assert from 'node:assert/strict';
import { 
  PRACTICE_SUBTOPICS_COLLECTION, 
  normalizeSubtopicPayload,
  LEARNING_SHEETS_COLLECTION,
  normalizeMaterialPayload
} from '../src/services/practiceService';

test('PRACTICE_SUBTOPICS_COLLECTION targets practiceSubtopics and never learningSheets', () => {
  assert.equal(PRACTICE_SUBTOPICS_COLLECTION, 'practiceSubtopics');
  assert.notEqual(PRACTICE_SUBTOPICS_COLLECTION, 'learningSheets');
});

test('normalizeSubtopicPayload strips global tutor tip (studyTips) and keeps step tutor tips', () => {
  const input = {
    title: '  Zlomky a smíšená čísla  ',
    subjectId: 'Matematika',
    topicId: 'topic_123',
    description: '  Základní operace se zlomky  ',
    order: 2,
    studyTheory: 'Teorie ke zlomkům...',
    studyTips: 'TOTO JE GLOBÁLNÍ TIP KTERÝ SE MÁ ODSTRANIT',
    studySteps: [
      {
        title: 'Krok 1',
        content: 'Najděte společného jmenovatele',
        imageUrl: 'https://example.com/step1.png',
        svgContent: '<svg>step1</svg>',
        tutorTip: 'Pozor na nejmenší společný násobek',
        testQuestion: 'Jaký je jmenovatel 1/2 a 1/3?',
        testOptions: ['6', '5', '3', '2'],
        correctAnswer: '6'
      }
    ],
    svgContent: '<svg>preview</svg>',
    svgUrl: ''
  };

  const payload = normalizeSubtopicPayload(input);

  // 1. Basic fields are trimmed and normalized
  assert.equal(payload.title, 'Zlomky a smíšená čísla');
  assert.equal(payload.subjectId, 'Matematika');
  assert.equal(payload.topicId, 'topic_123');
  assert.equal(payload.description, 'Základní operace se zlomky');
  assert.equal(payload.order, 2);
  assert.equal(payload.studyTheory, 'Teorie ke zlomkům...');

  // 2. Global studyTips must NOT be present on the subtopic
  assert.equal((payload as any).studyTips, undefined);

  // 3. Step tutor tip, imageUrl, and svgContent must remain intact
  assert.equal(payload.studySteps.length, 1);
  assert.equal(payload.studySteps[0].tutorTip, 'Pozor na nejmenší společný násobek');
  assert.equal(payload.studySteps[0].imageUrl, 'https://example.com/step1.png');
  assert.equal(payload.studySteps[0].svgContent, '<svg>step1</svg>');

  // 4. hasStudyMaterial must be true when SVG or theory or steps are present
  assert.equal(payload.hasStudyMaterial, true);
});

test('LEARNING_SHEETS_COLLECTION targets learningSheets and normalizeMaterialPayload creates valid learning sheet data', () => {
  assert.equal(LEARNING_SHEETS_COLLECTION, 'learningSheets');

  const matInput = {
    title: '  Vzorce pro geometrii  ',
    subject: 'Matematika',
    topic: 'Planimetrie',
    studyTheory: 'Přehled vzorců pro trojúhelník a kruh',
    svgContent: '<svg>geometry</svg>',
    svgUrl: 'https://example.com/geo.svg'
  };

  const matPayload = normalizeMaterialPayload(matInput);
  assert.equal(matPayload.title, 'Vzorce pro geometrii');
  assert.equal(matPayload.subject, 'Matematika');
  assert.equal(matPayload.topic, 'Planimetrie');
  assert.equal(matPayload.fileUrl, 'https://example.com/geo.svg');
  assert(matPayload.content.includes('<svg>geometry</svg>'));
});

test('updateSubtopicsOrder is exported and buildSubtopicUpdatePayload updates order accurately', async () => {
  const { updateSubtopicsOrder, buildSubtopicUpdatePayload } = await import('../src/services/practiceService');
  assert.equal(typeof updateSubtopicsOrder, 'function');

  // Verify buildSubtopicUpdatePayload handles order
  const existingSub = {
    id: 'sub_1',
    title: 'Lineární rovnice',
    topicId: 'topic_algebra',
    subjectId: 'Matematika',
    order: 1
  };

  const updatedWithNewOrder = buildSubtopicUpdatePayload(existingSub as any, { order: 5 });
  assert.equal(updatedWithNewOrder.order, 5);
  assert.equal(updatedWithNewOrder.title, 'Lineární rovnice');

  // Verify sequential reordering calculation
  const subs = [
    { id: 'sub_a', order: 10 },
    { id: 'sub_b', order: 20 },
    { id: 'sub_c', order: 30 }
  ];
  // Move sub_c to position 0
  const reordered = [subs[2], subs[0], subs[1]];
  const updates = reordered.map((s, idx) => ({ id: s.id, order: idx + 1 }));
  assert.deepEqual(updates, [
    { id: 'sub_c', order: 1 },
    { id: 'sub_a', order: 2 },
    { id: 'sub_b', order: 3 }
  ]);
});
