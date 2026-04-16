import { db } from '../lib/firebase';
import { collection, addDoc, Timestamp, getDocs, query, where } from 'firebase/firestore';
import { Test, AssignedTest, MathTopic, Question } from '../types';

export const GEOMETRY_QUESTIONS: Question[] = [
  {
    id: 'g1',
    question: 'Jaký je vzorec pro obsah čtverce o straně a?',
    options: ['S = a * a', 'S = 4 * a', 'S = 2 * a', 'S = a + a'],
    correctAnswer: 'S = a * a',
    topic: 'Geometrie',
    diagram: 'square'
  },
  {
    id: 'g2',
    question: 'Kolik stupňů má pravý úhel?',
    options: ['45°', '90°', '180°', '360°'],
    correctAnswer: '90°',
    topic: 'Geometrie',
    diagram: 'coordinate'
  },
  {
    id: 'g3',
    question: 'V pravoúhlém trojúhelníku s odvěsnami 3 cm a 4 cm, jak dlouhá je přepona?',
    options: ['5 cm', '6 cm', '7 cm', '25 cm'],
    correctAnswer: '5 cm',
    topic: 'Geometrie',
    diagram: 'triangle'
  },
  {
    id: 'g4',
    question: 'Jaký je součet vnitřních úhlů v trojúhelníku?',
    options: ['90°', '180°', '270°', '360°'],
    correctAnswer: '180°',
    topic: 'Geometrie'
  },
  {
    id: 'g5',
    question: 'Který z těchto útvarů má všechny strany stejně dlouhé, ale úhly nemusí být pravé?',
    options: ['Čtverec', 'Obdélník', 'Kosočtverec', 'Lichoběžník'],
    correctAnswer: 'Kosočtverec',
    topic: 'Geometrie'
  },
  {
    id: 'g6',
    question: 'Jaký je vzorec pro obvod kruhu s poloměrem r?',
    options: ['o = π * r²', 'o = 2 * π * r', 'o = π * d²', 'o = 2 * r'],
    correctAnswer: 'o = 2 * π * r',
    topic: 'Geometrie'
  },
  {
    id: 'g7',
    question: 'Kolik vrcholů má krychle?',
    options: ['4', '6', '8', '12'],
    correctAnswer: '8',
    topic: 'Geometrie'
  },
  {
    id: 'g8',
    question: 'Jak se nazývá nejdelší strana v pravoúhlém trojúhelníku?',
    options: ['Odvěsna', 'Přepona', 'Základna', 'Výška'],
    correctAnswer: 'Přepona',
    topic: 'Geometrie'
  },
  {
    id: 'g9',
    question: 'Jaký je vzorec pro obsah trojúhelníku se základnou a a výškou v?',
    options: ['S = a * v', 'S = (a * v) / 2', 'S = a + v', 'S = a² + v²'],
    correctAnswer: 'S = (a * v) / 2',
    topic: 'Geometrie'
  },
  {
    id: 'g10',
    question: 'Kolik os souměrnosti má rovnostranný trojúhelník?',
    options: ['1', '2', '3', '0'],
    correctAnswer: '3',
    topic: 'Geometrie'
  },
  {
    id: 'g11',
    question: 'Jaký je obsah obdélníku se stranami 5 cm a 8 cm?',
    options: ['13 cm²', '26 cm²', '40 cm²', '20 cm²'],
    correctAnswer: '40 cm²',
    topic: 'Geometrie'
  },
  {
    id: 'g12',
    question: 'Který úhel je větší než 90° a menší než 180°?',
    options: ['Ostrý', 'Pravý', 'Tupý', 'Přímý'],
    correctAnswer: 'Tupý',
    topic: 'Geometrie'
  },
  {
    id: 'g13',
    question: 'Jaký je objem krychle o hraně 3 cm?',
    options: ['9 cm³', '12 cm³', '27 cm³', '18 cm³'],
    correctAnswer: '27 cm³',
    topic: 'Geometrie'
  },
  {
    id: 'g14',
    question: 'Kolik stěn má pravidelný čtyřboký jehlan?',
    options: ['4', '5', '6', '8'],
    correctAnswer: '5',
    topic: 'Geometrie'
  },
  {
    id: 'g15',
    question: 'Jaký je vzorec pro obsah kruhu?',
    options: ['S = 2 * π * r', 'S = π * r²', 'S = π * d', 'S = r²'],
    correctAnswer: 'S = π * r²',
    topic: 'Geometrie'
  }
];

export const startPracticeCourse = async (userId: string, userName: string, topic: MathTopic = 'Geometrie', customTitle?: string, customDescription?: string) => {
  // Fetch questions from the database for the given topic
  const qSnapshot = await getDocs(query(collection(db, 'questions'), where('topic', '==', topic)));
  let pool = qSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Question));

  // Fallback to hardcoded geometry questions if DB is empty for geometry
  if (pool.length < 5 && topic === 'Geometrie') {
    pool = [...pool, ...GEOMETRY_QUESTIONS];
  }

  if (pool.length < 5) {
    throw new Error(`Nedostatek otázek v bance pro téma ${topic}. Přidejte alespoň 5 otázek.`);
  }

  // Select 5 random questions from the pool
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  const selectedQuestions = shuffled.slice(0, 5);

  const testData: Partial<Test> = {
    title: customTitle || `${topic}: Náhodné procvičování`,
    description: customDescription || `Procvič si téma ${topic} s náhodně vybranými úlohami. Každý pokus je jiný!`,
    autoGrade: true,
    topic: topic,
    questions: selectedQuestions
  };

  // 1. Create the test template
  const testRef = await addDoc(collection(db, 'tests'), {
    ...testData,
    createdBy: userId,
    createdAt: Timestamp.now()
  });

  // 2. Assign it to the student
  const assignedRef = await addDoc(collection(db, 'assignedTests'), {
    testId: testRef.id,
    testTitle: testData.title,
    studentId: userId,
    status: 'pending',
    assignedAt: Timestamp.now()
  });

  return assignedRef.id;
};
