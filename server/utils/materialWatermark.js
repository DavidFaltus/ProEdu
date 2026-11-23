import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

/**
 * Escapes text safely for XML/SVG text nodes and attributes.
 */
export function escapeXmlForSvg(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Normalizes watermark text to pure printable WinAnsi / ASCII so PDF StandardFonts.Helvetica
 * never throws encoding errors on Czech diacritics (Ž, Ř, Č, Š, Ě, Ů, ...) or special symbols.
 */
export function normalizeWatermarkForWinAnsi(value) {
  return String(value ?? '')
    .replace(/[•·]/g, ' - ')
    .replace(/[—–]/g, '-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function parseSvgViewBox(svgString) {
  const openTagMatch = svgString.match(/<svg\b[^>]*>/i);
  const openTag = openTagMatch ? openTagMatch[0] : '';

  const vbMatch = openTag.match(/\bviewBox\s*=\s*["']([^"']+)["']/i);
  if (vbMatch && vbMatch[1]) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
      return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
    }
  }

  const wMatch = openTag.match(/\bwidth\s*=\s*["']\s*([0-9.]+)(?:px)?\s*["']/i);
  const hMatch = openTag.match(/\bheight\s*=\s*["']\s*([0-9.]+)(?:px)?\s*["']/i);
  const w = wMatch ? Number(wMatch[1]) : 800;
  const h = hMatch ? Number(hMatch[1]) : 1120;
  return {
    minX: 0,
    minY: 0,
    width: Number.isFinite(w) && w > 0 ? w : 800,
    height: Number.isFinite(h) && h > 0 ? h : 1120,
  };
}

/**
 * Injects a subtle repeating diagonal forensic watermark group before the closing </svg> tag.
 */
export function embedWatermarkIntoSvg(svgString, watermarkText) {
  if (typeof svgString !== 'string' || !svgString.trim()) {
    return svgString;
  }
  const cleanText = String(watermarkText ?? '').trim().slice(0, 180);
  if (!cleanText) {
    return svgString;
  }

  const closeTagRegex = /<\/svg\s*>/gi;
  let lastMatch = null;
  let match;
  while ((match = closeTagRegex.exec(svgString)) !== null) {
    lastMatch = match;
  }
  if (!lastMatch) {
    return svgString;
  }

  const escapedText = escapeXmlForSvg(cleanText);
  const { minX, minY, width, height } = parseSvgViewBox(svgString);

  const fontSize = Math.max(12, Math.min(28, Math.round(width * 0.022)));
  const cols = width >= 900 ? 3 : 2;
  const rows = Math.max(3, Math.min(18, Math.round(height / 360)));

  const nodes = [];
  for (let r = 0; r < rows; r++) {
    const y = Math.round(minY + ((r + 0.5) / rows) * height);
    for (let c = 0; c < cols; c++) {
      const x = Math.round(minX + ((c + 0.5) / cols) * width);
      nodes.push(
        `<text x="${x}" y="${y}" text-anchor="middle" fill="#475569" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="600" transform="rotate(-30 ${x} ${y})">${escapedText}</text>`
      );
    }
  }

  const footerFontSize = Math.max(10, Math.min(14, Math.round(width * 0.013)));
  const footerX = Math.round(minX + width / 2);
  const footerY = Math.round(minY + height - Math.max(12, footerFontSize));
  nodes.push(
    `<text x="${footerX}" y="${footerY}" text-anchor="middle" fill="#475569" opacity="0.55" font-family="Arial, Helvetica, sans-serif" font-size="${footerFontSize}" font-weight="500">${escapedText}</text>`
  );

  const overlay = `<g data-proedu-watermark="1" pointer-events="none" aria-hidden="true" opacity="0.14">${nodes.join('')}</g>`;
  const insertPos = lastMatch.index;
  return `${svgString.slice(0, insertPos)}${overlay}${svgString.slice(insertPos)}`;
}

/**
 * Stamps a subtle repeating diagonal forensic watermark across every PDF page and writes
 * watermark metadata (Subject & Keywords). Falls back safely to the original buffer if the PDF
 * cannot be parsed by pdf-lib.
 */
export async function embedWatermarkIntoPdf(pdfBuffer, watermarkText) {
  if (!pdfBuffer || !(Buffer.isBuffer(pdfBuffer) || pdfBuffer instanceof Uint8Array) || pdfBuffer.length === 0) {
    return pdfBuffer;
  }
  const originalBuf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);
  const safeText = normalizeWatermarkForWinAnsi(watermarkText);
  if (!safeText) {
    return originalBuf;
  }

  try {
    const pdfDoc = await PDFDocument.load(originalBuf, {
      ignoreEncryption: true,
      updateMetadata: false,
    });
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    pdfDoc.setSubject(safeText);
    pdfDoc.setKeywords([safeText, 'ProEducator']);

    const pages = pdfDoc.getPages();
    const wmColor = rgb(0.42, 0.45, 0.5);

    for (const page of pages) {
      const { width, height } = page.getSize();
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        continue;
      }

      const fontSize = Math.max(10, Math.min(18, Math.round(Math.min(width, height) * 0.022)));
      const textWidth = font.widthOfTextAtSize(safeText, fontSize);
      const cols = width >= 500 ? 2 : 1;
      const rows = height >= 600 ? 3 : 2;

      for (let r = 0; r < rows; r++) {
        const y = ((r + 0.5) / rows) * height;
        for (let c = 0; c < cols; c++) {
          const centerX = ((c + 0.5) / cols) * width;
          const x = Math.max(16, centerX - textWidth * 0.42);
          page.drawText(safeText, {
            x,
            y,
            size: fontSize,
            font,
            color: wmColor,
            opacity: 0.14,
            rotate: degrees(32),
          });
        }
      }

      page.drawText(safeText, {
        x: 20,
        y: 10,
        size: 8,
        font,
        color: wmColor,
        opacity: 0.4,
      });
    }

    const watermarkedBytes = await pdfDoc.save();
    return Buffer.from(watermarkedBytes);
  } catch (err) {
    console.warn('[MaterialWatermark] Nepodařilo se vložit PDF vodoznak (vracím původní soubor):', err?.message || err);
    return originalBuf;
  }
}
