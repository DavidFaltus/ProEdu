import { collection, addDoc, getDocs, query, where, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { GEOMETRY_QUESTIONS } from '../data/geometryQuestions';
import { FALLBACK_QUESTIONS } from '../data/fallbackQuestions';
import { postApi } from './apiClient';

interface StartPracticePayload {
  courseId?: string;
  topic: string;
  title: string;
  description: string;
  topics?: string[];
  questionCount?: number;
  studentId?: string;
  dueDate?: string;
}

interface StartPracticeResponse {
  assignedTestId: string;
}

export { GEOMETRY_QUESTIONS };

function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

async function loadQuestionsForCourse(courseData: Partial<StartPracticePayload>) {
  const questionMap = new Map();
  const topics = Array.isArray(courseData.topics) && courseData.topics.length > 0 ? courseData.topics : [courseData.topic];

  try {
    if (courseData.courseId) {
      const byCourseSnapshot = await getDocs(query(collection(db, 'questions'), where('courseId', '==', courseData.courseId)));
      for (const doc of byCourseSnapshot.docs) {
        questionMap.set(doc.id, { id: doc.id, ...doc.data() });
      }
    }

    for (const topic of topics) {
      if (topic) {
        const byTopicsSnapshot = await getDocs(query(collection(db, 'questions'), where('topics', 'array-contains', topic)));
        for (const doc of byTopicsSnapshot.docs) {
          questionMap.set(doc.id, { id: doc.id, ...doc.data() });
        }

        const byTopicSnapshot = await getDocs(query(collection(db, 'questions'), where('topic', '==', topic)));
        for (const doc of byTopicSnapshot.docs) {
          if (!questionMap.has(doc.id)) {
            questionMap.set(doc.id, { id: doc.id, ...doc.data() });
          }
        }
      }
    }
  } catch (e) {
    console.warn("Failed fetching some questions, fallback to static if needed", e);
  }

  return Array.from(questionMap.values());
}

export function calculateTopicPerformance(questions: any[], answers: Record<string, string>) {
  const performance: Record<string, { correct: number; total: number }> = {};

  for (const question of questions) {
    const topic = question.topic || 'Ostatní';

    if (!performance[topic]) {
      performance[topic] = { correct: 0, total: 0 };
    }

    performance[topic].total += 1;

    if (answers[question.id] === question.correctAnswer) {
      performance[topic].correct += 1;
    }
  }

  return performance;
}

export function calculateGrade(percentage: number) {
  if (percentage >= 90) return '1';
  if (percentage >= 75) return '2';
  if (percentage >= 50) return '3';
  if (percentage >= 30) return '4';
  return '5';
}

export function buildReviewQuestions(questions: any[], answers: Record<string, string>) {
  return questions.map((question) => {
    const userAnswer = answers[question.id];
    
    // Create a sanitized copy without sensitive fields if needed.
    const { correctAnswer, createdAt, createdBy, ...publicQuestion } = question;

    return {
      ...publicQuestion,
      correctAnswer: question.correctAnswer,
      userAnswer,
      isCorrect: userAnswer === question.correctAnswer,
    };
  });
}

function sanitizeQuestion(question: any) {
  const { correctAnswer, createdAt, createdBy, ...publicQuestion } = question;
  return publicQuestion;
}

export async function submitAppletTest(assignedTestId: string, answers: Record<string, string>) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Nepřihlášen");

  const response = await postApi<any>(`/assigned-tests/${assignedTestId}/submit`, {
    answers,
  });

  return response;
}

