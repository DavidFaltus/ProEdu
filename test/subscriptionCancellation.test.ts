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
      subscriptionPeriodEnd: null
    };
  }

  return {
    role: 'premium' as const,
    subscriptionStatus: 'cancelled_at_period_end' as const,
    subscriptionCancelledAt: nowIso,
    subscriptionCancelReason: safeReason,
    subscriptionPeriodEnd: periodEnd
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
    subscriptionPeriodEnd: existingPeriodEnd
  };

  const payload = calculateCancellationPayload(existingProfile, false, 'Přecházím na jiný způsob přípravy', baseNow);

  // Role must remain premium until the period ends
  assert.equal(payload.role, 'premium', 'Role must remain premium during remaining period');
  assert.equal(payload.subscriptionStatus, 'cancelled_at_period_end');
  assert.equal(payload.subscriptionPeriodEnd, existingPeriodEnd, 'Existing periodEnd must be strictly preserved');
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
  const checkCanChargeRecurring = (status?: SubscriptionStatus): boolean => {
    if (status === 'cancelled_at_period_end' || status === 'inactive') {
      return false;
    }
    return true;
  };

  assert.equal(checkCanChargeRecurring('active'), true);
  assert.equal(checkCanChargeRecurring('cancelled_at_period_end'), false, 'Must block recurring charge for cancelled_at_period_end');
  assert.equal(checkCanChargeRecurring('inactive'), false, 'Must block recurring charge for inactive');
});
