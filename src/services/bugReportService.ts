import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db, auth, storage } from '../lib/firebase';
import { BugReport, CreateBugReportInput, BugReportStatus } from '../types/bugReport';

/**
 * Nahraje screenshot k hlášení chyby do Firebase Storage do cesty /bugReports/{userId}/{fileId}
 */
export async function uploadBugReportScreenshot(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Povoleny jsou pouze obrázky (PNG, JPG, WEBP).');
  }

  // Limit 10 MB dle storage.rules
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Velikost obrázku nesmí přesáhnout 10 MB.');
  }

  const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const path = `bugReports/${userId}/${Date.now()}_${cleanName}`;
  const storageRef = ref(storage, path);

  const snapshot = await uploadBytes(storageRef, file, {
    contentType: file.type
  });

  return await getDownloadURL(snapshot.ref);
}

/**
 * Odešle hlášení chyby přes backendové API (uloží do Firestore a pošle e-mail na netkova.nela@gmail.com)
 */
export async function submitBugReport(input: CreateBugReportInput): Promise<{ success: boolean; reportId: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Pro nahlášení chyby musíte být přihlášeni.');
  }

  let finalScreenshotUrl = input.screenshotUrl || null;

  // Pokud byl přiložen soubor, nejdříve ho nahrajeme do Storage
  if (input.screenshotFile) {
    try {
      finalScreenshotUrl = await uploadBugReportScreenshot(currentUser.uid, input.screenshotFile);
    } catch (uploadErr: any) {
      console.warn('[BugReport] Nepodařilo se nahrát screenshot, pokračuji bez něj:', uploadErr?.message);
    }
  }

  const token = await currentUser.getIdToken();
  const payload = {
    category: input.category,
    description: input.description,
    pageUrl: input.pageUrl || window.location.href,
    screenshotUrl: finalScreenshotUrl,
    userAgent: input.userAgent || navigator.userAgent,
    screenResolution: input.screenResolution || `${window.screen.width}x${window.screen.height}`,
    userName: input.userName || currentUser.displayName || currentUser.email?.split('@')[0] || 'Student'
  };

  try {
    const response = await fetch('/api/bug-reports/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const data = await response.json();
      return { success: true, reportId: data.reportId };
    }

    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.error || `Chyba serveru (${response.status})`);
  } catch (apiErr: any) {
    console.warn('[BugReport] API endpoint selhal, zkouším přímý zápis do Firestore:', apiErr?.message);

    // Fallback: Zápis přímo do Firestore podle pravidel
    const docRef = await addDoc(collection(db, 'bugReports'), {
      userId: currentUser.uid,
      userEmail: currentUser.email || '',
      userName: payload.userName,
      category: payload.category,
      categoryLabel: getCategoryLabel(payload.category),
      description: payload.description,
      pageUrl: payload.pageUrl,
      screenshotUrl: payload.screenshotUrl,
      userAgent: payload.userAgent,
      screenResolution: payload.screenResolution,
      status: 'pending',
      resolutionNotes: null,
      resolvedAt: null,
      createdAt: serverTimestamp()
    });

    return { success: true, reportId: docRef.id };
  }
}

/**
 * Načte všechna hlášení chyb pro učitele/administrátora
 */
export async function getBugReports(): Promise<BugReport[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  try {
    const token = await currentUser.getIdToken();
    const response = await fetch('/api/admin/bug-reports', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.reports)) {
        return data.reports;
      }
    }
  } catch (err) {
    console.warn('[BugReport] Nelze načíst z API, zkouším Firestore fallback:', err);
  }

  // Fallback přímo z Firestore
  try {
    const q = query(collection(db, 'bugReports'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    })) as BugReport[];
  } catch (firestoreErr) {
    console.error('[BugReport] Selhalo načtení z Firestore:', firestoreErr);
    // Poslední pokus bez orderBy (kdyby chyběl index)
    const snapshot = await getDocs(collection(db, 'bugReports'));
    return snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    })) as BugReport[];
  }
}

/**
 * Změní stav hlášení chyby a případnou interní poznámku (učitel)
 */
export async function updateBugReportStatus(
  reportId: string, 
  status: BugReportStatus, 
  resolutionNotes?: string
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Nejste přihlášeni');

  try {
    const token = await currentUser.getIdToken();
    const response = await fetch(`/api/admin/bug-reports/${reportId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status, resolutionNotes })
    });

    if (response.ok) return;
  } catch (err) {
    console.warn('[BugReport] API patch selhal, fallback na Firestore:', err);
  }

  // Fallback: přímý update ve Firestore
  const updates: any = { status };
  if (status === 'resolved') {
    updates.resolvedAt = serverTimestamp();
  }
  if (typeof resolutionNotes === 'string') {
    updates.resolutionNotes = resolutionNotes;
  }

  await updateDoc(doc(db, 'bugReports', reportId), updates);
}

/**
 * Smaže hlášení chyby (učitel)
 */
export async function deleteBugReport(reportId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Nejste přihlášeni');

  try {
    const token = await currentUser.getIdToken();
    const response = await fetch(`/api/admin/bug-reports/${reportId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) return;
  } catch (err) {
    console.warn('[BugReport] API delete selhal, fallback na Firestore:', err);
  }

  await deleteDoc(doc(db, 'bugReports', reportId));
}

/**
 * Pomocná funkce pro český název kategorie
 */
export function getCategoryLabel(category: string): string {
  switch (category) {
    case 'question':
      return 'Chyba v otázce / zadání';
    case 'technical':
      return 'Technická chyba / zásek';
    case 'visual':
      return 'Vzhled / překlep / text';
    case 'improvement':
      return 'Návrh na zlepšení';
    default:
      return 'Jiné';
  }
}
