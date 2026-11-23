import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  MATERIAL_EXPORT_MONTHLY_LIMIT,
  computeMaterialQuotaPeriod,
  canUserViewMaterial,
  buildWatermarkText,
  detectSvgPageCount,
} from '../server/utils/materialQuota.js';
import { mapDocToMaterial } from '../src/services/practiceService';

test('computeMaterialQuotaPeriod prevents month-boundary exploit by anchoring to 30-day billing cycle', () => {
  assert.equal(MATERIAL_EXPORT_MONTHLY_LIMIT, 8);

  const subEnd = '2026-12-20T12:00:00.000Z';
  const nov25 = new Date('2026-11-25T10:00:00.000Z').getTime();
  const dec01 = new Date('2026-12-01T10:00:00.000Z').getTime();

  const pNov = computeMaterialQuotaPeriod({ subscriptionPeriodEnd: subEnd }, nov25);
  const pDec = computeMaterialQuotaPeriod({ subscriptionPeriodEnd: subEnd }, dec01);

  assert.equal(pNov.periodKey, 'cycle_2026-12-20');
  assert.equal(pDec.periodKey, pNov.periodKey, 'Nov 25 and Dec 1 within same subscription period must share quota key');
  assert.equal(pNov.periodEndsAt, subEnd);

  // Rolling 30-day cycle fallback for course / manual premium users without subscriptionPeriodEnd
  const anchor = '2026-10-01T00:00:00.000Z';
  const day10 = new Date('2026-10-11T00:00:00.000Z').getTime();
  const day35 = new Date('2026-11-05T00:00:00.000Z').getTime();

  const roll1 = computeMaterialQuotaPeriod({ premiumSince: anchor }, day10);
  const roll2 = computeMaterialQuotaPeriod({ premiumSince: anchor }, day35);
  assert.notEqual(roll1.periodKey, roll2.periodKey, '35 days later should move to the next 30-day rolling cycle');
});

test('canUserViewMaterial, buildWatermarkText, and detectSvgPageCount enforce access & watermarking rules', () => {
  const lockedMat = { id: 'm1', status: 'ready', hiddenFromLibrary: false, isFreeSample: false };
  const sampleMat = { id: 'm2', status: 'ready', hiddenFromLibrary: false, isFreeSample: true };
  const hiddenSample = { id: 'm3', status: 'ready', hiddenFromLibrary: true, isFreeSample: true };

  // Guest & free users
  assert.equal(canUserViewMaterial(null, lockedMat), false);
  assert.equal(canUserViewMaterial({ uid: 'u1', role: 'free', enrolledCourseIds: [] }, lockedMat), false);
  assert.equal(canUserViewMaterial(null, sampleMat), true);
  assert.equal(canUserViewMaterial({ uid: 'u1', role: 'free', enrolledCourseIds: [] }, sampleMat), true);
  assert.equal(canUserViewMaterial({ uid: 'u1', role: 'free', enrolledCourseIds: [] }, hiddenSample), false);

  // Paid & teacher users
  assert.equal(canUserViewMaterial({ uid: 'u2', role: 'premium', enrolledCourseIds: [] }, lockedMat), true);
  assert.equal(canUserViewMaterial({ uid: 'u3', role: 'course', enrolledCourseIds: ['c1'] }, lockedMat), true);
  assert.equal(canUserViewMaterial({ uid: 'u4', role: 'course', enrolledCourseIds: [] }, lockedMat), false);
  assert.equal(canUserViewMaterial({ uid: 't1', role: 'teacher', enrolledCourseIds: [] }, hiddenSample), true);

  // Watermark formatting
  const fixedDate = new Date('2026-11-22T12:00:00.000Z');
  assert.equal(buildWatermarkText({ role: 'teacher', email: 'ucitel@ucitel.cz' }, fixedDate), null);
  const studentWm = buildWatermarkText({ role: 'premium', email: 'student@student.cz' }, fixedDate);
  assert.ok(studentWm && studentWm.includes('ProEducator') && studentWm.includes('student@student.cz'));

  // SVG page count detection
  const multiSvg = '<svg><g id="pdf-page-1"></g><g id="pdf-page-2"></g><g id="pdf-page-3"></g></svg>';
  assert.equal(detectSvgPageCount(multiSvg), 3);
  assert.equal(detectSvgPageCount('<svg><rect width="10" height="10"/></svg>'), 1);
  assert.equal(detectSvgPageCount('not svg'), null);
});

test('mapDocToMaterial supports new metadata fields and remains backward compatible with legacy docs', () => {
  const legacy = mapDocToMaterial('mat_legacy', {
    title: 'Starý pracovní list',
    subject: 'Matematika',
    topic: 'Zlomky',
  });
  assert.equal(legacy.materialType, 'worksheet');
  assert.equal(legacy.grade, '9');
  assert.equal(legacy.hasExplicitGrade, false);
  assert.equal(legacy.order, null);
  assert.equal(legacy.isFreeSample, false);
  assert.equal(legacy.isExamPrep, false);

  const modern = mapDocToMaterial('mat_new', {
    title: 'Tahák na kvadratické rovnice',
    subject: 'Matematika',
    topic: 'Algebra',
    topicId: 'topic_alg',
    subtopicId: 'sub_quad',
    materialType: 'cheatsheet',
    grade: '7',
    order: 3,
    pageCount: 2,
    isFreeSample: true,
    isExamPrep: true,
    locked: false,
    canDownload: false,
  });
  assert.equal(modern.topicId, 'topic_alg');
  assert.equal(modern.subtopicId, 'sub_quad');
  assert.equal(modern.materialType, 'cheatsheet');
  assert.equal(modern.grade, '7');
  assert.equal(modern.hasExplicitGrade, true);
  assert.equal(modern.order, 3);
  assert.equal(modern.pageCount, 2);
  assert.equal(modern.isFreeSample, true);
  assert.equal(modern.isExamPrep, true);
  assert.equal(modern.canDownload, false);
});

test('firestore.rules locks direct reads of learningSheets/chunks and protects materialQuotas & studyProgress', () => {
  const rules = fs.readFileSync(path.resolve('firestore.rules'), 'utf-8');

  const learningSheetsBlock = rules.slice(
    rules.indexOf('match /learningSheets/{sheetId}'),
    rules.indexOf('match /studyMaterials/{materialId}')
  );
  assert.ok(learningSheetsBlock.includes('allow read: if isTeacher();'), 'learningSheets and chunks must only allow teacher direct reads');
  assert.ok(!learningSheetsBlock.includes('isPaidUser()'), 'learningSheets/chunks must NOT allow direct client reads via isPaidUser()');

  assert.ok(rules.includes('match /materialQuotas/{periodKey}'), 'firestore.rules must define materialQuotas subcollection');
  const quotaIdx = rules.indexOf('match /materialQuotas/{periodKey}');
  const quotaSnippet = rules.slice(quotaIdx, quotaIdx + 180);
  assert.ok(quotaSnippet.includes('allow read: if isOwner(userId) || isTeacher();'));
  assert.ok(quotaSnippet.includes('allow write: if false;'));

  assert.ok(rules.includes('function isValidStudyProgress('));
  assert.ok(rules.includes('match /studyProgress/{subtopicId}'));
});
