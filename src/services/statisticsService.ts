import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PracticeTopic, PracticeSubtopic } from '../types';
import { getTopics, getSubtopics } from './practiceService';

export type StatsSubjectFilter = 'Vše' | 'Matematika' | 'Čeština';
export type StatsPeriodFilter = 'all' | '30d' | '7d';

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
}

export type MasteryStatus = 'mastered' | 'needs_practice' | 'critical' | 'unpracticed';

export interface SubtopicMasteryItem {
  subtopicId: string;
  title: string;
  topicId: string;
  topicTitle: string;
  subject: 'Matematika' | 'Čeština';
  attemptsCount: number;
  averagePercentage: number; // Čistý průměr všech pokusů od začátku
  bestPercentage: number;
  lastPercentage: number;
  totalScore: number;
  totalQuestions: number;
  lastAttemptAt: Date | null;
  status: MasteryStatus;
  hasStudyMaterial: boolean;
  icon: string;
  order: number;
}

export interface TopicMasteryGroup {
  topicId: string;
  topicTitle: string;
  subject: 'Matematika' | 'Čeština';
  icon: string;
  order: number;
  averagePercentage: number;
  practicedSubtopicsCount: number;
  totalSubtopicsCount: number;
  totalAttempts: number;
  subtopics: SubtopicMasteryItem[];
}

export interface SubjectComparisonStats {
  subject: 'Matematika' | 'Čeština';
  attemptsCount: number;
  averagePercentage: number;
  totalScore: number;
  totalQuestions: number;
  practicedSubtopicsCount: number;
  masteredSubtopicsCount: number;
  totalSubtopicsCount: number;
  coveragePercentage: number;
}

export interface DailyActivityPoint {
  dateKey: string; // YYYY-MM-DD
  label: string;   // např. "Po 4. 11." nebo "4. 11."
  attemptsCount: number;
  averagePercentage: number;
  totalQuestions: number;
  correctAnswers: number;
}

export interface SmartRecommendationItem {
  subtopicId: string;
  title: string;
  topicId: string;
  topicTitle: string;
  subject: 'Matematika' | 'Čeština';
  category: 'weak' | 'refresh' | 'next';
  badgeText: string;
  reasonText: string;
  averagePercentage?: number;
  lastPercentage?: number;
  bestPercentage?: number;
  attemptsCount: number;
  daysSinceLastAttempt?: number;
  hasStudyMaterial: boolean;
  icon: string;
  bg: string;
  tagClass: string;
}

export interface StudentStatisticsData {
  // Celkové KPI (podle zvoleného filtru)
  totalAttempts: number;
  averagePercentage: number;
  totalScore: number;
  totalQuestions: number;
  accuracyPercentage: number;
  activeDaysCount: number;
  practicedSubtopicsCount: number;
  totalVisibleSubtopicsCount: number;
  masteredSubtopicsCount: number;

  // Srovnání předmětů
  mathStats: SubjectComparisonStats;
  czechStats: SubjectComparisonStats;

  // Časová osa (vývoj v čase)
  timeline: DailyActivityPoint[];

  // Chytrá doporučení v 3 kategoriích
  recommendations: {
    weakSpots: SmartRecommendationItem[];
    toRefresh: SmartRecommendationItem[];
    nextSteps: SmartRecommendationItem[];
  };

  // Semafor znalostí (témata a podtémata)
  topicGroups: TopicMasteryGroup[];

  // Historie pokusů (seřazeno od nejnovějšího)
  attemptsHistory: StudentAttemptRecord[];
}

function resolveSubject(raw?: string, fallbackTitle?: string): 'Matematika' | 'Čeština' {
  if (!raw) {
    return fallbackTitle?.toLowerCase().includes('mat') ? 'Matematika' : 'Čeština';
  }
  const lower = raw.toLowerCase();
  if (lower.includes('češ') || lower.includes('ces') || lower.includes('cestina')) {
    return 'Čeština';
  }
  return 'Matematika';
}

