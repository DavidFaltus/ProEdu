import { auth } from '../lib/firebase';
import { MaterialQuotaSummary } from '../types';
import { authorizeMaterialExport } from '../services/practiceService';
import {
  buildPdfFromJpegPages,
  downloadMaterialAsPdf,
  drawWatermarkFooterOnCanvas,
  getPdfJs,
  imageSourceToJpegPage,
  isPdfResource,
} from './pdfToSvg';
import { sanitizeSafeUrl, sanitizeSvg } from './svgUtils';

export interface MaterialPageItem {
  pageNumber: number;
  width: number;
  height: number;
  dataUrl?: string;
  svgMarkup?: string;
}

export function isProtectedMaterialsApiUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/api/materials/')) return true;
  if (typeof window !== 'undefined') {
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/materials/');
    } catch {
      return false;
    }
  }
  return false;
}

export function extractMaterialIdFromUrls(urls: Array<string | null | undefined>): string | null {
  for (const url of urls) {
    if (typeof url !== 'string' || !url) continue;
    const match = url.match(/\/api\/materials\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) return match[1];
  }
  return null;
}

function decodeSvgDataUrl(dataUrl: string): string {
  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return '';
    const header = dataUrl.slice(0, commaIdx).toLowerCase();
    const payload = dataUrl.slice(commaIdx + 1);
    if (header.includes(';base64')) {
      const binary = atob(payload);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return decodeURIComponent(payload);
  } catch {
    return '';
  }
}

