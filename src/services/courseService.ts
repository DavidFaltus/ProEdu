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
  const response = await postApi<StartPracticeResponse>('/practice-attempts', {
    courseId,
    topic,
    title,
    description,
    topics,
    questionCount,
  } satisfies StartPracticePayload);

  return response.assignedTestId;
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
  const response = await postApi<StartPracticeResponse>('/practice-attempts', payload satisfies StartPracticePayload);
  return response.assignedTestId;
}
