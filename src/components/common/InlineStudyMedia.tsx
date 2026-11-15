import React, { useEffect, useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { getPdfJs, isPdfResource } from '../../utils/pdfToSvg';
import { sanitizeSvg, sanitizeSafeUrl } from '../../utils/svgUtils';
import { auth } from '../../lib/firebase';

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

function isProtectedMaterialsApiUrl(url: string): boolean {
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

function LockedMaterialNotice({ className = '' }: { className?: string }) {
  return (
    <div className={`w-full py-8 px-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-center ${className}`}>
      <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
        <Lock className="w-5 h-5" />
      </div>
      <p className="text-sm font-bold text-gray-800">
        Studijní materiál je uzamčen
      </p>
      <p className="text-xs text-gray-600 max-w-md">
        Pro zobrazení tohoto materiálu je nutné přihlášení s aktivním předplatným ProEdu Premium nebo zapsaným kurzem.
      </p>
    </div>
  );
}

/**
 * Renders an existing raw PDF directly onto borderless page images in the DOM (no iframe, no browser chrome).
 * Used as seamless backward compatibility for PDFs uploaded before automatic PDF->SVG conversion.
 */
function BorderlessPdfRenderer({ url, alt }: { url: string; alt: string }) {
  const [pages, setPages] = useState<RenderedPdfPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setLocked(false);
    setPages([]);

    (async () => {
      try {
        const safeUrl = sanitizeSafeUrl(url);
        if (!safeUrl) {
          throw new Error('Neplatná URL studijního PDF.');
        }

        const pdfjsLib = await getPdfJs();
        let loadingTask;

        if (isProtectedMaterialsApiUrl(safeUrl)) {
          const token = await auth.currentUser?.getIdToken().catch(() => null);
          const res = await fetch(safeUrl, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          });
          if (res.status === 401 || res.status === 403) {
            if (!cancelled) {
              setLocked(true);
              setLoading(false);
            }
            return;
          }
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const arrayBuffer = await res.arrayBuffer();
          loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), useSystemFonts: true });
        } else {
          loadingTask = pdfjsLib.getDocument({ url: safeUrl, useSystemFonts: true });
        }

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

  if (locked) {
    return <LockedMaterialNotice />;
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
  const [protectedImgBlobUrl, setProtectedImgBlobUrl] = useState<string | null>(null);
  const [fallbackToImg, setFallbackToImg] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const isPdf = isPdfResource({ fileType, pdfUrl, svgUrl, fileUrl, originalName, svgContent });
  const rawResolvedUrl = isPdf
    ? (pdfUrl || fileUrl || imageUrl || '')
    : (svgUrl || fileUrl || imageUrl || '');

  const isInlineSvgDataUrl = rawResolvedUrl.trim().toLowerCase().startsWith('data:image/svg+xml');
  const decodedDataUrlSvg = isInlineSvgDataUrl ? sanitizeSvg(decodeSvgDataUrl(rawResolvedUrl.trim())) : '';
  const safeResolvedUrl = isInlineSvgDataUrl ? null : sanitizeSafeUrl(rawResolvedUrl);

  const cleanInlineSvg = svgContent?.trim() ? sanitizeSvg(svgContent) : decodedDataUrlSvg;
  const isProtectedEndpoint = Boolean(safeResolvedUrl && isProtectedMaterialsApiUrl(safeResolvedUrl));

  const shouldTryFetchMedia = Boolean(
    !cleanInlineSvg &&
    !isPdf &&
    safeResolvedUrl &&
    (
      isProtectedEndpoint ||
      (fileType || '').toLowerCase() === 'image/svg+xml' ||
      safeResolvedUrl.toLowerCase().endsWith('.svg')
    )
  );

  useEffect(() => {
    if (!shouldTryFetchMedia || !safeResolvedUrl) {
      setFetchedSvg(null);
      setProtectedImgBlobUrl(null);
      setFallbackToImg(false);
      setFetching(false);
      setIsLocked(false);
      return;
    }

    let cancelled = false;
    let createdObjectUrl: string | null = null;
    setFetching(true);
    setFallbackToImg(false);
    setFetchedSvg(null);
    setProtectedImgBlobUrl(null);
    setIsLocked(false);

    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (isProtectedEndpoint) {
          const token = await auth.currentUser?.getIdToken().catch(() => null);
          if (token) {
            headers.Authorization = `Bearer ${token}`;
          }
        }

        const res = await fetch(safeResolvedUrl, { headers });
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) {
            setIsLocked(true);
            setFetching(false);
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('svg') || safeResolvedUrl.toLowerCase().endsWith('.svg')) {
          const text = await res.text();
          const looksSvg = ct.includes('svg') || /<svg[\s>]/i.test(text);
          if (looksSvg) {
            const safeSvg = sanitizeSvg(text);
            if (!cancelled) {
              setFetchedSvg(safeSvg);
              setFetching(false);
            }
            return;
          }
        }

        if (isProtectedEndpoint && ct.startsWith('image/') && !ct.includes('svg')) {
          const blob = await res.blob();
          createdObjectUrl = URL.createObjectURL(blob);
          if (!cancelled) {
            setProtectedImgBlobUrl(createdObjectUrl);
            setFetching(false);
          }
          return;
        }

        if (!cancelled) {
          setFallbackToImg(true);
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
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [shouldTryFetchMedia, safeResolvedUrl, isProtectedEndpoint]);

  if (cleanInlineSvg) {
    return (
      <div
        className={`w-full [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-w-full [&>svg]:block ${className}`}
        dangerouslySetInnerHTML={{ __html: cleanInlineSvg }}
      />
    );
  }

  if (isLocked) {
    return <LockedMaterialNotice className={className} />;
  }

  if (isPdf && safeResolvedUrl) {
    return (
      <div className={`w-full ${className}`}>
        <BorderlessPdfRenderer url={safeResolvedUrl} alt={alt} />
      </div>
    );
  }

  if (shouldTryFetchMedia) {
    if (fetchedSvg) {
      return (
        <div
          className={`w-full [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-w-full [&>svg]:block ${className}`}
          dangerouslySetInnerHTML={{ __html: fetchedSvg }}
        />
      );
    }
    if (protectedImgBlobUrl) {
      return (
        <img
          src={protectedImgBlobUrl}
          alt={alt}
          className={`w-full h-auto max-w-full block ${className}`}
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
    if (isProtectedEndpoint && fallbackToImg) {
      return null;
    }
  }

  if (safeResolvedUrl) {
    return (
      <img
        src={safeResolvedUrl}
        alt={alt}
        className={`w-full h-auto max-w-full block ${className}`}
      />
    );
  }

  return null;
}
