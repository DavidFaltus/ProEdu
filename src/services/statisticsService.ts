import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PracticeTopic, PracticeSubtopic } from '../types';
import { getTopics, getSubtopics } from './practiceService';

export type StatsSubjectFilter = 'Vše' | 'Matematika' | 'Čeština';
export type StatsPeriodFilter = 'all' | '30d' | '7d';
export type MasteryStatus = 'mastered' | 'needs_practice' | 'critical' | 'unpracticed';

export interface DetailedAnswerRecord {
  questionId: string;
  questionText: string;
  userAnswer: string;
  correctAnswer?: string;
  isCorrect: boolean;
  explanation?: string;
  errorCode?: string | null;
  timeSpentMs?: number | null;
  options?: string[];
  selfScore?: number;
}

export interface StudentAttemptRecord {
  id: string;
  subtopicId: string;
  subtopicTitle: string;
  topicId: string;
  topicTitle: string;
  subject: 'Matematika' | 'Čeština';
  score: number;
  totalQuestions: number;
  percentage: number;
  createdAt: Date;
  hasStudyMaterial: boolean;
  durationSeconds?: number;
  detailedAnswers: DetailedAnswerRecord[];
}

export interface SubtopicMasteryItem {
  subtopicId: string;
  title: string;
  topicId: string;
  topicTitle: string;
  subject: 'Matematika' | 'Čeština';
  attemptsCount: number;
  totalAnswers: number;
  correctAnswers: number;
  averagePercentage: number; // Čistý průměr všech pokusů v tématu
  lastPercentage: number;
  bestPercentage: number;
  lastAttemptAt: Date | null;
  status: MasteryStatus;
  hasEnoughData: boolean; // false pokud < 10 odpovědí
  priorityScore: number;
  hasStudyMaterial: boolean;
  icon: string;
  order: number;
  statusBadge: {
    text: string;
    dotColor: string;
    badgeClass: string;
  };
}

export interface TopicChapterGroup {
  topicId: string;
  topicTitle: string;
  subject: 'Matematika' | 'Čeština';
  icon: string;
  order: number;
  averagePercentage: number;
  practicedCount: number;
  totalCount: number;
  subtopics: SubtopicMasteryItem[];
}

export type RecommendationReasonCode =
  | 'LOW_ACCURACY'
  | 'NOT_PRACTICED_14D'
  | 'NEEDS_REFRESH'
  | 'NEXT_IN_CHAPTER'
  | 'SINGLE_ATTEMPT';

export interface SmartRecommendationItem {
  subtopicId: string;
  title: string;
  topicId: string;
  topicTitle: string;
  subject: 'Matematika' | 'Čeština';
  category: 'weak' | 'refresh' | 'next';
  reasonCode: RecommendationReasonCode;
  reasonText: string;
  badgeText: string;
  estimatedMinutes: number;
  priorityScore: number;
  hasStudyMaterial: boolean;
  attemptsCount: number;
  averagePercentage?: number;
  isPrimary: boolean;
  icon: string;
}

export interface OverviewKpiData {
  accuracy: {
    percentage: number;
    hasEnoughData: boolean;
    totalAnswers: number;
    trend: number | null; // null pro 'all'
    description: string;
  };
  correctAnswers: {
    correctCount: number;
    totalCount: number;
    masteredTopicsCount: number;
    totalTopicsCount: number;
  };
  streak: {
    streakDays: number;
    last7Days: Array<{ date: string; dayName: string; isActive: boolean }>;
    motivationalText: string;
    totalCompletedExercises: number;
  };
}

export interface TimelinePoint {
  dateKey: string;
  label: string;
  dayName: string;
  averagePercentage: number;
  completedExercises: number;
  totalQuestions: number;
  correctAnswers: number;
}

export interface TimelineData {
  points: TimelinePoint[];
  hasEnoughData: boolean; // >= 3 dny s daty
  daysWithDataCount: number;
  textSummary: string;
}

export interface ErrorTypeInsight {
  id: string;
  title: string;
  description: string;
  count: number;
  percentage: number;
  icon: string;
  colorClass: string;
  cermatAdvice?: string;
}

export interface AnswerAnalysisInsights {
  hasEnoughData: boolean; // >= 10 odpovědí
  totalAnswersCount: number;
  errorTypes: ErrorTypeInsight[];
  pace: {
    averageSecondsPerQuestion: number;
    slowestTopics: Array<{
      subtopicId: string;
      title: string;
      subject: string;
      averageSeconds: number;
      questionsCount: number;
    }>;
    fastestTopics: Array<{
      subtopicId: string;
      title: string;
      subject: string;
      averageSeconds: number;
    }>;
    summary: string;
  };
  strugglingQuestions: Array<{
    questionId: string;
    questionText: string;
    subtopicId: string;
    subtopicTitle: string;
    subject: 'Matematika' | 'Čeština';
    failCount: number;
    correctAnswer?: string;
    explanation?: string;
    suggestedReviewText: string;
  }>;
}

export interface CompleteStatisticsResult {
  kpi: OverviewKpiData;
  primaryRecommendation: SmartRecommendationItem | null;
  secondaryRecommendations: SmartRecommendationItem[];
  topicChapters: TopicChapterGroup[];
  timeline: TimelineData;
  insights: AnswerAnalysisInsights;
  attemptsHistory: StudentAttemptRecord[];
  totalUnpracticedTopicsCount: number;
  isNewStudent: boolean;
  subjectFilter: StatsSubjectFilter;
  periodFilter: StatsPeriodFilter;
}

// Konfigurovatelné prahové konstanty dle kap. 4 & kap. 11
export const STATS_THRESHOLDS = {
  MIN_ANSWERS_FOR_ACCURACY: 10,
  MIN_DAYS_FOR_TIMELINE: 3,
  MIN_ANSWERS_FOR_INSIGHTS: 10,
  MASTERY_PERCENTAGE: 80,
  CRITICAL_PERCENTAGE: 50
};

export function resolveSubject(raw?: string, fallbackTitle?: string): 'Matematika' | 'Čeština' {
  if (!raw) {
    return fallbackTitle?.toLowerCase().includes('mat') ? 'Matematika' : 'Čeština';
  }
  const lower = raw.toLowerCase();
  if (lower.includes('češ') || lower.includes('ces') || lower.includes('cestina')) {
    return 'Čeština';
  }
  return 'Matematika';
}

