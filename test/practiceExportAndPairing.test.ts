import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { writeExcelWorkbookBuffer } from '../src/utils/excelWorkbook';
import {
  normalizeSubtopicPayload,
  buildSubtopicUpdatePayload,
  buildPracticeExportRows,
  PRACTICE_EXPORT_HEADERS,
  parsePracticeQuestionsExcelFile,
} from '../src/services/practiceService';
import { PracticeQuestion, PracticeSubtopic, PracticeTopic } from '../src/types';

test('normalizeSubtopicPayload and buildSubtopicUpdatePayload handle pairedMaterialId independently of materialId', () => {
  const normalized = normalizeSubtopicPayload({
    title: 'Lineární rovnice',
    topicId: 'top-eq',
    subjectId: 'Matematika',
    materialId: 'mat_study_internal',
    pairedMaterialId: '  mat_library_1  ',
  });
  assert.equal(normalized.materialId, 'mat_study_internal');
  assert.equal(normalized.pairedMaterialId, 'mat_library_1');

  const existing: PracticeSubtopic = {
    id: 'sub-eq',
    title: 'Lineární rovnice',
    topicId: 'top-eq',
    subjectId: 'Matematika',
    materialId: 'mat_study_internal',
    pairedMaterialId: 'mat_library_1',
    isHidden: false,
  };

  // Partial update not mentioning pairedMaterialId preserves it
  const kept = buildSubtopicUpdatePayload(existing, { title: 'Lineární rovnice 2' });
  assert.equal(kept.materialId, 'mat_study_internal');
  assert.equal(kept.pairedMaterialId, 'mat_library_1');

  // Changing pairedMaterialId leaves Study's own materialId untouched
  const repaired = buildSubtopicUpdatePayload(existing, { pairedMaterialId: 'mat_library_2' });
  assert.equal(repaired.materialId, 'mat_study_internal');
  assert.equal(repaired.pairedMaterialId, 'mat_library_2');

  // Clearing Study's own materialId leaves pairedMaterialId intact; clearing pairedMaterialId leaves materialId intact
  const clearedPairing = buildSubtopicUpdatePayload(existing, { pairedMaterialId: null });
  assert.equal(clearedPairing.materialId, 'mat_study_internal');
  assert.equal(clearedPairing.pairedMaterialId, null);
});

test('firestore.rules permits pairedMaterialId in isValidPracticeSubtopic', () => {
  const rules = fs.readFileSync(path.resolve('firestore.rules'), 'utf-8');
  const start = rules.indexOf('function isValidPracticeSubtopic(data)');
  const end = rules.indexOf('function isValidQuestion(data)');
  assert.ok(start >= 0 && end > start);
  const block = rules.slice(start, end);
  assert.ok(block.includes("'pairedMaterialId'"));
  assert.ok(block.includes("isOptionalString(data, 'pairedMaterialId', 128)"));
});

