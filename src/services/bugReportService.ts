import { auth } from '../lib/firebase';
import { BugReport, CreateBugReportInput, BugReportStatus } from '../types/bugReport';
import { trackBugReportSubmit } from './analyticsService';

const ALLOWED_SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024; // 10 MB vstupní soubor
const MAX_DIMENSION_PX = 1600;
const MAX_DATA_URL_CHARS = 750 * 1024; // ~550 KB binárně, bezpečně pod 1 MB limitem Firestore dokumentu

function loadFileAsImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Nepodařilo se načíst vybraný obrázek.'));
    };
    img.src = objectUrl;
  });
}

/**
 * Zkomprimuje a převede screenshot k hlášení chyby do bezpečného base64 data URL
 * pro přímé odeslání přes backendové API (/api/bug-reports/submit) bez závislosti na klientském Firebase Storage.
 */
export async function uploadBugReportScreenshot(_userId: string, file: File): Promise<string> {
  if (!ALLOWED_SCREENSHOT_TYPES.includes(file.type)) {
    throw new Error('Povoleny jsou pouze obrázky PNG, JPG nebo WEBP.');
  }

  if (file.size > MAX_SCREENSHOT_BYTES) {
    throw new Error('Velikost obrázku nesmí přesáhnout 10 MB.');
  }

  const img = await loadFileAsImage(file);
  const srcWidth = img.naturalWidth || img.width || 1;
  const srcHeight = img.naturalHeight || img.height || 1;

  const renderAtScale = (maxDim: number, quality: number): string => {
    let targetWidth = srcWidth;
    let targetHeight = srcHeight;
    if (targetWidth > maxDim || targetHeight > maxDim) {
      if (targetWidth >= targetHeight) {
        targetHeight = Math.max(1, Math.round((targetHeight * maxDim) / targetWidth));
        targetWidth = maxDim;
      } else {
        targetWidth = Math.max(1, Math.round((targetWidth * maxDim) / targetHeight));
        targetHeight = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Nepodařilo se inicializovat grafický kontext pro zpracování obrázku.');
    }

    // Bílé pozadí pro případ průhledného PNG při konverzi do JPEG
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    return canvas.toDataURL('image/jpeg', quality);
  };

  let dataUrl = renderAtScale(MAX_DIMENSION_PX, 0.82);
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    dataUrl = renderAtScale(1280, 0.72);
  }
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    dataUrl = renderAtScale(1024, 0.62);
  }
  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error('Obrázek je i po kompresi příliš velký. Zkuste prosím menší výřez obrazovky.');
  }

  return dataUrl;
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

  trackBugReportSubmit({
    category: input.category,
    hasScreenshot: Boolean(finalScreenshotUrl),
  });

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