export function getVisualStyle(title: string, subject: 'Matematika' | 'Čeština') {
  const t = title.toLowerCase();
  if (subject === 'Matematika') {
    if (t.includes('geom') || t.includes('úhl') || t.includes('těles') || t.includes('konstruk') || t.includes('trojúheln')) {
      return { icon: 'mozek', bg: 'bg-amber-100 text-amber-700', tagClass: 'bg-amber-50 text-amber-700 border border-amber-200' };
    }
    if (t.includes('zlom') || t.includes('procent') || t.includes('poměr') || t.includes('čísl') || t.includes('mocnin')) {
      return { icon: 'zarovka', bg: 'bg-indigo-100 text-indigo-700', tagClass: 'bg-indigo-50 text-indigo-700 border border-indigo-200' };
    }
    return { icon: 'mozek', bg: 'bg-blue-100 text-blue-700', tagClass: 'bg-blue-50 text-blue-700 border border-blue-200' };
  } else {
    if (t.includes('text') || t.includes('porozum') || t.includes('čtení') || t.includes('slohov')) {
      return { icon: 'material', bg: 'bg-emerald-100 text-emerald-700', tagClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
    }
    if (t.includes('člen') || t.includes('souvět') || t.includes('skladb') || t.includes('větn')) {
      return { icon: 'bublina', bg: 'bg-purple-100 text-purple-700', tagClass: 'bg-purple-50 text-purple-700 border border-purple-200' };
    }
    return { icon: 'kniha', bg: 'bg-rose-100 text-rose-700', tagClass: 'bg-rose-50 text-rose-700 border border-rose-200' };
  }
}

export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Načte surová data studenta (všechny pokusy z kolekce `tests` + viditelná témata a podtémata).
 */
export async function fetchStudentRawStatisticsData(userId?: string): Promise<{
  topics: PracticeTopic[];
  subtopics: PracticeSubtopic[];
  attempts: StudentAttemptRecord[];
}> {
  const [rawTopics, rawSubtopics] = await Promise.all([
    getTopics(),
    getSubtopics()
  ]);

  const hiddenTopicKeys = new Set<string>();
  rawTopics.forEach(t => {
    if (t.isHidden) {
      hiddenTopicKeys.add(t.id);
      if (t.title) hiddenTopicKeys.add(t.title);
    }
  });

  const visibleTopics = rawTopics.filter(t => !t.isHidden);
  const visibleSubtopics = rawSubtopics.filter(
    s => !s.isHidden && !hiddenTopicKeys.has(s.topicId)
  );

  const topicsById = new Map<string, PracticeTopic>();
  const topicsByTitle = new Map<string, PracticeTopic>();
  rawTopics.forEach(t => {
    topicsById.set(t.id, t);
    if (t.title) topicsByTitle.set(t.title, t);
  });

  const subtopicsById = new Map<string, PracticeSubtopic>();
  rawSubtopics.forEach(s => subtopicsById.set(s.id, s));

  const attempts: StudentAttemptRecord[] = [];

  if (userId) {
    try {
      const testsSnap = await getDocs(
        query(collection(db, 'tests'), where('studentId', '==', userId))
      );

      testsSnap.docs.forEach(docSnap => {
        const data = docSnap.data();
        let subtopicId = data.topic || '';
        let score = typeof data.score === 'number' ? data.score : 0;
        let totalQuestions = typeof data.totalQuestions === 'number' ? data.totalQuestions : 0;
        let percentage = typeof data.percentage === 'number' ? data.percentage : 0;
        let subjectRaw = '';
        let topicIdRaw = '';
        let durationSeconds = typeof data.durationSeconds === 'number' ? data.durationSeconds : undefined;

        if (data.description) {
          try {
            const parsed = JSON.parse(data.description);
            if (parsed.subtopicId) subtopicId = parsed.subtopicId;
            if (typeof parsed.score === 'number') score = parsed.score;
            if (typeof parsed.totalQuestions === 'number') totalQuestions = parsed.totalQuestions;
            if (typeof parsed.percentage === 'number') percentage = parsed.percentage;
            if (parsed.subjectId) subjectRaw = parsed.subjectId;
            if (parsed.topicId) topicIdRaw = parsed.topicId;
            if (typeof parsed.durationSeconds === 'number') durationSeconds = parsed.durationSeconds;
          } catch {
            // description was not JSON
          }
        }

        const matchedSubtopic = subtopicId ? subtopicsById.get(subtopicId) : undefined;
        if (matchedSubtopic && (matchedSubtopic.isHidden || hiddenTopicKeys.has(matchedSubtopic.topicId))) {
          return;
        }

        const resolvedSubtopicTitle =
          matchedSubtopic?.title ||
          data.title?.replace(/^Procvičování\s*\(\d+%\)/, '').trim() ||
          subtopicId ||
          'Procvičování';

        const resolvedTopicId = matchedSubtopic?.topicId || topicIdRaw || '';
        const matchedTopic = topicsById.get(resolvedTopicId) || topicsByTitle.get(resolvedTopicId);
        const resolvedTopicTitle = matchedTopic?.title || resolvedTopicId || 'Ostatní témata';
        const resolvedSubject = resolveSubject(subjectRaw || matchedSubtopic?.subjectId, resolvedSubtopicTitle);

        const createdAt = data.createdAt?.toDate
          ? data.createdAt.toDate()
          : data.createdAt?.seconds
            ? new Date(data.createdAt.seconds * 1000)
            : new Date();

        // Parsování jednotlivých otázek a odpovědí (pokud jsou uloženy)
        const detailedAnswers: DetailedAnswerRecord[] = [];
        if (Array.isArray(data.questions) && data.questions.length > 0) {
          data.questions.forEach((qItem: any, idx: number) => {
            if (!qItem) return;
            const isCorrect = qItem.isCorrect !== undefined ? Boolean(qItem.isCorrect) : Boolean(qItem.correct);
            detailedAnswers.push({
              questionId: qItem.id || `q_${idx}`,
              questionText: qItem.question || qItem.questionText || `Otázka ${idx + 1}`,
              userAnswer: qItem.userAnswer || qItem.answer || '',
              correctAnswer: qItem.correctAnswer || '',
              isCorrect,
              explanation: qItem.explanation || '',
              errorCode: qItem.errorCode || null,
              timeSpentMs: qItem.timeSpentMs || null,
              options: Array.isArray(qItem.options) ? qItem.options : undefined,
              selfScore: qItem.selfScore
            });
          });

          // Pokud score nebylo nastaveno, spočítáme ho z detailedAnswers
          if (totalQuestions === 0 && detailedAnswers.length > 0) {
            totalQuestions = detailedAnswers.length;
            score = detailedAnswers.filter(a => a.isCorrect).length;
            percentage = Math.round((score / totalQuestions) * 100);
          }
        }

        attempts.push({
          id: docSnap.id,
          subtopicId: subtopicId || docSnap.id,
          subtopicTitle: resolvedSubtopicTitle,
          topicId: matchedTopic?.id || resolvedTopicId || 'other',
          topicTitle: resolvedTopicTitle,
          subject: resolvedSubject,
          score,
          totalQuestions: totalQuestions || score,
          percentage: Math.min(100, Math.max(0, percentage)),
          createdAt,
          hasStudyMaterial: Boolean(matchedSubtopic?.hasStudyMaterial),
          durationSeconds,
          detailedAnswers
        });
      });
    } catch (err) {
      console.warn('Error loading student practice attempts for statistics:', err);
    }
  }

  // Seřadíme od nejnovějšího po nejstarší
  attempts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    topics: visibleTopics,
    subtopics: visibleSubtopics,
    attempts
  };
}

