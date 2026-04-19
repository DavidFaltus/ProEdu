import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

console.log('--- SERVER STARTING ---');

process.on('uncaughtException', (err) => {
  console.error('--- FATAL UNCAUGHT EXCEPTION ---', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('--- FATAL UNHANDLED REJECTION ---', reason);
});

const PORT = Number(process.env.NODE_ENV === 'production' ? 3000 : (process.env.PORT || 3005));
const ADMIN_FALLBACK_EMAIL = 'davidfaltus03@gmail.com';

const GEOMETRY_FALLBACK = [
  {
    id: 'g1',
    question: 'Jaký je vzorec pro obsah čtverce o straně a?',
    options: ['S = a * a', 'S = 4 * a', 'S = 2 * a', 'S = a + a'],
    correctAnswer: 'S = a * a',
    topic: 'Geometrie',
    diagram: 'square',
  },
  {
    id: 'g2',
    question: 'Kolik stupňů má pravý úhel?',
    options: ['45°', '90°', '180°', '360°'],
    correctAnswer: '90°',
    topic: 'Geometrie',
    diagram: 'coordinate',
  },
  {
    id: 'g3',
    question: 'V pravoúhlém trojúhelníku s odvěsnami 3 cm a 4 cm, jak dlouhá je přepona?',
    options: ['5 cm', '6 cm', '7 cm', '25 cm'],
    correctAnswer: '5 cm',
    topic: 'Geometrie',
    diagram: 'triangle',
  },
  {
    id: 'g4',
    question: 'Jaký je součet vnitřních úhlů v trojúhelníku?',
    options: ['90°', '180°', '270°', '360°'],
    correctAnswer: '180°',
    topic: 'Geometrie',
  },
  {
    id: 'g5',
    question: 'Který z těchto útvarů má všechny strany stejně dlouhé, ale úhly nemusí být pravé?',
    options: ['Čtverec', 'Obdélník', 'Kosočtverec', 'Lichoběžník'],
    correctAnswer: 'Kosočtverec',
    topic: 'Geometrie',
  },
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read Firebase config to get the exact bucket name
let configBucket = 'gen-lang-client-0972842509.firebasestorage.app';
try {
  const configPath = path.join(__dirname, '..', 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config.storageBucket) {
      configBucket = config.storageBucket;
      console.log('--- FOUND BUCKET IN CONFIG:', configBucket);
    }
  }
} catch (err) {
  console.error('Failed to read firebase-applet-config.json:', err);
}

function initializeFirebaseAdmin() {
  if (getApps().length > 0) {
    return;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    initializeApp({
      credential: cert(JSON.parse(serviceAccountJson)),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || configBucket
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    projectId: 'gen-lang-client-0972842509',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || configBucket
  });
}

initializeFirebaseAdmin();

const auth = getAuth();
const db = getFirestore('ai-studio-1fc75345-16e5-4af6-a275-4152ed6176ba');
const storage = getStorage();
const app = express();

async function startServer() {
  app.use(express.json({ limit: '25mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

function sanitizeQuestion(question) {
  const { correctAnswer, createdAt, createdBy, ...publicQuestion } = question;
  return publicQuestion;
}

function buildReviewQuestions(questions, answers) {
  return questions.map((question) => {
    const userAnswer = answers[question.id];

    return {
      ...sanitizeQuestion(question),
      correctAnswer: question.correctAnswer,
      explanation: question.explanation || '',
      userAnswer,
      isCorrect: userAnswer === question.correctAnswer,
    };
  });
}

function calculateTopicPerformance(questions, answers) {
  const performance = {};

  for (const question of questions) {
    const topic = question.topic || 'Ostatní';

    if (!performance[topic]) {
      performance[topic] = { correct: 0, total: 0 };
    }

    performance[topic].total += 1;

    if (answers[question.id] === question.correctAnswer) {
      performance[topic].correct += 1;
    }
  }

  return performance;
}

function calculateGrade(percentage) {
  if (percentage >= 90) return '1';
  if (percentage >= 75) return '2';
  if (percentage >= 50) return '3';
  if (percentage >= 30) return '4';
  return '5';
}

function buildFallbackRecommendations(performance) {
  const rankedTopics = Object.entries(performance)
    .map(([topic, stats]) => ({
      topic,
      accuracy: stats.total > 0 ? stats.correct / stats.total : 1,
      total: stats.total,
    }))
    .sort((left, right) => {
      if (left.accuracy !== right.accuracy) {
        return left.accuracy - right.accuracy;
      }

      return right.total - left.total;
    })
    .map((entry) => entry.topic);

  const uniqueTopics = [...new Set(rankedTopics)].slice(0, 3);
  return uniqueTopics.length > 0 ? uniqueTopics : ['Aritmetika', 'Geometrie', 'Rovnice'];
}

async function executeWithRetry(operation, maxRetries = 4) {
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      const errorMessage = error?.message || '';
      const isUnavailable =
        error?.status === 503 ||
        error?.status === 'UNAVAILABLE' ||
        errorMessage.includes('503') ||
        errorMessage.includes('high demand') ||
        errorMessage.includes('UNAVAILABLE');

      attempt += 1;

      if (!isUnavailable || attempt >= maxRetries) {
        throw error;
      }

      const delay = Math.pow(2, attempt - 1) * 1500 + Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('AI služba je dočasně přetížená. Zkuste to prosím znovu.');
}

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('Server nemá nastavený GEMINI_API_KEY.');
  }

  return new GoogleGenAI({ apiKey });
}

async function generateRecommendations(performance) {
  try {
    const ai = getAiClient();
    const performanceStr = Object.entries(performance)
      .map(([topic, stats]) => `${topic}: ${stats.correct}/${stats.total}`)
      .join(', ');

    const response = await executeWithRetry(() =>
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Na základě výsledků studenta v matematických testech: ${performanceStr}, doporuč 3 konkrétní oblasti, na které by se měl student zaměřit při přípravě na přijímací zkoušky na SŠ. Vrať pouze seznam těchto 3 oblastí jako pole řetězců v češtině.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      }),
    );

    const parsed = JSON.parse(response.text || '[]');
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : buildFallbackRecommendations(performance);
  } catch (error) {
    console.warn('Falling back to deterministic recommendations:', error?.message || error);
    return buildFallbackRecommendations(performance);
  }
}

async function requireAuth(req, res, next) {
  try {
    const authorizationHeader = req.headers.authorization || '';
    const token = authorizationHeader.startsWith('Bearer ') ? authorizationHeader.slice(7) : null;

    if (!token) {
      res.status(401).json({ error: 'Chybí přihlašovací token.' });
      return;
    }

    const decodedToken = await auth.verifyIdToken(token);
    
    // We avoid fetching the profile from Firestore during auth middleware to prevent "PERMISSION_DENIED" 
    // if the service account doesn't have enough permissions for the specific DB ID.
    // Instead, we determine the role based on the email or token data.
    const isTeacher = decodedToken.email === ADMIN_FALLBACK_EMAIL || 
                    decodedToken.email === 'ucitel@ucitel.cz'; // Hardcoded for your debugging

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      role: isTeacher ? 'teacher' : 'student',
    };

    next();
  } catch (error) {
    console.error('requireAuth error:', error);
    res.status(401).json({ error: 'Přihlášení vypršelo. Přihlaste se prosím znovu. (Detail: ' + (error?.message || 'Token verification failed') + ')' });
  }
}

function requireTeacher(req, res, next) {
  if (req.user?.role !== 'teacher') {
    res.status(403).json({ error: 'Tato akce je dostupná jen učiteli.' });
    return;
  }

  next();
}

async function loadQuestionsForCourse(courseData) {
  const questionPool = [];
  const questionMap = new Map();
  const topics = Array.isArray(courseData.topics) && courseData.topics.length > 0 ? courseData.topics : [courseData.topic];

  if (courseData.courseId) {
    const byCourseSnapshot = await db
      .collection('questions')
      .where('courseId', '==', courseData.courseId)
      .get();

    for (const doc of byCourseSnapshot.docs) {
      questionMap.set(doc.id, { id: doc.id, ...doc.data() });
    }
  }

  for (const topic of topics) {
    const byTopicsSnapshot = await db
      .collection('questions')
      .where('topics', 'array-contains', topic)
      .get();

    for (const doc of byTopicsSnapshot.docs) {
      questionMap.set(doc.id, { id: doc.id, ...doc.data() });
    }

    const byTopicSnapshot = await db
      .collection('questions')
      .where('topic', '==', topic)
      .get();

    for (const doc of byTopicSnapshot.docs) {
      questionMap.set(doc.id, { id: doc.id, ...doc.data() });
    }
  }

  questionPool.push(...questionMap.values());

  if (questionPool.length < 5 && topics.includes('Geometrie')) {
    for (const question of GEOMETRY_FALLBACK) {
      if (!questionMap.has(question.id)) {
        questionPool.push(question);
      }
    }
  }

  if (questionPool.length < 5) {
    throw new Error(`Nedostatek otázek v bance pro toto téma (nalezeno ${questionPool.length}). Přidejte alespoň 5 otázek v administraci.`);
  }

  return questionPool;
}

function shuffle(array) {
  const clone = [...array];

  for (let index = clone.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const temporary = clone[index];
    clone[index] = clone[randomIndex];
    clone[randomIndex] = temporary;
  }

  return clone;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/practice-attempts', requireAuth, async (req, res) => {
  try {
    const requestedStudentId = req.body.studentId;
    const targetStudentId = requestedStudentId || req.user.uid;

    if (requestedStudentId && req.user.role !== 'teacher') {
      res.status(403).json({ error: 'Nemůžete vytvářet pokusy pro jiného studenta.' });
      return;
    }

    let courseSnapshot = null;

    if (req.body.courseId) {
      courseSnapshot = await db.collection('practiceCourses').doc(req.body.courseId).get();
    }

    const courseData = courseSnapshot?.exists
      ? { courseId: courseSnapshot.id, ...courseSnapshot.data() }
      : {
          courseId: req.body.courseId || null,
          topic: req.body.topic,
          title: req.body.title,
          description: req.body.description,
          topics: req.body.topics || [],
          questionCount: req.body.questionCount || 10,
        };

    if (!courseData.topic || !courseData.title) {
      res.status(400).json({ error: 'Chybí základní metadata procvičování.' });
      return;
    }

    const questionPool = await loadQuestionsForCourse(courseData);
    const questionCount = Math.min(questionPool.length, Number(courseData.questionCount || 10));
    const selectedQuestions = shuffle(questionPool).slice(0, questionCount);

    const testPayload = {
      title: courseData.title,
      description: courseData.description || '',
      topic: courseData.topic,
      autoGrade: true,
      courseId: courseData.courseId || null,
      createdBy: req.user.uid,
      createdAt: Timestamp.now(),
      studentId: targetStudentId,
      questions: selectedQuestions,
    };

    const testRef = await db.collection('tests').add(testPayload);

    const assignedPayload = {
      testId: testRef.id,
      courseId: courseData.courseId || null,
      studentId: targetStudentId,
      testTitle: courseData.title,
      testDescription: courseData.description || '',
      topic: courseData.topic,
      autoGrade: true,
      status: 'pending',
      assignedAt: Timestamp.now(),
      dueDate: req.body.dueDate ? Timestamp.fromDate(new Date(req.body.dueDate)) : null,
      createdBy: req.user.uid,
      questions: selectedQuestions.map(sanitizeQuestion),
    };

    const assignedRef = await db.collection('assignedTests').add(assignedPayload);

    res.json({ assignedTestId: assignedRef.id });
  } catch (error) {
    console.error('practice-attempts failed:', error);
    res.status(400).json({ error: error?.message || 'Nepodařilo se vytvořit procvičování.' });
  }
});

