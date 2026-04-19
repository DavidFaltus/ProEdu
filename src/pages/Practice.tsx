import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { addDoc, collection, getDocs, Timestamp } from 'firebase/firestore';
import { ArrowRight, BookOpen, FileText, GraduationCap, Loader2, Lock, Sparkles, Star, Users } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { GEOMETRY_QUESTIONS, startPracticeCourse } from '../services/courseService';
import { PracticeCourse, PublicQuestion, TodoItem } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Separator } from '../components/ui/separator';

const TOPICS = ['Aritmetika', 'Geometrie', 'Zlomky a procenta', 'Rovnice', 'Slovní úlohy', 'Jednotky a měření'];
const DIFFICULTIES = ['Začátečník', 'Středně pokročilý', 'Pokročilý', 'Lehká', 'Střední', 'Těžká'];

const FALLBACK_COURSES: PracticeCourse[] = [
  {
    id: 'mock-math',
    title: 'Příprava na přijímačky - Matematika',
    description: 'Komplexní procvičování aritmetiky, geometrie a slovních úloh pro 9. třídy.',
    topic: 'Matematika',
    topics: ['Aritmetika', 'Geometrie', 'Slovní úlohy'],
    difficulty: 'Střední',
    questionCount: 20,
    students: 1240,
    color: '#3b82f6',
    rating: 4.9,
  },
  {
    id: 'mock-czech',
    title: 'Český jazyk - Pravopis a skladba',
    description: 'Procvičujte shodu přísudku s podmětem, psaní i/y a větnou skladbu.',
    topic: 'Čeština',
    difficulty: 'Lehká',
    questionCount: 15,
    students: 850,
    color: '#8b5cf6',
    rating: 4.7,
  },
  {
    id: 'mock-english',
    title: 'Angličtina - Gramatika B1/B2',
    description: 'Časy, modální slovesa a kondicionály v jednom procvičování.',
    topic: 'Angličtina',
    difficulty: 'Těžká',
    questionCount: 30,
    students: 2100,
    color: '#f97316',
    rating: 4.8,
  },
];

const DEFAULT_PREVIEW = (course: PracticeCourse): PublicQuestion | null => {
  if (course.previewQuestion) {
    return course.previewQuestion;
  }

  if (course.topic === 'Geometrie' || course.topics?.includes('Geometrie')) {
    return GEOMETRY_QUESTIONS[0];
  }

  return null;
};

