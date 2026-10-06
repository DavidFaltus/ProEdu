import React, { useState, useRef } from 'react';
import { 
  Upload, FileText, CheckCircle2, Trash2, Eye, AlertCircle, 
  Sparkles, RefreshCw, ZoomIn, X 
} from 'lucide-react';
import { Button } from '../ui/button';
import { convertFileToSvg, ConvertedSvgResult } from '../../utils/pdfToSvg';
import { toast } from 'sonner';

interface PdfSvgDropzoneProps {
  valueSvgString?: string;
  valueSvgUrl?: string;
  fileName?: string;
  onChange: (result: { svgString: string; fileName: string; thumbnail?: string } | null) => void;
  className?: string;
}

export default function PdfSvgDropzone({
  valueSvgString,
  valueSvgUrl,
  fileName,
  onChange,
  className = ''
}: PdfSvgDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasContent = Boolean(valueSvgString || valueSvgUrl);

  const processFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const validExts = ['pdf', 'svg', 'png', 'jpg', 'jpeg', 'webp'];
    if (!ext || !validExts.includes(ext)) {
      toast.error('Nahrajte prosím soubor PDF, SVG nebo obrázek (PNG, JPG, WebP).');
      return;
    }

    // Limit to 20MB for conversion
    if (file.size > 20 * 1024 * 1024) {
      toast.error('Soubor je příliš velký (max 20 MB).');
      return;
    }

    setIsConverting(true);
    setProgressMsg('Zahajuji převod souboru...');

    try {
      const res: ConvertedSvgResult = await convertFileToSvg(file, (msg) => {
        setProgressMsg(msg);
      });

      onChange({
        svgString: res.svgString,
        fileName: file.name,
        thumbnail: res.thumbnailDataUrl
      });

      toast.success(
        ext === 'pdf' 
          ? `PDF úspěšně převedeno na SVG (${res.pageCount} ${res.pageCount === 1 ? 'strana' : 'strany'})!`
          : ext === 'svg'
            ? 'SVG soubor úspěšně načten!'
            : 'Obrázek byl úspěšně převeden do SVG!'
      );
    } catch (err: any) {
      console.error('Conversion failed:', err);
      toast.error('Chyba při převodu: ' + (err.message || 'Neznámá chyba'));
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
    toast.info('Grafický list odebrán.');
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

      {isConverting ? (
        <div className="border-2 border-dashed border-amber-300 bg-amber-50/70 rounded-2xl p-6 text-center space-y-3 animate-pulse">
          <div className="w-10 h-10 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="space-y-1">
            <p className="font-bold text-sm text-amber-900">Převádím soubor na vektorové SVG...</p>
            <p className="text-xs text-amber-700 font-medium">{progressMsg || 'Zpracovávám a optimalizuji...'}</p>
          </div>
        </div>
      ) : hasContent ? (
        /* Preview when file is loaded */
        <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 transition-all">
          <div className="flex items-center gap-3.5 min-w-0 w-full sm:w-auto">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 shadow-sm">
              <FileText size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-gray-900 truncate">
                  {fileName || (valueSvgUrl ? 'Přiřazený SVG list' : 'Vložený SVG materiál')}
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-200/80 text-emerald-900 px-2 py-0.5 rounded-md shrink-0">
                  Připraveno
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium truncate mt-0.5">
                {valueSvgString ? 'SVG vektor uložen přímo v databázi' : `Odkaz: ${valueSvgUrl}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
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
              title="Odebrat materiál"
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
              {isDragging ? 'Pusťte soubor sem...' : 'Přetáhněte sem soubor PDF nebo SVG'}
            </p>
            <p className="text-xs text-gray-400 font-medium">
              nebo klikněte pro výběr z počítače (automatický převod PDF do SVG)
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 mt-3">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-md">
              .PDF
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-md">
              .SVG
            </span>
            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
              <Sparkles size={11} /> Ukládá se do databáze
            </span>
          </div>
        </div>
      )}

      {/* SVG Preview Modal */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-emerald-600" />
                <h4 className="font-bold text-gray-900 text-base truncate">
                  Náhled grafického listu ({fileName || 'SVG'})
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
                  dangerouslySetInnerHTML={{ __html: valueSvgString }}
                />
              ) : valueSvgUrl ? (
                <img 
                  src={valueSvgUrl} 
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
