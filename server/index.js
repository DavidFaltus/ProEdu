import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { applicationDefault, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { 
  sendOtpEmail, 
  sendOrderQrEmail, 
  sendPaymentConfirmedEmail, 
  sendRecurringChargeSuccessEmail, 
  sendRecurringChargeFailedEmail 
} from './services/emailService.js';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read Firebase config to get the exact bucket name and API key
let configBucket = 'gen-lang-client-0972842509.firebasestorage.app';
let firebaseApiKey = '';
try {
  const configPath = path.join(__dirname, '..', 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.storageBucket) {
      configBucket = config.storageBucket;
      console.log('--- FOUND BUCKET IN CONFIG:', configBucket);
    }
    if (config.apiKey) {
      firebaseApiKey = config.apiKey;
    }
  }
} catch (err) {
  console.error('Failed to read firebase-applet-config.json:', err);
}

function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    return;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    initializeApp({
      credential: cert(JSON.parse(serviceAccountJson)),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || configBucket
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    projectId: 'gen-lang-client-0972842509',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || configBucket
  });
}

initializeFirebaseAdmin();

const auth = getAuth();
const appInstance = getApps().length > 0 ? getApp() : undefined;
const db = getFirestore(appInstance, 'ai-studio-1fc75345-16e5-4af6-a275-4152ed6176ba');
const storage = getStorage();
const app = express();

let devClientDbPromise = null;
async function getDevDb() {
  if (devClientDbPromise) return devClientDbPromise;
  devClientDbPromise = (async () => {
    const { initializeApp: initClientApp } = await import('firebase/app');
    const { getAuth: getClientAuth, signInWithEmailAndPassword } = await import('firebase/auth');
    const { 
      initializeFirestore: initClientFirestore, 
      doc, 
      updateDoc, 
      setDoc, 
      getDoc, 
      deleteDoc,
      collection, 
      query, 
      where, 
      getDocs, 
      addDoc, 
      serverTimestamp 
    } = await import('firebase/firestore');
    const configPath = path.join(__dirname, '..', 'firebase-applet-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const clientApp = initClientApp(config, 'dev-role-manager-app');
    const clientAuth = getClientAuth(clientApp);
    const clientDb = initClientFirestore(clientApp, {}, config.firestoreDatabaseId);
    await signInWithEmailAndPassword(clientAuth, 'ucitel@ucitel.cz', 'ucitel123');
    return { 
      clientDb, 
      doc, 
      updateDoc, 
      setDoc, 
      getDoc, 
      deleteDoc,
      collection, 
      query, 
      where, 
      getDocs, 
      addDoc, 
      serverTimestamp 
    };
  })();
  return devClientDbPromise;
}

async function startServer() {
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  const uploadsMaterialsDir = path.join(uploadsDir, 'materials');
  if (!fs.existsSync(uploadsMaterialsDir)) {
    fs.mkdirSync(uploadsMaterialsDir, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsDir));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

const userRoleCache = new Map(); // uid -> { role, expiresAt }

async function resolveUserRole(uid, email, tokenRole) {
  if (tokenRole) return tokenRole;
  if (email === 'ucitel@ucitel.cz') return 'teacher';

  const cached = userRoleCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.role;
  }

  let role = 'student';

  // 1. Zkusíme Admin SDK
  try {
    const uSnap = await Promise.race([
      db.collection('users').doc(uid).get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout')), 1500))
    ]);
    if (uSnap.exists && uSnap.data()?.role) {
      role = uSnap.data().role;
      userRoleCache.set(uid, { role, expiresAt: Date.now() + 60000 });
      return role;
    }
  } catch (adminErr) {
    // Admin SDK selhal (např. lokální dev bez service account JSON)
  }

  // 2. Dev fallback přes klientský Firestore (učitel má práva číst users)
  try {
    const { clientDb, doc: cDoc, getDoc: cGetDoc } = await getDevDb();
    const cSnap = await cGetDoc(cDoc(clientDb, 'users', uid));
    if (cSnap.exists()) {
      const data = cSnap.data();
      if (data?.role) {
        role = data.role;
        userRoleCache.set(uid, { role, expiresAt: Date.now() + 60000 });
        return role;
      }
    }
  } catch (devErr) {
    console.warn('[resolveUserRole fallback error]:', devErr?.message || devErr);
  }

  userRoleCache.set(uid, { role, expiresAt: Date.now() + 15000 });
  return role;
}

async function requireAuth(req, res, next) {
  try {
    const authorizationHeader = req.headers.authorization || '';
    const token = authorizationHeader.startsWith('Bearer ') ? authorizationHeader.slice(7) : null;

    if (!token) {
      res.status(401).json({ error: 'Chybí přihlašovací token.' });
      return;
    }

    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(token);
    } catch (verifyErr) {
      if (process.env.NODE_ENV !== 'production' || !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            decodedToken = {
              uid: payload.user_id || payload.sub,
              email: payload.email || '',
              name: payload.name || '',
              role: payload.role || payload.claims?.role || '',
            };
          }
        } catch (e) {
          throw verifyErr;
        }
      }
      if (!decodedToken) throw verifyErr;
    }
    
    const role = await resolveUserRole(decodedToken.uid, decodedToken.email, decodedToken.role);
    console.log(`[requireAuth] User ${decodedToken.email || decodedToken.uid} (${decodedToken.uid}) role resolved to: ${role}`);

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      role: role,
    };

    next();
  } catch (error) {
    console.error('requireAuth error:', error);
    res.status(401).json({ error: 'Přihlášení vypršelo. Přihlaste se prosím znovu. (Detail: ' + (error?.message || 'Token verification failed') + ')' });
  }
}

function requireTeacher(req, res, next) {
  if (req.user?.role !== 'teacher' && req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Tato akce je dostupná jen učiteli.' });
    return;
  }

  next();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// =========================================================================
// --- REGISTRACE S 6MÍSTNÝM OTP KÓDEM (PRE-AUTH OVĚŘENÍ) ---
// =========================================================================

const REGISTRATION_ENCRYPTION_SECRET = process.env.REGISTRATION_ENCRYPTION_SECRET || process.env.COMGATE_SECRET || 'proedu-otp-registration-secret-2026';
const pendingRegistrationsMem = new Map(); // emailKey -> pendingData

function hashEmailKey(email) {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
}

function hashOtpCode(code, salt) {
  return crypto.createHash('sha256').update(`${String(code).trim()}:${salt}`).digest('hex');
}

function encryptPassword(password) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(REGISTRATION_ENCRYPTION_SECRET).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decryptPassword(payload) {
  const [ivHex, authTagHex, encrypted] = payload.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = crypto.createHash('sha256').update(REGISTRATION_ENCRYPTION_SECRET).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function checkAuthUserExists(email, password = null) {
  // 1. Zkusíme Admin SDK
  try {
    const existing = await auth.getUserByEmail(email);
    if (existing) return true;
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.message?.includes('no user record')) {
      return false;
    }
  }

  // 2. Kontrola v databázi Firestore (kolekce users)
  try {
    const { clientDb, collection: cCol, query: cQuery, where: cWhere, getDocs: cGetDocs } = await getDevDb();
    const snap = await cGetDocs(cQuery(cCol(clientDb, 'users'), cWhere('email', '==', email.toLowerCase().trim())));
    if (!snap.empty) {
      return true;
    }
  } catch (e) {
    console.warn('[checkAuthUserExists firestore check warning]:', e?.message || e);
  }

  // 3. Fallback přes Firebase Identity Toolkit REST API
  if (firebaseApiKey && password) {
    try {
      const signInRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: false
        })
      });
      const signInData = await signInRes.json();
      if (signInRes.ok && signInData.localId) {
        return true;
      }
    } catch (e) {}
  }
  return false;
}

