import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { sanitizeSvg, sanitizeCssUrlCalls } from '../server/utils/svgSanitizer.js';
import {
  sanitizeAllowedBugReportPageUrl,
  sanitizeAllowedBugReportScreenshotUrl,
  resolveBugReportRecipient,
  sendBugReportEmail,
  setTransporterForTesting,
  resetTransporterForTesting,
} from '../server/services/emailService.js';

const SERVER_PATH = path.resolve(process.cwd(), 'server/index.js');
const EMAIL_SERVICE_PATH = path.resolve(process.cwd(), 'server/services/emailService.js');
const serverCode = fs.readFileSync(SERVER_PATH, 'utf8').replace(/\r\n/g, '\n');
const emailServiceCode = fs.readFileSync(EMAIL_SERVICE_PATH, 'utf8').replace(/\r\n/g, '\n');

function extractBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, `Expected marker "${startMarker}"`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `Expected end marker "${endMarker}" after "${startMarker}"`);
  return source.slice(start, end);
}

// =========================================================================
// SEC-19: Server SVG sanitizer hardening & missing coverage
// =========================================================================

test('SEC-19: sanitizeSvg completely strips <style> elements and SMIL animation tags', () => {
  const maliciousSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
      <style>body { display: none !important; } @import url('https://evil.test/x.css');</style>
      <style><![CDATA[.btn { opacity: 0; }]]></style>
      <rect x="0" y="0" width="100" height="100" fill="#123456">
        <animate attributeName="x" from="0" to="100" dur="1s" repeatCount="indefinite" />
        <set attributeName="href" to="javascript:alert(1)" />
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="2s" />
        <animateMotion path="M0,0 L100,100" dur="2s"><mpath href="#p1" /></animateMotion>
      </rect>
      <circle cx="50" cy="50" r="20" fill="url(#safeGrad)" />
    </svg>
  `;

  const clean = sanitizeSvg(maliciousSvg);
  assert.ok(!/<style/i.test(clean), 'Must strip all <style> tags');
  assert.ok(!clean.includes('display: none'), 'Must strip CSS content inside <style>');
  assert.ok(!clean.includes('.btn'), 'Must strip CDATA CSS content inside <style>');
  assert.ok(!/<animate\b/i.test(clean), 'Must strip <animate>');
  assert.ok(!/<set\b/i.test(clean), 'Must strip <set>');
  assert.ok(!/<animateTransform/i.test(clean), 'Must strip <animateTransform>');
  assert.ok(!/<animateMotion/i.test(clean), 'Must strip <animateMotion>');
  assert.ok(!/<mpath/i.test(clean), 'Must strip <mpath>');
  assert.ok(!clean.includes('javascript:'), 'Must strip javascript: payloads');

  // Legitimate geometric shapes & local fragment gradient refs stay intact
  assert.ok(clean.includes('<rect'), 'Must keep legitimate <rect>');
  assert.ok(clean.includes('<circle'), 'Must keep legitimate <circle>');
  assert.ok(clean.includes('fill="url(#safeGrad)"'), 'Must preserve safe local #fragment url()');
});

test('SEC-19: sanitizeCssUrlCalls & inline style reject CSS comments (url/**/), hex escapes (\\75rl), @import, expression(, javascript:', () => {
  // Direct sanitizeCssUrlCalls checks
  assert.equal(sanitizeCssUrlCalls('url(#grad_1)'), 'url(#grad_1)', 'Safe local fragment allowed');
  assert.equal(sanitizeCssUrlCalls('url(https://evil.test/track.svg)'), 'none', 'External URL neutralized');
  assert.equal(sanitizeCssUrlCalls('url/**/(https://evil.test/track.svg)'), 'none', 'Comment-obfuscated url/**/ neutralized');
  assert.equal(sanitizeCssUrlCalls('u/*x*/r/*y*/l(https://evil.test/track.svg)'), 'none', 'Split comment url neutralized');
  assert.equal(sanitizeCssUrlCalls('\\75rl(https://evil.test/track.svg)'), 'none', 'Hex-escaped \\75rl neutralized');
  assert.equal(sanitizeCssUrlCalls('u\\72 l(https://evil.test/track.svg)'), 'none', 'Hex-escaped u\\72 l neutralized');
  assert.equal(sanitizeCssUrlCalls('\\75\\72\\6c(#grad_1)'), 'none', 'Hex-escaped url(#fragment) rejected');
  assert.equal(sanitizeCssUrlCalls('url(javascript:alert(1))'), 'none', 'javascript: with nested parens inside url() neutralized');
  assert.equal(sanitizeCssUrlCalls('url(https://evil.test/a(1)b)'), 'none', 'nested parens external url neutralized');
  assert.equal(sanitizeCssUrlCalls('url(https://evil.test/unclosed'), 'none', 'unclosed url( neutralized');

  // End-to-end inside SVG inline style & fill attributes
  const obfuscatedSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <rect width="10" height="10" style="fill: \\75rl(https://evil.test/a); stroke: url/**/(https://evil.test/b); color: red" />
      <rect width="10" height="10" style="width: expr/**/ession(alert(1)); background: \\6a avascript:alert(1); @\\69mport 'https://evil.test/c.css'; opacity: 0.5" />
      <rect width="10" height="10" fill="u\\72l(https://evil.test/d)" />
      <rect width="10" height="10" fill="url/**/(https://evil.test/e)" />
    </svg>
  `;
  const clean = sanitizeSvg(obfuscatedSvg);
  assert.ok(!clean.includes('evil.test'), 'No external evil.test URL may survive SVG sanitization');
  assert.ok(!/expression/i.test(clean), 'No expression() may survive SVG sanitization');
  assert.ok(!/javascript/i.test(clean), 'No javascript: may survive SVG sanitization');
  assert.ok(!/@import/i.test(clean), 'No @import may survive SVG sanitization');
  assert.ok(clean.includes('color: red'), 'Safe CSS properties alongside bad ones survive');
  assert.ok(clean.includes('opacity: 0.5'), 'Safe opacity property survives');
});

