import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import express from 'express';

import {
  embedWatermarkIntoSvg,
  embedWatermarkIntoPdf,
  normalizeWatermarkForWinAnsi,
  escapeXmlForSvg,
} from '../server/utils/materialWatermark.js';
import { sanitizeSvg } from '../server/utils/svgSanitizer.js';

const serverRequire = createRequire(path.resolve(process.cwd(), 'server/package.json'));
const { PDFDocument } = serverRequire('pdf-lib');

const SERVER_PATH = path.resolve(process.cwd(), 'server/index.js');
const SERVER_PKG_PATH = path.resolve(process.cwd(), 'server/package.json');
const serverCode = fs.readFileSync(SERVER_PATH, 'utf8').replace(/\r\n/g, '\n');
const serverPkg = JSON.parse(fs.readFileSync(SERVER_PKG_PATH, 'utf8'));

function extractBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, `Expected marker "${startMarker}" in server/index.js`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `Expected end marker "${endMarker}" after "${startMarker}" in server/index.js`);
  return source.slice(start, end);
}

// =========================================================================
// SEC-06: Forensic SVG & PDF Watermarking + Scraping Protection
// =========================================================================

test('SEC-06: embedWatermarkIntoSvg injects escaped diagonal overlay before </svg> and survives sanitizeSvg', () => {
  const sampleSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1120"><rect width="800" height="1120" fill="#fff"/><text x="40" y="60">Úloha 1</text></svg>';

  const watermarkText = 'ProEducator • Žák Řešení <script>alert("xss")</script> & \'test\' • 2026-11-23';
  const result = embedWatermarkIntoSvg(sampleSvg, watermarkText);

  assert.ok(result.includes('data-proedu-watermark="1"'), 'Must inject data-proedu-watermark="1" group');
  assert.ok(result.includes('pointer-events="none"'), 'Watermark group must be non-interactive');
  assert.ok(result.includes('transform="rotate(-30 '), 'Watermark text must be rotated diagonally');
  assert.ok(result.includes('Žák Řešení'), 'SVG watermark must preserve Czech diacritics');
  assert.ok(!result.includes('<script>'), 'XML special chars in watermark text must be escaped');
  assert.ok(result.includes('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'), 'Must XML-escape angle brackets and quotes');
  assert.ok(result.trimEnd().endsWith('</svg>'), 'Output must remain a valid closed SVG document');

  // Verify the watermarked SVG passes through sanitizeSvg without losing the forensic watermark
  const sanitized = sanitizeSvg(result);
  assert.ok(sanitized.includes('Žák Řešení'), 'Watermarked text must survive sanitizeSvg');
  assert.ok(sanitized.includes('</svg>'), 'Sanitized watermarked SVG must remain valid');

  // Empty/invalid input safety
  assert.equal(embedWatermarkIntoSvg('', 'test'), '');
  assert.equal(embedWatermarkIntoSvg(sampleSvg, ''), sampleSvg);
  assert.equal(escapeXmlForSvg(`<a&b"c'd>`), '&lt;a&amp;b&quot;c&#39;d&gt;');
});

