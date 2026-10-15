import { collection, getDocs, query, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile, PracticeSubtopic } from '../types';
import { getSubtopics } from './practiceService';

export interface StudentPracticeAttempt {
  id: string;
  studentId: string;
  subtopicId: string;
  subtopicTitle: string;
  subject: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  createdAt: Date;
}

export interface StudentProgressItem {
  uid: string;
  name: string;
  email: string;
  role: string;
  photoURL?: string;
  avatarEmoji?: string;
  avatarBgColor?: string;
  createdAt?: Date;
  totalAttempts: number;
  averagePercentage: number;
  totalQuestions: number;
  totalScore: number;
  lastPracticeAt: Date | null;
  mathAttemptsCount: number;
  czechAttemptsCount: number;
  attempts: StudentPracticeAttempt[];
}

function parseTestAttempt(
  docId: string, 
  data: any, 
  subtopicsMap: Map<string, PracticeSubtopic>
): StudentPracticeAttempt | null {
  try {
    let subtopicId = data.topic || '';
    let score = 0;
    let totalQuestions = 0;
    let percentage = 0;
    let subject = '';

    if (data.description) {
      try {
        const parsed = JSON.parse(data.description);
        if (parsed.subtopicId) subtopicId = parsed.subtopicId;
        if (typeof parsed.score === 'number') score = parsed.score;
        if (typeof parsed.totalQuestions === 'number') totalQuestions = parsed.totalQuestions;
        if (typeof parsed.percentage === 'number') percentage = parsed.percentage;
        if (parsed.subjectId) subject = parsed.subjectId;
      } catch {
        // description was not JSON string
      }
    }

    const subtopic = subtopicId ? subtopicsMap.get(subtopicId) : undefined;
    const subtopicTitle = subtopic?.title || data.title?.replace(/^Procvičování\s*\(\d+%\)/, '').trim() || subtopicId || 'Procvičování';
    const resolvedSubject = subject || subtopic?.subjectId || (subtopicTitle.toLowerCase().includes('mat') ? 'Matematika' : 'Čeština');

    const createdAt = data.createdAt?.toDate 
      ? data.createdAt.toDate() 
      : data.createdAt?.seconds 
        ? new Date(data.createdAt.seconds * 1000) 
        : new Date();

    return {
      id: docId,
      studentId: data.studentId || data.createdBy || '',
      subtopicId,
      subtopicTitle,
      subject: resolvedSubject,
      score,
      totalQuestions: totalQuestions || score,
      percentage: Math.min(100, Math.max(0, percentage)),
      createdAt
    };
  } catch (err) {
    console.warn('Error parsing test attempt doc:', docId, err);
    return null;
  }
}

/**
 * Načte všechny studenty a k nim přiřadí jejich historii a statistiky procvičování.
 */
export async function getStudentsProgressList(): Promise<StudentProgressItem[]> {
  try {
    // 1. Paralelně načteme uživatele, podtémata a testy
    const [usersSnap, subtopicsList, testsSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getSubtopics(),
      getDocs(query(collection(db, 'tests'), orderBy('createdAt', 'desc'))).catch(async () => {
        // Fallback pokud není vytvořen index na createdAt
        return getDocs(collection(db, 'tests'));
      })
    ]);

    // Namapujeme podtémata pro rychlý lookup
    const subtopicsMap = new Map<string, PracticeSubtopic>();
    subtopicsList.forEach(s => subtopicsMap.set(s.id, s));

    // 2. Naparsujeme všechny pokusy o procvičování
    const attemptsByStudent = new Map<string, StudentPracticeAttempt[]>();

    testsSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      const attempt = parseTestAttempt(docSnap.id, data, subtopicsMap);
      if (!attempt || !attempt.studentId) return;

      const current = attemptsByStudent.get(attempt.studentId) || [];
      current.push(attempt);
      attemptsByStudent.set(attempt.studentId, current);
    });

    // 3. Zpracujeme studenty (role != 'teacher')
    const students: StudentProgressItem[] = [];

    usersSnap.docs.forEach(docSnap => {
      const userData = docSnap.data() as UserProfile;
      // Filtrujeme pouze studenty (vynecháme učitele)
      if (userData.role === 'teacher') return;

      const studentId = docSnap.id;
      const studentAttempts = attemptsByStudent.get(studentId) || [];
      
      // Seřadíme pokusy od nejnovějšího
      studentAttempts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const totalAttempts = studentAttempts.length;
      const totalScore = studentAttempts.reduce((acc, a) => acc + a.score, 0);
      const totalQuestions = studentAttempts.reduce((acc, a) => acc + a.totalQuestions, 0);
      const averagePercentage = totalAttempts > 0 
        ? Math.round(studentAttempts.reduce((acc, a) => acc + a.percentage, 0) / totalAttempts) 
        : 0;

      const mathAttemptsCount = studentAttempts.filter(a => a.subject === 'Matematika').length;
      const czechAttemptsCount = studentAttempts.filter(a => a.subject === 'Čeština' || a.subject.toLowerCase().includes('češ')).length;

      const lastPracticeAt = studentAttempts.length > 0 ? studentAttempts[0].createdAt : null;

      const studentCreatedAt = userData.createdAt?.toDate 
        ? userData.createdAt.toDate() 
        : userData.createdAt?.seconds 
          ? new Date(userData.createdAt.seconds * 1000) 
          : undefined;

      students.push({
        uid: studentId,
        name: userData.name || 'Student bez jména',
        email: userData.email || '',
        role: userData.role || 'free',
        photoURL: userData.photoURL,
        avatarEmoji: userData.avatarEmoji,
        avatarBgColor: userData.avatarBgColor,
        createdAt: studentCreatedAt,
        totalAttempts,
        averagePercentage,
        totalQuestions,
        totalScore,
        lastPracticeAt,
        mathAttemptsCount,
        czechAttemptsCount,
        attempts: studentAttempts
      });
    });

    // Seřadíme studenty: nejprve ti, kteří naposledy procvičovali, poté abecedně
    students.sort((a, b) => {
      if (a.lastPracticeAt && b.lastPracticeAt) {
        return b.lastPracticeAt.getTime() - a.lastPracticeAt.getTime();
      }
      if (a.lastPracticeAt) return -1;
      if (b.lastPracticeAt) return 1;
      return a.name.localeCompare(b.name, 'cs');
    });

    return students;
  } catch (error) {
    console.error('Error fetching students progress list:', error);
    throw error;
  }
}
