import React, { useEffect, useState, useMemo } from 'react';
import {
  Download,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { sanitizeSafeUrl, sanitizeSvg } from '../../utils/svgUtils';
import { useAuth } from '../../context/AuthContext';
import { MathRenderer } from '../common/MathRenderer';
import { BookCyanIcon } from '../common/CustomIcon';
import { toast } from 'sonner';
import { MaterialQuotaSummary } from '../../types';
import {
  authorizeMaterialExport,
  fetchMaterialQuota,
} from '../../services/practiceService';
import {
  exportProtectedMaterialAsPdf,
  extractMaterialIdFromUrls,
  loadMaterialPages,
  MaterialPageItem,
  printWatermarkedPages,
} from '../../utils/materialPages';
import {
  FullscreenMaterialReaderModal,
  ProtectedMaterialCanvas,
} from './ProtectedMaterialCanvas';

export interface TheoryMaterialViewerProps {
  materialId?: string | null;
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

function buildFallbackWatermark(email?: string | null, uid?: string | null): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return `ProEducator • ${email || uid || 'Student'} • ${today}`;
}

export default function TheoryMaterialViewer({
  materialId,
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
  showStickyHint = false,
}: TheoryMaterialViewerProps) {
  const { user, isTeacher, isPremium, isCourseUser } = useAuth();
  const canExport = isTeacher || isPremium || isCourseUser;

  const [pages, setPages] = useState<MaterialPageItem[]>([]);
  const [serverWatermark, setServerWatermark] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [quota, setQuota] = useState<MaterialQuotaSummary | null>(null);

  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const resolvedMaterialId = useMemo(
    () =>
      materialId ||
      extractMaterialIdFromUrls([downloadUrl, fileUrl, pdfUrl, svgUrl]),
    [materialId, downloadUrl, fileUrl, pdfUrl, svgUrl]
  );

  const safeResolvedUrl = useMemo(() => {
    const candidate = pdfUrl || fileUrl || svgUrl || '';
    if (candidate.trim().toLowerCase().startsWith('data:image/svg+xml')) return candidate;
    return sanitizeSafeUrl(candidate);
  }, [pdfUrl, fileUrl, svgUrl]);

  const hasInlineSvg = Boolean(svgContent?.trim() && sanitizeSvg(svgContent));
  const hasVisualMaterial = Boolean(hasInlineSvg || safeResolvedUrl);

  const effectiveWatermark = useMemo(() => {
    if (isTeacher) return null;
    if (serverWatermark) return serverWatermark;
    return buildFallbackWatermark(user?.email, user?.uid);
  }, [isTeacher, serverWatermark, user?.email, user?.uid]);

  useEffect(() => {
    if (!user?.uid || isTeacher || (!isPremium && !isCourseUser)) {
      setQuota(null);
      return;
    }
    let cancelled = false;
    fetchMaterialQuota()
      .then((res) => {
        if (!cancelled) setQuota(res.quota);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.uid, isTeacher, isPremium, isCourseUser]);

  useEffect(() => {
    setCurrentPageIdx(0);
    if (!hasVisualMaterial) {
      setPages([]);
      setServerWatermark(null);
      setLoadingMedia(false);
      setIsLocked(false);
      setLoadFailed(false);
      return;
    }

    const controller = new AbortController();
    setLoadingMedia(true);
    setPages([]);
    setServerWatermark(null);
    setIsLocked(false);
    setLoadFailed(false);

    loadMaterialPages({
      fileUrl,
      pdfUrl,
      svgUrl,
      svgContent,
      fileType,
      originalName,
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setPages(result.pages);
        setServerWatermark(result.watermarkText);
        setIsLocked(result.isLocked);
      })
      .catch((err: any) => {
        if (controller.signal.aborted || err?.name === 'AbortError') return;
        console.warn('Nepodařilo se načíst studijní materiál:', err);
        setLoadFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingMedia(false);
      });

    return () => {
      controller.abort();
    };
  }, [hasVisualMaterial, fileUrl, pdfUrl, svgUrl, svgContent, fileType, originalName]);

  const safePageIdx = Math.min(currentPageIdx, Math.max(0, pages.length - 1));
  const currentPage = pages[safePageIdx] || null;
  const isMultiPage = pages.length > 1;

  const isAlreadyUnlocked = Boolean(
    resolvedMaterialId && quota?.unlockedMaterialIds?.includes(resolvedMaterialId)
  );
  const isCourseExempt = Boolean(
    resolvedMaterialId && quota?.courseExemptMaterialIds?.includes(resolvedMaterialId)
  );

  const handleDownloadPdf = async () => {
    if (isDownloading || isPrinting) return;
    setIsDownloading(true);
    try {
      const res = await exportProtectedMaterialAsPdf({
        materialId: resolvedMaterialId,
        title,
        downloadUrl,
        pdfUrl,
        fileUrl,
        svgUrl,
        svgContent,
        fileType,
        originalName,
        preloadedPages: pages,
        isTeacher,
      });
      if (res.quota) {
        setQuota(res.quota);
      }
      toast.success('PDF soubor byl připraven ke stažení.');
    } catch (err: any) {
      if (err?.quota) setQuota(err.quota);
      toast.error(err?.message || 'Nepodařilo se stáhnout PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = async () => {
    if (isPrinting || isDownloading || pages.length === 0) return;
    setIsPrinting(true);
    try {
      let watermarkForPrint = effectiveWatermark;
      if (resolvedMaterialId) {
        const authRes = await authorizeMaterialExport(resolvedMaterialId);
        if (authRes.quota) setQuota(authRes.quota);
        watermarkForPrint = authRes.watermarkText;
      }
      await printWatermarkedPages(title, pages, watermarkForPrint);
    } catch (err: any) {
      if (err?.quota) setQuota(err.quota);
      toast.error(err?.message || 'Nepodařilo se připravit materiál k tisku.');
    } finally {
      setIsPrinting(false);
    }
  };

  const quotaHintText = useMemo(() => {
    if (isTeacher || !quota || quota.unlimited || quota.limit <= 0) return null;
    if (isCourseExempt) return 'Součást kurzu · stažení bez odečtu';
    if (isAlreadyUnlocked) return 'Tento list už máš odemčený · bez odečtu';
    return `Zbývá ${quota.remaining} z ${quota.limit} stažení / tisků`;
  }, [isTeacher, quota, isCourseExempt, isAlreadyUnlocked]);

  return (
    <>
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-gray-100 shadow-xs space-y-4">
        {/* Card Header: 1 Teorie + Stáhnout PDF */}
        <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#DCEBFE] text-[#1D4ED8] font-black text-sm flex items-center justify-center shrink-0">
              1
            </div>
            <h2 className="font-sans font-black text-lg sm:text-xl text-[#0F2942]">
              Teorie
            </h2>
          </div>

          {hasVisualMaterial && !isProcessing && !isError && canExport && !isLocked && (
            <div className="text-right">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isDownloading || isPrinting || loadingMedia}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#EEF4FF] hover:bg-[#DCEBFE] text-xs sm:text-sm font-bold text-[#1D4ED8] hover:text-[#1E3A8A] disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isDownloading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Download size={15} />
                )}
                <span>Stáhnout PDF</span>
              </button>
              {quotaHintText && (
                <p className="text-[10px] font-semibold text-gray-400 leading-tight mt-0.5">
                  {quotaHintText}
                </p>
              )}
            </div>
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
              {/* Soft frame around the protected canvas sheet */}
              <div
                onClick={() => setIsFullscreenOpen(true)}
                onContextMenu={(e) => e.preventDefault()}
                title="Kliknutím zvětšíte na celou obrazovku"
                className="rounded-2xl bg-[#EEF3F9] p-3 sm:p-4 border border-slate-200/70 overflow-hidden cursor-zoom-in transition-shadow hover:shadow-xs"
              >
                <ProtectedMaterialCanvas
                  page={currentPage}
                  watermarkText={effectiveWatermark}
                  maxCssWidth={520}
                />
              </div>

              {/* Controls Row: Pagination + Fullscreen button */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {isMultiPage ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCurrentPageIdx((prev) => Math.max(0, prev - 1))}
                      disabled={safePageIdx === 0}
                      aria-label="Předchozí strana"
                      className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:pointer-events-none text-gray-700 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <span className="text-xs sm:text-sm font-bold text-[#0F2942] px-1 select-none">
                      Strana {safePageIdx + 1} / {pages.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPageIdx((prev) => Math.min(pages.length - 1, prev + 1))}
                      disabled={safePageIdx === pages.length - 1}
                      aria-label="Další strana"
                      className="w-9 h-9 rounded-full bg-[#DCEBFE] hover:bg-[#B9D8FC] disabled:opacity-40 disabled:pointer-events-none text-[#1D4ED8] flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <ChevronRight size={18} />
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

              {/* Page Thumbnails */}
              {isMultiPage && (
                <div className="flex items-center gap-2.5 overflow-x-auto pb-1 pt-0.5">
                  {pages.map((p, idx) => {
                    const active = idx === safePageIdx;
                    return (
                      <button
                        key={p.pageNumber}
                        type="button"
                        onClick={() => setCurrentPageIdx(idx)}
                        onContextMenu={(e) => e.preventDefault()}
                        aria-label={`Přejít na stranu ${idx + 1}`}
                        className={`w-13 h-17 sm:w-14 sm:h-19 rounded-xl overflow-hidden border-2 bg-white p-0.5 shrink-0 transition-all cursor-pointer select-none ${
                          active
                            ? 'border-[#2563EB] ring-2 ring-blue-500/20 shadow-2xs'
                            : 'border-gray-200 opacity-70 hover:opacity-100 hover:border-gray-300'
                        }`}
                      >
                        {p.dataUrl ? (
                          <img
                            src={p.dataUrl}
                            alt={`Náhled strany ${idx + 1}`}
                            draggable={false}
                            className="w-full h-full object-contain rounded-lg pointer-events-none"
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
              {loadFailed ? 'Materiál se nepodařilo načíst k zobrazení.' : 'Materiál nemá žádné zobrazitelné stránky.'}
            </p>
          )
        ) : studyTheory?.trim() ? (
          <div className="space-y-3">
            <div className="text-gray-700 font-medium text-sm sm:text-base leading-relaxed overflow-x-auto max-w-full">
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

      <FullscreenMaterialReaderModal
        isOpen={isFullscreenOpen}
        onClose={() => setIsFullscreenOpen(false)}
        title={`${title} — Teorie`}
        pages={pages}
        currentPageIdx={safePageIdx}
        onPageChange={setCurrentPageIdx}
        watermarkText={effectiveWatermark}
        canExport={canExport && !isLocked}
        isAlreadyUnlocked={isAlreadyUnlocked}
        isCourseExempt={isCourseExempt}
        quota={quota}
        onDownloadPdf={handleDownloadPdf}
        onPrint={handlePrint}
        isDownloading={isDownloading}
        isPrinting={isPrinting}
        studyTheory={studyTheory}
        theoryImages={theoryImages}
      />
    </>
  );
}
