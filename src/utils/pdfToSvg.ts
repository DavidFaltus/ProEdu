async function getPdfJs() {
  const pdfjsLib = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
      ).href;
    } catch {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    }
  }
  return pdfjsLib;
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

import { sanitizeSvg } from './svgUtils';
export { sanitizeSvg };

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
          const maxDim = 1000;
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
          let compressed = canvas.toDataURL('image/webp', 0.82);
          if (!compressed.startsWith('data:image/webp')) {
            compressed = canvas.toDataURL('image/jpeg', 0.82);
          }
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
  const pdfjsLib = await getPdfJs();
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

  // Create an ultra-compact, crisp thumbnail of page 1 for the card preview
  let thumbnail = pagesData[0]?.imgDataUrl || '';
  if (pagesData[0]) {
    try {
      const p1 = pagesData[0];
      const thumbCanvas = document.createElement('canvas');
      const maxThumbWidth = 600;
      const thumbScale = Math.min(1, maxThumbWidth / p1.width);
      thumbCanvas.width = Math.round(p1.width * thumbScale);
      thumbCanvas.height = Math.round(p1.height * thumbScale);
      const thumbCtx = thumbCanvas.getContext('2d');
      if (thumbCtx) {
        thumbCtx.fillStyle = '#ffffff';
        thumbCtx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
        const img = new Image();
        img.src = p1.imgDataUrl;
        await new Promise((resolve) => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
        });
        thumbCtx.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);
        thumbnail = thumbCanvas.toDataURL('image/jpeg', 0.82);
      }
    } catch {
      thumbnail = pagesData[0].imgDataUrl;
    }
  }

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

/**
 * Normalizes any image data URL (JPEG, PNG, WebP) or SVG string into a baseline RGB JPEG DataURL
 * along with its pixel dimensions so it can be embedded directly into a PDF 1.4 /DCTDecode stream.
 */
async function imageSourceToJpegPage(src: string, fallbackWidth = 1240, fallbackHeight = 1754): Promise<{
  width: number;
  height: number;
  jpegBytes: Uint8Array;
}> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width || fallbackWidth;
        const h = img.naturalHeight || img.height || fallbackHeight;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          reject(new Error('Nelze inicializovat 2D kontext pro generování PDF.'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Nepodařilo se načíst grafickou stránku pro PDF.'));
    img.src = src;
  });

  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Extract dimensions from canvas pass via temporary image or SOF0 marker
  const dims = await new Promise<{ w: number; h: number }>((resolve) => {
    const tempImg = new Image();
    tempImg.onload = () => resolve({ w: tempImg.naturalWidth || fallbackWidth, h: tempImg.naturalHeight || fallbackHeight });
    tempImg.onerror = () => resolve({ w: fallbackWidth, h: fallbackHeight });
    tempImg.src = dataUrl;
  });

  return {
    width: dims.w,
    height: dims.h,
    jpegBytes: bytes
  };
}

/**
 * Builds a valid multi-page binary PDF 1.4 document from an array of JPEG page images.
 */