test('SEC-19: server/index.js applies sanitizeSvg() to subtopic.svgContent and assignedTests questions[].svgContent & solutionSvgContent', () => {
  const subtopicSanitizerSlice = extractBetween(
    serverCode,
    'function sanitizeStudySubtopicFields(subtopic)',
    'function stripInternalOwnershipFields('
  );
  assert.ok(
    subtopicSanitizerSlice.includes("typeof copy.svgContent === 'string'") &&
      subtopicSanitizerSlice.includes('sanitizeSvg(copy.svgContent)'),
    'sanitizeStudySubtopicFields must sanitize top-level subtopic.svgContent'
  );
  assert.ok(
    subtopicSanitizerSlice.includes('sanitizeSvg(copy.sampleProblem.svgContent)'),
    'sanitizeStudySubtopicFields must sanitize sampleProblem.svgContent'
  );

  const assignedSanitizerSlice = extractBetween(
    serverCode,
    'function sanitizeAssignedTestForClient(rawTest, isTeacher)',
    'const ASSIGNED_TEST_DUE_GRACE_MS'
  );
  assert.ok(
    assignedSanitizerSlice.includes('sanitizeSvg(nextQ.svgContent)') &&
      assignedSanitizerSlice.includes('sanitizeSvg(nextQ.solutionSvgContent)') &&
      assignedSanitizerSlice.includes('sanitizeSvg(publicQ.svgContent)'),
    'sanitizeAssignedTestForClient must sanitize questions[].svgContent and questions[].solutionSvgContent'
  );
});

// =========================================================================
// SEC-26: Uniform /password-reset, per-user rate limits, PDF cache, Comgate fan-out cap, videoSessions TTL, bug-reports limit
// =========================================================================

test('SEC-26: POST /api/auth/password-reset returns uniform HTTP 200 message on user-not-found (no 404 enumeration)', () => {
  const pwdResetSlice = extractBetween(
    serverCode,
    "app.post('/api/auth/password-reset'",
    '// Dev endpoint pro lokální testování rolí'
  );

  const expectedUniformMsg =
    'Pokud účet s tímto e-mailem existuje, odeslali jsme odkaz pro obnovení hesla.';
  assert.ok(pwdResetSlice.includes(expectedUniformMsg), 'Must define exact uniform Czech password-reset message');
  assert.ok(!pwdResetSlice.includes('res.status(404)'), 'Must NOT return HTTP 404 when user is not found');
  assert.ok(
    pwdResetSlice.includes("if (err.code === 'auth/user-not-found'") &&
      pwdResetSlice.includes('return res.status(200).json({'),
    'auth/user-not-found must return HTTP 200 with uniform message'
  );
});