app.post('/api/assigned-tests/:id/submit', requireAuth, async (req, res) => {
  try {
    const assignedRef = db.collection('assignedTests').doc(req.params.id);
    const assignedSnapshot = await assignedRef.get();

    if (!assignedSnapshot.exists) {
      res.status(404).json({ error: 'Zadaný test nebyl nalezen.' });
      return;
    }

    const assignedTest = { id: assignedSnapshot.id, ...assignedSnapshot.data() };

    if (assignedTest.studentId !== req.user.uid && req.user.role !== 'teacher') {
      res.status(403).json({ error: 'Tento test vám nepatří.' });
      return;
    }

    if (!assignedTest.testId) {
      res.status(400).json({ error: 'Test nemá interní answer key.' });
      return;
    }

    const testSnapshot = await db.collection('tests').doc(assignedTest.testId).get();

    if (!testSnapshot.exists) {
      res.status(404).json({ error: 'Interní test nebyl nalezen.' });
      return;
    }

    const test = { id: testSnapshot.id, ...testSnapshot.data() };
    const answers = req.body.answers || {};
    const topicPerformance = calculateTopicPerformance(test.questions, answers);
    const totalQuestions = test.questions.length;
    const correctAnswers = Object.values(topicPerformance).reduce((sum, stats) => sum + stats.correct, 0);
    const percentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

    if (test.autoGrade) {
      const reviewQuestions = buildReviewQuestions(test.questions, answers);
      const grade = calculateGrade(percentage);
      const feedback = `Automaticky vyhodnoceno. Úspěšnost: ${percentage}%.`;
      const recommendations = await generateRecommendations(topicPerformance);

      await assignedRef.update({
        answers,
        topicPerformance,
        submittedAt: Timestamp.now(),
        status: 'graded',
        gradedAt: Timestamp.now(),
        grade,
        feedback,
        reviewQuestions,
      });

      await db.collection('users').doc(assignedTest.studentId).set(
        {
          focusAreas: recommendations,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      res.json({
        status: 'graded',
        grade,
        feedback,
        recommendations,
        resultStats: {
          score: correctAnswers,
          total: totalQuestions,
          percentage,
        },
      });

      return;
    }

    await assignedRef.update({
      answers,
      topicPerformance,
      submittedAt: Timestamp.now(),
      status: 'submitted',
    });

    res.json({
      status: 'submitted',
      resultStats: {
        score: correctAnswers,
        total: totalQuestions,
        percentage,
      },
    });
  } catch (error) {
    console.error('assigned-tests submit failed:', error);
    res.status(400).json({ error: error?.message || 'Nepodařilo se odevzdat test.' });
  }
});

app.post('/api/ai/recommendations', requireAuth, async (req, res) => {
  try {
    const recommendations = await generateRecommendations(req.body.performance || {});
    res.json({ recommendations });
  } catch (error) {
    res.status(400).json({ error: error?.message || 'Nepodařilo se získat doporučení.' });
  }
});

app.post('/api/ai/extract-test', requireAuth, requireTeacher, async (req, res) => {
  try {
    const ai = getAiClient();
    const response = await executeWithRetry(() =>
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            {
              inlineData: {
                data: req.body.base64Data,
                mimeType: req.body.mimeType,
              },
            },
            {
              text: 'Analyzuj tento dokument a vytvoř z něj elektronický test. Vrať název testu, krátký popis a seznam otázek. Každá otázka musí mít 4 možnosti, jednu správnou odpověď a krátké vysvětlení. Vrať výsledek v češtině.',
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
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
                      items: { type: Type.STRING },
                    },
                    correctAnswer: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                  },
                  required: ['question', 'options', 'correctAnswer', 'explanation'],
                },
              },
            },
            required: ['title', 'description', 'questions'],
          },
        },
      }),
    );

    const result = JSON.parse(response.text || '{}');
    result.questions = (result.questions || []).map((question, index) => ({
      ...question,
      id: `ai-extracted-${Date.now()}-${index}`,
      topic: 'Z dokumentu',
    }));

    res.json(result);
  } catch (error) {
    console.error('extract-test failed:', error);
    res.status(400).json({ error: error?.message || 'Nepodařilo se zpracovat soubor.' });
  }
});