test('buildPracticeExportRows exports all (including hidden) or only selected subtopics and formats all question types', () => {
  const topics: PracticeTopic[] = [
    { id: 't1', title: 'Rovnice', subjectId: 'Matematika', order: 1, isHidden: false },
    { id: 't2', title: 'Geometrie', subjectId: 'Matematika', order: 2, isHidden: true },
  ];

  const subtopics: PracticeSubtopic[] = [
    { id: 's1', topicId: 't1', title: 'Lineární rovnice', subjectId: 'Matematika', order: 1, isHidden: false },
    { id: 's2', topicId: 't2', title: 'Pythagorova věta', subjectId: 'Matematika', order: 1, isHidden: true },
  ];

  const questionsMap: Record<string, PracticeQuestion[]> = {
    s1: [
      {
        id: 'q1',
        subjectId: 'Matematika',
        topicId: 't1',
        subtopicId: 's1',
        type: 'choice',
        difficulty: 'Lehká',
        question: 'Kolik je 2 + 2?',
        options: ['3', '4', '5', '6'],
        correctAnswer: '4',
        hint: 'Sečti dvě dvojky.',
        explanation: '2 + 2 = 4',
      },
      {
        id: 'q2',
        subjectId: 'Matematika',
        topicId: 't1',
        subtopicId: 's1',
        type: 'open',
        difficulty: 'Těžká',
        question: 'Vyřeš x + 3 = 10',
        correctAnswer: '7',
        explanation: 'x = 10 - 3 = 7',
      },
    ],
    s2: [
      {
        id: 'q3',
        subjectId: 'Matematika',
        topicId: 't2',
        subtopicId: 's2',
        type: 'self_check',
        difficulty: 'Střední',
        question: 'Sestroj pravoúhlý trojúhelník a ověř c^2.',
        correctAnswer: 'self_check',
        explanation: 'Například trojúhelník se stranami 3, 4, 5.',
        solutionImageUrl: 'https://example.com/solution.png',
      },
    ],
  };

  // Export ALL (no selection) includes hidden topic/subtopic too
  const allRes = buildPracticeExportRows({ topics, subtopics, questionsMap });
  assert.equal(allRes.subtopicCount, 2);
  assert.equal(allRes.questionCount, 3);
  assert.equal(allRes.rows[0]['Typ'], 'výběr');
  assert.equal(allRes.rows[0]['Odpověď (výběr)'], 'B');
  assert.equal(allRes.rows[1]['Typ'], 'volná');
  assert.equal(allRes.rows[1]['Odpověď (volná)'], '7');
  assert.equal(allRes.rows[2]['Typ'], 'sebehodnocení');
  assert.equal(allRes.rows[2]['Odpověď (volná)'], '');
  assert.equal(allRes.rows[2]['Obrázek řešení'], 'https://example.com/solution.png');

  // Export ONLY selected subtopic
  const selectedRes = buildPracticeExportRows({
    topics,
    subtopics,
    questionsMap,
    selectedSubtopicIds: ['s2'],
  });
  assert.equal(selectedRes.subtopicCount, 1);
  assert.equal(selectedRes.questionCount, 1);
  assert.equal(selectedRes.rows[0]['Téma'], 'Geometrie');
  assert.equal(selectedRes.rows[0]['Podtéma'], 'Pythagorova věta');
});

test('exported XLSX round-trips cleanly through parsePracticeQuestionsExcelFile including self_check', async () => {
  const topics: PracticeTopic[] = [
    { id: 't1', title: 'Rovnice', subjectId: 'Matematika', order: 1, isHidden: false },
  ];
  const subtopics: PracticeSubtopic[] = [
    { id: 's1', topicId: 't1', title: 'Jednoduché rovnice', subjectId: 'Matematika', order: 1, isHidden: false },
  ];
  const questionsMap: Record<string, PracticeQuestion[]> = {
    s1: [
      {
        id: 'q1',
        subjectId: 'Matematika',
        topicId: 't1',
        subtopicId: 's1',
        type: 'choice',
        difficulty: 'Lehká',
        question: 'Co je řešení 2x = 6?',
        options: ['1', '2', '3', '4'],
        correctAnswer: '3',
        explanation: '6 / 2 = 3',
      },
      {
        id: 'q2',
        subjectId: 'Matematika',
        topicId: 't1',
        subtopicId: 's1',
        type: 'open',
        difficulty: 'Střední',
        question: 'Co je řešení x - 5 = 4?',
        correctAnswer: '9',
      },
      {
        id: 'q3',
        subjectId: 'Matematika',
        topicId: 't1',
        subtopicId: 's1',
        type: 'self_check',
        difficulty: 'Těžká',
        question: 'Narysuj osu úsečky AB.',
        correctAnswer: 'self_check',
        explanation: 'Sestroj oblouky o stejném poloměru z bodů A i B.',
        solutionImageUrl: 'https://example.com/osa.png',
      },
    ],
  };

  const { rows } = buildPracticeExportRows({ topics, subtopics, questionsMap });
  const headers = [...PRACTICE_EXPORT_HEADERS];
  const buf = await writeExcelWorkbookBuffer([
    {
      name: 'Procvičování',
      headers,
      rows: rows.map((row) => headers.map((h) => row[h as keyof typeof row])),
    },
  ]);
  const file = new File([buf], 'procvicovani-export.xlsx');

  const parsed = await parsePracticeQuestionsExcelFile(file);
  assert.equal(parsed.invalidRows.length, 0);
  assert.equal(parsed.validRows.length, 3);
  assert.equal(parsed.validRows[0].type, 'choice');
  assert.equal(parsed.validRows[0].correctAnswer, '3');
  assert.equal(parsed.validRows[1].type, 'open');
  assert.equal(parsed.validRows[1].correctAnswer, '9');
  assert.equal(parsed.validRows[2].type, 'self_check');
  assert.equal(parsed.validRows[2].solutionImageUrl, 'https://example.com/osa.png');
  assert.equal(parsed.validRows[2].explanation, 'Sestroj oblouky o stejném poloměru z bodů A i B.');
});
