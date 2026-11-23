import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeExcelWorkbookBuffer } from '../src/utils/excelWorkbook';
import { 
  normalizeDifficulty, 
  cleanPracticeConfig, 
  buildSubtopicUpdatePayload,
  sampleQuestionsForPractice,
  parsePracticeQuestionsExcelFile
} from '../src/services/practiceService';
import { PracticeQuestion, PracticeSubtopic } from '../src/types';

test('normalizeDifficulty correctly maps various inputs to valid difficulty enum', () => {
  assert.equal(normalizeDifficulty('Lehká'), 'Lehká');
  assert.equal(normalizeDifficulty('lehka'), 'Lehká');
  assert.equal(normalizeDifficulty('snadná'), 'Lehká');
  assert.equal(normalizeDifficulty('EASY'), 'Lehká');

  assert.equal(normalizeDifficulty('Střední'), 'Střední');
  assert.equal(normalizeDifficulty('stredni'), 'Střední');
  assert.equal(normalizeDifficulty('MEDIUM'), 'Střední');
  assert.equal(normalizeDifficulty(''), 'Střední');
  assert.equal(normalizeDifficulty(undefined), 'Střední');

  assert.equal(normalizeDifficulty('Těžká'), 'Těžká');
  assert.equal(normalizeDifficulty('tezka'), 'Těžká');
  assert.equal(normalizeDifficulty('obtížná'), 'Těžká');
  assert.equal(normalizeDifficulty('HARD'), 'Těžká');
});

test('cleanPracticeConfig sanitizes numbers and calculates totalCount', () => {
  assert.equal(cleanPracticeConfig(null), null);
  assert.equal(cleanPracticeConfig(undefined), null);

  const clean = cleanPracticeConfig({
    easyCount: 3,
    mediumCount: 5,
    hardCount: 2
  });
  assert.deepEqual(clean, {
    easyCount: 3,
    mediumCount: 5,
    hardCount: 2,
    totalCount: 10
  });

  const withInvalids = cleanPracticeConfig({
    easyCount: -2,
    mediumCount: 'invalid',
    hardCount: 4.8
  });
  assert.deepEqual(withInvalids, {
    easyCount: 0,
    mediumCount: 0,
    hardCount: 4,
    totalCount: 4
  });
});

test('buildSubtopicUpdatePayload handles practiceConfig update and reset', () => {
  const existing: PracticeSubtopic = {
    id: 'sub-1',
    topicId: 'top-1',
    subjectId: 'Matematika',
    title: 'Zlomky',
    description: 'Popis',
    practiceConfig: {
      easyCount: 2,
      mediumCount: 3,
      hardCount: 1,
      totalCount: 6
    }
  };

  // 1. Partial update without practiceConfig preserves existing
  const payload1 = buildSubtopicUpdatePayload(existing, { title: 'Nové Zlomky' });
  assert.deepEqual(payload1.practiceConfig, {
    easyCount: 2,
    mediumCount: 3,
    hardCount: 1,
    totalCount: 6
  });

  // 2. Update with new practiceConfig
  const payload2 = buildSubtopicUpdatePayload(existing, {
    practiceConfig: { easyCount: 5, mediumCount: 5, hardCount: 0 }
  });
  assert.deepEqual(payload2.practiceConfig, {
    easyCount: 5,
    mediumCount: 5,
    hardCount: 0,
    totalCount: 10
  });

  // 3. Reset practiceConfig to null
  const payload3 = buildSubtopicUpdatePayload(existing, {
    practiceConfig: null as any
  });
  assert.equal(payload3.practiceConfig, null);
});