app.post('/api/ai/generate-questions', requireAuth, requireTeacher, async (req, res) => {
  try {
    const ai = getAiClient();
    const topic = req.body.topic;
    const count = Number(req.body.count || 5);
    const response = await executeWithRetry(() =>
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Generuj ${count} testových otázek z matematiky pro 9. třídu ZŠ na téma: ${topic}. Každá otázka musí mít 4 možnosti, jednu správnou odpověď a krátké vysvětlení. Vrať výsledek v češtině.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                correctAnswer: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ['question', 'options', 'correctAnswer', 'explanation'],
            },
          },
        },
      }),
    );

    const rawQuestions = JSON.parse(response.text || '[]');
    res.json(
      rawQuestions.map((question, index) => ({
        ...question,
        id: `ai-${Date.now()}-${index}`,
        topic,
      })),
    );
  } catch (error) {
    console.error('generate-questions failed:', error);
    res.status(400).json({ error: error?.message || 'Nepodařilo se vygenerovat otázky.' });
  }
});

app.post('/api/ai/extract-questions', requireAuth, requireTeacher, async (req, res) => {
  try {
    const ai = getAiClient();
    const response = await executeWithRetry(() =>
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
          parts: [
            {
              inlineData: {
                data: req.body.questionsBase64,
                mimeType: 'application/pdf',
              },
            },
            {
              inlineData: {
                data: req.body.answersBase64,
                mimeType: 'application/pdf',
              },
            },
            {
              text: 'Analyzuj tato dvě PDF. První obsahuje otázky, druhé obsahuje správné odpovědi. Extrahuj otázky z prvního PDF. Ke každé otázce vytvoř 4 možnosti, přiřaď správnou odpověď z druhého PDF a vrať JSON pole otázek v češtině.',
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                correctAnswer: { type: Type.STRING },
                explanation: { type: Type.STRING },
              },
              required: ['question', 'options', 'correctAnswer'],
            },
          },
        },
      }),
    );

    const topic = req.body.topic || 'Aritmetika';
    const rawQuestions = JSON.parse(response.text || '[]');
    res.json(
      rawQuestions.map((question, index) => ({
        ...question,
        id: `ai-pdf-${Date.now()}-${index}`,
        topic,
        explanation: question.explanation || '',
      })),
    );
  } catch (error) {
    console.error('extract-questions failed:', error);
    res.status(400).json({ error: error?.message || 'Nepodařilo se zpracovat PDF.' });
  }
});

