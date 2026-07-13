import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { safeToDate, cn } from '../lib/utils';
import { PDFViewer } from '../components/PDFViewer';
import { useAuth } from '../context/AuthContext';
import { AssignedTest, LearningSheet, TodoItem, Course } from '../types/index';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { FileText, CheckCircle, BookOpen, Clock, Trophy, ArrowRight, Sparkles, Target, Lightbulb, Settings, User as UserIcon, Loader2, Search, CheckCircle2, Circle, Trash2, ExternalLink, Plus, CheckSquare, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import TodoManager from '../components/TodoManager';
import QuickCalendar from '../components/QuickCalendar';
import { CountdownTimer } from '../components/CountdownTimer';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const MOTIVATIONAL_QUOTES = [
  { text: "Učení je jediná věc, kterou se mysl nikdy nevyčerpá, nikdy se jí nebojí a nikdy nelituje.", author: "Leonardo da Vinci" },
  { text: "Úspěch je součet malých snah opakovaných den co den.", author: "Robert Collier" },
  { text: "Kořeny vzdělání jsou hořké, ale ovoce je sladké.", author: "Aristoteles" },
  { text: "Trpělivost je hořká, ale její plody jsou sladké.", author: "Jean-Jacques Rousseau" },
  { text: "Vzdělání není plněním nádoby, ale zažehnutím ohně.", author: "Sokrates" },
  { text: "Dělej to nejlepší, co můžeš, dokud nevíš víc. Až budeš vědět víc, dělej to lépe.", author: "Maya Angelou" },
  { text: "Vaše dnešní úsilí určuje vaše zítřejší úspěchy. Každý krok se počítá.", author: "ProEdu" }
];

const GREETINGS = [
  "pojďme pracovat!",
  "hurá do učení!",
  "čas se posunout dál!",
  "jde se na to!",
  "pojďme na to šlápnout!"
];

function ProgressCircle({ percentage, color, label, subtitle, icon }: { percentage: number, color: string, label: string, subtitle: string, icon: string }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  return (
    <div className="flex flex-col items-center bg-[#FAF7F0] p-6 rounded-3xl w-full shadow-sm hover:shadow-md transition-shadow relative">
      <div className="relative w-20 h-20 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="40"
            cy="40"
            r={radius}
            className="stroke-gray-200 fill-transparent"
            strokeWidth="6"
          />
          <circle
            cx="40"
            cy="40"
            r={radius}
            className="fill-transparent transition-all duration-700 ease-out"
            strokeWidth="6"
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute text-base font-black text-gray-800">{percentage}%</span>
        <span className="absolute -top-1 -right-1 text-lg" title={label}>{icon}</span>
      </div>
      <span className="font-sans font-black text-xs text-gray-700 mt-4 tracking-wider uppercase">{label}</span>
      <span className="text-gray-400 text-xs mt-1 font-bold">{subtitle}</span>
    </div>
  );
}

export default function StudentDashboard() {
  const { user, profile, setIsProfileSettingsOpen, updateProfileData } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [assignedTests, setAssignedTests] = useState<AssignedTest[]>([]);
  const [learningSheets, setLearningSheets] = useState<LearningSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<LearningSheet | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isAddingTodo, setIsAddingTodo] = useState<string | null>(null);
  
  const [isNewTodoOpen, setIsNewTodoOpen] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState('');

  const handleToggleTodo = async (todo: TodoItem) => {
    try {
      await updateDoc(doc(db, 'todos', todo.id), {
        completed: !todo.completed,
        completedAt: !todo.completed ? Timestamp.now() : null
      });
      toast.success(todo.completed ? 'Úkol označen jako nedokončený' : 'Úkol dokončen!');
    } catch (error) {
      toast.error('Chyba při aktualizaci úkolu.');
    }
  };

  const handleDeleteTodo = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'todos', id));
      toast.success('Úkol smazán.');
    } catch (error) {
      toast.error('Chyba při mazání úkolu.');
    }
  };

  const handleCreateTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTodoTitle.trim()) return;
    try {
      await addDoc(collection(db, 'todos'), {
        studentId: user.uid,
        title: newTodoTitle.trim(),
        type: 'custom',
        completed: false,
        addedBy: user.uid,
        createdAt: Timestamp.now()
      });
      setNewTodoTitle('');
      setIsNewTodoOpen(false);
      toast.success('Úkol byl úspěšně vytvořen!');
    } catch (error) {
      toast.error('Chyba při vytváření úkolu.');
    }
  };

  const renderTodoItem = (todo: TodoItem) => {
    return (
      <div 
        key={todo.id}
        className={cn(
          "p-3 rounded-2xl flex items-center justify-between gap-3 transition-all",
          todo.completed ? "bg-gray-50 opacity-60" : "bg-white shadow-sm border border-gray-100/50"
        )}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => handleToggleTodo(todo)}
            className={cn(
              "w-6 h-6 rounded-full flex items-center justify-center shrink-0 border-2 cursor-pointer transition-all",
              todo.completed 
                ? "bg-[#B80053] border-none text-white" 
                : "border-gray-300 text-gray-300 hover:border-[#B80053] hover:text-[#B80053]"
            )}
          >
            {todo.completed ? <CheckCircle2 size={14} /> : <Circle size={14} />}
          </button>
          
          <span className={cn(
            "text-sm font-bold text-gray-800 truncate leading-tight",
            todo.completed && "line-through text-gray-400"
          )}>
            {todo.title}
          </span>
        </div>

        {todo.addedBy === profile?.uid && (
          <button
            onClick={() => handleDeleteTodo(todo.id)}
            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all shrink-0 cursor-pointer"
            title="Smazat úkol"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    );
  };

  const [sheetSearchQuery, setSheetSearchQuery] = useState('');
  const [sheetTopicFilter, setSheetTopicFilter] = useState('');
  const [sheetSubjectFilter, setSheetSubjectFilter] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);

  const allSubjects = useMemo(() => Array.from(new Set(learningSheets.map(s => s.subject))), [learningSheets]);
  const allTopics = useMemo(() => Array.from(new Set(learningSheets.map(s => s.topic))), [learningSheets]);

  const quote = useMemo(() => {
    const today = new Date().getDate();
    return MOTIVATIONAL_QUOTES[today % MOTIVATIONAL_QUOTES.length];
  }, []);

  const greeting = useMemo(() => {
    return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  }, []);

  const filteredLearningSheets = useMemo(() => {
    return learningSheets.filter(sheet => {
      const matchesSearch = sheet.title.toLowerCase().includes(sheetSearchQuery.toLowerCase());
      const matchesTopic = sheetTopicFilter && sheetTopicFilter !== 'all' ? sheet.topic === sheetTopicFilter || sheet.topic?.includes(sheetTopicFilter) : true;
      const matchesSubject = sheetSubjectFilter && sheetSubjectFilter !== 'all' ? sheet.subject === sheetSubjectFilter : true;
      return matchesSearch && matchesTopic && matchesSubject;
    });
  }, [learningSheets, sheetSearchQuery, sheetTopicFilter, sheetSubjectFilter]);

  const handleAddToTodo = async (title: string, type: TodoItem['type'] = 'practice') => {
    if (!user) return;
    setIsAddingTodo(title);
    try {
      const todoData: Omit<TodoItem, 'id'> = {
        studentId: user.uid,
        title,
        type,
        completed: false,
        addedBy: user.uid,
        createdAt: Timestamp.now(),
      };
      await addDoc(collection(db, 'todos'), todoData);
      toast.success(`Úkol "${title}" byl přidán do tvých úkolů!`);
    } catch (error) {
      console.error("Todo error:", error);
      toast.error('Chyba při přidávání úkolu.');
    } finally {
      setIsAddingTodo(null);
    }
  };

  useEffect(() => {
    if (!profile) return;

    const unsubAssigned = onSnapshot(query(collection(db, 'assignedTests'), where('studentId', '==', profile.uid)), (snap) => {
      setAssignedTests(snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignedTest)));
    });

    const unsubSheets = onSnapshot(collection(db, 'learningSheets'), (snap) => {
      setLearningSheets(snap.docs.map(d => ({ id: d.id, ...d.data() } as LearningSheet)));
    });

    const unsubTodos = onSnapshot(
      query(collection(db, 'todos'), where('studentId', '==', profile.uid)),
      (snap) => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as TodoItem));
        const sorted = items.sort((a, b) => {
          const tA = safeToDate(a.createdAt)?.getTime() || 0;
          const tB = safeToDate(b.createdAt)?.getTime() || 0;
          return tB - tA;
        });
        setTodos(sorted);
      }
    );

    const unsubCourses = onSnapshot(
      query(collection(db, 'courses'), where('studentIds', 'array-contains', profile.uid)),
      (snap) => {
        setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Course)));
      }
    );

    return () => {
      unsubAssigned();
      unsubSheets();
      unsubTodos();
      unsubCourses();
    };
  }, [profile]);

  // Handle hash scrolling on page load/change
  useEffect(() => {
    if (location.hash === '#garden') {
      const timer = setTimeout(() => {
        const el = document.getElementById('garden-card');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [location]);

  useEffect(() => {
    const currentTab = searchParams.get('tab');
    if (currentTab === 'tests' || currentTab === 'activity' || currentTab === 'history') {
      const timer = setTimeout(() => {
        const el = document.getElementById('student-tabs');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const pendingTests = assignedTests.filter(t => t.status === 'pending');
  const completedTests = assignedTests.filter(t => t.status !== 'pending');

  const activityItems = useMemo(() => {
    const items: {
      id: string;
      type: 'test' | 'material' | 'todo';
      title: string;
      date: Date;
      status?: string;
      description?: string;
    }[] = [];
    
    // Add pending/submitted/graded tests
    assignedTests.forEach(test => {
      items.push({
        id: test.id,
        type: 'test',
        title: `Přiřazen test: ${test.testTitle || 'Test'}`,
        date: safeToDate(test.assignedAt) || new Date(),
        status: test.status,
        description: test.testDescription || ''
      });
    });

    // Add teacher-assigned todos
    todos.forEach(todo => {
      if (todo.addedBy !== profile?.uid) {
        items.push({
          id: todo.id,
          type: 'todo',
          title: `Zadán úkol: ${todo.title}`,
          date: safeToDate(todo.createdAt) || new Date(),
          status: todo.completed ? 'completed' : 'pending'
        });
      }
    });

    // Add learning materials
    learningSheets.forEach(sheet => {
      items.push({
        id: sheet.id,
        type: 'material',
        title: `Nový studijní materiál: ${sheet.title}`,
        date: safeToDate(sheet.createdAt) || new Date(),
        description: `${sheet.subject} - ${sheet.topic}`
      });
    });

    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [assignedTests, todos, learningSheets, profile]);

  useEffect(() => {
    if (searchParams.get('tab') === 'activity' && profile && updateProfileData) {
      const lastViewed = profile.lastViewedActivityAt ? safeToDate(profile.lastViewedActivityAt) : new Date(0);
      const hasNewItems = activityItems.some(item => item.date > lastViewed);
      if (hasNewItems) {
        updateProfileData({ lastViewedActivityAt: Timestamp.now() });
      }
    }
  }, [searchParams, activityItems, profile, updateProfileData]);

  return (
    <div className="space-y-10 md:space-y-12">
      {/* HEADER SECTION */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-5xl font-display font-black text-[#1E1B18] tracking-tight leading-tight">
            Ahoj {profile?.name?.split(' ')[0] || 'Alexi'}, {greeting}
          </h1>
        </div>

        {/* Top Right Streak Badge */}
        <div className="bg-white px-5 py-3 rounded-full shadow-md flex items-center gap-4 border border-gray-100/50 shrink-0 self-start sm:self-center">
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-gray-400 tracking-[0.15em] leading-none">STREAK</div>
            <div className="text-lg font-black text-[#625500] leading-none mt-1">
              {profile?.streak || 0} DNÍ 🔥
            </div>
          </div>
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white bg-white shrink-0 shadow-sm">
            {profile?.photoURL ? (
              <img src={profile.photoURL} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-yellow-100 text-yellow-600 font-black">🎓</div>
            )}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* MOTIVATIONAL QUOTE CARD */}
        <Card className="rounded-[2.5rem] border-none shadow-md bg-white p-8 flex flex-col justify-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#FAF7F0] rounded-full blur-xl -mr-10 -mt-10" />
          <span className="text-4xl shrink-0">💡</span>
          <div className="space-y-1 z-10">
            <p className="font-sans italic text-lg md:text-xl text-[#1E1B18] leading-relaxed">
              "{quote.text}"
            </p>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
              — {quote.author}
            </p>
          </div>
        </Card>

        {/* Dnešní Pokrok */}
        <Card className="rounded-[2.5rem] border-none shadow-md bg-white p-8 flex flex-col justify-between">
          <div>
            <h3 className="font-sans font-black text-2xl text-[#1E1B18] mb-6">Dnešní Pokrok</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <ProgressCircle 
                percentage={75} 
                color="#F5C400" 
                label="MATEMATIKA" 
                subtitle="15 / 20 úloh" 
                icon="🧮" 
              />
              <ProgressCircle 
                percentage={40} 
                color="#B80053" 
                label="ČEŠTINA" 
                subtitle="4 / 10 kapitol" 
                icon="📖" 
              />
              <ProgressCircle 
                percentage={90} 
                color="#2B44B8" 
                label="ANGLIČTINA" 
                subtitle="Dokončeno!" 
                icon="🇬🇧" 
              />
            </div>
          </div>
        </Card>
      </div>

      {/* GARDEN CALL-TO-ACTION BANNER */}
      <motion.div 
        whileHover={{ scale: 1.01 }}
        onClick={() => navigate('/garden')}
        className="w-full bg-gradient-to-r from-[#D5F7E5] to-[#BCEECF] p-8 rounded-[2.5rem] cursor-pointer shadow-md hover:shadow-lg transition-all border border-green-200/30 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden text-green-900 group"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-2xl -mr-20 -mt-20 pointer-events-none" />
        <div className="flex items-center gap-4 z-10">
          <div className="w-14 h-14 bg-white/60 rounded-2xl flex items-center justify-center text-3xl shadow-sm shrink-0">
            🌱
          </div>
          <div>
            <h3 className="font-playful text-2xl text-[#0F5238] font-bold">Moje Zahrádka</h3>
            <p className="text-sm font-semibold text-[#19724F]">
              Potřebuješ se soustředit na učení? Spusť Focus Timer, odlož telefon a vypěstuj si další kytičku!
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0 z-10 w-full md:w-auto">
          <span className="text-xs font-black uppercase tracking-wider bg-white/80 px-4 py-2 rounded-full border border-green-200/50">
            Úroda: {profile?.gardenPlants || 0} kytiček 🌻
          </span>
          <Button className="bg-[#19724F] hover:bg-[#0F5238] text-white font-bold h-12 px-6 rounded-xl flex-1 md:flex-initial flex items-center gap-2 shadow-md">
            Začít se soustředit
            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </motion.div>

      {/* ROW 2: Kalendář & Plánovač úkolů */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Kalendář */}
        <QuickCalendar todos={todos} />

        {/* Pink-themed Todo Card */}
        <Card className="rounded-[2.5rem] border-2 border-pink-100 bg-[#FAF7F0] p-8 shadow-xl flex flex-col justify-between relative overflow-hidden min-h-[500px]">
          <div className="absolute top-0 right-0 w-32 h-32 bg-pink-100/50 rounded-full blur-2xl -mr-10 -mt-10" />
          
          <div className="flex-grow z-10 flex flex-col h-full">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-pink-100 text-[#B80053] flex items-center justify-center shadow-inner">
                  <CheckSquare size={20} />
                </span>
                <h3 className="font-sans font-black text-2xl text-[#1E1B18]">Plánovač úkolů</h3>
              </div>
              
              <Dialog open={isNewTodoOpen} onOpenChange={setIsNewTodoOpen}>
                <Button 
                  onClick={() => setIsNewTodoOpen(true)}
                  className="rounded-xl bg-[#B80053] hover:bg-[#B80053]/90 text-white font-bold h-10 px-4 flex items-center gap-2 shadow-md shadow-pink-100 transition-all cursor-pointer"
                >
                  <Plus size={16} />
                  <span>Nový úkol</span>
                </Button>
                <DialogContent className="rounded-[2.5rem] p-8 border-none shadow-2xl max-w-md bg-white">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-display font-bold text-[#1E1B18]">Vytvořit vlastní úkol</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateTodo} className="space-y-6 py-4">
                    <div className="space-y-2">
                      <label className="font-bold text-gray-700 text-sm">Název úkolu</label>
                      <Input
                        value={newTodoTitle}
                        onChange={e => setNewTodoTitle(e.target.value)}
                        placeholder="Např. Naučit se slovíčka"
                        required
                        className="rounded-xl h-12 border-gray-200 bg-gray-50 focus:border-[#B80053] font-medium"
                      />
                    </div>
                    <DialogFooter>
                      <Button type="submit" className="w-full bg-[#B80053] hover:bg-[#B80053]/90 text-white rounded-xl h-12 font-bold text-lg">
                        Přidat úkol
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-grow">
              {/* Section 1: Od učitele */}
              <div className="flex flex-col bg-white/80 p-5 rounded-3xl border border-pink-100/50 shadow-sm min-h-[300px]">
                <h4 className="font-sans font-black text-sm text-[#B80053] uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-pink-100 pb-2 shrink-0">
                  👩‍🏫 Od učitele
                </h4>
                <div className="flex-1 overflow-y-auto max-h-[300px] space-y-3 custom-scrollbar pr-1">
                  {todos.filter(t => t.addedBy !== profile?.uid).length === 0 ? (
                    <p className="text-gray-400 text-xs italic text-center py-12">Žádné úkoly od učitele.</p>
                  ) : (
                    todos.filter(t => t.addedBy !== profile?.uid).map(todo => renderTodoItem(todo))
                  )}
                </div>
              </div>

              {/* Section 2: Moje úkoly */}
              <div className="flex flex-col bg-white/80 p-5 rounded-3xl border border-pink-100/50 shadow-sm min-h-[300px]">
                <h4 className="font-sans font-black text-sm text-gray-800 uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-gray-100 pb-2 shrink-0">
                  ✏️ Moje úkoly
                </h4>
                <div className="flex-1 overflow-y-auto max-h-[300px] space-y-3 custom-scrollbar pr-1">
                  {todos.filter(t => t.addedBy === profile?.uid).length === 0 ? (
                    <p className="text-gray-400 text-xs italic text-center py-12">Žádné vlastní úkoly.</p>
                  ) : (
                    todos.filter(t => t.addedBy === profile?.uid).map(todo => renderTodoItem(todo))
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* STATS PANEL */}
      <div className="grid md:grid-cols-3 gap-6 pt-6">
        <Card className="rounded-3xl border-none shadow-md bg-white p-6 flex flex-col items-center text-center group hover:-translate-y-1 transition-all">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-brand-blue mb-3 group-hover:scale-110 transition-transform">
            <Clock size={24} />
          </div>
          <div className="text-3xl font-black text-[#2B44B8] mb-1">{pendingTests.length}</div>
          <h4 className="font-bold text-gray-800 text-sm">Čekající testy</h4>
          <p className="text-gray-400 text-xs mt-0.5">Dokonči je co nejdříve!</p>
        </Card>

        <Card className="rounded-3xl border-none shadow-md bg-white p-6 flex flex-col items-center text-center group hover:-translate-y-1 transition-all">
          <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-[#B80053] mb-3 group-hover:scale-110 transition-transform">
            <CheckCircle size={24} />
          </div>
          <div className="text-3xl font-black text-[#B80053] mb-1">{completedTests.length}</div>
          <h4 className="font-bold text-gray-800 text-sm">Odevzdané úkoly</h4>
          <p className="text-gray-400 text-xs mt-0.5">Skvělá práce!</p>
        </Card>

        <Card className="rounded-3xl border-none shadow-md bg-white p-6 flex flex-col items-center text-center group hover:-translate-y-1 transition-all">
          <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-500 mb-3 group-hover:scale-110 transition-transform">
            <Target size={24} />
          </div>
          <div className="text-3xl font-black text-green-600 mb-1">
            {completedTests.filter(t => t.status === 'graded').length}
          </div>
          <h4 className="font-bold text-gray-800 text-sm">Opravené testy</h4>
          <p className="text-gray-400 text-xs mt-0.5">Podívej se na zpětnou vazbu.</p>
        </Card>
      </div>

      {/* LOWER TABS: MOJE TESTY, HISTORIE */}
      <Tabs 
        value={searchParams.get('tab') || 'tests'} 
        onValueChange={(val) => setSearchParams({ tab: val })} 
        className="space-y-8 pt-6 scroll-mt-10"
        id="student-tabs"
      >
        <TabsList className="bg-white/60 backdrop-blur-md border border-gray-100 p-1.5 rounded-2xl h-16 shadow-sm flex items-center mb-8 overflow-x-auto justify-start md:justify-center w-full max-w-2xl mx-auto">
          <TabsTrigger value="tests" className="rounded-xl px-6 h-full data-[state=active]:bg-[#F5C400] data-[state=active]:text-[#1E1B18] data-[state=active]:font-black data-[state=active]:shadow-md font-bold transition-all flex items-center gap-2 cursor-pointer">
            <FileText size={18} />
            <span>Moje testy ({pendingTests.length})</span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="rounded-xl px-6 h-full data-[state=active]:bg-[#F5C400] data-[state=active]:text-[#1E1B18] data-[state=active]:font-black data-[state=active]:shadow-md font-bold transition-all flex items-center gap-2 cursor-pointer">
            <Bell size={18} />
            <span>Poslední aktivita</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-xl px-6 h-full data-[state=active]:bg-[#F5C400] data-[state=active]:text-[#1E1B18] data-[state=active]:font-black data-[state=active]:shadow-md font-bold transition-all flex items-center gap-2 cursor-pointer">
            <Trophy size={18} />
            <span>Historie</span>
          </TabsTrigger>
        </TabsList>

        {/* TABS CONTENT: POSLEDNÍ AKTIVITA */}
        <TabsContent value="activity" className="animate-in fade-in-50 duration-300 space-y-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {activityItems.length === 0 ? (
              <div className="text-center py-16 bg-white/40 rounded-[2.5rem] border-2 border-dashed border-gray-200">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                  <Bell size={32} />
                </div>
                <h3 className="text-xl font-sans font-black text-gray-800 mb-1">Žádná aktivita</h3>
                <p className="text-gray-400 text-sm">Zatím nebyly zaznamenány žádné aktivity.</p>
              </div>
            ) : (
              activityItems.map((item) => {
                const isPending = item.status === 'pending';
                const isTest = item.type === 'test';
                const isTodo = item.type === 'todo';
                const isMaterial = item.type === 'material';

                let iconColorClass = '';
                let iconBgClass = '';
                let iconElement = null;

                if (isTest) {
                  iconColorClass = 'text-[#2B44B8]';
                  iconBgClass = 'bg-blue-50';
                  iconElement = <FileText size={20} />;
                } else if (isTodo) {
                  iconColorClass = 'text-[#B80053]';
                  iconBgClass = 'bg-pink-50';
                  iconElement = <CheckSquare size={20} />;
                } else {
                  iconColorClass = 'text-purple-500';
                  iconBgClass = 'bg-purple-50';
                  iconElement = <BookOpen size={20} />;
                }

                return (
                  <Card key={`${item.type}-${item.id}`} className="rounded-3xl border-none shadow-md bg-white overflow-hidden hover:shadow-lg transition-all p-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm shrink-0", iconBgClass, iconColorClass)}>
                        {iconElement}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-sans font-black text-base text-gray-800 truncate">
                          {item.title}
                        </h4>
                        <p className="text-gray-400 font-semibold text-xs mt-1 flex items-center gap-2">
                          <Clock size={12} /> {item.date.toLocaleDateString('cs-CZ')} {item.date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
                          {item.description && <span className="text-gray-300">|</span>}
                          {item.description && <span className="truncate">{item.description}</span>}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isTest && (
                        <Button
                          onClick={() => navigate(isPending ? `/test/${item.id}` : `/review/${item.id}`)}
                          className={cn(
                            "rounded-xl h-10 px-4 font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer",
                            isPending 
                              ? "bg-[#2B44B8] hover:bg-[#1e339a] text-white" 
                              : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                          )}
                        >
                          {isPending ? 'Spustit test' : 'Detaily'}
                          <ArrowRight size={12} />
                        </Button>
                      )}
                      {isTodo && (
                        <Button
                          onClick={() => navigate('/todo')}
                          className="rounded-xl h-10 px-4 font-bold text-xs bg-pink-50 hover:bg-pink-100 text-[#B80053] transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          Přejít na úkoly
                          <ArrowRight size={12} />
                        </Button>
                      )}
                      {isMaterial && (
                        <Button
                          onClick={() => navigate('/learning')}
                          className="rounded-xl h-10 px-4 font-bold text-xs bg-purple-50 hover:bg-purple-100 text-purple-600 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          Přejít na materiály
                          <ArrowRight size={12} />
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        {/* TABS CONTENT: MOJE TESTY */}
        <TabsContent value="tests" className="animate-in fade-in-50 duration-300">
          <div className="grid md:grid-cols-2 gap-6">
            {pendingTests.map(test => (
              <motion.div key={test.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <Card className="rounded-[2rem] border-none shadow-md hover:shadow-lg transition-all overflow-hidden group bg-white">
                  <div className="h-2.5 bg-brand-blue/15 group-hover:bg-[#2B44B8] transition-colors" />
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start mb-2">
                      <CardTitle className="text-xl font-sans font-black text-gray-800 group-hover:text-[#2B44B8] transition-colors">
                        {test.testTitle}
                      </CardTitle>
                      <span className="px-2.5 py-1 bg-blue-50 text-[#2B44B8] rounded-full text-[10px] font-black uppercase tracking-wider">
                        Test
                      </span>
                    </div>
                    <CardDescription className="flex items-center gap-2 text-gray-400 font-semibold text-xs">
                      <Clock size={14} /> Přiřazeno: {safeToDate(test.assignedAt)?.toLocaleDateString('cs-CZ')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <Button
                      onClick={() => navigate(`/test/${test.id}`)}
                      className="btn-blue w-full h-12 rounded-xl text-sm font-bold group-hover:scale-[1.01] transition-transform"
                    >
                      Spustit test <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={16} />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
            {pendingTests.length === 0 && (
              <div className="col-span-full text-center py-16 bg-white/40 rounded-[2.5rem] border-2 border-dashed border-gray-200">
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4 text-green-500">
                  <CheckCircle size={32} />
                </div>
                <h3 className="text-xl font-sans font-black text-gray-800 mb-1">Vše hotovo!</h3>
                <p className="text-gray-400 text-sm">Momentálně nemáš žádné čekající testy. 🎉</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* TABS CONTENT: HISTORIE */}
        <TabsContent value="history" className="animate-in fade-in-50 duration-300 space-y-4">
          {completedTests.map(test => (
            <Card key={test.id} className="rounded-3xl border-none shadow-md bg-white overflow-hidden hover:shadow-lg transition-all">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 gap-6">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm shrink-0 ${test.status === 'graded' ? 'bg-green-50 text-green-500' : 'bg-orange-50 text-brand-orange'}`}>
                    {test.status === 'graded' ? <Trophy size={24} /> : <Clock size={24} />}
                  </div>
                  <div>
                    <h3 className="font-sans font-black text-xl text-gray-800">{test.testTitle}</h3>
                    <p className="text-gray-400 font-semibold text-xs mt-0.5">
                      {test.status === 'graded'
                        ? `Oznámkováno: ${safeToDate(test.gradedAt)?.toLocaleDateString('cs-CZ')}`
                        : `Odevzdáno: ${safeToDate(test.submittedAt)?.toLocaleDateString('cs-CZ')}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6 shrink-0">
                  {test.status === 'graded' && (
                    <div className="text-center sm:text-right">
                      <div className="text-3xl font-black text-[#2B44B8] leading-none mb-1">
                        {test.grade}
                      </div>
                      <div className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Známka</div>
                    </div>
                  )}
                  {test.status === 'submitted' && (
                    <span className="px-4 py-1.5 bg-orange-50 text-brand-orange rounded-full text-[10px] font-black uppercase tracking-wider border border-orange-100">
                      Čeká na opravu
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    className="rounded-xl hover:bg-gray-50 font-bold"
                    onClick={() => navigate(`/review/${test.id}`)}
                  >
                    Detaily <ArrowRight size={14} className="ml-1.5" />
                  </Button>
                </div>
              </div>
              {test.feedback && (
                <div className="px-6 pb-6 pt-0">
                  <div className="p-4 bg-[#FAF7F0] rounded-2xl text-gray-600 text-sm italic relative">
                    {test.feedback}
                  </div>
                </div>
              )}
            </Card>
          ))}
          {completedTests.length === 0 && (
            <div className="text-center py-16 bg-white/40 rounded-[2.5rem] border-2 border-dashed border-gray-200">
              <p className="text-gray-400 font-semibold text-sm">Zatím jsi neodevzdal žádné testy.</p>
            </div>
          )}
        </TabsContent>

        {/* TABS CONTENT: KALENDÁŘ */}
        <TabsContent value="calendar" className="animate-in fade-in-50 duration-300">
          <QuickCalendar todos={todos} />
        </TabsContent>
      </Tabs>

      {/* AI RECOMMENDATIONS SECTION */}
      <AnimatePresence>
        {profile?.focusAreas && profile.focusAreas.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative pt-6"
          >
            <div className="absolute top-2 -left-3 w-10 h-10 bg-purple-500 rounded-2xl flex items-center justify-center text-white shadow-md z-10 animate-bounce">
              <Sparkles size={20} />
            </div>
            <Card className="rounded-[2.5rem] border-none shadow-lg bg-gradient-to-br from-[#B80053] to-[#80003A] text-white overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
              <CardHeader className="relative z-10 p-8">
                <CardTitle className="text-2xl font-sans font-black flex items-center gap-2 text-white">
                  Doporučení pro tebe <Lightbulb className="text-yellow-300 shrink-0" />
                </CardTitle>
                <CardDescription className="text-purple-100 text-base font-semibold mt-1">
                  Na základě tvých výsledků ti AI doporučuje zaměřit se na tyto oblasti:
                </CardDescription>
              </CardHeader>
              <CardContent className="relative z-10 grid md:grid-cols-3 gap-6 p-8 pt-0">
                {profile.focusAreas?.map((area, i) => (
                  <div key={i} className="bg-white/10 backdrop-blur-md p-6 rounded-3xl border border-white/10 flex flex-col gap-4 group hover:bg-white/20 transition-all cursor-default">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-[#B80053] font-black text-sm shrink-0">
                        {i + 1}
                      </div>
                      <span className="font-bold text-base leading-snug">{area}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!!isAddingTodo}
                      onClick={() => handleAddToTodo(area)}
                      className="mt-auto w-full bg-white/10 hover:bg-white text-white hover:text-[#B80053] rounded-xl font-bold gap-2 transition-all h-10 cursor-pointer"
                    >
                      {isAddingTodo === area ? <Loader2 size={14} className="animate-spin" /> : <><Clock size={14} /> Naplánovat</>}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* BOTTOM SECTION: LIVE MEETINGS */}
      <Card className="rounded-[2.5rem] border-none shadow-md bg-white p-8">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 bg-red-500 rounded-full animate-ping shrink-0" />
            <h3 className="font-sans font-black text-2xl text-[#1E1B18]">Připojit se na hodinu</h3>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.filter(c => c.meetLink).length === 0 ? (
            <div className="col-span-full text-center py-8 text-gray-400 bg-gray-50/50 rounded-2xl border border-dashed border-gray-100">
              Momentálně nejsou naplánované žádné živé lekce.
            </div>
          ) : (
            courses.filter(c => c.meetLink).map(course => (
              <div key={course.id} className="flex flex-col justify-between p-6 bg-[#FAF7F0] rounded-3xl border border-gray-100 hover:shadow-sm transition-all h-full gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm text-white shrink-0 bg-[#B80053]">
                    <span className="font-bold">{course.title.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-800 leading-tight mb-1">{course.title}</h4>
                    <p className="text-xs text-gray-400 font-bold line-clamp-2">{course.description || "Živá výuka s učitelem"}</p>
                  </div>
                </div>
                <a 
                  href={course.meetLink?.startsWith('http') ? course.meetLink : `https://${course.meetLink}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-[#B80053] hover:bg-[#B80053]/90 text-white font-bold h-12 rounded-xl flex items-center justify-center gap-2 shadow-md shadow-pink-100 cursor-pointer"
                >
                  Připojit se na Google Meet
                  <ExternalLink size={16} />
                </a>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Sheet Viewer Dialog (preserved for materials if opened here) */}
      <Dialog open={!!selectedSheet} onOpenChange={(open) => !open && setSelectedSheet(null)}>
        <DialogContent className="max-w-[98vw] w-[98vw] max-h-[95dvh] h-[95dvh] overflow-hidden rounded-2xl p-0 border-none flex flex-col">
          {selectedSheet && (
            <div className="flex flex-col h-full w-full bg-white">
              <div className="shrink-0 flex items-center justify-between p-4 bg-white border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1 bg-purple-50 text-[#B80053] rounded-full text-xs font-black uppercase tracking-widest">
                    {selectedSheet.topic || 'Matematika'}
                  </span>
                  <DialogHeader>
                    <DialogTitle className="text-xl font-sans font-black m-0">
                      {selectedSheet.title}
                    </DialogTitle>
                  </DialogHeader>
                </div>

                <div className="flex items-center gap-3">
                  <Button variant="outline" className="h-10 rounded-xl font-bold" onClick={() => {
                    const a = document.createElement('a');
                    a.href = selectedSheet.fileUrl || '';
                    a.download = `${selectedSheet.title || 'material'}.pdf`;
                    a.click();
                  }}>
                    <FileText size={18} className="mr-2" />
                    Stáhnout (PDF)
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setSelectedSheet(null)}
                    className="h-10 w-10 p-0 rounded-full bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500"
                  >
                    <ArrowRight size={20} />
                  </Button>
                </div>
              </div>

              <div className="flex-1 min-h-0 bg-gray-100/50 p-2 md:p-4 relative">
                <div className="w-full h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden relative">
                  <PDFViewer url={selectedSheet.fileUrl} title={selectedSheet.title} />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
