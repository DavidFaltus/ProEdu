import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, X, Clock, ShieldCheck, 
  ArrowRight
} from 'lucide-react';
import {
  CorrectCyanIcon,
  HeartPinkIcon,
  StarYellowIcon,
  TeamBlueIcon,
} from './CustomIcon';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { useAuth } from '../../context/AuthContext';
import { GUEST_MAX_VIDEOS } from '../../services/jokerService';
import { trackRewardedVideoStart, trackRewardedVideoComplete } from '../../services/analyticsService';

interface RewardedAdModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRewardEarned: () => void;
  isGuest?: boolean;
  guestVideosWatched?: number;
  rewardAmount?: number;
}

const TOTAL_SECONDS = 15;

export default function RewardedAdModal({
  open,
  onOpenChange,
  onRewardEarned,
  isGuest = false,
  guestVideosWatched = 0,
  rewardAmount = 5,
}: RewardedAdModalProps) {
  const { openAuthModal } = useAuth();
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isClaimed, setIsClaimed] = useState(false);

  // Spuštění a reset odpočítávání při otevření
  useEffect(() => {
    if (!open) {
      setSecondsLeft(TOTAL_SECONDS);
      setIsCompleted(false);
      setIsClaimed(false);
      return;
    }

    setSecondsLeft(TOTAL_SECONDS);
    setIsCompleted(false);
    setIsClaimed(false);
    trackRewardedVideoStart(isGuest ? 'guest_joker' : 'user_joker');

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsCompleted(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [open]);

  const handleClaimReward = () => {
    setIsClaimed(true);
    trackRewardedVideoComplete(isGuest ? 'guest_joker' : 'user_joker');
    onRewardEarned();
    onOpenChange(false);
  };

  const progressPercent = Math.min(100, Math.round(((TOTAL_SECONDS - secondsLeft) / TOTAL_SECONDS) * 100));
  const guestReachedLimit = isGuest && guestVideosWatched >= GUEST_MAX_VIDEOS;

  return (
    <Dialog open={open} onOpenChange={(val) => {
      // Během běžícího videa nepovolit zavření klikem mimo
      if (!isCompleted && open) return;
      onOpenChange(val);
    }}>
      <DialogContent 
        className="sm:max-w-md p-0 overflow-hidden bg-white text-[#1E1B18] border-2 border-[#B9D8FC] shadow-2xl rounded-3xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Sledování videa pro dobití žolíků</DialogTitle>
        <DialogDescription className="sr-only">
          15sekundové video pro získání +{rewardAmount} žolíků na procvičování.
        </DialogDescription>

        {/* Horní lišta s odpočtem a stavem */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#FAF6EE] border-b border-gray-100 text-xs font-bold">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#B9D8FC] text-[#0F2942] font-black text-[11px] uppercase tracking-wider border border-blue-200/60">
              <Play className="w-3 h-3 fill-current" />
              Sponzorováno
            </span>
            <span className="text-gray-500 font-semibold hidden sm:inline">ProEdu Příprava</span>
          </div>

          <div className="flex items-center gap-2">
            {!isCompleted ? (
              <div className="flex items-center gap-1.5 text-[#0F2942] font-mono font-bold bg-[#B9D8FC]/30 px-2.5 py-1 rounded-full border border-[#B9D8FC]">
                <Clock className="w-3.5 h-3.5 animate-spin text-[#2B44B8]" style={{ animationDuration: '3s' }} />
                <span>Odměna za {secondsLeft}s</span>
              </div>
            ) : (
              <span className="flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                <CorrectCyanIcon size={15} />
                Dokončeno
              </span>
            )}

            {isCompleted && (
              <button
                onClick={() => onOpenChange(false)}
                className="text-gray-400 hover:text-[#1E1B18] p-1 rounded-lg transition-colors ml-1 cursor-pointer"
                aria-label="Zavřít"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Video přehrávač / Simulátor obrazovky */}
        <div className="relative aspect-video w-full bg-gradient-to-br from-blue-50/90 via-sky-50/60 to-blue-50/90 flex flex-col items-center justify-center p-6 text-center select-none overflow-hidden border-b border-blue-100">
          {/* Pozadí - jemné kruhy */}
          <div className="absolute -top-12 -left-12 w-48 h-48 bg-[#B9D8FC]/40 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-blue-200/30 rounded-full blur-2xl pointer-events-none" />

          {!isCompleted ? (
            <motion.div 
              key="playing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-3 z-10 max-w-xs"
            >
              <div className="w-16 h-16 mx-auto rounded-2xl bg-white border-2 border-[#B9D8FC] flex items-center justify-center text-[#2B44B8] shadow-md">
                <HeartPinkIcon className="w-9 h-9 animate-pulse" />
              </div>
              <div>
                <h4 className="text-lg font-black text-[#0F2942] tracking-tight">
                  ProEdu Premium
                </h4>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed font-medium">
                  Cermat testy bez limitu žolíků, kompletní postupy řešení a živé konzultace s lektorem.
                </p>
              </div>

              <div className="inline-flex items-center gap-1.5 text-xs text-[#0F2942] font-semibold bg-white/80 px-3 py-1 rounded-full border border-blue-100 shadow-2xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Za zhlédnutí získáš +{rewardAmount} žolíků</span>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="done"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15 }}
              className="space-y-3 z-10 max-w-xs"
            >
              <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 border-2 border-emerald-300 flex items-center justify-center text-emerald-600 shadow-md">
                <StarYellowIcon className="w-9 h-9" />
              </div>
              <div>
                <h4 className="text-xl font-black text-[#0F2942]">
                  +{rewardAmount} žolíků připraveno! 🎉
                </h4>
                <p className="text-xs text-gray-600 mt-1 font-medium">
                  {isGuest 
                    ? `Zhlédnuto ${guestVideosWatched + 1} ze ${GUEST_MAX_VIDEOS} videí pro hosty.`
                    : 'Skvělá práce! Můžeš pokračovat v dalším procvičování.'}
                </p>
              </div>
            </motion.div>
          )}

          {/* Spodní progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-[#B9D8FC]/30">
            <motion.div 
              className="h-full bg-[#2B44B8]"
              style={{ width: `${progressPercent}%` }}
              transition={{ ease: 'linear' }}
            />
          </div>
        </div>

        {/* Spodní panel s akcemi */}
        <div className="p-5 bg-white space-y-3">
          {!isCompleted ? (
            <div className="text-center py-2">
              <p className="text-xs text-gray-600 font-medium flex items-center justify-center gap-2">
                <span>Počkej ještě </span>
                <span className="font-mono font-black text-[#0F2942] text-sm bg-[#B9D8FC]/30 px-2 py-0.5 rounded-md border border-[#B9D8FC]">{secondsLeft}s</span>
                <span> pro připsání žolíků</span>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                onClick={handleClaimReward}
                disabled={isClaimed}
                className="w-full h-12 bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black text-base rounded-2xl border border-blue-200/80 shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
              >
                <span>Vyzvednout +{rewardAmount} žolíků a pokračovat</span>
                <ArrowRight className="w-5 h-5 ml-1.5" />
              </Button>

              {isGuest && (
                <div className="pt-2 text-center border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2 font-medium">
                    Chceš mít 20 žolíků denně a ukládat si postup?
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      openAuthModal();
                    }}
                    className="w-full text-xs font-bold border-gray-200 hover:bg-gray-50 text-[#0F2942] rounded-xl cursor-pointer"
                  >
                    <TeamBlueIcon size={15} className="mr-1.5" />
                    Zaregistrovat se zdarma
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
