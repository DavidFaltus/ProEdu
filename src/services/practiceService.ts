import { 
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, 
  query, where, Timestamp 
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import * as XLSX from 'xlsx';
import { 
  PracticeTopic, PracticeSubtopic, PracticeQuestion, PracticeAttempt, QuestionType, StudyStep, PracticeConfig 
} from '../types';
import { preprocessMathText, validateLatexSyntax } from '../utils/mathPreprocessor';

export const PREDEFINED_SUBJECTS = [
  {
    id: 'Matematika',
    title: 'Matematika',
    description: 'Čísla, rovnice, geometrie a prostorová představivost.',
    gradient: 'from-emerald-500 to-teal-600',
    icon: 'Calculator'
  },
  {
    id: 'Čeština',
    title: 'Český jazyk',
    description: 'Pravopis, gramatika, práce s textem a sloh.',
    gradient: 'from-rose-500 to-pink-600',
    icon: 'BookMarked'
  }
];

// Helper to get active authenticated teacher/user UID
function getEffectiveUserId(userId?: string): string {
  return userId || auth.currentUser?.uid || '';
}

// -------------------------------------------------------------
// TOPICS API (Stored in `customTopics`)
// -------------------------------------------------------------

export async function getTopics(subjectId?: string): Promise<PracticeTopic[]> {
  try {
    const collRef = collection(db, 'customTopics');
    const snap = await getDocs(collRef);
    
    let topics: PracticeTopic[] = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title || data.name || 'Bez názvu',
        subjectId: data.subjectId || 'Matematika',
        description: data.description || '',
        order: typeof data.order === 'number' ? data.order : 0,
        createdAt: data.createdAt,
        createdBy: data.createdBy
      } as PracticeTopic;
    });

    if (subjectId) {
      topics = topics.filter(t => t.subjectId === subjectId);
    }

    return topics.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } catch (error) {
    console.error('Error fetching topics:', error);
    return [];
  }
}

export async function getTopicById(topicId: string): Promise<PracticeTopic | null> {
  if (!topicId) return null;
  try {
    const docRef = doc(db, 'customTopics', topicId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      title: data.title || data.name || 'Téma',
      subjectId: data.subjectId || 'Matematika',
      description: data.description || '',
      order: typeof data.order === 'number' ? data.order : 0,
      createdAt: data.createdAt,
      createdBy: data.createdBy
    };
  } catch (error) {
    console.error('Error fetching topic by ID:', error);
    return null;
  }
}

export async function saveTopic(topicData: Partial<PracticeTopic>, userId?: string): Promise<string> {
  const collRef = collection(db, 'customTopics');
  const now = Timestamp.now();
  const effectiveUserId = getEffectiveUserId(userId);
  const title = topicData.title?.trim() || 'Nové téma';

  if (topicData.id) {
    const docRef = doc(db, 'customTopics', topicData.id);
    await updateDoc(docRef, {
      name: title,
      title: title,
      subjectId: topicData.subjectId || 'Matematika',
      description: topicData.description?.trim() || '',
      order: typeof topicData.order === 'number' ? topicData.order : 0,
      updatedAt: now
    });
    return topicData.id;
  } else {
    const newDoc = await addDoc(collRef, {
      name: title,
      title: title,
      subjectId: topicData.subjectId || 'Matematika',
      description: topicData.description?.trim() || '',
      order: typeof topicData.order === 'number' ? topicData.order : 0,
      createdAt: now,
      createdBy: effectiveUserId
    });
    return newDoc.id;
  }
}

export async function deleteTopic(topicId: string): Promise<void> {
  // First delete associated subtopics and their questions
  const subtopics = await getSubtopics(topicId);
  for (const s of subtopics) {
    await deleteSubtopic(s.id);
  }

  await deleteDoc(doc(db, 'customTopics', topicId));
}

// -------------------------------------------------------------
// SUBTOPICS API (Stored in `practiceSubtopics`)
// -------------------------------------------------------------

export const PRACTICE_SUBTOPICS_COLLECTION = 'practiceSubtopics';

/**
 * Recursively removes all keys with `undefined` values from an object or array.
 * Required because Firestore `updateDoc` and `addDoc` throw errors if any field is `undefined`.
 */
export function removeUndefinedFields<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefinedFields(item)) as unknown as T;
  }
  if (typeof obj === 'object' && !(obj instanceof Timestamp)) {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefinedFields(value);
      }
    }
    return cleaned;
  }
  return obj;
}

export function cleanStudyStep(s: Partial<StudyStep>): StudyStep {
  const step: StudyStep = {
    title: s.title?.trim() || 'Krok',
    content: s.content?.trim() || ''
  };
  const img = s.imageUrl?.trim();
  if (img) step.imageUrl = img;
  if (s.svgContent?.trim()) step.svgContent = s.svgContent.trim();
  const tip = s.tutorTip?.trim();
  if (tip) step.tutorTip = tip;
  const question = s.testQuestion?.trim();
  if (question) step.testQuestion = question;
  if (Array.isArray(s.testOptions)) {
    const validOpts = s.testOptions.map(o => o?.trim() || '').filter(Boolean);
    if (validOpts.length > 0) {
      step.testOptions = validOpts;
    }
  }
  const ans = s.correctAnswer?.trim();
  if (ans) step.correctAnswer = ans;
  return step;
}

export function cleanPracticeConfig(cfg?: any): PracticeConfig | null {
  if (!cfg || typeof cfg !== 'object') return null;
  const easy = typeof cfg.easyCount === 'number' && cfg.easyCount >= 0 ? Math.floor(cfg.easyCount) : 0;
  const med = typeof cfg.mediumCount === 'number' && cfg.mediumCount >= 0 ? Math.floor(cfg.mediumCount) : 0;
  const hard = typeof cfg.hardCount === 'number' && cfg.hardCount >= 0 ? Math.floor(cfg.hardCount) : 0;
  const total = easy + med + hard;
  return {
    easyCount: easy,
    mediumCount: med,
    hardCount: hard,
    totalCount: total
  };
}

export function normalizeSubtopicPayload(subtopicData: Partial<PracticeSubtopic>) {
  const title = subtopicData.title?.trim() || 'Nové podtéma';
  const topicId = subtopicData.topicId?.trim() || '';
  const subjectId = (subtopicData.subjectId as any) || 'Matematika';
  const description = subtopicData.description?.trim() || '';
  const order = typeof subtopicData.order === 'number' ? subtopicData.order : 0;
  const studyTheory = subtopicData.studyTheory?.trim() || '';
  const studySteps = Array.isArray(subtopicData.studySteps)
    ? subtopicData.studySteps.map(cleanStudyStep)
    : [];
  const sampleProblem = subtopicData.sampleProblem || null;
  const svgUrl = subtopicData.svgUrl || null;
  const svgContent = subtopicData.svgContent || null;
  const hasStudyMaterial = !!(svgUrl || svgContent || studyTheory || studySteps.length > 0 || sampleProblem);
  const practiceConfig = subtopicData.practiceConfig ? cleanPracticeConfig(subtopicData.practiceConfig) : null;

  return {
    title,
    topicId,
    subjectId,
    description,
    order,
    hasStudyMaterial,
    svgUrl,
    svgContent,
    studyTheory,
    studySteps,
    sampleProblem,
    practiceConfig
  };
}

