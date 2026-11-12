import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Play,
  RotateCcw,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Flame,
  BookOpen,
  ArrowRight,
  HelpCircle,
  BarChart3,
  Search,
  Lock,
  Layers,
  Target,
  Zap
} from 'lucide-react';
import CustomIcon, {
  BrainPinkIcon,
  BookCyanIcon,
  StarPinkIcon,
  StarYellowIcon,
  CorrectCyanIcon,
  HeartPinkIcon,
  BulbYellowIcon,
  CustomIconName
} from '../components/common/CustomIcon';
import UnifiedPaywallModal from '../components/common/UnifiedPaywallModal';
import PracticeScheduleModal from '../components/PracticeScheduleModal';
import AttemptDetailsModal from '../components/statistics/AttemptDetailsModal';
import ErrorTypeDetailModal from '../components/statistics/ErrorTypeDetailModal';
import { PracticeSubtopic } from '../types';
import { cn } from '../lib/utils';
import { trackSectionClick } from '../services/analyticsService';
import {
  fetchStudentRawStatisticsData,
  computeStudentStatistics,
  getDemoStatisticsPreview,
  StatsSubjectFilter,
  StatsPeriodFilter,
  MasteryStatus,
  StudentAttemptRecord,
  SubtopicMasteryItem,
  TopicChapterGroup,
  SmartRecommendationItem,
  STATS_THRESHOLDS
} from '../services/statisticsService';