function parseSvgDimensions(rawSvg: string): { width: number; height: number } {
  const vbMatch = rawSvg.match(/viewBox=["']([0-9.\s-]+)["']/i);
  if (vbMatch && vbMatch[1]) {
    const parts = vbMatch[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }
  return { width: 1000, height: 1414 };
}

/**
 * Splits a composite SVG (created by convertFileToSvg with <g id="pdf-page-N"> groups)
 * into individual pages, or returns a single page for standalone vector/image SVGs.
 */
export function extractPagesFromSvg(rawSvg: string): MaterialPageItem[] {
  const clean = sanitizeSvg(rawSvg);
  if (!clean) return [];

  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(clean, 'image/svg+xml');
      const pageGroups = Array.from(doc.querySelectorAll('g[id^="pdf-page-"]'));

      if (pageGroups.length > 0) {
        const extracted: MaterialPageItem[] = [];
        pageGroups.forEach((group, idx) => {
          const imgEl = group.querySelector('image');
          const rectEl = group.querySelector('rect');
          const width = Number(imgEl?.getAttribute('width') || rectEl?.getAttribute('width') || 1000);
          const height = Number(imgEl?.getAttribute('height') || rectEl?.getAttribute('height') || 1414);
          const href = imgEl?.getAttribute('href') || imgEl?.getAttribute('xlink:href') || '';

          if (href && href.startsWith('data:image/')) {
            extracted.push({
              pageNumber: idx + 1,
              width,
              height,
              dataUrl: href,
            });
          } else {
            const singlePageSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="100%" height="auto">${group.innerHTML}</svg>`;
            extracted.push({
              pageNumber: idx + 1,
              width,
              height,
              svgMarkup: sanitizeSvg(singlePageSvg),
            });
          }
        });

        if (extracted.length > 0) {
          return extracted;
        }
      }
    } catch {
      // Fallback to single SVG page below
    }
  }

  const dims = parseSvgDimensions(clean);
  return [
    {
      pageNumber: 1,
      width: dims.width,
      height: dims.height,
      svgMarkup: clean,
    },
  ];
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Nepodařilo se načíst obrázek materiálu.'));
    reader.readAsDataURL(blob);
  });
}

function measureImageDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || img.width || 1000,
        height: img.naturalHeight || img.height || 1414,
      });
    };
    img.onerror = () => resolve({ width: 1000, height: 1414 });
    img.src = dataUrl;
  });
}

async function renderPdfBufferToPages(arrayBuffer: ArrayBuffer): Promise<MaterialPageItem[]> {
  const pdfjsLib = await getPdfJs();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  const maxPages = Math.min(pdf.numPages, 25);
  const rendered: MaterialPageItem[] = [];

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) continue;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport } as any).promise;
    rendered.push({
      pageNumber: i,
      width: canvas.width,
      height: canvas.height,
      dataUrl: canvas.toDataURL('image/jpeg', 0.9),
    });
  }
  return rendered;
}

export interface LoadedMaterialPagesResult {
  pages: MaterialPageItem[];
  watermarkText: string | null;
  isLocked: boolean;
}

/**
 * Loads material pages via authorized endpoints (or inline SVG) for canvas rendering,
 * reading any server-sent X-Watermark-Text header.
 */
export async function loadMaterialPages(params: {
  fileUrl?: string | null;
  pdfUrl?: string | null;
  svgUrl?: string | null;
  svgContent?: string | null;
  fileType?: string | null;
  originalName?: string | null;
  signal?: AbortSignal;
}): Promise<LoadedMaterialPagesResult> {
  const isPdf = isPdfResource({
    fileType: params.fileType,
    pdfUrl: params.pdfUrl,
    svgUrl: params.svgUrl,
    fileUrl: params.fileUrl,
    originalName: params.originalName,
    svgContent: params.svgContent,
  });

  const rawResolvedUrl = isPdf
    ? (params.pdfUrl || params.fileUrl || '')
    : (params.svgUrl || params.fileUrl || '');

  const isInlineSvgDataUrl = rawResolvedUrl.trim().toLowerCase().startsWith('data:image/svg+xml');
  const decodedDataUrlSvg = isInlineSvgDataUrl ? sanitizeSvg(decodeSvgDataUrl(rawResolvedUrl.trim())) : '';
  const safeResolvedUrl = isInlineSvgDataUrl ? null : sanitizeSafeUrl(rawResolvedUrl);
  const cleanInlineSvg = params.svgContent?.trim() ? sanitizeSvg(params.svgContent) : decodedDataUrlSvg;

  if (cleanInlineSvg) {
    return {
      pages: extractPagesFromSvg(cleanInlineSvg),
      watermarkText: null,
      isLocked: false,
    };
  }

  if (!safeResolvedUrl) {
    return { pages: [], watermarkText: null, isLocked: false };
  }

  const isProtected = isProtectedMaterialsApiUrl(safeResolvedUrl);
  const headers: Record<string, string> = {};
  if (isProtected) {
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(safeResolvedUrl, {
    headers,
    credentials: 'include',
    signal: params.signal,
  });

  if (res.status === 401 || res.status === 403) {
    return { pages: [], watermarkText: null, isLocked: true };
  }
  if (res.status === 429) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody.error || 'Příliš mnoho načtených materiálů za krátkou dobu. Zkuste to prosím za chvíli.'
    );
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Nepodařilo se načíst studijní materiál (HTTP ${res.status}).`);
  }

  const rawWatermarkHeader = res.headers.get('X-Watermark-Text');
  let watermarkText: string | null = null;
  if (rawWatermarkHeader) {
    try {
      watermarkText = decodeURIComponent(rawWatermarkHeader);
    } catch {
      watermarkText = rawWatermarkHeader;
    }
  }

  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('svg') || safeResolvedUrl.toLowerCase().endsWith('.svg')) {
    const text = await res.text();
    const pages = extractPagesFromSvg(text);
    return { pages, watermarkText, isLocked: false };
  }

  if (isPdf || ct.includes('application/pdf')) {
    const buf = await res.arrayBuffer();
    const pages = await renderPdfBufferToPages(buf);
    return { pages, watermarkText, isLocked: false };
  }

  const blob = await res.blob();
  const dataUrl = await readBlobAsDataUrl(blob);
  const dims = await measureImageDataUrl(dataUrl);
  return {
    pages: [
      {
        pageNumber: 1,
        width: dims.width,
        height: dims.height,
        dataUrl,
      },
    ],
    watermarkText,
    isLocked: false,
  };
}

function loadPageImageElement(page: MaterialPageItem): Promise<{
  img: HTMLImageElement;
  cleanup: () => void;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let objectUrl: string | null = null;

    const cleanup = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    img.onload = () => resolve({ img, cleanup });
    img.onerror = () => {
      cleanup();
      reject(new Error('Nepodařilo se vykreslit stránku materiálu.'));
    };

    if (page.dataUrl) {
      img.src = page.dataUrl;
    } else if (page.svgMarkup) {
      const blob = new Blob([page.svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
      objectUrl = URL.createObjectURL(blob);
      img.src = objectUrl;
    } else {
      reject(new Error('Stránka neobsahuje obrazová data.'));
    }
  });
}

/**
 * Draws a MaterialPageItem onto a visible <canvas> element with optional footer watermark.
 */
export async function drawPageToCanvas(
  canvas: HTMLCanvasElement,
  page: MaterialPageItem,
  watermarkText?: string | null,
  options?: { maxCssWidth?: number; fitMode?: 'width' | 'height' }
): Promise<void> {
  const { img, cleanup } = await loadPageImageElement(page);
  try {
    const naturalW = img.naturalWidth || page.width || 1000;
    const naturalH = img.naturalHeight || page.height || 1414;
    const aspect = naturalH / Math.max(1, naturalW);
    const fitMode = options?.fitMode || 'width';

    const parentWidth =
      options?.maxCssWidth ||
      canvas.parentElement?.clientWidth ||
      Math.min(naturalW, 1000);
    const cssWidth =
      fitMode === 'height'
        ? Math.max(800, Math.min(options?.maxCssWidth || 1050, 1200))
        : Math.max(240, Math.min(parentWidth, 1200));
    const cssHeight = Math.round(cssWidth * aspect);
    const dpr = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2);

    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    if (fitMode === 'height') {
      canvas.style.width = '';
      canvas.style.maxWidth = '';
      canvas.style.height = '';
    } else {
      canvas.style.width = '100%';
      canvas.style.maxWidth = `${cssWidth}px`;
      canvas.style.height = 'auto';
    }

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (watermarkText) {
      drawWatermarkFooterOnCanvas(ctx, canvas.width, canvas.height, watermarkText);
    }
  } finally {
    cleanup();
  }
}

/**
 * Renders a MaterialPageItem to a crisp JPEG Data URL with personalized footer watermark.
 */
export async function renderWatermarkedPageDataUrl(
  page: MaterialPageItem,
  watermarkText?: string | null
): Promise<{ width: number; height: number; dataUrl: string }> {
  const { img, cleanup } = await loadPageImageElement(page);
  try {
    const rawW = img.naturalWidth || page.width || 1240;
    const rawH = img.naturalHeight || page.height || 1754;
    const targetW = Math.max(1000, Math.min(1800, rawW));
    const targetH = Math.round((rawH / Math.max(1, rawW)) * targetW);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Nelze připravit stránku k tisku nebo exportu.');
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    if (watermarkText) {
      drawWatermarkFooterOnCanvas(ctx, targetW, targetH, watermarkText);
    }

    return {
      width: targetW,
      height: targetH,
      dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    };
  } finally {
    cleanup();
  }
}

function escapeHtmlText(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Prints watermarked material pages through a hidden iframe so browser print preview
 * produces clean A4 sheets with the user's personalized footer watermark.
 */
export async function printWatermarkedPages(
  title: string,
  pages: MaterialPageItem[],
  watermarkText?: string | null
): Promise<void> {
  if (typeof document === 'undefined' || pages.length === 0) {
    throw new Error('Materiál nemá žádné stránky k tisku.');
  }

  const renderedUrls: string[] = [];
  for (const page of pages) {
    const out = await renderWatermarkedPageDataUrl(page, watermarkText);
    renderedUrls.push(out.dataUrl);
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    throw new Error('Tiskový dialog se nepodařilo otevřít.');
  }

  const pagesHtml = renderedUrls
    .map(
      (src, idx) =>
        `<div class="print-page"><img src="${src}" alt="${escapeHtmlText(title)} - strana ${idx + 1}" /></div>`
    )
    .join('');

  doc.open();
  doc.write(`<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtmlText(title)}</title>
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    .print-page {
      width: 100%;
      page-break-after: always;
      break-after: page;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .print-page:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .print-page img {
      width: 100%;
      max-height: 100vh;
      object-fit: contain;
      display: block;
    }
  </style>
</head>
<body>${pagesHtml}</body>
</html>`);
  doc.close();

  await new Promise<void>((resolve) => {
    const imgs = Array.from(doc.querySelectorAll('img'));
    let remaining = imgs.length;
    if (remaining === 0) {
      resolve();
      return;
    }
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) resolve();
    };
    imgs.forEach((img) => {
      if (img.complete) done();
      else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
    });
    window.setTimeout(resolve, 2500);
  });

  const cleanup = () => {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  };

  iframe.contentWindow.addEventListener('afterprint', cleanup, { once: true });
  iframe.contentWindow.focus();
  iframe.contentWindow.print();
  window.setTimeout(cleanup, 60000);
}

/**
 * Authorizes export against monthly quota, applies footer watermark for students,
 * builds a multi-page PDF, triggers download, and returns updated quota state.
 */
export async function exportProtectedMaterialAsPdf(params: {
  materialId?: string | null;
  title: string;
  downloadUrl?: string | null;
  pdfUrl?: string | null;
  fileUrl?: string | null;
  svgUrl?: string | null;
  svgContent?: string | null;
  fileType?: string | null;
  originalName?: string | null;
  preloadedPages?: MaterialPageItem[];
  isTeacher?: boolean;
}): Promise<{
  quota: MaterialQuotaSummary | null;
  alreadyUnlocked: boolean;
  courseExempt: boolean;
}> {
  const resolvedMaterialId =
    params.materialId ||
    extractMaterialIdFromUrls([params.downloadUrl, params.fileUrl, params.pdfUrl, params.svgUrl]);

  let quota: MaterialQuotaSummary | null = null;
  let alreadyUnlocked = false;
  let courseExempt = false;
  let watermarkText: string | null = null;

  if (resolvedMaterialId) {
    const authRes = await authorizeMaterialExport(resolvedMaterialId);
    quota = authRes.quota;
    alreadyUnlocked = authRes.alreadyUnlocked;
    courseExempt = authRes.courseExempt;
    watermarkText = authRes.watermarkText;
  } else if (!params.isTeacher) {
    const email = auth.currentUser?.email || auth.currentUser?.uid || 'Host';
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Prague',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    watermarkText = `ProEducator • ${email} • ${today}`;
  }

  // Teachers receive unwatermarked direct/original downloads
  if (params.isTeacher || !watermarkText) {
    await downloadMaterialAsPdf({
      title: params.title,
      downloadUrl: params.downloadUrl,
      pdfUrl: params.pdfUrl,
      fileUrl: params.fileUrl,
      svgUrl: params.svgUrl,
      svgContent: params.svgContent,
      fileType: params.fileType,
    });
    return { quota, alreadyUnlocked: true, courseExempt };
  }

  let pages = params.preloadedPages && params.preloadedPages.length > 0 ? params.preloadedPages : null;
  if (!pages) {
    const loaded = await loadMaterialPages({
      fileUrl: params.fileUrl,
      pdfUrl: params.pdfUrl,
      svgUrl: params.svgUrl,
      svgContent: params.svgContent,
      fileType: params.fileType,
      originalName: params.originalName,
    });
    if (loaded.isLocked) {
      throw new Error('Pro stažení tohoto materiálu je nutné aktivní předplatné Premium.');
    }
    pages = loaded.pages;
  }

  if (!pages || pages.length === 0) {
    throw new Error('Tento materiál neobsahuje žádný soubor ke stažení.');
  }

  const jpegPages: Array<{ width: number; height: number; jpegBytes: Uint8Array }> = [];
  for (const page of pages) {
    if (page.dataUrl) {
      const jpeg = await imageSourceToJpegPage(page.dataUrl, page.width, page.height, watermarkText);
      jpegPages.push(jpeg);
    } else if (page.svgMarkup) {
      const svgBlob = new Blob([page.svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
      const objUrl = URL.createObjectURL(svgBlob);
      try {
        const jpeg = await imageSourceToJpegPage(objUrl, page.width, page.height, watermarkText);
        jpegPages.push(jpeg);
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    }
  }

  if (jpegPages.length === 0) {
    throw new Error('Nepodařilo se připravit stránky pro export do PDF.');
  }

  const pdfBlob = buildPdfFromJpegPages(jpegPages);
  const safeBaseName =
    (params.title || 'Studijni_material')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_') || 'Studijni_material';
  const downloadFileName = safeBaseName.toLowerCase().endsWith('.pdf')
    ? safeBaseName
    : `${safeBaseName}.pdf`;

  const blobUrl = URL.createObjectURL(pdfBlob);
  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = downloadFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  }

  return { quota, alreadyUnlocked, courseExempt };
}