function mapDocToSubtopic(d: any): PracticeSubtopic {
  const data = d.data();
  let parsedContent: any = {};
  if (data.content && typeof data.content === 'string') {
    try {
      parsedContent = JSON.parse(data.content);
    } catch {
      parsedContent = { studyTheory: data.content };
    }
  }

  const studyTheory = data.studyTheory ?? (parsedContent.studyTheory || (typeof data.content === 'string' && !parsedContent.studyTheory ? data.content : ''));
  const studySteps = Array.isArray(data.studySteps) ? data.studySteps : (Array.isArray(parsedContent.studySteps) ? parsedContent.studySteps : []);
  const sampleProblem = data.sampleProblem ?? (parsedContent.sampleProblem || null);
  const description = data.description ?? (parsedContent.description || '');
  const order = typeof data.order === 'number' ? data.order : (typeof parsedContent.order === 'number' ? parsedContent.order : 0);
  const svgUrl = data.svgUrl ?? (data.fileUrl || null);
  const svgContent = data.svgContent ?? (parsedContent.svgContent || null);
  const hasStudyMaterial = !!(data.hasStudyMaterial || svgUrl || svgContent || studyTheory || studySteps.length > 0 || sampleProblem);
  const practiceConfig = data.practiceConfig ? cleanPracticeConfig(data.practiceConfig) : undefined;

  return {
    id: d.id,
    title: data.title || 'Podtéma',
    topicId: data.topicId || data.topic || '',
    subjectId: data.subjectId || data.subject || 'Matematika',
    description: description,
    order: order,
    hasStudyMaterial: hasStudyMaterial,
    svgUrl: svgUrl,
    svgContent: svgContent,
    studyTheory: studyTheory,
    studySteps: studySteps,
    sampleProblem: sampleProblem,
    practiceConfig: practiceConfig,
    createdAt: data.createdAt,
    createdBy: data.createdBy
  };
}

export async function getSubtopics(topicId?: string, subjectId?: string): Promise<PracticeSubtopic[]> {
  try {
    const collRef = collection(db, PRACTICE_SUBTOPICS_COLLECTION);
    const snap = await getDocs(collRef);
    let subtopics: PracticeSubtopic[] = snap.docs.map(mapDocToSubtopic);

    if (topicId) {
      subtopics = subtopics.filter(s => s.topicId === topicId);
    } else if (subjectId) {
      subtopics = subtopics.filter(s => s.subjectId === subjectId);
    }

    return subtopics.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  } catch (error) {
    console.error('Error fetching subtopics:', error);
    return [];
  }
}

export async function getSubtopicById(subtopicId: string): Promise<PracticeSubtopic | null> {
  try {
    const docRef = doc(db, PRACTICE_SUBTOPICS_COLLECTION, subtopicId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return mapDocToSubtopic(snap);
  } catch (error) {
    console.error('Error fetching subtopic:', error);
    return null;
  }
}

export function buildSubtopicUpdatePayload(
  existing: PracticeSubtopic,
  updates: Partial<PracticeSubtopic>
): Omit<PracticeSubtopic, 'id'> {
  const title = updates.title !== undefined ? updates.title.trim() : existing.title;
  const topicId = updates.topicId !== undefined ? updates.topicId.trim() : existing.topicId;
  const subjectId = updates.subjectId !== undefined ? (updates.subjectId as any) : existing.subjectId;
  const description = updates.description !== undefined ? updates.description.trim() : (existing.description || '');
  const order = typeof updates.order === 'number' ? updates.order : (existing.order ?? 0);
  const studyTheory = updates.studyTheory !== undefined ? updates.studyTheory.trim() : (existing.studyTheory || '');

  let studySteps = existing.studySteps || [];
  if (Array.isArray(updates.studySteps)) {
    studySteps = updates.studySteps.map(cleanStudyStep);
  }

  const sampleProblem = updates.sampleProblem !== undefined ? updates.sampleProblem : (existing.sampleProblem || null);
  const svgUrl = updates.svgUrl !== undefined ? updates.svgUrl : (existing.svgUrl || null);
  const svgContent = updates.svgContent !== undefined ? updates.svgContent : (existing.svgContent || null);

  const hasStudyMaterial = updates.hasStudyMaterial !== undefined
    ? updates.hasStudyMaterial
    : !!(svgUrl || svgContent || studyTheory || (studySteps && studySteps.length > 0) || sampleProblem);

  let practiceConfig: PracticeConfig | null | undefined = existing.practiceConfig;
  if (updates.practiceConfig !== undefined) {
    practiceConfig = updates.practiceConfig ? cleanPracticeConfig(updates.practiceConfig) : null;
  }

  return {
    title,
    topicId,
    subjectId,
    description,
    order,
    hasStudyMaterial,
    svgUrl,
    svgContent,
    studyTheory,
    studySteps,
    sampleProblem,
    practiceConfig,
    createdBy: existing.createdBy,
    createdAt: existing.createdAt
  };
}

export async function saveSubtopic(subtopicData: Partial<PracticeSubtopic>, userId?: string): Promise<string> {
  const collRef = collection(db, PRACTICE_SUBTOPICS_COLLECTION);
  const now = Timestamp.now();
  const effectiveUserId = getEffectiveUserId(userId);

  if (subtopicData.id) {
    const docRef = doc(db, PRACTICE_SUBTOPICS_COLLECTION, subtopicData.id);
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      throw new Error(`Podtéma s ID ${subtopicData.id} nebylo nalezeno.`);
    }
    const existing = mapDocToSubtopic(existingSnap);
    const payload = buildSubtopicUpdatePayload(existing, subtopicData);

    // In updateDoc, never change immutable createdBy/createdAt fields, and strip any undefined fields
    const { createdBy, createdAt, ...updateFields } = payload;
    const sanitizedUpdateFields = removeUndefinedFields(updateFields);
    await updateDoc(docRef, sanitizedUpdateFields);
    return subtopicData.id;
  } else {
    const normalized = normalizeSubtopicPayload(subtopicData);
    const sanitizedDoc = removeUndefinedFields({
      ...normalized,
      createdAt: now,
      createdBy: effectiveUserId
    });
    const newDoc = await addDoc(collRef, sanitizedDoc);
    return newDoc.id;
  }
}

// -------------------------------------------------------------
// MATERIALS / LEARNING SHEETS API (Stored in `learningSheets`)
// -------------------------------------------------------------

export const LEARNING_SHEETS_COLLECTION = 'learningSheets';

export interface ExistingMaterialItem {
  id: string;
  title: string;
  subject: string;
  topic: string;
  svgUrl?: string | null;
  svgContent?: string | null;
  studyTheory?: string;
  hasStudyMaterial: boolean;
  createdAt?: any;
}

export interface MaterialInput {
  id?: string;
  title: string;
  subject?: string;
  topic?: string;
  studyTheory?: string;
  svgContent?: string | null;
  svgUrl?: string | null;
  fileType?: string;
}

export function normalizeMaterialPayload(input: MaterialInput) {
  const title = input.title?.trim() || 'Nový výukový materiál';
  const subject = input.subject?.trim() || 'Matematika';
  const topic = input.topic?.trim() || 'Obecné';
  const fileUrl = input.svgUrl?.trim() || null;
  const fileType = input.fileType || (input.svgContent ? 'image/svg+xml' : 'application/pdf');

  const contentObj = {
    studyTheory: input.studyTheory?.trim() || '',
    svgContent: input.svgContent || null
  };

  return {
    title,
    subject,
    topic,
    fileUrl,
    fileType,
    content: JSON.stringify(contentObj)
  };
}

export async function saveMaterial(materialData: MaterialInput, userId?: string): Promise<string> {
  const collRef = collection(db, LEARNING_SHEETS_COLLECTION);
  const now = Timestamp.now();
  const effectiveUserId = getEffectiveUserId(userId);
  const normalized = normalizeMaterialPayload(materialData);

  const payload: any = {
    ...normalized,
    createdBy: effectiveUserId
  };

  if (materialData.id) {
    const docRef = doc(db, LEARNING_SHEETS_COLLECTION, materialData.id);
    await updateDoc(docRef, payload);
    return materialData.id;
  } else {
    const newDoc = await addDoc(collRef, {
      ...payload,
      createdAt: now
    });
    return newDoc.id;
  }
}

export async function deleteMaterial(materialId: string): Promise<void> {
  await deleteDoc(doc(db, LEARNING_SHEETS_COLLECTION, materialId));
}