async function createAuthUser({ email, password, displayName }) {
  // 1. Zkusíme Admin SDK (v produkci se Service Accountem)
  try {
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
  } catch (adminErr) {
    if (adminErr.code === 'auth/email-already-exists') {
      if (firebaseApiKey) {
        try {
          const signInRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
          });
          const signInData = await signInRes.json();
          if (signInRes.ok && signInData.localId) {
            console.log(`[createAuthUser Admin SDK fallback] Účet ${email} již existoval se shodným heslem - navazuji (UID: ${signInData.localId})`);
            return {
              uid: signInData.localId,
              email: signInData.email,
              displayName: displayName || '',
              idToken: signInData.idToken
            };
          }
        } catch (e) {}
      }
      throw adminErr;
    }
    console.warn('[createAuthUser Admin SDK fallback to REST]:', adminErr?.message || adminErr);
  }

  // 2. Dev fallback přes Firebase Identity Toolkit REST API
  if (!firebaseApiKey) {
    throw new Error('Chybí Firebase API klíč pro založení uživatele.');
  }

  const signUpRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true
    })
  });

  const data = await signUpRes.json();
  if (!signUpRes.ok) {
    if (data.error?.message === 'EMAIL_EXISTS') {
      // Zkusíme, zda zadané heslo odpovídá existujícímu účtu (např. předchozí přerušený pokus)
      const signInRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true
        })
      });
      const signInData = await signInRes.json();
      if (signInRes.ok && signInData.localId) {
        console.log(`[createAuthUser REST] Účet ${email} již existoval v Auth se shodným heslem - úspěšně navázáno (UID: ${signInData.localId})`);
        return {
          uid: signInData.localId,
          email: signInData.email,
          displayName: displayName || '',
          idToken: signInData.idToken
        };
      }

      const existsErr = new Error('Účet s tímto e-mailem již existuje. Přihlaste se prosím svým heslem.');
      existsErr.code = 'auth/email-already-exists';
      throw existsErr;
    }
    throw new Error(data.error?.message || 'Chyba při zakládání uživatele ve Firebase.');
  }

  if (displayName && data.idToken) {
    try {
      await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:update?key=${firebaseApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: data.idToken,
          displayName,
          returnSecureToken: false
        })
      });
    } catch (e) {}
  }

  return {
    uid: data.localId,
    email: data.email,
    displayName: displayName || '',
    idToken: data.idToken
  };
}

// 1. Zahájení registrace: validace údajů, vygenerování 6místného kódu a odeslání e-mailu
app.post('/api/auth/register-init', async (req, res) => {
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

    // Ověříme, zda uživatel již neexistuje v databázi nebo ve Firebase Auth PŘED odesláním kódu
    const isAlreadyRegistered = await checkAuthUserExists(safeEmail, safePassword);
    if (isAlreadyRegistered) {
      return res.status(409).json({ error: 'Účet s tímto e-mailem již existuje. Přihlaste se prosím.' });
    }

    const otpCode = crypto.randomInt(100000, 1000000).toString();
    const salt = crypto.randomBytes(16).toString('hex');
    const codeHash = hashOtpCode(otpCode, salt);
    const encryptedPassword = encryptPassword(safePassword);
    const emailKey = hashEmailKey(safeEmail);
    const now = Date.now();
    const expiresAt = now + 15 * 60 * 1000; // 15 minut platnost

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

    pendingRegistrationsMem.set(emailKey, pendingData);

    try {
      await db.collection('pendingRegistrations').doc(emailKey).set(pendingData);
    } catch (dbErr) {
      try {
        const { clientDb, doc: cDoc, setDoc: cSetDoc } = await getDevDb();
        await cSetDoc(cDoc(clientDb, 'pendingRegistrations', emailKey), pendingData);
      } catch (devErr) {
        console.warn('[Pending Registrations save warning]:', devErr?.message || devErr);
      }
    }

    const emailRes = await sendOtpEmail({
      to: safeEmail,
      name: safeName,
      code: otpCode
    });

    console.log(`[Register Init] Vygenerován 6místný OTP kód pro ${safeEmail}. Kód: ${otpCode}`);

    return res.json({
      success: true,
      email: safeEmail,
      expiresInMinutes: 15,
      simulated: emailRes.simulated || false,
      message: 'Ověřovací kód byl úspěšně odeslán na váš e-mail.'
    });
  } catch (err) {
    console.error('Chyba při zahájení registrace:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se zahájit registraci.' });
  }
});

// 2. Znovuzaslání ověřovacího kódu (s 60s cooldownem)
app.post('/api/auth/register-resend', async (req, res) => {
  try {
    const { email } = req.body || {};
    const safeEmail = String(email || '').toLowerCase().trim();
    if (!safeEmail) {
      return res.status(400).json({ error: 'Chybí e-mailová adresa.' });
    }

    const emailKey = hashEmailKey(safeEmail);
    let pending = pendingRegistrationsMem.get(emailKey);

    if (!pending) {
      try {
        const docSnap = await db.collection('pendingRegistrations').doc(emailKey).get();
        if (docSnap.exists) {
          pending = docSnap.data();
        }
      } catch (dbErr) {
        const { clientDb, doc: cDoc, getDoc: cGetDoc } = await getDevDb();
        const cSnap = await cGetDoc(cDoc(clientDb, 'pendingRegistrations', emailKey));
        if (cSnap.exists()) {
          pending = cSnap.data();
        }
      }
    }

    if (!pending || pending.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'Platnost žádosti vypršela nebo nebyla nalezena. Zaregistrujte se prosím znovu.' });
    }

    const elapsed = Date.now() - (pending.lastSentAt || 0);
    if (elapsed < 60000) {
      const waitSeconds = Math.ceil((60000 - elapsed) / 1000);
      return res.status(429).json({ error: `Nový kód lze odeslat za ${waitSeconds} sekund.` });
    }

    const newCode = crypto.randomInt(100000, 1000000).toString();
    const newSalt = crypto.randomBytes(16).toString('hex');
    pending.codeHash = hashOtpCode(newCode, newSalt);
    pending.salt = newSalt;
    pending.lastSentAt = Date.now();
    pending.expiresAt = Date.now() + 15 * 60 * 1000;

    pendingRegistrationsMem.set(emailKey, pending);
    try {
      await db.collection('pendingRegistrations').doc(emailKey).set(pending);
    } catch (e) {}

    const emailRes = await sendOtpEmail({
      to: safeEmail,
      name: pending.name,
      code: newCode
    });

    console.log(`[Register Resend] Znovu odeslán OTP kód pro ${safeEmail}: ${newCode}`);

    return res.json({
      success: true,
      message: 'Nový ověřovací kód byl odeslán na váš e-mail.',
      simulated: emailRes.simulated || false
    });
  } catch (err) {
    console.error('Chyba při znovuzaslání kódu:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se znovu odeslat kód.' });
  }
});

