import * as pdfjsLib from 'pdfjs-dist';

// Configure worker for PDF.js
if (typeof window !== 'undefined') {
  try {
    // Primary: Vite module worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).href;
  } catch {
    // Fallback: CDN
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
}

export interface ConvertedSvgResult {
  svgString: string;
  thumbnailDataUrl: string;
  pageCount: number;
  fileName: string;
  fileSizeBytes: number;
  width: number;
  height: number;
}

/**
 * Sanitizes SVG string to prevent XSS (removes <script> tags and event handlers)
 */
export function sanitizeSvg(rawSvg: string): string {
  return rawSvg
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');
}

/**
 * Converts a PDF or SVG file into a clean, standalone SVG string.
 */
export async function convertFileToSvg(
  file: File, 
  onProgress?: (progressText: string) => void
): Promise<ConvertedSvgResult> {
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (isSvg) {
    onProgress?.('Načítám SVG soubor...');
    const rawText = await file.text();
    const cleanSvg = sanitizeSvg(rawText);

    // Extract viewBox or width/height if possible
    let width = 800;
    let height = 1100;
    const vbMatch = cleanSvg.match(/viewBox=["']([0-9.\s-]+)["']/i);
    if (vbMatch && vbMatch[1]) {
      const parts = vbMatch[1].trim().split(/\s+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        width = parts[2];
        height = parts[3];
      }
    }

    const thumb = `data:image/svg+xml;utf8,${encodeURIComponent(cleanSvg)}`;

    return {
      svgString: cleanSvg,
      thumbnailDataUrl: thumb,
      pageCount: 1,
      fileName: file.name,
      fileSizeBytes: file.size,
      width,
      height
    };
  }

  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
  if (isImage) {
    onProgress?.('Načítám a převádím obrázek na SVG...');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Chyba při čtení souboru obrázku.'));
      reader.readAsDataURL(file);
    });

    const { width, height, optimizedDataUrl } = await new Promise<{ width: number; height: number; optimizedDataUrl: string }>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          const maxDim = 1100;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ width: w, height: h, optimizedDataUrl: dataUrl });
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.84);
          resolve({ width: w, height: h, optimizedDataUrl: compressed });
        } catch {
          resolve({ width: img.naturalWidth || 800, height: img.naturalHeight || 600, optimizedDataUrl: dataUrl });
        }
      };
      img.onerror = () => reject(new Error('Chyba při dekódování obrázku.'));
      img.src = dataUrl;
    });

    const svgString = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="100%" height="auto" style="border-radius: 8px; max-width: 100%;">
  <image width="${width}" height="${height}" href="${optimizedDataUrl}" />
</svg>`.trim();

    return {
      svgString,
      thumbnailDataUrl: optimizedDataUrl,
      pageCount: 1,
      fileName: file.name,
      fileSizeBytes: file.size,
      width,
      height
    };
  }

  if (!isPdf) {
    throw new Error('Nepodporovaný typ souboru. Nahrajte prosím soubor PDF, SVG nebo obrázek (PNG, JPG, WebP).');
  }

  onProgress?.('Načítám PDF soubor...');
  const arrayBuffer = await file.arrayBuffer();

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true
  });

  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  onProgress?.(`Zpracovávám PDF (${numPages} ${numPages === 1 ? 'strana' : numPages < 5 ? 'strany' : 'stran'})...`);

  const pagesData: Array<{
    pageNumber: number;
    width: number;
    height: number;
    imgDataUrl: string;
  }> = [];

  // Convert each page (up to max 10 pages for a study sheet)
  const maxPages = Math.min(numPages, 10);
  for (let i = 1; i <= maxPages; i++) {
    onProgress?.(`Vykresluji stranu ${i} z ${maxPages}...`);
    const page = await pdf.getPage(i);
    
    // Scale 1.8 gives sharp text while keeping payload compact
    const viewport = page.getViewport({ scale: 1.8 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Nelze vytvořit 2D kontext plátna pro PDF.');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvas: canvas,
      canvasContext: ctx,
      viewport: viewport
    } as any).promise;

    // Use JPEG with 0.88 quality for compact size and crisp equations
    const imgDataUrl = canvas.toDataURL('image/jpeg', 0.88);
    pagesData.push({
      pageNumber: i,
      width: canvas.width,
      height: canvas.height,
      imgDataUrl
    });
  }

  onProgress?.('Sestavuji výsledný SVG grafický list...');

  // Compute unified dimensions
  const maxWidth = Math.max(...pagesData.map(p => p.width));
  const pageGap = pagesData.length > 1 ? 24 : 0;
  let totalHeight = 0;
  pagesData.forEach((p, idx) => {
    totalHeight += p.height;
    if (idx < pagesData.length - 1) totalHeight += pageGap;
  });

  // Build composite SVG
  let currentY = 0;
  const svgPagesMarkup = pagesData.map((p, idx) => {
    const xOffset = Math.floor((maxWidth - p.width) / 2);
    const yPos = currentY;
    currentY += p.height + pageGap;

    return `
      <!-- Strana ${p.pageNumber} -->
      <g id="pdf-page-${p.pageNumber}" transform="translate(${xOffset}, ${yPos})">
        <rect width="${p.width}" height="${p.height}" fill="#ffffff" rx="4" />
        <image width="${p.width}" height="${p.height}" href="${p.imgDataUrl}" />
      </g>
      ${idx < pagesData.length - 1 ? `<line x1="0" y1="${currentY - pageGap / 2}" x2="${maxWidth}" y2="${currentY - pageGap / 2}" stroke="#e2e8f0" stroke-width="2" stroke-dasharray="6,6" />` : ''}
    `;
  }).join('\n');

  const compositeSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${maxWidth} ${totalHeight}" width="100%" height="100%" style="background-color: #f8fafc; border-radius: 8px;">
    ${svgPagesMarkup}
  </svg>`.trim();

  const thumbnail = pagesData[0]?.imgDataUrl || '';

  return {
    svgString: compositeSvg,
    thumbnailDataUrl: thumbnail,
    pageCount: maxPages,
    fileName: file.name,
    fileSizeBytes: file.size,
    width: maxWidth,
    height: totalHeight
  };
}
