import { Timestamp } from 'firebase/firestore';

export type UserRole = 'student' | 'teacher';

export type Difficulty = 'Začátečník' | 'Středně pokročilý' | 'Pokročilý';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Timestamp;
  focusAreas?: string[]; // Recommended areas to focus on
}

export type MathTopic = string;

export interface Question {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
  topic: string;
  topics?: string[];
  diagram?: 'square' | 'triangle' | 'circle' | 'coordinate';
  courseId?: string;
  imageUrl?: string;
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
}

export interface AssignedTest {
  id: string;
  testId: string;
  studentId: string;
  status: 'pending' | 'submitted' | 'graded';
  answers?: Record<string, string>;
  grade?: string;
  feedback?: string;
  assignedAt: Timestamp;
  dueDate?: Timestamp;
  submittedAt?: Timestamp;
  gradedAt?: Timestamp;
  testTitle?: string; // Denormalized for convenience
  topicPerformance?: Record<string, { correct: number, total: number }>;
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
}

export interface PracticeCourse {
  id: string;
  title: string;
  description: string;
  topic: MathTopic | string;
  topics?: string[];
  customTopics?: string[]; // deprecated/alternative, let's just use `topics`
  difficulty: Difficulty;
  duration: string;
  color: string;
  createdBy: string;
  createdAt: Timestamp;
}
