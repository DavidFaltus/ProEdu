import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  BarChart3,
  TrendingUp,
  Play,
  Calendar,
  Search,
  Lock,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
  Sparkles
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
  SmartRecommendationItem
} from '../services/statisticsService';

export default function Statistics() {
  const { user, profile, isPremium, streak } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [rawData, setRawData] = useState<Awaited<ReturnType<typeof fetchStudentRawStatisticsData>> | null>(null);

  // Filtry nahoře
  const [subjectFilter, setSubjectFilter] = useState<StatsSubjectFilter>('Vše');
  const [periodFilter, setPeriodFilter] = useState<StatsPeriodFilter>('all');

  // Aktivní záložka v Chytrých doporučeních
  const [activeRecTab, setActiveRecTab] = useState<'weak' | 'refresh' | 'next'>('weak');

  // Filtry pro Semafor znalostí
  const [masteryFilter, setMasteryFilter] = useState<'all' | MasteryStatus>('all');
  const [topicSearch, setTopicSearch] = useState('');
  const [collapsedTopics, setCollapsedTopics] = useState<Record<string, boolean>>({});

  // Paginace historie pokusů
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(10);

  // Paywall & Kalendář modal
  const [isPaywallDismissed, setIsPaywallDismissed] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleInitialSubtopics, setScheduleInitialSubtopics] = useState<PracticeSubtopic[]>([]);
  const [scheduleInitialSubject, setScheduleInitialSubject] = useState<'Matematika' | 'Čeština'>('Matematika');
  const [todos, setTodos] = useState<any[]>([]);

  // Načtení surových dat statistik
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

  // Odběr studentových todos pro plánovač do kalendáře
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

  // Výpočet statistik (nebo demo náhledu pro ne-PRO uživatele bez pokusů)
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
      profile?.focusAreas || []
    );
  }, [rawData, isPremium, subjectFilter, periodFilter, profile?.focusAreas]);

  // Automatické přepnutí záložky doporučení na první neprázdnou kategorii při načtení
  useEffect(() => {
    const { weakSpots, toRefresh, nextSteps } = stats.recommendations;
    if (weakSpots.length > 0) {
      setActiveRecTab('weak');
    } else if (toRefresh.length > 0) {
      setActiveRecTab('refresh');
    } else if (nextSteps.length > 0) {
      setActiveRecTab('next');
    }
  }, [stats.recommendations.weakSpots.length, stats.recommendations.toRefresh.length, stats.recommendations.nextSteps.length]);

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

  const toggleTopicCollapse = (groupKey: string) => {
    setCollapsedTopics(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  // Filtrované skupiny témat pro Přehled úspěšnosti po tématech (pouze reálně vyzkoušená cvičení)
  const filteredTopicGroups = useMemo(() => {
    const q = topicSearch.trim().toLowerCase();
    return stats.topicGroups
      .map(group => {
        const matchingSubtopics = group.subtopics.filter(sub => {
          if (sub.attemptsCount === 0 || sub.status === 'unpracticed') return false;
          const matchesStatus = masteryFilter === 'all' || sub.status === masteryFilter;
          const matchesQuery =
            !q ||
            sub.title.toLowerCase().includes(q) ||
            group.topicTitle.toLowerCase().includes(q);
          return matchesStatus && matchesQuery;
        });
        return {
          ...group,
          subtopics: matchingSubtopics
        };
      })
      .filter(group => group.subtopics.length > 0);
  }, [stats.topicGroups, masteryFilter, topicSearch]);

  // Pomocné funkce pro barvy úspěšnosti
  const getPercentageBadgeStyle = (pct: number, attemptsCount = 1) => {
    if (attemptsCount === 0) {
      return 'bg-gray-100 text-gray-500 border-gray-200';
    }
    if (pct >= 80) {
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
    if (pct >= 50) {
      return 'bg-amber-50 text-amber-800 border-amber-200';
    }
    return 'bg-rose-50 text-rose-800 border-rose-200';
  };

  const getProgressBarColor = (pct: number, attemptsCount = 1) => {
    if (attemptsCount === 0) return 'bg-gray-200';
    if (pct >= 80) return 'bg-emerald-500';
    if (pct >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getMasteryLabel = (status: MasteryStatus) => {
    switch (status) {
      case 'mastered':
        return { text: 'Zvládnuto', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
      case 'needs_practice':
        return { text: 'K procvičení', dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-800 border-amber-200' };
      case 'critical':
        return { text: 'K doučení', dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-800 border-rose-200' };
      default:
        return { text: 'Nevyzkoušeno', dot: 'bg-gray-300', badge: 'bg-gray-100 text-gray-500 border-gray-200' };
    }
  };

  const formatDateTime = (date: Date) => {
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

  const currentRecommendations: SmartRecommendationItem[] =
    activeRecTab === 'weak'
      ? stats.recommendations.weakSpots
      : activeRecTab === 'refresh'
        ? stats.recommendations.toRefresh
        : stats.recommendations.nextSteps;

  return (
    <div className="page-container max-w-7xl mx-auto space-y-8 pb-16">
      {/* HLAVIČKA STRÁNKY + FILTRY PŘEDMĚTU A OBDOBÍ (ZAROVNÁNO NA STŘED) */}
      <section className="text-center space-y-3 max-w-3xl mx-auto">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-playful text-gray-700 tracking-tight">
          Moje statistiky a rozbor
        </h1>
        <p className="text-base md:text-lg text-gray-500 leading-relaxed">
          Podrobný přehled tvé úspěšnosti, zvládnutí témat k přijímačkám a chytrá doporučení na míru.
        </p>

        {/* Přepínače filtrů: Předmět a Časové období */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
          {/* Filtr předmětu */}
          <div className="bg-white p-1 rounded-2xl border border-gray-200/80 shadow-2xs flex items-center gap-1">
            {(['Vše', 'Matematika', 'Čeština'] as StatsSubjectFilter[]).map(subj => {
              const active = subjectFilter === subj;
              return (
                <button
                  key={subj}
                  type="button"
                  onClick={() => setSubjectFilter(subj)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer',
                    active
                      ? 'bg-[#F5C400] text-[#1E1B18] shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 font-bold'
                  )}
                >
                  {subj === 'Matematika' && <BrainPinkIcon size={14} />}
                  {subj === 'Čeština' && <BookCyanIcon size={14} />}
                  <span>{subj}</span>
                </button>
              );
            })}
          </div>

          {/* Filtr období */}
          <div className="bg-white p-1 rounded-2xl border border-gray-200/80 shadow-2xs flex items-center gap-1">
            {(
              [
                { id: 'all', label: 'Celá historie' },
                { id: '30d', label: '30 dní' },
                { id: '7d', label: '7 dní' }
              ] as { id: StatsPeriodFilter; label: string }[]
            ).map(p => {
              const active = periodFilter === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodFilter(p.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer',
                    active
                      ? 'bg-[#1E1B18] text-white shadow-xs'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 font-bold'
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Banner pro ne-PRO uživatele, pokud zavřeli paywall modal */}
      {!isPremium && (
        <div className="bg-gradient-to-r from-amber-50 via-yellow-50 to-orange-50 border-2 border-amber-200/90 rounded-[1.75rem] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#F5C400] text-[#1E1B18] flex items-center justify-center shrink-0 shadow-xs">
              <Lock size={20} />
            </div>
            <div>
              <h3 className="font-sans font-black text-base sm:text-lg text-[#1E1B18]">
                Odemkni podrobné PRO statistiky a chytrý rozbor chyb
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 font-medium">
                Získej přístup k semaforu zvládnutých témat, vývoji úspěšnosti v čase a doporučením, která témata si zopakovat před zkouškou.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setIsPaywallDismissed(false)}
            className="rounded-xl bg-[#1E1B18] hover:bg-[#332f2b] text-white font-black text-xs px-5 h-10 shrink-0 cursor-pointer shadow-sm"
          >
            Odemknout PRO
          </Button>
        </div>
      )}

      {/* HLAVNÍ OBSAH SE ROZMAZÁNÍM PRO !isPremium */}
      <div className="relative">
        <div className={cn('space-y-6 md:space-y-8 transition-all', !isPremium && 'filter blur-sm select-none pointer-events-none')}>
          {loading ? (
            <div className="text-center py-24 bg-white/70 rounded-[2rem] border border-gray-100 shadow-xs">
              <div className="w-10 h-10 border-4 border-[#1E1B18] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 font-bold text-sm">Načítání tvých statistik a výsledků...</p>
            </div>
          ) : (
            <>
              {/* 1. SOUHRNNÉ KPI KARTY (4 KARTY) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* Karta 1: Průměrná úspěšnost */}
                <Card className="rounded-[1.75rem] border-none shadow-sm bg-white p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-gray-400">
                      Průměrná úspěšnost
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <StarYellowIcon size={18} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2.5">
                      <span className="text-3xl sm:text-4xl font-black text-[#1E1B18]">
                        {stats.averagePercentage} %
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-black uppercase px-2 py-0.5 rounded-lg border',
                          getPercentageBadgeStyle(stats.averagePercentage, stats.totalAttempts)
                        )}
                      >
                        {stats.totalAttempts === 0
                          ? 'Zatím bez pokusů'
                          : stats.averagePercentage >= 80
                            ? 'Skvělá forma'
                            : stats.averagePercentage >= 50
                              ? 'Dobrá cesta'
                              : 'Potřebuje trénink'}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-3">
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', getProgressBarColor(stats.averagePercentage, stats.totalAttempts))}
                        style={{ width: `${Math.min(100, stats.averagePercentage)}%` }}
                      />
                    </div>
                  </div>
                </Card>

                {/* Karta 2: Počet procvičení a pokrytí katalogu */}
                <Card className="rounded-[1.75rem] border-none shadow-sm bg-white p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-gray-400">
                      Dokončená cvičení
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-pink-50 flex items-center justify-center shrink-0">
                      <BrainPinkIcon size={18} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl sm:text-4xl font-black text-[#1E1B18]">
                        {stats.totalAttempts}×
                      </span>
                      <span className="text-xs font-bold text-gray-500">
                        procvičeno
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-600 mt-3 pt-2.5 border-t border-gray-100">
                      <span>Vyzkoušená témata:</span>
                      <span className="font-black text-[#1E1B18]">
                        {stats.practicedSubtopicsCount} / {stats.totalVisibleSubtopicsCount}
                      </span>
                    </div>
                    <p className="text-[11px] font-semibold text-emerald-700 mt-1">
                      Zvládnuto na ≥ 80 %: <strong>{stats.masteredSubtopicsCount}</strong> okruhů
                    </p>
                  </div>
                </Card>

                {/* Karta 3: Jednotlivé otázky */}
                <Card className="rounded-[1.75rem] border-none shadow-sm bg-white p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-gray-400">
                      Jednotlivé otázky
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-cyan-50 flex items-center justify-center shrink-0">
                      <CorrectCyanIcon size={18} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl sm:text-4xl font-black text-[#1E1B18]">
                        {stats.totalScore}
                      </span>
                      <span className="text-sm font-bold text-gray-400">
                        / {stats.totalQuestions} správně
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-600 mt-3 pt-2.5 border-t border-gray-100">
                      <span>Přesnost odpovědí:</span>
                      <span className="font-black text-[#1E1B18]">{stats.accuracyPercentage} %</span>
                    </div>
                  </div>
                </Card>

                {/* Karta 4: Denní série (Streak) & Aktivní dny */}
                <Card className="rounded-[1.75rem] border-none shadow-sm bg-white p-5 flex flex-col justify-between">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-gray-400">
                      Pravidelnost a série
                    </span>
                    <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                      <HeartPinkIcon size={18} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl sm:text-4xl font-black text-[#1E1B18]">
                        {streak || 0}
                      </span>
                      <span className="text-xs font-bold text-gray-500">
                        dní v řadě
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-600 mt-3 pt-2.5 border-t border-gray-100">
                      <span>Tréninkové dny v období:</span>
                      <span className="font-black text-[#1E1B18]">{stats.activeDaysCount} dní</span>
                    </div>
                  </div>
                </Card>
              </div>

              {/* 2. SROVNÁNÍ MATEMATIKA VS. ČEŠTINA + VÝVOJ V ČASE */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-stretch">
                {/* Levý sloupec (5/12): Srovnání předmětů */}
                <Card className="xl:col-span-5 rounded-[1.75rem] border-none shadow-sm bg-white p-5 sm:p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-gray-100">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <BarChart3 size={18} />
                      </div>
                      <div>
                        <h2 className="font-sans font-black text-lg text-[#1E1B18]">
                          Matematika vs. Čeština
                        </h2>
                        <p className="text-[11px] font-semibold text-gray-400">
                          Porovnání úspěšnosti a pokrytí témat v obou předmětech
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {[stats.mathStats, stats.czechStats].map(subj => {
                        const isMath = subj.subject === 'Matematika';
                        return (
                          <div
                            key={subj.subject}
                            className={cn(
                              'p-4 rounded-2xl border transition-all',
                              isMath
                                ? 'bg-blue-50/35 border-blue-100'
                                : 'bg-rose-50/35 border-rose-100'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={cn(
                                    'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs',
                                    isMath ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
                                  )}
                                >
                                  {isMath ? <BrainPinkIcon size={18} /> : <BookCyanIcon size={18} />}
                                </div>
                                <div>
                                  <h3 className="font-bold text-sm text-[#1E1B18]">{subj.subject}</h3>
                                  <p className="text-[11px] font-semibold text-gray-500">
                                    {subj.attemptsCount}× procvičeno • {subj.totalScore}/{subj.totalQuestions} úloh
                                  </p>
                                </div>
                              </div>

                              <div className="text-right">
                                <span className="text-xl font-black text-[#1E1B18]">
                                  {subj.averagePercentage} %
                                </span>
                                <span className="block text-[10px] font-bold text-gray-400 uppercase">
                                  průměr
                                </span>
                              </div>
                            </div>

                            {/* Progress bar průměrné úspěšnosti */}
                            <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-gray-200/60 my-2.5">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all duration-500',
                                  getProgressBarColor(subj.averagePercentage, subj.attemptsCount)
                                )}
                                style={{ width: `${Math.min(100, subj.averagePercentage)}%` }}
                              />
                            </div>

                            <div className="flex items-center justify-between text-[11px] font-bold text-gray-600 pt-1">
                              <span>
                                Pokrytí katalogu:{' '}
                                <strong className="text-[#1E1B18]">
                                  {subj.practicedSubtopicsCount}/{subj.totalSubtopicsCount}
                                </strong>{' '}
                                ({subj.coveragePercentage} %)
                              </span>
                              <span className="text-emerald-700">
                                Zvládnuto: <strong>{subj.masteredSubtopicsCount}</strong>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>

                {/* Pravý sloupec (7/12): Vývoj v čase */}
                <Card className="xl:col-span-7 rounded-[1.75rem] border-none shadow-sm bg-white p-5 sm:p-6 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-gray-100">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                          <TrendingUp size={18} />
                        </div>
                        <div>
                          <h2 className="font-sans font-black text-lg text-[#1E1B18]">
                            Vývoj úspěšnosti a aktivity v čase
                          </h2>
                          <p className="text-[11px] font-semibold text-gray-400">
                            Denní přehled průměrné úspěšnosti a počtu dokončených cvičení
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-[10px] font-bold text-gray-500">
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> ≥ 80 %
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> 50–79 %
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> &lt; 50 %
                        </span>
                      </div>
                    </div>

                    {/* Sloupcový graf po dnech */}
                    <div className="pt-4 pb-2">
                      <div
                        className={cn(
                          'grid items-end h-44 px-1',
                          stats.timeline.length <= 7
                            ? 'grid-cols-7 gap-2.5 sm:gap-4'
                            : 'grid-cols-7 sm:grid-cols-14 gap-1.5 sm:gap-2'
                        )}
                      >
                        {stats.timeline.map((day, idx) => {
                          const hasActivity = day.attemptsCount > 0;
                          const heightPct = hasActivity ? Math.max(16, day.averagePercentage) : 8;
                          const barColor = !hasActivity
                            ? 'bg-gray-100 hover:bg-gray-200'
                            : day.averagePercentage >= 80
                              ? 'bg-emerald-500 hover:bg-emerald-600'
                              : day.averagePercentage >= 50
                                ? 'bg-amber-400 hover:bg-amber-500'
                                : 'bg-rose-500 hover:bg-rose-600';

                          return (
                            <div
                              key={day.dateKey}
                              className={cn(
                                'flex flex-col items-center justify-end h-full group relative',
                                idx < 7 && stats.timeline.length > 7 ? 'hidden sm:flex' : 'flex'
                              )}
                            >
                              {/* Tooltip při najetí */}
                              <div className="opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity absolute -top-14 left-1/2 -translate-x-1/2 z-20 bg-[#1E1B18] text-white text-[10px] font-bold py-1.5 px-2.5 rounded-xl shadow-lg whitespace-nowrap">
                                <div>{day.label}</div>
                                {hasActivity ? (
                                  <div className="text-amber-300">
                                    {day.averagePercentage} % ({day.attemptsCount}× cvičení)
                                  </div>
                                ) : (
                                  <div className="text-gray-300">Žádné procvičování</div>
                                )}
                              </div>

                              {/* Hodnota nad sloupcem */}
                              <span className="text-[9px] font-black text-gray-500 mb-1 h-3">
                                {hasActivity ? `${day.averagePercentage}%` : ''}
                              </span>

                              {/* Sloupec */}
                              <div className="w-full h-32 bg-gray-50 rounded-xl flex items-end p-0.5 border border-gray-100">
                                <div
                                  className={cn('w-full rounded-lg transition-all duration-300', barColor)}
                                  style={{ height: `${heightPct}%` }}
                                />
                              </div>

                              {/* Popisek data */}
                              <span className="text-[9px] font-bold text-gray-400 mt-1.5 truncate max-w-full">
                                {day.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500 font-semibold">
                    <span>
                      Tip: Udržuj sloupce v zeleném pásmu (nad 80 %) pro jistotu u ostrých přijímaček.
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate('/practice')}
                      className="rounded-xl font-bold text-xs h-8 px-3 border-gray-200 hover:border-gray-300 cursor-pointer"
                    >
                      Jít trénovat
                    </Button>
                  </div>
                </Card>
              </div>

              {/* 3. CHYTRÁ DOPORUČENÍ A STUDIJNÍ PRŮVODCE (PRO) */}
              <Card className="rounded-[1.75rem] border-none shadow-sm bg-white p-5 sm:p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 mb-5 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 shadow-inner">
                      <BulbYellowIcon size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-sans font-black text-lg sm:text-xl text-[#1E1B18]">
                          Chytrá doporučení na míru
                        </h2>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                          PRO průvodce
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-gray-400">
                        Automatický výběr témat podle tvých chyb, rozestupů v opakování a studijních cílů
                      </p>
                    </div>
                  </div>

                  {/* Přepínač 3 kategorií doporučení */}
                  <div className="flex flex-wrap items-center gap-1.5 bg-[#FAF7F0] p-1.5 rounded-2xl border border-gray-200/60">
                    <button
                      type="button"
                      onClick={() => setActiveRecTab('weak')}
                      className={cn(
                        'px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer',
                        activeRecTab === 'weak'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-white/70 font-bold'
                      )}
                    >
                      <AlertTriangle size={13} />
                      <span>Slabá místa k doučení</span>
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.2 rounded-full font-black',
                          activeRecTab === 'weak' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
                        )}
                      >
                        {stats.recommendations.weakSpots.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveRecTab('refresh')}
                      className={cn(
                        'px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer',
                        activeRecTab === 'refresh'
                          ? 'bg-[#1E1B18] text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-white/70 font-bold'
                      )}
                    >
                      <RotateCcw size={13} />
                      <span>K osvěžení paměti</span>
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.2 rounded-full font-black',
                          activeRecTab === 'refresh' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-800'
                        )}
                      >
                        {stats.recommendations.toRefresh.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveRecTab('next')}
                      className={cn(
                        'px-3 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer',
                        activeRecTab === 'next'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-white/70 font-bold'
                      )}
                    >
                      <Sparkles size={13} />
                      <span>Další doporučené kroky</span>
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.2 rounded-full font-black',
                          activeRecTab === 'next' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                        )}
                      >
                        {stats.recommendations.nextSteps.length}
                      </span>
                    </button>
                  </div>
                </div>

                {currentRecommendations.length === 0 ? (
                  <div className="text-center py-10 px-4 bg-[#FAF7F0] rounded-2xl border border-dashed border-gray-200">
                    <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                    <h4 className="font-bold text-gray-800 text-sm sm:text-base">
                      {activeRecTab === 'weak'
                        ? 'Skvělá práce! Momentálně nemáš žádná kritická slabá místa pod 70 %.'
                        : activeRecTab === 'refresh'
                          ? 'Všechna procvičená témata máš čerstvě v paměti.'
                          : 'Všechna dostupná témata v tomto filtru už jsi vyzkoušel(a)!'}
                    </h4>
                    <p className="text-xs text-gray-500 font-medium mt-1">
                      Můžeš se podívat do jiné záložky doporučení nebo pokračovat v katalogu procvičování.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {currentRecommendations.map(item => (
                      <div
                        key={item.subtopicId}
                        className="p-4 rounded-2xl bg-[#FAF7F0] hover:bg-white border border-gray-200/70 hover:border-gray-300 transition-all flex flex-col justify-between gap-3.5 shadow-2xs"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs mt-0.5',
                              item.bg
                            )}
                          >
                            <CustomIcon name={(item.icon as CustomIconName) || 'mozek'} size={22} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={cn('text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded', item.tagClass)}>
                                {item.subject}
                              </span>
                              <span className="text-[10px] font-bold text-gray-400 truncate">
                                {item.topicTitle}
                              </span>
                              <span
                                className={cn(
                                  'ml-auto text-[10px] font-black px-2 py-0.5 rounded-md border',
                                  item.category === 'weak'
                                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                                    : item.category === 'refresh'
                                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                                      : 'bg-blue-100 text-blue-800 border-blue-200'
                                )}
                              >
                                {item.badgeText}
                              </span>
                            </div>

                            <h4 className="font-bold text-gray-900 text-sm mt-1 leading-snug">
                              {item.title}
                            </h4>
                            <p className="text-xs text-gray-500 font-medium mt-1 leading-relaxed">
                              {item.reasonText}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-gray-200/50">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenSchedule(item.subtopicId, item.title, item.subject, item.topicId)}
                            title="Naplánovat do kalendáře"
                            className="rounded-xl font-bold text-xs h-8 px-2.5 bg-white border-gray-200 hover:border-brand-blue text-gray-700 cursor-pointer flex items-center gap-1"
                          >
                            <Calendar size={13} className="text-brand-blue" />
                            <span>Do plánu</span>
                          </Button>

                          {item.hasStudyMaterial && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                trackSectionClick('stats_rec_study', `/study/${item.subtopicId}`);
                                navigate(`/study/${item.subtopicId}`);
                              }}
                              className="rounded-xl font-bold text-xs h-8 px-3 bg-white border-gray-200 hover:border-black text-gray-700 cursor-pointer flex items-center gap-1.5"
                            >
                              <BookCyanIcon size={14} />
                              <span>Studovat</span>
                            </Button>
                          )}

                          <Button
                            size="sm"
                            onClick={() => {
                              trackSectionClick('stats_rec_practice', `/practice/session/${item.subtopicId}`);
                              navigate(`/practice/session/${item.subtopicId}`);
                            }}
                            className="rounded-xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black text-xs h-8 px-3.5 cursor-pointer flex items-center gap-1.5 border border-blue-200/80 shadow-2xs"
                          >
                            <Play size={11} className="fill-[#0F2942] text-[#0F2942]" />
                            <span>Procvičit</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* 4. PŘEHLED ÚSPĚŠNOSTI PO TÉMATECH */}
              <Card className="rounded-[1.75rem] border-none shadow-sm bg-white p-5 sm:p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 mb-5 border-b border-gray-100">
                  <div>
                    <h2 className="font-sans font-black text-lg sm:text-xl text-[#1E1B18]">
                      Přehled úspěšnosti po tématech
                    </h2>
                    <p className="text-xs font-semibold text-gray-400">
                      Hodnoceno podle čistého průměru všech tvých pokusů v daném tématu
                    </p>
                  </div>

                  {/* Filtry úspěšnosti a hledání */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <div className="relative w-full sm:w-56">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <Input
                        value={topicSearch}
                        onChange={e => setTopicSearch(e.target.value)}
                        placeholder="Hledat téma..."
                        className="pl-9 h-9 rounded-xl text-xs font-bold bg-[#FAF7F0] border-gray-200"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-1 bg-[#FAF7F0] p-1 rounded-xl border border-gray-200/60">
                      {(
                        [
                          { id: 'all', label: 'Vše' },
                          { id: 'critical', label: 'K doučení (<50 %)' },
                          { id: 'needs_practice', label: '50–79 %' },
                          { id: 'mastered', label: 'Zvládnuto (≥80 %)' }
                        ] as { id: 'all' | MasteryStatus; label: string }[]
                      ).map(tab => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setMasteryFilter(tab.id)}
                          className={cn(
                            'px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer',
                            masteryFilter === tab.id
                              ? 'bg-[#1E1B18] text-white shadow-2xs'
                              : 'text-gray-600 hover:text-gray-900 font-bold'
                          )}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {filteredTopicGroups.length === 0 ? (
                  <div className="text-center py-12 bg-[#FAF7F0] rounded-2xl border border-dashed border-gray-200">
                    <p className="text-sm font-bold text-gray-600">
                      Pro zvolený filtr nebyla nalezena žádná témata.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredTopicGroups.map(group => {
                      const groupKey = `${group.subject}__${group.topicId}`;
                      const isCollapsed = Boolean(collapsedTopics[groupKey]);
                      const isMath = group.subject === 'Matematika';

                      return (
                        <div
                          key={groupKey}
                          className="rounded-2xl border border-gray-200/80 overflow-hidden bg-[#FAF7F0]/60"
                        >
                          {/* Hlavička tématu */}
                          <button
                            type="button"
                            onClick={() => toggleTopicCollapse(groupKey)}
                            className="w-full p-4 bg-white hover:bg-gray-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={cn(
                                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                                  isMath ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'
                                )}
                              >
                                <CustomIcon name={(group.icon as CustomIconName) || 'mozek'} size={20} />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span
                                    className={cn(
                                      'text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded',
                                      isMath
                                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                    )}
                                  >
                                    {group.subject}
                                  </span>
                                  <span className="text-[11px] font-bold text-gray-400">
                                    Procvičeno {group.practicedSubtopicsCount} z {group.totalSubtopicsCount} cvičení ({group.totalAttempts}× pokus)
                                  </span>
                                </div>
                                <h3 className="font-bold text-base text-[#1E1B18] truncate mt-0.5">
                                  {group.topicTitle}
                                </h3>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                              <div
                                className={cn(
                                  'px-3 py-1 rounded-xl border text-xs font-black',
                                  getPercentageBadgeStyle(group.averagePercentage, group.totalAttempts)
                                )}
                              >
                                {group.totalAttempts > 0 ? `Průměr ${group.averagePercentage} %` : 'Nevyzkoušeno'}
                              </div>
                              {isCollapsed ? (
                                <ChevronDown size={18} className="text-gray-400" />
                              ) : (
                                <ChevronUp size={18} className="text-gray-400" />
                              )}
                            </div>
                          </button>

                          {/* Seznam podtémat v tématu */}
                          {!isCollapsed && (
                            <div className="divide-y divide-gray-200/60 border-t border-gray-200/70">
                              {group.subtopics.map(sub => {
                                const mLabel = getMasteryLabel(sub.status);
                                return (
                                  <div
                                    key={sub.subtopicId}
                                    className="p-3.5 sm:px-5 bg-white/70 hover:bg-white transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                                  >
                                    <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                                      <span className={cn('w-3 h-3 rounded-full shrink-0 mt-1 sm:mt-0', mLabel.dot)} />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <h4 className="font-bold text-sm text-gray-900">
                                            {sub.title}
                                          </h4>
                                          <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-md border', mLabel.badge)}>
                                            {mLabel.text}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-3 flex-wrap text-[11px] font-semibold text-gray-500 mt-1">
                                          {sub.attemptsCount > 0 ? (
                                            <>
                                              <span>
                                                Čistý průměr: <strong className="text-gray-900">{sub.averagePercentage} %</strong>
                                              </span>
                                              <span>•</span>
                                              <span>
                                                Pokusů: <strong className="text-gray-900">{sub.attemptsCount}×</strong>
                                              </span>
                                              <span>•</span>
                                              <span>
                                                Poslední: <strong className="text-gray-900">{sub.lastPercentage} %</strong>
                                              </span>
                                              <span>•</span>
                                              <span>
                                                Nejlepší: <strong className="text-emerald-700">{sub.bestPercentage} %</strong>
                                              </span>
                                            </>
                                          ) : (
                                            <span>Zatím jsi toto cvičení nevyzkoušel(a)</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0 justify-end">
                                      {sub.hasStudyMaterial && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => navigate(`/study/${sub.subtopicId}`)}
                                          className="rounded-xl font-bold text-xs h-8 px-3 bg-white border-gray-200 hover:border-black text-gray-700 cursor-pointer flex items-center gap-1.5"
                                        >
                                          <BookCyanIcon size={13} />
                                          <span>Studovat</span>
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        onClick={() => navigate(`/practice/session/${sub.subtopicId}`)}
                                        className="rounded-xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black text-xs h-8 px-3.5 cursor-pointer flex items-center gap-1.5 border border-blue-200/80"
                                      >
                                        <Play size={11} className="fill-[#0F2942] text-[#0F2942]" />
                                        <span>Procvičit</span>
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* 5. HISTORIE POSLEDNÍCH POKUSŮ */}
              <Card className="rounded-[1.75rem] border-none shadow-sm bg-white p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3 pb-4 mb-4 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
                      <Clock size={18} />
                    </div>
                    <div>
                      <h2 className="font-sans font-black text-lg sm:text-xl text-[#1E1B18]">
                        Historie pokusů
                      </h2>
                      <p className="text-xs font-semibold text-gray-400">
                        Chronologický přehled tvých dokončených procvičování ({stats.attemptsHistory.length} záznamů)
                      </p>
                    </div>
                  </div>
                </div>

                {stats.attemptsHistory.length === 0 ? (
                  <div className="text-center py-12 bg-[#FAF7F0] rounded-2xl border border-dashed border-gray-200">
                    <p className="text-sm font-bold text-gray-700">
                      V tomto období zatím nemáš žádné dokončené pokusy.
                    </p>
                    <Button
                      onClick={() => navigate('/practice')}
                      className="mt-3 rounded-xl bg-[#F5C400] hover:bg-[#E5B500] text-[#1E1B18] font-black text-xs h-9 px-4 cursor-pointer"
                    >
                      Spustit první procvičování
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {stats.attemptsHistory.slice(0, visibleHistoryCount).map(attempt => {
                      const isMath = attempt.subject === 'Matematika';
                      return (
                        <div
                          key={attempt.id}
                          className="p-3.5 sm:px-4 rounded-2xl bg-[#FAF7F0] hover:bg-white border border-gray-200/70 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-start sm:items-center gap-3 min-w-0">
                            <div
                              className={cn(
                                'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-black text-xs border',
                                getPercentageBadgeStyle(attempt.percentage, 1)
                              )}
                            >
                              {attempt.percentage}%
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={cn(
                                    'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded',
                                    isMath
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                                  )}
                                >
                                  {attempt.subject}
                                </span>
                                <span className="text-[11px] font-bold text-gray-400">
                                  {formatDateTime(attempt.createdAt)}
                                </span>
                              </div>
                              <h4 className="font-bold text-sm text-gray-900 truncate mt-0.5">
                                {attempt.subtopicTitle}
                              </h4>
                              <p className="text-[11px] font-semibold text-gray-500">
                                Skóre: <strong>{attempt.score}/{attempt.totalQuestions}</strong> správně • Téma: {attempt.topicTitle}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 justify-end">
                            {attempt.hasStudyMaterial && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => navigate(`/study/${attempt.subtopicId}`)}
                                className="rounded-xl font-bold text-xs h-8 px-3 bg-white border-gray-200 hover:border-black text-gray-700 cursor-pointer flex items-center gap-1.5"
                              >
                                <BookCyanIcon size={13} />
                                <span>Studovat téma</span>
                              </Button>
                            )}
                            <Button
                              size="sm"
                              onClick={() => navigate(`/practice/session/${attempt.subtopicId}`)}
                              className="rounded-xl bg-white hover:bg-gray-100 text-[#1E1B18] border border-gray-200 font-black text-xs h-8 px-3.5 cursor-pointer flex items-center gap-1.5 shadow-2xs"
                            >
                              <RotateCcw size={12} />
                              <span>Procvičit znovu</span>
                            </Button>
                          </div>
                        </div>
                      );
                    })}

                    {stats.attemptsHistory.length > visibleHistoryCount && (
                      <div className="pt-2 text-center">
                        <Button
                          variant="outline"
                          onClick={() => setVisibleHistoryCount(prev => prev + 15)}
                          className="rounded-xl font-bold text-xs h-9 px-5 border-gray-200 cursor-pointer"
                        >
                          Zobrazit další pokusy ({stats.attemptsHistory.length - visibleHistoryCount} zbývá)
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Sjednocený Paywall modal pro ne-PRO uživatele (stejný vzor jako v Materiálech) */}
      <UnifiedPaywallModal
        isOpen={!isPremium && !isPaywallDismissed}
        onClose={() => {
          setIsPaywallDismissed(true);
        }}
        type="premium"
        description="Podrobné statistiky úspěšnosti, semafor zvládnutých témat k přijímačkám, historie pokusů a chytrá doporučení na míru jsou dostupné v rámci předplatného ProEdu Premium."
      />

      {/* Modal pro naplánování procvičování do kalendáře */}
      <PracticeScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        initialSubject={scheduleInitialSubject}
        initialSubtopics={scheduleInitialSubtopics}
        existingTodos={todos}
      />
    </div>
  );
}
