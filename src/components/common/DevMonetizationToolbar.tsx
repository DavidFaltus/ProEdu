import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wrench, ChevronDown, ChevronUp, Play, RotateCcw, 
  Trash2, Shield, Sparkles, GraduationCap, UserCheck, 
  Crown, Zap 
} from 'lucide-react';
import { Button } from '../ui/button';
import { useAuth } from '../../context/AuthContext';
import { resetGuestState, getGuestState, DEFAULT_DAILY_JOKERS } from '../../services/jokerService';
import { toast } from 'sonner';
import RewardedAdModal from './RewardedAdModal';
import { UserRole } from '../../types';

export default function DevMonetizationToolbar() {
  const { user, profile, updateProfileData, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);

  // Zobrazovat v dev režimu NEBO pro učitele
  const isDev = import.meta.env.DEV;
  const isTeacher = profile?.role === 'teacher';

  if (!isDev && !isTeacher) {
    return null;
  }

  const currentRole = profile?.role || 'host (neregistrovaný)';
  const currentJokers = profile?.jokers !== undefined ? profile.jokers : DEFAULT_DAILY_JOKERS;

  const handleRoleChange = async (newRole: UserRole) => {
    if (!user) {
      toast.info('Pro změnu role v databázi je potřeba být přihlášen. Můžeš se přihlásit jako student@student.cz.');
      return;
    }
    try {
      await updateProfileData({ role: newRole });
      toast.success(`Role změněna na: ${newRole.toUpperCase()}`);
    } catch (err: any) {
      toast.error('Chyba při změně role: ' + err.message);
    }
  };

  const handleSetJokers = async (amount: number) => {
    if (!user) {
      toast.info('Pro úpravu žolíků se přihlaste.');
      return;
    }
    try {
      await updateProfileData({ jokers: amount });
      toast.success(`Žolíky nastaveny na: ${amount}`);
    } catch (err: any) {
      toast.error('Chyba při nastavení žolíků: ' + err.message);
    }
  };

  const handleAddJokers = async (add: number) => {
    if (!user) {
      toast.info('Pro úpravu žolíků se přihlaste.');
      return;
    }
    const nextVal = (profile?.jokers ?? DEFAULT_DAILY_JOKERS) + add;
    try {
      await updateProfileData({ jokers: nextVal });
      toast.success(`Přidáno +${add} žolíků (celkem: ${nextVal})`);
    } catch (err: any) {
      toast.error('Chyba: ' + err.message);
    }
  };

  const handleResetGuestData = () => {
    resetGuestState();
    toast.success('Data neregistrovaného hosta (localStorage) byla vymazána.');
  };

  return (
    <>
      <div className="fixed bottom-18 sm:bottom-4 left-3.5 sm:left-auto sm:right-4 z-40 sm:z-50 select-none font-sans">
        {/* Minimalizovaný stav (Pill) */}
        {!isOpen ? (
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-gray-900/90 hover:bg-black text-white text-[11px] sm:text-xs font-bold rounded-full shadow-2xl border border-yellow-400/50 backdrop-blur-md transition-all hover:scale-105"
            title="Otevřít nástroje pro monetizaci a testování rolí"
          >
            <Wrench className="w-3.5 h-3.5 text-yellow-400" />
            <span className="capitalize text-yellow-300">
              {profile ? profile.role : 'Host'}
            </span>
            <span className="text-gray-400">|</span>
            <span className="font-mono">🃏 {user ? currentJokers : 'N/A'}</span>
            <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
          </button>
        ) : (
          /* Rozbalený stav */
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-80 max-w-[calc(100vw-1.75rem)] bg-gray-900/95 border-2 border-yellow-400/60 text-white rounded-3xl p-4 shadow-2xl backdrop-blur-lg space-y-4"
          >
            {/* Hlavička */}
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-yellow-400" />
                <h4 className="text-xs font-black uppercase tracking-wider text-yellow-300">
                  Dev Testovací Lišta
                </h4>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white p-1 rounded-lg"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            {/* Přepínač rolí */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-300 flex items-center justify-between">
                <span>Přepnout roli:</span>
                <span className="text-yellow-400 font-mono capitalize">
                  {user ? profile?.role : 'Host (nepřihlášen)'}
                </span>
              </label>
              
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <Button
                  size="sm"
                  variant={profile?.role === 'free' || profile?.role === 'student' ? 'default' : 'outline'}
                  onClick={() => handleRoleChange('free')}
                  className="h-8 text-[11px] font-bold border-white/20"
                >
                  <UserCheck className="w-3 h-3 mr-1" />
                  Free (Základní)
                </Button>

                <Button
                  size="sm"
                  variant={profile?.role === 'premium' ? 'default' : 'outline'}
                  onClick={() => handleRoleChange('premium')}
                  className="h-8 text-[11px] font-bold border-white/20 text-yellow-300 hover:text-yellow-200"
                >
                  <Crown className="w-3 h-3 mr-1" />
                  Premium
                </Button>

                <Button
                  size="sm"
                  variant={profile?.role === 'course' ? 'default' : 'outline'}
                  onClick={() => handleRoleChange('course')}
                  className="h-8 text-[11px] font-bold border-white/20 text-blue-300 hover:text-blue-200"
                >
                  <GraduationCap className="w-3 h-3 mr-1" />
                  Kurz (VIP)
                </Button>

                <Button
                  size="sm"
                  variant={profile?.role === 'teacher' ? 'default' : 'outline'}
                  onClick={() => handleRoleChange('teacher')}
                  className="h-8 text-[11px] font-bold border-white/20 text-purple-300 hover:text-purple-200"
                >
                  <Shield className="w-3 h-3 mr-1" />
                  Učitel
                </Button>
              </div>

              {user && (
                <button
                  onClick={() => signOut()}
                  className="w-full text-center text-[10px] text-gray-400 hover:text-red-300 py-1"
                >
                  Odhlásit se a testovat jako neregistrovaný Host
                </button>
              )}
            </div>

            {/* Ovládání žolíků */}
            <div className="space-y-1.5 pt-2 border-t border-white/10">
              <label className="text-[11px] font-bold text-gray-300 flex items-center justify-between">
                <span>Žolíky:</span>
                <span className="font-mono text-yellow-400 font-black text-sm">
                  {user ? currentJokers : 'Neregistrovaný'}
                </span>
              </label>

              <div className="grid grid-cols-3 gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSetJokers(20)}
                  className="h-7 text-[10px] font-bold border-white/20 text-green-300"
                >
                  Reset 20
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSetJokers(0)}
                  className="h-7 text-[10px] font-bold border-white/20 text-red-400"
                >
                  Nastavit 0
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAddJokers(5)}
                  className="h-7 text-[10px] font-bold border-white/20 text-yellow-300"
                >
                  +5 žolíků
                </Button>
              </div>
            </div>

            {/* Test 15s videa & Reset hosta */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <Button
                size="sm"
                onClick={() => setIsVideoModalOpen(true)}
                className="w-full h-8 bg-yellow-400 hover:bg-yellow-500 text-black font-black text-xs rounded-xl"
              >
                <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                Otestovat 15s video simulátor
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={handleResetGuestData}
                className="w-full h-7 text-[10px] text-gray-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                Smazat localStorage hosta (vyzkoušet od nuly)
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {/* 15s Video simulátor vyvolaný z lišty */}
      <RewardedAdModal
        open={isVideoModalOpen}
        onOpenChange={setIsVideoModalOpen}
        onRewardEarned={() => {
          if (user) {
            handleAddJokers(5);
          } else {
            toast.success('Testovací video dokončeno! Host získal virtuální odměnu.');
          }
        }}
        isGuest={!user}
        guestVideosWatched={getGuestState().videosWatched}
      />
    </>
  );
}
