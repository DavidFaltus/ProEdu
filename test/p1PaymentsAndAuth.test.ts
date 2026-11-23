import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  isStrictSingleEmail,
  sendEmail,
  sendSubscriptionCancelledEmail,
  setTransporterForTesting,
  resetTransporterForTesting,
} from '../server/services/emailService.js';

const SERVER_PATH = path.resolve(process.cwd(), 'server/index.js');
const serverCode = fs.readFileSync(SERVER_PATH, 'utf8').replace(/\r\n/g, '\n');

function extractBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, `Expected marker "${startMarker}" in server/index.js`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `Expected end marker "${endMarker}" after "${startMarker}" in server/index.js`);
  return source.slice(start, end);
}

// =========================================================================
// SEC-08: Enforce email_verified on password-provider accounts
// =========================================================================

test('SEC-08: session-bootstrap rejects unverified password-provider accounts without existing user doc (403) while keeping legacy docs working', () => {
  const bootstrapSlice = extractBetween(
    serverCode,
    "app.post('/api/auth/session-bootstrap'",
    '// --- REGISTRACE S 6MÍSTNÝM OTP KÓDEM'
  );

  const notExistsIdx = bootstrapSlice.indexOf('if (!snap.exists)');
  const providerCheckIdx = bootstrapSlice.indexOf("sign_in_provider === 'password'");
  const emailVerifiedCheckIdx = bootstrapSlice.indexOf('email_verified !== true');
  const txSetIdx = bootstrapSlice.indexOf('tx.set(userRef, createdProfile)');

  assert.ok(notExistsIdx !== -1, 'session-bootstrap must branch on !snap.exists');
  assert.ok(
    providerCheckIdx > notExistsIdx && providerCheckIdx < txSetIdx,
    'sign_in_provider === "password" check must run inside !snap.exists BEFORE creating profile'
  );
  assert.ok(
    emailVerifiedCheckIdx > notExistsIdx && emailVerifiedCheckIdx < txSetIdx,
    'email_verified !== true check must run inside !snap.exists BEFORE creating profile'
  );
  assert.ok(
    bootstrapSlice.includes('status: 403') &&
      bootstrapSlice.includes('Před vytvořením účtu prosím ověřte svůj e-mail.'),
    'Must return HTTP 403 with clear Czech error message for unverified password signups'
  );
  assert.ok(
    bootstrapSlice.includes('if (bootstrapResult.rejected)'),
    'Must short-circuit and return rejected status before syncing claims or returning profile'
  );
});

test('SEC-08: referrals/claim, survey/submit, and bug-reports/submit enforce email_verified for password-provider non-teachers', () => {
  const helperSlice = extractBetween(
    serverCode,
    'function isUnverifiedPasswordCaller(',
    "app.get(['/health'"
  );
  assert.ok(
    helperSlice.includes("req.user?.role === 'teacher'") &&
      helperSlice.includes("signInProvider === 'password'") &&
      helperSlice.includes('email_verified !== true') &&
      helperSlice.includes('res.status(403)'),
    'requireVerifiedEmailForPasswordAuth must allow teachers and reject unverified password callers with 403'
  );

  assert.ok(
    serverCode.includes("app.post('/api/referrals/claim', requireAuth, requireVerifiedEmailForPasswordAuth,"),
    '/api/referrals/claim must enforce requireVerifiedEmailForPasswordAuth'
  );
  assert.ok(
    serverCode.includes("app.post('/api/survey/submit', requireAuth, requireVerifiedEmailForPasswordAuth,"),
    '/api/survey/submit must enforce requireVerifiedEmailForPasswordAuth'
  );
  assert.ok(
    serverCode.includes(
      "app.post('/api/bug-reports/submit', requireAuth, requireVerifiedEmailForPasswordAuth, bugReportLimiter,"
    ),
    '/api/bug-reports/submit must enforce requireVerifiedEmailForPasswordAuth'
  );
});

