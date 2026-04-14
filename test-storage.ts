import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadString } from 'firebase/storage';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

async function test() {
  try {
    const r = ref(storage, 'test.txt');
    await uploadString(r, 'hello world');
    console.log('Success');
  } catch (e) {
    console.error('Error:', e.message);
  }
}
test();
