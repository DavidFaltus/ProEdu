import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TodoItem, PracticeCourse, Test, LearningSheet, AssignedTest } from '../types';
import { safeToDate, cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { CheckCircle2, Circle, Clock, Plus, Trash2, Calendar as CalendarIcon, ExternalLink, BookOpen, GraduationCap, FileText, Pencil, Info, Loader2, MessageSquare, Sparkles, Check, Play } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useNavigate } from 'react-router-dom';
import { startPracticeCourse } from '../services/courseService';

interface TodoManagerProps {
  targetStudentId: string;
  isTeacherView?: boolean;
  variant?: 'default' | 'student-card';
}

const SUBJECT_TOPICS: Record<string, string[]> = {
  'Matematika': [
    'Počítání a čísla',
    'Rovnice a výrazy',
    'Procenta poměry a data',
    'Geometrie',
    'Rýsování',
    'Slovní úlohy',
    'Logické chytáky'
  ],
  'Český jazyk': [
    'Pravopis a chytáky',
    'Gramatika (stavba slov, vět)',
    'Spisovnost a významy slov',
    'Práce s textem a sloh',
    'Literatura a poezie'
  ],
  'Anglický jazyk': [
    'Poslech a porozumění',
    'Slovní zásoba',
    'Časy a pomocná slovesa',
    'Předložky',
    'Ustálené vazby',
    'Stavba věty'
  ]
};

