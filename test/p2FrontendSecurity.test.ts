import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isSameOriginApiUrl,
  sanitizeSafeUrl,
  sanitizeMaterialPreviewUrl,
} from '../src/utils/urlSecurity';
import {
  SVG_FORBID_TAGS,
  isForbiddenSvgTag,
  hasUnsafeCssValue,
  isAllowedSvgAttribute,
  sanitizeSvg,
} from '../src/utils/svgUtils';
import {
  DEFAULT_FLAGSHIP_COURSES,
  formatCoursePrice,
  parseCoursePriceNumber,
} from '../src/services/courseService';
import { validateInquiryPayload } from '../src/services/inquiryService';

const APP_ORIGIN = 'https://www.proeducator.eu';

test('SEC-17: isSameOriginApiUrl allows strictly same-origin paths and rejects external/protocol-relative/scheme attacks', () => {
  assert.equal(isSameOriginApiUrl('/api/materials/abc123/file', '/api/materials/', APP_ORIGIN), true);
  assert.equal(isSameOriginApiUrl('/api/materials/abc123/download', '/api/materials/', APP_ORIGIN), true);
  assert.equal(
    isSameOriginApiUrl('https://www.proeducator.eu/api/materials/abc123/file', '/api/materials/', APP_ORIGIN),
    true
  );

  // External origins & host confusion attacks
  assert.equal(isSameOriginApiUrl('https://evil.com/api/materials/1', '/api/materials/', APP_ORIGIN), false);
  assert.equal(
    isSameOriginApiUrl('https://www.proeducator.eu.evil.com/api/materials/1', '/api/materials/', APP_ORIGIN),
    false
  );
  assert.equal(
    isSameOriginApiUrl('https://www.proeducator.eu@evil.com/api/materials/1', '/api/materials/', APP_ORIGIN),
    false
  );
  assert.equal(isSameOriginApiUrl('https://proeducator.eu/api/materials/1', '/api/materials/', APP_ORIGIN), false);

  // Protocol-relative & backslash host tricks
  assert.equal(isSameOriginApiUrl('//evil.com/api/materials/1', '/api/materials/', APP_ORIGIN), false);
  assert.equal(isSameOriginApiUrl('/\\evil.com/api/materials/1', '/api/materials/', APP_ORIGIN), false);
  assert.equal(isSameOriginApiUrl('\\\\evil.com/api/materials/1', '/api/materials/', APP_ORIGIN), false);

  // Dangerous schemes & path traversal / prefix mismatch
  assert.equal(isSameOriginApiUrl('javascript:alert(1)', '/api/materials/', APP_ORIGIN), false);
  assert.equal(isSameOriginApiUrl('javascript://%0a/api/materials/1', '/api/materials/', APP_ORIGIN), false);
  assert.equal(isSameOriginApiUrl('data:text/html,<script>alert(1)</script>', '/api/materials/', APP_ORIGIN), false);
  assert.equal(isSameOriginApiUrl('/api/materials/../orders/my', '/api/materials/', APP_ORIGIN), false);
  assert.equal(isSameOriginApiUrl('/api/orders/my', '/api/materials/', APP_ORIGIN), false);
  assert.equal(isSameOriginApiUrl('', '/api/materials/', APP_ORIGIN), false);

  // Fail closed for absolute URLs when origin cannot be resolved (SSR/Node without originOverride)
  assert.equal(isSameOriginApiUrl('https://evil.com/api/materials/1', '/api/materials/'), false);
  assert.equal(isSameOriginApiUrl('/api/materials/mat1/file', '/api/materials/'), true);
});