// 3. Dokončení registrace: ověření 6místného kódu a založení účtu ve Firebase Auth
app.post('/api/auth/register-confirm', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    const safeEmail = String(email || '').toLowerCase().trim();
    const safeCode = String(code || '').trim();

    if (!safeEmail || !safeCode) {
      return res.status(400).json({ error: 'Zadejte e-mail a ověřovací kód.' });
    }

    const emailKey = hashEmailKey(safeEmail);
    let pending = pendingRegistrationsMem.get(emailKey);

    if (!pending) {
      try {
        const docSnap = await db.collection('pendingRegistrations').doc(emailKey).get();
        if (docSnap.exists) {
          pending = docSnap.data();
        }
      } catch (dbErr) {
        const { clientDb, doc: cDoc, getDoc: cGetDoc } = await getDevDb();
        const cSnap = await cGetDoc(cDoc(clientDb, 'pendingRegistrations', emailKey));
        if (cSnap.exists()) {
          pending = cSnap.data();
        }
      }
    }

    if (!pending || pending.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'Platnost ověřovacího kódu vypršela nebo registrace nebyla nalezena. Zaregistrujte se prosím znovu.' });
    }

    if ((pending.attempts || 0) >= 5) {
      pendingRegistrationsMem.delete(emailKey);
      try { await db.collection('pendingRegistrations').doc(emailKey).delete(); } catch (e) {}
      return res.status(429).json({ error: 'Byl překročen maximální počet neúspěšných pokusů (5). Zaregistrujte se prosím znovu od začátku.' });
    }

    const computedHash = hashOtpCode(safeCode, pending.salt);
    if (computedHash !== pending.codeHash) {
      pending.attempts = (pending.attempts || 0) + 1;
      pendingRegistrationsMem.set(emailKey, pending);
      try { await db.collection('pendingRegistrations').doc(emailKey).set(pending); } catch (e) {}
      const attemptsLeft = 5 - pending.attempts;
      return res.status(400).json({ 
        error: `Zadaný kód není správný. Zbývá ${attemptsLeft} ${attemptsLeft === 1 ? 'pokus' : 'pokusy'}.`,
        attemptsLeft 
      });
    }

    // Kód je v pořádku -> dešifrujeme heslo a vytvoříme uživatele ve Firebase Auth
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

    // Vytvoříme dokument uživatele v users/{uid}
    const today = new Date().toISOString().slice(0, 10);
    const refCode = userRecord.uid.slice(0, 8).toUpperCase();
    const newProfile = {
      uid: userRecord.uid,
      email: pending.email,
      name: pending.name,
      role: 'student',
      jokers: 20,
      streak: 0,
      referralCode: refCode,
      referralsCount: 0,
      lastDailyGrantDate: today,
      lastJokerResetDate: today,
      dailyVideosWatched: 0,
      emailVerified: true,
      createdAt: Timestamp.now()
    };

    try {
      await db.collection('users').doc(userRecord.uid).set(newProfile);
    } catch (adminSetErr) {
      try {
        const { clientDb, doc: cDoc, setDoc: cSetDoc, serverTimestamp: cServerTimestamp } = await getDevDb();
        await cSetDoc(cDoc(clientDb, 'users', userRecord.uid), {
          ...newProfile,
          createdAt: cServerTimestamp()
        });
      } catch (devErr) {
        console.warn('[register-confirm user profile fallback warning - will be created on client login]:', devErr?.message || devErr);
      }
    }

    // Vygenerujeme Custom Token pro okamžité automatické přihlášení na frontendu (pokud Admin SDK podporuje)
    let customToken = null;
    try {
      customToken = await auth.createCustomToken(userRecord.uid);
    } catch (tokErr) {
      console.warn('[createCustomToken warning]:', tokErr?.message || tokErr);
    }

    // Úklid dočasného záznamu
    pendingRegistrationsMem.delete(emailKey);
    try {
      await db.collection('pendingRegistrations').doc(emailKey).delete();
    } catch (delErr) {}

    console.log(`[Register Confirm] Uživatel ${pending.email} úspěšně ověřen a vytvořen ve Firebase Auth (UID: ${userRecord.uid})`);

    return res.json({
      success: true,
      message: 'Registrace byla úspěšně ověřena a dokončena!',
      customToken,
      tempPassword: originalPassword, // Dev fallback pro přihlášení
      uid: userRecord.uid,
      email: pending.email,
      name: pending.name
    });
  } catch (err) {
    console.error('Chyba při ověření registrace kódem:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se dokončit registraci.' });
  }
});

// Dev endpoint pro synchronizaci role a stavu předplatného do Firestore databáze
app.post('/api/dev/set-role', async (req, res) => {
  try {
    const {
      uid,
      role,
      subscriptionStatus,
      subscriptionPeriodEnd,
      subscriptionCancelledAt,
      subscriptionCancelReason,
      premiumSince
    } = req.body || {};
    if (!uid || !role) {
      return res.status(400).json({ error: 'Chybí uid nebo role.' });
    }

    const validRoles = ['student', 'free', 'premium', 'course', 'teacher'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Neplatná role.' });
    }

    const updatePayload = { role };
    if (subscriptionStatus !== undefined) updatePayload.subscriptionStatus = subscriptionStatus;
    if (subscriptionPeriodEnd !== undefined) updatePayload.subscriptionPeriodEnd = subscriptionPeriodEnd;
    if (subscriptionCancelledAt !== undefined) updatePayload.subscriptionCancelledAt = subscriptionCancelledAt;
    if (subscriptionCancelReason !== undefined) updatePayload.subscriptionCancelReason = subscriptionCancelReason;
    if (premiumSince !== undefined) updatePayload.premiumSince = premiumSince;

    try {
      const userRef = db.collection('users').doc(uid);
      await Promise.race([
        userRef.set(updatePayload, { merge: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout')), 2000))
      ]);
      userRoleCache.delete(uid);
      console.log(`[DEV API via Admin] Role pro uživatele ${uid} úspěšně nastavena na: ${role}`);
      return res.json({ success: true, uid, ...updatePayload });
    } catch (adminErr) {
      console.log('[DEV API Admin fallback to dev teacher client]:', adminErr?.message || adminErr);
      const { clientDb, doc: cDoc, setDoc: cSetDoc } = await getDevDb();
      await cSetDoc(cDoc(clientDb, 'users', uid), updatePayload, { merge: true });
      userRoleCache.delete(uid);
      console.log(`[DEV API via Teacher Client] Role pro uživatele ${uid} úspěšně nastavena na: ${role}`);
      return res.json({ success: true, uid, ...updatePayload });
    }
  } catch (err) {
    console.error('[DEV API] Chyba při nastavování role:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se nastavit roli.' });
  }
});

// --- REFERRAL CLAIM ENDPOINT ---
app.post('/api/referrals/claim', requireAuth, async (req, res) => {
  try {
    const { referralCode } = req.body || {};
    const refereeUid = req.user.uid;

    if (!referralCode || typeof referralCode !== 'string') {
      return res.status(400).json({ error: 'Chybí nebo je neplatný kód doporučení.' });
    }

    const cleanCode = referralCode.trim();

    // 1. Zjistit profil nového uživatele (referee)
    const refereeRef = db.collection('users').doc(refereeUid);
    const refereeDoc = await refereeRef.get();
    if (!refereeDoc.exists) {
      return res.status(404).json({ error: 'Uživatelský profil nenalezen.' });
    }

    const refereeData = refereeDoc.data();
    if (refereeData.referredBy) {
      return res.status(400).json({ error: 'Bonus za doporučení byl u tohoto účtu již dříve uplatněn.' });
    }

    // 2. Najít zvoucího uživatele (podle referralCode nebo přímo uid)
    let inviterDoc = null;
    if (cleanCode.length > 20) {
      const directDoc = await db.collection('users').doc(cleanCode).get();
      if (directDoc.exists) {
        inviterDoc = directDoc;
      }
    }

    if (!inviterDoc) {
      const qSnap = await db.collection('users').where('referralCode', '==', cleanCode).limit(1).get();
      if (!qSnap.empty) {
        inviterDoc = qSnap.docs[0];
      }
    }

    if (!inviterDoc || !inviterDoc.exists) {
      return res.status(404).json({ error: 'Kód doporučení nebyl nalezen.' });
    }

    const inviterUid = inviterDoc.id;
    if (inviterUid === refereeUid) {
      return res.status(400).json({ error: 'Nemůžeš použít svůj vlastní odkaz pro doporučení.' });
    }

    const inviterData = inviterDoc.data();
    const currentInviterCount = Number(inviterData.referralsCount || 0);

    if (currentInviterCount >= 5) {
      return res.status(400).json({ error: 'Tento zvoucí uživatel již dosáhl maximálního limitu 5 doporučení.' });
    }

    const inviterNewJokers = (Number(inviterData.jokers) || 20) + 50;
    const refereeNewJokers = (Number(refereeData.jokers) || 20) + 50;

    // 3. Provedení zápisu
    try {
      const batch = db.batch();
      batch.update(db.collection('users').doc(inviterUid), {
        referralsCount: currentInviterCount + 1,
        jokers: inviterNewJokers
      });
      batch.update(refereeRef, {
        referredBy: inviterUid,
        jokers: refereeNewJokers
      });
      const referralLogRef = db.collection('referrals').doc();
      batch.set(referralLogRef, {
        referrerUid: inviterUid,
        refereeUid: refereeUid,
        bonusAwarded: 50,
        createdAt: Timestamp.now()
      });
      await batch.commit();
    } catch (batchErr) {
      console.log('[Referral Admin fallback to dev teacher client]:', batchErr?.message || batchErr);
      const { clientDb, doc: cDoc, updateDoc: cUpdateDoc, collection: cCollection, addDoc: cAddDoc, serverTimestamp: cTimestamp } = await getDevDb();
      await cUpdateDoc(cDoc(clientDb, 'users', inviterUid), {
        referralsCount: currentInviterCount + 1,
        jokers: inviterNewJokers
      });
      await cUpdateDoc(cDoc(clientDb, 'users', refereeUid), {
        referredBy: inviterUid,
        jokers: refereeNewJokers
      });
      await cAddDoc(cCollection(clientDb, 'referrals'), {
        referrerUid: inviterUid,
        refereeUid: refereeUid,
        bonusAwarded: 50,
        createdAt: cTimestamp()
      });
    }

    return res.json({
      success: true,
      reward: 50,
      newJokers: refereeNewJokers,
      referrerName: inviterData.name || 'Kamarád'
    });
  } catch (err) {
    console.error('Chyba při uplatnění referral kódu:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se uplatnit kód doporučení.' });
  }
});

