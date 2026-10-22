import { Timestamp } from 'firebase/firestore';

export type UserRole = 'student' | 'free' | 'premium' | 'course' | 'teacher';

export type Difficulty = 'Začátečník' | 'Středně pokročilý' | 'Pokročilý' | 'Lehká' | 'Střední' | 'Těžká';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Timestamp;
  focusAreas?: string[];
  photoURL?: string;
  streak?: number;
  lastPracticeDate?: Timestamp;
  gardenPlants?: number;
  avatarEmoji?: string;
  avatarBgColor?: string;
  focusSessionsHistory?: any[];
  lastViewedActivityAt?: Timestamp;
  // --- Ekonomika žolíků a monetizace ---
  jokers?: number;
  lastJokerResetDate?: string; // Formát YYYY-MM-DD
  dailyVideosWatched?: number;
  lastStreakPracticeDate?: string; // Formát YYYY-MM-DD pro streak
  lastDailyGrantDate?: string; // Formát YYYY-MM-DD pro denní příděl +5 žolíků
  referralCode?: string; // Kód doporučení
  referredBy?: string; // UID uživatele, který tohoto studenta pozval
  referralsCount?: number; // Počet úspěšně pozvaných přátel (max 5)
  surveyCompleted?: boolean; // Zda byl vyplněn dotazník "Odkud jste o nás slyšeli ?"
  surveyAnswer?: string; // Vybraná odpověď z dotazníku
  surveyAnswerCustom?: string; // Doplňující text při volbě "Jiné"
  surveySchool?: string; // Škola, na kterou student chodí
  surveyGrade?: string; // Ročník, do kterého student chodí
}

export type QuestionType = 'choice' | 'open'; // Výběr ze 4 možností | Volná odpověď

export interface PracticeQuestion {
  id: string;
  subjectId: string; // e.g. 'Matematika' | 'Čeština'
  topicId: string;
  subtopicId: string;
  type: QuestionType;
  question: string;
  options?: string[]; // 4 možnosti při výběru
  correctAnswer: string;
  hint?: string;
  explanation?: string;
  difficulty?: 'Lehká' | 'Střední' | 'Těžká';
  order?: number;
  createdAt?: any;
  createdBy?: string;
  imageUrl?: string;
  svgContent?: string;
}

export interface StudyStep {
  title: string;
  content: string;
  imageUrl?: string;
  svgContent?: string;
  testQuestion?: string;
  testOptions?: string[];
  correctAnswer?: string;
  tutorTip?: string;
}

export interface SampleProblem {
  problem: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
}

export interface PracticeConfig {
  easyCount?: number;
  mediumCount?: number;
  hardCount?: number;
  totalCount?: number;
}

export interface PracticeSubtopic {
  id: string;
  topicId: string;
  subjectId: string;
  title: string;
  description?: string;
  order?: number;
  hasStudyMaterial?: boolean;
  svgUrl?: string; // např. '/materials/cz-shoda.svg' nebo externí link
  svgContent?: string; // Uložený kód SVG z konvertovaného PDF nebo SVG souboru
  studyTheory?: string;
  sampleProblem?: SampleProblem;
  studySteps?: StudyStep[];
  studyTips?: string; // Tip lektora & časté chyby
  questionCount?: number;
  practiceConfig?: PracticeConfig;
  createdAt?: any;
  createdBy?: string;
}

export interface PracticeTopic {
  id: string;
  subjectId: string;
  title: string;
  description?: string;
  order?: number;
  subtopicCount?: number;
  createdAt?: any;
  createdBy?: string;
}

export interface PracticeSubject {
  id: string;
  title: string;
  description: string;
  icon?: string;
  gradient?: string;
  order?: number;
}

export interface PracticeAttempt {
  id: string;
  studentId: string;
  subtopicId: string;
  topicId: string;
  subjectId: string;
  score: number;
  totalQuestions: number;
  percentage: number;
  answers: Record<string, string>;
  completedAt: any;
}

export type LiveLessonStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
export type VideoProvider = 'google_meet' | 'jitsi' | 'custom';
export type TargetAudience = 'all' | 'individual';

export interface LiveLesson {
  id?: string;
  title: string;
  description?: string;
  subject?: string;
  teacherId: string;
  teacherName: string;
  provider: VideoProvider;
  meetUrl: string;
  scheduledAt: Timestamp;
  durationMinutes: number;
  status: LiveLessonStatus;
  targetAudience: TargetAudience;
  studentIds?: string[];
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  subject?: string; // 'MA + ČJ' | 'Matematika' | 'Český jazyk'
  price?: string; // e.g. '3 990 Kč / sezóna'
  difficulty?: string; // e.g. 'Střední pokročilost (Cermat 9. třída)'
  schedule?: string; // e.g. 'Čtvrtek 17:00 - 18:30 (1x týdně, 90 min)'
  instructorName?: string; // e.g. 'Mgr. Jan Novák'
  startDate?: string; // e.g. '2026-10-01'
  endDate?: string; // e.g. '2027-04-10'
  syllabus?: string[]; // Seznam témat / osnova kurzu
  badge?: string; // e.g. 'Doporučeno • Nejoblíbenější'
  color?: string; // 'blue' | 'purple' | 'orange' | 'green' | 'rose'
  meetUrl?: string; // Google Meet odkaz
  teacherId?: string;
  studentIds?: string[];
  studentCount?: number;
  createdAt?: any;
  updatedAt?: any;
}
