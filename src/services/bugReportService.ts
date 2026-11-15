import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, storage } from '../lib/firebase';
import { BugReport, CreateBugReportInput, BugReportStatus } from '../types/bugReport';

const ALLOWED_SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Nahraje screenshot k hlášení chyby do Firebase Storage do cesty bugReports/{userId}/{fileId}
 */
export async function uploadBugReportScreenshot(userId: string, file: File): Promise<string> {
  if (!ALLOWED_SCREENSHOT_TYPES.includes(file.type)) {
    throw new Error('Povoleny jsou pouze obrázky PNG, JPG nebo WEBP.');
  }

  if (file.size > MAX_SCREENSHOT_BYTES) {
    throw new Error('Velikost obrázku nesmí přesáhnout 5 MB.');
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
 * Odešle hlášení chyby výhradně přes zabezpečené backendové API.
 */
export async function submitBugReport(input: CreateBugReportInput): Promise<{ success: boolean; reportId: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Pro nahlášení chyby musíte být přihlášeni.');
  }

  let finalScreenshotUrl = input.screenshotUrl || null;

  if (input.screenshotFile) {
    finalScreenshotUrl = await uploadBugReportScreenshot(currentUser.uid, input.screenshotFile);
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

  const response = await fetch('/api/bug-reports/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.reportId) {
    throw new Error(data?.error || `Nepodařilo se odeslat hlášení (${response.status}).`);
  }

  return { success: true, reportId: data.reportId };
}

/**
 * Načte všechna hlášení chyb pro učitele/administrátora přes autorizované API.
 */
export async function getBugReports(): Promise<BugReport[]> {
  const currentUser = auth.currentUser;
  if (!currentUser) return [];

  const token = await currentUser.getIdToken();
  const response = await fetch('/api/admin/bug-reports', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Nepodařilo se načíst hlášení chyb.');
  }

  return Array.isArray(data.reports) ? data.reports : [];
}

/**
 * Změní stav hlášení chyby a případnou interní poznámku (učitel) přes backend.
 */
export async function updateBugReportStatus(
  reportId: string,
  status: BugReportStatus,
  resolutionNotes?: string
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Nejste přihlášeni');

  const token = await currentUser.getIdToken();
  const response = await fetch(`/api/admin/bug-reports/${encodeURIComponent(reportId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ status, resolutionNotes })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Nepodařilo se změnit stav hlášení.');
  }
}

/**
 * Smaže hlášení chyby (učitel) přes backend.
 */
export async function deleteBugReport(reportId: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Nejste přihlášeni');

  const token = await currentUser.getIdToken();
  const response = await fetch(`/api/admin/bug-reports/${encodeURIComponent(reportId)}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Nepodařilo se smazat hlášení.');
  }
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