export async function getMaterialById(materialId: string): Promise<ExistingMaterialItem | null> {
  const docRef = doc(db, LEARNING_SHEETS_COLLECTION, materialId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  const data = snap.data();
  let parsedContent: any = {};
  if (data.content && typeof data.content === 'string') {
    try {
      parsedContent = JSON.parse(data.content);
    } catch {
      parsedContent = { studyTheory: data.content };
    }
  }
  return {
    id: snap.id,
    title: data.title || '',
    subject: data.subject || 'Matematika',
    topic: data.topic || '',
    svgUrl: data.fileUrl || null,
    svgContent: parsedContent.svgContent || null,
    studyTheory: parsedContent.studyTheory || (typeof data.content === 'string' ? data.content : ''),
    hasStudyMaterial: true,
    createdAt: data.createdAt
  };
}

export async function getAllMaterials(): Promise<ExistingMaterialItem[]> {
  try {
    const collRef = collection(db, LEARNING_SHEETS_COLLECTION);
    const snap = await getDocs(collRef);
    return snap.docs.map(d => {
      const data = d.data();
      let parsedContent: any = {};
      if (data.content && typeof data.content === 'string') {
        try {
          parsedContent = JSON.parse(data.content);
        } catch {
          parsedContent = { studyTheory: data.content };
        }
      }
      return {
        id: d.id,
        title: data.title || 'Materiál',
        subject: data.subject || 'Matematika',
        topic: data.topic || '',
        svgUrl: data.fileUrl || null,
        svgContent: parsedContent.svgContent || null,
        studyTheory: parsedContent.studyTheory || (typeof data.content === 'string' ? data.content : ''),
        hasStudyMaterial: true,
        createdAt: data.createdAt
      };
    });
  } catch (err) {
    console.error('Error fetching materials:', err);
    return [];
  }
}

export async function deleteSubtopic(subtopicId: string): Promise<void> {
  try {
    // Delete questions belonging to this subtopic
    const qSnap = await getDocs(query(collection(db, 'questions'), where('subtopicId', '==', subtopicId)));
    for (const qDoc of qSnap.docs) {
      await deleteDoc(qDoc.ref);
    }
    await deleteDoc(doc(db, PRACTICE_SUBTOPICS_COLLECTION, subtopicId));
  } catch (error) {
    console.error('Error deleting subtopic:', error);
    throw error;
  }
}

// -------------------------------------------------------------
// QUESTIONS API (Stored in `questions`)
// -------------------------------------------------------------

export async function getQuestionsForSubtopic(subtopicId: string): Promise<PracticeQuestion[]> {
  try {
    const collRef = collection(db, 'questions');
    const q = query(collRef, where('subtopicId', '==', subtopicId));
    const snap = await getDocs(q);

    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        question: data.question || '',
        type: data.type || (Array.isArray(data.options) && data.options.length > 0 ? 'choice' : 'open'),
        options: Array.isArray(data.options) ? data.options : [],
        correctAnswer: data.correctAnswer || '',
        hint: data.hint || '',
        explanation: data.explanation || '',
        difficulty: data.difficulty || 'Střední',
        subjectId: data.subjectId || 'Matematika',
        topicId: data.topicId || data.topic || '',
        subtopicId: data.subtopicId || '',
        imageUrl: data.imageUrl || '',
        svgContent: data.svgContent || '',
        createdAt: data.createdAt,
        createdBy: data.createdBy
      } as PracticeQuestion;
    });
  } catch (error) {
    console.error('Error fetching questions for subtopic:', error);
    return [];
  }
}

export async function getQuestionById(questionId: string): Promise<PracticeQuestion | null> {
  if (!questionId || questionId === 'question' || questionId === 'general') return null;
  try {
    const docRef = doc(db, 'questions', questionId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      id: snap.id,
      question: data.question || '',
      type: data.type || (Array.isArray(data.options) && data.options.length > 0 ? 'choice' : 'open'),
      options: Array.isArray(data.options) ? data.options : [],
      correctAnswer: data.correctAnswer || '',
      hint: data.hint || '',
      explanation: data.explanation || '',
      difficulty: data.difficulty || 'Střední',
      subjectId: data.subjectId || 'Matematika',
      topicId: data.topicId || data.topic || '',
      subtopicId: data.subtopicId || '',
      imageUrl: data.imageUrl || '',
      svgContent: data.svgContent || '',
      createdAt: data.createdAt,
      createdBy: data.createdBy
    } as PracticeQuestion;
  } catch (error) {
    console.error('Error fetching question by ID:', error);
    return null;
  }
}

export async function saveQuestion(questionData: Partial<PracticeQuestion>, userId?: string): Promise<string> {
  const collRef = collection(db, 'questions');
  const now = Timestamp.now();
  const effectiveUserId = getEffectiveUserId(userId);
  const qType = questionData.type || 'choice';

  // SECURITY & VALIDATION:
  // Firestore rules require `options is list`. Open questions MUST have `options: []`!
  const optionsList = qType === 'choice' 
    ? (questionData.options || []).map(o => String(o ?? '').trim()).filter(Boolean)
    : [];

  const cleanData: any = {
    question: questionData.question?.trim() || '',
    type: qType,
    correctAnswer: questionData.correctAnswer?.trim() || '',
    options: optionsList,
    hint: questionData.hint?.trim() || '',
    explanation: questionData.explanation?.trim() || '',
    difficulty: questionData.difficulty || 'Střední',
    subjectId: questionData.subjectId || 'Matematika',
    topicId: questionData.topicId || '',
    topic: questionData.topicId || '', // backwards compatibility
    subtopicId: questionData.subtopicId || '',
    imageUrl: questionData.imageUrl ? String(questionData.imageUrl).trim() : null,
    svgContent: questionData.svgContent ? String(questionData.svgContent).trim() : null
  };

  if (questionData.id) {
    const docRef = doc(db, 'questions', questionData.id);
    await updateDoc(docRef, cleanData);
    return questionData.id;
  } else {
    cleanData.createdAt = now;
    cleanData.createdBy = effectiveUserId;
    const newDoc = await addDoc(collRef, cleanData);
    return newDoc.id;
  }
}

export async function deleteQuestion(questionId: string): Promise<void> {
  await deleteDoc(doc(db, 'questions', questionId));
}

// -------------------------------------------------------------
// PRACTICE ATTEMPTS (Stored in `tests`)
// -------------------------------------------------------------

export async function recordPracticeAttempt(attempt: Omit<PracticeAttempt, 'id' | 'completedAt'>): Promise<string> {
  try {
    const effectiveUserId = getEffectiveUserId(attempt.studentId);
    if (!effectiveUserId) return '';

    const collRef = collection(db, 'tests');
    const newDoc = await addDoc(collRef, {
      title: `Procvičování (${attempt.percentage}%)`,
      description: JSON.stringify({
        subtopicId: attempt.subtopicId,
        score: attempt.score,
        totalQuestions: attempt.totalQuestions,
        percentage: attempt.percentage
      }),
      topic: attempt.subtopicId,
      studentId: effectiveUserId,
      createdBy: effectiveUserId,
      autoGrade: true,
      questions: [],
      createdAt: Timestamp.now()
    });
    return newDoc.id;
  } catch (error) {
    console.warn('Practice attempt recording notice:', error);
    return '';
  }
}

// -------------------------------------------------------------
// EXCEL IMPORT PARSER (.xlsx / .xls)
// -------------------------------------------------------------

// Helper to robustly find column value by key aliases (case & diacritic insensitive)
function findColValue(row: any, ...aliases: string[]): string {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  for (const alias of aliases) {
    const target = norm(alias);
    for (const key of Object.keys(row)) {
      if (norm(key) === target) {
        return String(row[key] ?? '').trim();
      }
    }
  }
  return '';
}

// -------------------------------------------------------------
// 1. PROČVIČOVÁNÍ - EXCEL PARSER & IMPORTER
// -------------------------------------------------------------

export interface ValidatedPracticeRow {
  rowNumber: number;
  subject: string;
  topic: string;
  subtopic: string;
  question: string;
  hint: string;
  explanation: string;
  type: 'choice' | 'open';
  options: string[];
  correctAnswer: string;
  rawType: string;
  imageUrl?: string;
  difficulty: 'Lehká' | 'Střední' | 'Těžká';
}

export function normalizeDifficulty(val?: string): 'Lehká' | 'Střední' | 'Těžká' {
  if (!val) return 'Střední';
  const s = String(val).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (s.includes('lehk') || s.includes('snadn') || s.includes('easy')) return 'Lehká';
  if (s.includes('tezk') || s.includes('obtizn') || s.includes('hard')) return 'Těžká';
  return 'Střední';
}

