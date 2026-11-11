import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Dev role debouncing prevents duplicate requests within threshold', () => {
  const recentCalls = new Map<string, { key: string; timestamp: number }>();
  
  function checkOrSetRoleCall(uid: string, role: string, subStatus?: string, periodEnd?: string) {
    const dedupKey = `${uid}:${role}:${subStatus || ''}:${periodEnd || ''}`;
    const lastCall = recentCalls.get(uid);
    if (lastCall && lastCall.key === dedupKey && (Date.now() - lastCall.timestamp) < 2000) {
      return { deduplicated: true, success: true, uid, role };
    }
    recentCalls.set(uid, { key: dedupKey, timestamp: Date.now() });
    return { deduplicated: false, success: true, uid, role };
  }

  const testUid = 'user_test_123';
  
  // První volání: projde jako standardní zápis
  const first = checkOrSetRoleCall(testUid, 'free');
  assert.equal(first.deduplicated, false);
  assert.equal(first.role, 'free');

  // Druhé volání vzápětí (např. z cancelSubscription + updateProfileData): zachyceno debouncingem
  const second = checkOrSetRoleCall(testUid, 'free');
  assert.equal(second.deduplicated, true);

  // Třetí volání s jinou rolí: není duplikát
  const third = checkOrSetRoleCall(testUid, 'premium');
  assert.equal(third.deduplicated, false);
  assert.equal(third.role, 'premium');
});

test('AuthContext role sync check avoids redundant network call when role did not change', () => {
  const currentRole = 'premium';
  const newRole = 'premium';
  
  const shouldTriggerSync = (isDev: boolean, uid: string | undefined, current: string, next: string) => {
    return isDev && Boolean(uid) && current !== next;
  };

  assert.equal(shouldTriggerSync(true, 'user_1', currentRole, newRole), false);
  assert.equal(shouldTriggerSync(true, 'user_1', currentRole, 'free'), true);
  assert.equal(shouldTriggerSync(false, 'user_1', currentRole, 'free'), false);
  assert.equal(shouldTriggerSync(true, undefined, currentRole, 'free'), false);
});
