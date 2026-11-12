import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { submitBugReport } from '../../services/bugReportService';
import { BugReportCategory } from '../../types/bugReport';
import { 
  Bug, 
  X, 
  Send, 
  Upload, 
  Image as ImageIcon, 
  AlertCircle, 
  HelpCircle, 
  Cpu, 
  Type, 
  Lightbulb, 
  MoreHorizontal, 
  Trash2, 
  CheckCircle2,
  Monitor
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: { id: BugReportCategory; label: string; icon: any; desc: string }[] = [
  { id: 'question', label: 'Chyba v otázce', icon: HelpCircle, desc: 'Špatná správná odpověď, překlep v zadání či vzorci' },
  { id: 'technical', label: 'Technická chyba', icon: Cpu, desc: 'Aplikace se sekla, tlačítko nereaguje, chybová hláška' },
  { id: 'visual', label: 'Vzhled a text', icon: Type, desc: 'Rozbité rozvržení, chybějící obrázek, překlepy' },
  { id: 'improvement', label: 'Nápad / návrh', icon: Lightbulb, desc: 'Co by se dalo v aplikaci vylepšit nebo přidat' },
  { id: 'other', label: 'Jiné', icon: MoreHorizontal, desc: 'Jakákoliv jiná připomínka či dotaz' }
];

export default function BugReportModal({ isOpen, onClose }: BugReportModalProps) {
  const location = useLocation();
  const { user, profile } = useAuth();

  const [category, setCategory] = useState<BugReportCategory>('question');
  const [description, setDescription] = useState('');
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Podpora vložení screenshotu ze schránky (Ctrl+V) kdekoli v modalu
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            handleImageSelected(blob);
            toast.info('Snímek obrazovky byl vložen ze schránky!');
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  // Vyčištění náhledu při zavření
  useEffect(() => {
    if (!isOpen) {
      setDescription('');
      setCategory('question');
      setScreenshotFile(null);
      if (screenshotPreview) {
        URL.revokeObjectURL(screenshotPreview);
        setScreenshotPreview(null);
      }
    }
  }, [isOpen]);

    const handleImageSelected = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Vyberte prosím obrázek (PNG, JPG, WEBP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Obrázek je příliš velký (max. 10 MB).');
      return;
    }

    if (screenshotPreview) {
      URL.revokeObjectURL(screenshotPreview);
    }

    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    if (screenshotPreview) {
      URL.revokeObjectURL(screenshotPreview);
    }
    setScreenshotFile(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanDesc = description.trim();
    if (!cleanDesc || cleanDesc.length < 5) {
      toast.error('Napište prosím podrobnější popis (alespoň 5 znaků).');
      return;
    }

    setIsSubmitting(true);

    try {
      await submitBugReport({
        category,
        description: cleanDesc,
        pageUrl: window.location.href,
        screenshotFile,
        userName: profile?.name || user?.displayName || user?.email?.split('@')[0] || 'Student',
        userAgent: navigator.userAgent,
        screenResolution: `${window.innerWidth}x${window.innerHeight} (${window.screen.width}x${window.screen.height})`
      });

      toast.success('Hlášení bylo úspěšně odesláno na náš e-mail. Děkujeme za pomoc s vylepšováním ProEdu! ❤️');
      onClose();
    } catch (err: any) {
      console.error('Chyba při odesílání hlášení:', err);
      toast.error(err.message || 'Nepodařilo se odeslat hlášení. Zkuste to prosím znovu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent 
        showCloseButton={false}
        className="max-w-xl p-0 overflow-hidden bg-white text-[#1E1B18] border border-gray-100 shadow-2xl rounded-3xl max-h-[92vh] flex flex-col"
      >
        <DialogTitle className="sr-only">Nahlásit chybu</DialogTitle>
        <DialogDescription className="sr-only">Formulář pro nahlášení chyby nebo nápadu týmu ProEdu</DialogDescription>
        {/* Header */}
        <div className="bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 px-5 sm:px-6 py-4 border-b border-rose-100/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-md shadow-rose-500/20">
              <Bug size={20} className="animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#0F2942] tracking-tight">Nahlásit chybu</h2>
              <p className="text-xs text-gray-500 font-medium">Pošle se přímo našemu týmu na e-mail</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-white/80 transition-all cursor-pointer"
            title="Zavřít"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Kategorie */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-2">
              Kategorie problému
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.id;
                return (
                  <button
                    type="button"
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={`flex flex-col items-start p-2.5 sm:p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-rose-500 bg-rose-50/70 text-rose-950 shadow-xs ring-1 ring-rose-500/30'
                        : 'border-gray-200/80 bg-white hover:border-gray-300 text-gray-700 hover:bg-gray-50/50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={15} className={isSelected ? 'text-rose-600' : 'text-gray-400'} />
                      <span className="text-xs font-black">{cat.label}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 line-clamp-1 leading-tight">{cat.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Popis */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="bug-desc" className="text-xs font-black uppercase tracking-wider text-gray-500">
                Popis chyby <span className="text-rose-500">*</span>
              </label>
              <span className={`text-[11px] font-bold ${description.length > 3800 ? 'text-rose-600' : 'text-gray-400'}`}>
                {description.length} / 4000
              </span>
            </div>
            <textarea
              id="bug-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Co přesně se stalo? Kde byla chyba a jak by to mělo být správně? Čím více detailů napíšete, tím rychleji to opravíme..."
              maxLength={4000}
              required
              className="w-full px-4 py-3 text-sm rounded-2xl border border-gray-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 outline-none transition-all resize-none bg-gray-50/50 focus:bg-white"
            />
          </div>

          {/* Příloha / Screenshot */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                <ImageIcon size={14} className="text-gray-400" />
                Snímek obrazovky (volitelné)
              </label>
              <span className="text-[11px] text-gray-400 font-medium">Lze vložit i klávesami Ctrl+V</span>
            </div>

            {screenshotPreview ? (
              <div className="relative rounded-2xl border border-gray-200 overflow-hidden bg-gray-900 group">
                <img 
                  src={screenshotPreview} 
                  alt="Náhled screenshotu" 
                  className="w-full max-h-44 object-contain mx-auto"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-rose-600 text-white rounded-xl backdrop-blur-md transition-all shadow-md cursor-pointer"
                  title="Odstranit obrázek"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files?.[0]) {
                    handleImageSelected(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-1.5 ${
                  isDragging
                    ? 'border-rose-500 bg-rose-50/50'
                    : 'border-gray-200 hover:border-rose-300 hover:bg-rose-50/20 bg-gray-50/40'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500">
                  <Upload size={18} />
                </div>
                <div className="text-xs font-bold text-gray-700">
                  Klikněte pro nahrání nebo přetáhněte obrázek sem
                </div>
                <p className="text-[11px] text-gray-400">PNG, JPG nebo WEBP do 10 MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      handleImageSelected(e.target.files[0]);
                    }
                  }}
                />
              </div>
            )}
          </div>

          {/* Automatická diagnostická data */}
          <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100/80 flex items-start gap-2 text-[11px] text-gray-500">
            <Monitor size={15} className="text-gray-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-bold text-gray-700">K hlášení automaticky přiložíme:</p>
              <p className="break-all font-mono text-[10px] text-gray-500">
                Stránka: {location.pathname}
              </p>
              <p className="text-[10px] text-gray-400">
                Odesílatel: {profile?.name || user?.displayName || user?.email} ({user?.email})
              </p>
            </div>
          </div>

          {/* Footer tlačítka */}
          <div className="pt-2 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-gray-200 hover:bg-gray-100 font-bold text-xs text-gray-600 transition-all cursor-pointer"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !description.trim()}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-white font-black text-xs shadow-md shadow-rose-600/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Odesílám...</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>Odeslat hlášení</span>
                </>
              )}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
