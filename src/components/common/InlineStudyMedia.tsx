import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getPdfJs, isPdfResource, sanitizeSvg } from '../../utils/pdfToSvg';

interface InlineStudyMediaProps {
  svgContent?: string | null;
  fileUrl?: string | null;
  pdfUrl?: string | null;
  svgUrl?: string | null;
  imageUrl?: string | null;
  fileType?: string | null;
  originalName?: string | null;
  alt?: string;
  className?: string;
}

interface RenderedPdfPage {
  pageNumber: number;
  width: number;
  height: number;
  dataUrl: string;
}

/**
 * Renders an existing raw PDF directly onto borderless page images in the DOM (no iframe, no browser chrome).
 * Used as seamless backward compatibility for PDFs uploaded before automatic PDF->SVG conversion.
 */
function BorderlessPdfRenderer({ url, alt }: { url: string; alt: string }) {
  const [pages, setPages] = useState<RenderedPdfPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setPages([]);

    (async () => {
      try {
        const pdfjsLib = await getPdfJs();
        const loadingTask = pdfjsLib.getDocument({ url, useSystemFonts: true });
        const pdf = await loadingTask.promise;
        const maxPages = Math.min(pdf.numPages, 25);
        const rendered: RenderedPdfPage[] = [];

        for (let i = 1; i <= maxPages; i++) {
          if (cancelled) return;
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
            dataUrl: canvas.toDataURL('image/jpeg', 0.9)
          });
        }

        if (!cancelled) {
          setPages(rendered);
          setLoading(false);
        }
      } catch (err) {
        console.warn('Nepodařilo se vykreslit PDF bez rámečku:', err);
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (loading) {
    return (
      <div className="w-full py-12 flex flex-col items-center justify-center gap-3 text-gray-500">
        <Loader2 className="w-7 h-7 animate-spin text-amber-600" />
        <span className="text-xs font-medium">Připravuji zobrazení materiálu...</span>
      </div>
    );
  }

  if (failed || pages.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-6">
        Materiál se nepodařilo načíst k zobrazení.
      </p>
    );
  }

  return (
    <div className="w-full space-y-6">
      {pages.map((p) => (
        <img
          key={p.pageNumber}
          src={p.dataUrl}
          alt={`${alt} — strana ${p.pageNumber}`}
          width={p.width}
          height={p.height}
          className="w-full h-auto block"
        />
      ))}
    </div>
  );
}

/**
 * Renders study sheet media cleanly embedded directly inside the page with no frames,
 * borders, shadows, cards, toolbars, or download buttons around it.
 */
export default function InlineStudyMedia({
  svgContent,
  fileUrl,
  pdfUrl,
  svgUrl,
  imageUrl,
  fileType,
  originalName,
  alt = 'Studijní materiál',
  className = ''
}: InlineStudyMediaProps) {
  const [fetchedSvg, setFetchedSvg] = useState<string | null>(null);
  const [fallbackToImg, setFallbackToImg] = useState(false);
  const [fetching, setFetching] = useState(false);

  const isPdf = isPdfResource({ fileType, pdfUrl, svgUrl, fileUrl, originalName, svgContent });
  const resolvedUrl = isPdf
    ? (pdfUrl || fileUrl || imageUrl || '')
    : (svgUrl || fileUrl || imageUrl || '');

  const cleanInlineSvg = svgContent?.trim() ? sanitizeSvg(svgContent) : '';

  const shouldTryFetchSvg = Boolean(
    !cleanInlineSvg &&
    !isPdf &&
    resolvedUrl &&
    (
      (fileType || '').toLowerCase() === 'image/svg+xml' ||
      resolvedUrl.toLowerCase().endsWith('.svg') ||
      resolvedUrl.startsWith('data:image/svg+xml') ||
      resolvedUrl.includes('/api/materials/')
    )
  );

  useEffect(() => {
    if (!shouldTryFetchSvg || !resolvedUrl) {
      setFetchedSvg(null);
      setFallbackToImg(false);
      setFetching(false);
      return;
    }

    let cancelled = false;
    setFetching(true);
    setFallbackToImg(false);
    setFetchedSvg(null);

    (async () => {
      try {
        const res = await fetch(resolvedUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        const text = await res.text();
        const looksSvg = ct.includes('svg') || /<svg[\s>]/i.test(text);
        if (!looksSvg) {
          if (!cancelled) {
            setFallbackToImg(true);
            setFetching(false);
          }
          return;
        }
        const safeSvg = sanitizeSvg(text);
        if (!cancelled) {
          setFetchedSvg(safeSvg);
          setFetching(false);
        }
      } catch {
        if (!cancelled) {
          setFallbackToImg(true);
          setFetching(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shouldTryFetchSvg, resolvedUrl]);

  if (cleanInlineSvg) {
    return (
      <div
        className={`w-full [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-w-full [&>svg]:block ${className}`}
        dangerouslySetInnerHTML={{ __html: cleanInlineSvg }}
      />
    );
  }

  if (isPdf && resolvedUrl) {
    return (
      <div className={`w-full ${className}`}>
        <BorderlessPdfRenderer url={resolvedUrl} alt={alt} />
      </div>
    );
  }

  if (shouldTryFetchSvg) {
    if (fetchedSvg) {
      return (
        <div
          className={`w-full [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-w-full [&>svg]:block ${className}`}
          dangerouslySetInnerHTML={{ __html: fetchedSvg }}
        />
      );
    }
    if (fetching && !fallbackToImg) {
      return (
        <div className={`w-full py-10 flex items-center justify-center ${className}`}>
          <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
        </div>
      );
    }
  }

  if (resolvedUrl) {
    return (
      <img
        src={resolvedUrl}
        alt={alt}
        className={`w-full h-auto max-w-full block ${className}`}
      />
    );
  }

  return null;
}