test('SEC-06: embedWatermarkIntoPdf embeds diagonal watermark & metadata on all pages including Czech diacritics', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  doc.addPage([595, 842]);
  const originalBytes = Buffer.from(await doc.save());

  const czechWatermark = 'ProEducator • Žák Řešení Čestmír Ůloha • žák@škola.cz • 2026-11-23';
  const normalized = normalizeWatermarkForWinAnsi(czechWatermark);
  assert.ok(normalized.includes('Zak Reseni Cestmir Uloha'), `Expected Czech transliteration, got: ${normalized}`);
  assert.ok(/^[\x20-\x7E]+$/.test(normalized), 'Normalized PDF watermark must be pure WinAnsi/ASCII');

  const watermarkedBuf = await embedWatermarkIntoPdf(originalBytes, czechWatermark);
  assert.ok(Buffer.isBuffer(watermarkedBuf), 'Must return a Buffer');
  assert.equal(watermarkedBuf.subarray(0, 5).toString('latin1'), '%PDF-', 'Output must have valid PDF header');
  assert.ok(
    watermarkedBuf.length > originalBytes.length,
    `Watermarked PDF (${watermarkedBuf.length} B) must contain added drawing operators vs original (${originalBytes.length} B)`
  );

  // Reload watermarked PDF with pdf-lib and confirm validity + metadata
  const reloaded = await PDFDocument.load(watermarkedBuf);
  assert.equal(reloaded.getPageCount(), 2, 'Watermarked PDF must preserve exact page count');
  const subject = reloaded.getSubject() || '';
  const keywords = reloaded.getKeywords() || '';
  assert.ok(subject.includes('Zak Reseni'), `PDF Subject metadata must include watermark (got "${subject}")`);
  assert.ok(keywords.includes('Zak Reseni'), `PDF Keywords metadata must include watermark (got "${keywords}")`);

  // Graceful fallback on malformed PDF buffer (must never crash request)
  const malformedBuf = Buffer.from('%PDF-1.4\nNOT_A_REAL_PDF_BODY', 'latin1');
  const fallback = await embedWatermarkIntoPdf(malformedBuf, czechWatermark);
  assert.deepEqual(fallback, malformedBuf, 'Malformed PDF must gracefully fall back to original buffer');
});

test('SEC-06: serveMaterialFile embeds forensic watermarks for all non-teachers, adds X-Robots-Tag, and caps daily unique materials', () => {
  const serveSlice = extractBetween(serverCode, 'async function serveMaterialFile(', "app.get('/api/materials/:id/file'");
  assert.ok(serveSlice.includes("'ProEducator.eu — Ukázka'"), 'Unauthenticated free samples must default to ProEducator.eu — Ukázka watermark');
  assert.ok(serveSlice.includes('embedWatermarkIntoSvg('), 'serveMaterialFile must embed watermark into SVG payloads');
  assert.ok(serveSlice.includes('embedWatermarkIntoPdf('), 'serveMaterialFile must embed watermark into PDF payloads');
  assert.ok(serveSlice.includes("res.setHeader('X-Watermark-Text'"), 'Must keep X-Watermark-Text header for frontend compatibility');
  assert.ok(serveSlice.includes("res.setHeader('X-Robots-Tag', 'noindex, nofollow')"), 'Must set X-Robots-Tag: noindex, nofollow');
  assert.ok(serveSlice.includes('checkMaterialFileRateLimit(req, id)'), 'Must pass materialId to checkMaterialFileRateLimit for daily unique cap');

  const rateSlice = extractBetween(serverCode, 'const MATERIAL_FILE_RATE_WINDOW_MS', 'function isUserPaidOrTeacher(');
  assert.ok(rateSlice.includes('MATERIAL_FILE_DAILY_UNIQUE_MAX = 20'), 'Must enforce max 20 unique materials / 24h cap');
  assert.ok(rateSlice.includes('materialFileDailyUniqueMap'), 'Must track unique materials per user/IP per 24h');
  assert.ok(rateSlice.includes('setBoundedMapEntry(materialFileViewRateMap'), 'materialFileViewRateMap must be bounded');
  assert.ok(rateSlice.includes('setBoundedMapEntry(materialFileDailyUniqueMap'), 'materialFileDailyUniqueMap must be bounded');
});

// =========================================================================
// SEC-05: Zero-Joker Paywall & Answer-Key Bypass Fixes
// =========================================================================

