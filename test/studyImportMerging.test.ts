import { test } from 'node:test';
import assert from 'node:assert/strict';
import { 
  normalizeSubjectName, 
  resolveTopicMatch, 
  resolveSubtopicMatch, 
  mergeStudySteps 
} from '../src/services/practiceService';
import { PracticeTopic, PracticeSubtopic, StudyStep } from '../src/types';

test('normalizeSubjectName correctly maps Czech language variants to Čeština and Math to Matematika', () => {
  assert.equal(normalizeSubjectName('Český jazyk'), 'Čeština');
  assert.equal(normalizeSubjectName('český jazyk'), 'Čeština');
  assert.equal(normalizeSubjectName('Čeština'), 'Čeština');
  assert.equal(normalizeSubjectName('ČJ'), 'Čeština');
  assert.equal(normalizeSubjectName('cestina'), 'Čeština');

  assert.equal(normalizeSubjectName('Matematika'), 'Matematika');
  assert.equal(normalizeSubjectName('matematika'), 'Matematika');
  assert.equal(normalizeSubjectName('matika'), 'Matematika');
  assert.equal(normalizeSubjectName('M'), 'Matematika');
});

test('resolveTopicMatch finds existing topic regardless of subject naming variants or case', () => {
  const existingTopics: PracticeTopic[] = [
    {
      id: 'topic_1',
      title: 'Vyjmenovaná slova',
      subjectId: 'Čeština',
      description: 'Základní pravopis',
      order: 1
    },
    {
      id: 'topic_2',
      title: 'Lineární rovnice',
      subjectId: 'Matematika',
      description: 'Základní rovnice',
      order: 2
    }
  ];

  // 1. Exact match
  assert.equal(resolveTopicMatch(existingTopics, 'Čeština', 'Vyjmenovaná slova'), 'topic_1');

  // 2. Variant subject "Český jazyk" and whitespace/case in title
  assert.equal(resolveTopicMatch(existingTopics, 'Český jazyk', '  vyjmenovaná slova  '), 'topic_1');

  // 3. Math match
  assert.equal(resolveTopicMatch(existingTopics, 'Matematika', 'lineární rovnice'), 'topic_2');

  // 4. Non-existing topic returns null
  assert.equal(resolveTopicMatch(existingTopics, 'Matematika', 'Neznámé téma'), null);
});

test('resolveSubtopicMatch finds existing subtopic under topicId case-insensitively', () => {
  const existingSubtopics: PracticeSubtopic[] = [
    {
      id: 'sub_b',
      title: 'Slova po B',
      topicId: 'topic_1',
      subjectId: 'Čeština',
      hasStudyMaterial: true
    },
    {
      id: 'sub_l',
      title: 'Slova po L',
      topicId: 'topic_1',
      subjectId: 'Čeština',
      hasStudyMaterial: true
    }
  ];

  assert.equal(resolveSubtopicMatch(existingSubtopics, 'topic_1', 'slova po b'), 'sub_b');
  assert.equal(resolveSubtopicMatch(existingSubtopics, 'topic_1', '  Slova po L  '), 'sub_l');
  assert.equal(resolveSubtopicMatch(existingSubtopics, 'topic_1', 'Slova po M'), null);
  assert.equal(resolveSubtopicMatch(existingSubtopics, 'topic_different', 'Slova po B'), null);
});

test('mergeStudySteps non-invasively preserves existing steps and adds new steps without duplicates', () => {
  const existingSteps: StudyStep[] = [
    {
      title: 'Krok 1',
      content: 'Rozpoznání kořene slova',
      tutorTip: 'Dívej se na příbuzná slova',
      testQuestion: 'Jaký je kořen slova příbytek?',
      testOptions: ['byt', 'bit', 'tek', 'pří'],
      correctAnswer: 'byt'
    },
    {
      title: 'Krok 2',
      content: 'Pravidlo pro slovo být',
      tutorTip: 'Být znamená existovat'
    }
  ];

  const incomingSteps: StudyStep[] = [
    // Duplicate step number & content: should be skipped
    {
      title: 'Krok 1',
      content: 'Rozpoznání kořene slova'
    },
    // New step 3
    {
      title: 'Krok 3',
      content: 'Chytáky typu nabýt vs nabít',
      tutorTip: 'Nabýt vědomosti x nabít baterii'
    }
  ];

  const { mergedSteps, addedCount, skippedCount } = mergeStudySteps(existingSteps, incomingSteps);

  assert.equal(addedCount, 1);
  assert.equal(skippedCount, 1);
  assert.equal(mergedSteps.length, 3);

  // Existing step 1 must keep all original question/tutorTip details
  assert.equal(mergedSteps[0].title, 'Krok 1');
  assert.equal(mergedSteps[0].tutorTip, 'Dívej se na příbuzná slova');
  assert.equal(mergedSteps[0].testQuestion, 'Jaký je kořen slova příbytek?');

  // Step 2 retained
  assert.equal(mergedSteps[1].title, 'Krok 2');

  // Step 3 added
  assert.equal(mergedSteps[2].title, 'Krok 3');
  assert.equal(mergedSteps[2].content, 'Chytáky typu nabýt vs nabít');
});
