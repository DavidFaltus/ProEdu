import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
console.log('Firebase initialized with project:', firebaseConfig.projectId);
console.log('Storage bucket:', firebaseConfig.storageBucket);

// Enable persistence to heavily reduce read quota
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
// Explicitly pass the bucket to ensure it's correctly targeted
export const storage = getStorage(app, `gs://${firebaseConfig.storageBucket}`);
// Nakofigurujeme Firebase tak, aby na Storage limit narážel ihned a spustil Base64 zálohu
storage.maxUploadRetryTime = 3000;