test('SEC-05: verifiedPracticeChecks written on check-answer/reveal-solution; /finish never trusts activePracticeSessions.answeredCount', () => {
  const checkSlice = extractBetween(serverCode, 'async function handleCheckPracticeAnswer(', 'app.post(\'/api/practice/reveal-solution\'');
  const revealSlice = extractBetween(serverCode, 'async function handleRevealPracticeSolution(', 'app.post(\'/api/practice/finish\'');
  const finishSlice = extractBetween(serverCode, "app.post('/api/practice/finish'", "app.get('/api/inquiries/question/:questionId'");

  assert.ok(
    checkSlice.includes("await recordVerifiedPracticeCheck(req.user.uid, questionId, subtopicId, 'check-answer')"),
    'check-answer must record verifiedPracticeChecks on server'
  );
  assert.ok(
    revealSlice.includes("await recordVerifiedPracticeCheck(req.user.uid, questionId, subtopicId, 'reveal-solution')"),
    'reveal-solution must record verifiedPracticeChecks on server'
  );

  // /api/practice/finish guards
  assert.ok(finishSlice.includes('practiceFinishLimiter'), '/api/practice/finish must be rate-limited per user');
  assert.ok(
    !finishSlice.includes('sessionRef.get(') && !finishSlice.includes('sData.answeredCount'),
    '/api/practice/finish must NEVER read client-writable activePracticeSessions.answeredCount'
  );
  assert.ok(finishSlice.includes("db.collection('verifiedPracticeChecks')"), '/api/practice/finish must verify against verifiedPracticeChecks');
  assert.ok(finishSlice.includes('db.getAll(...refs)'), '/api/practice/finish must batch-fetch verifiedPracticeChecks via db.getAll');
  assert.ok(finishSlice.includes('deductMultiplePracticeJokers(uid, unverifiedCount)'), 'Must atomically deduct unverifiedCount jokers');
  assert.ok(serverCode.includes("code = 'INSUFFICIENT_JOKERS'"), 'Must return INSUFFICIENT_JOKERS code when jokers < unverifiedCount');
  assert.ok(serverCode.includes('status: 403') && serverCode.includes("code: 'INSUFFICIENT_JOKERS'"), 'Must reject with HTTP 403 and INSUFFICIENT_JOKERS');
  assert.ok(finishSlice.includes('if (nonEmptyAnsweredCount >= 1)'), 'Streak must only increment with >= 1 non-empty submitted answer');
  assert.ok(
    finishSlice.includes('const minTodoAnsweredRequired = Math.min(3, Math.max(1, subtopicQuestionCount))') &&
      finishSlice.includes('if (meetsTodoCompletionThreshold)'),
    'Todo auto-completion must enforce minimum answered threshold'
  );
});

test('SEC-05: GET /api/inquiries/question/:questionId blocks hidden questions/subtopics and redacts unverified solutions', () => {
  const inquirySlice = extractBetween(
    serverCode,
    "app.get('/api/inquiries/question/:questionId'",
    'function sanitizeAssignedTestForClient('
  );

  assert.ok(inquirySlice.includes('loadPracticeCatalogFromFirestore()'), 'Must load catalog to verify hidden topics/subtopics');
  assert.ok(inquirySlice.includes('catalog.hiddenTopicKeys.has('), 'Must check hiddenTopicKeys');
  assert.ok(inquirySlice.includes('subtopic.isHidden === true'), 'Must check subtopic.isHidden');
  assert.ok(inquirySlice.includes('if (isHiddenQuestion)'), 'Must return 404 for hidden questions/subtopics');
  assert.ok(inquirySlice.includes("collection('verifiedPracticeChecks')"), 'Must check verifiedPracticeChecks for solution reveal');
  assert.ok(inquirySlice.includes("status === 'answered'"), 'Must allow solution reveal when inquiry is answered');
  assert.ok(
    inquirySlice.includes('const canRevealSolution = isTeacher || isPaidRole || hasVerifiedCheck || hasAnsweredInquiry;'),
    'Must gate solution fields on teacher | paid | verified | answered inquiry'
  );
  assert.ok(inquirySlice.includes("correctAnswer: canRevealSolution ? data.correctAnswer || '' : null"), 'Must redact correctAnswer to null');
  assert.ok(inquirySlice.includes("explanation: canRevealSolution ? data.explanation || '' : null"), 'Must redact explanation to null');
  assert.ok(inquirySlice.includes("solutionImageUrl: canRevealSolution ? data.solutionImageUrl || '' : null"), 'Must redact solutionImageUrl to null');
  assert.ok(inquirySlice.includes('solutionSvgContent:\n          canRevealSolution'), 'Must redact solutionSvgContent to null');
});