test('SEC-08: register-confirm creates Auth users with emailVerified: true', () => {
  const createAuthSlice = extractBetween(
    serverCode,
    'async function createAuthUser(',
    "app.post('/api/auth/register-init'"
  );
  assert.ok(
    createAuthSlice.includes('emailVerified: true'),
    'createAuthUser must set emailVerified: true on Firebase Auth user creation'
  );

  const registerConfirmSlice = extractBetween(
    serverCode,
    "app.post('/api/auth/register-confirm'",
    "app.post('/api/auth/password-reset'"
  );
  assert.ok(registerConfirmSlice.includes('await createAuthUser('), 'register-confirm must invoke createAuthUser');
  assert.ok(registerConfirmSlice.includes('emailVerified: true'), 'register-confirm must set emailVerified: true on user doc');
});

// =========================================================================
// SEC-11: Revoke refresh tokens on privilege loss & shorten userRoleCache TTL
// =========================================================================

test('SEC-11: USER_ROLE_CACHE_TTL_MS is <= 5000ms and resolveUserState uses it', () => {
  const ttlMatch = serverCode.match(/const\s+USER_ROLE_CACHE_TTL_MS\s*=\s*([\d_]+)\s*;/);
  assert.ok(ttlMatch, 'server/index.js must define USER_ROLE_CACHE_TTL_MS');
  const ttlMs = Number(ttlMatch[1].replace(/_/g, ''));
  assert.ok(Number.isFinite(ttlMs) && ttlMs > 0 && ttlMs <= 5000, `USER_ROLE_CACHE_TTL_MS must be <= 5000ms, got ${ttlMs}`);

  const resolveSlice = extractBetween(serverCode, 'async function resolveUserState(', 'async function resolveUserRole(');
  assert.ok(resolveSlice.includes('nowMs + USER_ROLE_CACHE_TTL_MS'), 'resolveUserState must use USER_ROLE_CACHE_TTL_MS');
  assert.ok(!resolveSlice.includes('nowMs + 60000'), 'resolveUserState must NOT use old 60000ms TTL');
  assert.ok(resolveSlice.includes('revokeUserTokensSafe('), 'resolveUserState must revoke tokens on lazy expiry downgrade');
});

test('SEC-11: revokeUserTokensSafe handles auth/user-not-found cleanly and is called on every privilege loss path', () => {
  const helperSlice = extractBetween(
    serverCode,
    'async function revokeUserTokensSafe(',
    'const STANDARD_BODY_LIMIT_BYTES'
  );
  assert.ok(helperSlice.includes('await auth.revokeRefreshTokens(uid)'), 'revokeUserTokensSafe must call auth.revokeRefreshTokens');
  assert.ok(helperSlice.includes("'auth/user-not-found'"), 'revokeUserTokensSafe must ignore auth/user-not-found cleanly');

  const refundSlice = extractBetween(serverCode, "app.post('/api/orders/:orderId/refund'", "app.get('/api/iucto/status'");
  assert.ok(refundSlice.includes("revokeUserTokensSafe(order.userId, 'refund')"), 'refund must revoke tokens on role downgrade');

  const updateAccessSlice = extractBetween(
    serverCode,
    "app.post('/api/students/:studentId/update-access'",
    'async function deleteQueryDocsInBatches('
  );
  assert.ok(
    updateAccessSlice.includes("revokeUserTokensSafe(studentId, 'update-access')"),
    'update-access must revoke tokens on role downgrade or removed courses'
  );

  const deleteStudentSlice = extractBetween(
    serverCode,
    "app.delete('/api/students/:studentId'",
    'const ALLOWED_MATERIAL_MIME_TYPES'
  );
  assert.ok(
    deleteStudentSlice.includes("revokeUserTokensSafe(studentId, 'student-deleted')"),
    'DELETE /api/students/:studentId must revoke tokens'
  );

  const enrollSlice = extractBetween(
    serverCode,
    "app.post('/api/courses/:courseId/enroll'",
    "app.delete('/api/courses/:courseId/enroll/:studentUid'"
  );
  assert.ok(
    !enrollSlice.includes('revokeUserTokensSafe('),
    'POST /api/courses/:courseId/enroll (grant) must NOT revoke tokens'
  );

  const unenrollSlice = extractBetween(
    serverCode,
    "app.delete('/api/courses/:courseId/enroll/:studentUid'",
    "app.all(['/api', '/api/*']"
  );
  assert.ok(
    unenrollSlice.includes("revokeUserTokensSafe(cleanStudentUid, 'course-unenroll')"),
    'DELETE /api/courses/:courseId/enroll/:studentUid must revoke tokens'
  );

  const cancelSlice = extractBetween(
    serverCode,
    "app.post('/api/subscription/cancel'",
    "app.post('/api/subscription/reactivate'"
  );
  assert.ok(
    cancelSlice.includes("revokeUserTokensSafe(userId, 'subscription-cancel-immediate')"),
    'POST /api/subscription/cancel (immediate: true) must revoke tokens'
  );

  const checkExpirySlice = extractBetween(
    serverCode,
    "app.post('/api/subscription/check-expiry'",
    'async function processRecurringChargeForUser('
  );
  assert.ok(
    checkExpirySlice.includes("revokeUserTokensSafe(userId, 'subscription-expired')"),
    'POST /api/subscription/check-expiry must revoke tokens on expiry'
  );

  const cronSlice = extractBetween(
    serverCode,
    'async function runDueRecurringSubscriptions(',
    "app.post('/api/payments/comgate/charge-recurring'"
  );
  assert.ok(
    cronSlice.includes("revokeUserTokensSafe(uid, 'subscription-expired-cron')"),
    'runDueRecurringSubscriptions must revoke tokens on expiry'
  );
});

