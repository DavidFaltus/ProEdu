import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { TodoItem, UserProfile, PracticeCourse, Test, LearningSheet } from '../types';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { CheckCircle2, Circle, Clock, Plus, Trash2, Calendar as CalendarIcon, ExternalLink, BookOpen, GraduationCap, FileText, Pencil, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useNavigate } from 'react-router-dom';
import { startPracticeCourse } from '../services/courseService';

interface TodoManagerProps {
  targetStudentId: string;
  isTeacherView?: boolean;
}

export default function TodoManager({ targetStudentId, isTeacherView = false }: TodoManagerProps) {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [courses, setCourses] = useState<PracticeCourse[]>([]);
  const [tests, setTests] = useState<Test[]>([]);
  const [sheets, setSheets] = useState<LearningSheet[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentEditId, setCurrentEditId] = useState<string | null>(null);
  const [viewingDetails, setViewingDetails] = useState<TodoItem | null>(null);
  const [isLaunching, setIsLaunching] = useState<string | null>(null);
  
  // Form state
  const [newTodo, setNewTodo] = useState({
    title: '',
    type: 'practice' as TodoItem['type'],
    referenceId: '',
    dueDate: ''
  });

  const [editTodo, setEditTodo] = useState({
    title: '',
    dueDate: ''
  });

  useEffect(() => {
    if (!targetStudentId) return;

    const q = query(
      collection(db, 'todos'),
      where('studentId', '==', targetStudentId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TodoItem));
      // Sort client-side to avoid index requirement
      const sorted = items.sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeB - timeA;
      });
      setTodos(sorted);
    }, (error) => {
      console.error("Todo fetch error:", error);
    });

    // Fetch available resources for the "Add" dialog and details
    const unsubCourses = onSnapshot(collection(db, 'practiceCourses'), (snap) => {
      setCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as PracticeCourse)));
    });
    const unsubTests = onSnapshot(collection(db, 'tests'), (snap) => {
      setTests(snap.docs.map(d => ({ id: d.id, ...d.data() } as Test)));
    });
    const unsubSheets = onSnapshot(collection(db, 'learningSheets'), (snap) => {
      setSheets(snap.docs.map(d => ({ id: d.id, ...d.data() } as LearningSheet)));
    });

    return () => {
      unsubscribe();
      unsubCourses();
      unsubTests();
      unsubSheets();
    };
  }, [targetStudentId]);

  const handleAddTodo = async () => {
    if (!newTodo.title && !newTodo.referenceId) {
      toast.error('Vyberte aktivitu nebo zadejte název');
      return;
    }

    let finalTitle = newTodo.title;
    if (newTodo.referenceId) {
      if (newTodo.type === 'practice') finalTitle = courses.find(c => c.id === newTodo.referenceId)?.title || finalTitle;
      if (newTodo.type === 'test') finalTitle = tests.find(t => t.id === newTodo.referenceId)?.title || finalTitle;
      if (newTodo.type === 'material') finalTitle = sheets.find(s => s.id === newTodo.referenceId)?.title || finalTitle;
    }

    try {
      const todoData: Omit<TodoItem, 'id'> = {
        studentId: targetStudentId,
        title: finalTitle,
        type: newTodo.type,
        referenceId: newTodo.referenceId || undefined,
        completed: false,
        addedBy: profile?.uid || '',
        createdAt: Timestamp.now(),
        dueDate: newTodo.dueDate ? Timestamp.fromDate(new Date(newTodo.dueDate)) : undefined
      };

      await addDoc(collection(db, 'todos'), todoData);
      toast.success('Úkol přidán');
      setIsAdding(false);
      setNewTodo({ title: '', type: 'practice', referenceId: '', dueDate: '' });
    } catch (error) {
      toast.error('Chyba při přidávání úkolu');
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
      toast.success('Úkol aktualizován');
      setIsEditing(false);
      setCurrentEditId(null);
    } catch (error) {
      toast.error('Chyba při aktualizaci úkolu');
    }
  };

  const handleLaunchTask = async (todo: TodoItem) => {
    if (!todo.referenceId) return;
    
    // For teachers, we just navigate to the list pages or provide previews
    if (isTeacherView) {
        if (todo.type === 'practice') navigate('/practice');
        if (todo.type === 'test') navigate('/teacher'); // Teacher dashboard to manage tests
        if (todo.type === 'material') navigate('/learning');
        return;
    }

    // For students, launch the actual thing
    if (todo.type === 'test') {
        navigate(`/test/${todo.referenceId}`);
    } else if (todo.type === 'material') {
        navigate('/learning');
    } else if (todo.type === 'practice') {
        // Instead of starting immediately, navigate to practice page and open details
        navigate(`/practice?course=${todo.referenceId}`);
    }
  };

  const startEdit = (todo: TodoItem) => {
    setEditTodo({
      title: todo.title,
      dueDate: todo.dueDate ? format(todo.dueDate.toDate(), 'yyyy-MM-dd') : ''
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
    } catch (error) {
      toast.error('Chyba při aktualizaci úkolu');
    }
  };

  const deleteTodo = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'todos', id));
      toast.success('Úkol smazán');
    } catch (error) {
      toast.error('Chyba při mazání úkolu');
    }
  };

  const getIcon = (type: TodoItem['type']) => {
    switch(type) {
      case 'practice': return <GraduationCap size={18} className="text-brand-blue" />;
      case 'test': return <FileText size={18} className="text-brand-orange" />;
      case 'material': return <BookOpen size={18} className="text-purple-500" />;
      default: return <CheckCircle2 size={18} className="text-gray-400" />;
    }
  };

  const renderDetails = () => {
    if (!viewingDetails) return null;

    let content = null;
    const { type, referenceId } = viewingDetails;

    if (type === 'practice') {
      const course = courses.find(c => c.id === referenceId);
      if (course) {
        content = (
          <div className="space-y-4">
            <p className="text-gray-600 leading-relaxed">{course.description}</p>
            <div className="flex flex-wrap gap-2">
              {course.topics?.map(topic => (
                <span key={topic} className="px-3 py-1 bg-brand-blue/5 text-brand-blue rounded-lg text-sm font-medium">
                  {topic}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500 pt-2 border-t border-gray-50">
              <span className="flex items-center gap-1.5"><BookOpen size={14} /> {course.questionCount} otázek</span>
              <span className="flex items-center gap-1.5"><GraduationCap size={14} /> {course.difficulty}</span>
            </div>
          </div>
        );
      }
    } else if (type === 'test') {
      const test = tests.find(t => t.id === referenceId);
      if (test) {
        content = (
          <div className="space-y-3">
            <p className="text-gray-600">{test.description || 'Žádný popis k dispozici.'}</p>
            <p className="text-sm font-medium text-brand-orange flex items-center gap-1.5">
              <FileText size={16} /> Počet otázek: {test.questions?.length || 0}
            </p>
          </div>
        );
      }
    } else if (type === 'material') {
      const sheet = sheets.find(s => s.id === referenceId);
      if (sheet) {
        content = (
          <div className="space-y-2">
            <p className="text-gray-600 font-medium">Předmět: <span className="text-brand-blue">{sheet.subject}</span></p>
            <p className="text-gray-600 font-medium">Téma: <span className="text-brand-blue">{sheet.topic}</span></p>
            <p className="text-sm text-gray-400">Úroveň: {sheet.level}</p>
          </div>
        );
      }
    } else {
        content = <p className="text-gray-500 italic">Tento úkol nemá k dispozici žádné podrobnosti.</p>;
    }

    return (
      <Dialog open={!!viewingDetails} onOpenChange={(open) => !open && setViewingDetails(null)}>
        <DialogContent className="rounded-[2.5rem] p-8 border-none shadow-2xl max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gray-50 rounded-xl">
                    {getIcon(viewingDetails.type)}
                </div>
                <DialogTitle className="text-2xl font-display font-bold text-brand-blue underline decoration-brand-orange-light decoration-4 underline-offset-4">
                    Podrobnosti úkolu
                </DialogTitle>
            </div>
          </DialogHeader>
          <div className="py-2">
            <h4 className="text-xl font-bold text-brand-blue mb-4">{viewingDetails.title}</h4>
            {content}
          </div>
          <DialogFooter className="mt-6 gap-2 sm:flex-row flex-col">
            {viewingDetails.referenceId && (
                <Button 
                    onClick={() => {
                        handleLaunchTask(viewingDetails);
                        setViewingDetails(null);
                    }}
                    disabled={isLaunching === viewingDetails.id}
                    className="flex-1 btn-blue rounded-xl h-12 font-bold gap-2"
                >
                    {isLaunching === viewingDetails.id ? <Loader2 className="animate-spin" size={20} /> : <><ExternalLink size={18} /> Spustit úkol</>}
                </Button>
            )}
            <Button variant="outline" onClick={() => setViewingDetails(null)} className="flex-1 rounded-xl h-12 font-bold border-gray-100">
              Zavřít
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="space-y-6">
      {/* Details Dialog */}
      {renderDetails()}

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
              <Label className="font-bold text-gray-700">Termín (volitelné)</Label>
              <div className="relative">
                <Input 
                  type="date" 
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

      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-display font-bold text-brand-blue flex items-center gap-2">
          <Clock className="text-brand-orange" />
          {isTeacherView ? 'TODO list studenta' : 'Můj TODO list'}
        </h3>
        
        <Dialog open={isAdding} onOpenChange={setIsAdding}>
          <DialogTrigger asChild>
            <Button className="rounded-2xl bg-brand-blue hover:bg-brand-blue/90 text-white font-bold h-12 px-6 flex items-center gap-2 shadow-lg active:scale-95 transition-all">
              <Plus size={20} />
              <span>Přidat úkol</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-[2.5rem] p-8 border-none shadow-2xl max-w-md">
            <DialogHeader>
              <DialogTitle className="text-2xl font-display font-bold text-brand-blue">Přidat novou aktivitu</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Typ aktivity</Label>
                <Select value={newTodo.type} onValueChange={(val: any) => setNewTodo({ ...newTodo, type: val, referenceId: '' })}>
                  <SelectTrigger className="rounded-xl h-12 border-gray-100 bg-gray-50/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="practice">Procvičování</SelectItem>
                    <SelectItem value="test">Test</SelectItem>
                    <SelectItem value="material">Studijní materiál</SelectItem>
                    <SelectItem value="custom">Vlastní úkol</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newTodo.type !== 'custom' && (
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Vybrat ze seznamu</Label>
                  <Select value={newTodo.referenceId} onValueChange={(val) => setNewTodo({ ...newTodo, referenceId: val })}>
                    <SelectTrigger className="rounded-xl h-12 border-gray-100 bg-gray-50/50">
                      <SelectValue placeholder="Vyberte..." />
                    </SelectTrigger>
                    <SelectContent>
                      {newTodo.type === 'practice' && courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                      {newTodo.type === 'test' && tests.map(t => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                      {newTodo.type === 'material' && sheets.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Název úkolu {newTodo.type !== 'custom' && '(automaticky se vyplní)'}</Label>
                <Input 
                  value={newTodo.title} 
                  onChange={e => setNewTodo({ ...newTodo, title: e.target.value })}
                  placeholder={newTodo.type === 'custom' ? "Např. Procvičit zlomky" : "Ponechte prázdné pro automatický název"}
                  className="rounded-xl h-12 border-gray-100 bg-gray-50/50 grayscale-input"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Termín (volitelné)</Label>
                <div className="relative">
                  <Input 
                    type="date" 
                    value={newTodo.dueDate} 
                    onChange={e => setNewTodo({ ...newTodo, dueDate: e.target.value })}
                    className="rounded-xl h-12 border-gray-100 bg-gray-50/50 pl-10"
                  />
                  <CalendarIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddTodo} className="w-full btn-blue rounded-xl h-12 font-bold text-lg">
                Uložit úkol
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {todos.length === 0 ? (
          <div className="text-center py-12 bg-gray-50/50 rounded-[2rem] border-2 border-dashed border-gray-100">
            <p className="text-gray-400 font-medium">Zatím nejsou naplánovány žádné úkoly.</p>
          </div>
        ) : (
          todos.map(todo => (
            <Card key={todo.id} className={`rounded-[1.5rem] border-none shadow-sm transition-all hover:shadow-md ${todo.completed ? 'opacity-60 bg-gray-50' : 'bg-white'}`}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                  <button 
                    onClick={() => toggleTodo(todo)}
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${todo.completed ? 'bg-green-500 text-white' : 'border-2 border-gray-200 text-gray-300 hover:border-brand-blue hover:text-brand-blue'}`}
                  >
                    {todo.completed ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                  </button>
                  
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-lg ${todo.completed ? 'line-through text-gray-400' : 'text-brand-blue'}`}>
                        {todo.title}
                      </span>
                      <div className="p-1.5 bg-gray-50 rounded-lg">
                        {getIcon(todo.type)}
                      </div>
                      {todo.referenceId && (
                         <button 
                            onClick={() => setViewingDetails(todo)}
                            className="p-1 text-brand-orange hover:bg-brand-orange/10 rounded-lg transition-colors"
                            title="Zobrazit podrobnosti"
                         >
                            <Info size={16} />
                         </button>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 mt-1">
                      {todo.dueDate && (
                        <span className={`text-sm flex items-center gap-1.5 font-medium ${new Date(todo.dueDate.toDate()) < new Date() && !todo.completed ? 'text-red-500' : 'text-gray-500'}`}>
                          <CalendarIcon size={14} />
                          {format(todo.dueDate.toDate(), 'd. MMMM', { locale: cs })}
                        </span>
                      )}
                      <span className="text-xs text-gray-300 flex items-center gap-1">
                        přidáno {format(todo.createdAt.toDate(), 'd.M.')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                    {todo.referenceId && (
                        <Button 
                        variant="ghost" 
                        size="icon" 
                        className="rounded-xl text-brand-orange hover:text-brand-orange hover:bg-brand-orange/10"
                        title="Spustit úkol"
                        onClick={() => handleLaunchTask(todo)}
                        disabled={isLaunching === todo.id}
                        >
                        {isLaunching === todo.id ? <Loader2 size={18} className="animate-spin" /> : <ExternalLink size={18} />}
                        </Button>
                    )}
                    <Button 
                    variant="ghost" 
                    size="icon" 
                    className="rounded-xl text-gray-300 hover:text-brand-blue hover:bg-brand-blue/10"
                    onClick={() => startEdit(todo)}
                    >
                    <Pencil size={18} />
                    </Button>
                    <Button 
                    variant="ghost" 
                    size="icon" 
                    className="rounded-xl text-red-300 hover:text-red-500 hover:bg-red-50"
                    onClick={() => deleteTodo(todo.id)}
                    >
                    <Trash2 size={18} />
                    </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
