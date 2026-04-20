import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, updateDoc, onSnapshot, collection, query, where, Timestamp, addDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db, storage, auth } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { Course, CourseItem, CourseItemAttachment, UserProfile, TodoItem, Test, AssignedTest } from '../types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { ArrowLeft, BookOpen, Calendar, Clock, FileText, LayoutDashboard, Plus, Settings, Users, Video, Edit, Trash2, CheckCircle, FileQuestion, Paperclip, Download, Loader2, Eye, ArrowRight, MessageSquare, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [course, setCourse] = useState<Course | null>(null);
  const [items, setItems] = useState<CourseItem[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [allStudents, setAllStudents] = useState<UserProfile[]>([]); // For teacher to select from
  const [loading, setLoading] = useState(true);
  const [teacherTests, setTeacherTests] = useState<Test[]>([]);
  const [assignedTests, setAssignedTests] = useState<AssignedTest[]>([]);
  const [previewTest, setPreviewTest] = useState<Test | null>(null);

  // Form states
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [itemType, setItemType] = useState<CourseItem['type']>('material');
  const [itemTitle, setItemTitle] = useState('');
  const [itemContent, setItemContent] = useState('');
  const [selectedTestId, setSelectedTestId] = useState('');
  const [itemDate, setItemDate] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    // Reset form when type changes or dialog closes/opens
    setItemTitle('');
    setItemContent('');
    setSelectedTestId('');
    setItemDate('');
    setFiles([]);
  }, [itemType, isAddItemOpen]);

  useEffect(() => {
    if (!id || !profile) return;

    const courseRef = doc(db, 'courses', id);
    const unsubCourse = onSnapshot(courseRef, (snap) => {
      if (snap.exists()) {
        const c = { id: snap.id, ...snap.data() } as Course;
        setCourse(c);
        
        // Only load if authorized (teacher of course, or student in course)
        if (profile.role === 'teacher' && c.teacherId !== profile.uid) {
           navigate('/courses');
        } else if (profile.role === 'student' && !c.studentIds.includes(profile.uid)) {
           navigate('/courses');
        }
      } else {
        navigate('/courses');
      }
    });

    const itemsQuery = query(collection(db, 'courseItems'), where('courseId', '==', id));
    const unsubItems = onSnapshot(itemsQuery, (snap) => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() } as CourseItem))
        .sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0))
      );
    });

    return () => {
      unsubCourse();
      unsubItems();
    };
  }, [id, profile, navigate]);

  useEffect(() => {
    // Load students data
    if (!course || !profile) return;
    
    if (profile.role === 'teacher') {
      const unsubAll = onSnapshot(query(collection(db, 'users'), where('role', '==', 'student')), (snap) => {
        const allS = snap.docs.map(d => ({ uid: d.id, ...d.data() } as UserProfile));
        setAllStudents(allS);
        setStudents(allS.filter(s => course.studentIds.includes(s.uid)));
        setLoading(false);
      });

      // Load teacher's tests
      const unsubTests = onSnapshot(query(collection(db, 'tests'), where('createdBy', '==', profile.uid)), (snap) => {
        setTeacherTests(snap.docs.map(d => ({ id: d.id, ...d.data() } as Test)));
      });

      return () => {
        unsubAll();
        unsubTests();
      };
    } else {
      // Students don't have permission to list all users, so we just show them their own presence
      const myProfile = [profile].filter(s => course.studentIds.includes(s.uid));
      setStudents(myProfile);
      setLoading(false);
    }
  }, [course, profile]);


  useEffect(() => {
    if (!id || !profile || profile.role !== 'student') return;

    const q = query(
      collection(db, 'assignedTests'),
      where('courseId', '==', id),
      where('studentId', '==', profile.uid)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setAssignedTests(snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignedTest)));
    });

    return () => unsubscribe();
  }, [id, profile]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course || profile?.role !== 'teacher') return;
    setIsUploading(true);
    const loadingToastId = toast.loading('Ukládám do kurzu...');

    try {
      const uploadedAttachments: CourseItemAttachment[] = [];

      // Only upload files for material type as requested
      if (itemType === 'material') {
        for (const file of files) {
          // Verify it's a PDF
          const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
          if (!isPdf) {
            toast.error(`Soubor ${file.name} není PDF. Nahrávání zrušeno.`);
            setIsUploading(false);
            return;
          }

          // Sanitize and prepare filename
          const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
          const storagePath = `learningSheets/${profile.uid}/${Date.now()}-${safeName}`;
          
          console.log('--- STARTING CLIENT-SIDE UPLOAD ---', file.name);
          
          try {
            const storageRef = ref(storage, storagePath);
            const uploadTask = uploadBytesResumable(storageRef, file);

            // Re-use the promise pattern for resumable upload
            const url = await new Promise<string>((resolve, reject) => {
              uploadTask.on(
                'state_changed',
                (snapshot) => {
                  const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                  console.log(`Upload progress: ${progress.toFixed(2)}%`);
                },
                (error) => {
                  console.error('Upload error detail:', error);
                  reject(error);
                },
                async () => {
                  const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                  resolve(downloadURL);
                }
              );
            });

            console.log('--- CLIENT-SIDE UPLOAD SUCCESS ---', url);
            
            uploadedAttachments.push({
              id: storagePath.split('/').pop() || safeName,
              name: file.name,
              url,
              type: 'application/pdf',
              size: file.size
            });

            // Sync to global LearningSheets collection (common Materials archive)
            await addDoc(collection(db, 'learningSheets'), {
              title: itemTitle || file.name,
              subject: 'Matematika', 
              level: '2. stupeň ZŠ', 
              topic: 'Aritmetika', 
              fileUrl: url,
              fileType: 'application/pdf',
              createdBy: profile.uid,
              createdAt: serverTimestamp()
            });
          } catch (uploadErr: any) {
            console.error('--- SERVER-SIDE UPLOAD FAILED ---', uploadErr);
            throw uploadErr;
          }
        }
      }

      const parsedDate = itemDate ? new Date(itemDate) : null;
      
      const docRef = await addDoc(collection(db, 'courseItems'), {
        courseId: course.id,
        title: itemTitle,
        type: itemType,
        content: itemType === 'test' ? selectedTestId : itemContent,
        date: parsedDate ? Timestamp.fromDate(parsedDate) : null,
        createdAt: serverTimestamp(),
        addedBy: profile.uid,
        attachments: uploadedAttachments
      });

      // Crucial: Fan out to QuickCalendar (todos) so students see it there
      // We will create a TodoItem for EACH student in the course!
      course.studentIds.forEach(studentId => {
         const getTodoType = () => {
           if (itemType === 'lesson') return 'course_lesson';
           if (itemType === 'test') return 'test';
           return 'course_material';
         };

         addDoc(collection(db, 'todos'), {
            studentId,
            courseId: course.id,
            title: `[${course.title}] ${itemType === 'test' ? 'Testováno: ' : ''}${itemTitle}`,
            type: getTodoType(),
            referenceId: docRef.id,
            completed: false,
            dueDate: parsedDate ? Timestamp.fromDate(parsedDate) : null,
            createdAt: serverTimestamp(),
            addedBy: profile.uid
         });

         // If it's a test, also assign it to the student
         if (itemType === 'test' && selectedTestId) {
            addDoc(collection(db, 'assignedTests'), {
               testId: selectedTestId,
               studentId,
               status: 'pending',
               assignedAt: serverTimestamp(),
               dueDate: parsedDate ? Timestamp.fromDate(parsedDate) : null,
               courseId: course.id
            });
         }
      });

      toast.dismiss(loadingToastId);
      toast.success('Položka přidána!');
      setIsAddItemOpen(false);
      setItemTitle('');
      setItemContent('');
      setSelectedTestId('');
      setItemDate('');
      setFiles([]);
    } catch (err: any) {
      toast.dismiss(loadingToastId);
      toast.error('Chyba: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleToggleStudent = async (studentId: string) => {
    if (!course || profile?.role !== 'teacher') return;
    const isEnrolled = course.studentIds.includes(studentId);
    let newIds = [];
    if (isEnrolled) {
      newIds = course.studentIds.filter(id => id !== studentId);
    } else {
      newIds = [...course.studentIds, studentId];
    }
    
    try {
      await updateDoc(doc(db, 'courses', course.id), { studentIds: newIds });
      toast.success(isEnrolled ? 'Student odebrán' : 'Student přidán');
    } catch(err: any) {
      toast.error('Chyba: ' + err.message);
    }
  };

  if (loading || !course) {
    return <div className="flex items-center justify-center p-20"><div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent animate-spin rounded-full" /></div>;
  }

  const colorClass = 
    course.color === 'purple' ? "from-purple-500 to-purple-700 shadow-purple-200 text-purple-900" :
    course.color === 'orange' ? "from-brand-orange to-orange-500 shadow-orange-200 text-orange-900" :
    course.color === 'green' ? "from-emerald-500 to-teal-600 shadow-emerald-200 text-teal-900" :
    course.color === 'rose' ? "from-rose-500 to-pink-600 shadow-rose-200 text-rose-900" :
    "from-brand-blue to-blue-600 shadow-blue-200 text-blue-900"; // default blue

  return (
    <div className="page-container">
      <Button 
        variant="ghost" 
        onClick={() => navigate('/courses')}
        className="mb-6 rounded-xl font-bold flex items-center gap-2 hover:bg-white text-gray-500"
      >
        <ArrowLeft size={18} /> Zpět na kurzy
      </Button>

      <div className={cn("rounded-[3rem] p-10 md:p-14 text-white relative overflow-hidden mb-12 shadow-2xl bg-gradient-to-br", colorClass)}>
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full blur-3xl -mr-40 -mt-40 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-black/10 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row justify-between md:items-end gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-6 bg-white/20 backdrop-blur-md w-fit px-4 py-2 rounded-2xl">
              <BookOpen size={20} />
              <span className="font-bold tracking-widest uppercase text-sm">Pracovní prostor kurzu</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-display font-black mb-4 leading-tight">
              {course.title}
            </h1>
            <p className="text-white/80 text-xl leading-relaxed">
              {course.description}
            </p>
          </div>
          
          <div className="flex flex-col items-end gap-4 shrink-0">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 px-8 py-4 rounded-3xl text-center">
              <div className="text-4xl font-black mb-1">{students.length}</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/70">Zapsaných<br/>Studentů</div>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="stream" className="space-y-8">
        <TabsList className="bg-white/50 backdrop-blur-md border border-white p-2 rounded-3xl h-16 shadow-sm flex items-center overflow-x-auto justify-start md:justify-center w-full max-w-2xl mx-auto">
          <TabsTrigger value="stream" className="rounded-2xl px-8 h-full data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-md font-bold transition-all flex items-center gap-3">
            <LayoutDashboard size={18} /> Obsah a úkoly
          </TabsTrigger>
          <TabsTrigger value="students" className="rounded-2xl px-8 h-full data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-md font-bold transition-all flex items-center gap-3">
            <Users size={18} /> Studenti
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stream" className="space-y-6">
          {profile?.role === 'teacher' && (
            <div className="flex justify-end relative z-20 mb-6">
              <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
                <DialogTrigger className={cn(
                  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-1 disabled:pointer-events-none disabled:opacity-50",
                  "btn-brand h-14 px-8 rounded-2xl font-bold shadow-xl shadow-blue-200 text-lg cursor-pointer"
                )}>
                  <Plus size={24} /> Přidat položku do kurzu
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px] rounded-[2rem] border-none shadow-2xl p-8">
                  <DialogHeader className="mb-6">
                    <DialogTitle className="text-2xl font-display font-black text-brand-blue flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                        <Plus size={20} className="text-brand-blue" />
                      </div>
                      Nová položka výuky
                    </DialogTitle>
                  </DialogHeader>

                  <form onSubmit={handleAddItem} className="space-y-6">
                    <div className="space-y-3">
                      <Label className="font-bold text-gray-700">Typ položky</Label>
                      <div className="grid grid-cols-3 gap-3">
                        <button type="button" onClick={() => setItemType('material')} className={cn("p-3 rounded-2xl border-2 font-bold flex flex-col items-center justify-center gap-2 transition-all", itemType === 'material' ? "border-brand-blue bg-blue-50 text-brand-blue" : "border-gray-100 bg-white hover:bg-gray-50 text-gray-500")}>
                          <FileText size={20} /> Materiál
                        </button>
                        <button type="button" onClick={() => setItemType('lesson')} className={cn("p-3 rounded-2xl border-2 font-bold flex flex-col items-center justify-center gap-2 transition-all", itemType === 'lesson' ? "border-purple-500 bg-purple-50 text-purple-600" : "border-gray-100 bg-white hover:bg-gray-50 text-gray-500")}>
                          <Calendar size={20} /> Hodina
                        </button>
                        <button type="button" onClick={() => setItemType('test')} className={cn("p-3 rounded-2xl border-2 font-bold flex flex-col items-center justify-center gap-2 transition-all", itemType === 'test' ? "border-orange-500 bg-orange-50 text-orange-600" : "border-gray-100 bg-white hover:bg-gray-50 text-gray-500")}>
                          <FileQuestion size={20} /> Test / Úkol
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="font-bold text-gray-700">Název / Nadpis</Label>
                      <Input value={itemTitle} onChange={e => setItemTitle(e.target.value)} required className="h-14 rounded-2xl bg-gray-50 border-gray-200" placeholder="Např. 4. lekce: Rovnice" />
                    </div>

                    {itemType === 'test' ? (
                      <div className="space-y-3">
                        <Label className="font-bold text-gray-700">Vybrat existující test</Label>
                        <Select value={selectedTestId} onValueChange={setSelectedTestId}>
                          <SelectTrigger className="h-14 rounded-2xl bg-gray-50 border-gray-200">
                            <SelectValue placeholder="Vyberte test..." />
                          </SelectTrigger>
                          <SelectContent>
                            {teacherTests.length === 0 ? (
                              <div className="p-4 text-center text-sm text-gray-500">
                                Nemáte žádné vytvořené testy.
                              </div>
                            ) : (
                              teacherTests.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.title}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500">Testy můžete vytvářet na hlavní nástěnce.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <Label className="font-bold text-gray-700">Popis nebo Odkaz</Label>
                        <Textarea value={itemContent} onChange={e => setItemContent(e.target.value)} required className="min-h-[120px] rounded-2xl bg-gray-50 border-gray-200 resize-none" placeholder={itemType === 'lesson' ? "Instrukce k hodině, odkaz na Meet..." : "Základní instrukce či odkaz..."} />
                      </div>
                    )}

                    {itemType === 'material' && (
                      <div className="space-y-3">
                        <Label className="font-bold text-gray-700">Připojit PDF soubory (pouze pro materiály)</Label>
                        <div className="flex items-center gap-4 p-4 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors">
                          <Paperclip size={24} className="text-gray-400 shrink-0" />
                          <Input 
                            type="file" 
                            multiple 
                            accept="application/pdf"
                            onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])} 
                            className="bg-transparent border-none file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-brand-blue hover:file:bg-blue-100 shadow-none p-0 cursor-pointer text-gray-600 block w-full"
                          />
                        </div>
                        {files.length > 0 && (
                          <p className="text-sm font-medium text-blue-600 px-2 mt-2">
                              Vybráno {files.length} PDF souborů k nahrání
                          </p>
                        )}
                        <p className="text-[10px] text-gray-400 px-1 italic">Povoleny jsou pouze PDF soubory do 5 MB (omezení serveru).</p>
                      </div>
                    )}

                    <div className="space-y-3">
                      <Label className="font-bold text-gray-700">{itemType === 'lesson' ? 'Čas schůzky' : 'Termín splnění (nepovinné)'}</Label>
                      <Input type="datetime-local" value={itemDate} onChange={e => setItemDate(e.target.value)} required={itemType === 'lesson'} className="h-14 rounded-2xl bg-gray-50 border-gray-200 w-full flex" />
                    </div>

                    <DialogFooter>
                      <div className="flex justify-end gap-3 w-full">
                        <Button type="button" variant="ghost" onClick={() => setIsAddItemOpen(false)} className="rounded-xl font-bold h-12">Zrušit</Button>
                        <Button 
                          type="submit" 
                          disabled={!itemTitle || (itemType !== 'test' && !itemContent) || (itemType === 'test' && !selectedTestId) || isUploading} 
                          className="rounded-xl font-bold h-12 px-8 btn-brand"
                        >
                          {isUploading ? <><Loader2 size={18} className="animate-spin mr-2"/> Ukládám...</> : 'Uložit položku'}
                        </Button>
                      </div>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-[3rem] border border-gray-100 shadow-sm">
              <div className="w-24 h-24 bg-gray-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-gray-400">
                <FileText size={40} />
              </div>
              <h3 className="text-2xl font-display font-bold text-gray-800 mb-2">Tento kurz je zatím prázdný</h3>
              <p className="text-gray-500">Zatím nebyly přidány žádné materiály ani termíny.</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {items.map(item => (
                <div key={item.id} className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex gap-6 items-start hover:shadow-xl hover:border-gray-200 transition-all group">
                  <div className={cn(
                    "w-16 h-16 rounded-[1.5rem] flex items-center justify-center shrink-0 shadow-sm",
                    item.type === 'lesson' ? "bg-purple-50 text-purple-600" : 
                    item.type === 'test' ? "bg-orange-50 text-orange-600" :
                    "bg-blue-50 text-brand-blue"
                  )}>
                    {item.type === 'lesson' ? <Video size={28} /> : 
                     item.type === 'test' ? <FileQuestion size={28} /> :
                     <FileText size={28} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-2 gap-4">
                      <h3 className="text-xl font-display font-bold text-gray-900 group-hover:text-brand-blue transition-colors">
                        {item.title}
                      </h3>
                      <span className="text-xs font-bold text-gray-400 whitespace-nowrap bg-gray-50 px-3 py-1 rounded-full">
                        {item.createdAt?.toDate().toLocaleDateString('cs-CZ')}
                      </span>
                    </div>

                    {item.type === 'test' ? (() => {
                      const myAssignment = assignedTests.find(at => at.testId === item.content);
                      
                      return (
                        <div className="bg-orange-50/50 border border-orange-100 p-6 rounded-2xl mb-4">
                            <div className="flex items-center gap-3 mb-4">
                               <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
                                  <FileQuestion size={20} />
                               </div>
                               <div>
                                  <h4 className="font-bold text-gray-900">Přiřazený test</h4>
                                  <p className="text-xs text-gray-500">Tento test byl automaticky přiřazen všem studentům v kurzu.</p>
                               </div>
                            </div>
                            
                            {profile?.role === 'student' ? (
                              <div className="flex flex-wrap gap-2">
                                {myAssignment ? (
                                  <>
                                    {myAssignment.status === 'graded' ? (
                                      <Button 
                                        className="bg-brand-blue hover:bg-brand-blue/90 text-white font-bold rounded-xl flex items-center gap-2"
                                        onClick={() => navigate(`/review/${myAssignment.id}`)}
                                      >
                                        <CheckCircle size={18} /> Zobrazit výsledky
                                      </Button>
                                    ) : (
                                      <Button 
                                        className="btn-brand font-bold rounded-xl flex items-center gap-2"
                                        onClick={() => navigate(`/test/${myAssignment.id}`)}
                                      >
                                        <Plus size={18} /> Vyplnit test
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <p className="text-sm text-gray-400 italic">Přiřazení se načítá nebo nebylo nalezeno...</p>
                                )}
                              </div>
                            ) : (
                              <Button 
                                variant="outline" 
                                className="bg-white border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800 font-bold rounded-xl"
                                onClick={() => {
                                  navigate(`/teacher?tab=tests&viewTestId=${item.content}&courseId=${course.id}`);
                                }}
                              >
                                Spravovat výsledky v dashboardu
                              </Button>
                            )}
                        </div>
                      );
                    })() : (
                       <p className="text-gray-600 whitespace-pre-wrap mb-4 font-medium">{item.content}</p>
                    )}
                    
                    {/* Attachments Section */}
                    {item.attachments && item.attachments.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        {item.attachments.map((file) => (
                           <a 
                             key={file.id} 
                             href={file.url} 
                             target="_blank" 
                             rel="noopener noreferrer"
                             className="flex items-center gap-3 p-3 rounded-2xl border border-gray-200 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 transition-colors group/file text-left w-full h-auto overflow-hidden" // ensures proper flex wrapping
                           >
                              <div className="w-10 h-10 rounded-xl bg-white border border-gray-100 flex items-center justify-center shrink-0 text-gray-400 group-hover/file:text-brand-blue">
                                <Download size={18} />
                              </div>
                              <div className="flex-1 min-w-0 pr-4">
                                <p className="text-sm font-bold text-gray-800 truncate group-hover/file:text-brand-blue">{file.name}</p>
                                <p className="text-xs text-gray-500 font-medium">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                              </div>
                           </a>
                        ))}
                      </div>
                    )}

                    {item.date && (
                      <div className={cn(
                        "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold",
                        item.type === 'lesson' ? "bg-purple-50 text-purple-700" : "bg-orange-50 text-brand-orange"
                      )}>
                        <Clock size={16} />
                        {item.type === 'lesson' ? 'Schůzka: ' : 'Termín: '}
                        {item.date.toDate().toLocaleDateString('cs-CZ')} v {item.date.toDate().toLocaleTimeString('cs-CZ', {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="students" className="max-w-4xl mx-auto">
          <div className="bg-white rounded-[3rem] p-8 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-display font-bold text-brand-blue">Obyvatelé kurzu</h3>
              <span className="bg-blue-50 text-brand-blue px-4 py-1.5 rounded-full font-bold text-sm">
                Celkem: {course.studentIds.length}
              </span>
            </div>
            
            <div className="grid gap-4">
              {profile?.role === 'teacher' && allStudents.map(student => {
                const enrolled = course.studentIds.includes(student.uid);
                return (
                  <div key={student.uid} className={cn("flex items-center justify-between p-4 rounded-2xl border transition-all", enrolled ? "border-brand-blue bg-blue-50/30" : "border-gray-100 bg-white")}>
                    <div className="flex items-center gap-4">
                      {student.photoURL ? (
                         <img src={student.photoURL} alt={student.name} className="w-12 h-12 rounded-xl object-cover" />
                      ) : (
                         <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 font-bold font-display text-xl">{student.name.charAt(0)}</div>
                      )}
                      <div>
                        <div className="font-bold text-gray-900">{student.name}</div>
                        <div className="text-xs text-gray-500 font-medium">{student.email}</div>
                      </div>
                    </div>
                    <Button 
                      onClick={() => handleToggleStudent(student.uid)}
                      variant={enrolled ? "secondary" : "default"}
                      className={cn("rounded-xl font-bold shadow-none", enrolled ? "bg-white text-gray-600 border border-gray-200" : "btn-brand")}
                    >
                      {enrolled ? 'Odebrat' : 'Přidat do kurzu'}
                    </Button>
                  </div>
                )
              })}
              {profile?.role === 'student' && students.map(student => (
                  <div key={student.uid} className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-white">
                    {student.photoURL ? (
                       <img src={student.photoURL} alt={student.name} className="w-12 h-12 rounded-xl object-cover" />
                    ) : (
                       <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 font-bold font-display text-xl">{student.name.charAt(0)}</div>
                    )}
                    <div>
                      <div className="font-bold text-gray-900">{student.name} {student.uid === profile.uid && '(Ty)'}</div>
                      <div className="text-xs text-gray-500 font-medium">{student.email}</div>
                    </div>
                  </div>
              ))}
              {profile?.role === 'student' && students.length === 0 && (
                <div className="text-center py-10 text-gray-400 font-medium">Zatím zde nejsou žádní studenti.</div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Test Preview Dialog (Course Detail) */}
      <Dialog open={!!previewTest} onOpenChange={(open) => !open && setPreviewTest(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-6xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl flex flex-col h-[90vh]">
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden h-full">
            {/* Left side - Test Preview */}
            <div className="flex-1 overflow-y-auto p-8 lg:p-12 relative bg-white">
              <div className="flex justify-between items-start mb-8">
                <div>
                   <h2 className="text-3xl font-display font-black text-brand-orange">{previewTest?.title}</h2>
                   <p className="text-gray-500 mt-2 font-medium">{previewTest?.description}</p>
                </div>
                <div className="px-4 py-2 bg-orange-50 text-orange-600 rounded-xl font-bold text-xs shadow-sm border border-orange-100">
                   Náhled detailního testu
                </div>
              </div>

              <div className="space-y-6">
                 {previewTest?.questions?.map((q, idx) => (
                    <div key={q.id || idx} className="p-8 rounded-[2rem] border border-gray-100 bg-gray-50 shadow-sm relative overflow-hidden group">
                       <div className="absolute top-0 left-0 w-2 h-full bg-brand-teal rounded-l-[2rem] opacity-0 group-hover:opacity-100 transition-opacity" />
                       <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4">Otázka {idx + 1}</span>
                       <h3 className="text-2xl font-bold text-gray-900 mb-6 leading-tight">{q.question}</h3>
                       {q.imageUrl && (
                          <div className="mb-6 rounded-2xl overflow-hidden shadow-sm bg-white p-2">
                             <img src={q.imageUrl} alt="Zadání" className="w-full object-contain max-h-72 rounded-xl" referrerPolicy="no-referrer" />
                          </div>
                       )}
                       <div className="bg-white p-6 rounded-2xl border-2 border-dashed border-gray-200">
                          <p className="text-gray-400 font-medium text-sm flex items-center gap-2">
                            <MessageSquare size={16} /> Otevřená odpověď (student zde vyplní text, výsledek nebo postup)
                          </p>
                       </div>
                    </div>
                 ))}
                 {!previewTest?.questions?.length && (
                    <p className="text-gray-400 italic">Test nemá žádné otázky.</p>
                 )}
              </div>
            </div>

            {/* Right side - Students List */}
            <div className="w-full md:w-[350px] lg:w-[400px] border-l border-gray-100 bg-gray-50 overflow-y-auto flex flex-col shrink-0 shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.05)]">
               <div className="p-8 border-b border-gray-100 bg-white sticky top-0 z-10">
                 <h3 className="text-2xl font-bold font-display text-gray-900 flex items-center gap-2">
                    <Users size={24} className="text-brand-blue" />
                    Stav vyplnění
                 </h3>
                 <p className="text-sm font-bold text-brand-blue mt-2 bg-blue-50 px-3 py-1.5 rounded-lg inline-block">
                   Tento kurz
                 </p>
               </div>
               
               <div className="p-6 space-y-8 flex-1">
                 {(() => {
                    const relevantAsgmts = assignedTests.filter(at => 
                       at.testId === previewTest?.id && 
                       at.courseId === course?.id
                    );
                    const completed = relevantAsgmts.filter(a => a.status === 'submitted' || a.status === 'graded');
                    const pending = relevantAsgmts.filter(a => a.status === 'pending');

                    return (
                      <>
                        <div className="space-y-4">
                           <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest text-green-600 px-1 border-b border-green-100 pb-2">
                              <span className="flex items-center gap-2"><CheckCircle size={14} /> Vyplněno</span>
                              <span className="bg-green-100 px-2 py-0.5 rounded-full">{completed.length}</span>
                           </div>
                           {completed.length === 0 && <p className="text-sm text-gray-400 italic px-2">Zatím nikdo nevyplnil.</p>}
                           <div className="space-y-2">
                             {completed.map(at => {
                                const student = students.find(s => s.uid === at.studentId);
                                return (
                                  <button 
                                     key={at.id}
                                     onClick={() => {
                                        navigate(`/teacher?tab=tests&viewTestId=${previewTest?.id}&courseId=${course?.id}`);
                                     }}
                                     className="w-full flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 hover:border-brand-blue hover:shadow-lg transition-all group text-left"
                                  >
                                     <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-orange-100 text-brand-orange flex items-center justify-center font-bold text-lg shrink-0 group-hover:bg-brand-orange group-hover:text-white transition-colors">
                                          {student?.name?.charAt(0) || '?'}
                                        </div>
                                        <div className="truncate">
                                          <p className="text-base font-bold text-gray-900 group-hover:text-brand-blue truncate">{student?.name || 'Neznámý'}</p>
                                          <p className={cn("text-[10px] font-black uppercase tracking-wider", at.status === 'graded' ? "text-green-500" : "text-brand-orange")}>
                                            {at.status === 'graded' ? 'Oznámkováno' : 'Čeká na opravu'}
                                          </p>
                                        </div>
                                     </div>
                                     <ArrowRight size={18} className="text-gray-300 group-hover:text-brand-blue transform group-hover:translate-x-1 transition-all" />
                                  </button>
                                )
                             })}
                           </div>
                        </div>
                        
                        <div className="space-y-4">
                           <div className="flex items-center justify-between text-xs font-black uppercase tracking-widest text-gray-400 px-1 border-b border-gray-200 pb-2">
                              <span className="flex items-center gap-2"><Clock size={14} /> Nevyplněno</span>
                              <span className="bg-gray-200 px-2 py-0.5 rounded-full text-gray-600">{pending.length}</span>
                           </div>
                           {pending.length === 0 && completed.length > 0 && (
                             <div className="bg-green-50 text-green-700 p-4 rounded-xl flex items-center gap-3 font-bold text-sm">
                               <Sparkles size={18} /> Všichni studenti vyplnili!
                             </div>
                           )}
                           <div className="space-y-2">
                             {pending.map(at => {
                                const student = students.find(s => s.uid === at.studentId);
                                return (
                                  <div key={at.id} className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-gray-50 opacity-60 grayscale hover:grayscale-0 transition-all">
                                    <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center font-bold text-lg shrink-0">
                                      {student?.name?.charAt(0) || '?'}
                                    </div>
                                    <div className="truncate">
                                      <p className="text-base font-bold text-gray-600 truncate">{student?.name || 'Neznámý student'}</p>
                                      <p className="text-[10px] uppercase font-black tracking-wider text-gray-400">Přiřazeno</p>
                                    </div>
                                  </div>
                                )
                             })}
                           </div>
                        </div>
                      </>
                    )
                 })()}
               </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