export default function Practice() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<PracticeCourse[]>([]);
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCourse, setSelectedCourse] = useState<PracticeCourse | null>(null);
  const [previewQuestion, setPreviewQuestion] = useState<PublicQuestion | null>(null);
  const [startingCourseId, setStartingCourseId] = useState<string | null>(null);
  const [addingTodoCourseId, setAddingTodoCourseId] = useState<string | null>(null);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'practiceCourses'));
        const loadedCourses = snapshot.docs
          .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as PracticeCourse))
          .filter((course) => course.isVisible !== false);

        setCourses(loadedCourses.length > 0 ? loadedCourses : FALLBACK_COURSES);
      } catch (error) {
        console.error(error);
        setCourses(FALLBACK_COURSES);
      }
    };

    fetchCourses();
  }, []);

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const matchesTopic = selectedTopic === 'all' || course.topic === selectedTopic || course.topics?.includes(selectedTopic);
      const matchesDifficulty = selectedDifficulty === 'all' || course.difficulty === selectedDifficulty;
      const normalizedSearch = searchQuery.trim().toLowerCase();
      const matchesSearch =
        normalizedSearch === '' ||
        course.title.toLowerCase().includes(normalizedSearch) ||
        course.description.toLowerCase().includes(normalizedSearch);

      return matchesTopic && matchesDifficulty && matchesSearch;
    });
  }, [courses, searchQuery, selectedDifficulty, selectedTopic]);

  const openCourseDetail = (course: PracticeCourse) => {
    setSelectedCourse(course);
    setPreviewQuestion(DEFAULT_PREVIEW(course));
  };

  const handleStartCourse = async (course: PracticeCourse) => {
    if (!user) {
      toast.error('Pro spuštění procvičování se musíš přihlásit.');
      navigate('/login');
      return;
    }

    setStartingCourseId(course.id);

    try {
      const assignedId = await startPracticeCourse(
        user.uid,
        profile?.name || 'Student',
        course.topic,
        course.title,
        course.description,
        course.id,
        course.topics,
        course.questionCount,
      );

      toast.success('Procvičování bylo úspěšně spuštěno.');
      navigate(`/test/${assignedId}`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Chyba při spouštění procvičování.');
    } finally {
      setStartingCourseId(null);
    }
  };

  const handleAddToTodo = async (course: PracticeCourse) => {
    if (!user) {
      toast.error('Pro přidání do TODO se musíš přihlásit.');
      return;
    }

    setAddingTodoCourseId(course.id);

    try {
      const todoData: Omit<TodoItem, 'id'> = {
        studentId: user.uid,
        title: course.title,
        type: 'practice',
        referenceId: course.id,
        completed: false,
        addedBy: user.uid,
        createdAt: Timestamp.now(),
      };

      await addDoc(collection(db, 'todos'), todoData);
      toast.success('Úkol byl přidán do tvého TODO listu.');
      setSelectedCourse(null);
    } catch (error) {
      console.error(error);
      toast.error('Chyba při přidávání do TODO.');
    } finally {
      setAddingTodoCourseId(null);
    }
  };

  return (
    <div className="page-container">
      <section className="text-center space-y-6 max-w-3xl mx-auto">
        <motion.h1 initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-5xl md:text-6xl font-display font-bold text-gray-900">
          Naše <span className="text-brand-blue">procvičování</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="text-xl text-gray-500 leading-relaxed">
          Vyber si téma, které chceš procvičit. Každý pokus je vytvořen bezpečně na serveru a tahá jen otázky, které opravdu potřebuješ.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 justify-center mt-8 bg-white p-4 rounded-3xl shadow-sm border border-gray-100"
        >
          <div className="w-full sm:w-64">
            <Select value={selectedTopic} onValueChange={setSelectedTopic}>
              <SelectTrigger className="rounded-xl h-12 border-gray-100 bg-gray-50/50">
                <SelectValue placeholder="Všechna témata" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechna témata</SelectItem>
                {TOPICS.map((topic) => (
                  <SelectItem key={topic} value={topic}>
                    {topic}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-64">
            <Select value={selectedDifficulty} onValueChange={setSelectedDifficulty}>
              <SelectTrigger className="rounded-xl h-12 border-gray-100 bg-gray-50/50">
                <SelectValue placeholder="Všechny obtížnosti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny obtížnosti</SelectItem>
                {DIFFICULTIES.map((difficulty) => (
                  <SelectItem key={difficulty} value={difficulty}>
                    {difficulty}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-72">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Hledat kurz..."
              className="w-full h-12 rounded-xl border border-gray-100 bg-gray-50/50 px-4 outline-none focus:border-brand-blue"
            />
          </div>
        </motion.div>
      </section>

      <div className="grid md:grid-cols-3 gap-8">
        {filteredCourses.map((course, index) => {
          const isLocked = !user && index > 0;
          const topStripeStyle = course.color?.startsWith('#') ? { backgroundColor: course.color } : undefined;

          return (
            <motion.div key={course.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * index + 0.3 }} className="relative">
              <Card className={`h-full flex flex-col group transition-all border-none overflow-hidden rounded-[2.5rem] bg-white relative ${isLocked ? 'grayscale opacity-70 cursor-not-allowed' : 'hover:shadow-2xl hover:shadow-blue-100'}`}>
                <div className="h-2 w-full bg-brand-blue" style={topStripeStyle} />

                {isLocked && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/50 backdrop-blur-[2px] p-6 text-center">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center text-gray-400 mb-4">
                      <Lock size={32} />
                    </div>
                    <p className="font-display font-black text-gray-900 text-lg leading-tight mb-2">Další kurzy jsou po přihlášení</p>
                    <Button variant="link" onClick={() => navigate('/login')} className="text-brand-orange font-bold p-0 h-auto underline decoration-2 underline-offset-4">
                      Přihlásit se
                    </Button>
                  </div>
                )}

                <CardHeader className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white bg-brand-blue" style={topStripeStyle}>
                      {course.topic === 'Čeština' ? <FileText size={28} /> : course.topic === 'Angličtina' ? <GraduationCap size={28} /> : <BookOpen size={28} />}
                    </div>
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold uppercase">{course.difficulty}</span>
                  </div>
                  <CardTitle className="text-2xl font-display font-bold">{course.title}</CardTitle>
                  <CardDescription className="text-gray-500 text-base">{course.description}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-6 flex-grow">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 text-sm text-gray-400 font-bold">
                      <BookOpen size={16} /> {course.questionCount} otázek
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400 font-bold">
                      <Users size={16} /> {course.students || '500+'}
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="rounded-full px-3 py-1">
                      {course.rating || 5} / 5
                    </Badge>
                    <div className="flex items-center gap-1 text-brand-orange">
                      <Star size={16} fill="currentColor" />
                      <span className="text-sm font-bold">Oblíbené</span>
                    </div>
                  </div>

                  <div className="pt-6 mt-auto">
                    <Button onClick={() => !isLocked && openCourseDetail(course)} disabled={isLocked} className={`w-full rounded-xl h-12 gap-2 text-lg font-bold ${isLocked ? 'bg-gray-100 text-gray-400' : 'btn-blue'}`}>
                      {isLocked ? 'Uzamčeno' : <>Detail procvičování <ArrowRight size={20} /></>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}

        {filteredCourses.length === 0 && (
          <div className="col-span-full text-center py-20 bg-white/50 rounded-[3rem] border-2 border-dashed border-gray-100">
            <BookOpen size={48} className="mx-auto text-gray-200 mb-4" />
            <p className="text-gray-400 font-bold text-xl">Nenalezeny žádné kurzy pro vybrané filtry.</p>
          </div>
        )}
      </div>

      <section className="bg-brand-blue rounded-[3rem] p-12 text-white text-center space-y-8 relative overflow-hidden mt-12">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
        <div className="relative z-10 space-y-4">
          <h2 className="text-4xl font-display font-bold">Nevíš si rady s výběrem?</h2>
          <p className="text-blue-100 text-xl max-w-xl mx-auto">Napiš nám a rádi ti poradíme, které téma je pro tebe to pravé.</p>
          <div className="pt-4">
            <Link to="/contact" className="inline-flex items-center justify-center bg-white text-brand-blue px-10 h-14 rounded-2xl text-xl font-bold hover:scale-105 transition-transform shadow-xl">
              Kontaktuj nás
            </Link>
          </div>
        </div>
      </section>

      <Dialog open={!!selectedCourse} onOpenChange={(open) => !open && setSelectedCourse(null)}>
        <DialogContent className="max-w-2xl rounded-[3rem] p-0 overflow-hidden border-none shadow-3xl bg-white">
          {selectedCourse && (
            <>
              <div className="relative h-48 bg-brand-blue flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-brand-blue to-blue-700 opacity-90" />
                <div className="relative z-10 text-center text-white space-y-2">
                  <Badge className="bg-white/20 hover:bg-white/20 border-none text-white px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest">
                    {selectedCourse.difficulty}
                  </Badge>
                  <DialogTitle className="text-4xl font-display font-black">{selectedCourse.title}</DialogTitle>
                </div>
              </div>

              <div className="p-10 space-y-8">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-gray-50 rounded-2xl">
                    <BookOpen className="mx-auto mb-2 text-brand-blue" size={20} />
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Otázek</div>
                    <div className="font-black text-gray-900">{selectedCourse.questionCount} ks</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-2xl">
                    <Users className="mx-auto mb-2 text-brand-blue" size={20} />
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Studenti</div>
                    <div className="font-black text-gray-900">{selectedCourse.students || '500+'}</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-2xl">
                    <Star className="mx-auto mb-2 text-brand-orange" size={20} />
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Hodnocení</div>
                    <div className="font-black text-gray-900">{selectedCourse.rating || 5} / 5</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-display font-black text-2xl text-gray-900">O čem to je?</h3>
                  <p className="text-gray-500 text-lg leading-relaxed">{selectedCourse.description}</p>
                </div>

                <Separator className="bg-gray-100" />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-black text-2xl text-gray-900">Náhled první otázky</h3>
                    <Sparkles size={20} className="text-brand-orange" />
                  </div>

                  {previewQuestion ? (
                    <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100">
                      <div className="text-xs font-black text-brand-blue mb-2 uppercase tracking-widest bg-blue-50 w-fit px-3 py-1 rounded-lg">Otázka 1</div>
                      <p className="text-lg font-bold text-gray-800 leading-snug">{previewQuestion.question}</p>
                      <div className="grid grid-cols-2 gap-2 mt-4">
                        {previewQuestion.options.slice(0, 2).map((option) => (
                          <div key={option} className="bg-white/80 p-3 rounded-xl text-sm font-bold text-gray-500 border border-white">
                            {option}
                          </div>
                        ))}
                        {previewQuestion.options.length > 2 && (
                          <div className="col-span-2 text-center text-[10px] text-gray-300 font-bold uppercase tracking-widest pt-2">
                            + další {previewQuestion.options.length - 2} možnosti
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 bg-orange-50 rounded-3xl text-orange-600 text-center font-bold">
                      Pro tento kurz zatím nemáme veřejný náhled otázky.
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="p-10 pt-0 gap-4 sm:justify-center flex-col sm:flex-row">
                {!user ? (
                  <div className="w-full space-y-4 text-center">
                    <p className="text-gray-500 font-bold">Líbí se ti tento kurz? Přihlas se a začni procvičovat.</p>
                    <Button onClick={() => navigate('/login')} className="h-16 w-full px-10 rounded-2xl bg-brand-orange hover:bg-brand-orange/90 text-white font-black shadow-xl shadow-orange-100 gap-2 text-lg">
                      Přihlásit se a začít
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      disabled={addingTodoCourseId === selectedCourse.id}
                      onClick={() => handleAddToTodo(selectedCourse)}
                      className="h-16 px-10 rounded-2xl border-2 border-gray-100 hover:border-brand-blue hover:text-brand-blue font-black flex-1 gap-2 text-lg"
                    >
                      {addingTodoCourseId === selectedCourse.id ? <Loader2 className="animate-spin" size={20} /> : 'Dát do TODO'}
                    </Button>
                    <Button
                      onClick={() => handleStartCourse(selectedCourse)}
                      disabled={startingCourseId === selectedCourse.id}
                      className="h-16 px-10 rounded-2xl bg-brand-blue hover:bg-brand-blue/90 text-white font-black flex-1 shadow-xl shadow-blue-100 gap-2 text-lg"
                    >
                      {startingCourseId === selectedCourse.id ? <Loader2 className="animate-spin" size={20} /> : <>Spustit hned <ArrowRight size={20} /></>}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