function getVisualStyle(title: string, subject: 'Matematika' | 'Čeština') {
  const t = title.toLowerCase();
  if (subject === 'Matematika') {
    if (t.includes('geom') || t.includes('úhl') || t.includes('těles') || t.includes('konstruk') || t.includes('trojúheln')) {
      return {
        icon: 'mozek',
        bg: 'bg-amber-100 text-amber-700',
        tagClass: 'bg-amber-50 text-amber-700 border border-amber-200'
      };
    }
    if (t.includes('zlom') || t.includes('procent') || t.includes('poměr') || t.includes('čísl') || t.includes('mocnin')) {
      return {
        icon: 'zarovka',
        bg: 'bg-indigo-100 text-indigo-700',
        tagClass: 'bg-indigo-50 text-indigo-700 border border-indigo-200'
      };
    }
    return {
      icon: 'mozek',
      bg: 'bg-blue-100 text-blue-700',
      tagClass: 'bg-blue-50 text-blue-700 border border-blue-200'
    };
  } else {
    if (t.includes('text') || t.includes('porozum') || t.includes('čtení') || t.includes('slohov')) {
      return {
        icon: 'material',
        bg: 'bg-emerald-100 text-emerald-700',
        tagClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      };
    }
    if (t.includes('člen') || t.includes('souvět') || t.includes('skladb') || t.includes('větn')) {
      return {
        icon: 'bublina',
        bg: 'bg-purple-100 text-purple-700',
        tagClass: 'bg-purple-50 text-purple-700 border border-purple-200'
      };
    }
    return {
      icon: 'kniha',
      bg: 'bg-rose-100 text-rose-700',
      tagClass: 'bg-rose-50 text-rose-700 border border-rose-200'
    };
  }
}

function getMasteryStatus(attemptsCount: number, averagePercentage: number): MasteryStatus {
  if (attemptsCount === 0) return 'unpracticed';
  if (averagePercentage >= 80) return 'mastered';
  if (averagePercentage >= 50) return 'needs_practice';
  return 'critical';
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Načte surová data studenta (všechny jeho pokusy z kolekce `tests` + viditelná témata a podtémata).
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

  // Odfiltrujeme skrytá témata a podtémata
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
        let score = 0;
        let totalQuestions = 0;
        let percentage = 0;
        let subjectRaw = '';
        let topicIdRaw = '';

        if (data.description) {
          try {
            const parsed = JSON.parse(data.description);
            if (parsed.subtopicId) subtopicId = parsed.subtopicId;
            if (typeof parsed.score === 'number') score = parsed.score;
            if (typeof parsed.totalQuestions === 'number') totalQuestions = parsed.totalQuestions;
            if (typeof parsed.percentage === 'number') percentage = parsed.percentage;
            if (parsed.subjectId) subjectRaw = parsed.subjectId;
            if (parsed.topicId) topicIdRaw = parsed.topicId;
          } catch {
            // description nebyl JSON
          }
        }

        const matchedSubtopic = subtopicId ? subtopicsById.get(subtopicId) : undefined;
        // Pokud je podtéma nebo jeho téma skryté administrátorem, do statistik studenta ho nezahrnujeme
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
          hasStudyMaterial: Boolean(matchedSubtopic?.hasStudyMaterial)
        });
      });
    } catch (err) {
      console.warn('Error loading student practice attempts for statistics:', err);
    }
  }

  // Seřadíme pokusy od nejnovějšího po nejstarší
  attempts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    topics: visibleTopics,
    subtopics: visibleSubtopics,
    attempts
  };
}

/**
 * Spočítá kompletní statistiky, semafor znalostí, vývoj v čase a chytrá doporučení
 * pro zvolený filtr předmětu a období.
 * Úspěšnost u podtématu se počítá jako čistý aritmetický průměr všech pokusů v daném období.
 */