/**
 * Hlavní výpočet statistik splňující všechny požadavky kapitol 3, 4, 5.
 */
export function computeStudentStatistics(
  raw: {
    topics: PracticeTopic[];
    subtopics: PracticeSubtopic[];
    attempts: StudentAttemptRecord[];
  },
  subjectFilter: StatsSubjectFilter = 'Vše',
  periodFilter: StatsPeriodFilter = '7d',
  userStreak: number = 0
): CompleteStatisticsResult {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  let currentCutoffMs = 0;
  let prevStartMs = 0;
  let prevEndMs = 0;

  if (periodFilter === '7d') {
    currentCutoffMs = now - 7 * dayMs;
    prevStartMs = now - 14 * dayMs;
    prevEndMs = currentCutoffMs;
  } else if (periodFilter === '30d') {
    currentCutoffMs = now - 30 * dayMs;
    prevStartMs = now - 60 * dayMs;
    prevEndMs = currentCutoffMs;
  }

  // 1. Filtrování pokusů podle období
  const currentPeriodAttempts = currentCutoffMs > 0
    ? raw.attempts.filter(a => a.createdAt.getTime() >= currentCutoffMs)
    : raw.attempts;

  const previousPeriodAttempts = prevStartMs > 0 && prevEndMs > 0
    ? raw.attempts.filter(a => {
        const t = a.createdAt.getTime();
        return t >= prevStartMs && t < prevEndMs;
      })
    : [];

  // 2. Filtrování podle předmětu
  const filteredAttempts = subjectFilter === 'Vše'
    ? currentPeriodAttempts
    : currentPeriodAttempts.filter(a => a.subject === subjectFilter);

  const filteredPrevAttempts = subjectFilter === 'Vše'
    ? previousPeriodAttempts
    : previousPeriodAttempts.filter(a => a.subject === subjectFilter);

  // Všechny pokusy v předmětu (napříč celou historií) pro přesný výpočet stavu tématu
  const allSubjectAttempts = subjectFilter === 'Vše'
    ? raw.attempts
    : raw.attempts.filter(a => a.subject === subjectFilter);

  // 3. Viditelná podtémata v předmětu
  const visibleSubtopicsInSubject = subjectFilter === 'Vše'
    ? raw.subtopics
    : raw.subtopics.filter(s => resolveSubject(s.subjectId, s.title) === subjectFilter);

  // 4. Agregace pokusů po podtématech
  const attemptsBySubtopic = new Map<string, StudentAttemptRecord[]>();
  allSubjectAttempts.forEach(attempt => {
    const list = attemptsBySubtopic.get(attempt.subtopicId) || [];
    list.push(attempt);
    attemptsBySubtopic.set(attempt.subtopicId, list);
  });

  const topicLookup = new Map<string, PracticeTopic>();
  raw.topics.forEach(t => {
    topicLookup.set(t.id, t);
    if (t.title) topicLookup.set(t.title, t);
  });

  // 5. Výpočet SubtopicMasteryItem pro každé podtéma
  const subtopicMasteryList: SubtopicMasteryItem[] = visibleSubtopicsInSubject.map(sub => {
    const subAttempts = attemptsBySubtopic.get(sub.id) || [];
    const attemptsCount = subAttempts.length;
    const subject = resolveSubject(sub.subjectId, sub.title);
    const parentTopic = topicLookup.get(sub.topicId);

    const totalAnswers = subAttempts.reduce((s, a) => s + a.totalQuestions, 0);
    const correctAnswers = subAttempts.reduce((s, a) => s + a.score, 0);

    // Čistý průměr všech pokusů v tématu
    const averagePercentage = attemptsCount > 0
      ? Math.round(subAttempts.reduce((s, a) => s + a.percentage, 0) / attemptsCount)
      : 0;

    const lastPercentage = attemptsCount > 0 ? subAttempts[0].percentage : 0;
    const bestPercentage = attemptsCount > 0 ? Math.max(...subAttempts.map(a => a.percentage)) : 0;
    const lastAttemptAt = attemptsCount > 0 ? subAttempts[0].createdAt : null;

    // Prahová hodnota pro spolehlivost dat: méně než 10 odpovědí = málo dat
    const hasEnoughData = totalAnswers >= STATS_THRESHOLDS.MIN_ANSWERS_FOR_ACCURACY;

    let status: MasteryStatus = 'unpracticed';
    if (attemptsCount > 0) {
      if (averagePercentage >= STATS_THRESHOLDS.MASTERY_PERCENTAGE) {
        status = 'mastered';
      } else if (averagePercentage >= STATS_THRESHOLDS.CRITICAL_PERCENTAGE) {
        status = 'needs_practice';
      } else {
        status = 'critical';
      }
    }

    // Odznáček a štítek (Pravidlo 4 & 8: stav nikdy nesmí být jen barvou, vždy ikona nebo textový štítek; při < 10 nezobrazovat červeně)
    let statusBadge = {
      text: 'Nevyzkoušeno',
      dotColor: 'bg-gray-300',
      badgeClass: 'bg-gray-100 text-gray-500 border-gray-200'
    };

    if (attemptsCount > 0) {
      if (!hasEnoughData && status === 'critical') {
        // Téma s méně než 10 odpověďmi se označí „Zatím málo dat“ a nezobrazuje se jako červené
        statusBadge = {
          text: 'Zatím málo dat',
          dotColor: 'bg-amber-400',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200'
        };
      } else if (status === 'mastered') {
        statusBadge = {
          text: 'Zvládnuto',
          dotColor: 'bg-emerald-500',
          badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200'
        };
      } else if (status === 'needs_practice') {
        statusBadge = {
          text: 'Skoro to máš',
          dotColor: 'bg-blue-500',
          badgeClass: 'bg-blue-50 text-brand-blue border-blue-200'
        };
      } else {
        statusBadge = {
          text: 'Zopakovat',
          dotColor: 'bg-rose-500',
          badgeClass: 'bg-rose-50 text-rose-800 border-rose-200'
        };
      }
    }

    // Výpočet prioritního skóre pro doporučení a řazení v mapě témat (kap. 5)
    let priorityScore = 0;
    const daysSinceLast = lastAttemptAt ? Math.floor((now - lastAttemptAt.getTime()) / dayMs) : 999;

    if (attemptsCount > 0) {
      if (status === 'critical') {
        // Slabé místo: nízká úspěšnost při dostatku dat, vyšší váha pro opakovaně nízký výsledek
        priorityScore = (100 - averagePercentage) * 2 + Math.min(attemptsCount * 4, 30);
      } else if (status === 'needs_practice') {
        priorityScore = 60 + (80 - averagePercentage) * 1.5;
      } else if (status === 'mastered') {
        // K osvěžení paměti: téma, které student kdysi zvládl, ale nepracoval s ním delší dobu
        if (daysSinceLast >= 14) {
          priorityScore = 50 + Math.min(daysSinceLast, 30);
        } else if (daysSinceLast >= 7) {
          priorityScore = 35 + daysSinceLast;
        } else {
          priorityScore = 5;
        }
      }
    } else {
      // Další krok: nezačaté téma
      priorityScore = 20;
    }

    const visual = getVisualStyle(sub.title, subject);

    return {
      subtopicId: sub.id,
      title: sub.title,
      topicId: parentTopic?.id || sub.topicId,
      topicTitle: parentTopic?.title || sub.topicId || 'Ostatní témata',
      subject,
      attemptsCount,
      totalAnswers,
      correctAnswers,
      averagePercentage,
      lastPercentage,
      bestPercentage,
      lastAttemptAt,
      status,
      hasEnoughData,
      priorityScore,
      hasStudyMaterial: Boolean(sub.hasStudyMaterial),
      icon: visual.icon,
      order: sub.order ?? 999,
      statusBadge
    };
  });

  // 6. Výpočet KPI (kap. 3.3 & kap. 4)
  const periodTotalAnswers = filteredAttempts.reduce((s, a) => s + a.totalQuestions, 0);
  const periodCorrectAnswers = filteredAttempts.reduce((s, a) => s + a.score, 0);
  const accuracyPercentage = periodTotalAnswers > 0
    ? Math.round((periodCorrectAnswers / periodTotalAnswers) * 100)
    : 0;

  const prevTotalAnswers = filteredPrevAttempts.reduce((s, a) => s + a.totalQuestions, 0);
  const prevCorrectAnswers = filteredPrevAttempts.reduce((s, a) => s + a.score, 0);
  const prevAccuracy = prevTotalAnswers > 0
    ? Math.round((prevCorrectAnswers / prevTotalAnswers) * 100)
    : null;

  let trend: number | null = null;
  if (periodFilter !== 'all' && prevAccuracy !== null && periodTotalAnswers > 0) {
    trend = accuracyPercentage - prevAccuracy;
  }

  const kpiAccuracyHasEnoughData = periodTotalAnswers >= STATS_THRESHOLDS.MIN_ANSWERS_FOR_ACCURACY;

  let accuracyDesc = '';
  if (!kpiAccuracyHasEnoughData) {
    accuracyDesc = `Zatím málo dat (${periodTotalAnswers} z 10 odpovědí pro spolehlivou statistiku).`;
  } else {
    const exCount = filteredAttempts.length;
    const exWord = exCount === 1 ? 'dokončené cvičení' : exCount < 5 ? 'dokončená cvičení' : 'dokončených cvičení';
    accuracyDesc = `${exCount} ${exWord} v tomto období.`;
  }

  const masteredTopicsCount = subtopicMasteryList.filter(
    m => m.attemptsCount > 0 && m.averagePercentage >= STATS_THRESHOLDS.MASTERY_PERCENTAGE
  ).length;

  // Mini-pruh 7 dní pro sérii
  const activeDaysSet = new Set<string>();
  raw.attempts.forEach(a => activeDaysSet.add(toDateKey(a.createdAt)));

  const last7Days: Array<{ date: string; dayName: string; isActive: boolean }> = [];
  const dayNames = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    const k = toDateKey(d);
    last7Days.push({
      date: k,
      dayName: dayNames[d.getDay()],
      isActive: activeDaysSet.has(k)
    });
  }

  // Motivační věta k sérii
  let streakMotivationalText = 'Začni novou sérii a trénuj každý den alespoň 5 minut!';
  if (userStreak >= 10) {
    streakMotivationalText = `Úžasná práce! Série ${userStreak} dní v řadě ti udržuje vyšší denní kapacitu žolíků.`;
  } else if (userStreak >= 5) {
    streakMotivationalText = `Skvělé tempo! Už jen ${10 - userStreak} dní do navýšení kapacity na 15 žolíků.`;
  } else if (userStreak >= 1) {
    streakMotivationalText = `Dnes máš splněno! Vrať se zítra a posuň svou sérii na ${userStreak + 1} dní.`;
  }

  const kpi: OverviewKpiData = {
    accuracy: {
      percentage: accuracyPercentage,
      hasEnoughData: kpiAccuracyHasEnoughData,
      totalAnswers: periodTotalAnswers,
      trend,
      description: accuracyDesc
    },
    correctAnswers: {
      correctCount: periodCorrectAnswers,
      totalCount: periodTotalAnswers,
      masteredTopicsCount,
      totalTopicsCount: visibleSubtopicsInSubject.length
    },
    streak: {
      streakDays: userStreak,
      last7Days,
      motivationalText: streakMotivationalText,
      totalCompletedExercises: filteredAttempts.length
    }
  };

  // 7. Doporučovací logika (kap. 5 & kap. 3.2)
  const candidateRecommendations: SmartRecommendationItem[] = [];

  // Projdeme podtémata a sestavíme kandidáty
  subtopicMasteryList.forEach(item => {
    const daysSince = item.lastAttemptAt ? Math.floor((now - item.lastAttemptAt.getTime()) / dayMs) : undefined;

    if (item.attemptsCount > 0) {
      if (item.status === 'critical') {
        const isSingle = item.attemptsCount === 1;
        candidateRecommendations.push({
          subtopicId: item.subtopicId,
          title: item.title,
          topicId: item.topicId,
          topicTitle: item.topicTitle,
          subject: item.subject,
          category: 'weak',
          reasonCode: isSingle ? 'SINGLE_ATTEMPT' : 'LOW_ACCURACY',
          badgeText: isSingle ? '1 pokus' : `Průměr ${item.averagePercentage} %`,
          reasonText: isSingle
            ? `Máš za sebou zatím jen jeden pokus (${item.averagePercentage} %). Zopakuj cvičení pro upevnění výsledku.`
            : `V tomto tématu se ti opakovaně nedaří (${item.averagePercentage} %). Doporučujeme projít nejdříve teorii.`,
          estimatedMinutes: 6,
          priorityScore: item.priorityScore + (isSingle ? 0 : 25),
          hasStudyMaterial: item.hasStudyMaterial,
          attemptsCount: item.attemptsCount,
          averagePercentage: item.averagePercentage,
          isPrimary: false,
          icon: item.icon
        });
      } else if (item.status === 'needs_practice') {
        candidateRecommendations.push({
          subtopicId: item.subtopicId,
          title: item.title,
          topicId: item.topicId,
          topicTitle: item.topicTitle,
          subject: item.subject,
          category: 'weak',
          reasonCode: 'LOW_ACCURACY',
          badgeText: `Průměr ${item.averagePercentage} %`,
          reasonText: `Úspěšnost ${item.averagePercentage} % – ještě jedno procvičení tě posune mezi zvládnutá témata nad 80 %.`,
          estimatedMinutes: 5,
          priorityScore: item.priorityScore,
          hasStudyMaterial: item.hasStudyMaterial,
          attemptsCount: item.attemptsCount,
          averagePercentage: item.averagePercentage,
          isPrimary: false,
          icon: item.icon
        });
      } else if (item.status === 'mastered' && daysSince !== undefined && daysSince >= 7) {
        candidateRecommendations.push({
          subtopicId: item.subtopicId,
          title: item.title,
          topicId: item.topicId,
          topicTitle: item.topicTitle,
          subject: item.subject,
          category: 'refresh',
          reasonCode: daysSince >= 14 ? 'NOT_PRACTICED_14D' : 'NEEDS_REFRESH',
          badgeText: `Před ${daysSince} dny`,
          reasonText: `Naposledy procvičeno před ${daysSince} dny. Krátké osvěžení paměti pomůže zafixovat látku k přijímačkám.`,
          estimatedMinutes: 5,
          priorityScore: item.priorityScore,
          hasStudyMaterial: item.hasStudyMaterial,
          attemptsCount: item.attemptsCount,
          averagePercentage: item.averagePercentage,
          isPrimary: false,
          icon: item.icon
        });
      }
    } else {
      // Nezačaté téma: pokud předchozí téma v kapitole bylo procvičeno, nabídneme jako další krok
      candidateRecommendations.push({
        subtopicId: item.subtopicId,
        title: item.title,
        topicId: item.topicId,
        topicTitle: item.topicTitle,
        subject: item.subject,
        category: 'next',
        reasonCode: 'NEXT_IN_CHAPTER',
        badgeText: 'Nové téma',
        reasonText: `Důležitý okruh z kapitoly „${item.topicTitle}“, který jsi zatím nevyzkoušel(a).`,
        estimatedMinutes: 7,
        priorityScore: item.priorityScore,
        hasStudyMaterial: item.hasStudyMaterial,
        attemptsCount: 0,
        isPrimary: false,
        icon: item.icon
      });
    }
  });

  candidateRecommendations.sort((a, b) => b.priorityScore - a.priorityScore);

  let primaryRecommendation: SmartRecommendationItem | null = null;
  const secondaryRecommendations: SmartRecommendationItem[] = [];

  if (candidateRecommendations.length > 0) {
    primaryRecommendation = { ...candidateRecommendations[0], isPrimary: true };
    if (candidateRecommendations.length > 1) {
      secondaryRecommendations.push(candidateRecommendations[1]);
    }
    if (candidateRecommendations.length > 2) {
      secondaryRecommendations.push(candidateRecommendations[2]);
    }
  }

  // 8. Mapa témat (seskupeno podle kapitol) (kap. 3.4)
  const chaptersMap = new Map<string, TopicChapterGroup>();
  subtopicMasteryList.forEach(item => {
    const groupKey = `${item.subject}__${item.topicId}`;
    let chapter = chaptersMap.get(groupKey);
    if (!chapter) {
      const parentTopic = topicLookup.get(item.topicId);
      chapter = {
        topicId: item.topicId,
        topicTitle: item.topicTitle,
        subject: item.subject,
        icon: item.icon || 'mozek',
        order: parentTopic?.order ?? 999,
        averagePercentage: 0,
        practicedCount: 0,
        totalCount: 0,
        subtopics: []
      };
      chaptersMap.set(groupKey, chapter);
    }
    chapter.subtopics.push(item);
  });

  const topicChapters: TopicChapterGroup[] = Array.from(chaptersMap.values()).map(chap => {
    // Řazení podtémat uvnitř kapitoly podle priority (kap. 3.4: "Řazení: podle priority, ne abecedně")
    chap.subtopics.sort((a, b) => b.priorityScore - a.priorityScore || a.order - b.order);

    const practiced = chap.subtopics.filter(s => s.attemptsCount > 0);
    const practicedCount = practiced.length;
    const totalCount = chap.subtopics.length;
    const totalAttempts = chap.subtopics.reduce((s, sub) => s + sub.attemptsCount, 0);

    const weightedSum = chap.subtopics.reduce((s, sub) => s + sub.averagePercentage * sub.attemptsCount, 0);
    const avgPct = totalAttempts > 0 ? Math.round(weightedSum / totalAttempts) : 0;

    return {
      ...chap,
      practicedCount,
      totalCount,
      averagePercentage: avgPct
    };
  });

  // Řazení kapitol: ty s největším počtem témat k doučení mají přednost
  topicChapters.sort((a, b) => {
    if (a.subject !== b.subject) return a.subject === 'Matematika' ? -1 : 1;
    const aCritical = a.subtopics.filter(s => s.status === 'critical' || s.status === 'needs_practice').length;
    const bCritical = b.subtopics.filter(s => s.status === 'critical' || s.status === 'needs_practice').length;
    if (aCritical !== bCritical) return bCritical - aCritical;
    return a.order - b.order || a.topicTitle.localeCompare(b.topicTitle, 'cs');
  });

  const totalUnpracticedTopicsCount = subtopicMasteryList.filter(s => s.attemptsCount === 0).length;

  // 9. Vývoj v čase (kap. 3.5: spojnicový graf, >= 3 dny s daty)
  const daysToShow = periodFilter === '7d' ? 7 : periodFilter === '30d' ? 30 : 14;
  const byDayMap = new Map<string, StudentAttemptRecord[]>();
  filteredAttempts.forEach(a => {
    const k = toDateKey(a.createdAt);
    const arr = byDayMap.get(k) || [];
    arr.push(a);
    byDayMap.set(k, arr);
  });

  const timelinePoints: TimelinePoint[] = [];
  let daysWithDataCount = 0;

  for (let i = daysToShow - 1; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    const k = toDateKey(d);
    const dayAttempts = byDayMap.get(k) || [];
    if (dayAttempts.length > 0) {
      daysWithDataCount++;
    }

    const dayQuestions = dayAttempts.reduce((s, a) => s + a.totalQuestions, 0);
    const dayCorrect = dayAttempts.reduce((s, a) => s + a.score, 0);
    const dayAvg = dayQuestions > 0 ? Math.round((dayCorrect / dayQuestions) * 100) : 0;

    timelinePoints.push({
      dateKey: k,
      label: d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }),
      dayName: dayNames[d.getDay()],
      averagePercentage: dayAvg,
      completedExercises: dayAttempts.length,
      totalQuestions: dayQuestions,
      correctAnswers: dayCorrect
    });
  }

  const timelineHasEnoughData = daysWithDataCount >= STATS_THRESHOLDS.MIN_DAYS_FOR_TIMELINE;

  const timeline: TimelineData = {
    points: timelinePoints,
    hasEnoughData: timelineHasEnoughData,
    daysWithDataCount,
    textSummary: timelineHasEnoughData
      ? `Vývoj úspěšnosti za vybrané období: průměrná úspěšnost dosahuje ${accuracyPercentage} % napříč ${daysWithDataCount} aktivními dny.`
      : `Zatím máš zaznamenána data z ${daysWithDataCount} z ${STATS_THRESHOLDS.MIN_DAYS_FOR_TIMELINE} potřebných dnů pro zobrazení spojnicového grafu.`
  };

  // 10. Rozbor tvých odpovědí (kap. 3.6: >= 10 odpovědí)
  const allDetailedAnswers: Array<DetailedAnswerRecord & { subject: 'Matematika' | 'Čeština'; subtopicId: string; subtopicTitle: string }> = [];
  filteredAttempts.forEach(attempt => {
    if (Array.isArray(attempt.detailedAnswers)) {
      attempt.detailedAnswers.forEach(ans => {
        allDetailedAnswers.push({
          ...ans,
          subject: attempt.subject,
          subtopicId: attempt.subtopicId,
          subtopicTitle: attempt.subtopicTitle
        });
      });
    }
  });

  const totalAnswersCount = allDetailedAnswers.length > 0 ? allDetailedAnswers.length : periodTotalAnswers;
  const insightsHasEnoughData = totalAnswersCount >= STATS_THRESHOLDS.MIN_ANSWERS_FOR_INSIGHTS;

  // Analýza typů chyb (kap. 3.6 & 3.6.1)
  const errorTypeMap = new Map<string, { title: string; desc: string; count: number; icon: string; color: string }>();

  // Výchozí taxonomické kategorie pro CERMAT přijímačky
  const initErrorCategory = (id: string, title: string, desc: string, icon: string, color: string) => {
    errorTypeMap.set(id, { title, desc, count: 0, icon, color });
  };

  initErrorCategory('sign_error', 'Znaménka a závorky', 'Záměna plus a mínus, pravidla pro násobení záporných čísel a odstraňování závorek.', '±', 'bg-rose-50 text-rose-700 border-rose-200');
  initErrorCategory('fraction_reduction', 'Zlomky a poměry', 'Chyby při hledání společného jmenovatele, krácení a převodu na základní tvar.', '½', 'bg-amber-50 text-amber-700 border-amber-200');
  initErrorCategory('geometry_formula', 'Geometrické vzorce', 'Záměna vzorců pro obvod, obsah a objem těles, převody jednotek obsahu a objemu.', '📐', 'bg-indigo-50 text-indigo-700 border-indigo-200');
  initErrorCategory('spelling_rules', 'Pravopisná pravidla (i/y, s/z)', 'Psaní i/y v koncovkách podstatných a přídavných jmen, shoda přísudku s podmětem.', '✍️', 'bg-purple-50 text-purple-700 border-purple-200');
  initErrorCategory('text_analysis', 'Práce s textem', 'Nepozornost při čtení zadání, vyhledávání informací v textu nebo nesprávná interpretace.', '📖', 'bg-emerald-50 text-emerald-700 border-emerald-200');

  // Detekce chyb z reálných odpovědí
  const failedAnswers = allDetailedAnswers.filter(a => !a.isCorrect);
  failedAnswers.forEach(ans => {
    const text = (ans.questionText + ' ' + ans.userAnswer + ' ' + (ans.explanation || '')).toLowerCase();
    if (ans.subject === 'Matematika') {
      if (text.includes('zlom') || text.includes('jmenovatel') || text.includes('čitatel') || text.includes('krácen')) {
        errorTypeMap.get('fraction_reduction')!.count++;
      } else if (text.includes('geom') || text.includes('úhel') || text.includes('obsah') || text.includes('obvod') || text.includes('těles') || text.includes('trojúh')) {
        errorTypeMap.get('geometry_formula')!.count++;
      } else {
        errorTypeMap.get('sign_error')!.count++;
      }
    } else {
      if (text.includes('text') || text.includes('úryvek') || text.includes('odstavec') || text.includes('význam') || text.includes('vyplývá')) {
        errorTypeMap.get('text_analysis')!.count++;
      } else {
        errorTypeMap.get('spelling_rules')!.count++;
      }
    }
  });

  const totalErrorsCount = Math.max(1, failedAnswers.length);
  const errorTypes: ErrorTypeInsight[] = Array.from(errorTypeMap.entries())
    .map(([id, val]) => ({
      id,
      title: val.title,
      description: val.desc,
      count: val.count,
      percentage: Math.round((val.count / totalErrorsCount) * 100),
      icon: val.icon,
      colorClass: val.color
    }))
    .filter(e => e.count > 0 || !insightsHasEnoughData)
    .sort((a, b) => b.count - a.count);

  // Analýza tempa odpovídání
  let totalTrackedSeconds = 0;
  let trackedQuestionsCount = 0;
  const topicDurationMap = new Map<string, { title: string; subject: string; totalSec: number; count: number }>();

  filteredAttempts.forEach(attempt => {
    if (attempt.durationSeconds && attempt.durationSeconds > 0 && attempt.totalQuestions > 0) {
      totalTrackedSeconds += attempt.durationSeconds;
      trackedQuestionsCount += attempt.totalQuestions;

      const item = topicDurationMap.get(attempt.subtopicId) || {
        title: attempt.subtopicTitle,
        subject: attempt.subject,
        totalSec: 0,
        count: 0
      };
      item.totalSec += attempt.durationSeconds;
      item.count += attempt.totalQuestions;
      topicDurationMap.set(attempt.subtopicId, item);
    }
  });

  const avgSeconds = trackedQuestionsCount > 0
    ? Math.round(totalTrackedSeconds / trackedQuestionsCount)
    : 45; // výchozí benchmark pro přijímačky

  const topicPaceList = Array.from(topicDurationMap.entries()).map(([subtopicId, val]) => ({
    subtopicId,
    title: val.title,
    subject: val.subject,
    averageSeconds: Math.round(val.totalSec / val.count),
    questionsCount: val.count
  }));

  topicPaceList.sort((a, b) => b.averageSeconds - a.averageSeconds);
  const slowestTopics = topicPaceList.slice(0, 3);
  const fastestTopics = [...topicPaceList].reverse().slice(0, 2);

  let paceSummary = 'Tvé tempo je vyrovnané a odpovídá doporučenému času pro CERMAT testy (cca 45–60 s na otázku).';
  if (avgSeconds > 75) {
    paceSummary = 'U komplexnějších úloh trávíš více času. Pro přijímačky doporučujeme trénovat rychlý náčrtek a vynechání nejasných úloh s návratem na konci.';
  } else if (avgSeconds < 30 && accuracyPercentage < 70) {
    paceSummary = 'Odpovídáš velmi rychle, ale často na úkor přesnosti. Zkus si každé zadání přečíst ještě jednou a zkontrolovat mezivýpočty.';
  }

  // Úlohy, které se opakovaně nedaří
  const questionFailsMap = new Map<string, {
    questionText: string;
    subtopicId: string;
    subtopicTitle: string;
    subject: 'Matematika' | 'Čeština';
    failCount: number;
    correctAnswer?: string;
    explanation?: string;
  }>();

  failedAnswers.forEach(ans => {
    const existing = questionFailsMap.get(ans.questionId) || {
      questionText: ans.questionText,
      subtopicId: ans.subtopicId,
      subtopicTitle: ans.subtopicTitle,
      subject: ans.subject,
      failCount: 0,
      correctAnswer: ans.correctAnswer,
      explanation: ans.explanation
    };
    existing.failCount++;
    questionFailsMap.set(ans.questionId, existing);
  });

  const strugglingQuestions = Array.from(questionFailsMap.entries())
    .map(([questionId, val]) => ({
      questionId,
      questionText: val.questionText,
      subtopicId: val.subtopicId,
      subtopicTitle: val.subtopicTitle,
      subject: val.subject,
      failCount: val.failCount,
      correctAnswer: val.correctAnswer,
      explanation: val.explanation,
      suggestedReviewText: val.failCount >= 2
        ? 'Doporučujeme zopakovat zítra'
        : 'Zopakovat do 3 dnů'
    }))
    .sort((a, b) => b.failCount - a.failCount)
    .slice(0, 4);

  const insights: AnswerAnalysisInsights = {
    hasEnoughData: insightsHasEnoughData,
    totalAnswersCount,
    errorTypes,
    pace: {
      averageSecondsPerQuestion: avgSeconds,
      slowestTopics,
      fastestTopics,
      summary: paceSummary
    },
    strugglingQuestions
  };

  const isNewStudent = raw.attempts.length === 0;

  return {
    kpi,
    primaryRecommendation,
    secondaryRecommendations,
    topicChapters,
    timeline,
    insights,
    attemptsHistory: filteredAttempts,
    totalUnpracticedTopicsCount,
    isNewStudent,
    subjectFilter,
    periodFilter
  };
}

