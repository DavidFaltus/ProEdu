import React, { useState } from 'react';
import { 
  Sparkles, Flame, Play, Gift, Share2, Copy, Check, Lock, 
  CheckCircle2, ArrowRight, Info, AlertCircle 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { toast } from 'sonner';
import RewardedAdModal from './common/RewardedAdModal';
import { 
  recordGuestVideo, 
  getGuestState, 
  GUEST_MAX_VIDEOS,
  BASE_JOKER_CAP,
  MAX_STREAK_DAYS,
  REFERRAL_REWARD_JOKERS,
  SURVEY_REWARD_JOKERS,
  MAX_REFERRALS,
  getTodayDateString
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
  const [isCopied, setIsCopied] = useState(false);
  const [selectedSurveyOption, setSelectedSurveyOption] = useState<string>('');
  const [customSurveyText, setCustomSurveyText] = useState<string>('');
  const [surveySchool, setSurveySchool] = useState<string>('');
  const [surveyGrade, setSurveyGrade] = useState<string>('');
  const [isSubmittingSurvey, setIsSubmittingSurvey] = useState(false);

  // Stav pro nepřihlášené hosty: uživatel je host pouze pokud nemá profil ani Firebase user objekt, nebo jde o hosta v dev módu
  const [guestState, setGuestState] = useState(() => getGuestState());
  const isGuest = (!user && !profile) || user?.uid === 'guest-preview' || profile?.uid === 'guest-preview';

  const today = getTodayDateString();
  const hasDailyGrantToday = profile?.lastDailyGrantDate === today;
  const hasPracticedToday = profile?.lastStreakPracticeDate === today;
  const isCapped = !isGuest && jokers >= maxJokersCap;
  const currentReferrals = Math.min(MAX_REFERRALS, profile?.referralsCount || 0);

  // Unikátní odkaz pro doporučení
  const referralCode = profile?.referralCode || profile?.uid || '';
  const referralUrl = typeof window !== 'undefined' && referralCode
    ? `${window.location.origin}/?ref=${referralCode}`
    : '';

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
      toast.success(`Video zhlédnuto (${res.videosWatched}/${GUEST_MAX_VIDEOS}). Pro uložení postupu a žolíků se bezplatně zaregistruj!`);
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
    } finally {
      setIsSubmittingSurvey(false);
    }
  };

  // Pokud ještě probíhá zjišťování přihlášení a profil není k dispozici ani z cache,
  // sekci dočasně neskicujeme, aby se zamezilo probliknutí uzamčených karet či probliknutí u Premium/učitele
  if (loading && !profile) {
    return null;
  }

  // Pokud je uživatel Premium nebo lektor (či jiná vyšší role), sekce se vůbec nezobrazuje
  if (isPremium) {
    return null;
  }

  return (
    <section className="bg-white rounded-[2rem] border border-gray-200/80 shadow-md p-4 sm:p-6 lg:p-7 space-y-6 relative overflow-hidden">
      {/* Decentní barevný přechod v pozadí */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-yellow-200/25 via-amber-100/15 to-transparent rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100 relative">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-inner shrink-0 text-lg">
              🃏
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-display font-black text-[#1E1B18] tracking-tight">
                Herní zóna žolíků
              </h2>
              <p className="text-gray-500 text-xs sm:text-sm font-medium">
                Získej bonusové žolíky bez limitu za doporučení a dotazník, drž streak a dobíjej energii videem.
              </p>
            </div>
          </div>
        </div>

        {/* Joker status pill */}
        <div className="flex items-center gap-2.5 self-start sm:self-auto bg-[#FAF7F0] border border-gray-200/80 px-3.5 py-1.5 rounded-2xl shadow-2xs">
          <div className="flex items-center gap-1.5">
            <span className="text-base">🃏</span>
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Žolíky:</span>
            <span className="font-mono font-black text-sm text-[#1E1B18]">
              {isGuest ? '20' : jokers}
            </span>
            {!isGuest && (
              <span className="text-xs font-bold text-gray-400">
                / {maxJokersCap}
              </span>
            )}
          </div>

          {!isGuest && streak > 0 && (
            <div className="flex items-center gap-1 pl-2 border-l border-gray-200 text-amber-700 font-black text-xs">
              <Flame size={14} className="fill-current text-amber-500" />
              <span>{streak}d</span>
            </div>
          )}

          {!isGuest && jokers > maxJokersCap && (
            <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 font-extrabold text-[10px] tracking-tight border border-emerald-200">
              +{jokers - maxJokersCap} bonus!
            </span>
          )}
        </div>
      </div>

      {/* 4 INTERACTIVE TILES GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 items-stretch relative">
        
        {/* ========================================================
            TILE 1: 10DENNÍ STREAK & KAPACITA (DENNÍ PŘÍDĚL)
           ======================================================== */}
        <div className="rounded-2xl bg-[#FAF7F0] border border-gray-200/70 p-4 sm:p-5 flex flex-col justify-between space-y-4 relative">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center text-base shadow-2xs">
                  <Flame size={17} className="fill-current" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#1E1B18]">10denní streak</h3>
                  <p className="text-[11px] font-semibold text-gray-500">Zvyšuje limit až na 30</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-white border border-gray-200 font-mono font-black text-xs text-orange-600 shadow-2xs">
                {isGuest ? '0/10' : `${streak}/10`} dní
              </span>
            </div>

            {/* Streak dots progress */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-gray-600">Aktuální limit:</span>
                <span className="font-black text-[#1E1B18]">
                  {isGuest ? '20' : maxJokersCap} žolíků
                </span>
              </div>
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: MAX_STREAK_DAYS }).map((_, idx) => {
                  const dayNum = idx + 1;
                  const isActive = !isGuest && streak >= dayNum;
                  return (
                    <div
                      key={dayNum}
                      className={cn(
                        "h-2 rounded-full transition-all duration-300",
                        isActive
                          ? "bg-gradient-to-r from-amber-500 to-orange-500 shadow-2xs"
                          : "bg-gray-200"
                      )}
                      title={`Den ${dayNum}: limit ${BASE_JOKER_CAP + dayNum} žolíků`}
                    />
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 font-bold px-0.5">
                <span>Základ 20</span>
                <span>Max 30 🎯</span>
              </div>
            </div>

            {/* Daily status box */}
            <div className="rounded-xl bg-white p-3 border border-gray-200/80 text-xs space-y-1 shadow-2xs">
              <div className="flex items-center gap-1.5 text-[#1E1B18] font-bold">
                <span className="text-amber-500 text-sm">✨</span>
                <span>Denní příděl: +5 žolíků</span>
              </div>
              <p className="text-[11px] text-gray-500 font-medium leading-relaxed">
                {isGuest ? (
                  'Každý den se ti přičte +5 žolíků do kapacity dané streakem.'
                ) : hasDailyGrantToday ? (
                  <span className="text-emerald-700 font-bold flex items-center gap-1">
                    <CheckCircle2 size={12} /> Dnešní příděl byl úspěšně připsán!
                  </span>
                ) : (
                  'Připíše se automaticky dnes při prvním přístupu.'
                )}
              </p>
            </div>
          </div>

          {/* Action or Streak extension prompt */}
          <div>
            {isGuest ? (
              <Button
                size="sm"
                onClick={openAuthModal}
                className="w-full rounded-xl bg-[#1E1B18] hover:bg-black text-white font-bold text-xs h-9 cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <Lock size={12} className="text-amber-400" />
                <span>Registrace pro streak</span>
              </Button>
            ) : hasPracticedToday ? (
              <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold text-center flex items-center justify-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                <span>Dnešní streak splněn! 🔥</span>
              </div>
            ) : (
              <div className="p-2 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-[11px] font-bold text-center flex items-center justify-center gap-1">
                <span>⚡ Vyřeš dnes 1 cvičení a zvedni streak!</span>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================
            TILE 2: DOBÍT ŽOLÍKY VIDEEM (+5 DO KAPACITY)
           ======================================================== */}
        <div className="rounded-2xl bg-[#FAF7F0] border border-gray-200/70 p-4 sm:p-5 flex flex-col justify-between space-y-4 relative">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-yellow-100 text-yellow-700 flex items-center justify-center text-base shadow-2xs">
                  <Play size={16} className="fill-current" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#1E1B18]">Dobít videem</h3>
                  <p className="text-[11px] font-semibold text-gray-500">15s sponzorované video</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 font-black text-xs border border-amber-200 shadow-2xs">
                +5 žolíků
              </span>
            </div>

            <p className="text-xs text-gray-600 font-medium leading-relaxed">
              Zhlédni krátké video a doplň si energii na procvičování otázek až do výše tvé kapacity.
            </p>

            {/* Capacity gauge */}
            <div className="rounded-xl bg-white p-3 border border-gray-200/80 space-y-2 shadow-2xs">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-gray-500">Stav kapacity:</span>
                <span className={cn(
                  "font-mono font-black",
                  isCapped ? "text-amber-600" : "text-[#1E1B18]"
                )}>
                  {isGuest ? 'Host' : `${jokers} / ${maxJokersCap}`}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    isCapped 
                      ? "bg-gradient-to-r from-amber-500 to-yellow-400" 
                      : "bg-[#1E1B18]"
                  )}
                  style={{ 
                    width: `${Math.min(100, Math.round(((isGuest ? 20 : jokers) / (isGuest ? 20 : maxJokersCap)) * 100))}%` 
                  }}
                />
              </div>
              <p className="text-[10px] text-gray-400 font-semibold text-center">
                {isCapped 
                  ? 'Máš plnou kapacitu – nelze dobít nad limit' 
                  : 'Sledování videa nepřekročí tvůj limit'}
              </p>
            </div>
          </div>

          {/* Action button */}
          <div>
            {isCapped ? (
              <Button
                disabled
                size="sm"
                className="w-full rounded-xl bg-gray-100 border border-gray-200 text-gray-400 font-bold text-xs h-9 cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 size={13} className="text-emerald-500" />
                <span>Kapacita je plná ({jokers}/{maxJokersCap})</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setIsVideoModalOpen(true)}
                className="w-full rounded-xl bg-amber-400 hover:bg-amber-500 text-black font-black text-xs h-9 cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs transition-transform hover:scale-[1.02]"
              >
                <Play size={13} className="fill-current" />
                <span>Zhlédnout video (+5)</span>
              </Button>
            )}
          </div>
        </div>

        {/* ========================================================
            TILE 3: POZVI KAMARÁDA (+50 ŽOLÍKŮ PRO OBA)
           ======================================================== */}
        <div className="rounded-2xl bg-[#FAF7F0] border border-gray-200/70 p-4 sm:p-5 flex flex-col justify-between space-y-4 relative">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center text-base shadow-2xs">
                  <Gift size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#1E1B18]">Doporuč kamaráda</h3>
                  <p className="text-[11px] font-semibold text-emerald-700">Bonusová aktivita</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 font-black text-xs border border-emerald-200 shadow-2xs">
                +50 pro oba
              </span>
            </div>

            <p className="text-xs text-gray-600 font-medium leading-relaxed">
              Za každého kamaráda, který se zaregistruje přes tvůj odkaz, získáte <strong>oba +50 žolíků bez limitu</strong>.
            </p>

            {/* Referral slots 5x */}
            <div className="rounded-xl bg-white p-3 border border-gray-200/80 space-y-2 shadow-2xs">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="text-gray-500">Využito doporučení:</span>
                <span className="font-mono font-black text-emerald-700">
                  {isGuest ? '0 / 5' : `${currentReferrals} / ${MAX_REFERRALS}`}
                </span>
              </div>

              {/* 5 slot badges */}
              <div className="grid grid-cols-5 gap-1.5 pt-0.5">
                {Array.from({ length: MAX_REFERRALS }).map((_, idx) => {
                  const slotNum = idx + 1;
                  const isClaimedSlot = !isGuest && currentReferrals >= slotNum;
                  return (
                    <div
                      key={slotNum}
                      className={cn(
                        "h-8 rounded-lg flex items-center justify-center text-xs font-black transition-all",
                        isClaimedSlot
                          ? "bg-emerald-500 text-white shadow-2xs"
                          : "bg-gray-100 text-gray-400 border border-dashed border-gray-300"
                      )}
                      title={isClaimedSlot ? `Doporučení ${slotNum} vyplaceno (+50)` : `Slot ${slotNum}: volný`}
                    >
                      {isClaimedSlot ? <Check size={14} /> : `+50`}
                    </div>
                  );
                })}
              </div>

              <p className="text-[10px] text-gray-400 font-semibold text-center">
                Maximálně 5 doporučení (až +250 žolíků)
              </p>
            </div>
          </div>

          {/* Copy link or Guest lock */}
          <div>
            {isGuest ? (
              <Button
                size="sm"
                onClick={openAuthModal}
                className="w-full rounded-xl bg-[#1E1B18] hover:bg-black text-white font-bold text-xs h-9 cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <Lock size={12} className="text-amber-400" />
                <span>Odemknout doporučení</span>
              </Button>
            ) : currentReferrals >= MAX_REFERRALS ? (
              <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold text-center flex items-center justify-center gap-1">
                <span>🎉 Všech 5 doporučení splněno!</span>
              </div>
            ) : (
              <Button
                size="sm"
                onClick={handleCopyReferral}
                className="w-full rounded-xl bg-[#1E1B18] hover:bg-black text-white font-bold text-xs h-9 cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs transition-transform hover:scale-[1.02]"
              >
                {isCopied ? (
                  <>
                    <Check size={13} className="text-emerald-400" />
                    <span>Zkopírováno do schránky</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} className="text-amber-400" />
                    <span>Kopírovat odkaz pro kamarády</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        {/* ========================================================
            TILE 4: ODKUD JSTE O NÁS SLYŠELI ? (+20 ŽOLÍKŮ)
           ======================================================== */}
        <div className="rounded-2xl bg-[#FAF7F0] border border-gray-200/70 p-4 sm:p-5 flex flex-col justify-between space-y-4 relative">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center text-base shadow-2xs">
                  <Share2 size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#1E1B18] line-clamp-1">
                    Odkud jste o nás slyšeli ?
                  </h3>
                  <p className="text-[11px] font-semibold text-blue-700">Jednorázový bonus</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-lg bg-blue-100 text-blue-800 font-black text-xs border border-blue-200 shadow-2xs shrink-0">
                +20 žolíků
              </span>
            </div>

            {/* If completed */}
            {!isGuest && profile?.surveyCompleted ? (
              <div className="rounded-xl bg-white p-3.5 border border-emerald-200/80 text-center space-y-2 shadow-2xs my-auto">
                <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center">
                  <CheckCircle2 size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-emerald-900">Dotazník dokončen!</h4>
                  <p className="text-[10px] text-gray-500 font-medium">
                    +20 bonusových žolíků bylo připsáno k tvému účtu.
                  </p>
                </div>
                <div className="space-y-1 text-[10px] font-bold text-gray-700 text-left bg-[#FAF7F0] p-2 rounded-lg border border-gray-200/60">
                  {profile?.surveyAnswer && (
                    <div className="truncate"><span className="text-gray-400 font-medium">Zdroj:</span> {profile.surveyAnswer}</div>
                  )}
                  {profile?.surveySchool && (
                    <div className="truncate"><span className="text-gray-400 font-medium">Škola:</span> {profile.surveySchool}</div>
                  )}
                  {profile?.surveyGrade && (
                    <div className="truncate"><span className="text-gray-400 font-medium">Ročník:</span> {profile.surveyGrade}</div>
                  )}
                </div>
              </div>
            ) : isGuest ? (
              <div className="space-y-2.5">
                <p className="text-xs text-gray-600 font-medium leading-relaxed">
                  Zodpověz 3 rychlé otázky a získej <strong>+20 žolíků ihned</strong> nad rámec denního limitu.
                </p>
                <div className="rounded-xl bg-white p-3 border border-gray-200/80 space-y-2 shadow-2xs text-xs text-gray-400">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-300" />
                    <span>Odkud o nás víte?</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-300" />
                    <span>Na jakou školu chodíte?</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-300" />
                    <span>Do kterého ročníku?</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Questionnaire Form for registered user who hasn't answered yet */
              <form onSubmit={handleSurveySubmit} className="space-y-2.5">
                {/* 1. Otázka: Odkud jste o nás slyšeli */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                    1. Odkud jste o nás slyšeli?
                  </label>
                  <select
                    value={selectedSurveyOption}
                    onChange={(e) => setSelectedSurveyOption(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white font-medium focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                  >
                    <option value="">-- Vyber možnost --</option>
                    {SURVEY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
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
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-blue-500 shadow-2xs"
                  />
                )}

                {/* 2. Otázka: Na jakou školu chodíš */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                    2. Na jakou školu chodíš?
                  </label>
                  <input
                    type="text"
                    value={surveySchool}
                    onChange={(e) => setSurveySchool(e.target.value)}
                    placeholder="např. ZŠ Novoborská, Praha"
                    maxLength={150}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-blue-500 shadow-2xs"
                  />
                </div>

                {/* 3. Otázka: Do kterého ročníku */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                    3. Do kterého ročníku?
                  </label>
                  <select
                    value={surveyGrade}
                    onChange={(e) => setSurveyGrade(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white font-medium focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                  >
                    <option value="">-- Vyber ročník --</option>
                    {GRADE_OPTIONS.map((grade) => (
                      <option key={grade} value={grade}>{grade}</option>
                    ))}
                  </select>
                </div>
              </form>
            )}
          </div>

          {/* Action button */}
          <div>
            {isGuest ? (
              <Button
                size="sm"
                onClick={openAuthModal}
                className="w-full rounded-xl bg-[#1E1B18] hover:bg-black text-white font-bold text-xs h-9 cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
              >
                <Lock size={12} className="text-amber-400" />
                <span>Registrace pro +20 žolíků</span>
              </Button>
            ) : profile?.surveyCompleted ? (
              <div className="p-2 rounded-xl bg-gray-100 border border-gray-200 text-gray-500 text-[11px] font-bold text-center">
                Bonus již byl vyplacen
              </div>
            ) : (
              <Button
                size="sm"
                disabled={!selectedSurveyOption || !surveySchool.trim() || !surveyGrade || isSubmittingSurvey}
                onClick={handleSurveySubmit}
                className="w-full rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs h-9 cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingSurvey ? (
                  <span>Odesílám...</span>
                ) : (
                  <>
                    <span>Odeslat dotazník (+20)</span>
                    <ArrowRight size={13} />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

      </div>

      {/* Rewarded video modal */}
      <RewardedAdModal
        open={isVideoModalOpen}
        onOpenChange={setIsVideoModalOpen}
        onRewardEarned={handleVideoRewardEarned}
        isGuest={isGuest}
        guestVideosWatched={guestState.videosWatched}
        rewardAmount={5}
      />
    </section>
  );
}