export function sampleQuestionsForPractice(
  allQuestions: PracticeQuestion[],
  config?: PracticeConfig | null
): PracticeQuestion[] {
  if (!config) return [...allQuestions];

  const easyReq = typeof config.easyCount === 'number' && config.easyCount >= 0 ? Math.floor(config.easyCount) : 0;
  const medReq = typeof config.mediumCount === 'number' && config.mediumCount >= 0 ? Math.floor(config.mediumCount) : 0;
  const hardReq = typeof config.hardCount === 'number' && config.hardCount >= 0 ? Math.floor(config.hardCount) : 0;

  const totalReq = easyReq + medReq + hardReq;
  if (totalReq === 0) {
    return [...allQuestions];
  }

  const easyPool = allQuestions.filter(q => (q.difficulty || 'Střední') === 'Lehká');
  const medPool = allQuestions.filter(q => (q.difficulty || 'Střední') === 'Střední');
  const hardPool = allQuestions.filter(q => (q.difficulty || 'Střední') === 'Těžká');

  const shuffle = <T>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const selectedEasy = shuffle(easyPool).slice(0, easyReq);
  const selectedMed = shuffle(medPool).slice(0, medReq);
  const selectedHard = shuffle(hardPool).slice(0, hardReq);

  return [...selectedEasy, ...selectedMed, ...selectedHard];
}

export interface PracticeExcelParseResult {
  validRows: ValidatedPracticeRow[];
  invalidRows: { rowNumber: number; reason: string; questionText?: string }[];
  totalRows: number;
  topicsFound: string[];
  subtopicsFound: string[];
}

export interface PracticeImportStats {
  totalRows: number;
  importedQuestions: number;
  skippedDuplicates: number;
  topicsCreated: number;
  subtopicsCreated: number;
  errors: string[];
}

export async function parsePracticeQuestionsExcelFile(file: File): Promise<PracticeExcelParseResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });

  const sheetName = workbook.SheetNames.find(n => 
    n.toLowerCase().includes('procvič') || n.toLowerCase().includes('procvic') || n.toLowerCase().includes('otázk') || n.toLowerCase().includes('otazk')
  ) || workbook.SheetNames[0];

  if (!sheetName || !workbook.Sheets[sheetName]) {
    throw new Error('V souboru nebyl nalezen žádný platný list s daty.');
  }

  const rawRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (rawRows.length === 0) {
    throw new Error('Vybraný list je prázdný.');
  }

  // Header check on first row keys
  const firstRow = rawRows[0];
  const hasQuestionCol = Boolean(findColValue(firstRow, 'Otázka', 'Otazka'));
  const hasTypeCol = Boolean(findColValue(firstRow, 'Typ'));
  const hasSubtopicCol = Boolean(findColValue(firstRow, 'Podtéma', 'Podtema'));

  if (!hasQuestionCol || !hasTypeCol || !hasSubtopicCol) {
    throw new Error('Tento soubor neobsahuje sloupce šablony pro Procvičování (např. Otázka, Typ, Podtéma). Ujistěte se, že nahráváte správný soubor.');
  }

  const validRows: ValidatedPracticeRow[] = [];
  const invalidRows: { rowNumber: number; reason: string; questionText?: string }[] = [];
  const topicsSet = new Set<string>();
  const subtopicsSet = new Set<string>();

  rawRows.forEach((row, index) => {
    const rowNum = index + 2; // +1 for 0-index, +1 for header row
    const question = findColValue(row, 'Otázka', 'Otazka');
    const rawType = findColValue(row, 'Typ');
    const subject = findColValue(row, 'Předmět', 'Predmet') || 'Matematika';
    const topic = findColValue(row, 'Téma', 'Tema') || 'Obecné téma';
    const subtopic = findColValue(row, 'Podtéma', 'Podtema') || 'Základní procvičování';
    const rawDifficulty = findColValue(row, 'Obtížnost', 'Obtiznost', 'Obtížnost (Lehká/Střední/Těžká)', 'Obtiznost (Lehka/Stredni/Tezka)', 'Difficulty');
    const difficulty = normalizeDifficulty(rawDifficulty);

    // If whole row is empty, skip
    if (!question && !rawType && !findColValue(row, 'Možnost A', 'Moznost A')) {
      return;
    }

    if (!question) {
      invalidRows.push({ rowNumber: rowNum, reason: 'Chybí text zadání otázky.' });
      return;
    }

    // Apply smart math preprocessor & syntax validator
    const processedQuestion = preprocessMathText(question);
    const questionSyntax = validateLatexSyntax(processedQuestion);
    if (!questionSyntax.isValid) {
      invalidRows.push({ rowNumber: rowNum, reason: questionSyntax.error!, questionText: question });
      return;
    }

    const rawHint = findColValue(row, 'Nápověda', 'Napoveda');
    const hint = preprocessMathText(rawHint);
    const hintSyntax = validateLatexSyntax(hint);
    if (!hintSyntax.isValid) {
      invalidRows.push({ rowNumber: rowNum, reason: hintSyntax.error!, questionText: question });
      return;
    }

    const rawExplanation = findColValue(row, 'Vysvětlení', 'Vysvetleni');
    const explanation = preprocessMathText(rawExplanation);
    const explSyntax = validateLatexSyntax(explanation);
    if (!explSyntax.isValid) {
      invalidRows.push({ rowNumber: rowNum, reason: explSyntax.error!, questionText: question });
      return;
    }

    const imageUrl = findColValue(row, 'Obrázek', 'Obrazek', 'Image', 'ImageUrl', 'Obrázek URL', 'Obrazek URL');
    const typeLower = rawType.toLowerCase();

    if (typeLower.includes('výběr') || typeLower.includes('vyber') || typeLower.includes('choice')) {
      const optA = preprocessMathText(findColValue(row, 'Možnost A', 'Moznost A'));
      const optB = preprocessMathText(findColValue(row, 'Možnost B', 'Moznost B'));
      const optC = preprocessMathText(findColValue(row, 'Možnost C', 'Moznost C'));
      const optD = preprocessMathText(findColValue(row, 'Možnost D', 'Moznost D'));
      const ansChoiceRaw = findColValue(row, 'Odpověď (výběr)', 'Odpoved (vyber)', 'Odpověď výběr', 'Odpoved vyber');
      const ansChoice = ansChoiceRaw.toUpperCase().trim();

      if (!optA || !optB) {
        invalidRows.push({ rowNumber: rowNum, reason: 'Pro úlohu s výběrem možností musí být vyplněna alespoň Možnost A a Možnost B.', questionText: question });
        return;
      }

      if (!['A', 'B', 'C', 'D'].includes(ansChoice)) {
        invalidRows.push({ rowNumber: rowNum, reason: `Sloupec 'Odpověď (výběr)' musí striktně obsahovat písmeno A, B, C nebo D. Zadáno: "${ansChoiceRaw || 'prázdné'}".`, questionText: question });
        return;
      }

      let resolvedCorrectAnswer = '';
      if (ansChoice === 'A') resolvedCorrectAnswer = optA;
      else if (ansChoice === 'B') resolvedCorrectAnswer = optB;
      else if (ansChoice === 'C') resolvedCorrectAnswer = optC;
      else if (ansChoice === 'D') resolvedCorrectAnswer = optD;

      if (!resolvedCorrectAnswer) {
        invalidRows.push({ rowNumber: rowNum, reason: `Vybraná správná možnost ${ansChoice} je v souboru prázdná.`, questionText: question });
        return;
      }

      // Check math syntax in options
      for (const [letter, optVal] of [['A', optA], ['B', optB], ['C', optC], ['D', optD]]) {
        if (optVal) {
          const optSyntax = validateLatexSyntax(optVal);
          if (!optSyntax.isValid) {
            invalidRows.push({ rowNumber: rowNum, reason: `Chyba ve vzorci Možnosti ${letter}: ${optSyntax.error}`, questionText: question });
            return;
          }
        }
      }

      validRows.push({
        rowNumber: rowNum,
        subject,
        topic,
        subtopic,
        question: processedQuestion,
        hint,
        explanation,
        imageUrl: imageUrl || undefined,
        type: 'choice',
        options: [optA, optB, optC, optD].filter(Boolean),
        correctAnswer: resolvedCorrectAnswer,
        rawType,
        difficulty
      });
      topicsSet.add(topic);
      subtopicsSet.add(subtopic);
    } else if (typeLower.includes('volná') || typeLower.includes('volna') || typeLower.includes('open')) {
      const rawAnsOpen = findColValue(row, 'Odpověď (volná)', 'Odpoved (volna)', 'Odpověď volná', 'Odpoved volna');
      const ansOpen = preprocessMathText(rawAnsOpen);

      if (!ansOpen) {
        invalidRows.push({ rowNumber: rowNum, reason: 'Pro úlohu s volnou odpovědí chybí hodnota ve sloupci \'Odpověď (volná)\'.', questionText: question });
        return;
      }

      const ansSyntax = validateLatexSyntax(ansOpen);
      if (!ansSyntax.isValid) {
        invalidRows.push({ rowNumber: rowNum, reason: ansSyntax.error!, questionText: question });
        return;
      }

      validRows.push({
        rowNumber: rowNum,
        subject,
        topic,
        subtopic,
        question: processedQuestion,
        hint,
        explanation,
        imageUrl: imageUrl || undefined,
        type: 'open',
        options: [],
        correctAnswer: ansOpen,
        rawType,
        difficulty
      });
      topicsSet.add(topic);
      subtopicsSet.add(subtopic);
    } else {
      invalidRows.push({ rowNumber: rowNum, reason: `Neznámý typ úlohy: "${rawType}". Zadejte striktně 'výběr' nebo 'volná'.`, questionText: question });
    }
  });

  return {
    validRows,
    invalidRows,
    totalRows: rawRows.length,
    topicsFound: Array.from(topicsSet),
    subtopicsFound: Array.from(subtopicsSet)
  };
}

