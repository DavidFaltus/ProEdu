import { db } from '../lib/firebase';
import { cacheManager } from '../lib/cacheManager';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  setDoc,
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  query,
  orderBy 
} from 'firebase/firestore';
import { Course } from '../types';

export const DEFAULT_FLAGSHIP_COURSES: Omit<Course, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'course-combo',
    title: 'Komplexní příprava (Matematika + Čeština)',
    description: 'Nejkomplexnější příprava na přijímací zkoušky na SŠ. 2x týdně živá online lekce přes Google Meet, kompletní videozáznamy, testy a materiály ke kurzu.',
    badge: 'Doporučeno • Nejoblíbenější',
    subject: 'MA + ČJ',
    price: '3 990 Kč / sezóna',
    difficulty: 'Střední až vyšší (Cermat 9. třída)',
    schedule: 'Úterý & Čtvrtek 17:00 – 18:30 (2× týdně, 90 min)',
    instructorName: 'Mgr. Kateřina Dvořáková & Mgr. Petr Horák',
    startDate: '2026-10-01',
    endDate: '2027-04-10',
    color: 'purple',
    studentCount: 42,
    meetUrl: 'https://meet.google.com/proedu-combo',
    syllabus: [
      'Úvod do CERMAT testů – typologie úloh a časový management',
      'Číselné obory, zlomky, desetinná čísla a priority operací',
      'Pravopisná pravidla: vyjmenovaná slova, koncovky podstatných a přídavných jmen',
      'Lineární rovnice a jejich soustavy s kontrolou zkouškou',
      'Větné rozbory: větné členy, stavba souvětí a interpunkce',
      'Slovní úlohy na pohyb, společnou práci a směsi',
      'Porozumění textu, práce s informacemi a literární pojmy',
      'Planimetrie a prostorová geometrie – obvody, obsahy a povrchy',
      'Konstrukční úlohy a rýsování podle zadání CERMAT',
      'Simulace ostrých přijímaček nanečisto a strategie eliminace chyb'
    ]
  },
  {
    id: 'course-math',
    title: 'Intenzivní kurz Matematiky na SŠ',
    description: 'Systematické zvládnutí všech typů úloh z Cermat testů – geometrie, rovnice, slovní úlohy, procenta a strategie řešení. 1x týdně živá lekce.',
    badge: 'Matematika',
    subject: 'Matematika',
    price: '2 490 Kč / sezóna',
    difficulty: 'Střední (Cermat 9. třída)',
    schedule: 'Úterý 17:00 – 18:30 (1× týdně, 90 min)',
    instructorName: 'Mgr. Petr Horák',
    startDate: '2026-10-01',
    endDate: '2027-04-10',
    color: 'blue',
    studentCount: 38,
    meetUrl: 'https://meet.google.com/proedu-math',
    syllabus: [
      'Zlomky, desetinná čísla a racionální čísla v praxi',
      'Mocniny, odmocniny a algebraické výrazy',
      'Lineární rovnice a vyjádření neznámé ze vzorce',
      'Slovní úlohy – rovnice, poměry a procenta',
      'Trojčlenka, měřítko mapy a jednotky',
      'Planimetrie: Pythagorova věta, trojúhelníky a mnohoúhelníky',
      'Tělesa: hranoly, jehlany, válce a jejich sítě',
      'Konstrukční úlohy s kružítkem a pravítkem',
      'Rozbory chytáků z minulých let testů CERMAT',
      'Závěrečný test nanečisto s podrobným rozborem'
    ]
  },
  {
    id: 'course-czech',
    title: 'Intenzivní kurz Českého jazyka na SŠ',
    description: 'Zaměřeno na pravopisné jevy, větné rozbory, stylistiku, porozumění textu a typické chytáky v Cermat testech z češtiny. 1x týdně živá lekce.',
    badge: 'Český jazyk',
    subject: 'Český jazyk',
    price: '2 490 Kč / sezóna',
    difficulty: 'Střední (Cermat 9. třída)',
    schedule: 'Čtvrtek 17:00 – 18:30 (1× týdně, 90 min)',
    instructorName: 'Mgr. Kateřina Dvořáková',
    startDate: '2026-10-01',
    endDate: '2027-04-10',
    color: 'orange',
    studentCount: 35,
    meetUrl: 'https://meet.google.com/proedu-czech',
    syllabus: [
      'Pravopis: i/y, s/z, bě/bje, pě, vě/vje, mě/mně',
      'Tvarosloví a slovní druhy – určování gramatických kategorií',
      'Stavba slova: kořen, předpona, přípona a koncovka',
      'Skladba: základní a rozvíjející větné členy',
      'Druhy vedlejších vět a poměry mezi větami hlavními',
      'Práce s uměleckým i věcným textem, dedukce a vyvozování',
      'Stylistika, obohacování slovní zásoby, frazémy a rčení',
      'Základní literární formy, tropy a figury',
      'Analýza typických otevřených úloh v testech CERMAT',
      'Simulační test z českého jazyka a individuální feedback'
    ]
  }
];

