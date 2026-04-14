import { useState, useEffect } from 'react';
import { collection, query, getDocs, addDoc, Timestamp, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Test, UserProfile, AssignedTest, LearningSheet, MathTopic, Question, PracticeCourse } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Plus, Users, FileText, CheckCircle, Send, BookOpen, Trash2, Sparkles, Loader2, UploadCloud, GraduationCap, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { extractQuestionsFromTwoPDFs } from '../services/geminiService';
import TestImporter from '../components/TestImporter';

const SUBJECTS = [
  'Matematika',
  'Čeština',
  'Angličtina',
  'Fyzika',
  'Chemie',
  'Biologie',
  'Dějepis',
  'Zeměpis'
];

const LEVELS = [
  '1. stupeň ZŠ',
  '2. stupeň ZŠ',
  'Střední škola'
];

const MATH_TOPICS: MathTopic[] = [
  'Aritmetika', 
  'Geometrie', 
  'Zlomky a procenta', 
  'Rovnice', 
  'Slovní úlohy', 
  'Jednotky a měření'
];

export default function TeacherDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [tests, setTests] = useState<Test[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [assignedTests, setAssignedTests] = useState<AssignedTest[]>([]);
  const [learningSheets, setLearningSheets] = useState<LearningSheet[]>([]);
  const [practiceCourses, setPracticeCourses] = useState<PracticeCourse[]>([]);
  const [isAddingTest, setIsAddingTest] = useState(false);
  const [isAddingSheet, setIsAddingSheet] = useState(false);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [isImportingPDF, setIsImportingPDF] = useState(false);
  const [isAddingCourse, setIsAddingCourse] = useState(false);
  const [isAssigningTest, setIsAssigningTest] = useState(false);
  const [isUploadingSheet, setIsUploadingSheet] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isProcessingPDF, setIsProcessingPDF] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<MathTopic>('Aritmetika');
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');
  const [viewingCourseId, setViewingCourseId] = useState<string | null>(null);

  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question> & { id?: string, imageFile?: File | null }>({ question: '', options: ['', '', '', ''], correctAnswer: '', topic: 'Aritmetika', courseId: '', imageFile: null });

  // Form states
  const [newSheet, setNewSheet] = useState<{ title: string, subject: string, level: string, topic: MathTopic, file: File | null }>({ title: '', subject: 'Matematika', level: '2. stupeň ZŠ', topic: 'Aritmetika', file: null });
  const [newQuestion, setNewQuestion] = useState<Partial<Question> & { imageFile?: File | null }>({ question: '', options: ['', '', '', ''], correctAnswer: '', topic: 'Aritmetika', courseId: '', imageFile: null });
  const [pdfImport, setPdfImport] = useState<{ questionsFile: File | null, answersFile: File | null, topic: MathTopic, courseId: string }>({ questionsFile: null, answersFile: null, topic: 'Aritmetika', courseId: '' });
  const [newCourse, setNewCourse] = useState<{ title: string, description: string, topic: MathTopic, difficulty: string, duration: string, color: string }>({
    title: '', description: '', topic: 'Aritmetika', difficulty: 'Začátečník', duration: '4 týdny', color: 'bg-blue-50'
  });
  const [newAssignment, setNewAssignment] = useState<{ courseId: string, dueDate: string }>({ courseId: '', dueDate: '' });

  useEffect(() => {
    if (!profile) return;

    const unsubTests = onSnapshot(collection(db, 'tests'), (snap) => {
      setTests(snap.docs.map(d => ({ id: d.id, ...d.data() } as Test)));
    });

    const unsubStudents = onSnapshot(query(collection(db, 'users'), where('role', '==', 'student')), (snap) => {
      setStudents(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    });

    const unsubAssigned = onSnapshot(collection(db, 'assignedTests'), (snap) => {
      setAssignedTests(snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignedTest)));
    });

    const unsubSheets = onSnapshot(collection(db, 'learningSheets'), (snap) => {
      setLearningSheets(snap.docs.map(d => ({ id: d.id, ...d.data() } as LearningSheet)));
    });

    const unsubQuestions = onSnapshot(collection(db, 'questions'), (snap) => {
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() } as Question)));
    });

    const unsubCourses = onSnapshot(collection(db, 'practiceCourses'), (snap) => {
      setPracticeCourses(snap.docs.map(d => ({ id: d.id, ...d.data() } as PracticeCourse)));
    });

    return () => {
      unsubTests();
      unsubStudents();
      unsubAssigned();
      unsubSheets();
      unsubQuestions();
      unsubCourses();
    };
  }, [profile]);

  const handleDeleteTest = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tests', id));
      toast.success('Test byl smazán');
    } catch (error) {
      toast.error('Chyba při mazání testu');
    }
  };

  const handleAssignTest = async () => {
    if (!selectedStudent || !newAssignment.courseId || !newAssignment.dueDate) {
      toast.error('Vyplňte prosím všechny údaje pro přiřazení.');
      return;
    }

    const course = practiceCourses.find(c => c.id === newAssignment.courseId);
    if (!course) return;

    try {
      await addDoc(collection(db, 'assignedTests'), {
        testId: course.id,
        studentId: selectedStudent.uid,
        testTitle: course.title,
        status: 'pending',
        assignedAt: Timestamp.now(),
        dueDate: Timestamp.fromDate(new Date(newAssignment.dueDate))
      });
      toast.success('Test byl úspěšně přiřazen studentovi');
      setIsAssigningTest(false);
      setNewAssignment({ courseId: '', dueDate: '' });
    } catch (error) {
      console.error(error);
      toast.error('Chyba při přiřazování testu');
    }
  };

  const handleSaveQuestion = async () => {
    if (!newQuestion.question || !newQuestion.correctAnswer || newQuestion.options?.some(o => !o)) {
      toast.error('Prosím vyplňte všechna pole otázky');
      return;
    }

    try {
      let imageUrl = newQuestion.imageUrl || '';
      if (newQuestion.imageFile) {
        if (newQuestion.imageFile.size > 800 * 1024) {
          toast.error('Obrázek je příliš velký. Maximální velikost je 800KB.');
          return;
        }
        const buffer = await newQuestion.imageFile.arrayBuffer();
        const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        imageUrl = `data:${newQuestion.imageFile.type};base64,${base64}`;
      }

      const questionData: any = {
        question: newQuestion.question,
        options: newQuestion.options,
        correctAnswer: newQuestion.correctAnswer,
        topic: newQuestion.topic,
        createdBy: profile?.uid,
        createdAt: Timestamp.now()
      };
      
      if (newQuestion.courseId) questionData.courseId = newQuestion.courseId;
      if (imageUrl) questionData.imageUrl = imageUrl;

      await addDoc(collection(db, 'questions'), questionData);
      toast.success('Otázka byla úspěšně přidána');
      setIsAddingQuestion(false);
      setNewQuestion({ question: '', options: ['', '', '', ''], correctAnswer: '', topic: 'Aritmetika', courseId: '', imageFile: null });
    } catch (error) {
      console.error(error);
      toast.error('Chyba při ukládání otázky');
    }
  };

  const handleUpdateQuestion = async () => {
    if (!editingQuestion.id || !editingQuestion.question || !editingQuestion.correctAnswer || editingQuestion.options?.some(o => !o)) {
      toast.error('Prosím vyplňte všechna pole otázky');
      return;
    }

    try {
      let imageUrl = editingQuestion.imageUrl || '';
      if (editingQuestion.imageFile) {
        if (editingQuestion.imageFile.size > 800 * 1024) {
          toast.error('Obrázek je příliš velký. Maximální velikost je 800KB.');
          return;
        }
        const buffer = await editingQuestion.imageFile.arrayBuffer();
        const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        imageUrl = `data:${editingQuestion.imageFile.type};base64,${base64}`;
      }

      const questionData: any = {
        question: editingQuestion.question,
        options: editingQuestion.options,
        correctAnswer: editingQuestion.correctAnswer,
        topic: editingQuestion.topic,
      };
      
      if (editingQuestion.courseId) questionData.courseId = editingQuestion.courseId;
      if (imageUrl) questionData.imageUrl = imageUrl;

      await updateDoc(doc(db, 'questions', editingQuestion.id), questionData);
      toast.success('Otázka byla úspěšně upravena');
      setIsEditingQuestion(false);
      setEditingQuestion({ question: '', options: ['', '', '', ''], correctAnswer: '', topic: 'Aritmetika', courseId: '', imageFile: null });
    } catch (error) {
      console.error(error);
      toast.error('Chyba při úpravě otázky');
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'questions', id));
      toast.success('Otázka byla smazána');
    } catch (error) {
      toast.error('Chyba při mazání otázky');
    }
  };

  const handleSaveSheet = async () => {
    if (!newSheet.title || !newSheet.file) {
      toast.error('Prosím vyplňte název materiálu a přiložte PDF soubor');
      return;
    }

    setIsUploadingSheet(true);
    try {
      let fileUrl = '';
      let fileType = '';

      if (newSheet.file) {
        if (newSheet.file.size > 800 * 1024) {
          toast.error('Soubor je příliš velký. Maximální velikost je 800KB.');
          setIsUploadingSheet(false);
          return;
        }
        const buffer = await newSheet.file.arrayBuffer();
        const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        fileUrl = `data:${newSheet.file.type};base64,${base64}`;
        fileType = newSheet.file.type;
      }

      await addDoc(collection(db, 'learningSheets'), {
        title: newSheet.title,
        subject: newSheet.subject,
        level: newSheet.level,
        topic: newSheet.topic,
        fileUrl,
        fileType,
        createdBy: profile?.uid,
        createdAt: Timestamp.now()
      });
      toast.success('Materiál byl úspěšně vytvořen');
      setIsAddingSheet(false);
      setNewSheet({ title: '', subject: 'Matematika', level: '2. stupeň ZŠ', topic: 'Aritmetika', file: null });
    } catch (error) {
      console.error(error);
      toast.error('Chyba při ukládání materiálu');
    } finally {
      setIsUploadingSheet(false);
    }
  };

  const handleDeleteSheet = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'learningSheets', id));
      toast.success('Materiál byl smazán');
    } catch (error) {
      toast.error('Chyba při mazání materiálu');
    }
  };

  const handleImportPDF = async () => {
    if (!pdfImport.questionsFile || !pdfImport.answersFile) {
      toast.error('Nahrajte prosím obě PDF (otázky i odpovědi).');
      return;
    }

    setIsProcessingPDF(true);
    try {
      const qBuffer = await pdfImport.questionsFile.arrayBuffer();
      const aBuffer = await pdfImport.answersFile.arrayBuffer();
      const qBase64 = btoa(new Uint8Array(qBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
      const aBase64 = btoa(new Uint8Array(aBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));

      const extractedQuestions = await extractQuestionsFromTwoPDFs(qBase64, aBase64, pdfImport.topic);
      
      if (extractedQuestions.length === 0) {
        toast.error('Nepodařilo se extrahovat žádné otázky.');
        return;
      }

      // Save all extracted questions to Firestore
      for (const q of extractedQuestions) {
        await addDoc(collection(db, 'questions'), {
          ...q,
          courseId: pdfImport.courseId,
          createdBy: profile?.uid,
          createdAt: Timestamp.now()
        });
      }

      toast.success(`Úspěšně importováno ${extractedQuestions.length} otázek.`);
      setIsImportingPDF(false);
      setPdfImport({ questionsFile: null, answersFile: null, topic: 'Aritmetika', courseId: '' });
    } catch (error) {
      console.error(error);
      toast.error('Chyba při zpracování PDF. Zkuste to prosím znovu.');
    } finally {
      setIsProcessingPDF(false);
    }
  };

  const handleSaveCourse = async () => {
    if (!newCourse.title || !newCourse.description) {
      toast.error('Vyplňte prosím název a popis sekce.');
      return;
    }

    try {
      await addDoc(collection(db, 'practiceCourses'), {
        ...newCourse,
        createdBy: profile?.uid,
        createdAt: Timestamp.now()
      });
      toast.success('Nová sekce procvičování byla vytvořena.');
      setIsAddingCourse(false);
      setNewCourse({ title: '', description: '', topic: 'Aritmetika', difficulty: 'Začátečník', duration: '4 týdny', color: 'bg-blue-50' });
    } catch (error) {
      console.error(error);
      toast.error('Chyba při vytváření sekce.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold text-brand-blue">Učitelský portál</h1>
          <p className="text-gray-500 text-lg">Spravujte své studenty, testy a výukové materiály.</p>
        </div>
      </header>

      <Tabs defaultValue="practices" className="space-y-6">
        <TabsList className="bg-white border-2 border-gray-50 p-1 rounded-2xl h-16 shadow-sm overflow-x-auto flex-nowrap w-full justify-start">
          <TabsTrigger value="practices" className="rounded-xl px-6 h-full data-[state=active]:bg-blue-50 data-[state=active]:text-brand-blue font-bold">
            <CheckCircle size={18} className="mr-2" /> Procvičování
          </TabsTrigger>
          <TabsTrigger value="materials" className="rounded-xl px-6 h-full data-[state=active]:bg-blue-50 data-[state=active]:text-brand-blue font-bold">
            <BookOpen size={18} className="mr-2" /> Materiály
          </TabsTrigger>
          <TabsTrigger value="courses" className="rounded-xl px-6 h-full data-[state=active]:bg-blue-50 data-[state=active]:text-brand-blue font-bold">
            <GraduationCap size={18} className="mr-2" /> Kurzy
          </TabsTrigger>
          <TabsTrigger value="students" className="rounded-xl px-6 h-full data-[state=active]:bg-blue-50 data-[state=active]:text-brand-blue font-bold">
            <Users size={18} className="mr-2" /> Správa studentů
          </TabsTrigger>
        </TabsList>

        <TabsContent value="practices">
          <div className="mb-6 flex justify-end">
            <Button onClick={() => setIsAddingCourse(true)} className="btn-blue rounded-xl gap-2 h-12">
              <Plus size={18} /> Nová sekce procvičování
            </Button>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {practiceCourses.map(course => (
              <Card key={course.id} className="rounded-[2rem] border-none shadow-xl hover:shadow-2xl transition-all bg-white overflow-hidden flex flex-col">
                <CardHeader className={`${course.color} pb-4`}>
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-1 bg-white/50 text-gray-700 rounded-lg text-[10px] font-bold uppercase">
                      {course.topic}
                    </span>
                    <span className="px-2 py-1 bg-white/50 text-gray-700 rounded-lg text-[10px] font-bold uppercase">
                      {course.difficulty}
                    </span>
                  </div>
                  <CardTitle className="text-xl font-display mt-4">{course.title}</CardTitle>
                  <CardDescription className="text-gray-600">{course.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 flex-1 flex flex-col justify-between space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Počet otázek:</span>
                    <span className="font-bold text-brand-blue">{questions.filter(q => q.courseId === course.id).length}</span>
                  </div>
                  <div className="flex flex-col gap-2 mt-4">
                    <Button 
                      onClick={() => setViewingCourseId(course.id)}
                      variant="outline" 
                      className="w-full rounded-xl border-2 hover:bg-blue-50 hover:text-brand-blue hover:border-blue-100 transition-all"
                    >
                      <FileText size={16} className="mr-2" /> Zobrazit otázky
                    </Button>
                    <Button 
                      onClick={() => {
                        setSelectedCourseId(course.id);
                        setNewQuestion({...newQuestion, courseId: course.id, topic: course.topic});
                        setIsAddingQuestion(true);
                      }}
                      variant="outline" 
                      className="w-full rounded-xl border-2 hover:bg-blue-50 hover:text-brand-blue hover:border-blue-100 transition-all"
                    >
                      <Plus size={16} className="mr-2" /> Přidat otázku
                    </Button>
                    <Button 
                      onClick={() => {
                        setSelectedCourseId(course.id);
                        setPdfImport({...pdfImport, courseId: course.id, topic: course.topic});
                        setIsImportingPDF(true);
                      }}
                      variant="outline" 
                      className="w-full rounded-xl border-2 hover:bg-blue-50 hover:text-brand-blue hover:border-blue-100 transition-all"
                    >
                      <UploadCloud size={16} className="mr-2" /> Importovat z PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {practiceCourses.length === 0 && (
              <div className="col-span-full text-center py-20 bg-white/50 rounded-[3rem] border-2 border-dashed border-gray-100">
                <FolderOpen size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-400 font-bold">Zatím nemáte žádná procvičování</p>
                <Button onClick={() => setIsAddingCourse(true)} className="mt-4 btn-blue rounded-xl">
                  Vytvořit první procvičování
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="materials">
          <div className="mb-6 flex justify-end">
            <Button onClick={() => setIsAddingSheet(true)} className="btn-blue rounded-xl gap-2 h-12">
              <Plus size={18} /> Nový materiál
            </Button>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {learningSheets.map(sheet => (
              <Card key={sheet.id} className="rounded-[2rem] border-none shadow-xl hover:shadow-2xl transition-all bg-white overflow-hidden">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-xl font-display">{sheet.title}</CardTitle>
                    <div className="flex flex-col gap-1 items-end">
                      <span className="px-2 py-1 bg-purple-50 text-brand-purple rounded-lg text-[10px] font-bold uppercase">
                        {sheet.subject}
                      </span>
                      <span className="px-2 py-1 bg-blue-50 text-brand-blue rounded-lg text-[10px] font-bold uppercase">
                        {sheet.level}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {sheet.fileUrl && (
                    <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between border border-gray-100">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <FileText className="text-brand-blue shrink-0" size={24} />
                        <span className="text-sm font-bold truncate">Přiložený soubor</span>
                      </div>
                      <Button variant="outline" size="sm" className="rounded-lg" onClick={() => window.open(sheet.fileUrl, '_blank')}>
                        Otevřít
                      </Button>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleDeleteSheet(sheet.id)}
                      className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={18} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {learningSheets.length === 0 && (
              <div className="col-span-full text-center py-20 bg-white/50 rounded-[3rem] border-2 border-dashed border-gray-100">
                <BookOpen size={48} className="mx-auto text-gray-200 mb-4" />
                <p className="text-gray-400 font-bold">Zatím nemáte žádné materiály</p>
                <Button onClick={() => setIsAddingSheet(true)} className="mt-4 btn-blue rounded-xl">
                  Přidat první materiál
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="courses">
          <div className="text-center py-32 bg-white/50 rounded-[3rem] border-2 border-dashed border-gray-100">
            <GraduationCap size={64} className="mx-auto text-gray-200 mb-6" />
            <h2 className="text-2xl font-display font-bold text-gray-700 mb-2">Sekce Kurzy</h2>
            <p className="text-gray-500 max-w-md mx-auto">Tato sekce se momentálně připravuje pro další vývoj. Brzy zde budete moci vytvářet komplexní výukové programy.</p>
          </div>
        </TabsContent>

        <TabsContent value="students">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {students.map(student => (
              <Card key={student.uid} className="rounded-[2rem] border-none shadow-xl hover:shadow-2xl transition-all overflow-hidden bg-white">
                <CardHeader className="bg-blue-50/30 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 bg-white shadow-md rounded-2xl flex items-center justify-center text-brand-blue font-display text-2xl font-bold">
                      {student.name.charAt(0)}
                    </div>
                    <div>
                      <CardTitle className="text-xl font-display">{student.name}</CardTitle>
                      <CardDescription className="text-gray-400">{student.email}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-500">Přiřazené testy:</span>
                    <span className="font-bold text-brand-blue">{assignedTests.filter(at => at.studentId === student.uid).length}</span>
                  </div>
                  
                  {student.focusAreas && student.focusAreas.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-orange-500 uppercase tracking-wider">Doporučení AI:</div>
                      <div className="flex flex-wrap gap-1">
                        {student.focusAreas?.map((area, i) => (
                          <span key={i} className="px-2 py-1 bg-orange-50 text-orange-600 rounded-lg text-[10px] font-bold">
                            {area}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 mt-4">
                    <Button 
                      onClick={() => setSelectedStudent(student)}
                      variant="outline" 
                      className="w-full rounded-xl border-2 hover:bg-blue-50 hover:text-brand-blue hover:border-blue-100 transition-all"
                    >
                      Profil žáka
                    </Button>
                    <Dialog open={isAssigningTest && selectedStudent?.uid === student.uid} onOpenChange={(open) => {
                      setIsAssigningTest(open);
                      if (open) setSelectedStudent(student);
                      else setSelectedStudent(null);
                    }}>
                      <DialogTrigger render={<Button className="w-full rounded-xl gap-2 btn-blue transition-all" />}>
                        <Send size={16} /> Přiřadit test
                      </DialogTrigger>
                      <DialogContent className="rounded-3xl">
                        <DialogHeader>
                          <DialogTitle>Přiřadit test pro {student.name}</DialogTitle>
                          <DialogDescription>Vyberte procvičování a datum odevzdání.</DialogDescription>
                        </DialogHeader>
                        <div className="py-4 space-y-4">
                          <div className="space-y-2">
                            <Label>Vyberte procvičování</Label>
                            <Select onValueChange={(val: string) => setNewAssignment({...newAssignment, courseId: val})}>
                              <SelectTrigger className="rounded-xl">
                                <SelectValue placeholder="Vyberte procvičování..." />
                              </SelectTrigger>
                              <SelectContent>
                                {practiceCourses.map(course => (
                                  <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Datum odevzdání</Label>
                            <Input 
                              type="date" 
                              className="rounded-xl h-12"
                              value={newAssignment.dueDate}
                              onChange={(e) => setNewAssignment({...newAssignment, dueDate: e.target.value})}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={handleAssignTest} className="btn-blue w-full rounded-xl">
                            Přiřadit test
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* View Questions Dialog */}
      <Dialog open={!!viewingCourseId} onOpenChange={(open) => !open && setViewingCourseId(null)}>
        <DialogContent className="max-w-[90vw] sm:max-w-[90vw] w-[90vw] h-[90vh] max-h-[90vh] p-0 rounded-[2.5rem] flex flex-col border-none shadow-2xl overflow-hidden">
          <div className="p-8 pb-6 border-b border-gray-100 bg-blue-50/30 flex-shrink-0">
            <div className="max-w-6xl mx-auto w-full">
              <DialogHeader>
                 <DialogTitle className="text-3xl font-display font-bold text-brand-blue">
                   Otázky v sekci: {practiceCourses.find(c => c.id === viewingCourseId)?.title}
                 </DialogTitle>
              </DialogHeader>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
            <div className="max-w-6xl mx-auto space-y-6 w-full">
              {questions.filter(q => q.courseId === viewingCourseId).map(q => (
                <Card key={q.id} className="rounded-[2rem] border-none shadow-sm bg-white overflow-hidden">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <span className="px-2 py-1 bg-blue-50 text-brand-blue rounded-lg text-[10px] font-bold uppercase">
                        {q.topic}
                      </span>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            setEditingQuestion(q);
                            setIsEditingQuestion(true);
                          }}
                          className="text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        >
                          <Edit size={18} />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={18} />
                        </Button>
                      </div>
                    </div>
                    <CardTitle className="text-lg font-display mt-2">{q.question}</CardTitle>
                    {q.imageUrl && (
                      <div className="mt-4">
                        <img src={q.imageUrl} alt="Obrázek k otázce" className="max-h-48 rounded-xl object-contain" />
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {q.options.map((opt, i) => (
                        <div key={i} className={`p-3 rounded-xl text-sm ${opt === q.correctAnswer ? 'bg-green-50 text-green-700 font-bold border border-green-200' : 'bg-gray-50 text-gray-600 border border-transparent'}`}>
                          {opt}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {questions.filter(q => q.courseId === viewingCourseId).length === 0 && (
                <div className="text-center py-20 bg-white/50 rounded-[3rem] border-2 border-dashed border-gray-100">
                  <FileText size={48} className="mx-auto text-gray-200 mb-4" />
                  <p className="text-gray-400 font-bold">V této sekci zatím nejsou žádné otázky</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Question Dialog */}
      <Dialog open={isAddingQuestion} onOpenChange={setIsAddingQuestion}>
        <DialogContent className="max-w-[90vw] sm:max-w-[90vw] w-[90vw] h-[90vh] max-h-[90vh] p-0 rounded-[2.5rem] flex flex-col border-none shadow-2xl overflow-hidden">
          <div className="p-8 pb-6 border-b border-gray-100 bg-blue-50/30 flex-shrink-0">
            <div className="max-w-6xl mx-auto w-full">
              <DialogHeader>
                 <DialogTitle className="text-3xl font-display font-bold text-brand-blue">Nová otázka do banky</DialogTitle>
              </DialogHeader>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
            <div className="max-w-6xl mx-auto space-y-8 w-full">
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Téma</Label>
                <Select value={newQuestion.topic} onValueChange={(val: MathTopic) => setNewQuestion({...newQuestion, topic: val})}>
                  <SelectTrigger className="rounded-xl h-12 border-gray-100 bg-white">
                    <SelectValue placeholder="Vyberte téma..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MATH_TOPICS.map(topic => (
                      <SelectItem key={topic} value={topic}>{topic}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Znění otázky</Label>
                <Textarea 
                  value={newQuestion.question} 
                  onChange={e => setNewQuestion({...newQuestion, question: e.target.value})}
                  placeholder="Zadejte otázku..."
                  className="rounded-xl min-h-[150px] border-gray-100 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Obrázek (volitelné)</Label>
                <Input 
                  type="file" 
                  accept="image/*"
                  onChange={e => setNewQuestion({...newQuestion, imageFile: e.target.files?.[0] || null})}
                  className="rounded-xl h-12 border-gray-100 bg-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-brand-blue hover:file:bg-blue-100"
                />
              </div>
              <div className="space-y-4">
                <Label className="font-bold text-gray-700">Možnosti odpovědí</Label>
                {newQuestion.options?.map((opt, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Input 
                      value={opt}
                      onChange={e => {
                        const newOptions = [...(newQuestion.options || [])];
                        newOptions[i] = e.target.value;
                        setNewQuestion({...newQuestion, options: newOptions});
                      }}
                      placeholder={`Možnost ${i + 1}`}
                      className="rounded-xl h-14 border-gray-100 bg-white"
                    />
                    <Button
                      variant={newQuestion.correctAnswer === opt && opt !== '' ? 'default' : 'outline'}
                      onClick={() => setNewQuestion({...newQuestion, correctAnswer: opt})}
                      className={`rounded-xl h-14 px-8 ${newQuestion.correctAnswer === opt && opt !== '' ? 'bg-green-500 hover:bg-green-600 text-white' : ''}`}
                      disabled={!opt}
                    >
                      Správná
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="p-6 border-t border-gray-100 bg-white flex-shrink-0">
            <div className="max-w-6xl mx-auto w-full">
              <DialogFooter>
                <Button onClick={handleSaveQuestion} className="btn-purple w-full rounded-xl h-14 text-lg font-bold">
                  Uložit otázku
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Question Dialog */}
      <Dialog open={isEditingQuestion} onOpenChange={setIsEditingQuestion}>
        <DialogContent className="max-w-[90vw] sm:max-w-[90vw] w-[90vw] h-[90vh] max-h-[90vh] p-0 rounded-[2.5rem] flex flex-col border-none shadow-2xl overflow-hidden">
          <div className="p-8 pb-6 border-b border-gray-100 bg-blue-50/30 flex-shrink-0">
            <div className="max-w-6xl mx-auto w-full">
              <DialogHeader>
                 <DialogTitle className="text-3xl font-display font-bold text-brand-blue">Upravit otázku</DialogTitle>
              </DialogHeader>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
            <div className="max-w-6xl mx-auto space-y-8 w-full">
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Téma</Label>
                <Select value={editingQuestion.topic} onValueChange={(val: MathTopic) => setEditingQuestion({...editingQuestion, topic: val})}>
                  <SelectTrigger className="rounded-xl h-12 border-gray-100 bg-white">
                    <SelectValue placeholder="Vyberte téma..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MATH_TOPICS.map(topic => (
                      <SelectItem key={topic} value={topic}>{topic}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Znění otázky</Label>
                <Textarea 
                  value={editingQuestion.question} 
                  onChange={e => setEditingQuestion({...editingQuestion, question: e.target.value})}
                  placeholder="Zadejte otázku..."
                  className="rounded-xl min-h-[150px] border-gray-100 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Obrázek (volitelné)</Label>
                {editingQuestion.imageUrl && !editingQuestion.imageFile && (
                  <div className="mb-2">
                    <img src={editingQuestion.imageUrl} alt="Současný obrázek" className="h-24 rounded-lg object-contain" />
                  </div>
                )}
                <Input 
                  type="file" 
                  accept="image/*"
                  onChange={e => setEditingQuestion({...editingQuestion, imageFile: e.target.files?.[0] || null})}
                  className="rounded-xl h-12 border-gray-100 bg-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-brand-blue hover:file:bg-blue-100"
                />
              </div>
              <div className="space-y-4">
                <Label className="font-bold text-gray-700">Možnosti odpovědí</Label>
                {editingQuestion.options?.map((opt, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Input 
                      value={opt}
                      onChange={e => {
                        const newOptions = [...(editingQuestion.options || [])];
                        newOptions[i] = e.target.value;
                        setEditingQuestion({...editingQuestion, options: newOptions});
                      }}
                      placeholder={`Možnost ${i + 1}`}
                      className="rounded-xl h-14 border-gray-100 bg-white"
                    />
                    <Button
                      variant={editingQuestion.correctAnswer === opt && opt !== '' ? 'default' : 'outline'}
                      onClick={() => setEditingQuestion({...editingQuestion, correctAnswer: opt})}
                      className={`rounded-xl h-14 px-8 ${editingQuestion.correctAnswer === opt && opt !== '' ? 'bg-green-500 hover:bg-green-600 text-white' : ''}`}
                      disabled={!opt}
                    >
                      Správná
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="p-6 border-t border-gray-100 bg-white flex-shrink-0">
            <div className="max-w-6xl mx-auto w-full">
              <DialogFooter>
                <Button onClick={handleUpdateQuestion} className="w-full btn-blue rounded-xl h-14 text-lg font-bold">
                  Uložit změny
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Student Profile Dialog */}
      <Dialog open={!!selectedStudent} onOpenChange={(open) => !open && setSelectedStudent(null)}>
        <DialogContent className="max-w-4xl w-full h-[80vh] flex flex-col rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
          <div className="p-8 pb-6 border-b border-gray-100 bg-blue-50/30 flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white shadow-md rounded-2xl flex items-center justify-center text-brand-blue font-display text-3xl font-bold">
                {selectedStudent?.name.charAt(0)}
              </div>
              <div>
                <DialogTitle className="text-3xl font-display font-bold text-brand-blue">
                  {selectedStudent?.name}
                </DialogTitle>
                <DialogDescription className="text-gray-500 text-lg">
                  {selectedStudent?.email}
                </DialogDescription>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Historie aktivit a testů</h3>
            <div className="space-y-4">
              {assignedTests.filter(at => at.studentId === selectedStudent?.uid).map(at => (
                <Card key={at.id} className="rounded-2xl border-none shadow-sm bg-white">
                  <div className="p-6 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-lg text-gray-900">{at.testTitle}</h4>
                      <p className="text-sm text-gray-500">
                        Přiřazeno: {at.assignedAt.toDate().toLocaleDateString('cs-CZ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {at.status === 'pending' && <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold uppercase">Čeká na splnění</span>}
                      {at.status === 'submitted' && <span className="px-3 py-1 bg-orange-50 text-brand-orange rounded-full text-xs font-bold uppercase">Čeká na opravu</span>}
                      {at.status === 'graded' && (
                        <div className="text-right">
                          <div className="text-2xl font-black text-brand-blue">{at.grade}</div>
                          <div className="text-[10px] uppercase font-bold text-gray-400">Známka</div>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
              {assignedTests.filter(at => at.studentId === selectedStudent?.uid).length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-400 font-bold">Student zatím nemá žádné aktivity.</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Add Sheet Dialog */}
      <Dialog open={isAddingSheet} onOpenChange={setIsAddingSheet}>
        <DialogContent className="max-w-[90vw] sm:max-w-[90vw] w-[90vw] h-[90vh] max-h-[90vh] p-0 rounded-[2.5rem] flex flex-col border-none shadow-2xl overflow-hidden">
          <div className="p-8 pb-6 border-b border-gray-100 bg-blue-50/30 flex-shrink-0">
            <div className="max-w-6xl mx-auto w-full">
              <DialogHeader>
                <DialogTitle className="text-3xl font-display font-bold text-brand-blue">Nový výukový materiál</DialogTitle>
              </DialogHeader>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
            <div className="max-w-6xl mx-auto space-y-8 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Název materiálu</Label>
                  <Input 
                    value={newSheet.title} 
                    onChange={e => setNewSheet({...newSheet, title: e.target.value})}
                    placeholder="Např. Pravidla pravopisu"
                    className="rounded-xl h-14 border-gray-100 bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Téma</Label>
                  <Select value={newSheet.topic} onValueChange={(val: MathTopic) => setNewSheet({...newSheet, topic: val})}>
                    <SelectTrigger className="rounded-xl h-14 border-gray-100 bg-white">
                      <SelectValue placeholder="Vyberte téma..." />
                    </SelectTrigger>
                    <SelectContent>
                      {MATH_TOPICS.map(topic => (
                        <SelectItem key={topic} value={topic}>{topic}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Předmět</Label>
                  <Select value={newSheet.subject} onValueChange={(val: string) => setNewSheet({...newSheet, subject: val})}>
                    <SelectTrigger className="rounded-xl h-14 border-gray-100 bg-white">
                      <SelectValue placeholder="Vyberte předmět..." />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBJECTS.map(subject => (
                        <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Stupeň</Label>
                  <Select value={newSheet.level} onValueChange={(val: string) => setNewSheet({...newSheet, level: val})}>
                    <SelectTrigger className="rounded-xl h-14 border-gray-100 bg-white">
                      <SelectValue placeholder="Vyberte stupeň..." />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.map(level => (
                        <SelectItem key={level} value={level}>{level}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Přiložit soubor (PDF, obrázek)</Label>
                <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 flex flex-col items-center justify-center bg-white hover:bg-gray-50 transition-colors cursor-pointer relative">
                  <input 
                    type="file" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                    accept="application/pdf,image/*"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        setNewSheet({...newSheet, file: e.target.files[0]});
                      }
                    }}
                  />
                  <UploadCloud className="text-gray-400 mb-4" size={48} />
                  <span className="text-lg font-bold text-gray-600">
                    {newSheet.file ? newSheet.file.name : 'Klikněte pro výběr souboru'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="p-6 border-t border-gray-100 bg-white flex-shrink-0">
            <div className="max-w-6xl mx-auto w-full">
              <DialogFooter>
                <Button onClick={handleSaveSheet} disabled={isUploadingSheet} className="btn-orange w-full h-14 rounded-2xl text-lg font-bold">
                  {isUploadingSheet ? <><Loader2 className="mr-2 animate-spin" size={18} /> Ukládám...</> : 'Vytvořit materiál'}
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import PDF Dialog */}
      <Dialog open={isImportingPDF} onOpenChange={setIsImportingPDF}>
        <DialogContent className="max-w-[90vw] sm:max-w-[90vw] w-[90vw] h-[90vh] max-h-[90vh] p-0 rounded-[2.5rem] flex flex-col border-none shadow-2xl overflow-hidden">
          <div className="p-8 pb-6 border-b border-gray-100 bg-blue-50/30 flex-shrink-0">
            <div className="max-w-6xl mx-auto w-full">
              <DialogHeader>
                <DialogTitle className="text-3xl font-display font-bold text-brand-blue">Importovat otázky z PDF</DialogTitle>
                <DialogDescription className="text-lg mt-2">Nahrajte PDF s otázkami a PDF se správnými odpověďmi. AI z nich vytvoří otázky do banky.</DialogDescription>
              </DialogHeader>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
            <div className="max-w-6xl mx-auto space-y-8 w-full">
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Téma</Label>
                <Select value={pdfImport.topic} onValueChange={(val: MathTopic) => setPdfImport({...pdfImport, topic: val})}>
                  <SelectTrigger className="rounded-xl h-14 border-gray-100 bg-white">
                    <SelectValue placeholder="Vyberte téma..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MATH_TOPICS.map(topic => (
                      <SelectItem key={topic} value={topic}>{topic}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">PDF s otázkami</Label>
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 flex flex-col items-center justify-center bg-white hover:bg-gray-50 transition-colors cursor-pointer relative">
                    <input 
                      type="file" 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                      accept="application/pdf"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          setPdfImport({...pdfImport, questionsFile: e.target.files[0]});
                        }
                      }}
                    />
                    <UploadCloud className="text-brand-blue mb-4" size={48} />
                    <span className="text-lg font-bold text-gray-600 text-center">
                      {pdfImport.questionsFile ? pdfImport.questionsFile.name : 'Vybrat PDF s otázkami'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">PDF s odpověďmi</Label>
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 flex flex-col items-center justify-center bg-white hover:bg-gray-50 transition-colors cursor-pointer relative">
                    <input 
                      type="file" 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                      accept="application/pdf"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          setPdfImport({...pdfImport, answersFile: e.target.files[0]});
                        }
                      }}
                    />
                    <UploadCloud className="text-green-500 mb-4" size={48} />
                    <span className="text-lg font-bold text-gray-600 text-center">
                      {pdfImport.answersFile ? pdfImport.answersFile.name : 'Vybrat PDF s odpověďmi'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="p-6 border-t border-gray-100 bg-white flex-shrink-0">
            <div className="max-w-6xl mx-auto w-full">
              <DialogFooter>
                <Button onClick={handleImportPDF} disabled={isProcessingPDF || !pdfImport.questionsFile || !pdfImport.answersFile} className="btn-blue w-full h-14 rounded-2xl text-lg font-bold">
                  {isProcessingPDF ? <><Loader2 className="mr-2 animate-spin" size={18} /> Zpracovávám PDF...</> : 'Importovat otázky'}
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Course Dialog */}
      <Dialog open={isAddingCourse} onOpenChange={setIsAddingCourse}>
        <DialogContent className="max-w-[90vw] sm:max-w-[90vw] w-[90vw] h-[90vh] max-h-[90vh] p-0 rounded-[2.5rem] flex flex-col border-none shadow-2xl overflow-hidden">
          <div className="p-8 pb-6 border-b border-gray-100 bg-blue-50/30 flex-shrink-0">
            <div className="max-w-6xl mx-auto w-full">
              <DialogHeader>
                <DialogTitle className="text-3xl font-display font-bold text-brand-blue">Nová sekce procvičování</DialogTitle>
              </DialogHeader>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
            <div className="max-w-6xl mx-auto space-y-8 w-full">
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Název sekce</Label>
                <Input 
                  value={newCourse.title} 
                  onChange={e => setNewCourse({...newCourse, title: e.target.value})}
                  placeholder="Např. Příprava na přijímačky"
                  className="rounded-xl h-14 border-gray-100 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Popis</Label>
                <Textarea 
                  value={newCourse.description} 
                  onChange={e => setNewCourse({...newCourse, description: e.target.value})}
                  placeholder="Krátký popis sekce..."
                  className="rounded-xl min-h-[120px] border-gray-100 bg-white"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Téma</Label>
                  <Select value={newCourse.topic} onValueChange={(val: MathTopic) => setNewCourse({...newCourse, topic: val})}>
                    <SelectTrigger className="rounded-xl h-14 border-gray-100 bg-white">
                      <SelectValue placeholder="Vyberte téma..." />
                    </SelectTrigger>
                    <SelectContent>
                      {MATH_TOPICS.map(topic => (
                        <SelectItem key={topic} value={topic}>{topic}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Obtížnost</Label>
                  <Select value={newCourse.difficulty} onValueChange={(val: string) => setNewCourse({...newCourse, difficulty: val})}>
                    <SelectTrigger className="rounded-xl h-14 border-gray-100 bg-white">
                      <SelectValue placeholder="Vyberte obtížnost..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Začátečník">Začátečník</SelectItem>
                      <SelectItem value="Středně pokročilý">Středně pokročilý</SelectItem>
                      <SelectItem value="Pokročilý">Pokročilý</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Délka (např. 4 týdny)</Label>
                  <Input 
                    value={newCourse.duration} 
                    onChange={e => setNewCourse({...newCourse, duration: e.target.value})}
                    className="rounded-xl h-14 border-gray-100 bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Barva</Label>
                  <Select value={newCourse.color} onValueChange={(val: string) => setNewCourse({...newCourse, color: val})}>
                    <SelectTrigger className="rounded-xl h-14 border-gray-100 bg-white">
                      <SelectValue placeholder="Vyberte barvu..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bg-blue-50">Modrá</SelectItem>
                      <SelectItem value="bg-purple-50">Fialová</SelectItem>
                      <SelectItem value="bg-orange-50">Oranžová</SelectItem>
                      <SelectItem value="bg-green-50">Zelená</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
          <div className="p-6 border-t border-gray-100 bg-white flex-shrink-0">
            <div className="max-w-6xl mx-auto w-full">
              <DialogFooter>
                <Button onClick={handleSaveCourse} className="btn-blue w-full h-14 rounded-2xl text-lg font-bold">
                  Vytvořit sekci
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