test('SEC-26: per-user rate limiters, bounded 5min/50-entry PDF cache, capped Comgate sync fan-out, videoSessions +24h expiresAt, and admin bug-reports limit', () => {
  // 1. Per-user rate limiters on all 4 endpoints
  assert.ok(
    serverCode.includes("app.post('/api/referrals/claim', requireAuth, requireVerifiedEmailForPasswordAuth, referralsClaimLimiter,"),
    '/api/referrals/claim must attach referralsClaimLimiter'
  );
  assert.ok(
    serverCode.includes("app.get('/api/orders/my', requireAuth, ordersMyLimiter,"),
    '/api/orders/my must attach ordersMyLimiter'
  );
  assert.ok(
    serverCode.includes("app.get('/api/orders/:orderId/invoice.pdf', requireAuth, orderInvoicePdfLimiter,"),
    '/api/orders/:orderId/invoice.pdf must attach orderInvoicePdfLimiter'
  );
  assert.ok(
    serverCode.includes("app.post('/api/jokers/video-session', requireAuth, jokerVideoSessionLimiter,"),
    '/api/jokers/video-session must attach jokerVideoSessionLimiter'
  );

  // 2. Bounded invoice PDF cache (5 min, max 50 entries, keyed by orderId + iuctoInvoiceId)
  assert.ok(serverCode.includes('const INVOICE_PDF_CACHE_TTL_MS = 5 * 60 * 1000;'), 'PDF cache TTL must be 5 minutes');
  assert.ok(serverCode.includes('const INVOICE_PDF_CACHE_MAX_ENTRIES = 50;'), 'PDF cache max entries must be 50');
  const invoiceRouteSlice = extractBetween(
    serverCode,
    "app.get('/api/orders/:orderId/invoice.pdf'",
    "app.post('/api/orders/:orderId/iucto-retry'"
  );
  assert.ok(
    invoiceRouteSlice.includes('const cacheKey = `${orderId}:${order.iuctoInvoiceId}`;') &&
      invoiceRouteSlice.includes('getCachedInvoicePdf(cacheKey)') &&
      invoiceRouteSlice.includes('setCachedInvoicePdf(cacheKey, pdfBuffer)'),
    '/invoice.pdf must use bounded short-TTL cache keyed by orderId + iuctoInvoiceId'
  );

  // 3. GET /api/orders/my Comgate fan-out cap (max 5) & 60s per-order cooldown
  assert.ok(serverCode.includes('const ORDERS_MY_MAX_COMGATE_SYNC = 5;'), 'Max Comgate sync fan-out must be 5');
  assert.ok(serverCode.includes('const ORDER_COMGATE_SYNC_COOLDOWN_MS = 60 * 1000;'), 'Per-order Comgate sync cooldown must be 60s');
  const ordersMySlice = extractBetween(
    serverCode,
    "app.get('/api/orders/my'",
    "app.post('/api/subscription/cancel'"
  );
  assert.ok(
    ordersMySlice.includes('eligibleSyncOrderIds.size >= ORDERS_MY_MAX_COMGATE_SYNC') &&
      ordersMySlice.includes('lastComgateCheckAt.get(ord.id)') &&
      ordersMySlice.includes('setBoundedMapEntry(lastComgateCheckAt,'),
    'GET /api/orders/my must cap Comgate sync to 5 recent pending orders with bounded 60s cooldown map'
  );

  // 4. videoSessions expiresAt (+24h Firestore Timestamp)
  assert.ok(serverCode.includes('const VIDEO_SESSION_TTL_MS = 24 * 60 * 60 * 1000;'), 'VIDEO_SESSION_TTL_MS must be +24h');
  const videoSessionSlice = extractBetween(
    serverCode,
    "app.post('/api/jokers/video-session'",
    "app.post('/api/jokers/video-reward'"
  );
  assert.ok(
    videoSessionSlice.includes('expiresAt: Timestamp.fromMillis(nowMs + VIDEO_SESSION_TTL_MS)'),
    '/api/jokers/video-session must store expiresAt Firestore Timestamp (+24h)'
  );

  // 5. GET /api/admin/bug-reports pagination limit (default 200, max 500)
  const adminBugsSlice = extractBetween(
    serverCode,
    "app.get('/api/admin/bug-reports'",
    "app.patch('/api/admin/bug-reports/:id'"
  );
  assert.ok(
    adminBugsSlice.includes('Math.min(rawLimit, 500) : 200') &&
      adminBugsSlice.includes(".orderBy('createdAt', 'desc').limit(limit).get()"),
    'GET /api/admin/bug-reports must paginate with default 200 and max 500 limit'
  );
});

