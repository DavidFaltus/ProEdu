import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, Sparkles, CheckCircle2, X, Clock, ShieldCheck, 
  Flame, Award, ArrowRight, UserPlus 
} from 'lucide-react';
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
        className="sm:max-w-md p-0 overflow-hidden bg-[#1E1B18] text-white border-2 border-yellow-500/40 shadow-2xl rounded-3xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Sledování videa pro dobití žolíků</DialogTitle>
        <DialogDescription className="sr-only">
          15sekundové video pro získání +{rewardAmount} žolíků na procvičování.
        </DialogDescription>

        {/* Horní lišta s odpočtem a stavem */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-black/40 border-b border-white/10 text-xs font-bold">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-400 text-black font-black text-[11px] uppercase tracking-wider">
              <Play className="w-3 h-3 fill-current" />
              Sponzorováno
            </span>
            <span className="text-gray-400 hidden sm:inline">ProEdu Příprava</span>
          </div>

          <div className="flex items-center gap-2">
            {!isCompleted ? (
              <div className="flex items-center gap-1.5 text-yellow-300 font-mono bg-yellow-400/10 px-2.5 py-1 rounded-full border border-yellow-400/30">
                <Clock className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
                <span>Odměna za {secondsLeft}s</span>
              </div>
            ) : (
              <span className="flex items-center gap-1 text-green-400 font-bold bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Dokončeno
              </span>
            )}

            {isCompleted && (
              <button
                onClick={() => onOpenChange(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg transition-colors ml-1"
                aria-label="Zavřít"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Video přehrávač / Simulátor obrazovky */}
        <div className="relative aspect-video w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-yellow-950/40 flex flex-col items-center justify-center p-6 text-center select-none overflow-hidden">
          {/* Pozadí - animované kruhy */}
          <div className="absolute -top-12 -left-12 w-48 h-48 bg-yellow-400/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

          {!isCompleted ? (
            <motion.div 
              key="playing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4 z-10 max-w-xs"
            >
              <div className="w-16 h-16 mx-auto rounded-2xl bg-yellow-400/20 border-2 border-yellow-400/50 flex items-center justify-center text-yellow-300 shadow-lg shadow-yellow-400/20">
                <Flame className="w-8 h-8 animate-pulse text-yellow-400" />
              </div>
              <div>
                <h4 className="text-lg font-black text-white tracking-tight">
                  ProEdu Premium
                </h4>
                <p className="text-xs text-gray-300 mt-1 leading-relaxed">
                  Cermat testy bez limitu žolíků, kompletní postupy řešení a živé konzultace s lektorem.
                </p>
              </div>

              <div className="inline-flex items-center gap-1.5 text-xs text-yellow-300/80 font-medium">
                <ShieldCheck className="w-4 h-4 text-green-400" />
                <span>Za zhlédnutí získáš +{rewardAmount} žolíků</span>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="done"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 15 }}
              className="space-y-4 z-10 max-w-xs"
            >
              <div className="w-16 h-16 mx-auto rounded-2xl bg-green-500/20 border-2 border-green-400 flex items-center justify-center text-green-400 shadow-xl shadow-green-500/20">
                <Award className="w-9 h-9" />
              </div>
              <div>
                <h4 className="text-xl font-black text-white">
                  +{rewardAmount} žolíků připraveno! 🎉
                </h4>
                <p className="text-xs text-gray-300 mt-1">
                  {isGuest 
                    ? `Zhlédnuto ${guestVideosWatched + 1} ze ${GUEST_MAX_VIDEOS} videí pro hosty.`
                    : 'Skvělá práce! Můžeš pokračovat v dalším procvičování.'}
                </p>
              </div>
            </motion.div>
          )}

          {/* Spodní progress bar */}
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10">
            <motion.div 
              className="h-full bg-yellow-400"
              style={{ width: `${progressPercent}%` }}
              transition={{ ease: 'linear' }}
            />
          </div>
        </div>

        {/* Spodní panel s akcemi */}
        <div className="p-5 bg-[#171513] space-y-3">
          {!isCompleted ? (
            <div className="text-center py-2">
              <p className="text-xs text-gray-400 flex items-center justify-center gap-2">
                <span>Počkej ještě </span>
                <span className="font-mono font-bold text-yellow-400 text-sm">{secondsLeft}s</span>
                <span> pro připsání žolíků</span>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Button
                onClick={handleClaimReward}
                disabled={isClaimed}
                className="w-full h-12 bg-yellow-400 hover:bg-yellow-500 text-black font-black text-base rounded-2xl border-b-4 border-yellow-600 shadow-lg shadow-yellow-400/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Vyzvednout +{rewardAmount} žolíků a pokračovat</span>
                <ArrowRight className="w-5 h-5 ml-1.5" />
              </Button>

              {isGuest && (
                <div className="pt-2 text-center border-t border-white/10">
                  <p className="text-xs text-gray-400 mb-2">
                    Chceš mít 20 žolíků denně a ukládat si postup?
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      openAuthModal();
                    }}
                    className="w-full text-xs font-bold border-white/20 hover:bg-white/10 text-white rounded-xl"
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1.5 text-yellow-400" />
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
