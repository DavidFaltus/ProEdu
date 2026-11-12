import React from 'react';
import { Moon, Sparkles, Home, Crown, ZapOff } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';

interface DailyLimitExhaustedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPaywall?: () => void;
  isGuest?: boolean;
  onOpenAuthModal?: () => void;
  primaryButtonText?: string;
}

export default function DailyLimitExhaustedModal({
  isOpen,
  onClose,
  onOpenPaywall,
  isGuest = false,
  onOpenAuthModal,
  primaryButtonText = 'Rozumím',
}: DailyLimitExhaustedModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) {
        onClose();
      }
    }}>
      <DialogContent
        className="sm:max-w-md p-0 overflow-hidden bg-white text-[#1E1B18] border border-gray-100 shadow-2xl rounded-3xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Denní limit energie vyčerpán</DialogTitle>
        <DialogDescription className="sr-only">
          Všechny denní žolíky i videa byla vyčerpána. Vraťte se zítra o půlnoci nebo přejděte na Premium.
        </DialogDescription>

        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 w-44 h-44 bg-amber-200/30 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />
        <div className="absolute top-0 left-0 w-36 h-36 bg-blue-200/30 rounded-full blur-3xl pointer-events-none -ml-12 -mt-12" />

        <div className="p-6 sm:p-8 text-center relative z-10 space-y-5">
          {/* Badge & Icon */}
          <div className="space-y-3">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 border-2 border-amber-200/80 flex items-center justify-center text-amber-600 shadow-inner">
              <Moon className="w-8 h-8 text-amber-600" />
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-amber-100 text-amber-900 inline-flex items-center gap-1.5">
                <ZapOff size={12} className="text-amber-700" />
                Denní limit vyčerpán
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-[#0F2942] tracking-tight">
                Dnes už nemáš žádné žolíky
              </h2>
              <p className="text-xs sm:text-sm text-gray-500 font-medium leading-relaxed">
                Využil/a jsi všechny dnešní žolíky i maximální počet <strong className="text-[#1E1B18]">3 bonusových videí</strong>. Skvělá práce, dnes máš odtrénováno!
              </p>
            </div>
          </div>

          {/* Info callout card */}
          <div className="p-4 rounded-2xl bg-[#FAF7F0] border border-gray-200/70 text-left space-y-2.5 text-xs text-gray-700 font-medium">
            <div className="flex items-start gap-2.5">
              <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                🌙
              </div>
              <div>
                <strong className="text-[#1E1B18] block font-bold">Vrať se zase zítra</strong>
                <span>Nová energie (10 žolíků, případně 15 se streakem) a další 3 videa se ti automaticky obnoví zítra o půlnoci.</span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 pt-2 border-t border-gray-200/60">
              <div className="w-6 h-6 rounded-lg bg-yellow-100 text-yellow-800 flex items-center justify-center shrink-0 mt-0.5">
                <Crown size={14} className="text-[#1E1B18]" />
              </div>
              <div>
                <strong className="text-[#1E1B18] block font-bold">Nechceš čekat do zítra?</strong>
                <span>S ProEducator Premium získáš neomezené procvičování bez limitu žolíků, 100% bez reklam a s autorskými postupy.</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-2.5 pt-1">
            {/* Tlačítko potvrzení */}
            <Button
              type="button"
              onClick={onClose}
              className="w-full h-12 rounded-2xl bg-[#0F2942] hover:bg-[#1E1B18] text-white font-black text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-[0.99]"
            >
              <Home size={16} />
              <span>{primaryButtonText}</span>
            </Button>

            {/* Tlačítko na Premium nebo registraci */}
            {isGuest ? (
              onOpenAuthModal && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onOpenAuthModal}
                  className="w-full h-11 rounded-xl font-bold text-xs border-gray-200 hover:bg-gray-50 text-[#0F2942] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles size={14} className="text-amber-500" />
                  <span>Bezplatná registrace (+15 žolíků)</span>
                </Button>
              )
            ) : (
              onOpenPaywall && (
                <Button
                  type="button"
                  onClick={onOpenPaywall}
                  className="w-full h-11 rounded-xl bg-[#F5C400] hover:bg-[#e0b400] text-[#1E1B18] font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all active:scale-[0.99]"
                >
                  <Crown size={15} />
                  <span>Aktivovat Premium (99 Kč / měsíc)</span>
                </Button>
              )
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