export function computeStudentStatistics(
  raw: {
    topics: PracticeTopic[];
    subtopics: PracticeSubtopic[];
    attempts: StudentAttemptRecord[];
  },
  subjectFilter: StatsSubjectFilter = 'Vše',
  periodFilter: StatsPeriodFilter = 'all',
  userFocusAreas: string[] = []
): StudentStatisticsData {
  const now = Date.now();
  const cutoffMs =
    periodFilter === '7d'
      ? now - 7 * 24 * 60 * 60 * 1000
      : periodFilter === '30d'
        ? now - 30 * 24 * 60 * 60 * 1000
        : 0;

  // 1. Pokusy filtrované podle období (pro porovnání předmětů i celková čísla)
  const periodAttempts = cutoffMs > 0
    ? raw.attempts.filter(a => a.createdAt.getTime() >= cutoffMs)
    : raw.attempts;

  // 2. Pokusy filtrované podle období i předmětu
  const filteredAttempts = subjectFilter === 'Vše'
    ? periodAttempts
    : periodAttempts.filter(a => a.subject === subjectFilter);

  // 3. Viditelná podtémata podle filtru předmětu
  const filteredSubtopics = subjectFilter === 'Vše'
    ? raw.subtopics
    : raw.subtopics.filter(s => resolveSubject(s.subjectId, s.title) === subjectFilter);

  // 4. Agregace pokusů po podtématech (z periodAttempts, abychom měli data i pro porovnání Mat vs. ČJ)
  const attemptsBySubtopic = new Map<string, StudentAttemptRecord[]>();
  periodAttempts.forEach(attempt => {
    const list = attemptsBySubtopic.get(attempt.subtopicId) || [];
    list.push(attempt);
    attemptsBySubtopic.set(attempt.subtopicId, list);
  });

  // Mapa témat pro vyhledání názvu a ikony
  const topicLookup = new Map<string, PracticeTopic>();
  raw.topics.forEach(t => {
    topicLookup.set(t.id, t);
    if (t.title) topicLookup.set(t.title, t);
  });

  // 5. Sestavíme SubtopicMasteryItem pro každé viditelné podtéma
  const allSubtopicMastery: SubtopicMasteryItem[] = raw.subtopics.map(sub => {
    const subAttempts = attemptsBySubtopic.get(sub.id) || [];
    const attemptsCount = subAttempts.length;
    const subject = resolveSubject(sub.subjectId, sub.title);
    const parentTopic = topicLookup.get(sub.topicId);

    // Čistý aritmetický průměr úplně všech pokusů (v daném časovém filtru)
    const averagePercentage = attemptsCount > 0
      ? Math.round(subAttempts.reduce((sum, a) => sum + a.percentage, 0) / attemptsCount)
      : 0;

    const bestPercentage = attemptsCount > 0
      ? Math.max(...subAttempts.map(a => a.percentage))
      : 0;

    // subAttempts jsou seřazené od nejnovějšího
    const lastPercentage = attemptsCount > 0 ? subAttempts[0].percentage : 0;
    const lastAttemptAt = attemptsCount > 0 ? subAttempts[0].createdAt : null;
    const totalScore = subAttempts.reduce((sum, a) => sum + a.score, 0);
    const totalQuestions = subAttempts.reduce((sum, a) => sum + a.totalQuestions, 0);

    const visual = getVisualStyle(sub.title, subject);

    return {
      subtopicId: sub.id,
      title: sub.title,
      topicId: parentTopic?.id || sub.topicId,
      topicTitle: parentTopic?.title || sub.topicId || 'Ostatní témata',
      subject,
      attemptsCount,
      averagePercentage,
      bestPercentage,
      lastPercentage,
      totalScore,
      totalQuestions,
      lastAttemptAt,
      status: getMasteryStatus(attemptsCount, averagePercentage),
      hasStudyMaterial: Boolean(sub.hasStudyMaterial),
      icon: visual.icon,
      order: sub.order ?? 999
    };
  });

  const filteredSubtopicMastery = subjectFilter === 'Vše'
    ? allSubtopicMastery
    : allSubtopicMastery.filter(m => m.subject === subjectFilter);

  // 6. Celkové KPI metriky
  const totalAttempts = filteredAttempts.length;
  const averagePercentage = totalAttempts > 0
    ? Math.round(filteredAttempts.reduce((sum, a) => sum + a.percentage, 0) / totalAttempts)
    : 0;
  const totalScore = filteredAttempts.reduce((sum, a) => sum + a.score, 0);
  const totalQuestions = filteredAttempts.reduce((sum, a) => sum + a.totalQuestions, 0);
  const accuracyPercentage = totalQuestions > 0
    ? Math.round((totalScore / totalQuestions) * 100)
    : 0;

  const activeDaysSet = new Set<string>();
  filteredAttempts.forEach(a => activeDaysSet.add(toDateKey(a.createdAt)));
  const activeDaysCount = activeDaysSet.size;

  const practicedSubtopicsCount = filteredSubtopicMastery.filter(m => m.attemptsCount > 0).length;
  const totalVisibleSubtopicsCount = filteredSubtopics.length;
  const masteredSubtopicsCount = filteredSubtopicMastery.filter(m => m.status === 'mastered').length;

  // 7. Srovnání předmětů (Matematika vs. Čeština)
  const buildSubjectStats = (subj: 'Matematika' | 'Čeština'): SubjectComparisonStats => {
    const subjAttempts = periodAttempts.filter(a => a.subject === subj);
    const subjMastery = allSubtopicMastery.filter(m => m.subject === subj);
    const practicedCount = subjMastery.filter(m => m.attemptsCount > 0).length;
    const masteredCount = subjMastery.filter(m => m.status === 'mastered').length;
    const totalCount = subjMastery.length;

    return {
      subject: subj,
      attemptsCount: subjAttempts.length,
      averagePercentage: subjAttempts.length > 0
        ? Math.round(subjAttempts.reduce((s, a) => s + a.percentage, 0) / subjAttempts.length)
        : 0,
      totalScore: subjAttempts.reduce((s, a) => s + a.score, 0),
      totalQuestions: subjAttempts.reduce((s, a) => s + a.totalQuestions, 0),
      practicedSubtopicsCount: practicedCount,
      masteredSubtopicsCount: masteredCount,
      totalSubtopicsCount: totalCount,
      coveragePercentage: totalCount > 0 ? Math.round((practicedCount / totalCount) * 100) : 0
    };
  };

  const mathStats = buildSubjectStats('Matematika');
  const czechStats = buildSubjectStats('Čeština');

  // 8. Vývoj v čase (posledních 14 aktivních dnů nebo posledních 7/14 kalendářních dnů)
  const daysToShow = periodFilter === '7d' ? 7 : 14;
  const byDayMap = new Map<string, StudentAttemptRecord[]>();
  filteredAttempts.forEach(a => {
    const key = toDateKey(a.createdAt);
    const arr = byDayMap.get(key) || [];
    arr.push(a);
    byDayMap.set(key, arr);
  });

  const timeline: DailyActivityPoint[] = [];
  for (let i = daysToShow - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = toDateKey(d);
    const dayAttempts = byDayMap.get(key) || [];
    const dayAvg = dayAttempts.length > 0
      ? Math.round(dayAttempts.reduce((s, a) => s + a.percentage, 0) / dayAttempts.length)
      : 0;
    const dayQuestions = dayAttempts.reduce((s, a) => s + a.totalQuestions, 0);
    const dayCorrect = dayAttempts.reduce((s, a) => s + a.score, 0);

    timeline.push({
      dateKey: key,
      label: d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }),
      attemptsCount: dayAttempts.length,
      averagePercentage: dayAvg,
      totalQuestions: dayQuestions,
      correctAnswers: dayCorrect
    });
  }

  // 9. Seskupení podtémat do témat (TopicMasteryGroup) pro Semafor znalostí
  const groupsMap = new Map<string, TopicMasteryGroup>();
  filteredSubtopicMastery.forEach(item => {
    const parentTopic = topicLookup.get(item.topicId);
    const groupKey = `${item.subject}__${item.topicId}`;
    let group = groupsMap.get(groupKey);
    if (!group) {
      group = {
        topicId: item.topicId,
        topicTitle: item.topicTitle,
        subject: item.subject,
        icon: item.icon || 'mozek',
        order: parentTopic?.order ?? 999,
        averagePercentage: 0,
        practicedSubtopicsCount: 0,
        totalSubtopicsCount: 0,
        totalAttempts: 0,
        subtopics: []
      };
      groupsMap.set(groupKey, group);
    }
    group.subtopics.push(item);
  });

  const topicGroups: TopicMasteryGroup[] = Array.from(groupsMap.values()).map(group => {
    group.subtopics.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'cs'));
    const practiced = group.subtopics.filter(s => s.attemptsCount > 0);
    const totalAttemptsInTopic = group.subtopics.reduce((s, sub) => s + sub.attemptsCount, 0);
    // Čistý průměr ze všech pokusů v daném tématu
    const weightedSum = group.subtopics.reduce((s, sub) => s + sub.averagePercentage * sub.attemptsCount, 0);
    const avgPct = totalAttemptsInTopic > 0 ? Math.round(weightedSum / totalAttemptsInTopic) : 0;

    return {
      ...group,
      practicedSubtopicsCount: practiced.length,
      totalSubtopicsCount: group.subtopics.length,
      totalAttempts: totalAttemptsInTopic,
      averagePercentage: avgPct
    };
  });

  topicGroups.sort((a, b) => {
    if (a.subject !== b.subject) return a.subject === 'Matematika' ? -1 : 1;
    return a.order - b.order || a.topicTitle.localeCompare(b.topicTitle, 'cs');
  });

  // 10. Chytrá doporučení rozdělená do 3 kategorií:
  // 1) Slabá místa k doučení (průměrná úspěšnost < 70 %)
  // 2) K osvěžení paměti (procvičeno >= 5 dní zpět s >= 70 %, nebo průměr 70–84 %)
  // 3) Další doporučené kroky (nevyzkoušená témata a témata z focusAreas)
  const weakSpots: SmartRecommendationItem[] = [];
  const toRefresh: SmartRecommendationItem[] = [];
  const nextSteps: SmartRecommendationItem[] = [];

  filteredSubtopicMastery.forEach(item => {
    const visual = getVisualStyle(item.title, item.subject);
    const daysSince = item.lastAttemptAt
      ? Math.floor((now - item.lastAttemptAt.getTime()) / (1000 * 60 * 60 * 24))
      : undefined;
    const isFocus = userFocusAreas.some(fa =>
      item.title.toLowerCase().includes(fa.toLowerCase()) ||
      fa.toLowerCase().includes(item.title.toLowerCase())
    );

    if (item.attemptsCount > 0 && item.averagePercentage < 70) {
      weakSpots.push({
        subtopicId: item.subtopicId,
        title: item.title,
        topicId: item.topicId,
        topicTitle: item.topicTitle,
        subject: item.subject,
        category: 'weak',
        badgeText: `Průměr ${item.averagePercentage} %`,
        reasonText: item.hasStudyMaterial
          ? `Průměrná úspěšnost ${item.averagePercentage} % (${item.attemptsCount}× procvičeno). Doporučujeme nejprve projít teorii a poté cvičení zopakovat.`
          : `Průměrná úspěšnost ${item.averagePercentage} % (${item.attemptsCount}× procvičeno). Zkus si téma znovu procvičit pro upevnění látky.`,
        averagePercentage: item.averagePercentage,
        lastPercentage: item.lastPercentage,
        bestPercentage: item.bestPercentage,
        attemptsCount: item.attemptsCount,
        daysSinceLastAttempt: daysSince,
        hasStudyMaterial: item.hasStudyMaterial,
        icon: visual.icon,
        bg: visual.bg,
        tagClass: visual.tagClass
      });
    } else if (item.attemptsCount > 0 && ((daysSince !== undefined && daysSince >= 5) || item.averagePercentage < 85)) {
      toRefresh.push({
        subtopicId: item.subtopicId,
        title: item.title,
        topicId: item.topicId,
        topicTitle: item.topicTitle,
        subject: item.subject,
        category: 'refresh',
        badgeText: daysSince && daysSince >= 5 ? `Před ${daysSince} dny` : `Průměr ${item.averagePercentage} %`,
        reasonText: daysSince && daysSince >= 5
          ? `Naposledy procvičeno před ${daysSince} dny (průměr ${item.averagePercentage} %). Krátké opakování pomůže udržet znalosti v dlouhodobé paměti.`
          : `Dobrá úspěšnost ${item.averagePercentage} % – ještě jeden trénink tě posune nad hranici 85 % (Zvládnuto).`,
        averagePercentage: item.averagePercentage,
        lastPercentage: item.lastPercentage,
        bestPercentage: item.bestPercentage,
        attemptsCount: item.attemptsCount,
        daysSinceLastAttempt: daysSince,
        hasStudyMaterial: item.hasStudyMaterial,
        icon: visual.icon,
        bg: visual.bg,
        tagClass: visual.tagClass
      });
    } else if (item.attemptsCount === 0) {
      nextSteps.push({
        subtopicId: item.subtopicId,
        title: item.title,
        topicId: item.topicId,
        topicTitle: item.topicTitle,
        subject: item.subject,
        category: 'next',
        badgeText: isFocus ? 'Tvé zaměření' : 'Nové téma',
        reasonText: isFocus
          ? 'Téma odpovídá tvým prioritním cílům a zatím jsi ho neprocvičoval(a).'
          : `Důležitý okruh z tématu „${item.topicTitle}“, který jsi zatím nevyzkoušel(a).`,
        attemptsCount: 0,
        hasStudyMaterial: item.hasStudyMaterial,
        icon: visual.icon,
        bg: visual.bg,
        tagClass: visual.tagClass
      });
    }
  });

  // Seřadíme doporučení podle naléhavosti
  weakSpots.sort((a, b) => (a.averagePercentage ?? 0) - (b.averagePercentage ?? 0));
  toRefresh.sort((a, b) => (b.daysSinceLastAttempt ?? 0) - (a.daysSinceLastAttempt ?? 0) || (a.averagePercentage ?? 0) - (b.averagePercentage ?? 0));

  return {
    totalAttempts,
    averagePercentage,
    totalScore,
    totalQuestions,
    accuracyPercentage,
    activeDaysCount,
    practicedSubtopicsCount,
    totalVisibleSubtopicsCount,
    masteredSubtopicsCount,
    mathStats,
    czechStats,
    timeline,
    recommendations: {
      weakSpots: weakSpots.slice(0, 6),
      toRefresh: toRefresh.slice(0, 6),
      nextSteps: nextSteps.slice(0, 6)
    },
    topicGroups,
    attemptsHistory: filteredAttempts
  };
}

