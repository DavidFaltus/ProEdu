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

async function startServer() {
  app.use(express.json({ limit: '25mb' }));

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

    const decodedToken = await auth.verifyIdToken(token);
    
    let role = 'student';
    const userRef = db.collection('users').doc(decodedToken.uid);
    const userDoc = await userRef.get();
    
    const isTeacherEmail = decodedToken.email === 'ucitel@ucitel.cz';
                          
    if (userDoc.exists) {
      const data = userDoc.data();
      role = data.role || 'student';
      if (isTeacherEmail && role !== 'teacher') {
        await userRef.update({ role: 'teacher' });
        role = 'teacher';
      }
    } else {
      role = isTeacherEmail ? 'teacher' : 'student';
      await userRef.set({
        uid: decodedToken.uid,
        email: decodedToken.email || '',
        name: decodedToken.name || (isTeacherEmail ? 'Učitel' : 'Student'),
        role: role,
        createdAt: Timestamp.now(),
      });
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
