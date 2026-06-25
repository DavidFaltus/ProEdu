import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
  credential: applicationDefault(),
  projectId: 'gen-lang-client-0972842509'
});

try {
  let db;
  try {
    const defaultApp = require('firebase-admin/app').getApp();
    db = getFirestore(defaultApp, 'ai-studio-1fc75345-16e5-4af6-a275-4152ed6176ba');
  } catch (e) {
    db = getFirestore('ai-studio-1fc75345-16e5-4af6-a275-4152ed6176ba');
  }
} catch (e) {
  console.error("FAIL", e);
}
