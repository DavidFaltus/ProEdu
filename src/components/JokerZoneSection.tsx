import React, { useState } from 'react';
import {
  Play,
  Lock,
  Flame,
  Users,
  ClipboardList,
  Check
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { toast } from 'sonner';
import RewardedAdModal from './common/RewardedAdModal';
import {
  recordGuestVideo,
  getGuestState,
  GUEST_MAX_VIDEOS,
  MAX_STREAK_DAYS,
  MAX_REFERRALS
} from '../services/jokerService';
import { cn } from '../lib/utils';

const SURVEY_OPTIONS = [
  'Od spolužáka / kamaráda',
  'Ze školy / od učitele',
  'TikTok / Instagram',
  'Facebook',
  'Google vyhledávání',
  'Jiné'
];

const GRADE_OPTIONS = [
  '5. třída (8leté gymnázium)',
  '6. třída',
  '7. třída (6leté gymnázium)',
  '8. třída',
  '9. třída (4leté gymnázium / SŠ)',
  '1. ročník SŠ',
  '2. ročník SŠ',
  '3. ročník SŠ',
  '4. ročník SŠ',
  'Jiný ročník'
];

function getRemainingDaysLabel(daysRemaining: number): string {
  if (daysRemaining === 1) return '1 den';
  if (daysRemaining >= 2 && daysRemaining <= 4) return `${daysRemaining} dny`;
  return `${daysRemaining} dní`;
}

function getRemainingVideosLabel(remaining: number): string {
  if (remaining <= 0) return 'Dnešní limit 3 videí vyčerpán';
  if (remaining === 1) return 'Dnes zbývá 1 zhlédnutí';
  return `Dnes zbývají ${remaining} zhlédnutí`;
}

export default function JokerZoneSection() {
  const {
    user,
    profile,
    loading,
    isPremium,
    jokers,
    streak,
    maxJokersCap,
    claimVideoReward,
    submitSurvey,
    openAuthModal
  } = useAuth();

  // Dialogy a interakce
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isSurveyModalOpen, setIsSurveyModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [selectedSurveyOption, setSelectedSurveyOption] = useState<string>('');
  const [customSurveyText, setCustomSurveyText] = useState<string>('');
  const [surveySchool, setSurveySchool] = useState<string>('');
  const [surveyGrade, setSurveyGrade] = useState<string>('');
  const [isSubmittingSurvey, setIsSubmittingSurvey] = useState(false);

  const [guestState, setGuestState] = useState(() => getGuestState());
  const isGuest =
    (!user && !profile) || user?.uid === 'guest-preview' || profile?.uid === 'guest-preview';

  const isCapped = !isGuest && jokers >= maxJokersCap;
  const videosWatchedToday = isGuest
    ? guestState.videosWatched
    : profile?.dailyVideosWatched || 0;
  const videosRemaining = Math.max(0, 3 - videosWatchedToday);
  const isVideoLimitReached = videosWatchedToday >= 3;
  const currentReferrals = Math.min(MAX_REFERRALS, profile?.referralsCount || 0);

  const referralCode = profile?.referralCode || profile?.uid || '';
  const referralUrl =
    typeof window !== 'undefined' && referralCode
      ? `${window.location.origin}/?ref=${referralCode}`
      : '';

  const handleOpenAuth = (mode: 'login' | 'register' = 'register') => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('proedu-auth-mode', { detail: { mode } }));
    }
    openAuthModal();
  };

  const handleCopyReferral = async () => {
    if (!referralUrl) return;
    try {
      await navigator.clipboard.writeText(referralUrl);
      setIsCopied(true);
      toast.success('Odkaz pro doporučení byl zkopírován do schránky!');
      setTimeout(() => setIsCopied(false), 2500);
    } catch {
      toast.error('Nepodařilo se zkopírovat odkaz.');
    }
  };

  const handleVideoRewardEarned = async () => {
    if (isGuest) {
      const res = recordGuestVideo();
      setGuestState(getGuestState());
      toast.success(
        `Video zhlédnuto (${res.videosWatched}/${GUEST_MAX_VIDEOS}). Pro uložení postupu a žolíků se bezplatně zaregistruj!`
      );
    } else {
      await claimVideoReward();
    }
  };

  const handleSurveySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSurveyOption) {
      toast.error('Vyberte prosím, odkud jste o nás slyšeli.');
      return;
    }
    if (selectedSurveyOption === 'Jiné' && !customSurveyText.trim()) {
      toast.error('Napište prosím upřesnění do textového pole.');
      return;
    }
    if (!surveySchool.trim()) {
      toast.error('Vyplňte prosím, na jakou školu chodíte.');
      return;
    }
    if (!surveyGrade) {
      toast.error('Vyberte prosím, do kterého ročníku chodíte.');
      return;
    }

    setIsSubmittingSurvey(true);
    try {
      await submitSurvey(
        selectedSurveyOption,
        selectedSurveyOption === 'Jiné' ? customSurveyText.trim() : undefined,
        surveySchool.trim(),
        surveyGrade
      );
      setIsSurveyModalOpen(false);
    } finally {
      setIsSubmittingSurvey(false);
    }
  };

  if (loading && !profile) {
    return null;
  }

  if (isPremium) {
    return null;
  }

  const capacityPercent = Math.min(
    100,
    Math.round(((isGuest ? 10 : jokers) / Math.max(1, isGuest ? 10 : maxJokersCap)) * 100)
  );
  const daysToMaxLimit = Math.max(0, MAX_STREAK_DAYS - streak);

  return (
    <section className="bg-white rounded-[2rem] border border-gray-200/80 shadow-sm p-5 sm:p-7 space-y-5 relative overflow-hidden">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-2xl sm:text-[26px] font-sans font-black text-[#0F2942] tracking-tight">
            Herní zóna žolíků
          </h2>
          <p className="text-gray-500 text-xs sm:text-sm font-medium">
            {isGuest
              ? 'Doplň si žolíky na procvičování. Nejrychleji videem, víc bonusů po registraci.'
              : 'Bonusy bez limitu a denní doplnění o půlnoci.'}
          </p>
        </div>

        {/* Joker status box on top right */}
        {isGuest ? (
          <div className="self-start sm:self-center bg-[#FCF9F1] border border-[#EFEAD8] px-4 py-2 rounded-full flex items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
              TVOJE ŽOLÍKY
            </span>
            <span className="text-lg font-black text-[#0F2942] leading-none">
              10
            </span>
          </div>
        ) : (
          <div className="self-start sm:self-center bg-[#FCF9F1] border border-[#EFEAD8] px-4 py-2.5 rounded-2xl min-w-[168px] space-y-1.5">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                TVOJE ŽOLÍKY
              </span>
              <div>
                <span className="text-lg font-black text-[#0F2942] leading-none">{jokers}</span>
                <span className="text-xs font-bold text-gray-400"> / {maxJokersCap}</span>
              </div>
            </div>
            <div className="w-full h-1.5 rounded-full bg-[#E6DFC8] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#2B44B8] transition-all duration-300"
                style={{ width: `${capacityPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* MAIN 2-COLUMN GRID: Left Hero Video Card + Right 3 Stacked Bonus Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch">
        {/* LEFT COLUMN: +5 ŽOLÍKŮ VIDEO HERO CARD */}
        <div className="lg:col-span-6 rounded-3xl bg-[#EEF5FF] border border-[#BFDBFE]/80 p-6 sm:p-7 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <div>
              <span className="inline-block px-3.5 py-1 rounded-full bg-white text-[#0F2942] text-[10px] font-black uppercase tracking-wider shadow-2xs">
                {isGuest ? 'NEJRYCHLEJŠÍ ZPŮSOB' : 'DOBÍT VIDEEM'}
              </span>
            </div>

            <div className="flex items-baseline gap-2 pt-1">
              <span className="text-5xl sm:text-6xl font-black text-[#0F2942] tracking-tight leading-none">
                +5
              </span>
              <span className="text-2xl sm:text-3xl font-black text-[#0F2942]">
                žolíků
              </span>
            </div>

            <p className="text-xs sm:text-sm text-[#0F2942]/80 font-medium leading-relaxed max-w-md">
              {isGuest
                ? 'Zhlédni krátké 15s video a doplň energii na procvičování. Funguje hned, bez registrace.'
                : 'Zhlédni 15s video a doplň energii až do výše své kapacity.'}
            </p>
          </div>

          <div className="space-y-4">
            {isGuest ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2].map((idx) => {
                    const isAvailable = idx < videosRemaining;
                    return (
                      <span
                        key={idx}
                        className={cn(
                          'w-7 h-2 rounded-full transition-colors',
                          isAvailable ? 'bg-[#2B44B8]' : 'bg-[#CBD5E1]'
                        )}
                      />
                    );
                  })}
                </div>
                <span className="text-xs font-medium text-[#0F2942]">
                  {getRemainingVideosLabel(videosRemaining)}
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-black text-[#0F2942]">
                  <span>Kapacita</span>
                  <span>
                    {jokers} / {maxJokersCap}
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-white overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#2B44B8] transition-all duration-300"
                    style={{ width: `${capacityPercent}%` }}
                  />
                </div>
                <p className="text-xs font-medium text-gray-600">
                  {isVideoLimitReached
                    ? 'Dnešní limit 3 videí vyčerpán'
                    : isCapped
                      ? `Máš plnou kapacitu (${jokers}/${maxJokersCap})`
                      : getRemainingVideosLabel(videosRemaining)}
                </p>
              </div>
            )}

            <button
              type="button"
              disabled={isVideoLimitReached || isCapped}
              onClick={() => setIsVideoModalOpen(true)}
              className="w-full h-12 sm:h-13 rounded-full bg-[#FACC15] hover:bg-[#EAB308] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none text-[#0F2942] font-black text-xs sm:text-sm flex items-center justify-center gap-2.5 shadow-2xs transition-all cursor-pointer"
            >
              <Play size={14} className="fill-[#0F2942] text-[#0F2942]" />
              <span>
                {isVideoLimitReached
                  ? 'Limit 3 videí vyčerpán'
                  : isCapped
                    ? `Kapacita je plná (${jokers}/${maxJokersCap})`
                    : 'Zhlédnout video a získat +5'}
              </span>
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: 3 STACKED BONUS CARDS */}
        <div className="lg:col-span-6 flex flex-col justify-between gap-3.5">
          {/* CARD 1: SÉRIE 10 DNÍ V ŘADĚ */}
          <div className="rounded-3xl bg-[#FCF9F1] border border-[#EFEAD8] p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#FDE68A]/70 text-[#92400E] flex items-center justify-center shrink-0">
                  <Flame size={19} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-sm sm:text-base text-[#0F2942] leading-snug">
                    Série 10 dní v řadě
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    {isGuest
                      ? 'Denní limit se zvýší z 10 na 15 žolíků.'
                      : streak >= MAX_STREAK_DAYS
                        ? 'Maximální denní limit 15 žolíků je aktivní!'
                        : `Ještě ${getRemainingDaysLabel(daysToMaxLimit)} do limitu 15 žolíků.`}
                  </p>
                </div>
              </div>

              {isGuest ? (
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FDE68A]/80 text-[#92400E] text-[11px] font-black">
                    limit 15
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenAuth('register')}
                    className="text-[11px] text-gray-500 hover:text-[#0F2942] font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Lock size={11} />
                    <span>Po registraci</span>
                  </button>
                </div>
              ) : (
                <span className="px-3 py-1 rounded-full bg-[#FDE68A]/80 text-[#92400E] text-xs font-black shrink-0">
                  {Math.min(MAX_STREAK_DAYS, streak)} / {MAX_STREAK_DAYS} dní
                </span>
              )}
            </div>

            {!isGuest && (
              <div className="grid grid-cols-10 gap-1.5 pt-0.5">
                {Array.from({ length: MAX_STREAK_DAYS }).map((_, idx) => {
                  const isActiveDay = idx < streak;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'h-2 rounded-full transition-colors',
                        isActiveDay ? 'bg-[#2B44B8]' : 'bg-[#E6DFC8]'
                      )}
                      title={`Den ${idx + 1}`}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* CARD 2: POZVI KAMARÁDA */}
          <div className="rounded-3xl bg-[#FCF9F1] border border-[#EFEAD8] p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#DCFCE7] text-[#166534] flex items-center justify-center shrink-0">
                  <Users size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-sm sm:text-base text-[#0F2942] leading-snug">
                    Pozvi kamaráda
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    {isGuest
                      ? 'Za každého kamaráda dostanete oba +30. Až 5 doporučení.'
                      : 'Za každého dostanete oba +30 žolíků.'}
                  </p>
                </div>
              </div>

              {isGuest ? (
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#DCFCE7] text-[#166534] text-[11px] font-black">
                    +30 pro oba
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenAuth('register')}
                    className="text-[11px] text-gray-500 hover:text-[#0F2942] font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Lock size={11} />
                    <span>Po registraci</span>
                  </button>
                </div>
              ) : (
                <span className="px-3 py-1 rounded-full bg-[#DCFCE7] text-[#166534] text-xs font-black shrink-0">
                  {currentReferrals} / {MAX_REFERRALS}
                </span>
              )}
            </div>

            {!isGuest && (
              <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap pt-0.5">
                <div className="grid grid-cols-5 gap-1.5 flex-1 min-w-[210px]">
                  {Array.from({ length: MAX_REFERRALS }).map((_, idx) => {
                    const isClaimed = currentReferrals >= idx + 1;
                    return (
                      <div
                        key={idx}
                        className={cn(
                          'h-8 rounded-xl text-xs flex items-center justify-center gap-0.5 transition-colors',
                          isClaimed
                            ? 'bg-[#DCFCE7] text-[#166534] font-black'
                            : 'bg-white/80 border border-[#E6DFC8] text-gray-500 font-bold'
                        )}
                      >
                        {isClaimed && <Check size={12} strokeWidth={3} />}
                        <span>+30</span>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleCopyReferral}
                  className="h-8 px-4 rounded-full bg-white hover:bg-gray-50 border border-gray-300 text-[#0F2942] font-bold text-xs shrink-0 transition-colors cursor-pointer"
                >
                  {isCopied ? 'Zkopírováno!' : 'Zkopírovat odkaz'}
                </button>
              </div>
            )}
          </div>

          {/* CARD 3: RYCHLÝ DOTAZNÍK */}
          <div className="rounded-3xl bg-[#FCF9F1] border border-[#EFEAD8] p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#DBEAFE] text-[#1E40AF] flex items-center justify-center shrink-0">
                  <ClipboardList size={18} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-black text-sm sm:text-base text-[#0F2942] leading-snug">
                    Rychlý dotazník
                  </h3>
                  <p className="text-xs text-gray-500 font-medium">
                    {isGuest
                      ? 'Tři krátké otázky, žolíky navíc k dennímu limitu.'
                      : 'Tři krátké otázky, jednorázový bonus.'}
                  </p>
                </div>
              </div>

              {isGuest ? (
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#DBEAFE] text-[#1E40AF] text-[11px] font-black">
                    +15 žolíků
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenAuth('register')}
                    className="text-[11px] text-gray-500 hover:text-[#0F2942] font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <Lock size={11} />
                    <span>Po registraci</span>
                  </button>
                </div>
              ) : (
                <span className="px-3 py-1 rounded-full bg-[#DBEAFE] text-[#1E40AF] text-xs font-black shrink-0">
                  +15 žolíků
                </span>
              )}
            </div>

            {!isGuest && (
              <div>
                {profile?.surveyCompleted ? (
                  <div className="w-full h-10 rounded-full bg-[#DCFCE7] text-[#166534] font-black text-xs flex items-center justify-center gap-1.5">
                    <Check size={14} strokeWidth={2.5} />
                    <span>Dotazník vyplněn (+15 žolíků připsáno)</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsSurveyModalOpen(true)}
                    className="w-full h-10 rounded-full bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black text-xs sm:text-sm flex items-center justify-center transition-colors cursor-pointer"
                  >
                    Vyplnit dotazník
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BOTTOM GUEST REGISTRATION BANNER */}
      {isGuest && (
        <div className="rounded-2xl bg-[#EEF5FF] border border-[#BFDBFE]/80 px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h3 className="font-black text-sm sm:text-base text-[#0F2942]">
              Zaregistruj se zdarma a odemkni všechny bonusy
            </h3>
            <p className="text-xs text-gray-500 font-medium">
              Série, doporučení i dotazník: až +165 žolíků navíc a vyšší denní limit.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenAuth('register')}
              className="px-5 py-2.5 rounded-full bg-[#FACC15] hover:bg-[#EAB308] text-[#0F2942] font-black text-xs sm:text-sm transition-colors cursor-pointer"
            >
              Registrovat se
            </button>
            <button
              type="button"
              onClick={() => handleOpenAuth('login')}
              className="px-5 py-2.5 rounded-full bg-white hover:bg-gray-50 border border-gray-300 text-[#0F2942] font-bold text-xs sm:text-sm transition-colors cursor-pointer"
            >
              Přihlásit se
            </button>
          </div>
        </div>
      )}

      {/* DOTAZNÍK MODAL PRO PŘIHLÁŠENÉ */}
      <Dialog open={isSurveyModalOpen} onOpenChange={setIsSurveyModalOpen}>
        <DialogContent className="max-w-md p-6 sm:p-7 rounded-3xl bg-white border border-gray-200 shadow-2xl">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#DBEAFE] text-[#1E40AF] flex items-center justify-center shrink-0">
                <ClipboardList size={20} />
              </div>
              <div>
                <DialogTitle className="font-black text-lg text-[#0F2942]">
                  Rychlý dotazník (+15 žolíků)
                </DialogTitle>
                <DialogDescription className="text-xs text-gray-500 font-medium">
                  Zodpověz 3 krátké otázky a okamžitě ti připíšeme 15 žolíků nad denní limit.
                </DialogDescription>
              </div>
            </div>

            <form onSubmit={handleSurveySubmit} className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#0F2942] block">
                  1. Odkud jste o nás slyšeli?
                </label>
                <select
                  value={selectedSurveyOption}
                  onChange={(e) => setSelectedSurveyOption(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white font-medium focus:outline-none focus:border-[#2563EB] cursor-pointer"
                >
                  <option value="">-- Vyber možnost --</option>
                  {SURVEY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {selectedSurveyOption === 'Jiné' && (
                <input
                  type="text"
                  value={customSurveyText}
                  onChange={(e) => setCustomSurveyText(e.target.value)}
                  placeholder="Uveďte odkud..."
                  maxLength={100}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-[#2563EB]"
                />
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#0F2942] block">
                  2. Na jakou školu chodíš?
                </label>
                <input
                  type="text"
                  value={surveySchool}
                  onChange={(e) => setSurveySchool(e.target.value)}
                  placeholder="např. ZŠ Novoborská, Praha"
                  maxLength={150}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#0F2942] block">
                  3. Do kterého ročníku?
                </label>
                <select
                  value={surveyGrade}
                  onChange={(e) => setSurveyGrade(e.target.value)}
                  className="w-full text-xs sm:text-sm px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white font-medium focus:outline-none focus:border-[#2563EB] cursor-pointer"
                >
                  <option value="">-- Vyber ročník --</option>
                  {GRADE_OPTIONS.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSurveyModalOpen(false)}
                  className="px-4 py-2.5 rounded-full border border-gray-200 hover:bg-gray-50 text-gray-600 font-bold text-xs cursor-pointer"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  disabled={
                    !selectedSurveyOption ||
                    !surveySchool.trim() ||
                    !surveyGrade ||
                    isSubmittingSurvey
                  }
                  className="px-6 py-2.5 rounded-full bg-[#FACC15] hover:bg-[#EAB308] disabled:opacity-50 disabled:pointer-events-none text-[#0F2942] font-black text-xs sm:text-sm transition-colors cursor-pointer"
                >
                  {isSubmittingSurvey ? 'Odesílám...' : 'Odeslat a získat +15'}
                </button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rewarded video modal */}
      <RewardedAdModal
        open={isVideoModalOpen}
        onOpenChange={setIsVideoModalOpen}
        onRewardEarned={handleVideoRewardEarned}
        isGuest={isGuest}
        guestVideosWatched={guestState.videosWatched}
        rewardAmount={5}
        isLimitReached={isVideoLimitReached}
      />
    </section>
  );
}