test('SEC-17: practiceService.ts, pdfToSvg.ts, and materialPages.ts gate auth/credentials behind isSameOriginApiUrl', () => {
  const practiceSrc = fs.readFileSync(path.resolve('src/services/practiceService.ts'), 'utf-8');
  const pdfSrc = fs.readFileSync(path.resolve('src/utils/pdfToSvg.ts'), 'utf-8');
  const pagesSrc = fs.readFileSync(path.resolve('src/utils/materialPages.ts'), 'utf-8');

  assert.ok(
    practiceSrc.includes("isSameOriginApiUrl(url, '/api/materials/')"),
    'fetchProtectedMaterialResource must check isSameOriginApiUrl'
  );
  assert.ok(
    practiceSrc.includes("isSameOriginApiUrl(targetUrl, '/api/materials/')"),
    'downloadProtectedMaterialFile must check isSameOriginApiUrl'
  );
  assert.ok(
    !pdfSrc.includes(".includes('/api/materials/')"),
    'pdfToSvg.ts must not use unsafe substring .includes("/api/materials/") checks'
  );
  assert.ok(
    pdfSrc.includes("isSameOriginApiUrl(targetUrl, '/api/materials/')"),
    'pdfToSvg.ts getAuthHeaders must use isSameOriginApiUrl'
  );
  assert.ok(
    pagesSrc.includes("credentials: isProtected ? 'include' : 'omit'"),
    'materialPages.ts must only send credentials: include for same-origin protected material URLs'
  );
});

