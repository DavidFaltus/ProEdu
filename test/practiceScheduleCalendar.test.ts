import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isSameDay, addDays, getDay } from 'date-fns';
import {
  generatePracticeSchedule,
  detectScheduleCollision,
} from '../src/services/calendarService';
import { ScheduleConfig, TodoItem } from '../src/types';

test('generatePracticeSchedule orders subtopics in blocks vs interleaved mode', () => {
  const startDate = new Date('2026-11-09T00:00:00'); // Monday

  const baseConfig: ScheduleConfig = {
    selections: [
      {
        subtopicId: 'sub-a',
        subtopicTitle: 'Rovnice',
        topicId: 'top-1',
        subjectId: 'Matematika',
        repetitions: 3,
      },
      {
        subtopicId: 'sub-b',
        subtopicTitle: 'Zlomky',
        topicId: 'top-1',
        subjectId: 'Matematika',
        repetitions: 2,
      },
    ],
    intervalMode: 'daily',
    customIntervalDays: 2,
    selectedWeekdays: [1, 3, 5],
    sequencingMode: 'blocks',
    dailyQuota: 1,
    startDate,
    preferredHour: 16,
    collisionStrategy: 'merge',
  };

  // 1. Blocks mode: A1, A2, A3, B1, B2
  const blocksResult = generatePracticeSchedule(baseConfig);
  assert.equal(blocksResult.length, 5);
  assert.deepEqual(
    blocksResult.map((r) => `${r.subtopicId}:${r.repetitionIndex}/${r.totalRepetitions}`),
    ['sub-a:1/3', 'sub-a:2/3', 'sub-a:3/3', 'sub-b:1/2', 'sub-b:2/2']
  );

  // 2. Interleaved mode: A1, B1, A2, B2, A3
  const interleavedResult = generatePracticeSchedule({
    ...baseConfig,
    sequencingMode: 'interleaved',
  });
  assert.equal(interleavedResult.length, 5);
  assert.deepEqual(
    interleavedResult.map((r) => `${r.subtopicId}:${r.repetitionIndex}/${r.totalRepetitions}`),
    ['sub-a:1/3', 'sub-b:1/2', 'sub-a:2/3', 'sub-b:2/2', 'sub-a:3/3']
  );
});

test('generatePracticeSchedule respects custom_interval, weekdays, and dailyQuota', () => {
  const startDate = new Date('2026-11-09T00:00:00'); // Monday (getDay === 1)

  const configCustomInterval: ScheduleConfig = {
    selections: [
      {
        subtopicId: 'sub-week',
        subtopicTitle: 'Pythagorova věta',
        topicId: 'top-geo',
        subjectId: 'Matematika',
        repetitions: 4,
      },
    ],
    intervalMode: 'custom_interval',
    customIntervalDays: 2, // every other day
    selectedWeekdays: [1, 3, 5],
    sequencingMode: 'blocks',
    dailyQuota: 1,
    startDate,
    preferredHour: 16,
    collisionStrategy: 'merge',
  };

  const everyOtherDay = generatePracticeSchedule(configCustomInterval);
  assert.equal(everyOtherDay.length, 4);
  assert.ok(isSameDay(everyOtherDay[0].dueDate, startDate));
  assert.ok(isSameDay(everyOtherDay[1].dueDate, addDays(startDate, 2)));
  assert.ok(isSameDay(everyOtherDay[2].dueDate, addDays(startDate, 4)));
  assert.ok(isSameDay(everyOtherDay[3].dueDate, addDays(startDate, 6)));

  // Weekdays mode (Mon=1, Wed=3, Fri=5)
  const weekdaysResult = generatePracticeSchedule({
    ...configCustomInterval,
    intervalMode: 'weekdays',
    selectedWeekdays: [1, 3, 5],
  });
  assert.equal(weekdaysResult.length, 4);
  assert.deepEqual(
    weekdaysResult.map((item) => getDay(item.dueDate)),
    [1, 3, 5, 1]
  );

  // Daily quota = 2 exercises per day
  const quota2Result = generatePracticeSchedule({
    ...configCustomInterval,
    intervalMode: 'daily',
    dailyQuota: 2,
  });
  assert.equal(quota2Result.length, 4);
  assert.ok(isSameDay(quota2Result[0].dueDate, startDate));
  assert.ok(isSameDay(quota2Result[1].dueDate, startDate));
  assert.ok(isSameDay(quota2Result[2].dueDate, addDays(startDate, 1)));
  assert.ok(isSameDay(quota2Result[3].dueDate, addDays(startDate, 1)));
});

test('detectScheduleCollision and append_after collision strategy work properly', () => {
  const startDate = new Date('2026-11-09T00:00:00');
  const existingTodos: TodoItem[] = [
    {
      id: 'todo-1',
      studentId: 'student-1',
      title: 'Existující cvičení 1',
      type: 'practice',
      completed: false,
      addedBy: 'student-1',
      createdAt: new Date(),
      dueDate: addDays(startDate, 1), // Nov 10
    },
    {
      id: 'todo-2',
      studentId: 'student-1',
      title: 'Existující cvičení 2',
      type: 'practice',
      completed: false,
      addedBy: 'student-1',
      createdAt: new Date(),
      dueDate: addDays(startDate, 2), // Nov 11
    },
  ];

  const config: ScheduleConfig = {
    selections: [
      {
        subtopicId: 'sub-1',
        subtopicTitle: 'Shoda přísudku s podmětem',
        topicId: 'top-cz',
        subjectId: 'Čeština',
        repetitions: 3,
      },
    ],
    intervalMode: 'daily',
    customIntervalDays: 1,
    selectedWeekdays: [1, 2, 3, 4, 5],
    sequencingMode: 'blocks',
    dailyQuota: 1,
    startDate,
    preferredHour: 16,
    collisionStrategy: 'merge',
  };

  const collision = detectScheduleCollision(config, existingTodos);
  assert.equal(collision.hasCollision, true);
  assert.equal(collision.collidingDaysCount, 2);

  // Append after existing schedule -> should start on Nov 12 (startDate + 3 days)
  const appended = generatePracticeSchedule(
    { ...config, collisionStrategy: 'append_after' },
    existingTodos
  );
  assert.equal(appended.length, 3);
  assert.ok(isSameDay(appended[0].dueDate, addDays(startDate, 3)));
  assert.ok(isSameDay(appended[1].dueDate, addDays(startDate, 4)));
  assert.ok(isSameDay(appended[2].dueDate, addDays(startDate, 5)));
});

test('firestore.rules enforces isPremiumOrAdmin for practice todos and partial-safe updates', () => {
  const rulesContent = fs.readFileSync(path.resolve('firestore.rules'), 'utf-8');
  assert.ok(
    rulesContent.includes('function isPremiumOrAdmin()'),
    'firestore.rules must define isPremiumOrAdmin()'
  );
  assert.ok(
    rulesContent.includes("(request.resource.data.type != 'practice' || isPremiumOrAdmin())"),
    'firestore.rules must require isPremiumOrAdmin() when creating practice todos'
  );
  assert.ok(
    rulesContent.includes("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['title', 'dueDate', 'completed', 'completedAt'])"),
    'firestore.rules must enforce partial-safe updates on todos'
  );
  assert.ok(
    rulesContent.includes("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['completed', 'completedAt'])"),
    'firestore.rules must allow students to only mark teacher-assigned todos as completed without changing dueDate or title'
  );
  assert.ok(
    rulesContent.includes('(isOwner(resource.data.studentId) && resource.data.addedBy == request.auth.uid)'),
    'firestore.rules must prevent students from deleting teacher-assigned practice todos'
  );
});
