import { Timestamp } from 'firebase/firestore';

export type BugReportCategory = 'question' | 'technical' | 'visual' | 'improvement' | 'other';

export type BugReportStatus = 'pending' | 'in_progress' | 'resolved';

export interface BugReport {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  category: BugReportCategory;
  categoryLabel?: string;
  description: string;
  pageUrl: string;
  screenshotUrl?: string | null;
  userAgent?: string | null;
  screenResolution?: string | null;
  status: BugReportStatus;
  resolutionNotes?: string | null;
  resolvedAt?: Timestamp | null;
  createdAt: Timestamp | any;
}

export interface CreateBugReportInput {
  category: BugReportCategory;
  description: string;
  pageUrl: string;
  screenshotUrl?: string | null;
  screenshotFile?: File | null;
  userAgent?: string;
  screenResolution?: string;
  userName?: string;
}