test('sampleQuestionsForPractice samples requested distribution and orders Lehká -> Střední -> Těžká', () => {
  const mockQuestions: PracticeQuestion[] = [
    { id: 'e1', question: 'E1', type: 'choice', correctAnswer: 'A', difficulty: 'Lehká', subjectId: 'M', topicId: 'T', subtopicId: 'S' },
    { id: 'e2', question: 'E2', type: 'choice', correctAnswer: 'A', difficulty: 'Lehká', subjectId: 'M', topicId: 'T', subtopicId: 'S' },
    { id: 'e3', question: 'E3', type: 'choice', correctAnswer: 'A', difficulty: 'Lehká', subjectId: 'M', topicId: 'T', subtopicId: 'S' },
    { id: 'm1', question: 'M1', type: 'choice', correctAnswer: 'A', difficulty: 'Střední', subjectId: 'M', topicId: 'T', subtopicId: 'S' },
    { id: 'm2', question: 'M2', type: 'choice', correctAnswer: 'A', difficulty: 'Střední', subjectId: 'M', topicId: 'T', subtopicId: 'S' },
    { id: 'm3', question: 'M3', type: 'choice', correctAnswer: 'A', difficulty: 'Střední', subjectId: 'M', topicId: 'T', subtopicId: 'S' },
    { id: 'h1', question: 'H1', type: 'choice', correctAnswer: 'A', difficulty: 'Těžká', subjectId: 'M', topicId: 'T', subtopicId: 'S' },
    { id: 'h2', question: 'H2', type: 'choice', correctAnswer: 'A', difficulty: 'Těžká', subjectId: 'M', topicId: 'T', subtopicId: 'S' }
  ];

  // 1. Without config -> returns all
  const all = sampleQuestionsForPractice(mockQuestions, null);
  assert.equal(all.length, mockQuestions.length);

  // 2. With config -> samples 2 easy, 1 medium, 1 hard (total 4)
  const sampled = sampleQuestionsForPractice(mockQuestions, {
    easyCount: 2,
    mediumCount: 1,
    hardCount: 1,
    totalCount: 4
  });
  assert.equal(sampled.length, 4);

  // First 2 should be Lehká
  assert.equal(sampled[0].difficulty, 'Lehká');
  assert.equal(sampled[1].difficulty, 'Lehká');
  // Next 1 should be Střední
  assert.equal(sampled[2].difficulty, 'Střední');
  // Next 1 should be Těžká
  assert.equal(sampled[3].difficulty, 'Těžká');

  // 3. When requested exceeds available -> takes all available of that difficulty without error
  const exceeding = sampleQuestionsForPractice(mockQuestions, {
    easyCount: 10,
    mediumCount: 1,
    hardCount: 0
  });
  assert.equal(exceeding.length, 3 + 1); // 3 easy available + 1 medium
});

test('parsePracticeQuestionsExcelFile parses template file and extracts difficulty', async () => {
  const rows = [
    {
      'Předmět': 'Matematika',
      'Téma': 'Ukázkové téma',
      'Podtéma': 'Ukázkové podtéma',
      'Otázka': 'Kolik je 2 + 3?',
      'Nápověda': 'Sečti obě čísla.',
      'Vysvětlení': '2 + 3 = 5.',
      'Typ': 'výběr',
      'Odpověď (volná)': '',
      'Možnost A': '4',
      'Možnost B': '5',
      'Možnost C': '6',
      'Možnost D': '7',
      'Odpověď (výběr)': 'B',
      'Obtížnost': 'Lehká',
    },
    {
      'Předmět': 'Matematika',
      'Téma': 'Ukázkové téma',
      'Podtéma': 'Ukázkové podtéma',
      'Otázka': 'Kolik je 10 - 4?',
      'Nápověda': '',
      'Vysvětlení': '10 - 4 = 6.',
      'Typ': 'volná',
      'Odpověď (volná)': '6',
      'Možnost A': '',
      'Možnost B': '',
      'Možnost C': '',
      'Možnost D': '',
      'Odpověď (výběr)': '',
      'Obtížnost': 'lehka',
    },
    {
      'Předmět': 'Matematika',
      'Téma': 'Ukázkové téma',
      'Podtéma': 'Ukázkové podtéma',
      'Otázka': 'Vyřeš rovnici 2x = 14.',
      'Nápověda': 'Vyděl obě strany 2.',
      'Vysvětlení': 'x = 7.',
      'Typ': 'volná',
      'Odpověď (volná)': '7',
      'Možnost A': '',
      'Možnost B': '',
      'Možnost C': '',
      'Možnost D': '',
      'Odpověď (výběr)': '',
      'Obtížnost': 'Střední',
    },
  ];

  const headers = Object.keys(rows[0]);
  const buffer = await writeExcelWorkbookBuffer([
    {
      name: 'Procvičování',
      headers,
      rows: rows.map((row) => headers.map((h) => row[h as keyof typeof row])),
    },
  ]);
  const file = new File([buffer], 'ProEdu_Import_Procvicovani.xlsx');

  const result = await parsePracticeQuestionsExcelFile(file);
  assert.equal(result.invalidRows.length, 0);
  assert.ok(result.validRows.length >= 3);
  assert.equal(result.validRows[0].difficulty, 'Lehká');
  assert.equal(result.validRows[1].difficulty, 'Lehká');
  assert.equal(result.validRows[2].difficulty, 'Střední');
});