app.post('/api/upload', requireAuth, requireTeacher, async (req, res) => {
  try {
    const { base64Data, fileName, mimeType, path } = req.body;
    
    if (!base64Data || !fileName) {
       res.status(400).json({ error: 'Chybí data souboru nebo název.' });
       return;
    }

    const buffer = Buffer.from(base64Data, 'base64');
    
    // Exhaustive list of potential bucket names
    const projectId = 'gen-lang-client-0972842509';
    const potentialBuckets = [
      configBucket,
      process.env.FIREBASE_STORAGE_BUCKET,
      `${projectId}.firebasestorage.app`,
      `${projectId}.appspot.com`,
      projectId
    ].filter(Boolean);
    
    // Remove duplicates
    const uniqueBuckets = [...new Set(potentialBuckets)];
    console.log('--- TRYING BUCKETS:', uniqueBuckets);

    let lastError = null;
    let successBucket = null;
    let finalUrl = null;
    let finalFullPath = null;

    for (const bName of uniqueBuckets) {
      try {
        console.log(`--- ATTEMPTING UPLOAD TO: ${bName} ---`);
        const bucket = storage.bucket(bName);
        const targetPath = req.body.path || `learningSheets/${req.user.uid}/${Date.now()}_${fileName}`;
        const file = bucket.file(targetPath);

        await file.save(buffer, {
           metadata: { contentType: mimeType || 'application/pdf' },
           public: true,
           resumable: false
        });

        successBucket = bName;
        finalFullPath = targetPath;
        finalUrl = `https://firebasestorage.googleapis.com/v0/b/${bName}/o/${encodeURIComponent(targetPath)}?alt=media`;
        console.log(`--- UPLOAD SUCCESS TO: ${bName} ---`);
        break; 
      } catch (err) {
        console.error(`--- FAILED BUCKET ${bName}:`, err.message);
        lastError = err;
      }
    }

    if (!successBucket) {
      throw lastError || new Error('Všechny pokusy o nahrávání do Storage selhaly.');
    }

    res.json({ 
       url: finalUrl,
       fileName,
       fullPath: finalFullPath
    });
  } catch (error) {
    console.error('Server-side upload failed:', error);
    res.status(500).json({ error: 'Nahrávání na serveru selhalo: ' + (error?.message || 'Neznámá chyba') });
  }
});

// Vite middleware / static serving
if (process.env.NODE_ENV !== 'production') {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const distPath = path.join(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ProEdu Server running on http://0.0.0.0:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});
}

startServer();
