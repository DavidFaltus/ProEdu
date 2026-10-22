import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { PracticeSubtopic } from '../types';
import { getSubtopics } from './practiceService';

export interface RecommendedPracticeItem {
  subtopicId: string;
  title: string;
  subject: 'Matematika' | 'Čeština';
  topicTitle?: string;
  icon: string;
  bg: string;
  tagClass: string;
  difficulty: string;
  badge: {
    text: string;
    variant: 'warning' | 'info' | 'accent' | 'success';
  };
  reasonText: string;
  hasStudyMaterial?: boolean;
  lastPercentage?: number;
  attemptsCount?: number;
}

interface AttemptStats {
  attemptsCount: number;
  lastPercentage: number;
  bestPercentage: number;
  lastAttemptAt: Date;
}

// Fallback topics if Firestore has no subtopics yet
const FALLBACK_TOPICS: RecommendedPracticeItem[] = [
  {
    subtopicId: 'math-linear-equations',
    title: 'Lineární rovnice a výrazy',
    subject: 'Matematika',
    difficulty: '10 úloh • Střední',
    icon: '🧮',
    bg: 'bg-blue-100 text-blue-700',
    tagClass: 'bg-blue-50 text-blue-700 border border-blue-200',
    badge: {
      text: 'Klíčové k PZ',
      variant: 'accent'
    },
    reasonText: 'Základní pilíř testů Cermat – algebra a rovnice'
  },
  {
    subtopicId: 'cz-spelling-rules',
    title: 'Pravopis velkých písmen a shoda',
    subject: 'Čeština',
    difficulty: '10 úloh • Klíčové',
    icon: '📖',
    bg: 'bg-rose-100 text-rose-700',
    tagClass: 'bg-rose-50 text-rose-700 border border-rose-200',
    badge: {
      text: 'Časté chyby',
      variant: 'warning'
    },
    reasonText: 'Oblast, kde studenti na zkouškách nejčastěji ztrácejí body'
  },
  {
    subtopicId: 'cz-reading-comprehension',
    title: 'Práce s textem a porozumění',
    subject: 'Čeština',
    difficulty: '10 úloh • Cermat typ',
    icon: '✍️',
    bg: 'bg-emerald-100 text-emerald-700',
    tagClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    badge: {
      text: 'Cermat formát',
      variant: 'success'
    },
    reasonText: 'Analýza výchozích textů a kritické čtení'
  }
];

function getVisualProps(title: string, subject: 'Matematika' | 'Čeština') {
  const t = title.toLowerCase();
  if (subject === 'Matematika') {
    if (t.includes('rovnic') || t.includes('výraz') || t.includes('algebra') || t.includes('úprav')) {
      return {
        icon: '🧮',
        bg: 'bg-blue-100 text-blue-700',
        tagClass: 'bg-blue-50 text-blue-700 border border-blue-200'
      };
    }
    if (t.includes('geom') || t.includes('úhl') || t.includes('planim') || t.includes('těles') || t.includes('konstruk') || t.includes('trojúheln')) {
      return {
        icon: '📐',
        bg: 'bg-amber-100 text-amber-700',
        tagClass: 'bg-amber-50 text-amber-700 border border-amber-200'
      };
    }
    if (t.includes('zlom') || t.includes('procent') || t.includes('poměr') || t.includes('čísl') || t.includes('mocnin')) {
      return {
        icon: '📊',
        bg: 'bg-indigo-100 text-indigo-700',
        tagClass: 'bg-indigo-50 text-indigo-700 border border-indigo-200'
      };
    }
    if (t.includes('slovní') || t.includes('pohyb') || t.includes('úloh') || t.includes('prác')) {
      return {
        icon: '💡',
        bg: 'bg-cyan-100 text-cyan-700',
        tagClass: 'bg-cyan-50 text-cyan-700 border border-cyan-200'
      };
    }
    return {
      icon: '🔢',
      bg: 'bg-blue-100 text-blue-700',
      tagClass: 'bg-blue-50 text-blue-700 border border-blue-200'
    };
  } else {
    // Čeština
    if (t.includes('pravopis') || t.includes('shod') || t.includes('vyjmen') || t.includes('písmen') || t.includes('interpunk')) {
      return {
        icon: '📖',
        bg: 'bg-rose-100 text-rose-700',
        tagClass: 'bg-rose-50 text-rose-700 border border-rose-200'
      };
    }
    if (t.includes('text') || t.includes('porozum') || t.includes('čtení') || t.includes('slohov') || t.includes('stylist')) {
      return {
        icon: '✍️',
        bg: 'bg-emerald-100 text-emerald-700',
        tagClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      };
    }
    if (t.includes('člen') || t.includes('souvět') || t.includes('skladb') || t.includes('větn') || t.includes('poměr')) {
      return {
        icon: '🧩',
        bg: 'bg-purple-100 text-purple-700',
        tagClass: 'bg-purple-50 text-purple-700 border border-purple-200'
      };
    }
    if (t.includes('tvaroslov') || t.includes('slovní druh') || t.includes('rozbor') || t.includes('kořen') || t.includes('předpon')) {
      return {
        icon: '📝',
        bg: 'bg-orange-100 text-orange-700',
        tagClass: 'bg-orange-50 text-orange-700 border border-orange-200'
      };
    }
    return {
      icon: '📚',
      bg: 'bg-rose-100 text-rose-700',
      tagClass: 'bg-rose-50 text-rose-700 border border-rose-200'
    };
  }
}