export function normalizeSubjectName(input?: string): 'Matematika' | 'Čeština' {
  const s = String(input || '').toLowerCase().trim();
  const clean = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (clean.includes('cesk') || clean.includes('cest') || clean.includes('cj')) {
    return 'Čeština';
  }
  return 'Matematika';
}

export function resolveTopicMatch(
  existingTopics: PracticeTopic[],
  targetSubject: string,
  topicTitle: string
): string | null {
  const normSub = normalizeSubjectName(targetSubject);
  const normTitle = topicTitle.toLowerCase().trim();

  const match = existingTopics.find(t => {
    const tSubject = normalizeSubjectName(t.subjectId);
    const tTitle = (t.title || '').toLowerCase().trim();
    return tSubject === normSub && tTitle === normTitle;
  });

  if (match) return match.id;

  const titleOnlyMatch = existingTopics.find(t => (t.title || '').toLowerCase().trim() === normTitle);
  if (titleOnlyMatch) return titleOnlyMatch.id;

  return null;
}

export function resolveSubtopicMatch(
  existingSubtopics: PracticeSubtopic[],
  topicId: string,
  subtopicTitle: string
): string | null {
  const normTitle = subtopicTitle.toLowerCase().trim();
  const match = existingSubtopics.find(s => {
    return s.topicId === topicId && (s.title || '').toLowerCase().trim() === normTitle;
  });
  return match ? match.id : null;
}

export function mergeStudySteps(
  existingSteps: StudyStep[],
  incomingSteps: StudyStep[]
): { mergedSteps: StudyStep[]; addedCount: number; skippedCount: number } {
  const mergedSteps: StudyStep[] = [...existingSteps];
  let addedCount = 0;
  let skippedCount = 0;

  const normText = (str?: string) => (str || '').toLowerCase().replace(/\s+/g, ' ').trim();

  for (const newStep of incomingSteps) {
    const stepNum = parseInt(newStep.title.replace(/\D/g, ''), 10);
    const normContent = normText(newStep.content);

    const isDuplicate = mergedSteps.some(s => {
      const sNum = parseInt(s.title.replace(/\D/g, ''), 10);
      const sContent = normText(s.content);
      return (!isNaN(stepNum) && !isNaN(sNum) && sNum === stepNum) || (normContent && sContent === normContent);
    });

    if (isDuplicate) {
      skippedCount++;
    } else {
      mergedSteps.push(newStep);
      addedCount++;
    }
  }

  mergedSteps.sort((a, b) => {
    const numA = parseInt(a.title.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.title.replace(/\D/g, ''), 10) || 0;
    return numA - numB;
  });

  return { mergedSteps, addedCount, skippedCount };
}

export async function importPracticeQuestionsToFirestore(
  validRows: ValidatedPracticeRow[],
  userId?: string,
  onProgress?: (msg: string) => void
): Promise<PracticeImportStats> {
  const effectiveUserId = getEffectiveUserId(userId);
  let importedQuestions = 0;
  let skippedDuplicates = 0;
  let topicsCreated = 0;
  let subtopicsCreated = 0;
  const errors: string[] = [];

  const existingTopics = await getTopics();
  const existingSubtopics = await getSubtopics();

  const topicCache = new Map<string, string>();
  existingTopics.forEach(t => {
    const normSub = normalizeSubjectName(t.subjectId);
    topicCache.set(`${normSub}:${t.title.trim().toLowerCase()}`, t.id);
  });

  const subtopicCache = new Map<string, string>();
  existingSubtopics.forEach(s => {
    subtopicCache.set(`${s.topicId}:${s.title.trim().toLowerCase()}`, s.id);
  });

  // Subtopic question duplicate cache: subtopicId -> Set of normalized questions
  const subtopicQuestionsCache = new Map<string, Set<string>>();

  const normQ = (str: string) => str.toLowerCase().replace(/\s+/g, ' ').trim();

  async function getExistingQuestionsForSubtopic(subId: string): Promise<Set<string>> {
    if (subtopicQuestionsCache.has(subId)) return subtopicQuestionsCache.get(subId)!;
    const questions = await getQuestionsForSubtopic(subId);
    const set = new Set<string>();
    questions.forEach(q => set.add(normQ(q.question)));
    subtopicQuestionsCache.set(subId, set);
    return set;
  }

  async function ensureTopic(subject: string, topicTitle: string): Promise<string> {
    const normSub = normalizeSubjectName(subject);
    const key = `${normSub}:${topicTitle.trim().toLowerCase()}`;
    if (topicCache.has(key)) return topicCache.get(key)!;

    const foundId = resolveTopicMatch(existingTopics, normSub, topicTitle);
    if (foundId) {
      topicCache.set(key, foundId);
      return foundId;
    }

    onProgress?.(`Vytvářím téma: ${topicTitle}`);
    const newId = await saveTopic({
      subjectId: normSub,
      title: topicTitle.trim(),
      description: `Téma ${topicTitle} pro předmět ${normSub}`
    }, effectiveUserId);
    topicCache.set(key, newId);
    existingTopics.push({
      id: newId,
      title: topicTitle.trim(),
      subjectId: normSub,
      description: `Téma ${topicTitle} pro předmět ${normSub}`,
      order: 0
    });
    topicsCreated++;
    return newId;
  }

  async function ensureSubtopic(subject: string, topicId: string, subtopicTitle: string): Promise<string> {
    const normSub = normalizeSubjectName(subject);
    const key = `${topicId}:${subtopicTitle.trim().toLowerCase()}`;
    if (subtopicCache.has(key)) return subtopicCache.get(key)!;

    const foundId = resolveSubtopicMatch(existingSubtopics, topicId, subtopicTitle);
    if (foundId) {
      subtopicCache.set(key, foundId);
      return foundId;
    }

    onProgress?.(`Vytvářím podtéma: ${subtopicTitle}`);
    const newId = await saveSubtopic({
      subjectId: normSub,
      topicId: topicId,
      title: subtopicTitle.trim(),
      description: `Podtéma ${subtopicTitle}`
    }, effectiveUserId);
    subtopicCache.set(key, newId);
    existingSubtopics.push({
      id: newId,
      title: subtopicTitle.trim(),
      topicId: topicId,
      subjectId: normSub,
      hasStudyMaterial: false,
      description: `Podtéma ${subtopicTitle}`
    });
    subtopicsCreated++;
    return newId;
  }

  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    try {
      onProgress?.(`Zpracovávám otázku ${i + 1}/${validRows.length}: ${row.question.slice(0, 30)}...`);
      const topicId = await ensureTopic(row.subject, row.topic);
      const subtopicId = await ensureSubtopic(row.subject, topicId, row.subtopic);

      const existingSet = await getExistingQuestionsForSubtopic(subtopicId);
      const normalizedCurrent = normQ(row.question);

      if (existingSet.has(normalizedCurrent)) {
        skippedDuplicates++;
        continue;
      }

      await saveQuestion({
        subjectId: row.subject,
        topicId: topicId,
        subtopicId: subtopicId,
        type: row.type,
        question: row.question,
        options: row.options,
        correctAnswer: row.correctAnswer,
        hint: row.hint,
        explanation: row.explanation,
        difficulty: row.difficulty || 'Střední',
        imageUrl: row.imageUrl || undefined
      }, effectiveUserId);

      existingSet.add(normalizedCurrent);
      importedQuestions++;
    } catch (err: any) {
      console.error(`Chyba při importu řádku ${row.rowNumber}:`, err);
      errors.push(`Řádek ${row.rowNumber}: ${err.message || 'Chyba ukládání do databáze'}`);
    }
  }

  return {
    totalRows: validRows.length,
    importedQuestions,
    skippedDuplicates,
    topicsCreated,
    subtopicsCreated,
    errors
  };
}