function buildPdfFromJpegPages(pages: Array<{ width: number; height: number; jpegBytes: Uint8Array }>): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0]; // index 0 is free object
  let currentOffset = 0;

  const pushBytes = (bytes: Uint8Array) => {
    chunks.push(bytes);
    currentOffset += bytes.length;
  };

  const pushStr = (str: string) => {
    pushBytes(encoder.encode(str));
  };

  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  const numPages = pages.length;
  const pageObjIds = pages.map((_, i) => 3 + i * 3);

  // Object 1: Catalog
  offsets[1] = currentOffset;
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Object 2: Pages
  offsets[2] = currentOffset;
  pushStr(`2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map(id => `${id} 0 R`).join(' ')}] /Count ${numPages} >>\nendobj\n`);

  pages.forEach((p, i) => {
    const pageObjId = 3 + i * 3;
    const contentObjId = 4 + i * 3;
    const imageObjId = 5 + i * 3;

    const pageWidthPt = 595.28; // Standard A4 width in points
    const pageHeightPt = Math.max(100, Number(((p.height / Math.max(1, p.width)) * pageWidthPt).toFixed(2)));

    // Page Object
    offsets[pageObjId] = currentOffset;
    pushStr(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /XObject << /Im0 ${imageObjId} 0 R >> >> /MediaBox [0 0 ${pageWidthPt} ${pageHeightPt}] /Contents ${contentObjId} 0 R >>\nendobj\n`
    );

    // Content Stream Object
    const contentStream = `q\n${pageWidthPt} 0 0 ${pageHeightPt} 0 0 cm\n/Im0 Do\nQ\n`;
    const contentBytes = encoder.encode(contentStream);
    offsets[contentObjId] = currentOffset;
    pushStr(`${contentObjId} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
    pushBytes(contentBytes);
    pushStr('\nendstream\nendobj\n');

    // Image XObject (DCTDecode raw JPEG)
    offsets[imageObjId] = currentOffset;
    pushStr(
      `${imageObjId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.length} >>\nstream\n`
    );
    pushBytes(p.jpegBytes);
    pushStr('\nendstream\nendobj\n');
  });

  const totalObjects = 2 + numPages * 3;
  const xrefOffset = currentOffset;
  pushStr(`xref\n0 ${totalObjects + 1}\n`);
  pushStr('0000000000 65535 f \n');
  for (let id = 1; id <= totalObjects; id++) {
    const offStr = String(offsets[id] || 0).padStart(10, '0');
    pushStr(`${offStr} 00000 n \n`);
  }

  pushStr(`trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(chunks, { type: 'application/pdf' });
}

/**
 * Triggers a browser download of the material as a PDF file.
 * If the original PDF URL is available, downloads that exact PDF file.
 * Otherwise, reconstructs the PDF from the stored SVG graphic sheet pages.
 */
export async function downloadMaterialAsPdf(material: {
  title: string;
  pdfUrl?: string | null;
  fileUrl?: string | null;
  svgUrl?: string | null;
  svgContent?: string | null;
}): Promise<void> {
  const safeBaseName = (material.title || 'Studijni_material')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_') || 'Studijni_material';
  const downloadFileName = safeBaseName.toLowerCase().endsWith('.pdf') ? safeBaseName : `${safeBaseName}.pdf`;

  const directPdfUrl =
    (material as any).downloadUrl ||
    material.pdfUrl ||
    (material.fileUrl && (
      material.fileUrl.toLowerCase().endsWith('.pdf') || 
      material.fileUrl.startsWith('data:application/pdf') ||
      material.fileUrl.includes('/api/materials/')
    ) ? (material.fileUrl.endsWith('/file') ? material.fileUrl.replace(/\/file$/, '/download') : material.fileUrl) : null);

  if (directPdfUrl) {
    try {
      const response = await fetch(directPdfUrl);
      if (response.ok) {
        const blob = await response.blob();
        const pdfBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = downloadFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        return;
      }
    } catch {
      // Fallback to direct anchor click if CORS blocks fetch
      const link = document.createElement('a');
      link.href = directPdfUrl;
      link.download = downloadFileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }
  }

  // Reconstruct PDF from SVG content or SVG URL
  let svgText = material.svgContent || '';
  if (!svgText && material.svgUrl) {
    const resp = await fetch(material.svgUrl);
    if (!resp.ok) {
      throw new Error('Nepodařilo se načíst podklad pro stažení PDF.');
    }
    svgText = await resp.text();
  }

  if (!svgText) {
    throw new Error('Tento materiál neobsahuje žádný soubor ke stažení.');
  }

  // Extract embedded page images from composite SVG (created by convertFileToSvg)
  const imageHrefRegex = /<image[^>]+(?:href|xlink:href)=["'](data:image\/[^"']+)["'][^>]*>/gi;
  const pageDataUrls: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = imageHrefRegex.exec(svgText)) !== null) {
    if (match[1]) {
      pageDataUrls.push(match[1]);
    }
  }

  const jpegPages: Array<{ width: number; height: number; jpegBytes: Uint8Array }> = [];

  if (pageDataUrls.length > 0) {
    for (const src of pageDataUrls) {
      const page = await imageSourceToJpegPage(src);
      jpegPages.push(page);
    }
  } else {
    // Pure vector SVG sheet -> render whole SVG to a high-res page
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const svgObjectUrl = URL.createObjectURL(svgBlob);
    try {
      const page = await imageSourceToJpegPage(svgObjectUrl, 1240, 1754);
      jpegPages.push(page);
    } finally {
      URL.revokeObjectURL(svgObjectUrl);
    }
  }

  const pdfBlob = buildPdfFromJpegPages(jpegPages);
  const blobUrl = URL.createObjectURL(pdfBlob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = downloadFileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}