// =========================================================================
// SEC-10: Atomic payment finalization, transId check & transactional locks
// =========================================================================

test('SEC-10: applyComgatePaymentTransition checks comgateTransId, guards Premium activation with !order.premiumActivatedAt, and extends mid-cycle future periodEnd', () => {
  const transitionSlice = extractBetween(
    serverCode,
    'async function applyComgatePaymentTransition(',
    "app.post('/api/payments/comgate/notify'"
  );

  assert.ok(
    transitionSlice.includes('order.comgateTransId') &&
      transitionSlice.includes('storedTransId !== incomingTransId') &&
      transitionSlice.includes('errorStatus: 409'),
    'applyComgatePaymentTransition must verify order.comgateTransId === transId and reject mismatches with 409'
  );

  assert.ok(
    transitionSlice.includes('const needsPremiumActivation = !order.premiumActivatedAt') &&
      transitionSlice.includes('lockUpdates.premiumActivatedAt = nowIso'),
    'applyComgatePaymentTransition must atomically guard Premium activation with !order.premiumActivatedAt'
  );

  assert.ok(
    transitionSlice.includes('buildPremiumActivationUpdate(') &&
      transitionSlice.includes('skipPremiumActivation: true'),
    'applyComgatePaymentTransition must perform user activation inside the transaction and pass skipPremiumActivation: true to finalizePaidOrderAndInvoice'
  );

  const buildPlanSlice = extractBetween(
    serverCode,
    'function buildPremiumActivationUpdate(',
    'async function activatePremiumForUser('
  );
  assert.ok(
    buildPlanSlice.includes('existingEndMs > nowMs') && buildPlanSlice.includes('Math.max(nowMs, existingEndMs)'),
    'buildPremiumActivationUpdate must extend active future periodEnd from Math.max(nowMs, existingEndMs)'
  );

  // Verify mid-cycle extension math directly
  const nowMs = Date.parse('2026-11-15T12:00:00.000Z');
  const existingEndMs = Date.parse('2026-11-25T12:00:00.000Z'); // 10 remaining paid days
  const baseMs = existingEndMs > nowMs ? Math.max(nowMs, existingEndMs) : nowMs;
  const extendedEnd = new Date(baseMs + 30 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(extendedEnd, '2026-12-25T12:00:00.000Z', 'Mid-cycle extension must preserve all 10 remaining paid days + 30 days');
});

test('SEC-10: syncIuctoForPaidOrder enforces transactional iuctoSyncLockUntil lease and finalizePaidOrderAndInvoice deduplicates emails', () => {
  const syncSlice = extractBetween(
    serverCode,
    'async function syncIuctoForPaidOrder(',
    'async function finalizePaidOrderAndInvoice('
  );
  assert.ok(syncSlice.includes('db.runTransaction('), 'syncIuctoForPaidOrder must acquire lease inside a Firestore transaction');
  assert.ok(syncSlice.includes('iuctoSyncLockUntil'), 'syncIuctoForPaidOrder must use iuctoSyncLockUntil lease');
  assert.ok(
    syncSlice.includes("freshOrder.iuctoSyncStatus === 'synced' || Boolean(freshOrder.iuctoInvoiceId)"),
    'syncIuctoForPaidOrder must skip if already synced or iuctoInvoiceId exists'
  );
  assert.ok(
    syncSlice.includes('iuctoSyncLockUntil: FieldValue.delete()'),
    'syncIuctoForPaidOrder must release iuctoSyncLockUntil on completion, skip, and error'
  );

  const finalizeSlice = extractBetween(
    serverCode,
    'async function finalizePaidOrderAndInvoice(',
    "app.post('/api/orders/create'"
  );
  assert.ok(
    finalizeSlice.includes('!iuctoRes.locked') && finalizeSlice.includes('confirmationEmailSentAt'),
    'finalizePaidOrderAndInvoice must deduplicate confirmation emails atomically'
  );
});

test('SEC-10: refund uses refundLockUntil lock, persists refunded + downgrades user BEFORE iuctoService.issueCreditNote, and returns 200 with iuctoWarning on credit note error', () => {
  const refundSlice = extractBetween(
    serverCode,
    "app.post('/api/orders/:orderId/refund'",
    "app.get('/api/iucto/status'"
  );

  assert.ok(refundSlice.includes('refundLockUntil') && refundSlice.includes('errorStatus: 409'), 'refund must acquire transactional refundLockUntil lock and reject conflicts with 409');

  const persistRefundedIdx = refundSlice.indexOf("status: 'refunded'");
  const downgradeUserIdx = refundSlice.indexOf('userUpdates.role = revertedRole');
  const revokeIdx = refundSlice.indexOf("revokeUserTokensSafe(order.userId, 'refund')");
  const creditNoteIdx = refundSlice.indexOf('iuctoService.issueCreditNote(');

  assert.ok(persistRefundedIdx !== -1, 'refund must persist status: refunded');
  assert.ok(downgradeUserIdx !== -1, 'refund must downgrade user role');
  assert.ok(revokeIdx !== -1, 'refund must revoke user refresh tokens');
  assert.ok(creditNoteIdx !== -1, 'refund must call iuctoService.issueCreditNote');

  assert.ok(
    persistRefundedIdx < creditNoteIdx && downgradeUserIdx < creditNoteIdx && revokeIdx < creditNoteIdx,
    'status=refunded, user downgrade, and token revocation MUST all happen BEFORE iuctoService.issueCreditNote'
  );
  assert.ok(
    refundSlice.includes("iuctoCreditNoteStatus: 'failed'") && refundSlice.includes('iuctoWarning'),
    'iÚčto credit note failure must save iuctoCreditNoteStatus: failed and return 200 with iuctoWarning'
  );
});

test('SEC-10: confirm-manual is transactional with 409 on paid/refunded, and recurring charge acquires recurringChargeLockUntil lease', () => {
  const confirmSlice = extractBetween(
    serverCode,
    "app.post('/api/orders/:orderId/confirm-manual'",
    "app.get('/api/orders/:orderId/invoice.pdf'"
  );
  assert.ok(confirmSlice.includes('db.runTransaction('), 'confirm-manual must run inside a Firestore transaction');
  assert.ok(
    confirmSlice.includes("order.status === 'paid'") && confirmSlice.includes('errorStatus: 409'),
    'confirm-manual must reject already paid orders with 409'
  );
  assert.ok(
    confirmSlice.includes("order.status === 'refunded'"),
    'confirm-manual must reject refunded orders with 409'
  );

  const recurringSlice = extractBetween(
    serverCode,
    'async function processRecurringChargeForUser(',
    'async function runDueRecurringSubscriptions('
  );
  const lockAcquireIdx = recurringSlice.indexOf('recurringChargeLockUntil: nowMs + RECURRING_CHARGE_LEASE_MS');
  const comgateCallIdx = recurringSlice.indexOf('https://payments.comgate.cz/v2.0/recurring.json');
  assert.ok(lockAcquireIdx !== -1 && comgateCallIdx !== -1 && lockAcquireIdx < comgateCallIdx, 'recurringChargeLockUntil lease must be acquired BEFORE Comgate recurring charge call');
  assert.ok(
    recurringSlice.includes('finally {') && recurringSlice.includes('recurringChargeLockUntil: FieldValue.delete()'),
    'recurringChargeLockUntil lease must be released in finally block'
  );
});

// =========================================================================
// SEC-22: Strict single-email validation, emailService hardening & rate limits
// =========================================================================

test('SEC-22: isStrictSingleEmail accepts valid single addresses and rejects multi-recipient/injection inputs', () => {
  // Valid single emails
  assert.equal(isStrictSingleEmail('student@example.cz'), true);
  assert.equal(isStrictSingleEmail('jan.novak+proedu@sub.domain.co.uk'), true);
  assert.equal(isStrictSingleEmail('user_123@xn--k-7fa.cz'), true);

  // Multi-recipient & header injection payloads
  assert.equal(isStrictSingleEmail('a@b.cz,c@d.cz'), false, 'Must reject comma-separated emails');
  assert.equal(isStrictSingleEmail('a@b.cz, c@d.cz'), false, 'Must reject comma+space separated emails');
  assert.equal(isStrictSingleEmail('a@b.cz;c@d.cz'), false, 'Must reject semicolon-separated emails');
  assert.equal(isStrictSingleEmail('Jan Novak <jan@example.cz>'), false, 'Must reject angle brackets and spaces');
  assert.equal(isStrictSingleEmail('"jan"@example.cz'), false, 'Must reject double quotes');
  assert.equal(isStrictSingleEmail("o'connor@example.cz"), false, 'Must reject single quotes');
  assert.equal(isStrictSingleEmail('a@b.cz\r\nBcc: victim@evil.com'), false, 'Must reject CRLF injection');
  assert.equal(isStrictSingleEmail('a@b.cz\n'), false, 'Must reject trailing LF');
  assert.equal(isStrictSingleEmail('a@b.cz\0'), false, 'Must reject NUL byte');
  assert.equal(isStrictSingleEmail(' student@example.cz'), false, 'Must reject leading whitespace');
  assert.equal(isStrictSingleEmail('student@example.cz '), false, 'Must reject trailing whitespace');
  assert.equal(isStrictSingleEmail('stu dent@example.cz'), false, 'Must reject interior whitespace');

  // Length & syntax edge cases (254 chars valid, 255+ chars rejected)
  const valid254Email = `${'a'.repeat(64)}@${'b'.repeat(62)}.${'c'.repeat(62)}.${'d'.repeat(59)}.com`;
  assert.equal(valid254Email.length, 254);
  assert.equal(isStrictSingleEmail(valid254Email), true, 'Must accept valid 254-char address');
  const over255Email = `${'a'.repeat(64)}@${'b'.repeat(62)}.${'c'.repeat(62)}.${'d'.repeat(60)}.com`;
  assert.equal(over255Email.length, 255);
  assert.equal(isStrictSingleEmail(over255Email), false, 'Must reject > 254 chars');
  assert.equal(isStrictSingleEmail(`${'a'.repeat(65)}@example.com`), false, 'Must reject local part > 64 chars');
  assert.equal(isStrictSingleEmail('a@localhost'), false, 'Must reject domain without TLD dot');
  assert.equal(isStrictSingleEmail('a@b.c'), false, 'Must reject 1-char TLD');
  assert.equal(isStrictSingleEmail('a..b@example.com'), false, 'Must reject consecutive dots');
  assert.equal(isStrictSingleEmail('.a@example.com'), false, 'Must reject leading dot');
  assert.equal(isStrictSingleEmail('a@-example.com'), false, 'Must reject leading hyphen in domain label');
  assert.equal(isStrictSingleEmail(''), false);
  assert.equal(isStrictSingleEmail(null as unknown as string), false);
  assert.equal(isStrictSingleEmail(['a@b.cz'] as unknown as string), false);
});

test('SEC-22: emailService.sendEmail rejects comma/semicolon multi-recipient and header-injected addresses without sending', async () => {
  let sentCount = 0;
  setTransporterForTesting({
    sendMail: async () => {
      sentCount += 1;
      return { messageId: '<mock@pro-edu.eu>' };
    },
  });

  try {
    const blockedRecipients = [
      'victim1@example.cz, victim2@example.cz',
      'victim1@example.cz;victim2@example.cz',
      'Attacker <a@example.cz>',
      'valid@example.cz\r\nBcc: spy@evil.com',
      'not-an-email',
    ];

    for (const badTo of blockedRecipients) {
      const res = await sendEmail({ to: badTo, subject: 'Test', html: '<p>Hi</p>' });
      assert.equal(res.success, false, `sendEmail must reject "${badTo}"`);
    }
    assert.equal(sentCount, 0, 'Transporter must NEVER be invoked for invalid/multi-recipient to');

    // Multi-recipient replyTo/bcc must also be blocked
    const badReply = await sendEmail({
      to: 'student@example.cz',
      replyTo: 'a@b.cz, c@d.cz',
      subject: 'Test',
      html: '<p>Hi</p>',
    });
    assert.equal(badReply.success, false, 'sendEmail must reject multi-recipient replyTo');
    assert.equal(sentCount, 0);

    // Valid single recipient succeeds
    const okRes = await sendSubscriptionCancelledEmail({
      to: 'student@example.cz',
      name: 'Jan',
      periodEnd: '2026-12-15T12:00:00.000Z',
    });
    assert.equal(okRes.success, true);
    assert.equal(sentCount, 1);
  } finally {
    resetTransporterForTesting();
  }
});

test('SEC-22: subscription endpoints have per-user rate limiters, billing & orders enforce isStrictSingleEmail, and cancel emails ONLY verified Auth email', () => {
  assert.ok(
    serverCode.includes("app.post('/api/subscription/cancel', requireAuth, subscriptionCancelLimiter,"),
    '/api/subscription/cancel must use subscriptionCancelLimiter'
  );
  assert.ok(
    serverCode.includes("app.post('/api/subscription/reactivate', requireAuth, subscriptionReactivateLimiter,"),
    '/api/subscription/reactivate must use subscriptionReactivateLimiter'
  );
  assert.ok(
    serverCode.includes("app.put('/api/subscription/billing', requireAuth, subscriptionBillingLimiter,"),
    '/api/subscription/billing must use subscriptionBillingLimiter'
  );

  const billingSlice = extractBetween(
    serverCode,
    "app.put('/api/subscription/billing'",
    "app.post('/api/orders/:orderId/confirm-manual'"
  );
  assert.ok(billingSlice.includes('isStrictSingleEmail('), '/api/subscription/billing must validate invoiceEmail via isStrictSingleEmail');

  const ordersCreateSlice = extractBetween(
    serverCode,
    "app.post('/api/orders/create'",
    'async function applyComgatePaymentTransition('
  );
  assert.ok(ordersCreateSlice.includes('isStrictSingleEmail('), '/api/orders/create must validate invoiceEmail via isStrictSingleEmail');

  const cancelSlice = extractBetween(
    serverCode,
    "app.post('/api/subscription/cancel'",
    "app.post('/api/subscription/reactivate'"
  );
  assert.ok(
    !cancelSlice.includes('userDoc.billingDetails?.invoiceEmail'),
    '/api/subscription/cancel must NEVER send cancellation emails to billingDetails.invoiceEmail'
  );
  assert.ok(
    cancelSlice.includes('req.decodedToken?.email') && cancelSlice.includes('isAuthEmailVerified'),
    '/api/subscription/cancel must send cancellation email ONLY to verified Firebase Auth email'
  );
});

// =========================================================================
// SEC-23: Fix cancel -> reactivate initRecurringTransId state machine
// =========================================================================

test('SEC-23: non-immediate cancel preserves initRecurringTransId and reactivate requires non-empty initRecurringTransId (400)', () => {
  const cancelSlice = extractBetween(
    serverCode,
    "app.post('/api/subscription/cancel'",
    "app.post('/api/subscription/reactivate'"
  );

  const nonImmediateSlice = extractBetween(
    cancelSlice,
    "subscriptionStatus: 'cancelled_at_period_end'",
    'await userRef.set(updateData'
  );
  assert.ok(
    !nonImmediateSlice.includes('initRecurringTransId'),
    'Non-immediate cancel (cancelled_at_period_end) MUST preserve initRecurringTransId'
  );

  const immediateSlice = extractBetween(
    cancelSlice,
    "subscriptionStatus: 'inactive'",
    "subscriptionStatus: 'cancelled_at_period_end'"
  );
  assert.ok(
    immediateSlice.includes('initRecurringTransId: FieldValue.delete()'),
    'Immediate cancel MUST delete initRecurringTransId'
  );

  const reactivateSlice = extractBetween(
    serverCode,
    "app.post('/api/subscription/reactivate'",
    "app.post('/api/subscription/check-expiry'"
  );
  assert.ok(
    reactivateSlice.includes("typeof userDoc.initRecurringTransId !== 'string' || !userDoc.initRecurringTransId.trim()") &&
      reactivateSlice.includes('res.status(400)'),
    '/api/subscription/reactivate must reject missing/empty initRecurringTransId with HTTP 400'
  );
});

// =========================================================================
// SEC-24: Comgate webhook hardening & sandbox prod guard ordering
// =========================================================================

test('SEC-24: COMGATE_TEST_MODE is fail-closed in production', () => {
  const computeComgateTestMode = (nodeEnv: string | undefined, rawFlag: string | undefined): boolean =>
    nodeEnv === 'production' ? rawFlag === 'true' : rawFlag !== 'false';

  assert.equal(computeComgateTestMode('production', undefined), false, 'Production with unset COMGATE_TEST_MODE must fail closed (false)');
  assert.equal(computeComgateTestMode('production', ''), false);
  assert.equal(computeComgateTestMode('production', 'false'), false);
  assert.equal(computeComgateTestMode('production', 'true'), true);
  assert.equal(computeComgateTestMode('development', undefined), true);
  assert.equal(computeComgateTestMode('development', 'false'), false);

  assert.ok(
    serverCode.includes("process.env.NODE_ENV === 'production'") &&
      serverCode.includes("? process.env.COMGATE_TEST_MODE === 'true'") &&
      serverCode.includes(": process.env.COMGATE_TEST_MODE !== 'false'"),
    'server/index.js must configure COMGATE_TEST_MODE fail-closed in production'
  );
});

test('SEC-24: Comgate notify webhook is req.body-only, rate-limited, verifies PAID server-to-server, and sandbox-simulate-pay guards before requireAuth', () => {
  const notifySlice = extractBetween(
    serverCode,
    "app.post('/api/payments/comgate/notify'",
    'async function fetchComgatePaymentStatus('
  );

  assert.ok(notifySlice.includes('comgateWebhookLimiter'), '/api/payments/comgate/notify must attach comgateWebhookLimiter');
  assert.ok(!notifySlice.includes('req.query'), '/api/payments/comgate/notify must NOT read req.query');

  const fetchStatusIdx = notifySlice.indexOf('await fetchComgatePaymentStatus(cleanTransId)');
  const applyTransitionIdx = notifySlice.indexOf('await applyComgatePaymentTransition(');
  assert.ok(
    fetchStatusIdx !== -1 && applyTransitionIdx !== -1 && fetchStatusIdx < applyTransitionIdx,
    'Live PAID webhook must verify status server-to-server via fetchComgatePaymentStatus BEFORE applyComgatePaymentTransition'
  );
  assert.ok(
    notifySlice.includes('!COMGATE_TEST_MODE && normalizedStatus === \'PAID\'') &&
      notifySlice.includes('remotePrice !== expectedPriceHaler') &&
      notifySlice.includes('remoteCurr !== expectedCurr'),
    'Live PAID webhook must validate remote PAID status, price, and currency against stored order'
  );

  const sandboxLine = extractBetween(
    serverCode,
    "app.post('/api/payments/comgate/sandbox-simulate-pay'",
    'const { orderId } = req.body'
  );
  const guardIdx = sandboxLine.indexOf('!isSandboxSimulationAllowed()');
  const requireAuthIdx = sandboxLine.indexOf('requireAuth');
  assert.ok(
    guardIdx !== -1 && requireAuthIdx !== -1 && guardIdx < requireAuthIdx,
    'sandbox-simulate-pay must return 404 via !isSandboxSimulationAllowed() BEFORE requireAuth'
  );
});

// =========================================================================
// SEC-25: Sync courses.studentIds on update-access & student downgrade cleanup
// =========================================================================

test('SEC-25: update-access atomically syncs courses.studentIds/studentCount, invalidates courses cache, and cleans subscription for both free and student', () => {
  const updateAccessSlice = extractBetween(
    serverCode,
    "app.post('/api/students/:studentId/update-access'",
    'async function deleteQueryDocsInBatches('
  );

  assert.ok(updateAccessSlice.includes('db.runTransaction('), 'update-access must run inside a Firestore transaction');
  assert.ok(
    updateAccessSlice.includes('addedCourseIds') && updateAccessSlice.includes('removedCourseIds'),
    'update-access must diff previous vs new enrolledCourseIds'
  );
  assert.ok(
    updateAccessSlice.includes('FieldValue.arrayUnion(studentId)') &&
      updateAccessSlice.includes('FieldValue.arrayRemove(studentId)') &&
      updateAccessSlice.includes('studentCount: nextCount'),
    'update-access must update courses/{courseId} studentIds via arrayUnion/arrayRemove and studentCount'
  );
  assert.ok(
    updateAccessSlice.includes('invalidateCoursesListCache()'),
    'update-access must invalidate courses list cache when enrollments change'
  );
  assert.ok(
    updateAccessSlice.includes("effectiveRole === 'free' || effectiveRole === 'student'"),
    "update-access must clean up subscription state when downgrading to either 'free' or 'student'"
  );
});

// =========================================================================
// SEC-30: GDPR cleanup completeness
// =========================================================================

test('SEC-30: cleanupStudentDataServer deletes verifiedPracticeChecks and legacy bug-reports/{uid}/ Storage prefix', () => {
  const cleanupSlice = extractBetween(
    serverCode,
    'async function cleanupStudentDataServer(',
    "app.delete('/api/students/:studentId'"
  );

  assert.ok(
    cleanupSlice.includes("db.collection('verifiedPracticeChecks').where('uid', '==', uid)"),
    'cleanupStudentDataServer must delete verifiedPracticeChecks docs belonging to uid'
  );
  assert.ok(
    cleanupSlice.includes('prefix: `bugReports/${uid}/`') &&
      cleanupSlice.includes('prefix: `bug-reports/${uid}/`'),
    'cleanupStudentDataServer must delete both bugReports/{uid}/ and legacy bug-reports/{uid}/ Storage prefixes'
  );
  assert.ok(
    cleanupSlice.includes('invalidateCoursesListCache()'),
    'cleanupStudentDataServer must invalidate courses list cache when removing student from courses'
  );
});

// =========================================================================
// Verifier follow-up regression checks (SEC-05, SEC-09, SEC-10)
// =========================================================================

test('SEC-05 regression: /api/practice/finish enforces verifiedPracticeChecks & joker deduction on ALL subtopics (no demo bypass for auth free users)', () => {
  const finishSlice = extractBetween(
    serverCode,
    "app.post('/api/practice/finish'",
    "app.get('/api/inquiries/question/:questionId'"
  );
  assert.ok(finishSlice.includes('if (!isUnlimitedUser) {'), '/api/practice/finish must gate joker checks on if (!isUnlimitedUser)');
  assert.ok(!finishSlice.includes('isDemoSubtopic'), '/api/practice/finish must NOT skip joker verification on demo subtopics');
});

test('SEC-10 & SEC-09 regression: /api/orders/:orderId/iucto-retry returns iuctoRes.invoiceNumber and recentSetRoleCalls is bounded', () => {
  const retrySlice = extractBetween(
    serverCode,
    "app.post('/api/orders/:orderId/iucto-retry'",
    "app.post('/api/orders/:orderId/refund'"
  );
  assert.ok(
    retrySlice.includes('iuctoInvoiceNumber: iuctoRes.invoiceNumber') &&
      !retrySlice.includes('iuctoRes.iuctoInvoiceNumber'),
    '/api/orders/:orderId/iucto-retry must return iuctoRes.invoiceNumber (matching syncIuctoForPaidOrder)'
  );
  assert.ok(
    serverCode.includes('setBoundedMapEntry(recentSetRoleCalls,'),
    'recentSetRoleCalls must be bounded via setBoundedMapEntry'
  );
});