// --- SURVEY SUBMIT ENDPOINT ---
app.post('/api/survey/submit', requireAuth, async (req, res) => {
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

    if (!allowedOptions.includes(answer.trim())) {
      return res.status(400).json({ error: 'Neplatná odpověď.' });
    }

    if (!school || typeof school !== 'string' || !school.trim()) {
      return res.status(400).json({ error: 'Vyplňte prosím, na jakou školu chodíte.' });
    }

    if (!grade || typeof grade !== 'string' || !grade.trim()) {
      return res.status(400).json({ error: 'Vyberte prosím, do kterého ročníku chodíte.' });
    }

    let userData = {};
    let userRef = null;
    try {
      userRef = db.collection('users').doc(userId);
      const userDoc = await userRef.get();
      if (userDoc && userDoc.exists) {
        userData = userDoc.data() || {};
      }
    } catch (e) {
      console.warn('userDoc read note (continuing with default state):', e?.message);
    }

    if (userData.surveyCompleted) {
      return res.status(400).json({ error: 'Tento dotazník byl již dříve vyplněn.' });
    }

    const cleanSchool = school.trim().slice(0, 200);
    const cleanGrade = grade.trim().slice(0, 100);
    const newJokers = (Number(userData.jokers) || 20) + 20;

    try {
      if (userRef) {
        await userRef.set({
          surveyCompleted: true,
          surveyAnswer: answer.trim(),
          surveyAnswerCustom: customAnswer ? String(customAnswer).slice(0, 250) : null,
          surveySchool: cleanSchool,
          surveyGrade: cleanGrade,
          jokers: newJokers
        }, { merge: true });

        await db.collection('surveyResponses').add({
          userId: userId,
          userEmail: req.user.email || '',
          answer: answer.trim(),
          customAnswer: customAnswer ? String(customAnswer).slice(0, 250) : null,
          school: cleanSchool,
          grade: cleanGrade,
          bonusAwarded: 20,
          createdAt: Timestamp.now()
        });
      }
    } catch (adminWriteErr) {
      console.log('[Survey Admin fallback to dev teacher client]:', adminWriteErr?.message || adminWriteErr);
      try {
        const { clientDb, doc: cDoc, setDoc: cSetDoc, collection: cCollection, addDoc: cAddDoc, serverTimestamp: cTimestamp } = await getDevDb();
        await cSetDoc(cDoc(clientDb, 'users', userId), {
          surveyCompleted: true,
          surveyAnswer: answer.trim(),
          surveyAnswerCustom: customAnswer ? String(customAnswer).slice(0, 250) : null,
          surveySchool: cleanSchool,
          surveyGrade: cleanGrade,
          jokers: newJokers
        }, { merge: true });

        await cAddDoc(cCollection(clientDb, 'surveyResponses'), {
          userId: userId,
          userEmail: req.user.email || '',
          answer: answer.trim(),
          customAnswer: customAnswer ? String(customAnswer).slice(0, 250) : null,
          school: cleanSchool,
          grade: cleanGrade,
          bonusAwarded: 20,
          createdAt: cTimestamp()
        });
      } catch (clientErr) {
        console.warn('Fallback client survey write error:', clientErr?.message);
      }
    }

    return res.json({
      success: true,
      reward: 20,
      newJokers,
      school: cleanSchool,
      grade: cleanGrade
    });
  } catch (err) {
    console.error('Chyba při odesílání dotazníku:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se odeslat dotazník.' });
  }
});

// --- ADMIN SURVEYS LIST ENDPOINT ---
app.get('/api/admin/surveys', requireAuth, requireTeacher, async (req, res) => {
  try {
    let surveys = [];
    try {
      const snap = await Promise.race([
        db.collection('surveyResponses').get(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout')), 1500))
      ]);
      surveys = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (adminErr) {
      console.log('[Admin Surveys fallback to dev client]:', adminErr?.message || adminErr);
      const { clientDb, collection: cCollection, getDocs: cGetDocs } = await getDevDb();
      const cSnap = await cGetDocs(cCollection(clientDb, 'surveyResponses'));
      surveys = cSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    // Pokud je v kolekci surveyResponses prázdno, zkontrolujeme uživatelské profily s surveyCompleted
    if (surveys.length === 0) {
      try {
        const { clientDb, collection: cCollection, getDocs: cGetDocs } = await getDevDb();
        const usersSnap = await cGetDocs(cCollection(clientDb, 'users'));
        surveys = usersSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(u => u.surveyCompleted)
          .map(u => ({
            id: 'survey_' + u.uid,
            userId: u.uid,
            userEmail: u.email || '',
            userName: u.name || '',
            answer: u.surveyAnswer || 'Nezadáno',
            customAnswer: u.surveyAnswerCustom || null,
            school: u.surveySchool || '',
            grade: u.surveyGrade || '',
            bonusAwarded: 20,
            createdAt: u.createdAt || null
          }));
      } catch (fallbackErr) {
        console.warn('Fallback users survey read note:', fallbackErr?.message || fallbackErr);
      }
    }

    surveys.sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt?._seconds ? a.createdAt._seconds * 1000 : 0));
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt?._seconds ? b.createdAt._seconds * 1000 : 0));
      return bTime - aTime;
    });

    return res.json({ success: true, surveys });
  } catch (err) {
    console.error('Chyba při načítání dotazníků pro admina:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se načíst dotazníky.' });
  }
});

// --- ADMIN SURVEY DELETE ENDPOINT ---
app.delete('/api/admin/surveys/:id', requireAuth, requireTeacher, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Chybí ID odpovědi.' });
    }

    let targetUserId = null;

    try {
      const docRef = db.collection('surveyResponses').doc(id);
      const snap = await Promise.race([
        docRef.get(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout')), 1500))
      ]);
      if (snap.exists) {
        targetUserId = snap.data().userId;
      }
      await docRef.delete();

      if (targetUserId) {
        try {
          await db.collection('users').doc(targetUserId).set({
            surveyCompleted: false,
            surveyAnswer: null,
            surveyAnswerCustom: null,
            surveySchool: null,
            surveyGrade: null
          }, { merge: true });
        } catch (uErr) {
          console.warn('Could not reset survey on user (admin):', uErr?.message);
        }
      }
      return res.json({ success: true, message: 'Odpověď z dotazníku byla úspěšně smazána.' });
    } catch (adminErr) {
      console.log('[Admin Survey Delete fallback to dev client]:', adminErr?.message || adminErr);
      const { clientDb, doc: cDoc, getDoc: cGetDoc, deleteDoc: cDeleteDoc, updateDoc: cUpdateDoc } = await getDevDb();
      const docRef = cDoc(clientDb, 'surveyResponses', id);
      const snap = await cGetDoc(docRef);
      if (snap.exists()) {
        targetUserId = snap.data().userId;
      } else if (id.startsWith('survey_')) {
        targetUserId = id.replace('survey_', '');
      }
      
      try {
        await cDeleteDoc(docRef);
      } catch (delErr) {
        console.warn('Doc delete note:', delErr?.message);
      }

      if (targetUserId) {
        try {
          const userRef = cDoc(clientDb, 'users', targetUserId);
          const uSnap = await cGetDoc(userRef);
          if (uSnap.exists()) {
            await cUpdateDoc(userRef, {
              surveyCompleted: false,
              surveyAnswer: null,
              surveyAnswerCustom: null,
              surveySchool: null,
              surveyGrade: null
            });
          }
        } catch (uErr) {
          console.warn('Could not reset survey on user (dev client):', uErr?.message);
        }
      }
      return res.json({ success: true, message: 'Odpověď z dotazníku byla úspěšně smazána.' });
    }
  } catch (err) {
    console.error('Chyba při mazání odpovědi dotazníku:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se smazat odpověď.' });
  }
});

