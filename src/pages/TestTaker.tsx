import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, BrainCircuit, CheckCircle2, Loader2, Send, Sparkles, Target } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { AssignedTest, PublicQuestion } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { GeometryDiagram } from '../components/GeometryDiagram';
import { Label } from '../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Textarea } from '../components/ui/textarea';
import { postApi } from '../services/apiClient';

interface SubmitResponse {
  status: 'submitted' | 'graded';
  grade?: string;
  feedback?: string;
  recommendations?: string[];
  resultStats: {
    score: number;
    total: number;
    percentage: number;
  };
}

export default function TestTaker() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { updateProfileData } = useAuth();
  const [assignedTest, setAssignedTest] = useState<AssignedTest | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [resultStats, setResultStats] = useState<SubmitResponse['resultStats'] | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string[] | null>(null);

  useEffect(() => {
    const fetchAssignedTest = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const assignedSnap = await getDoc(doc(db, 'assignedTests', id));

        if (assignedSnap.exists()) {
          const data = { id: assignedSnap.id, ...assignedSnap.data() } as AssignedTest;
          setAssignedTest(data);

          if (data.status === 'graded' && data.reviewQuestions?.length) {
            navigate(`/review/${data.id}`, { replace: true });
            return;
          }
        }
      } catch (error) {
        console.error(error);
        toast.error('Chyba při načítání testu.');
      } finally {
        setLoading(false);
      }
    };

    fetchAssignedTest();
  }, [id, navigate]);

  const questions = assignedTest?.questions || [];
  const currentQuestion = questions[currentQuestionIdx];
  const progress = questions.length > 0 ? ((currentQuestionIdx + 1) / questions.length) * 100 : 0;

  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers((currentAnswers) => ({
      ...currentAnswers,
      [questionId]: answer,
    }));
  };

  const handleSubmit = async () => {
    if (!assignedTest || !id) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await postApi<SubmitResponse>(`/assigned-tests/${id}/submit`, {
        answers,
      });

      if (response.status === 'graded') {
        setResultStats(response.resultStats);
        setAiAnalysis(response.recommendations || null);
        if (response.recommendations?.length) {
          try {
            await updateProfileData({ focusAreas: response.recommendations });
          } catch (profileError) {
            console.error(profileError);
          }
        }
        setShowResults(true);
        return;
      }

      toast.success('Test byl úspěšně odevzdán.');
      navigate('/student');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Chyba při odevzdávání testu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-16 h-16 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
        <p className="text-brand-blue font-bold text-xl">Připravuji tvůj test...</p>
      </div>
    );
  }

  if (!assignedTest || questions.length === 0) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-gray-400">Test nebyl nalezen.</h2>
        <Button onClick={() => navigate('/student')} className="mt-4">
          Zpět na nástěnku
        </Button>
      </div>
    );
  }

  const activeQuestion = currentQuestion!;

  if (showResults && resultStats) {
    return (
      <div className="focus-container">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-8">
          <div className="w-24 h-24 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto shadow-xl">
            <CheckCircle2 size={48} />
          </div>

          <div className="space-y-2">
            <h1 className="text-5xl font-display font-bold text-gray-900">Skvělá práce!</h1>
            <p className="text-gray-500 text-xl">Test byl automaticky vyhodnocen.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card className="rounded-[2rem] border-none shadow-xl bg-white p-8">
              <div className="text-4xl font-black text-brand-blue mb-1">
                {resultStats.score} / {resultStats.total}
              </div>
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
              <Sparkles size={20} /> Doporučení pro další procvičování
            </h3>

            {aiAnalysis && aiAnalysis.length > 0 ? (
              <div className="space-y-4">
                <p className="text-gray-600 font-bold">Na základě výsledku ti doporučujeme zaměřit se na:</p>
                <div className="flex flex-wrap justify-center gap-3">
                  {aiAnalysis.map((area) => (
                    <span key={area} className="bg-white px-6 py-2 rounded-2xl text-brand-blue font-bold shadow-sm border border-blue-100">
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-gray-600">Doporučení byla uložena do tvého profilu.</p>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-4">
            <Button onClick={() => navigate(`/review/${assignedTest.id}`)} className="btn-orange rounded-2xl h-16 px-10 text-lg font-bold">
              Zobrazit rozbor
            </Button>
            <Button onClick={() => navigate('/student')} className="btn-blue rounded-2xl h-16 px-10 text-lg font-bold">
              Zpět na nástěnku
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="focus-container">
      <header className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-brand-blue shadow-sm">
              <BrainCircuit size={32} />
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold text-brand-blue">{assignedTest.testTitle}</h1>
              <div className="flex items-center gap-2 text-gray-400 text-sm font-bold">
                <Target size={14} /> {activeQuestion.topic || assignedTest.topic || 'Matematika'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl shadow-sm border border-gray-50">
            <div className="text-right">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Postup</div>
              <div className="text-xl font-black text-brand-blue">
                {currentQuestionIdx + 1} <span className="text-gray-300">/</span> {questions.length}
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
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white">
            <CardHeader className="p-10 bg-gradient-to-br from-blue-50/50 to-white border-b border-blue-50">
              <div className="flex items-center gap-2 mb-4">
                <span className="px-4 py-1 bg-brand-blue text-white rounded-full text-xs font-bold uppercase tracking-widest">
                  Otázka {currentQuestionIdx + 1}
                </span>
                {currentQuestion?.topic && (
                  <span className="px-4 py-1 bg-orange-50 text-brand-orange rounded-full text-xs font-bold uppercase tracking-widest">
                    {activeQuestion.topic}
                  </span>
                )}
              </div>
              <CardTitle className="text-3xl md:text-4xl leading-tight font-display text-gray-900">
                {activeQuestion.question}
              </CardTitle>
              {activeQuestion.imageUrl && (
                <div className="mt-6 rounded-2xl overflow-hidden border border-gray-100 shadow-sm max-w-2xl mx-auto">
                   <img src={activeQuestion.imageUrl} alt="Zadání otázky" className="w-full object-contain max-h-[400px]" referrerPolicy="no-referrer" />
                </div>
              )}
              {activeQuestion.diagram && (
                <div className="mt-8">
                  <GeometryDiagram type={activeQuestion.diagram} />
                </div>
              )}
            </CardHeader>
            <CardContent className="p-10">
              <QuestionOptions
                question={activeQuestion}
                selectedAnswer={answers[activeQuestion.id] || ''}
                onChange={(value) => handleAnswer(activeQuestion.id, value)}
              />
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      <div className="flex justify-between items-center pt-6">
        <Button
          variant="ghost"
          onClick={() => setCurrentQuestionIdx((index) => Math.max(0, index - 1))}
          disabled={currentQuestionIdx === 0 || isSubmitting}
          className="rounded-2xl gap-2 h-14 px-8 text-lg font-bold hover:bg-white hover:shadow-lg transition-all"
        >
          <ArrowLeft size={24} /> Předchozí
        </Button>

        {currentQuestionIdx === questions.length - 1 ? (
          <Button
            onClick={handleSubmit}
            disabled={!answers[activeQuestion.id] || isSubmitting}
            className="btn-orange rounded-2xl gap-2 h-14 px-12 text-xl font-bold shadow-2xl shadow-orange-200"
          >
            {isSubmitting ? <Loader2 size={24} className="animate-spin" /> : <>Odevzdat test <Send size={24} /></>}
          </Button>
        ) : (
            <Button
              onClick={() => setCurrentQuestionIdx((index) => index + 1)}
            disabled={!answers[activeQuestion.id]}
            className="btn-blue rounded-2xl gap-2 h-14 px-12 text-xl font-bold shadow-2xl shadow-blue-200"
          >
            Další <ArrowRight size={24} />
          </Button>
        )}
      </div>
    </div>
  );
}

function QuestionOptions({
  question,
  selectedAnswer,
  onChange,
}: {
  question: PublicQuestion;
  selectedAnswer: string;
  onChange: (value: string) => void;
}) {
  if (question.type === 'open') {
    return (
      <div className="space-y-4">
        <Label className="text-sm font-bold text-gray-400 uppercase tracking-widest pl-4">Tvá odpověď</Label>
        <Textarea
          value={selectedAnswer}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Zde napište své řešení..."
          className="rounded-[2rem] border-4 border-gray-50 bg-gray-50/30 p-8 text-xl font-medium min-h-[200px] focus:border-brand-blue focus:bg-white transition-all outline-none"
        />
      </div>
    );
  }

  return (
    <RadioGroup value={selectedAnswer} onValueChange={onChange} className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {question.options.map((option, index) => (
        <div
          key={option}
          onClick={() => onChange(option)}
          className={`flex items-center space-x-4 p-6 rounded-[2rem] border-4 cursor-pointer transition-all duration-300 group ${
            selectedAnswer === option
              ? 'border-brand-blue bg-blue-50 shadow-lg shadow-blue-100'
              : 'border-gray-50 bg-gray-50/30 hover:border-blue-100 hover:bg-white hover:shadow-xl'
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-black transition-all ${
              selectedAnswer === option ? 'bg-brand-blue text-white' : 'bg-white text-gray-400 group-hover:text-brand-blue'
            }`}
          >
            {String.fromCharCode(65 + index)}
          </div>
          <RadioGroupItem value={option} id={`${question.id}-${index}`} className="sr-only" />
          <Label htmlFor={`${question.id}-${index}`} className="flex-1 text-xl font-bold cursor-pointer text-gray-700">
            {option}
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}