/**
 * Demo náhled statistik pro ne-PRO uživatele nebo pro seznámení s rozhraním
 */
export function getDemoStatisticsPreview(): CompleteStatisticsResult {
  const dummyResult = computeStudentStatistics({
    topics: [],
    subtopics: [],
    attempts: []
  });

  return {
    ...dummyResult,
    isNewStudent: false,
    kpi: {
      accuracy: {
        percentage: 78,
        hasEnoughData: true,
        totalAnswers: 86,
        trend: 12,
        description: 'Z 86 odpovědí za posledních 7 dní (12 dokončených cvičení).'
      },
      correctAnswers: {
        correctCount: 67,
        totalCount: 86,
        masteredTopicsCount: 14,
        totalTopicsCount: 28
      },
      streak: {
        streakDays: 4,
        last7Days: [
          { date: '2026-11-06', dayName: 'Pá', isActive: true },
          { date: '2026-11-07', dayName: 'So', isActive: false },
          { date: '2026-11-08', dayName: 'Ne', isActive: false },
          { date: '2026-11-09', dayName: 'Po', isActive: true },
          { date: '2026-11-10', dayName: 'Út', isActive: true },
          { date: '2026-11-11', dayName: 'St', isActive: true },
          { date: '2026-11-12', dayName: 'Čt', isActive: true }
        ],
        motivationalText: 'Skvělé tempo! Už jen 6 dní do navýšení kapacity na 15 žolíků.',
        totalCompletedExercises: 12
      }
    },
    primaryRecommendation: {
      subtopicId: 'demo-sub-1',
      title: 'Lomené výrazy a jejich podmínky',
      topicId: 'demo-top-1',
      topicTitle: 'Rovnice a algebraické výrazy',
      subject: 'Matematika',
      category: 'weak',
      reasonCode: 'LOW_ACCURACY',
      badgeText: 'Průměr 45 %',
      reasonText: 'Poslední pokus byl 40 %. Pojďme si nejdřív zopakovat určování podmínek jmenovatele a zkusit to znovu.',
      estimatedMinutes: 6,
      priorityScore: 95,
      hasStudyMaterial: true,
      attemptsCount: 3,
      averagePercentage: 45,
      isPrimary: true,
      icon: 'zarovka'
    },
    secondaryRecommendations: [
      {
        subtopicId: 'demo-sub-2',
        title: 'Shoda přísudku s několikanásobným podmětem',
        topicId: 'demo-top-2',
        topicTitle: 'Skladba a větné rozbory',
        subject: 'Čeština',
        category: 'refresh',
        reasonCode: 'NOT_PRACTICED_14D',
        badgeText: 'Před 12 dny',
        reasonText: 'Naposledy procvičeno před 12 dny. Krátké osvěžení paměti pomůže zafixovat pravidla rodu.',
        estimatedMinutes: 5,
        priorityScore: 75,
        hasStudyMaterial: true,
        attemptsCount: 2,
        averagePercentage: 85,
        isPrimary: false,
        icon: 'bublina'
      },
      {
        subtopicId: 'demo-sub-3',
        title: 'Povrchy a objemy rotačních těles',
        topicId: 'demo-top-3',
        topicTitle: 'Prostorová geometrie',
        subject: 'Matematika',
        category: 'next',
        reasonCode: 'NEXT_IN_CHAPTER',
        badgeText: 'Nové téma',
        reasonText: 'Důležitý okruh pro přijímačkový test, který jsi zatím nevyzkoušel(a).',
        estimatedMinutes: 8,
        priorityScore: 60,
        hasStudyMaterial: true,
        attemptsCount: 0,
        isPrimary: false,
        icon: 'mozek'
      }
    ],
    topicChapters: [
      {
        topicId: 'demo-top-1',
        topicTitle: '1. Čísla a algebraické výrazy',
        subject: 'Matematika',
        icon: 'zarovka',
        order: 1,
        averagePercentage: 62,
        practicedCount: 3,
        totalCount: 4,
        subtopics: [
          {
            subtopicId: 'demo-sub-1',
            title: 'Lomené výrazy a jejich podmínky',
            topicId: 'demo-top-1',
            topicTitle: '1. Čísla a algebraické výrazy',
            subject: 'Matematika',
            attemptsCount: 3,
            totalAnswers: 18,
            correctAnswers: 8,
            averagePercentage: 45,
            lastPercentage: 40,
            bestPercentage: 55,
            lastAttemptAt: new Date(Date.now() - 2 * 86400000),
            status: 'critical',
            hasEnoughData: true,
            priorityScore: 95,
            hasStudyMaterial: true,
            icon: 'zarovka',
            order: 1,
            statusBadge: {
              text: 'Zopakovat',
              dotColor: 'bg-rose-500',
              badgeClass: 'bg-rose-50 text-rose-700 border-rose-200'
            }
          },
          {
            subtopicId: 'demo-sub-1b',
            title: 'Zlomky a smíšená čísla',
            topicId: 'demo-top-1',
            topicTitle: '1. Čísla a algebraické výrazy',
            subject: 'Matematika',
            attemptsCount: 5,
            totalAnswers: 32,
            correctAnswers: 26,
            averagePercentage: 78,
            lastPercentage: 80,
            bestPercentage: 90,
            lastAttemptAt: new Date(Date.now() - 1 * 86400000),
            status: 'needs_practice',
            hasEnoughData: true,
            priorityScore: 50,
            hasStudyMaterial: true,
            icon: 'zarovka',
            order: 2,
            statusBadge: {
              text: 'Skoro to máš',
              dotColor: 'bg-amber-500',
              badgeClass: 'bg-amber-50 text-amber-700 border-amber-200'
            }
          },
          {
            subtopicId: 'demo-sub-1c',
            title: 'Mocniny a odmocniny',
            topicId: 'demo-top-1',
            topicTitle: '1. Čísla a algebraické výrazy',
            subject: 'Matematika',
            attemptsCount: 4,
            totalAnswers: 24,
            correctAnswers: 22,
            averagePercentage: 92,
            lastPercentage: 100,
            bestPercentage: 100,
            lastAttemptAt: new Date(Date.now() - 4 * 86400000),
            status: 'mastered',
            hasEnoughData: true,
            priorityScore: 10,
            hasStudyMaterial: true,
            icon: 'zarovka',
            order: 3,
            statusBadge: {
              text: 'Zvládnuto',
              dotColor: 'bg-emerald-500',
              badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }
          }
        ]
      }
    ],
    timeline: {
      points: [
        { dateKey: '2026-11-06', label: '6. 11.', dayName: 'Pá', averagePercentage: 65, completedExercises: 2, totalQuestions: 15, correctAnswers: 10 },
        { dateKey: '2026-11-09', label: '9. 11.', dayName: 'Po', averagePercentage: 72, completedExercises: 3, totalQuestions: 20, correctAnswers: 14 },
        { dateKey: '2026-11-10', label: '10. 11.', dayName: 'Út', averagePercentage: 85, completedExercises: 4, totalQuestions: 25, correctAnswers: 21 },
        { dateKey: '2026-11-12', label: '12. 11.', dayName: 'Čt', averagePercentage: 80, completedExercises: 3, totalQuestions: 26, correctAnswers: 21 }
      ],
      hasEnoughData: true,
      daysWithDataCount: 4,
      textSummary: 'Průměrná úspěšnost vzrostla za poslední týden z 65 % na 80 % napříč 4 aktivními dny.'
    },
    insights: {
      hasEnoughData: true,
      totalAnswersCount: 86,
      errorTypes: [
        {
          id: 'sign_error',
          title: 'Znaménka a závorky',
          description: 'Záměna plus a mínus před závorkou a pravidla násobení záporných čísel.',
          count: 6,
          percentage: 43,
          icon: '±',
          colorClass: 'bg-rose-50 text-rose-700 border-rose-200',
          cermatAdvice: 'Před odstraněním závorky s mínusem si nejprve barevně zvýrazni znaménka všech členů uvnitř.'
        },
        {
          id: 'fraction_reduction',
          title: 'Zlomky a převody',
          description: 'Chyby při hledání společného jmenovatele nebo krácení před násobením.',
          count: 5,
          percentage: 36,
          icon: '½',
          colorClass: 'bg-amber-50 text-amber-700 border-amber-200',
          cermatAdvice: 'U zlomků vždy zkontroluj, zda je výsledek v základním tvaru nebo smíšeném čísle.'
        }
      ],
      pace: {
        averageSecondsPerQuestion: 68,
        slowestTopics: [
          { subtopicId: 'demo-sub-1', title: 'Lomené výrazy a jejich podmínky', subject: 'Matematika', averageSeconds: 98, questionsCount: 8 }
        ],
        fastestTopics: [
          { subtopicId: 'demo-sub-1c', title: 'Mocniny a odmocniny', subject: 'Matematika', averageSeconds: 24 }
        ],
        summary: 'Nejvíce času (průměrně 98 s na otázku) ti zabírají lomené výrazy. Tréninkem se tempo zrychlí.'
      },
      strugglingQuestions: [
        {
          questionId: 'demo-q1',
          questionText: 'Zjednodušte lomený výraz: (x² - 4)/(2x - 4)',
          subtopicId: 'demo-sub-1',
          subtopicTitle: 'Lomené výrazy',
          subject: 'Matematika',
          failCount: 2,
          correctAnswer: '(x + 2)/2, x ≠ 2',
          explanation: 'Rozlož čitatele podle vzorce (a² - b²) a jmenovatele vytknutím 2.',
          suggestedReviewText: 'Tuto úlohu jsi 2× nezvládl(a) kvůli podmínkám řešitelnosti. Zkus si ji zopakovat ještě dnes.'
        }
      ]
    }
  };
}