// ==========================================
// --- ORDERS & PAYMENT GATEWAY INTEGRATION ---
// ==========================================

const BANK_ACCOUNT_NUMBER = process.env.BANK_ACCOUNT_NUMBER || '2100000000';
const BANK_CODE = process.env.BANK_CODE || '2010';
const BANK_NAME = process.env.BANK_NAME || 'Fio banka';
const BANK_RECIPIENT = process.env.BANK_RECIPIENT || 'ProEdu vzdělávání';
const COMGATE_MERCHANT_ID = process.env.COMGATE_MERCHANT_ID || '';
const COMGATE_SECRET = process.env.COMGATE_SECRET || '';
const COMGATE_TEST_MODE = process.env.COMGATE_TEST_MODE !== 'false';

function serverCzechAccountToIban(accountNumberRaw, bankCodeRaw) {
  const bankCode = (bankCodeRaw || '2010').trim().padStart(4, '0');
  let prefix = '000000';
  let account = (accountNumberRaw || '').trim();
  if (account.includes('-')) {
    const parts = account.split('-');
    prefix = parts[0].padStart(6, '0');
    account = parts[1];
  }
  const paddedAccount = account.padStart(10, '0');
  const bban = `${bankCode}${prefix}${paddedAccount}`;
  const numericString = `${bban}123500`;
  let remainder = 0;
  for (let i = 0; i < numericString.length; i++) {
    remainder = (remainder * 10 + parseInt(numericString[i], 10)) % 97;
  }
  const checkDigits = (98 - remainder).toString().padStart(2, '0');
  return `CZ${checkDigits}${bban}`;
}

function serverGenerateSpayd(accountNumber, bankCode, amount, vs, message, recipientName) {
  const iban = serverCzechAccountToIban(accountNumber, bankCode);
  const parts = ['SPD', '1.0', `ACC:${iban}`, `AM:${Number(amount).toFixed(2)}`, 'CC:CZK'];
  if (vs) {
    const cleanVs = vs.toString().replace(/\D/g, '').slice(0, 10);
    if (cleanVs) parts.push(`X-VS:${cleanVs}`);
  }
  if (message) {
    const cleanMsg = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[*]/g, ' ').slice(0, 60);
    parts.push(`MSG:${cleanMsg}`);
  }
  if (recipientName) {
    const cleanName = recipientName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[*]/g, ' ').slice(0, 35);
    parts.push(`RN:${cleanName}`);
  }
  return parts.join('*') + '*';
}

async function saveOrderDoc(orderId, orderData) {
  try {
    const docRef = db.collection('orders').doc(orderId);
    await Promise.race([
      docRef.set(orderData),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout, using fallback')), 1200))
    ]);
    return true;
  } catch (adminErr) {
    console.log('[Orders save fallback to dev client]:', adminErr?.message || adminErr);
    const { clientDb, doc: cDoc, setDoc: cSetDoc } = await getDevDb();
    await cSetDoc(cDoc(clientDb, 'orders', orderId), orderData);
    return true;
  }
}

