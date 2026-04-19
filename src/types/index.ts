import { ReactNode } from 'react';
import { Timestamp } from 'firebase/firestore';

export type UserRole = 'student' | 'teacher';

export type Difficulty = 'Začátečník' | 'Středně pokročilý' | 'Pokročilý' | 'Lehká' | 'Střední' | 'Těžká';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Timestamp;
  focusAreas?: string[];
  photoURL?: string;
}

export type MathTopic = string;

export interface PublicQuestion {
  id: string;
  question: string;
  options: string[];
  topic: string;
  topics?: string[];
  explanation?: string;
  diagram?: 'square' | 'triangle' | 'circle' | 'coordinate';
  courseId?: string;
  imageUrl?: string;
}

export interface Question extends PublicQuestion {
  correctAnswer: string;
  createdBy?: string;
  createdAt?: Timestamp;
}

export interface ReviewQuestion extends PublicQuestion {
  correctAnswer: string;
  userAnswer?: string;
  isCorrect: boolean;
}

export interface Test {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  createdBy: string;
  createdAt: Timestamp;
  topic?: MathTopic;
  autoGrade?: boolean;
  courseId?: string;
  studentId?: string;
}

export interface AssignedTest {
  id: string;
  testId?: string;
  courseId?: string;
  studentId: string;
  status: 'pending' | 'submitted' | 'graded';
  answers?: Record<string, string>;
  grade?: string;
  feedback?: string;
  assignedAt: Timestamp;
  dueDate?: Timestamp;
  submittedAt?: Timestamp;
  gradedAt?: Timestamp;
  testTitle?: string;
  testDescription?: string;
  topic?: MathTopic;
  autoGrade?: boolean;
  questions?: PublicQuestion[];
  reviewQuestions?: ReviewQuestion[];
  topicPerformance?: Record<string, { correct: number; total: number }>;
  createdBy?: string;
}

export interface LearningSheet {
  id: string;
  title: string;
  subject: string;
  level: string;
  topic: MathTopic;
  createdBy: string;
  createdAt: Timestamp;
  fileUrl?: string;
  fileType?: string;
  content?: string;
}

export interface PracticeCourse {
  id: string;
  title: string;
  description: string;
  topic: MathTopic | string;
  topics?: string[];
  customTopics?: string[];
  difficulty: Difficulty | string;
  questionCount: number;
  color: string;
  createdBy?: string;
  createdAt?: Timestamp;
  isVisible?: boolean;
  students?: number | string;
  rating?: number;
  icon?: ReactNode;
  previewQuestion?: PublicQuestion;
}

export interface TodoItem {
  id: string;
  studentId: string;
  title: string;
  type: 'practice' | 'custom' | 'test' | 'material';
  referenceId?: string;
  completed: boolean;
  dueDate?: Timestamp;
  createdAt: Timestamp;
  addedBy: string;
  completedAt?: Timestamp | null;
}
