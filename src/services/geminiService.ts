import { GoogleGenAI, Type } from "@google/genai";
import { MathTopic, Question } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const executeWithRetry = async <T>(operation: () => Promise<T>, maxRetries = 4): Promise<T> => {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error: any) {
      const errorMessage = error?.message || "";
      const isUnavailable = error?.status === 503 || error?.status === "UNAVAILABLE" || errorMessage.includes("503") || errorMessage.includes("high demand") || errorMessage.includes("UNAVAILABLE");
      
      attempt++;
      if (!isUnavailable || attempt >= maxRetries) {
        throw error;
      }
      
      const delay = Math.pow(2, attempt - 1) * 1500 + Math.random() * 1000;
      console.warn(`Gemini API je přetížené (503). Opakuji pokus za ${Math.round(delay/1000)}s... (Pokus ${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error("API je příliš přetížené, zkuste to prosím později.");
};

export const extractTestFromFile = async (base64Data: string, mimeType: string): Promise<{ title: string, description: string, questions: Question[] }> => {
  try {
    const response = await executeWithRetry(() => ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        "Analyzuj tento dokument a vytvoř z něj elektronický test. Vrať název testu, krátký popis a seznam otázek. Každá otázka musí mít 4 možnosti (pokud v dokumentu nejsou, vymysli smysluplné nesprávné možnosti), jednu správnou odpověď a vysvětlení. Vrať výsledek v češtině."
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  options: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING } 
                  },
                  correctAnswer: { type: Type.STRING },
                  explanation: { type: Type.STRING }
                },
                required: ["question", "options", "correctAnswer", "explanation"]
              }
            }
          },
          required: ["title", "description", "questions"]
        }
      }
    }));

    const result = JSON.parse(response.text || "{}");
    if (result.questions) {
      result.questions = result.questions.map((q: any, index: number) => ({
        ...q,
        id: `ai-extracted-${Date.now()}-${index}`,
        topic: 'Z dokumentu'
      }));
    }
    return result;
  } catch (error) {
    console.error("Gemini API Error (extractTestFromFile):", error);
    throw error;
  }
};

export const generateMathQuestions = async (topic: MathTopic, count: number = 5): Promise<Question[]> => {
  try {
    const response = await executeWithRetry(() => ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generuj ${count} testových otázek z matematiky pro 9. třídu ZŠ (příprava na přijímací zkoušky na SŠ) na téma: ${topic}. 
      Každá otázka musí mít 4 možnosti, jednu správnou odpověď a krátké vysvětlení.
      Vrať výsledek v češtině.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING } 
              },
              correctAnswer: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["question", "options", "correctAnswer", "explanation"]
          }
        }
      }
    }));

    const rawQuestions = JSON.parse(response.text || "[]");
    return rawQuestions.map((q: any, index: number) => ({
      ...q,
      id: `ai-${Date.now()}-${index}`,
      topic
    }));
  } catch (error) {
    console.error("Gemini API Error (generateMathQuestions):", error);
    throw error;
  }
};

export const extractQuestionsFromTwoPDFs = async (questionsBase64: string, answersBase64: string, topic: MathTopic): Promise<Question[]> => {
  try {
    const response = await executeWithRetry(() => ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                data: questionsBase64,
                mimeType: "application/pdf"
              }
            },
            {
              inlineData: {
                data: answersBase64,
                mimeType: "application/pdf"
              }
            },
            {
              text: "Analyzuj tato dvě PDF. První obsahuje otázky, druhé obsahuje správné odpovědi. Extrahuj otázky z prvního PDF. Ke každé otázce vytvoř 4 možnosti (jedna správná z druhého PDF, 3 smysluplné nesprávné, pokud v PDF nejsou). Přiřaď správnou odpověď z druhého PDF. Vrať jako JSON pole otázek. Vše v češtině."
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING } 
              },
              correctAnswer: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["question", "options", "correctAnswer"]
          }
        }
      }
    }));

    const rawQuestions = JSON.parse(response.text || "[]");
    return rawQuestions.map((q: any, index: number) => ({
      ...q,
      id: `ai-pdf-${Date.now()}-${index}`,
      topic,
      explanation: q.explanation || ''
    }));
  } catch (error) {
    console.error("Gemini API Error (extractQuestionsFromTwoPDFs):", error);
    throw error;
  }
};

export const getRecommendations = async (performance: Record<string, { correct: number, total: number }>): Promise<string[]> => {
  try {
    const performanceStr = Object.entries(performance)
      .map(([topic, stats]) => `${topic}: ${stats.correct}/${stats.total}`)
      .join(", ");

    const response = await executeWithRetry(() => ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Na základě výsledků studenta v matematických testech: ${performanceStr}, doporuč 3 konkrétní oblasti, na které by se měl student zaměřit při přípravě na přijímací zkoušky na SŠ. 
      Vrať pouze seznam těchto 3 oblastí jako pole řetězců v češtině.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    }));

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Gemini API Error (getRecommendations):", error);
    return ["Aritmetika", "Geometrie", "Rovnice"]; // Fallback
  }
};