/**
 * Ukázková (demo) data pro rozmazaný náhled na pozadí, když na stránku přijde
 * nepřihlášený návštěvník nebo Free uživatel, který zatím nemá žádné vlastní pokusy.
 */
export function getDemoStatisticsPreview(): StudentStatisticsData {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  const timeline: DailyActivityPoint[] = Array.from({ length: 14 }, (_, idx) => {
    const d = new Date(now - (13 - idx) * dayMs);
    const counts = [1, 0, 2, 1, 3, 0, 2, 1, 2, 0, 3, 2, 1, 2];
    const pcts = [70, 0, 82, 75, 88, 0, 80, 90, 85, 0, 92, 86, 90, 94];
    const c = counts[idx % counts.length];
    const p = pcts[idx % pcts.length];
    return {
      dateKey: toDateKey(d),
      label: d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }),
      attemptsCount: c,
      averagePercentage: p,
      totalQuestions: c * 10,
      correctAnswers: Math.round((c * 10 * p) / 100)
    };
  });

  return {
    totalAttempts: 24,
    averagePercentage: 84,
    totalScore: 202,
    totalQuestions: 240,
    accuracyPercentage: 84,
    activeDaysCount: 11,
    practicedSubtopicsCount: 14,
    totalVisibleSubtopicsCount: 22,
    masteredSubtopicsCount: 9,
    mathStats: {
      subject: 'Matematika',
      attemptsCount: 13,
      averagePercentage: 81,
      totalScore: 105,
      totalQuestions: 130,
      practicedSubtopicsCount: 7,
      masteredSubtopicsCount: 4,
      totalSubtopicsCount: 11,
      coveragePercentage: 64
    },
    czechStats: {
      subject: 'Čeština',
      attemptsCount: 11,
      averagePercentage: 88,
      totalScore: 97,
      totalQuestions: 110,
      practicedSubtopicsCount: 7,
      masteredSubtopicsCount: 5,
      totalSubtopicsCount: 11,
      coveragePercentage: 64
    },
    timeline,
    recommendations: {
      weakSpots: [
        {
          subtopicId: 'demo-1',
          title: 'Slovní úlohy na pohyb a společnou práci',
          topicId: 'demo-t1',
          topicTitle: 'Rovnice a slovní úlohy',
          subject: 'Matematika',
          category: 'weak',
          badgeText: 'Průměr 58 %',
          reasonText: 'Průměrná úspěšnost 58 % (3× procvičeno). Doporučujeme nejprve projít teorii a poté cvičení zopakovat.',
          averagePercentage: 58,
          lastPercentage: 60,
          bestPercentage: 70,
          attemptsCount: 3,
          hasStudyMaterial: true,
          icon: 'zarovka',
          bg: 'bg-indigo-100 text-indigo-700',
          tagClass: 'bg-indigo-50 text-indigo-700 border border-indigo-200'
        },
        {
          subtopicId: 'demo-2',
          title: 'Větné členy a vedlejší věty',
          topicId: 'demo-t2',
          topicTitle: 'Skladba',
          subject: 'Čeština',
          category: 'weak',
          badgeText: 'Průměr 65 %',
          reasonText: 'Průměrná úspěšnost 65 % (2× procvičeno). Zkus si téma znovu procvičit pro upevnění látky.',
          averagePercentage: 65,
          lastPercentage: 70,
          bestPercentage: 70,
          attemptsCount: 2,
          hasStudyMaterial: true,
          icon: 'bublina',
          bg: 'bg-purple-100 text-purple-700',
          tagClass: 'bg-purple-50 text-purple-700 border border-purple-200'
        }
      ],
      toRefresh: [],
      nextSteps: []
    },
    topicGroups: [
      {
        topicId: 'demo-t1',
        topicTitle: 'Čísla, zlomky a výrazy',
        subject: 'Matematika',
        icon: 'mozek',
        order: 1,
        averagePercentage: 86,
        practicedSubtopicsCount: 3,
        totalSubtopicsCount: 3,
        totalAttempts: 7,
        subtopics: [
          {
            subtopicId: 'demo-s1',
            title: 'Zlomky a složené zlomky',
            topicId: 'demo-t1',
            topicTitle: 'Čísla, zlomky a výrazy',
            subject: 'Matematika',
            attemptsCount: 3,
            averagePercentage: 90,
            bestPercentage: 100,
            lastPercentage: 90,
            totalScore: 27,
            totalQuestions: 30,
            lastAttemptAt: new Date(now - dayMs),
            status: 'mastered',
            hasStudyMaterial: true,
            icon: 'mozek',
            order: 1
          },
          {
            subtopicId: 'demo-s2',
            title: 'Lineární rovnice se zlomky',
            topicId: 'demo-t1',
            topicTitle: 'Čísla, zlomky a výrazy',
            subject: 'Matematika',
            attemptsCount: 2,
            averagePercentage: 65,
            bestPercentage: 70,
            lastPercentage: 70,
            totalScore: 13,
            totalQuestions: 20,
            lastAttemptAt: new Date(now - 3 * dayMs),
            status: 'needs_practice',
            hasStudyMaterial: true,
            icon: 'mozek',
            order: 2
          }
        ]
      }
    ],
    attemptsHistory: [
      {
        id: 'demo-a1',
        subtopicId: 'demo-s1',
        subtopicTitle: 'Zlomky a složené zlomky',
        topicId: 'demo-t1',
        topicTitle: 'Čísla, zlomky a výrazy',
        subject: 'Matematika',
        score: 9,
        totalQuestions: 10,
        percentage: 90,
        createdAt: new Date(now - 3600 * 1000 * 5),
        hasStudyMaterial: true
      },
      {
        id: 'demo-a2',
        subtopicId: 'demo-s2',
        subtopicTitle: 'Pravopis velkých písmen a shoda přísudku',
        topicId: 'demo-t2',
        topicTitle: 'Pravopis',
        subject: 'Čeština',
        score: 8,
        totalQuestions: 10,
        percentage: 80,
        createdAt: new Date(now - dayMs),
        hasStudyMaterial: true
      }
    ]
  };
}
