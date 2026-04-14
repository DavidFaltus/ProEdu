import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { useAuth } from '../context/AuthContext';
import { AssignedTest, LearningSheet, MathTopic } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { FileText, CheckCircle, BookOpen, Clock, Trophy, ArrowRight, Sparkles, Target, Lightbulb, BarChart3 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { getRecommendations } from '../services/geminiService';

interface TopicStats {
  correct: number;
  total: number;
}

export default function StudentDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [assignedTests, setAssignedTests] = useState<AssignedTest[]>([]);
  const [learningSheets, setLearningSheets] = useState<LearningSheet[]>([]);
  const [isUpdatingRecommendations, setIsUpdatingRecommendations] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState<LearningSheet | null>(null);

  useEffect(() => {
    if (!profile) return;

    const unsubAssigned = onSnapshot(query(collection(db, 'assignedTests'), where('studentId', '==', profile.uid)), (snap) => {
      setAssignedTests(snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignedTest)));
    });

    const unsubSheets = onSnapshot(collection(db, 'learningSheets'), (snap) => {
      setLearningSheets(snap.docs.map(d => ({ id: d.id, ...d.data() } as LearningSheet)));
    });

    return () => {
      unsubAssigned();
      unsubSheets();
    };
  }, [profile]);

  // Logic to update recommendations based on graded tests
  useEffect(() => {
    const updateRecommendations = async () => {
      if (!profile || isUpdatingRecommendations) return;
      
      const gradedTests = assignedTests.filter(t => t.status === 'graded' && t.topicPerformance);
      if (gradedTests.length === 0) return;

      // Aggregate performance
      const performance: Record<string, { correct: number, total: number }> = {};
      gradedTests.forEach(test => {
        if (test.topicPerformance) {
          Object.entries(test.topicPerformance).forEach(([topic, stats]) => {
            const s = stats as TopicStats;
            if (!performance[topic]) {
              performance[topic] = { correct: 0, total: 0 };
            }
            performance[topic].correct += s.correct;
            performance[topic].total += s.total;
          });
        }
      });

      // Simple heuristic: if we have new graded tests, refresh recommendations
      // For now, let's just do it once if focusAreas is empty or after a new test is graded
      if (!profile.focusAreas || profile.focusAreas.length === 0) {
        setIsUpdatingRecommendations(true);
        try {
          const recommendations = await getRecommendations(performance);
          await updateDoc(doc(db, 'users', profile.uid), {
            focusAreas: recommendations
          });
        } catch (error) {
          console.error("Failed to get AI recommendations", error);
        } finally {
          setIsUpdatingRecommendations(false);
        }
      }
    };

    updateRecommendations();
  }, [assignedTests, profile, isUpdatingRecommendations]);

  const pendingTests = assignedTests.filter(t => t.status === 'pending');
  const completedTests = assignedTests.filter(t => t.status !== 'pending');

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-10 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-5xl font-display font-bold text-brand-blue">
            Ahoj, {profile?.name}! 👋
          </h1>
          <p className="text-gray-500 text-lg">Tady je tvůj přehled studia a úkolů.</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-white p-4 rounded-3xl shadow-xl flex items-center gap-3 border-2 border-blue-50">
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-brand-blue">
              <Trophy size={24} />
            </div>
            <div>
              <div className="text-2xl font-black text-brand-blue leading-none">
                {completedTests.filter(t => t.status === 'graded').length}
              </div>
              <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Hotovo</div>
            </div>
          </div>
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
                  <div key={i} className="bg-white/20 backdrop-blur-md p-6 rounded-3xl border border-white/20 flex items-center gap-4 group hover:bg-white/30 transition-all cursor-default">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-brand-purple font-bold">
                      {i + 1}
                    </div>
                    <span className="font-bold text-lg">{area}</span>
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

      <Tabs defaultValue="pending" className="space-y-8">
        <TabsList className="bg-white border-2 border-gray-50 p-1 rounded-2xl h-16 shadow-sm w-full md:w-auto overflow-x-auto flex-nowrap justify-start">
          <TabsTrigger value="pending" className="rounded-xl px-8 h-full data-[state=active]:bg-blue-50 data-[state=active]:text-brand-blue font-bold">
            Aktuální úkoly
          </TabsTrigger>
          <TabsTrigger value="completed" className="rounded-xl px-8 h-full data-[state=active]:bg-blue-50 data-[state=active]:text-brand-blue font-bold">
            Historie
          </TabsTrigger>
          <TabsTrigger value="sheets" className="rounded-xl px-8 h-full data-[state=active]:bg-blue-50 data-[state=active]:text-brand-blue font-bold">
            Materiály
          </TabsTrigger>
        </TabsList>

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
                      <Clock size={16} /> Přiřazeno: {test.assignedAt.toDate().toLocaleDateString('cs-CZ')}
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
                          ? `Oznámkováno: ${test.gradedAt?.toDate().toLocaleDateString('cs-CZ')}` 
                          : `Odevzdáno: ${test.submittedAt?.toDate().toLocaleDateString('cs-CZ')}`}
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
        <DialogContent className="max-w-5xl w-full h-[90vh] flex flex-col rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden">
          <div className="p-6 pb-4 border-b border-gray-100 flex-shrink-0">
            <DialogTitle className="text-3xl font-display font-bold text-brand-blue">
              {selectedSheet?.title}
            </DialogTitle>
            {selectedSheet?.topic && (
              <span className="inline-block mt-2 px-3 py-1 bg-purple-50 text-brand-purple rounded-full text-xs font-bold uppercase">
                {selectedSheet.topic}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
            {selectedSheet?.fileUrl ? (
              <div className="w-full h-full min-h-[60vh] rounded-2xl overflow-hidden border-2 border-gray-100 bg-white">
                <iframe 
                  src={selectedSheet.fileUrl} 
                  className="w-full h-full border-none"
                  title={selectedSheet.title}
                />
              </div>
            ) : (
              <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 min-h-[60vh]">
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap text-lg">
                  {selectedSheet?.content}
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
