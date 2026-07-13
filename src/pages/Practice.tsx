import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { addDoc, collection, Timestamp, onSnapshot, query, where } from 'firebase/firestore';
import { 
  ArrowRight, BookOpen, FileText, GraduationCap, Loader2, Lock, Sparkles, Star, Users, 
  Search, Filter, Clock, Calculator, Equal, Percent, Compass, PenTool, Lightbulb,
  SpellCheck, AlignLeft, BookMarked, Languages, Headphones, MessageSquare, HelpCircle,
  Binary, CheckCircle2, Play, Globe, Award, Zap, ChevronRight, BarChart3
} from 'lucide-react';
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

const SUBJECT_CONFIGS = [
  {
    id: 'Matematika',
    title: 'Matematika',
    gradient: 'from-blue-600 via-cyan-500 to-emerald-500',
    themeColor: 'blue-green',
    bgGrad: 'from-blue-50/50 via-cyan-50/20 to-emerald-50/30',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    hoverShadow: 'hover:shadow-emerald-200/50',
    buttonBg: 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-100',
    description: 'Procvič si počítání, rovnice, slovní úlohy i geometrii. Připrav se na testy CERMAT s jistotou.',
    icon: <Calculator className="w-8 h-8 text-emerald-600" />,
    topics: [
      { name: 'Počítání a čísla', description: 'Základní operace, zlomky, mocniny, prvočísla, dělitelnost.', icon: <Binary className="w-5 h-5" /> },
      { name: 'Rovnice a výrazy', description: 'Lineární rovnice, zjednodušování a úpravy algebraických výrazů.', icon: <Equal className="w-5 h-5" /> },
      { name: 'Procenta poměry a data', description: 'Procenta, trojčlenka, měřítko mapy, průměry a diagramy.', icon: <Percent className="w-5 h-5" /> },
      { name: 'Geometrie', description: 'Výpočty obsahů, obvodů a objemů rovinných i prostorových útvarů.', icon: <Compass className="w-5 h-5" /> },
      { name: 'Rýsování', description: 'Thaletova věta, konstrukce trojúhelníků, osy úhlů a stran.', icon: <PenTool className="w-5 h-5" /> },
      { name: 'Slovní úlohy', description: 'Úlohy o pohybu, společné práci, směsích a financích.', icon: <HelpCircle className="w-5 h-5" /> },
      { name: 'Logické chytáky', description: 'Kombinatorické úlohy, číselné řady a logické úsudky.', icon: <Lightbulb className="w-5 h-5" /> }
    ]
  },
  {
    id: 'Čeština',
    title: 'Čeština',
    gradient: 'from-pink-500 via-rose-400 to-amber-400',
    themeColor: 'pink-yellow',
    bgGrad: 'from-pink-50/40 via-rose-50/20 to-amber-50/30',
    badgeBg: 'bg-rose-50 text-rose-700 border-rose-100',
    hoverShadow: 'hover:shadow-pink-200/50',
    buttonBg: 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-100',
    description: 'Pravopisné chytáky, rozbor vět a literární přehled. Vše pro hladký průběh přijímaček z českého jazyka.',
    icon: <BookOpen className="w-8 h-8 text-rose-600" />,
    topics: [
      { name: 'Pravopis a chytáky', description: 'Psaní i/y, s/z, shoda přísudku s podmětem, velká písmena.', icon: <SpellCheck className="w-5 h-5" /> },
      { name: 'Gramatika (stavba slov, vět)', description: 'Určování větných členů, slovních druhů, rozbory slov a souvětí.', icon: <AlignLeft className="w-5 h-5" /> },
      { name: 'Spisovnost a významy slov', description: 'Homonyma, synonyma, antonyma, frazeologie a archaismy.', icon: <Languages className="w-5 h-5" /> },
      { name: 'Práce s textem a sloh', description: 'Čtenářská gramotnost, porozumění textu, slohové útvary a styly.', icon: <FileText className="w-5 h-5" /> },
      { name: 'Literatura a poezie', description: 'Literární teorie, čeští a světoví autoři, typy rýmů a poezie.', icon: <BookMarked className="w-5 h-5" /> }
    ]
  },
  {
    id: 'Angličtina',
    title: 'Angličtina',
    gradient: 'from-blue-500 via-indigo-500 to-pink-500',
    themeColor: 'blue-pink',
    bgGrad: 'from-blue-50/30 via-indigo-50/20 to-pink-50/30',
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    hoverShadow: 'hover:shadow-indigo-200/50',
    buttonBg: 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-100',
    description: 'Zlepši si gramatiku, časy, slovní zásobu i poslech. Dosáhni úrovně A2/B1 s přehledem.',
    icon: <Globe className="w-8 h-8 text-indigo-600" />,
    topics: [
      { name: 'Poslech a porozumění', description: 'Porozumění mluvenému i psanému projevu v reálných situacích.', icon: <Headphones className="w-5 h-5" /> },
      { name: 'Slovní zásoba', description: 'Tematické okruhy slovíček, synonyma, antonyma a běžná synonyma.', icon: <BookMarked className="w-5 h-5" /> },
      { name: 'Časy a pomocná slovesa', description: 'Přítomný, minulý a předpřítomný čas, modální slovesa (can, must).', icon: <Clock className="w-5 h-5" /> },
      { name: 'Předložky', description: 'Předložky místa, času a vazby s přídavnými jmény (good at, interested in).', icon: <Compass className="w-5 h-5" /> },
      { name: 'Ustálené vazby', description: 'Frázová slovesa, kolokace a idiomy pro přirozenou mluvu.', icon: <MessageSquare className="w-5 h-5" /> },
      { name: 'Stavba věty', description: 'Slovosled, podmínkové věty (1. a 2. kondicionál), vztažné věty.', icon: <AlignLeft className="w-5 h-5" /> }
    ]
  }
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
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<'practice' | 'analysis'>('practice');
  const [activeSubject, setActiveSubject] = useState<'Matematika' | 'Čeština' | 'Angličtina'>('Matematika');
  const [selectedTime, setSelectedTime] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('');
  
  // Dynamic statistics state
  const [statsLoading, setStatsLoading] = useState(false);
  const [userStats, setUserStats] = useState<{
    totalTests: number;
    totalQuestions: number;
    avgPercentage: number;
    topicPerformance: Record<string, { correct: number; total: number }>;
  }>({
    totalTests: 0,
    totalQuestions: 0,
    avgPercentage: 0,
    topicPerformance: {}
  });

  // Load predefined practice courses
  const [courses, setCourses] = useState<PracticeCourse[]>([]);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'practiceCourses'), (snapshot) => {
      const loadedCourses = snapshot.docs
        .map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() } as PracticeCourse))
        .filter((course) => course.isVisible !== false);
      setCourses(loadedCourses);
    }, (error) => {
      console.error(error);
      setCourses([]);
    });

    return () => unsub();
  }, []);

  // Fetch student performance for the Analysis Tab
  useEffect(() => {
    if (!user) return;
    
    setStatsLoading(true);
    const q = query(
      collection(db, 'assignedTests'),
      where('studentId', '==', user.uid),
      where('status', '==', 'graded')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      let totalTests = 0;
      let totalQuestions = 0;
      let totalPercentageSum = 0;
      const topicPerformance: Record<string, { correct: number; total: number }> = {};

      snapshot.docs.forEach((docSnapshot) => {
        const data = docSnapshot.data();
        totalTests += 1;

        if (data.topicPerformance) {
          Object.entries(data.topicPerformance).forEach(([topic, stats]: [string, any]) => {
            if (!topicPerformance[topic]) {
              topicPerformance[topic] = { correct: 0, total: 0 };
            }
            topicPerformance[topic].correct += stats.correct || 0;
            topicPerformance[topic].total += stats.total || 0;
          });
        }

        let correct = 0;
        let total = 0;
        if (data.topicPerformance) {
          Object.values(data.topicPerformance).forEach((stats: any) => {
            correct += stats.correct || 0;
            total += stats.total || 0;
          });
        }
        
        if (total > 0) {
          totalQuestions += total;
          totalPercentageSum += (correct / total) * 100;
        }
      });

      setUserStats({
        totalTests,
        totalQuestions,
        avgPercentage: totalTests > 0 ? Math.round(totalPercentageSum / totalTests) : 0,
        topicPerformance
      });
      setStatsLoading(false);
    }, (error) => {
      console.error("Error loading user statistics:", error);
      setStatsLoading(false);
    });

    return () => unsub();
  }, [user]);

  const currentSubjectConfig = useMemo(() => {
    return SUBJECT_CONFIGS.find(s => s.id === activeSubject)!;
  }, [activeSubject]);

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const courseSub = course.subject || 'Matematika';
      const isMath = activeSubject === 'Matematika' && (courseSub === 'Matematika' || !course.subject);
      const isCzech = activeSubject === 'Čeština' && (courseSub === 'Čeština' || courseSub === 'Český jazyk');
      const isEnglish = activeSubject === 'Angličtina' && (courseSub === 'Angličtina' || courseSub === 'Anglický jazyk');
      
      const matchesSubject = isMath || isCzech || isEnglish;
      
      let matchesTime = true;
      if (selectedTime !== 'all') {
        const qCount = course.questionCount || 0;
        if (selectedTime === '~5 min') matchesTime = qCount <= 10;
        else if (selectedTime === '~10 min') matchesTime = qCount > 10 && qCount <= 15;
        else if (selectedTime === '~15 min') matchesTime = qCount > 15 && qCount <= 20;
        else if (selectedTime === '20+ min') matchesTime = qCount > 20;
      }

      const normalizedSearch = appliedSearchQuery.trim().toLowerCase();
      const matchesSearch =
        normalizedSearch === '' ||
        course.title.toLowerCase().includes(normalizedSearch) ||
        course.description.toLowerCase().includes(normalizedSearch);

      return matchesSubject && matchesTime && matchesSearch;
    });
  }, [courses, activeSubject, selectedTime, appliedSearchQuery]);

  // Custom Topic Practice Dialog State
  const [customPracticeTopic, setCustomPracticeTopic] = useState<{name: string, subject: string} | null>(null);
  const [customQuestionCount, setCustomQuestionCount] = useState<number>(10);
  const [customDifficulty, setCustomDifficulty] = useState<string>('Střední');
  const [startingCustom, setStartingCustom] = useState<boolean>(false);

  // Predefined Course Dialog State
  const [selectedCourse, setSelectedCourse] = useState<PracticeCourse | null>(null);
  const [previewQuestion, setPreviewQuestion] = useState<PublicQuestion | null>(null);
  const [startingCourseId, setStartingCourseId] = useState<string | null>(null);
  const [addingTodoCourseId, setAddingTodoCourseId] = useState<string | null>(null);

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

  const handleStartCustomPractice = async () => {
    if (!user || !customPracticeTopic) {
      toast.error('Pro spuštění procvičování se musíš přihlásit.');
      navigate('/login');
      return;
    }

    setStartingCustom(true);

    try {
      const assignedId = await startPracticeCourse(
        user.uid,
        profile?.name || 'Student',
        customPracticeTopic.name,
        `Procvičování: ${customPracticeTopic.name}`,
        `Generované procvičování na téma ${customPracticeTopic.name} (${customDifficulty.toLowerCase()} obtížnost).`,
        undefined,
        [customPracticeTopic.name],
        customQuestionCount
      );

      toast.success('Generované procvičování bylo spuštěno.');
      setCustomPracticeTopic(null);
      navigate(`/test/${assignedId}`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Chyba při spouštění generovaného testu.');
    } finally {
      setStartingCustom(false);
    }
  };

  const handleStartCustomPracticeFromRecommended = (topicName: string) => {
    // Find which subject config contains this topic
    const config = SUBJECT_CONFIGS.find(sub => sub.topics.some(t => t.name === topicName));
    if (config) {
      setCustomPracticeTopic({
        name: topicName,
        subject: config.id
      });
    } else {
      setCustomPracticeTopic({
        name: topicName,
        subject: 'Matematika' // default fallback
      });
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
    <div className="page-container max-w-7xl mx-auto space-y-10">
      {/* Page Header */}
      <section className="text-center space-y-4 max-w-3xl mx-auto">
        <motion.h1 
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold text-[#1E1B18] tracking-tight"
        >
          Procvičování témat
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 0.1 }} 
          className="text-lg text-gray-500 leading-relaxed"
        >
          Přizpůsob si trénink podle svých potřeb. Vyber si předmět, sleduj svoji úspěšnost a zaměř se na doporučená témata ke zlepšení.
        </motion.p>
      </section>

      {/* Primary Tab Switcher */}
      <div className="flex justify-center">
        <div className="bg-gray-100/80 p-1.5 rounded-2xl flex gap-1 shadow-inner border border-gray-200/50">
          <button
            onClick={() => setActiveTab('practice')}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
              activeTab === 'practice'
                ? 'bg-white text-[#1E1B18] shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <GraduationCap className="w-4.5 h-4.5" />
            Témata k procvičování
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
              activeTab === 'analysis'
                ? 'bg-white text-[#1E1B18] shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <Sparkles className="w-4.5 h-4.5 text-pink-500" />
            Analýza výsledků
            {profile?.focusAreas && profile.focusAreas.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-pink-500 animate-ping" />
            )}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'practice' ? (
          <motion.div
            key="practice-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-10"
          >
            {/* Subject Hero Cards Selector */}
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {SUBJECT_CONFIGS.map((sub) => {
                const isActive = activeSubject === sub.id;
                return (
                  <motion.div
                    key={sub.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setActiveSubject(sub.id as any)}
                    className={`cursor-pointer rounded-[2rem] p-8 border transition-all relative overflow-hidden flex flex-col justify-between min-h-[15rem] h-auto ${
                      isActive 
                        ? `border-transparent bg-gradient-to-br ${sub.gradient} text-white shadow-xl shadow-indigo-100` 
                        : 'bg-white border-gray-100 hover:border-gray-200 shadow-lg'
                    }`}
                  >
                    <div className={`absolute top-0 right-0 w-32 h-32 rounded-full -mr-16 -mt-16 blur-2xl opacity-20 ${isActive ? 'bg-white' : 'bg-gray-400'}`} />
                    
                    <div className="space-y-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-md ${isActive ? 'bg-white/20' : 'bg-gray-50'}`}>
                        {sub.icon}
                      </div>
                      <div>
                        <h3 className={`text-2xl font-display font-extrabold ${isActive ? 'text-white' : 'text-[#1E1B18]'}`}>{sub.title}</h3>
                        <p className={`text-xs mt-1 leading-snug ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                          {sub.description}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-4 mt-auto">
                      <span className={`text-[10px] font-black uppercase tracking-widest ${isActive ? 'text-white/90' : 'text-gray-400'}`}>
                        {sub.topics.length} témat k procvičení
                      </span>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isActive ? 'bg-white text-indigo-600' : 'bg-gray-50 text-gray-400'}`}>
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </section>

            {/* List-Based Topics Selection */}
            <section className="bg-[#FAF7F0]/30 rounded-[3rem] p-6 md:p-10 border border-[#E6E0D4] relative overflow-hidden">
              <div className={`absolute inset-0 bg-gradient-to-br ${currentSubjectConfig.bgGrad} opacity-30 transition-all duration-500`} />
              
              <div className="relative z-10 space-y-6">
                <div>
                  <h2 className="text-2xl font-display font-extrabold text-[#1E1B18]">
                    Okamžité procvičování: {activeSubject}
                  </h2>
                  <p className="text-sm text-gray-400 mt-0.5">Vyber si libovolné téma z předmětu {activeSubject}. Každý test se vygeneruje bezpečně na míru tvé zvolené obtížnosti.</p>
                </div>

                <div className="space-y-4">
                  {currentSubjectConfig.topics.map((topic, index) => {
                    const stats = userStats.topicPerformance[topic.name];
                    const hasStats = stats && stats.total > 0;
                    const percentage = hasStats ? Math.round((stats.correct / stats.total) * 100) : 0;
                    
                    return (
                      <motion.div
                        key={topic.name}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.04 }}
                        className="bg-white rounded-2xl p-5 md:p-6 border border-gray-100 hover:border-gray-200/80 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${currentSubjectConfig.badgeBg}`}>
                            {topic.icon}
                          </div>
                          <div className="space-y-0.5">
                            <h4 className="text-base font-bold text-[#1E1B18]">{topic.name}</h4>
                            <p className="text-xs text-gray-400 leading-normal">{topic.description}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 flex-shrink-0 justify-between md:justify-end">
                          {hasStats && (
                            <div className="text-right hidden sm:block">
                              <span className="text-[10px] font-bold text-gray-400 block uppercase tracking-wider">Úspěšnost</span>
                              <span className={`text-xs font-black ${
                                percentage >= 80 ? 'text-emerald-500' : percentage >= 50 ? 'text-amber-500' : 'text-rose-500'
                              }`}>{percentage}% ({stats.correct}/{stats.total})</span>
                            </div>
                          )}

                          <Button 
                            onClick={() => setCustomPracticeTopic({name: topic.name, subject: activeSubject})}
                            className={`rounded-xl h-10 px-5 text-xs font-black flex items-center gap-1.5 transition-transform hover:scale-[1.02] ${currentSubjectConfig.buttonBg}`}
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            Procvičit
                          </Button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Predefined Prep Courses Section */}
            <section className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-2xl font-display font-extrabold text-[#1E1B18] flex items-center gap-2">
                    <BookOpen className="w-6 h-6 text-brand-blue" />
                    Přípravné kurzy od učitelů
                  </h2>
                  <p className="text-sm text-gray-400">Kompletní sady testů sestavené učiteli pro celkový přehled o učivu.</p>
                </div>

                {/* Quick Filters */}
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="w-36">
                    <Select value={selectedTime} onValueChange={setSelectedTime}>
                      <SelectTrigger className="h-10 rounded-xl bg-white border-gray-200 font-bold text-gray-700 px-3 text-xs">
                        <div className="flex items-center gap-1.5">
                          <Clock size={14} className="text-gray-400" />
                          <SelectValue placeholder="Délka" />
                        </div>
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="all" className="font-bold text-xs">Všechny časy</SelectItem>
                        <SelectItem value="~5 min" className="font-bold text-xs">~5 min (do 10 ot.)</SelectItem>
                        <SelectItem value="~10 min" className="font-bold text-xs">~10 min (11-15 ot.)</SelectItem>
                        <SelectItem value="~15 min" className="font-bold text-xs">~15 min (16-20 ot.)</SelectItem>
                        <SelectItem value="20+ min" className="font-bold text-xs">20+ min</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="relative flex items-center">
                    <Search className="absolute left-3 text-gray-400" size={16} />
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && setAppliedSearchQuery(searchQuery)}
                      placeholder="Hledat kurz..."
                      className="h-10 pl-9 pr-3 rounded-xl border border-gray-200 bg-white font-bold placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all text-xs w-40 md:w-52"
                    />
                  </div>
                  
                  <Button 
                    onClick={() => setAppliedSearchQuery(searchQuery)} 
                    className="h-10 px-5 rounded-xl bg-[#1E1B18] hover:bg-[#1E1B18]/90 text-white font-bold text-xs transition-transform"
                  >
                    Hledat
                  </Button>
                </div>
              </div>

              {/* Courses Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredCourses.map((course, index) => {
                  const isLocked = !user && index > 0;
                  const topStripeStyle = course.color?.startsWith('#') ? { backgroundColor: course.color } : undefined;
                  const courseColorClass = activeSubject === 'Matematika' 
                    ? 'bg-emerald-500 shadow-emerald-100/50' 
                    : activeSubject === 'Čeština' 
                      ? 'bg-rose-500 shadow-rose-100/50' 
                      : 'bg-indigo-500 shadow-indigo-100/50';

                  return (
                    <motion.div 
                      key={course.id} 
                      initial={{ opacity: 0, y: 15 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      transition={{ delay: 0.05 * index }} 
                      className="relative"
                    >
                      <Card className={`h-full flex flex-col group transition-all border border-gray-100 overflow-hidden rounded-[2rem] bg-white relative ${isLocked ? 'grayscale opacity-75 cursor-not-allowed' : `hover:shadow-xl ${currentSubjectConfig.hoverShadow}`}`}>
                        <div className={`h-1.5 w-full ${course.color?.startsWith('#') ? '' : courseColorClass}`} style={topStripeStyle} />

                        {isLocked && (
                          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[2px] p-6 text-center rounded-[2rem]">
                            <div className="w-12 h-12 bg-white rounded-2xl shadow-xl flex items-center justify-center text-gray-400 mb-2 border border-gray-100">
                              <Lock size={20} />
                            </div>
                            <p className="font-display font-black text-gray-900 text-sm leading-tight mb-1">Kurz je dostupný po přihlášení</p>
                            <Button variant="link" onClick={() => navigate('/login')} className="text-indigo-600 font-bold p-0 h-auto text-xs underline decoration-2 underline-offset-4">
                              Přihlásit se
                            </Button>
                          </div>
                        )}

                        <CardHeader className="space-y-2 p-6 pb-4">
                          <div className="flex justify-between items-start">
                            <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md border ${currentSubjectConfig.badgeBg}`}>
                              {course.subject || activeSubject}
                            </span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{course.difficulty}</span>
                          </div>
                          <CardTitle className="text-lg font-display font-bold text-[#1E1B18] line-clamp-1">{course.title}</CardTitle>
                          <CardDescription className="text-gray-400 text-xs line-clamp-2">{course.description}</CardDescription>
                        </CardHeader>

                        <CardContent className="p-6 pt-0 space-y-3 mt-auto">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1 text-[10px] text-gray-500 font-bold bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
                              <BookOpen size={12} className="text-indigo-500" /> {course.questionCount} otázek
                            </div>
                            {course.rating && (
                              <div className="flex items-center gap-0.5 text-amber-500 text-[10px] font-bold">
                                <Star size={12} fill="currentColor" />
                                <span>{course.rating} / 5</span>
                              </div>
                            )}
                          </div>

                          <div className="pt-1">
                            <Button 
                              onClick={() => !isLocked && openCourseDetail(course)} 
                              disabled={isLocked || startingCourseId === course.id} 
                              className="w-full rounded-xl h-10 text-xs font-black bg-[#FAF7F0] text-[#1E1B18] hover:bg-gray-100 hover:scale-[1.01] border border-gray-200"
                            >
                              Zobrazit detail
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}

                {filteredCourses.length === 0 && (
                  <div className="col-span-full text-center py-12 bg-[#FAF7F0]/40 rounded-[2rem] border border-dashed border-gray-200">
                    <BookOpen size={36} className="mx-auto text-gray-300 mb-2" />
                    <p className="text-gray-400 font-bold text-sm">Nenalezeny žádné přípravné kurzy.</p>
                  </div>
                )}
              </div>
            </section>
          </motion.div>
        ) : (
          /* Results Analysis Dashboard Tab */
          <motion.div
            key="analysis-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-8"
          >
            {!user ? (
              <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-12 text-center max-w-2xl mx-auto space-y-6">
                <div className="w-16 h-16 mx-auto rounded-3xl bg-pink-50 text-pink-500 flex items-center justify-center">
                  <Lock className="w-8 h-8" />
                </div>
                <div className="space-y-2">
                  <CardTitle className="text-3xl font-display font-black">Analýza výsledků</CardTitle>
                  <CardDescription className="text-gray-500 text-base">
                    Pro zobrazení podrobné statistiky úspěšnosti v jednotlivých tématech a získání AI doporučení se musíš přihlásit.
                  </CardDescription>
                </div>
                <div className="pt-4">
                  <Button onClick={() => navigate('/login')} className="h-12 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-lg shadow-indigo-100">
                    Přihlásit se k účtu
                  </Button>
                </div>
              </Card>
            ) : statsLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="animate-spin text-indigo-600 w-10 h-10" />
                <p className="text-gray-400 font-bold text-sm">Načítání výsledků...</p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Metric Cards Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="rounded-3xl border border-gray-100 shadow-lg bg-white p-6 flex items-center gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Dokončené testy</span>
                      <span className="text-3xl font-display font-black text-[#1E1B18]">{userStats.totalTests}</span>
                    </div>
                  </Card>
                  
                  <Card className="rounded-3xl border border-gray-100 shadow-lg bg-white p-6 flex items-center gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                      <HelpCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Vyřešené otázky</span>
                      <span className="text-3xl font-display font-black text-[#1E1B18]">{userStats.totalQuestions}</span>
                    </div>
                  </Card>

                  <Card className="rounded-3xl border border-gray-100 shadow-lg bg-white p-6 flex items-center gap-5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                      userStats.avgPercentage >= 80 ? 'bg-emerald-50 text-emerald-600' : userStats.avgPercentage >= 50 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'
                    }`}>
                      <Award className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Průměrná úspěšnost</span>
                      <span className="text-3xl font-display font-black text-[#1E1B18]">{userStats.avgPercentage}%</span>
                    </div>
                  </Card>
                </div>

                {/* AI recommendations panel */}
                <Card className="rounded-[2.5rem] border border-pink-100 shadow-xl bg-gradient-to-br from-white via-pink-50/10 to-rose-50/20 p-8 md:p-10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-pink-100/30 rounded-full -mr-24 -mt-24 blur-2xl" />
                  <div className="relative z-10 space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-pink-50 text-pink-500 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-xl font-display font-black text-[#1E1B18]">Doporučení od AI trenéra</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Oblasti, které ti dělaly největší potíže a na které by ses měl/a zaměřit.</p>
                      </div>
                    </div>

                    {profile?.focusAreas && profile.focusAreas.length > 0 ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-3">
                          {profile.focusAreas.map((area) => (
                            <button
                              key={area}
                              onClick={() => handleStartCustomPracticeFromRecommended(area)}
                              className="px-5 py-3 rounded-2xl bg-white border border-pink-100 hover:border-pink-300 font-extrabold text-sm text-[#1E1B18] hover:text-pink-600 shadow-sm flex items-center gap-2 hover:scale-[1.02] transition-all group"
                            >
                              <Zap className="w-4 h-4 text-pink-500 fill-current group-hover:scale-110 transition-transform" />
                              <span>{area}</span>
                              <ChevronRight className="w-4 h-4 text-gray-300 ml-1 group-hover:text-pink-500 transition-colors" />
                            </button>
                          ))}
                        </div>
                        <p className="text-[11px] text-gray-400 italic">Kliknutím na doporučené téma okamžitě nakonfiguruješ a spustíš nové procvičování.</p>
                      </div>
                    ) : (
                      <div className="p-6 bg-white/60 border border-dashed border-pink-100 rounded-2xl text-center space-y-2">
                        <p className="text-gray-500 font-bold text-sm">Zatím tu nemáš žádná doporučení.</p>
                        <p className="text-xs text-gray-400 max-w-md mx-auto">
                          Dokonči alespoň jeden test s automatickým vyhodnocením a náš systém ti na základě tvé úspěšnosti doporučí slabé oblasti.
                        </p>
                      </div>
                    )}
                  </div>
                </Card>

                {/* Subject Detailed Breakdown */}
                <div className="space-y-6">
                  <h3 className="text-2xl font-display font-extrabold text-[#1E1B18] flex items-center gap-2">
                    <BarChart3 className="w-6 h-6 text-indigo-500" />
                    Přehled témat podle úspěšnosti
                  </h3>

                  <div className="space-y-8">
                    {SUBJECT_CONFIGS.map((sub) => (
                      <Card key={sub.id} className="rounded-3xl border border-gray-100 p-6 md:p-8 bg-white shadow-md space-y-6">
                        <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${sub.badgeBg}`}>
                            {sub.icon}
                          </div>
                          <h4 className="text-xl font-display font-extrabold text-[#1E1B18]">{sub.title}</h4>
                        </div>

                        <div className="space-y-5">
                          {sub.topics.map((topic) => {
                            const stats = userStats.topicPerformance[topic.name];
                            const hasStats = stats && stats.total > 0;
                            const percentage = hasStats ? Math.round((stats.correct / stats.total) * 100) : 0;
                            
                            return (
                              <div key={topic.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-sm text-[#1E1B18]">{topic.name}</span>
                                    {hasStats ? (
                                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                                        percentage >= 80 
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                                          : percentage >= 50 
                                            ? 'bg-amber-50 text-amber-700 border-amber-100' 
                                            : 'bg-rose-50 text-rose-700 border-rose-100'
                                      }`}>
                                        {percentage >= 80 ? 'Vynikající' : percentage >= 50 ? 'Dobré' : 'Vyžaduje trénink'}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-50 text-gray-400 border border-gray-100">
                                        Netestováno
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* Progress bar */}
                                  <div className="flex items-center gap-3">
                                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                      <div 
                                        className={`h-full rounded-full transition-all duration-500 ${
                                          hasStats 
                                            ? percentage >= 80 
                                              ? 'bg-emerald-500' 
                                              : percentage >= 50 
                                                ? 'bg-amber-500' 
                                                : 'bg-rose-500'
                                            : 'bg-gray-200'
                                        }`}
                                        style={{ width: `${hasStats ? percentage : 0}%` }}
                                      />
                                    </div>
                                    {hasStats && (
                                      <span className="text-xs font-black text-gray-500 flex-shrink-0 w-16 text-right">
                                        {percentage}% ({stats.correct}/{stats.total})
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <Button
                                  onClick={() => setCustomPracticeTopic({name: topic.name, subject: sub.id})}
                                  className={`rounded-xl h-9 px-4 text-xs font-black gap-1 flex-shrink-0 ${sub.buttonBg}`}
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                  Trénovat
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Predefined Course Detail Dialog */}
      <Dialog open={!!selectedCourse} onOpenChange={(open) => !open && setSelectedCourse(null)}>
        <DialogContent className="max-w-2xl rounded-[3rem] p-0 overflow-hidden border-none shadow-3xl bg-white">
          {selectedCourse && (
            <>
              <div className={`relative h-44 flex items-center justify-center overflow-hidden bg-gradient-to-br ${currentSubjectConfig.gradient}`}>
                <div className="absolute inset-0 bg-black/10" />
                <div className="relative z-10 text-center text-white space-y-1">
                  <Badge className="bg-white/20 hover:bg-white/20 border-none text-white px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">
                    {selectedCourse.difficulty}
                  </Badge>
                  <DialogTitle className="text-3xl font-display font-black leading-tight">{selectedCourse.title}</DialogTitle>
                </div>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <BookOpen className="mx-auto mb-1.5 text-indigo-500" size={18} />
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Otázek</div>
                    <div className="font-extrabold text-sm text-gray-900">{selectedCourse.questionCount} ks</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <Users className="mx-auto mb-1.5 text-indigo-500" size={18} />
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Řešitelů</div>
                    <div className="font-extrabold text-sm text-gray-900">{selectedCourse.students || '100+'}</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <Star className="mx-auto mb-1.5 text-amber-500" size={18} />
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Hodnocení</div>
                    <div className="font-extrabold text-sm text-gray-900">{selectedCourse.rating || 5} / 5</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-display font-bold text-lg text-gray-900">O tomto kurzu</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{selectedCourse.description}</p>
                </div>

                <Separator className="bg-gray-100" />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-bold text-lg text-gray-900">Náhled první otázky</h3>
                    <Sparkles size={16} className="text-amber-500" />
                  </div>

                  {previewQuestion ? (
                    <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                      <div className="text-[10px] font-black text-indigo-600 mb-1.5 uppercase tracking-widest bg-indigo-50 w-fit px-2 py-0.5 rounded-md">Otázka 1</div>
                      <p className="text-sm font-bold text-gray-800 leading-snug">{previewQuestion.question}</p>
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        {previewQuestion.options.slice(0, 2).map((option) => (
                          <div key={option} className="bg-white p-2.5 rounded-xl text-xs font-bold text-gray-500 border border-gray-100">
                            {option}
                          </div>
                        ))}
                        {previewQuestion.options.length > 2 && (
                          <div className="col-span-2 text-center text-[9px] text-gray-400 font-bold uppercase tracking-widest pt-1">
                            + další {previewQuestion.options.length - 2} možnosti
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 bg-amber-50/50 rounded-2xl text-amber-700 text-center font-bold text-xs border border-amber-100">
                      Pro tento kurz není veřejný náhled otázky k dispozici.
                    </div>
                  )}
                </div>
              </div>

              <DialogFooter className="p-8 pt-0 gap-3 sm:justify-center flex-col sm:flex-row">
                {!user ? (
                  <div className="w-full space-y-3 text-center">
                    <p className="text-gray-400 text-xs font-bold">Chceš tento kurz vyzkoušet? Přihlas se k účtu.</p>
                    <Button onClick={() => navigate('/login')} className="h-12 w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-lg shadow-indigo-100 gap-2">
                      Přihlásit se a začít
                    </Button>
                  </div>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      disabled={addingTodoCourseId === selectedCourse.id}
                      onClick={() => handleAddToTodo(selectedCourse)}
                      className="h-12 rounded-xl border border-gray-200 hover:border-indigo-600 hover:text-indigo-600 font-bold flex-1 gap-2"
                    >
                      {addingTodoCourseId === selectedCourse.id ? <Loader2 className="animate-spin" size={16} /> : 'Přidat do TODO'}
                    </Button>
                    <Button
                      onClick={() => handleStartCourse(selectedCourse)}
                      disabled={startingCourseId === selectedCourse.id}
                      className="h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black flex-1 shadow-lg shadow-indigo-100 gap-2"
                    >
                      {startingCourseId === selectedCourse.id ? <Loader2 className="animate-spin" size={16} /> : <>Spustit hned <ArrowRight size={16} /></>}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Custom Topic Quick Start Dialog */}
      <Dialog open={!!customPracticeTopic} onOpenChange={(open) => !open && setCustomPracticeTopic(null)}>
        <DialogContent className="max-w-md rounded-[2.5rem] p-8 border-none shadow-3xl bg-white">
          {customPracticeTopic && (
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <GraduationCap className="w-7 h-7" />
                </div>
                <DialogTitle className="text-2xl font-display font-black text-gray-900 leading-tight">
                  Nastavit procvičování
                </DialogTitle>
                <p className="text-gray-400 text-sm">Téma: <span className="font-bold text-gray-700">{customPracticeTopic.name}</span></p>
              </div>

              <Separator className="bg-gray-100" />

              {/* Question Count Select */}
              <div className="space-y-3">
                <label className="text-sm font-extrabold text-gray-700 block">Počet otázek</label>
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 15, 20].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setCustomQuestionCount(num)}
                      className={`h-11 rounded-xl text-sm font-black border transition-all ${
                        customQuestionCount === num
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty Select */}
              <div className="space-y-3">
                <label className="text-sm font-extrabold text-gray-700 block">Úroveň obtížnosti</label>
                <div className="grid grid-cols-3 gap-2">
                  {['Začátečník', 'Střední', 'Pokročilý'].map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => setCustomDifficulty(diff)}
                      className={`h-11 rounded-xl text-xs font-black border transition-all ${
                        customDifficulty === diff
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-600'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>

              <DialogFooter className="pt-4 flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={() => setCustomPracticeTopic(null)}
                  className="h-12 rounded-xl font-bold flex-1 border-gray-200"
                >
                  Zrušit
                </Button>
                <Button
                  onClick={handleStartCustomPractice}
                  disabled={startingCustom}
                  className="h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black flex-1 shadow-lg shadow-indigo-100 gap-2"
                >
                  {startingCustom ? <Loader2 className="animate-spin" size={16} /> : <>Spustit test <ArrowRight size={16} /></>}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