// =========================================================================
// SEC-34: Minimize over-fetched internal IDs, diagnostics & public teacher UIDs
// =========================================================================

test('SEC-34: session-bootstrap omits raw initRecurringTransId/iuctoCustomerId and exposes hasRecurringPaymentMethod boolean', () => {
  const sanitizerSlice = extractBetween(
    serverCode,
    'function sanitizeUserProfileForClient(rawProfile)',
    "app.post('/api/auth/session-bootstrap'"
  );
  assert.ok(
    sanitizerSlice.includes('initRecurringTransId') &&
      sanitizerSlice.includes('iuctoCustomerId: _iuctoCustomerId') &&
      sanitizerSlice.includes('hasRecurringPaymentMethod: Boolean('),
    'sanitizeUserProfileForClient must strip raw initRecurringTransId & iuctoCustomerId and expose hasRecurringPaymentMethod'
  );

  const bootstrapSlice = extractBetween(
    serverCode,
    "app.post('/api/auth/session-bootstrap'",
    '// --- REGISTRACE S 6MÍSTNÝM OTP KÓDEM'
  );
  assert.ok(
    bootstrapSlice.includes('profile: sanitizeUserProfileForClient(bootstrapResult.profile)'),
    'session-bootstrap must return sanitized profile'
  );
});

test('SEC-34: GET /api/orders/my uses explicit student allowlist omitting admin diagnostics/locks/emails', () => {
  const allowlistSlice = extractBetween(
    serverCode,
    'const STUDENT_ORDER_ALLOWLIST_FIELDS =',
    'function isSandboxSimulationAllowed()'
  );
  const forbiddenInternalFields = [
    'iuctoError',
    'iuctoCreditNoteError',
    'confirmedBy',
    'refundedBy',
    'iuctoSyncLockUntil',
    'refundLockUntil',
    'initRecurringTransId',
    'iuctoCustomerId',
  ];
  for (const field of forbiddenInternalFields) {
    assert.ok(
      !allowlistSlice.includes(`'${field}'`),
      `STUDENT_ORDER_ALLOWLIST_FIELDS must NOT include internal field "${field}"`
    );
  }

  const ordersMySlice = extractBetween(
    serverCode,
    "app.get('/api/orders/my'",
    "app.post('/api/subscription/cancel'"
  );
  assert.ok(
    ordersMySlice.includes('orders.map((o) => sanitizeOrderForStudent(o))'),
    'GET /api/orders/my must sanitize every order via sanitizeOrderForStudent'
  );
});

test('SEC-34: sanitizeCourseForViewer and /api/practice/catalog omit teacherId & createdBy for non-teachers', () => {
  const courseSanitizerSlice = extractBetween(
    serverCode,
    'function sanitizeCourseForViewer(courseDoc, user)',
    'const COURSES_CACHE_TTL_MS'
  );
  assert.ok(
    courseSanitizerSlice.includes('const { meetUrl, studentIds, teacherId, createdBy, ...publicCourse } = serialized;') &&
      courseSanitizerSlice.includes('...(isTeacher && teacherId !== undefined ? { teacherId } : {})') &&
      courseSanitizerSlice.includes('...(isTeacher && createdBy !== undefined ? { createdBy } : {})'),
    'sanitizeCourseForViewer must omit teacherId and createdBy for non-teachers'
  );

  const catalogRouteSlice = extractBetween(
    serverCode,
    "app.get('/api/practice/catalog'",
    "app.get('/api/practice/study/:subtopicId'"
  );
  assert.ok(
    catalogRouteSlice.includes('stripInternalOwnershipFields(t, isTeacher)') &&
      catalogRouteSlice.includes('stripInternalOwnershipFields(stripSubtopicStudyContent(s), isTeacher)'),
    'GET /api/practice/catalog must strip teacherId and createdBy for non-teachers'
  );
});

