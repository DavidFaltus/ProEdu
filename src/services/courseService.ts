import { collection, addDoc, getDocs, query, where, serverTimestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { GEOMETRY_QUESTIONS } from '../data/geometryQuestions';
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

  const questionPool = await loadQuestionsForCourse(payload);
  const questionCount = Math.min(questionPool.length, Number(payload.questionCount || 10));
  const selectedQuestions = shuffle(questionPool).slice(0, questionCount);

  // If no questions found, use static geometry if topic matches
  if (selectedQuestions.length === 0 && payload.topic === 'Geometrie') {
    selectedQuestions.push(...shuffle(GEOMETRY_QUESTIONS).slice(0, questionCount || 10));
  }

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
