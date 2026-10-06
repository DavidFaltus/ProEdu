import { collection, addDoc, doc, updateDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

export interface InquiryInput {
  studentId: string;
  studentName?: string;
  questionId?: string;
  questionText?: string;
  topic?: string;
  comment: string;
  senderRole?: 'student' | 'teacher';
}

export interface ValidatedInquiry {
  studentId: string;
  studentName: string;
  questionId: string;
  questionText: string;
  topic: string;
  comment: string;
  status: 'pending' | 'answered';
  isReadByStudent: boolean;
  senderRole?: 'student' | 'teacher';
}

export interface QuestionInquiry extends ValidatedInquiry {
  id: string;
  createdAt: any;
  reply?: string;
  repliedAt?: any;
  repliedBy?: string;
  repliedByName?: string;
}

export function validateInquiryPayload(input: InquiryInput): ValidatedInquiry {
  const studentId = String(input.studentId || '').trim();
  if (!studentId) {
    throw new Error('Chybí studentId.');
  }

  const comment = String(input.comment || '').trim();
  if (!comment) {
    throw new Error('Chybí text dotazu.');
  }

  const studentName = String(input.studentName || '').trim() || (input.senderRole === 'teacher' ? 'Učitel' : 'Student');
  const questionId = String(input.questionId || '').trim() || 'general';
  const rawQuestionText = String(input.questionText || '').trim();
  const questionText = rawQuestionText ? rawQuestionText.slice(0, 5000) : 'Bez textu zadání';
  const topic = String(input.topic || '').trim() || 'Procvičování';
  const senderRole = input.senderRole === 'teacher' ? 'teacher' : 'student';

  return {
    studentId: studentId.slice(0, 128),
    studentName: studentName.slice(0, 128),
    questionId: questionId.slice(0, 128),
    questionText,
    topic: topic.slice(0, 128),
    comment: comment.slice(0, 3000),
    status: 'pending',
    isReadByStudent: false,
    senderRole,
  };
}

export async function submitInquiry(input: InquiryInput): Promise<{ id: string }> {
  const validated = validateInquiryPayload(input);

  const docRef = await addDoc(collection(db, 'questionInquiries'), {
    ...validated,
    createdAt: Timestamp.now(),
  });

  return { id: docRef.id };
}

export async function getStudentInquiries(studentId: string): Promise<QuestionInquiry[]> {
  try {
    const q = query(collection(db, 'questionInquiries'), where('studentId', '==', studentId));
    const snap = await getDocs(q);
    const items: QuestionInquiry[] = [];
    snap.forEach(docSnap => {
      items.push({ id: docSnap.id, ...(docSnap.data() as any) });
    });
    // Sort in memory by createdAt descending
    items.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
      return timeB - timeA;
    });
    return items;
  } catch (err) {
    console.error('Failed to get student inquiries:', err);
    return [];
  }
}

export async function markInquiryAsRead(inquiryId: string): Promise<void> {
  const ref = doc(db, 'questionInquiries', inquiryId);
  await updateDoc(ref, {
    isReadByStudent: true
  });
}

export async function getAllInquiries(): Promise<QuestionInquiry[]> {
  try {
    const snap = await getDocs(collection(db, 'questionInquiries'));
    const items: QuestionInquiry[] = [];
    snap.forEach(docSnap => {
      items.push({ id: docSnap.id, ...(docSnap.data() as any) });
    });
    items.sort((a, b) => {
      const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
      const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
      return timeB - timeA;
    });
    return items;
  } catch (err) {
    console.error('Failed to get all inquiries:', err);
    return [];
  }
}

export async function replyToInquiry(
  inquiryId: string, 
  reply: string, 
  teacherId: string, 
  teacherName: string
): Promise<void> {
  const cleanReply = String(reply || '').trim().slice(0, 2000);
  if (!cleanReply) {
    throw new Error('Odpověď nesmí být prázdná.');
  }

  const ref = doc(db, 'questionInquiries', inquiryId);
  await updateDoc(ref, {
    reply: cleanReply,
    status: 'answered',
    repliedAt: Timestamp.now(),
    repliedBy: teacherId.slice(0, 128),
    repliedByName: teacherName.slice(0, 128),
    isReadByStudent: false
  });
}