export async function getAllCourses(): Promise<Course[]> {
  return cacheManager.getOrFetch('courses:all', async () => {
    try {
      const snap = await getDocs(collection(db, 'courses'));
      if (snap.empty) {
        // Pokud je kolekce prázdná, inicializujeme výchozí kurzy
        await seedDefaultCourses();
        const newSnap = await getDocs(collection(db, 'courses'));
        return newSnap.docs.map(d => ({ id: d.id, ...d.data() } as Course));
      }
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as Course));
    } catch (err) {
      console.warn('Nepodařilo se načíst kurzy z Firestore, vráceny výchozí:', err);
      return DEFAULT_FLAGSHIP_COURSES as Course[];
    }
  }, 15 * 60 * 1000);
}

export async function getCourseById(id: string): Promise<Course | null> {
  try {
    const docRef = doc(db, 'courses', id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as Course;
    }
    // Fallback z výchozích
    const found = DEFAULT_FLAGSHIP_COURSES.find(c => c.id === id);
    return found ? (found as Course) : null;
  } catch (err) {
    console.error('Chyba při načítání detailu kurzu:', err);
    const found = DEFAULT_FLAGSHIP_COURSES.find(c => c.id === id);
    return found ? (found as Course) : null;
  }
}

export async function createCourse(data: Omit<Course, 'id'>, teacherId?: string): Promise<string> {
  const courseData = {
    ...data,
    teacherId: teacherId || data.teacherId || 'admin',
    studentIds: data.studentIds || [],
    studentCount: data.studentCount || 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, 'courses'), courseData);
  cacheManager.invalidate('courses');
  return docRef.id;
}

export async function updateCourse(id: string, data: Partial<Course>): Promise<void> {
  const docRef = doc(db, 'courses', id);
  const snap = await getDoc(docRef);

  const cleanData: any = {
    ...data,
    updatedAt: serverTimestamp()
  };
  delete cleanData.id;

  if (snap.exists()) {
    await updateDoc(docRef, cleanData);
  } else {
    // Pokud byl kurz zatím jen v paměti (výchozí), vytvoříme ho s daným ID
    const defaultCourse = DEFAULT_FLAGSHIP_COURSES.find(c => c.id === id);
    await setDoc(docRef, {
      ...defaultCourse,
      ...cleanData,
      createdAt: serverTimestamp()
    });
  }
  cacheManager.invalidate('courses');
}

export async function deleteCourse(id: string): Promise<void> {
  const docRef = doc(db, 'courses', id);
  await deleteDoc(docRef);
  cacheManager.invalidate('courses');
}

export async function seedDefaultCourses(): Promise<void> {
  for (const course of DEFAULT_FLAGSHIP_COURSES) {
    const docRef = doc(db, 'courses', course.id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      await setDoc(docRef, {
        ...course,
        studentIds: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  }
  cacheManager.invalidate('courses');
}
