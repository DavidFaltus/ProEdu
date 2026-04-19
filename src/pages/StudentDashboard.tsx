import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { safeToDate } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { AssignedTest, LearningSheet, TodoItem } from '../types/index';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { FileText, CheckCircle, BookOpen, Clock, Trophy, ArrowRight, Sparkles, Target, Lightbulb, Settings, User as UserIcon, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import TodoManager from '../components/TodoManager';
import QuickCalendar from '../components/QuickCalendar';
import { CountdownTimer } from '../components/CountdownTimer';

export default function StudentDashboard() {
  const { user, profile, setIsProfileSettingsOpen } = useAuth();
  const navigate = useNavigate();
  const [assignedTests, setAssignedTests] = useState<AssignedTest[]>([]);
  const [learningSheets, setLearningSheets] = useState<LearningSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<LearningSheet | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [isAddingTodo, setIsAddingTodo] = useState<string | null>(null);

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
      toast.success(`Úkol "${title}" byl přidán do tvého TODO listu!`);
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

    const fetchSheets = async () => {
      const snap = await getDocs(collection(db, 'learningSheets'));
      setLearningSheets(snap.docs.map(d => ({ id: d.id, ...d.data() } as LearningSheet)));
    };
    fetchSheets();

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

    return () => {
      unsubAssigned();
      unsubTodos();
    };
  }, [profile]);

  const pendingTests = assignedTests.filter(t => t.status === 'pending');
  const completedTests = assignedTests.filter(t => t.status !== 'pending');

  return (
    <div className="page-container">
      <header className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
        <div className="flex items-center gap-6 shrink-0">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-[2rem] bg-white shadow-xl flex items-center justify-center overflow-hidden border-4 border-white">
            {profile?.photoURL ? (
              <img src={profile.photoURL} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <UserIcon size={40} className="text-brand-blue" />
            )}
          </div>
          <div className="space-y-1">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-brand-blue">
              Ahoj, {profile?.name}! 👋
            </h1>
            <p className="text-gray-500 text-lg">Tady je tvůj přehled studia a úkolů.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="bg-white px-6 py-4 rounded-[1.5rem] shadow-xl flex items-center gap-3 border-2 border-blue-50">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-brand-blue">
              <Trophy size={20} />
            </div>
            <div>
              <div className="text-xl font-black text-brand-blue leading-none">
                {completedTests.filter(t => t.status === 'graded').length}
              </div>
              <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Hotovo</div>
            </div>
          </div>
          <Button
            onClick={() => setIsProfileSettingsOpen(true)}
            className="h-16 px-8 rounded-[1.5rem] bg-white text-brand-blue border-none shadow-xl hover:bg-gray-50 font-bold flex items-center gap-3 active:scale-95 transition-all"
          >
            <Settings size={22} className="text-brand-orange" />
            <span>Nastavení profilu</span>
          </Button>
        </div>
      </header>

      {/* AI Recommendations Section */}
      <AnimatePresence>
        {profile?.focusAreas && profile.focusAreas.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative"
          >
            <div className="absolute -top-4 -left-4 w-12 h-12 bg-purple-500 rounded-2xl flex items-center justify-center text-white shadow-lg z-10 animate-bounce">
              <Sparkles size={24} />
            </div>
            <Card className="rounded-[2.5rem] border-none shadow-2xl bg-gradient-to-br from-brand-purple to-purple-600 text-white overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
              <CardHeader className="relative z-10">
                <CardTitle className="text-2xl font-display flex items-center gap-2">
                  Doporučení pro tebe <Lightbulb className="text-yellow-300" />
                </CardTitle>
                <CardDescription className="text-purple-100 text-lg">
                  Na základě tvých výsledků ti AI doporučuje zaměřit se na tyto oblasti:
                </CardDescription>
              </CardHeader>
              <CardContent className="relative z-10 grid md:grid-cols-3 gap-4">
                {profile.focusAreas?.map((area, i) => (
                  <div key={i} className="bg-white/20 backdrop-blur-md p-6 rounded-3xl border border-white/20 flex flex-col gap-4 group hover:bg-white/30 transition-all cursor-default">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-brand-purple font-bold">
                        {i + 1}
                      </div>
                      <span className="font-bold text-lg">{area}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!!isAddingTodo}
                      onClick={() => handleAddToTodo(area)}
                      className="mt-auto w-full bg-white/10 hover:bg-white text-white hover:text-brand-purple rounded-xl font-bold gap-2 transition-all"
                    >
                      {isAddingTodo === area ? <Loader2 size={16} className="animate-spin" /> : <><Clock size={16} /> Naplánovat</>}
                    </Button>
                  </div>
                ))}
              </CardContent>

              {/* Suggested Practice based on focus areas */}
              <div className="px-10 pb-10 relative z-10">
                <div className="bg-white/10 backdrop-blur-sm rounded-[2rem] p-6 border border-white/10">
                  <h4 className="text-sm font-bold uppercase tracking-widest mb-4 text-purple-200">Doporučená procvičování pro zlepšení:</h4>
                  <div className="flex flex-wrap gap-3">
                    {profile.focusAreas.some(a => a.toLowerCase().includes('geometrie')) && (
                      <Link to="/practice" className="bg-white text-brand-purple px-6 py-2 rounded-xl font-bold text-sm hover:scale-105 transition-transform">
                        Geometrie hravě
                      </Link>
                    )}
                    <Link to="/practice" className="bg-white/20 text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-white/30 transition-all">
                      Příprava na přijímačky
                    </Link>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid md:grid-cols-3 gap-8">
        <Card className="rounded-[2rem] border-none shadow-xl bg-white p-8 flex flex-col items-center text-center group hover:-translate-y-1 transition-all">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-brand-blue mb-4 group-hover:scale-110 transition-transform">
            <Clock size={32} />
          </div>
          <div className="text-4xl font-black text-brand-blue mb-1">{pendingTests.length}</div>
          <h3 className="font-bold text-gray-900">Čekající testy</h3>
          <p className="text-gray-400 text-sm">Dokonči je co nejdříve!</p>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-xl bg-white p-8 flex flex-col items-center text-center group hover:-translate-y-1 transition-all">
          <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center text-brand-orange mb-4 group-hover:scale-110 transition-transform">
            <CheckCircle size={32} />
          </div>
          <div className="text-4xl font-black text-brand-orange mb-1">{completedTests.length}</div>
          <h3 className="font-bold text-gray-900">Hotové testy</h3>
          <p className="text-gray-400 text-sm">Skvělá práce!</p>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-xl bg-white p-8 flex flex-col items-center text-center group hover:-translate-y-1 transition-all">
          <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center text-green-500 mb-4 group-hover:scale-110 transition-transform">
            <Target size={32} />
          </div>
          <div className="text-4xl font-black text-green-500 mb-1">
            {completedTests.filter(t => t.status === 'graded').length}
          </div>
          <h3 className="font-bold text-gray-900">Opravené testy</h3>
          <p className="text-gray-400 text-sm">Podívej se na výsledky.</p>
        </Card>
      </div>

      <Tabs defaultValue="todos" className="space-y-10">
        <TabsList className="bg-white/50 backdrop-blur-md border-2 border-gray-100/50 p-1.5 rounded-3xl h-20 shadow-sm flex items-center mb-10 overflow-x-auto justify-start md:justify-center w-full">
          <TabsTrigger value="todos" className="rounded-2xl px-8 h-full data-[state=active]:bg-white data-[state=active]:text-brand-blue data-[state=active]:shadow-lg font-bold transition-all flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-brand-blue group-data-[state=active]:bg-brand-blue group-data-[state=active]:text-white transition-colors">
              <Clock size={20} />
            </div>
            TODO & Kalendář
          </TabsTrigger>
          <TabsTrigger value="pending" className="rounded-2xl px-8 h-full data-[state=active]:bg-white data-[state=active]:text-brand-orange data-[state=active]:shadow-lg font-bold transition-all flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-brand-orange">
              <FileText size={20} />
            </div>
            Moje testy
          </TabsTrigger>
          <TabsTrigger value="completed" className="rounded-2xl px-8 h-full data-[state=active]:bg-white data-[state=active]:text-brand-blue data-[state=active]:shadow-lg font-bold transition-all flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400">
              <Trophy size={20} />
            </div>
            Historie
          </TabsTrigger>
          <TabsTrigger value="sheets" className="rounded-2xl px-8 h-full data-[state=active]:bg-white data-[state=active]:text-purple-600 data-[state=active]:shadow-lg font-bold transition-all flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <BookOpen size={20} />
            </div>
            Materiály
          </TabsTrigger>
        </TabsList>

        <TabsContent value="todos" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <div className="bg-white/50 p-8 rounded-[2.5rem] border border-white/50 shadow-sm">
                <TodoManager targetStudentId={profile?.uid || ''} />
              </div>
            </div>
            <div className="space-y-8">
              <CountdownTimer todos={todos} compact />
              <QuickCalendar todos={todos} />

              <div className="bg-gradient-to-br from-brand-blue to-blue-700 rounded-[2.5rem] p-8 text-white shadow-xl shadow-blue-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                  <Lightbulb size={120} />
                </div>
                <h3 className="text-xl font-display font-bold mb-2">Tip pro tebe</h3>
                <p className="text-blue-100 text-sm leading-relaxed">
                  Pravidelné procvičování alespoň 15 minut denně výrazně zlepšuje dlouhodobou paměť. Naplánuj si úkoly do kalendáře!
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="pending">
          <div className="grid md:grid-cols-2 gap-8">
            {pendingTests.map(test => (
              <motion.div key={test.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <Card className="rounded-[2.5rem] border-none shadow-xl hover:shadow-2xl transition-all overflow-hidden group bg-white">
                  <div className="h-3 bg-brand-blue/10 group-hover:bg-brand-blue/20 transition-colors" />
                  <CardHeader className="pb-6">
                    <div className="flex justify-between items-start mb-2">
                      <CardTitle className="text-2xl font-display group-hover:text-brand-blue transition-colors">
                        {test.testTitle}
                      </CardTitle>
                      <span className="px-3 py-1 bg-blue-50 text-brand-blue rounded-full text-[10px] font-bold uppercase tracking-wider">
                        Matematika
                      </span>
                    </div>
                    <CardDescription className="flex items-center gap-2 text-gray-400 font-bold">
                      <Clock size={16} /> Přiřazeno: {safeToDate(test.assignedAt)?.toLocaleDateString('cs-CZ')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <Button
                      onClick={() => navigate(`/test/${test.id}`)}
                      className="btn-blue w-full h-14 rounded-2xl text-lg font-bold shadow-xl shadow-blue-100 group-hover:scale-[1.02] transition-transform"
                    >
                      Spustit test <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={20} />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
            {pendingTests.length === 0 && (
              <div className="col-span-full text-center py-24 bg-white/50 rounded-[3rem] border-2 border-dashed border-gray-100">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 text-brand-blue">
                  <CheckCircle size={40} />
                </div>
                <h3 className="text-2xl font-display font-bold text-gray-900 mb-2">Vše hotovo!</h3>
                <p className="text-gray-400 text-lg">Momentálně nemáš žádné čekající testy. 🎉</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="completed">
          <div className="space-y-6">
            {completedTests.map(test => (
              <Card key={test.id} className="rounded-3xl border-none shadow-lg bg-white overflow-hidden hover:shadow-xl transition-all">
                <div className="flex flex-col md:flex-row md:items-center justify-between p-8 gap-6">
                  <div className="flex items-center gap-6">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm ${test.status === 'graded' ? 'bg-green-50 text-green-500' : 'bg-orange-50 text-brand-orange'}`}>
                      {test.status === 'graded' ? <Trophy size={32} /> : <Clock size={32} />}
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-2xl text-gray-900">{test.testTitle}</h3>
                      <p className="text-gray-400 font-bold">
                        {test.status === 'graded'
                          ? `Oznámkováno: ${safeToDate(test.gradedAt)?.toLocaleDateString('cs-CZ')}`
                          : `Odevzdáno: ${safeToDate(test.submittedAt)?.toLocaleDateString('cs-CZ')}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    {test.status === 'graded' && (
                      <div className="text-center md:text-right">
                        <div className="text-4xl font-black text-brand-blue leading-none mb-1">
                          {test.grade}
                        </div>
                        <div className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">Známka</div>
                      </div>
                    )}
                    {test.status === 'submitted' && (
                      <span className="px-6 py-2 bg-orange-50 text-brand-orange rounded-full text-xs font-bold uppercase tracking-widest border border-orange-100">
                        Čeká na opravu
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      className="rounded-xl hover:bg-gray-50"
                      onClick={() => navigate(`/review/${test.id}`)}
                    >
                      Detaily <ArrowRight size={16} className="ml-2" />
                    </Button>
                  </div>
                </div>
                {test.feedback && (
                  <div className="px-8 pb-8 pt-0">
                    <div className="p-6 bg-blue-50/50 rounded-2xl text-brand-blue italic relative">
                      <div className="absolute top-0 left-0 transform -translate-x-1/2 -translate-y-1/2 text-4xl text-brand-blue/10 font-serif">"</div>
                      {test.feedback}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="sheets">
          <div className="grid md:grid-cols-3 gap-8">
            {learningSheets.map(sheet => (
              <Card
                key={sheet.id}
                className="rounded-[2.5rem] border-none shadow-xl hover:shadow-2xl transition-all cursor-pointer group bg-white overflow-hidden"
                onClick={() => setSelectedSheet(sheet)}
              >
                <div className="h-2 bg-brand-purple/10 group-hover:bg-brand-purple/20 transition-colors" />
                <CardHeader>
                  <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center text-brand-purple mb-4 group-hover:scale-110 transition-transform shadow-sm">
                    <BookOpen size={28} />
                  </div>
                  <CardTitle className="text-xl font-display group-hover:text-brand-purple transition-colors">
                    {sheet.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-500 line-clamp-3 leading-relaxed">{sheet.content}</p>
                  <Button variant="link" className="p-0 mt-4 text-brand-purple font-bold">
                    Otevřít materiál <ArrowRight size={16} className="ml-1" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Sheet Viewer Dialog */}
      <Dialog open={!!selectedSheet} onOpenChange={(open) => !open && setSelectedSheet(null)}>
        <DialogContent className="max-w-[98vw] w-[98vw] max-h-[98vh] h-[98vh] overflow-hidden rounded-2xl p-0 border-none flex flex-col">
          {selectedSheet && (
            <div className="flex flex-col h-full w-full bg-white">
              <div className="shrink-0 flex items-center justify-between p-4 bg-white border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <span className="px-3 py-1 bg-purple-50 text-brand-purple rounded-full text-xs font-bold uppercase tracking-widest">
                    {selectedSheet.topic || 'Matematika'}
                  </span>
                  <DialogHeader>
                    <DialogTitle className="text-xl font-display font-bold m-0">
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

              <div className="flex-1 min-h-0 bg-gray-100/50 p-2 md:p-4">
                {selectedSheet.fileUrl ? (
                  <div className="w-full h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <iframe
                      src={selectedSheet.fileUrl}
                      className="w-full h-full border-none"
                      title={selectedSheet.title}
                    />
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
    </div>
  );
}
