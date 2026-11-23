import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Lock,
  Maximize2,
  MoveHorizontal,
  MoveVertical,
  Printer,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { MaterialQuotaSummary } from '../../types';
import { drawPageToCanvas, MaterialPageItem } from '../../utils/materialPages';
import { MathRenderer } from '../common/MathRenderer';
import { cn } from '../../lib/utils';

type ReaderFitMode = 'height' | 'width';

interface ProtectedMaterialCanvasProps {
  page: MaterialPageItem;
  watermarkText?: string | null;
  zoom?: number;
  maxCssWidth?: number;
  fitMode?: ReaderFitMode;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
}

export function ProtectedMaterialCanvas({
  page,
  watermarkText,
  zoom = 1,
  maxCssWidth,
  fitMode = 'width',
  onClick,
  className,
  ariaLabel,
}: ProtectedMaterialCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !page) return;
    let cancelled = false;
    setRendering(true);

    drawPageToCanvas(canvas, page, watermarkText, { maxCssWidth, fitMode })
      .catch((err) => {
        console.warn('[ProtectedMaterialCanvas] Render error:', err);
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, watermarkText, maxCssWidth, fitMode]);

  const canvasDynamicStyle: React.CSSProperties | undefined = (() => {
    if (fitMode === 'height') {
      if (zoom === 1) return undefined;
      return {
        height: `${Math.round(zoom * 90)}dvh`,
        width: 'auto',
        maxWidth: 'none',
        maxHeight: 'none',
      };
    }
    if (maxCssWidth) {
      return zoom !== 1 ? { transform: `scale(${zoom})`, transformOrigin: 'top center' } : undefined;
    }
    return {
      width: `${Math.round(zoom * 100)}%`,
      maxWidth: zoom === 1 ? '100%' : 'none',
      height: 'auto',
    };
  })();

  return (
    <div
      className={cn('relative select-none', className)}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <div className="protected-material-viewer flex items-center justify-center">
        <canvas
          ref={canvasRef}
          draggable={false}
          onContextMenu={(e) => e.preventDefault()}
          style={canvasDynamicStyle}
          className={cn(
            'block mx-auto bg-white rounded-xl shadow-sm pointer-events-none select-none',
            fitMode === 'height' &&
              zoom === 1 &&
              'max-h-[calc(100dvh-7.5rem)] lg:max-h-[calc(100dvh-3.25rem)] w-auto max-w-full h-auto'
          )}
        />
      </div>

      <div className="protected-material-print-notice items-center justify-center p-8 border border-dashed border-gray-300 rounded-xl bg-white text-center text-sm font-bold text-gray-600">
        Pro vytištění studijního materiálu prosím použijte tlačítko „Vytisknout“ přímo ve čtečce.
      </div>

      {rendering && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/40 pointer-events-none rounded-xl">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        </div>
      )}
    </div>
  );
}

interface FullscreenMaterialReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  pages: MaterialPageItem[];
  currentPageIdx: number;
  onPageChange: (idx: number) => void;
  watermarkText?: string | null;
  canExport: boolean;
  isAlreadyUnlocked?: boolean;
  isCourseExempt?: boolean;
  quota?: MaterialQuotaSummary | null;
  onDownloadPdf?: () => Promise<void> | void;
  onPrint?: () => Promise<void> | void;
  onRequestUpgrade?: () => void;
  isDownloading?: boolean;
  isPrinting?: boolean;
  studyTheory?: string | null;
  theoryImages?: Record<string, string>;
}