test('SEC-19: svgUtils.ts forbids <style> and SMIL animation tags and blocks obfuscated CSS URL bypasses', () => {
  const forbidLower = new Set(SVG_FORBID_TAGS.map((t) => t.toLowerCase()));
  for (const tag of ['style', 'animate', 'set', 'animatemotion', 'animatetransform', 'mpath', 'script', 'foreignobject']) {
    assert.ok(forbidLower.has(tag), `SVG_FORBID_TAGS must include ${tag}`);
    assert.equal(isForbiddenSvgTag(tag), true, `isForbiddenSvgTag(${tag}) must be true`);
    assert.equal(isForbiddenSvgTag(tag.toUpperCase()), true, `isForbiddenSvgTag(${tag.toUpperCase()}) must be true`);
  }

  // CSS comment splitting & hex escape bypasses
  assert.equal(hasUnsafeCssValue('background: url/**/(https://evil.com/leak.png)'), true);
  assert.equal(hasUnsafeCssValue('background: url(/*comment*/https://evil.com/leak.png)'), true);
  assert.equal(hasUnsafeCssValue('background: \\75rl(https://evil.com/leak.png)'), true);
  assert.equal(hasUnsafeCssValue('background: \\000075rl(https://evil.com/leak.png)'), true);
  assert.equal(hasUnsafeCssValue('@/*x*/import "https://evil.com/a.css"'), true);
  assert.equal(hasUnsafeCssValue('width: expr/**/ession(alert(1))'), true);
  assert.equal(hasUnsafeCssValue('fill: url(javascript:alert(1))'), true);
  assert.equal(hasUnsafeCssValue('fill: url(#grad1); background: url(https://evil.com/x)'), true);

  // Safe local fragment URLs and standard CSS properties remain allowed
  assert.equal(hasUnsafeCssValue('fill: url(#grad-1); stroke: #0F2942; stroke-width: 2px;'), false);
  assert.equal(hasUnsafeCssValue('color: red; /* benign comment */ opacity: 0.9;'), false);

  // Attribute-level validation
  assert.equal(isAllowedSvgAttribute('rect', 'style', 'background: url/**/(https://evil)'), false);
  assert.equal(isAllowedSvgAttribute('rect', 'style', 'background: \\75rl(https://evil)'), false);
  assert.equal(isAllowedSvgAttribute('rect', 'fill', 'url/**/(https://evil.com/a.svg#x)'), false);
  assert.equal(isAllowedSvgAttribute('rect', 'fill', 'url(#myGrad)'), true);
  assert.equal(isAllowedSvgAttribute('rect', 'onclick', 'alert(1)'), false);
  assert.equal(isAllowedSvgAttribute('animate', 'attributeName', 'href'), false);
  assert.equal(isAllowedSvgAttribute('image', 'href', 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
  assert.equal(isAllowedSvgAttribute('image', 'href', 'javascript:alert(1)'), false);

  // Fail closed cleanly in non-DOM/SSR environments
  assert.equal(sanitizeSvg('<svg><style>body{display:none}</style><rect/></svg>'), '');
});

test('SEC-20: sanitizeSafeUrl and sanitizeMaterialPreviewUrl block javascript:, arbitrary data:, and unsafe sinks', () => {
  // Default sanitizeSafeUrl
  assert.equal(sanitizeSafeUrl('https://meet.google.com/abc-defg-hij'), 'https://meet.google.com/abc-defg-hij');
  assert.equal(sanitizeSafeUrl('http://localhost:3005/test'), 'http://localhost:3005/test');
  assert.equal(sanitizeSafeUrl('/api/materials/m1/file'), '/api/materials/m1/file');
  assert.equal(sanitizeSafeUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(sanitizeSafeUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeSafeUrl('JAVASCRIPT:alert(1)'), null);
  assert.equal(sanitizeSafeUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(sanitizeSafeUrl('data:image/svg+xml,<svg onload=alert(1)>'), null);
  assert.equal(sanitizeSafeUrl('//evil.com/phish'), null);

  // Strict httpOnly mode for meetUrl & external links
  assert.equal(
    sanitizeSafeUrl('https://meet.google.com/abc-defg-hij', { httpOnly: true }),
    'https://meet.google.com/abc-defg-hij'
  );
  assert.equal(sanitizeSafeUrl('/relative/path', { httpOnly: true }), null);
  assert.equal(sanitizeSafeUrl('data:image/png;base64,iVBORw0KGgo=', { httpOnly: true }), null);
  assert.equal(sanitizeSafeUrl('javascript:alert(1)', { httpOnly: true }), null);

  // MaterialsManager preview URL whitelist
  assert.equal(
    sanitizeMaterialPreviewUrl('data:application/pdf;base64,JVBERi0xLjQK', { originOverride: APP_ORIGIN }),
    'data:application/pdf;base64,JVBERi0xLjQK'
  );
  assert.equal(
    sanitizeMaterialPreviewUrl(`blob:${APP_ORIGIN}/550e8400-e29b-41d4-a716-446655440000`, {
      originOverride: APP_ORIGIN,
    }),
    `blob:${APP_ORIGIN}/550e8400-e29b-41d4-a716-446655440000`
  );
  assert.equal(
    sanitizeMaterialPreviewUrl('/api/materials/mat_1/file', { originOverride: APP_ORIGIN }),
    '/api/materials/mat_1/file'
  );
  assert.equal(
    sanitizeMaterialPreviewUrl('https://storage.googleapis.com/bucket/sheet.pdf', { originOverride: APP_ORIGIN }),
    'https://storage.googleapis.com/bucket/sheet.pdf'
  );
  assert.equal(
    sanitizeMaterialPreviewUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==', {
      originOverride: APP_ORIGIN,
    }),
    null
  );
  assert.equal(
    sanitizeMaterialPreviewUrl('data:image/svg+xml;base64,PHN2Zy8+', { originOverride: APP_ORIGIN }),
    null
  );
  assert.equal(
    sanitizeMaterialPreviewUrl('data:application/pdf;base64,not valid!@#', { originOverride: APP_ORIGIN }),
    null
  );
  assert.equal(
    sanitizeMaterialPreviewUrl('blob:https://evil.com/1234', { originOverride: APP_ORIGIN }),
    null
  );
  assert.equal(sanitizeMaterialPreviewUrl('javascript:alert(1)', { originOverride: APP_ORIGIN }), null);
});

test('SEC-20: meetUrl window.open sinks and MaterialsManager preview sinks enforce sanitization', () => {
  const meetSinkFiles = [
    'src/components/LiveLessonNotificationWatcher.tsx',
    'src/components/NotificationPopover.tsx',
    'src/components/admin/LiveLessonsManager.tsx',
    'src/components/admin/TeacherLessonsOverview.tsx',
  ];

  for (const relPath of meetSinkFiles) {
    const src = fs.readFileSync(path.resolve(relPath), 'utf-8');
    assert.ok(src.includes('sanitizeSafeUrl('), `${relPath} must sanitize URLs with sanitizeSafeUrl`);
    assert.ok(!src.includes('window.open(lesson.meetUrl'), `${relPath} must not pass raw lesson.meetUrl to window.open`);
    assert.ok(!src.includes('window.open(item.meetUrl'), `${relPath} must not pass raw item.meetUrl to window.open`);
  }

  const materialsMgrSrc = fs.readFileSync(path.resolve('src/components/admin/MaterialsManager.tsx'), 'utf-8');
  assert.ok(
    materialsMgrSrc.includes('sanitizeMaterialPreviewUrl('),
    'MaterialsManager.tsx must sanitize data:/blob:/preview URLs'
  );
  assert.ok(
    !materialsMgrSrc.includes('src={`${previewResource.blobUrl}#toolbar=1`}'),
    'MaterialsManager.tsx iframe must render sanitized preview URL, not raw previewResource.blobUrl'
  );
  assert.ok(
    !materialsMgrSrc.includes('href={previewResource.blobUrl}'),
    'MaterialsManager.tsx anchor must render sanitized preview URL, not raw previewResource.blobUrl'
  );

  const pdfSrc = fs.readFileSync(path.resolve('src/utils/pdfToSvg.ts'), 'utf-8');
  assert.ok(
    pdfSrc.includes('sanitizeSafeUrl(directPdfUrl, { httpOnly: true })'),
    'pdfToSvg.ts directPdfUrl fallback must sanitize URL with sanitizeSafeUrl'
  );
});

test('SEC-21: practiceService.ts uses excelWorkbook and has zero legacy xlsx imports', () => {
  const practiceSrc = fs.readFileSync(path.resolve('src/services/practiceService.ts'), 'utf-8');
  assert.ok(!practiceSrc.includes("import('xlsx')"), 'practiceService.ts must not import xlsx');
  assert.ok(!practiceSrc.includes("from 'xlsx'"), 'practiceService.ts must not statically import xlsx');
  assert.ok(practiceSrc.includes("import('../utils/excelWorkbook')"), 'practiceService.ts must use excelWorkbook');
});

test('SEC-28 & SEC-34: firebase.ts uses memoryLocalCache, SurveyResponsesManager has no sessionStorage PII cache, AuthContext supports hasRecurringPaymentMethod', () => {
  const firebaseSrc = fs.readFileSync(path.resolve('src/lib/firebase.ts'), 'utf-8');
  assert.ok(firebaseSrc.includes('memoryLocalCache()'), 'firebase.ts must configure memoryLocalCache()');
  assert.ok(!firebaseSrc.includes('persistentLocalCache'), 'firebase.ts must not use persistentLocalCache');

  const surveySrc = fs.readFileSync(path.resolve('src/components/admin/SurveyResponsesManager.tsx'), 'utf-8');
  assert.ok(!surveySrc.includes('sessionStorage'), 'SurveyResponsesManager.tsx must not cache survey PII in sessionStorage');
  assert.ok(!surveySrc.includes('SURVEYS_SESSION_KEY'), 'SurveyResponsesManager.tsx must not define SURVEYS_SESSION_KEY');

  const authSrc = fs.readFileSync(path.resolve('src/context/AuthContext.tsx'), 'utf-8');
  assert.ok(
    authSrc.includes('hasRecurringPaymentMethod'),
    'AuthContext.tsx must preserve SEC-34 hasRecurringPaymentMethod compatibility'
  );
  assert.ok(authSrc.includes('cacheManager.clear()'), 'AuthContext.tsx must clear in-memory caches on signOut');
});

test('SEC-29: client schema alignment (numeric course prices, 2000-char inquiry comment cap, no dead tests addDoc)', () => {
  // Numeric prices in DEFAULT_FLAGSHIP_COURSES
  for (const course of DEFAULT_FLAGSHIP_COURSES) {
    assert.equal(typeof course.price, 'number', `Course ${course.id} must have numeric price`);
    assert.ok((course.price as number) > 0, `Course ${course.id} price must be positive`);
  }
  assert.equal(formatCoursePrice(3990), '3 990 Kč / sezóna');
  assert.equal(formatCoursePrice(2490), '2 490 Kč / sezóna');
  assert.equal(formatCoursePrice('3 990 Kč / sezóna'), '3 990 Kč / sezóna');
  assert.equal(parseCoursePriceNumber('3 990 Kč / sezóna'), 3990);
  assert.equal(parseCoursePriceNumber(2490), 2490);

  // Inquiry comment cap aligned to 2000 chars
  const longComment = 'a'.repeat(2500);
  const validated = validateInquiryPayload({
    studentId: 'student_1',
    comment: longComment,
  });
  assert.equal(validated.comment.length, 2000);

  // No dead client addDoc(collection(db, 'tests')) in practiceService.ts
  const practiceSrc = fs.readFileSync(path.resolve('src/services/practiceService.ts'), 'utf-8');
  assert.ok(
    !practiceSrc.includes("collection(db, 'tests')"),
    'practiceService.ts must not contain dead client writes to tests collection'
  );
});