// -------------------------------------------------------------
// 2. STUDOVAT - EXCEL PARSER & IMPORTER
// -------------------------------------------------------------

export interface ValidatedStudyRow {
  rowNumber: number;
  subject: string;
  topic: string;
  subtopic: string;
  stepNumber: number;
  stepText: string;
  question: string;
  optA: string;
  optB: string;
  optC: string;
  optD: string;
  correctAnswer: string;
  tip: string;
}

export interface StudyExcelParseResult {
  validRows: ValidatedStudyRow[];
  invalidRows: { rowNumber: number; reason: string; stepTitle?: string }[];
  totalRows: number;
  topicsFound: string[];
  subtopicsFound: string[];
}

export interface StudyImportStats {
  totalRows: number;
  importedSteps: number;
  skippedDuplicates: number;
  topicsCreated: number;
  subtopicsCreated: number;
  subtopicsUpdated: number;
  errors: string[];
}

export async function parseStudyStepsExcelFile(file: File): Promise<StudyExcelParseResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });

  const sheetName = workbook.SheetNames.find(n => 
    n.toLowerCase().includes('stud') || n.toLowerCase().includes('výklad') || n.toLowerCase().includes('vyklad') || n.toLowerCase().includes('teori')
  ) || workbook.SheetNames[0];

  if (!sheetName || !workbook.Sheets[sheetName]) {
    throw new Error('V souboru nebyl nalezen žádný platný list s daty.');
  }

  const rawRows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  if (rawRows.length === 0) {
    throw new Error('Vybraný list je prázdný.');
  }

  const firstRow = rawRows[0];
  const hasStepCol = Boolean(findColValue(firstRow, 'Krok'));
  const hasTextCol = Boolean(findColValue(firstRow, 'Text kroku', 'Text'));
  const hasSubtopicCol = Boolean(findColValue(firstRow, 'Podtéma', 'Podtema'));

  if (!hasStepCol || !hasTextCol || !hasSubtopicCol) {
    throw new Error('Tento soubor neobsahuje sloupce šablony pro Studium (např. Krok, Text kroku, Podtéma). Ujistěte se, že nahráváte správný soubor.');
  }

  const validRows: ValidatedStudyRow[] = [];
  const invalidRows: { rowNumber: number; reason: string; stepTitle?: string }[] = [];
  const topicsSet = new Set<string>();
  const subtopicsSet = new Set<string>();

  rawRows.forEach((row, index) => {
    const rowNum = index + 2;
    const rawStep = findColValue(row, 'Krok');
    const stepText = findColValue(row, 'Text kroku', 'Text');
    const subject = findColValue(row, 'Předmět', 'Predmet') || 'Matematika';
    const topic = findColValue(row, 'Téma', 'Tema') || 'Obecné téma';
    const subtopic = findColValue(row, 'Podtéma', 'Podtema') || 'Základní výklad';

    if (!rawStep && !stepText && !findColValue(row, 'Otázka', 'Otazka')) {
      return;
    }

    const stepClean = String(rawStep).replace(/\D/g, '');
    const stepNumber = parseInt(stepClean, 10);
    if (isNaN(stepNumber) || stepNumber <= 0) {
      invalidRows.push({ rowNumber: rowNum, reason: `Číslo kroku musí být kladné číslo (např. 1, 2, 3...). Zadáno: "${rawStep || 'prázdné'}".` });
      return;
    }

    if (!stepText) {
      invalidRows.push({ rowNumber: rowNum, reason: 'Chybí text kroku.' });
      return;
    }

    const processedStepText = preprocessMathText(stepText);
    const stepSyntax = validateLatexSyntax(processedStepText);
    if (!stepSyntax.isValid) {
      invalidRows.push({ rowNumber: rowNum, reason: `Chyba ve vzorci textu kroku: ${stepSyntax.error}`, stepTitle: `Krok ${stepNumber}` });
      return;
    }

    const rawQuestion = findColValue(row, 'Otázka', 'Otazka');
    const question = preprocessMathText(rawQuestion);
    if (question) {
      const qSyntax = validateLatexSyntax(question);
      if (!qSyntax.isValid) {
        invalidRows.push({ rowNumber: rowNum, reason: `Chyba ve vzorci kontrolní otázky: ${qSyntax.error}`, stepTitle: `Krok ${stepNumber}` });
        return;
      }
    }

    const optA = preprocessMathText(findColValue(row, 'Možnost A', 'Moznost A'));
    const optB = preprocessMathText(findColValue(row, 'Možnost B', 'Moznost B'));
    const optC = preprocessMathText(findColValue(row, 'Možnost C', 'Moznost C'));
    const optD = preprocessMathText(findColValue(row, 'Možnost D', 'Moznost D'));
    const ansRaw = findColValue(row, 'Odpověď', 'Odpoved');
    const rawTip = findColValue(row, 'Tip', 'Tip lektora');
    const tip = preprocessMathText(rawTip);

    if (tip) {
      const tipSyntax = validateLatexSyntax(tip);
      if (!tipSyntax.isValid) {
        invalidRows.push({ rowNumber: rowNum, reason: `Chyba ve vzorci tipu lektora: ${tipSyntax.error}`, stepTitle: `Krok ${stepNumber}` });
        return;
      }
    }

    let correctAnswer = ansRaw;
    const upperAns = ansRaw.toUpperCase().trim();
    if (upperAns === 'A' && optA) correctAnswer = optA;
    else if (upperAns === 'B' && optB) correctAnswer = optB;
    else if (upperAns === 'C' && optC) correctAnswer = optC;
    else if (upperAns === 'D' && optD) correctAnswer = optD;
    else if (ansRaw) correctAnswer = preprocessMathText(ansRaw);

    validRows.push({
      rowNumber: rowNum,
      subject,
      topic,
      subtopic,
      stepNumber,
      stepText: processedStepText,
      question,
      optA,
      optB,
      optC,
      optD,
      correctAnswer,
      tip
    });
    topicsSet.add(topic);
    subtopicsSet.add(subtopic);
  });

  return {
    validRows,
    invalidRows,
    totalRows: rawRows.length,
    topicsFound: Array.from(topicsSet),
    subtopicsFound: Array.from(subtopicsSet)
  };
}