export async function createPracticeAttempt(payload: StartPracticePayload, targetStudentId: string) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Nepřihlášen");

  let questionPool = await loadQuestionsForCourse(payload);
  const needed = Number(payload.questionCount || 10);

  // If not enough questions are found in DB, mix in matching fallback questions
  if (questionPool.length < needed) {
    const matchingFallbacks = FALLBACK_QUESTIONS.filter(q => 
      q.topic === payload.topic || 
      (payload.topics && payload.topics.includes(q.topic))
    );

    let fallbackPool = [...matchingFallbacks];
    
    // Special handling for Geometrie: also allow original geometry fallback questions
    if (payload.topic === 'Geometrie' || (payload.topics && payload.topics.includes('Geometrie'))) {
      fallbackPool.push(...GEOMETRY_QUESTIONS.filter(gq => !fallbackPool.some(fq => fq.id === gq.id)));
    }

    // If still not enough, mix in any fallback questions from the same subject category
    if (fallbackPool.length < needed) {
      const MATH_TOPICS = ['Počítání a čísla', 'Rovnice a výrazy', 'Procenta poměry a data', 'Geometrie', 'Rýsování', 'Slovní úlohy', 'Logické chytáky'];
      const CZECH_TOPICS = ['Pravopis a chytáky', 'Gramatika (stavba slov, vět)', 'Spisovnost a významy slov', 'Práce s textem a sloh', 'Literatura a poezie'];
      const ENGLISH_TOPICS = ['Poslech a porozumění', 'Slovní zásoba', 'Časy a pomocná slovesa', 'Předložky', 'Ustálené vazby', 'Stavba věty'];

      const getSubject = (t: string) => {
        if (MATH_TOPICS.includes(t)) return 'math';
        if (CZECH_TOPICS.includes(t)) return 'czech';
        if (ENGLISH_TOPICS.includes(t)) return 'english';
        return 'other';
      };

      const targetSubject = getSubject(payload.topic);
      const subjectFallbacks = FALLBACK_QUESTIONS.filter(q => getSubject(q.topic) === targetSubject);
      
      // Also mix in geometry if it's math
      if (targetSubject === 'math') {
        subjectFallbacks.push(...GEOMETRY_QUESTIONS);
      }

      subjectFallbacks.forEach(q => {
        if (!fallbackPool.some(existing => existing.id === q.id)) {
          fallbackPool.push(q);
        }
      });
    }

    const shuffledFallbacks = shuffle(fallbackPool);
    for (const q of shuffledFallbacks) {
      if (questionPool.length >= needed) break;
      if (!questionPool.some(existing => existing.id === q.id)) {
        questionPool.push(q);
      }
    }
  }

  const questionCount = Math.min(questionPool.length, needed);
  const selectedQuestions = shuffle(questionPool).slice(0, questionCount);

  const testPayload = {
    title: payload.title,
    description: payload.description || '',
    topic: payload.topic,
    autoGrade: true,
    courseId: payload.courseId || null,
    createdBy: currentUser.uid,
    createdAt: serverTimestamp(),
    studentId: targetStudentId,
    questions: selectedQuestions,
  };

  const testRef = await addDoc(collection(db, 'tests'), testPayload);

  const assignedPayload = {
    testId: testRef.id,
    courseId: payload.courseId || null,
    studentId: targetStudentId,
    testTitle: payload.title,
    testDescription: payload.description || '',
    topic: payload.topic,
    autoGrade: true,
    status: 'pending',
    assignedAt: serverTimestamp(),
    dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
    createdBy: currentUser.uid,
    questions: selectedQuestions.map(sanitizeQuestion),
  };

  const assignedRef = await addDoc(collection(db, 'assignedTests'), assignedPayload);

  await addDoc(collection(db, 'todos'), {
    studentId: targetStudentId,
    title: `[Procvičování] ${payload.title}`,
    type: 'practice',
    referenceId: testRef.id,
    assignedTestId: assignedRef.id,
    completed: false,
    dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
    addedBy: currentUser.uid,
    createdAt: serverTimestamp()
  });

  return assignedRef.id;
}

export async function startPracticeCourse(
  _userId: string,
  _userName: string,
  topic: string,
  title: string,
  description: string,
  courseId?: string,
  topics?: string[],
  questionCount?: number,
) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Nepřihlášen");
  return await createPracticeAttempt({ topic, title, description, courseId, topics, questionCount }, currentUser.uid);
}

export async function assignPracticeCourseToStudent(payload: {
  studentId: string;
  courseId?: string;
  topic: string;
  title: string;
  description: string;
  topics?: string[];
  questionCount?: number;
  dueDate?: string;
}) {
  return await createPracticeAttempt(payload, payload.studentId);
}
