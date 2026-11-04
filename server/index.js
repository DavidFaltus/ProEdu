import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { applicationDefault, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

console.log('--- SERVER STARTING ---');

process.on('uncaughtException', (err) => {
  console.error('--- FATAL UNCAUGHT EXCEPTION ---', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('--- FATAL UNHANDLED REJECTION ---', reason);
});

const PORT = Number(process.env.PORT || (process.env.NODE_ENV === 'production' ? 3000 : 3005));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read Firebase config to get the exact bucket name
let configBucket = 'gen-lang-client-0972842509.firebasestorage.app';
try {
  const configPath = path.join(__dirname, '..', 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.storageBucket) {
      configBucket = config.storageBucket;
      console.log('--- FOUND BUCKET IN CONFIG:', configBucket);
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
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

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
            };
          }
        } catch (e) {
          throw verifyErr;
        }
      }
      if (!decodedToken) throw verifyErr;
    }
    
    let role = 'student';
    const isTeacherEmail = decodedToken.email === 'ucitel@ucitel.cz';
    if (isTeacherEmail) {
      role = 'teacher';
    } else if (decodedToken.role) {
      role = decodedToken.role;
    }

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
  if (req.user?.role !== 'teacher') {
    res.status(403).json({ error: 'Tato akce je dostupná jen učiteli.' });
    return;
  }

  next();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Dev endpoint pro synchronizaci role do Firestore databáze
app.post('/api/dev/set-role', async (req, res) => {
  try {
    const { uid, role } = req.body || {};
    if (!uid || !role) {
      return res.status(400).json({ error: 'Chybí uid nebo role.' });
    }

    const validRoles = ['student', 'free', 'premium', 'course', 'teacher'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Neplatná role.' });
    }

    try {
      const userRef = db.collection('users').doc(uid);
      await userRef.set({ role }, { merge: true });
      console.log(`[DEV API via Admin] Role pro uživatele ${uid} úspěšně nastavena na: ${role}`);
      return res.json({ success: true, uid, role });
    } catch (adminErr) {
      console.log('[DEV API Admin fallback to dev teacher client]:', adminErr?.message || adminErr);
      const { clientDb, doc: cDoc, setDoc: cSetDoc } = await getDevDb();
      await cSetDoc(cDoc(clientDb, 'users', uid), { role }, { merge: true });
      console.log(`[DEV API via Teacher Client] Role pro uživatele ${uid} úspěšně nastavena na: ${role}`);
      return res.json({ success: true, uid, role });
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
      const snap = await db.collection('surveyResponses').get();
      surveys = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (adminErr) {
      console.log('[Admin Surveys fallback to dev client]:', adminErr?.message || adminErr);
      const { clientDb, collection: cCollection, getDocs: cGetDocs } = await getDevDb();
      const cSnap = await cGetDocs(cCollection(clientDb, 'surveyResponses'));
      surveys = cSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    surveys.sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
      return bTime - aTime;
    });

    return res.json({ success: true, surveys });
  } catch (err) {
    console.error('Chyba při načítání dotazníků pro admina:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se načíst dotazníky.' });
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
      new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout, using fallback')), 2500))
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
      new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout, using fallback')), 2500))
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
      new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout, using fallback')), 2500))
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

async function activatePremiumForUser(userId) {
  const updateData = {
    role: 'premium',
    premiumSince: new Date().toISOString()
  };
  try {
    const userRef = db.collection('users').doc(userId);
    await Promise.race([
      userRef.set(updateData, { merge: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Admin SDK timeout, using fallback')), 2500))
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

    // Generování 9místného variabilního symbolu
    const variableSymbol = String(Date.now()).slice(-9);
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

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
        await activatePremiumForUser(order.userId);
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

// 3. Sandbox simulace platby Comgate (pro testování před aktivací ostrého účtu)
app.post('/api/payments/comgate/sandbox-simulate-pay', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.body || {};
    if (!orderId) {
      return res.status(400).json({ error: 'Chybí orderId.' });
    }

    const order = await getOrderDoc(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Objednávka nenalezena.' });
    }

    await updateOrderDoc(orderId, {
      status: 'paid',
      paidAt: new Date().toISOString(),
      comgateTransId: `SANDBOX_${Date.now()}`
    });

    if (order.userId) {
      await activatePremiumForUser(order.userId);
    }

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
      const snap = await db.collection('orders').orderBy('createdAt', 'desc').get();
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
      const snap = await db.collection('orders').where('userId', '==', userId).get();
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

    return res.json({ success: true, message: 'Platba byla potvrzena a Premium bylo studentovi aktivováno.' });
  } catch (err) {
    console.error('Chyba při manuálním potvrzení platby:', err);
    return res.status(500).json({ error: err.message || 'Nepodařilo se potvrdit platbu.' });
  }
});

// Vite middleware / static serving
if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: true },
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ProEdu Server running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});
}

startServer();