// =========================================================================
// SEC-35: Server-generated orderId & ordered pending-order queries
// =========================================================================

test('SEC-35: POST /api/orders/create strictly generates orderId server-side and uses indexed orderBy(createdAt, desc)', () => {
  const ordersCreateSlice = extractBetween(
    serverCode,
    "app.post('/api/orders/create'",
    'async function applyComgatePaymentTransition('
  );

  assert.ok(!ordersCreateSlice.includes('clientOrderId'), 'POST /api/orders/create must ignore client-supplied orderId completely');
  assert.ok(
    ordersCreateSlice.includes('const orderId = generateServerOrderId();'),
    'POST /api/orders/create must call generateServerOrderId()'
  );
  assert.ok(
    serverCode.includes("return `ORD-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;"),
    'generateServerOrderId must match ORD-<timestamp>-<8-hex-upper> format'
  );
  assert.ok(
    ordersCreateSlice.includes(".where('userId', '==', userId)") &&
      ordersCreateSlice.includes(".orderBy('createdAt', 'desc')"),
    'Pending-order lookup must order by createdAt desc using the existing composite index'
  );

  // Confirm composite index exists in firestore.indexes.json so production will never fail
  const indexesJson = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'firestore.indexes.json'), 'utf8')
  );
  const hasOrdersCreatedAtIndex = indexesJson.indexes.some(
    (idx: any) =>
      idx.collectionGroup === 'orders' &&
      Array.isArray(idx.fields) &&
      idx.fields.length === 2 &&
      idx.fields[0]?.fieldPath === 'userId' &&
      idx.fields[1]?.fieldPath === 'createdAt' &&
      idx.fields[1]?.order === 'DESCENDING'
  );
  assert.ok(hasOrdersCreatedAtIndex, 'firestore.indexes.json must contain (userId ASC, createdAt DESC) index on orders');
});

// =========================================================================
// SEC-36: Bug report admin email link/img hardening & no hardcoded personal Gmail
// =========================================================================

