import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { user as authUserTrigger } from 'firebase-functions/v1/auth';
import { applicationDefault, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  isStrictSingleEmail,
  sanitizeAllowedBugReportPageUrl,
  sanitizeAllowedBugReportScreenshotUrl,
  resolveBugReportRecipient,
  sendOtpEmail,
  sendOrderQrEmail,
  sendPaymentConfirmedEmail,
  sendRecurringChargeSuccessEmail,
  sendRecurringChargeFailedEmail,
  sendSubscriptionCancelledEmail,
  sendBugReportEmail,
  sendPasswordResetEmailTemplate
} from './services/emailService.js';
import { iuctoService, formatPragueDate } from './services/iuctoService.js';
import { evaluateStudentAnswer } from './utils/mathEvaluator.js';
import { sanitizeSvg, escapeHtml, sanitizeHttpUrl } from './utils/svgSanitizer.js';
import {
  MATERIAL_EXPORT_MONTHLY_LIMIT,
  computeMaterialQuotaPeriod,
  canUserViewMaterial,
  buildWatermarkText,
  detectSvgPageCount,
  normalizeMaterialType,
  normalizeMaterialGrade,
} from './utils/materialQuota.js';
import {
  embedWatermarkIntoSvg,
  embedWatermarkIntoPdf,
} from './utils/materialWatermark.js';

console.log('--- SERVER STARTING ---');

process.on('uncaughtException', (err) => {
  console.error('--- FATAL UNCAUGHT EXCEPTION ---', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('--- FATAL UNHANDLED REJECTION ---', reason);
});

process.on('exit', (code) => {
  console.log('--- PROCESS EXIT EVENT WITH CODE:', code);
});

process.on('SIGTERM', () => {
  console.log('--- RECEIVED SIGTERM ---');
});

process.on('SIGINT', () => {
  console.log('--- RECEIVED SIGINT ---');
});

const PORT = Number(process.env.PORT || (process.env.NODE_ENV === 'production' ? 3000 : 3005));
const HOST = process.env.HOST || '127.0.0.1';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isCloudFunction = Boolean(process.env.K_SERVICE || process.env.FUNCTION_NAME || process.env.FUNCTION_TARGET);
const isEmulatorMode = Boolean(
  process.env.FIRESTORE_EMULATOR_HOST ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||
  process.env.FIREBASE_STORAGE_EMULATOR_HOST
);
const isDevToolsEnabled =
  process.env.ALLOW_DEV_TOOLS === 'true' && process.env.NODE_ENV !== 'production';
const isDirectExecution =
  !isCloudFunction &&
  Boolean(process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === path.resolve(__filename).toLowerCase());

// Read Firebase config to get the exact bucket name
let configBucket = 'gen-lang-client-0972842509.firebasestorage.app';
try {
  const configCandidatePaths = [
    path.join(__dirname, 'firebase-applet-config.json'),
    path.join(__dirname, '..', 'firebase-applet-config.json')
  ];
  const foundConfigPath = configCandidatePaths.find((p) => fs.existsSync(p));
  if (foundConfigPath) {
    const config = JSON.parse(fs.readFileSync(foundConfigPath, 'utf8'));
    if (config.storageBucket) {
      configBucket = config.storageBucket;
      console.log('--- FOUND BUCKET IN CONFIG:', configBucket);
    }
  }
} catch (err) {
  console.error('Failed to read firebase-applet-config.json:', err);
}

const FIREBASE_PROJECT_ID = 'gen-lang-client-0972842509';
let hasAdminCredentials = false;

function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    hasAdminCredentials = Boolean(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      isCloudFunction ||
      isEmulatorMode
    );
    return;
  }

  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || configBucket;
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    try {
      initializeApp({
        credential: cert(JSON.parse(serviceAccountJson)),
        projectId: FIREBASE_PROJECT_ID,
        storageBucket
      });
      hasAdminCredentials = true;
      return;
    } catch (err) {
      console.warn('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', err);
    }
  }

  if (isEmulatorMode) {
    initializeApp({
      projectId: FIREBASE_PROJECT_ID,
      storageBucket
    });
    hasAdminCredentials = true;
    return;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS || isCloudFunction) {
    try {
      initializeApp({
        credential: applicationDefault(),
        projectId: FIREBASE_PROJECT_ID,
        storageBucket
      });
      hasAdminCredentials = true;
      return;
    } catch (err) {
      console.warn('Failed to initialize Admin with applicationDefault:', err);
    }
  }

  initializeApp({
    projectId: FIREBASE_PROJECT_ID,
    storageBucket
  });
  hasAdminCredentials = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS || isEmulatorMode);
}

initializeFirebaseAdmin();

const auth = getAuth();
const appInstance = getApps().length > 0 ? getApp() : undefined;
const db = getFirestore(appInstance, 'ai-studio-1fc75345-16e5-4af6-a275-4152ed6176ba');
const storage = getStorage();
const app = express();
app.disable('x-powered-by');
// V Cloud Functions / Cloud Run za Firebase Hosting (Fastly -> GFE -> Cloud Run = 2 důvěryhodné proxy hopy)
// ignoruje Express levé klientem podvržené položky v X-Forwarded-For a req.ip vybere skutečnou IP klienta.
// Na lokálním vývojovém serveru bez reverzní proxy nepoužíváme důvěru v X-Forwarded-For (false).
app.set('trust proxy', isCloudFunction ? 2 : false);

const PROD_CORS_ORIGINS = [
  'https://proeducator.eu',
  'https://www.proeducator.eu',
  'https://gen-lang-client-0972842509.web.app',
  'https://gen-lang-client-0972842509.firebaseapp.com'
];

const DEV_CORS_ORIGINS = [
  'http://localhost:3005',
  'http://127.0.0.1:3005',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

function getAllowedCorsOrigins() {
  const origins = new Set(PROD_CORS_ORIGINS);
  if (process.env.NODE_ENV !== 'production' || isDevToolsEnabled || isEmulatorMode) {
    DEV_CORS_ORIGINS.forEach((o) => origins.add(o));
  }
  const extra = (process.env.APP_ORIGIN || '').trim();
  if (extra && extra !== '*') {
    extra
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((o) => origins.add(o));
  }
  return Array.from(origins);
}

const ALLOWED_CORS_ORIGIN_SET = new Set(getAllowedCorsOrigins());
const SUBSCRIPTION_GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 3 dny ochranné lhůty
const VALID_ROLES = new Set(['free', 'student', 'premium', 'course', 'teacher']);

function getPragueDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

const DEFAULT_MAP_MAX_ENTRIES = 5000;

function setBoundedMapEntry(map, key, value, maxEntries = DEFAULT_MAP_MAX_ENTRIES) {
  if (map.has(key)) {
    map.delete(key);
  }
  map.set(key, value);
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

function getClientIp(req) {
  // SEC-09: Nikdy nečteme nejlevější položku X-Forwarded-For (útočník ji může libovolně podvrhnout).
  // Používáme Express req.ip kalibrované přes app.set('trust proxy', isCloudFunction ? 2 : false).
  if (typeof req?.ip === 'string' && req.ip.trim()) {
    return req.ip.trim();
  }
  if (typeof req?.socket?.remoteAddress === 'string' && req.socket.remoteAddress.trim()) {
    return req.socket.remoteAddress.trim();
  }
  return 'unknown';
}

function isLoopbackRequest(req) {
  // SEC-38: Kontrolujeme přímo socket.remoteAddress (bez spoléhání na proxy hlavičky)
  const remoteAddress = String(req?.socket?.remoteAddress || '').trim();
  return (
    remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === '::ffff:127.0.0.1'
  );
}

function createRateLimiter({
  windowMs,
  max,
  keyFn,
  message = 'Příliš mnoho požadavků. Zkuste to za chvíli.',
  maxEntries = DEFAULT_MAP_MAX_ENTRIES,
}) {
  const buckets = new Map();
  let lastPrune = Date.now();
  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    if (now - lastPrune > windowMs || buckets.size >= maxEntries) {
      for (const [k, entry] of buckets.entries()) {
        if (entry.resetAt <= now) buckets.delete(k);
      }
      lastPrune = now;
    }

    const key = String(keyFn ? keyFn(req) : getClientIp(req));
    let entry = buckets.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
    }
    entry.count += 1;
    setBoundedMapEntry(buckets, key, entry, maxEntries);

    if (entry.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: message });
    }
    return next();
  };
}

const distributedRateLimitFallbackMap = new Map();

function checkInMemoryFallbackRateLimit(key, windowMs, max) {
  const now = Date.now();
  let entry = distributedRateLimitFallbackMap.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
  }
  if (entry.count >= max) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    setBoundedMapEntry(distributedRateLimitFallbackMap, key, entry, DEFAULT_MAP_MAX_ENTRIES);
    return { allowed: false, remaining: 0, retryAfterSec, count: entry.count, resetAt: entry.resetAt };
  }
  entry.count += 1;
  setBoundedMapEntry(distributedRateLimitFallbackMap, key, entry, DEFAULT_MAP_MAX_ENTRIES);
  return {
    allowed: true,
    remaining: Math.max(0, max - entry.count),
    retryAfterSec: 0,
    count: entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * SEC-09: Distribuovaný rate-limiter sdílený napříč instancemi Cloud Functions přes server-only kolekci rateLimits.
 * Při výpadku Firestore se bezpečně přepne na omezený paměťový fallback.
 */
async function checkDistributedRateLimit({ key, windowMs, max }) {
  const now = Date.now();
  const normalizedKey = String(key || 'unknown');
  const docId = crypto.createHash('sha256').update(normalizedKey).digest('hex');
  const ref = db.collection('rateLimits').doc(docId);

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() || {} : null;
      const isWindowActive = Boolean(data && typeof data.resetAt === 'number' && data.resetAt > now);
      const resetAt = isWindowActive ? data.resetAt : now + windowMs;
      const currentCount = isWindowActive ? Number(data.count || 0) : 0;

      if (currentCount >= max) {
        const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));
        return {
          allowed: false,
          remaining: 0,
          retryAfterSec,
          count: currentCount,
          resetAt,
        };
      }

      const nextCount = currentCount + 1;
      tx.set(ref, {
        keyHash: docId,
        count: nextCount,
        resetAt,
        expiresAt: Timestamp.fromMillis(resetAt + 60 * 60 * 1000),
        updatedAt: Timestamp.now(),
      });

      return {
        allowed: true,
        remaining: Math.max(0, max - nextCount),
        retryAfterSec: 0,
        count: nextCount,
        resetAt,
      };
    });
  } catch (err) {
    console.warn(`[DistributedRateLimit fallback] (${normalizedKey.slice(0, 40)}):`, err?.message || err);
    return checkInMemoryFallbackRateLimit(normalizedKey, windowMs, max);
  }
}

/**
 * SEC-32: CDN hlavičky pro veřejné read-only katalogy (anonymní provoz cachovatelný na Fastly CDN,
 * přihlášené požadavky s Authorization hlavičkou vždy private, no-store).
 */
function setPublicCatalogCacheHeaders(req, res) {
  const existingVary = String(res.getHeader('Vary') || '').trim();
  if (!existingVary) {
    res.setHeader('Vary', 'Authorization');
  } else if (!existingVary.toLowerCase().includes('authorization')) {
    res.setHeader('Vary', `${existingVary}, Authorization`);
  }
  if (!req.headers.authorization) {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=60');
  } else {
    res.setHeader('Cache-Control', 'private, no-store');
  }
}

function parseIsoMillis(val) {
  if (!val) return null;
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val?.toDate === 'function') {
    const d = val.toDate();
    return Number.isFinite(d?.getTime?.()) ? d.getTime() : null;
  }
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    return val.seconds * 1000;
  }
  const ms = new Date(val).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function serializeTimestampFields(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (typeof obj.toDate === 'function') {
    return obj.toDate().toISOString();
  }
  if (Array.isArray(obj)) {
    return obj.map(serializeTimestampFields);
  }
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && typeof v.toDate === 'function') {
      out[k] = v.toDate().toISOString();
    } else if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.seconds === 'number' && Object.keys(v).length <= 2) {
      out[k] = new Date(v.seconds * 1000).toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

function normalizeEnrolledCourseIds(userDoc) {
  const list = Array.isArray(userDoc?.enrolledCourseIds)
    ? userDoc.enrolledCourseIds
        .filter((id) => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
    : [];
  const legacyCourseId =
    typeof userDoc?.courseId === 'string' && userDoc.courseId.trim()
      ? userDoc.courseId.trim()
      : null;
  if (legacyCourseId && !list.includes(legacyCourseId)) {
    list.push(legacyCourseId);
  }
  return Array.from(new Set(list)).slice(0, 50);
}

function computeEffectiveUserState(userDoc, nowMs = Date.now()) {
  const enrolledCourseIds = normalizeEnrolledCourseIds(userDoc);
  const fallbackRole = enrolledCourseIds.length > 0 ? 'course' : 'free';
  const rawRole = VALID_ROLES.has(userDoc?.role) ? userDoc.role : fallbackRole;
  const rawStatus = String(userDoc?.subscriptionStatus || 'inactive');
  const periodEndRaw = userDoc?.subscriptionPeriodEnd ?? userDoc?.subscriptionExpiresAt ?? null;
  const periodEndMs = parseIsoMillis(periodEndRaw);
  const periodEndIso = periodEndMs !== null ? new Date(periodEndMs).toISOString() : null;

  let role = rawRole;
  let subscriptionStatus = rawStatus;
  let subscriptionGraceUntil = userDoc?.subscriptionGraceUntil || null;
  let downgraded = false;
  let updates = null;

  if (rawRole === 'premium' && periodEndMs !== null && nowMs > periodEndMs) {
    if (rawStatus === 'cancelled_at_period_end') {
      role = fallbackRole;
      subscriptionStatus = 'inactive';
      downgraded = true;
      updates = {
        role: fallbackRole,
        subscriptionStatus: 'inactive',
        subscriptionPeriodEnd: periodEndIso,
        subscriptionExpiredAt: new Date(nowMs).toISOString(),
        initRecurringTransId: FieldValue.delete(),
        recurringCancelled: true,
        recurringCancelledAt: userDoc?.subscriptionCancelledAt || new Date(nowMs).toISOString()
      };
    } else if (rawStatus === 'active') {
      const graceUntilMs = periodEndMs + SUBSCRIPTION_GRACE_MS;
      const graceUntilIso = new Date(graceUntilMs).toISOString();
      if (nowMs > graceUntilMs) {
        role = fallbackRole;
        subscriptionStatus = 'inactive';
        subscriptionGraceUntil = null;
        downgraded = true;
        updates = {
          role: fallbackRole,
          subscriptionStatus: 'inactive',
          subscriptionPeriodEnd: periodEndIso,
          subscriptionGraceUntil: FieldValue.delete(),
          subscriptionExpiredAt: new Date(nowMs).toISOString(),
          initRecurringTransId: FieldValue.delete(),
          recurringCancelled: true,
          recurringCancelledAt: new Date(nowMs).toISOString()
        };
      } else {
        subscriptionGraceUntil = graceUntilIso;
        if (userDoc?.subscriptionGraceUntil !== graceUntilIso) {
          updates = {
            subscriptionGraceUntil: graceUntilIso,
            subscriptionPeriodEnd: periodEndIso
          };
        }
      }
    }
  } else if (rawRole === 'premium' && (periodEndMs === null || nowMs <= periodEndMs) && (rawStatus === 'inactive' || rawStatus === 'expired')) {
    // Pokud má uživatel v databázi roli 'premium' a datum expirace v budoucnu nebo neomezené,
    // ale status je chybně/historicky 'inactive' nebo 'expired', napravíme stav na aktivní.
    subscriptionStatus = userDoc?.subscriptionCancelledAt && periodEndMs !== null ? 'cancelled_at_period_end' : 'active';
    updates = {
      ...(updates || {}),
      subscriptionStatus,
      subscriptionExpiredAt: FieldValue.delete()
    };
  }

  if (role === 'course' && enrolledCourseIds.length === 0) {
    role = 'free';
    downgraded = true;
    updates = {
      ...(updates || {}),
      role: 'free'
    };
  }

  return {
    role,
    enrolledCourseIds,
    isPremium: role === 'premium' || (role === 'course' && enrolledCourseIds.length > 0) || role === 'teacher',
    subscriptionStatus,
    subscriptionPeriodEnd: periodEndIso,
    subscriptionGraceUntil,
    periodEndMs,
    downgraded,
    updates
  };
}

async function syncCustomClaimsIfNeeded(uid, role, enrolledCourseIds, currentClaims = null) {
  try {
    let existing = currentClaims;
    if (!existing) {
      const rec = await auth.getUser(uid);
      existing = rec.customClaims || {};
    }
    const cleanRole = VALID_ROLES.has(role) ? role : 'free';
    const cleanCourses = Array.isArray(enrolledCourseIds)
      ? Array.from(new Set(enrolledCourseIds.filter((c) => typeof c === 'string' && c.trim())))
      : [];

    const existingCourses = Array.isArray(existing.enrolledCourseIds) ? existing.enrolledCourseIds : [];
    const sameRole = existing.role === cleanRole;
    const sameCourses =
      existingCourses.length === cleanCourses.length &&
      cleanCourses.every((c, idx) => existingCourses[idx] === c);

    if (sameRole && sameCourses) {
      return false;
    }

    await auth.setCustomUserClaims(uid, {
      ...existing,
      role: cleanRole,
      enrolledCourseIds: cleanCourses
    });
    return true;
  } catch (err) {
    console.warn(`[CustomClaims Sync Warning] UID ${uid}:`, err?.message || err);
    return false;
  }
}

const ROLE_PRIVILEGE_RANK = {
  student: 0,
  free: 0,
  premium: 1,
  course: 2,
  teacher: 3
};

// SEC-11: Bezpečné zneplatnění refresh tokenů při odebrání oprávnění / refundu / odebrání kurzu / smazání účtu
async function revokeUserTokensSafe(uid, reason = 'privilege-change') {
  if (!uid) return false;
  try {
    await auth.revokeRefreshTokens(uid);
    return true;
  } catch (err) {
    if (err?.code === 'auth/user-not-found') {
      return false;
    }
    console.warn(`[RevokeRefreshTokens Warning] UID ${uid} (${reason}):`, err?.code || err?.message || err);
    return false;
  }
}

const STANDARD_BODY_LIMIT_BYTES = 2 * 1024 * 1024; // 2 MiB
const MATERIAL_UPLOAD_BODY_LIMIT_BYTES = 30 * 1024 * 1024; // 30 MiB

function isMaterialUploadRoute(req) {
  const pathname = String(req.path || '').split('?')[0];
  return (
    (req.method === 'POST' && pathname === '/api/materials/upload') ||
    (req.method === 'PUT' && /^\/api\/materials\/[^/]+$/.test(pathname))
  );
}

let serverInitialized = false;
function setupExpressApp() {
  if (serverInitialized) return;
  serverInitialized = true;

  // Normalizace URL pouze v prostředí Cloud Functions (před velikostním guardem i JSON parsery)
  if (isCloudFunction) {
    app.use((req, _res, next) => {
      if (req.url !== '/health' && req.url !== '/api' && !req.url.startsWith('/api/')) {
        req.url = '/api' + (req.url.startsWith('/') ? req.url : `/${req.url}`);
      }
      next();
    });
  }

  // SEC-14: Ranní guard velikosti těla (chrání i před předparsovaným req.rawBody v Cloud Functions v2
  // a blokuje neautentizované >2 MB upload požadavky dříve, než se parsuje 30 MB JSON)
  app.use((req, res, next) => {
    const contentLengthHeader = Number(req.headers['content-length']);
    const contentLength = Number.isFinite(contentLengthHeader) && contentLengthHeader > 0 ? contentLengthHeader : 0;
    const rawBodyLen = Buffer.isBuffer(req.rawBody) ? req.rawBody.length : 0;
    const payloadBytes = Math.max(contentLength, rawBodyLen);

    if (!isMaterialUploadRoute(req)) {
      if (payloadBytes > STANDARD_BODY_LIMIT_BYTES) {
        return res.status(413).json({ error: 'Požadavek je příliš velký (max 2 MB).' });
      }
      return next();
    }

    if (payloadBytes > MATERIAL_UPLOAD_BODY_LIMIT_BYTES) {
      return res.status(413).json({ error: 'Nahrávaný požadavek je příliš velký (max 30 MB).' });
    }
    if (payloadBytes > STANDARD_BODY_LIMIT_BYTES) {
      const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization.trim() : '';
      if (!authHeader.startsWith('Bearer ') || authHeader.length <= 7) {
        return res.status(401).json({ error: 'Pro nahrání velkého souboru je vyžadováno přihlášení.' });
      }
    }
    return next();
  });

  const standardJsonParser = express.json({ limit: '2mb' });
  const materialUploadJsonParser = express.json({ limit: '30mb' });
  app.use((req, res, next) => {
    if (isMaterialUploadRoute(req)) {
      return materialUploadJsonParser(req, res, next);
    }
    return standardJsonParser(req, res, next);
  });
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Bezpečnostní hlavičky + explicitní CORS allowlist
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin.length > 0) {
      if (!ALLOWED_CORS_ORIGIN_SET.has(origin)) {
        if (req.method === 'OPTIONS' || req.path.startsWith('/api')) {
          return res.status(403).json({ error: 'Origin není povolen.' });
        }
      } else {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Expose-Headers', 'X-Watermark-Text, X-Quota-Remaining, X-Quota-Limit');
      }
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    return next();
  });
}

setupExpressApp();

const USER_ROLE_CACHE_TTL_MS = 5_000;
const userRoleCache = new Map(); // uid -> { role, enrolledCourseIds, isPremium, email, periodEndMs, expiresAt }

async function resolveUserState(uid) {
  const cached = userRoleCache.get(uid);
  const nowMs = Date.now();
  if (cached && cached.expiresAt > nowMs) {
    const expiredCached =
      cached.role === 'premium' &&
      cached.periodEndMs !== null &&
      nowMs > (cached.subscriptionStatus === 'active' ? cached.periodEndMs + SUBSCRIPTION_GRACE_MS : cached.periodEndMs);
    if (!expiredCached) {
      return cached;
    }
    userRoleCache.delete(uid);
  }

  const uRef = db.collection('users').doc(uid);
  const uSnap = await uRef.get();
  if (!uSnap.exists) {
    return null;
  }

  const uData = uSnap.data() || {};
  const computed = computeEffectiveUserState(uData, nowMs);

  if (computed.updates) {
    await uRef.set(computed.updates, { merge: true }).catch((err) => {
      console.warn(`[resolveUserState] Nepodařilo se zapsat aktualizaci expirace pro ${uid}:`, err?.message || err);
    });
  }
  if (computed.downgraded) {
    await syncCustomClaimsIfNeeded(uid, computed.role, computed.enrolledCourseIds);
    await revokeUserTokensSafe(uid, 'subscription-expired-lazy');
  }

  const state = {
    uid,
    email: uData.email || '',
    role: computed.role,
    enrolledCourseIds: computed.enrolledCourseIds,
    isPremium: computed.isPremium,
    subscriptionStatus: computed.subscriptionStatus,
    periodEndMs: computed.periodEndMs,
    expiresAt: nowMs + USER_ROLE_CACHE_TTL_MS
  };
  setBoundedMapEntry(userRoleCache, uid, state, DEFAULT_MAP_MAX_ENTRIES);
  return state;
}

async function resolveUserRole(uid) {
  const state = await resolveUserState(uid);
  return state?.role || 'free';
}

async function verifyBearerToken(req) {
  const authorizationHeader = req.headers.authorization || '';
  const token = authorizationHeader.startsWith('Bearer ') ? authorizationHeader.slice(7).trim() : '';
  if (!token) {
    return { missing: true, decodedToken: null };
  }
  const checkRevoked = !isEmulatorMode;
  const decodedToken = await auth.verifyIdToken(token, checkRevoked);
  return { missing: false, decodedToken };
}

async function requireVerifiedToken(req, res, next) {
  try {
    const { missing, decodedToken } = await verifyBearerToken(req);
    if (missing || !decodedToken?.uid) {
      return res.status(401).json({ error: 'Chybí nebo je neplatný přihlašovací token.' });
    }
    req.decodedToken = decodedToken;
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || ''
    };
    return next();
  } catch (error) {
    console.warn('requireVerifiedToken error:', error?.code || error?.message || 'Verification failed');
    return res.status(401).json({ error: 'Přihlášení vypršelo nebo je neplatné. Přihlaste se prosím znovu.' });
  }
}

async function requireAuth(req, res, next) {
  try {
    const { missing, decodedToken } = await verifyBearerToken(req);
    if (missing || !decodedToken?.uid) {
      return res.status(401).json({ error: 'Chybí přihlašovací token.' });
    }

    const state = await resolveUserState(decodedToken.uid);
    if (!state) {
      return res.status(403).json({ error: 'Uživatelský profil nebyl nalezen. Dokončete prosím přihlášení.' });
    }

    req.decodedToken = decodedToken;
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || state.email || '',
      role: state.role,
      enrolledCourseIds: state.enrolledCourseIds,
      isPremium: state.isPremium
    };

    return next();
  } catch (error) {
    console.warn('requireAuth error:', error?.code || error?.message || 'Token verification failed');
    return res.status(401).json({ error: 'Přihlášení vypršelo nebo je neplatné. Přihlaste se prosím znovu.' });
  }
}

async function optionalAuth(req, res, next) {
  try {
    const authorizationHeader = req.headers.authorization || '';
    if (!authorizationHeader) {
      req.user = null;
      return next();
    }
    const { missing, decodedToken } = await verifyBearerToken(req);
    if (missing) {
      req.user = null;
      return next();
    }
    if (!decodedToken?.uid) {
      return res.status(401).json({ error: 'Neplatný přihlašovací token.' });
    }

    const state = await resolveUserState(decodedToken.uid);
    if (!state) {
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email || '',
        role: 'free',
        enrolledCourseIds: [],
        isPremium: false
      };
      return next();
    }

    req.decodedToken = decodedToken;
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || state.email || '',
      role: state.role,
      enrolledCourseIds: state.enrolledCourseIds,
      isPremium: state.isPremium
    };
    return next();
  } catch (error) {
    console.warn('optionalAuth error:', error?.code || error?.message || 'Invalid token');
    return res.status(401).json({ error: 'Přihlášení vypršelo nebo je neplatné.' });
  }
}

function requireTeacher(req, res, next) {
  if (req.user?.role !== 'teacher') {
    return res.status(403).json({ error: 'Tato akce je dostupná jen učiteli.' });
  }
  return next();
}

function requirePremiumOrTeacher(req, res, next) {
  const role = req.user?.role;
  const hasActiveCourse =
    role === 'course' &&
    Array.isArray(req.user?.enrolledCourseIds) &&
    req.user.enrolledCourseIds.length > 0;
  if (role !== 'premium' && !hasActiveCourse && role !== 'teacher') {
    return res.status(403).json({ error: 'Tento obsah vyžaduje předplatné ProEducator Premium nebo aktivní kurz.' });
  }
  return next();
}

// SEC-08: Ochrana citlivých akcí proti neověřeným password-provider účtům (přímý bypass OTP přes Identity Toolkit)
function isUnverifiedPasswordCaller(req) {
  if (req.user?.role === 'teacher') return false;
  const signInProvider = req.decodedToken?.firebase?.sign_in_provider;
  return signInProvider === 'password' && req.decodedToken?.email_verified !== true;
}

function requireVerifiedEmailForPasswordAuth(req, res, next) {
  if (isUnverifiedPasswordCaller(req)) {
    return res.status(403).json({ error: 'Pro tuto akci prosím nejprve ověřte svůj e-mail.' });
  }
  return next();
}

app.get(['/health', '/api/health'], (_req, res) => {
  res.json({ ok: true });
});

app.get(['/api', '/api/'], (_req, res) => {
  res.json({ ok: true, message: 'ProEdu API is running' });
});

// SEC-34: Omezuje interní platební / účetní identifikátory v klientském profilu ze session-bootstrap
function sanitizeUserProfileForClient(rawProfile) {
  const serialized = serializeTimestampFields(rawProfile || {});
  const {
    initRecurringTransId,
    iuctoCustomerId: _iuctoCustomerId,
    recurringChargeLockUntil: _recurringChargeLockUntil,
    recurringChargeLockOwner: _recurringChargeLockOwner,
    ...publicProfile
  } = serialized;
  return {
    ...publicProfile,
    hasRecurringPaymentMethod: Boolean(
      typeof initRecurringTransId === 'string' && initRecurringTransId.trim()
    ),
  };
}

// Session bootstrap: vytvoří chybějící profil, vynutí expiraci a synchronizuje custom claims
app.post('/api/auth/session-bootstrap', requireVerifiedToken, async (req, res) => {
  try {
    const uid = req.decodedToken.uid;
    const authRecord = await auth.getUser(uid);
    const userRef = db.collection('users').doc(uid);
    const todayPrague = getPragueDateString();

    const bootstrapResult = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) {
        // SEC-08: Nový účet přihlášený heslem bez ověřeného e-mailu nesmí obejít 6místné OTP registrace
        if (
          req.decodedToken?.firebase?.sign_in_provider === 'password' &&
          req.decodedToken?.email_verified !== true
        ) {
          return {
            rejected: true,
            status: 403,
            error: 'Před vytvořením účtu prosím ověřte svůj e-mail.'
          };
        }

        const claimRole = authRecord.customClaims?.role || req.decodedToken.role;
        const initialRole = claimRole === 'teacher' ? 'teacher' : 'free';
        const displayName =
          authRecord.displayName || req.decodedToken.name || 'Student';
        const emailLower = String(
          authRecord.email || req.decodedToken.email || ''
        )
          .toLowerCase()
          .trim();

        const createdProfile = {
          uid,
          email: emailLower,
          displayName,
          name: displayName,
          role: initialRole,
          jokers: 10,
          dailyVideosWatched: 0,
          streak: 0,
          enrolledCourseIds: [],
          referralCode: uid.slice(0, 8).toUpperCase(),
          referralsCount: 0,
          lastDailyGrantDate: todayPrague,
          lastJokerResetDate: todayPrague,
          lastViewedActivityAt: Timestamp.now(),
          emailVerified: Boolean(authRecord.emailVerified || req.decodedToken.email_verified),
          createdAt: Timestamp.now()
        };
        tx.set(userRef, createdProfile);
        return {
          profile: createdProfile,
          effectiveRole: initialRole,
          enrolledCourseIds: []
        };
      }

      const existingData = snap.data() || {};
      const computed = computeEffectiveUserState(existingData, Date.now());
      const mergedUpdates = {
        ...(computed.updates || {}),
        ...(existingData.enrolledCourseIds === undefined
          ? { enrolledCourseIds: computed.enrolledCourseIds }
          : {})
      };

      if (Object.keys(mergedUpdates).length > 0) {
        tx.set(userRef, mergedUpdates, { merge: true });
      }

      return {
        profile: {
          ...existingData,
          ...mergedUpdates,
          uid,
          role: computed.role,
          enrolledCourseIds: computed.enrolledCourseIds,
          subscriptionStatus: computed.subscriptionStatus,
          ...(computed.subscriptionPeriodEnd
            ? { subscriptionPeriodEnd: computed.subscriptionPeriodEnd }
            : {}),
          ...(computed.subscriptionGraceUntil
            ? { subscriptionGraceUntil: computed.subscriptionGraceUntil }
            : {})
        },
        effectiveRole: computed.role,
        enrolledCourseIds: computed.enrolledCourseIds
      };
    });

    if (bootstrapResult.rejected) {
      return res.status(bootstrapResult.status).json({ error: bootstrapResult.error });
    }

    const claimsUpdated = await syncCustomClaimsIfNeeded(
      uid,
      bootstrapResult.effectiveRole,
      bootstrapResult.enrolledCourseIds,
      authRecord.customClaims
    );
    userRoleCache.delete(uid);

    return res.json({
      ok: true,
      profile: sanitizeUserProfileForClient(bootstrapResult.profile),
      claimsUpdated
    });
  } catch (err) {
    console.error('[Session Bootstrap Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se inicializovat uživatelskou relaci.' });
  }
});

// =========================================================================
// --- REGISTRACE S 6MÍSTNÝM OTP KÓDEM (PRE-AUTH OVĚŘENÍ) ---
// =========================================================================

const DEV_EPHEMERAL_REGISTRATION_SECRET = crypto.randomBytes(32).toString('hex');

function getRegistrationSecret() {
  const configured = (process.env.REGISTRATION_ENCRYPTION_SECRET || '').trim();
  if (configured.length >= 16) {
    return configured;
  }
  if (process.env.NODE_ENV === 'production' && !isEmulatorMode) {
    throw new Error('REGISTRATION_ENCRYPTION_SECRET není bezpečně nakonfigurováno.');
  }
  return DEV_EPHEMERAL_REGISTRATION_SECRET;
}

// SEC-37: Doménově oddělené odvození záložních tajných klíčů přes HMAC-SHA256
function deriveDomainSeparatedSecret(baseSecret, domain) {
  return crypto.createHmac('sha256', String(baseSecret)).update(String(domain)).digest('hex');
}

const registerInitLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `reg-init:${getClientIp(req)}`,
  message: 'Příliš mnoho pokusů o registraci. Zkuste to prosím za několik minut.'
});

const registerResendLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `reg-resend:${getClientIp(req)}`,
  message: 'Příliš mnoho žádostí o opětovné zaslání kódu.'
});

const registerConfirmLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyFn: (req) => `reg-confirm:${getClientIp(req)}`,
  message: 'Příliš mnoho pokusů o ověření kódu.'
});

const passwordResetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `pwd-reset:${getClientIp(req)}`,
  message: 'Příliš mnoho žádostí o obnovení hesla. Zkuste to prosím za několik minut.'
});

function hashEmailKey(email) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function hashOtpCode(code, salt) {
  return crypto.createHash('sha256').update(`${String(code).trim()}:${salt}`).digest('hex');
}

function safeHexEqual(hexA, hexB) {
  if (typeof hexA !== 'string' || typeof hexB !== 'string' || hexA.length !== hexB.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(hexA, 'hex'), Buffer.from(hexB, 'hex'));
}

function encryptPassword(password) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(getRegistrationSecret()).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptPassword(payload) {
  const [ivHex, authTagHex, encrypted] = String(payload || '').split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = crypto.createHash('sha256').update(getRegistrationSecret()).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function checkAuthUserExists(email) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedEmail) return false;

  try {
    const existing = await auth.getUserByEmail(normalizedEmail);
    if (existing) return true;
  } catch (err) {
    if (err.code !== 'auth/user-not-found' && !err.message?.includes('no user record')) {
      console.warn('[checkAuthUserExists Auth notice]:', err?.code || err?.message || err);
    }
  }

  const snap = await db.collection('users').where('email', '==', normalizedEmail).limit(1).get();
  return !snap.empty;
}

async function createAuthUser({ email, password, displayName }) {
  const rec = await auth.createUser({
    email,
    password,
    displayName,
    emailVerified: true
  });
  return {
    uid: rec.uid,
    email: rec.email,
    displayName: rec.displayName || displayName
  };
}

// 1. Zahájení registrace: validace údajů, vygenerování 6místného kódu a odeslání e-mailu
app.post('/api/auth/register-init', registerInitLimiter, async (req, res) => {
  try {
    const { email, password, confirmPassword, name } = req.body || {};
    const safeEmail = String(email || '').toLowerCase().trim();
    const safeName = String(name || '').trim();
    const safePassword = String(password || '');
    const safeConfirmPassword = confirmPassword !== undefined ? String(confirmPassword || '') : null;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!safeEmail || !emailRegex.test(safeEmail) || safeEmail.length > 256) {
      return res.status(400).json({ error: 'Zadejte prosím platnou e-mailovou adresu.' });
    }
    if (!safeName || safeName.length < 2 || safeName.length > 128) {
      return res.status(400).json({ error: 'Zadejte prosím své jméno a příjmení (alespoň 2 znaky).' });
    }
    if (!safePassword || safePassword.length < 6 || safePassword.length > 128) {
      return res.status(400).json({ error: 'Heslo musí mít alespoň 6 znaků.' });
    }
    if (safeConfirmPassword !== null && safePassword !== safeConfirmPassword) {
      return res.status(400).json({ error: 'Zadaná hesla se neshodují. Zkontrolujte prosím obě hesla.' });
    }

    const emailKey = hashEmailKey(safeEmail);

    // SEC-09: Distribuovaný IP limit + per-email 60s cooldown napříč instancemi
    const [ipRate, emailCooldown] = await Promise.all([
      checkDistributedRateLimit({
        key: `reg-init-ip:${getClientIp(req)}`,
        windowMs: 15 * 60 * 1000,
        max: 10,
      }),
      checkDistributedRateLimit({
        key: `reg-init-email:${emailKey}`,
        windowMs: 60 * 1000,
        max: 1,
      }),
    ]);
    if (!ipRate.allowed) {
      res.setHeader('Retry-After', String(ipRate.retryAfterSec));
      return res.status(429).json({ error: 'Příliš mnoho pokusů o registraci. Zkuste to prosím za několik minut.' });
    }
    if (!emailCooldown.allowed) {
      res.setHeader('Retry-After', String(emailCooldown.retryAfterSec));
      return res.status(429).json({
        error: `Ověřovací kód byl nedávno odeslán. Další pokus za ${emailCooldown.retryAfterSec} sekund.`,
      });
    }

    const pendingRef = db.collection('pendingRegistrations').doc(emailKey);
    const existingPendingSnap = await pendingRef.get();
    if (existingPendingSnap.exists) {
      const existingPending = existingPendingSnap.data() || {};
      const elapsed = Date.now() - (existingPending.lastSentAt || 0);
      if (elapsed < 60000 && existingPending.expiresAt > Date.now()) {
        const waitSeconds = Math.ceil((60000 - elapsed) / 1000);
        return res.status(429).json({ error: `Ověřovací kód byl nedávno odeslán. Další pokus za ${waitSeconds} sekund.` });
      }
    }

    const isAlreadyRegistered = await checkAuthUserExists(safeEmail);
    if (isAlreadyRegistered) {
      return res.status(409).json({ error: 'Účet s tímto e-mailem již existuje. Přihlaste se prosím.' });
    }

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const salt = crypto.randomBytes(16).toString('hex');
    const codeHash = hashOtpCode(otpCode, salt);
    const encryptedPassword = encryptPassword(safePassword);
    const now = Date.now();
    const expiresAt = now + 15 * 60 * 1000;

    const pendingData = {
      email: safeEmail,
      name: safeName,
      encryptedPassword,
      codeHash,
      salt,
      attempts: 0,
      createdAt: now,
      lastSentAt: now,
      expiresAt
    };

    await pendingRef.set(pendingData);

    const emailRes = await sendOtpEmail({
      to: safeEmail,
      name: safeName,
      code: otpCode
    });

    if (!emailRes.success) {
      await pendingRef.delete().catch(() => {});
      return res.status(502).json({ error: 'Nepodařilo se odeslat ověřovací e-mail. Zkuste to prosím znovu.' });
    }

    const isEmulatorOrDev = isDevToolsEnabled || Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
    if (emailRes.simulated && process.env.NODE_ENV === 'production' && !isEmulatorOrDev) {
      await pendingRef.delete().catch(() => {});
      return res.status(503).json({ error: 'E-mailová služba není v produkci dostupná.' });
    }

    return res.json({
      success: true,
      email: safeEmail,
      expiresInMinutes: 15,
      message: 'Ověřovací kód byl úspěšně odeslán na váš e-mail.'
    });
  } catch (err) {
    console.error('Chyba při zahájení registrace:', err);
    return res.status(500).json({ error: 'Nepodařilo se zahájit registraci.' });
  }
});

// 2. Znovuzaslání ověřovacího kódu (s 60s cooldownem)
app.post('/api/auth/register-resend', registerResendLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    const safeEmail = String(email || '').toLowerCase().trim();
    if (!safeEmail || safeEmail.length > 256) {
      return res.status(400).json({ error: 'Chybí platná e-mailová adresa.' });
    }

    const emailKey = hashEmailKey(safeEmail);

    // SEC-09: Distribuovaný IP limit + per-email 60s cooldown napříč instancemi
    const [ipRate, emailCooldown] = await Promise.all([
      checkDistributedRateLimit({
        key: `reg-resend-ip:${getClientIp(req)}`,
        windowMs: 15 * 60 * 1000,
        max: 10,
      }),
      checkDistributedRateLimit({
        key: `reg-resend-email:${emailKey}`,
        windowMs: 60 * 1000,
        max: 1,
      }),
    ]);
    if (!ipRate.allowed) {
      res.setHeader('Retry-After', String(ipRate.retryAfterSec));
      return res.status(429).json({ error: 'Příliš mnoho žádostí o opětovné zaslání kódu.' });
    }
    if (!emailCooldown.allowed) {
      res.setHeader('Retry-After', String(emailCooldown.retryAfterSec));
      return res.status(429).json({
        error: `Nový kód lze odeslat za ${emailCooldown.retryAfterSec} sekund.`,
      });
    }

    const pendingRef = db.collection('pendingRegistrations').doc(emailKey);

    const txResult = await db.runTransaction(async (tx) => {
      const snap = await tx.get(pendingRef);
      if (!snap.exists) {
        return { errorStatus: 400, errorMsg: 'Platnost žádosti vypršela nebo nebyla nalezena. Zaregistrujte se prosím znovu.' };
      }
      const pending = snap.data() || {};
      const now = Date.now();
      if (!pending.expiresAt || pending.expiresAt < now) {
        tx.delete(pendingRef);
        return { errorStatus: 400, errorMsg: 'Platnost žádosti vypršela. Zaregistrujte se prosím znovu.' };
      }

      const elapsed = now - (pending.lastSentAt || 0);
      if (elapsed < 60000) {
        const waitSeconds = Math.ceil((60000 - elapsed) / 1000);
        return { errorStatus: 429, errorMsg: `Nový kód lze odeslat za ${waitSeconds} sekund.` };
      }

      const newCode = crypto.randomInt(100000, 1000000).toString();
      const newSalt = crypto.randomBytes(16).toString('hex');
      const updates = {
        codeHash: hashOtpCode(newCode, newSalt),
        salt: newSalt,
        lastSentAt: now,
        expiresAt: now + 15 * 60 * 1000
      };
      tx.set(pendingRef, updates, { merge: true });
      return { ok: true, name: pending.name, newCode };
    });

    if (!txResult.ok) {
      return res.status(txResult.errorStatus).json({ error: txResult.errorMsg });
    }

    const emailRes = await sendOtpEmail({
      to: safeEmail,
      name: txResult.name,
      code: txResult.newCode
    });

    if (!emailRes.success) {
      return res.status(502).json({ error: 'Nepodařilo se znovu odeslat ověřovací e-mail.' });
    }

    const isEmulatorOrDev = isDevToolsEnabled || Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);
    if (emailRes.simulated && process.env.NODE_ENV === 'production' && !isEmulatorOrDev) {
      return res.status(503).json({ error: 'E-mailová služba není v produkci dostupná.' });
    }

    return res.json({
      success: true,
      message: 'Nový ověřovací kód byl odeslán na váš e-mail.'
    });
  } catch (err) {
    console.error('Chyba při znovuzaslání kódu:', err);
    return res.status(500).json({ error: 'Nepodařilo se znovu odeslat kód.' });
  }
});

// 3. Dokončení registrace: atomické ověření 6místného kódu a založení účtu ve Firebase Auth
app.post('/api/auth/register-confirm', registerConfirmLimiter, async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const safeEmail = String(email || '').toLowerCase().trim();
    const safeCode = String(code || '').trim();

    if (!safeEmail || !/^\d{6}$/.test(safeCode)) {
      return res.status(400).json({ error: 'Zadejte platný e-mail a 6místný ověřovací kód.' });
    }

    const emailKey = hashEmailKey(safeEmail);
    const pendingRef = db.collection('pendingRegistrations').doc(emailKey);

    const verifyResult = await db.runTransaction(async (tx) => {
      const snap = await tx.get(pendingRef);
      if (!snap.exists) {
        return { ok: false, status: 400, error: 'Platnost ověřovacího kódu vypršela nebo registrace nebyla nalezena. Zaregistrujte se prosím znovu.' };
      }
      const pending = snap.data() || {};
      const now = Date.now();
      if (!pending.expiresAt || pending.expiresAt < now) {
        tx.delete(pendingRef);
        return { ok: false, status: 400, error: 'Platnost ověřovacího kódu vypršela. Zaregistrujte se prosím znovu.' };
      }

      const currentAttempts = Number(pending.attempts || 0);
      if (currentAttempts >= 5) {
        tx.delete(pendingRef);
        return { ok: false, status: 429, error: 'Byl překročen maximální počet neúspěšných pokusů (5). Zaregistrujte se prosím znovu od začátku.' };
      }

      const computedHash = hashOtpCode(safeCode, pending.salt);
      if (!safeHexEqual(computedHash, pending.codeHash)) {
        const nextAttempts = currentAttempts + 1;
        if (nextAttempts >= 5) {
          tx.delete(pendingRef);
          return { ok: false, status: 429, error: 'Byl překročen maximální počet neúspěšných pokusů (5). Zaregistrujte se prosím znovu od začátku.', attemptsLeft: 0 };
        }
        tx.update(pendingRef, { attempts: nextAttempts });
        const attemptsLeft = 5 - nextAttempts;
        return {
          ok: false,
          status: 400,
          attemptsLeft,
          error: `Zadaný kód není správný. Zbývá ${attemptsLeft} ${attemptsLeft === 1 ? 'pokus' : 'pokusy'}.`
        };
      }

      tx.delete(pendingRef);
      return { ok: true, pending };
    });

    if (!verifyResult.ok) {
      return res.status(verifyResult.status).json({
        error: verifyResult.error,
        ...(verifyResult.attemptsLeft !== undefined ? { attemptsLeft: verifyResult.attemptsLeft } : {})
      });
    }

    const pending = verifyResult.pending;
    const originalPassword = decryptPassword(pending.encryptedPassword);

    let userRecord;
    try {
      userRecord = await createAuthUser({
        email: pending.email,
        password: originalPassword,
        displayName: pending.name
      });
    } catch (createErr) {
      if (createErr.code === 'auth/email-already-exists') {
        return res.status(409).json({ error: 'Tento e-mail již byl mezitím zaregistrován. Přihlaste se prosím.' });
      }
      throw createErr;
    }

    const todayPrague = getPragueDateString();
    const refCode = userRecord.uid.slice(0, 8).toUpperCase();
    const newProfile = {
      uid: userRecord.uid,
      email: pending.email,
      displayName: pending.name,
      name: pending.name,
      role: 'free',
      enrolledCourseIds: [],
      jokers: 10,
      streak: 0,
      referralCode: refCode,
      referralsCount: 0,
      lastDailyGrantDate: todayPrague,
      lastJokerResetDate: todayPrague,
      dailyVideosWatched: 0,
      lastViewedActivityAt: Timestamp.now(),
      emailVerified: true,
      createdAt: Timestamp.now()
    };

    await db.collection('users').doc(userRecord.uid).set(newProfile);
    await syncCustomClaimsIfNeeded(userRecord.uid, 'free', []);

    let customToken = null;
    const canSignCustomToken = Boolean(
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      isCloudFunction
    );

    if (canSignCustomToken) {
      try {
        customToken = await auth.createCustomToken(userRecord.uid);
      } catch (tokenErr) {
        console.warn('[Register Confirm] createCustomToken selhal:', tokenErr?.message);
      }
    }

    console.log(`[Register Confirm] Uživatel úspěšně ověřen 6místným kódem a vytvořen ve Firebase Auth (UID: ${userRecord.uid})`);

    // SEC-37: Nikdy nevracíme heslo uživatele v HTTP odpovědi při selhání createCustomToken
    if (!customToken) {
      return res.status(503).json({
        accountCreated: true,
        requiresLogin: true,
        error: 'Váš účet byl úspěšně vytvořen a ověřen, ale automatické přihlášení se nezdařilo. Přihlaste se prosím svým zvoleným heslem.'
      });
    }

    return res.json({
      success: true,
      message: 'Registrace byla úspěšně ověřena a dokončena!',
      customToken,
      uid: userRecord.uid,
      email: pending.email,
      name: pending.name
    });
  } catch (err) {
    console.error('Chyba při ověření registrace kódem:', err);
    return res.status(500).json({ error: 'Nepodařilo se dokončit registraci.' });
  }
});

app.post('/api/auth/password-reset', passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    const safeEmail = String(email || '').toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!safeEmail || !emailRegex.test(safeEmail) || safeEmail.length > 256) {
      return res.status(400).json({ error: 'Zadejte prosím platnou e-mailovou adresu.' });
    }

    // SEC-09: Distribuovaný IP limit + per-email 60s cooldown (brání SMTP spamu rotací IP adres)
    const [ipRate, emailCooldown] = await Promise.all([
      checkDistributedRateLimit({
        key: `pwd-reset-ip:${getClientIp(req)}`,
        windowMs: 15 * 60 * 1000,
        max: 10,
      }),
      checkDistributedRateLimit({
        key: `pwd-reset-email:${hashEmailKey(safeEmail)}`,
        windowMs: 60 * 1000,
        max: 1,
      }),
    ]);
    if (!ipRate.allowed) {
      res.setHeader('Retry-After', String(ipRate.retryAfterSec));
      return res.status(429).json({
        error: 'Příliš mnoho žádostí o obnovení hesla. Zkuste to prosím za několik minut.',
      });
    }
    if (!emailCooldown.allowed) {
      res.setHeader('Retry-After', String(emailCooldown.retryAfterSec));
      return res.status(429).json({
        error: `Žádost o obnovení hesla pro tento e-mail byla nedávno odeslána. Zkuste to za ${emailCooldown.retryAfterSec} sekund.`,
      });
    }

    // SEC-26: Jednotná odpověď proti enumeraci účtů
    const UNIFORM_PASSWORD_RESET_MESSAGE =
      'Pokud účet s tímto e-mailem existuje, odeslali jsme odkaz pro obnovení hesla.';

    // 1. Ověření existence uživatele ve Firebase Auth
    let userRecord = null;
    try {
      userRecord = await auth.getUserByEmail(safeEmail);
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.message?.includes('no user record')) {
        return res.status(200).json({
          success: true,
          simulated: false,
          message: UNIFORM_PASSWORD_RESET_MESSAGE
        });
      }
      console.warn('[password-reset getUserByEmail notice]:', err?.code || err?.message || err);
      return res.status(500).json({ error: 'Nastala chyba při ověřování účtu. Zkuste to prosím za chvíli.' });
    }

    // 2. Sestavení kanonické URL aplikace (reálná veřejná produkční doména pro e-maily uživatelů)
    const CANONICAL_PUBLIC_APP_URL = (
      process.env.PUBLIC_APP_URL ||
      (process.env.APP_URL && !process.env.APP_URL.includes('localhost') && !process.env.APP_URL.includes('127.0.0.1')
        ? process.env.APP_URL
        : 'https://proeducator.eu')
    ).replace(/\/+$/, '');

    const clientOrigin = req.headers.origin || (req.headers.host ? `${req.protocol || 'http'}://${req.headers.host}` : null) || 'http://localhost:3005';

    // Pro Firebase actionCodeSettings použijeme autorizovanou doménu projektu
    const actionCodeSettings = {
      url: `${CANONICAL_PUBLIC_APP_URL}/login`,
      handleCodeInApp: false
    };

    // 3. Vygenerování bezpečného autorizovaného reset linku přes Firebase Admin SDK
    let rawResetLink;
    try {
      rawResetLink = await auth.generatePasswordResetLink(safeEmail, actionCodeSettings);
    } catch (genErr) {
      console.error('[password-reset generatePasswordResetLink error]:', genErr);
      return res.status(500).json({ error: 'Nepodařilo se vygenerovat odkaz pro obnovení hesla.' });
    }

    // 4. Transformace na vlastní ProEdu stránku /reset-password?oobCode=...
    let publicResetLink = rawResetLink;
    try {
      const parsedUrl = new URL(rawResetLink);
      const oobCode = parsedUrl.searchParams.get('oobCode');
      if (oobCode) {
        publicResetLink = `${CANONICAL_PUBLIC_APP_URL}/reset-password?oobCode=${encodeURIComponent(oobCode)}&email=${encodeURIComponent(safeEmail)}`;
      }
    } catch (urlErr) {
      console.warn('[password-reset link parse notice]:', urlErr?.code || 'invalid URL');
    }

    // 5. Odeslání e-mailu (do e-mailu jde výhradně reálná veřejná URL aplikace)
    const emailRes = await sendPasswordResetEmailTemplate({
      to: safeEmail,
      name: userRecord.displayName || userRecord.email || '',
      resetLink: publicResetLink
    });

    if (process.env.NODE_ENV === 'production' && emailRes?.simulated) {
      console.error('[password-reset] Simulated email delivery blocked in production.');
      return res.status(503).json({ error: 'E-mailová služba není v produkci dostupná.' });
    }

    if (!emailRes?.success) {
      return res.status(502).json({ error: 'Nepodařilo se odeslat e-mail s odkazem. Zkuste to prosím znovu.' });
    }

    console.log(`[password-reset] Request processed (simulated=${Boolean(emailRes.simulated)}).`);

    return res.status(200).json({
      success: true,
      simulated: Boolean(emailRes.simulated),
      message: emailRes.simulated
        ? 'Režim náhledu: Odkaz pro obnovení hesla byl vypsán do konzole serveru.'
        : UNIFORM_PASSWORD_RESET_MESSAGE
    });
  } catch (err) {
    console.error('Chyba při zpracování požadavku na obnovení hesla:', err);
    return res.status(500).json({ error: 'Nastala neočekávaná chyba při obnovení hesla.' });
  }
});

// Dev endpoint pro lokální testování rolí (v produkci i mimo loopback vrací 404)
const recentSetRoleCalls = new Map();

app.post('/api/dev/set-role', (req, res, next) => {
  if (!isDevToolsEnabled || !isLoopbackRequest(req)) {
    return res.status(404).json({ error: 'Endpoint nenalezen.' });
  }
  return next();
}, requireAuth, async (req, res) => {
  try {
    const {
      uid,
      role,
      subscriptionStatus,
      subscriptionPeriodEnd,
      subscriptionCancelledAt,
      subscriptionCancelReason,
      premiumSince,
      enrolledCourseIds,
      courseId
    } = req.body || {};

    const targetUid = String(uid || req.user.uid).trim();
    if (!targetUid || !role) {
      return res.status(400).json({ error: 'Chybí uid nebo role.' });
    }
    if (req.user.role !== 'teacher' && targetUid !== req.user.uid) {
      return res.status(403).json({ error: 'Nelze měnit roli cizího účtu.' });
    }

    if (!VALID_ROLES.has(role)) {
      return res.status(400).json({ error: 'Neplatná role.' });
    }

    const dedupKey = `${targetUid}:${role}:${subscriptionStatus || ''}:${subscriptionPeriodEnd || ''}:${Array.isArray(enrolledCourseIds) ? enrolledCourseIds.join(',') : ''}`;
    const lastCall = recentSetRoleCalls.get(targetUid);
    if (lastCall && lastCall.key === dedupKey && Date.now() - lastCall.timestamp < 2000) {
      return res.json({ success: true, uid: targetUid, role, deduplicated: true });
    }
    setBoundedMapEntry(recentSetRoleCalls, targetUid, { key: dedupKey, timestamp: Date.now() }, DEFAULT_MAP_MAX_ENTRIES);

    const cleanCourses = Array.isArray(enrolledCourseIds)
      ? Array.from(new Set(enrolledCourseIds.filter((id) => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim())))
      : undefined;

    const updatePayload = { role };
    if (subscriptionStatus !== undefined) updatePayload.subscriptionStatus = String(subscriptionStatus);
    if (subscriptionPeriodEnd !== undefined) updatePayload.subscriptionPeriodEnd = subscriptionPeriodEnd;
    if (subscriptionCancelledAt !== undefined) updatePayload.subscriptionCancelledAt = subscriptionCancelledAt;
    if (subscriptionCancelReason !== undefined) updatePayload.subscriptionCancelReason = subscriptionCancelReason;
    if (premiumSince !== undefined) updatePayload.premiumSince = premiumSince;
    if (cleanCourses !== undefined) updatePayload.enrolledCourseIds = cleanCourses;
    if (courseId !== undefined) updatePayload.courseId = courseId;

    const userRef = db.collection('users').doc(targetUid);
    await userRef.set(updatePayload, { merge: true });
    const updatedSnap = await userRef.get();
    const finalCourses = normalizeEnrolledCourseIds(updatedSnap.data() || {});
    await syncCustomClaimsIfNeeded(targetUid, role, finalCourses);
    userRoleCache.delete(targetUid);

    return res.json({ success: true, uid: targetUid, ...updatePayload, enrolledCourseIds: finalCourses });
  } catch (err) {
    console.error('[DEV API] Chyba při nastavování role:', err);
    return res.status(500).json({ error: 'Nepodařilo se nastavit roli.' });
  }
});

// --- REFERRAL CLAIM ENDPOINT ---
const referralsClaimLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `referrals-claim:${req.user?.uid || getClientIp(req)}`,
  message: 'Příliš mnoho pokusů o uplatnění doporučení. Zkuste to prosím za chvíli.'
});

app.post('/api/referrals/claim', requireAuth, requireVerifiedEmailForPasswordAuth, referralsClaimLimiter, async (req, res) => {
  try {
    const { referralCode } = req.body || {};
    const refereeUid = req.user.uid;

    if (!referralCode || typeof referralCode !== 'string') {
      return res.status(400).json({ error: 'Chybí nebo je neplatný kód doporučení.' });
    }

    const cleanCode = referralCode.trim();
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(cleanCode)) {
      return res.status(400).json({ error: 'Neplatný formát kódu doporučení.' });
    }

    // 1. Najít zvoucího uživatele (podle referralCode nebo přímo uid)
    let inviterUid = null;
    const upperCode = cleanCode.toUpperCase();
    const byCodeSnap = await db.collection('users').where('referralCode', '==', upperCode).limit(1).get();
    if (!byCodeSnap.empty) {
      inviterUid = byCodeSnap.docs[0].id;
    } else if (cleanCode !== upperCode) {
      const exactCodeSnap = await db.collection('users').where('referralCode', '==', cleanCode).limit(1).get();
      if (!exactCodeSnap.empty) {
        inviterUid = exactCodeSnap.docs[0].id;
      }
    }

    if (!inviterUid && cleanCode.length > 20) {
      const directDoc = await db.collection('users').doc(cleanCode).get();
      if (directDoc.exists) {
        inviterUid = directDoc.id;
      }
    }

    if (!inviterUid) {
      return res.status(404).json({ error: 'Kód doporučení nebyl nalezen.' });
    }

    if (inviterUid === refereeUid) {
      return res.status(400).json({ error: 'Nemůžeš použít svůj vlastní odkaz pro doporučení.' });
    }

    const refereeRef = db.collection('users').doc(refereeUid);
    const inviterRef = db.collection('users').doc(inviterUid);

    const txResult = await db.runTransaction(async (tx) => {
      const [refereeDoc, inviterDoc] = await Promise.all([
        tx.get(refereeRef),
        tx.get(inviterRef)
      ]);

      if (!refereeDoc.exists) {
        return { errorStatus: 404, errorMsg: 'Uživatelský profil nenalezen.' };
      }
      if (!inviterDoc.exists) {
        return { errorStatus: 404, errorMsg: 'Kód doporučení nebyl nalezen.' };
      }

      const refereeData = refereeDoc.data() || {};
      const inviterData = inviterDoc.data() || {};

      if (refereeData.referredBy) {
        return { errorStatus: 400, errorMsg: 'Bonus za doporučení byl u tohoto účtu již dříve uplatněn.' };
      }

      const currentInviterCount = Number(inviterData.referralsCount ?? 0);
      if (currentInviterCount >= 5) {
        return { errorStatus: 400, errorMsg: 'Tento zvoucí uživatel již dosáhl maximálního limitu 5 doporučení.' };
      }

      const MAX_BONUS_JOKERS_CAP = 200;
      const inviterNewJokers = Math.min(MAX_BONUS_JOKERS_CAP, Number(inviterData.jokers ?? 0) + 30);
      const refereeNewJokers = Math.min(MAX_BONUS_JOKERS_CAP, Number(refereeData.jokers ?? 0) + 30);

      tx.update(inviterRef, {
        referralsCount: currentInviterCount + 1,
        jokers: inviterNewJokers
      });
      tx.update(refereeRef, {
        referredBy: inviterUid,
        jokers: refereeNewJokers
      });
      const referralLogRef = db.collection('referrals').doc();
      tx.set(referralLogRef, {
        referrerUid: inviterUid,
        refereeUid,
        bonusAwarded: 30,
        createdAt: Timestamp.now()
      });

      return {
        ok: true,
        refereeNewJokers,
        referrerName: inviterData.displayName || inviterData.name || 'Kamarád'
      };
    });

    if (!txResult.ok) {
      return res.status(txResult.errorStatus).json({ error: txResult.errorMsg });
    }

    return res.json({
      success: true,
      reward: 30,
      newJokers: txResult.refereeNewJokers,
      referrerName: txResult.referrerName
    });
  } catch (err) {
    console.error('Chyba při uplatnění referral kódu:', err);
    return res.status(500).json({ error: 'Nepodařilo se uplatnit kód doporučení.' });
  }
});

// --- SURVEY SUBMIT ENDPOINT ---
app.post('/api/survey/submit', requireAuth, requireVerifiedEmailForPasswordAuth, async (req, res) => {
  try {
    const { answer, customAnswer, school, grade } = req.body || {};
    const userId = req.user.uid;

    if (!answer || typeof answer !== 'string') {
      return res.status(400).json({ error: 'Vyberte prosím, odkud jste o nás slyšeli.' });
    }

    const allowedOptions = [
      'Od spolužáka / kamaráda',
      'Ze školy / od učitele',
      'TikTok / Instagram',
      'Facebook',
      'Google vyhledávání',
      'Jiné'
    ];

    const cleanAnswer = answer.trim();
    if (!allowedOptions.includes(cleanAnswer)) {
      return res.status(400).json({ error: 'Neplatná odpověď.' });
    }

    if (!school || typeof school !== 'string' || !school.trim()) {
      return res.status(400).json({ error: 'Vyplňte prosím, na jakou školu chodíte.' });
    }

    if (!grade || typeof grade !== 'string' || !grade.trim()) {
      return res.status(400).json({ error: 'Vyberte prosím, do kterého ročníku chodíte.' });
    }

    const cleanSchool = school.trim().slice(0, 200);
    const cleanGrade = grade.trim().slice(0, 100);
    const cleanCustomAnswer = customAnswer ? String(customAnswer).trim().slice(0, 250) : null;
    const userRef = db.collection('users').doc(userId);
    const surveyRef = db.collection('surveyResponses').doc(userId);

    const txResult = await db.runTransaction(async (tx) => {
      const [userDoc, existingSurvey] = await Promise.all([
        tx.get(userRef),
        tx.get(surveyRef)
      ]);
      if (!userDoc.exists) {
        return { errorStatus: 404, errorMsg: 'Uživatelský profil nenalezen.' };
      }
      const userData = userDoc.data() || {};
      if (userData.surveyCompleted || existingSurvey.exists) {
        return { errorStatus: 400, errorMsg: 'Tento dotazník byl již dříve vyplněn.' };
      }

      const MAX_BONUS_JOKERS_CAP = 200;
      const newJokers = Math.min(MAX_BONUS_JOKERS_CAP, Number(userData.jokers ?? 0) + 15);
      tx.set(userRef, {
        surveyCompleted: true,
        surveyAnswer: cleanAnswer,
        surveyAnswerCustom: cleanCustomAnswer,
        surveySchool: cleanSchool,
        surveyGrade: cleanGrade,
        jokers: newJokers
      }, { merge: true });

      tx.set(surveyRef, {
        userId,
        userEmail: req.user.email || '',
        answer: cleanAnswer,
        customAnswer: cleanCustomAnswer,
        school: cleanSchool,
        grade: cleanGrade,
        bonusAwarded: 15,
        createdAt: Timestamp.now()
      });

      return { ok: true, newJokers };
    });

    if (!txResult.ok) {
      return res.status(txResult.errorStatus).json({ error: txResult.errorMsg });
    }

    return res.json({
      success: true,
      reward: 15,
      newJokers: txResult.newJokers,
      school: cleanSchool,
      grade: cleanGrade
    });
  } catch (err) {
    console.error('Chyba při odesílání dotazníku:', err);
    return res.status(500).json({ error: 'Nepodařilo se odeslat dotazník.' });
  }
});

// --- ADMIN SURVEYS LIST ENDPOINT ---
app.get('/api/admin/surveys', requireAuth, requireTeacher, async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit);
    const maxItems = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(500, Math.round(rawLimit)) : 200;
    const snap = await db.collection('surveyResponses').limit(maxItems).get();
    let surveys = snap.docs.map((doc) => ({ id: doc.id, ...serializeTimestampFields(doc.data()) }));

    if (surveys.length === 0) {
      const usersSnap = await db.collection('users').where('surveyCompleted', '==', true).limit(maxItems).get();
      surveys = usersSnap.docs.map((d) => {
        const u = d.data() || {};
        return {
          id: `survey_${u.uid || d.id}`,
          userId: u.uid || d.id,
          userEmail: u.email || '',
          userName: u.displayName || u.name || '',
          answer: u.surveyAnswer || 'Nezadáno',
          customAnswer: u.surveyAnswerCustom || null,
          school: u.surveySchool || '',
          grade: u.surveyGrade || '',
          bonusAwarded: 15,
          createdAt: serializeTimestampFields(u.createdAt || null)
        };
      });
    }

    surveys.sort((a, b) => {
      const aTime = parseIsoMillis(a.createdAt) || 0;
      const bTime = parseIsoMillis(b.createdAt) || 0;
      return bTime - aTime;
    });

    return res.json({ success: true, surveys });
  } catch (err) {
    console.error('Chyba při načítání dotazníků pro admina:', err);
    return res.status(500).json({ error: 'Nepodařilo se načíst dotazníky.' });
  }
});

// --- ADMIN SURVEY DELETE ENDPOINT ---
app.delete('/api/admin/surveys/:id', requireAuth, requireTeacher, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Chybí ID odpovědi.' });
    }

    let targetUserId = null;
    const docRef = db.collection('surveyResponses').doc(id);
    const snap = await docRef.get();
    if (snap.exists) {
      targetUserId = snap.data()?.userId || id;
      await docRef.delete();
    } else if (id.startsWith('survey_')) {
      targetUserId = id.slice('survey_'.length);
    } else {
      return res.status(404).json({ error: 'Odpověď dotazníku nebyla nalezena.' });
    }

    if (targetUserId) {
      const userRef = db.collection('users').doc(targetUserId);
      const uSnap = await userRef.get();
      if (uSnap.exists) {
        await userRef.set({
          surveyCompleted: false,
          surveyAnswer: null,
          surveyAnswerCustom: null,
          surveySchool: null,
          surveyGrade: null
        }, { merge: true });
      }
    }

    return res.json({ success: true, message: 'Odpověď z dotazníku byla úspěšně smazána.' });
  } catch (err) {
    console.error('Chyba při mazání odpovědi dotazníku:', err);
    return res.status(500).json({ error: 'Nepodařilo se smazat odpověď.' });
  }
});

// ==========================================
// --- BUG REPORTING SYSTEM ---
// ==========================================

const bugReportLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 5,
  keyFn: (req) => `bug:${req.user?.uid || getClientIp(req)}`,
  message: 'Příliš mnoho hlášení v krátkém čase. Zkuste to prosím za několik minut.'
});

app.post('/api/bug-reports/submit', requireAuth, requireVerifiedEmailForPasswordAuth, bugReportLimiter, async (req, res) => {
  try {
    const userId = req.user.uid;
    const userEmail = req.user.email || '';
    const {
      category = 'other',
      description = '',
      pageUrl = '',
      screenshotUrl = null,
      userAgent = null,
      screenResolution = null,
      userName = ''
    } = req.body || {};

    const cleanDescription = String(description || '').trim();
    if (!cleanDescription || cleanDescription.length < 3) {
      return res.status(400).json({ error: 'Zadejte prosím podrobnější popis chyby (alespoň 3 znaky).' });
    }
    if (cleanDescription.length > 4000) {
      return res.status(400).json({ error: 'Popis chyby je příliš dlouhý (maximum je 4000 znaků).' });
    }

    const allowedCategories = ['question', 'technical', 'visual', 'improvement', 'other'];
    const safeCategory = allowedCategories.includes(category) ? category : 'other';

    const categoryLabels = {
      question: 'Chyba v otázce / zadání',
      technical: 'Technická chyba / nefunkčnost',
      visual: 'Vzhled / překlep / text',
      improvement: 'Návrh na zlepšení',
      other: 'Jiné'
    };

    const userSnap = await db.collection('users').doc(userId).get();
    const userDoc = userSnap.data() || {};
    const safeUserName = String(userName || userDoc.displayName || userDoc.name || userEmail.split('@')[0] || 'Student').trim().slice(0, 128);

    // SEC-36: Povolujeme klikatelnou URL pouze z originu ProEducator (externí/neplatnou ukládáme bez schématu jako prostý text)
    const rawPageUrl = String(pageUrl || '').replace(/[\r\n\0]+/g, ' ').trim().slice(0, 1024);
    const allowedPageUrl = sanitizeAllowedBugReportPageUrl(rawPageUrl);
    const safePageUrl = allowedPageUrl || (rawPageUrl ? rawPageUrl.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '[externí] ').slice(0, 512) : '');

    let safeScreenshotUrl = null;
    if (typeof screenshotUrl === 'string' && screenshotUrl.trim()) {
      const rawScreenshot = screenshotUrl.trim();
      const isDataUrl = /^data:image\/(?:png|jpe?g|webp);base64,/i.test(rawScreenshot);
      const maxLen = isDataUrl ? 850 * 1024 : 2048;
      if (rawScreenshot.length > maxLen) {
        return res.status(400).json({ error: 'Přiložený snímek obrazovky je příliš velký.' });
      }
      const sanitized = sanitizeAllowedBugReportScreenshotUrl(rawScreenshot) || null;
      if (!sanitized) {
        return res.status(400).json({ error: 'Nepovolená URL adresa snímku obrazovky.' });
      }
      if (isDataUrl) {
        const commaIdx = sanitized.indexOf(',');
        const b64Part = commaIdx !== -1 ? sanitized.slice(commaIdx + 1) : '';
        const headBuf = Buffer.from(b64Part.slice(0, 32), 'base64');
        const isPng = headBuf.length >= 4 && headBuf[0] === 0x89 && headBuf[1] === 0x50 && headBuf[2] === 0x4e && headBuf[3] === 0x47;
        const isJpeg = headBuf.length >= 3 && headBuf[0] === 0xff && headBuf[1] === 0xd8 && headBuf[2] === 0xff;
        const isWebp =
          headBuf.length >= 12 &&
          headBuf.subarray(0, 4).toString('ascii') === 'RIFF' &&
          headBuf.subarray(8, 12).toString('ascii') === 'WEBP';
        if (!isPng && !isJpeg && !isWebp) {
          return res.status(400).json({ error: 'Neplatný formát přiloženého obrázku.' });
        }
      }
      safeScreenshotUrl = sanitized;
    }

    const safeUserAgent = userAgent ? String(userAgent).trim().slice(0, 512) : String(req.headers['user-agent'] || '').slice(0, 512);
    const safeResolution = screenResolution ? String(screenResolution).trim().slice(0, 64) : null;

    const reportData = {
      userId,
      userEmail,
      userName: safeUserName,
      category: safeCategory,
      categoryLabel: categoryLabels[safeCategory],
      description: cleanDescription,
      pageUrl: safePageUrl,
      screenshotUrl: safeScreenshotUrl,
      userAgent: safeUserAgent,
      screenResolution: safeResolution,
      status: 'pending',
      resolutionNotes: null,
      resolvedAt: null,
      createdAt: FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('bugReports').add(reportData);
    const reportId = docRef.id;

    // SEC-36: Žádný hardcoded osobní Gmail — čteme pouze z BUG_REPORT_EMAIL / ADMIN_EMAIL
    const bugReportRecipient = resolveBugReportRecipient();
    if (!bugReportRecipient) {
      console.warn('[BugReport submit] BUG_REPORT_EMAIL / ADMIN_EMAIL není nakonfigurováno — e-mail s hlášením nebyl odeslán.');
    } else {
      try {
        await sendBugReportEmail({
          to: bugReportRecipient,
          studentName: safeUserName,
          studentEmail: userEmail,
          category: safeCategory,
          categoryLabel: categoryLabels[safeCategory],
          description: cleanDescription,
          pageUrl: safePageUrl,
          userAgent: safeUserAgent,
          screenResolution: safeResolution,
          screenshotUrl: safeScreenshotUrl,
          reportId
        });
      } catch (emailErr) {
        console.error('[BugReport submit] Chyba při odesílání e-mailu:', emailErr);
      }
    }

    return res.json({
      success: true,
      reportId,
      message: 'Hlášení chyby bylo úspěšně odesláno. Děkujeme!'
    });
  } catch (err) {
    console.error('Chyba při zpracování hlášení chyby:', err);
    return res.status(500).json({ error: 'Nepodařilo se odeslat hlášení chyby.' });
  }
});

// Admin endpoint: Načtení hlášení pro učitele s omezením počtu (SEC-26: default 200, max 500)
app.get('/api/admin/bug-reports', requireAuth, requireTeacher, async (req, res) => {
  try {
    const rawLimit = Number(req.query?.limit);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 200;
    const snap = await db.collection('bugReports').orderBy('createdAt', 'desc').limit(limit).get();
    const reports = snap.docs.map((doc) => ({ id: doc.id, ...serializeTimestampFields(doc.data()) }));
    return res.json({ success: true, reports, limit });
  } catch (err) {
    console.error('Chyba při načítání hlášení chyb:', err);
    return res.status(500).json({ error: 'Nepodařilo se načíst hlášení chyb.' });
  }
});

// Admin endpoint: Změna stavu a interní poznámky
app.patch('/api/admin/bug-reports/:id', requireAuth, requireTeacher, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolutionNotes } = req.body || {};

    const allowedStatuses = ['pending', 'in_progress', 'resolved'];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Neplatný stav hlášení.' });
    }

    const docRef = db.collection('bugReports').doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Hlášení chyby nebylo nalezeno.' });
    }

    const updates = {};
    if (status) {
      updates.status = status;
      if (status === 'resolved') {
        updates.resolvedAt = FieldValue.serverTimestamp();
      }
    }
    if (typeof resolutionNotes === 'string') {
      updates.resolutionNotes = resolutionNotes.slice(0, 4000);
    }

    if (Object.keys(updates).length > 0) {
      await docRef.update(updates);
    }

    return res.json({ success: true, message: 'Hlášení bylo úspěšně aktualizováno.' });
  } catch (err) {
    console.error('Chyba při aktualizaci hlášení:', err);
    return res.status(500).json({ error: 'Nepodařilo se aktualizovat hlášení.' });
  }
});

// Admin endpoint: Smazání hlášení
app.delete('/api/admin/bug-reports/:id', requireAuth, requireTeacher, async (req, res) => {
  try {
    const { id } = req.params;
    const docRef = db.collection('bugReports').doc(id);
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Hlášení chyby nebylo nalezeno.' });
    }
    await docRef.delete();
    return res.json({ success: true, message: 'Hlášení bylo smazáno.' });
  } catch (err) {
    console.error('Chyba při mazání hlášení:', err);
    return res.status(500).json({ error: 'Nepodařilo se smazat hlášení.' });
  }
});

// ==========================================
// --- ORDERS & PAYMENT GATEWAY INTEGRATION ---
// ==========================================

const COMGATE_MERCHANT_ID = process.env.COMGATE_MERCHANT_ID || '';
const COMGATE_SECRET = process.env.COMGATE_SECRET || '';
// SEC-24: Fail-closed v produkci (musí být explicitně 'true', v dev výchozí test režim pokud není 'false')
const COMGATE_TEST_MODE =
  process.env.NODE_ENV === 'production'
    ? process.env.COMGATE_TEST_MODE === 'true'
    : process.env.COMGATE_TEST_MODE !== 'false';
const ALLOW_SANDBOX_PAYMENTS = process.env.ALLOW_SANDBOX_PAYMENTS === 'true';
// Platební lhůta pro neuhrazenou (pending) objednávku: 30 minut
const PENDING_ORDER_TIMEOUT_MS = 30 * 60 * 1000;
// Okno pro automatické stržení opakované platby v den expirace (24 hodin před koncem období, aby nedošlo k výpadku služby)
const RECURRING_CHARGE_LEAD_MS = 24 * 60 * 60 * 1000;
// SEC-10: Transakční zámky pro idempotentní fakturaci, refundaci a opakované strhávání
const IUCTO_SYNC_LEASE_MS = 2 * 60 * 1000;
const REFUND_LOCK_LEASE_MS = 2 * 60 * 1000;
const RECURRING_CHARGE_LEASE_MS = 5 * 60 * 1000;

const PREMIUM_PLANS = {
  'premium-monthly': {
    amount: 99,
    currency: 'CZK',
    title: 'ProEducator Premium (měsíční tarif)'
  }
};

const orderCreateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyFn: (req) => `order-create:${req.user?.uid || getClientIp(req)}`,
  message: 'Příliš mnoho pokusů o vytvoření objednávky. Zkuste to prosím za chvíli.'
});

const comgateWebhookLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 120,
  keyFn: (req) => `comgate-webhook:${getClientIp(req)}`,
  message: 'Příliš mnoho webhook požadavků.'
});

const subscriptionCancelLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `sub-cancel:${req.user?.uid || getClientIp(req)}`,
  message: 'Příliš mnoho požadavků na zrušení předplatného. Zkuste to prosím za chvíli.'
});

const subscriptionReactivateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `sub-reactivate:${req.user?.uid || getClientIp(req)}`,
  message: 'Příliš mnoho požadavků na obnovení předplatného. Zkuste to prosím za chvíli.'
});

const subscriptionBillingLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyFn: (req) => `sub-billing:${req.user?.uid || getClientIp(req)}`,
  message: 'Příliš mnoho změn fakturačních údajů. Zkuste to prosím za chvíli.'
});

// SEC-26: Per-user rate limitery pro /api/orders/my a /api/orders/:orderId/invoice.pdf
const ordersMyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyFn: (req) => `orders-my:${req.user?.uid || getClientIp(req)}`,
  message: 'Příliš mnoho požadavků na načtení objednávek. Zkuste to prosím za chvíli.'
});

const orderInvoicePdfLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyFn: (req) => `order-invoice-pdf:${req.user?.uid || getClientIp(req)}`,
  message: 'Příliš mnoho požadavků na stažení faktury. Zkuste to prosím za chvíli.'
});

// SEC-26: Omezení fan-outu synchronizace čekajících objednávek s Comgate + krátkodobá cache PDF faktur z iÚčta
const ORDERS_MY_MAX_COMGATE_SYNC = 5;
const ORDER_COMGATE_SYNC_COOLDOWN_MS = 60 * 1000;
const lastComgateCheckAt = new Map(); // orderId -> timestampMs

const INVOICE_PDF_CACHE_TTL_MS = 5 * 60 * 1000;
const INVOICE_PDF_CACHE_MAX_ENTRIES = 50;
const invoicePdfCache = new Map(); // `${orderId}:${iuctoInvoiceId}` -> { buffer, expiresAt }

function getCachedInvoicePdf(cacheKey, nowMs = Date.now()) {
  const entry = invoicePdfCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= nowMs) {
    invoicePdfCache.delete(cacheKey);
    return null;
  }
  return entry.buffer;
}

function setCachedInvoicePdf(cacheKey, buffer, nowMs = Date.now()) {
  if (!Buffer.isBuffer(buffer)) return;
  if (invoicePdfCache.size >= INVOICE_PDF_CACHE_MAX_ENTRIES) {
    for (const [k, v] of invoicePdfCache.entries()) {
      if (!v || v.expiresAt <= nowMs) {
        invoicePdfCache.delete(k);
      }
    }
  }
  setBoundedMapEntry(
    invoicePdfCache,
    cacheKey,
    { buffer, expiresAt: nowMs + INVOICE_PDF_CACHE_TTL_MS },
    INVOICE_PDF_CACHE_MAX_ENTRIES
  );
}

// SEC-35: ID objednávky se generuje výhradně na serveru (ignorujeme klientské orderId)
function generateServerOrderId() {
  return `ORD-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

// SEC-34: Explicitní allowlist polí objednávky vracených studentovi (bez admin diagnostiky, chyb a zámků)
const STUDENT_ORDER_ALLOWLIST_FIELDS = [
  'id',
  'orderId',
  'userId',
  'userEmail',
  'clientName',
  'billingAddress',
  'invoiceEmail',
  'ico',
  'dic',
  'amount',
  'currency',
  'planId',
  'paymentMethod',
  'status',
  'isSandbox',
  'isInitialRecurring',
  'isRecurringRenewal',
  'variableSymbol',
  'createdAt',
  'paidAt',
  'cancelledAt',
  'refundedAt',
  'comgateTransId',
  'comgateRedirectUrl',
  'iuctoInvoiceId',
  'iuctoInvoiceNumber',
  'iuctoSyncStatus',
  'iuctoCreditNoteId',
  'iuctoCreditNoteNumber',
  'iuctoCreditNoteShareUrl',
  'iuctoCreditNoteStatus',
  'spaydString'
];

function sanitizeOrderForStudent(order) {
  if (!order || typeof order !== 'object') return order;
  const serialized = serializeTimestampFields(order);
  const safe = {};
  for (const key of STUDENT_ORDER_ALLOWLIST_FIELDS) {
    if (serialized[key] !== undefined) {
      safe[key] = serialized[key];
    }
  }
  return safe;
}

function isSandboxSimulationAllowed() {
  return (
    COMGATE_TEST_MODE &&
    ALLOW_SANDBOX_PAYMENTS &&
    process.env.NODE_ENV !== 'production'
  );
}

function hasComgateCredentials() {
  return Boolean(COMGATE_MERCHANT_ID && COMGATE_SECRET);
}

function getComgateAuthHeader() {
  return 'Basic ' + Buffer.from(`${COMGATE_MERCHANT_ID}:${COMGATE_SECRET}`).toString('base64');
}

function isRealComgateTransId(transId) {
  return Boolean(transId && typeof transId === 'string' && !transId.startsWith('SANDBOX_'));
}

function resolveAppBaseUrl(req) {
  const configured = sanitizeHttpUrl(process.env.APP_URL);
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  if (process.env.NODE_ENV !== 'production' && req) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const host = forwardedHost || req.get('host');
    const proto = forwardedProto || req.protocol || 'http';
    if (host && (proto === 'http' || proto === 'https')) {
      const derived = sanitizeHttpUrl(`${proto}://${host}`);
      if (derived) return derived.replace(/\/+$/, '');
    }
  }
  return 'https://www.proeducator.eu';
}

function constantTimeSecretEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

async function getUserDocServer(userId) {
  if (!userId) return null;
  const snap = await db.collection('users').doc(userId).get();
  return snap.exists ? snap.data() : null;
}

async function updateUserDocServer(userId, updateData) {
  if (!userId) return false;
  await db.collection('users').doc(userId).set(updateData, { merge: true });
  return true;
}

async function saveOrderDoc(orderId, orderData) {
  const docRef = db.collection('orders').doc(orderId);
  await docRef.create(orderData);
  return true;
}

async function updateOrderDoc(orderId, updateFields) {
  await db.collection('orders').doc(orderId).set(updateFields, { merge: true });
  return true;
}

async function getOrderDoc(orderId) {
  if (!orderId) return null;
  const docSnap = await db.collection('orders').doc(orderId).get();
  return docSnap.exists ? { id: docSnap.id, ...docSnap.data() } : null;
}

function buildPremiumActivationUpdate(existingUser, options = {}) {
  const rawExistingEnd = existingUser?.subscriptionPeriodEnd ?? existingUser?.subscriptionExpiresAt;
  const existingEndMs = parseIsoMillis(rawExistingEnd) || 0;
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  // Plynulé navázání +30 dní na stávající konec období, pokud je uživatel v aktivním předplaceném období
  // nebo v 3denní ochranné lhůtě (Grace Period) – zachovává zaplacené dny i při mid-cycle prodloužení/aktualizaci karty.
  const isWithinActiveOrGracePeriod =
    existingEndMs > 0 &&
    (existingEndMs > nowMs ||
      (existingUser?.role === 'premium' && nowMs <= existingEndMs + SUBSCRIPTION_GRACE_MS));
  const baseMs =
    existingEndMs > nowMs
      ? Math.max(nowMs, existingEndMs)
      : options.extendFromExisting !== false && isWithinActiveOrGracePeriod
        ? existingEndMs
        : nowMs;
  const periodEnd = new Date(baseMs + 30 * 24 * 60 * 60 * 1000).toISOString();

  const updateData = {
    role: 'premium',
    premiumSince: existingUser?.premiumSince || new Date(nowMs).toISOString(),
    subscriptionStatus: 'active',
    subscriptionPeriodEnd: periodEnd,
    subscriptionGraceUntil: FieldValue.delete(),
    subscriptionExpiredAt: FieldValue.delete(),
    lastRecurringPaymentFailed: FieldValue.delete(),
    lastRecurringFailureReason: FieldValue.delete(),
    lastRecurringFailedAt: FieldValue.delete(),
    subscriptionCancelledAt: null,
    subscriptionCancelReason: null,
    recurringCancelled: false,
    recurringCancelledAt: null
  };

  if (options.initRecurringTransId) {
    updateData.initRecurringTransId = options.initRecurringTransId;
  }

  return {
    periodEnd,
    updateData,
    enrolledCourseIds: normalizeEnrolledCourseIds(existingUser || {})
  };
}

async function activatePremiumForUser(userId, options = {}) {
  const existingUser = options.existingUser || (await getUserDocServer(userId));
  const { periodEnd, updateData, enrolledCourseIds } = buildPremiumActivationUpdate(existingUser, options);

  await updateUserDocServer(userId, updateData);
  await syncCustomClaimsIfNeeded(userId, 'premium', enrolledCourseIds);
  userRoleCache.delete(userId);
  console.log(`[Premium Activation] Úspěšně aktivováno pro ${userId} (do ${periodEnd})`);
  return { periodEnd };
}

/**
 * Synchronizuje uhrazenou objednávku s iÚčto API (zákazník, faktura, platba, PDF).
 * SEC-10: Chrání vystavení faktury atomickým transakčním zámkem (iuctoSyncLockUntil, 2 min),
 * aby souběžné volání webhooku / verify-payment / CRON Outboxu nikdy nevystavilo duplicitní doklad.
 */
async function syncIuctoForPaidOrder({ orderId, order, userDoc = null }) {
  const orderRef = db.collection('orders').doc(orderId);
  const lockOwner = crypto.randomUUID();
  let leaseAcquired = false;

  try {
    const leaseCheck = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) {
        return { acquired: false, reason: 'order_not_found' };
      }
      const freshOrder = { id: snap.id, ...snap.data() };
      if (freshOrder.status === 'refunded') {
        return { acquired: false, reason: 'already_refunded', order: freshOrder };
      }
      if (freshOrder.iuctoSyncStatus === 'synced' || Boolean(freshOrder.iuctoInvoiceId)) {
        return { acquired: false, reason: 'already_synced', order: freshOrder };
      }
      const nowMs = Date.now();
      if (Number(freshOrder.iuctoSyncLockUntil || 0) > nowMs) {
        return { acquired: false, reason: 'sync_in_progress', order: freshOrder };
      }
      tx.set(
        orderRef,
        {
          iuctoSyncLockUntil: nowMs + IUCTO_SYNC_LEASE_MS,
          iuctoSyncLockOwner: lockOwner,
          iuctoSyncStatus: 'syncing'
        },
        { merge: true }
      );
      return { acquired: true, order: freshOrder };
    });

    if (!leaseCheck.acquired) {
      if (leaseCheck.reason === 'already_synced') {
        return {
          skipped: true,
          alreadySynced: true,
          reason: 'already_synced',
          invoiceNumber: leaseCheck.order?.iuctoInvoiceNumber || null,
          iuctoInvoiceId: leaseCheck.order?.iuctoInvoiceId || null,
          attachments: []
        };
      }
      if (leaseCheck.reason === 'sync_in_progress') {
        return {
          skipped: true,
          locked: true,
          reason: 'sync_in_progress',
          invoiceNumber: null,
          attachments: []
        };
      }
      return { skipped: true, reason: leaseCheck.reason, invoiceNumber: null, attachments: [] };
    }

    leaseAcquired = true;
    const latestOrder = { ...order, ...leaseCheck.order };
    const resolvedUserDoc = userDoc || (latestOrder?.userId ? await getUserDocServer(latestOrder.userId) : null) || {};
    const result = await iuctoService.issuePaidInvoice({
      orderId,
      order: latestOrder,
      userDoc: resolvedUserDoc,
      onProgress: async (partial) => {
        if (partial.iuctoCustomerId && latestOrder?.userId && resolvedUserDoc.iuctoCustomerId !== partial.iuctoCustomerId) {
          await updateUserDocServer(latestOrder.userId, { iuctoCustomerId: partial.iuctoCustomerId }).catch(() => {});
        }
        const progressUpdate = {};
        if (partial.iuctoInvoiceId) progressUpdate.iuctoInvoiceId = partial.iuctoInvoiceId;
        if (partial.iuctoInvoiceNumber) progressUpdate.iuctoInvoiceNumber = partial.iuctoInvoiceNumber;
        if (partial.iuctoPaymentId) progressUpdate.iuctoPaymentId = partial.iuctoPaymentId;
        if (Object.keys(progressUpdate).length > 0) {
          await updateOrderDoc(orderId, progressUpdate);
        }
      }
    });

    if (result.skipped) {
      const nextStatus = result.reason === 'sandbox_skipped' ? 'skipped_sandbox' : 'pending';
      await updateOrderDoc(orderId, {
        iuctoSyncStatus: nextStatus,
        iuctoError: null,
        iuctoSyncLockUntil: FieldValue.delete(),
        iuctoSyncLockOwner: FieldValue.delete()
      });
      leaseAcquired = false;
      return { skipped: true, reason: result.reason, invoiceNumber: null, attachments: [] };
    }

    if (latestOrder?.userId && result.iuctoCustomerId && resolvedUserDoc.iuctoCustomerId !== result.iuctoCustomerId) {
      await updateUserDocServer(latestOrder.userId, { iuctoCustomerId: result.iuctoCustomerId }).catch((err) => {
        console.warn('[iÚčto] Nepodařilo se uložit iuctoCustomerId k uživateli:', err?.message || err);
      });
    }

    await updateOrderDoc(orderId, {
      iuctoInvoiceId: result.iuctoInvoiceId,
      iuctoInvoiceNumber: result.iuctoInvoiceNumber,
      iuctoPaymentId: result.iuctoPaymentId,
      iuctoSyncStatus: 'synced',
      iuctoError: null,
      iuctoSyncedAt: new Date().toISOString(),
      iuctoSyncLockUntil: FieldValue.delete(),
      iuctoSyncLockOwner: FieldValue.delete()
    });
    leaseAcquired = false;

    const attachments = result.pdfBuffer
      ? [{ filename: result.pdfFilename, content: result.pdfBuffer, contentType: 'application/pdf' }]
      : [];

    console.log(`[iÚčto] Faktura ${result.iuctoInvoiceNumber} (ID ${result.iuctoInvoiceId}) úspěšně vystavena pro objednávku ${orderId}.`);
    return {
      skipped: false,
      invoiceNumber: result.iuctoInvoiceNumber,
      iuctoInvoiceId: result.iuctoInvoiceId,
      attachments
    };
  } catch (err) {
    console.warn(`[iÚčto Sync Error] Objednávka ${orderId}:`, err?.message || err);
    const partialUpdate = {
      iuctoSyncStatus: 'failed',
      iuctoError: String(err?.message || err).slice(0, 500),
      iuctoSyncLockUntil: FieldValue.delete(),
      iuctoSyncLockOwner: FieldValue.delete()
    };
    if (err?.partialResult?.iuctoInvoiceId) partialUpdate.iuctoInvoiceId = err.partialResult.iuctoInvoiceId;
    if (err?.partialResult?.iuctoInvoiceNumber) partialUpdate.iuctoInvoiceNumber = err.partialResult.iuctoInvoiceNumber;
    if (err?.partialResult?.iuctoPaymentId) partialUpdate.iuctoPaymentId = err.partialResult.iuctoPaymentId;
    if (err?.partialResult?.iuctoCustomerId && order?.userId) {
      await updateUserDocServer(order.userId, { iuctoCustomerId: err.partialResult.iuctoCustomerId }).catch(() => {});
    }
    if (leaseAcquired) {
      await updateOrderDoc(orderId, partialUpdate).catch(() => {});
    }
    return { failed: true, error: 'Synchronizace faktury s iÚčtem selhala.', invoiceNumber: null, attachments: [] };
  }
}

/**
 * Sdílený tok po potvrzení úhrady objednávky:
 * 1) Atomicky označí objednávku jako paid a aktivuje Premium (pokud již nebylo provedeno v transakci volajícího)
 * 2) Vystaví fakturu v iÚčtu pod transakčním zámkem iuctoSyncLockUntil a stáhne PDF
 * 3) Atomicky deduplikovaně odešle potvrzovací e-mail (s PDF fakturou v příloze, pokud byla vystavena)
 */
async function finalizePaidOrderAndInvoice({
  orderId,
  order,
  comgateTransId = null,
  initRecurringTransId = null,
  confirmedBy = null,
  isSandbox = undefined,
  isRecurringRenewal = false,
  extendFromExisting = true,
  skipPremiumActivation = false,
  periodEnd: precomputedPeriodEnd = null,
  premiumActivatedNow = false
}) {
  let mergedOrder = { ...order };
  let periodEnd = precomputedPeriodEnd || null;
  let activatedHere = Boolean(premiumActivatedNow);

  if (!skipPremiumActivation) {
    const orderRef = db.collection('orders').doc(orderId);
    const txActivation = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      const currentOrder = snap.exists ? { id: snap.id, ...snap.data() } : { ...order };
      const needsPremium = !currentOrder.premiumActivatedAt;
      const userRef = needsPremium && currentOrder.userId ? db.collection('users').doc(currentOrder.userId) : null;
      const userSnap = userRef ? await tx.get(userRef) : null;
      const existingUser = userSnap?.exists ? userSnap.data() : null;

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const orderUpdate = {
        status: 'paid',
        paidAt: currentOrder.paidAt || nowIso
      };
      if (comgateTransId) orderUpdate.comgateTransId = comgateTransId;
      if (confirmedBy) orderUpdate.confirmedBy = confirmedBy;
      if (typeof isSandbox === 'boolean') orderUpdate.isSandbox = isSandbox;

      let computedPeriodEnd = null;
      let enrolledCourseIds = [];
      if (needsPremium) {
        orderUpdate.premiumActivatedAt = nowIso;
        if (userRef) {
          const plan = buildPremiumActivationUpdate(existingUser, {
            initRecurringTransId: initRecurringTransId || undefined,
            nowMs,
            extendFromExisting
          });
          computedPeriodEnd = plan.periodEnd;
          enrolledCourseIds = plan.enrolledCourseIds;
          tx.set(userRef, plan.updateData, { merge: true });
        }
      }

      tx.set(orderRef, orderUpdate, { merge: true });
      return {
        order: { ...currentOrder, ...orderUpdate },
        needsPremium,
        periodEnd: computedPeriodEnd,
        enrolledCourseIds
      };
    });

    mergedOrder = txActivation.order;
    if (txActivation.needsPremium) {
      activatedHere = true;
      periodEnd = txActivation.periodEnd || periodEnd;
      if (mergedOrder.userId) {
        await syncCustomClaimsIfNeeded(mergedOrder.userId, 'premium', txActivation.enrolledCourseIds);
        userRoleCache.delete(mergedOrder.userId);
        console.log(`[Premium Activation] Úspěšně atomicky aktivováno pro ${mergedOrder.userId} (do ${periodEnd})`);
      }
    }
  }

  const userDoc = mergedOrder.userId ? await getUserDocServer(mergedOrder.userId) : null;
  if (!periodEnd) {
    periodEnd = userDoc?.subscriptionPeriodEnd || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  }

  const iuctoRes = await syncIuctoForPaidOrder({
    orderId,
    order: mergedOrder,
    userDoc
  });

  const targetEmail = String(mergedOrder.invoiceEmail || userDoc?.email || '').trim();
  const hasInvoiceAttachment = Array.isArray(iuctoRes.attachments) && iuctoRes.attachments.length > 0;
  const shouldAttemptEmail =
    Boolean(targetEmail) &&
    isStrictSingleEmail(targetEmail) &&
    !iuctoRes.locked &&
    (activatedHere || (!iuctoRes.skipped && !iuctoRes.failed && Boolean(iuctoRes.invoiceNumber)));

  if (shouldAttemptEmail) {
    const emailClaimed = await db
      .runTransaction(async (tx) => {
        const oRef = db.collection('orders').doc(orderId);
        const oSnap = await tx.get(oRef);
        if (!oSnap.exists) return false;
        const fresh = oSnap.data() || {};
        if (hasInvoiceAttachment) {
          if (fresh.invoiceEmailSentAt) return false;
          const sentAt = new Date().toISOString();
          tx.set(
            oRef,
            {
              confirmationEmailSentAt: fresh.confirmationEmailSentAt || sentAt,
              invoiceEmailSentAt: sentAt
            },
            { merge: true }
          );
          return true;
        }
        if (fresh.confirmationEmailSentAt) return false;
        tx.set(oRef, { confirmationEmailSentAt: new Date().toISOString() }, { merge: true });
        return true;
      })
      .catch(() => false);

    if (emailClaimed) {
      const emailPayload = {
        to: targetEmail,
        name: mergedOrder.clientName || userDoc?.displayName || userDoc?.name || 'zákazníku',
        orderId,
        amount: mergedOrder.amount || 99,
        invoiceNumber: iuctoRes.invoiceNumber || undefined,
        attachments: iuctoRes.attachments || []
      };

      const emailPromise = isRecurringRenewal
        ? sendRecurringChargeSuccessEmail({ ...emailPayload, nextPeriodEnd: periodEnd })
        : sendPaymentConfirmedEmail({ ...emailPayload, periodEnd });

      emailPromise.catch((err) => console.warn('[Payment Email Error]:', err?.message || err));
    }
  }

  return { periodEnd, iuctoRes };
}

// 1. Vytvoření objednávky (výhradně serverový ceník, bez overwrite)
app.post('/api/orders/create', requireAuth, orderCreateLimiter, async (req, res) => {
  try {
    const {
      variableSymbol: clientVariableSymbol,
      clientName,
      billingAddress,
      invoiceEmail,
      ico = '',
      dic = '',
      paymentMethod = 'comgate',
      termsAccepted,
      newsletterConsent = false,
      planId = 'premium-monthly'
    } = req.body || {};

    if (!planId || typeof planId !== 'string' || !Object.prototype.hasOwnProperty.call(PREMIUM_PLANS, planId)) {
      return res.status(400).json({ error: 'Neplatný tarif předplatného.' });
    }
    if (paymentMethod !== 'comgate') {
      return res.status(400).json({ error: 'Podporována je pouze online platba přes platební bránu Comgate.' });
    }

    const userId = req.user.uid;
    const userEmail = req.user.email || (typeof invoiceEmail === 'string' ? invoiceEmail.trim() : '');
    const planConfig = PREMIUM_PLANS[planId];
    const amount = planConfig.amount;
    const currency = planConfig.currency;

    if (!clientName || typeof clientName !== 'string' || clientName.trim().length < 2) {
      return res.status(400).json({ error: 'Zadejte prosím platné jméno a příjmení klienta.' });
    }

    if (
      !invoiceEmail ||
      typeof invoiceEmail !== 'string' ||
      /[\r\n\0]/.test(invoiceEmail) ||
      !isStrictSingleEmail(invoiceEmail.trim())
    ) {
      return res.status(400).json({ error: 'Zadejte prosím platný e-mail pro zaslání faktury.' });
    }

    if (
      !billingAddress ||
      typeof billingAddress !== 'object' ||
      typeof billingAddress.street !== 'string' || !billingAddress.street.trim() ||
      typeof billingAddress.city !== 'string' || !billingAddress.city.trim() ||
      typeof billingAddress.zip !== 'string' || !billingAddress.zip.trim()
    ) {
      return res.status(400).json({ error: 'Vyplňte prosím kompletní fakturační adresu (ulici, město i PSČ).' });
    }

    if (termsAccepted !== true) {
      return res.status(400).json({ error: 'Pro pokračování je nutné odsouhlasit obchodní podmínky.' });
    }

    // Kontrola, zda uživatel již nemá aktivní neuhrazenou (pending) objednávku.
    // SEC-35: Řazený dotaz dle existujícího složeného indexu (userId ASC, createdAt DESC) + deterministické dořazení v paměti.
    const existingOrdersSnap = await db
      .collection('orders')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get();
    const existingPendingDocs = existingOrdersSnap.docs
      .map((d) => ({ id: d.id, ...serializeTimestampFields(d.data()) }))
      .filter((o) => o.status === 'pending' && !o.isRecurringRenewal)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    if (existingPendingDocs.length > 0) {
      const reconciledPending = [];
      for (const pendingOrd of existingPendingDocs) {
        const synced = await reconcilePendingOrderWithComgate(pendingOrd);
        if (synced && synced.status === 'pending') {
          reconciledPending.push(synced);
        }
      }

      if (reconciledPending.length > 0) {
        const activePending = reconciledPending[0];
        // Pokud z historie zbyla více než 1 živá čekající objednávka, starší duplikáty automaticky zrušíme
        if (reconciledPending.length > 1) {
          for (const olderPending of reconciledPending.slice(1)) {
            if (hasComgateCredentials() && isRealComgateTransId(olderPending.comgateTransId)) {
              await cancelComgateRemotePayment(olderPending.comgateTransId);
            }
            await applyComgatePaymentTransition({
              orderId: olderPending.id,
              transId: olderPending.comgateTransId || null,
              status: 'CANCELLED',
              isSandbox: Boolean(olderPending.isSandbox)
            });
          }
        }

        const existingIsSandbox = Boolean(activePending.isSandbox);
        return res.json({
          success: true,
          reusedExistingOrder: true,
          orderId: activePending.id,
          order: sanitizeOrderForStudent(activePending),
          comgate: {
            ...(activePending.comgateTransId ? { transId: activePending.comgateTransId } : {}),
            ...(activePending.comgateRedirectUrl ? { redirectUrl: activePending.comgateRedirectUrl } : {}),
            isLive: !existingIsSandbox,
            isSandbox: existingIsSandbox,
            testMode: existingIsSandbox,
            message: 'Máte již vytvořenou neuhrazenou objednávku v platební lhůtě. Pokračujte prosím k jejímu zaplacení.'
          }
        });
      }
    }

    // SEC-35: Vždy generujeme orderId striktně na serveru (ignorujeme klientské orderId — bez kolizního orákula a osiřelých transakcí)
    const orderId = generateServerOrderId();

    const variableSymbol =
      clientVariableSymbol && typeof clientVariableSymbol === 'string'
        ? clientVariableSymbol.replace(/\D/g, '').slice(0, 10) || String(Date.now()).slice(-9)
        : String(Date.now()).slice(-9);

    const isTest = COMGATE_TEST_MODE === true || COMGATE_TEST_MODE === 'true';
    const hasComgateCreds = hasComgateCredentials();

    if (!isTest && !hasComgateCreds) {
      return res.status(503).json({ error: 'Platební brána není v produkci nakonfigurována.' });
    }

    const orderData = {
      id: orderId,
      orderId,
      userId,
      userEmail,
      clientName: clientName.trim().slice(0, 128),
      billingAddress: {
        street: billingAddress.street.trim().slice(0, 150),
        city: billingAddress.city.trim().slice(0, 100),
        zip: billingAddress.zip.trim().slice(0, 20),
        country: String(billingAddress.country || 'Česká republika').trim().slice(0, 64)
      },
      invoiceEmail: invoiceEmail.trim().slice(0, 256),
      ico: String(ico || '').trim().slice(0, 20),
      dic: String(dic || '').trim().slice(0, 20),
      amount,
      currency,
      planId,
      paymentMethod: 'comgate',
      status: 'pending',
      isSandbox: isTest || !hasComgateCreds,
      isInitialRecurring: true,
      termsAccepted: true,
      newsletterConsent: Boolean(newsletterConsent),
      variableSymbol,
      createdAt: new Date().toISOString()
    };

    const appBaseUrl = resolveAppBaseUrl(req);
    let comgateData = null;

    if (hasComgateCreds) {
      let comgateJson = null;
      let comgateOk = false;
      const baseComgatePayload = {
        merchant: COMGATE_MERCHANT_ID,
        test: isTest,
        price: Math.round(amount * 100),
        curr: 'CZK',
        label: 'ProEdu Premium',
        refId: orderId,
        email: orderData.invoiceEmail,
        fullName: orderData.clientName || undefined,
        // Vždy povolujeme výhradně karetní metody (CARD_ALL: karta, Apple Pay, Google Pay),
        // ze kterých lze příští měsíc automaticky strhnout opakovanou platbu.
        // Bankovní tlačítka (BANK_ALL), QR platby a odložené platby (LATER_ALL) jsou vypnuty.
        method: 'CARD_ALL',
        prepareOnly: true,
        initRecurring: true,
        country: 'CZ',
        lang: 'cs',
        url_paid: `${appBaseUrl}/?payment=success&orderId=${encodeURIComponent(orderId)}`,
        url_cancelled: `${appBaseUrl}/?payment=cancelled&orderId=${encodeURIComponent(orderId)}`,
        url_pending: `${appBaseUrl}/?payment=pending&orderId=${encodeURIComponent(orderId)}`
      };

      try {
        const comgateRes = await fetch('https://payments.comgate.cz/v2.0/payment.json', {
          method: 'POST',
          headers: {
            Authorization: getComgateAuthHeader(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(baseComgatePayload)
        });
        comgateOk = comgateRes.ok;
        comgateJson = await comgateRes.json().catch(() => null);
      } catch (comgateErr) {
        console.error('[Comgate API Network Error]:', comgateErr);
        return res.status(502).json({ error: 'Nepodařilo se spojit s platební bránou Comgate. Zkuste to prosím za chvíli.' });
      }

      if (!comgateOk || !comgateJson || comgateJson.code !== 0 || !comgateJson.redirect) {
        console.warn('[Comgate REST v2.0 Error]:', comgateJson);
        return res.status(502).json({ error: 'Platební brána Comgate odmítla založit platbu.' });
      }

      orderData.comgateTransId = comgateJson.transId;
      orderData.comgateRedirectUrl = comgateJson.redirect;
      orderData.isSandbox = isTest;
      comgateData = {
        transId: comgateJson.transId,
        redirectUrl: comgateJson.redirect,
        isLive: !isTest,
        testMode: isTest
      };
    } else if (isSandboxSimulationAllowed()) {
      comgateData = {
        isSandbox: true,
        testMode: true,
        message: 'Platební brána Comgate je nastavena v testovacím sandbox režimu.'
      };
    } else {
      return res.status(503).json({ error: 'Platební brána Comgate není v tomto prostředí dostupná.' });
    }

    try {
      await saveOrderDoc(orderId, orderData);
    } catch (saveErr) {
      if (saveErr?.code === 6 || saveErr?.code === 'already-exists' || String(saveErr?.message || '').includes('ALREADY_EXISTS')) {
        return res.status(409).json({ error: 'Objednávka s tímto identifikátorem již existuje.' });
      }
      throw saveErr;
    }

    return res.json({
      success: true,
      orderId,
      order: sanitizeOrderForStudent(orderData),
      comgate: comgateData
    });
  } catch (err) {
    console.error('Chyba při vytváření objednávky:', err);
    return res.status(500).json({ error: 'Nepodařilo se vytvořit objednávku.' });
  }
});

/**
 * Atomicky převede objednávku do stavu PAID nebo CANCELLED na základě potvrzení z Comgate
 * (sdíleno mezi Push URL webhookem a přímým ověřením stavu přes Comgate REST API).
 * SEC-10: Ověřuje shodu comgateTransId a provádí aktivaci Premium atomicky s premiumActivatedAt
 * nejvýše jednou i při souběhu webhooku + /verify-payment + /iucto-retry.
 */
async function applyComgatePaymentTransition({
  orderId,
  transId = null,
  status,
  price = null,
  curr = null,
  isSandbox = false
}) {
  const orderRef = db.collection('orders').doc(orderId);
  const txOutcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists) {
      return { errorStatus: 404, body: 'code=1&message=Order not found', errorMessage: 'Objednávka nebyla nalezena.' };
    }

    const order = { id: snap.id, ...snap.data() };
    const expectedPriceHaler = Math.round(Number(order.amount) * 100);
    if (price !== null && price !== undefined && Number(price) !== expectedPriceHaler) {
      return { errorStatus: 400, body: 'code=1&message=Price mismatch', errorMessage: 'Částka platby nesouhlasí.' };
    }

    if (curr && String(curr).toUpperCase() !== String(order.currency || 'CZK').toUpperCase()) {
      return { errorStatus: 400, body: 'code=1&message=Currency mismatch', errorMessage: 'Měna platby nesouhlasí.' };
    }

    // SEC-10: Kontrola shody uloženého comgateTransId proti příchozímu transId
    if (order.comgateTransId) {
      const storedTransId = String(order.comgateTransId).trim();
      const incomingTransId = transId ? String(transId).trim() : '';
      if (
        (incomingTransId && storedTransId !== incomingTransId) ||
        (status === 'PAID' && !incomingTransId)
      ) {
        return {
          errorStatus: 409,
          body: 'code=1&message=Transaction ID mismatch',
          errorMessage: 'Identifikátor transakce Comgate nesouhlasí s objednávkou.'
        };
      }
    }

    if (order.status === 'refunded') {
      return { errorStatus: 409, body: 'code=1&message=Order already refunded', errorMessage: 'Objednávka již byla refundována.' };
    }

    if (status === 'PAID') {
      const needsPremiumActivation = !order.premiumActivatedAt;
      const userRef = needsPremiumActivation && order.userId ? db.collection('users').doc(order.userId) : null;
      const userSnap = userRef ? await tx.get(userRef) : null;

      const invoiceSettled =
        Boolean(order.iuctoInvoiceId) ||
        order.iuctoSyncStatus === 'synced' ||
        order.iuctoSyncStatus === 'skipped_sandbox';
      if (order.status === 'paid' && !needsPremiumActivation && invoiceSettled) {
        return { alreadyProcessed: true, order };
      }

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const paidAtIso = order.paidAt || nowIso;
      const isRenewal = Boolean(order.isRecurringRenewal);
      // Dle dokumentace Comgate musí initRecurringId pro všechna další stržení vždy zůstat transId PRVNÍ (iniciační) platby.
      const preservedInitRecurringId = isRenewal
        ? (order.initRecurringTransId || null)
        : (transId || order.comgateTransId || null);

      const lockUpdates = {
        status: 'paid',
        paidAt: paidAtIso,
        comgateTransId: transId || order.comgateTransId || null,
        isSandbox: Boolean(isSandbox) || Boolean(order.isSandbox)
      };

      let periodEnd = null;
      let enrolledCourseIds = [];
      if (needsPremiumActivation) {
        lockUpdates.premiumActivatedAt = nowIso;
        if (userRef) {
          const existingUser = userSnap?.exists ? userSnap.data() : null;
          const activationPlan = buildPremiumActivationUpdate(existingUser, {
            initRecurringTransId: preservedInitRecurringId || undefined,
            nowMs,
            extendFromExisting: true
          });
          periodEnd = activationPlan.periodEnd;
          enrolledCourseIds = activationPlan.enrolledCourseIds;
          tx.set(userRef, activationPlan.updateData, { merge: true });
        }
      }

      tx.set(orderRef, lockUpdates, { merge: true });
      return {
        action: 'PAID',
        premiumActivatedNow: needsPremiumActivation,
        periodEnd,
        enrolledCourseIds,
        isRenewal,
        preservedInitRecurringId,
        order: { ...order, ...lockUpdates }
      };
    }

    if (status === 'CANCELLED') {
      const wasPending = order.status === 'pending';
      if (wasPending) {
        tx.set(orderRef, {
          status: 'cancelled',
          cancelledAt: new Date().toISOString()
        }, { merge: true });
      }
      return { action: 'CANCELLED', wasPending, order };
    }

    return { action: 'IGNORED', order };
  });

  if (txOutcome.errorStatus || txOutcome.alreadyProcessed) {
    return txOutcome;
  }

  if (txOutcome.action === 'PAID') {
    if (txOutcome.premiumActivatedNow && txOutcome.order.userId) {
      await syncCustomClaimsIfNeeded(txOutcome.order.userId, 'premium', txOutcome.enrolledCourseIds);
      userRoleCache.delete(txOutcome.order.userId);
      console.log(`[Premium Activation] Úspěšně atomicky aktivováno pro ${txOutcome.order.userId} (do ${txOutcome.periodEnd})`);
    }

    const finalized = await finalizePaidOrderAndInvoice({
      orderId,
      order: txOutcome.order,
      comgateTransId: transId || txOutcome.order.comgateTransId || null,
      initRecurringTransId: txOutcome.preservedInitRecurringId,
      isSandbox: Boolean(isSandbox) || Boolean(txOutcome.order.isSandbox),
      isRecurringRenewal: txOutcome.isRenewal,
      extendFromExisting: true,
      skipPremiumActivation: true,
      periodEnd: txOutcome.periodEnd,
      premiumActivatedNow: txOutcome.premiumActivatedNow
    });
    return { ...txOutcome, finalized };
  }

  if (txOutcome.action === 'CANCELLED' && txOutcome.wasPending && txOutcome.order?.isRecurringRenewal) {
    const failureReason = 'Opakovaná platba kartou byla zamítnuta vydavatelem karty nebo platební bránou Comgate.';
    if (txOutcome.order.userId) {
      await updateUserDocServer(txOutcome.order.userId, {
        lastRecurringPaymentFailed: true,
        lastRecurringFailureReason: failureReason,
        lastRecurringFailedAt: new Date().toISOString()
      }).catch(() => {});
    }
    const notifyEmail = [txOutcome.order.userEmail, txOutcome.order.invoiceEmail]
      .map((e) => String(e || '').trim())
      .find((e) => isStrictSingleEmail(e));
    if (notifyEmail) {
      sendRecurringChargeFailedEmail({
        to: notifyEmail,
        name: txOutcome.order.clientName || 'zákazníku',
        amount: txOutcome.order.amount || 99,
        reason: failureReason
      }).catch((err) => console.warn('[Recurring Failed Email Warning]:', err?.message || err));
    }
  }

  return txOutcome;
}

// 2. Comgate Push URL Notifikace (Webhook)
// SEC-24: Striktně pouze req.body (bez req.query), rate limiter a live server-to-server doověření stavu přes Comgate API
app.post('/api/payments/comgate/notify', comgateWebhookLimiter, async (req, res) => {
  try {
    if (!hasComgateCredentials()) {
      console.error('[Comgate Webhook] COMGATE_SECRET nebo COMGATE_MERCHANT_ID není nastaveno.');
      return res.status(503).send('code=1&message=Payment webhook not configured');
    }

    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const { merchant, test, price, curr, refId, transId, secret, status } = payload;

    if (!constantTimeSecretEqual(String(secret || ''), COMGATE_SECRET)) {
      console.warn('[Comgate Webhook] Neplatný nebo chybějící secret!');
      return res.status(403).send('code=1&message=Invalid secret');
    }

    if (!constantTimeSecretEqual(String(merchant || ''), COMGATE_MERCHANT_ID)) {
      console.warn('[Comgate Webhook] Neshoda merchant ID!');
      return res.status(403).send('code=1&message=Invalid merchant');
    }

    if (!refId || typeof refId !== 'string') {
      return res.status(400).send('code=1&message=Missing refId');
    }

    const webhookIsSandbox = test === true || test === 'true' || test === '1' || test === 1;
    if (!COMGATE_TEST_MODE && webhookIsSandbox) {
      console.warn(`[Comgate Webhook] Testovací platba odmítnuta v produkčním režimu pro ${refId}.`);
      return res.status(403).send('code=1&message=Test mode not allowed in live environment');
    }

    const normalizedStatus = String(status || '').toUpperCase();
    const cleanTransId = typeof transId === 'string' ? transId.trim() : '';
    let verifiedPrice = price;
    let verifiedCurr = curr;
    let verifiedTransId = cleanTransId || null;

    // SEC-24: V živém režimu před aktivací Premium ověřit stav PAID server-to-server proti Comgate API
    if (!COMGATE_TEST_MODE && normalizedStatus === 'PAID') {
      if (!cleanTransId) {
        return res.status(400).send('code=1&message=Missing transId');
      }
      const storedOrder = await getOrderDoc(refId);
      if (!storedOrder) {
        return res.status(404).send('code=1&message=Order not found');
      }
      if (storedOrder.comgateTransId && String(storedOrder.comgateTransId).trim() !== cleanTransId) {
        return res.status(409).send('code=1&message=Transaction ID mismatch');
      }

      let statusCheck;
      try {
        statusCheck = await fetchComgatePaymentStatus(cleanTransId);
      } catch (verifyErr) {
        console.error('[Comgate Webhook Status Verify Error]:', verifyErr?.message || verifyErr);
        return res.status(502).send('code=1&message=Comgate status verification failed');
      }

      const statusJson = statusCheck?.statusJson;
      if (!statusCheck?.ok || !statusJson || statusJson.code !== 0) {
        console.warn('[Comgate Webhook Status Verify Invalid Response]:', statusJson);
        return res.status(502).send('code=1&message=Comgate status verification failed');
      }

      const remoteStatus = String(statusJson.status || '').toUpperCase();
      if (remoteStatus !== 'PAID') {
        console.warn(`[Comgate Webhook] Server-to-server stav pro ${refId} není PAID (vráceno: ${remoteStatus}).`);
        return res.status(409).send('code=1&message=Payment not PAID on Comgate');
      }

      const remoteTest =
        statusJson.test === true ||
        statusJson.test === 'true' ||
        statusJson.test === '1' ||
        statusJson.test === 1;
      if (remoteTest) {
        return res.status(403).send('code=1&message=Test mode not allowed in live environment');
      }

      if (statusJson.refId && String(statusJson.refId) !== refId) {
        return res.status(409).send('code=1&message=Order refId mismatch');
      }

      const expectedPriceHaler = Math.round(Number(storedOrder.amount) * 100);
      const remotePrice = Number(statusJson.price);
      const remoteCurr = String(statusJson.curr || '').toUpperCase();
      const expectedCurr = String(storedOrder.currency || 'CZK').toUpperCase();
      if (!Number.isFinite(remotePrice) || remotePrice !== expectedPriceHaler) {
        return res.status(400).send('code=1&message=Verified price mismatch');
      }
      if (remoteCurr !== expectedCurr) {
        return res.status(400).send('code=1&message=Verified currency mismatch');
      }

      verifiedPrice = remotePrice;
      verifiedCurr = remoteCurr;
      verifiedTransId = statusJson.transId || cleanTransId;
    }

    const outcome = await applyComgatePaymentTransition({
      orderId: refId,
      transId: verifiedTransId,
      status: normalizedStatus || status,
      price: verifiedPrice,
      curr: verifiedCurr,
      isSandbox: webhookIsSandbox
    });

    if (outcome.errorStatus) {
      return res.status(outcome.errorStatus).send(outcome.body);
    }

    if (outcome.action === 'PAID') {
      console.log(`[Comgate Webhook] Objednávka ${refId} označena jako ZAPLACENÁ.`);
    }

    return res.send('code=0&message=OK');
  } catch (err) {
    console.error('[Comgate Webhook Error]:', err);
    return res.status(500).send('code=1&message=Internal error');
  }
});

async function fetchComgatePaymentStatus(transId) {
  const statusRes = await fetch(
    `https://payments.comgate.cz/v2.0/payment/transId/${encodeURIComponent(transId)}.json`,
    {
      method: 'GET',
      headers: {
        Authorization: getComgateAuthHeader()
      }
    }
  );
  const statusJson = await statusRes.json().catch(() => null);
  return { ok: statusRes.ok, statusJson };
}

async function cancelComgateRemotePayment(transId) {
  try {
    const res = await fetch(
      `https://payments.comgate.cz/v2.0/payment/transId/${encodeURIComponent(transId)}.json`,
      {
        method: 'DELETE',
        headers: {
          Authorization: getComgateAuthHeader()
        }
      }
    );
    const json = await res.json().catch(() => null);
    return { ok: res.ok || res.status === 204, json };
  } catch (err) {
    console.warn('[Comgate Cancel Remote Warning]:', err?.message || err);
    return { ok: false, json: null };
  }
}

/**
 * Zkontroluje čekající (pending) objednávku oproti živému stavu na Comgate API v2.0
 * a zároveň vyhodnotí 30minutovou platební lhůtu (PENDING_ORDER_TIMEOUT_MS).
 * Pokud je objednávka na bráně CANCELLED nebo po 30minutové lhůtě, automaticky ji přepne na 'cancelled'.
 * Pokud je na bráně PAID, automaticky ji dokončí a aktivuje Premium.
 */
async function reconcilePendingOrderWithComgate(order, nowMs = Date.now()) {
  if (!order || order.status !== 'pending') {
    return order;
  }

  const orderId = order.id || order.orderId;
  if (!orderId) return order;

  const createdAtMs = parseIsoMillis(order.createdAt) || 0;
  const isExpiredByTime = createdAtMs > 0 && nowMs - createdAtMs > PENDING_ORDER_TIMEOUT_MS;
  const nowIso = new Date(nowMs).toISOString();

  if (hasComgateCredentials() && isRealComgateTransId(order.comgateTransId)) {
    try {
      const statusCheck = await fetchComgatePaymentStatus(order.comgateTransId);
      const statusJson = statusCheck.statusJson;
      if (statusCheck.ok && statusJson && statusJson.code === 0) {
        const remoteStatus = String(statusJson.status || '').toUpperCase();
        const remoteTest =
          statusJson.test === true ||
          statusJson.test === 'true' ||
          statusJson.test === '1' ||
          statusJson.test === 1;

        if (remoteStatus === 'PAID' && (COMGATE_TEST_MODE || !remoteTest)) {
          await applyComgatePaymentTransition({
            orderId,
            transId: statusJson.transId || order.comgateTransId,
            status: 'PAID',
            price: statusJson.price,
            curr: statusJson.curr,
            isSandbox: remoteTest || Boolean(order.isSandbox || COMGATE_TEST_MODE)
          });
          const refreshed = await getOrderDoc(orderId);
          return refreshed ? serializeTimestampFields(refreshed) : { ...order, status: 'paid', paidAt: nowIso };
        }

        if (remoteStatus === 'CANCELLED' || (remoteStatus === 'PENDING' && isExpiredByTime)) {
          if (remoteStatus === 'PENDING' && isExpiredByTime) {
            await cancelComgateRemotePayment(order.comgateTransId);
          }
          await applyComgatePaymentTransition({
            orderId,
            transId: statusJson.transId || order.comgateTransId,
            status: 'CANCELLED',
            isSandbox: remoteTest || Boolean(order.isSandbox || COMGATE_TEST_MODE)
          });
          return { ...order, status: 'cancelled', cancelledAt: nowIso };
        }
      }
    } catch (err) {
      console.warn(`[Comgate Reconcile Pending Order Warning] ${orderId}:`, err?.message || err);
    }
  } else if (isExpiredByTime) {
    await applyComgatePaymentTransition({
      orderId,
      transId: order.comgateTransId || null,
      status: 'CANCELLED',
      isSandbox: Boolean(order.isSandbox)
    });
    return { ...order, status: 'cancelled', cancelledAt: nowIso };
  }

  return order;
}

// 2b. Ověření stavu platby přímo přes Comgate REST API v2.0 (fallback po návratu z brány)
app.post('/api/orders/:orderId/verify-payment', requireAuth, async (req, res) => {
  try {
    const cleanOrderId = String(req.params.orderId || '').trim();
    const markCancelledIfPending = req.body?.markCancelledIfPending === true;
    if (!cleanOrderId) {
      return res.status(400).json({ error: 'Chybí ID objednávky.' });
    }

    const order = await getOrderDoc(cleanOrderId);
    if (!order) {
      return res.status(404).json({ error: 'Objednávka nebyla nalezena.' });
    }

    if (order.userId !== req.user.uid && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Nemáte oprávnění ověřit cizí objednávku.' });
    }

    if (order.status === 'paid') {
      return res.json({ success: true, status: 'paid', alreadyPaid: true });
    }
    if (order.status === 'refunded') {
      return res.json({ success: false, status: 'refunded' });
    }
    if (order.status === 'cancelled') {
      return res.json({ success: false, status: 'cancelled' });
    }

    if (!hasComgateCredentials() || !isRealComgateTransId(order.comgateTransId)) {
      if (markCancelledIfPending && order.status === 'pending') {
        await applyComgatePaymentTransition({
          orderId: cleanOrderId,
          status: 'CANCELLED',
          isSandbox: Boolean(order.isSandbox)
        });
        return res.json({ success: false, status: 'cancelled' });
      }
      return res.json({ success: false, status: order.status || 'pending' });
    }

    let statusJson = null;
    try {
      const statusCheck = await fetchComgatePaymentStatus(order.comgateTransId);
      statusJson = statusCheck.statusJson;
      if (!statusCheck.ok || !statusJson || statusJson.code !== 0) {
        console.warn('[Comgate Status Check Warning]:', statusJson);
        return res.status(502).json({ error: 'Nepodařilo se ověřit stav platby na platební bráně.' });
      }
    } catch (netErr) {
      console.error('[Comgate Status Network Error]:', netErr);
      return res.status(502).json({ error: 'Nepodařilo se spojit s platební bránou Comgate.' });
    }

    if (statusJson.refId && String(statusJson.refId) !== cleanOrderId) {
      return res.status(409).json({ error: 'Neshoda identifikátoru objednávky na platební bráně.' });
    }

    const remoteTest = statusJson.test === true || statusJson.test === 'true' || statusJson.test === '1' || statusJson.test === 1;
    if (!COMGATE_TEST_MODE && remoteTest) {
      return res.status(403).json({ error: 'Testovací transakce není v produkčním režimu povolena.' });
    }

    const remoteStatus = String(statusJson.status || '').toUpperCase();
    const createdAtMs = parseIsoMillis(order.createdAt) || 0;
    const isExpiredByTime = createdAtMs > 0 && Date.now() - createdAtMs > PENDING_ORDER_TIMEOUT_MS;
    const shouldCancelLocally =
      remoteStatus === 'CANCELLED' ||
      ((markCancelledIfPending || isExpiredByTime) && remoteStatus === 'PENDING');

    if (remoteStatus === 'PAID' || shouldCancelLocally) {
      if ((markCancelledIfPending || isExpiredByTime) && remoteStatus === 'PENDING') {
        await cancelComgateRemotePayment(order.comgateTransId);
      }

      const outcome = await applyComgatePaymentTransition({
        orderId: cleanOrderId,
        transId: statusJson.transId || order.comgateTransId,
        status: remoteStatus === 'PAID' ? 'PAID' : 'CANCELLED',
        price: statusJson.price,
        curr: statusJson.curr,
        isSandbox: remoteTest || Boolean(COMGATE_TEST_MODE)
      });

      if (outcome.errorStatus) {
        return res.status(outcome.errorStatus).json({ error: outcome.errorMessage || 'Ověření platby selhalo.' });
      }

      if (remoteStatus === 'PAID') {
        console.log(`[Comgate Verify] Objednávka ${cleanOrderId} ověřena přes API jako ZAPLACENÁ.`);
        return res.json({ success: true, status: 'paid', verifiedViaComgate: true });
      }

      console.log(`[Comgate Verify] Objednávka ${cleanOrderId} označena jako ZRUŠENÁ.`);
      return res.json({ success: false, status: 'cancelled' });
    }

    return res.json({
      success: false,
      status: remoteStatus ? remoteStatus.toLowerCase() : 'pending'
    });
  } catch (err) {
    console.error('[Comgate Verify Payment Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se ověřit stav platby.' });
  }
});

// 2c. Zrušení čekající objednávky uživatelem nebo učitelem (vč. pokusu o zrušení na Comgate)
app.post('/api/orders/:orderId/cancel', requireAuth, async (req, res) => {
  try {
    const cleanOrderId = String(req.params.orderId || '').trim();
    if (!cleanOrderId) {
      return res.status(400).json({ error: 'Chybí ID objednávky.' });
    }

    const order = await getOrderDoc(cleanOrderId);
    if (!order) {
      return res.status(404).json({ error: 'Objednávka nebyla nalezena.' });
    }

    if (order.userId !== req.user.uid && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Nemáte oprávnění zrušit cizí objednávku.' });
    }

    if (order.status === 'paid') {
      return res.status(409).json({ error: 'Uhrazenou objednávku nelze zrušit.' });
    }
    if (order.status === 'refunded') {
      return res.status(409).json({ error: 'Refundovanou objednávku nelze zrušit.' });
    }
    if (order.status === 'cancelled') {
      return res.json({ success: true, status: 'cancelled', alreadyCancelled: true });
    }

    if (hasComgateCredentials() && isRealComgateTransId(order.comgateTransId)) {
      try {
        const statusCheck = await fetchComgatePaymentStatus(order.comgateTransId);
        const remoteStatus = String(statusCheck.statusJson?.status || '').toUpperCase();
        if (statusCheck.ok && statusCheck.statusJson?.code === 0 && remoteStatus === 'PAID') {
          await applyComgatePaymentTransition({
            orderId: cleanOrderId,
            transId: statusCheck.statusJson.transId || order.comgateTransId,
            status: 'PAID',
            price: statusCheck.statusJson.price,
            curr: statusCheck.statusJson.curr,
            isSandbox: Boolean(order.isSandbox || COMGATE_TEST_MODE)
          });
          return res.status(409).json({ error: 'Tato platba již byla na bráně zaplacena.' });
        }
        if (remoteStatus !== 'CANCELLED') {
          await cancelComgateRemotePayment(order.comgateTransId);
        }
      } catch (err) {
        console.warn('[Order Cancel Comgate Sync Warning]:', err?.message || err);
      }
    }

    await applyComgatePaymentTransition({
      orderId: cleanOrderId,
      transId: order.comgateTransId || null,
      status: 'CANCELLED',
      isSandbox: Boolean(order.isSandbox)
    });

    return res.json({
      success: true,
      status: 'cancelled',
      message: 'Objednávka byla zrušena.'
    });
  } catch (err) {
    console.error('[Order Cancel Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se zrušit objednávku.' });
  }
});

// 3. Sandbox simulace platby Comgate (STRICT dev/sandbox gate PŘED requireAuth, shodně s /api/dev/set-role)
app.post('/api/payments/comgate/sandbox-simulate-pay', (req, res, next) => {
  if (!isSandboxSimulationAllowed()) {
    return res.status(404).json({ error: 'Endpoint nenalezen.' });
  }
  return next();
}, requireAuth, async (req, res) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
      return res.status(400).json({ error: 'Chybí identifikátor objednávky (orderId).' });
    }

    const cleanOrderId = orderId.trim();
    const targetUserId = req.user.uid;
    const order = await getOrderDoc(cleanOrderId);
    if (!order) {
      return res.status(404).json({ error: 'Objednávka nebyla nalezena.' });
    }

    if (order.userId !== targetUserId && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Nemáte oprávnění potvrdit cizí objednávku.' });
    }

    if (!order.isSandbox) {
      return res.status(403).json({ error: 'Simulaci platby nelze provést u produkční objednávky.' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Simulaci platby lze provést pouze u čekající objednávky.' });
    }

    const sandboxTransId = `SANDBOX_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`;
    const { iuctoRes } = await finalizePaidOrderAndInvoice({
      orderId: cleanOrderId,
      order,
      comgateTransId: sandboxTransId,
      initRecurringTransId: sandboxTransId,
      isSandbox: true
    });

    return res.json({
      success: true,
      iuctoInvoiceNumber: iuctoRes?.invoiceNumber || null,
      message: 'Platba byla v testovacím režimu úspěšně potvrzena a balíček Premium byl aktivován.'
    });
  } catch (err) {
    console.error('Chyba při sandbox simulaci:', err);
    return res.status(500).json({ error: 'Nepodařilo se nasimulovat platbu.' });
  }
});

// 4. Seznam všech objednávek pro Učitele/Admina
app.get('/api/orders/all', requireAuth, requireTeacher, async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit);
    const maxItems = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(500, Math.round(rawLimit)) : 200;
    const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(maxItems).get();
    const rawOrders = snap.docs.map((doc) => ({ id: doc.id, ...serializeTimestampFields(doc.data()) }));
    const nowMs = Date.now();
    let pendingChecked = 0;
    const orders = await Promise.all(
      rawOrders.map((o) => {
        if (o.status === 'pending' && pendingChecked < 15) {
          pendingChecked += 1;
          return reconcilePendingOrderWithComgate(o, nowMs);
        }
        return Promise.resolve(o);
      })
    );
    return res.json({ success: true, orders });
  } catch (err) {
    console.error('Chyba při načítání objednávek:', err);
    return res.status(500).json({ error: 'Nepodařilo se načíst objednávky.' });
  }
});

// 5. Moje objednávky (pro přihlášeného studenta)
// SEC-26 & SEC-34: Per-user rate limit, max 5 pending Comgate synchronizací s 60s cooldownem a explicitní allowlist polí
app.get('/api/orders/my', requireAuth, ordersMyLimiter, async (req, res) => {
  try {
    const userId = req.user.uid;
    const snap = await db
      .collection('orders')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    const rawOrders = snap.docs
      .map((doc) => ({ id: doc.id, ...serializeTimestampFields(doc.data()) }))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    const nowMs = Date.now();
    const eligibleSyncOrderIds = new Set();
    for (const ord of rawOrders) {
      if (eligibleSyncOrderIds.size >= ORDERS_MY_MAX_COMGATE_SYNC) break;
      if (ord.status !== 'pending') continue;
      const lastChecked = lastComgateCheckAt.get(ord.id) || 0;
      if (nowMs - lastChecked >= ORDER_COMGATE_SYNC_COOLDOWN_MS) {
        eligibleSyncOrderIds.add(ord.id);
        setBoundedMapEntry(lastComgateCheckAt, ord.id, nowMs, DEFAULT_MAP_MAX_ENTRIES);
      }
    }

    const orders = await Promise.all(
      rawOrders.map((o) =>
        eligibleSyncOrderIds.has(o.id) ? reconcilePendingOrderWithComgate(o, nowMs) : Promise.resolve(o)
      )
    );
    orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return res.json({ success: true, orders: orders.map((o) => sanitizeOrderForStudent(o)) });
  } catch (err) {
    console.error('Chyba při načítání mých objednávek:', err);
    return res.status(500).json({ error: 'Nepodařilo se načíst objednávky.' });
  }
});

// 5b. Zrušení předplatného (pouze pro aktivní placené Premium)
app.post('/api/subscription/cancel', requireAuth, subscriptionCancelLimiter, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { reason, immediate } = req.body || {};
    const safeReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : 'Bez udání důvodu';
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const userRef = db.collection('users').doc(userId);
    const snap = await userRef.get();

    if (!snap.exists) {
      return res.status(404).json({ error: 'Uživatelský profil nenalezen.' });
    }

    const userDoc = snap.data() || {};
    if (userDoc.role !== 'premium') {
      return res.status(400).json({ error: 'Předplatné ProEducator Premium není na tomto účtu aktivní.' });
    }

    const periodEndRaw = userDoc.subscriptionPeriodEnd ?? userDoc.subscriptionExpiresAt;
    const periodEndMs = parseIsoMillis(periodEndRaw);
    if (!periodEndMs || periodEndMs <= nowMs) {
      return res.status(400).json({ error: 'Aktivní placené období předplatného vypršelo.' });
    }

    const periodEnd = new Date(periodEndMs).toISOString();
    const enrolledCourseIds = normalizeEnrolledCourseIds(userDoc);
    const fallbackRole = enrolledCourseIds.length > 0 ? 'course' : 'free';

    // SEC-23: Při zrušení na konci období (immediate=false) zachováváme initRecurringTransId,
    // aby případná reaktivace před expirací mohla znovu strhnout platbu a nedávala 3 dny zdarma bez karty.
    // initRecurringTransId se maže pouze při immediate=true, expiraci nebo refundaci.
    const updateData = immediate
      ? {
          role: fallbackRole,
          subscriptionStatus: 'inactive',
          subscriptionCancelledAt: nowIso,
          subscriptionCancelReason: safeReason,
          subscriptionPeriodEnd: periodEnd,
          subscriptionGraceUntil: FieldValue.delete(),
          subscriptionExpiredAt: nowIso,
          initRecurringTransId: FieldValue.delete(),
          recurringCancelled: true,
          recurringCancelledAt: nowIso
        }
      : {
          role: 'premium',
          subscriptionStatus: 'cancelled_at_period_end',
          subscriptionCancelledAt: nowIso,
          subscriptionCancelReason: safeReason,
          subscriptionPeriodEnd: periodEnd,
          recurringCancelled: true,
          recurringCancelledAt: nowIso
        };

    await userRef.set(updateData, { merge: true });
    if (immediate) {
      await syncCustomClaimsIfNeeded(userId, fallbackRole, enrolledCourseIds);
      await revokeUserTokensSafe(userId, 'subscription-cancel-immediate');
    }
    userRoleCache.delete(userId);

    // SEC-22: Notifikaci o zrušení posíláme VÝHRADNĚ na ověřený e-mail z Firebase Auth (nikoli na libovolný billingDetails.invoiceEmail)
    const verifiedAuthEmail = String(req.decodedToken?.email || '').trim();
    const isAuthEmailVerified =
      req.decodedToken?.email_verified === true ||
      (req.decodedToken?.firebase?.sign_in_provider && req.decodedToken.firebase.sign_in_provider !== 'password');
    const notifyEmail = isAuthEmailVerified && isStrictSingleEmail(verifiedAuthEmail) ? verifiedAuthEmail : null;
    // E-mail s potvrzením o zrušení se odesílá pouze při standardním zrušení členství (vypnutí opakovaných plateb ke konci období),
    // při předčasném/okamžitém ukončení se duplicitní e-mail již neodesílá.
    if (notifyEmail && !immediate) {
      sendSubscriptionCancelledEmail({
        to: notifyEmail,
        name: userDoc.billingDetails?.clientName || userDoc.displayName || userDoc.name,
        periodEnd
      }).catch((emailErr) => {
        console.warn('[Subscription Cancel Email Error]:', emailErr?.message || emailErr);
      });
    }

    const formattedEndDate = new Date(periodEnd).toLocaleDateString('cs-CZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    return res.json({
      success: true,
      immediate: Boolean(immediate),
      subscriptionStatus: updateData.subscriptionStatus,
      subscriptionPeriodEnd: periodEnd,
      message: immediate
        ? `Předplatné bylo okamžitě ukončeno a účet byl přepnut na tarif ${fallbackRole === 'course' ? 'Kurz' : 'Free'}.`
        : `Automatické prodlužování předplatného bylo zrušeno. Výhody Premium ti zůstanou plně aktivní až do konce zaplaceného období (${formattedEndDate}). Další platba z karty již neproběhne.`
    });
  } catch (err) {
    console.error('Chyba při rušení předplatného:', err);
    return res.status(500).json({ error: 'Nepodařilo se zrušit předplatné.' });
  }
});

// 5c. Obnovení zrušeného předplatného (pouze cancelled_at_period_end v platném zaplaceném období a s platným initRecurringTransId)
app.post('/api/subscription/reactivate', requireAuth, subscriptionReactivateLimiter, async (req, res) => {
  try {
    const userId = req.user.uid;
    const userRef = db.collection('users').doc(userId);
    const snap = await userRef.get();

    if (!snap.exists) {
      return res.status(404).json({ error: 'Uživatelský profil nenalezen.' });
    }

    const userDoc = snap.data() || {};
    const periodEndMs = parseIsoMillis(userDoc.subscriptionPeriodEnd ?? userDoc.subscriptionExpiresAt);

    if (
      userDoc.role !== 'premium' ||
      userDoc.subscriptionStatus !== 'cancelled_at_period_end' ||
      !periodEndMs ||
      periodEndMs <= Date.now()
    ) {
      return res.status(400).json({
        error: 'Obnovit lze pouze probíhající předplatné ve výpovědní lhůtě před koncem zaplaceného období.'
      });
    }

    // SEC-23: Bez uloženého platebního tokenu nelze zapnout automatické obnovení (zamezuje získání 3 dnů Grace Period zdarma)
    if (typeof userDoc.initRecurringTransId !== 'string' || !userDoc.initRecurringTransId.trim()) {
      return res.status(400).json({
        error: 'Předplatné nelze znovu aktivovat bez uložené platební karty. Založte prosím novou objednávku.'
      });
    }

    const periodEnd = new Date(periodEndMs).toISOString();
    const updateData = {
      role: 'premium',
      subscriptionStatus: 'active',
      subscriptionCancelledAt: null,
      subscriptionCancelReason: null,
      recurringCancelled: false,
      recurringCancelledAt: null,
      subscriptionPeriodEnd: periodEnd
    };

    await userRef.set(updateData, { merge: true });
    userRoleCache.delete(userId);

    return res.json({
      success: true,
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: periodEnd,
      message: 'Předplatné ProEducator Premium bylo úspěšně obnoveno! Automatické prodlužování je aktivní.'
    });
  } catch (err) {
    console.error('Chyba při obnovení předplatného:', err);
    return res.status(500).json({ error: 'Nepodařilo se obnovit předplatné.' });
  }
});

// 5d. Kontrola a automatické vypršení předplatného po uplynutí zaplaceného období (vč. 3denní ochranné lhůty)
app.post('/api/subscription/check-expiry', requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const userRef = db.collection('users').doc(userId);
    const snap = await userRef.get();

    if (!snap.exists) {
      return res.status(404).json({ error: 'Uživatelský profil nenalezen.' });
    }

    const userDoc = snap.data() || {};
    const computed = computeEffectiveUserState(userDoc, Date.now());

    if (computed.updates) {
      await userRef.set(computed.updates, { merge: true });
    }
    if (computed.downgraded) {
      await syncCustomClaimsIfNeeded(userId, computed.role, computed.enrolledCourseIds);
      await revokeUserTokensSafe(userId, 'subscription-expired');
      userRoleCache.delete(userId);
      return res.json({
        expired: true,
        role: computed.role,
        subscriptionStatus: 'inactive',
        message: 'Placené období předplatného skončilo. Účet byl přepnut zpět na odpovídající bezplatný/kurzový tarif.'
      });
    }

    userRoleCache.delete(userId);
    return res.json({
      expired: false,
      inGrace: Boolean(computed.subscriptionGraceUntil),
      subscriptionGraceUntil: computed.subscriptionGraceUntil || null,
      role: computed.role,
      subscriptionStatus: computed.subscriptionStatus,
      subscriptionPeriodEnd: computed.subscriptionPeriodEnd || null
    });
  } catch (err) {
    console.error('Chyba při kontrole vypršení předplatného:', err);
    return res.status(500).json({ error: 'Chyba při kontrole vypršení předplatného.' });
  }
});

async function processRecurringChargeForUser(targetUserId, existingUserDoc = null) {
  // SEC-10: Atomický transakční zámek recurringChargeLockUntil (5 min) na users/{uid},
  // aby manuální /charge-recurring a automatický CRON nikdy nemohly strhnout kartu dvakrát.
  const userRef = db.collection('users').doc(targetUserId);
  const lockOwner = crypto.randomUUID();

  const leaseResult = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      return { errorStatus: 404, error: 'Uživatelský profil nenalezen.' };
    }
    const fresh = snap.data() || {};
    if (!fresh.initRecurringTransId) {
      return {
        errorStatus: 400,
        error: 'Uživatel nemá zaznamenanou žádnou iniciační platbu (initRecurringTransId).'
      };
    }
    if (
      fresh.subscriptionStatus === 'cancelled_at_period_end' ||
      fresh.subscriptionStatus === 'inactive' ||
      fresh.subscriptionStatus === 'expired' ||
      fresh.recurringCancelled === true ||
      Boolean(fresh.subscriptionCancelledAt)
    ) {
      return {
        errorStatus: 400,
        error: 'Předplatné je zrušeno nebo neaktivní. Opakované strhávání nelze provést.'
      };
    }
    const nowMs = Date.now();
    if (Number(fresh.recurringChargeLockUntil || 0) > nowMs) {
      return {
        errorStatus: 409,
        error: 'Opakovaná platba pro tohoto uživatele právě probíhá. Zkuste to za chvíli.'
      };
    }

    tx.set(
      userRef,
      {
        recurringChargeLockUntil: nowMs + RECURRING_CHARGE_LEASE_MS,
        recurringChargeLockOwner: lockOwner
      },
      { merge: true }
    );
    return { ok: true, userDoc: { ...(existingUserDoc || {}), ...fresh } };
  });

  if (!leaseResult.ok) {
    const err = new Error(leaseResult.error);
    err.statusCode = leaseResult.errorStatus;
    throw err;
  }

  const userDoc = leaseResult.userDoc;
  try {
    const plan = PREMIUM_PLANS['premium-monthly'];
    const amount = plan.amount;
    const hasCreds = hasComgateCredentials();
    const isTest = Boolean(COMGATE_TEST_MODE);
    const useComgateRecurringApi = hasCreds && isRealComgateTransId(userDoc.initRecurringTransId);

    // Pokud již existuje čekající (PENDING) opakovaná objednávka z předchozího pokusu, nejprve ověříme její stav u Comgate,
    // abychom nikdy nestrhli platbu dvakrát ani nevystavili fakturu před potvrzením PAID.
    if (userDoc.lastRecurringOrderId) {
      const prevOrder = await getOrderDoc(userDoc.lastRecurringOrderId);
      if (prevOrder && prevOrder.isRecurringRenewal && prevOrder.status === 'pending') {
        if (hasCreds && isRealComgateTransId(prevOrder.comgateTransId)) {
          try {
            const prevCheck = await fetchComgatePaymentStatus(prevOrder.comgateTransId);
            const prevRemoteStatus = String(prevCheck.statusJson?.status || '').toUpperCase();
            if (prevCheck.ok && prevCheck.statusJson?.code === 0) {
              if (prevRemoteStatus === 'PAID') {
                const outcome = await applyComgatePaymentTransition({
                  orderId: prevOrder.id,
                  transId: prevCheck.statusJson.transId || prevOrder.comgateTransId,
                  status: 'PAID',
                  price: prevCheck.statusJson.price,
                  curr: prevCheck.statusJson.curr,
                  isSandbox: Boolean(prevOrder.isSandbox || isTest)
                });
                return {
                  orderId: prevOrder.id,
                  status: 'paid',
                  subscriptionPeriodEnd: outcome.finalized?.periodEnd || userDoc.subscriptionPeriodEnd || null,
                  iuctoInvoiceNumber: outcome.finalized?.iuctoRes?.invoiceNumber || prevOrder.iuctoInvoiceNumber || null
                };
              }
              if (prevRemoteStatus === 'PENDING' || prevRemoteStatus === 'AUTHORIZED') {
                return {
                  orderId: prevOrder.id,
                  status: 'pending',
                  subscriptionPeriodEnd: userDoc.subscriptionPeriodEnd || null,
                  iuctoInvoiceNumber: null
                };
              }
              if (prevRemoteStatus === 'CANCELLED') {
                await applyComgatePaymentTransition({
                  orderId: prevOrder.id,
                  transId: prevCheck.statusJson.transId || prevOrder.comgateTransId,
                  status: 'CANCELLED',
                  isSandbox: Boolean(prevOrder.isSandbox || isTest)
                });
              }
            }
          } catch (prevErr) {
            console.warn('[Comgate Pending Recurring Status Check Warning]:', prevErr?.message || prevErr);
          }
        }
      }
    }

    const newOrderId = `ORD_REC_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const variableSymbol = String(Date.now()).slice(-9);
    let comgateTransId = null;

    if (useComgateRecurringApi) {
      // Dle Comgate API v2.0 dokumentace (/v2.0/recurring.json):
      // - povinný parametr iniciační transakce je `initRecurringId` (vždy transId 1. platby s initRecurring=true)
      // - `label` musí mít délku 1–16 znaků ('ProEdu Premium' = 14 znaků)
      const response = await fetch('https://payments.comgate.cz/v2.0/recurring.json', {
        method: 'POST',
        headers: {
          Authorization: getComgateAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          merchant: COMGATE_MERCHANT_ID,
          initRecurringId: userDoc.initRecurringTransId,
          price: Math.round(amount * 100),
          curr: 'CZK',
          label: 'ProEdu Premium',
          refId: newOrderId,
          test: isTest
        })
      });

      const json = await response.json().catch(() => null);
      if (response.ok && json && json.code === 0 && json.transId) {
        comgateTransId = json.transId;
      } else {
        console.warn('[Comgate Recurring Charge Failed]:', json);
        const failureReason = json?.extraMessage || json?.message || 'Platba byla zamítnuta vydavatelem karty';
        await updateUserDocServer(targetUserId, {
          lastRecurringPaymentFailed: true,
          lastRecurringFailureReason: String(failureReason).slice(0, 300),
          lastRecurringFailedAt: new Date().toISOString()
        }).catch(() => {});
        const notifyEmail = [userDoc.email, userDoc.billingDetails?.invoiceEmail]
          .map((e) => String(e || '').trim())
          .find((e) => isStrictSingleEmail(e));
        if (notifyEmail) {
          sendRecurringChargeFailedEmail({
            to: notifyEmail,
            name: userDoc.billingDetails?.clientName || userDoc.displayName || userDoc.name,
            amount,
            reason: failureReason
          }).catch(console.warn);
        }
        const err = new Error('Opakovaná platba byla platební bránou zamítnuta.');
        err.statusCode = 400;
        throw err;
      }
    } else if (isSandboxSimulationAllowed()) {
      comgateTransId = `SANDBOX_REC_${Date.now()}`;
      console.log(`[Comgate Recurring Simulation] Testovací opakované stržení ${amount} Kč pro ${targetUserId}`);
    } else {
      const err = new Error('Opakované stržení nelze provést bez platné iniciační transakce Comgate.');
      err.statusCode = 400;
      throw err;
    }

    const orderIsSandbox = isTest || !useComgateRecurringApi;
    const billing = userDoc.billingDetails || {};
    const recOrderData = {
      id: newOrderId,
      orderId: newOrderId,
      userId: targetUserId,
      userEmail: userDoc.email || '',
      clientName: billing.clientName || userDoc.displayName || userDoc.name || 'Zákazník ProEdu',
      billingAddress: {
        street: billing.street || '-',
        city: billing.city || '-',
        zip: billing.zip || '00000',
        country: billing.country || 'Česká republika'
      },
      invoiceEmail: billing.invoiceEmail || userDoc.email || '',
      ico: billing.ico || '',
      dic: billing.dic || '',
      amount,
      currency: plan.currency,
      planId: 'premium-monthly',
      planTitle: 'ProEducator Premium (opakované předplatné)',
      paymentMethod: 'comgate',
      status: 'pending',
      isSandbox: orderIsSandbox,
      termsAccepted: true,
      newsletterConsent: false,
      variableSymbol,
      comgateTransId,
      initRecurringTransId: userDoc.initRecurringTransId,
      isRecurringRenewal: true,
      createdAt: new Date().toISOString()
    };

    await saveOrderDoc(newOrderId, recOrderData);
    await updateUserDocServer(targetUserId, { lastRecurringOrderId: newOrderId }).catch(() => {});

    // U reálné Comgate brány code=0 z /v2.0/recurring.json znamená přijetí požadavku (transakce vzniká jako PENDING).
    // Fakturu v iÚčtu vystavujeme a předplatné o 30 dní prodlužujeme VÝHRADNĚ až po potvrzení stavu PAID
    // (buď při okamžitém ověření stavu, nebo asynchronně přes Comgate Push URL webhook /api/payments/comgate/notify).
    if (useComgateRecurringApi) {
      try {
        const statusCheck = await fetchComgatePaymentStatus(comgateTransId);
        const remoteStatus = String(statusCheck.statusJson?.status || '').toUpperCase();
        if (statusCheck.ok && statusCheck.statusJson?.code === 0) {
          if (remoteStatus === 'PAID') {
            const outcome = await applyComgatePaymentTransition({
              orderId: newOrderId,
              transId: comgateTransId,
              status: 'PAID',
              price: statusCheck.statusJson.price,
              curr: statusCheck.statusJson.curr,
              isSandbox: orderIsSandbox
            });
            return {
              orderId: newOrderId,
              status: 'paid',
              subscriptionPeriodEnd: outcome.finalized?.periodEnd || null,
              iuctoInvoiceNumber: outcome.finalized?.iuctoRes?.invoiceNumber || null
            };
          }
          if (remoteStatus === 'CANCELLED') {
            await applyComgatePaymentTransition({
              orderId: newOrderId,
              transId: comgateTransId,
              status: 'CANCELLED',
              isSandbox: orderIsSandbox
            });
            const err = new Error('Opakovaná platba byla platební bránou zamítnuta.');
            err.statusCode = 400;
            throw err;
          }
        }
      } catch (verifyErr) {
        if (verifyErr?.statusCode === 400) {
          throw verifyErr;
        }
        console.warn('[Comgate Recurring Immediate Status Verify Warning]:', verifyErr?.message || verifyErr);
      }

      return {
        orderId: newOrderId,
        status: 'pending',
        subscriptionPeriodEnd: userDoc.subscriptionPeriodEnd || null,
        iuctoInvoiceNumber: null
      };
    }

    // Lokální sandbox simulace (bez živého Comgate) rovnou přechází do PAID
    const outcome = await applyComgatePaymentTransition({
      orderId: newOrderId,
      transId: comgateTransId,
      status: 'PAID',
      price: Math.round(amount * 100),
      curr: plan.currency,
      isSandbox: true
    });

    return {
      orderId: newOrderId,
      status: 'paid',
      subscriptionPeriodEnd: outcome.finalized?.periodEnd || null,
      iuctoInvoiceNumber: outcome.finalized?.iuctoRes?.invoiceNumber || null
    };
  } finally {
    await db
      .runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (snap.exists && snap.data()?.recurringChargeLockOwner === lockOwner) {
          tx.set(
            userRef,
            {
              recurringChargeLockUntil: FieldValue.delete(),
              recurringChargeLockOwner: FieldValue.delete()
            },
            { merge: true }
          );
        }
      })
      .catch(() => {});
  }
}

/**
 * Denní automatika obnovení předplatného a vypršení zrušených tarifů
 * s distribuovaným zámkem v Firestore a per-user transakční ochranou.
 */
async function runDueRecurringSubscriptions() {
  const todayPrague = formatPragueDate(new Date());
  const nowMs = Date.now();
  const summary = {
    checked: 0,
    renewed: 0,
    expired: 0,
    graced: 0,
    failed: 0,
    pendingReconciled: 0,
    iuctoOutboxSynced: 0,
    skippedLocked: false
  };

  const lockRef = db.collection('cronLocks').doc('subscriptionRenewal');
  const lockOwner = crypto.randomUUID();
  const leaseMs = 5 * 60 * 1000;

  try {
    const acquired = await db.runTransaction(async (tx) => {
      const lockSnap = await tx.get(lockRef);
      const lockData = lockSnap.exists ? lockSnap.data() : null;
      if (lockData?.expiresAt && Number(lockData.expiresAt) > Date.now()) {
        return false;
      }
      tx.set(lockRef, {
        owner: lockOwner,
        acquiredAt: Date.now(),
        expiresAt: Date.now() + leaseMs
      });
      return true;
    });

    if (!acquired) {
      summary.skippedLocked = true;
      return summary;
    }

    // 1. Kontrola všech visících PENDING objednávek v kolekci orders oproti Comgate API (/v2.0/payment/transId/{transId}.json)
    // (pokrývá případ chybějícího webhooku nebo opuštěné brány po 30minutové lhůtě)
    try {
      const pendingOrdersSnap = await db.collection('orders').where('status', '==', 'pending').limit(50).get();
      for (const pDoc of pendingOrdersSnap.docs) {
        const pendingOrd = { id: pDoc.id, ...serializeTimestampFields(pDoc.data()) };
        const reconciled = await reconcilePendingOrderWithComgate(pendingOrd, nowMs);
        if (reconciled && reconciled.status !== 'pending') {
          summary.pendingReconciled += 1;
        }
      }
    } catch (pendingErr) {
      console.warn('[Subscription Cron Pending Orders Reconcile Warning]:', pendingErr?.message || pendingErr);
    }

    // 2. Outbox Pattern pro iÚčto: automatické dovystavení faktury u PAID objednávek, kde iÚčto mělo výpadek
    try {
      const paidOrdersSnap = await db.collection('orders').where('status', '==', 'paid').limit(100).get();
      const unsyncedPaid = paidOrdersSnap.docs
        .map((d) => ({ id: d.id, ...serializeTimestampFields(d.data()) }))
        .filter(
          (o) =>
            !o.iuctoInvoiceId &&
            o.iuctoSyncStatus !== 'synced' &&
            o.iuctoSyncStatus !== 'skipped_sandbox' &&
            o.iuctoSyncStatus !== 'refunded'
        )
        .slice(0, 15);

      for (const ord of unsyncedPaid) {
        const iuctoRes = await syncIuctoForPaidOrder({ orderId: ord.id, order: ord });
        if (!iuctoRes.failed && !iuctoRes.skipped && iuctoRes.invoiceNumber) {
          summary.iuctoOutboxSynced += 1;
          const targetEmail = String(ord.invoiceEmail || ord.userEmail || '').trim();
          if (targetEmail && isStrictSingleEmail(targetEmail) && Array.isArray(iuctoRes.attachments) && iuctoRes.attachments.length > 0) {
            const emailClaimed = await db
              .runTransaction(async (tx) => {
                const oRef = db.collection('orders').doc(ord.id);
                const oSnap = await tx.get(oRef);
                if (!oSnap.exists || oSnap.data()?.invoiceEmailSentAt) return false;
                const sentAt = new Date().toISOString();
                tx.set(
                  oRef,
                  {
                    confirmationEmailSentAt: oSnap.data()?.confirmationEmailSentAt || sentAt,
                    invoiceEmailSentAt: sentAt
                  },
                  { merge: true }
                );
                return true;
              })
              .catch(() => false);
            if (emailClaimed) {
              const uDoc = ord.userId ? await getUserDocServer(ord.userId) : null;
              sendPaymentConfirmedEmail({
                to: targetEmail,
                name: ord.clientName || uDoc?.displayName || uDoc?.name || 'zákazníku',
                orderId: ord.id,
                amount: ord.amount || 99,
                periodEnd: uDoc?.subscriptionPeriodEnd || undefined,
                invoiceNumber: iuctoRes.invoiceNumber,
                attachments: iuctoRes.attachments
              }).catch((err) => console.warn('[iÚčto Outbox Email Warning]:', err?.message || err));
            }
          }
        }
      }
    } catch (outboxErr) {
      console.warn('[Subscription Cron iÚčto Outbox Warning]:', outboxErr?.message || outboxErr);
    }

    // 3. Kontrola expirací, 3denní Grace Period a automatické stržení opakovaných plateb (již v den expirace <= 24 h před koncem)
    const snap = await db.collection('users').where('role', '==', 'premium').get();
    const premiumUsers = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));

    for (const userDoc of premiumUsers) {
      const uid = userDoc.uid;
      if (!uid) continue;
      summary.checked += 1;

      const computed = computeEffectiveUserState(userDoc, nowMs);
      if (computed.downgraded) {
        await updateUserDocServer(uid, computed.updates).catch((err) => {
          console.warn(`[Subscription Expiry Error] ${uid}:`, err?.message || err);
        });
        await syncCustomClaimsIfNeeded(uid, computed.role, computed.enrolledCourseIds);
        await revokeUserTokensSafe(uid, 'subscription-expired-cron');
        userRoleCache.delete(uid);
        summary.expired += 1;
        continue;
      }

      const endMs = computed.periodEndMs;
      // Strháváme v den expirace (když do vypršení zbývá <= 24 hodin) i během 3denní Grace Period po vypršení
      if (!endMs || nowMs < endMs - RECURRING_CHARGE_LEAD_MS) {
        continue;
      }

      if (computed.updates) {
        await updateUserDocServer(uid, computed.updates).catch(() => {});
        summary.graced += 1;
      }

      if (
        userDoc.subscriptionStatus === 'active' &&
        userDoc.initRecurringTransId &&
        !userDoc.recurringCancelled &&
        !userDoc.subscriptionCancelledAt
      ) {
        const userRef = db.collection('users').doc(uid);
        const claimed = await db.runTransaction(async (tx) => {
          const freshSnap = await tx.get(userRef);
          if (!freshSnap.exists) return null;
          const fresh = freshSnap.data() || {};
          if (fresh.role !== 'premium' || fresh.subscriptionStatus !== 'active') return null;
          if (fresh.recurringCancelled === true || fresh.subscriptionCancelledAt) return null;
          if (!fresh.initRecurringTransId) return null;
          if (Number(fresh.recurringChargeLockUntil || 0) > Date.now()) return null;
          if (fresh.lastRecurringAttemptDate === todayPrague) return null;
          tx.update(userRef, { lastRecurringAttemptDate: todayPrague });
          return { uid, ...fresh };
        });

        if (!claimed) continue;

        try {
          await processRecurringChargeForUser(uid, claimed);
          summary.renewed += 1;
        } catch (err) {
          summary.failed += 1;
          console.warn(`[Subscription Auto-Renewal Error] ${uid}:`, err?.message || err);
        }
      }
    }
  } catch (cronErr) {
    console.error('[Subscription Scheduler Fatal Error]:', cronErr);
    throw cronErr;
  } finally {
    await db.runTransaction(async (tx) => {
      const lockSnap = await tx.get(lockRef);
      if (lockSnap.exists && lockSnap.data()?.owner === lockOwner) {
        tx.delete(lockRef);
      }
    }).catch(() => {});
  }

  console.log('[Subscription Scheduler Summary]:', summary);
  return summary;
}

// 5c. Ruční vyvolání opakované platby Comgate (výhradně pro učitele / admina)
app.post('/api/payments/comgate/charge-recurring', requireAuth, requireTeacher, async (req, res) => {
  try {
    const targetUserId = String(req.body?.userId || '').trim();
    if (!targetUserId) {
      return res.status(400).json({ error: 'Chybí ID uživatele (userId).' });
    }

    const result = await processRecurringChargeForUser(targetUserId);

    return res.json({
      success: true,
      orderId: result.orderId,
      subscriptionPeriodEnd: result.subscriptionPeriodEnd,
      iuctoInvoiceNumber: result.iuctoInvoiceNumber,
      message: 'Opakovaná platba byla úspěšně zpracována a předplatné bylo prodlouženo.'
    });
  } catch (err) {
    console.error('Chyba při zpracování opakované platby:', err);
    return res.status(err.statusCode || 500).json({
      error: err.statusCode && err.statusCode < 500 ? err.message : 'Nepodařilo se zpracovat opakovanou platbu.'
    });
  }
});

// 5d. Uložení fakturačních údajů (pro iÚčto) a preferované platební metody
app.put('/api/subscription/billing', requireAuth, subscriptionBillingLimiter, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { billingDetails, preferredPaymentMethod } = req.body || {};

    const updateData = {};
    if (preferredPaymentMethod !== undefined && preferredPaymentMethod !== null) {
      if (preferredPaymentMethod !== 'comgate') {
        return res.status(400).json({
          error: 'Pro předplatné je podporována pouze platební brána Comgate (platba kartou online).'
        });
      }
      updateData.preferredPaymentMethod = 'comgate';
    }

    if (billingDetails && typeof billingDetails === 'object') {
      const rawInvoiceEmail =
        billingDetails.invoiceEmail === undefined || billingDetails.invoiceEmail === null
          ? ''
          : String(billingDetails.invoiceEmail);
      const cleanInvoiceEmail = rawInvoiceEmail.trim();
      // SEC-22: Striktní validace jediné e-mailové adresy (zamezení relay/spam přes čárky, středníky, CR/LF)
      if (
        cleanInvoiceEmail &&
        (/[\r\n\0]/.test(rawInvoiceEmail) || !isStrictSingleEmail(cleanInvoiceEmail))
      ) {
        return res.status(400).json({
          error: 'Zadejte prosím jednu platnou e-mailovou adresu pro zasílání faktur.'
        });
      }

      updateData.billingDetails = {
        clientName: String(billingDetails.clientName || '').trim().slice(0, 128),
        invoiceEmail: cleanInvoiceEmail.slice(0, 254),
        street: String(billingDetails.street || '').trim().slice(0, 150),
        city: String(billingDetails.city || '').trim().slice(0, 100),
        zip: String(billingDetails.zip || '').trim().slice(0, 20),
        country: String(billingDetails.country || 'Česká republika').trim().slice(0, 64),
        ico: String(billingDetails.ico || '').trim().slice(0, 20),
        dic: String(billingDetails.dic || '').trim().slice(0, 20)
      };
    }

    if (Object.keys(updateData).length > 0) {
      await updateUserDocServer(userId, updateData);
    }

    if (process.env.IUCTO_API_KEY && updateData.billingDetails) {
      getUserDocServer(userId)
        .then(async (userDoc) => {
          if (!userDoc) return;
          const shouldSync = Boolean(userDoc.iuctoCustomerId) || userDoc.role === 'premium';
          if (!shouldSync) return;
          const customerId = await iuctoService.syncCustomer({ userId, userDoc });
          if (customerId && userDoc.iuctoCustomerId !== customerId) {
            await updateUserDocServer(userId, { iuctoCustomerId: customerId });
          }
        })
        .catch((err) => console.warn('[iÚčto Billing Sync Warning]:', err?.message || err));
    }

    return res.json({
      success: true,
      ...updateData,
      message: 'Fakturační a platební nastavení bylo uloženo.'
    });
  } catch (err) {
    console.error('Chyba při ukládání fakturačních údajů:', err);
    return res.status(500).json({ error: 'Nepodařilo se uložit fakturační údaje.' });
  }
});

// 6. Manuální potvrzení přijetí platby (pro učitele)
// SEC-10: Atomický přechod v Firestore transakci, odmítá již zaplacené / refundované / zrušené objednávky s 409
app.post('/api/orders/:orderId/confirm-manual', requireAuth, requireTeacher, async (req, res) => {
  try {
    const { orderId } = req.params;
    const orderRef = db.collection('orders').doc(orderId);
    const confirmedBy = req.user.email || req.user.uid;

    const txResult = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) {
        return { errorStatus: 404, error: 'Objednávka nenalezena.' };
      }
      const order = { id: snap.id, ...snap.data() };
      if (order.status === 'paid') {
        return { errorStatus: 409, error: 'Tato objednávka již byla potvrzena jako zaplacená.' };
      }
      if (order.status === 'refunded') {
        return { errorStatus: 409, error: 'Refundovanou objednávku nelze potvrdit.' };
      }
      if (order.status === 'cancelled') {
        return { errorStatus: 409, error: 'Zrušenou objednávku nelze potvrdit.' };
      }

      const needsPremiumActivation = !order.premiumActivatedAt;
      const userRef = needsPremiumActivation && order.userId ? db.collection('users').doc(order.userId) : null;
      const userSnap = userRef ? await tx.get(userRef) : null;
      const existingUser = userSnap?.exists ? userSnap.data() : null;

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const orderUpdate = {
        status: 'paid',
        paidAt: order.paidAt || nowIso,
        confirmedBy,
        isSandbox: Boolean(order.isSandbox)
      };

      let periodEnd = null;
      let enrolledCourseIds = [];
      if (needsPremiumActivation) {
        orderUpdate.premiumActivatedAt = nowIso;
        if (userRef) {
          const activationPlan = buildPremiumActivationUpdate(existingUser, {
            nowMs,
            extendFromExisting: true
          });
          periodEnd = activationPlan.periodEnd;
          enrolledCourseIds = activationPlan.enrolledCourseIds;
          tx.set(userRef, activationPlan.updateData, { merge: true });
        }
      }

      tx.set(orderRef, orderUpdate, { merge: true });
      return {
        ok: true,
        order: { ...order, ...orderUpdate },
        premiumActivatedNow: needsPremiumActivation,
        periodEnd,
        enrolledCourseIds
      };
    });

    if (!txResult.ok) {
      return res.status(txResult.errorStatus).json({ error: txResult.error });
    }

    if (txResult.premiumActivatedNow && txResult.order.userId) {
      await syncCustomClaimsIfNeeded(txResult.order.userId, 'premium', txResult.enrolledCourseIds);
      userRoleCache.delete(txResult.order.userId);
    }

    const { iuctoRes } = await finalizePaidOrderAndInvoice({
      orderId,
      order: txResult.order,
      confirmedBy,
      isSandbox: Boolean(txResult.order.isSandbox),
      skipPremiumActivation: true,
      periodEnd: txResult.periodEnd,
      premiumActivatedNow: txResult.premiumActivatedNow
    });

    return res.json({
      success: true,
      iuctoInvoiceNumber: iuctoRes?.invoiceNumber || null,
      message: 'Platba byla potvrzena a Premium bylo studentovi aktivováno.'
    });
  } catch (err) {
    console.error('Chyba při manuálním potvrzení platby:', err);
    return res.status(500).json({ error: 'Nepodařilo se potvrdit platbu.' });
  }
});

// 6c. Stažení PDF faktury z iÚčta přes autorizovaný backend proxy (vlastník objednávky nebo učitel)
// SEC-26: Per-user rate limit + omezená 5min in-memory cache PDF bufferů (max 50 položek) proti vyčerpání kvóty iÚčta
app.get('/api/orders/:orderId/invoice.pdf', requireAuth, orderInvoicePdfLimiter, async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await getOrderDoc(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Objednávka nenalezena.' });
    }

    const isTeacherUser = req.user.role === 'teacher';
    if (!isTeacherUser && order.userId !== req.user.uid) {
      return res.status(403).json({ error: 'Nemáte oprávnění stáhnout fakturu k cizí objednávce.' });
    }

    if (!order.iuctoInvoiceId) {
      return res.status(404).json({ error: 'K této objednávce zatím nebyla vystavena faktura v iÚčtu.' });
    }

    const cacheKey = `${orderId}:${order.iuctoInvoiceId}`;
    let pdfBuffer = getCachedInvoicePdf(cacheKey);
    if (!pdfBuffer) {
      pdfBuffer = await iuctoService.downloadInvoicePdf(order.iuctoInvoiceId);
      if (Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0) {
        setCachedInvoicePdf(cacheKey, pdfBuffer);
      }
    }
    const safeFilename = String(order.iuctoInvoiceNumber || order.variableSymbol || orderId).replace(/[^a-zA-Z0-9_-]/g, '_');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="faktura-${safeFilename}.pdf"`);
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('Chyba při stahování PDF faktury z iÚčta:', err);
    return res.status(err.statusCode || 500).json({ error: 'Nepodařilo se stáhnout PDF faktury.' });
  }
});

// 6d. Ruční opakování / dovystavení faktury v iÚčtu (pro učitele / admina)
app.post('/api/orders/:orderId/iucto-retry', requireAuth, requireTeacher, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { sendEmail: shouldSendEmail = false } = req.body || {};
    const order = await getOrderDoc(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Objednávka nenalezena.' });
    }
    if (order.status !== 'paid') {
      return res.status(400).json({ error: 'Fakturu lze vystavit pouze k uhrazené objednávce.' });
    }

    const iuctoRes = await syncIuctoForPaidOrder({ orderId, order });
    if (iuctoRes.failed) {
      return res.status(502).json({ error: iuctoRes.error || 'Synchronizace s iÚčtem selhala.' });
    }
    if (iuctoRes.locked) {
      return res.status(409).json({ error: 'Synchronizace faktury s iÚčtem právě probíhá. Zkuste to za chvíli.' });
    }
    if (iuctoRes.alreadySynced) {
      return res.json({
        success: true,
        alreadySynced: true,
        iuctoInvoiceId: iuctoRes.iuctoInvoiceId,
        iuctoInvoiceNumber: iuctoRes.invoiceNumber,
        message: `Faktura ${iuctoRes.invoiceNumber || ''} již byla v iÚčtu vystavena.`
      });
    }
    if (iuctoRes.skipped) {
      return res.status(400).json({
        error: iuctoRes.reason === 'sandbox_skipped'
          ? 'Objednávka je testovací (sandbox) a IUCTO_SANDBOX_ENABLED není zapnuto.'
          : 'Chybí IUCTO_API_KEY v konfiguraci serveru.'
      });
    }

    if (shouldSendEmail && order.invoiceEmail) {
      const userDoc = order.userId ? await getUserDocServer(order.userId) : null;
      await sendPaymentConfirmedEmail({
        to: order.invoiceEmail,
        name: order.clientName || userDoc?.displayName || userDoc?.name || 'zákazníku',
        orderId,
        amount: order.amount || 99,
        periodEnd: userDoc?.subscriptionPeriodEnd || undefined,
        invoiceNumber: iuctoRes.invoiceNumber,
        attachments: iuctoRes.attachments
      }).catch((err) => console.warn('[iÚčto Retry Email Error]:', err?.message || err));
    }

    return res.json({
      success: true,
      iuctoInvoiceId: iuctoRes.iuctoInvoiceId,
      iuctoInvoiceNumber: iuctoRes.invoiceNumber,
      message: `Faktura ${iuctoRes.invoiceNumber} byla úspěšně vystavena v iÚčtu.`
    });
  } catch (err) {
    console.error('Chyba při iÚčto retry:', err);
    return res.status(err.statusCode || 500).json({ error: 'Nepodařilo se synchronizovat objednávku s iÚčtem.' });
  }
});

// 6e. Storno / refundace zaplacené objednávky + Comgate refund + okamžité odebrání Premium + dobropis v iÚčtu (pro učitele)
// SEC-10 & SEC-11: Transakční zámek refundLockUntil, uložení status='refunded' a odebrání Premium + revokeRefreshTokens PŘED voláním iÚčto dobropisu
app.post('/api/orders/:orderId/refund', requireAuth, requireTeacher, async (req, res) => {
  const { orderId } = req.params;
  const orderRef = db.collection('orders').doc(orderId);
  const refundLockOwner = crypto.randomUUID();
  let lockHeld = false;

  const releaseRefundLock = async () => {
    if (!lockHeld) return;
    lockHeld = false;
    await db
      .runTransaction(async (tx) => {
        const snap = await tx.get(orderRef);
        if (snap.exists && snap.data()?.refundLockOwner === refundLockOwner) {
          tx.set(
            orderRef,
            {
              refundLockUntil: FieldValue.delete(),
              refundLockOwner: FieldValue.delete()
            },
            { merge: true }
          );
        }
      })
      .catch(() => {});
  };

  try {
    const { reason, sendEmailViaIucto = true } = req.body || {};

    // 0. Atomický transakční zámek refundace (odmítá již refundovanou nebo právě probíhající refundaci s 409)
    const lockResult = await db.runTransaction(async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists) {
        return { errorStatus: 404, error: 'Objednávka nenalezena.' };
      }
      const freshOrder = { id: snap.id, ...snap.data() };
      if (freshOrder.status === 'refunded') {
        return { errorStatus: 409, error: 'Tato objednávka již byla refundována.' };
      }
      if (freshOrder.status !== 'paid') {
        return { errorStatus: 400, error: 'Dobropis / refund lze provést pouze u zaplacené objednávky.' };
      }
      const nowMs = Date.now();
      if (Number(freshOrder.refundLockUntil || 0) > nowMs) {
        return { errorStatus: 409, error: 'Refundace této objednávky právě probíhá. Zkuste to za chvíli.' };
      }
      tx.set(
        orderRef,
        {
          refundLockUntil: nowMs + REFUND_LOCK_LEASE_MS,
          refundLockOwner
        },
        { merge: true }
      );
      return { ok: true, order: freshOrder };
    });

    if (!lockResult.ok) {
      return res.status(lockResult.errorStatus).json({ error: lockResult.error });
    }

    lockHeld = true;
    const order = lockResult.order;
    const safeReason = String(reason || `Storno a vrácení platby objednávky #${orderId}`).trim().slice(0, 500);

    // 1. Pokud jde o reálnou Comgate transakci (živou nebo Comgate test=true), provedeme nejdříve refundaci u brány Comgate
    if (isRealComgateTransId(order.comgateTransId) && hasComgateCredentials()) {
      const refundRes = await fetch('https://payments.comgate.cz/v2.0/refund.json', {
        method: 'POST',
        headers: {
          Authorization: getComgateAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          merchant: COMGATE_MERCHANT_ID,
          test: Boolean(order.isSandbox || COMGATE_TEST_MODE),
          transId: order.comgateTransId,
          price: Math.round(Number(order.amount) * 100),
          curr: String(order.currency || 'CZK').toUpperCase(),
          refId: orderId
        })
      });
      const refundJson = await refundRes.json().catch(() => null);
      if (!refundRes.ok || !refundJson || refundJson.code !== 0) {
        console.error('[Comgate Refund Failed]:', refundJson);
        await releaseRefundLock();
        return res.status(502).json({ error: 'Platební brána Comgate odmítla refundaci platby.' });
      }
    }

    // 2. OKAMŽITĚ po úspěšném Comgate refundu uložíme status='refunded', odebereme Premium,
    // synchronizujeme custom claims a zneplatníme refresh tokeny JEŠTĚ PŘED voláním iÚčto dobropisu!
    const nowIso = new Date().toISOString();
    await updateOrderDoc(orderId, {
      status: 'refunded',
      refundedAt: nowIso,
      refundReason: safeReason,
      refundedBy: req.user.email || req.user.uid,
      refundLockUntil: FieldValue.delete(),
      refundLockOwner: FieldValue.delete()
    });
    lockHeld = false;

    let cachedUserDocForIucto = {};
    if (order.userId) {
      const uRef = db.collection('users').doc(order.userId);
      const uSnap = await uRef.get();
      if (uSnap.exists) {
        const uData = uSnap.data() || {};
        cachedUserDocForIucto = uData;
        const enrolledCourseIds = normalizeEnrolledCourseIds(uData);
        const revertedRole = uData.role === 'teacher'
          ? 'teacher'
          : (enrolledCourseIds.length > 0 ? 'course' : 'free');
        const userUpdates = {
          initRecurringTransId: FieldValue.delete(),
          recurringCancelled: true,
          recurringCancelledAt: nowIso,
          subscriptionCancelledAt: nowIso,
          subscriptionCancelReason: safeReason
        };
        const isDowngradingRole = uData.role === 'premium' && revertedRole !== 'premium';
        if (uData.role === 'premium') {
          userUpdates.role = revertedRole;
          userUpdates.subscriptionStatus = 'inactive';
          userUpdates.subscriptionExpiredAt = nowIso;
          userUpdates.subscriptionGraceUntil = FieldValue.delete();
        }
        await uRef.set(userUpdates, { merge: true });
        await syncCustomClaimsIfNeeded(order.userId, revertedRole, enrolledCourseIds);
        if (isDowngradingRole) {
          await revokeUserTokensSafe(order.userId, 'refund');
        }
        userRoleCache.delete(order.userId);
      }
    }

    // 3. Vystavení dobropisu v iÚčtu (izolováno v try/catch — chyba iÚčta nesmí vrátit 500 ani ponechat Premium)
    let creditNoteResult = null;
    let iuctoWarning = null;
    if (order.iuctoInvoiceId) {
      try {
        creditNoteResult = await iuctoService.issueCreditNote({
          orderId,
          order,
          userDoc: cachedUserDocForIucto || {},
          reason: safeReason,
          sendEmailViaIucto: Boolean(sendEmailViaIucto)
        });
        if (creditNoteResult && !creditNoteResult.skipped) {
          await updateOrderDoc(orderId, {
            iuctoCreditNoteId: creditNoteResult.iuctoCreditNoteId,
            iuctoCreditNoteNumber: creditNoteResult.iuctoCreditNoteNumber,
            iuctoCreditNoteShareUrl: creditNoteResult.iuctoCreditNoteShareUrl || null,
            iuctoCreditNoteStatus: 'issued',
            iuctoCreditNoteError: null,
            iuctoSyncStatus: 'refunded',
            iuctoError: null
          });
        }
      } catch (iuctoErr) {
        const iuctoErrMsg = String(iuctoErr?.message || iuctoErr).slice(0, 500);
        console.warn(`[iÚčto Credit Note Error] Objednávka ${orderId}:`, iuctoErrMsg);
        iuctoWarning = 'Objednávka byla stornována a Premium bylo odebráno, ale vystavení dobropisu v iÚčtu selhalo. Vystavte prosím dobropis ručně.';
        await updateOrderDoc(orderId, {
          iuctoCreditNoteStatus: 'failed',
          iuctoCreditNoteError: iuctoErrMsg,
          iuctoError: iuctoErrMsg
        }).catch(() => {});
      }
    }

    return res.json({
      success: true,
      creditNote: creditNoteResult && !creditNoteResult.skipped ? creditNoteResult : null,
      ...(iuctoWarning ? { iuctoWarning } : {}),
      message: iuctoWarning
        ? iuctoWarning
        : creditNoteResult && !creditNoteResult.skipped
          ? `Objednávka byla stornována a v iÚčtu byl vystaven dobropis ${creditNoteResult.iuctoCreditNoteNumber}.`
          : 'Objednávka byla stornována, platba refundována a Premium přístup odebrán.'
    });
  } catch (err) {
    await releaseRefundLock();
    console.error('Chyba při refundaci objednávky / dobropisu:', err);
    return res.status(err.statusCode || 500).json({ error: 'Nepodařilo se refundovat objednávku.' });
  }
});

// 6f. Diagnostika napojení na iÚčto (pro učitele / admina)
app.get('/api/iucto/status', requireAuth, requireTeacher, async (_req, res) => {
  try {
    const status = await iuctoService.checkConnection();
    return res.json({
      ...status,
      sandboxEnabled: String(process.env.IUCTO_SANDBOX_ENABLED || 'false').toLowerCase() === 'true',
      comgateTestMode: COMGATE_TEST_MODE
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      configured: Boolean(process.env.IUCTO_API_KEY),
      connected: false,
      error: 'Nepodařilo se ověřit spojení s iÚčtem.'
    });
  }
});

// 6g. Manuální nebo externí cron spouštěč pro denní obnovení předplatného
app.post('/api/cron/process-subscriptions', async (req, res) => {
  try {
    const cronSecret = (process.env.CRON_SECRET || '').trim();
    const headerSecret = String(req.headers['x-cron-secret'] || '').trim();

    if (cronSecret && headerSecret && constantTimeSecretEqual(headerSecret, cronSecret)) {
      const summary = await runDueRecurringSubscriptions();
      return res.json({ success: true, summary });
    }

    return requireAuth(req, res, () =>
      requireTeacher(req, res, async () => {
        try {
          const summary = await runDueRecurringSubscriptions();
          return res.json({ success: true, summary });
        } catch (innerErr) {
          console.error('[Cron Manual Trigger Error]:', innerErr);
          return res.status(500).json({ error: 'Spuštění cron úlohy selhalo.' });
        }
      })
    );
  } catch (err) {
    console.error('[Cron Endpoint Error]:', err);
    return res.status(500).json({ error: 'Spuštění cron úlohy selhalo.' });
  }
});

// 6b. Smazání jednotlivé neuhrazené objednávky (pro učitele)
app.delete('/api/orders/:orderId', requireAuth, requireTeacher, async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({ error: 'Chybí ID objednávky.' });
    }

    const docRef = db.collection('orders').doc(orderId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Objednávka nenalezena.' });
    }

    const order = snap.data() || {};
    if (
      order.status === 'paid' ||
      order.status === 'refunded' ||
      order.iuctoInvoiceId ||
      order.comgateTransId
    ) {
      return res.status(409).json({
        error: 'Zaplacenou, refundovanou nebo fakturovanou objednávku nelze smazat. Použijte prosím refundaci.'
      });
    }

    await docRef.delete();
    return res.json({ success: true, message: 'Objednávka byla úspěšně smazána.' });
  } catch (err) {
    console.error('Chyba při mazání objednávky:', err);
    return res.status(500).json({ error: 'Nepodařilo se smazat objednávku.' });
  }
});

// 7. Správa přístupu studenta (role, status a přiřazené kurzy učitelem/adminem)
// SEC-25 & SEC-11: Atomicky synchronizuje courses/{courseId}.studentIds + studentCount, invaliduje cache,
// čistí předplatné při snížení na 'free' i 'student' a revokuje refresh tokeny při snížení role nebo odebrání kurzu.
app.post('/api/students/:studentId/update-access', requireAuth, requireTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { role, enrolledCourseIds } = req.body || {};

    if (!studentId) {
      return res.status(400).json({ error: 'Chybí ID studenta.' });
    }

    const allowedStudentRoles = ['student', 'free', 'premium', 'course'];
    if (typeof role !== 'string' || !allowedStudentRoles.includes(role)) {
      return res.status(400).json({ error: 'Neplatná role studenta.' });
    }

    const safeCourseIds = Array.isArray(enrolledCourseIds)
      ? Array.from(
          new Set(
            enrolledCourseIds
              .filter((id) => typeof id === 'string' && id.trim().length > 0 && isValidMaterialId(id.trim()))
              .map((id) => id.trim())
          )
        ).slice(0, 50)
      : [];

    const effectiveRole = role === 'course' && safeCourseIds.length === 0 ? 'free' : role;
    const userRef = db.collection('users').doc(studentId);

    const txResult = await db.runTransaction(async (tx) => {
      const existingSnap = await tx.get(userRef);
      if (!existingSnap.exists) {
        return { errorStatus: 404, error: 'Student nebyl nalezen.' };
      }
      const existingData = existingSnap.data() || {};
      if (existingData.role === 'teacher') {
        return { errorStatus: 403, error: 'Roli učitele nelze měnit tímto endpointem.' };
      }

      const previousRole = existingData.role || 'free';
      const previousCourseIds = normalizeEnrolledCourseIds(existingData);
      const addedCourseIds = safeCourseIds.filter((id) => !previousCourseIds.includes(id));
      const removedCourseIds = previousCourseIds.filter((id) => !safeCourseIds.includes(id));
      const affectedCourseIds = Array.from(new Set([...addedCourseIds, ...removedCourseIds]));

      const courseSnaps = await Promise.all(
        affectedCourseIds.map((cid) => tx.get(db.collection('courses').doc(cid)))
      );
      const courseSnapById = new Map(affectedCourseIds.map((cid, idx) => [cid, courseSnaps[idx]]));

      const nowIso = new Date().toISOString();
      const updateData = {
        role: effectiveRole,
        enrolledCourseIds: safeCourseIds,
        courseId: safeCourseIds.length > 0 ? safeCourseIds[0] : null,
        updatedAt: nowIso
      };

      if (effectiveRole === 'premium') {
        updateData.premiumSince = existingData.premiumSince || nowIso;
        updateData.subscriptionStatus = 'active';
        updateData.subscriptionCancelledAt = null;
        updateData.subscriptionCancelReason = null;
        updateData.recurringCancelled = false;
        updateData.recurringCancelledAt = null;
        updateData.subscriptionExpiredAt = FieldValue.delete();
        updateData.subscriptionGraceUntil = FieldValue.delete();

        const existingEndMs = parseIsoMillis(existingData.subscriptionPeriodEnd);
        if (!existingEndMs || existingEndMs < Date.now()) {
          updateData.subscriptionPeriodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        }
      } else if (effectiveRole === 'course') {
        updateData.premiumSince = existingData.premiumSince || nowIso;
      } else if (effectiveRole === 'free' || effectiveRole === 'student') {
        updateData.subscriptionStatus = 'inactive';
        updateData.subscriptionExpiredAt = nowIso;
        updateData.subscriptionGraceUntil = FieldValue.delete();
        updateData.initRecurringTransId = FieldValue.delete();
        updateData.recurringCancelled = true;
        updateData.recurringCancelledAt = nowIso;
      }

      tx.set(userRef, updateData, { merge: true });

      const nowTs = Timestamp.now();
      for (const cid of addedCourseIds) {
        const cRef = db.collection('courses').doc(cid);
        const cSnap = courseSnapById.get(cid);
        if (cSnap && cSnap.exists) {
          const existingIds = Array.isArray(cSnap.data()?.studentIds) ? cSnap.data().studentIds : [];
          const nextCount = existingIds.includes(studentId) ? existingIds.length : existingIds.length + 1;
          tx.update(cRef, {
            studentIds: FieldValue.arrayUnion(studentId),
            studentCount: nextCount,
            updatedAt: nowTs
          });
        } else {
          const flagshipFallback = DEFAULT_FLAGSHIP_COURSES.find((c) => c.id === cid);
          if (flagshipFallback) {
            tx.set(cRef, {
              ...flagshipFallback,
              studentIds: [studentId],
              studentCount: 1,
              createdAt: nowTs,
              updatedAt: nowTs
            });
          }
        }
      }

      for (const cid of removedCourseIds) {
        const cRef = db.collection('courses').doc(cid);
        const cSnap = courseSnapById.get(cid);
        if (cSnap && cSnap.exists) {
          const existingIds = Array.isArray(cSnap.data()?.studentIds) ? cSnap.data().studentIds : [];
          const nextCount = existingIds.filter((id) => id !== studentId).length;
          tx.update(cRef, {
            studentIds: FieldValue.arrayRemove(studentId),
            studentCount: nextCount,
            updatedAt: nowTs
          });
        }
      }

      return {
        ok: true,
        previousRole,
        effectiveRole,
        addedCourseIds,
        removedCourseIds
      };
    });

    if (!txResult.ok) {
      return res.status(txResult.errorStatus).json({ error: txResult.error });
    }

    await syncCustomClaimsIfNeeded(studentId, txResult.effectiveRole, safeCourseIds);
    userRoleCache.delete(studentId);
    if (txResult.addedCourseIds.length > 0 || txResult.removedCourseIds.length > 0) {
      invalidateCoursesListCache();
    }

    const isRoleDowngrade =
      (ROLE_PRIVILEGE_RANK[txResult.effectiveRole] ?? 0) < (ROLE_PRIVILEGE_RANK[txResult.previousRole] ?? 0);
    if (isRoleDowngrade || txResult.removedCourseIds.length > 0) {
      await revokeUserTokensSafe(studentId, 'update-access');
    }

    return res.json({
      success: true,
      message: 'Přístup studenta byl úspěšně aktualizován.',
      role: txResult.effectiveRole,
      enrolledCourseIds: safeCourseIds,
      courseId: safeCourseIds.length > 0 ? safeCourseIds[0] : null
    });
  } catch (err) {
    console.error('Chyba při aktualizaci přístupu studenta:', err);
    return res.status(500).json({ error: 'Nepodařilo se aktualizovat přístup studenta.' });
  }
});

async function deleteQueryDocsInBatches(queryRef) {
  const snap = await queryRef.get();
  if (snap.empty) return 0;
  let deleted = 0;
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = db.batch();
    snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += Math.min(450, snap.docs.length - i);
  }
  return deleted;
}

async function cleanupStudentDataServer(uid) {
  userRoleCache.delete(uid);

  const queries = [
    db.collection('assignedTests').where('studentId', '==', uid),
    db.collection('todos').where('studentId', '==', uid),
    db.collection('todos').where('userId', '==', uid),
    db.collection('activePracticeSessions').where('userId', '==', uid),
    db.collection('activePracticeSessions').where('studentId', '==', uid),
    db.collection('focusSessions').where('userId', '==', uid),
    db.collection('questionInquiries').where('studentId', '==', uid),
    db.collection('surveyResponses').where('userId', '==', uid),
    db.collection('bugReports').where('userId', '==', uid),
    db.collection('verifiedPracticeChecks').where('uid', '==', uid)
  ];

  await Promise.all(queries.map((q) => deleteQueryDocsInBatches(q)));
  await db.collection('surveyResponses').doc(uid).delete().catch(() => {});

  // Odstranění studenta ze zapsaných kurzů a lekcí
  const coursesSnap = await db.collection('courses').where('studentIds', 'array-contains', uid).get();
  for (const cDoc of coursesSnap.docs) {
    const nextIds = (cDoc.data()?.studentIds || []).filter((id) => id !== uid);
    await cDoc.ref.update({
      studentIds: FieldValue.arrayRemove(uid),
      studentCount: nextIds.length
    });
  }
  if (!coursesSnap.empty) {
    invalidateCoursesListCache();
  }

  const lessonsSnap = await db.collection('liveLessons').where('studentIds', 'array-contains', uid).get();
  for (const lDoc of lessonsSnap.docs) {
    await lDoc.ref.update({
      studentIds: FieldValue.arrayRemove(uid)
    });
  }

  // Smazání souborů uživatele ze Storage (včetně legacy prefixu bug-reports/{uid}/)
  try {
    const bucket = storage.bucket();
    await bucket.deleteFiles({ prefix: `users/${uid}/` }).catch(() => {});
    await bucket.deleteFiles({ prefix: `bugReports/${uid}/` }).catch(() => {});
    await bucket.deleteFiles({ prefix: `bug-reports/${uid}/` }).catch(() => {});
  } catch {
    // Storage bucket nemusí být v lokálním emulátoru dostupný
  }

  await db.collection('users').doc(uid).delete();
}

// 8. Trvalé smazání studenta učitelem/adminem (z Auth i z Firestore a Storage)
app.delete('/api/students/:studentId', requireAuth, requireTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!studentId) {
      return res.status(400).json({ error: 'Chybí ID studenta.' });
    }

    if (studentId === req.user?.uid) {
      return res.status(400).json({ error: 'Nemůžete smazat svůj vlastní účet.' });
    }

    const uDoc = await db.collection('users').doc(studentId).get();
    if (uDoc.exists && uDoc.data()?.role === 'teacher') {
      return res.status(403).json({ error: 'Účet učitele/administrátora nelze smazat.' });
    }

    let authRec = null;
    try {
      authRec = await auth.getUser(studentId);
    } catch (e) {
      if (e.code !== 'auth/user-not-found') throw e;
    }
    if (authRec?.customClaims?.role === 'teacher') {
      return res.status(403).json({ error: 'Účet učitele/administrátora nelze smazat.' });
    }

    await revokeUserTokensSafe(studentId, 'student-deleted');
    try {
      await auth.deleteUser(studentId);
    } catch (authErr) {
      if (authErr.code !== 'auth/user-not-found') {
        throw authErr;
      }
    }

    await cleanupStudentDataServer(studentId);

    console.log(`[Admin Delete Student]: Uživatel ${studentId} úspěšně smazán.`);
    return res.json({ success: true, message: 'Student byl úspěšně trvale smazán.' });
  } catch (err) {
    console.error('Chyba při mazání studenta učitelem:', err);
    return res.status(500).json({ error: 'Nepodařilo se smazat studenta.' });
  }
});

// 7. Robustní ukládání a asynchronní zpracování studijních materiálů
// Soubory se dělí na bezpečné chunky (~350 KB) v podkolekci learningSheets/{id}/chunks výhradně přes Admin SDK.

const ALLOWED_MATERIAL_MIME_TYPES = new Set([
  'application/pdf',
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const ALLOWED_THUMB_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const MAX_MATERIAL_FILE_BYTES = 28 * 1024 * 1024; // 28 MB binárně
const MAX_THUMBNAIL_BYTES = 500 * 1024; // 500 KB binárně

function normalizeMaterialMimeType(mime) {
  if (typeof mime !== 'string') return '';
  const cleaned = mime.split(';')[0].trim().toLowerCase();
  if (cleaned === 'image/jpg') return 'image/jpeg';
  return cleaned;
}

function isAllowedMaterialMimeType(fileType) {
  return ALLOWED_MATERIAL_MIME_TYPES.has(normalizeMaterialMimeType(fileType));
}

function isValidMaterialId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
}

function sanitizeContentDispositionFilename(name, fallback = 'material.pdf') {
  const cleaned = String(name || fallback)
    .replace(/[\r\n"\\\/]/g, '_')
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}

function inspectMagicBytes(buf, mimeType) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) return { valid: false };
  const norm = normalizeMaterialMimeType(mimeType);
  if (norm === 'application/pdf') {
    return { valid: buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-' };
  }
  if (norm === 'image/png') {
    return {
      valid:
        buf.length >= 8 &&
        buf[0] === 0x89 &&
        buf[1] === 0x50 &&
        buf[2] === 0x4e &&
        buf[3] === 0x47 &&
        buf[4] === 0x0d &&
        buf[5] === 0x0a &&
        buf[6] === 0x1a &&
        buf[7] === 0x0a,
    };
  }
  if (norm === 'image/jpeg') {
    return { valid: buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff };
  }
  if (norm === 'image/gif') {
    if (buf.length < 6) return { valid: false };
    const hdr = buf.subarray(0, 6).toString('ascii');
    return { valid: hdr === 'GIF87a' || hdr === 'GIF89a' };
  }
  if (norm === 'image/webp') {
    return {
      valid:
        buf.length >= 12 &&
        buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buf.subarray(8, 12).toString('ascii') === 'WEBP',
    };
  }
  if (norm === 'image/svg+xml') {
    const rawUtf8 = buf.toString('utf8');
    if (!/<svg[\s>]/i.test(rawUtf8)) return { valid: false };
    const sanitized = sanitizeSvg(rawUtf8);
    if (!sanitized) return { valid: false };
    return { valid: true, sanitizedSvg: sanitized };
  }
  return { valid: false };
}

function createMaterialHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function decodeAndValidateMaterialPayload({ fileData, pdfDataUrl, fileType, svgContent, thumbnailDataUrl }) {
  let thumbBase64 = null;
  let thumbContentType = null;

  if (thumbnailDataUrl !== undefined && thumbnailDataUrl !== null && thumbnailDataUrl !== '') {
    if (typeof thumbnailDataUrl !== 'string') {
      throw createMaterialHttpError(400, 'Neplatný formát miniatury.');
    }
    const thumbMatch = thumbnailDataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/);
    if (!thumbMatch) {
      throw createMaterialHttpError(400, 'Miniatura musí být platný base64 data URL (PNG, JPEG, WEBP nebo GIF).');
    }
    const declaredThumbMime = normalizeMaterialMimeType(thumbMatch[1]);
    if (!ALLOWED_THUMB_MIME_TYPES.has(declaredThumbMime)) {
      throw createMaterialHttpError(400, 'Nepodporovaný formát miniatury. Povoleny jsou pouze PNG, JPEG, WEBP a GIF.');
    }
    const cleanThumb = thumbMatch[2].replace(/\s+/g, '');
    const thumbBuf = Buffer.from(cleanThumb, 'base64');
    if (thumbBuf.length === 0 || thumbBuf.length > MAX_THUMBNAIL_BYTES) {
      throw createMaterialHttpError(400, 'Miniatura překračuje povolený limit 500 KB.');
    }
    if (!inspectMagicBytes(thumbBuf, declaredThumbMime).valid) {
      throw createMaterialHttpError(400, 'Obsah miniatury neodpovídá deklarovanému obrázkovému formátu.');
    }
    thumbBase64 = thumbBuf.toString('base64');
    thumbContentType = declaredThumbMime;
  }

  let effectiveMime = '';
  let cleanFileBase64 = null;
  let fileByteLength = 0;
  let sanitizedSvgString = null;

  const rawSource = fileData || pdfDataUrl || null;
  if (rawSource !== null && rawSource !== undefined && rawSource !== '') {
    if (typeof rawSource !== 'string') {
      throw createMaterialHttpError(400, 'Neplatná binární data souboru.');
    }
    let extractedMime = '';
    let base64Body = rawSource;
    const dataUrlMatch = rawSource.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (dataUrlMatch) {
      extractedMime = normalizeMaterialMimeType(dataUrlMatch[1]);
      base64Body = dataUrlMatch[2];
    }
    effectiveMime = normalizeMaterialMimeType(fileType || extractedMime || 'application/pdf');
    if (!ALLOWED_MATERIAL_MIME_TYPES.has(effectiveMime)) {
      throw createMaterialHttpError(400, 'Nepodporovaný formát souboru. Povoleny jsou soubory PDF, SVG a obrázky.');
    }
    const stripped = base64Body.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(stripped) || stripped.length % 4 !== 0) {
      throw createMaterialHttpError(400, 'Neplatné base64 kódování souboru.');
    }
    const approxBytes = Math.floor((stripped.length * 3) / 4);
    if (approxBytes > MAX_MATERIAL_FILE_BYTES) {
      throw createMaterialHttpError(413, 'Soubor překračuje maximální povolenou velikost 28 MB.');
    }
    const buf = Buffer.from(stripped, 'base64');
    if (buf.length === 0 || buf.length > MAX_MATERIAL_FILE_BYTES) {
      throw createMaterialHttpError(buf.length === 0 ? 400 : 413, 'Neplatná velikost souboru (limit 28 MB).');
    }
    const check = inspectMagicBytes(buf, effectiveMime);
    if (!check.valid) {
      throw createMaterialHttpError(400, 'Obsah souboru neodpovídá deklarovanému formátu.');
    }
    if (effectiveMime === 'image/svg+xml') {
      sanitizedSvgString = check.sanitizedSvg;
      const sanitizedBuf = Buffer.from(sanitizedSvgString, 'utf8');
      cleanFileBase64 = sanitizedBuf.toString('base64');
      fileByteLength = sanitizedBuf.length;
    } else {
      cleanFileBase64 = buf.toString('base64');
      fileByteLength = buf.length;
    }
  } else if (typeof svgContent === 'string' && svgContent.trim()) {
    effectiveMime = 'image/svg+xml';
    const sanitized = sanitizeSvg(svgContent);
    if (!sanitized) {
      throw createMaterialHttpError(400, 'SVG obsah neobsahuje žádný bezpečný a validní vektorový prvek.');
    }
    const sanitizedBuf = Buffer.from(sanitized, 'utf8');
    if (sanitizedBuf.length > MAX_MATERIAL_FILE_BYTES) {
      throw createMaterialHttpError(413, 'SVG obsah překračuje povolenou velikost.');
    }
    sanitizedSvgString = sanitized;
    cleanFileBase64 = sanitizedBuf.toString('base64');
    fileByteLength = sanitizedBuf.length;
  }

  return {
    cleanFileBase64,
    effectiveMime,
    fileByteLength,
    sanitizedSvgString,
    thumbBase64,
    thumbContentType,
  };
}

const LEARNING_SHEETS_CACHE_TTL_MS = 60 * 1000;
const learningSheetsCache = {
  docs: null,
  expiresAt: 0,
  pendingPromise: null,
};

function invalidateLearningSheetsCache() {
  learningSheetsCache.docs = null;
  learningSheetsCache.expiresAt = 0;
  learningSheetsCache.pendingPromise = null;
}

async function loadLearningSheetsFromFirestore(options = {}) {
  const now = Date.now();
  if (!options.forceRefresh && learningSheetsCache.docs && learningSheetsCache.expiresAt > now) {
    return learningSheetsCache.docs;
  }
  if (!options.forceRefresh && learningSheetsCache.pendingPromise) {
    return learningSheetsCache.pendingPromise;
  }
  const promise = db
    .collection('learningSheets')
    .get()
    .then((snap) => {
      const docs = snap.docs.map((d) => serializeTimestampFields({ id: d.id, ...d.data() }));
      learningSheetsCache.docs = docs;
      learningSheetsCache.expiresAt = Date.now() + LEARNING_SHEETS_CACHE_TTL_MS;
      learningSheetsCache.pendingPromise = null;
      return docs;
    })
    .catch((err) => {
      learningSheetsCache.pendingPromise = null;
      throw err;
    });
  learningSheetsCache.pendingPromise = promise;
  return promise;
}

const QUESTION_COUNTS_CACHE_TTL_MS = 60 * 1000;
const questionCountsCache = {
  map: null,
  expiresAt: 0,
  pendingPromise: null,
};

async function loadQuestionCountsBySubtopic() {
  const now = Date.now();
  if (questionCountsCache.map && questionCountsCache.expiresAt > now) {
    return questionCountsCache.map;
  }
  if (questionCountsCache.pendingPromise) {
    return questionCountsCache.pendingPromise;
  }
  const promise = db
    .collection('questions')
    .select('subtopicId')
    .get()
    .then((qSnap) => {
      const counts = new Map();
      qSnap.docs.forEach((qd) => {
        const sid = qd.data()?.subtopicId;
        if (typeof sid === 'string' && sid) {
          counts.set(sid, (counts.get(sid) || 0) + 1);
        }
      });
      questionCountsCache.map = counts;
      questionCountsCache.expiresAt = Date.now() + QUESTION_COUNTS_CACHE_TTL_MS;
      questionCountsCache.pendingPromise = null;
      return counts;
    })
    .catch((err) => {
      questionCountsCache.pendingPromise = null;
      throw err;
    });
  questionCountsCache.pendingPromise = promise;
  return promise;
}

async function createMaterialDoc(materialId, data) {
  const adminData = {
    ...data,
    createdAt: data.createdAt ? new Date(data.createdAt) : Timestamp.now(),
    updatedAt: data.updatedAt ? new Date(data.updatedAt) : Timestamp.now(),
  };
  await db.collection('learningSheets').doc(materialId).set(adminData);
  invalidateLearningSheetsCache();
  return true;
}

async function updateMaterialDoc(materialId, updates) {
  const cleanUpdates = { ...updates };
  delete cleanUpdates.uid;
  delete cleanUpdates.createdAt;
  delete cleanUpdates.createdBy;
  delete cleanUpdates.studentId;
  delete cleanUpdates.testId;

  await db.collection('learningSheets').doc(materialId).set(
    {
      ...cleanUpdates,
      updatedAt: Timestamp.now(),
    },
    { merge: true }
  );
  invalidateLearningSheetsCache();
  return true;
}

async function getMaterialDoc(materialId) {
  if (!isValidMaterialId(materialId)) return null;
  const snap = await db.collection('learningSheets').doc(materialId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

async function saveMaterialChunk(materialId, chunkId, chunkData) {
  await db.collection('learningSheets').doc(materialId).collection('chunks').doc(chunkId).set(chunkData);
  return true;
}

async function getMaterialChunk(materialId, chunkId) {
  const snap = await db.collection('learningSheets').doc(materialId).collection('chunks').doc(chunkId).get();
  if (!snap.exists) return null;
  return snap.data();
}

async function getAllMaterialChunks(materialId) {
  const snap = await db.collection('learningSheets').doc(materialId).collection('chunks').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function deleteMaterialChunksOnly(materialId, options = {}) {
  const { keepPrefix = null, keepIds = [] } = options;
  const keepSet = new Set(keepIds);
  const chunksCol = db.collection('learningSheets').doc(materialId).collection('chunks');

  if (!keepPrefix && keepSet.size === 0) {
    while (true) {
      const snap = await chunksCol.limit(400).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
      await batch.commit();
      if (snap.size < 400) break;
    }
    return true;
  }

  const snap = await chunksCol.get();
  const refsToDelete = snap.docs
    .filter((docSnap) => {
      if (keepSet.has(docSnap.id)) return false;
      if (keepPrefix && docSnap.id.startsWith(keepPrefix)) return false;
      return true;
    })
    .map((docSnap) => docSnap.ref);

  for (let i = 0; i < refsToDelete.length; i += 400) {
    const batch = db.batch();
    refsToDelete.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  return true;
}

async function deleteMaterialWithChunks(materialId) {
  await deleteMaterialChunksOnly(materialId);
  await db.collection('learningSheets').doc(materialId).delete();
  invalidateLearningSheetsCache();
  return true;
}

async function processMaterialInBackground(materialId, options) {
  const { cleanFileBase64, fileByteLength, thumbBase64, thumbContentType, generation, detectedPageCount } = options;
  const chunkPrefix = `${generation}_chunk_`;
  console.log(`[MaterialProcessor] Zahajuji zpracování materiálu ${materialId} (${generation})...`);
  try {
    if (thumbBase64 && thumbContentType) {
      await saveMaterialChunk(materialId, 'thumbnail', {
        data: thumbBase64,
        contentType: thumbContentType,
        generation,
        createdAt: new Date().toISOString(),
      });
    }

    if (cleanFileBase64 && typeof cleanFileBase64 === 'string') {
      const CHUNK_SIZE = 350000;
      const totalChunks = Math.ceil(cleanFileBase64.length / CHUNK_SIZE);
      for (let i = 0; i < totalChunks; i++) {
        const slice = cleanFileBase64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await saveMaterialChunk(materialId, `${chunkPrefix}${String(i).padStart(4, '0')}`, {
          index: i,
          total: totalChunks,
          generation,
          data: slice,
          createdAt: new Date().toISOString(),
        });
      }
    }

    const readyUpdates = {
      status: 'ready',
      fileSize: fileByteLength || 0,
      activeChunkPrefix: cleanFileBase64 ? chunkPrefix : null,
      errorMessage: null,
    };
    if (Number.isFinite(detectedPageCount) && detectedPageCount > 0) {
      readyUpdates.pageCount = detectedPageCount;
    }

    await updateMaterialDoc(materialId, readyUpdates);

    // Starší chunky smažeme až po úspěšném přepnutí activeChunkPrefix na novou generaci
    await deleteMaterialChunksOnly(materialId, {
      keepPrefix: chunkPrefix,
      keepIds: ['thumbnail'],
    });
    invalidateLearningSheetsCache();
    console.log(`[MaterialProcessor] Materiál ${materialId} byl úspěšně zpracován (${generation}).`);
    return {
      status: 'ready',
      errorMessage: null,
      fileSize: readyUpdates.fileSize,
      pageCount: readyUpdates.pageCount ?? null,
    };
  } catch (err) {
    console.error(`[MaterialProcessor] Chyba při zpracování materiálu ${materialId}:`, err);
    try {
      await updateMaterialDoc(materialId, {
        status: 'error',
        errorMessage: 'Chyba při zpracování souboru.',
      });
    } catch (saveErr) {
      console.error(`[MaterialProcessor] Selhalo uložení chybového stavu pro ${materialId}:`, saveErr);
    }
    invalidateLearningSheetsCache();
    return {
      status: 'error',
      errorMessage: 'Chyba při zpracování souboru.',
    };
  }
}

const MATERIAL_FILE_RATE_WINDOW_MS = 10 * 60 * 1000;
const MATERIAL_FILE_RATE_MAX = 45;
const MATERIAL_FILE_DAILY_UNIQUE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MATERIAL_FILE_DAILY_UNIQUE_MAX = 20;
const materialFileViewRateMap = new Map(); // key -> { timestamps: number[] }
const materialFileDailyUniqueMap = new Map(); // key -> { windowStart: number, materialIds: Set<string> }

function checkMaterialFileRateLimit(req, materialId = null) {
  if (req.user?.role === 'teacher') return { allowed: true };
  const key = req.user?.uid ? `uid:${req.user.uid}` : `ip:${getClientIp(req)}`;
  const now = Date.now();
  const cutoff = now - MATERIAL_FILE_RATE_WINDOW_MS;

  if (materialFileViewRateMap.size >= DEFAULT_MAP_MAX_ENTRIES) {
    for (const [k, entry] of materialFileViewRateMap.entries()) {
      const fresh = entry.timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) materialFileViewRateMap.delete(k);
      else entry.timestamps = fresh;
    }
  }

  const entry = materialFileViewRateMap.get(key) || { timestamps: [] };
  const recent = entry.timestamps.filter((t) => t > cutoff);
  if (recent.length >= MATERIAL_FILE_RATE_MAX) {
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + MATERIAL_FILE_RATE_WINDOW_MS - now) / 1000));
    entry.timestamps = recent;
    setBoundedMapEntry(materialFileViewRateMap, key, entry, DEFAULT_MAP_MAX_ENTRIES);
    return { allowed: false, retryAfterSec, reason: 'burst_limit' };
  }

  // SEC-06: Denní strop unikátních materiálů na uživatele/IP (brání automatizovanému scrapování přes /file)
  if (materialId) {
    if (materialFileDailyUniqueMap.size >= DEFAULT_MAP_MAX_ENTRIES) {
      for (const [k, daily] of materialFileDailyUniqueMap.entries()) {
        if (now - daily.windowStart >= MATERIAL_FILE_DAILY_UNIQUE_WINDOW_MS) {
          materialFileDailyUniqueMap.delete(k);
        }
      }
    }
    let daily = materialFileDailyUniqueMap.get(key);
    if (!daily || now - daily.windowStart >= MATERIAL_FILE_DAILY_UNIQUE_WINDOW_MS) {
      daily = { windowStart: now, materialIds: new Set() };
    }
    if (!daily.materialIds.has(materialId)) {
      if (daily.materialIds.size >= MATERIAL_FILE_DAILY_UNIQUE_MAX) {
        const retryAfterSec = Math.max(
          1,
          Math.ceil((daily.windowStart + MATERIAL_FILE_DAILY_UNIQUE_WINDOW_MS - now) / 1000)
        );
        setBoundedMapEntry(materialFileDailyUniqueMap, key, daily, DEFAULT_MAP_MAX_ENTRIES);
        return { allowed: false, retryAfterSec, reason: 'daily_unique_limit' };
      }
      daily.materialIds.add(materialId);
    }
    setBoundedMapEntry(materialFileDailyUniqueMap, key, daily, DEFAULT_MAP_MAX_ENTRIES);
  }

  recent.push(now);
  entry.timestamps = recent;
  setBoundedMapEntry(materialFileViewRateMap, key, entry, DEFAULT_MAP_MAX_ENTRIES);
  return { allowed: true };
}

function isUserPaidOrTeacher(user) {
  if (!user) return false;
  if (user.role === 'teacher' || user.role === 'premium') return true;
  return (
    user.role === 'course' &&
    Array.isArray(user.enrolledCourseIds) &&
    user.enrolledCourseIds.length > 0
  );
}

async function getCourseExemptMaterialIds(enrolledCourseIds) {
  if (!Array.isArray(enrolledCourseIds) || enrolledCourseIds.length === 0) {
    return new Set();
  }
  const cleanIds = Array.from(
    new Set(enrolledCourseIds.filter((id) => typeof id === 'string' && id.trim().length > 0))
  );
  const exemptSet = new Set();
  for (let i = 0; i < cleanIds.length; i += 10) {
    const batch = cleanIds.slice(i, i + 10);
    const snap = await db.collection('courseItems').where('courseId', 'in', batch).get();
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() || {};
      if (data.isHidden === true) return;
      if (typeof data.materialId === 'string' && data.materialId.trim()) {
        exemptSet.add(data.materialId.trim());
      }
      for (const candidateUrl of [data.fileUrl, data.url]) {
        if (typeof candidateUrl === 'string') {
          const match = candidateUrl.match(/\/api\/materials\/([a-zA-Z0-9_-]+)/);
          if (match && match[1]) {
            exemptSet.add(match[1]);
          }
        }
      }
    });
  }
  return exemptSet;
}

async function getMaterialQuotaSummaryForUser(user) {
  if (!user?.uid) {
    return {
      limit: 0,
      used: 0,
      remaining: 0,
      unlockedMaterialIds: [],
      courseExemptMaterialIds: [],
      periodKey: 'none',
      periodEndsAt: null,
      unlimited: false,
    };
  }
  if (user.role === 'teacher') {
    return {
      limit: -1,
      used: 0,
      remaining: -1,
      unlockedMaterialIds: [],
      courseExemptMaterialIds: [],
      periodKey: 'unlimited',
      periodEndsAt: null,
      unlimited: true,
    };
  }
  const isCourse =
    user.role === 'course' && Array.isArray(user.enrolledCourseIds) && user.enrolledCourseIds.length > 0;
  const isPaid = user.role === 'premium' || isCourse;
  if (!isPaid) {
    return {
      limit: 0,
      used: 0,
      remaining: 0,
      unlockedMaterialIds: [],
      courseExemptMaterialIds: [],
      periodKey: 'none',
      periodEndsAt: null,
      unlimited: false,
    };
  }

  const userSnap = await db.collection('users').doc(user.uid).get();
  const userDoc = userSnap.exists ? userSnap.data() || {} : {};
  const { periodKey, periodEndsAt } = computeMaterialQuotaPeriod(userDoc);

  const [quotaSnap, exemptSet] = await Promise.all([
    db.collection('users').doc(user.uid).collection('materialQuotas').doc(periodKey).get(),
    isCourse ? getCourseExemptMaterialIds(user.enrolledCourseIds) : Promise.resolve(new Set()),
  ]);

  const unlockedMaterialIds = Array.isArray(quotaSnap.data()?.unlockedMaterialIds)
    ? quotaSnap.data().unlockedMaterialIds.filter((id) => typeof id === 'string')
    : [];

  return {
    limit: MATERIAL_EXPORT_MONTHLY_LIMIT,
    used: unlockedMaterialIds.length,
    remaining: Math.max(0, MATERIAL_EXPORT_MONTHLY_LIMIT - unlockedMaterialIds.length),
    unlockedMaterialIds,
    courseExemptMaterialIds: Array.from(exemptSet),
    periodKey,
    periodEndsAt,
    unlimited: false,
  };
}

async function authorizeAndConsumeMaterialExport(user, materialId) {
  if (!isValidMaterialId(materialId)) {
    throw createMaterialHttpError(400, 'Neplatné ID materiálu.');
  }
  const mat = await getMaterialDoc(materialId);
  if (!mat) {
    throw createMaterialHttpError(404, 'Materiál nenalezen.');
  }
  if (user?.role !== 'teacher') {
    if (mat.hiddenFromLibrary === true || (mat.status && mat.status !== 'ready')) {
      throw createMaterialHttpError(404, 'Materiál nenalezen.');
    }
  }

  if (user?.role === 'teacher') {
    const quota = await getMaterialQuotaSummaryForUser(user);
    return {
      allowed: true,
      alreadyUnlocked: true,
      courseExempt: false,
      watermarkText: null,
      quota,
    };
  }

  if (!isUserPaidOrTeacher(user)) {
    throw createMaterialHttpError(
      403,
      'Stažení a tisk materiálu vyžaduje předplatné ProEducator Premium nebo aktivní kurz.'
    );
  }

  const watermarkText = buildWatermarkText(user);
  const isCourse =
    user.role === 'course' && Array.isArray(user.enrolledCourseIds) && user.enrolledCourseIds.length > 0;
  const courseExemptSet = isCourse
    ? await getCourseExemptMaterialIds(user.enrolledCourseIds)
    : new Set();

  if (courseExemptSet.has(materialId)) {
    const quota = await getMaterialQuotaSummaryForUser(user);
    return {
      allowed: true,
      alreadyUnlocked: true,
      courseExempt: true,
      watermarkText,
      quota,
    };
  }

  const userRef = db.collection('users').doc(user.uid);
  const txResult = await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const userDoc = userSnap.exists ? userSnap.data() || {} : {};
    const { periodKey, periodEndsAt } = computeMaterialQuotaPeriod(userDoc);
    const quotaRef = userRef.collection('materialQuotas').doc(periodKey);
    const quotaSnap = await tx.get(quotaRef);
    const existingData = quotaSnap.exists ? quotaSnap.data() || {} : {};
    const existingIds = Array.isArray(existingData.unlockedMaterialIds)
      ? existingData.unlockedMaterialIds.filter((id) => typeof id === 'string')
      : [];

    if (existingIds.includes(materialId)) {
      return {
        exceeded: false,
        alreadyUnlocked: true,
        periodKey,
        periodEndsAt,
        unlockedMaterialIds: existingIds,
      };
    }

    if (existingIds.length >= MATERIAL_EXPORT_MONTHLY_LIMIT) {
      return {
        exceeded: true,
        alreadyUnlocked: false,
        periodKey,
        periodEndsAt,
        unlockedMaterialIds: existingIds,
      };
    }

    const nextIds = [...existingIds, materialId];
    tx.set(
      quotaRef,
      {
        uid: user.uid,
        periodKey,
        periodEndsAt,
        limit: MATERIAL_EXPORT_MONTHLY_LIMIT,
        unlockedMaterialIds: nextIds,
        updatedAt: Timestamp.now(),
        ...(quotaSnap.exists ? {} : { createdAt: Timestamp.now() }),
      },
      { merge: true }
    );

    return {
      exceeded: false,
      alreadyUnlocked: false,
      periodKey,
      periodEndsAt,
      unlockedMaterialIds: nextIds,
    };
  });

  const quota = {
    limit: MATERIAL_EXPORT_MONTHLY_LIMIT,
    used: txResult.unlockedMaterialIds.length,
    remaining: Math.max(0, MATERIAL_EXPORT_MONTHLY_LIMIT - txResult.unlockedMaterialIds.length),
    unlockedMaterialIds: txResult.unlockedMaterialIds,
    courseExemptMaterialIds: Array.from(courseExemptSet),
    periodKey: txResult.periodKey,
    periodEndsAt: txResult.periodEndsAt,
    unlimited: false,
  };

  if (txResult.exceeded) {
    const err = createMaterialHttpError(
      429,
      `Vyčerpali jste měsíční limit ${MATERIAL_EXPORT_MONTHLY_LIMIT} stažení a tisků pro aktuální fakturační období.`
    );
    err.code = 'MATERIAL_QUOTA_EXCEEDED';
    err.quota = quota;
    throw err;
  }

  return {
    allowed: true,
    alreadyUnlocked: txResult.alreadyUnlocked,
    courseExempt: false,
    watermarkText,
    quota,
  };
}

function buildLinkedSubtopicLookup(catalogSubtopics, questionCountBySubtopic) {
  const byPairedMaterialId = new Map();

  for (const sub of catalogSubtopics) {
    const pairedId = typeof sub.pairedMaterialId === 'string' ? sub.pairedMaterialId.trim() : '';
    if (!pairedId || byPairedMaterialId.has(pairedId)) continue;

    const cfgTotal =
      Number(sub.practiceConfig?.totalCount) ||
      ((Number(sub.practiceConfig?.easyCount) || 0) +
        (Number(sub.practiceConfig?.mediumCount) || 0) +
        (Number(sub.practiceConfig?.hardCount) || 0));
    const questionCount = cfgTotal || Number(sub.questionCount) || questionCountBySubtopic.get(sub.id) || 0;
    const subjectId = normalizePracticeSubjectId(sub.subjectId || sub.subject || 'Matematika');

    byPairedMaterialId.set(pairedId, {
      id: sub.id,
      title: sub.title || '',
      topicId: sub.topicId || '',
      subjectId,
      stepsCount: Array.isArray(sub.studySteps) ? sub.studySteps.length : 0,
      questionCount,
    });
  }

  return byPairedMaterialId;
}

function resolveLinkedSubtopicForMaterial(material, lookup) {
  if (!material || !lookup) return null;
  return lookup.get(material.id) || null;
}

// 7.0 Katalog studijních materiálů (teaser pro hosty/free/student, plný přístup pro premium/course/teacher)
app.get('/api/materials', optionalAuth, async (req, res) => {
  try {
    const isTeacher = req.user?.role === 'teacher';
    const hasPremiumAccess = isUserPaidOrTeacher(req.user);
    const includeHidden = isTeacher && (req.query.includeHidden === '1' || req.query.includeHidden === 'true');
    const forceRefresh = isTeacher && (req.query.refresh === '1' || req.query.refresh === 'true');

    const [allSheetDocs, catalog, quota] = await Promise.all([
      loadLearningSheetsFromFirestore({ forceRefresh }),
      loadPracticeCatalogFromFirestore({ forceRefresh }).catch(() => ({ rawSubtopics: [], visibleSubtopics: [] })),
      getMaterialQuotaSummaryForUser(req.user),
    ]);

    const catalogSubtopics = isTeacher ? catalog.rawSubtopics || [] : catalog.visibleSubtopics || [];
    const needsQuestionCount = catalogSubtopics.some((s) => {
      if (typeof s.pairedMaterialId !== 'string' || !s.pairedMaterialId.trim()) return false;
      const cfg =
        Number(s.practiceConfig?.totalCount) ||
        ((Number(s.practiceConfig?.easyCount) || 0) +
          (Number(s.practiceConfig?.mediumCount) || 0) +
          (Number(s.practiceConfig?.hardCount) || 0));
      return !cfg && !s.questionCount;
    });

    let questionCountBySubtopic = new Map();
    if (needsQuestionCount) {
      try {
        questionCountBySubtopic = await loadQuestionCountsBySubtopic();
      } catch (qErr) {
        console.warn('[Materials Catalog] Nepodařilo se načíst počty otázek:', qErr?.message || qErr);
      }
    }

    const linkedSubtopicLookup = buildLinkedSubtopicLookup(catalogSubtopics, questionCountBySubtopic);

    const docs = allSheetDocs
      .filter((mat) => {
        if (!isTeacher) {
          if (mat.hiddenFromLibrary === true) return false;
          if (mat.status && mat.status !== 'ready') return false;
        } else if (!includeHidden) {
          if (mat.hiddenFromLibrary === true) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aHasOrd = a.order !== null && a.order !== undefined && a.order !== '' && Number.isFinite(Number(a.order));
        const bHasOrd = b.order !== null && b.order !== undefined && b.order !== '' && Number.isFinite(Number(b.order));
        const aOrd = aHasOrd ? Number(a.order) : 9999;
        const bOrd = bHasOrd ? Number(b.order) : 9999;
        if (aOrd !== bOrd) return aOrd - bOrd;
        const aTime = parseIsoMillis(a.createdAt) ?? 0;
        const bTime = parseIsoMillis(b.createdAt) ?? 0;
        if (bTime !== aTime) return bTime - aTime;
        return String(a.title || '').localeCompare(String(b.title || ''), 'cs');
      });

    const materials = docs.map((m) => {
      const canView = canUserViewMaterial(req.user, m);
      const linkedSubtopic = resolveLinkedSubtopicForMaterial(m, linkedSubtopicLookup);
      const detectedPages =
        m.pageCount !== null && m.pageCount !== undefined && Number.isFinite(Number(m.pageCount)) && Number(m.pageCount) > 0
          ? Number(m.pageCount)
          : detectSvgPageCount(m.svgContent) || (m.fileUrl || m.pdfUrl || m.svgUrl ? 1 : 0);
      const hasOrder = m.order !== null && m.order !== undefined && m.order !== '' && Number.isFinite(Number(m.order));

      const baseMeta = {
        id: m.id,
        title: m.title || 'Studijní materiál',
        subject: m.subject || 'Matematika',
        topic: m.topic || 'Obecné',
        topicId: m.topicId || null,
        subtopicId: m.subtopicId || null,
        materialType: normalizeMaterialType(m.materialType),
        grade: normalizeMaterialGrade(m.grade) || '9',
        hasExplicitGrade: Boolean(normalizeMaterialGrade(m.grade)),
        order: hasOrder ? Number(m.order) : null,
        pageCount: detectedPages,
        isFreeSample: Boolean(m.isFreeSample),
        isExamPrep: Boolean(m.isExamPrep),
        fileType: m.fileType || null,
        originalName: m.originalName || null,
        hasStudyMaterial: m.hasStudyMaterial !== false,
        hiddenFromLibrary: Boolean(m.hiddenFromLibrary),
        status: m.status || 'ready',
        linkedSubtopic,
        createdAt: m.createdAt || null,
      };

      if (!canView) {
        return {
          ...baseMeta,
          locked: true,
          canDownload: false,
          thumbnailUrl: null,
          fileUrl: null,
          pdfUrl: null,
          svgUrl: null,
          downloadUrl: null,
          svgContent: null,
          studyTheory: '',
        };
      }

      const hasFileUrl = Boolean(m.fileUrl || m.pdfUrl || m.svgUrl || m.svgContent || m.activeChunkPrefix);
      const resolvedFileUrl = m.fileUrl || (hasFileUrl ? `/api/materials/${m.id}/file` : null);
      const resolvedThumbUrl = m.thumbnailUrl || (hasFileUrl ? `/api/materials/${m.id}/thumbnail` : null);

      if (!hasPremiumAccess) {
        // Free / host prohlížející ukázku zdarma: online čtení povoleno, stažení PDF nikoli
        return {
          ...baseMeta,
          locked: false,
          canDownload: false,
          thumbnailUrl: resolvedThumbUrl,
          fileUrl: resolvedFileUrl,
          pdfUrl: m.pdfUrl || null,
          svgUrl: m.svgUrl || null,
          downloadUrl: null,
          svgContent: null,
          studyTheory: m.studyTheory || '',
        };
      }

      if (isTeacher) {
        const sanitizedTeacherCopy = {
          ...m,
          ...baseMeta,
          locked: false,
          canDownload: true,
        };
        if (typeof sanitizedTeacherCopy.svgContent === 'string' && sanitizedTeacherCopy.svgContent.trim()) {
          sanitizedTeacherCopy.svgContent = sanitizeSvg(sanitizedTeacherCopy.svgContent);
        }
        return sanitizedTeacherCopy;
      }

      // Platící student (premium / course): čte přes chráněné API (kvůli rate-limitu a vodoznaku)
      const inlineOnlySvg =
        !resolvedFileUrl && typeof m.svgContent === 'string' && m.svgContent.trim()
          ? sanitizeSvg(m.svgContent)
          : null;

      return {
        ...baseMeta,
        locked: false,
        canDownload: true,
        thumbnailUrl: resolvedThumbUrl,
        fileUrl: resolvedFileUrl,
        pdfUrl: m.pdfUrl || null,
        svgUrl: m.svgUrl || null,
        downloadUrl: m.downloadUrl || (hasFileUrl ? `/api/materials/${m.id}/download` : null),
        svgContent: inlineOnlySvg,
        studyTheory: m.studyTheory || '',
      };
    });

    setPublicCatalogCacheHeaders(req, res);
    return res.json({ materials, locked: !hasPremiumAccess, quota });
  } catch (err) {
    console.error('[Materials Catalog Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se načíst katalog materiálů.' });
  }
});

// 7.0b Aktuální stav měsíční kvóty uživatele pro stažení/tisk materiálů
app.get('/api/materials/quota', requireAuth, async (req, res) => {
  try {
    const quota = await getMaterialQuotaSummaryForUser(req.user);
    return res.json({
      quota,
      watermarkText: buildWatermarkText(req.user),
    });
  } catch (err) {
    console.error('[Material Quota Read Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se načíst stav kvóty materiálů.' });
  }
});

// 7.0c Autorizace a případné odečtení kvóty před generováním PDF / tiskem v prohlížeči
app.post('/api/materials/:id/export-authorize', requireAuth, requirePremiumOrTeacher, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await authorizeAndConsumeMaterialExport(req.user, id);
    return res.json(result);
  } catch (err) {
    if (err?.status && err.status < 500) {
      return res.status(err.status).json({
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
        ...(err.quota ? { quota: err.quota } : {}),
      });
    }
    console.error(`[Material Export Authorize Error] (${id}):`, err);
    return res.status(500).json({ error: 'Nepodařilo se ověřit oprávnění k exportu materiálu.' });
  }
});

// 7.1 Zahájení nahrávání materiálu s okamžitou odpovědí (asynchronní zpracování na pozadí)
app.post('/api/materials/upload', requireAuth, requireTeacher, async (req, res) => {
  try {
    const {
      title,
      subject,
      topic,
      topicId,
      subtopicId,
      materialType,
      grade,
      order,
      pageCount,
      isFreeSample,
      isExamPrep,
      studyTheory,
      fileData,
      fileType,
      originalName,
      thumbnailDataUrl,
      svgContent,
      pdfDataUrl,
      hiddenFromLibrary,
    } = req.body || {};

    if (!fileData && !pdfDataUrl && !svgContent && !(typeof studyTheory === 'string' && studyTheory.trim())) {
      return res.status(400).json({ error: 'Chybí obsah souboru nebo textový výklad.' });
    }

    const validated = decodeAndValidateMaterialPayload({
      fileData,
      pdfDataUrl,
      fileType,
      svgContent,
      thumbnailDataUrl,
    });

    const hasFile = Boolean(validated.cleanFileBase64);
    const effectiveFileType = validated.effectiveMime || null;
    const isPdf = effectiveFileType === 'application/pdf';
    const isSvg = effectiveFileType === 'image/svg+xml';

    const cleanTitle = (typeof title === 'string' && title.trim() ? title.trim() : 'Nový studijní materiál').slice(0, 256);
    const cleanSubject = (typeof subject === 'string' && subject.trim() ? subject.trim() : 'Matematika').slice(0, 128);
    const cleanTopic = (typeof topic === 'string' && topic.trim() ? topic.trim() : 'Obecné').slice(0, 128);
    const cleanTopicId = typeof topicId === 'string' && topicId.trim() ? topicId.trim().slice(0, 128) : null;
    const cleanSubtopicId = typeof subtopicId === 'string' && subtopicId.trim() ? subtopicId.trim().slice(0, 128) : null;
    const cleanMaterialType = normalizeMaterialType(materialType);
    const cleanGrade = normalizeMaterialGrade(grade);
    const parsedOrder =
      order !== null && order !== undefined && order !== '' ? Number(order) : NaN;
    const cleanOrder = Number.isFinite(parsedOrder) ? Math.max(-1000, Math.min(10000, parsedOrder)) : null;
    const parsedPageCount =
      pageCount !== null && pageCount !== undefined && pageCount !== '' ? Number(pageCount) : NaN;
    const detectedSvgPages = isSvg ? detectSvgPageCount(validated.sanitizedSvgString) : null;
    const cleanPageCount =
      Number.isFinite(parsedPageCount) && parsedPageCount > 0
        ? Math.min(500, Math.round(parsedPageCount))
        : detectedSvgPages || (hasFile ? 1 : 0);

    const cleanOriginalName = sanitizeContentDispositionFilename(
      originalName || (isSvg ? 'material.svg' : 'material.pdf'),
      isSvg ? 'material.svg' : 'material.pdf'
    );
    const materialId = `mat_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const generation = `gen_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const initialDoc = {
      title: cleanTitle,
      subject: cleanSubject,
      topic: cleanTopic,
      ...(cleanTopicId ? { topicId: cleanTopicId } : {}),
      ...(cleanSubtopicId ? { subtopicId: cleanSubtopicId } : {}),
      materialType: cleanMaterialType,
      ...(cleanGrade ? { grade: cleanGrade } : {}),
      ...(cleanOrder !== null ? { order: cleanOrder } : {}),
      pageCount: cleanPageCount,
      isFreeSample: Boolean(isFreeSample),
      isExamPrep: Boolean(isExamPrep),
      studyTheory: typeof studyTheory === 'string' ? studyTheory.trim().slice(0, 50000) : '',
      hiddenFromLibrary: Boolean(hiddenFromLibrary),
      status: hasFile ? 'processing' : 'ready',
      originalName: hasFile ? cleanOriginalName : null,
      fileType: hasFile ? effectiveFileType : null,
      thumbnailUrl: hasFile || validated.thumbBase64 ? `/api/materials/${materialId}/thumbnail` : null,
      fileUrl: hasFile ? `/api/materials/${materialId}/file` : null,
      pdfUrl: hasFile && isPdf ? `/api/materials/${materialId}/file` : null,
      svgUrl: hasFile && isSvg ? `/api/materials/${materialId}/file` : null,
      downloadUrl: hasFile ? `/api/materials/${materialId}/download` : null,
      ...(validated.sanitizedSvgString && validated.sanitizedSvgString.length <= 200000
        ? { svgContent: validated.sanitizedSvgString }
        : {}),
      hasStudyMaterial: true,
      createdBy: req.user.uid,
    };

    await createMaterialDoc(materialId, initialDoc);

    let finalStatus = initialDoc.status;
    let finalErrorMessage = null;
    if (hasFile || validated.thumbBase64) {
      if (!hasFile && validated.thumbBase64) {
        await saveMaterialChunk(materialId, 'thumbnail', {
          data: validated.thumbBase64,
          contentType: validated.thumbContentType,
          generation,
          createdAt: new Date().toISOString(),
        });
      } else {
        // SEC-15: Zpracování chunků dokončíme před odesláním odpovědi (Cloud Functions v2 po odpovědi přiškrtí CPU)
        const procResult = await processMaterialInBackground(materialId, {
          cleanFileBase64: validated.cleanFileBase64,
          fileByteLength: validated.fileByteLength,
          thumbBase64: validated.thumbBase64,
          thumbContentType: validated.thumbContentType,
          generation,
          detectedPageCount: cleanPageCount,
        });
        finalStatus = procResult?.status || 'ready';
        finalErrorMessage = procResult?.errorMessage || null;
      }
    }

    return res.status(201).json({
      success: finalStatus !== 'error',
      materialId,
      status: finalStatus,
      ...(finalErrorMessage ? { errorMessage: finalErrorMessage } : {}),
      thumbnailUrl: initialDoc.thumbnailUrl,
      fileUrl: initialDoc.fileUrl,
      pdfUrl: initialDoc.pdfUrl,
      svgUrl: initialDoc.svgUrl,
      downloadUrl: initialDoc.downloadUrl,
      fileType: initialDoc.fileType,
      originalName: initialDoc.originalName,
      pageCount: initialDoc.pageCount,
      message:
        finalStatus === 'error'
          ? 'Materiál byl vytvořen, ale zpracování souboru selhalo.'
          : 'Materiál byl úspěšně nahrán a zpracován.',
    });
  } catch (err) {
    if (err?.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Chyba při inicializaci uploadu materiálu:', err);
    return res.status(500).json({ error: 'Nepodařilo se zahájit nahrávání materiálu.' });
  }
});

// 7.1b Úprava existujícího materiálu (včetně bezpečné náhrady či smazání souboru)
app.put('/api/materials/:id', requireAuth, requireTeacher, async (req, res) => {
  const { id } = req.params;
  if (!isValidMaterialId(id)) {
    return res.status(400).json({ error: 'Neplatné ID materiálu.' });
  }
  try {
    const existing = await getMaterialDoc(id);
    if (!existing) {
      return res.status(404).json({ error: 'Materiál nenalezen.' });
    }

    const {
      title,
      subject,
      topic,
      topicId,
      subtopicId,
      materialType,
      grade,
      order,
      pageCount,
      isFreeSample,
      isExamPrep,
      studyTheory,
      fileData,
      fileType,
      originalName,
      thumbnailDataUrl,
      svgContent,
      pdfDataUrl,
      clearFile,
      hiddenFromLibrary,
    } = req.body || {};

    const validated = decodeAndValidateMaterialPayload({
      fileData,
      pdfDataUrl,
      fileType,
      svgContent,
      thumbnailDataUrl,
    });

    const updates = {};
    if (typeof title === 'string' && title.trim()) updates.title = title.trim().slice(0, 256);
    if (typeof subject === 'string' && subject.trim()) updates.subject = subject.trim().slice(0, 128);
    if (typeof topic === 'string') updates.topic = (topic.trim() || 'Obecné').slice(0, 128);
    if (topicId === null) updates.topicId = null;
    else if (typeof topicId === 'string') updates.topicId = topicId.trim() ? topicId.trim().slice(0, 128) : null;
    if (subtopicId === null) updates.subtopicId = null;
    else if (typeof subtopicId === 'string') updates.subtopicId = subtopicId.trim() ? subtopicId.trim().slice(0, 128) : null;
    if (materialType !== undefined) updates.materialType = normalizeMaterialType(materialType);
    if (grade !== undefined) {
      updates.grade = grade === null || grade === '' ? null : normalizeMaterialGrade(grade);
    }
    if (order !== undefined) {
      if (order === null || order === '') {
        updates.order = null;
      } else {
        const parsedOrder = Number(order);
        if (Number.isFinite(parsedOrder)) {
          updates.order = Math.max(-1000, Math.min(10000, parsedOrder));
        }
      }
    }
    if (pageCount !== undefined && pageCount !== null) {
      const parsedPages = Number(pageCount);
      if (Number.isFinite(parsedPages) && parsedPages >= 0) {
        updates.pageCount = Math.min(500, Math.round(parsedPages));
      }
    }
    if (typeof isFreeSample === 'boolean') updates.isFreeSample = isFreeSample;
    if (typeof isExamPrep === 'boolean') updates.isExamPrep = isExamPrep;
    if (typeof studyTheory === 'string') updates.studyTheory = studyTheory.trim().slice(0, 50000);
    if (typeof hiddenFromLibrary === 'boolean') updates.hiddenFromLibrary = hiddenFromLibrary;

    if (validated.cleanFileBase64) {
      const effectiveMime = validated.effectiveMime;
      const isPdf = effectiveMime === 'application/pdf';
      const isSvg = effectiveMime === 'image/svg+xml';
      const cleanOriginalName = sanitizeContentDispositionFilename(
        originalName || (isSvg ? 'material.svg' : 'material.pdf'),
        isSvg ? 'material.svg' : 'material.pdf'
      );
      const generation = `gen_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const vStamp = Date.now();
      const detectedPages = isSvg ? detectSvgPageCount(validated.sanitizedSvgString) : null;
      const effectivePageCount =
        updates.pageCount && updates.pageCount > 0 ? updates.pageCount : detectedPages || 1;

      updates.status = 'processing';
      updates.errorMessage = null;
      updates.originalName = cleanOriginalName;
      updates.fileType = effectiveMime;
      updates.pageCount = effectivePageCount;
      updates.thumbnailUrl = `/api/materials/${id}/thumbnail?v=${vStamp}`;
      updates.fileUrl = `/api/materials/${id}/file?v=${vStamp}`;
      updates.pdfUrl = isPdf ? updates.fileUrl : null;
      updates.svgUrl = isSvg ? updates.fileUrl : null;
      updates.downloadUrl = `/api/materials/${id}/download`;
      updates.hasStudyMaterial = true;
      updates.svgContent =
        isSvg && validated.sanitizedSvgString && validated.sanitizedSvgString.length <= 200000
          ? validated.sanitizedSvgString
          : null;

      await updateMaterialDoc(id, updates);

      // SEC-15: Zpracování chunků dokončíme před odesláním odpovědi (Cloud Functions v2 po odpovědi přiškrtí CPU)
      const procResult = await processMaterialInBackground(id, {
        cleanFileBase64: validated.cleanFileBase64,
        fileByteLength: validated.fileByteLength,
        thumbBase64: validated.thumbBase64,
        thumbContentType: validated.thumbContentType,
        generation,
        detectedPageCount: effectivePageCount,
      });
      const finalStatus = procResult?.status || 'ready';
      const finalErrorMessage = procResult?.errorMessage || null;

      return res.status(200).json({
        success: finalStatus !== 'error',
        materialId: id,
        ...updates,
        status: finalStatus,
        ...(finalErrorMessage ? { errorMessage: finalErrorMessage } : {}),
      });
    }

    if (validated.thumbBase64 && validated.thumbContentType) {
      await saveMaterialChunk(id, 'thumbnail', {
        data: validated.thumbBase64,
        contentType: validated.thumbContentType,
        createdAt: new Date().toISOString(),
      });
      updates.thumbnailUrl = `/api/materials/${id}/thumbnail?v=${Date.now()}`;
    }

    if (clearFile) {
      updates.fileUrl = null;
      updates.pdfUrl = null;
      updates.svgUrl = null;
      updates.downloadUrl = null;
      updates.thumbnailUrl = null;
      updates.fileType = null;
      updates.originalName = null;
      updates.svgContent = null;
      updates.activeChunkPrefix = null;
      updates.fileSize = 0;
      updates.pageCount = 0;
      updates.status = 'ready';
      updates.errorMessage = null;
      await updateMaterialDoc(id, updates);
      await deleteMaterialChunksOnly(id);
    } else {
      await updateMaterialDoc(id, updates);
    }

    return res.json({
      success: true,
      materialId: id,
      status: updates.status || existing.status || 'ready',
      ...updates,
    });
  } catch (err) {
    if (err?.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(`Chyba při úpravě materiálu ${id}:`, err);
    return res.status(500).json({ error: 'Nepodařilo se upravit materiál.' });
  }
});

// 7.1c Stav zpracování materiálu (chráněno pro premium/course/teacher)
app.get('/api/materials/:id/status', requireAuth, requirePremiumOrTeacher, async (req, res) => {
  const { id } = req.params;
  if (!isValidMaterialId(id)) {
    return res.status(400).json({ error: 'Neplatné ID materiálu.' });
  }
  try {
    const mat = await getMaterialDoc(id);
    if (!mat) {
      return res.status(404).json({ error: 'Materiál nenalezen.' });
    }
    if (mat.hiddenFromLibrary === true && req.user.role !== 'teacher') {
      return res.status(404).json({ error: 'Materiál nenalezen.' });
    }
    return res.json({
      materialId: id,
      status: mat.status || 'ready',
      errorMessage: mat.errorMessage || null,
      fileSize: mat.fileSize || null,
      pageCount: mat.pageCount || null,
      fileUrl: mat.fileUrl || null,
      pdfUrl: mat.pdfUrl || null,
      svgUrl: mat.svgUrl || null,
      thumbnailUrl: mat.thumbnailUrl || null,
      downloadUrl: mat.downloadUrl || null,
      fileType: mat.fileType || null,
      originalName: mat.originalName || null,
    });
  } catch (err) {
    console.error(`Chyba při čtení stavu materiálu ${id}:`, err);
    return res.status(500).json({ error: 'Nepodařilo se ověřit stav materiálu.' });
  }
});

// 7.2 Servírování náhledové miniatury (premium/course/teacher, nebo ukázka zdarma pro ostatní)
app.get('/api/materials/:id/thumbnail', optionalAuth, async (req, res) => {
  const { id } = req.params;
  if (!isValidMaterialId(id)) {
    return res.status(400).json({ error: 'Neplatné ID materiálu.' });
  }
  try {
    const mat = await getMaterialDoc(id);
    if (!mat) {
      return res.status(404).json({ error: 'Materiál nenalezen.' });
    }
    if (mat.hiddenFromLibrary === true && req.user?.role !== 'teacher') {
      return res.status(404).json({ error: 'Materiál nenalezen.' });
    }
    if (mat.status && mat.status !== 'ready' && req.user?.role !== 'teacher') {
      return res.status(404).json({ error: 'Materiál zatím není dostupný.' });
    }
    if (!canUserViewMaterial(req.user, mat)) {
      if (!req.user) {
        return res.status(401).json({ error: 'Pro zobrazení náhledu se přihlaste.' });
      }
      return res.status(403).json({ error: 'Tento náhled je dostupný pouze s předplatným Premium.' });
    }

    const thumbChunk = await getMaterialChunk(id, 'thumbnail');
    if (thumbChunk && thumbChunk.data) {
      const buf = Buffer.from(thumbChunk.data, 'base64');
      const safeContentType = ALLOWED_THUMB_MIME_TYPES.has(normalizeMaterialMimeType(thumbChunk.contentType))
        ? normalizeMaterialMimeType(thumbChunk.contentType)
        : 'image/jpeg';
      res.setHeader('Content-Type', safeContentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store');
      return res.send(buf);
    }

    const isProcessing = mat.status === 'processing';
    const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300" fill="none">
      <rect width="400" height="300" rx="16" fill="#F8FAFC"/>
      <rect x="1" y="1" width="398" height="298" rx="15" stroke="#E2E8F0" stroke-width="2"/>
      <circle cx="200" cy="130" r="36" fill="${isProcessing ? '#FEF3C7' : '#EFF6FF'}"/>
      <path d="M190 120 L210 120 L210 140 L190 140 Z" fill="${isProcessing ? '#D97706' : '#3B82F6'}" opacity="0.3"/>
      <text x="200" y="195" text-anchor="middle" fill="#64748B" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="600">
        ${isProcessing ? 'Zpracovává se na pozadí...' : 'Studijní materiál'}
      </text>
    </svg>`;

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(placeholderSvg);
  } catch (err) {
    console.error(`Chyba při servírování miniatury pro ${id}:`, err);
    return res.status(500).json({ error: 'Nepodařilo se načíst náhled materiálu.' });
  }
});

// 7.3 Servírování plného souboru (online čtení i s ukázkou zdarma; download přes kvótu a vodoznak)
async function serveMaterialFile(req, res, asDownload = false) {
  const { id } = req.params;
  if (!isValidMaterialId(id)) {
    return res.status(400).json({ error: 'Neplatné ID materiálu.' });
  }
  try {
    const mat = await getMaterialDoc(id);
    if (!mat) {
      return res.status(404).json({ error: 'Materiál nenalezen.' });
    }
    if (mat.hiddenFromLibrary === true && req.user?.role !== 'teacher') {
      return res.status(404).json({ error: 'Materiál nenalezen.' });
    }
    if (mat.status && mat.status !== 'ready' && req.user?.role !== 'teacher') {
      return res.status(404).json({ error: 'Materiál zatím není dostupný.' });
    }

    let quotaInfo = null;
    if (asDownload) {
      const exportAuth = await authorizeAndConsumeMaterialExport(req.user, id);
      quotaInfo = exportAuth.quota;
    } else {
      if (!canUserViewMaterial(req.user, mat)) {
        if (!req.user) {
          return res.status(401).json({ error: 'Pro zobrazení materiálu se prosím přihlaste.' });
        }
        return res.status(403).json({ error: 'Tento materiál vyžaduje předplatné ProEducator Premium.' });
      }
      const rateCheck = checkMaterialFileRateLimit(req, id);
      if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSec));
        const rateMsg =
          rateCheck.reason === 'daily_unique_limit'
            ? 'Dosáhli jste denního limitu zobrazených studijních materiálů. Zkuste to prosím zítra.'
            : 'Příliš mnoho načtených materiálů za krátkou dobu. Zkuste to prosím za několik minut.';
        return res.status(429).json({ error: rateMsg });
      }
    }

    const allChunks = await getAllMaterialChunks(id);
    let dataChunks = allChunks.filter((c) => c.id !== 'thumbnail' && c.index !== undefined);
    if (mat.activeChunkPrefix) {
      const prefixed = dataChunks.filter((c) => c.id.startsWith(mat.activeChunkPrefix));
      if (prefixed.length > 0) {
        dataChunks = prefixed;
      }
    }

    let buf;
    let contentType = normalizeMaterialMimeType(
      mat.fileType || (mat.originalName?.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'application/pdf')
    );

    if (dataChunks.length === 0) {
      if (typeof mat.svgContent === 'string' && mat.svgContent.trim()) {
        const cleanSvg = sanitizeSvg(mat.svgContent);
        if (!cleanSvg) {
          return res.status(422).json({ error: 'SVG obsah materiálu neprošel bezpečnostní kontrolou.' });
        }
        buf = Buffer.from(cleanSvg, 'utf8');
        contentType = 'image/svg+xml';
      } else {
        return res.status(404).json({ error: 'Soubor materiálu ještě není připraven nebo chybí.' });
      }
    } else {
      dataChunks.sort((a, b) => a.index - b.index);
      const fullBase64 = dataChunks.map((c) => c.data).join('');
      buf = Buffer.from(fullBase64, 'base64');
      if (contentType === 'image/svg+xml') {
        const cleanSvg = sanitizeSvg(buf.toString('utf8'));
        if (!cleanSvg) {
          return res.status(422).json({ error: 'SVG obsah materiálu neprošel bezpečnostní kontrolou.' });
        }
        buf = Buffer.from(cleanSvg, 'utf8');
        if (!Number.isFinite(Number(mat.pageCount)) || Number(mat.pageCount) <= 1) {
          const detected = detectSvgPageCount(cleanSvg);
          if (detected && detected > 1) {
            updateMaterialDoc(id, { pageCount: detected }).catch(() => {});
          }
        }
      }
    }

    if (!ALLOWED_MATERIAL_MIME_TYPES.has(contentType)) {
      contentType = 'application/octet-stream';
    }

    const fallbackName = contentType === 'image/svg+xml' ? 'material.svg' : 'material.pdf';
    const filename = sanitizeContentDispositionFilename(mat.originalName, fallbackName);
    const asciiFilename = filename.replace(/[^\x20-\x7e]/g, '_') || fallbackName;
    const dispositionType = asDownload ? 'attachment' : 'inline';

    const watermarkText =
      req.user?.role === 'teacher'
        ? null
        : req.user
          ? buildWatermarkText(req.user)
          : 'ProEducator.eu — Ukázka';

    // SEC-06: Serverové forenzní vodoznaky přímo do bajtů SVG i PDF pro všechny neučitelské uživatele (/file i /download)
    if (watermarkText) {
      if (contentType === 'image/svg+xml') {
        const watermarkedSvg = embedWatermarkIntoSvg(buf.toString('utf8'), watermarkText);
        buf = Buffer.from(watermarkedSvg, 'utf8');
      } else if (contentType === 'application/pdf') {
        buf = await embedWatermarkIntoPdf(buf, watermarkText);
      }
      res.setHeader('X-Watermark-Text', encodeURIComponent(watermarkText));
    }
    if (quotaInfo) {
      res.setHeader('X-Quota-Remaining', String(quotaInfo.remaining));
      res.setHeader('X-Quota-Limit', String(quotaInfo.limit));
    }
    res.setHeader('Access-Control-Expose-Headers', 'X-Watermark-Text, X-Quota-Remaining, X-Quota-Limit');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    res.setHeader('Content-Type', contentType === 'image/svg+xml' ? 'image/svg+xml; charset=utf-8' : contentType);
    if (contentType === 'image/svg+xml') {
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${dispositionType}; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(buf);
  } catch (err) {
    if (err?.status && err.status < 500) {
      return res.status(err.status).json({
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
        ...(err.quota ? { quota: err.quota } : {}),
      });
    }
    console.error(`Chyba při servírování souboru materiálu ${id}:`, err);
    return res.status(500).json({ error: 'Nepodařilo se načíst soubor materiálu.' });
  }
}

app.get('/api/materials/:id/file', optionalAuth, (req, res) =>
  serveMaterialFile(req, res, false)
);
app.get('/api/materials/:id/download', requireAuth, requirePremiumOrTeacher, (req, res) =>
  serveMaterialFile(req, res, true)
);

// 7.4 Smazání materiálu včetně všech jeho podkolekcí chunks
app.delete('/api/materials/:id', requireAuth, requireTeacher, async (req, res) => {
  const { id } = req.params;
  if (!isValidMaterialId(id)) {
    return res.status(400).json({ error: 'Neplatné ID materiálu.' });
  }
  try {
    await deleteMaterialWithChunks(id);
    return res.json({ success: true, message: 'Materiál byl úspěšně smazán.' });
  } catch (err) {
    console.error(`Chyba při mazání materiálu ${id}:`, err);
    return res.status(500).json({ error: 'Nepodařilo se smazat materiál.' });
  }
});

// =========================================================================
// 8. PROCVIČOVÁNÍ, STUDIJNÍ REŽIM A GUEST DEMO (SERVER-AUTHORITATIVE)
// =========================================================================

const GUEST_DEMO_COOKIE_NAME = 'proedu_guest_demo';
const GUEST_DEMO_MAX_ATTEMPTS = 5;
const DEV_EPHEMERAL_GUEST_SECRET = crypto.randomBytes(32).toString('hex');
const guestDemoIpDailyQuota = new Map(); // ip -> { date, count }

function getGuestDemoSecret() {
  const configured = (process.env.GUEST_DEMO_SECRET || '').trim();
  if (configured.length >= 16) return configured;
  const regConfigured = (process.env.REGISTRATION_ENCRYPTION_SECRET || '').trim();
  if (regConfigured.length >= 16) {
    // SEC-37: Doménově oddělený záložní klíč místo přímého sdílení REGISTRATION_ENCRYPTION_SECRET
    return deriveDomainSeparatedSecret(regConfigured, 'proedu:guest-demo:v1');
  }
  if (process.env.NODE_ENV === 'production' && !isEmulatorMode) {
    throw new Error('GUEST_DEMO_SECRET / REGISTRATION_ENCRYPTION_SECRET není nakonfigurováno.');
  }
  return DEV_EPHEMERAL_GUEST_SECRET;
}

function getPreviousPragueDateString(todayStr) {
  const [y, m, d] = String(todayStr).split('-').map(Number);
  const prev = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0) - 86400000);
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`;
}

function parseCookies(req) {
  const header = req.headers?.cookie;
  const result = {};
  if (!header || typeof header !== 'string') return result;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

function signGuestDemoState(stateObj) {
  const payloadB64 = Buffer.from(JSON.stringify(stateObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getGuestDemoSecret()).update(payloadB64).digest('hex');
  return `${payloadB64}.${sig}`;
}

function verifyGuestDemoCookieValue(rawCookie) {
  const today = getPragueDateString();
  const freshState = {
    d: today,
    u: 0,
    sid: crypto.randomBytes(8).toString('hex'),
  };
  if (!rawCookie || typeof rawCookie !== 'string') {
    return { state: freshState, validCookie: false };
  }
  const dotIdx = rawCookie.lastIndexOf('.');
  if (dotIdx <= 0) {
    return { state: freshState, validCookie: false };
  }
  const payloadB64 = rawCookie.slice(0, dotIdx);
  const sigHex = rawCookie.slice(dotIdx + 1);
  const expectedSig = crypto.createHmac('sha256', getGuestDemoSecret()).update(payloadB64).digest('hex');
  if (!constantTimeSecretEqual(sigHex, expectedSig)) {
    return { state: freshState, validCookie: false };
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || parsed.d !== today) {
      return { state: freshState, validCookie: false };
    }
    const used = Math.max(0, Math.min(GUEST_DEMO_MAX_ATTEMPTS, Number(parsed.u) || 0));
    return {
      state: {
        d: today,
        u: used,
        sid: typeof parsed.sid === 'string' && parsed.sid ? parsed.sid : freshState.sid,
      },
      validCookie: true,
    };
  } catch {
    return { state: freshState, validCookie: false };
  }
}

function pruneGuestIpQuota(today) {
  if (guestDemoIpDailyQuota.size < DEFAULT_MAP_MAX_ENTRIES) return;
  for (const [ip, entry] of guestDemoIpDailyQuota.entries()) {
    if (!entry || entry.date !== today) {
      guestDemoIpDailyQuota.delete(ip);
    }
  }
}

function getEffectiveGuestDemoState(req) {
  const today = getPragueDateString();
  pruneGuestIpQuota(today);
  const ip = getClientIp(req);
  const ipEntry = guestDemoIpDailyQuota.get(ip);
  const ipUsed = ipEntry && ipEntry.date === today ? ipEntry.count : 0;

  const cookies = parseCookies(req);
  const { state, validCookie } = verifyGuestDemoCookieValue(cookies[GUEST_DEMO_COOKIE_NAME]);
  const effectiveUsed = Math.max(state.u, ipUsed);
  return {
    today,
    ip,
    state: { ...state, u: effectiveUsed },
    validCookie,
    remaining: Math.max(0, GUEST_DEMO_MAX_ATTEMPTS - effectiveUsed),
  };
}

function writeGuestDemoCookie(req, res, state) {
  const isHttps =
    process.env.NODE_ENV === 'production' ||
    Boolean(req.secure) ||
    String(req.headers?.['x-forwarded-proto'] || '').toLowerCase().includes('https');
  res.cookie(GUEST_DEMO_COOKIE_NAME, signGuestDemoState(state), {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
}

async function consumeGuestDemoAttempt(req, res) {
  const current = getEffectiveGuestDemoState(req);
  if (current.state.u >= GUEST_DEMO_MAX_ATTEMPTS) {
    writeGuestDemoCookie(req, res, current.state);
    return { allowed: false, remaining: 0 };
  }

  // SEC-09: Sdílená denní demo kvóta přes Firestore (brání obejití přes více instancí nebo smazání cookie)
  const distributedDaily = await checkDistributedRateLimit({
    key: `guest-demo-daily:${current.today}:${current.ip}`,
    windowMs: 24 * 60 * 60 * 1000,
    max: GUEST_DEMO_MAX_ATTEMPTS,
  });
  if (!distributedDaily.allowed) {
    const maxedState = { ...current.state, u: GUEST_DEMO_MAX_ATTEMPTS };
    setBoundedMapEntry(
      guestDemoIpDailyQuota,
      current.ip,
      { date: current.today, count: GUEST_DEMO_MAX_ATTEMPTS },
      DEFAULT_MAP_MAX_ENTRIES
    );
    writeGuestDemoCookie(req, res, maxedState);
    return { allowed: false, remaining: 0 };
  }

  const nextUsed = Math.min(GUEST_DEMO_MAX_ATTEMPTS, Math.max(current.state.u + 1, distributedDaily.count || 1));
  const nextState = { ...current.state, u: nextUsed };
  setBoundedMapEntry(
    guestDemoIpDailyQuota,
    current.ip,
    { date: current.today, count: nextUsed },
    DEFAULT_MAP_MAX_ENTRIES
  );
  writeGuestDemoCookie(req, res, nextState);
  return { allowed: true, remaining: Math.max(0, GUEST_DEMO_MAX_ATTEMPTS - nextUsed) };
}

const practiceGuestCheckLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyFn: (req) => `practice-guest:${getClientIp(req)}`,
  message: 'Příliš mnoho pokusů v demo režimu. Zkuste to za chvíli nebo se přihlaste.',
});

async function checkDistributedGuestBurstLimit(req, res) {
  const rate = await checkDistributedRateLimit({
    key: `practice-guest:${getClientIp(req)}`,
    windowMs: 15 * 60 * 1000,
    max: 60,
  });
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSec));
    res.status(429).json({
      error: 'Příliš mnoho pokusů v demo režimu. Zkuste to za chvíli nebo se přihlaste.',
    });
    return false;
  }
  return true;
}

const practiceFinishLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyFn: (req) => `practice-finish:${req.user?.uid || getClientIp(req)}`,
  message: 'Příliš mnoho pokusů o dokončení procvičování. Zkuste to prosím za chvíli.',
});

function normalizePracticeSubjectId(val) {
  const s = String(val || '').trim();
  const lower = s.toLowerCase();
  if (
    lower === 'český jazyk' ||
    lower === 'cesky jazyk' ||
    lower === 'čeština' ||
    lower === 'cestina' ||
    lower === 'czech' ||
    lower === 'cj' ||
    lower === 'čj'
  ) {
    return 'Čeština';
  }
  if (lower === 'matematika' || lower === 'math' || lower === 'ma') {
    return 'Matematika';
  }
  return s || 'Matematika';
}

function sortTopicsDeterministic(a, b) {
  const subjOrder = (s) => {
    const norm = normalizePracticeSubjectId(s);
    return norm === 'Matematika' ? 0 : norm === 'Čeština' ? 1 : 2;
  };
  const sDiff = subjOrder(a.subjectId || a.subject) - subjOrder(b.subjectId || b.subject);
  if (sDiff !== 0) return sDiff;
  const aOrd = Number.isFinite(Number(a.order)) ? Number(a.order) : 9999;
  const bOrd = Number.isFinite(Number(b.order)) ? Number(b.order) : 9999;
  if (aOrd !== bOrd) return aOrd - bOrd;
  return String(a.title || '').localeCompare(String(b.title || ''), 'cs');
}

function sortSubtopicsDeterministic(a, b) {
  const aOrd = Number.isFinite(Number(a.order)) ? Number(a.order) : 9999;
  const bOrd = Number.isFinite(Number(b.order)) ? Number(b.order) : 9999;
  if (aOrd !== bOrd) return aOrd - bOrd;
  return String(a.title || '').localeCompare(String(b.title || ''), 'cs');
}

function stripSubtopicStudyContent(subtopic) {
  const hasStudyContent = Boolean(
    (typeof subtopic.studyTheory === 'string' && subtopic.studyTheory.trim()) ||
      (Array.isArray(subtopic.studySteps) && subtopic.studySteps.length > 0) ||
      (subtopic.sampleProblem && typeof subtopic.sampleProblem === 'object') ||
      (Array.isArray(subtopic.studyImages) && subtopic.studyImages.length > 0) ||
      (Array.isArray(subtopic.studyVideos) && subtopic.studyVideos.length > 0)
  );
  const {
    studyTheory: _st,
    studySteps: _ss,
    sampleProblem: _sp,
    studyImages: _si,
    studyVideos: _sv,
    ...catalogFields
  } = subtopic;
  return {
    ...catalogFields,
    hasStudyContent,
  };
}

function sanitizeStudySubtopicFields(subtopic) {
  const copy = { ...subtopic };
  // SEC-19: Sanitizujeme top-level subtopic.svgContent i vnořené SVG v sampleProblem a studySteps
  if (typeof copy.svgContent === 'string') {
    copy.svgContent = copy.svgContent.trim() ? sanitizeSvg(copy.svgContent) : '';
  }
  if (copy.sampleProblem && typeof copy.sampleProblem === 'object' && typeof copy.sampleProblem.svgContent === 'string') {
    copy.sampleProblem = {
      ...copy.sampleProblem,
      svgContent: sanitizeSvg(copy.sampleProblem.svgContent),
    };
  }
  if (Array.isArray(copy.studySteps)) {
    copy.studySteps = copy.studySteps.map((step) => {
      if (!step || typeof step !== 'object') return step;
      const nextStep = { ...step };
      if (typeof nextStep.svgContent === 'string') {
        nextStep.svgContent = nextStep.svgContent.trim() ? sanitizeSvg(nextStep.svgContent) : '';
      }
      if (typeof nextStep.solutionSvgContent === 'string') {
        nextStep.solutionSvgContent = nextStep.solutionSvgContent.trim() ? sanitizeSvg(nextStep.solutionSvgContent) : '';
      }
      return nextStep;
    });
  }
  return copy;
}

// SEC-34: Skrytí interních UID učitelů/autorů pro neučitelské klienty v katalogu procvičování
function stripInternalOwnershipFields(item, isTeacher) {
  if (!item || typeof item !== 'object' || isTeacher) return item;
  const { teacherId: _tid, createdBy: _cb, ...rest } = item;
  return rest;
}

const PRACTICE_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const practiceCatalogCache = {
  data: null,
  expiresAt: 0,
  pendingPromise: null,
};

function invalidatePracticeCatalogCache() {
  practiceCatalogCache.data = null;
  practiceCatalogCache.expiresAt = 0;
  practiceCatalogCache.pendingPromise = null;
}

const SUBTOPIC_QUESTIONS_CACHE_TTL_MS = 60 * 1000;
const SUBTOPIC_QUESTIONS_CACHE_MAX_ENTRIES = 500;
const subtopicQuestionsCache = new Map(); // subtopicId -> { questions, expiresAt }

function invalidateSubtopicQuestionsCache(subtopicId = null) {
  if (subtopicId) {
    subtopicQuestionsCache.delete(subtopicId);
  } else {
    subtopicQuestionsCache.clear();
  }
}

async function loadPublicSubtopicQuestions(subtopicId, options = {}) {
  const now = Date.now();
  const cached = !options.forceRefresh ? subtopicQuestionsCache.get(subtopicId) : null;
  if (cached && cached.expiresAt > now) {
    return cached.questions;
  }

  const qSnap = await db.collection('questions').where('subtopicId', '==', subtopicId).get();
  const questions = qSnap.docs
    .map((d) => {
      const raw = serializeTimestampFields({ id: d.id, ...d.data() });
      const {
        correctAnswer: _ca,
        explanation: _ex,
        solutionImageUrl: _si,
        solutionSvgContent: _ss,
        expectedAnswer: _ea,
        sampleSolution: _sol,
        ...publicQuestion
      } = raw;
      if (typeof publicQuestion.svgContent === 'string' && publicQuestion.svgContent.trim()) {
        publicQuestion.svgContent = sanitizeSvg(publicQuestion.svgContent);
      }
      return publicQuestion;
    })
    .sort((a, b) => {
      const aOrd = Number.isFinite(Number(a.order)) ? Number(a.order) : 9999;
      const bOrd = Number.isFinite(Number(b.order)) ? Number(b.order) : 9999;
      if (aOrd !== bOrd) return aOrd - bOrd;
      return (parseIsoMillis(a.createdAt) ?? 0) - (parseIsoMillis(b.createdAt) ?? 0);
    });

  setBoundedMapEntry(
    subtopicQuestionsCache,
    subtopicId,
    { questions, expiresAt: now + SUBTOPIC_QUESTIONS_CACHE_TTL_MS },
    SUBTOPIC_QUESTIONS_CACHE_MAX_ENTRIES
  );
  return questions;
}

// SEC-05: Server-side evidence ověřených/odhalených otázek ve Firestore (server-only kolekce verifiedPracticeChecks)
function getVerifiedPracticeCheckDocId(uid, questionId) {
  return `${uid}_${questionId}`;
}

async function recordVerifiedPracticeCheck(uid, questionId, subtopicId, source = 'check-answer') {
  if (!uid || !questionId) return;
  try {
    const docId = getVerifiedPracticeCheckDocId(uid, questionId);
    await db.collection('verifiedPracticeChecks').doc(docId).set(
      {
        uid,
        questionId,
        subtopicId: subtopicId || '',
        verifiedAt: Timestamp.now(),
        source,
      },
      { merge: true }
    );
  } catch (err) {
    console.warn(`[VerifiedPracticeCheck Warning] (${uid}/${questionId}):`, err?.message || err);
  }
}

async function deductMultiplePracticeJokers(uid, count) {
  const needed = Math.max(1, Math.floor(Number(count) || 0));
  const userRef = db.collection('users').doc(uid);
  try {
    const result = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw createMaterialHttpError(404, 'Uživatelský profil nebyl nalezen.');
      }
      const userData = userSnap.data() || {};
      const currentJokers =
        typeof userData.jokers === 'number' && Number.isFinite(userData.jokers) ? userData.jokers : 0;
      if (currentJokers < needed) {
        const insufficientErr = createMaterialHttpError(
          403,
          `Nemáte dostatek žolíků pro vyhodnocení neověřených otázek (potřeba: ${needed}, k dispozici: ${currentJokers}).`
        );
        insufficientErr.code = 'INSUFFICIENT_JOKERS';
        insufficientErr.requiredJokers = needed;
        insufficientErr.availableJokers = currentJokers;
        throw insufficientErr;
      }
      const nextJokers = currentJokers - needed;
      tx.update(userRef, {
        jokers: nextJokers,
        updatedAt: Timestamp.now(),
      });
      return { jokersRemaining: nextJokers };
    });
    return { ok: true, jokersRemaining: result.jokersRemaining };
  } catch (err) {
    if (err?.code === 'INSUFFICIENT_JOKERS') {
      return {
        ok: false,
        status: 403,
        code: 'INSUFFICIENT_JOKERS',
        error: err.message,
        requiredJokers: err.requiredJokers,
        availableJokers: err.availableJokers,
      };
    }
    if (err?.status) {
      return { ok: false, status: err.status, error: err.message };
    }
    throw err;
  }
}

async function fetchPracticeCatalogUncached() {
  const [topicsSnap, subtopicsSnap] = await Promise.all([
    db.collection('customTopics').get(),
    db.collection('practiceSubtopics').get(),
  ]);

  const rawTopics = topicsSnap.docs
    .map((d) => {
      const data = serializeTimestampFields({ id: d.id, ...d.data() });
      const normSubj = normalizePracticeSubjectId(data.subjectId || data.subject);
      return {
        ...data,
        subjectId: normSubj,
      };
    })
    .sort(sortTopicsDeterministic);

  const rawSubtopics = subtopicsSnap.docs
    .map((d) => {
      const data = serializeTimestampFields({ id: d.id, ...d.data() });
      const normSubj = normalizePracticeSubjectId(data.subjectId || data.subject);
      return {
        ...data,
        subjectId: normSubj,
      };
    })
    .sort(sortSubtopicsDeterministic);

  const hiddenTopicKeys = new Set();
  for (const t of rawTopics) {
    if (t.isHidden === true) {
      hiddenTopicKeys.add(t.id);
      if (t.title) hiddenTopicKeys.add(t.title);
    }
  }

  const visibleTopics = rawTopics.filter((t) => t.isHidden !== true);
  const visibleSubtopics = rawSubtopics.filter(
    (s) => s.isHidden !== true && !hiddenTopicKeys.has(s.topicId)
  );

  const demoSubtopicIds = new Set();
  let firstDemoSubtopicId = null;

  for (const targetSubj of ['Matematika', 'Čeština']) {
    const subjTopics = visibleTopics.filter((t) => t.subjectId === targetSubj);
    let foundSubtopic = null;
    for (const topic of subjTopics) {
      const firstMatch = visibleSubtopics.find(
        (s) =>
          s.subjectId === targetSubj &&
          (s.topicId === topic.id || (topic.title && s.topicId === topic.title))
      );
      if (firstMatch) {
        foundSubtopic = firstMatch;
        break;
      }
    }
    if (!foundSubtopic) {
      foundSubtopic = visibleSubtopics.find((s) => s.subjectId === targetSubj) || null;
    }
    if (foundSubtopic) {
      demoSubtopicIds.add(foundSubtopic.id);
      if (!firstDemoSubtopicId || targetSubj === 'Matematika') {
        if (!firstDemoSubtopicId) firstDemoSubtopicId = foundSubtopic.id;
      }
    }
  }

  if (!firstDemoSubtopicId && visibleSubtopics.length > 0) {
    firstDemoSubtopicId = visibleSubtopics[0].id;
    demoSubtopicIds.add(firstDemoSubtopicId);
  }

  return {
    rawTopics,
    rawSubtopics,
    visibleTopics,
    visibleSubtopics,
    hiddenTopicKeys,
    firstDemoSubtopicId,
    demoSubtopicIds,
  };
}

async function loadPracticeCatalogFromFirestore(options = {}) {
  const now = Date.now();
  if (!options.forceRefresh && practiceCatalogCache.data && practiceCatalogCache.expiresAt > now) {
    return practiceCatalogCache.data;
  }
  if (!options.forceRefresh && practiceCatalogCache.pendingPromise) {
    return practiceCatalogCache.pendingPromise;
  }
  const promise = fetchPracticeCatalogUncached()
    .then((result) => {
      practiceCatalogCache.data = result;
      practiceCatalogCache.expiresAt = Date.now() + PRACTICE_CATALOG_CACHE_TTL_MS;
      practiceCatalogCache.pendingPromise = null;
      return result;
    })
    .catch((err) => {
      practiceCatalogCache.pendingPromise = null;
      throw err;
    });
  practiceCatalogCache.pendingPromise = promise;
  return promise;
}

// 8.1 Veřejný katalog procvičovacích témat a podtémat (bez studijního obsahu a bez skrytých položek pro neučitele)
app.get('/api/practice/catalog', optionalAuth, async (req, res) => {
  try {
    const isTeacher = req.user?.role === 'teacher';
    const includeHidden = isTeacher && (req.query.includeHidden === '1' || req.query.includeHidden === 'true');
    const forceRefresh = isTeacher && (req.query.refresh === '1' || req.query.refresh === 'true');
    const catalog = await loadPracticeCatalogFromFirestore({ forceRefresh });

    const topics = (includeHidden ? catalog.rawTopics : catalog.visibleTopics).map((t) =>
      stripInternalOwnershipFields(t, isTeacher)
    );
    const subtopics = (includeHidden ? catalog.rawSubtopics : catalog.visibleSubtopics).map((s) =>
      stripInternalOwnershipFields(stripSubtopicStudyContent(s), isTeacher)
    );

    setPublicCatalogCacheHeaders(req, res);
    return res.json({
      topics,
      subtopics,
      firstDemoSubtopicId: catalog.firstDemoSubtopicId,
      demoSubtopicIds: Array.from(catalog.demoSubtopicIds),
    });
  } catch (err) {
    console.error('[Practice Catalog Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se načíst katalog procvičování.' });
  }
});

// 8.2 Studijní mód podtématu (vyžaduje Premium / Course / Teacher)
app.get('/api/practice/study/:subtopicId', requireAuth, requirePremiumOrTeacher, async (req, res) => {
  const { subtopicId } = req.params;
  if (!isValidMaterialId(subtopicId)) {
    return res.status(400).json({ error: 'Neplatné ID podtématu.' });
  }
  try {
    const [subSnap, catalog] = await Promise.all([
      db.collection('practiceSubtopics').doc(subtopicId).get(),
      loadPracticeCatalogFromFirestore(),
    ]);
    if (!subSnap.exists) {
      return res.status(404).json({ error: 'Podtéma nenalezeno.' });
    }
    const subtopic = serializeTimestampFields({ id: subSnap.id, ...subSnap.data() });
    subtopic.subjectId = normalizePracticeSubjectId(subtopic.subjectId || subtopic.subject);
    const isTeacher = req.user.role === 'teacher';
    if (!isTeacher) {
      if (subtopic.isHidden === true || (subtopic.topicId && catalog.hiddenTopicKeys.has(subtopic.topicId))) {
        return res.status(404).json({ error: 'Podtéma nenalezeno.' });
      }
    }
    return res.json({
      subtopic: stripInternalOwnershipFields(sanitizeStudySubtopicFields(subtopic), isTeacher),
    });
  } catch (err) {
    console.error('[Practice Study Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se načíst studijní obsah.' });
  }
});

// 8.3 Otázky podtématu (BEZ správných odpovědí a vzorových řešení; host pouze pro 1. demo podtéma)
app.get('/api/practice/subtopics/:subtopicId/questions', optionalAuth, async (req, res) => {
  const { subtopicId } = req.params;
  if (!isValidMaterialId(subtopicId)) {
    return res.status(400).json({ error: 'Neplatné ID podtématu.' });
  }
  try {
    const catalog = await loadPracticeCatalogFromFirestore();
    const isTeacher = req.user?.role === 'teacher';
    const subtopic = catalog.rawSubtopics.find((s) => s.id === subtopicId);
    if (!subtopic) {
      return res.status(404).json({ error: 'Podtéma nenalezeno.' });
    }
    if (!isTeacher && (subtopic.isHidden === true || catalog.hiddenTopicKeys.has(subtopic.topicId))) {
      return res.status(404).json({ error: 'Podtéma nenalezeno.' });
    }

    const isDemo = Boolean(
      (catalog.firstDemoSubtopicId && catalog.firstDemoSubtopicId === subtopicId) ||
        (catalog.demoSubtopicIds && catalog.demoSubtopicIds.has(subtopicId))
    );
    let guestRemaining;

    if (!req.user) {
      if (!isDemo) {
        return res.status(403).json({
          error: 'Pro přístup k tomuto podtématu se prosím zdarma zaregistrujte nebo přihlaste.',
          code: 'DEMO_RESTRICTED',
        });
      }
      const guestState = getEffectiveGuestDemoState(req);
      if (!guestState.validCookie) {
        writeGuestDemoCookie(req, res, guestState.state);
      }
      guestRemaining = guestState.remaining;
    }

    const forceRefresh = isTeacher && (req.query.refresh === '1' || req.query.refresh === 'true');
    const questions = await loadPublicSubtopicQuestions(subtopicId, { forceRefresh });

    return res.json({
      questions,
      isDemo,
      ...(guestRemaining !== undefined ? { guestRemaining } : {}),
    });
  } catch (err) {
    console.error('[Practice Questions Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se načíst otázky pro procvičování.' });
  }
});

async function deductPracticeCheckQuota(req, res, isDemo) {
  if (!req.user) {
    if (!isDemo) {
      return { ok: false, status: 403, code: 'DEMO_RESTRICTED', error: 'Tento okruh je dostupný až po přihlášení.' };
    }
    const guestResult = await consumeGuestDemoAttempt(req, res);
    if (!guestResult.allowed) {
      return {
        ok: false,
        status: 429,
        code: 'GUEST_LIMIT_REACHED',
        error: 'Vyčerpal jsi limit 5 demo pokusů pro hosta. Zaregistruj se zdarma a získej 10 žolíků denně!',
        guestRemaining: 0,
      };
    }
    return { ok: true, jokersRemaining: guestResult.remaining, guestRemaining: guestResult.remaining };
  }

  const effectiveRole = req.user.role;
  const hasUnlimited =
    effectiveRole === 'premium' ||
    effectiveRole === 'teacher' ||
    (effectiveRole === 'course' && Array.isArray(req.user.enrolledCourseIds) && req.user.enrolledCourseIds.length > 0);
  if (hasUnlimited) {
    return { ok: true, jokersRemaining: 999 };
  }

  const userRef = db.collection('users').doc(req.user.uid);
  try {
    const jokersRemaining = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw createMaterialHttpError(404, 'Uživatelský profil nebyl nalezen.');
      }
      const userData = userSnap.data() || {};
      const currentJokers = typeof userData.jokers === 'number' && Number.isFinite(userData.jokers) ? userData.jokers : 0;
      if (currentJokers < 1) {
        const noJokersErr = createMaterialHttpError(402, 'Nemáte dostatek žolíků.');
        noJokersErr.code = 'NO_JOKERS';
        throw noJokersErr;
      }
      const nextJokers = currentJokers - 1;
      tx.update(userRef, {
        jokers: nextJokers,
        updatedAt: Timestamp.now(),
      });
      return nextJokers;
    });
    return { ok: true, jokersRemaining };
  } catch (err) {
    if (err?.code === 'NO_JOKERS') {
      return { ok: false, status: 402, code: 'NO_JOKERS', error: err.message };
    }
    if (err?.status) {
      return { ok: false, status: err.status, error: err.message };
    }
    throw err;
  }
}

function evaluateQuestionAnswerServer(question, studentAnswer, selfCheckStatus) {
  const qType = String(question.type || 'open');
  if (qType === 'self_check') {
    const normalizedSelf =
      selfCheckStatus ||
      (String(studentAnswer || '').trim().toLowerCase() === 'správně' || String(studentAnswer || '').trim().toLowerCase() === 'correct'
        ? 'correct'
        : String(studentAnswer || '').trim().toLowerCase() === 'částečně správně' || String(studentAnswer || '').trim().toLowerCase() === 'partial'
        ? 'partial'
        : 'wrong');
    if (normalizedSelf === 'correct') {
      return { isCorrect: true, pointsEarned: 1, tutorFeedback: 'Označeno jako správně (1 bod).' };
    }
    if (normalizedSelf === 'partial') {
      return { isCorrect: false, pointsEarned: 0.5, tutorFeedback: 'Částečně správně (0,5 bodu).' };
    }
    return { isCorrect: false, pointsEarned: 0, tutorFeedback: 'Označeno jako špatně (0 bodů).' };
  }

  if (qType === 'choice' || qType === 'multiple_choice') {
    const cleanInput = String(studentAnswer ?? '').trim();
    const cleanExpected = String(question.correctAnswer ?? '').trim();
    const isCorrect = cleanInput.length > 0 && cleanInput === cleanExpected;
    return {
      isCorrect,
      pointsEarned: isCorrect ? 1 : 0,
      tutorFeedback: isCorrect ? 'Správně!' : 'Nesprávná volba.',
    };
  }

  const evalRes = evaluateStudentAnswer(String(studentAnswer ?? ''), String(question.correctAnswer ?? ''), {
    caseSensitive: Boolean(question.caseSensitive),
  });
  return {
    isCorrect: Boolean(evalRes.isCorrect),
    pointsEarned: evalRes.isCorrect ? 1 : 0,
    tutorFeedback: evalRes.tutorFeedback || undefined,
  };
}

// 8.4 Vyhodnocení odpovědi na serveru s atomickým odečtem žolíku / demo pokusu
app.post('/api/practice/check-answer', optionalAuth, async (req, res) => {
  if (!req.user) {
    return practiceGuestCheckLimiter(req, res, async () => {
      if (!(await checkDistributedGuestBurstLimit(req, res))) return;
      return handleCheckPracticeAnswer(req, res);
    });
  }
  return handleCheckPracticeAnswer(req, res);
});

async function handleCheckPracticeAnswer(req, res) {
  try {
    const { questionId, subtopicId, studentAnswer, selfCheckStatus } = req.body || {};
    if (!isValidMaterialId(questionId) || !isValidMaterialId(subtopicId)) {
      return res.status(400).json({ error: 'Chybí platné ID otázky nebo podtématu.' });
    }
    if (studentAnswer !== undefined && typeof studentAnswer !== 'string') {
      return res.status(400).json({ error: 'Odpověď musí být textový řetězec.' });
    }
    if (typeof studentAnswer === 'string' && studentAnswer.length > 2000) {
      return res.status(400).json({ error: 'Odpověď je příliš dlouhá (max 2000 znaků).' });
    }
    if (selfCheckStatus !== undefined && !['correct', 'partial', 'wrong'].includes(selfCheckStatus)) {
      return res.status(400).json({ error: 'Neplatná hodnota sebehodnocení.' });
    }

    const [questionSnap, catalog] = await Promise.all([
      db.collection('questions').doc(questionId).get(),
      loadPracticeCatalogFromFirestore(),
    ]);

    if (!questionSnap.exists) {
      return res.status(404).json({ error: 'Otázka nenalezena.' });
    }
    const question = { id: questionSnap.id, ...questionSnap.data() };
    if (question.subtopicId !== subtopicId) {
      return res.status(400).json({ error: 'Otázka nepatří do zvoleného podtématu.' });
    }

    const subtopic = catalog.rawSubtopics.find((s) => s.id === subtopicId);
    if (!subtopic) {
      return res.status(404).json({ error: 'Podtéma nenalezeno.' });
    }
    const isTeacher = req.user?.role === 'teacher';
    if (!isTeacher && (subtopic.isHidden === true || catalog.hiddenTopicKeys.has(subtopic.topicId))) {
      return res.status(404).json({ error: 'Podtéma není veřejně dostupné.' });
    }

    const isDemo = Boolean(
      (catalog.firstDemoSubtopicId && catalog.firstDemoSubtopicId === subtopicId) ||
        (catalog.demoSubtopicIds && catalog.demoSubtopicIds.has(subtopicId))
    );
    const quota = await deductPracticeCheckQuota(req, res, isDemo);
    if (!quota.ok) {
      return res.status(quota.status).json({
        error: quota.error,
        ...(quota.code ? { code: quota.code } : {}),
        ...(quota.guestRemaining !== undefined ? { guestRemaining: quota.guestRemaining } : {}),
      });
    }

    if (req.user?.uid) {
      await recordVerifiedPracticeCheck(req.user.uid, questionId, subtopicId, 'check-answer');
    }

    const evaluated = evaluateQuestionAnswerServer(question, studentAnswer ?? '', selfCheckStatus);
    return res.json({
      isCorrect: evaluated.isCorrect,
      pointsEarned: evaluated.pointsEarned,
      tutorFeedback: evaluated.tutorFeedback,
      correctAnswer: question.correctAnswer ?? '',
      explanation: question.explanation ?? '',
      solutionImageUrl: question.solutionImageUrl || null,
      solutionSvgContent:
        typeof question.solutionSvgContent === 'string' && question.solutionSvgContent.trim()
          ? sanitizeSvg(question.solutionSvgContent)
          : null,
      jokersRemaining: quota.jokersRemaining,
      ...(quota.guestRemaining !== undefined ? { guestRemaining: quota.guestRemaining } : {}),
    });
  } catch (err) {
    console.error('[Check Answer Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se vyhodnotit odpověď.' });
  }
}

// 8.5 Odhalení vzorového řešení (odečte žolík/demo pokus, NEuděluje body ani streak)
app.post('/api/practice/reveal-solution', optionalAuth, async (req, res) => {
  if (!req.user) {
    return practiceGuestCheckLimiter(req, res, async () => {
      if (!(await checkDistributedGuestBurstLimit(req, res))) return;
      return handleRevealPracticeSolution(req, res);
    });
  }
  return handleRevealPracticeSolution(req, res);
});

async function handleRevealPracticeSolution(req, res) {
  try {
    const { questionId, subtopicId } = req.body || {};
    if (!isValidMaterialId(questionId) || !isValidMaterialId(subtopicId)) {
      return res.status(400).json({ error: 'Chybí platné ID otázky nebo podtématu.' });
    }

    const [questionSnap, catalog] = await Promise.all([
      db.collection('questions').doc(questionId).get(),
      loadPracticeCatalogFromFirestore(),
    ]);

    if (!questionSnap.exists) {
      return res.status(404).json({ error: 'Otázka nenalezena.' });
    }
    const question = { id: questionSnap.id, ...questionSnap.data() };
    if (question.subtopicId !== subtopicId) {
      return res.status(400).json({ error: 'Otázka nepatří do zvoleného podtématu.' });
    }

    const subtopic = catalog.rawSubtopics.find((s) => s.id === subtopicId);
    if (!subtopic) {
      return res.status(404).json({ error: 'Podtéma nenalezeno.' });
    }
    const isTeacher = req.user?.role === 'teacher';
    if (!isTeacher && (subtopic.isHidden === true || catalog.hiddenTopicKeys.has(subtopic.topicId))) {
      return res.status(404).json({ error: 'Podtéma není veřejně dostupné.' });
    }

    const isDemo = Boolean(
      (catalog.firstDemoSubtopicId && catalog.firstDemoSubtopicId === subtopicId) ||
        (catalog.demoSubtopicIds && catalog.demoSubtopicIds.has(subtopicId))
    );
    const quota = await deductPracticeCheckQuota(req, res, isDemo);
    if (!quota.ok) {
      return res.status(quota.status).json({
        error: quota.error,
        ...(quota.code ? { code: quota.code } : {}),
        ...(quota.guestRemaining !== undefined ? { guestRemaining: quota.guestRemaining } : {}),
      });
    }

    if (req.user?.uid) {
      await recordVerifiedPracticeCheck(req.user.uid, questionId, subtopicId, 'reveal-solution');
    }

    return res.json({
      revealed: true,
      correctAnswer: question.correctAnswer ?? '',
      explanation: question.explanation ?? '',
      solutionImageUrl: question.solutionImageUrl || null,
      solutionSvgContent:
        typeof question.solutionSvgContent === 'string' && question.solutionSvgContent.trim()
          ? sanitizeSvg(question.solutionSvgContent)
          : null,
      jokersRemaining: quota.jokersRemaining,
      ...(quota.guestRemaining !== undefined ? { guestRemaining: quota.guestRemaining } : {}),
    });
  } catch (err) {
    console.error('[Reveal Solution Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se zobrazit vzorové řešení.' });
  }
}

// 8.6 Autoritativní ukončení procvičování (uloží výsledek do tests, smaže aktivní relaci, aktualizuje Prague streak a splní naplánované todos)
app.post('/api/practice/finish', requireAuth, practiceFinishLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { subtopicId, topicId, subjectId, answers, durationSeconds } = req.body || {};

    if (!isValidMaterialId(subtopicId)) {
      return res.status(400).json({ error: 'Chybí platné ID podtématu.' });
    }
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'Nelze dokončit procvičování bez alespoň jedné odevzdané odpovědi.' });
    }
    if (answers.length > 200) {
      return res.status(400).json({ error: 'Příliš mnoho odevzdaných odpovědí v jednom požadavku.' });
    }

    const catalog = await loadPracticeCatalogFromFirestore();
    const subtopic = catalog.rawSubtopics.find((s) => s.id === subtopicId);
    if (!subtopic) {
      return res.status(404).json({ error: 'Podtéma nenalezeno.' });
    }
    if (req.user.role !== 'teacher' && (subtopic.isHidden === true || catalog.hiddenTopicKeys.has(subtopic.topicId))) {
      return res.status(404).json({ error: 'Podtéma není veřejně dostupné.' });
    }

    const qSnap = await db.collection('questions').where('subtopicId', '==', subtopicId).get();
    const questionById = new Map(qSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));

    const seenQuestionIds = new Set();
    const evaluatedQuestions = [];
    let totalScore = 0;
    let nonEmptyAnsweredCount = 0;

    for (const item of answers) {
      if (!item || typeof item !== 'object') continue;
      const qId = typeof item.questionId === 'string' ? item.questionId.trim() : '';
      if (!qId || seenQuestionIds.has(qId)) continue;
      const qDoc = questionById.get(qId);
      if (!qDoc) continue;
      seenQuestionIds.add(qId);

      const userAnswer = typeof item.userAnswer === 'string' ? item.userAnswer.slice(0, 2000) : '';
      let selfCheckStatus = item.selfCheckStatus;
      if (qDoc.type === 'self_check' && !selfCheckStatus && typeof item.selfScore === 'number') {
        if (item.selfScore >= 1) selfCheckStatus = 'correct';
        else if (item.selfScore >= 0.5) selfCheckStatus = 'partial';
        else selfCheckStatus = 'wrong';
      }

      const hasNonEmptyAnswer =
        userAnswer.trim().length > 0 ||
        (qDoc.type === 'self_check' && ['correct', 'partial', 'wrong'].includes(selfCheckStatus));
      if (hasNonEmptyAnswer) {
        nonEmptyAnsweredCount += 1;
      }

      const evalRes = evaluateQuestionAnswerServer(qDoc, userAnswer, selfCheckStatus);
      totalScore += evalRes.pointsEarned;

      evaluatedQuestions.push({
        id: qDoc.id,
        question: qDoc.text || qDoc.question || '',
        userAnswer,
        correctAnswer: qDoc.correctAnswer ?? '',
        isCorrect: evalRes.isCorrect,
        correct: evalRes.isCorrect,
        pointsEarned: evalRes.pointsEarned,
        ...(qDoc.type === 'self_check' ? { selfScore: evalRes.pointsEarned } : {}),
        explanation: qDoc.explanation ?? '',
        errorCode: typeof item.errorCode === 'string' ? item.errorCode.slice(0, 64) : null,
        timeSpentMs: typeof item.timeSpentMs === 'number' && item.timeSpentMs >= 0 ? Math.min(3600000, Math.round(item.timeSpentMs)) : null,
        ...(Array.isArray(qDoc.options) ? { options: qDoc.options } : {}),
      });
    }

    if (evaluatedQuestions.length === 0) {
      return res.status(400).json({ error: 'Žádná z odevzdaných odpovědí nepatří do vybraného podtématu.' });
    }

    // SEC-05: Ověření žolíků výhradně proti server-only kolekci verifiedPracticeChecks
    // (nikdy nevěříme klientem zapisovatelnému activePracticeSessions.answeredCount; platí i pro demo podtémata u přihlášených free uživatelů).
    const isUnlimitedUser =
      req.user.role === 'premium' ||
      req.user.role === 'teacher' ||
      (req.user.role === 'course' && Array.isArray(req.user.enrolledCourseIds) && req.user.enrolledCourseIds.length > 0);

    const sessionRef = db.collection('activePracticeSessions').doc(`${uid}_${subtopicId}`);
    if (!isUnlimitedUser) {
      const submittedIds = evaluatedQuestions.map((q) => q.id);
      const verifiedIdSet = new Set();
      for (let i = 0; i < submittedIds.length; i += 100) {
        const chunkIds = submittedIds.slice(i, i + 100);
        const refs = chunkIds.map((qId) =>
          db.collection('verifiedPracticeChecks').doc(getVerifiedPracticeCheckDocId(uid, qId))
        );
        const snaps = await db.getAll(...refs);
        snaps.forEach((snap, idx) => {
          if (snap && snap.exists) {
            verifiedIdSet.add(chunkIds[idx]);
          }
        });
      }

      const unverifiedIds = submittedIds.filter((qId) => !verifiedIdSet.has(qId));
      const unverifiedCount = unverifiedIds.length;
      if (unverifiedCount > 0) {
        const deductResult = await deductMultiplePracticeJokers(uid, unverifiedCount);
        if (!deductResult.ok) {
          return res.status(deductResult.status).json({
            error: deductResult.error,
            ...(deductResult.code ? { code: deductResult.code } : {}),
            ...(deductResult.requiredJokers !== undefined ? { requiredJokers: deductResult.requiredJokers } : {}),
            ...(deductResult.availableJokers !== undefined ? { availableJokers: deductResult.availableJokers } : {}),
          });
        }
        // Zapsat čerstvě uhrazené otázky do verifiedPracticeChecks
        try {
          const batch = db.batch();
          const nowTs = Timestamp.now();
          for (const qId of unverifiedIds) {
            const vRef = db.collection('verifiedPracticeChecks').doc(getVerifiedPracticeCheckDocId(uid, qId));
            batch.set(
              vRef,
              {
                uid,
                questionId: qId,
                subtopicId,
                verifiedAt: nowTs,
                source: 'finish',
              },
              { merge: true }
            );
          }
          await batch.commit();
        } catch (vErr) {
          console.warn('[Practice Finish VerifiedCheck Batch Warning]:', vErr?.message || vErr);
        }
      }
    }

    const totalQuestions = evaluatedQuestions.length;
    const roundedScore = Math.round(totalScore * 2) / 2;
    const percentage = Math.round((roundedScore / totalQuestions) * 100);
    const cleanDurationSeconds =
      typeof durationSeconds === 'number' && Number.isFinite(durationSeconds) && durationSeconds >= 0
        ? Math.min(86400, Math.round(durationSeconds))
        : 0;

    const resolvedTopicId = (typeof topicId === 'string' && topicId.trim()) || subtopic.topicId || '';
    const resolvedSubjectId =
      normalizePracticeSubjectId((typeof subjectId === 'string' && subjectId.trim()) || subtopic.subjectId || '');

    const testRef = db.collection('tests').doc();
    await testRef.set({
      title: `Procvičování (${percentage}%)`,
      description: JSON.stringify({
        subtopicId,
        subjectId: resolvedSubjectId,
        topicId: resolvedTopicId,
        score: roundedScore,
        totalQuestions,
        percentage,
        durationSeconds: cleanDurationSeconds,
      }),
      topic: subtopicId,
      studentId: uid,
      createdBy: uid,
      autoGrade: true,
      questions: evaluatedQuestions,
      score: roundedScore,
      totalQuestions,
      percentage,
      durationSeconds: cleanDurationSeconds,
      createdAt: Timestamp.now(),
    });

    // Odstranění rozpracované relace
    await sessionRef.delete().catch(() => {});

    // Atomická aktualizace Prague-time streaku (SEC-05: pouze při >= 1 neprázdné odevzdané odpovědi)
    const todayPrague = getPragueDateString();
    const yesterdayPrague = getPreviousPragueDateString(todayPrague);
    const userRef = db.collection('users').doc(uid);

    let streakResult = { streak: 0 };
    if (nonEmptyAnsweredCount >= 1) {
      streakResult = await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
          return { streak: 0 };
        }
        const uData = userSnap.data() || {};
        const currentStreak = Number(uData.streak) || 0;
        const lastDate = uData.lastStreakPracticeDate || null;

        let nextStreak = currentStreak;
        if (lastDate === todayPrague) {
          nextStreak = Math.max(1, currentStreak);
        } else if (lastDate === yesterdayPrague) {
          nextStreak = currentStreak + 1;
        } else {
          nextStreak = 1;
        }

        if (nextStreak !== currentStreak || lastDate !== todayPrague) {
          tx.update(userRef, {
            streak: nextStreak,
            lastStreakPracticeDate: todayPrague,
            updatedAt: Timestamp.now(),
          });
        }
        return { streak: nextStreak };
      });
    } else {
      const userSnap = await userRef.get().catch(() => null);
      streakResult = { streak: Number(userSnap?.data()?.streak) || 0 };
    }

    // Automatické označení naplánovaného TODO v kalendáři (SEC-05: vyžaduje splnění minimálního prahu odpovědí)
    const isPremiumUser = isUnlimitedUser;
    const subtopicQuestionCount = questionById.size;
    const minTodoAnsweredRequired = Math.min(3, Math.max(1, subtopicQuestionCount));
    const meetsTodoCompletionThreshold =
      subtopicQuestionCount >= 1 && nonEmptyAnsweredCount >= minTodoAnsweredRequired;

    let completedTodoId = null;
    if (meetsTodoCompletionThreshold) {
      try {
        const todosSnap = await db.collection('todos').where('studentId', '==', uid).get();
        const matching = todosSnap.docs
          .map((d) => ({ ref: d.ref, id: d.id, ...d.data() }))
          .filter((t) => {
            if (t.completed === true) return false;
            if (t.type !== 'practice' && t.type !== 'course_practice') return false;
            if (t.referenceId !== subtopicId) return false;
            if (isPremiumUser) return true;
            return Boolean(t.addedBy && t.addedBy !== uid);
          });

        const todayTodo = matching.find((t) => t.date === todayPrague);
        const overdueTodos = matching.filter((t) => typeof t.date === 'string' && t.date < todayPrague).sort((a, b) => a.date.localeCompare(b.date));
        const futureTodos = matching.filter((t) => typeof t.date === 'string' && t.date > todayPrague).sort((a, b) => a.date.localeCompare(b.date));
        const targetTodo = todayTodo || overdueTodos[0] || futureTodos[0] || matching[0] || null;
        if (targetTodo) {
          await targetTodo.ref.update({
            completed: true,
            completedAt: Timestamp.now(),
          });
          completedTodoId = targetTodo.id;
        }
      } catch (todoErr) {
        console.warn('[Practice Finish Todo Update Warning]:', todoErr?.message || todoErr);
      }
    }

    return res.json({
      ok: true,
      attemptId: testRef.id,
      score: roundedScore,
      totalQuestions,
      percentage,
      streak: streakResult.streak,
      completedTodoId,
    });
  } catch (err) {
    console.error('[Practice Finish Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se uložit výsledek procvičování.' });
  }
});

// 8.7 Bezpečný detail otázky pro studentův vlastní dotaz (questionInquiries) nebo pro učitele
app.get('/api/inquiries/question/:questionId', requireAuth, async (req, res) => {
  try {
    const { questionId } = req.params;
    if (!isValidMaterialId(questionId)) {
      return res.status(400).json({ error: 'Neplatné ID otázky.' });
    }

    const isTeacher = req.user?.role === 'teacher';
    const isPaidRole = isUserPaidOrTeacher(req.user);

    const [qSnap, catalog, inquirySnap, verifiedCheckSnap] = await Promise.all([
      db.collection('questions').doc(questionId).get(),
      loadPracticeCatalogFromFirestore(),
      isTeacher
        ? Promise.resolve(null)
        : db
            .collection('questionInquiries')
            .where('studentId', '==', req.user.uid)
            .where('questionId', '==', questionId)
            .limit(20)
            .get(),
      isTeacher || isPaidRole
        ? Promise.resolve(null)
        : db
            .collection('verifiedPracticeChecks')
            .doc(getVerifiedPracticeCheckDocId(req.user.uid, questionId))
            .get(),
    ]);

    if (!isTeacher && (!inquirySnap || inquirySnap.empty)) {
      return res.status(403).json({ error: 'K detailu této otázky nemáte oprávnění.' });
    }

    if (!qSnap.exists) {
      return res.status(404).json({ error: 'Otázka nenalezena.' });
    }
    const data = qSnap.data() || {};

    // SEC-05: Skryté otázky / podtémata / témata jsou pro neučitele nedostupné (404)
    if (!isTeacher) {
      const subtopicId = typeof data.subtopicId === 'string' ? data.subtopicId : '';
      const subtopic = subtopicId ? catalog.rawSubtopics.find((s) => s.id === subtopicId) : null;
      const isHiddenQuestion = Boolean(
        data.isHidden === true ||
          (subtopic &&
            (subtopic.isHidden === true ||
              (subtopic.topicId && catalog.hiddenTopicKeys.has(subtopic.topicId)))) ||
          (data.topicId && catalog.hiddenTopicKeys.has(data.topicId))
      );
      if (isHiddenQuestion) {
        return res.status(404).json({ error: 'Otázka nenalezena.' });
      }
    }

    // SEC-05: Odhalit řešení pouze učiteli, platícímu uživateli, po serverovém ověření nebo po zodpovězení dotazu
    const hasAnsweredInquiry = Boolean(
      inquirySnap && inquirySnap.docs.some((docSnap) => docSnap.data()?.status === 'answered')
    );
    const hasVerifiedCheck = Boolean(verifiedCheckSnap && verifiedCheckSnap.exists);
    const canRevealSolution = isTeacher || isPaidRole || hasVerifiedCheck || hasAnsweredInquiry;

    return res.json({
      question: {
        id: qSnap.id,
        question: data.question || '',
        type: data.type || (Array.isArray(data.options) && data.options.length > 0 ? 'choice' : 'open'),
        options: Array.isArray(data.options) ? data.options : [],
        correctAnswer: canRevealSolution ? data.correctAnswer || '' : null,
        hint: data.hint || '',
        explanation: canRevealSolution ? data.explanation || '' : null,
        difficulty: data.difficulty || 'Střední',
        subjectId: normalizePracticeSubjectId(data.subjectId || 'Matematika'),
        topicId: data.topicId || data.topic || '',
        subtopicId: data.subtopicId || '',
        imageUrl: data.imageUrl || '',
        svgContent: typeof data.svgContent === 'string' && data.svgContent.trim() ? sanitizeSvg(data.svgContent) : '',
        solutionImageUrl: canRevealSolution ? data.solutionImageUrl || '' : null,
        solutionSvgContent:
          canRevealSolution && typeof data.solutionSvgContent === 'string' && data.solutionSvgContent.trim()
            ? sanitizeSvg(data.solutionSvgContent)
            : null,
        caseSensitive: Boolean(data.caseSensitive),
      },
    });
  } catch (err) {
    console.error('[Inquiry Question Detail Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se načíst podrobnosti otázky.' });
  }
});

// 8.8 Bezpečné načítání a odevzdání zadaných testů (assignedTests) bez úniku correctAnswer před odevzdáním
// SEC-19: Sanitizujeme svgContent i solutionSvgContent u všech otázek v assignedTests
function sanitizeAssignedTestForClient(rawTest, isTeacher) {
  const test = serializeTimestampFields(rawTest);
  const isCompleted = test.status === 'submitted' || test.status === 'graded';
  const includeSolutions = Boolean(isTeacher || isCompleted);
  const safeQuestions = Array.isArray(test.questions)
    ? test.questions.map((q) => {
        if (!q || typeof q !== 'object') return q;
        if (includeSolutions) {
          const nextQ = { ...q };
          if (typeof nextQ.svgContent === 'string' && nextQ.svgContent.trim()) {
            nextQ.svgContent = sanitizeSvg(nextQ.svgContent);
          }
          if (typeof nextQ.solutionSvgContent === 'string' && nextQ.solutionSvgContent.trim()) {
            nextQ.solutionSvgContent = sanitizeSvg(nextQ.solutionSvgContent);
          }
          return nextQ;
        }
        const {
          correctAnswer: _ca,
          explanation: _ex,
          solutionImageUrl: _si,
          solutionSvgContent: _ss,
          expectedAnswer: _ea,
          sampleSolution: _sol,
          ...publicQ
        } = q;
        if (typeof publicQ.svgContent === 'string' && publicQ.svgContent.trim()) {
          publicQ.svgContent = sanitizeSvg(publicQ.svgContent);
        }
        return publicQ;
      })
    : [];
  return {
    ...test,
    questions: safeQuestions,
  };
}

// SEC-38: 2minutová tolerance zpoždění sítě pro kontrolu dueDate při odevzdání testu
const ASSIGNED_TEST_DUE_GRACE_MS = 2 * 60 * 1000;

function parseAssignedTestDueDeadlineMs(dueDate) {
  if (!dueDate) return null;
  if (typeof dueDate === 'string') {
    const trimmed = dueDate.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const endOfDayMs = Date.parse(`${trimmed}T23:59:59.999Z`);
      return Number.isFinite(endOfDayMs) ? endOfDayMs : null;
    }
  }
  return parseIsoMillis(dueDate);
}

app.get('/api/assigned-tests', requireAuth, async (req, res) => {
  try {
    const isTeacher = req.user?.role === 'teacher';
    let queryRef = db.collection('assignedTests');
    if (!isTeacher) {
      queryRef = queryRef.where('studentId', '==', req.user.uid);
    } else if (typeof req.query.studentId === 'string' && req.query.studentId.trim()) {
      queryRef = queryRef.where('studentId', '==', req.query.studentId.trim());
    }
    const snap = await queryRef.limit(50).get();
    const tests = snap.docs.map((d) =>
      sanitizeAssignedTestForClient({ id: d.id, ...d.data() }, isTeacher)
    );
    return res.json({ tests });
  } catch (err) {
    console.error('[Get Assigned Tests Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se načíst přiřazené testy.' });
  }
});

app.get('/api/assigned-tests/:testId', requireAuth, async (req, res) => {
  try {
    const { testId } = req.params;
    if (!isValidMaterialId(testId)) {
      return res.status(400).json({ error: 'Neplatné ID testu.' });
    }
    const snap = await db.collection('assignedTests').doc(testId).get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Zadaný test nebyl nalezen.' });
    }
    const raw = { id: snap.id, ...snap.data() };
    const isTeacher = req.user?.role === 'teacher';
    if (!isTeacher && raw.studentId !== req.user.uid) {
      return res.status(403).json({ error: 'K tomuto testu nemáte oprávnění.' });
    }
    return res.json({ test: sanitizeAssignedTestForClient(raw, isTeacher) });
  } catch (err) {
    console.error('[Get Assigned Test Detail Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se načíst detail testu.' });
  }
});

// SEC-38: Transakční odevzdání (409 při opakovaném odevzdání), kontrola dueDate (+2min grace) a ochrana self_check
app.post('/api/assigned-tests/:testId/submit', requireAuth, async (req, res) => {
  try {
    const { testId } = req.params;
    if (!isValidMaterialId(testId)) {
      return res.status(400).json({ error: 'Neplatné ID testu.' });
    }
    const docRef = db.collection('assignedTests').doc(testId);
    const rawAnswers = req.body?.answers;
    const timeSpentSeconds =
      typeof req.body?.timeSpentSeconds === 'number' && Number.isFinite(req.body.timeSpentSeconds) && req.body.timeSpentSeconds >= 0
        ? Math.min(86400, Math.round(req.body.timeSpentSeconds))
        : 0;
    const nowMs = Date.now();

    const submitOutcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) {
        throw createMaterialHttpError(404, 'Zadaný test nebyl nalezen.');
      }
      const testData = snap.data() || {};
      if (testData.studentId !== req.user.uid) {
        throw createMaterialHttpError(403, 'Tento test vám nebyl přiřazen.');
      }
      if (testData.status === 'submitted' || testData.status === 'graded') {
        throw createMaterialHttpError(409, 'Tento test již byl odevzdán.');
      }

      const dueDeadlineMs = parseAssignedTestDueDeadlineMs(testData.dueDate);
      if (dueDeadlineMs !== null && nowMs > dueDeadlineMs + ASSIGNED_TEST_DUE_GRACE_MS) {
        throw createMaterialHttpError(400, 'Termín pro odevzdání tohoto testu již vypršel.');
      }

      const questions = Array.isArray(testData.questions) ? testData.questions : [];
      const answersMap = {};
      if (rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)) {
        for (const [k, v] of Object.entries(rawAnswers)) {
          if (typeof k === 'string' && typeof v === 'string') {
            answersMap[k] = v.slice(0, 2000);
          }
        }
      } else if (Array.isArray(rawAnswers)) {
        questions.forEach((q, idx) => {
          const key = q?.id || String(idx);
          const val = rawAnswers[idx];
          if (typeof val === 'string') {
            answersMap[key] = val.slice(0, 2000);
          } else if (val && typeof val === 'object' && typeof val.userAnswer === 'string') {
            answersMap[val.questionId || key] = val.userAnswer.slice(0, 2000);
          }
        });
      }

      let score = 0;
      let hasTeacherReviewItems = false;
      const evaluatedQuestions = questions.map((q, idx) => {
        const qKey = q?.id || String(idx);
        const studentAns = answersMap[qKey] ?? answersMap[String(idx)] ?? '';
        const qType = q?.type || (Array.isArray(q?.options) && q.options.length > 0 ? 'choice' : 'open');

        // SEC-38: U zadaných testů nespoléháme slepě na klientské "correct" u self_check otázek — vyžadují kontrolu učitelem
        if (qType === 'self_check') {
          hasTeacherReviewItems = true;
          return {
            ...q,
            userAnswer: studentAns,
            isCorrect: null,
            pointsEarned: 0,
            requiresTeacherReview: true,
          };
        }

        const evalRes = evaluateQuestionAnswerServer(
          {
            type: qType,
            correctAnswer: q?.correctAnswer ?? '',
            caseSensitive: Boolean(q?.caseSensitive),
          },
          studentAns
        );
        score += evalRes.pointsEarned;
        return {
          ...q,
          userAnswer: studentAns,
          isCorrect: evalRes.isCorrect,
          pointsEarned: evalRes.pointsEarned,
        };
      });

      const maxScore = questions.length;
      const roundedScore = Math.round(score * 2) / 2;

      const updatePayload = {
        answers: answersMap,
        questions: evaluatedQuestions,
        score: roundedScore,
        maxScore,
        status: 'submitted',
        submittedAt: Timestamp.fromMillis(nowMs),
        updatedAt: Timestamp.fromMillis(nowMs),
        timeSpentSeconds,
        ...(hasTeacherReviewItems ? { requiresTeacherReview: true } : {}),
      };

      tx.update(docRef, updatePayload);
      return { snapId: snap.id, testData, updatePayload, roundedScore, maxScore, hasTeacherReviewItems };
    });

    const updatedTest = sanitizeAssignedTestForClient(
      { id: submitOutcome.snapId, ...submitOutcome.testData, ...submitOutcome.updatePayload },
      true
    );
    return res.json({
      ok: true,
      test: updatedTest,
      score: submitOutcome.roundedScore,
      maxScore: submitOutcome.maxScore,
      ...(submitOutcome.hasTeacherReviewItems ? { requiresTeacherReview: true } : {}),
    });
  } catch (err) {
    if (err?.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[Submit Assigned Test Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se odevzdat test.' });
  }
});

// =========================================================================
// 9. ŽOLÍKY A ODMĚNĚNÉ VIDEO RELACE
// =========================================================================

const BASE_JOKER_CAP = 10;
const MAX_JOKER_CAP = 15;
const MAX_STREAK_DAYS = 10;
const DAILY_VIDEO_LIMIT = 3;
const VIDEO_REWARD_AMOUNT = 5;
const MIN_VIDEO_WATCH_MS = 14000;
const VIDEO_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // SEC-26: +24h TTL pro automatické mazání Firestore TTL politikou
const DEV_EPHEMERAL_VIDEO_SECRET = crypto.randomBytes(32).toString('hex');

const jokerVideoSessionLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyFn: (req) => `video-session:${req.user?.uid || getClientIp(req)}`,
  message: 'Příliš mnoho pokusů o spuštění video relace. Zkuste to prosím za chvíli.',
});

function calculateMaxJokersCapServer(streak = 0) {
  return (Number(streak) || 0) >= MAX_STREAK_DAYS ? MAX_JOKER_CAP : BASE_JOKER_CAP;
}

function getVideoTokenSecret() {
  const configured = (process.env.VIDEO_TOKEN_SECRET || '').trim();
  if (configured.length >= 16) return configured;
  const regConfigured = (process.env.REGISTRATION_ENCRYPTION_SECRET || '').trim();
  if (regConfigured.length >= 16) {
    // SEC-37: Doménově oddělený záložní klíč místo přímého sdílení REGISTRATION_ENCRYPTION_SECRET
    return deriveDomainSeparatedSecret(regConfigured, 'proedu:video-token:v1');
  }
  if (process.env.NODE_ENV === 'production' && !isEmulatorMode) {
    throw new Error('VIDEO_TOKEN_SECRET / REGISTRATION_ENCRYPTION_SECRET není nakonfigurováno.');
  }
  return DEV_EPHEMERAL_VIDEO_SECRET;
}

function createSignedVideoToken(uid) {
  const nowMs = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = {
    uid,
    nonce,
    iat: nowMs,
    exp: nowMs + 10 * 60 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getVideoTokenSecret()).update(payloadB64).digest('hex');
  return { token: `${payloadB64}.${sig}`, nonce, iat: nowMs, exp: payload.exp };
}

function verifySignedVideoToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dotIdx = token.lastIndexOf('.');
  if (dotIdx <= 0) return null;
  const payloadB64 = token.slice(0, dotIdx);
  const sigHex = token.slice(dotIdx + 1);
  const expectedSig = crypto.createHmac('sha256', getVideoTokenSecret()).update(payloadB64).digest('hex');
  if (!constantTimeSecretEqual(sigHex, expectedSig)) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload || typeof payload.uid !== 'string' || typeof payload.nonce !== 'string') {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// 9.1 Denní kontrola a bezpečný reset žolíků + vypršeného streaku (Prague TZ)
app.post('/api/jokers/daily-reset', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    if (['premium', 'course', 'teacher'].includes(req.user.role)) {
      return res.json({
        ok: true,
        profile: { role: req.user.role, jokers: 999 },
      });
    }

    const todayPrague = getPragueDateString();
    const yesterdayPrague = getPreviousPragueDateString(todayPrague);
    const userRef = db.collection('users').doc(uid);

    const updatedProfile = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) {
        throw createMaterialHttpError(404, 'Uživatelský profil nenalezen.');
      }
      const data = snap.data() || {};
      const currentJokers = typeof data.jokers === 'number' && Number.isFinite(data.jokers) ? data.jokers : 0;
      const lastGrant = data.lastDailyGrantDate || data.lastJokerResetDate || null;
      const lastStreakDate = data.lastStreakPracticeDate || null;

      let effectiveStreak = Number(data.streak) || 0;
      if (effectiveStreak > 0 && lastStreakDate !== todayPrague && lastStreakDate !== yesterdayPrague) {
        effectiveStreak = 0;
      }

      const cap = calculateMaxJokersCapServer(effectiveStreak);
      let nextDailyVideos =
        data.lastVideoResetDate === todayPrague ? Number(data.dailyVideosWatched) || 0 : 0;
      let nextJokers = currentJokers;
      const updateFields = {};

      if (effectiveStreak !== (Number(data.streak) || 0)) {
        updateFields.streak = effectiveStreak;
      }
      if (data.lastVideoResetDate !== todayPrague) {
        nextDailyVideos = 0;
        updateFields.dailyVideosWatched = 0;
        updateFields.lastVideoResetDate = todayPrague;
      }
      if (lastGrant !== todayPrague) {
        nextJokers = currentJokers < cap ? cap : currentJokers;
        updateFields.jokers = nextJokers;
        updateFields.dailyVideosWatched = 0;
        updateFields.lastVideoResetDate = todayPrague;
        updateFields.lastDailyGrantDate = todayPrague;
        updateFields.lastJokerResetDate = todayPrague;
        nextDailyVideos = 0;
      }

      if (Object.keys(updateFields).length > 0) {
        updateFields.updatedAt = Timestamp.now();
        tx.update(userRef, updateFields);
      }

      return {
        jokers: nextJokers,
        streak: effectiveStreak,
        dailyVideosWatched: nextDailyVideos,
        lastDailyGrantDate: updateFields.lastDailyGrantDate || lastGrant,
        lastJokerResetDate: updateFields.lastJokerResetDate || data.lastJokerResetDate || null,
        lastStreakPracticeDate: lastStreakDate,
      };
    });

    return res.json({ ok: true, profile: updatedProfile });
  } catch (err) {
    if (err?.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[Joker Daily Reset Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se zkontrolovat denní stav žolíků.' });
  }
});

// 9.2 Zahájení odměněného 15s videa (vystavení podepsaného jednorázového videoTokenu)
app.post('/api/jokers/video-session', requireAuth, jokerVideoSessionLimiter, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: 'Uživatelský profil nenalezen.' });
    }
    const data = userSnap.data() || {};
    const todayPrague = getPragueDateString();
    const videosToday = data.lastVideoResetDate === todayPrague ? Number(data.dailyVideosWatched) || 0 : 0;
    const currentJokers = typeof data.jokers === 'number' && Number.isFinite(data.jokers) ? data.jokers : 0;
    const cap = calculateMaxJokersCapServer(data.streak ?? 0);

    if (videosToday >= DAILY_VIDEO_LIMIT) {
      return res.status(429).json({
        error: 'Dosáhli jste dnešního limitu 3 odměněných videí.',
        limitReached: true,
      });
    }
    if (currentJokers >= cap) {
      return res.status(400).json({
        error: 'Máte již maximální možný počet žolíků.',
        reachedCap: true,
      });
    }

    const { token, nonce, iat, exp } = createSignedVideoToken(uid);
    const nowMs = Date.now();
    await db.collection('videoSessions').doc(nonce).set({
      uid,
      consumed: false,
      iat,
      exp,
      createdAt: Timestamp.fromMillis(nowMs),
      expiresAt: Timestamp.fromMillis(nowMs + VIDEO_SESSION_TTL_MS),
    });

    return res.json({ ok: true, videoToken: token });
  } catch (err) {
    console.error('[Video Session Start Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se zahájit video relaci.' });
  }
});

// 9.3 Připsání žolíků po zhlédnutí alespoň 14s videa (jednorázový token + ?? 0 oprava)
app.post('/api/jokers/video-reward', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { videoToken } = req.body || {};
    const payload = verifySignedVideoToken(videoToken);
    if (!payload) {
      return res.status(400).json({ success: false, error: 'Neplatný nebo poškozený token video relace.' });
    }
    if (payload.uid !== uid) {
      return res.status(403).json({ success: false, error: 'Token video relace nepatří přihlášenému uživateli.' });
    }
    const nowMs = Date.now();
    if (nowMs > payload.exp) {
      return res.status(410).json({ success: false, error: 'Platnost video relace vypršela.' });
    }
    if (nowMs - Number(payload.iat) < MIN_VIDEO_WATCH_MS) {
      return res.status(400).json({
        success: false,
        error: 'Video je nutné sledovat alespoň 14 sekund před připsáním žolíků.',
      });
    }

    const todayPrague = getPragueDateString();
    const userRef = db.collection('users').doc(uid);
    const sessionRef = db.collection('videoSessions').doc(payload.nonce);

    const rewardResult = await db.runTransaction(async (tx) => {
      const [userSnap, sessionSnap] = await Promise.all([tx.get(userRef), tx.get(sessionRef)]);
      if (!userSnap.exists) {
        throw createMaterialHttpError(404, 'Uživatelský profil nenalezen.');
      }
      if (!sessionSnap.exists || sessionSnap.data()?.uid !== uid) {
        throw createMaterialHttpError(400, 'Video relace nebyla nalezena.');
      }
      if (sessionSnap.data()?.consumed === true) {
        throw createMaterialHttpError(409, 'Odměna za toto video již byla připsána.');
      }

      const data = userSnap.data() || {};
      const currentJokers = typeof data.jokers === 'number' && Number.isFinite(data.jokers) ? data.jokers : 0;
      const cap = calculateMaxJokersCapServer(data.streak ?? 0);
      const videosToday = data.lastVideoResetDate === todayPrague ? Number(data.dailyVideosWatched) || 0 : 0;

      if (videosToday >= DAILY_VIDEO_LIMIT) {
        const limitErr = createMaterialHttpError(429, 'Dosáhli jste dnešního limitu 3 odměněných videí.');
        limitErr.extra = { limitReached: true, dailyVideosWatched: videosToday, newJokers: currentJokers, cap };
        throw limitErr;
      }
      if (currentJokers >= cap) {
        const capErr = createMaterialHttpError(400, 'Již máte maximální počet žolíků.');
        capErr.extra = { reachedCap: true, newJokers: currentJokers, cap, dailyVideosWatched: videosToday };
        throw capErr;
      }

      const added = Math.min(VIDEO_REWARD_AMOUNT, cap - currentJokers);
      const newJokers = currentJokers + added;
      const nextVideosToday = videosToday + 1;

      tx.update(sessionRef, {
        consumed: true,
        consumedAt: Timestamp.now(),
      });
      tx.update(userRef, {
        jokers: newJokers,
        dailyVideosWatched: nextVideosToday,
        lastVideoResetDate: todayPrague,
        updatedAt: Timestamp.now(),
      });

      return {
        success: true,
        newJokers,
        added,
        cap,
        reachedCap: newJokers >= cap,
        dailyVideosWatched: nextVideosToday,
        limitReached: nextVideosToday >= DAILY_VIDEO_LIMIT,
      };
    });

    return res.json(rewardResult);
  } catch (err) {
    if (err?.status && err.status < 500) {
      return res.status(err.status).json({
        success: false,
        error: err.message,
        ...(err.extra || {}),
      });
    }
    console.error('[Video Reward Error]:', err);
    return res.status(500).json({ success: false, error: 'Nepodařilo se připsat žolíky za video.' });
  }
});

// =========================================================================
// 10. ZAHRÁDKA SOUSTŘEDĚNÍ (GARDEN FOCUS SESSION)
// =========================================================================

const MAX_DAILY_FOCUS_MINUTES = 720; // SEC-38: max 12 hodin soustředění denně
const MIN_FOCUS_ELAPSED_RATIO = 0.75; // SEC-38: od předchozího bloku musí uplynout alespoň 75 % nárokované délky

app.post('/api/garden/record-focus', requireAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const { durationMinutes, plantType, plantName, todoId, todoTitle, tag } = req.body || {};

    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 240) {
      return res.status(400).json({
        error: 'Neplatná délka soustředění. Povolené rozmezí je 5 až 240 minut.',
      });
    }

    const safePlantType =
      typeof plantType === 'string' && plantType.trim() ? plantType.trim().slice(0, 32) : '🌱';
    const safePlantName =
      typeof plantName === 'string' && plantName.trim() ? plantName.trim().slice(0, 64) : 'Rostlinka';
    const safeTodoId = typeof todoId === 'string' && todoId.trim() ? todoId.trim().slice(0, 128) : null;
    const safeTodoTitle = typeof todoTitle === 'string' && todoTitle.trim() ? todoTitle.trim().slice(0, 200) : null;
    const safeTag = typeof tag === 'string' && tag.trim() ? tag.trim().slice(0, 64) : null;

    const userRef = db.collection('users').doc(uid);
    const nowMs = Date.now();
    const minCooldownMs = 4 * 60 * 1000;
    const todayPrague = getPragueDateString(new Date(nowMs));

    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) {
        throw createMaterialHttpError(404, 'Uživatelský profil nenalezen.');
      }
      const data = snap.data() || {};
      const lastFocusMs = parseIsoMillis(data.lastFocusRecordedAt || data.lastGardenFocusAt) || 0;
      const requiredElapsedMs = Math.max(
        minCooldownMs,
        Math.round(durationMinutes * 60 * 1000 * MIN_FOCUS_ELAPSED_RATIO)
      );
      if (lastFocusMs > 0 && nowMs - lastFocusMs < requiredElapsedMs) {
        throw createMaterialHttpError(
          429,
          'Od předchozího bloku soustředění neuplynulo dostatek času pro uložení této délky.'
        );
      }

      const existingHistory = Array.isArray(data.focusSessionsHistory) ? data.focusSessionsHistory : [];
      let dailyFocusMinutesSoFar = 0;
      if (
        data.dailyFocusDate === todayPrague &&
        typeof data.dailyFocusMinutes === 'number' &&
        Number.isFinite(data.dailyFocusMinutes)
      ) {
        dailyFocusMinutesSoFar = Math.max(0, data.dailyFocusMinutes);
      } else {
        for (const item of existingHistory) {
          const itemMs = parseIsoMillis(item?.completedAt);
          if (itemMs && getPragueDateString(new Date(itemMs)) === todayPrague) {
            dailyFocusMinutesSoFar += Number(item?.durationMinutes) || 0;
          }
        }
      }

      if (dailyFocusMinutesSoFar + durationMinutes > MAX_DAILY_FOCUS_MINUTES) {
        throw createMaterialHttpError(
          429,
          `Byl dosažen maximální denní limit soustředění (${MAX_DAILY_FOCUS_MINUTES} minut za den).`
        );
      }

      const newEntry = {
        id: `focus_${nowMs}_${crypto.randomBytes(3).toString('hex')}`,
        plantType: safePlantType,
        plantName: safePlantName,
        duration: durationMinutes * 60,
        durationMinutes,
        completedAt: new Date(nowMs).toISOString(),
        ...(safeTodoId ? { todoId: safeTodoId } : {}),
        ...(safeTodoTitle ? { todoTitle: safeTodoTitle } : {}),
        ...(safeTag ? { tag: safeTag } : {}),
      };

      const nextHistory = [newEntry, ...existingHistory].slice(0, 100);
      const nextPlants = (Number(data.gardenPlants) || 0) + 1;
      const nextFocusMinutes = (Number(data.totalFocusMinutes) || 0) + durationMinutes;
      const nextDailyFocusMinutes = dailyFocusMinutesSoFar + durationMinutes;

      tx.update(userRef, {
        focusSessionsHistory: nextHistory,
        gardenPlants: nextPlants,
        totalFocusMinutes: nextFocusMinutes,
        dailyFocusDate: todayPrague,
        dailyFocusMinutes: nextDailyFocusMinutes,
        lastFocusRecordedAt: Timestamp.fromMillis(nowMs),
        lastGardenFocusAt: Timestamp.fromMillis(nowMs),
        updatedAt: Timestamp.now(),
      });

      return {
        entry: newEntry,
        gardenPlants: nextPlants,
        totalFocusMinutes: nextFocusMinutes,
        dailyFocusMinutes: nextDailyFocusMinutes,
      };
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err?.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[Garden Record Focus Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se uložit blok soustředění.' });
  }
});

// =========================================================================
// 11. KURZY A AUTORITATIVNÍ ZÁPIS STUDENTŮ (TEACHER-ONLY ENROLLMENT)
// =========================================================================

const DEFAULT_FLAGSHIP_COURSES = [
  {
    id: 'course-combo',
    title: 'Komplexní příprava (Matematika + Čeština)',
    description:
      'Nejkomplexnější příprava na přijímací zkoušky na SŠ. 2x týdně živá online lekce přes Google Meet, kompletní videozáznamy, testy a materiály ke kurzu.',
    badge: 'Doporučeno • Nejoblíbenější',
    subject: 'MA + ČJ',
    price: '3 990 Kč / sezóna',
    difficulty: 'Střední až vyšší (Cermat 9. třída)',
    schedule: 'Úterý & Čtvrtek 17:00 – 18:30 (2× týdně, 90 min)',
    instructorName: 'Mgr. Kateřina Dvořáková & Mgr. Petr Horák',
    startDate: '2026-10-01',
    endDate: '2027-04-10',
    color: 'purple',
    studentCount: 42,
    syllabus: [
      'Úvod do CERMAT testů – typologie úloh a časový management',
      'Číselné obory, zlomky, desetinná čísla a priority operací',
      'Pravopisná pravidla: vyjmenovaná slova, koncovky podstatných a přídavných jmen',
      'Lineární rovnice a jejich soustavy s kontrolou zkouškou',
      'Větné rozbory: větné členy, stavba souvětí a interpunkce',
      'Slovní úlohy na pohyb, společnou práci a směsi',
      'Porozumění textu, práce s informacemi a literární pojmy',
      'Planimetrie a prostorová geometrie – obvody, obsahy a povrchy',
      'Konstrukční úlohy a rýsování podle zadání CERMAT',
      'Simulace ostrých přijímaček nanečisto a strategie eliminace chyb',
    ],
  },
  {
    id: 'course-math',
    title: 'Intenzivní kurz Matematiky na SŠ',
    description:
      'Systematické zvládnutí všech typů úloh z Cermat testů – geometrie, rovnice, slovní úlohy, procenta a strategie řešení. 1x týdně živá lekce.',
    badge: 'Matematika',
    subject: 'Matematika',
    price: '2 490 Kč / sezóna',
    difficulty: 'Střední (Cermat 9. třída)',
    schedule: 'Úterý 17:00 – 18:30 (1× týdně, 90 min)',
    instructorName: 'Mgr. Petr Horák',
    startDate: '2026-10-01',
    endDate: '2027-04-10',
    color: 'blue',
    studentCount: 38,
    syllabus: [
      'Zlomky, desetinná čísla a racionální čísla v praxi',
      'Mocniny, odmocniny a algebraické výrazy',
      'Lineární rovnice a vyjádření neznámé ze vzorce',
      'Slovní úlohy – rovnice, poměry a procenta',
      'Trojčlenka, měřítko mapy a jednotky',
      'Planimetrie: Pythagorova věta, trojúhelníky a mnohoúhelníky',
      'Tělesa: hranoly, jehlany, válce a jejich sítě',
      'Konstrukční úlohy s kružítkem a pravítkem',
      'Rozbory chytáků z minulých let testů CERMAT',
      'Závěrečný test nanečisto s podrobným rozborem',
    ],
  },
  {
    id: 'course-czech',
    title: 'Intenzivní kurz Českého jazyka na SŠ',
    description:
      'Zaměřeno na pravopisné jevy, větné rozbory, stylistiku, porozumění textu a typické chytáky v Cermat testech z češtiny. 1x týdně živá lekce.',
    badge: 'Český jazyk',
    subject: 'Český jazyk',
    price: '2 490 Kč / sezóna',
    difficulty: 'Střední (Cermat 9. třída)',
    schedule: 'Čtvrtek 17:00 – 18:30 (1× týdně, 90 min)',
    instructorName: 'Mgr. Kateřina Dvořáková',
    startDate: '2026-10-01',
    endDate: '2027-04-10',
    color: 'orange',
    studentCount: 35,
    syllabus: [
      'Pravopis: i/y, s/z, bě/bje, pě, vě/vje, mě/mně',
      'Tvarosloví a slovní druhy – určování gramatických kategorií',
      'Stavba slova: kořen, předpona, přípona a koncovka',
      'Skladba: základní a rozvíjející větné členy',
      'Druhy vedlejších vět a poměry mezi větami hlavními',
      'Práce s uměleckým i věcným textem, dedukce a vyvozování',
      'Stylistika, obohacování slovní zásoby, frazémy a rčení',
      'Základní literární formy, tropy a figury',
      'Analýza typických otevřených úloh v testech CERMAT',
      'Simulační test z českého jazyka a individuální feedback',
    ],
  },
];

function sanitizeCourseForViewer(courseDoc, user) {
  const serialized = serializeTimestampFields(courseDoc);
  const isTeacher = user?.role === 'teacher';
  const enrolledViaProfile =
    Array.isArray(user?.enrolledCourseIds) && user.enrolledCourseIds.includes(serialized.id);
  const enrolledViaCourse =
    Array.isArray(serialized.studentIds) && Boolean(user?.uid) && serialized.studentIds.includes(user.uid);
  const isEnrolled = Boolean(isTeacher || enrolledViaProfile || enrolledViaCourse);

  // SEC-34: teacherId a createdBy vracíme pouze učitelům (ne veřejným/žákovským klientům)
  const { meetUrl, studentIds, teacherId, createdBy, ...publicCourse } = serialized;
  return {
    ...publicCourse,
    isEnrolled,
    ...(isEnrolled && meetUrl ? { meetUrl } : {}),
    ...(isTeacher ? { studentIds: Array.isArray(studentIds) ? studentIds : [] } : {}),
    ...(isTeacher && teacherId !== undefined ? { teacherId } : {}),
    ...(isTeacher && createdBy !== undefined ? { createdBy } : {}),
  };
}

const COURSES_CACHE_TTL_MS = 60 * 1000;
const coursesListCache = {
  courses: null,
  expiresAt: 0,
  pendingPromise: null,
};

function invalidateCoursesListCache() {
  coursesListCache.courses = null;
  coursesListCache.expiresAt = 0;
  coursesListCache.pendingPromise = null;
}

async function loadCoursesListFromFirestore(options = {}) {
  const now = Date.now();
  if (!options.forceRefresh && coursesListCache.courses && coursesListCache.expiresAt > now) {
    return coursesListCache.courses;
  }
  if (!options.forceRefresh && coursesListCache.pendingPromise) {
    return coursesListCache.pendingPromise;
  }
  const promise = db
    .collection('courses')
    .get()
    .then((snap) => {
      const rawCourses = snap.empty
        ? DEFAULT_FLAGSHIP_COURSES
        : snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      coursesListCache.courses = rawCourses;
      coursesListCache.expiresAt = Date.now() + COURSES_CACHE_TTL_MS;
      coursesListCache.pendingPromise = null;
      return rawCourses;
    })
    .catch((err) => {
      coursesListCache.pendingPromise = null;
      throw err;
    });
  coursesListCache.pendingPromise = promise;
  return promise;
}

// 11.1 Veřejný seznam kurzů (meetUrl pouze pro zapsané / učitele, studentIds pouze pro učitele)
app.get('/api/courses', optionalAuth, async (req, res) => {
  try {
    const isTeacher = req.user?.role === 'teacher';
    const forceRefresh = isTeacher && (req.query.refresh === '1' || req.query.refresh === 'true');
    const rawCourses = await loadCoursesListFromFirestore({ forceRefresh });
    const courses = rawCourses.map((c) => sanitizeCourseForViewer(c, req.user));
    setPublicCatalogCacheHeaders(req, res);
    return res.json({ courses });
  } catch (err) {
    console.error('[Courses List Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se načíst seznam kurzů.' });
  }
});

// 11.1b Dynamická XML sitemapa kurzů pro Google Search Console (/sitemap-courses.xml & /api/sitemap-courses.xml)
app.get(['/sitemap-courses.xml', '/api/sitemap-courses.xml'], async (_req, res) => {
  try {
    const today = getPragueDateString();
    const snap = await db.collection('courses').get();
    const courseIds = new Set(['course-combo', 'course-math', 'course-czech']);
    snap.docs.forEach((d) => {
      if (d.id && /^[A-Za-z0-9_-]+$/.test(d.id)) {
        courseIds.add(d.id);
      }
    });

    const urlsXml = Array.from(courseIds)
      .map(
        (cid) => `  <url>
    <loc>https://www.proeducator.eu/courses/${escapeHtml(cid)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`
      )
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlsXml}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(xml);
  } catch (err) {
    console.error('[Sitemap Courses Error]:', err);
    return res.status(500).send('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
});

// 11.2 Detail kurzu
app.get('/api/courses/:courseId', optionalAuth, async (req, res) => {
  const { courseId } = req.params;
  if (!isValidMaterialId(courseId)) {
    return res.status(400).json({ error: 'Neplatné ID kurzu.' });
  }
  try {
    const snap = await db.collection('courses').doc(courseId).get();
    let courseDoc = null;
    if (snap.exists) {
      courseDoc = { id: snap.id, ...snap.data() };
    } else {
      const fallback = DEFAULT_FLAGSHIP_COURSES.find((c) => c.id === courseId);
      if (fallback) courseDoc = fallback;
    }
    if (!courseDoc) {
      return res.status(404).json({ error: 'Kurz nenalezen.' });
    }
    return res.json({ course: sanitizeCourseForViewer(courseDoc, req.user) });
  } catch (err) {
    console.error('[Course Detail Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se načíst detail kurzu.' });
  }
});

// 11.3 Zápis studenta do kurzu (pouze učitel; atomicky aktualizuje kurz, profil i Custom Claims)
app.post('/api/courses/:courseId/enroll', requireAuth, requireTeacher, async (req, res) => {
  const { courseId } = req.params;
  const { studentUid } = req.body || {};
  if (!isValidMaterialId(courseId) || typeof studentUid !== 'string' || !studentUid.trim()) {
    return res.status(400).json({ error: 'Chybí platné courseId nebo studentUid.' });
  }
  const cleanStudentUid = studentUid.trim();

  try {
    const courseRef = db.collection('courses').doc(courseId);
    const userRef = db.collection('users').doc(cleanStudentUid);
    const flagshipFallback = DEFAULT_FLAGSHIP_COURSES.find((c) => c.id === courseId) || null;

    const txResult = await db.runTransaction(async (tx) => {
      const [courseSnap, userSnap] = await Promise.all([tx.get(courseRef), tx.get(userRef)]);
      if (!userSnap.exists) {
        throw createMaterialHttpError(404, 'Student nebyl nalezen.');
      }
      if (!courseSnap.exists && !flagshipFallback) {
        throw createMaterialHttpError(404, 'Kurz nebyl nalezen.');
      }

      const courseData = courseSnap.exists ? courseSnap.data() || {} : { ...flagshipFallback };
      const existingStudentIds = Array.isArray(courseData.studentIds) ? courseData.studentIds : [];
      const nextStudentIds = Array.from(new Set([...existingStudentIds, cleanStudentUid]));

      if (courseSnap.exists) {
        tx.update(courseRef, {
          studentIds: nextStudentIds,
          studentCount: nextStudentIds.length,
          updatedAt: Timestamp.now(),
        });
      } else {
        tx.set(courseRef, {
          ...flagshipFallback,
          studentIds: nextStudentIds,
          studentCount: nextStudentIds.length,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      }

      const userData = userSnap.data() || {};
      const nextEnrolled = Array.from(new Set([...normalizeEnrolledCourseIds(userData), courseId]));
      const nextRole =
        userData.role === 'teacher' || userData.role === 'premium' ? userData.role : 'course';

      tx.update(userRef, {
        enrolledCourseIds: nextEnrolled,
        courseId: nextEnrolled[0],
        role: nextRole,
        updatedAt: Timestamp.now(),
      });

      return { role: nextRole, enrolledCourseIds: nextEnrolled };
    });

    await syncCustomClaimsIfNeeded(cleanStudentUid, txResult.role, txResult.enrolledCourseIds);
    userRoleCache.delete(cleanStudentUid);
    invalidateCoursesListCache();

    return res.json({
      ok: true,
      courseId,
      studentUid: cleanStudentUid,
      role: txResult.role,
      enrolledCourseIds: txResult.enrolledCourseIds,
    });
  } catch (err) {
    if (err?.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[Course Enroll Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se zapsat studenta do kurzu.' });
  }
});

// 11.4 Odebrání studenta z kurzu (pouze učitel; atomicky aktualizuje kurz, profil i Custom Claims)
app.delete('/api/courses/:courseId/enroll/:studentUid', requireAuth, requireTeacher, async (req, res) => {
  const { courseId, studentUid } = req.params;
  if (!isValidMaterialId(courseId) || !studentUid || !studentUid.trim()) {
    return res.status(400).json({ error: 'Neplatné courseId nebo studentUid.' });
  }
  const cleanStudentUid = studentUid.trim();

  try {
    const courseRef = db.collection('courses').doc(courseId);
    const userRef = db.collection('users').doc(cleanStudentUid);

    const txResult = await db.runTransaction(async (tx) => {
      const [courseSnap, userSnap] = await Promise.all([tx.get(courseRef), tx.get(userRef)]);
      if (!userSnap.exists) {
        throw createMaterialHttpError(404, 'Student nebyl nalezen.');
      }

      if (courseSnap.exists) {
        const courseData = courseSnap.data() || {};
        const existingStudentIds = Array.isArray(courseData.studentIds) ? courseData.studentIds : [];
        const nextStudentIds = existingStudentIds.filter((id) => id !== cleanStudentUid);
        tx.update(courseRef, {
          studentIds: nextStudentIds,
          studentCount: nextStudentIds.length,
          updatedAt: Timestamp.now(),
        });
      }

      const userData = userSnap.data() || {};
      const nextEnrolled = normalizeEnrolledCourseIds(userData).filter((id) => id !== courseId);
      let nextRole = userData.role || 'free';
      if (nextRole === 'course' && nextEnrolled.length === 0) {
        nextRole = 'free';
      }

      tx.update(userRef, {
        enrolledCourseIds: nextEnrolled,
        courseId: nextEnrolled[0] || null,
        role: nextRole,
        updatedAt: Timestamp.now(),
      });

      return { role: nextRole, enrolledCourseIds: nextEnrolled };
    });

    await syncCustomClaimsIfNeeded(cleanStudentUid, txResult.role, txResult.enrolledCourseIds);
    await revokeUserTokensSafe(cleanStudentUid, 'course-unenroll');
    userRoleCache.delete(cleanStudentUid);
    invalidateCoursesListCache();

    return res.json({
      ok: true,
      courseId,
      studentUid: cleanStudentUid,
      role: txResult.role,
      enrolledCourseIds: txResult.enrolledCourseIds,
    });
  } catch (err) {
    if (err?.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('[Course Unenroll Error]:', err);
    return res.status(500).json({ error: 'Nepodařilo se odebrat studenta z kurzu.' });
  }
});

// 404 handler pro všechny neexistující API požadavky, aby nepropadávaly do Vite middleware
app.all(['/api', '/api/*'], (req, res) => {
  return res.status(404).json({ error: `API endpoint ${req.method} ${req.path} nenalezen.` });
});

// Vite middleware / static serving / Cloud Function export
if (isDirectExecution) {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: true,
        fs: {
          strict: true,
          deny: [
            '**/server/**',
            '**/.env*',
            '**/*.rules',
            '**/.firebaserc',
            '**/firebase-applet-config.json',
            '**/google-services.json',
          ],
        },
        watch: {
          ignored: [
            '**/*.png',
            '**/*.jpg',
            '**/*.jpeg',
            '**/*.pdf',
            '**/dist/**',
            '**/.git/**',
            '**/*.log',
            '**/server/**',
            '**/public/uploads/**',
            '**/.gemini/**',
            '**/brain/**',
            '**/scratch/**',
          ],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use('/proeducator', express.static(distPath));
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  // Globální ošetření chyb (bez úniku interních chybových zpráv ven)
  app.use((err, req, res, _next) => {
    if (err?.type === 'request.aborted' || err?.code === 'ECONNABORTED' || err?.message?.includes('aborted')) {
      console.warn('[Server]: Request byl přerušen klientem:', req.path);
      return;
    }
    const status = Number(err?.status || err?.statusCode) || 500;
    console.error('[Server Error Handler]:', err);
    if (!res.headersSent) {
      res.status(status).json({
        error: status < 500 ? err.message || 'Neplatný požadavek.' : 'Interní chyba serveru.',
      });
    }
  });

  app.listen(PORT, HOST, () => {
    console.log(`ProEdu Server running on http://${HOST}:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    if (process.env.DISABLE_LOCAL_CRON !== 'true' && process.env.ENABLE_LOCAL_SUBSCRIPTION_CRON === 'true') {
      const intervalMs = 6 * 60 * 60 * 1000;
      const timer = setInterval(() => {
        runDueRecurringSubscriptions().catch((err) =>
          console.warn('[Local Subscription Cron Error]:', err?.message || err)
        );
      }, intervalMs);
      timer.unref?.();
    }
  });
} else {
  // Globální ošetření chyb v Cloud Function (bez úniku interních detailů)
  app.use((err, _req, res, _next) => {
    if (err?.type === 'request.aborted' || err?.code === 'ECONNABORTED' || err?.message?.includes('aborted')) {
      return;
    }
    const status = Number(err?.status || err?.statusCode) || 500;
    console.error('[Cloud Function Error Handler]:', err);
    if (!res.headersSent) {
      res.status(status).json({
        error: status < 500 ? err.message || 'Neplatný požadavek.' : 'Interní chyba serveru.',
      });
    }
  });
}

export const api = onRequest(
  {
    region: 'europe-west1',
    cors: getAllowedCorsOrigins(),
    maxInstances: 10,
    memory: '512MiB',
    timeoutSeconds: 60,
  },
  app
);

// Denní automatické obnovení Comgate předplatného a vystavení faktur v iÚčtu
export const scheduledSubscriptionRenewal = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'Europe/Prague',
    region: 'europe-west1',
    timeoutSeconds: 300,
  },
  async () => {
    await runDueRecurringSubscriptions();
  }
);

// Automatický trigger při smazání uživatele ve Firebase Authentication (vyčistí všechna navázaná data studenta)
export const onAuthUserDeleted = authUserTrigger().onDelete(async (userRecord) => {
  if (!userRecord || !userRecord.uid) return;
  const uid = userRecord.uid;
  console.log(`[onUserDeleted Trigger]: Uživatel smazán z Firebase Auth: ${userRecord.email || 'N/A'} (UID: ${uid})`);

  try {
    await cleanupStudentDataServer(uid);
    console.log(`[onUserDeleted Trigger]: Úspěšně vyčištěna navázaná data pro studenta UID: ${uid}`);
  } catch (err) {
    console.error(`[onUserDeleted Trigger Error] pro studenta UID: ${uid}:`, err);
  }
});
