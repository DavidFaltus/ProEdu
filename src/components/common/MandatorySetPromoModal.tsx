import React, { useState, useEffect } from 'react';
import { Crown, Sparkles, Check, ArrowRight, Zap } from 'lucide-react';
import { StarYellowIcon } from './CustomIcon';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';

interface MandatorySetPromoModalProps {
  isOpen: boolean;
  onFinish: () => void;
  onOpenPaywall: () => void;
}

export default function MandatorySetPromoModal({
  isOpen,
  onFinish,
  onOpenPaywall
}: MandatorySetPromoModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(5);

  useEffect(() => {
    if (!isOpen) {
      setSecondsLeft(5);
      return;
    }

    setSecondsLeft(5);
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen]);

    const canContinue = secondsLeft === 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && canContinue) onFinish(); }}>
      <DialogContent 
        showCloseButton={false}
        className="max-w-md p-0 overflow-hidden bg-white text-[#1E1B18] border border-gray-100 shadow-2xl rounded-3xl text-center relative"
      >
        <DialogTitle className="sr-only">Dokončená sada procvičování</DialogTitle>
        <DialogDescription className="sr-only">Vyhodnocení sady a nabídka ProEdu Premium</DialogDescription>
        {/* Glow Accent */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-amber-200/40 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />
        <div className="absolute top-0 left-0 w-36 h-36 bg-blue-200/40 rounded-full blur-3xl pointer-events-none -ml-12 -mt-12" />

        {/* Header */}
        <div className="pt-8 px-6 pb-4 relative z-10 space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#F5C400] to-amber-300 text-[#1E1B18] shadow-lg shadow-amber-300/30 mx-auto">
            <Crown size={32} className="animate-bounce" />
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-amber-100 text-amber-900 inline-flex items-center gap-1">
              <Sparkles size={12} className="text-amber-600" />
              Sada dokončena
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-[#0F2942] tracking-tight">
              Příprava bez limitů a bez reklam
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 font-medium">
              S <strong className="text-[#1E1B18]">ProEducator Premium</strong> tě při tréninku na přijímačky nic nezastaví.
            </p>
          </div>
        </div>

        {/* Benefits list */}
        <div className="px-6 py-3 space-y-2.5 text-left text-xs font-bold text-gray-700">
          <div className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-[#FAF7F0] border border-amber-200/50">
            <div className="w-6 h-6 rounded-xl bg-amber-400 text-[#1E1B18] flex items-center justify-center shrink-0">
              <Zap size={14} />
            </div>
            <span>Neomezený počet žolíků i otázek každý den</span>
          </div>

          <div className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-blue-50/70 border border-blue-100">
            <div className="w-6 h-6 rounded-xl bg-blue-500 text-white flex items-center justify-center shrink-0">
              <Check size={14} />
            </div>
            <span>Všechny úlohy 100% bez reklam a bez čekání</span>
          </div>

          <div className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-rose-50/70 border border-rose-100">
            <div className="w-6 h-6 rounded-xl bg-[#B80053] text-white flex items-center justify-center shrink-0">
              <StarYellowIcon size={14} />
            </div>
            <span>Kompletní autorská řešení a video vysvětlení</span>
          </div>
        </div>

        {/* Actions & Countdown */}
        <div className="p-6 pt-4 space-y-3 relative z-10 border-t border-gray-100 mt-2">
          {/* Tlačítko pro aktivaci Premium */}
          <button
            type="button"
            onClick={() => {
              onOpenPaywall();
              onFinish();
            }}
            className="w-full py-3.5 px-4 rounded-2xl bg-[#F5C400] hover:bg-[#e0b400] active:scale-98 text-[#1E1B18] font-black text-xs sm:text-sm shadow-md shadow-amber-400/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Crown size={16} />
            <span>Aktivovat Premium (99 Kč / měsíc)</span>
          </button>

          {/* Tlačítko pro pokračování s odpočtem */}
          <button
            type="button"
            disabled={!canContinue}
            onClick={onFinish}
            className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
              canContinue
                ? 'bg-gray-100 hover:bg-gray-200 text-gray-800 cursor-pointer shadow-xs active:scale-98'
                : 'bg-gray-100/60 text-gray-400 cursor-not-allowed opacity-80'
            }`}
          >
            {canContinue ? (
              <>
                <span>Pokračovat na vyhodnocení výsledků</span>
                <ArrowRight size={14} />
              </>
            ) : (
              <span>Vyhodnocení se zpřístupní za {secondsLeft} s...</span>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