export default function TodoManager({ targetStudentId, isTeacherView = false, variant = 'default' }: TodoManagerProps) {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [assignedTests, setAssignedTests] = useState<AssignedTest[]>([]);
  const [courses, setCourses] = useState<PracticeCourse[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [sheets, setSheets] = useState<LearningSheet[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentEditId, setCurrentEditId] = useState<string | null>(null);
  const [viewingDetails, setViewingDetails] = useState<TodoItem | null>(null);
  const [isLaunching, setIsLaunching] = useState<string | null>(null);
  const [feedbackTodo, setFeedbackTodo] = useState<TodoItem | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);

  // Hidden assigned tests (deleted from view locally)
  const [hiddenAssignedTests, setHiddenAssignedTests] = useState<string[]>([]);

  // Form states
  const [addMode, setAddMode] = useState<'topic' | 'course' | 'custom' | 'material'>('topic');
  const [selectedSubject, setSelectedSubject] = useState<string>('Matematika');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [selectedQuestionCount, setSelectedQuestionCount] = useState<number>(10);
  const [newTodo, setNewTodo] = useState({
    title: '',
    referenceId: '',
    dueDate: ''
  });

  const [editTodo, setEditTodo] = useState({
    title: '',
    dueDate: ''
  });

  useEffect(() => {
    const stored = localStorage.getItem('hidden_assigned_tests');
    if (stored) {
      try {
        setHiddenAssignedTests(JSON.parse(stored));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  useEffect(() => {
    if (!selectedTopic && SUBJECT_TOPICS[selectedSubject]?.length) {
      setSelectedTopic(SUBJECT_TOPICS[selectedSubject][0]);
    }
  }, [selectedSubject]);

  useEffect(() => {
    if (!targetStudentId) return;

    // Load custom scheduled tasks (todos)
    const qTodos = query(
      collection(db, 'todos'),
      where('studentId', '==', targetStudentId)
    );

    const unsubscribeTodos = onSnapshot(qTodos, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TodoItem));
      const sorted = items.sort((a, b) => {
        const timeA = safeToDate(a.createdAt)?.getTime() || 0;
        const timeB = safeToDate(b.createdAt)?.getTime() || 0;
        return timeB - timeA;
      });
      setTodos(sorted);
    }, (error) => {
      console.error("Todo fetch error:", error);
    });

    // Load teacher-assigned tests (assignedTests)
    const qAssigned = query(
      collection(db, 'assignedTests'),
      where('studentId', '==', targetStudentId)
    );

    const unsubscribeAssigned = onSnapshot(qAssigned, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AssignedTest));
      const sorted = items.sort((a, b) => {
        const timeA = safeToDate(a.assignedAt)?.getTime() || 0;
        const timeB = safeToDate(b.assignedAt)?.getTime() || 0;
        return timeB - timeA;
      });
      setAssignedTests(sorted);
    }, (error) => {
      console.error("Assigned tests fetch error:", error);
    });

    // Load courses, learning sheets, and tests
    const unsubCourses = onSnapshot(collection(db, 'practiceCourses'), (snap) => {
      setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as PracticeCourse)));
    });
    const unsubSheets = onSnapshot(collection(db, 'learningSheets'), (snap) => {
      setSheets(snap.docs.map(d => ({ id: d.id, ...d.data() } as LearningSheet)));
    });

    let unsubTests = () => { };
    if (isTeacherView) {
      unsubTests = onSnapshot(collection(db, 'tests'), (snap) => {
        setTests(snap.docs.map(d => ({ id: d.id, ...d.data() } as Test)));
      });
    }

    return () => {
      unsubscribeTodos();
      unsubscribeAssigned();
      unsubCourses();
      unsubTests();
      unsubSheets();
    };
  }, [isTeacherView, targetStudentId]);

  const handleAddTodo = async () => {
    try {
      const todoData: Record<string, any> = {
        studentId: targetStudentId,
        completed: false,
        addedBy: user?.uid || '',
        createdAt: Timestamp.now()
      };

      if (newTodo.dueDate) {
        todoData.dueDate = Timestamp.fromDate(new Date(newTodo.dueDate));
      }

      if (addMode === 'topic') {
        if (!selectedTopic) {
          toast.error('Vyberte prosím téma procvičování.');
          return;
        }
        todoData.title = `Procvičování: ${selectedTopic} (${selectedSubject})`;
        todoData.type = 'practice';
        todoData.topic = selectedTopic;
        todoData.questionCount = selectedQuestionCount;
      } 
      else if (addMode === 'course') {
        if (!newTodo.referenceId) {
          toast.error('Vyberte prosím připravený kurz.');
          return;
        }
        const course = courses.find(c => c.id === newTodo.referenceId);
        todoData.title = course?.title || 'Cvičení';
        todoData.type = 'practice';
        todoData.referenceId = newTodo.referenceId;
      } 
      else if (addMode === 'material') {
        if (!newTodo.referenceId) {
          toast.error('Vyberte studijní materiál.');
          return;
        }
        const sheet = sheets.find(s => s.id === newTodo.referenceId);
        todoData.title = `Studium: ${sheet?.title || 'Materiál'}`;
        todoData.type = 'material';
        todoData.referenceId = newTodo.referenceId;
      } 
      else {
        if (!newTodo.title) {
          toast.error('Zadejte název úkolu.');
          return;
        }
        todoData.title = newTodo.title;
        todoData.type = 'custom';
      }

      await addDoc(collection(db, 'todos'), todoData as Omit<TodoItem, 'id'>);
      toast.success('Úkol byl úspěšně naplánován.');
      setIsAdding(false);
      setNewTodo({ title: '', referenceId: '', dueDate: '' });
    } catch (error) {
      console.error(error);
      toast.error('Chyba při ukládání úkolu.');
    }
  };

  const handleUpdateTodo = async () => {
    if (!currentEditId) return;
    if (!editTodo.title) {
      toast.error('Název úkolu nesmí být prázdný');
      return;
    }

    try {
      await updateDoc(doc(db, 'todos', currentEditId), {
        title: editTodo.title,
        dueDate: editTodo.dueDate ? Timestamp.fromDate(new Date(editTodo.dueDate)) : null
      });
      toast.success('Úkol byl aktualizován.');
      setIsEditing(false);
      setCurrentEditId(null);
    } catch (error) {
      toast.error('Chyba při aktualizaci úkolu.');
    }
  };

  const handleLaunchTask = async (todo: TodoItem) => {
    setIsLaunching(todo.id);
    try {
      if (todo.topic) {
        // Start custom topic practice on the fly
        const assignedId = await startPracticeCourse(
          user?.uid || '',
          profile?.name || 'Student',
          todo.topic,
          `Procvičování: ${todo.topic}`,
          `Cvičení na téma ${todo.topic} naplánované jako úkol.`,
          undefined,
          [todo.topic],
          todo.questionCount || 10
        );
        navigate(`/test/${assignedId}`);
      } else if (todo.referenceId) {
        if (todo.type === 'practice') {
          const course = courses.find(c => c.id === todo.referenceId);
          if (course) {
            const assignedId = await startPracticeCourse(
              user?.uid || '',
              profile?.name || 'Student',
              course.topic,
              course.title,
              course.description,
              course.id,
              course.topics,
              course.questionCount
            );
            navigate(`/test/${assignedId}`);
          }
        } else if (todo.type === 'material') {
          navigate('/learning');
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Nepodařilo se spustit úkol.");
    } finally {
      setIsLaunching(null);
    }
  };

  const startEdit = (todo: TodoItem) => {
    setEditTodo({
      title: todo.title,
      dueDate: todo.dueDate ? format(todo.dueDate.toDate(), "yyyy-MM-dd'T'HH:mm") : ''
    });
    setCurrentEditId(todo.id);
    setIsEditing(true);
  };

  const toggleTodo = async (todo: TodoItem) => {
    try {
      await updateDoc(doc(db, 'todos', todo.id), {
        completed: !todo.completed,
        completedAt: !todo.completed ? Timestamp.now() : null
      });
      toast.success(todo.completed ? 'Úkol označen jako aktivní' : 'Úkol byl splněn a přesunut do hotových! 🎉');
    } catch (error) {
      toast.error('Chyba při aktualizaci úkolu.');
    }
  };

  const deleteTodo = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'todos', id));
      toast.success('Úkol byl smazán.');
    } catch (error) {
      toast.error('Chyba při mazání úkolu.');
    }
  };

  const handleHideAssignedTest = (testId: string) => {
    const updated = [...hiddenAssignedTests, testId];
    setHiddenAssignedTests(updated);
    localStorage.setItem('hidden_assigned_tests', JSON.stringify(updated));
    toast.success('Úkol byl smazán z historie.');
  };

  const handleSaveFeedback = async () => {
    if (!feedbackTodo) return;
    setIsSavingFeedback(true);
    try {
      await updateDoc(doc(db, 'todos', feedbackTodo.id), {
        feedback: feedbackText
      });
      toast.success('Zpětná vazba uložena');
      setFeedbackTodo(null);
      setFeedbackText('');
    } catch (error) {
      toast.error('Chyba při ukládání zpětné vazby');
    } finally {
      setIsSavingFeedback(false);
    }
  };

  const openFeedback = (todo: TodoItem) => {
    setFeedbackTodo(todo);
    setFeedbackText(todo.feedback || '');
  };

  const getSubjectColor = (subjectName: string | undefined) => {
    if (!subjectName) return 'border-indigo-100 bg-indigo-50/30 text-indigo-600';
    if (subjectName.includes('Matematika')) return 'border-emerald-100 bg-emerald-50/30 text-emerald-600';
    if (subjectName.includes('Český')) return 'border-pink-100 bg-pink-50/30 text-pink-600';
    return 'border-blue-100 bg-blue-50/30 text-blue-600';
  };

  const getSubjectOfTopic = (topic: string): string => {
    for (const [subj, topics] of Object.entries(SUBJECT_TOPICS)) {
      if (topics.includes(topic)) return subj;
    }
    return 'Matematika';
  };

  // Filter Active vs Completed
  const teacherActive = assignedTests.filter(t => t.status === 'pending');
  const teacherCompleted = assignedTests.filter(t => t.status !== 'pending' && !hiddenAssignedTests.includes(t.id));

  const myActive = todos.filter(t => !t.completed);
  const myCompleted = todos.filter(t => t.completed);

  // Quick tasks for check-off shortcut (active practice and custom todos)
  const quickTasks = myActive.slice(0, 4);

  return (
    <div className="space-y-8">
      {/* Edit Dialog */}
      <Dialog open={isEditing} onOpenChange={setIsEditing}>
        <DialogContent className="rounded-[2.5rem] p-8 border-none shadow-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-bold text-brand-blue">Upravit úkol</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label className="font-bold text-gray-700">Název úkolu</Label>
              <Input
                value={editTodo.title}
                onChange={e => setEditTodo({ ...editTodo, title: e.target.value })}
                className="rounded-xl h-12 border-gray-100 bg-gray-50/50 grayscale-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-bold text-gray-700">Termín dokončení (volitelné)</Label>
              <div className="relative">
                <Input
                  type="datetime-local"
                  value={editTodo.dueDate}
                  onChange={e => setEditTodo({ ...editTodo, dueDate: e.target.value })}
                  className="rounded-xl h-12 border-gray-100 bg-gray-50/50 pl-10"
                />
                <CalendarIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleUpdateTodo} className="w-full btn-blue rounded-xl h-12 font-bold text-lg">
              Uložit změny
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={isAdding} onOpenChange={setIsAdding}>
        <DialogContent className="rounded-[2.5rem] p-8 border-none shadow-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-bold text-brand-blue">Naplánovat nový úkol</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-50 rounded-xl border border-gray-100">
              <button 
                type="button" 
                onClick={() => setAddMode('topic')} 
                className={cn("py-2 text-xs font-bold rounded-lg transition-all", addMode === 'topic' ? "bg-white text-brand-blue shadow-sm" : "text-gray-500 hover:text-gray-900")}
              >
                Cvičné téma
              </button>
              <button 
                type="button" 
                onClick={() => setAddMode('custom')} 
                className={cn("py-2 text-xs font-bold rounded-lg transition-all", addMode === 'custom' ? "bg-white text-brand-blue shadow-sm" : "text-gray-500 hover:text-gray-900")}
              >
                Vlastní úkol
              </button>
            </div>

            {addMode === 'topic' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700 text-sm">Vyberte předmět</Label>
                  <Select value={selectedSubject} onValueChange={(val) => {
                    setSelectedSubject(val);
                    setSelectedTopic(SUBJECT_TOPICS[val][0]);
                  }}>
                    <SelectTrigger className="rounded-xl h-12 border-gray-100 bg-gray-50/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Matematika">Matematika</SelectItem>
                      <SelectItem value="Český jazyk">Český jazyk</SelectItem>
                      <SelectItem value="Anglický jazyk">Anglický jazyk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="font-bold text-gray-700 text-sm">Vyberte konkrétní téma</Label>
                  <Select value={selectedTopic} onValueChange={setSelectedTopic}>
                    <SelectTrigger className="rounded-xl h-12 border-gray-100 bg-gray-50/50 text-left">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBJECT_TOPICS[selectedSubject]?.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="font-bold text-gray-700 text-sm">Počet otázek</Label>
                  <Select value={selectedQuestionCount.toString()} onValueChange={(val) => setSelectedQuestionCount(Number(val))}>
                    <SelectTrigger className="rounded-xl h-12 border-gray-100 bg-gray-50/50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 otázek</SelectItem>
                      <SelectItem value="10">10 otázek</SelectItem>
                      <SelectItem value="15">15 otázek</SelectItem>
                      <SelectItem value="20">20 otázek</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {addMode === 'custom' && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <Label className="font-bold text-gray-700">Co je potřeba udělat?</Label>
                <Input
                  value={newTodo.title}
                  onChange={e => setNewTodo({ ...newTodo, title: e.target.value })}
                  placeholder="Např. Přečíst 2 kapitoly z literatury..."
                  className="rounded-xl h-12 border-gray-100 bg-gray-50/50 grayscale-input"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="font-bold text-gray-700">Termín splnění (volitelné)</Label>
              <div className="relative">
                <Input
                  type="datetime-local"
                  value={newTodo.dueDate}
                  onChange={e => setNewTodo({ ...newTodo, dueDate: e.target.value })}
                  className="rounded-xl h-12 border-gray-100 bg-gray-50/50 pl-10"
                />
                <CalendarIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleAddTodo} className="w-full btn-blue rounded-xl h-12 font-bold text-lg shadow-lg">
              Naplánovat úkol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header and Add Task Button */}
      {variant !== 'student-card' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-2xl font-display font-black text-brand-blue flex items-center gap-2">
              <Clock className="text-[#FF4133]" />
              Studijní nástěnka úkolů
            </h2>
            <p className="text-sm text-gray-400 font-bold">Uspořádej si své přípravy a testy na jednom místě.</p>
          </div>
          <Button 
            onClick={() => setIsAdding(true)}
            className="rounded-xl bg-[#2B44B8] hover:bg-[#1e339a] text-white font-bold h-12 px-6 flex items-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer w-full sm:w-auto"
          >
            <Plus size={20} />
            <span>Naplánovat úkol</span>
          </Button>
        </div>
      )}

      {/* Quick Check-off Shortcut row at the top */}
      {quickTasks.length > 0 && variant !== 'student-card' && (
        <div className="bg-white/60 backdrop-blur-md p-5 rounded-[2rem] border border-gray-100 shadow-sm space-y-3">
          <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest pl-2">Rychlé splnění úkolů</h4>
          <div className="flex flex-wrap gap-3">
            {quickTasks.map(todo => (
              <div 
                key={todo.id} 
                className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-2xl border border-gray-100 shadow-xs hover:border-brand-blue/30 transition-all group"
              >
                <button
                  onClick={() => toggleTodo(todo)}
                  className="w-5 h-5 rounded-full border-2 border-gray-200 text-gray-300 hover:border-brand-blue hover:text-brand-blue flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Circle size={14} />
                </button>
                <span className="text-sm font-bold text-gray-700 truncate max-w-[200px]">{todo.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2-Column Board Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Column 1: Zadáno od učitele */}
        <div className="bg-gray-50/50 p-6 rounded-[2.5rem] border border-gray-100 space-y-6">
          <h4 className="font-display font-extrabold text-xl text-gray-900 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-brand-orange" />
            Zadáno od učitele
            <span className="text-xs bg-orange-50 text-brand-orange px-2 py-0.5 rounded-full font-bold">
              {teacherActive.length}
            </span>
          </h4>

          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
            {teacherActive.map(test => (
              <Card key={test.id} className="rounded-2xl border-none shadow-sm bg-white hover:shadow-md transition-all">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <span className="px-2 py-0.5 bg-orange-50 text-brand-orange rounded-lg text-[9px] font-black uppercase tracking-wider">
                        Povinný test
                      </span>
                      <h5 className="font-bold text-gray-900 text-base leading-snug">{test.testTitle}</h5>
                    </div>
                    <div className="w-8 h-8 rounded-xl bg-orange-50 text-brand-orange flex items-center justify-center shrink-0">
                      <FileText size={18} />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-50 text-xs">
                    <span className={cn(
                      "flex items-center gap-1 font-semibold",
                      test.dueDate && new Date(test.dueDate.toDate()) < new Date() ? "text-red-500 font-bold" : "text-gray-400"
                    )}>
                      <CalendarIcon size={12} />
                      {test.dueDate ? format(test.dueDate.toDate(), 'd. MMMM HH:mm', { locale: cs }) : 'Bez termínu'}
                    </span>
                    <Button 
                      onClick={() => navigate(`/test/${test.id}`)}
                      className="btn-orange h-8 rounded-lg px-3 text-xs font-bold"
                    >
                      Spustit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {teacherActive.length === 0 && (
              <div className="text-center py-8 bg-white/50 rounded-2xl border border-dashed border-gray-200 text-gray-400 text-sm">
                Žádné úkoly k vyřešení od učitele.
              </div>
            )}
          </div>
        </div>

        {/* Column 2: Moje nástěnka (planned practice + custom tasks) */}
        <div className="bg-gray-50/50 p-6 rounded-[2.5rem] border border-gray-100 space-y-6">
          <h4 className="font-display font-extrabold text-xl text-gray-900 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-brand-blue" />
            Moje nástěnka
            <span className="text-xs bg-blue-50 text-brand-blue px-2 py-0.5 rounded-full font-bold">
              {myActive.length}
            </span>
          </h4>

          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
            {myActive.map(todo => {
              const isPractice = todo.type === 'practice';
              const subj = isPractice && todo.topic ? getSubjectOfTopic(todo.topic) : 'Vlastní';
              const badgeColors = getSubjectColor(subj);
              
              return (
                <Card key={todo.id} className="rounded-2xl border-none shadow-sm bg-white hover:shadow-md transition-all">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <span className={cn("px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider", badgeColors)}>
                          {subj}
                        </span>
                        <h5 className="font-bold text-gray-900 text-base leading-snug truncate">{todo.title}</h5>
                        {isPractice && todo.questionCount && (
                          <div className="text-xs text-gray-400 font-semibold flex items-center gap-1">
                            <BookOpen size={12} /> {todo.questionCount} otázek
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => toggleTodo(todo)}
                        className="w-8 h-8 rounded-full border border-gray-100 flex items-center justify-center text-gray-300 hover:text-brand-blue hover:border-brand-blue/30 shrink-0"
                      >
                        <Circle size={20} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-50 text-xs">
                      <span className="text-gray-400 flex items-center gap-1 font-semibold">
                        <CalendarIcon size={12} />
                        {todo.dueDate ? format(todo.dueDate.toDate(), 'd.M. HH:mm') : 'Kdykoliv'}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => startEdit(todo)}
                          className="h-8 w-8 text-gray-300 hover:text-brand-blue rounded-lg"
                        >
                          <Pencil size={14} />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => deleteTodo(todo.id)}
                          className="h-8 w-8 text-gray-300 hover:text-red-500 rounded-lg"
                        >
                          <Trash2 size={14} />
                        </Button>
                        {isPractice && (
                          <Button 
                            onClick={() => handleLaunchTask(todo)}
                            disabled={isLaunching === todo.id}
                            className="btn-blue h-8 rounded-lg px-3 text-xs font-bold gap-1"
                          >
                            {isLaunching === todo.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={10} fill="currentColor" />}
                            Spustit
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {myActive.length === 0 && (
              <div className="text-center py-8 bg-white/50 rounded-2xl border border-dashed border-gray-200 text-gray-400 text-sm">
                Žádné plánované úkoly nebo cvičení.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Section: Splněné úkoly */}
      <div className="bg-gray-50/50 p-6 rounded-[2.5rem] border border-gray-100 space-y-6">
        <h4 className="font-display font-extrabold text-xl text-gray-900 flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500" />
          Splněné úkoly
          <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full font-bold">
            {myCompleted.length + teacherCompleted.length}
          </span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
          
          {/* Completed Teacher Tests */}
          {teacherCompleted.map(test => (
            <Card key={test.id} className="rounded-2xl border-none shadow-sm bg-white/60 opacity-80">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 w-max">
                      <Check size={10} /> Odevzdáno
                    </span>
                    <h5 className="font-bold text-gray-500 text-sm leading-snug mt-1 truncate">{test.testTitle}</h5>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center font-black text-xs shrink-0">
                    {test.grade || '-'}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100/50 text-xs">
                  <span className="text-gray-400">
                    {test.submittedAt ? format(test.submittedAt.toDate(), 'd.M.') : ''}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleHideAssignedTest(test.id)}
                      className="h-8 w-8 text-gray-300 hover:text-red-500 rounded-lg"
                      title="Smazat z historie"
                    >
                      <Trash2 size={14} />
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => navigate(`/review/${test.id}`)}
                      className="h-8 rounded-lg px-2.5 text-xs font-bold border-gray-100 hover:bg-white text-gray-500"
                    >
                      Rozbor
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Completed Custom/Practice Tasks */}
          {myCompleted.map(todo => (
            <Card key={todo.id} className="rounded-2xl border-none shadow-sm bg-white/60 opacity-80">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 w-max">
                      <Check size={10} /> Splněno
                    </span>
                    <h5 className="font-bold text-gray-500 text-sm leading-snug mt-1 truncate">{todo.title}</h5>
                  </div>
                  <button 
                    onClick={() => toggleTodo(todo)}
                    className="w-7 h-7 rounded-full bg-green-500 text-white flex items-center justify-center shrink-0"
                    title="Obnovit úkol"
                  >
                    <CheckCircle2 size={18} />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-100/50 text-xs">
                  <span className="text-gray-400">
                    {todo.completedAt ? format(todo.completedAt.toDate(), 'd.M.') : ''}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => deleteTodo(todo.id)}
                    className="h-8 w-8 text-gray-300 hover:text-red-500 rounded-lg"
                    title="Odstranit"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {myCompleted.length === 0 && teacherCompleted.length === 0 && (
            <div className="col-span-full text-center py-8 text-gray-400 text-sm">
              Žádné splněné úkoly v historii.
            </div>
          )}
        </div>
      </div>

      {/* Feedback Dialog */}
      <Dialog open={!!feedbackTodo} onOpenChange={(open) => !open && setFeedbackTodo(null)}>
        <DialogContent className="rounded-[2.5rem] p-8 border-none shadow-2xl max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-50 rounded-xl text-brand-blue">
                <MessageSquare size={20} />
              </div>
              <DialogTitle className="text-2xl font-display font-bold text-brand-blue">
                Zpětná vazba
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2 block">Úkol</Label>
              <div className="text-lg font-bold text-gray-800">{feedbackTodo?.title}</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="feedback-text" className="font-bold text-gray-700">Vaše hodnocení / vzkaz</Label>
              <textarea
                id="feedback-text"
                placeholder="Napište stručnou zpětnou vazbu k tomuto úkolu..."
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                className="w-full min-h-[120px] rounded-2xl border border-gray-100 bg-gray-50/50 p-4 focus:bg-white transition-all font-medium text-sm outline-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              onClick={handleSaveFeedback} 
              disabled={isSavingFeedback}
              className="w-full btn-blue rounded-xl h-12 font-bold text-lg shadow-lg shadow-blue-100"
            >
              {isSavingFeedback ? <Loader2 className="animate-spin" /> : 'Uložit zpětnou vazbu'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