export async function importStudyStepsToFirestore(
  validRows: ValidatedStudyRow[],
  userId?: string,
  onProgress?: (msg: string) => void
): Promise<StudyImportStats> {
  const effectiveUserId = getEffectiveUserId(userId);
  let importedSteps = 0;
  let skippedDuplicates = 0;
  let topicsCreated = 0;
  let subtopicsCreated = 0;
  let subtopicsUpdated = 0;
  const errors: string[] = [];

  const existingTopics = await getTopics();
  const existingSubtopics = await getSubtopics();

  const topicCache = new Map<string, string>();
  existingTopics.forEach(t => {
    const normSub = normalizeSubjectName(t.subjectId);
    topicCache.set(`${normSub}:${t.title.trim().toLowerCase()}`, t.id);
  });

  const subtopicCache = new Map<string, string>();
  existingSubtopics.forEach(s => {
    subtopicCache.set(`${s.topicId}:${s.title.trim().toLowerCase()}`, s.id);
  });

  async function ensureTopic(subject: string, topicTitle: string): Promise<string> {
    const normSub = normalizeSubjectName(subject);
    const key = `${normSub}:${topicTitle.trim().toLowerCase()}`;
    if (topicCache.has(key)) return topicCache.get(key)!;

    const foundId = resolveTopicMatch(existingTopics, normSub, topicTitle);
    if (foundId) {
      topicCache.set(key, foundId);
      return foundId;
    }

    onProgress?.(`Vytvářím téma: ${topicTitle}`);
    const newId = await saveTopic({
      subjectId: normSub,
      title: topicTitle.trim(),
      description: `Téma ${topicTitle} pro předmět ${normSub}`
    }, effectiveUserId);
    topicCache.set(key, newId);
    existingTopics.push({
      id: newId,
      title: topicTitle.trim(),
      subjectId: normSub,
      description: `Téma ${topicTitle} pro předmět ${normSub}`,
      order: 0
    });
    topicsCreated++;
    return newId;
  }

  async function ensureSubtopic(subject: string, topicId: string, subtopicTitle: string): Promise<string> {
    const normSub = normalizeSubjectName(subject);
    const key = `${topicId}:${subtopicTitle.trim().toLowerCase()}`;
    if (subtopicCache.has(key)) return subtopicCache.get(key)!;

    const foundId = resolveSubtopicMatch(existingSubtopics, topicId, subtopicTitle);
    if (foundId) {
      subtopicCache.set(key, foundId);
      return foundId;
    }

    onProgress?.(`Vytvářím podtéma: ${subtopicTitle}`);
    const newId = await saveSubtopic({
      subjectId: normSub,
      topicId: topicId,
      title: subtopicTitle.trim(),
      description: `Podtéma ${subtopicTitle}`
    }, effectiveUserId);
    subtopicCache.set(key, newId);
    existingSubtopics.push({
      id: newId,
      title: subtopicTitle.trim(),
      topicId: topicId,
      subjectId: normSub,
      hasStudyMaterial: true,
      description: `Podtéma ${subtopicTitle}`
    });
    subtopicsCreated++;
    return newId;
  }

  // Group rows by subtopic key: subject::topic::subtopic
  const groups = new Map<string, ValidatedStudyRow[]>();
  validRows.forEach(row => {
    const normSub = normalizeSubjectName(row.subject);
    const key = `${normSub}::${row.topic.trim()}::${row.subtopic.trim()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  });

  for (const [groupKey, rows] of groups.entries()) {
    try {
      const [subject, topicTitle, subtopicTitle] = groupKey.split('::');
      onProgress?.(`Zpracovávám kroky pro podtéma: ${subtopicTitle}`);

      const topicId = await ensureTopic(subject, topicTitle);
      const subtopicId = await ensureSubtopic(subject, topicId, subtopicTitle);

      const subtopic = await getSubtopicById(subtopicId);
      const currentSteps: StudyStep[] = subtopic?.studySteps ? [...subtopic.studySteps] : [];

      const incomingSteps: StudyStep[] = rows.map(row => ({
        title: `Krok ${row.stepNumber}`,
        content: row.stepText,
        testQuestion: row.question || undefined,
        testOptions: (row.optA && row.optB) ? [row.optA, row.optB, row.optC, row.optD].filter(Boolean) : undefined,
        correctAnswer: row.correctAnswer || undefined,
        tutorTip: row.tip || undefined
      }));

      const { mergedSteps, addedCount, skippedCount } = mergeStudySteps(currentSteps, incomingSteps);
      importedSteps += addedCount;
      skippedDuplicates += skippedCount;

      if (addedCount > 0) {
        await saveSubtopic({
          id: subtopicId,
          studySteps: mergedSteps,
          hasStudyMaterial: true
        }, effectiveUserId);
        subtopicsUpdated++;
      }
    } catch (err: any) {
      console.error(`Chyba při zpracování podtémata ${groupKey}:`, err);
      errors.push(`${groupKey}: ${err.message || 'Chyba zápisu do databáze'}`);
    }
  }

  return {
    totalRows: validRows.length,
    importedSteps,
    skippedDuplicates,
    topicsCreated,
    subtopicsCreated,
    subtopicsUpdated,
    errors
  };
}

// -------------------------------------------------------------
// SEED DEFAULT DATA
// -------------------------------------------------------------

export async function seedInitialPracticeData(userId?: string): Promise<void> {
  const effectiveUserId = getEffectiveUserId(userId);
  const existing = await getTopics();
  if (existing.length > 0) return;

  // 1. Český jazyk -> Pravopis a vyjmenovaná slova
  const topicCzId = await saveTopic({
    subjectId: 'Čeština',
    title: 'Pravopis a vyjmenovaná slova',
    description: 'Vyjmenovaná slova, koncovky podstatných a přídavných jmen, shoda přísudku s podmětem.',
    order: 1
  }, effectiveUserId);

  // Subtopic with SVG link to /materials/cz-shoda.svg
  const subtopicCzId = await saveSubtopic({
    subjectId: 'Čeština',
    topicId: topicCzId,
    title: 'Vyjmenovaná slova a homofony',
    description: 'Přehled vyjmenovaných slov po B, L, M, P, S, V, Z a časté chytáky u přijímaček.',
    svgUrl: '/materials/cz-shoda.svg',
    hasStudyMaterial: true,
    studyTheory: 'Vyjmenovaná slova jsou slova domácího původu, v jejichž kořenech se po obojetných souhláskách píše tvrdé Y/Ý. U zkoušek CERMAT se často testují tzv. homofony – slova se stejnou výslovností, ale odlišným významem.',
    studyTips: 'Vždy si prověř význam slova v kontextu celé věty (např. být x bít, mlýn x mlít, pyl x pil).',
    sampleProblem: {
      problem: 'Vyberte možnost, ve které jsou VŠECHNA slova napsána pravopisně správně:',
      options: [
        'Starý mlynář mlel obilí na jemnou mouku.',
        'Starý mlinář mlel obilí na jemnou mouku.',
        'Starý mlynář mlýl obilí na jemnou mouku.',
        'Starý mlynář mlel obilý na jemnou mouku.'
      ],
      correctAnswer: 'Starý mlynář mlel obilí na jemnou mouku.',
      explanation: 'Slovo mlynář je příbuzné k vyjmenovanému slovu mlýn (y). Tvar slovesa je mlel (e), odvozeno od mlít (měkké i, není vyjmenované). Obilí má koncovku -í.'
    },
    studySteps: [
      {
        title: 'Krok 1: Určení kořene',
        content: 'Najděte kořen slova a zjistěte, zda je slovo vyjmenované nebo příbuzné k vyjmenovanému slovu.',
        testQuestion: 'Které z následujících slov je příbuzné k vyjmenovanému slovu BÝT (s tvrdým Y)?',
        testOptions: ['bylina', 'přibíjet', 'bystrý', 'odbíjená'],
        correctAnswer: 'bylina',
        tutorTip: 'Pozor na slova, která znějí podobně – "bít" znamená tlouci (odbíjená, přibíjet), zatímco "být" vyjadřuje existenci či bytí (bylina, blahobyt, nábytek).'
      },
      {
        title: 'Krok 2: Kontextový význam',
        content: 'Dosaďte si význam: jde o stavbu (mlýn) nebo činnost (mlít mouku)?',
        testQuestion: 'Doplňte správné I/Y do věty: "Maminka koupila nový ml___nek na kávu."',
        testOptions: ['mlýnek', 'mlínek', 'mlynek', 'mlinek'],
        correctAnswer: 'mlýnek',
        tutorTip: 'Mlýnek je příbuzné k vyjmenovanému slovu mlýn (proto tvrdé ý). Pozor ale na sloveso mlít, které má měkké i (např. mlel mouku)!'
      },
      {
        title: 'Krok 3: Kontrola koncovek',
        content: 'Zkontrolujte vzory podstatných jmen (obilí podle stavení) a správné psaní koncovek.',
        testQuestion: 'Ve kterém slovním spojení je hrubá pravopisná chyba?',
        testOptions: ['zlaté klasy obylí', 'v čistém obilí', 'na širokém poli', 'se starými mlýny'],
        correctAnswer: 'zlaté klasy obylí',
        tutorTip: 'Slovo obilí je vyjmenované po B a skloňuje se podle měkkého vzoru stavení – koncovka je tedy -í a v kořenu tvrdé y.'
      }
    ],
    order: 1
  }, effectiveUserId);

  // Add sample questions for Czech
  await saveQuestion({
    subjectId: 'Čeština',
    topicId: topicCzId,
    subtopicId: subtopicCzId,
    type: 'choice',
    question: 'Ve které z následujících vět je pravopisná CHYBA?',
    options: [
      'Včely sbíraly sladký pyl z rozkvetlých květů.',
      'Ráno pil horký čaj s medem a citronem.',
      'Slepíš dva roztržené papíry lepidlem?',
      'V trávě se mihl malý ještěr slepíš.'
    ],
    correctAnswer: 'V trávě se mihl malý ještěr slepíš.',
    hint: 'Slepýš je beznohá ještěrka – je to vyjmenované slovo po P.',
    explanation: 'Beznohá ještěrka je slepýš (vyjmenované slovo s tvrdým ý). Tvar "slepíš" je sloveso (slepit lepidlem).',
    difficulty: 'Střední'
  }, effectiveUserId);

  await saveQuestion({
    subjectId: 'Čeština',
    topicId: topicCzId,
    subtopicId: subtopicCzId,
    type: 'open',
    question: 'Napište správný tvar slovesa BÝT / BÍT v minulém čase: "Hodiny na věži právě od____ly půlnoc."',
    options: [],
    correctAnswer: 'odbily',
    hint: 'Hodiny tlukou (odrážejí čas).',
    explanation: 'Hodiny tlukou/odbíjejí čas, proto se píše měkké i (odbily). Odbýt s tvrdým y znamená odfláknout úkol.',
    difficulty: 'Střední'
  }, effectiveUserId);

  // 2. Matematika -> Rovnice a algebraické výrazy
  const topicMathId = await saveTopic({
    subjectId: 'Matematika',
    title: 'Rovnice a výrazy',
    description: 'Lineární rovnice s jednou neznámou, vytýkání před závorku a algebraické vzorce.',
    order: 1
  }, effectiveUserId);

  const subtopicMathId = await saveSubtopic({
    subjectId: 'Matematika',
    topicId: topicMathId,
    title: 'Lineární rovnice a ekvivalentní úpravy',
    description: 'Řešení rovnic se zlomky a závorkami, zkouška správnosti.',
    hasStudyMaterial: true,
    studyTheory: 'Při řešení lineárních rovnic používáme ekvivalentní úpravy: přičtení/odečtení stejného výrazu k oběma stranám a násobení/dělení obou stran nenulovým číslem. Cílem je izolovat neznámou x na jedné straně.',
    studyTips: 'Nezapomeňte při násobení rovnice společným jmenovatelem vynásobit KAŽDÝ člen včetně celých čísel!',
    sampleProblem: {
      problem: 'Řešte rovnici pro reálné x: 3(x - 2) + 4 = 2x + 5',
      options: ['x = 7', 'x = 3', 'x = -1', 'x = 9'],
      correctAnswer: 'x = 7',
      explanation: '3x - 6 + 4 = 2x + 5 => 3x - 2 = 2x + 5 => 3x - 2x = 5 + 2 => x = 7. Zkouška: L = 3(5) + 4 = 19, P = 2(7) + 5 = 19.'
    },
    studySteps: [
      {
        title: 'Krok 1: Roznásobení závorek',
        content: 'Roznásobte číslem 3 závorku (x - 2): dostaneme 3x - 6 + 4.',
        testQuestion: 'Jaký je správný výsledek roznásobení výrazu: 4(2x - 3)?',
        testOptions: ['8x - 12', '8x - 3', '6x - 12', '8x + 12'],
        correctAnswer: '8x - 12',
        tutorTip: 'Nezapomeňte číslem před závorkou vynásobit KAŽDÝ člen uvnitř závorky – jak 2x, tak i -3!'
      },
      {
        title: 'Krok 2: Sloučení čísel a členů',
        content: '-6 + 4 = -2, tedy celá levá strana se zjednoduší na 3x - 2.',
        testQuestion: 'Zjednodušte levou stranu: 3x - 5 + 2x + 8',
        testOptions: ['5x + 3', '5x - 3', 'x + 3', '5x + 13'],
        correctAnswer: '5x + 3',
        tutorTip: 'Sčítejte pouze členy stejného druhu: členy s x dohromady (3x + 2x = 5x) a samotná čísla dohromady (-5 + 8 = +3).'
      },
      {
        title: 'Krok 3: Převedení členů a ekvivalentní úpravy',
        content: 'Odečteme 2x z obou stran a přičteme 2: získáme x = 7.',
        testQuestion: 'Jakou ekvivalentní úpravu provedeme u rovnice 5x + 3 = 18 jako první?',
        testOptions: ['Odečteme 3 od obou stran: 5x = 15', 'Přičteme 3 k oběma stranám: 5x = 21', 'Vydělíme obě strany 3: 5x = 6', 'Odečteme 5: x + 3 = 13'],
        correctAnswer: 'Odečteme 3 od obou stran: 5x = 15',
        tutorTip: 'Chceme-li izolovat neznámou, odstraňujeme nejprve přičítaná či odčítaná čísla pomocí opačných početních operací.'
      },
      {
        title: 'Krok 4: Zkouška správnosti',
        content: 'Dosaďte x = 7 do obou stran původní rovnice a ověřte shodu L = P.',
        testQuestion: 'Jak správně postupujeme při zkoušce správnosti rovnice?',
        testOptions: ['Dosadíme výsledek zvlášť do levé a zvlášť do pravé strany původního zadání', 'Pouze dosadíme do levé strany', 'Přepočítáme výpočet pozpátku', 'Vynásobíme obě strany dvěma'],
        correctAnswer: 'Dosadíme výsledek zvlášť do levé a zvlášť do pravé strany původního zadání',
        tutorTip: 'Zkoušku provádějte vždy dosazením do původního zadání rovnice, nikoli do upravených mezikroků, kde jste mohli udělat chybu.'
      }
    ],
    order: 1
  }, effectiveUserId);

  await saveQuestion({
    subjectId: 'Matematika',
    topicId: topicMathId,
    subtopicId: subtopicMathId,
    type: 'choice',
    question: 'Řešte rovnici: 4(x + 1) - 3 = 2(x + 5) - 1. Jaká je hodnota x?',
    options: ['x = 4', 'x = 3', 'x = 5', 'x = 2'],
    correctAnswer: 'x = 4',
    hint: 'Roznásobte závorky na obou stranách: 4x + 4 - 3 a 2x + 10 - 1.',
    explanation: '4x + 1 = 2x + 9 => 4x - 2x = 9 - 1 => 2x = 8 => x = 4.',
    difficulty: 'Střední'
  }, effectiveUserId);

  await saveQuestion({
    subjectId: 'Matematika',
    topicId: topicMathId,
    subtopicId: subtopicMathId,
    type: 'open',
    question: 'Určete kořen rovnice: 5x - 15 = 2x + 6. Zadejte číslo:',
    options: [],
    correctAnswer: '7',
    hint: 'Převeďte členy s x vlevo a čísla vpravo: 5x - 2x = 6 + 15.',
    explanation: '3x = 21 => x = 21 / 3 => x = 7.',
    difficulty: 'Lehká'
  }, effectiveUserId);
}