export default function Statistics() {
  const { user, profile, isPremium, streak } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rawData, setRawData] = useState<Awaited<ReturnType<typeof fetchStudentRawStatisticsData>> | null>(null);

  // 3.1 Filtry: Výchozí hodnoty Vše a 7 dní. Ukládají se do localStorage per uživatel.
  const storagePrefix = user?.uid ? `proedu_stats_${user.uid}_` : 'proedu_stats_guest_';

  const [subjectFilter, setSubjectFilter] = useState<StatsSubjectFilter>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}subject`);
      if (saved === 'Matematika' || saved === 'Čeština' || saved === 'Vše') return saved;
    } catch {}
    return 'Vše';
  });

  const [periodFilter, setPeriodFilter] = useState<StatsPeriodFilter>(() => {
    try {
      const saved = localStorage.getItem(`${storagePrefix}period`);
      if (saved === 'all' || saved === '30d' || saved === '7d') return saved;
    } catch {}
    return '7d';
  });

  // Uložení filtrů do localStorage
  useEffect(() => {
    try {
      localStorage.setItem(`${storagePrefix}subject`, subjectFilter);
      localStorage.setItem(`${storagePrefix}period`, periodFilter);
    } catch {}
  }, [subjectFilter, periodFilter, storagePrefix]);

  // Filtry mapy témat: Vše / K doučení / Zvládnuto
  const [mapFilter, setMapFilter] = useState<'all' | 'needs_work' | 'mastered'>('all');
  const [isAllChaptersExpanded, setIsAllChaptersExpanded] = useState(false);
  const [collapsedChapters, setCollapsedChapters] = useState<Record<string, boolean>>({});

  // Historie pokusů (ve výchozím stavu sbalená, kap. 3.7)
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(10);

  // Modaly
  const [selectedAttemptForDetails, setSelectedAttemptForDetails] = useState<StudentAttemptRecord | null>(null);
  const [isErrorTypesModalOpen, setIsErrorTypesModalOpen] = useState(false);
  const [isPaywallDismissed, setIsPaywallDismissed] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleInitialSubtopics, setScheduleInitialSubtopics] = useState<PracticeSubtopic[]>([]);
  const [scheduleInitialSubject, setScheduleInitialSubject] = useState<'Matematika' | 'Čeština'>('Matematika');
  const [todos, setTodos] = useState<any[]>([]);

  // Načtení surových dat
  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetchStudentRawStatisticsData(user?.uid);
        if (isMounted) {
          setRawData(res);
        }
      } catch (err) {
        console.error('Failed to load statistics data:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [user?.uid]);

  // Načtení todos pro studijní plánovač
  useEffect(() => {
    if (!user?.uid) return;
    const qTodos = query(
      collection(db, 'todos'),
      where('studentId', '==', user.uid),
      limit(300)
    );
    const unsub = onSnapshot(
      qTodos,
      snap => {
        setTodos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      err => {
        console.warn('Error fetching todos in Statistics:', err);
      }
    );
    return () => unsub();
  }, [user?.uid]);

  // Výpočet statistik podle nové doporučovací logiky a pravidel
  const stats = useMemo(() => {
    if (!rawData) {
      return getDemoStatisticsPreview();
    }
    if (!isPremium && rawData.attempts.length === 0) {
      return getDemoStatisticsPreview();
    }
    return computeStudentStatistics(
      rawData,
      subjectFilter,
      periodFilter,
      streak || profile?.streak || 0
    );
  }, [rawData, isPremium, subjectFilter, periodFilter, streak, profile?.streak]);

  // Otevření plánovače do kalendáře s předvyplněným tématem
  const handleOpenSchedule = (subtopicId: string, title: string, subject: 'Matematika' | 'Čeština', topicId = '') => {
    const mapped: PracticeSubtopic = {
      id: subtopicId,
      title,
      topicId,
      subjectId: subject
    };
    setScheduleInitialSubject(subject);
    setScheduleInitialSubtopics([mapped]);
    setIsScheduleModalOpen(true);
  };

  const toggleChapterCollapse = (topicId: string) => {
    setCollapsedChapters(prev => ({ ...prev, [topicId]: !prev[topicId] }));
  };

  // Filtrované kapitoly v mapě témat (zobrazuje pouze cvičená témata dle kap. 3.4)
  const filteredChapters = useMemo(() => {
    return stats.topicChapters
      .map(chap => {
        const filteredSubs = chap.subtopics.filter(sub => {
          // Nezačatá témata se do mapy nepromítají (kap. 3.4)
          if (sub.attemptsCount === 0) return false;
          if (mapFilter === 'needs_work') return sub.status === 'critical' || sub.status === 'needs_practice';
          if (mapFilter === 'mastered') return sub.status === 'mastered';
          return true;
        });

        return {
          ...chap,
          subtopics: filteredSubs
        };
      })
      .filter(chap => chap.subtopics.length > 0);
  }, [stats.topicChapters, mapFilter]);

  // Limit na prvních 5-6 kapitol, pokud není rozkliknuto "Zobrazit všechna témata"
  const visibleChapters = isAllChaptersExpanded
    ? filteredChapters
    : filteredChapters.slice(0, 5);

  const formatAttemptDate = (date: Date) => {
    try {
      return date.toLocaleDateString('cs-CZ', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };

  const getAttemptWord = (count: number) => {
    if (count === 1) return 'pokus';
    if (count >= 2 && count <= 4) return 'pokusy';
    return 'pokusů';
  };

  if (loading) {
    return (
      <div className="page-container max-w-7xl mx-auto space-y-8 pb-16 animate-pulse">
        <div className="h-10 bg-gray-200 rounded-2xl w-64 mx-auto" />
        <div className="h-5 bg-gray-200 rounded-xl w-96 mx-auto" />
        <div className="h-44 bg-gray-200 rounded-3xl w-full" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-32 bg-gray-200 rounded-3xl" />
          <div className="h-32 bg-gray-200 rounded-3xl" />
          <div className="h-32 bg-gray-200 rounded-3xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-container max-w-7xl mx-auto space-y-8 pb-16">
      {/* ========================================================= */}
      {/* 3.1 HLAVIČKA A FILTRY (ZAROVNÁNO NA STŘED)                */}
      {/* ========================================================= */}
      <section className="text-center space-y-3.5 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100/70 text-amber-900 text-xs font-black uppercase tracking-wider">
          <Sparkles size={13} className="text-amber-600" />
          <span>Analýza znalostí & příprava na CERMAT</span>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-playful text-[#1E1B18] tracking-tight leading-tight">
          Moje statistiky
        </h1>
        <p className="text-sm sm:text-base md:text-lg text-gray-500 font-medium leading-relaxed max-w-2xl mx-auto">
          Podrobný přehled tvé úspěšnosti, zvládnutí témat k přijímačkám a konkrétní další kroky pro maximální skóre.
        </p>

        {/* Dva přepínače: Předmět a Období */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
          {/* Přepínač předmětu */}
          <div 
            role="group" 
            aria-label="Filtr předmětu"
            className="bg-white p-1 rounded-2xl border border-gray-200/90 shadow-2xs flex items-center gap-1"
          >
            {(['Vše', 'Matematika', 'Čeština'] as StatsSubjectFilter[]).map(subj => {
              const active = subjectFilter === subj;
              return (
                <button
                  key={subj}
                  type="button"
                  onClick={() => setSubjectFilter(subj)}
                  aria-pressed={active}
                  className={cn(
                    "px-3.5 sm:px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none",
                    active
                      ? "bg-[#1E1B18] text-white shadow-xs"
                      : "text-gray-600 hover:text-[#1E1B18] hover:bg-gray-100"
                  )}
                >
                  {subj}
                </button>
              );
            })}
          </div>

          {/* Přepínač období */}
          <div 
            role="group" 
            aria-label="Filtr období"
            className="bg-white p-1 rounded-2xl border border-gray-200/90 shadow-2xs flex items-center gap-1"
          >
            {[
              { id: '7d', label: '7 dní' },
              { id: '30d', label: '30 dní' },
              { id: 'all', label: 'Celá historie' }
            ].map(p => {
              const active = periodFilter === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodFilter(p.id as StatsPeriodFilter)}
                  aria-pressed={active}
                  className={cn(
                    "px-3.5 sm:px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none",
                    active
                      ? "bg-[#F5C400] text-[#1E1B18] shadow-xs"
                      : "text-gray-600 hover:text-[#1E1B18] hover:bg-gray-100"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3.2 TVŮJ DALŠÍ KROK (HLAVNÍ DOPORUČENÍ)                   */}
      {/* ========================================================= */}
      <section aria-labelledby="next-step-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="next-step-heading" className="text-lg sm:text-xl font-black text-[#0F2942] tracking-tight flex items-center gap-2">
            <Zap size={20} className="text-[#F5C400] fill-current" />
            <span>Tvůj další krok</span>
          </h2>
          <span className="text-xs font-bold text-gray-500 hidden sm:inline">
            Vygenerováno z analýzy tvých odpovědí
          </span>
        </div>

        {stats.isNewStudent || !stats.primaryRecommendation ? (
          /* Stav pro nového studenta (0 odpovědí) */
          <Card className="rounded-[2rem] border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-50/40 p-6 sm:p-8 text-center shadow-md relative overflow-hidden">
            <div className="max-w-xl mx-auto space-y-4 relative z-10">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto text-2xl shadow-inner font-bold">
                🎯
              </div>
              <div className="space-y-1.5">
                <h3 className="text-xl sm:text-2xl font-black text-[#0F2942]">
                  Začni prvním cvičením
                </h3>
                <p className="text-xs sm:text-sm text-gray-600 font-medium leading-relaxed">
                  Zatím jsi nedokončil(a) žádné procvičování. Vyzkoušej si libovolné cvičení a náš algoritmus ti okamžitě spočítá úspěšnost a doporučí nejvýhodnější strategii k přijímačkám.
                </p>
              </div>
              <Button
                onClick={() => navigate('/practice')}
                className="h-12 px-7 rounded-2xl bg-[#0F2942] hover:bg-[#1E1B18] text-white font-black text-sm shadow-md cursor-pointer inline-flex items-center gap-2"
              >
                <span>Spustit první procvičování</span>
                <ArrowRight size={16} />
              </Button>
            </div>
          </Card>
        ) : (
          /* Běžný stav: Velká karta s hlavním doporučením + 2 vedlejší návrhy */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* Velká karta: Nejpřínosnější doporučení (7 sloupců) */}
            <Card className="lg:col-span-7 rounded-[2rem] border border-amber-200/90 bg-gradient-to-br from-amber-50/60 via-white to-[#FAF7F0] p-6 sm:p-7 shadow-md flex flex-col justify-between relative overflow-hidden">
              <div className="absolute top-0 right-0 w-44 h-44 bg-amber-200/30 rounded-full blur-3xl pointer-events-none -mr-12 -mt-12" />

              <div className="space-y-4 relative z-10">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200/80">
                      Top doporučení
                    </span>
                    <span className="text-xs font-bold text-gray-500">
                      {stats.primaryRecommendation.topicTitle}
                    </span>
                  </div>

                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-white text-gray-700 border border-gray-200/80 shadow-2xs">
                    ~{stats.primaryRecommendation.estimatedMinutes} min
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-xl sm:text-2xl font-black text-[#0F2942] leading-tight">
                    {stats.primaryRecommendation.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 font-medium leading-relaxed">
                    {stats.primaryRecommendation.reasonText}
                  </p>
                </div>
              </div>

              {/* Tlačítka: Procvičit (primární) a Nejdřív teorie (sekundární) */}
              <div className="pt-5 flex flex-wrap items-center gap-3 relative z-10">
                <Button
                  onClick={() => navigate(`/practice/session/${stats.primaryRecommendation!.subtopicId}`)}
                  className="h-11 px-6 rounded-xl bg-[#0F2942] hover:bg-[#1E1B18] text-white font-black text-xs sm:text-sm shadow-md cursor-pointer flex items-center gap-2"
                >
                  <Play size={14} className="fill-current" />
                  <span>Procvičit</span>
                </Button>

                {stats.primaryRecommendation.hasStudyMaterial && (
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/study/${stats.primaryRecommendation!.subtopicId}`)}
                    className="h-11 px-5 rounded-xl border-gray-200 hover:bg-gray-100 text-[#0F2942] font-bold text-xs sm:text-sm cursor-pointer flex items-center gap-2"
                  >
                    <BookOpen size={14} />
                    <span>Nejdřív teorie</span>
                  </Button>
                )}
              </div>
            </Card>

            {/* Vedlejší karta: 2 další návrhy s možností přidat do studijního plánu (5 sloupců) */}
            <div className="lg:col-span-5 flex flex-col gap-3">
              {stats.secondaryRecommendations.map((rec) => (
                <Card
                  key={rec.subtopicId}
                  className="p-4 sm:p-5 rounded-[1.75rem] border border-gray-200/80 bg-white hover:border-gray-300 transition-all shadow-2xs flex-1 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                        {rec.badgeText}
                      </span>
                      <span className="text-[11px] text-gray-400 font-medium">
                        ~{rec.estimatedMinutes} min
                      </span>
                    </div>

                    <div>
                      <h4 className="font-black text-sm text-[#0F2942] leading-snug line-clamp-1">
                        {rec.title}
                      </h4>
                      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mt-0.5">
                        {rec.reasonText}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 flex items-center justify-between gap-2 border-t border-gray-100 mt-2">
                    <button
                      type="button"
                      onClick={() => handleOpenSchedule(rec.subtopicId, rec.title, rec.subject, rec.topicId)}
                      className="text-[11px] font-bold text-brand-blue hover:text-blue-800 hover:underline transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Calendar size={12} />
                      <span>Přidat do studijního plánu</span>
                    </button>

                    <Button
                      size="sm"
                      onClick={() => navigate(`/practice/session/${rec.subtopicId}`)}
                      className="rounded-xl bg-[#F5C400] hover:bg-[#e0b400] text-[#1E1B18] font-black text-xs h-8 px-3.5 cursor-pointer shadow-2xs"
                    >
                      <span>Procvičit</span>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ========================================================= */}
      {/* 3.3 TŘI SOUHRNNÉ KARTY (KPI)                              */}
      {/* ========================================================= */}
      <section aria-labelledby="kpi-heading" className="space-y-2">
        <h2 id="kpi-heading" className="sr-only">Klíčové metriky výkonu</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Karta 1: Úspěšnost */}
          <Card className="p-5 sm:p-6 rounded-[2rem] border border-gray-200/80 bg-white shadow-2xs flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                Úspěšnost
              </span>
              {stats.kpi.accuracy.hasEnoughData && stats.kpi.accuracy.trend !== null && (
                <span className={cn(
                  "inline-flex items-center gap-1 text-xs font-black px-2 py-0.5 rounded-full",
                  stats.kpi.accuracy.trend >= 0
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                )}>
                  {stats.kpi.accuracy.trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  <span>{stats.kpi.accuracy.trend >= 0 ? `+${stats.kpi.accuracy.trend} %` : `${stats.kpi.accuracy.trend} %`}</span>
                </span>
              )}
            </div>

            <div>
              {!stats.kpi.accuracy.hasEnoughData ? (
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-900 border border-amber-200 font-black text-sm">
                    <AlertTriangle size={14} className="text-amber-600" />
                    <span>Zatím málo dat</span>
                  </span>
                  <div className="text-2xl font-black text-gray-400 pt-1">
                    {stats.kpi.accuracy.totalAnswers} / {STATS_THRESHOLDS.MIN_ANSWERS_FOR_ACCURACY} odpovědí
                  </div>
                </div>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-black text-[#0F2942] tracking-tight">
                    {stats.kpi.accuracy.percentage} %
                  </span>
                </div>
              )}
            </div>

            <p className="text-xs text-gray-500 font-medium leading-relaxed border-t border-gray-100 pt-2.5">
              {stats.kpi.accuracy.description}
            </p>
          </Card>

          {/* Karta 2: Správné odpovědi */}
          <Card className="p-5 sm:p-6 rounded-[2rem] border border-gray-200/80 bg-white shadow-2xs flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                Správné odpovědi
              </span>
              <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-blue-50 text-brand-blue border border-blue-200">
                {stats.kpi.correctAnswers.masteredTopicsCount} z {stats.kpi.correctAnswers.totalTopicsCount} zvládnutých
              </span>
            </div>

            <div>
              <div className="text-3xl sm:text-4xl font-black text-[#0F2942] tracking-tight">
                {stats.kpi.correctAnswers.correctCount} <span className="text-xl sm:text-2xl text-gray-400 font-bold">z {stats.kpi.correctAnswers.totalCount}</span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden mt-3">
                <div
                  className="bg-brand-blue h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${stats.kpi.correctAnswers.totalCount > 0 ? Math.round((stats.kpi.correctAnswers.correctCount / stats.kpi.correctAnswers.totalCount) * 100) : 0}%`
                  }}
                />
              </div>
            </div>

            <p className="text-xs text-gray-500 font-medium leading-relaxed border-t border-gray-100 pt-2.5">
              Zvládnuto {stats.kpi.correctAnswers.masteredTopicsCount} témat s průměrnou úspěšností alespoň 80 %.
            </p>
          </Card>

          {/* Karta 3: Série */}
          <Card className="p-5 sm:p-6 rounded-[2rem] border border-gray-200/80 bg-white shadow-2xs flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                Pravidelnost & Série
              </span>
              <span className="text-xs font-bold text-gray-500">
                {stats.kpi.streak.totalCompletedExercises} cvičení celkem
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Flame size={28} className={stats.kpi.streak.streakDays > 0 ? "text-orange-500 fill-current animate-pulse" : "text-gray-300"} />
                <span className="text-3xl sm:text-4xl font-black text-[#0F2942] tracking-tight">
                  {stats.kpi.streak.streakDays} {stats.kpi.streak.streakDays === 1 ? 'den' : stats.kpi.streak.streakDays < 5 ? 'dny' : 'dní'}
                </span>
              </div>

              {/* Mini-pruh posledních 7 dní */}
              <div className="flex items-center justify-between gap-1 pt-1">
                {stats.kpi.streak.last7Days.map((d) => (
                  <div key={d.date} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-bold text-gray-400">{d.dayName}</span>
                    <div
                      className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all",
                        d.isActive
                          ? "bg-emerald-500 text-white shadow-xs"
                          : "bg-gray-100 text-gray-400 border border-gray-200/60"
                      )}
                      title={`${d.date}: ${d.isActive ? 'Aktivní' : 'Bez tréninku'}`}
                    >
                      {d.isActive ? '✓' : '•'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-500 font-medium leading-relaxed border-t border-gray-100 pt-2.5">
              {stats.kpi.streak.motivationalText}
            </p>
          </Card>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3.4 MAPA TÉMAT                                            */}
      {/* ========================================================= */}
      <section aria-labelledby="topic-map-heading" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 id="topic-map-heading" className="text-lg sm:text-xl font-black text-[#0F2942] tracking-tight flex items-center gap-2">
              <Layers size={20} className="text-brand-blue" />
              <span>Mapa témat k přijímačkám</span>
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              Seskupeno po kapitolách, seřazeno podle naléhavosti procvičení
            </p>
          </div>

          {/* Filtry mapy: Vše, K doučení, Zvládnuto */}
          <div 
            role="group" 
            aria-label="Filtr stavu témat"
            className="bg-white p-1 rounded-2xl border border-gray-200/90 shadow-2xs flex items-center gap-1 self-start sm:self-auto"
          >
            {[
              { id: 'all', label: 'Vše' },
              { id: 'needs_work', label: 'K doučení' },
              { id: 'mastered', label: 'Zvládnuto' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMapFilter(tab.id as any)}
                aria-pressed={mapFilter === tab.id}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                  mapFilter === tab.id
                    ? "bg-[#1E1B18] text-white shadow-xs"
                    : "text-gray-600 hover:text-[#1E1B18] hover:bg-gray-100"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredChapters.length === 0 ? (
          <Card className="p-8 text-center rounded-[2rem] border border-dashed border-gray-200 bg-white space-y-2">
            <p className="text-sm font-bold text-gray-700">
              V této kategorii zatím nemáš žádná procvičená témata.
            </p>
            <p className="text-xs text-gray-500">
              Vyzkoušej nové cvičení a sleduj, jak se téma zařadí do mapy.
            </p>
          </Card>
        ) : (
          <div className="space-y-3.5">
            {visibleChapters.map(chap => {
              const isCollapsed = collapsedChapters[chap.topicId] ?? (chap.averagePercentage >= STATS_THRESHOLDS.MASTERY_PERCENTAGE);

              return (
                <Card
                  key={chap.topicId}
                  className="rounded-[1.75rem] border border-gray-200/80 bg-white overflow-hidden shadow-2xs transition-all"
                >
                  {/* Rozbalitelná hlavička kapitoly */}
                  <div
                    onClick={() => toggleChapterCollapse(chap.topicId)}
                    className="p-4 sm:p-5 bg-gradient-to-r from-gray-50/90 via-white to-gray-50/50 hover:bg-gray-100/50 transition-colors cursor-pointer flex items-center justify-between gap-3 select-none border-b border-gray-100"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-white border border-gray-200 shadow-2xs flex items-center justify-center shrink-0 text-base font-bold">
                        {chap.subject === 'Matematika' ? '📐' : '📖'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-200/70 text-gray-700">
                            {chap.subject}
                          </span>
                          <h3 className="font-black text-sm sm:text-base text-[#0F2942] truncate">
                            {chap.topicTitle}
                          </h3>
                        </div>
                        <p className="text-xs text-gray-500 font-medium mt-0.5">
                          {chap.practicedCount} z {chap.totalCount} cvičení procvičeno
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <span className="text-xs font-black text-gray-700">
                          Průměr: {chap.averagePercentage} %
                        </span>
                      </div>
                      <button
                        type="button"
                        aria-label={isCollapsed ? "Rozbalit kapitolu" : "Sbalit kapitolu"}
                        className="w-8 h-8 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 shadow-2xs"
                      >
                        {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Témata / podtémata v kapitole */}
                  {!isCollapsed && (
                    <div className="divide-y divide-gray-100">
                      {chap.subtopics.map(sub => (
                        <div
                          key={sub.subtopicId}
                          className="p-4 sm:px-6 hover:bg-gray-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left"
                        >
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {/* Barevná tečka i textový štítek zároveň (kap. 3.4 & 8) */}
                              <span className={cn("w-2 h-2 rounded-full shrink-0", sub.statusBadge.dotColor)} />
                              <span className={cn(
                                "text-[11px] font-black px-2.5 py-0.5 rounded-full border shrink-0",
                                sub.statusBadge.badgeClass
                              )}>
                                {sub.statusBadge.text}
                              </span>
                              <h4 className="font-bold text-sm text-[#1E1B18] truncate">
                                {sub.title}
                              </h4>
                            </div>

                            <div className="flex items-center gap-3 text-xs text-gray-500 pl-4">
                              <span>{sub.attemptsCount} {getAttemptWord(sub.attemptsCount)}</span>
                              <span>•</span>
                              <span>Poslední pokus: <strong className="text-gray-800">{sub.lastPercentage} %</strong></span>
                              <span>•</span>
                              <span>Čistý průměr: <strong className="text-gray-800">{sub.averagePercentage} %</strong></span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                            <Button
                              size="sm"
                              onClick={() => navigate(`/practice/session/${sub.subtopicId}`)}
                              className="rounded-xl bg-[#0F2942] hover:bg-[#1E1B18] text-white font-bold text-xs h-8 px-4 cursor-pointer shadow-2xs"
                            >
                              <span>Procvičit</span>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}

            {/* Tlačítko Zobrazit všechna témata */}
            {filteredChapters.length > 5 && !isAllChaptersExpanded && (
              <div className="text-center pt-1">
                <Button
                  variant="outline"
                  onClick={() => setIsAllChaptersExpanded(true)}
                  className="rounded-xl font-bold text-xs h-9 px-5 border-gray-200 cursor-pointer"
                >
                  Zobrazit všechna témata ({filteredChapters.length - 5} dalších kapitol)
                </Button>
              </div>
            )}

            {/* Řádek nezačatých témat s odkazem na Procvičování (kap. 3.4) */}
            {stats.totalUnpracticedTopicsCount > 0 && (
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950 font-medium">
                <div className="flex items-center gap-2.5">
                  <span className="text-base">💡</span>
                  <span>
                    Dalších <strong className="font-black text-amber-900">{stats.totalUnpracticedTopicsCount} témat</strong> čeká na tvé první procvičení.
                  </span>
                </div>
                <Button
                  size="sm"
                  onClick={() => navigate('/practice')}
                  className="rounded-xl bg-amber-400 hover:bg-amber-500 text-black font-black text-xs h-8 px-4 cursor-pointer self-start sm:self-auto shadow-2xs"
                >
                  <span>Prozkoumat v Procvičování</span>
                  <ArrowRight size={12} className="ml-1" />
                </Button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ========================================================= */}
      {/* 3.5 VÝVOJ V ČASE (SPOJNICOVÝ GRAF S BAREVNÝMI PÁSMY)      */}
      {/* ========================================================= */}
      <section aria-labelledby="timeline-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="timeline-heading" className="text-lg sm:text-xl font-black text-[#0F2942] tracking-tight flex items-center gap-2">
              <TrendingUp size={20} className="text-emerald-600" />
              <span>Vývoj v čase</span>
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              Průměrná úspěšnost po dnech s barevnými pásmy zvládnutí látky
            </p>
          </div>

          {stats.timeline.hasEnoughData && (
            <span className="text-xs font-bold text-gray-500 hidden sm:inline">
              Posledních {periodFilter === '7d' ? '7 dní' : periodFilter === '30d' ? '30 dní' : '14 dní'}
            </span>
          )}
        </div>

        <Card className="p-6 sm:p-7 rounded-[2rem] border border-gray-200/80 bg-white shadow-2xs">
          {!stats.timeline.hasEnoughData ? (
            /* Prázdný stav při < 3 dnech s daty (kap. 3.5) */
            <div className="py-10 text-center space-y-3 max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-brand-blue flex items-center justify-center mx-auto text-xl shadow-inner font-bold">
                📈
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-black text-[#0F2942]">
                  Ještě {Math.max(1, STATS_THRESHOLDS.MIN_DAYS_FOR_TIMELINE - stats.timeline.daysWithDataCount)} {Math.max(1, STATS_THRESHOLDS.MIN_DAYS_FOR_TIMELINE - stats.timeline.daysWithDataCount) === 1 ? 'den' : 'dny'} a uvidíš svůj vývoj
                </h3>
                <p className="text-xs text-gray-500 font-medium leading-relaxed">
                  Spojnicový graf vyžaduje alespoň 3 různé tréninkové dny, aby ukázal smysluplný trend a vývoj tvých znalostí.
                </p>
              </div>
            </div>
          ) : (
            /* Spojnicový graf s barevnými pásmy */
            <div className="space-y-4">
              {/* Textová alternativa pro čtečky obrazovky (kap. 3.5 & kap. 8) */}
              <p className="sr-only">
                {stats.timeline.textSummary}
              </p>

              {/* Grafické znázornění SVG */}
              <div className="relative w-full h-56 sm:h-64 select-none">
                {/* Barevná pásma v pozadí */}
                <div className="absolute inset-0 flex flex-col pointer-events-none rounded-xl overflow-hidden border border-gray-100">
                  {/* Pásmo >= 80 % (Zelené Zvládnuto) */}
                  <div className="h-[20%] bg-emerald-50/50 border-b border-dashed border-emerald-200 flex items-center justify-end px-2">
                    <span className="text-[10px] font-bold text-emerald-700">Zvládnuto (80 %+)</span>
                  </div>
                  {/* Pásmo 50–79 % (Modré Skoro to máš) */}
                  <div className="h-[30%] bg-blue-50/30 border-b border-dashed border-blue-200 flex items-center justify-end px-2">
                    <span className="text-[10px] font-bold text-brand-blue">Skoro to máš (50–79 %)</span>
                  </div>
                  {/* Pásmo < 50 % (Červené K doučení) */}
                  <div className="h-[50%] bg-rose-50/30 flex items-center justify-end px-2">
                    <span className="text-[10px] font-bold text-rose-700">K doučení (&lt; 50 %)</span>
                  </div>
                </div>

                {/* SVG spojnice křivky */}
                <svg className="absolute inset-0 w-full h-full p-2 overflow-visible" preserveAspectRatio="none">
                  {(() => {
                    const pts = stats.timeline.points;
                    if (pts.length < 2) return null;

                    const width = 100;
                    const height = 100;

                    const coords = pts.map((pt, i) => {
                      const x = (i / (pts.length - 1)) * width;
                      // Osa Y je invertovaná (100% je nahoře = y: 0)
                      const y = height - (pt.averagePercentage / 100) * height;
                      return { x, y, pt };
                    });

                    const pathD = coords.reduce((acc, c, idx) => {
                      return idx === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`;
                    }, '');

                    return (
                      <>
                        <path
                          d={pathD}
                          fill="none"
                          stroke="#2B44B8"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                        {coords.map((c, i) => (
                          <g key={c.pt.dateKey}>
                            <circle
                              cx={`${c.x}%`}
                              cy={`${c.y}%`}
                              r="4.5"
                              fill={c.pt.averagePercentage >= 80 ? '#10B981' : c.pt.averagePercentage >= 50 ? '#2B44B8' : '#F43F5E'}
                              stroke="#ffffff"
                              strokeWidth="2"
                              className="transition-all hover:scale-150 cursor-pointer"
                            >
                              <title>{`${c.pt.label}: ${c.pt.averagePercentage} % (${c.pt.completedExercises} cvičení)`}</title>
                            </circle>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>
              </div>

              {/* Popisky osy X */}
              <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 pt-1 px-1">
                {stats.timeline.points.filter((_, i) => i % Math.ceil(stats.timeline.points.length / 7) === 0 || i === stats.timeline.points.length - 1).map(pt => (
                  <span key={pt.dateKey}>{pt.label}</span>
                ))}
              </div>
            </div>
          )}
        </Card>
      </section>

      {/* ========================================================= */}
      {/* 3.6 ROZBOR TVÝCH ODPOVĚDÍ                                 */}
      {/* ========================================================= */}
      <section aria-labelledby="insights-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="insights-heading" className="text-lg sm:text-xl font-black text-[#0F2942] tracking-tight flex items-center gap-2">
              <Target size={20} className="text-brand-purple" />
              <span>Rozbor tvých odpovědí</span>
            </h2>
            <p className="text-xs text-gray-500 font-medium">
              Kde konkrétně chybuješ, tempo odpovědí a problematické úlohy
            </p>
          </div>

          {stats.insights.hasEnoughData && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsErrorTypesModalOpen(true)}
              className="rounded-xl border-gray-200 text-xs font-bold h-8 px-3 cursor-pointer"
            >
              <span>Zobrazit detail chyb</span>
              <ArrowRight size={12} className="ml-1" />
            </Button>
          )}
        </div>

        {!stats.insights.hasEnoughData ? (
          /* Prázdný stav při < 10 odpovědích (kap. 3.6) */
          <Card className="p-8 text-center rounded-[2rem] border border-dashed border-gray-200 bg-white space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-brand-purple flex items-center justify-center mx-auto text-xl font-bold shadow-inner">
              🔍
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-sm sm:text-base font-black text-[#0F2942]">
                Rozbor se odemkne po prvních 10 odpovědích
              </h3>
              <p className="text-xs text-gray-500 font-medium leading-relaxed">
                Zatím máš zaznamenáno {stats.insights.totalAnswersCount} z 10 potřebných odpovědí. Dokonči ještě pár cvičení a získáš rozbor typických chyb a tempa.
              </p>
            </div>
          </Card>
        ) : (
          /* 3 kompaktní karty s možností rozkliknutí (kap. 3.6) */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Typy chyb */}
            <Card
              onClick={() => setIsErrorTypesModalOpen(true)}
              className="p-5 sm:p-6 rounded-[2rem] border border-gray-200/80 bg-white hover:border-gray-300 transition-all shadow-2xs cursor-pointer flex flex-col justify-between space-y-3 group"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                    Typy chyb
                  </span>
                  <span className="text-xs font-bold text-brand-blue group-hover:underline flex items-center gap-1">
                    Detail <ArrowRight size={12} />
                  </span>
                </div>

                <h4 className="font-black text-base text-[#0F2942]">
                  {stats.insights.errorTypes[0]?.title || 'Analýza chyb'}
                </h4>
                <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                  {stats.insights.errorTypes[0]?.description || 'Přehled nejčastějších okruhů chybování v CERMAT úlohách.'}
                </p>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-gray-100">
                {stats.insights.errorTypes.slice(0, 2).map(e => (
                  <div key={e.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 font-medium truncate max-w-[170px]">{e.title}</span>
                    <span className="font-black text-rose-600">{e.count}× ({e.percentage} %)</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* 2. Tempo odpovídání */}
            <Card className="p-5 sm:p-6 rounded-[2rem] border border-gray-200/80 bg-white shadow-2xs flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                  Tempo odpovídání
                </span>

                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-[#0F2942]">
                    ~{stats.insights.pace.averageSecondsPerQuestion} s
                  </span>
                  <span className="text-xs text-gray-400 font-bold">na otázku</span>
                </div>

                <p className="text-xs text-gray-500 leading-relaxed font-medium">
                  {stats.insights.pace.summary}
                </p>
              </div>

              {stats.insights.pace.slowestTopics.length > 0 && (
                <div className="pt-2 border-t border-gray-100 text-xs space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                    Kde trávíš nejvíce času:
                  </span>
                  <div className="font-bold text-gray-700 truncate">
                    {stats.insights.pace.slowestTopics[0].title} (~{stats.insights.pace.slowestTopics[0].averageSeconds} s)
                  </div>
                </div>
              )}
            </Card>

            {/* 3. Úlohy, které se opakovaně nedaří */}
            <Card className="p-5 sm:p-6 rounded-[2rem] border border-gray-200/80 bg-white shadow-2xs flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-gray-400">
                  Kritické úlohy
                </span>

                <h4 className="font-black text-base text-[#0F2942]">
                  {stats.insights.strugglingQuestions.length > 0
                    ? `${stats.insights.strugglingQuestions.length} problematických úloh`
                    : 'Žádné opakované chyby'}
                </h4>

                <p className="text-xs text-gray-500 leading-relaxed font-medium line-clamp-2">
                  {stats.insights.strugglingQuestions.length > 0
                    ? `Otázky, u kterých jsi chyboval(a) vícekrát. Doporučujeme je brzy zopakovat pro upevnění.`
                    : 'Skvělá práce! Nemáš žádné úlohy, které by se ti opakovaně nedařily.'}
                </p>
              </div>

              {stats.insights.strugglingQuestions.length > 0 && (
                <div className="pt-2 border-t border-gray-100 text-xs flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    {stats.insights.strugglingQuestions[0].suggestedReviewText}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => navigate(`/practice/session/${stats.insights.strugglingQuestions[0].subtopicId}`)}
                    className="h-7 text-[11px] font-bold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 cursor-pointer"
                  >
                    Procvičit
                  </Button>
                </div>
              )}
            </Card>
          </div>
        )}
      </section>

      {/* ========================================================= */}
      {/* 3.7 HISTORIE POKUSŮ (VE VÝCHOZÍM STAVU SBALENÁ)           */}
      {/* ========================================================= */}
      <section aria-labelledby="history-heading" className="space-y-3 pt-2">
        <Card className="rounded-[2rem] border border-gray-200/80 bg-white shadow-2xs overflow-hidden">
          {/* Rozbalitelná hlavička historie pokusů */}
          <div
            onClick={() => setIsHistoryExpanded(prev => !prev)}
            className="p-5 sm:p-6 bg-gradient-to-r from-gray-50/80 via-white to-gray-50/40 hover:bg-gray-100/40 transition-colors cursor-pointer flex items-center justify-between select-none"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-white border border-gray-200 shadow-2xs flex items-center justify-center text-gray-700">
                <RotateCcw size={18} />
              </div>
              <div>
                <h2 id="history-heading" className="text-base sm:text-lg font-black text-[#0F2942] tracking-tight">
                  Historie pokusů ({stats.attemptsHistory.length})
                </h2>
                <p className="text-xs text-gray-500 font-medium">
                  {isHistoryExpanded ? 'Kliknutím sbalit přehled' : 'Kliknutím zobrazit chronologický přehled všech cvičení'}
                </p>
              </div>
            </div>

            <button
              type="button"
              aria-label={isHistoryExpanded ? "Sbalit historii pokusů" : "Rozbalit historii pokusů"}
              className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 shadow-2xs"
            >
              {isHistoryExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>

          {/* Rozbalený seznam historie pokusů */}
          {isHistoryExpanded && (
            <div className="border-t border-gray-100 p-5 sm:p-6 space-y-3">
              {stats.attemptsHistory.length === 0 ? (
                <p className="text-xs text-gray-500 font-medium text-center py-6">
                  Zatím zde nejsou žádné záznamy pokusů pro zvolený filtr.
                </p>
              ) : (
                <>
                  <div className="divide-y divide-gray-100">
                    {stats.attemptsHistory.slice(0, visibleHistoryCount).map(attempt => (
                      <div
                        key={attempt.id}
                        className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                              attempt.subject === 'Matematika'
                                ? 'bg-blue-50 text-brand-blue border border-blue-200'
                                : 'bg-rose-50 text-rose-800 border border-rose-200'
                            }`}>
                              {attempt.subject}
                            </span>
                            <span className="text-xs text-gray-400 font-medium">
                              {attempt.topicTitle}
                            </span>
                            <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs text-gray-500 font-medium">
                              {formatAttemptDate(attempt.createdAt)}
                            </span>
                          </div>

                          <h4 className="font-bold text-sm text-[#1E1B18] truncate">
                            {attempt.subtopicTitle}
                          </h4>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                          <div className="text-right">
                            <span className="text-xs font-black text-[#0F2942] block">
                              {attempt.score} z {attempt.totalQuestions} ({attempt.percentage} %)
                            </span>
                          </div>

                          {/* Odkaz Zobrazit odpovědi (otevře dialog s rozborem otázek) */}
                          <button
                            type="button"
                            onClick={() => setSelectedAttemptForDetails(attempt)}
                            className="text-xs font-bold text-brand-blue hover:text-blue-800 hover:underline transition-colors cursor-pointer px-2 py-1"
                          >
                            Zobrazit odpovědi
                          </button>

                          {/* Tlačítko Procvičit znovu */}
                          <Button
                            size="sm"
                            onClick={() => navigate(`/practice/session/${attempt.subtopicId}`)}
                            className="rounded-xl bg-[#0F2942] hover:bg-[#1E1B18] text-white font-bold text-xs h-8 px-3.5 cursor-pointer shadow-2xs"
                          >
                            <RotateCcw size={12} className="mr-1" />
                            <span>Procvičit znovu</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Stránkování po 10 záznamech */}
                  {stats.attemptsHistory.length > visibleHistoryCount && (
                    <div className="pt-3 text-center border-t border-gray-100">
                      <Button
                        variant="outline"
                        onClick={() => setVisibleHistoryCount(prev => prev + 10)}
                        className="rounded-xl font-bold text-xs h-9 px-5 border-gray-200 cursor-pointer"
                      >
                        Načíst další pokusy ({stats.attemptsHistory.length - visibleHistoryCount} zbývá)
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </Card>
      </section>

      {/* ========================================================= */}
      {/* MODALY: DETAIL POKUSU, TYPY CHYB, KALENDÁŘ, PAYWALL       */}
      {/* ========================================================= */}
      <AttemptDetailsModal
        isOpen={Boolean(selectedAttemptForDetails)}
        onClose={() => setSelectedAttemptForDetails(null)}
        attempt={selectedAttemptForDetails}
      />

      <ErrorTypeDetailModal
        isOpen={isErrorTypesModalOpen}
        onClose={() => setIsErrorTypesModalOpen(false)}
        errorTypes={stats.insights.errorTypes}
      />

      {/* Modal pro naplánování cvičení do kalendáře */}
      <PracticeScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        initialSubject={scheduleInitialSubject}
        initialSubtopics={scheduleInitialSubtopics}
        existingTodos={todos}
      />

      {/* Paywall modal pro ne-PRO uživatele */}
      <UnifiedPaywallModal
        isOpen={!isPremium && !isPaywallDismissed}
        onClose={() => setIsPaywallDismissed(true)}
        type="premium"
        description="Kompletní rozbor úspěšnosti, mapa témat CERMAT k přijímačkám, spojnicový graf vývoje a chytrá doporučení na míru jsou k dispozici v rámci předplatného ProEdu Premium."
      />
    </div>
  );
}
