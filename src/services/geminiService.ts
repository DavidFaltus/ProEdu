import { MathTopic, Question } from '../types';
import { postApi } from './apiClient';

interface ExtractedTest {
  title: string;
  description: string;
  questions: Question[];
}

export async function extractTestFromFile(base64Data: string, mimeType: string): Promise<ExtractedTest> {
  return postApi<ExtractedTest>('/ai/extract-test', {
    base64Data,
    mimeType,
  });
}

export async function generateMathQuestions(topic: MathTopic, count = 5): Promise<Question[]> {
  return postApi<Question[]>('/ai/generate-questions', {
    topic,
    count,
  });
}

export async function extractQuestionsFromTwoPDFs(
  questionsBase64: string,
  answersBase64: string,
  topic: MathTopic,
): Promise<Question[]> {
  return postApi<Question[]>('/ai/extract-questions', {
    questionsBase64,
    answersBase64,
    topic,
  });
}

export async function getRecommendations(
  performance: Record<string, { correct: number; total: number }>,
): Promise<string[]> {
  const response = await postApi<{ recommendations: string[] }>('/ai/recommendations', {
    performance,
  });

  return response.recommendations;
}