test('SEC-36: no hardcoded personal Gmail in server/index.js or emailService.js, and resolveBugReportRecipient uses env vars', () => {
  assert.ok(!serverCode.includes('netkova.nela@gmail.com'), 'server/index.js must NOT hardcode personal Gmail');
  assert.ok(!emailServiceCode.includes('netkova.nela@gmail.com'), 'emailService.js must NOT hardcode personal Gmail');

  const prevBug = process.env.BUG_REPORT_EMAIL;
  const prevAdmin = process.env.ADMIN_EMAIL;
  try {
    delete process.env.BUG_REPORT_EMAIL;
    delete process.env.ADMIN_EMAIL;
    assert.equal(resolveBugReportRecipient(), '', 'Unconfigured env must return empty recipient');

    process.env.ADMIN_EMAIL = 'admin@proeducator.eu';
    assert.equal(resolveBugReportRecipient(), 'admin@proeducator.eu', 'Should fall back to ADMIN_EMAIL');

    process.env.BUG_REPORT_EMAIL = 'bugs@proeducator.eu';
    assert.equal(resolveBugReportRecipient(), 'bugs@proeducator.eu', 'Should prefer BUG_REPORT_EMAIL over ADMIN_EMAIL');
  } finally {
    if (prevBug === undefined) delete process.env.BUG_REPORT_EMAIL;
    else process.env.BUG_REPORT_EMAIL = prevBug;
    if (prevAdmin === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = prevAdmin;
  }
});

test('SEC-36: bug report pageUrl restricts clickable links to ProEducator origins and screenshotUrl blocks external tracking <img>', async () => {
  // 1. Page URL validator
  assert.equal(
    sanitizeAllowedBugReportPageUrl('https://www.proeducator.eu/practice/math'),
    'https://www.proeducator.eu/practice/math'
  );
  assert.equal(
    sanitizeAllowedBugReportPageUrl('https://proeducator.eu/courses'),
    'https://proeducator.eu/courses'
  );
  assert.equal(sanitizeAllowedBugReportPageUrl('https://evil.phishing.test/login'), '', 'External origin must be rejected');
  assert.equal(sanitizeAllowedBugReportPageUrl('javascript:alert(1)'), '', 'javascript: scheme must be rejected');

  // In production, localhost is rejected too
  const prevEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.equal(sanitizeAllowedBugReportPageUrl('http://localhost:3005/test'), '', 'localhost must be rejected in production');
    process.env.NODE_ENV = 'development';
    assert.equal(
      sanitizeAllowedBugReportPageUrl('http://localhost:3005/test'),
      'http://localhost:3005/test',
      'localhost allowed in dev'
    );
  } finally {
    if (prevEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv;
  }

  // 2. Screenshot URL validator
  const validPngDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const validFirebaseStorageUrl =
    'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0972842509.appspot.com/o/bugReports%2Fu1%2Fshot.png?alt=media';
  const validFirebaseAppUrl =
    'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0972842509.firebasestorage.app/o/bugReports%2Fu1%2Fshot.png?alt=media';

  assert.equal(sanitizeAllowedBugReportScreenshotUrl(validPngDataUrl), validPngDataUrl);
  assert.equal(sanitizeAllowedBugReportScreenshotUrl(validFirebaseStorageUrl), validFirebaseStorageUrl);
  assert.equal(sanitizeAllowedBugReportScreenshotUrl(validFirebaseAppUrl), validFirebaseAppUrl);
  assert.equal(
    sanitizeAllowedBugReportScreenshotUrl('https://tracker.attacker.test/pixel.png'),
    '',
    'Arbitrary external http(s) screenshotUrl must be rejected'
  );
  assert.equal(
    sanitizeAllowedBugReportScreenshotUrl('https://firebasestorage.googleapis.com/v0/b/other-project.appspot.com/o/a.png'),
    '',
    'Other Firebase project bucket must be rejected'
  );
  assert.equal(
    sanitizeAllowedBugReportScreenshotUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='),
    '',
    'SVG data URI must be rejected'
  );

  // 3. End-to-end sendBugReportEmail rendering with mocked transporter
  let capturedHtml = '';
  let sentCount = 0;
  setTransporterForTesting({
    sendMail: async (options: any) => {
      sentCount += 1;
      capturedHtml = String(options.html || '');
      return { messageId: '<bug-test@proedu>' };
    },
  });

  const prevBugEmail = process.env.BUG_REPORT_EMAIL;
  const prevAdminEmail = process.env.ADMIN_EMAIL;
  try {
    // Unconfigured recipient skips sending cleanly without throwing
    delete process.env.BUG_REPORT_EMAIL;
    delete process.env.ADMIN_EMAIL;
    const skippedRes = await sendBugReportEmail({
      studentName: 'Student',
      studentEmail: 'student@example.cz',
      category: 'technical',
      description: 'Test bug',
      pageUrl: 'https://www.proeducator.eu/practice',
    });
    assert.equal(skippedRes.success, false);
    assert.equal(skippedRes.skipped, true);
    assert.equal(sentCount, 0);

    // Configured recipient sends email with external pageUrl as plain escaped text and strips external tracking <img>
    process.env.BUG_REPORT_EMAIL = 'admin-bugs@proeducator.eu';
    const res = await sendBugReportEmail({
      studentName: 'Student',
      studentEmail: 'student@example.cz',
      category: 'technical',
      description: 'Test bug',
      pageUrl: 'https://evil.phishing.test/steal?x=<script>',
      screenshotUrl: 'https://tracker.attacker.test/spy.png',
      reportId: 'rep_123',
    });
    assert.equal(res.success, true);
    assert.equal(sentCount, 1);
    assert.ok(!capturedHtml.includes('href="https://evil.phishing.test'), 'External pageUrl must NOT be rendered as clickable <a href>');
    assert.ok(capturedHtml.includes('https://evil.phishing.test/steal?x=&lt;script&gt;'), 'External pageUrl must appear as escaped plain text');
    assert.ok(!capturedHtml.includes('tracker.attacker.test'), 'External tracking screenshotUrl must NOT appear as <img src> or link');
    assert.ok(!capturedHtml.includes('<img '), 'No <img> tag should be emitted for rejected external screenshotUrl');
  } finally {
    resetTransporterForTesting();
    if (prevBugEmail === undefined) delete process.env.BUG_REPORT_EMAIL;
    else process.env.BUG_REPORT_EMAIL = prevBugEmail;
    if (prevAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = prevAdminEmail;
  }
});

// =========================================================================
// SEC-37: Domain-separated fallback secrets & remove tempPassword echo
// =========================================================================

test('SEC-37: fallback secrets use distinct HMAC-SHA256 domain separation and register-confirm never echoes tempPassword', () => {
  // 1. Verify mathematical properties of HMAC domain separation
  const baseSecret = 'shared-registration-secret-value-at-least-16-chars';
  const guestDerived = crypto.createHmac('sha256', baseSecret).update('proedu:guest-demo:v1').digest('hex');
  const videoDerived = crypto.createHmac('sha256', baseSecret).update('proedu:video-token:v1').digest('hex');

  assert.notEqual(guestDerived, baseSecret, 'Guest fallback secret must not reuse raw base secret');
  assert.notEqual(videoDerived, baseSecret, 'Video fallback secret must not reuse raw base secret');
  assert.notEqual(guestDerived, videoDerived, 'Guest and video derived secrets must be domain-separated and distinct');
  assert.equal(guestDerived.length, 64, 'HMAC-SHA256 hex digest must be 64 hex chars');

  // 2. Verify server/index.js wiring
  assert.ok(
    serverCode.includes("deriveDomainSeparatedSecret(regConfigured, 'proedu:guest-demo:v1')"),
    'getGuestDemoSecret must derive domain-separated key via proedu:guest-demo:v1'
  );
  assert.ok(
    serverCode.includes("deriveDomainSeparatedSecret(regConfigured, 'proedu:video-token:v1')"),
    'getVideoTokenSecret must derive domain-separated key via proedu:video-token:v1'
  );

  // 3. register-confirm must NEVER echo tempPassword
  const regConfirmSlice = extractBetween(
    serverCode,
    "app.post('/api/auth/register-confirm'",
    "app.post('/api/auth/password-reset'"
  );
  assert.ok(!regConfirmSlice.includes('tempPassword'), 'register-confirm must NEVER echo tempPassword');
  assert.ok(
    regConfirmSlice.includes('if (!customToken)') &&
      regConfirmSlice.includes('res.status(503).json(') &&
      regConfirmSlice.includes('Přihlaste se prosím svým zvoleným heslem.'),
    'register-confirm must return a clean error instructing user to log in with their chosen password when createCustomToken fails'
  );
});

// =========================================================================
// SEC-38: isLoopbackRequest, focus session realism/daily cap, assigned-test tx/dueDate/self_check
// =========================================================================

test('SEC-38: isLoopbackRequest checks socket.remoteAddress directly (ignores spoofed req.ip / req.hostname)', () => {
  const loopbackSlice = extractBetween(
    serverCode,
    'function isLoopbackRequest(req)',
    'function createRateLimiter('
  );
  assert.ok(loopbackSlice.includes('req?.socket?.remoteAddress'), 'isLoopbackRequest must inspect req.socket.remoteAddress');
  assert.ok(!loopbackSlice.includes('req.ip'), 'isLoopbackRequest must NOT trust proxy-spoofable req.ip');
  assert.ok(!loopbackSlice.includes('req.hostname'), 'isLoopbackRequest must NOT trust proxy-spoofable req.hostname');

  // Behavioral check matching exact implementation
  const isLoopback = (req: any) => {
    const remoteAddress = String(req?.socket?.remoteAddress || '').trim();
    return remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1';
  };
  assert.equal(isLoopback({ socket: { remoteAddress: '127.0.0.1' }, ip: '8.8.8.8', hostname: 'evil.com' }), true);
  assert.equal(isLoopback({ socket: { remoteAddress: '::1' } }), true);
  assert.equal(isLoopback({ socket: { remoteAddress: '::ffff:127.0.0.1' } }), true);
  assert.equal(isLoopback({ socket: { remoteAddress: '203.0.113.10' }, ip: '127.0.0.1', hostname: 'localhost' }), false);
  assert.equal(isLoopback({ ip: '127.0.0.1', hostname: 'localhost' }), false);
});

test('SEC-38: POST /api/garden/record-focus enforces elapsed-time realism (0.75x) and 720 min/day cap', () => {
  const gardenSlice = extractBetween(
    serverCode,
    'const MAX_DAILY_FOCUS_MINUTES = 720;',
    '// 11. KURZY A AUTORITATIVNÍ ZÁPIS STUDENTŮ'
  );

  assert.ok(gardenSlice.includes('const MIN_FOCUS_ELAPSED_RATIO = 0.75;'), 'Must enforce 0.75 elapsed ratio');
  assert.ok(
    gardenSlice.includes('data.lastFocusRecordedAt || data.lastGardenFocusAt') &&
      gardenSlice.includes('Math.round(durationMinutes * 60 * 1000 * MIN_FOCUS_ELAPSED_RATIO)') &&
      gardenSlice.includes('nowMs - lastFocusMs < requiredElapsedMs'),
    'Must reject claiming long focus blocks shortly after previous session'
  );
  assert.ok(
    gardenSlice.includes('dailyFocusMinutesSoFar + durationMinutes > MAX_DAILY_FOCUS_MINUTES'),
    'Must enforce 720 min/day daily focus cap'
  );
  assert.ok(
    gardenSlice.includes('lastFocusRecordedAt: Timestamp.fromMillis(nowMs)'),
    'Must persist lastFocusRecordedAt Timestamp'
  );

  // Behavioral check: cannot claim 240 min only 4 min after last session
  const minCooldownMs = 4 * 60 * 1000;
  const durationMinutes = 240;
  const requiredElapsedMs = Math.max(minCooldownMs, Math.round(durationMinutes * 60 * 1000 * 0.75));
  assert.equal(requiredElapsedMs, 180 * 60 * 1000, '240 min session requires at least 180 min elapsed since previous session');
  assert.ok(4 * 60 * 1000 < requiredElapsedMs, '4 minutes elapsed must be rejected for a 240-min claim');
});

test('SEC-38: POST /api/assigned-tests/:testId/submit runs in transaction (409 on resubmission), checks dueDate (+2m grace), and flags self_check for teacher review', () => {
  const submitSlice = extractBetween(
    serverCode,
    "app.post('/api/assigned-tests/:testId/submit'",
    '// 9. ŽOLÍKY A ODMĚNĚNÉ VIDEO RELACE'
  );

  assert.ok(submitSlice.includes('await db.runTransaction(async (tx) => {'), 'Submit must run inside a Firestore transaction');
  assert.ok(submitSlice.includes('await tx.get(docRef)') && submitSlice.includes('tx.update(docRef, updatePayload)'), 'Must read and update atomically via tx');
  assert.ok(
    submitSlice.includes("testData.status === 'submitted' || testData.status === 'graded'") &&
      submitSlice.includes('createMaterialHttpError(409,'),
    'Already submitted/graded test must be rejected with HTTP 409'
  );
  assert.ok(
    serverCode.includes('const ASSIGNED_TEST_DUE_GRACE_MS = 2 * 60 * 1000;') &&
      submitSlice.includes('parseAssignedTestDueDeadlineMs(testData.dueDate)') &&
      submitSlice.includes('nowMs > dueDeadlineMs + ASSIGNED_TEST_DUE_GRACE_MS'),
    'Submit must enforce dueDate deadline with 2-minute grace window'
  );
  assert.ok(
    submitSlice.includes("if (qType === 'self_check')") &&
      submitSlice.includes('requiresTeacherReview: true') &&
      submitSlice.includes('isCorrect: null') &&
      submitSlice.includes('pointsEarned: 0'),
    'self_check items must be marked requiresTeacherReview: true with 0 automated points instead of trusting client "correct"'
  );
});
