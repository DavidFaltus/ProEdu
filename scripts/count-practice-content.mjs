import 'dotenv/config';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
const app = getApps().length === 0 ? initializeApp({ credential: cert(sa), projectId: sa.project_id }) : getApp();
const db = getFirestore(app, 'ai-studio-1fc75345-16e5-4af6-a275-4152ed6176ba');

function normalizePracticeSubjectId(val) {
  const s = String(val || '').trim();
  const lower = s.toLowerCase();
  if (
    lower === 'český jazyk' ||
    lower === 'cesky jazyk' ||
    lower === 'čeština' ||
    lower === 'cestina' ||
    lower === 'czech' ||
    lower === 'cj' ||
    lower === 'čj'
  ) {
    return 'Čeština';
  }
  if (lower === 'matematika' || lower === 'math' || lower === 'ma') {
    return 'Matematika';
  }
  return val || 'Nespecifikováno';
}

async function analyzeContent() {
  const [topicsSnap, subtopicsSnap, questionsSnap, learningSheetsSnap] = await Promise.all([
    db.collection('customTopics').get(),
    db.collection('practiceSubtopics').get(),
    db.collection('questions').get(),
    db.collection('learningSheets').get()
  ]);

  // 1. TÉMATA
  const topics = topicsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const hiddenTopicKeys = new Set();
  const topicMap = new Map();

  const topicStats = {
    total: topics.length,
    visible: 0,
    hidden: 0,
    bySubject: {
      Matematika: { visible: 0, hidden: 0, total: 0 },
      Čeština: { visible: 0, hidden: 0, total: 0 },
      Ostatní: { visible: 0, hidden: 0, total: 0 }
    }
  };

  for (const t of topics) {
    const subj = normalizePracticeSubjectId(t.subjectId || t.subject);
    const subjKey = subj === 'Matematika' || subj === 'Čeština' ? subj : 'Ostatní';
    const isHidden = t.isHidden === true;

    topicMap.set(t.id, t);
    if (t.title) topicMap.set(t.title, t);
    if (t.name) topicMap.set(t.name, t);

    if (isHidden) {
      topicStats.hidden++;
      topicStats.bySubject[subjKey].hidden++;
      hiddenTopicKeys.add(t.id);
      if (t.title) hiddenTopicKeys.add(t.title);
      if (t.name) hiddenTopicKeys.add(t.name);
    } else {
      topicStats.visible++;
      topicStats.bySubject[subjKey].visible++;
    }
    topicStats.bySubject[subjKey].total++;
  }

  // 2. PODTÉMATA
  const subtopics = subtopicsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const subtopicMap = new Map();
  const visibleSubtopicIds = new Set();
  const hiddenSubtopicIds = new Set();

  const subtopicStats = {
    total: subtopics.length,
    visible: 0,
    hidden: 0,
    hiddenDirectly: 0,
    hiddenByTopic: 0,
    bySubject: {
      Matematika: { visible: 0, hidden: 0, total: 0 },
      Čeština: { visible: 0, hidden: 0, total: 0 },
      Ostatní: { visible: 0, hidden: 0, total: 0 }
    }
  };

  for (const s of subtopics) {
    subtopicMap.set(s.id, s);
    const subj = normalizePracticeSubjectId(s.subjectId || s.subject);
    const subjKey = subj === 'Matematika' || subj === 'Čeština' ? subj : 'Ostatní';

    const isDirectlyHidden = s.isHidden === true;
    const isTopicHidden = s.topicId ? hiddenTopicKeys.has(s.topicId) : false;
    const isHidden = isDirectlyHidden || isTopicHidden;

    if (isHidden) {
      subtopicStats.hidden++;
      subtopicStats.bySubject[subjKey].hidden++;
      hiddenSubtopicIds.add(s.id);
      if (isDirectlyHidden) subtopicStats.hiddenDirectly++;
      else subtopicStats.hiddenByTopic++;
    } else {
      subtopicStats.visible++;
      subtopicStats.bySubject[subjKey].visible++;
      visibleSubtopicIds.add(s.id);
    }
    subtopicStats.bySubject[subjKey].total++;
  }

  // 3. OTÁZKY
  const questions = questionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const questionStats = {
    total: questions.length,
    visible: 0,
    hidden: 0,
    hiddenDirectly: 0,
    hiddenBySubtopic: 0,
    orphaned: 0, // bez vazby na podtéma
    bySubject: {
      Matematika: { visible: 0, hidden: 0, total: 0 },
      Čeština: { visible: 0, hidden: 0, total: 0 },
      BezPředmětu: { visible: 0, hidden: 0, total: 0 }
    },
    byDifficulty: { Lehká: 0, Střední: 0, Těžká: 0, Jiná: 0 },
    byType: {}
  };

  for (const q of questions) {
    // Subject může být v otázce, nebo ho podědí z podtématu
    const linkedSubtopic = q.subtopicId ? subtopicMap.get(q.subtopicId) : null;
    const rawSubj = q.subjectId || q.subject || linkedSubtopic?.subjectId || linkedSubtopic?.subject;
    const subj = rawSubj ? normalizePracticeSubjectId(rawSubj) : 'BezPředmětu';
    const subjKey = subj === 'Matematika' || subj === 'Čeština' ? subj : 'BezPředmětu';

    const diff = q.difficulty === 'Lehká' || q.difficulty === 'Střední' || q.difficulty === 'Těžká' ? q.difficulty : 'Jiná';
    questionStats.byDifficulty[diff]++;

    const qType = q.type || (Array.isArray(q.options) && q.options.length > 0 ? 'choice' : 'open');
    questionStats.byType[qType] = (questionStats.byType[qType] || 0) + 1;

    const isDirectlyHidden = q.isHidden === true;
    const isOrphaned = !q.subtopicId || !subtopicMap.has(q.subtopicId);
    const isSubtopicHidden = q.subtopicId ? hiddenSubtopicIds.has(q.subtopicId) : false;

    if (isDirectlyHidden) {
      questionStats.hidden++;
      questionStats.hiddenDirectly++;
      questionStats.bySubject[subjKey].hidden++;
    } else if (isOrphaned) {
      questionStats.hidden++;
      questionStats.orphaned++;
      questionStats.bySubject[subjKey].hidden++;
    } else if (isSubtopicHidden) {
      questionStats.hidden++;
      questionStats.hiddenBySubtopic++;
      questionStats.bySubject[subjKey].hidden++;
    } else {
      questionStats.visible++;
      questionStats.bySubject[subjKey].visible++;
    }
    questionStats.bySubject[subjKey].total++;
  }

  // 4. PRACOVNÍ LISTY (learningSheets)
  const learningSheets = learningSheetsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const sheetStats = {
    total: learningSheets.length,
    visible: learningSheets.filter(s => s.isHidden !== true && !s.hiddenFromLibrary).length,
    hidden: learningSheets.filter(s => s.isHidden === true || s.hiddenFromLibrary).length
  };

  console.log(JSON.stringify({
    topics: topicStats,
    subtopics: subtopicStats,
    questions: questionStats,
    learningSheets: sheetStats
  }, null, 2));
}

analyzeContent().catch(console.error);