export function FullscreenMaterialReaderModal({
  isOpen,
  onClose,
  title,
  subtitle,
  pages,
  currentPageIdx,
  onPageChange,
  watermarkText,
  canExport,
  isAlreadyUnlocked = false,
  isCourseExempt = false,
  quota,
  onDownloadPdf,
  onPrint,
  onRequestUpgrade,
  isDownloading = false,
  isPrinting = false,
  studyTheory,
  theoryImages,
}: FullscreenMaterialReaderModalProps) {
  const [fitMode, setFitMode] = useState<ReaderFitMode>('height');
  const [zoom, setZoom] = useState(1);
  const safePageIdx = Math.min(currentPageIdx, Math.max(0, pages.length - 1));
  const currentPage = pages[safePageIdx] || null;
  const isMultiPage = pages.length > 1;

  useEffect(() => {
    if (isOpen) {
      setFitMode('height');
      setZoom(1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !isMultiPage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        onPageChange(Math.max(0, safePageIdx - 1));
      } else if (e.key === 'ArrowRight') {
        onPageChange(Math.min(pages.length - 1, safePageIdx + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isMultiPage, safePageIdx, pages.length, onPageChange]);

  const quotaBadgeLabel = (() => {
    if (!canExport) return 'Pouze online čtení (ukázka zdarma)';
    if (quota?.unlimited) return 'Učitelský přístup · Bez limitu';
    if (isCourseExempt) return 'Součást kurzu · Bez odečtu';
    if (isAlreadyUnlocked) return 'Již odemčeno · Bez odečtu';
    if (quota && quota.limit > 0) {
      return `Zbývá ${quota.remaining} z ${quota.limit} stažení / tisků`;
    }
    return null;
  })();

  const handleToggleFitMode = (nextMode: ReaderFitMode) => {
    setFitMode(nextMode);
    setZoom(1);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-2rem)] h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] p-0 rounded-2xl sm:rounded-3xl overflow-hidden flex flex-col lg:flex-row bg-[#E8EEF5] border border-gray-200 shadow-2xl"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          {subtitle || 'Celoobrazovková zabezpečená čtečka výukového materiálu'}
        </DialogDescription>

        {/* Mobile Compact Top Bar (< lg) */}
        <div className="lg:hidden px-3 py-2 bg-white border-b border-gray-200 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <p className="font-black text-xs text-[#0F2942] truncate">{title}</p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isMultiPage && (
              <div className="flex items-center gap-0.5 bg-gray-100 px-1.5 py-0.5 rounded-full">
                <button
                  type="button"
                  onClick={() => onPageChange(Math.max(0, safePageIdx - 1))}
                  disabled={safePageIdx === 0}
                  aria-label="Předchozí strana"
                  className="w-6 h-6 rounded-full hover:bg-white disabled:opacity-40 flex items-center justify-center text-gray-700 cursor-pointer"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[11px] font-bold text-[#0F2942] px-1 select-none">
                  {safePageIdx + 1}/{pages.length}
                </span>
                <button
                  type="button"
                  onClick={() => onPageChange(Math.min(pages.length - 1, safePageIdx + 1))}
                  disabled={safePageIdx === pages.length - 1}
                  aria-label="Další strana"
                  className="w-6 h-6 rounded-full hover:bg-white disabled:opacity-40 flex items-center justify-center text-gray-700 cursor-pointer"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            {pages.length > 0 && canExport && (
              <>
                {onPrint && (
                  <button
                    type="button"
                    onClick={onPrint}
                    disabled={isPrinting || isDownloading}
                    aria-label="Vytisknout"
                    className="w-8 h-8 rounded-xl border border-gray-200 bg-white text-gray-700 flex items-center justify-center cursor-pointer"
                  >
                    {isPrinting ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                  </button>
                )}
                {onDownloadPdf && (
                  <button
                    type="button"
                    onClick={onDownloadPdf}
                    disabled={isDownloading || isPrinting}
                    aria-label="Stáhnout PDF"
                    className="w-8 h-8 rounded-xl bg-[#F7C948] text-[#1E1B18] border border-amber-300/80 flex items-center justify-center cursor-pointer"
                  >
                    {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Zavřít čtečku"
              className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center justify-center cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Main Sheet Viewport (Full height on desktop — no top or bottom chrome) */}
        <div className="relative flex-1 min-w-0 min-h-0 h-full bg-[#E8EEF5]">
          {/* Floating Left/Right Page Arrows for Multi-page Docs */}
          {isMultiPage && (
            <>
              <button
                type="button"
                onClick={() => onPageChange(Math.max(0, safePageIdx - 1))}
                disabled={safePageIdx === 0}
                aria-label="Předchozí strana"
                className="hidden lg:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/90 hover:bg-white disabled:opacity-30 disabled:pointer-events-none text-[#0F2942] shadow-md border border-gray-200/80 items-center justify-center transition-all cursor-pointer"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={() => onPageChange(Math.min(pages.length - 1, safePageIdx + 1))}
                disabled={safePageIdx === pages.length - 1}
                aria-label="Další strana"
                className="hidden lg:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/90 hover:bg-white disabled:opacity-30 disabled:pointer-events-none text-[#0F2942] shadow-md border border-gray-200/80 items-center justify-center transition-all cursor-pointer"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          <div
            className="w-full h-full overflow-auto flex items-center justify-center p-2 sm:p-3"
            onContextMenu={(e) => e.preventDefault()}
          >
            {currentPage ? (
              <div className="m-auto flex items-center justify-center max-w-full">
                <ProtectedMaterialCanvas
                  page={currentPage}
                  watermarkText={watermarkText}
                  zoom={zoom}
                  fitMode={fitMode}
                />
              </div>
            ) : studyTheory?.trim() ? (
              <div className="max-w-3xl mx-auto bg-white rounded-2xl p-6 sm:p-8 shadow-xs text-gray-800 text-base leading-relaxed my-auto">
                <MathRenderer content={studyTheory} imageMap={theoryImages} />
              </div>
            ) : null}
          </div>
        </div>

        {/* Desktop Right Control Sidebar (~235 px) */}
        <aside className="hidden lg:flex lg:w-[235px] shrink-0 flex-col bg-white border-l border-gray-200/90 p-3.5 justify-between gap-3 h-full">
          {/* Top: Close + Title */}
          <div className="space-y-3 shrink-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-black text-sm text-[#0F2942] leading-snug line-clamp-2">
                  {title}
                </h3>
                {subtitle && (
                  <p className="text-[11px] font-medium text-gray-400 truncate mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Zavřít čtečku"
                className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Pagination Pill */}
            {isMultiPage && (
              <div className="flex items-center justify-between bg-gray-100/90 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => onPageChange(Math.max(0, safePageIdx - 1))}
                  disabled={safePageIdx === 0}
                  aria-label="Předchozí strana"
                  className="w-7 h-7 rounded-lg hover:bg-white disabled:opacity-40 flex items-center justify-center text-gray-700 cursor-pointer"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="text-xs font-bold text-[#0F2942] select-none">
                  Strana {safePageIdx + 1} / {pages.length}
                </span>
                <button
                  type="button"
                  onClick={() => onPageChange(Math.min(pages.length - 1, safePageIdx + 1))}
                  disabled={safePageIdx === pages.length - 1}
                  aria-label="Další strana"
                  className="w-7 h-7 rounded-lg hover:bg-white disabled:opacity-40 flex items-center justify-center text-gray-700 cursor-pointer"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}

            {/* Fit Mode Toggle + Step Zoom */}
            {currentPage && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-1 bg-gray-100/90 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => handleToggleFitMode('height')}
                    className={cn(
                      'flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer',
                      fitMode === 'height'
                        ? 'bg-white text-[#0F2942] shadow-2xs'
                        : 'text-gray-500 hover:text-gray-800'
                    )}
                    title="Přizpůsobit celou stranu na výšku"
                  >
                    <MoveVertical size={12} />
                    <span>Na výšku</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleFitMode('width')}
                    className={cn(
                      'flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer',
                      fitMode === 'width'
                        ? 'bg-white text-[#0F2942] shadow-2xs'
                        : 'text-gray-500 hover:text-gray-800'
                    )}
                    title="Přizpůsobit šířku strany"
                  >
                    <MoveHorizontal size={12} />
                    <span>Na šířku</span>
                  </button>
                </div>

                <div className="flex items-center justify-between bg-gray-100/90 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
                    disabled={zoom <= 0.75}
                    className="w-7 h-7 rounded-lg hover:bg-white disabled:opacity-40 flex items-center justify-center text-gray-700 cursor-pointer"
                    title="Oddálit"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom(1)}
                    className="text-[11px] font-bold text-[#0F2942] px-2 py-1 rounded-md hover:bg-white/70 cursor-pointer"
                    title="Obnovit 100 %"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom((z) => Math.min(2, Number((z + 0.25).toFixed(2))))}
                    disabled={zoom >= 2}
                    className="w-7 h-7 rounded-lg hover:bg-white disabled:opacity-40 flex items-center justify-center text-gray-700 cursor-pointer"
                    title="Přiblížit"
                  >
                    <ZoomIn size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Middle: Vertical Page Thumbnails */}
          {isMultiPage ? (
            <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 space-y-2 py-1">
              <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 px-0.5">
                Stránky
              </p>
              <div className="grid grid-cols-2 gap-2">
                {pages.map((p, idx) => {
                  const active = idx === safePageIdx;
                  return (
                    <button
                      key={p.pageNumber}
                      type="button"
                      onClick={() => onPageChange(idx)}
                      aria-label={`Strana ${idx + 1}`}
                      onContextMenu={(e) => e.preventDefault()}
                      className={cn(
                        'relative rounded-xl overflow-hidden border-2 bg-white p-0.5 transition-all cursor-pointer select-none aspect-[3/4] flex items-center justify-center',
                        active
                          ? 'border-[#1D4ED8] ring-2 ring-blue-500/20 shadow-xs'
                          : 'border-gray-200 opacity-75 hover:opacity-100'
                      )}
                    >
                      {p.dataUrl ? (
                        <img
                          src={p.dataUrl}
                          alt={`Strana ${idx + 1}`}
                          draggable={false}
                          className="w-full h-full object-contain pointer-events-none rounded-md"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-600 bg-gray-50 rounded-md">
                          {idx + 1}
                        </div>
                      )}
                      <span
                        className={cn(
                          'absolute bottom-1 right-1 text-[9px] font-black px-1.5 py-0.5 rounded-md',
                          active ? 'bg-[#1D4ED8] text-white' : 'bg-black/60 text-white'
                        )}
                      >
                        {idx + 1}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center px-2">
              <div className="space-y-1.5 text-gray-400">
                <Maximize2 size={20} className="mx-auto text-gray-300" />
                <p className="text-[11px] font-medium">
                  Přepínej mezi výškou a šířkou pro pohodlné čtení.
                </p>
              </div>
            </div>
          )}

          {/* Bottom: Export & Print Actions + Quota */}
          <div className="pt-3 border-t border-gray-100 space-y-2 shrink-0">
            {pages.length > 0 && (
              canExport ? (
                <>
                  {onDownloadPdf && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={onDownloadPdf}
                      disabled={isDownloading || isPrinting}
                      className="w-full rounded-xl h-9 text-xs font-black bg-[#F7C948] hover:bg-[#F1BE32] text-[#1E1B18] border border-amber-300/80 flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      {isDownloading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      <span>Stáhnout PDF</span>
                    </Button>
                  )}

                  {onPrint && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onPrint}
                      disabled={isPrinting || isDownloading}
                      className="w-full rounded-xl h-9 text-xs font-bold border-gray-200 hover:border-gray-400 bg-white flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isPrinting ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Printer size={14} />
                      )}
                      <span>Vytisknout</span>
                    </Button>
                  )}
                </>
              ) : (
                onRequestUpgrade && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={onRequestUpgrade}
                    className="w-full rounded-xl h-9 text-xs font-black bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] border border-blue-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Lock size={13} />
                    <span>Tisk a PDF s Premium</span>
                  </Button>
                )
              )
            )}

            {quotaBadgeLabel && (
              <p className="text-[10px] font-semibold text-gray-400 text-center leading-snug pt-0.5">
                {quotaBadgeLabel}
              </p>
            )}
          </div>
        </aside>
      </DialogContent>
    </Dialog>
  );
}