/**
 * Načte personalizovaná doporučená procvičování pro přihlášeného studenta.
 * Zohledňuje:
 * 1. Témata s nízkým skóre (< 70 %) -> priorita 1 k procvičení a zlepšení
 * 2. Témata odpovídající vybraným oblastem studenta (focusAreas)
 * 3. Nová klíčová témata, která student ještě neprocvičoval
 * 4. Témata procvičená před delší dobou (pro zopakování a upevnění)
 * Vždy balancuje mezi Matematikou a Češtinou.
 */
export async function getPersonalizedRecommendations(
  userId?: string,
  userFocusAreas: string[] = []
): Promise<RecommendedPracticeItem[]> {
  try {
    // 1. Načteme všechna dostupná podtémata v aplikaci
    const allSubtopics = await getSubtopics();
    if (!allSubtopics || allSubtopics.length === 0) {
      return FALLBACK_TOPICS;
    }

    // 2. Pokud je přihlášený uživatel, načteme jeho historii testů
    const attemptsMap = new Map<string, AttemptStats>();

    if (userId) {
      try {
        const testsSnap = await getDocs(
          query(collection(db, 'tests'), where('studentId', '==', userId), limit(30))
        );

        testsSnap.docs.forEach((d) => {
          const data = d.data();
          let subtopicId = data.topic || '';
          let percentage = 0;

          if (data.description) {
            try {
              const parsed = JSON.parse(data.description);
              if (parsed.subtopicId) subtopicId = parsed.subtopicId;
              if (typeof parsed.percentage === 'number') percentage = parsed.percentage;
            } catch {
              // ignore parse failure
            }
          }

          if (!subtopicId) return;

          const createdAt = data.createdAt?.toDate
            ? data.createdAt.toDate()
            : data.createdAt?.seconds
              ? new Date(data.createdAt.seconds * 1000)
              : new Date();

          const existing = attemptsMap.get(subtopicId);
          if (!existing) {
            attemptsMap.set(subtopicId, {
              attemptsCount: 1,
              lastPercentage: percentage,
              bestPercentage: percentage,
              lastAttemptAt: createdAt
            });
          } else {
            existing.attemptsCount += 1;
            existing.bestPercentage = Math.max(existing.bestPercentage, percentage);
            if (createdAt.getTime() > existing.lastAttemptAt.getTime()) {
              existing.lastAttemptAt = createdAt;
              existing.lastPercentage = percentage;
            }
          }
        });
      } catch (err) {
        console.warn('Could not load student test attempts for recommendations:', err);
      }
    }

    // 3. Oskórujeme a oklasifikujeme jednotlivá podtémata
    interface ScoredSubtopic {
      subtopic: PracticeSubtopic;
      subject: 'Matematika' | 'Čeština';
      priorityScore: number;
      badge: {
        text: string;
        variant: 'warning' | 'info' | 'accent' | 'success';
      };
      reasonText: string;
      difficulty: string;
      lastPercentage?: number;
      attemptsCount?: number;
    }

    const now = Date.now();
    const scoredList: ScoredSubtopic[] = allSubtopics.map((subtopic) => {
      const subject: 'Matematika' | 'Čeština' =
        subtopic.subjectId === 'Čeština' || subtopic.subjectId.toLowerCase().includes('češ')
          ? 'Čeština'
          : 'Matematika';

      const stats = attemptsMap.get(subtopic.id);
      const isFocusArea = userFocusAreas.some((fa) =>
        subtopic.title.toLowerCase().includes(fa.toLowerCase()) ||
        fa.toLowerCase().includes(subtopic.title.toLowerCase())
      );

      const qCount = subtopic.practiceConfig?.totalCount || subtopic.questionCount || 10;
      const difficulty = `${qCount} úloh • Cermat`;

      // Případ 1: Student téma procvičoval, ale měl < 70 % (nejvyšší priorita k doučení)
      if (stats && stats.lastPercentage < 70) {
        return {
          subtopic,
          subject,
          priorityScore: 100 + (70 - stats.lastPercentage), // čím nižší procento, tím vyšší priorita
          badge: {
            text: `Naposledy ${stats.lastPercentage} %`,
            variant: 'warning'
          },
          reasonText: `V minulém pokusu jsi měl ${stats.lastPercentage} %. Doporučujeme zopakovat pro upevnění látky.`,
          difficulty,
          lastPercentage: stats.lastPercentage,
          attemptsCount: stats.attemptsCount
        };
      }

      // Případ 2: Téma odpovídá osobnímu zaměření studenta (focus areas)
      if (isFocusArea && (!stats || stats.bestPercentage < 90)) {
        return {
          subtopic,
          subject,
          priorityScore: 85,
          badge: {
            text: 'Tvé zaměření',
            variant: 'accent'
          },
          reasonText: 'Odpovídá tvému osobnímu zaměření ve studijním plánu.',
          difficulty,
          lastPercentage: stats?.lastPercentage,
          attemptsCount: stats?.attemptsCount
        };
      }

      // Případ 3: Zcela nové téma, které student ještě neprocvičoval
      if (!stats || stats.attemptsCount === 0) {
        return {
          subtopic,
          subject,
          priorityScore: 65 - (subtopic.order ?? 0) * 0.1,
          badge: {
            text: 'Nové téma',
            variant: 'info'
          },
          reasonText: 'Důležitý testovací okruh, který jsi zatím nevyzkoušel(a).',
          difficulty,
          attemptsCount: 0
        };
      }

      // Případ 4: Téma bylo procvičeno před více než 7 dny (opakování v čase)
      const daysSince = Math.floor((now - stats.lastAttemptAt.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince >= 7) {
        return {
          subtopic,
          subject,
          priorityScore: 40 + Math.min(daysSince, 30),
          badge: {
            text: 'Oprášit znalosti',
            variant: 'success'
          },
          reasonText: `Naposledy procvičeno před ${daysSince} dny (${stats.bestPercentage} %). Zopakuj si téma pro dlouhodobou paměť.`,
          difficulty,
          lastPercentage: stats.lastPercentage,
          attemptsCount: stats.attemptsCount
        };
      }

      // Případ 5: Zvládnuto nedávno s vysokým skóre
      return {
        subtopic,
        subject,
        priorityScore: 10 + stats.bestPercentage * 0.1,
        badge: {
          text: `Zvládnuto • ${stats.bestPercentage} %`,
          variant: 'success'
        },
        reasonText: `Skvělé skóre ${stats.bestPercentage} %! Kdykoliv si můžeš ověřit plných 100 %.`,
        difficulty,
        lastPercentage: stats.lastPercentage,
        attemptsCount: stats.attemptsCount
      };
    });

    // 4. Balancovaný výběr: chceme 3 doporučená témata (např. 1 Matematika, 1 Čeština a 3. podle nejvyšší priority)
    const mathItems = scoredList
      .filter((s) => s.subject === 'Matematika')
      .sort((a, b) => b.priorityScore - a.priorityScore);

    const czechItems = scoredList
      .filter((s) => s.subject === 'Čeština')
      .sort((a, b) => b.priorityScore - a.priorityScore);

    const selected: ScoredSubtopic[] = [];

    // Základ: pokud máme z obou předmětů, vezmeme nejprve 1 z Matematiky a 1 z Češtiny
    if (mathItems.length > 0 && czechItems.length > 0) {
      selected.push(mathItems[0], czechItems[0]);

      // Jako 3. téma vybereme to s vyšším skóre priority
      const candidateMath = mathItems[1];
      const candidateCzech = czechItems[1];

      if (candidateMath && candidateCzech) {
        selected.push(candidateMath.priorityScore >= candidateCzech.priorityScore ? candidateMath : candidateCzech);
      } else if (candidateMath) {
        selected.push(candidateMath);
      } else if (candidateCzech) {
        selected.push(candidateCzech);
      }
    } else {
      // Pokud jeden předmět nemá témata, vezmeme top 3 ze všech
      const combined = [...scoredList].sort((a, b) => b.priorityScore - a.priorityScore);
      for (const item of combined) {
        if (!selected.some((s) => s.subtopic.id === item.subtopic.id)) {
          selected.push(item);
        }
        if (selected.length >= 3) break;
      }
    }

    // 5. Namapujeme na výsledný RecommendedPracticeItem
    return selected.map((item) => {
      const visual = getVisualProps(item.subtopic.title, item.subject);
      return {
        subtopicId: item.subtopic.id,
        title: item.subtopic.title,
        subject: item.subject,
        topicTitle: item.subtopic.topicId,
        icon: visual.icon,
        bg: visual.bg,
        tagClass: visual.tagClass,
        difficulty: item.difficulty,
        badge: item.badge,
        reasonText: item.reasonText,
        hasStudyMaterial: item.subtopic.hasStudyMaterial,
        lastPercentage: item.lastPercentage,
        attemptsCount: item.attemptsCount
      };
    });
  } catch (error) {
    console.error('Error generating personalized recommendations:', error);
    return FALLBACK_TOPICS;
  }
}
