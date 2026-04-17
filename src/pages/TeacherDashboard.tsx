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
import { Plus, Users, FileText, CheckCircle, Send, BookOpen, Trash2, Sparkles, Loader2, UploadCloud, GraduationCap, FolderOpen, Edit, ArrowRight, Eye, EyeOff, Settings, User as UserIcon, Percent, Shapes } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { extractQuestionsFromTwoPDFs } from '../services/geminiService';
import TestImporter from '../components/TestImporter';
import TodoManager from '../components/TodoManager';
import { Clock } from 'lucide-react';

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
  'Funkce',
  'Statistika',
  'Jednotky a měření'
];

export default function TeacherDashboard() {
  const { profile, setIsProfileSettingsOpen } = useAuth();
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

  const [editingCourse, setEditingCourse] = useState<PracticeCourse | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());

  const [selectedSheetForView, setSelectedSheetForView] = useState<LearningSheet | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isTodoViewOpen, setIsTodoViewOpen] = useState(false);
  const [viewingStudentForTodo, setViewingStudentForTodo] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (selectedSheetForView?.fileUrl && selectedSheetForView.fileUrl.startsWith('data:')) {
      try {
        const dataURI = selectedSheetForView.fileUrl;
        const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
        const byteString = atob(dataURI.split(',')[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: mimeString });
        const url = URL.createObjectURL(blob);
        setPdfBlobUrl(url);
        return () => URL.revokeObjectURL(url);
      } catch (e) {
        console.error('Failed to create blob from data URI', e);
        setPdfBlobUrl(selectedSheetForView.fileUrl);
      }
    } else if (selectedSheetForView?.fileUrl) {
      setPdfBlobUrl(selectedSheetForView.fileUrl);
    } else {
      setPdfBlobUrl(null);
    }
  }, [selectedSheetForView]);

  // Form states
  const [newSheet, setNewSheet] = useState<{ title: string, subject: string, level: string, topic: MathTopic, file: File | null }>({ title: '', subject: 'Matematika', level: '2. stupeň ZŠ', topic: 'Aritmetika', file: null });
  const [newQuestion, setNewQuestion] = useState<Partial<Question> & { imageFile?: File | null }>({ question: '', options: ['', '', '', ''], correctAnswer: '', topic: 'Aritmetika', topics: [], courseId: '', imageFile: null });
  const [pdfImport, setPdfImport] = useState<{ questionsFile: File | null, answersFile: File | null, topic: string, topics?: string[], courseId: string }>({ questionsFile: null, answersFile: null, topic: 'Aritmetika', topics: [], courseId: '' });
  const [newCourse, setNewCourse] = useState<{ title: string, description: string, topics: string[], difficulty: string, questionCount: number, color: string }>({
    title: '', description: '', topics: [], difficulty: 'Začátečník', questionCount: 10, color: '#eff6ff'
  });
  const [dbCustomTopics, setDbCustomTopics] = useState<string[]>([]);
  const [newTopicInput, setNewTopicInput] = useState('');
  const [customCourseTopic, setCustomCourseTopic] = useState('');
  const allTopics = Array.from(new Set([...MATH_TOPICS, ...dbCustomTopics]));

  const handleToggleTopic = (topic: string, mode: 'new' | 'edit' | 'pdf' = 'new') => {
    if (mode === 'edit') {
      const q = editingQuestion;
      const currentTopics = q.topics || (q.topic && q.topic !== 'Aritmetika' ? [q.topic] : []);
      const newTopics = currentTopics.includes(topic) ? currentTopics.filter(t => t !== topic) : [...currentTopics, topic];
      setEditingQuestion({ ...q, topics: newTopics, topic: newTopics[0] || 'Aritmetika' });
    } else if (mode === 'pdf') {
      const q = pdfImport;
      const currentTopics = q.topics || (q.topic && q.topic !== 'Aritmetika' ? [q.topic] : []);
      const newTopics = currentTopics.includes(topic) ? currentTopics.filter(t => t !== topic) : [...currentTopics, topic];
      setPdfImport({ ...q, topics: newTopics, topic: newTopics[0] || 'Aritmetika' });
    } else {
      const q = newQuestion;
      const currentTopics = q.topics || (q.topic && q.topic !== 'Aritmetika' ? [q.topic] : []);
      const newTopics = currentTopics.includes(topic) ? currentTopics.filter(t => t !== topic) : [...currentTopics, topic];
      setNewQuestion({ ...q, topics: newTopics, topic: newTopics[0] || 'Aritmetika' });
    }
  };

  const handleCreateCustomTopic = async (mode: 'new' | 'edit' | 'pdf' = 'new') => {
    if (!newTopicInput.trim()) return;
    const t = newTopicInput.trim();
    if (!allTopics.includes(t)) {
      try {
        await addDoc(collection(db, 'customTopics'), { name: t });
      } catch (e) {
        console.warn('DB uložení selhalo, propisuji lokálně', e);
        setDbCustomTopics(prev => [...prev, t]);
      }
    }
    handleToggleTopic(t, mode);
    setNewTopicInput('');
  };

  const [newAssignment, setNewAssignment] = useState<{ courseId: string, dueDate: string }>({ courseId: '', dueDate: '' });

  useEffect(() => {
    if (!profile) return;

    // Real-time listenery pouze pro data, kde je to skutečně potřeba
    const unsubStudents = onSnapshot(query(collection(db, 'users'), where('role', '==', 'student')), (snap) => {
      setStudents(snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile)));
    });

    const unsubAssigned = onSnapshot(collection(db, 'assignedTests'), (snap) => {
      setAssignedTests(snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignedTest)));
    });

    // Jednorázové načtení pro data, která se v průběhu session nemění — šetří Firestore reads
    const loadStaticData = async () => {
      const [testsSnap, questionsSnap, sheetsSnap, coursesSnap, topicsSnap] = await Promise.all([
        getDocs(collection(db, 'tests')),
        getDocs(collection(db, 'questions')),
        getDocs(collection(db, 'learningSheets')),
        getDocs(collection(db, 'practiceCourses')),
        getDocs(collection(db, 'customTopics')),
      ]);
      setTests(testsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Test)));
      setQuestions(questionsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Question)));
      setLearningSheets(sheetsSnap.docs.map(d => ({ id: d.id, ...d.data() } as LearningSheet)));
      setPracticeCourses(coursesSnap.docs.map(d => ({ id: d.id, ...d.data() } as PracticeCourse)));
      setDbCustomTopics(topicsSnap.docs.map(d => d.data().name as string));
    };
    loadStaticData();

    return () => {
      unsubStudents();
      unsubAssigned();
    };
  }, [profile]);

  const handleBulkDeleteQuestions = async () => {
    const idsToDelete = Array.from(selectedQuestionIds);
    try {
      await Promise.all(idsToDelete.map((id: string) => deleteDoc(doc(db, 'questions', id))));
      // Optmistická aktualizace lokálního stavu — bez re-fetch
      setQuestions(prev => prev.filter(q => !selectedQuestionIds.has(q.id)));
      toast.success(`Smazáno ${idsToDelete.length} otázek`);
      setSelectedQuestionIds(new Set());
    } catch (error) {
      toast.error('Chyba při hromadném mazání');
      console.error(error);
    }
  };

  const handleEditCourse = async () => {
    if (!editingCourse) return;
    if (!editingCourse.title || !editingCourse.topics?.length) {
      toast.error('Zadejte prosím název a alespoň jedno téma.');
      return;
    }
    try {
      const updatePayload = {
        title: editingCourse.title,
        description: editingCourse.description,
        topics: editingCourse.topics,
        difficulty: editingCourse.difficulty,
        questionCount: editingCourse.questionCount
      };
      await updateDoc(doc(db, 'practiceCourses', editingCourse.id), updatePayload);
      // Optmistická aktualizace lokálního stavu — bez re-fetch
      setPracticeCourses(prev => prev.map(c => c.id === editingCourse.id ? { ...c, ...updatePayload } : c));
      // Nová témata uložit asynchronně v pozadí (nečekej na výsledek)
      const newTopics = editingCourse.topics.filter(t => !allTopics.includes(t));
      if (newTopics.length > 0) {
        Promise.all(newTopics.map(t => addDoc(collection(db, 'customTopics'), { name: t })))
          .then(() => setDbCustomTopics(prev => [...new Set([...prev, ...newTopics])]));
      }
      toast.success('Procvičování úspěšně upraveno');
      setEditingCourse(null);
    } catch (err) {
      toast.error('Chyba při úpravě procvičování');
      console.error(err);
    }
  };

  const handleDeleteTest = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tests', id));
      // Optmistická aktualizace lokálního stavu — bez re-fetch
      setTests(prev => prev.filter(t => t.id !== id));
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
        topics: newQuestion.topics || [],
        createdBy: profile?.uid,
        createdAt: Timestamp.now()
      };

      if (newQuestion.courseId && newQuestion.courseId !== 'none') questionData.courseId = newQuestion.courseId;
      if (imageUrl) questionData.imageUrl = imageUrl;

      const docRef = await addDoc(collection(db, 'questions'), questionData);
      // Optmistická aktualizace lokálního stavu — bez re-fetch
      setQuestions(prev => [...prev, { id: docRef.id, ...questionData }]);
      toast.success('Otázka byla úspěšně přidána');
      setIsAddingQuestion(false);
      setNewQuestion({ question: '', options: ['', '', '', ''], correctAnswer: '', topic: 'Aritmetika', topics: [], courseId: '', imageFile: null });
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
        topics: editingQuestion.topics || [],
      };

      if (editingQuestion.courseId && editingQuestion.courseId !== 'none') questionData.courseId = editingQuestion.courseId;
      if (imageUrl) questionData.imageUrl = imageUrl;

      await updateDoc(doc(db, 'questions', editingQuestion.id), questionData);
      // Optmistická aktualizace lokálního stavu — bez re-fetch
      setQuestions(prev => prev.map(q => q.id === editingQuestion.id ? { ...q, ...questionData } : q));
      toast.success('Otázka byla úspěšně upravena');
      setIsEditingQuestion(false);
      setEditingQuestion({ question: '', options: ['', '', '', ''], correctAnswer: '', topic: 'Aritmetika', topics: [], courseId: '', imageFile: null });
    } catch (error) {
      console.error(error);
      toast.error('Chyba při úpravě otázky');
    }
  };

  const toggleCourseVisibility = async (course: PracticeCourse) => {
    try {
      const newVisibility = course.isVisible !== false ? false : true;
      await updateDoc(doc(db, 'practiceCourses', course.id), {
        isVisible: newVisibility
      });
      setPracticeCourses(prev => prev.map(c => c.id === course.id ? { ...c, isVisible: newVisibility } : c));
      toast.success(newVisibility ? 'Kurz je nyní viditelný pro studenty' : 'Kurz byl skryt pro studenty');
    } catch (err) {
      toast.error('Chyba při změně viditelnosti');
    }
  };

  const handleDeleteCourse = async (id: string) => {
    if (!window.confirm('Opravdu chcete smazat tuto sekci? Otázky v ní zůstanou, ale nebudou k ní přiřazeny.')) return;
    try {
      await deleteDoc(doc(db, 'practiceCourses', id));
      setPracticeCourses(prev => prev.filter(c => c.id !== id));
      toast.success('Sekce byla smazána');
    } catch (err) {
      toast.error('Chyba při mazání sekce');
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'questions', id));
      // Optmistická aktualizace lokálního stavu — bez re-fetch
      setQuestions(prev => prev.filter(q => q.id !== id));
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
        if (newSheet.file.size > 5 * 1024 * 1024) {
          toast.error('Soubor je příliš velký. K uložení lze nahrát max. 5 MB.');
          setIsUploadingSheet(false);
          return;
        }

        fileType = newSheet.file.type;

        // Rule 12: Storage paths must be namespaced: learningSheets/{teacherUid}/{fileId}
        const teacherUid = profile?.uid || 'anonymous';
        const fileRef = ref(storage, `learningSheets/${teacherUid}/${Date.now()}_${newSheet.file.name}`);
        const snapshot = await uploadBytes(fileRef, newSheet.file, {
          contentType: fileType,
          // Ensure it opens inline in the browser iframe instead of auto-downloading
          customMetadata: {
            contentDisposition: 'inline'
          }
        });
        fileUrl = await getDownloadURL(snapshot.ref);
      }

      const sheetData = {
        title: newSheet.title,
        subject: newSheet.subject,
        level: newSheet.level,
        topic: newSheet.topic,
        fileUrl,
        fileType,
        createdBy: profile?.uid,
        createdAt: Timestamp.now()
      };
      const docRef = await addDoc(collection(db, 'learningSheets'), sheetData);
      // Optmistická aktualizace lokálního stavu — bez re-fetch
      setLearningSheets(prev => [...prev, { id: docRef.id, ...sheetData } as LearningSheet]);
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
      // Optmistická aktualizace lokálního stavu — bez re-fetch
      setLearningSheets(prev => prev.filter(s => s.id !== id));
      toast.success('Materiál byl smazán');
    } catch (error) {
      toast.error('Chyba při mazání materiálu');
    }
  };

  const handleImportPDF = async () => {
    if (!pdfImport.questionsFile) {
      toast.error('Nahrajte prosím soubor (PDF nebo JSON).');
      return;
    }

    setIsProcessingPDF(true);
    try {
      let extractedQuestions: Question[] = [];
      const isJson = pdfImport.questionsFile.type === 'application/json' || pdfImport.questionsFile.name.endsWith('.json');

      if (isJson) {
        const text = await pdfImport.questionsFile.text();
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          extractedQuestions = data;
        } else if (data.questions && Array.isArray(data.questions)) {
          extractedQuestions = data.questions;
        } else {
          throw new Error('JSON nemá správnou strukturu (očekáváno pole otázek)');
        }
      } else {
        if (!pdfImport.answersFile) {
          toast.error('Pro PDF import nahrajte prosím i soubor se správnými odpověďmi.');
          setIsProcessingPDF(false);
          return;
        }

        const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = err => reject(err);
        });

        const qBase64 = await fileToBase64(pdfImport.questionsFile);
        const aBase64 = await fileToBase64(pdfImport.answersFile);

        extractedQuestions = await extractQuestionsFromTwoPDFs(qBase64, aBase64, pdfImport.topic);
      }

      if (extractedQuestions.length === 0) {
        toast.error('Nepodařilo se extrahovat žádné otázky.');
        return;
      }

      // Paralelní zápis všech otázek najednou (místo sekvenčního for loopu)
      const savePromises = extractedQuestions.map(q => {
        const qData: any = {
          ...q,
          topic: pdfImport.topic,
          topics: pdfImport.topics || (pdfImport.topic && pdfImport.topic !== 'Aritmetika' ? [pdfImport.topic] : []),
          createdBy: profile?.uid,
          createdAt: Timestamp.now()
        };
        if (pdfImport.courseId && pdfImport.courseId !== 'none') qData.courseId = pdfImport.courseId;
        return addDoc(collection(db, 'questions'), qData).then(ref => ({ id: ref.id, ...qData }));
      });
      const savedQuestions = await Promise.all(savePromises);
      // Optmistická aktualizace lokálního stavu — bez re-fetch
      setQuestions(prev => [...prev, ...savedQuestions]);

      toast.success(`Úspěšně importováno ${extractedQuestions.length} otázek.`);
      setIsImportingPDF(false);
      setPdfImport({ questionsFile: null, answersFile: null, topic: 'Aritmetika', topics: [], courseId: '' });
    } catch (error: any) {
      console.error(error);
      toast.error('Chyba při zpracování: ' + (error?.message || 'Zkuste to prosím znovu.'));
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
      const courseData = {
        ...newCourse,
        createdBy: profile?.uid,
        createdAt: Timestamp.now()
      };
      const docRef = await addDoc(collection(db, 'practiceCourses'), courseData);
      // Optmistická aktualizace lokálního stavu — bez re-fetch
      setPracticeCourses(prev => [...prev, { id: docRef.id, ...courseData } as PracticeCourse]);
      toast.success('Nová sekce procvičování byla vytvořena.');
      setIsAddingCourse(false);
      setNewCourse({ title: '', description: '', topics: [], difficulty: 'Začátečník', questionCount: 10, color: '#eff6ff' });
    } catch (error) {
      console.error(error);
      toast.error('Chyba při vytváření sekce.');
    }
  };

  return (
    <div className="w-[80%] mx-auto py-12 space-y-10 overflow-x-hidden">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-4 md:px-0">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-[2rem] bg-white shadow-xl flex items-center justify-center overflow-hidden border-4 border-white">
            {profile?.photoURL ? (
              <img src={profile.photoURL} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <UserIcon size={40} className="text-brand-blue" />
            )}
          </div>
          <div className="space-y-1">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-brand-blue">
              Učitelský portál
            </h1>
            <p className="text-gray-500 text-lg">Ahoj, {profile?.name}! Spravujte své studenty a materiály.</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button 
            onClick={() => setIsProfileSettingsOpen(true)}
            className="h-16 px-8 rounded-[1.5rem] bg-white text-brand-blue border-none shadow-xl hover:bg-gray-50 font-bold flex items-center gap-3 active:scale-95 transition-all"
          >
            <Settings size={22} className="text-brand-orange" />
            <span>Nastavení profilu</span>
          </Button>
        </div>
      </header>

      <Tabs defaultValue="practices" className="space-y-6">
        <TabsList className="bg-white/50 backdrop-blur-md border-2 border-gray-100/50 p-1.5 rounded-3xl h-20 shadow-sm overflow-x-auto flex-nowrap w-full justify-start mb-10">
          <TabsTrigger value="practices" className="rounded-2xl px-8 h-full data-[state=active]:bg-white data-[state=active]:text-brand-blue data-[state=active]:shadow-lg font-bold transition-all gap-2 text-base">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-brand-blue group-data-[state=active]:bg-brand-blue group-data-[state=active]:text-white">
              <CheckCircle size={20} />
            </div>
            Procvičování
          </TabsTrigger>
          <TabsTrigger value="materials" className="rounded-2xl px-8 h-full data-[state=active]:bg-white data-[state=active]:text-brand-purple data-[state=active]:shadow-lg font-bold transition-all gap-2 text-base">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-brand-purple">
              <BookOpen size={20} />
            </div>
            Materiály
          </TabsTrigger>
          <TabsTrigger value="courses" className="rounded-2xl px-8 h-full data-[state=active]:bg-white data-[state=active]:text-green-600 data-[state=active]:shadow-lg font-bold transition-all gap-2 text-base">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
              <GraduationCap size={20} />
            </div>
            Kurzy
          </TabsTrigger>
          <TabsTrigger value="students" className="rounded-2xl px-8 h-full data-[state=active]:bg-white data-[state=active]:text-brand-orange data-[state=active]:shadow-lg font-bold transition-all gap-2 text-base">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-brand-orange">
              <Users size={20} />
            </div>
            Správa studentů
          </TabsTrigger>
        </TabsList>

        <TabsContent value="practices" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white/50 p-8 rounded-[2.5rem] border border-white/50 shadow-sm">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-2xl bg-brand-blue flex items-center justify-center text-white shadow-lg shadow-blue-100">
                  <CheckCircle size={24} />
                </div>
                <h2 className="text-3xl font-display font-bold text-brand-blue">Procvičování a banka úloh</h2>
              </div>
              <p className="text-gray-500 text-lg">Vytvářejte sady otázek a spravujte digitální procvičování pro studenty.</p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Button onClick={() => {
                setNewQuestion({ question: '', options: ['', '', '', ''], correctAnswer: '', topic: 'Aritmetika', topics: [], courseId: 'none', imageFile: null });
                setIsAddingQuestion(true);
              }} variant="outline" className="rounded-[1.25rem] px-6 h-14 border-2 hover:bg-white text-brand-blue font-bold shadow-sm transition-all hover:shadow-md">
                <Plus size={20} className="mr-2" /> Nová otázka
              </Button>
              <Button onClick={() => {
                setPdfImport({ questionsFile: null, answersFile: null, topic: 'Aritmetika', topics: [], courseId: 'none' });
                setIsImportingPDF(true);
              }} variant="outline" className="rounded-[1.25rem] px-6 h-14 border-2 hover:bg-white text-brand-blue font-bold shadow-sm transition-all hover:shadow-md">
                <UploadCloud size={20} className="mr-2" /> PDF / JSON Import
              </Button>
              <Button onClick={() => setIsAddingCourse(true)} className="btn-blue rounded-[1.25rem] px-8 h-14 font-bold shadow-xl shadow-blue-100">
                <Plus size={20} className="mr-2" /> Nová sekce
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {practiceCourses.map(course => (
              <Card key={course.id} className="rounded-[2.5rem] border-none shadow-xl hover:shadow-2xl transition-all bg-white overflow-hidden flex flex-col group">
                <CardHeader
                  className={`pb-8 px-8 pt-8 relative ${course.color?.startsWith('bg-') ? course.color : ''}`}
                  style={{ backgroundColor: course.color?.startsWith('#') ? course.color : undefined }}
                >
                  <div className="flex justify-between items-start mb-6 w-full">
                    <div className="flex flex-wrap gap-2 pr-2">
                      {(course.topics?.length ? course.topics : [course.topic]).map(t => (
                        <span key={t} className="px-3 py-1 bg-white/60 backdrop-blur-md text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-wider">
                          {t}
                        </span>
                      ))}
                    </div>
                      <div className="flex gap-2 shrink-0 bg-white/60 backdrop-blur-md p-1 rounded-xl">
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 rounded-lg ${course.isVisible === false ? 'text-gray-400 hover:text-gray-600' : 'text-brand-blue hover:text-blue-600'}`}
                          onClick={(e) => { e.stopPropagation(); toggleCourseVisibility(course); }}
                          title={course.isVisible === false ? 'Kurz je skrytý. Kliknutím zobrazíte.' : 'Kurz je viditelný. Kliknutím skryjete.'}
                        >
                          {course.isVisible === false ? <EyeOff size={16} /> : <Eye size={16} />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-brand-orange hover:text-orange-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCourse(course);
                          }}
                          title="Upravit kurz"
                        >
                          <Edit size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-red-500 hover:text-red-700"
                          onClick={(e) => { e.stopPropagation(); handleDeleteCourse(course.id); }}
                          title="Smazat kurz"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                  </div>
                  <div className="mb-2">
                    <span className="px-3 py-1 bg-white/60 backdrop-blur-md text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-wider">
                      {course.difficulty}
                    </span>
                  </div>
                  <CardTitle className="text-2xl font-display font-black text-gray-900 group-hover:text-brand-blue transition-colors">
                    {course.title}
                  </CardTitle>
                  <CardDescription className="text-gray-600 text-base mt-2 line-clamp-2">
                    {course.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-8 flex-1 flex flex-col justify-between">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl mb-6">
                    <div className="flex items-center gap-2 text-gray-500 font-bold">
                      <FileText size={18} />
                      <span className="text-sm">Počet otázek:</span>
                    </div>
                    <span className="font-black text-xl text-brand-blue">
                      {questions.filter(q => 
                        q.courseId === course.id || 
                        (q.topics && course.topics && q.topics.some(t => course.topics?.includes(t))) ||
                        (q.topic === course.topic)
                      ).length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    <Button
                      onClick={() => setViewingCourseId(course.id)}
                      variant="outline"
                      className="w-full h-14 rounded-2xl border-2 border-gray-100 hover:border-brand-blue hover:text-brand-blue font-bold px-6 transition-all"
                    >
                      Zobrazit seznam otázek
                    </Button>
                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        onClick={() => {
                          setSelectedCourseId(course.id);
                          setNewQuestion({ ...newQuestion, courseId: course.id, topic: course.topic });
                          setIsAddingQuestion(true);
                        }}
                        variant="secondary"
                        className="h-14 rounded-2xl bg-blue-50 text-brand-blue hover:bg-blue-100 font-black"
                      >
                        + Otázka
                      </Button>
                      <Button
                        onClick={() => {
                          setSelectedCourseId(course.id);
                          setPdfImport({ ...pdfImport, courseId: course.id, topic: course.topic });
                          setIsImportingPDF(true);
                        }}
                        variant="secondary"
                        className="h-14 rounded-2xl bg-orange-50 text-brand-orange hover:bg-orange-100 font-black"
                      >
                        PDF Import
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {practiceCourses.length === 0 && (
              <div className="col-span-full text-center py-32 bg-white/50 rounded-[3.5rem] border-2 border-dashed border-gray-200">
                <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center text-gray-400 mx-auto mb-6">
                  <FolderOpen size={40} />
                </div>
                <h3 className="text-xl font-display font-bold text-gray-700">Zatím nemáte žádná procvičování</h3>
                <p className="text-gray-400 mt-2">Vytvořte první sekci a začněte plnit banku otázek.</p>
                <Button onClick={() => setIsAddingCourse(true)} className="mt-8 btn-blue rounded-2xl h-14 px-10 font-bold">
                  Vytvořit první procvičování
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="materials" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white/50 p-8 rounded-[2.5rem] border border-white/50 shadow-sm">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-2xl bg-brand-purple flex items-center justify-center text-white shadow-lg shadow-purple-100">
                  <BookOpen size={24} />
                </div>
                <h2 className="text-3xl font-display font-bold text-brand-purple">Výukové materiály</h2>
              </div>
              <p className="text-gray-500 text-lg">Spravujte a sdílejte studijní materiály a PDF pracovní listy.</p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setIsAddingSheet(true)} className="btn-purple rounded-[1.25rem] px-8 h-14 font-bold shadow-xl shadow-purple-100">
                <Plus size={20} className="mr-2" /> Nový materiál
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {learningSheets.map(sheet => (
              <Card key={sheet.id} className="rounded-[2.5rem] border-none shadow-xl hover:shadow-2xl transition-all bg-white overflow-hidden group">
                <CardHeader className="bg-purple-50/50 pb-6 p-8">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-1 bg-white text-brand-purple rounded-xl text-[10px] font-black uppercase tracking-wider">
                        {sheet.subject}
                      </span>
                      <span className="px-3 py-1 bg-white text-brand-blue rounded-xl text-[10px] font-black uppercase tracking-wider">
                        {sheet.level}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSheet(sheet.id)}
                      className="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 size={20} />
                    </Button>
                  </div>
                  <CardTitle className="text-2xl font-display font-black text-gray-900 group-hover:text-brand-purple transition-colors">
                    {sheet.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-8 pt-4 space-y-4">
                  {sheet.fileUrl && (
                    <div className="bg-gray-50 rounded-2xl p-5 flex items-center justify-between border border-gray-100 group-hover:border-purple-100 transition-colors">
                      <div className="flex items-center gap-4 overflow-hidden">
                        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-brand-purple">
                          <FileText size={24} />
                        </div>
                        <div className="flex flex-col overflow-hidden">
                          <span className="text-sm font-black text-gray-900 truncate">Dokument PDF</span>
                          <span className="text-xs text-gray-400 uppercase font-black">{sheet.topic || 'Obecné'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <Button
                      variant="outline"
                      className="h-14 rounded-2xl border-2 border-gray-100 hover:border-brand-purple hover:text-brand-purple font-black"
                      onClick={() => setSelectedSheetForView(sheet)}
                    >
                      Zobrazit
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-14 rounded-2xl bg-purple-50 text-brand-purple hover:bg-purple-100 font-black"
                      onClick={() => {
                        const a = document.createElement('a');
                        a.href = sheet.fileUrl || '';
                        a.download = `${sheet.title || 'material'}.pdf`;
                        a.click();
                      }}
                    >
                      Stáhnout
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {learningSheets.length === 0 && (
              <div className="col-span-full text-center py-32 bg-white/50 rounded-[3.5rem] border-2 border-dashed border-gray-200">
                <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center text-gray-400 mx-auto mb-6">
                  <BookOpen size={40} />
                </div>
                <h3 className="text-xl font-display font-bold text-gray-700">Zatím nemáte žádné materiály</h3>
                <p className="text-gray-400 mt-2">Nahrajte první studijní list pro své žáky.</p>
                <Button onClick={() => setIsAddingSheet(true)} className="mt-8 btn-purple rounded-2xl h-14 px-10 font-bold">
                  Přidat první materiál
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="courses" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white/50 p-8 rounded-[2.5rem] border border-white/50 shadow-sm">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-2xl bg-green-500 flex items-center justify-center text-white shadow-lg shadow-green-100">
                  <GraduationCap size={24} />
                </div>
                <h2 className="text-3xl font-display font-bold text-green-600">Komplexní kurzy</h2>
              </div>
              <p className="text-gray-500 text-lg">Sestavujte dlouhodobé výukové plány a sledujte progres skupin.</p>
            </div>
          </div>

          <div className="text-center py-32 bg-white/40 backdrop-blur-sm rounded-[3.5rem] border-2 border-dashed border-gray-200">
            <div className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center text-green-200 mx-auto mb-8">
              <Sparkles size={48} />
            </div>
            <h2 className="text-3xl font-display font-black text-gray-700 mb-4">Brzy k dispozici</h2>
            <p className="text-gray-500 max-w-md mx-auto text-lg leading-relaxed">Pracujeme na modulu, který vám umožní spojit materiály a procvičování do ucelených kurzů s automatickým sledováním pokroku.</p>
          </div>
        </TabsContent>

        <TabsContent value="students" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white/50 p-8 rounded-[2.5rem] border border-white/50 shadow-sm">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-2xl bg-brand-orange flex items-center justify-center text-white shadow-lg shadow-orange-100">
                  <Users size={24} />
                </div>
                <h2 className="text-3xl font-display font-bold text-brand-orange">Správa studentů</h2>
              </div>
              <p className="text-gray-500 text-lg">Přehled vašich žáků, jejich aktivity a možnost přiřazování testů.</p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="rounded-[1.25rem] px-8 h-14 border-2 hover:bg-white text-brand-orange font-bold shadow-sm transition-all hover:shadow-md">
                Exportovat data
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {students.map(student => (
              <Card key={student.uid} className="rounded-[2.5rem] border-none shadow-xl hover:shadow-2xl transition-all overflow-hidden bg-white group">
                <CardHeader className="bg-orange-50/30 pb-6 p-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                    <Users size={80} />
                  </div>
                  <div className="flex items-center gap-4 relative z-10">
                    <div className="w-16 h-16 bg-white shadow-xl rounded-[1.25rem] flex items-center justify-center text-brand-orange font-display text-3xl font-black">
                      {student.name.charAt(0)}
                    </div>
                    <div>
                      <CardTitle className="text-2xl font-display font-black text-gray-900 leading-tight">{student.name}</CardTitle>
                      <CardDescription className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mt-1">{student.email}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-8 pt-6 space-y-6">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl transition-colors group-hover:bg-orange-50/50">
                    <div className="flex items-center gap-2 text-gray-500 font-bold">
                      <GraduationCap size={18} />
                      <span className="text-sm">Splněné testy:</span>
                    </div>
                    <span className="font-black text-xl text-brand-orange">
                      {assignedTests.filter(at => at.studentId === student.uid && at.status === 'graded').length}
                    </span>
                  </div>

                  {student.focusAreas && student.focusAreas.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-xs font-black text-orange-500 uppercase tracking-widest">
                        <Sparkles size={14} /> Doporučení AI:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {student.focusAreas?.slice(0, 3).map((area, i) => (
                          <span key={i} className="px-3 py-1.5 bg-orange-50 text-orange-600 rounded-xl text-[10px] font-black uppercase tracking-wider">
                            {area}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[60px] flex items-center text-gray-300 italic text-sm font-bold border-t border-dashed border-gray-100 pt-4">
                      Zatím žádná AI doporučení
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <Button
                      onClick={() => setSelectedStudent(student)}
                      variant="outline"
                      className="h-14 rounded-2xl border-2 border-gray-100 hover:border-brand-orange hover:text-brand-orange font-black"
                    >
                      Profil žáka
                    </Button>
                    <Button
                      onClick={() => {
                        setViewingStudentForTodo(student);
                        setIsTodoViewOpen(true);
                      }}
                      className="h-14 rounded-2xl gap-2 bg-brand-blue hover:bg-brand-blue/90 text-white font-black shadow-lg shadow-blue-100"
                    >
                      <Clock size={16} />
                      TODO List
                    </Button>
                    <Dialog open={isAssigningTest && selectedStudent?.uid === student.uid} onOpenChange={(open) => {
                      setIsAssigningTest(open);
                      if (open) setSelectedStudent(student);
                      else setSelectedStudent(null);
                    }}>
                      <DialogTrigger asChild>
                        <Button className="h-14 rounded-2xl gap-2 btn-orange shadow-lg shadow-orange-100 font-black">
                          Přiřadit test
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
                        <div className="p-8 pb-6 border-b border-gray-100 bg-orange-50/30">
                          <DialogTitle className="text-3xl font-display font-black text-brand-orange">Přiřadit test</DialogTitle>
                          <DialogDescription className="text-lg font-bold text-gray-500 mt-2">Student: {student.name}</DialogDescription>
                        </div>
                        <div className="p-8 space-y-6 bg-white">
                          <div className="space-y-3">
                            <Label className="font-black text-gray-700 uppercase tracking-widest text-xs">Výběr procvičování</Label>
                            <Select onValueChange={(val: string) => setNewAssignment({ ...newAssignment, courseId: val })}>
                              <SelectTrigger className="rounded-2xl h-14 border-gray-100 px-6">
                                <SelectValue placeholder="Vyberte téma procvičování..." />
                              </SelectTrigger>
                              <SelectContent className="rounded-2xl">
                                {([...practiceCourses]).map(course => (
                                  <SelectItem key={course.id} value={course.id || ''} className="rounded-xl">{course.title}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-3">
                            <Label className="font-black text-gray-700 uppercase tracking-widest text-xs">Datum odevzdání (Deadline)</Label>
                            <Input
                              type="date"
                              className="rounded-2xl h-14 border-gray-100 px-6"
                              value={newAssignment.dueDate}
                              onChange={(e) => setNewAssignment({ ...newAssignment, dueDate: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="p-8 bg-gray-50 border-t border-gray-100">
                          <Button onClick={handleAssignTest} className="btn-orange w-full rounded-2xl h-14 text-lg font-black shadow-xl shadow-orange-100">
                            Potvrdit a odeslat
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* TodoView Dialog for Teacher */}
      <Dialog open={isTodoViewOpen} onOpenChange={setIsTodoViewOpen}>
        <DialogContent className="max-w-4xl rounded-[3rem] p-0 overflow-hidden border-none shadow-3xl bg-gray-50/95 backdrop-blur-xl">
          <div className="p-10 pb-6 border-b border-white bg-brand-blue text-white relative">
            <div className="absolute top-0 right-0 p-10 opacity-10">
              <Clock size={120} />
            </div>
            <DialogHeader>
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                  <UserIcon size={24} />
                </div>
                <div className="space-y-0.5">
                  <DialogTitle className="text-3xl font-display font-black">TODO List studenta</DialogTitle>
                  <p className="font-bold text-blue-100">{viewingStudentForTodo?.name}</p>
                </div>
              </div>
            </DialogHeader>
          </div>
          <div className="p-10 max-h-[70vh] overflow-y-auto">
            {viewingStudentForTodo && (
              <TodoManager targetStudentId={viewingStudentForTodo.uid} isTeacherView={true} />
            )}
          </div>
          <div className="p-6 bg-white flex justify-end">
            <Button onClick={() => setIsTodoViewOpen(false)} variant="outline" className="rounded-2xl h-12 px-8 font-black border-2 border-gray-100 hover:bg-gray-50">
              Zavřít
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Questions Dialog */}
      <Dialog open={!!viewingCourseId} onOpenChange={(open) => !open && setViewingCourseId(null)}>
        <DialogContent className="max-w-[90vw] sm:max-w-[90vw] w-[90vw] h-[90vh] max-h-[90vh] p-0 rounded-[2.5rem] flex flex-col border-none shadow-2xl overflow-hidden">
          <div className="p-8 pb-6 border-b border-gray-100 bg-blue-50/30 flex-shrink-0">
            <div className="max-w-6xl mx-auto w-full">
              <DialogHeader>
                <div className="flex justify-between items-center w-full">
                  <DialogTitle className="text-3xl font-display font-bold text-brand-blue">
                    Otázky v sekci: {practiceCourses.find(c => c.id === viewingCourseId)?.title}
                  </DialogTitle>
                  {selectedQuestionIds.size > 0 && (
                    <Button onClick={handleBulkDeleteQuestions} className="bg-red-500 hover:bg-red-600 text-white rounded-xl shadow-md">
                      <Trash2 size={18} className="mr-2" />
                      Smazat vybrané ({selectedQuestionIds.size})
                    </Button>
                  )}
                </div>
              </DialogHeader>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
            <div className="max-w-6xl mx-auto space-y-6 w-full">
              {(() => {
                const currentCourse = practiceCourses.find(c => c.id === viewingCourseId);
                const filteredQuestions = questions.filter(q => 
                  q.courseId === viewingCourseId || 
                  (currentCourse && (
                    (q.topics && currentCourse.topics && q.topics.some(t => currentCourse.topics?.includes(t))) ||
                    (q.topic === currentCourse.topic)
                  ))
                );

                if (filteredQuestions.length === 0) {
                  return (
                    <div className="text-center py-20 bg-white/50 rounded-[3rem] border-2 border-dashed border-gray-100">
                      <FileText size={48} className="mx-auto text-gray-200 mb-4" />
                      <p className="text-gray-400 font-bold">V této sekci zatím nejsou žádné otázky</p>
                    </div>
                  );
                }

                return filteredQuestions.map(q => (
                  <Card key={q.id} className="rounded-[2rem] border-none shadow-sm bg-white overflow-hidden relative">
                    <div className="absolute top-6 left-6 z-10">
                      <input
                        type="checkbox"
                        checked={selectedQuestionIds.has(q.id)}
                        onChange={(e) => {
                          const newSelected = new Set(selectedQuestionIds);
                          if (e.target.checked) {
                            newSelected.add(q.id);
                          } else {
                            newSelected.delete(q.id);
                          }
                          setSelectedQuestionIds(newSelected);
                        }}
                        className="w-5 h-5 rounded-lg border-gray-300 text-brand-blue focus:ring-brand-blue"
                      />
                    </div>
                    <CardHeader className="pl-16 pt-6">
                      <div className="flex justify-between items-start">
                        <div className="flex gap-2">
                          {(q.topics?.length ? q.topics : [q.topic]).map(t => (
                            <span key={t} className="px-2 py-1 bg-blue-50 text-brand-blue text-[10px] font-bold rounded-lg uppercase">
                              {t}
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingQuestion(q);
                              setIsEditingQuestion(true);
                            }}
                            className="text-gray-400 hover:text-brand-blue hover:bg-blue-50 rounded-lg"
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
                        {q.options?.map((opt, i) => (
                          <div key={i} className={`p-3 rounded-xl text-sm ${opt === q.correctAnswer ? 'bg-green-50 text-green-700 font-bold border border-green-200' : 'bg-gray-50 text-gray-600 border border-transparent'}`}>
                            {opt}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ));
              })()}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3 col-span-1 md:col-span-2">
                  <Label className="font-bold text-gray-700">Témata (lze vybrat více)</Label>
                  <div className="flex flex-wrap gap-2">
                    {allTopics.map(topic => {
                      const isSelected = (newQuestion.topics || []).includes(topic);
                      return (
                        <div
                          key={topic}
                          onClick={() => handleToggleTopic(topic, 'new')}
                          className={`px-3 py-1.5 rounded-xl text-sm font-medium cursor-pointer transition-colors border ${isSelected ? 'bg-brand-purple text-white border-brand-purple shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                        >
                          {topic}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 max-w-sm">
                    <Input
                      placeholder="Přidat nové téma..."
                      value={newTopicInput}
                      onChange={e => setNewTopicInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCustomTopic('new'); } }}
                      className="rounded-xl border-gray-100 bg-white"
                    />
                    <Button type="button" onClick={() => handleCreateCustomTopic('new')} variant="outline" className="rounded-xl font-bold">
                      <Plus size={16} className="mr-2" /> Přidat
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Sekce (volitelné)</Label>
                  <Select value={newQuestion.courseId || 'none'} onValueChange={(val: string) => setNewQuestion({ ...newQuestion, courseId: val })}>
                    <SelectTrigger className="rounded-xl h-12 border-gray-100 bg-white">
                      <SelectValue placeholder="Vyberte sekci..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Bez sekce (obecná banka)</SelectItem>
                      {practiceCourses.map(course => (
                        <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Znění otázky</Label>
                <Textarea
                  value={newQuestion.question}
                  onChange={e => setNewQuestion({ ...newQuestion, question: e.target.value })}
                  placeholder="Zadejte otázku..."
                  className="rounded-xl min-h-[150px] border-gray-100 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Obrázek (volitelné)</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={e => setNewQuestion({ ...newQuestion, imageFile: e.target.files?.[0] || null })}
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
                        setNewQuestion({ ...newQuestion, options: newOptions });
                      }}
                      placeholder={`Možnost ${i + 1}`}
                      className="rounded-xl h-14 border-gray-100 bg-white"
                    />
                    <Button
                      variant={newQuestion.correctAnswer === opt && opt !== '' ? 'default' : 'outline'}
                      onClick={() => setNewQuestion({ ...newQuestion, correctAnswer: opt })}
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

      {/* View Material Detail Dialog */}
      <Dialog open={!!selectedSheetForView} onOpenChange={(open) => !open && setSelectedSheetForView(null)}>
        <DialogContent className="max-w-[98vw] w-[98vw] max-h-[98vh] h-[98vh] overflow-hidden rounded-2xl p-0 border-none flex flex-col">
          {selectedSheetForView && (
            <div className="flex flex-col h-full w-full bg-white">
              <div className="shrink-0 flex items-center justify-between p-4 bg-white border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1 bg-purple-50 text-brand-purple rounded-full text-xs font-bold uppercase tracking-widest">
                    {selectedSheetForView.topic || 'Matematika'}
                  </span>
                  <DialogHeader>
                    <DialogTitle className="text-xl font-display font-bold m-0">
                      {selectedSheetForView.title}
                    </DialogTitle>
                  </DialogHeader>
                </div>

                <div className="flex items-center gap-3">
                  <Button variant="outline" className="h-10 rounded-xl font-bold" onClick={() => {
                    const a = document.createElement('a');
                    a.href = selectedSheetForView.fileUrl || '';
                    a.download = `${selectedSheetForView.title || 'material'}.pdf`;
                    a.click();
                  }}>
                    <FileText size={18} className="mr-2" />
                    Stáhnout (PDF)
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setSelectedSheetForView(null)}
                    className="h-10 w-10 p-0 rounded-full bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-500"
                  >
                    <ArrowRight size={20} />
                  </Button>
                </div>
              </div>

              <div className="flex-1 min-h-0 bg-gray-100/50 p-2 md:p-4">
                {selectedSheetForView.fileUrl ? (
                  <div className="w-full h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {pdfBlobUrl ? (
                      <iframe
                        src={pdfBlobUrl}
                        className="w-full h-full border-none"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <div className="animate-spin w-8 h-8 rounded-full border-4 border-brand-purple border-t-transparent" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <FileText size={48} className="text-gray-300 mb-4" />
                    <p className="text-gray-500 font-bold mb-6">K tomuto materiálu nebyl přiložen žádný soubor.</p>
                  </div>
                )}
              </div>
            </div>
          )}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3 col-span-1 md:col-span-2">
                  <Label className="font-bold text-gray-700">Témata (lze vybrat více)</Label>
                  <div className="flex flex-wrap gap-2">
                    {allTopics.map(topic => {
                      const isSelected = (editingQuestion.topics || []).includes(topic) || (!editingQuestion.topics?.length && editingQuestion.topic === topic);
                      return (
                        <div
                          key={topic}
                          onClick={() => handleToggleTopic(topic, 'edit')}
                          className={`px-3 py-1.5 rounded-xl text-sm font-medium cursor-pointer transition-colors border ${isSelected ? 'bg-brand-purple text-white border-brand-purple shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                        >
                          {topic}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 max-w-sm">
                    <Input
                      placeholder="Přidat nové téma..."
                      value={newTopicInput}
                      onChange={e => setNewTopicInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCustomTopic('edit'); } }}
                      className="rounded-xl border-gray-100 bg-white"
                    />
                    <Button type="button" onClick={() => handleCreateCustomTopic('edit')} variant="outline" className="rounded-xl font-bold">
                      <Plus size={16} className="mr-2" /> Přidat
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Sekce (volitelné)</Label>
                  <Select value={editingQuestion.courseId || 'none'} onValueChange={(val: string) => setEditingQuestion({ ...editingQuestion, courseId: val })}>
                    <SelectTrigger className="rounded-xl h-12 border-gray-100 bg-white">
                      <SelectValue placeholder="Vyberte sekci..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Bez sekce (obecná banka)</SelectItem>
                      {practiceCourses.map(course => (
                        <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Znění otázky</Label>
                <Textarea
                  value={editingQuestion.question}
                  onChange={e => setEditingQuestion({ ...editingQuestion, question: e.target.value })}
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
                  onChange={e => setEditingQuestion({ ...editingQuestion, imageFile: e.target.files?.[0] || null })}
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
                        setEditingQuestion({ ...editingQuestion, options: newOptions });
                      }}
                      placeholder={`Možnost ${i + 1}`}
                      className="rounded-xl h-14 border-gray-100 bg-white"
                    />
                    <Button
                      variant={editingQuestion.correctAnswer === opt && opt !== '' ? 'default' : 'outline'}
                      onClick={() => setEditingQuestion({ ...editingQuestion, correctAnswer: opt })}
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
          <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50/50">
            <Tabs defaultValue="history" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-8 bg-white/50 p-1.5 rounded-[1.5rem] border border-gray-100">
                <TabsTrigger value="history" className="rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm py-3">Historie</TabsTrigger>
                <TabsTrigger value="todos" className="rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm py-3">Úkoly (TODO)</TabsTrigger>
                <TabsTrigger value="assign" className="rounded-xl font-bold data-[state=active]:bg-white data-[state=active]:text-brand-orange data-[state=active]:shadow-sm py-3">Přiřadit test</TabsTrigger>
              </TabsList>

              <TabsContent value="history" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold text-gray-900">Historie aktivit a výsledky</h3>
                </div>
                
                <div className="space-y-4">
                  {assignedTests
                    .filter(at => at.studentId === selectedStudent?.uid)
                    .sort((a, b) => {
                      const tA = a.assignedAt?.toMillis ? a.assignedAt.toMillis() : 0;
                      const tB = b.assignedAt?.toMillis ? b.assignedAt.toMillis() : 0;
                      return tB - tA;
                    })
                    .map(at => (
                    <Card key={at.id} className="rounded-2xl border-none shadow-sm bg-white overflow-hidden group hover:shadow-md transition-all">
                      <div className="p-6 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                            at.status === 'graded' ? 'bg-green-50 text-green-600' : 
                            at.status === 'submitted' ? 'bg-orange-50 text-brand-orange' : 'bg-blue-50 text-brand-blue'
                          }`}>
                            <FileText size={24} />
                          </div>
                          <div>
                            <h4 className="font-bold text-lg text-gray-900">{at.testTitle}</h4>
                            <div className="flex items-center gap-3 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <Clock size={14} />
                                {at.assignedAt.toDate().toLocaleDateString('cs-CZ')}
                              </span>
                              {at.dueDate && (
                                <span className={`flex items-center gap-1 font-medium ${
                                  at.status === 'pending' && at.dueDate.toDate() < new Date() ? 'text-red-500' : ''
                                }`}>
                                  <Target size={14} />
                                  Termín: {at.dueDate.toDate().toLocaleDateString('cs-CZ')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {at.status === 'pending' && (
                            <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-black uppercase tracking-wider">
                              Rozpracováno
                            </span>
                          )}
                          {at.status === 'submitted' && (
                            <span className="px-3 py-1 bg-orange-50 text-brand-orange rounded-full text-xs font-black uppercase tracking-wider animate-pulse">
                              K opravě
                            </span>
                          )}
                          {at.status === 'graded' && (
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="text-2xl font-black text-brand-blue leading-none">{at.grade}</div>
                                <div className="text-[10px] uppercase font-bold text-gray-400 tracking-tighter">Známka</div>
                              </div>
                              <Button variant="ghost" size="icon" className="rounded-full hover:bg-blue-50 text-brand-blue" onClick={() => navigate(`/test-review/${at.id}`)}>
                                <ArrowRight size={18} />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                  {assignedTests.filter(at => at.studentId === selectedStudent?.uid).length === 0 && (
                    <div className="text-center py-16 bg-white/50 rounded-[2rem] border-2 border-dashed border-gray-200">
                      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400 mx-auto mb-4">
                        <FileText size={32} />
                      </div>
                      <p className="text-gray-500 font-bold">Student zatím nemá žádné přiřazené aktivity.</p>
                      <p className="text-sm text-gray-400 mt-1">Můžete mu přiřadit test v záložce "Přiřadit test".</p>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="todos" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-white/50 p-1 rounded-[2.5rem]">
                  {selectedStudent && (
                    <TodoManager targetStudentId={selectedStudent.uid} isTeacherView={true} />
                  )}
                </div>
              </TabsContent>

              <TabsContent value="assign" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100">
                  <h3 className="text-2xl font-display font-black text-brand-orange mb-6">Přiřadit nový test</h3>
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <Label className="font-black text-gray-700 uppercase tracking-widest text-xs">Výběr procvičování</Label>
                      <Select value={newAssignment.courseId} onValueChange={(val: string) => setNewAssignment({ ...newAssignment, courseId: val })}>
                        <SelectTrigger className="rounded-2xl h-14 border-gray-100 px-6 bg-gray-50/50">
                          <SelectValue placeholder="Vyberte téma procvičování..." />
                        </SelectTrigger>
                        <SelectContent className="rounded-2xl">
                          {practiceCourses.map(course => (
                            <SelectItem key={course.id} value={course.id || ''} className="rounded-xl">{course.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-3">
                      <Label className="font-black text-gray-700 uppercase tracking-widest text-xs">Datum odevzdání (Deadline)</Label>
                      <Input
                        type="date"
                        className="rounded-2xl h-14 border-gray-100 px-6 bg-gray-50/50 [color-scheme:light]"
                        value={newAssignment.dueDate}
                        onChange={(e) => setNewAssignment({ ...newAssignment, dueDate: e.target.value })}
                      />
                    </div>
                    <div className="pt-4">
                      <Button 
                        onClick={async () => {
                          await handleAssignTest();
                          // Switch to history tab after success
                        }} 
                        className="btn-orange w-full rounded-2xl h-16 text-lg font-black shadow-xl shadow-orange-100"
                      >
                        Potvrdit a přiřadit žákovi
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
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
                    onChange={e => setNewSheet({ ...newSheet, title: e.target.value })}
                    placeholder="Např. Pravidla pravopisu"
                    className="rounded-xl h-14 border-gray-100 bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Téma</Label>
                  <Select value={newSheet.topic} onValueChange={(val: MathTopic) => setNewSheet({ ...newSheet, topic: val })}>
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
                  <Select value={newSheet.subject} onValueChange={(val: string) => setNewSheet({ ...newSheet, subject: val })}>
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
                  <Select value={newSheet.level} onValueChange={(val: string) => setNewSheet({ ...newSheet, level: val })}>
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
                        setNewSheet({ ...newSheet, file: e.target.files[0] });
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
                <DialogTitle className="text-3xl font-display font-bold text-brand-blue">Importovat otázky z PDF a JSON</DialogTitle>
                <DialogDescription className="text-lg mt-2">Můžete nahrát PDF soubory pro AI zpracování, nebo nahrát formát .json a přeskočit AI analýzu.</DialogDescription>
              </DialogHeader>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
            <div className="max-w-6xl mx-auto space-y-8 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3 col-span-1 md:col-span-2">
                  <Label className="font-bold text-gray-700">Témata (lze vybrat více)</Label>
                  <div className="flex flex-wrap gap-2">
                    {allTopics.map(topic => {
                      const isSelected = (pdfImport.topics || []).includes(topic) || (!pdfImport.topics?.length && pdfImport.topic === topic);
                      return (
                        <div
                          key={topic}
                          onClick={() => handleToggleTopic(topic, 'pdf')}
                          className={`px-3 py-1.5 rounded-xl text-sm font-medium cursor-pointer transition-colors border ${isSelected ? 'bg-brand-purple text-white border-brand-purple shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                        >
                          {topic}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 max-w-sm">
                    <Input
                      placeholder="Přidat nové téma..."
                      value={newTopicInput}
                      onChange={e => setNewTopicInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCustomTopic('pdf'); } }}
                      className="rounded-xl border-gray-100 bg-white"
                    />
                    <Button type="button" onClick={() => handleCreateCustomTopic('pdf')} variant="outline" className="rounded-xl font-bold">
                      <Plus size={16} className="mr-2" /> Přidat
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Sekce (volitelné)</Label>
                  <Select value={pdfImport.courseId || 'none'} onValueChange={(val: string) => setPdfImport({ ...pdfImport, courseId: val })}>
                    <SelectTrigger className="rounded-xl h-14 border-gray-100 bg-white">
                      <SelectValue placeholder="Vyberte sekci..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Bez sekce (obecná banka)</SelectItem>
                      {practiceCourses.map(course => (
                        <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Soubor s otázkami (PDF / JSON)</Label>
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 flex flex-col items-center justify-center bg-white hover:bg-gray-50 transition-colors cursor-pointer relative">
                    <input
                      type="file"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      accept="application/pdf,application/json,.json"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          setPdfImport({ ...pdfImport, questionsFile: e.target.files[0] });
                        }
                      }}
                    />
                    <UploadCloud className="text-brand-blue mb-4" size={48} />
                    <span className="text-lg font-bold text-gray-600 text-center">
                      {pdfImport.questionsFile ? pdfImport.questionsFile.name : 'Vybrat PDF nebo JSON'}
                    </span>
                  </div>
                </div>

                <div className={`space-y-2 ${pdfImport.questionsFile?.name.endsWith('.json') || pdfImport.questionsFile?.type === 'application/json' ? 'opacity-50 pointer-events-none' : ''}`}>
                  <Label className="font-bold text-gray-700">PDF s odpověďmi (pouze pro AI)</Label>
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-10 flex flex-col items-center justify-center bg-white hover:bg-gray-50 transition-colors cursor-pointer relative">
                    <input
                      type="file"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      accept="application/pdf"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          setPdfImport({ ...pdfImport, answersFile: e.target.files[0] });
                        }
                      }}
                    />
                    <UploadCloud className="text-brand-orange mb-4" size={48} />
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
                  onChange={e => setNewCourse({ ...newCourse, title: e.target.value })}
                  placeholder="Např. Příprava na přijímačky"
                  className="rounded-xl h-14 border-gray-100 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Popis</Label>
                <Textarea
                  value={newCourse.description}
                  onChange={e => setNewCourse({ ...newCourse, description: e.target.value })}
                  placeholder="Krátký popis sekce..."
                  className="rounded-xl min-h-[120px] border-gray-100 bg-white"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4 md:col-span-2">
                  <Label className="font-bold text-gray-700">Témata (vyberte nebo vytvořte) <span className="text-gray-400 font-normal">(jedno procvičování může mít více témat)</span></Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {newCourse.topics && newCourse.topics.length > 0 ? newCourse.topics.map(t => (
                      <span key={t} className="px-3 py-1 bg-blue-100 text-brand-blue rounded-full text-sm font-bold flex items-center gap-2">
                        {t}
                        <button onClick={(e) => {
                          e.preventDefault();
                          setNewCourse({ ...newCourse, topics: newCourse.topics.filter(topic => topic !== t) });
                        }} className="hover:text-red-500">×</button>
                      </span>
                    )) : (
                      <span className="text-sm text-gray-400 italic">Zatím nebylo vybráno žádné téma</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Select onValueChange={(val: string) => {
                      if (!newCourse.topics.includes(val)) {
                        setNewCourse({ ...newCourse, topics: [...newCourse.topics, val] });
                      }
                    }}>
                      <SelectTrigger className="rounded-xl h-14 border-gray-100 bg-white max-w-[200px]">
                        <SelectValue placeholder="Vyberte existující..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allTopics.filter(t => typeof t === 'string' && !newCourse.topics.includes(t as string)).map(topic => (
                          <SelectItem key={topic as string} value={topic as string}>{topic as string}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex-1 flex gap-2">
                      <Input
                        value={customCourseTopic}
                        onChange={e => setCustomCourseTopic(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (customCourseTopic && !newCourse.topics.includes(customCourseTopic)) {
                              setNewCourse({ ...newCourse, topics: [...newCourse.topics, customCourseTopic] });
                              setCustomCourseTopic('');
                            }
                          }
                        }}
                        placeholder="Nebo zadejte nové a stiskněte Enter"
                        className="rounded-xl h-14 border-gray-100 bg-white"
                      />
                      <Button
                        onClick={(e) => {
                          e.preventDefault();
                          if (customCourseTopic && !newCourse.topics.includes(customCourseTopic)) {
                            setNewCourse({ ...newCourse, topics: [...newCourse.topics, customCourseTopic] });
                            setCustomCourseTopic('');
                          }
                        }}
                        className="h-14 rounded-xl px-6 bg-gray-100 text-gray-700 hover:bg-gray-200 border-none font-bold"
                      >
                        Přidat
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Obtížnost</Label>
                  <Select value={newCourse.difficulty} onValueChange={(val: string) => setNewCourse({ ...newCourse, difficulty: val })}>
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
                  <Label className="font-bold text-gray-700">Počet otázek v procvičování</Label>
                  <Input
                    type="number"
                    value={newCourse.questionCount}
                    onChange={e => setNewCourse({ ...newCourse, questionCount: parseInt(e.target.value) || 0 })}
                    className="rounded-xl h-14 border-gray-100 bg-white"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="font-bold text-gray-700">Barva pozadí</Label>
                  <div className="flex items-center gap-4">
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden shadow-sm border-2 border-gray-100 flex-shrink-0 cursor-pointer">
                      <input
                        type="color"
                        value={newCourse.color?.startsWith('#') ? newCourse.color : '#eff6ff'}
                        onChange={e => setNewCourse({ ...newCourse, color: e.target.value })}
                        className="absolute -inset-2 w-20 h-20 cursor-pointer"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 flex-1">
                      <button title="Modrá" onClick={(e) => { e.preventDefault(); setNewCourse({ ...newCourse, color: '#eff6ff' }); }} className={`w-10 h-10 rounded-full border-4 border-white ring-2 ${newCourse.color === '#eff6ff' ? 'ring-brand-blue' : 'ring-gray-100'}`} style={{ backgroundColor: '#eff6ff' }} />
                      <button title="Fialová" onClick={(e) => { e.preventDefault(); setNewCourse({ ...newCourse, color: '#f5f3ff' }); }} className={`w-10 h-10 rounded-full border-4 border-white ring-2 ${newCourse.color === '#f5f3ff' ? 'ring-brand-blue' : 'ring-gray-100'}`} style={{ backgroundColor: '#f5f3ff' }} />
                      <button title="Oranžová" onClick={(e) => { e.preventDefault(); setNewCourse({ ...newCourse, color: '#fff7ed' }); }} className={`w-10 h-10 rounded-full border-4 border-white ring-2 ${newCourse.color === '#fff7ed' ? 'ring-brand-blue' : 'ring-gray-100'}`} style={{ backgroundColor: '#fff7ed' }} />
                      <button title="Zelená" onClick={(e) => { e.preventDefault(); setNewCourse({ ...newCourse, color: '#ecfdf5' }); }} className={`w-10 h-10 rounded-full border-4 border-white ring-2 ${newCourse.color === '#ecfdf5' ? 'ring-brand-blue' : 'ring-gray-100'}`} style={{ backgroundColor: '#ecfdf5' }} />
                      <span className="text-gray-400 text-sm ml-2 flex items-center">- nebo si naklikněte vlastní libovolnou vlevo.</span>
                    </div>
                  </div>
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

      {/* Edit Course Dialog */}
      <Dialog open={!!editingCourse} onOpenChange={(open) => !open && setEditingCourse(null)}>
        <DialogContent className="max-w-[90vw] sm:max-w-[90vw] w-[90vw] h-[90vh] max-h-[90vh] p-0 rounded-[2.5rem] flex flex-col border-none shadow-2xl overflow-hidden">
          <div className="p-8 pb-6 border-b border-gray-100 bg-orange-50/30 flex-shrink-0">
            <div className="max-w-6xl mx-auto w-full">
              <DialogHeader>
                <DialogTitle className="text-3xl font-display font-bold text-brand-orange">Úprava sekce procvičování</DialogTitle>
              </DialogHeader>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-8 bg-gray-50/50">
            <div className="max-w-6xl mx-auto space-y-8 w-full">
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Název sekce</Label>
                <Input
                  value={editingCourse?.title || ''}
                  onChange={e => setEditingCourse(editingCourse ? { ...editingCourse, title: e.target.value } : null)}
                  className="rounded-xl h-14 border-gray-100 bg-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-gray-700">Popis</Label>
                <Textarea
                  value={editingCourse?.description || ''}
                  onChange={e => setEditingCourse(editingCourse ? { ...editingCourse, description: e.target.value } : null)}
                  className="rounded-xl min-h-[120px] border-gray-100 bg-white"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4 md:col-span-2">
                  <Label className="font-bold text-gray-700">Témata (vyberte nebo vytvořte)</Label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {editingCourse?.topics && editingCourse.topics.length > 0 ? editingCourse.topics.map(t => (
                      <span key={t} className="px-3 py-1 bg-blue-100 text-brand-blue rounded-full text-sm font-bold flex items-center gap-2">
                        {t}
                        <button onClick={(e) => {
                          e.preventDefault();
                          if (editingCourse) setEditingCourse({ ...editingCourse, topics: editingCourse.topics?.filter(topic => topic !== t) });
                        }} className="hover:text-red-500">×</button>
                      </span>
                    )) : (
                      <span className="text-sm text-gray-400 italic">Zatím nebylo vybráno žádné téma</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Select onValueChange={(val: string) => {
                      if (editingCourse && !editingCourse.topics?.includes(val)) {
                        setEditingCourse({ ...editingCourse, topics: [...(editingCourse.topics || []), val] });
                      }
                    }}>
                      <SelectTrigger className="rounded-xl h-14 border-gray-100 bg-white max-w-[200px]">
                        <SelectValue placeholder="Vyberte existující..." />
                      </SelectTrigger>
                      <SelectContent>
                        {allTopics.filter(t => typeof t === 'string' && !editingCourse?.topics?.includes(t as string)).map(topic => (
                          <SelectItem key={topic as string} value={topic as string}>{topic as string}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex-1 flex gap-2">
                      <Input
                        value={customCourseTopic}
                        onChange={e => setCustomCourseTopic(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (editingCourse && customCourseTopic && !editingCourse.topics?.includes(customCourseTopic)) {
                              setEditingCourse({ ...editingCourse, topics: [...(editingCourse.topics || []), customCourseTopic] });
                              setCustomCourseTopic('');
                            }
                          }
                        }}
                        placeholder="Nebo zadejte nové a stiskněte Enter"
                        className="rounded-xl h-14 border-gray-100 bg-white"
                      />
                      <Button
                        onClick={(e) => {
                          e.preventDefault();
                          if (editingCourse && customCourseTopic && !editingCourse.topics?.includes(customCourseTopic)) {
                            setEditingCourse({ ...editingCourse, topics: [...(editingCourse.topics || []), customCourseTopic] });
                            setCustomCourseTopic('');
                          }
                        }}
                        className="h-14 rounded-xl px-6 bg-gray-100 text-gray-700 hover:bg-gray-200 border-none font-bold"
                      >
                        Přidat
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="font-bold text-gray-700">Obtížnost</Label>
                  <Select value={editingCourse?.difficulty || ''} onValueChange={(val: any) => setEditingCourse(editingCourse ? { ...editingCourse, difficulty: val } : null)}>
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
                  <Label className="font-bold text-gray-700">Počet otázek v procvičování</Label>
                  <Input
                    type="number"
                    value={editingCourse?.questionCount || 0}
                    onChange={e => setEditingCourse(editingCourse ? { ...editingCourse, questionCount: parseInt(e.target.value) || 0 } : null)}
                    className="rounded-xl h-14 border-gray-100 bg-white"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="p-6 border-t border-gray-100 bg-white flex-shrink-0">
            <div className="max-w-6xl mx-auto w-full">
              <DialogFooter>
                <Button onClick={handleEditCourse} className="bg-brand-orange hover:bg-orange-600 w-full h-14 rounded-2xl text-lg font-bold text-white shadow-xl shadow-orange-200">
                  Uložit změny
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
