import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import * as clientMath from '../src/utils/mathEvaluator.ts';
import * as serverMath from '../server/utils/mathEvaluator.js';
import { isEmailSimulationAllowed } from '../server/services/emailService.js';

const EVALUATORS = [
  { name: 'src/utils/mathEvaluator.ts', mod: clientMath },
  { name: 'server/utils/mathEvaluator.js', mod: serverMath },
];

test('SEC-02: gcd() safely handles non-finite inputs and truncates floats without hanging', () => {
  for (const { name, mod } of EVALUATORS) {
    const start = performance.now();
    assert.equal(mod.gcd(Infinity, 1), 1, `${name}: gcd(Infinity, 1) must return 1`);
    assert.equal(mod.gcd(1, Infinity), 1, `${name}: gcd(1, Infinity) must return 1`);
    assert.equal(mod.gcd(-Infinity, 5), 1, `${name}: gcd(-Infinity, 5) must return 1`);
    assert.equal(mod.gcd(NaN, 5), 1, `${name}: gcd(NaN, 5) must return 1`);
    assert.equal(mod.gcd(5, NaN), 1, `${name}: gcd(5, NaN) must return 1`);
    assert.equal(mod.gcd(12, 18), 6, `${name}: gcd(12, 18) must return 6`);
    assert.equal(mod.gcd(-12, 18), 6, `${name}: gcd(-12, 18) must return 6`);
    assert.equal(mod.gcd(12.9, 18.7), 6, `${name}: gcd should truncate decimals`);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `${name}: gcd checks must finish in <50ms (took ${elapsed.toFixed(2)}ms)`);
  }
});

test('SEC-02: pathological / DoS math payloads terminate in <50ms and never falsely match', () => {
  const maliciousInputs = [
    '2^1024/1',
    '1/2^1024',
    `${'9'.repeat(310)}/1`,
    `1/${'9'.repeat(310)}`,
    '1/0',
    'Infinity/1',
    '-Infinity/1',
    'NaN/1',
    '10^25/1',
    '2^31/1',
    '42abc',
  ];

  for (const { name, mod } of EVALUATORS) {
    for (const payload of maliciousInputs) {
      const start = performance.now();
      const parsed = mod.parseFraction(payload);
      const evalVsNumber = mod.evaluateStudentAnswer(payload, '42');
      const evalVsZero = mod.evaluateStudentAnswer(payload, '0');
      const evalVsOne = mod.evaluateStudentAnswer(payload, '1');
      const elapsed = performance.now() - start;

      assert.ok(elapsed < 50, `${name}: payload "${payload.slice(0, 24)}" took ${elapsed.toFixed(2)}ms (>=50ms)`);
      assert.equal(parsed, null, `${name}: parseFraction("${payload.slice(0, 24)}") must return null`);
      assert.equal(evalVsNumber.isCorrect, false, `${name}: "${payload.slice(0, 24)}" must not match "42"`);
      assert.equal(evalVsZero.isCorrect, false, `${name}: "${payload.slice(0, 24)}" must not match "0"`);
      assert.equal(evalVsOne.isCorrect, false, `${name}: "${payload.slice(0, 24)}" must not match "1"`);
    }

    // Strict number validation: trailing garbage / partial numeric prefixes must be rejected
    assert.equal(mod.evaluateStudentAnswer('42abc', '42').isCorrect, false, `${name}: 42abc must not match 42`);
    assert.equal(mod.evaluateStudentAnswer('42 + 100', '42').isCorrect, false, `${name}: 42 + 100 must not match 42`);
    assert.equal(mod.evaluateStudentAnswer('10 cm', '10 m').isCorrect, false, `${name}: 10 cm must not match 10 m`);
    assert.equal(mod.evaluateStudentAnswer('2^3', '2').isCorrect, false, `${name}: 2^3 must not match 2`);
  }
});

