import { motion } from 'motion/react';
import { BookOpen, Star, Clock, Users, GraduationCap, ArrowRight, Loader2, Sparkles, Target, Percent, Shapes, Search, Trophy, Timer, CheckCircle, ChevronRight, Filter, Plus, FileText, X, Lock } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Question, PracticeCourse } from '../types/index';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Timestamp, query, where, limit } from 'firebase/firestore';
import { startPracticeCourse } from '../services/courseService';
import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '../components/ui/dialog';

const MATH_TOPICS = [
  'Aritmetika',
  'Geometrie',
  'Zlomky a procenta',
  'Rovnice',
  'Slovní úlohy',
  'Jednotky a měření'
];

const MOCK_COURSES: PracticeCourse[] = [
  {
    id: 'mock-1',
    title: 'Příprava na přijímačky - Matematika',
    description: 'Komplexní procvičování aritmetiky, geometrie a slovních úloh pro 9. třídy.',
    topic: 'Matematika',
    difficulty: 'Střední',
    questionCount: 25,
    students: 1240,
    color: '#3b82f6',
    icon: <BookOpen size={32} />
  },
  {
    id: 'mock-2',
    title: 'Český jazyk - Pravopis a skladba',
    description: 'Procvičujte shodu přísudku s podmětem, psaní i/y a větnou skladbu.',
    topic: 'Čeština',
    difficulty: 'Lehká',
    questionCount: 15,
    students: 850,
    color: '#8b5cf6',
    icon: <FileText size={32} />
  },
  {
    id: 'mock-3',
    title: 'Angličtina - Gramatika B1/B2',
    description: 'Ideální příprava na maturitu nebo certifikáty. Časy, modální slovesa a kondicionály.',
    topic: 'Angličtina',
    difficulty: 'Těžká',
    questionCount: 30,
    students: 2100,
    color: '#f97316',
    icon: <GraduationCap size={32} />
  }
];

const getTopicColor = (color: string) => {
  if (!color) return 'bg-brand-blue';
  if (color.startsWith('bg-')) return color;
  if (color.startsWith('#')) return ''; // Use style={{backgroundColor}} for hex
  return `bg-${color}`;
};

