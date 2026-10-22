import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const resolvedFirebaseConfig = {
  ...firebaseConfig,
  measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string) || firebaseConfig.measurementId || ''
};

export const app = initializeApp(resolvedFirebaseConfig);
console.log('Firebase initialized with project:', resolvedFirebaseConfig.projectId);
console.log('Storage bucket:', resolvedFirebaseConfig.storageBucket);

// Enable persistence to heavily reduce read quota
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
}, resolvedFirebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
// Explicitly pass the bucket to ensure it's correctly targeted
export const storage = getStorage(app, `gs://${resolvedFirebaseConfig.storageBucket}`);
// Nakofigurujeme Firebase tak, aby na Storage limit narážel ihned a spustil Base64 zálohu
storage.maxUploadRetryTime = 3000;