test('SEC-02: legitimate math answers (fractions, powers, decimals, negatives, equivalents) remain accurate and consistent', () => {
  const cases: Array<{
    input: string;
    expected: string;
    isCorrect: boolean;
    isSimplified?: boolean;
  }> = [
    // Fractions & equivalents
    { input: '1/2', expected: '0,5', isCorrect: true },
    { input: '0,5', expected: '1/2', isCorrect: true },
    { input: '3,5', expected: '3.5', isCorrect: true },
    { input: '3,5', expected: '7/2', isCorrect: true },
    { input: '$\\frac{1}{2}$', expected: '0.5', isCorrect: true },
    { input: '2/4', expected: '1/2', isCorrect: true, isSimplified: false },
    { input: ' 1 000 ', expected: '1000', isCorrect: true },
    { input: 'x = 3,5', expected: '3.5', isCorrect: true },
    // Powers in fractions & exact power answers
    { input: '1/2^3', expected: '1/8', isCorrect: true, isSimplified: true },
    { input: '1/2^3', expected: '0,125', isCorrect: true },
    { input: '2^3/5', expected: '8/5', isCorrect: true, isSimplified: true },
    { input: '2^3/5', expected: '1,6', isCorrect: true },
    { input: '2^3', expected: '2^3', isCorrect: true },
    { input: '1/2^30', expected: '1/1073741824', isCorrect: true, isSimplified: true },
    // Negatives
    { input: '-3/4', expected: '-0,75', isCorrect: true },
    { input: '3/-4', expected: '-3/4', isCorrect: true, isSimplified: true },
    { input: '-2/4', expected: '-1/2', isCorrect: true, isSimplified: false },
    { input: '-3,5', expected: '-7/2', isCorrect: true },
    // Alternatives & wrong answers
    { input: '0,25', expected: '1/4; 25%', isCorrect: true },
    { input: '1/3', expected: '1/2', isCorrect: false },
  ];

  for (const c of cases) {
    const clientRes = clientMath.evaluateStudentAnswer(c.input, c.expected);
    const serverRes = serverMath.evaluateStudentAnswer(c.input, c.expected);

    assert.equal(clientRes.isCorrect, c.isCorrect, `client mismatch for "${c.input}" vs "${c.expected}"`);
    assert.equal(serverRes.isCorrect, c.isCorrect, `server mismatch for "${c.input}" vs "${c.expected}"`);
    if (c.isSimplified !== undefined) {
      assert.equal(clientRes.isSimplified, c.isSimplified, `client isSimplified mismatch for "${c.input}"`);
      assert.equal(serverRes.isSimplified, c.isSimplified, `server isSimplified mismatch for "${c.input}"`);
    }
    assert.deepEqual(
      { isCorrect: clientRes.isCorrect, isExact: clientRes.isExact, isSimplified: clientRes.isSimplified },
      { isCorrect: serverRes.isCorrect, isExact: serverRes.isExact, isSimplified: serverRes.isSimplified },
      `client/server behavioral parity failed for "${c.input}" vs "${c.expected}"`
    );
  }
});

test('SEC-07: isEmailSimulationAllowed() always returns false in production even with ALLOW_DEV_TOOLS=true', () => {
  const prevNodeEnv = process.env.NODE_ENV;
  const prevAllowDevTools = process.env.ALLOW_DEV_TOOLS;
  const prevEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;

  try {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEV_TOOLS = 'true';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    assert.equal(
      isEmailSimulationAllowed(),
      false,
      'Production must NEVER allow email simulation even when ALLOW_DEV_TOOLS=true and emulator host is set'
    );

    delete process.env.ALLOW_DEV_TOOLS;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    assert.equal(isEmailSimulationAllowed(), false, 'Production must disallow email simulation');

    process.env.NODE_ENV = 'development';
    assert.equal(isEmailSimulationAllowed(), true, 'Development mode may allow email simulation');
  } finally {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;

    if (prevAllowDevTools === undefined) delete process.env.ALLOW_DEV_TOOLS;
    else process.env.ALLOW_DEV_TOOLS = prevAllowDevTools;

    if (prevEmulator === undefined) delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    else process.env.FIREBASE_AUTH_EMULATOR_HOST = prevEmulator;
  }
});

test('SEC-07: server/index.js never logs reset links / oobCode and fails closed on emailRes.simulated in production', () => {
  const serverPath = path.resolve(process.cwd(), 'server/index.js');
  const serverCode = fs.readFileSync(serverPath, 'utf8');

  // Extract password-reset route handler block
  const routeStart = serverCode.indexOf("app.post('/api/auth/password-reset'");
  assert.ok(routeStart !== -1, 'password-reset route must exist in server/index.js');
  const routeEnd = serverCode.indexOf("app.post('/api/dev/set-role'", routeStart);
  assert.ok(routeEnd > routeStart, 'password-reset route slice must terminate cleanly');
  const routeSlice = serverCode.slice(routeStart, routeEnd);

  assert.ok(
    !/console\.(log|info|warn|error)\([^\n]*(publicResetLink|localResetLink|rawResetLink|oobCode)/.test(routeSlice),
    'password-reset handler must not log publicResetLink, localResetLink, rawResetLink, or oobCode'
  );
  assert.ok(
    !serverCode.includes('console.log(`🌐 Odkaz v e-mailu'),
    'plaintext reset link console.log must be completely removed'
  );
  assert.ok(
    routeSlice.includes("process.env.NODE_ENV === 'production' && emailRes?.simulated") &&
      routeSlice.includes('res.status(503)'),
    'password-reset handler must return HTTP 503 when emailRes.simulated is true in production'
  );
});

test('SEC-01: test/materials_chunk_flow.test.ts contains no hardcoded debug credentials', () => {
  const chunkTestPath = path.resolve(process.cwd(), 'test/materials_chunk_flow.test.ts');
  const content = fs.readFileSync(chunkTestPath, 'utf8');

  assert.ok(!content.includes('ucitel123'), 'must not contain hardcoded ucitel123 password');
  assert.ok(!content.includes('student123'), 'must not contain hardcoded student123 password');
  assert.ok(!content.includes('ucitel@ucitel.cz'), 'must not contain hardcoded ucitel@ucitel.cz email');
  assert.ok(!content.includes('student@student.cz'), 'must not contain hardcoded student@student.cz email');
  assert.ok(content.includes('TEST_TEACHER_EMAIL'), 'must read teacher email from TEST_TEACHER_EMAIL');
  assert.ok(content.includes('TEST_TEACHER_PASSWORD'), 'must read teacher password from TEST_TEACHER_PASSWORD');
});
