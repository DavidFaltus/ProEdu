import React, { useEffect, useState, useMemo } from 'react';
import {
  Download,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  AlertTriangle,
  X
} from 'lucide-react';
import { getPdfJs, isPdfResource, downloadMaterialAsPdf } from '../../utils/pdfToSvg';
import { sanitizeSvg, sanitizeSafeUrl } from '../../utils/svgUtils';
import { auth } from '../../lib/firebase';
import { MathRenderer } from '../common/MathRenderer';
import { BookCyanIcon } from '../common/CustomIcon';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { toast } from 'sonner';

export interface TheoryMaterialViewerProps {
  title: string;
  svgContent?: string | null;
  fileUrl?: string | null;
  pdfUrl?: string | null;
  svgUrl?: string | null;
  downloadUrl?: string | null;
  fileType?: string | null;
  originalName?: string | null;
  studyTheory?: string | null;
  theoryImages?: Record<string, string>;
  isProcessing?: boolean;
  isError?: boolean;
  errorMessage?: string | null;
  showStickyHint?: boolean;
}

interface TheoryPageItem {
  pageNumber: number;
  width?: number;
  height?: number;
  dataUrl?: string;
  svgMarkup?: string;
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
 * Splits a composite SVG (created by convertFileToSvg with <g id="pdf-page-N"> groups)
 * into individual pages, or returns a single page for standalone vector/image SVGs.
 */
function extractPagesFromSvg(rawSvg: string): TheoryPageItem[] {
  const clean = sanitizeSvg(rawSvg);
  if (!clean) return [];

  if (typeof window !== 'undefined' && typeof DOMParser !== 'undefined') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(clean, 'image/svg+xml');
      const pageGroups = Array.from(doc.querySelectorAll('g[id^="pdf-page-"]'));

      if (pageGroups.length > 0) {
        const extracted: TheoryPageItem[] = [];
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
              dataUrl: href
            });
          } else {
            const singlePageSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="100%" height="auto">${group.innerHTML}</svg>`;
            extracted.push({
              pageNumber: idx + 1,
              width,
              height,
              svgMarkup: sanitizeSvg(singlePageSvg)
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

  return [
    {
      pageNumber: 1,
      svgMarkup: clean
    }
  ];
}

export default function TheoryMaterialViewer({
  title,
  svgContent,
  fileUrl,
  pdfUrl,
  svgUrl,
  downloadUrl,
  fileType,
  originalName,
  studyTheory,
  theoryImages,
  isProcessing = false,
  isError = false,
  errorMessage,
  showStickyHint = false
}: TheoryMaterialViewerProps) {
  const [fetchedSvg, setFetchedSvg] = useState<string | null>(null);
  const [protectedImgBlobUrl, setProtectedImgBlobUrl] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<TheoryPageItem[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const isPdf = isPdfResource({ fileType, pdfUrl, svgUrl, fileUrl, originalName, svgContent });
  const rawResolvedUrl = isPdf
    ? (pdfUrl || fileUrl || '')
    : (svgUrl || fileUrl || '');

  const isInlineSvgDataUrl = rawResolvedUrl.trim().toLowerCase().startsWith('data:image/svg+xml');
  const decodedDataUrlSvg = isInlineSvgDataUrl ? sanitizeSvg(decodeSvgDataUrl(rawResolvedUrl.trim())) : '';
  const safeResolvedUrl = isInlineSvgDataUrl ? null : sanitizeSafeUrl(rawResolvedUrl);

  const cleanInlineSvg = svgContent?.trim() ? sanitizeSvg(svgContent) : decodedDataUrlSvg;
  const isProtectedEndpoint = Boolean(safeResolvedUrl && isProtectedMaterialsApiUrl(safeResolvedUrl));

  const hasVisualMaterial = Boolean(cleanInlineSvg || safeResolvedUrl);

  // Load external SVG / protected image / raw PDF when not inlined
  useEffect(() => {
    setCurrentPageIdx(0);

    if (cleanInlineSvg || !safeResolvedUrl) {
      setFetchedSvg(null);
      setProtectedImgBlobUrl(null);
      setPdfPages([]);
      setLoadingMedia(false);
      setIsLocked(false);
      setLoadFailed(false);
      return;
    }

    let cancelled = false;
    let createdObjectUrl: string | null = null;
    setLoadingMedia(true);
    setFetchedSvg(null);
    setProtectedImgBlobUrl(null);
    setPdfPages([]);
    setIsLocked(false);
    setLoadFailed(false);

    (async () => {
      try {
        if (isPdf) {
          const pdfjsLib = await getPdfJs();
          let loadingTask;

          if (isProtectedEndpoint) {
            const token = await auth.currentUser?.getIdToken().catch(() => null);
            const res = await fetch(safeResolvedUrl, {
              headers: token ? { Authorization: `Bearer ${token}` } : undefined
            });
            if (res.status === 401 || res.status === 403) {
              if (!cancelled) {
                setIsLocked(true);
                setLoadingMedia(false);
              }
              return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('svg')) {
              const svgText = await res.text();
              if (!cancelled) {
                setFetchedSvg(sanitizeSvg(svgText));
                setLoadingMedia(false);
              }
              return;
            }

            const arrayBuffer = await res.arrayBuffer();
            loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), useSystemFonts: true });
          } else {
            loadingTask = pdfjsLib.getDocument({ url: safeResolvedUrl, useSystemFonts: true });
          }

          const pdf = await loadingTask.promise;
          const maxPages = Math.min(pdf.numPages, 25);
          const rendered: TheoryPageItem[] = [];

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
            setPdfPages(rendered);
            setLoadingMedia(false);
          }
          return;
        }

        // Non-PDF: fetch SVG or protected raster image
        const shouldFetch =
          isProtectedEndpoint ||
          (fileType || '').toLowerCase() === 'image/svg+xml' ||
          safeResolvedUrl.toLowerCase().endsWith('.svg');

        if (!shouldFetch) {
          if (!cancelled) {
            setLoadingMedia(false);
          }
          return;
        }

        const headers: Record<string, string> = {};
        if (isProtectedEndpoint) {
          const token = await auth.currentUser?.getIdToken().catch(() => null);
          if (token) headers.Authorization = `Bearer ${token}`;
        }

        const res = await fetch(safeResolvedUrl, { headers });
        if (res.status === 401 || res.status === 403) {
          if (!cancelled) {
            setIsLocked(true);
            setLoadingMedia(false);
          }
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('svg') || safeResolvedUrl.toLowerCase().endsWith('.svg')) {
          const text = await res.text();
          if (ct.includes('svg') || /<svg[\s>]/i.test(text)) {
            if (!cancelled) {
              setFetchedSvg(sanitizeSvg(text));
              setLoadingMedia(false);
            }
            return;
          }
        }

        const blob = await res.blob();
        createdObjectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setProtectedImgBlobUrl(createdObjectUrl);
          setLoadingMedia(false);
        }
      } catch (err) {
        console.warn('Nepodařilo se načíst studijní materiál:', err);
        if (!cancelled) {
          setLoadFailed(true);
          setLoadingMedia(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [cleanInlineSvg, safeResolvedUrl, isPdf, isProtectedEndpoint, fileType]);

  const pages: TheoryPageItem[] = useMemo(() => {
    const activeSvg = cleanInlineSvg || fetchedSvg;
    if (activeSvg) {
      return extractPagesFromSvg(activeSvg);
    }
    if (pdfPages.length > 0) {
      return pdfPages;
    }
    if (protectedImgBlobUrl) {
      return [{ pageNumber: 1, dataUrl: protectedImgBlobUrl }];
    }
    if (!isProtectedEndpoint && !isPdf && safeResolvedUrl && !loadFailed) {
      return [{ pageNumber: 1, dataUrl: safeResolvedUrl }];
    }
    return [];
  }, [cleanInlineSvg, fetchedSvg, pdfPages, protectedImgBlobUrl, isProtectedEndpoint, isPdf, safeResolvedUrl, loadFailed]);

  const safePageIdx = Math.min(currentPageIdx, Math.max(0, pages.length - 1));
  const currentPage = pages[safePageIdx] || null;
  const isMultiPage = pages.length > 1;

  // Keyboard navigation when fullscreen modal is open
  useEffect(() => {
    if (!isFullscreenOpen || !isMultiPage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setCurrentPageIdx((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentPageIdx((prev) => Math.min(pages.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreenOpen, isMultiPage, pages.length]);

  const handleDownloadPdf = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadMaterialAsPdf({
        title,
        downloadUrl,
        pdfUrl,
        fileUrl,
        svgUrl,
        svgContent: cleanInlineSvg || fetchedSvg || svgContent,
        fileType
      });
      toast.success('PDF soubor byl připraven ke stažení.');
    } catch (err: any) {
      toast.error(err?.message || 'Nepodařilo se stáhnout PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  const renderPageContent = (page: TheoryPageItem, mode: 'inline' | 'fullscreen') => {
    if (page.dataUrl) {
      return (
        <img
          src={page.dataUrl}
          alt={`${title} — strana ${page.pageNumber}`}
          width={page.width}
          height={page.height}
          className={
            mode === 'fullscreen'
              ? 'max-w-full h-auto mx-auto block rounded-xl shadow-sm bg-white'
              : 'w-full h-auto block bg-white'
          }
        />
      );
    }
    if (page.svgMarkup) {
      return (
        <div
          className={
            mode === 'fullscreen'
              ? 'w-full max-w-4xl mx-auto bg-white rounded-xl shadow-sm p-2 [&>svg]:w-full [&>svg]:h-auto [&>svg]:block'
              : 'w-full bg-white [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-w-full [&>svg]:block'
          }
          dangerouslySetInnerHTML={{ __html: page.svgMarkup }}
        />
      );
    }
    return null;
  };

  return (
    <>
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-gray-100 shadow-xs space-y-4">
        {/* Card Header: 1 Teorie + Stáhnout PDF */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#DCEBFE] text-[#1D4ED8] font-black text-sm flex items-center justify-center shrink-0">
              1
            </div>
            <h2 className="font-sans font-black text-lg sm:text-xl text-[#0F2942]">
              Teorie
            </h2>
          </div>

          {hasVisualMaterial && !isProcessing && !isError && (
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloading || loadingMedia}
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-[#1D4ED8] hover:text-[#1E3A8A] disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isDownloading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Download size={15} />
              )}
              <span>Stáhnout PDF</span>
            </button>
          )}
        </div>

        {/* Body */}
        {isProcessing ? (
          <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-8 text-center space-y-3">
            <div className="w-9 h-9 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <h3 className="font-bold text-base text-amber-950">Studijní materiál se právě připravuje...</h3>
            <p className="text-xs text-amber-800 max-w-sm mx-auto">
              Soubor se dokončuje na serveru a během okamžiku se zde automaticky zobrazí.
            </p>
          </div>
        ) : isError ? (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center space-y-2">
            <AlertTriangle size={24} className="text-rose-600 mx-auto" />
            <h3 className="font-bold text-sm text-rose-900">Materiál se nepodařilo připravit</h3>
            <p className="text-xs text-rose-700">
              {errorMessage || 'Zkuste to prosím později nebo kontaktujte vyučujícího.'}
            </p>
          </div>
        ) : hasVisualMaterial ? (
          loadingMedia ? (
            <div className="w-full py-16 flex flex-col items-center justify-center gap-3 bg-[#F4F7FB] rounded-2xl text-gray-500">
              <Loader2 className="w-7 h-7 animate-spin text-[#2563EB]" />
              <span className="text-xs font-medium">Načítám studijní materiál...</span>
            </div>
          ) : isLocked ? (
            <div className="w-full py-8 px-4 flex flex-col items-center justify-center gap-2 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-center">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-gray-800">Studijní materiál je uzamčen</p>
              <p className="text-xs text-gray-600 max-w-md">
                Pro zobrazení tohoto materiálu je nutné přihlášení s aktivním předplatným ProEdu Premium nebo zapsaným kurzem.
              </p>
            </div>
          ) : currentPage ? (
            <div className="space-y-3.5">
              {/* Soft frame around the sheet */}
              <div
                onClick={() => setIsFullscreenOpen(true)}
                title="Kliknutím zvětšíte na celou obrazovku"
                className="rounded-2xl bg-[#EEF3F9] p-3 sm:p-4 border border-slate-200/70 overflow-hidden cursor-zoom-in transition-shadow hover:shadow-xs"
              >
                <div className="rounded-xl overflow-hidden bg-white shadow-2xs">
                  {renderPageContent(currentPage, 'inline')}
                </div>
              </div>

              {/* Controls Row: Pagination (if multi-page) + Fullscreen button */}
              <div className="flex items-center justify-between gap-2">
                {isMultiPage ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPageIdx((prev) => Math.max(0, prev - 1))}
                      disabled={safePageIdx === 0}
                      aria-label="Předchozí strana"
                      className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:pointer-events-none text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs sm:text-sm font-bold text-[#0F2942] px-1 select-none">
                      Strana {safePageIdx + 1} / {pages.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPageIdx((prev) => Math.min(pages.length - 1, prev + 1))}
                      disabled={safePageIdx === pages.length - 1}
                      aria-label="Další strana"
                      className="w-8 h-8 rounded-full bg-[#DCEBFE] hover:bg-[#B9D8FC] disabled:opacity-40 disabled:pointer-events-none text-[#1D4ED8] flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                ) : (
                  <div />
                )}

                <button
                  type="button"
                  onClick={() => setIsFullscreenOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-700 hover:text-[#0F2942] hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <Maximize2 size={14} />
                  <span>Zvětšit</span>
                </button>
              </div>

              {/* Page Thumbnails (only for multi-page documents) */}
              {isMultiPage && (
                <div className="flex items-center gap-2.5 overflow-x-auto pb-1 pt-0.5">
                  {pages.map((p, idx) => {
                    const active = idx === safePageIdx;
                    return (
                      <button
                        key={p.pageNumber}
                        type="button"
                        onClick={() => setCurrentPageIdx(idx)}
                        aria-label={`Přejít na stranu ${idx + 1}`}
                        className={`w-13 h-17 sm:w-14 sm:h-19 rounded-xl overflow-hidden border-2 bg-white p-0.5 shrink-0 transition-all cursor-pointer ${
                          active
                            ? 'border-[#2563EB] ring-2 ring-blue-500/20 shadow-2xs'
                            : 'border-gray-200 opacity-70 hover:opacity-100 hover:border-gray-300'
                        }`}
                      >
                        {p.dataUrl ? (
                          <img
                            src={p.dataUrl}
                            alt={`Náhled strany ${idx + 1}`}
                            className="w-full h-full object-contain rounded-lg"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-gray-500 bg-gray-50 rounded-lg">
                            {idx + 1}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-6">
              Materiál se nepodařilo načíst k zobrazení.
            </p>
          )
        ) : studyTheory?.trim() ? (
          <div className="space-y-3">
            <div className="text-gray-700 font-medium text-sm sm:text-base leading-relaxed">
              <MathRenderer content={studyTheory} imageMap={theoryImages} />
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setIsFullscreenOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-700 hover:text-[#0F2942] hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <Maximize2 size={14} />
                <span>Zvětšit</span>
              </button>
            </div>
          </div>
        ) : null}

        {showStickyHint && (
          <p className="text-[11px] font-medium text-gray-400 hidden lg:block pt-0.5">
            Teorie zůstává vedle při scrollování kroků.
          </p>
        )}
      </div>

      {/* Fullscreen Modal */}
      <Dialog open={isFullscreenOpen} onOpenChange={setIsFullscreenOpen}>
        <DialogContent className="max-w-5xl w-[95vw] max-h-[92vh] p-0 rounded-3xl overflow-hidden flex flex-col bg-[#F8FAFC] border border-gray-200 shadow-2xl [&>button]:hidden">
          <div className="px-5 py-3.5 bg-white border-b border-gray-100 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-xl bg-[#DCEBFE] text-[#1D4ED8] flex items-center justify-center shrink-0">
                <BookCyanIcon size={16} />
              </div>
              <div className="min-w-0">
                <DialogTitle className="font-black text-sm sm:text-base text-[#0F2942] truncate">
                  {title} — Teorie
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Zvětšený náhled studijního materiálu
                </DialogDescription>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {isMultiPage && (
                <div className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-full">
                  <button
                    type="button"
                    onClick={() => setCurrentPageIdx((prev) => Math.max(0, prev - 1))}
                    disabled={safePageIdx === 0}
                    className="w-7 h-7 rounded-full hover:bg-white disabled:opacity-40 flex items-center justify-center text-gray-700 cursor-pointer"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <span className="text-xs font-bold text-[#0F2942] px-1.5 select-none">
                    Strana {safePageIdx + 1} / {pages.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPageIdx((prev) => Math.min(pages.length - 1, prev + 1))}
                    disabled={safePageIdx === pages.length - 1}
                    className="w-7 h-7 rounded-full hover:bg-white disabled:opacity-40 flex items-center justify-center text-gray-700 cursor-pointer"
                  >
                    <ChevronRight size={15} />
                  </button>
                </div>
              )}

              {hasVisualMaterial && (
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isDownloading}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#DCEBFE] hover:bg-[#B9D8FC] text-[#1D4ED8] font-bold text-xs transition-colors cursor-pointer"
                >
                  {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  <span className="hidden sm:inline">Stáhnout PDF</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsFullscreenOpen(false)}
                aria-label="Zavřít zvětšený náhled"
                className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {currentPage ? (
              renderPageContent(currentPage, 'fullscreen')
            ) : studyTheory?.trim() ? (
              <div className="max-w-3xl mx-auto bg-white rounded-2xl p-6 sm:p-8 shadow-xs text-gray-800 text-base leading-relaxed">
                <MathRenderer content={studyTheory} imageMap={theoryImages} />
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
