import test from 'node:test';
import assert from 'node:assert/strict';
import type { UserProfile, SubscriptionStatus } from '../src/types/index.ts';

// Helper imitating server cancellation logic
function calculateCancellationPayload(
  userDoc: Partial<UserProfile> | null,
  immediate: boolean,
  reason: string,
  nowMs: number = Date.now()
) {
  const safeReason = (reason || 'Bez udání důvodu').trim().slice(0, 500);
  const nowIso = new Date(nowMs).toISOString();

  let periodEnd = userDoc?.subscriptionPeriodEnd;
  const hasValidFuturePeriodEnd =
    periodEnd &&
    !isNaN(new Date(periodEnd).getTime()) &&
    new Date(periodEnd).getTime() > nowMs;

  if (!hasValidFuturePeriodEnd) {
    periodEnd = new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  if (immediate) {
    return {
      role: 'free' as const,
      subscriptionStatus: 'inactive' as const,
      subscriptionCancelledAt: nowIso,
      subscriptionCancelReason: safeReason,
      subscriptionExpiredAt: nowIso,
      subscriptionPeriodEnd: null,
      initRecurringTransId: null,
      recurringCancelled: true,
      recurringCancelledAt: nowIso
    };
  }

  return {
    role: 'premium' as const,
    subscriptionStatus: 'cancelled_at_period_end' as const,
    subscriptionCancelledAt: nowIso,
    subscriptionCancelReason: safeReason,
    subscriptionPeriodEnd: periodEnd,
    initRecurringTransId: userDoc?.initRecurringTransId ?? null,
    recurringCancelled: true,
    recurringCancelledAt: nowIso
  };
}

// Helper imitating AuthContext / isPremium check logic
function computeIsPremium(profile: Partial<UserProfile> | null, nowMs: number = Date.now()): boolean {
  if (!profile) return false;

  const isCancelledExpired = Boolean(
    profile.role === 'premium' &&
    profile.subscriptionStatus === 'cancelled_at_period_end' &&
    profile.subscriptionPeriodEnd &&
    !isNaN(new Date(profile.subscriptionPeriodEnd).getTime()) &&
    nowMs > new Date(profile.subscriptionPeriodEnd).getTime()
  );

  return (
    !isCancelledExpired &&
    (profile.role === 'premium' || profile.role === 'course' || profile.role === 'teacher')
  );
}

// Helper imitating reactivate logic
function calculateReactivatePayload(
  userDoc: Partial<UserProfile> | null,
  nowMs: number = Date.now()
) {
  let periodEnd = userDoc?.subscriptionPeriodEnd;
  if (!periodEnd || isNaN(new Date(periodEnd).getTime()) || new Date(periodEnd).getTime() <= nowMs) {
    periodEnd = new Date(nowMs + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  return {
    role: 'premium' as const,
    subscriptionStatus: 'active' as const,
    subscriptionCancelledAt: null,
    subscriptionCancelReason: null,
    recurringCancelled: false,
    recurringCancelledAt: null,
    subscriptionPeriodEnd: periodEnd
  };
}

test('Cancellation at period end PRESERVES existing paid periodEnd and keeps role: premium', () => {
  const baseNow = new Date('2026-11-15T12:00:00.000Z').getTime();
  const existingPeriodEnd = new Date('2026-12-05T12:00:00.000Z').toISOString(); // 20 days remaining

  const existingProfile: Partial<UserProfile> = {
    uid: 'user-123',
    role: 'premium',
    subscriptionStatus: 'active',
    subscriptionPeriodEnd: existingPeriodEnd,
    initRecurringTransId: 'INIT_TRANS_999'
  };

  const payload = calculateCancellationPayload(existingProfile, false, 'Přecházím na jiný způsob přípravy', baseNow);

  // Role must remain premium until the period ends
  assert.equal(payload.role, 'premium', 'Role must remain premium during remaining period');
  assert.equal(payload.subscriptionStatus, 'cancelled_at_period_end');
  assert.equal(payload.subscriptionPeriodEnd, existingPeriodEnd, 'Existing periodEnd must be strictly preserved');
  assert.equal(payload.initRecurringTransId, 'INIT_TRANS_999', 'SEC-23: Non-immediate cancel must preserve initRecurringTransId for potential reactivation');
  assert.equal(payload.subscriptionCancelReason, 'Přecházím na jiný způsob přípravy');
  assert.equal(payload.subscriptionCancelledAt, new Date(baseNow).toISOString());
});

test('Cancellation at period end falls back to 30 days when no periodEnd exists', () => {
  const baseNow = new Date('2026-11-15T12:00:00.000Z').getTime();
  const expectedEnd = new Date('2026-12-15T12:00:00.000Z').toISOString();

  const profileWithoutPeriod: Partial<UserProfile> = {
    uid: 'user-456',
    role: 'premium',
    subscriptionStatus: 'active'
  };

  const payload = calculateCancellationPayload(profileWithoutPeriod, false, 'Drahé', baseNow);

  assert.equal(payload.role, 'premium');
  assert.equal(payload.subscriptionStatus, 'cancelled_at_period_end');
  assert.equal(payload.subscriptionPeriodEnd, expectedEnd, 'Must calculate 30 days from now');
});

test('Immediate cancellation downgrades to free immediately', () => {
  const baseNow = new Date('2026-11-15T12:00:00.000Z').getTime();
  const existingPeriodEnd = new Date('2026-12-05T12:00:00.000Z').toISOString();

  const existingProfile: Partial<UserProfile> = {
    uid: 'user-789',
    role: 'premium',
    subscriptionStatus: 'active',
    subscriptionPeriodEnd: existingPeriodEnd
  };

  const payload = calculateCancellationPayload(existingProfile, true, 'Testovací okamžité ukončení', baseNow);

  assert.equal(payload.role, 'free');
  assert.equal(payload.subscriptionStatus, 'inactive');
  assert.equal(payload.subscriptionPeriodEnd, null);
  assert.equal(payload.subscriptionExpiredAt, new Date(baseNow).toISOString());
});

test('computeIsPremium returns true while cancelled subscription has NOT expired', () => {
  const now = new Date('2026-11-20T10:00:00.000Z').getTime();
  const futurePeriodEnd = new Date('2026-11-30T10:00:00.000Z').toISOString(); // 10 days in future

  const profile: Partial<UserProfile> = {
    role: 'premium',
    subscriptionStatus: 'cancelled_at_period_end',
    subscriptionPeriodEnd: futurePeriodEnd
  };

  const isPrem = computeIsPremium(profile, now);
  assert.equal(isPrem, true, 'User with cancelled subscription must remain premium before expiration date');
});

test('computeIsPremium returns false once cancelled subscription has expired', () => {
  const now = new Date('2026-12-01T10:00:00.000Z').getTime();
  const pastPeriodEnd = new Date('2026-11-30T10:00:00.000Z').toISOString(); // 1 day in past

  const profile: Partial<UserProfile> = {
    role: 'premium',
    subscriptionStatus: 'cancelled_at_period_end',
    subscriptionPeriodEnd: pastPeriodEnd
  };

  const isPrem = computeIsPremium(profile, now);
  assert.equal(isPrem, false, 'User with expired cancelled subscription must NOT have premium access');
});

test('Reactivating subscription restores active status while preserving remaining days', () => {
  const now = new Date('2026-11-20T10:00:00.000Z').getTime();
  const futurePeriodEnd = new Date('2026-12-05T10:00:00.000Z').toISOString();

  const cancelledProfile: Partial<UserProfile> = {
    role: 'premium',
    subscriptionStatus: 'cancelled_at_period_end',
    subscriptionPeriodEnd: futurePeriodEnd,
    subscriptionCancelledAt: '2026-11-18T10:00:00.000Z'
  };

  const reactivated = calculateReactivatePayload(cancelledProfile, now);

  assert.equal(reactivated.role, 'premium');
  assert.equal(reactivated.subscriptionStatus, 'active');
  assert.equal(reactivated.subscriptionCancelledAt, null);
  assert.equal(reactivated.subscriptionPeriodEnd, futurePeriodEnd, 'Preserves paid future period on reactivation');
});

test('Comgate recurring charge guard blocks charging cancelled subscriptions', () => {
  const checkCanChargeRecurring = (user: Partial<UserProfile>): boolean => {
    if (
      user.subscriptionStatus === 'cancelled_at_period_end' ||
      user.subscriptionStatus === 'inactive' ||
      user.subscriptionStatus === 'expired' ||
      user.recurringCancelled === true ||
      Boolean(user.subscriptionCancelledAt) ||
      !user.initRecurringTransId
    ) {
      return false;
    }
    return true;
  };

  assert.equal(checkCanChargeRecurring({ subscriptionStatus: 'active', initRecurringTransId: 'TRANS_123' }), true);
  assert.equal(checkCanChargeRecurring({ subscriptionStatus: 'cancelled_at_period_end', initRecurringTransId: 'TRANS_123' }), false, 'Must block recurring charge for cancelled_at_period_end');
  assert.equal(checkCanChargeRecurring({ subscriptionStatus: 'inactive', initRecurringTransId: 'TRANS_123' }), false, 'Must block recurring charge for inactive');
  assert.equal(checkCanChargeRecurring({ subscriptionStatus: 'active', recurringCancelled: true, initRecurringTransId: 'TRANS_123' }), false, 'Must block when recurringCancelled is true');
  assert.equal(checkCanChargeRecurring({ subscriptionStatus: 'active', subscriptionCancelledAt: '2026-11-16T12:00:00Z', initRecurringTransId: 'TRANS_123' }), false, 'Must block when subscriptionCancelledAt is set');
  assert.equal(checkCanChargeRecurring({ subscriptionStatus: 'active', initRecurringTransId: undefined }), false, 'Must block when initRecurringTransId is missing');
});

test('Manual Premium grant or unexpired period is NOT expired even if historical subscriptionStatus was inactive', () => {
  const isExpired = (profile: Partial<UserProfile>, nowMs: number) => {
    if (!profile || profile.role !== 'premium') return false;
    const rawEnd = profile.subscriptionPeriodEnd;
    if (!rawEnd) return false;
    const endMs = new Date(rawEnd).getTime();
    if (isNaN(endMs)) return false;
    if (profile.subscriptionStatus === 'cancelled_at_period_end') {
      return nowMs > endMs;
    }
    if (profile.subscriptionStatus === 'active') {
      return nowMs > endMs + 3 * 24 * 60 * 60 * 1000;
    }
    return nowMs > endMs;
  };

  const now = new Date('2026-11-16T12:00:00.000Z').getTime();
  const futureEnd = new Date('2026-12-12T12:00:00.000Z').toISOString();

  // 1. User with future periodEnd but stale inactive status
  assert.equal(
    isExpired({ role: 'premium', subscriptionStatus: 'inactive', subscriptionPeriodEnd: futureEnd }, now),
    false,
    'Unexpired periodEnd with inactive status must NOT be treated as expired'
  );

  // 2. User with no periodEnd (lifetime / manual grant)
  assert.equal(
    isExpired({ role: 'premium', subscriptionStatus: 'inactive', subscriptionPeriodEnd: undefined }, now),
    false,
    'Manual grant without periodEnd must NOT be treated as expired'
  );

  // 3. User with past periodEnd and inactive status
  const pastEnd = new Date('2026-11-10T12:00:00.000Z').toISOString();
  assert.equal(
    isExpired({ role: 'premium', subscriptionStatus: 'inactive', subscriptionPeriodEnd: pastEnd }, now),
    true,
    'Past periodEnd with inactive status must be treated as expired'
  );
});

test('Comgate payment initialization restricts payment methods strictly to CARD_ALL for recurring billing', async () => {
  const fs = await import('node:fs');
  const serverCode = fs.readFileSync('server/index.js', 'utf8');
  const rulesCode = fs.readFileSync('firestore.rules', 'utf8');

  assert.equal(
    serverCode.includes("method: 'CARD_ALL'"),
    true,
    "server/index.js must restrict Comgate payment method to 'CARD_ALL' so bank transfers and QR payments are disabled"
  );
  assert.equal(
    serverCode.includes("method: 'ALL'"),
    false,
    "server/index.js must NOT use method: 'ALL' which allows non-recurring bank buttons and QR transfers"
  );
  assert.equal(
    rulesCode.includes("data.preferredPaymentMethod == 'comgate'"),
    true,
    "firestore.rules must only allow 'comgate' as preferredPaymentMethod"
  );
});

test('Subscription cancellation email is sent ONLY for regular period-end cancellation, NOT for immediate termination', async () => {
  const fs = await import('node:fs');
  const serverCode = fs.readFileSync('server/index.js', 'utf8');

  // Verify server only sends cancellation email when not immediate
  assert.equal(
    serverCode.includes('if (notifyEmail && !immediate)'),
    true,
    'server/index.js must condition sendSubscriptionCancelledEmail on !immediate so early termination does not send a second email'
  );

  const shouldSendEmail = (notifyEmail: string | undefined, immediate: boolean) => {
    return Boolean(notifyEmail) && !immediate;
  };

  assert.equal(shouldSendEmail('test@pro-edu.eu', false), true, 'Regular cancellation sends email');
  assert.equal(shouldSendEmail('test@pro-edu.eu', true), false, 'Immediate early termination suppresses email');
  assert.equal(shouldSendEmail(undefined, false), false, 'Missing email suppresses email');
});

test('Comgate v2.0 recurring.json uses initRecurringId, 1-16 char label, strict initRecurring: true, and preserves original initRecurringTransId', async () => {
  const fs = await import('node:fs');
  const serverCode = fs.readFileSync('server/index.js', 'utf8');

  // 1. /v2.0/recurring.json must pass initRecurringId (never initTransId)
  assert.equal(
    serverCode.includes('initRecurringId: userDoc.initRecurringTransId'),
    true,
    'server/index.js must pass initRecurringId in POST /v2.0/recurring.json payload'
  );
  assert.equal(
    serverCode.includes('initTransId:'),
    false,
    'server/index.js must NOT use invalid initTransId parameter on Comgate API v2.0'
  );

  // 2. Strict initRecurring: true without any initRecurring: false fallback
  assert.equal(
    serverCode.includes('initRecurring: true'),
    true,
    'server/index.js must initialize Comgate card payments with initRecurring: true'
  );
  assert.equal(
    serverCode.includes('initRecurring: false'),
    false,
    'server/index.js must NOT downgrade subscription orders to one-off initRecurring: false'
  );

  // 3. Preserves original initRecurringTransId on recurring renewal PAID transition
  assert.equal(
    serverCode.includes('const preservedInitRecurringId = isRenewal'),
    true,
    'applyComgatePaymentTransition must preserve original initRecurringTransId on recurring renewals'
  );
});

test('Pending orders reconcile with Comgate on /api/orders/my, expire after 30 minutes, and prevent duplicate pending order creation', async () => {
  const fs = await import('node:fs');
  const serverCode = fs.readFileSync('server/index.js', 'utf8');

  assert.equal(
    serverCode.includes('const PENDING_ORDER_TIMEOUT_MS = 30 * 60 * 1000;'),
    true,
    'server/index.js must enforce a 30-minute payment window for pending orders'
  );
  assert.equal(
    serverCode.includes('async function reconcilePendingOrderWithComgate'),
    true,
    'server/index.js must define reconcilePendingOrderWithComgate helper'
  );
  assert.equal(
    serverCode.includes('reusedExistingOrder: true'),
    true,
    'POST /api/orders/create must return existing valid pending order instead of creating duplicates'
  );
});

test('State machine safeguards A-F: 24h lead renewal, seamless +30d extension in active/grace period, PAST_DUE tracking, CRON pending check, and iUcto Outbox with 8s timeout', async () => {
  const fs = await import('node:fs');
  const serverCode = fs.readFileSync('server/index.js', 'utf8');
  const iuctoCode = fs.readFileSync('server/services/iuctoService.js', 'utf8');
  const emailCode = fs.readFileSync('server/services/emailService.js', 'utf8');

  // A: Recurring charge lead window (charges on expiration day <= 24h before end)
  assert.equal(
    serverCode.includes('const RECURRING_CHARGE_LEAD_MS = 24 * 60 * 60 * 1000;'),
    true,
    'server/index.js must charge recurring renewals within 24h before expiration'
  );
  assert.equal(
    serverCode.includes('nowMs < endMs - RECURRING_CHARGE_LEAD_MS'),
    true,
    'runDueRecurringSubscriptions must use RECURRING_CHARGE_LEAD_MS'
  );

  // B: Seamless +30d extension in active or 3-day Grace Period (even on card update)
  assert.equal(
    serverCode.includes('isWithinActiveOrGracePeriod'),
    true,
    'activatePremiumForUser must extend +30d from existingEndMs when within active or 3-day grace period'
  );

  // C: PAST_DUE flag saved on recurring failure and cleared on payment success; email links to /settings?tab=subscription
  assert.equal(
    serverCode.includes('lastRecurringPaymentFailed: true'),
    true,
    'server/index.js must mark lastRecurringPaymentFailed: true when recurring payment fails'
  );
  assert.equal(
    emailCode.includes('/settings?tab=subscription'),
    true,
    'sendRecurringChargeFailedEmail must link directly to /settings?tab=subscription for card update'
  );

  // D & E: CRON reconciles pending orders and runs iUcto Outbox for unsynced paid orders
  assert.equal(
    serverCode.includes('summary.pendingReconciled += 1'),
    true,
    'runDueRecurringSubscriptions must reconcile hanging pending orders'
  );
  assert.equal(
    serverCode.includes('summary.iuctoOutboxSynced += 1'),
    true,
    'runDueRecurringSubscriptions must process iUcto Outbox for paid orders with failed/missing invoice'
  );

  // F: iUcto API requests enforce an 8-second AbortController timeout so webhooks never hang
  assert.equal(
    iuctoCode.includes('IUCTO_REQUEST_TIMEOUT_MS') && iuctoCode.includes('controller.abort()'),
    true,
    'iuctoService.js must enforce a request timeout on iUcto API calls'
  );
});