async function updateOrderDoc(orderId, updateFields) {
  try {
    const docRef = db.collection('orders').doc(orderId);
    await Promise.race([
      docRef.set(updateFields, { merge: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout, using fallback')), 1200))
    ]);
    return true;
  } catch (adminErr) {
    console.log('[Orders update fallback to dev client]:', adminErr?.message || adminErr);
    const { clientDb, doc: cDoc, setDoc: cSetDoc } = await getDevDb();
    await cSetDoc(cDoc(clientDb, 'orders', orderId), updateFields, { merge: true });
    return true;
  }
}

async function getOrderDoc(orderId) {
  try {
    const docSnap = await Promise.race([
      db.collection('orders').doc(orderId).get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout, using fallback')), 1200))
    ]);
    if (docSnap && docSnap.exists) return { id: docSnap.id, ...docSnap.data() };
  } catch (adminErr) {
    console.log('[Orders get fallback to dev client]:', adminErr?.message || adminErr);
  }
  const { clientDb, doc: cDoc, getDoc: cGetDoc } = await getDevDb();
  const cSnap = await cGetDoc(cDoc(clientDb, 'orders', orderId));
  if (cSnap.exists()) return { id: cSnap.id, ...cSnap.data() };
  return null;
}

async function activatePremiumForUser(userId, options = {}) {
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const updateData = {
    role: 'premium',
    premiumSince: new Date().toISOString(),
    subscriptionStatus: 'active',
    subscriptionPeriodEnd: periodEnd,
    subscriptionCancelledAt: null,
    subscriptionCancelReason: null
  };

  if (options.initRecurringTransId) {
    updateData.initRecurringTransId = options.initRecurringTransId;
  }

  try {
    const userRef = db.collection('users').doc(userId);
    await Promise.race([
      userRef.set(updateData, { merge: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout, using fallback')), 1200))
    ]);
    console.log(`[Premium Activation] Úspěšně aktivováno pro ${userId}`);
    return true;
  } catch (adminErr) {
    console.log('[Premium Activation fallback to dev client]:', adminErr?.message || adminErr);
    const { clientDb, doc: cDoc, setDoc: cSetDoc } = await getDevDb();
    await cSetDoc(cDoc(clientDb, 'users', userId), updateData, { merge: true });
    return true;
  }
}

// 1. Vytvoření objednávky
app.post('/api/orders/create', requireAuth, async (req, res) => {
  try {
    const {
      orderId: clientOrderId,
      variableSymbol: clientVariableSymbol,
      clientName,
      billingAddress,
      invoiceEmail,
      paymentMethod = 'qr_bank_transfer',
      termsAccepted,
      newsletterConsent = false,
      planId = 'premium-monthly',
      amount = 99
    } = req.body || {};

    const userId = req.user.uid;
    const userEmail = req.user.email || invoiceEmail || '';

    if (!clientName || typeof clientName !== 'string' || clientName.trim().length < 2) {
      return res.status(400).json({ error: 'Zadejte prosím platné jméno a příjmení klienta.' });
    }

    if (!invoiceEmail || typeof invoiceEmail !== 'string' || !invoiceEmail.includes('@')) {
      return res.status(400).json({ error: 'Zadejte prosím platný e-mail pro zaslání faktury.' });
    }

    if (!billingAddress || !billingAddress.street || !billingAddress.city || !billingAddress.zip) {
      return res.status(400).json({ error: 'Vyplňte prosím kompletní fakturační adresu (ulici, město i PSČ).' });
    }

    if (!termsAccepted) {
      return res.status(400).json({ error: 'Pro pokračování je nutné odsouhlasit obchodní podmínky.' });
    }

    // Generování 9místného variabilního symbolu (nebo použití klientského pro idempotenci)
    const variableSymbol = clientVariableSymbol && typeof clientVariableSymbol === 'string'
      ? clientVariableSymbol
      : String(Date.now()).slice(-9);
    const orderId = clientOrderId && typeof clientOrderId === 'string'
      ? clientOrderId
      : `ord_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Příprava SPAYD řetězce a zprávy pro příjemce
    const paymentMessage = `ProEdu: ${userEmail}`.slice(0, 60);
    const spaydString = serverGenerateSpayd(
      BANK_ACCOUNT_NUMBER,
      BANK_CODE,
      amount,
      variableSymbol,
      paymentMessage,
      BANK_RECIPIENT
    );

    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&format=svg&data=${encodeURIComponent(spaydString)}`;

    const orderData = {
      orderId,
      userId,
      userEmail,
      clientName: clientName.trim(),
      billingAddress: {
        street: billingAddress.street.trim(),
        city: billingAddress.city.trim(),
        zip: billingAddress.zip.trim(),
        country: billingAddress.country || 'Česká republika'
      },
      invoiceEmail: invoiceEmail.trim(),
      amount: Number(amount),
      currency: 'CZK',
      planId,
      paymentMethod,
      status: 'pending',
      termsAccepted: Boolean(termsAccepted),
      newsletterConsent: Boolean(newsletterConsent),
      variableSymbol,
      spaydString,
      createdAt: new Date().toISOString()
    };

    let comgateData = null;

    if (paymentMethod === 'comgate') {
      if (COMGATE_MERCHANT_ID && COMGATE_SECRET) {
        try {
          const comgatePayload = new URLSearchParams({
            merchant: COMGATE_MERCHANT_ID,
            price: String(Math.round(amount * 100)),
            curr: 'CZK',
            label: 'ProEdu Premium (měsíční)',
            refId: orderId,
            email: invoiceEmail.trim(),
            method: 'ALL',
            prepareOnly: 'true',
            initRecurring: 'true',
            secret: COMGATE_SECRET,
            test: COMGATE_TEST_MODE ? 'true' : 'false',
            country: 'CZ',
            lang: 'cs'
          });

          const comgateRes = await fetch('https://webpay.comgate.cz/v1.0/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: comgatePayload.toString()
          });

          const responseText = await comgateRes.text();
          const parsed = new URLSearchParams(responseText);
          const code = parsed.get('code');
          const transId = parsed.get('transId');
          const redirectUrl = parsed.get('redirect');

          if (code === '0' && redirectUrl) {
            orderData.comgateTransId = transId;
            orderData.comgateRedirectUrl = redirectUrl;
            comgateData = { transId, redirectUrl, isLive: true };
          } else {
            console.warn('[Comgate Create Warning]:', responseText);
            comgateData = { isSandbox: true, testMode: true, message: parsed.get('message') || 'Brána v testovacím režimu.' };
          }
        } catch (comgateErr) {
          console.error('[Comgate API Error]:', comgateErr);
          comgateData = { isSandbox: true, testMode: true, error: comgateErr.message };
        }
      } else {
        // Sandbox fallback pokud ještě nejsou vloženy ostré klíče od Comgate
        comgateData = {
          isSandbox: true,
          testMode: true,
          message: 'Platební brána Comgate je nastavena v testovacím režimu (čeká se na finální schválení smlouvy).'
        };
      }
    }

    await saveOrderDoc(orderId, orderData);

    // Pokud zákazník zvolil bankovní převod, odešleme mu e-mail s platebními údaji a QR kódem
    if (paymentMethod === 'qr_bank_transfer' && invoiceEmail) {
      sendOrderQrEmail({
        to: invoiceEmail.trim(),
        name: clientName || 'zákazníku',
        orderId,
        amount,
        variableSymbol,
        bankAccount: BANK_ACCOUNT_NUMBER,
        bankCode: BANK_CODE,
        bankName: BANK_NAME,
        qrImageUrl
      }).catch(err => console.warn('[Order QR Email Error]:', err?.message || err));
    }

    return res.json({
      success: true,
      orderId,
      order: orderData,
      bankDetails: {
        accountNumber: BANK_ACCOUNT_NUMBER,
        bankCode: BANK_CODE,
        bankName: BANK_NAME,
        recipientName: BANK_RECIPIENT,
        amount,
        currency: 'CZK',
        variableSymbol,
        message: paymentMessage,
        spaydString,
        qrImageUrl
      },
      comgate: comgateData
    });
  } catch (err) {
    console.error('Chyba při vytváření objednávky:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se vytvořit objednávku.' });
  }
});

// 2. Comgate Push URL Notifikace (Webhook)
app.post('/api/payments/comgate/notify', async (req, res) => {
  try {
    const payload = req.body || req.query || {};
    const { merchant, test, price, curr, refId, transId, secret, status } = payload;

    console.log('[Comgate Webhook Received]:', { merchant, refId, transId, status, test });

    if (COMGATE_SECRET && secret && secret !== COMGATE_SECRET) {
      console.warn('[Comgate Webhook] Neplatný tajný klíč!');
      return res.status(400).send('code=1&message=Invalid secret');
    }

    if (!refId) {
      return res.status(400).send('code=1&message=Missing refId');
    }

    const order = await getOrderDoc(refId);
    if (!order) {
      console.warn(`[Comgate Webhook] Objednávka ${refId} nenalezena.`);
      return res.status(404).send('code=1&message=Order not found');
    }

    if (status === 'PAID') {
      await updateOrderDoc(refId, {
        status: 'paid',
        paidAt: new Date().toISOString(),
        comgateTransId: transId || null
      });

      if (order.userId) {
        await activatePremiumForUser(order.userId, { initRecurringTransId: transId || null });
      }

      if (order.invoiceEmail) {
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        sendPaymentConfirmedEmail({
          to: order.invoiceEmail,
          name: order.clientName || 'zákazníku',
          orderId: refId,
          amount: order.amount || 99,
          periodEnd
        }).catch(err => console.warn('[Payment Confirmed Email Error]:', err?.message || err));
      }

      console.log(`[Comgate Webhook] Objednávka ${refId} označena jako ZAPLACENÁ.`);
    } else if (status === 'CANCELLED') {
      await updateOrderDoc(refId, {
        status: 'cancelled',
        cancelledAt: new Date().toISOString()
      });
      console.log(`[Comgate Webhook] Objednávka ${refId} byla zrušena.`);
    }

    return res.send('code=0&message=OK');
  } catch (err) {
    console.error('[Comgate Webhook Error]:', err);
    return res.status(500).send('code=1&message=Internal error');
  }
});

// 3. Sandbox simulace platby Comgate / Dummy QR (pro testování před aktivací ostrého účtu)
app.post('/api/payments/comgate/sandbox-simulate-pay', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.body || {};
    const targetUserId = req.user.uid;

    if (orderId) {
      try {
        const order = await getOrderDoc(orderId);
        if (order) {
          await updateOrderDoc(orderId, {
            status: 'paid',
            paidAt: new Date().toISOString(),
            comgateTransId: `SANDBOX_${Date.now()}`
          });
        }
      } catch (orderErr) {
        console.warn('[Sandbox Simulate Order Update Warning]:', orderErr?.message || orderErr);
      }
    }

    await activatePremiumForUser(targetUserId);
    userRoleCache.delete(targetUserId);

    return res.json({
      success: true,
      message: 'Platba byla v testovacím režimu úspěšně potvrzena a balíček Premium byl aktivován.'
    });
  } catch (err) {
    console.error('Chyba při sandbox simulaci:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se nasimulovat platbu.' });
  }
});