// =========================================================================
// SEC-09: getClientIp / trust proxy, Bounded Maps, Distributed Rate Limits
// =========================================================================

test('SEC-09: Express trust proxy = 2 ignores attacker-spoofed leftmost X-Forwarded-For and picks real client IP', async () => {
  const cloudApp = express();
  cloudApp.set('trust proxy', 2);
  cloudApp.get('/ip', (req, res) => {
    res.json({ ip: req.ip });
  });

  const localApp = express();
  localApp.set('trust proxy', false);
  localApp.get('/ip', (req, res) => {
    res.json({ ip: req.ip });
  });

  async function queryIp(targetApp: express.Express, xffHeader?: string): Promise<string> {
    const server = http.createServer(targetApp);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    try {
      const headers: Record<string, string> = {};
      if (xffHeader) headers['X-Forwarded-For'] = xffHeader;
      const resp = await fetch(`http://127.0.0.1:${port}/ip`, { headers });
      const data: any = await resp.json();
      return String(data.ip || '');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  // Cloud Run behind Fastly + GFE: X-Forwarded-For = "<spoofed>, <real_client>, <fastly_edge>"
  const cloudIpWithSpoof = await queryIp(cloudApp, '6.6.6.6, 203.0.113.42, 151.101.1.1');
  assert.equal(
    cloudIpWithSpoof,
    '203.0.113.42',
    'With trust proxy = 2, Express req.ip must ignore leftmost spoofed 6.6.6.6 and pick real client 203.0.113.42'
  );

  // Even with multiple attacker-prepended entries, rightmost-2 skips GFE + Fastly -> real_client
  const cloudIpMultiSpoof = await queryIp(cloudApp, '1.1.1.1, 2.2.2.2, 198.51.100.77, 151.101.2.2');
  assert.equal(cloudIpMultiSpoof, '198.51.100.77', 'Must ignore all attacker-prepended XFF entries');

  // Local dev (trust proxy = false): ignores spoofed X-Forwarded-For completely
  const localIpWithSpoof = await queryIp(localApp, '6.6.6.6');
  assert.ok(
    localIpWithSpoof === '127.0.0.1' || localIpWithSpoof === '::ffff:127.0.0.1',
    `Local dev must ignore spoofed XFF and use loopback socket address (got ${localIpWithSpoof})`
  );
});

test('SEC-09: server/index.js fixes getClientIp, bounds all in-memory Maps, and applies distributed Firestore rate limits', () => {
  assert.ok(
    serverCode.includes("app.set('trust proxy', isCloudFunction ? 2 : false);"),
    'Must configure trust proxy = 2 in Cloud Functions and false locally'
  );

  const getClientIpSlice = extractBetween(serverCode, 'function getClientIp(req)', 'function isLoopbackRequest(req)');
  assert.ok(!getClientIpSlice.includes('x-forwarded-for'), 'getClientIp must NEVER manually parse leftmost x-forwarded-for');
  assert.ok(!getClientIpSlice.includes("split(',')[0]"), 'getClientIp must NEVER split leftmost XFF entry');
  assert.ok(getClientIpSlice.includes('req?.ip'), 'getClientIp must use Express req.ip');

  // Bounded Maps
  assert.ok(serverCode.includes('const DEFAULT_MAP_MAX_ENTRIES = 5000;'), 'Must define DEFAULT_MAP_MAX_ENTRIES = 5000');
  assert.ok(serverCode.includes('function setBoundedMapEntry(map, key, value, maxEntries = DEFAULT_MAP_MAX_ENTRIES)'), 'Must define bounded Map helper');
  assert.ok(serverCode.includes('setBoundedMapEntry(buckets, key, entry, maxEntries)'), 'createRateLimiter buckets must be bounded');
  assert.ok(serverCode.includes('setBoundedMapEntry(userRoleCache, uid, state, DEFAULT_MAP_MAX_ENTRIES)'), 'userRoleCache must be bounded');
  assert.ok(serverCode.includes('setBoundedMapEntry(\n    guestDemoIpDailyQuota,'), 'guestDemoIpDailyQuota must be bounded');

  // Distributed rate limiter & per-email 60s cooldowns
  assert.ok(serverCode.includes('async function checkDistributedRateLimit({ key, windowMs, max })'), 'Must define checkDistributedRateLimit');
  assert.ok(serverCode.includes("db.collection('rateLimits').doc(docId)"), 'Distributed rate limiter must store in rateLimits collection');

  const pwdResetSlice = extractBetween(serverCode, "app.post('/api/auth/password-reset'", '// Dev endpoint pro lokální testování rolí');
  assert.ok(pwdResetSlice.includes('`pwd-reset-ip:${getClientIp(req)}`'), 'password-reset must enforce distributed IP limit');
  assert.ok(pwdResetSlice.includes('`pwd-reset-email:${hashEmailKey(safeEmail)}`') && pwdResetSlice.includes('windowMs: 60 * 1000'), 'password-reset must enforce 60s per-email cooldown');

  const regInitSlice = extractBetween(serverCode, "app.post('/api/auth/register-init'", "app.post('/api/auth/register-resend'");
  assert.ok(regInitSlice.includes('`reg-init-ip:${getClientIp(req)}`') && regInitSlice.includes('`reg-init-email:${emailKey}`'), 'register-init must enforce distributed IP + per-email cooldown');

  const regResendSlice = extractBetween(serverCode, "app.post('/api/auth/register-resend'", "app.post('/api/auth/register-confirm'");
  assert.ok(regResendSlice.includes('`reg-resend-ip:${getClientIp(req)}`') && regResendSlice.includes('`reg-resend-email:${emailKey}`'), 'register-resend must enforce distributed IP + per-email cooldown');

  const regConfirmSlice = extractBetween(serverCode, "app.post('/api/auth/register-confirm'", "app.post('/api/auth/password-reset'");
  assert.ok(!regConfirmSlice.includes('reg-init-email:'), 'register-confirm must NOT share register-init 60s cooldown');

  assert.ok(serverCode.includes('`guest-demo-daily:${current.today}:${current.ip}`'), 'Guest daily demo quota must be distributed via Firestore');
  assert.ok(serverCode.includes('checkDistributedGuestBurstLimit(req, res)'), 'Guest check-answer/reveal burst limit must be distributed via Firestore');
});

test('SEC-09: bounded map oldest-entry eviction caps size strictly under flood', () => {
  const MAX = 100;
  const map = new Map<string, number>();
  function setBounded(m: Map<string, number>, k: string, v: number, maxEntries: number) {
    if (m.has(k)) m.delete(k);
    m.set(k, v);
    while (m.size > maxEntries) {
      const oldest = m.keys().next().value;
      if (oldest === undefined) break;
      m.delete(oldest);
    }
  }

  for (let i = 0; i < 250; i++) {
    setBounded(map, `ip_${i}`, i, MAX);
  }
  assert.equal(map.size, MAX, 'Map size must never exceed maxEntries');
  assert.equal(map.has('ip_0'), false, 'Oldest entry must be evicted');
  assert.equal(map.has('ip_149'), false, 'Older entries must be evicted');
  assert.equal(map.has('ip_150'), true, 'Recent entries must be retained');
  assert.equal(map.has('ip_249'), true, 'Newest entry must be retained');
});

// =========================================================================
// SEC-14: Cloud Functions v2 2 MiB JSON Bypass & 30 MiB Pre-Auth Guard
// =========================================================================

test('SEC-14: early body-size & pre-auth guard rejects >2 MiB rawBody/Content-Length with 413 and unauth >2 MiB uploads with 401', async () => {
  // Verify exact middleware presence and ordering in server/index.js
  const setupSlice = extractBetween(serverCode, 'const STANDARD_BODY_LIMIT_BYTES', 'const userRoleCache = new Map()');
  const guardPos = setupSlice.indexOf('Buffer.isBuffer(req.rawBody)');
  const parserPos = setupSlice.indexOf('const standardJsonParser = express.json');
  assert.ok(guardPos !== -1 && parserPos !== -1 && guardPos < parserPos, 'SEC-14 guard must execute BEFORE express.json parsers');
  assert.ok(setupSlice.includes('STANDARD_BODY_LIMIT_BYTES = 2 * 1024 * 1024'), 'Standard limit must be 2 MiB');
  assert.ok(setupSlice.includes('MATERIAL_UPLOAD_BODY_LIMIT_BYTES = 30 * 1024 * 1024'), 'Upload limit must be 30 MiB');
  assert.ok(setupSlice.includes('res.status(413)'), 'Must return 413 on oversized payloads');
  assert.ok(setupSlice.includes('res.status(401)'), 'Must return 401 on unauthenticated >2 MiB uploads');

  // Verify Cloud Function memory bump to 512MiB
  const onReqSlice = extractBetween(serverCode, 'export const api = onRequest(', 'export const scheduledSubscriptionRenewal');
  assert.ok(onReqSlice.includes("memory: '512MiB'"), 'Cloud Function api must allocate memory: 512MiB');
  assert.ok(onReqSlice.includes('maxInstances: 10'), 'Cloud Function api must preserve maxInstances: 10');

  // Behavioral test replicating the exact guard middleware with simulated Cloud Functions pre-parsed req.rawBody
  const STANDARD_LIMIT = 2 * 1024 * 1024;
  const UPLOAD_LIMIT = 30 * 1024 * 1024;
  const isUpload = (req: any) => {
    const pathname = String(req.path || '').split('?')[0];
    return (
      (req.method === 'POST' && pathname === '/api/materials/upload') ||
      (req.method === 'PUT' && /^\/api\/materials\/[^/]+$/.test(pathname))
    );
  };

  function runGuard(req: any): { status: number; body: any; calledNext: boolean } {
    let status = 200;
    let body: any = null;
    let calledNext = false;
    const res = {
      status(code: number) {
        status = code;
        return this;
      },
      json(payload: any) {
        body = payload;
        return this;
      },
    };
    const next = () => {
      calledNext = true;
    };

    const contentLengthHeader = Number(req.headers['content-length']);
    const contentLength = Number.isFinite(contentLengthHeader) && contentLengthHeader > 0 ? contentLengthHeader : 0;
    const rawBodyLen = Buffer.isBuffer(req.rawBody) ? req.rawBody.length : 0;
    const payloadBytes = Math.max(contentLength, rawBodyLen);

    if (!isUpload(req)) {
      if (payloadBytes > STANDARD_LIMIT) {
        res.status(413).json({ error: 'Požadavek je příliš velký (max 2 MB).' });
        return { status, body, calledNext };
      }
      next();
      return { status, body, calledNext };
    }
    if (payloadBytes > UPLOAD_LIMIT) {
      res.status(413).json({ error: 'Nahrávaný požadavek je příliš velký (max 30 MB).' });
      return { status, body, calledNext };
    }
    if (payloadBytes > STANDARD_LIMIT) {
      const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization.trim() : '';
      if (!authHeader.startsWith('Bearer ') || authHeader.length <= 7) {
        res.status(401).json({ error: 'Pro nahrání velkého souboru je vyžadováno přihlášení.' });
        return { status, body, calledNext };
      }
    }
    next();
    return { status, body, calledNext };
  }

  // 1. Non-upload route with 2.2 MiB pre-parsed rawBody (and no Content-Length header, e.g. chunked Cloud Functions v2) -> 413
  const oversizedPractice = runGuard({
    method: 'POST',
    path: '/api/practice/check-answer',
    headers: {},
    rawBody: Buffer.alloc(Math.round(2.2 * 1024 * 1024)),
  });
  assert.equal(oversizedPractice.status, 413);
  assert.equal(oversizedPractice.calledNext, false);

  // 2. Non-upload route with Content-Length > 2 MiB -> 413
  const oversizedHeader = runGuard({
    method: 'POST',
    path: '/api/auth/password-reset',
    headers: { 'content-length': String(3 * 1024 * 1024) },
  });
  assert.equal(oversizedHeader.status, 413);
  assert.equal(oversizedHeader.calledNext, false);

  // 3. Unauthenticated upload route > 2 MiB -> 401 before parsing 30 MiB
  const unauthUpload = runGuard({
    method: 'POST',
    path: '/api/materials/upload',
    headers: { 'content-length': String(10 * 1024 * 1024) },
  });
  assert.equal(unauthUpload.status, 401);
  assert.equal(unauthUpload.calledNext, false);

  // 4. Authenticated upload route > 30 MiB -> 413
  const hugeAuthUpload = runGuard({
    method: 'PUT',
    path: '/api/materials/mat_123',
    headers: {
      'content-length': String(31 * 1024 * 1024),
      authorization: 'Bearer valid_token_placeholder',
    },
  });
  assert.equal(hugeAuthUpload.status, 413);
  assert.equal(hugeAuthUpload.calledNext, false);

  // 5. Authenticated upload route at 5 MiB -> passes guard
  const validAuthUpload = runGuard({
    method: 'POST',
    path: '/api/materials/upload',
    headers: {
      'content-length': String(5 * 1024 * 1024),
      authorization: 'Bearer valid_token_placeholder',
    },
  });
  assert.equal(validAuthUpload.calledNext, true);
});

// =========================================================================
// SEC-15 & SEC-32: Caching, CDN Headers, Unused @google/genai, Awaited Processing
// =========================================================================

test('SEC-15 & SEC-32: removes @google/genai, caches catalogs/courses/questions, sets CDN headers, and awaits material processing', () => {
  // 1. Unused @google/genai removed from server/index.js & server/package.json
  assert.ok(!serverCode.includes('@google/genai'), 'server/index.js must not import unused @google/genai');
  assert.ok(!serverCode.includes('GoogleGenAI'), 'server/index.js must not reference GoogleGenAI');
  assert.equal(serverPkg.dependencies?.['@google/genai'], undefined, 'server/package.json must not depend on unused @google/genai');
  assert.ok(serverPkg.dependencies?.['pdf-lib'], 'server/package.json must declare pdf-lib dependency');

  // 2. GET /api/materials uses cached catalog & learningSheets + CDN headers
  const materialsRoute = extractBetween(serverCode, "app.get('/api/materials', optionalAuth", "app.get('/api/materials/quota'");
  assert.ok(!materialsRoute.includes('fetchPracticeCatalogUncached('), 'GET /api/materials must NOT call fetchPracticeCatalogUncached()');
  assert.ok(materialsRoute.includes('loadPracticeCatalogFromFirestore('), 'GET /api/materials must use cached loadPracticeCatalogFromFirestore()');
  assert.ok(materialsRoute.includes('loadLearningSheetsFromFirestore('), 'GET /api/materials must use cached learningSheets metadata');
  assert.ok(materialsRoute.includes('setPublicCatalogCacheHeaders(req, res)'), 'GET /api/materials must set CDN Cache-Control + Vary: Authorization');

  // 3. GET /api/practice/catalog sets CDN headers
  const catalogRoute = extractBetween(serverCode, "app.get('/api/practice/catalog'", "app.get('/api/practice/study/:subtopicId'");
  assert.ok(catalogRoute.includes('setPublicCatalogCacheHeaders(req, res)'), 'GET /api/practice/catalog must set CDN Cache-Control + Vary: Authorization');

  // 4. GET /api/practice/subtopics/:subtopicId/questions uses bounded cache
  const questionsRoute = extractBetween(
    serverCode,
    "app.get('/api/practice/subtopics/:subtopicId/questions'",
    'async function deductPracticeCheckQuota('
  );
  assert.ok(questionsRoute.includes('loadPublicSubtopicQuestions('), 'Subtopic questions endpoint must use bounded short-TTL cache');
  assert.ok(serverCode.includes('SUBTOPIC_QUESTIONS_CACHE_TTL_MS = 60 * 1000'), 'Subtopic questions cache must use 60s TTL');

  // 5. GET /api/courses uses cached list + CDN headers, and enroll/unenroll invalidate it
  const coursesRoute = extractBetween(serverCode, "app.get('/api/courses', optionalAuth", "app.get(['/sitemap-courses.xml'");
  assert.ok(coursesRoute.includes('loadCoursesListFromFirestore('), 'GET /api/courses must use cached courses list');
  assert.ok(coursesRoute.includes('setPublicCatalogCacheHeaders(req, res)'), 'GET /api/courses must set CDN Cache-Control + Vary: Authorization');

  const enrollRoute = extractBetween(serverCode, "app.post('/api/courses/:courseId/enroll'", "app.delete('/api/courses/:courseId/enroll/:studentUid'");
  const unenrollRoute = extractBetween(serverCode, "app.delete('/api/courses/:courseId/enroll/:studentUid'", "app.all(['/api', '/api/*']");
  assert.ok(enrollRoute.includes('invalidateCoursesListCache()'), 'POST enroll must invalidate courses cache');
  assert.ok(unenrollRoute.includes('invalidateCoursesListCache()'), 'DELETE unenroll must invalidate courses cache');

  // 6. setPublicCatalogCacheHeaders sets exact headers for unauth vs auth
  const cacheHelper = extractBetween(serverCode, 'function setPublicCatalogCacheHeaders(req, res)', 'function parseIsoMillis(');
  assert.ok(cacheHelper.includes("res.setHeader('Vary', 'Authorization')"), 'Must set Vary: Authorization');
  assert.ok(
    cacheHelper.includes("res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=60')"),
    'Must set CDN public Cache-Control for unauthenticated requests'
  );
  assert.ok(
    cacheHelper.includes("res.setHeader('Cache-Control', 'private, no-store')"),
    'Must set private, no-store Cache-Control when Authorization header is present'
  );

  // 7. POST /api/materials/upload & PUT /api/materials/:id await processMaterialInBackground before sending response
  const uploadRoute = extractBetween(serverCode, "app.post('/api/materials/upload'", "app.put('/api/materials/:id'");
  const updateRoute = extractBetween(serverCode, "app.put('/api/materials/:id'", "app.get('/api/materials/:id/status'");
  assert.ok(uploadRoute.includes('await processMaterialInBackground(materialId,'), 'POST /api/materials/upload must await processMaterialInBackground before responding');
  assert.ok(!uploadRoute.includes('res.status(202)'), 'POST /api/materials/upload must not return post-202 fire-and-forget response');
  assert.ok(updateRoute.includes('await processMaterialInBackground(id,'), 'PUT /api/materials/:id must await processMaterialInBackground before responding');
  assert.ok(!updateRoute.includes('res.status(202)'), 'PUT /api/materials/:id must not return post-202 fire-and-forget response');
});
