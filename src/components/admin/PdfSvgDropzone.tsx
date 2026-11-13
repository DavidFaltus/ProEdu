import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, CheckCircle2, Trash2, Eye, AlertCircle, 
  Sparkles, RefreshCw, ZoomIn, X 
} from 'lucide-react';
import { Button } from '../ui/button';
import { convertFileToSvg, svgStringToDataUrl, isPdfResource, sanitizeSvg } from '../../utils/pdfToSvg';
import { toast } from 'sonner';
import { MaterialYellowIcon, StarYellowIcon } from '../common/CustomIcon';

export interface DropzoneFileResult {
  fileName: string;
  fileData?: string;
  fileType?: string;
  thumbnail?: string;
  thumbnailDataUrl?: string;
  svgString?: string;
  svgUrl?: string;
  pdfUrl?: string;
}

interface PdfSvgDropzoneProps {
  valueSvgString?: string;
  valueSvgUrl?: string;
  valueFileUrl?: string;
  valueFileType?: string;
  valueThumbnailUrl?: string;
  fileName?: string;
  userId?: string;
  isProcessing?: boolean;
  processingMessage?: string;
  onChange: (result: DropzoneFileResult | null) => void;
  className?: string;
}

export default function PdfSvgDropzone({
  valueSvgString,
  valueSvgUrl,
  valueFileUrl,
  valueFileType,
  valueThumbnailUrl,
  fileName,
  userId,
  isProcessing = false,
  processingMessage,
  onChange,
  className = ''
}: PdfSvgDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveFileUrl = valueFileUrl || valueSvgUrl || '';
  const isPdfPreview = isPdfResource({
    fileType: valueFileType,
    fileUrl: effectiveFileUrl,
    svgUrl: valueSvgUrl,
    originalName: fileName,
    svgContent: valueSvgString
  });

  const hasContent = Boolean(fileName || valueSvgString || valueSvgUrl || valueFileUrl || valueThumbnailUrl);

  const processFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const validExts = ['pdf', 'svg', 'png', 'jpg', 'jpeg', 'webp'];
    if (!ext || !validExts.includes(ext)) {
      toast.error('Nahrajte prosím soubor PDF, SVG nebo obrázek (PNG, JPG, WebP).');
      return;
    }

    if (file.size > 40 * 1024 * 1024) {
      toast.error('Soubor je příliš velký (max 40 MB).');
      return;
    }

    setIsConverting(true);
    setProgressMsg('Převádím soubor do SVG a generuji náhled...');

    try {
      const converted = await convertFileToSvg(file, (msg) => setProgressMsg(msg));
      const fileData = svgStringToDataUrl(converted.svgString);

      onChange({
        fileData,
        fileName: file.name,
        fileType: 'image/svg+xml',
        thumbnail: converted.thumbnailDataUrl,
        thumbnailDataUrl: converted.thumbnailDataUrl,
        svgString: converted.svgString
      });

      toast.success(
        ext === 'pdf'
          ? `PDF „${file.name}“ bylo převedeno na SVG (${converted.pageCount} ${converted.pageCount === 1 ? 'strana' : converted.pageCount < 5 ? 'strany' : 'stran'}) a je připraveno!`
          : ext === 'svg'
            ? `SVG soubor „${file.name}“ je připraven!`
            : `Obrázek „${file.name}“ byl převeden na SVG a je připraven!`
      );
    } catch (err: any) {
      console.error('File processing error:', err);
      toast.error('Chyba při převodu souboru do SVG: ' + (err.message || 'Neznámá chyba'));
    } finally {
      setIsConverting(false);
      setProgressMsg('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    toast.info('Soubor odebrán.');
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.svg,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      {isConverting || isProcessing ? (
        <div className="border-2 border-dashed border-amber-300 bg-amber-50/70 rounded-2xl p-6 text-center space-y-3 animate-pulse">
          <div className="w-10 h-10 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="space-y-1">
            <p className="font-bold text-sm text-amber-900">
              {isProcessing ? 'Materiál se připravuje...' : 'Připravuji soubor...'}
            </p>
            <p className="text-xs text-amber-700 font-medium">
              {isProcessing
                ? (processingMessage || 'Soubor se ukládá a připravuje pro studenty na pozadí.')
                : (progressMsg || 'Generuji náhled...')}
            </p>
          </div>
        </div>
      ) : hasContent ? (
        /* Preview when file is loaded */
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all">
          <div className="flex items-center gap-3.5 min-w-0 w-full sm:w-auto">
            {valueThumbnailUrl ? (
              <img 
                src={valueThumbnailUrl} 
                alt="Miniatura" 
                className="w-12 h-12 rounded-xl object-cover border border-emerald-200 shrink-0 bg-white shadow-xs" 
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 shadow-sm">
                <MaterialYellowIcon size={26} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-gray-900 truncate">
                  {fileName || (effectiveFileUrl ? 'Přiřazený soubor' : 'Vybraný materiál')}
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded-md shrink-0">
                  Připraveno
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium truncate mt-0.5">
                Soubor bude bezpečně uložen a zpracován na pozadí
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {(valueSvgString || valueThumbnailUrl || effectiveFileUrl) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreviewOpen(true)}
                className="rounded-xl h-9 px-3 text-xs font-bold border-gray-300 hover:border-black flex items-center gap-1.5 cursor-pointer bg-white"
              >
                <Eye size={14} />
                <span>Náhled</span>
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl h-9 px-3 text-xs font-bold border-gray-300 hover:border-black flex items-center gap-1.5 cursor-pointer bg-white"
            >
              <RefreshCw size={14} />
              <span>Změnit</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              className="rounded-xl h-9 w-9 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
              title="Odebrat soubor"
            >
              <Trash2 size={16} />
            </Button>
          </div>
        </div>
      ) : (
        /* Empty Dropzone */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
            isDragging 
              ? 'border-emerald-500 bg-emerald-50/80 scale-[1.01]' 
              : 'border-gray-200 hover:border-gray-400 bg-gray-50/60 hover:bg-gray-50'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-600 group-hover:scale-110 transition-transform">
            <Upload size={22} className={isDragging ? 'text-emerald-600' : 'text-gray-500'} />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold text-gray-800">
              {isDragging ? 'Pusťte soubor sem...' : 'Přetáhněte sem soubor PDF, SVG nebo obrázek'}
            </p>
            <p className="text-xs text-gray-400 font-medium">
              nebo klikněte pro výběr z počítače (automatický převod PDF a obrázků do SVG)
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 mt-3">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-md">
              .PDF
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-md">
              .SVG
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-md">
              .PNG / .JPG
            </span>
            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
              <StarYellowIcon size={12} /> Převod do SVG na pozadí
            </span>
          </div>
        </div>
      )}

      {/* Preview Modal inside Dropzone */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <MaterialYellowIcon size={20} />
                <h4 className="font-bold text-gray-900 text-base truncate">
                  Náhled vybraného souboru ({fileName || 'Soubor'})
                </h4>
              </div>
              <button
                onClick={() => setPreviewOpen(false)}
                className="p-1.5 rounded-xl text-gray-400 hover:text-black hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-slate-50 flex items-center justify-center min-h-[300px]">
              {valueSvgString ? (
                <div 
                  className="max-w-full bg-white shadow-md rounded-xl overflow-hidden p-2"
                  dangerouslySetInnerHTML={{ __html: sanitizeSvg(valueSvgString) }}
                />
              ) : isPdfPreview && effectiveFileUrl ? (
                <iframe
                  src={effectiveFileUrl.startsWith('data:') ? effectiveFileUrl : `${effectiveFileUrl}#toolbar=1`}
                  className="w-full h-[65vh] min-h-[420px] rounded-xl border border-gray-200 bg-white shadow-md"
                  title={fileName || 'Náhled PDF'}
                />
              ) : effectiveFileUrl ? (
                <img 
                  src={effectiveFileUrl} 
                  alt="Náhled" 
                  className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-md bg-white p-2" 
                />
              ) : valueThumbnailUrl ? (
                <img 
                  src={valueThumbnailUrl} 
                  alt="Náhled" 
                  className="max-w-full max-h-[70vh] object-contain rounded-xl shadow-md bg-white p-2" 
                />
              ) : null}
            </div>

            <div className="px-6 py-3 bg-white border-t border-gray-100 flex justify-end">
              <Button
                variant="outline"
                onClick={() => setPreviewOpen(false)}
                className="rounded-xl font-bold text-xs"
              >
                Zavřít
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
