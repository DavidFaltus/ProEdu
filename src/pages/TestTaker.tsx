import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AssignedTest, Test, Question, MathTopic } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, ArrowRight, ArrowLeft, Send, Clock, BrainCircuit, Target, Sparkles, Loader2 } from 'lucide-react';
import { GeometryDiagram } from '../components/GeometryDiagram';
import { getRecommendations } from '../services/geminiService';

export default function TestTaker() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [assignedTest, setAssignedTest] = useState<AssignedTest | null>(null);
  const [testData, setTestData] = useState<Test | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [resultStats, setResultStats] = useState<{ score: number, total: number, percentage: number } | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string[] | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        const assignedSnap = await getDoc(doc(db, 'assignedTests', id));
        if (assignedSnap.exists()) {
          const at = { id: assignedSnap.id, ...assignedSnap.data() } as AssignedTest;
          setAssignedTest(at);
          
          const testSnap = await getDoc(doc(db, 'tests', at.testId));
          if (testSnap.exists()) {
            setTestData({ id: testSnap.id, ...testSnap.data() } as Test);
          }
        }
      } catch (error) {
        toast.error('Chyba při načítání testu');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: answer }));
  };

  const calculateTopicPerformance = () => {
    if (!testData) return {};
    
    const performance: Record<string, { correct: number, total: number }> = {};
    
    testData.questions.forEach(q => {
      const topic = q.topic || 'Ostatní';
      if (!performance[topic]) {
        performance[topic] = { correct: 0, total: 0 };
      }
      performance[topic].total += 1;
      if (answers[q.id] === q.correctAnswer) {
        performance[topic].correct += 1;
      }
    });
    
    return performance;
  };

  const handleSubmit = async () => {
    if (!id || !assignedTest || !testData) return;
    
    const topicPerformance = calculateTopicPerformance();
    const totalQuestions = testData.questions.length;
    const correctAnswers = Object.values(topicPerformance).reduce((acc, curr) => acc + curr.correct, 0);
    const percentage = Math.round((correctAnswers / totalQuestions) * 100);
    
    try {
      const updateData: any = {
        answers,
        topicPerformance,
        submittedAt: Timestamp.now()
      };

      if (testData.autoGrade) {
        updateData.status = 'graded';
        updateData.gradedAt = Timestamp.now();
        updateData.grade = percentage >= 90 ? '1' : percentage >= 75 ? '2' : percentage >= 50 ? '3' : percentage >= 30 ? '4' : '5';
        updateData.feedback = `Automaticky vyhodnoceno. Úspěšnost: ${percentage}%.`;
        
        setResultStats({ score: correctAnswers, total: totalQuestions, percentage });
        setShowResults(true);

        // Immediate AI analysis
        setIsAnalyzing(true);
        try {
          const recommendations = await getRecommendations(topicPerformance);
          setAiAnalysis(recommendations);
          // Also update user profile with these focus areas
          if (assignedTest.studentId) {
            await updateDoc(doc(db, 'users', assignedTest.studentId), {
              focusAreas: recommendations
            });
          }
        } catch (err) {
          console.error("AI Analysis failed:", err);
        } finally {
          setIsAnalyzing(false);
        }
      } else {
        updateData.status = 'submitted';
      }

      await updateDoc(doc(db, 'assignedTests', id), {
        ...updateData
      });
      
      if (!testData.autoGrade) {
        toast.success('Test byl úspěšně odevzdán');
        navigate('/student');
      }
    } catch (error) {
      toast.error('Chyba při odevzdávání testu');
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
      <div className="w-16 h-16 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
      <p className="text-brand-blue font-bold text-xl">Připravuji tvůj test...</p>
    </div>
  );
  
  if (!testData) return (
    <div className="text-center py-20">
      <h2 className="text-2xl font-bold text-gray-400">Test nebyl nalezen.</h2>
      <Button onClick={() => navigate('/student')} className="mt-4">Zpět na nástěnku</Button>
    </div>
  );

  if (showResults && resultStats) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-8"
        >
          <div className="w-24 h-24 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto shadow-xl">
            <CheckCircle2 size={48} />
          </div>
          <div className="space-y-2">
            <h1 className="text-5xl font-display font-bold text-gray-900">Skvělá práce!</h1>
            <p className="text-gray-500 text-xl">Test byl automaticky vyhodnocen.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="rounded-[2rem] border-none shadow-xl bg-white p-8">
              <div className="text-4xl font-black text-brand-blue mb-1">{resultStats.score} / {resultStats.total}</div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Správné odpovědi</div>
            </Card>
            <Card className="rounded-[2rem] border-none shadow-xl bg-white p-8">
              <div className="text-4xl font-black text-brand-orange mb-1">{resultStats.percentage}%</div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Úspěšnost</div>
            </Card>
            <Card className="rounded-[2rem] border-none shadow-xl bg-white p-8">
              <div className="text-4xl font-black text-green-500 mb-1">
                {resultStats.percentage >= 90 ? '1' : resultStats.percentage >= 75 ? '2' : resultStats.percentage >= 50 ? '3' : resultStats.percentage >= 30 ? '4' : '5'}
              </div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Výsledná známka</div>
            </Card>
          </div>

          <div className="bg-blue-50/50 p-8 rounded-[3rem] border-2 border-dashed border-blue-100">
            <h3 className="text-xl font-bold text-brand-blue mb-4 flex items-center justify-center gap-2">
              <Sparkles size={20} /> AI Analýza tvého výkonu
            </h3>
            
            {isAnalyzing ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="animate-spin text-brand-blue" size={32} />
                <p className="text-brand-blue font-bold">AI analyzuje tvé odpovědi...</p>
              </div>
            ) : aiAnalysis ? (
              <div className="space-y-4">
                <p className="text-gray-600 font-bold">Na základě tvého výkonu ti doporučujeme zaměřit se na:</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {aiAnalysis.map((area, i) => (
                    <span key={i} className="bg-white px-6 py-2 rounded-2xl text-brand-blue font-bold shadow-sm border border-blue-100">
                      {area}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-gray-400 pt-2">Tato doporučení najdeš i na své nástěnce.</p>
              </div>
            ) : (
              <p className="text-gray-600 leading-relaxed">
                Tvé výsledky byly odeslány do tvého profilu. AI nyní analyzuje tvé slabé stránky a připraví ti doporučení na nástěnce. 
                {resultStats.percentage < 70 && " Doporučujeme se zaměřit na geometrické vzorce a procvičování úloh z CERMATu."}
              </p>
            )}
          </div>

          <Button 
            onClick={() => navigate('/student')}
            className="btn-blue rounded-2xl h-16 px-12 text-xl font-bold shadow-2xl shadow-blue-200"
          >
            Zpět na nástěnku
          </Button>
        </motion.div>
      </div>
    );
  }

  const currentQuestion = testData.questions[currentQuestionIdx];
  const progress = ((currentQuestionIdx + 1) / testData.questions.length) * 100;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10 pb-20">
      <header className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-brand-blue shadow-sm">
              <BrainCircuit size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold text-brand-blue">{testData.title}</h1>
              <div className="flex items-center gap-2 text-gray-400 text-sm font-bold">
                <Target size={14} /> {currentQuestion.topic || 'Matematika'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl shadow-sm border border-gray-50">
            <div className="text-right">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Postup</div>
              <div className="text-xl font-black text-brand-blue">
                {currentQuestionIdx + 1} <span className="text-gray-300">/</span> {testData.questions.length}
              </div>
            </div>
            <div className="w-12 h-12 rounded-full border-4 border-blue-50 flex items-center justify-center relative">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="transparent"
                  className="text-brand-blue"
                  strokeDasharray={125.6}
                  strokeDashoffset={125.6 - (125.6 * progress) / 100}
                />
              </svg>
              <span className="absolute text-[10px] font-bold text-brand-blue">{Math.round(progress)}%</span>
            </div>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQuestionIdx}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white">
            <CardHeader className="p-10 bg-gradient-to-br from-blue-50/50 to-white border-b border-blue-50">
              <div className="flex items-center gap-2 mb-4">
                <span className="px-4 py-1 bg-brand-blue text-white rounded-full text-xs font-bold uppercase tracking-widest">
                  Otázka {currentQuestionIdx + 1}
                </span>
                {currentQuestion.topic && (
                  <span className="px-4 py-1 bg-orange-50 text-brand-orange rounded-full text-xs font-bold uppercase tracking-widest">
                    {currentQuestion.topic}
                  </span>
                )}
              </div>
              <CardTitle className="text-3xl md:text-4xl leading-tight font-display text-gray-900">
                {currentQuestion.question}
              </CardTitle>
              {currentQuestion.diagram && (
                <div className="mt-8">
                  <GeometryDiagram type={currentQuestion.diagram} />
                </div>
              )}
            </CardHeader>
            <CardContent className="p-10">
              <RadioGroup 
                value={answers[currentQuestion.id] || ''} 
                onValueChange={(val) => handleAnswer(currentQuestion.id, val)}
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
              >
                {currentQuestion.options.map((opt, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => handleAnswer(currentQuestion.id, opt)}
                    className={`flex items-center space-x-4 p-6 rounded-[2rem] border-4 cursor-pointer transition-all duration-300 group ${
                      answers[currentQuestion.id] === opt 
                        ? 'border-brand-blue bg-blue-50 shadow-lg shadow-blue-100' 
                        : 'border-gray-50 bg-gray-50/30 hover:border-blue-100 hover:bg-white hover:shadow-xl'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black transition-all ${
                      answers[currentQuestion.id] === opt 
                        ? 'bg-brand-blue text-white' 
                        : 'bg-white text-gray-400 group-hover:text-brand-blue'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </div>
                    <RadioGroupItem value={opt} id={`opt-${idx}`} className="sr-only" />
                    <Label htmlFor={`opt-${idx}`} className="flex-1 text-xl font-bold cursor-pointer text-gray-700">
                      {opt}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      <div className="flex justify-between items-center pt-6">
        <Button 
          variant="ghost" 
          onClick={() => setCurrentQuestionIdx(prev => Math.max(0, prev - 1))}
          disabled={currentQuestionIdx === 0}
          className="rounded-2xl gap-2 h-14 px-8 text-lg font-bold hover:bg-white hover:shadow-lg transition-all"
        >
          <ArrowLeft size={24} /> Předchozí
        </Button>

        {currentQuestionIdx === testData.questions.length - 1 ? (
          <Button 
            onClick={handleSubmit} 
            disabled={!answers[currentQuestion.id]}
            className="btn-orange rounded-2xl gap-2 h-14 px-12 text-xl font-bold shadow-2xl shadow-orange-200 hover:scale-105 transition-transform"
          >
            Odevzdat test <Send size={24} />
          </Button>
        ) : (
          <Button 
            onClick={() => setCurrentQuestionIdx(prev => prev + 1)}
            disabled={!answers[currentQuestion.id]}
            className="btn-blue rounded-2xl gap-2 h-14 px-12 text-xl font-bold shadow-2xl shadow-blue-200 hover:scale-105 transition-transform"
          >
            Další <ArrowRight size={24} />
          </Button>
        )}
      </div>
    </div>
  );
}