export default function Practice() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [startingCourse, setStartingCourse] = useState<string | null>(null);
  const [dbCourses, setDbCourses] = useState<PracticeCourse[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCourse, setSelectedCourse] = useState<any | null>(null);
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isAddingToTodo, setIsAddingToTodo] = useState(false);

  const displayCourses = React.useMemo(() => {
    if (dbCourses.length > 0) {
      return dbCourses.map(c => ({
        ...c,
        icon: c.icon || <BookOpen size={32} />,
        students: c.students || '500+'
      }));
    }
    return MOCK_COURSES;
  }, [dbCourses]);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const snap = await getDocs(collection(db, 'practiceCourses'));
        const allDbCourses = snap.docs.map(d => ({ id: d.id, ...d.data() } as PracticeCourse));
        setDbCourses(allDbCourses.filter(c => c.isVisible !== false));
      } catch (error) {
        console.error("Chyba při načítání kurzů (pravděpodobně překročena kvóta):", error);
      }
    };
    fetchCourses();
  }, []);

  const filteredCourses = React.useMemo(() => {
    const filterTopic = selectedTopic;
    const filterDifficulty = selectedDifficulty;
    
    return displayCourses.filter(course => {
      const topicMatch = filterTopic === 'all' || course.topic === filterTopic;
      const difficultyMatch = filterDifficulty === 'all' || course.difficulty === filterDifficulty;
      const searchMatch = searchQuery === '' || 
        course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      return topicMatch && difficultyMatch && searchMatch;
    });
  }, [displayCourses, selectedTopic, selectedDifficulty, searchQuery]);

  const handleStartCourse = async (course: any) => {
    if (!user || !course) {
      toast.error('Pro spuštění procvičování se musíš přihlásit.');
      if (!user) navigate('/login');
      return;
    }

    setStartingCourse(course.id);
    try {
      const assignedId = await startPracticeCourse(
        user.uid, 
        profile?.name || 'Student', 
        course.topic, 
        course.title, 
        course.description,
        course.id,
        course.topics,
        course.questionCount
      );
      toast.success('Procvičování bylo úspěšně spuštěno!');
      navigate(`/test/${assignedId}`);
    } catch (error: any) {
      toast.error(error.message || 'Chyba při spouštění procvičování.');
    } finally {
      setStartingCourse(null);
    }
  };

  const handleOpenProfile = async (course: any) => {
    setSelectedCourse(course);
    setIsLoadingPreview(true);
    setPreviewQuestion(null);
    
    try {
      // Prioritně hledat podle courseId
      let q = query(
        collection(db, 'questions'),
        where('courseId', '==', course.id),
        limit(1)
      );
      let snap = await getDocs(q);
      
      // Fallback na téma pokud podle ID nic není
      if (snap.empty) {
        q = query(
          collection(db, 'questions'),
          where('topic', '==', course.topic),
          limit(1)
        );
        snap = await getDocs(q);
      }

      if (!snap.empty) {
        setPreviewQuestion({ id: snap.docs[0].id, ...snap.docs[0].data() } as Question);
      } else if (course.topic === 'Geometrie' || (course.topics && course.topics.includes('Geometrie'))) {
        const { GEOMETRY_QUESTIONS } = await import('../services/courseService');
        setPreviewQuestion(GEOMETRY_QUESTIONS[0]);
      }
    } catch (error) {
      console.error("Failed to fetch preview question", error);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleAddToTodo = async (course: any) => {
    if (!user || !course) {
      toast.error('Pro přidání do TODO se musíš přihlásit.');
      return;
    }

    setIsAddingToTodo(true);
    try {
      const todoData: any = {
        studentId: user.uid,
        title: course.title,
        type: 'practice',
        referenceId: course.id,
        completed: false,
        addedBy: user.uid,
        createdAt: Timestamp.now(),
      };

      await addDoc(collection(db, 'todos'), todoData);
      toast.success('Úkol byl přidán do tvého TODO listu!');
      setSelectedCourse(null);
    } catch (error) {
      console.error("Todo error:", error);
      toast.error('Chyba při přidávání do TODO.');
    } finally {
      setIsAddingToTodo(false);
    }
  };

  return (
    <div className="page-container">
      <section className="text-center space-y-6 max-w-3xl mx-auto">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl md:text-6xl font-display font-bold text-gray-900"
        >
          Naše <span className="text-brand-blue">procvičování</span>
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-xl text-gray-500 leading-relaxed"
        >
          Vyber si téma, které chceš procvičit. 
          Všechny úlohy jsou navrženy tak, aby ti pomohly k lepším výsledkům.
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
                <SelectValue placeholder="Všechny předměty" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Všechny předměty</SelectItem>
                {MATH_TOPICS.map(topic => (
                  <SelectItem key={topic} value={topic}>{topic}</SelectItem>
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
                <SelectItem value="Začátečník">Začátečník</SelectItem>
                <SelectItem value="Středně pokročilý">Středně pokročilý</SelectItem>
                <SelectItem value="Pokročilý">Pokročilý</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </motion.div>
      </section>

      <div className="grid md:grid-cols-3 gap-8">
        {filteredCourses.map((course, i) => {
          const colorClass = getTopicColor(course.color);
          const isLocked = !user && i > 0;
          
          return (
            <motion.div
              key={course.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 + 0.3 }}
              className="relative"
            >
              <Card 
                className={`h-full flex flex-col group transition-all border-none overflow-hidden rounded-[2.5rem] bg-white relative
                  ${isLocked ? 'grayscale opacity-70 cursor-not-allowed' : 'hover:shadow-2xl hover:shadow-blue-100'}`}
              >
                <div className={`h-2 w-full ${colorClass}`} style={course.color?.startsWith('#') ? { backgroundColor: course.color } : {}} />
                
                {isLocked && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/40 backdrop-blur-[2px] p-6 text-center">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center text-gray-400 mb-4">
                      <Lock size={32} />
                    </div>
                    <p className="font-display font-black text-gray-900 text-lg leading-tight mb-2">Tento kurz je <br/>uzamčen</p>
                    <Button 
                      variant="link" 
                      onClick={() => navigate('/login')}
                      className="text-brand-orange font-bold p-0 h-auto underline decoration-2 underline-offset-4"
                    >
                      Přihlas se pro odemčení
                    </Button>
                  </div>
                )}

                <CardHeader className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div 
                      className={`w-16 h-16 ${colorClass} rounded-2xl flex items-center justify-center ${!isLocked && 'group-hover:scale-110'} transition-transform`}
                      style={course.color?.startsWith('#') ? { backgroundColor: course.color } : {}}
                    >
                      {course.icon}
                    </div>
                    <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold uppercase">
                      {course.difficulty}
                    </span>
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
                      <Users size={16} /> {course.students}
                    </div>
                  </div>
                  <div className="pt-6 mt-auto">
                    <Button 
                      onClick={() => !isLocked && handleOpenProfile(course)}
                      disabled={isLocked}
                      className={`w-full rounded-xl h-12 gap-2 text-lg font-bold ${isLocked ? 'bg-gray-100 text-gray-400' : 'btn-blue'}`}
                    >
                      {isLocked ? 'Zamčeno' : <>Detail procvičování <ArrowRight size={20} /></>}
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
          <p className="text-blue-100 text-xl max-w-xl mx-auto">Napiš nám a mi ti rádi poradíme, které téma je pro tebe to pravé.</p>
          <div className="pt-4">
            <Link to="/contact" className="inline-flex items-center justify-center bg-white text-brand-blue px-10 h-14 rounded-2xl text-xl font-bold hover:scale-105 transition-transform shadow-xl">
              Kontaktuj nás
            </Link>
          </div>
        </div>
      </section>

      {/* Course Profile Dialog */}
      <Dialog open={!!selectedCourse} onOpenChange={(open) => !open && setSelectedCourse(null)}>
        <DialogContent className="max-w-2xl rounded-[3rem] p-0 overflow-hidden border-none shadow-3xl bg-white">
          {selectedCourse && (
            <>
              <div className="relative h-48 bg-brand-blue flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-brand-blue to-blue-700 opacity-90" />
                <div className="absolute top-0 right-0 p-10 opacity-10">
                  <BookOpen size={160} />
                </div>
                <div className="relative z-10 text-center text-white space-y-2">
                  <Badge className="bg-white/20 hover:bg-white/30 border-none text-white px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest">
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
                    <Users className="mx-auto mb-2 text-brand-purple" size={20} />
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Studenti</div>
                    <div className="font-black text-gray-900">{selectedCourse.students}</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-2xl">
                    <Star className="mx-auto mb-2 text-brand-orange" size={20} />
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-tighter">Hodnocení</div>
                    <div className="font-black text-gray-900">{selectedCourse.rating || 5.0} / 5</div>
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
                    <Sparkles size={20} className="text-brand-orange animate-pulse" />
                  </div>

                  {isLoadingPreview ? (
                    <div className="h-40 bg-gray-50 rounded-3xl flex items-center justify-center border-2 border-dashed border-gray-200">
                      <Loader2 className="animate-spin text-brand-blue" size={32} />
                    </div>
                  ) : previewQuestion ? (
                    <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100 relative group overflow-hidden">
                      <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-10 transition-opacity">
                        <Target size={60} />
                      </div>
                      <div className="text-xs font-black text-brand-blue mb-2 uppercase tracking-widest bg-blue-50 w-fit px-3 py-1 rounded-lg">Otázka 1</div>
                      <p className="text-lg font-bold text-gray-800 leading-snug">{previewQuestion.question}</p>
                      <div className="grid grid-cols-2 gap-2 mt-4">
                        {previewQuestion.options.slice(0, 2).map((opt: string, i: number) => (
                          <div key={i} className="bg-white/80 p-3 rounded-xl text-sm font-bold text-gray-400 border border-white">
                            {opt}
                          </div>
                        ))}
                        <div className="col-span-2 text-center text-[10px] text-gray-300 font-bold uppercase tracking-widest pt-2">
                          + další {previewQuestion.options.length - 2} možnosti
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 bg-orange-50 rounded-3xl text-orange-600 text-center font-bold">
                      Pro tento kurz zatím nemáme náhledovou otázku.
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="p-10 pt-0 gap-4 sm:justify-center flex-col sm:flex-row">
                {!user ? (
                  <div className="w-full space-y-4 text-center">
                    <p className="text-gray-500 font-bold">Líbí se vám tato úloha? Přihlaste se a začněte procvičovat!</p>
                    <Button 
                      onClick={() => navigate('/login')}
                      className="h-16 w-full px-10 rounded-2xl bg-brand-orange hover:bg-brand-orange/90 text-white font-black shadow-xl shadow-orange-100 gap-2 text-lg active:scale-95 transition-all"
                    >
                      <Users size={20} /> Přihlásit se a začít
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button 
                      variant="outline"
                      disabled={isAddingToTodo}
                      onClick={() => handleAddToTodo(selectedCourse)}
                      className="h-16 px-10 rounded-2xl border-2 border-gray-100 hover:border-brand-blue hover:text-brand-blue font-black flex-1 gap-2 text-lg transition-all"
                    >
                      {isAddingToTodo ? <Loader2 className="animate-spin" size={20} /> : <><Clock size={20} /> Dát do TODO</>}
                    </Button>
                    <Button 
                      onClick={() => handleStartCourse(selectedCourse)}
                      disabled={startingCourse === selectedCourse.id}
                      className="h-16 px-10 rounded-2xl bg-brand-blue hover:bg-brand-blue/90 text-white font-black flex-1 shadow-xl shadow-blue-100 gap-2 text-lg active:scale-95 transition-all"
                    >
                      {startingCourse === selectedCourse.id ? (
                        <Loader2 className="animate-spin" size={20} />
                      ) : (
                        <>Spustit hned <ArrowRight size={20} /></>
                      )}
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