// 4. Seznam všech objednávek pro Učitele/Admina
app.get('/api/orders/all', requireAuth, requireTeacher, async (req, res) => {
  try {
    let orders = [];
    try {
      const snap = await Promise.race([
        db.collection('orders').orderBy('createdAt', 'desc').get(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout')), 1500))
      ]);
      orders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (adminErr) {
      console.log('[Orders all fallback to dev client]:', adminErr?.message || adminErr);
      const { clientDb, collection: cCollection, getDocs: cGetDocs } = await getDevDb();
      const cSnap = await cGetDocs(cCollection(clientDb, 'orders'));
      orders = cSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return res.json({ success: true, orders });
  } catch (err) {
    console.error('Chyba při načítání objednávek:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se načíst objednávky.' });
  }
});

// 5. Moje objednávky (pro přihlášeného studenta)
app.get('/api/orders/my', requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    let orders = [];
    try {
      const snap = await Promise.race([
        db.collection('orders').where('userId', '==', userId).get(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout')), 1500))
      ]);
      orders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (adminErr) {
      console.log('[Orders my fallback to dev client]:', adminErr?.message || adminErr);
      const { clientDb, collection: cCollection, query: cQuery, where: cWhere, getDocs: cGetDocs } = await getDevDb();
      const cSnap = await cGetDocs(cQuery(cCollection(clientDb, 'orders'), cWhere('userId', '==', userId)));
      orders = cSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    orders.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    return res.json({ success: true, orders });
  } catch (err) {
    console.error('Chyba při načítání mých objednávek:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se načíst objednávky.' });
  }
});

// 5b. Zrušení předplatného (Comgate rekurentní platby + stav v profilu)
app.post('/api/subscription/cancel', requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { reason, immediate } = req.body || {};
    const safeReason = typeof reason === 'string' ? reason.slice(0, 500) : 'Bez udání důvodu';
    const nowIso = new Date().toISOString();
    const defaultPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // TODO (Comgate): Při nasazení ostrých klíčů COMGATE_MERCHANT_ID a COMGATE_SECRET
    // zde zavolat zrušení rekurentní platby v Comgate bráně.

    const updateData = immediate
      ? {
          role: 'free',
          subscriptionStatus: 'inactive',
          subscriptionCancelledAt: nowIso,
          subscriptionCancelReason: safeReason
        }
      : {
          subscriptionStatus: 'cancelled_at_period_end',
          subscriptionCancelledAt: nowIso,
          subscriptionCancelReason: safeReason,
          subscriptionPeriodEnd: defaultPeriodEnd
        };

    try {
      const userRef = db.collection('users').doc(userId);
      await Promise.race([
        userRef.set(updateData, { merge: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout')), 2500))
      ]);
    } catch (adminErr) {
      const { clientDb, doc: cDoc, setDoc: cSetDoc } = await getDevDb();
      await cSetDoc(cDoc(clientDb, 'users', userId), updateData, { merge: true });
    }

    userRoleCache.delete(userId);

    return res.json({
      success: true,
      immediate: Boolean(immediate),
      subscriptionStatus: updateData.subscriptionStatus,
      subscriptionPeriodEnd: updateData.subscriptionPeriodEnd || null,
      message: immediate
        ? 'Předplatné bylo okamžitě ukončeno a účet byl přepnut na tarif Free.'
        : 'Automatické prodlužování předplatného bylo zrušeno. Výhody Premium ti zůstanou až do konce zaplaceného období.'
    });
  } catch (err) {
    console.error('Chyba při rušení předplatného:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se zrušit předplatné.' });
  }
});

// 5c. Obnovení předplatného (zrušení výpovědi ke konci období)
app.post('/api/subscription/reactivate', requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const updateData = {
      role: 'premium',
      subscriptionStatus: 'active',
      subscriptionCancelledAt: null,
      subscriptionPeriodEnd: periodEnd
    };

    try {
      const userRef = db.collection('users').doc(userId);
      await Promise.race([
        userRef.set(updateData, { merge: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout')), 2500))
      ]);
    } catch (adminErr) {
      const { clientDb, doc: cDoc, setDoc: cSetDoc } = await getDevDb();
      await cSetDoc(cDoc(clientDb, 'users', userId), updateData, { merge: true });
    }

    userRoleCache.delete(userId);

    return res.json({
      success: true,
      subscriptionStatus: 'active',
      subscriptionPeriodEnd: periodEnd,
      message: 'Předplatné ProEducator Premium bylo úspěšně obnoveno!'
    });
  } catch (err) {
    console.error('Chyba při obnovení předplatného:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se obnovit předplatné.' });
  }
});

