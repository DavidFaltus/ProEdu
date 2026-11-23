import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const isLoopbackHost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const isFirebaseEmulatorEnabled =
  import.meta.env?.VITE_USE_EMULATOR === 'true' && isLoopbackHost;

const resolvedFirebaseConfig = {
  ...firebaseConfig,
  measurementId: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID as string) || firebaseConfig.measurementId || ''
};

export const app = initializeApp(resolvedFirebaseConfig);
if (import.meta.env?.DEV) {
  console.log('Firebase initialized with project:', resolvedFirebaseConfig.projectId);
  if (isFirebaseEmulatorEnabled) {
    console.warn('[Firebase] Connected to LOCAL EMULATORS (Auth:9099, Firestore:8080, Storage:9199)');
  }
}

export const db = initializeFirestore(
  app,
  {
    localCache: memoryLocalCache(),
  },
  resolvedFirebaseConfig.firestoreDatabaseId
);

export const auth = getAuth(app);
export const storage = getStorage(app, `gs://${resolvedFirebaseConfig.storageBucket}`);
// Nastavíme dostatečný limit pro nahrávání velkých souborů (až 30 MB)
storage.maxUploadRetryTime = 60000;

if (isFirebaseEmulatorEnabled) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
