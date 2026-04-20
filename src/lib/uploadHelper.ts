import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { storage } from './firebase';

// Pomocná fuknce pro převedení souboru rovnou do Base64 textu pro uložení do databáze místo Storage
const readFileAsDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Nepodařilo se přečíst soubor offline.'));
    reader.readAsDataURL(file);
  });
};

export async function uploadFileWithProgress(
  file: File,
  path: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  if (!file) throw new Error('No file provided');
  if (!path) throw new Error('No path provided');

  // Záchranné lano pro neaktivovaný Storage (obvykle na Spark plánu bez kliknutí na "Get Started")
  // Dokumenty ve Firestore mají limit 1 MB. Base64 zvětšuje soubor o cca 33 %.
  // 750 KB * 1.33 = cca 997 KB (těsně pod limitem 1024 KB)
  const MAX_FIRESTORE_BASE64_SIZE = 750 * 1024; 
  const isSmallFile = file.size <= MAX_FIRESTORE_BASE64_SIZE;

  // Pokud je soubor malý, jdeme rovnou na Base64 (zachranný plán), 
  // abychom nečekali 3 sekundy na timeout Firebase Storage, který uživatel nemá aktivní.
  if (isSmallFile) {
    console.log('Soubor je malý, volím přímé uložení do databáze (přeskočen pokus o Storage)...');
    try {
      const base64Str = await readFileAsDataURL(file);
      if (onProgress) onProgress(100);
      return base64Str;
    } catch (fallbackErr) {
      throw new Error('Nelze nahrát. Soubor nelze zpracovat pro uložení.');
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const storageRef = ref(storage, path);
      const metadata = { contentType: file.type };
      const uploadTask = uploadBytesResumable(storageRef, file, metadata);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) onProgress(progress);
        },
        async (error) => {
          console.warn('Storage upload attempt failed.', error.code);
          // Pokud by náhodou selhal i velký soubor, dáme vědět
          const msg = error.code === 'storage/retry-limit-exceeded' 
            ? 'Storage není aktivován. Pro soubory nad 750 KB ho musíte zapnout v konzoli.'
            : 'Soubor je příliš velký (nad 750 KB) a nahrávání do Storage selhalo.';
          reject(new Error(msg));
        },
        async () => {
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(url);
          } catch (error) {
            console.error('Failed to get download URL after upload:', error);
            reject(error);
          }
        }
      );
    } catch (e) {
      console.error('Error starting uploadTask:', e);
      reject(e);
    }
  });
}