// 5c. Zpracování opakované platby Comgate (Subsequent Recurring Charge dle https://help.comgate.eu/docs/opakovane-platby)
app.post('/api/payments/comgate/charge-recurring', requireAuth, async (req, res) => {
  try {
    const targetUserId = req.body?.userId || req.user.uid;
    const isSelf = req.user.uid === targetUserId;
    const isTeacherUser = req.user.role === 'teacher' || req.user.role === 'admin';

    if (!isSelf && !isTeacherUser) {
      return res.status(403).json({ error: 'Nemáte oprávnění iniciovat opakovanou platbu pro jiného uživatele.' });
    }

    let userDoc = null;
    try {
      const snap = await db.collection('users').doc(targetUserId).get();
      if (snap.exists) userDoc = snap.data();
    } catch (e) {
      const { clientDb, doc: cDoc, getDoc: cGetDoc } = await getDevDb();
      const snap = await cGetDoc(cDoc(clientDb, 'users', targetUserId));
      if (snap.exists()) userDoc = snap.data();
    }

    if (!userDoc) {
      return res.status(404).json({ error: 'Uživatelský profil nenalezen.' });
    }

    if (!userDoc.initRecurringTransId) {
      return res.status(400).json({ error: 'Uživatel nemá zaznamenanou žádnou iniciační platbu (initRecurringTransId). Nejprve je nutné provést první platbu kartou s povolením opakování.' });
    }

    if (userDoc.subscriptionStatus === 'cancelled_at_period_end' || userDoc.subscriptionStatus === 'inactive') {
      return res.status(400).json({ error: 'Předplatné je zrušeno nebo neaktivní. Opakované strhávání nelze provést.' });
    }

    const newOrderId = `ORD_REC_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const amount = 99;
    let recurringSuccess = false;
    let comgateTransId = null;

    if (COMGATE_MERCHANT_ID && COMGATE_SECRET && !COMGATE_TEST_MODE) {
      const recurringPayload = new URLSearchParams({
        merchant: COMGATE_MERCHANT_ID,
        secret: COMGATE_SECRET,
        initTransId: userDoc.initRecurringTransId,
        price: String(Math.round(amount * 100)),
        curr: 'CZK',
        label: 'ProEdu Premium (obnovení předplatného)',
        refId: newOrderId,
        test: 'false'
      });

      const response = await fetch('https://webpay.comgate.cz/v1.0/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: recurringPayload.toString()
      });

      const responseText = await response.text();
      const parsed = new URLSearchParams(responseText);
      const code = parsed.get('code');
      comgateTransId = parsed.get('transId');

      if (code === '0') {
        recurringSuccess = true;
      } else {
        console.warn('[Comgate Recurring Charge Failed]:', responseText);
        if (userDoc.email) {
          sendRecurringChargeFailedEmail({
            to: userDoc.email,
            name: userDoc.name,
            amount,
            reason: parsed.get('message') || 'Platba byla zamítnuta vydavatelem karty'
          }).catch(console.warn);
        }
        return res.status(400).json({
          error: 'Opakovaná platba byla platební bránou zamítnuta.',
          details: parsed.get('message') || responseText
        });
      }
    } else {
      // Testovací / Sandbox režim
      recurringSuccess = true;
      comgateTransId = `SANDBOX_REC_${Date.now()}`;
      console.log(`[Comgate Recurring Simulation] Provedeno testovací opakované stržení 99 Kč pro uživatele ${targetUserId}`);
    }

    const nextPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await activatePremiumForUser(targetUserId, { initRecurringTransId: userDoc.initRecurringTransId });

    const recOrderData = {
      id: newOrderId,
      userId: targetUserId,
      amount,
      currency: 'CZK',
      planTitle: 'ProEducator Premium (opakované předplatné)',
      paymentMethod: 'comgate',
      status: 'paid',
      paidAt: new Date().toISOString(),
      comgateTransId,
      invoiceEmail: userDoc.email,
      clientName: userDoc.name,
      isRecurringRenewal: true,
      createdAt: new Date().toISOString()
    };
    await saveOrderDoc(newOrderId, recOrderData);

    // Dle pravidel karetních asociací odešleme potvrzovací e-mail o stržení opakované platby
    if (userDoc.email) {
      sendRecurringChargeSuccessEmail({
        to: userDoc.email,
        name: userDoc.name,
        orderId: newOrderId,
        amount,
        nextPeriodEnd
      }).catch(console.warn);
    }

    return res.json({
      success: true,
      orderId: newOrderId,
      subscriptionPeriodEnd: nextPeriodEnd,
      message: 'Opakovaná platba byla úspěšně zpracována a předplatné bylo prodlouženo.'
    });
  } catch (err) {
    console.error('Chyba při zpracování opakované platby:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se zpracovat opakovanou platbu.' });
  }
});

// 5d. Uložení fakturačních údajů (pro iÚčto) a preferované platební metody (Comgate / QR)
app.put('/api/subscription/billing', requireAuth, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { billingDetails, preferredPaymentMethod } = req.body || {};

    const updateData = {};
    if (preferredPaymentMethod === 'comgate' || preferredPaymentMethod === 'qr_bank_transfer') {
      updateData.preferredPaymentMethod = preferredPaymentMethod;
    }

    if (billingDetails && typeof billingDetails === 'object') {
      updateData.billingDetails = {
        clientName: String(billingDetails.clientName || '').trim().slice(0, 128),
        invoiceEmail: String(billingDetails.invoiceEmail || '').trim().slice(0, 256),
        street: String(billingDetails.street || '').trim().slice(0, 150),
        city: String(billingDetails.city || '').trim().slice(0, 100),
        zip: String(billingDetails.zip || '').trim().slice(0, 20),
        country: String(billingDetails.country || 'Česká republika').trim().slice(0, 64),
        ico: String(billingDetails.ico || '').trim().slice(0, 20),
        dic: String(billingDetails.dic || '').trim().slice(0, 20)
      };
    }

    // TODO (iÚčto API): Při napojení klíče IUCTO_API_KEY zde synchronizovat adresář kontaktu v iÚčto.

    try {
      const userRef = db.collection('users').doc(userId);
      await Promise.race([
        userRef.set(updateData, { merge: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout')), 2500))
      ]);
    } catch (adminErr) {
      const { clientDb, doc: cDoc, setDoc: cSetDoc } = await getDevDb();
      await cSetDoc(cDoc(clientDb, 'users', userId), updateData, { merge: true });
    }

    return res.json({
      success: true,
      ...updateData,
      message: 'Fakturační a platební nastavení bylo uloženo.'
    });
  } catch (err) {
    console.error('Chyba při ukládání fakturačních údajů:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se uložit fakturační údaje.' });
  }
});

// 6. Manuální potvrzení přijetí platby převodem (pro učitele)
app.post('/api/orders/:orderId/confirm-manual', requireAuth, requireTeacher, async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await getOrderDoc(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Objednávka nenalezena.' });
    }

    await updateOrderDoc(orderId, {
      status: 'paid',
      paidAt: new Date().toISOString(),
      confirmedBy: req.user.email || 'teacher'
    });

    if (order.userId) {
      await activatePremiumForUser(order.userId);
    }

    if (order.invoiceEmail) {
      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      sendPaymentConfirmedEmail({
        to: order.invoiceEmail,
        name: order.clientName || 'zákazníku',
        orderId,
        amount: order.amount || 99,
        periodEnd
      }).catch(err => console.warn('[Payment Confirmed Email Error]:', err?.message || err));
    }

    return res.json({ success: true, message: 'Platba byla potvrzena a Premium bylo studentovi aktivováno.' });
  } catch (err) {
    console.error('Chyba při manuálním potvrzení platby:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se potvrdit platbu.' });
  }
});

// 6b. Smazání jednotlivé objednávky (pro učitele / administraci)
app.delete('/api/orders/:orderId', requireAuth, requireTeacher, async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({ error: 'Chybí ID objednávky.' });
    }

    try {
      const docRef = db.collection('orders').doc(orderId);
      await Promise.race([
        docRef.delete(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout, using fallback')), 2500))
      ]);
    } catch (adminErr) {
      console.log('[Orders delete fallback to dev client]:', adminErr?.message || adminErr);
      const { clientDb, doc: cDoc, deleteDoc: cDeleteDoc } = await getDevDb();
      await cDeleteDoc(cDoc(clientDb, 'orders', orderId));
    }

    return res.json({ success: true, message: 'Objednávka byla úspěšně smazána.' });
  } catch (err) {
    console.error('Chyba při mazání objednávky:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se smazat objednávku.' });
  }
});

// 7. Správa přístupu studenta (role, status a přiřazené kurzy učitelem/adminem)
app.post('/api/students/:studentId/update-access', requireAuth, requireTeacher, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { role, enrolledCourseIds } = req.body || {};

    if (!studentId) {
      return res.status(400).json({ error: 'Chybí ID studenta.' });
    }

    const validRoles = ['student', 'free', 'premium', 'course'];
    const safeRole = validRoles.includes(role) ? role : 'free';
    const safeCourseIds = Array.isArray(enrolledCourseIds) 
      ? enrolledCourseIds.filter(id => typeof id === 'string' && id.trim().length > 0)
      : [];

    const updateData = {
      role: safeRole,
      enrolledCourseIds: safeCourseIds,
      courseId: safeCourseIds.length > 0 ? safeCourseIds[0] : null,
      updatedAt: new Date().toISOString()
    };

    if (safeRole === 'premium' || safeRole === 'course') {
      updateData.premiumSince = new Date().toISOString();
    }

    // 1. Zkusíme Admin SDK
    try {
      const userRef = db.collection('users').doc(studentId);
      await Promise.race([
        userRef.set(updateData, { merge: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout')), 2500))
      ]);
      console.log(`[Update Student Access] Úspěšně aktualizován přístup pro ${studentId} (role: ${safeRole}, kurzy: ${safeCourseIds.length})`);
    } catch (adminErr) {
      console.log('[Update Student Access fallback to dev client]:', adminErr?.message || adminErr);
      const { clientDb, doc: cDoc, setDoc: cSetDoc } = await getDevDb();
      await cSetDoc(cDoc(clientDb, 'users', studentId), updateData, { merge: true });
    }

    // Zneplatníme cache role v paměti serveru
    userRoleCache.delete(studentId);

    return res.json({ 
      success: true, 
      message: 'Přístup studenta byl úspěšně aktualizován.',
      role: safeRole,
      enrolledCourseIds: safeCourseIds,
      courseId: safeCourseIds.length > 0 ? safeCourseIds[0] : null
    });
  } catch (err) {
    console.error('Chyba při aktualizaci přístupu studenta:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se aktualizovat přístup studenta.' });
  }
});

// 7. Bezpečné nahrávání studijních materiálů (SVG grafické listy, původní PDF a JPEG miniatury)
app.post('/api/materials/upload', requireAuth, requireTeacher, async (req, res) => {
  try {
    const { svgContent, thumbnailDataUrl, pdfDataUrl, originalName } = req.body || {};
    if (!svgContent && !thumbnailDataUrl && !pdfDataUrl) {
      return res.status(400).json({ error: 'Chybí obsah souboru pro nahrání.' });
    }

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 9);
    let svgUrl = null;
    let thumbnailUrl = null;
    let pdfUrl = null;

    const safeName = (originalName || 'material')
      .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
      .replace(/\.(svg|pdf)$/i, '');

    if (svgContent) {
      const svgFileName = `${timestamp}_${randomSuffix}_${safeName}.svg`;
      const svgFilePath = path.join(uploadsMaterialsDir, svgFileName);
      fs.writeFileSync(svgFilePath, svgContent, 'utf8');
      svgUrl = `/uploads/materials/${svgFileName}`;
    }

    if (pdfDataUrl && typeof pdfDataUrl === 'string') {
      const pdfFileName = `${timestamp}_${randomSuffix}_${safeName}.pdf`;
      const pdfFilePath = path.join(uploadsMaterialsDir, pdfFileName);
      const base64Pdf = pdfDataUrl.replace(/^data:application\/pdf;base64,/, '').replace(/^data:[^;]+;base64,/, '');
      fs.writeFileSync(pdfFilePath, Buffer.from(base64Pdf, 'base64'));
      pdfUrl = `/uploads/materials/${pdfFileName}`;
    }

    if (thumbnailDataUrl) {
      const thumbFileName = `${timestamp}_${randomSuffix}_thumb.jpg`;
      const thumbFilePath = path.join(uploadsMaterialsDir, thumbFileName);
      const base64Data = thumbnailDataUrl.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(thumbFilePath, Buffer.from(base64Data, 'base64'));
      thumbnailUrl = `/uploads/materials/${thumbFileName}`;
    }

    return res.json({
      success: true,
      svgUrl,
      thumbnailUrl,
      pdfUrl
    });
  } catch (err) {
    console.error('Chyba při nahrávání materiálu na server:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se uložit soubor materiálu.' });
  }
});

// 404 handler pro všechny neexistující API požadavky, aby nepropadávaly do Vite middleware a nezasekávaly se
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint ${req.method} ${req.path} nenalezen.` });
});

// Vite middleware / static serving
if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { 
      middlewareMode: true, 
      hmr: true,
      watch: {
        ignored: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.pdf', '**/dist/**', '**/.git/**', '**/*.log', '**/server/**', '**/public/uploads/**', '**/.gemini/**', '**/brain/**'],
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

// Globální ošetření chyb (např. přerušené requesty z klienta při reloadu)
app.use((err, req, res, next) => {
  if (err.type === 'request.aborted' || err.code === 'ECONNABORTED' || err.message?.includes('aborted')) {
    console.warn('[Server]: Request byl přerušen klientem:', req.path);
    return;
  }
  console.error('[Server Error Handler]:', err);
  if (!res.headersSent) {
    res.status(err.status || 500).json({ error: err.message || 'Interní chyba serveru.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ProEdu Server running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});
}

startServer();
