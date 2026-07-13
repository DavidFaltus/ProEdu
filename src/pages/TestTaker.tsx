import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, Timestamp } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, ArrowRight, BrainCircuit, CheckCircle2, Loader2, Send, Sparkles, Target, HelpCircle, Lightbulb } from 'lucide-react';
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
import { submitAppletTest } from '../services/courseService';

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

const getTopicTip = (topic: string | undefined): string => {
  if (!topic) return '';
  const tips: Record<string, string> = {
    'Počítání a čísla': 'Dávej si pozor na prioritu násobení před sčítáním a správné znaménko.',
    'Rovnice a výrazy': 'Nezapomínej provést zkoušku a hlídat si znaménka při roznásobování.',
    'Procenta poměry a data': 'Uvědom si, co je základ (100 %) a co je část.',
    'Geometrie': 'Náčrtek ti pomůže! Vzpomeň si na Pythagorovu větu.',
    'Rýsování': 'Postupuj přesně krok za krokem podle konstrukčních zásad.',
    'Slovní úlohy': 'Převeď text do rovnic a ujasni si neznámou.',
    'Logické chytáky': 'Zkus si situaci nakreslit nebo vyřešit pro menší čísla.',
    'Pravopis a chytáky': 'Najdi si podmět a přísudek, zkontroluj vyjmenovaná slova.',
    'Gramatika (stavba slov, vět)': 'Urči si základní skladební dvojici a slovní druhy.',
    'Spisovnost a významy slov': 'Zamysli se nad přeneseným významem a kontextem věty.',
    'Práce s textem a sloh': 'Přečti si pozorně otázku a hledej odpověď přímo v textu.',
    'Literatura a poezie': 'Všímej si rýmové struktury a básnických figur.',
    'Poslech a porozumění': 'Soustřeď se na klíčová slova a kontext rozhovoru.',
    'Slovní zásoba': 'Vyluč zjevně nesprávné odpovědi a dosaď slovo do věty.',
    'Časy a pomocná slovesa': 'Najdi časové určení (yesterday, since, tomorrow), které ti napoví správný čas.',
    'Předložky': 'Pozor na rozdíly mezi českými a anglickými předložkovými vazbami.',
    'Ustálené vazby': 'Některá slovesa se pojí s gerundiem (-ing) a jiná s infinitivem.',
    'Stavba věty': 'V angličtině platí pevný slovosled: podmet - přísudek - předmět.'
  };
  return tips[topic] || '';
};

const formatExplanation = (text: string | undefined, isCorrect: boolean) => {
  if (!text) return null;
  const lines = text.split(/(?:=>|\n|;)/).map(line => line.trim()).filter(Boolean);
  return (
    <div className="space-y-2 mt-2">
      {lines.map((line, idx) => (
        <div key={idx} className={`flex items-start gap-2 ${isCorrect ? 'text-emerald-800' : 'text-rose-800'}`}>
          <span className={`font-bold ${isCorrect ? 'text-emerald-500' : 'text-rose-500'}`}>→</span>
          <span className="text-sm font-medium leading-relaxed">{line}</span>
        </div>
      ))}
    </div>
  );
};

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
  const [showTeacherThankYou, setShowTeacherThankYou] = useState(false);
  const [resultStats, setResultStats] = useState<SubmitResponse['resultStats'] | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string[] | null>(null);

  // States for instant feedback during practice
  const [correctAnswers, setCorrectAnswers] = useState<Record<string, { correctAnswer: string, explanation?: string }>>({});
  const [checkedQuestions, setCheckedQuestions] = useState<Record<string, {
    checked: boolean;
    isCorrect: boolean;
  }>>({});

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

          // Fetch correct answers for instant feedback in practice tests
          if (data.testId) {
            try {
              const testSnap = await getDoc(doc(db, 'tests', data.testId));
              if (testSnap.exists()) {
                const testData = testSnap.data();
                const answersMap: Record<string, { correctAnswer: string, explanation?: string }> = {};
                if (testData.questions) {
                  testData.questions.forEach((q: any) => {
                    answersMap[q.id] = {
                      correctAnswer: q.correctAnswer,
                      explanation: q.explanation || ''
                    };
                  });
                }
                setCorrectAnswers(answersMap);
              }
            } catch (err) {
              console.warn("Could not load correct answers for instant feedback:", err);
            }
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

  const handleCheckAnswer = () => {
    if (!currentQuestion) return;
    const qId = currentQuestion.id;
    const userAnswer = answers[qId];
    const correctAnsObj = correctAnswers[qId];
    if (!correctAnsObj) return;

    const isCorrect = userAnswer === correctAnsObj.correctAnswer;
    setCheckedQuestions(prev => ({
      ...prev,
      [qId]: {
        checked: true,
        isCorrect
      }
    }));
  };

  const handleTryAgain = () => {
    if (!currentQuestion) return;
    const qId = currentQuestion.id;
    setAnswers(prev => {
      const copy = { ...prev };
      delete copy[qId];
      return copy;
    });
    setCheckedQuestions(prev => ({
      ...prev,
      [qId]: {
        checked: false,
        isCorrect: false
      }
    }));
  };

  const handleSubmit = async () => {
    if (!assignedTest || !id) {
      return;
    }

    setIsSubmitting(true);

    // Pre-calculate client-side stats in case of network or server admin failures
    let correctCount = 0;
    const totalCount = questions.length;
    questions.forEach(q => {
      const correctAns = correctAnswers[q.id]?.correctAnswer;
      if (answers[q.id] === correctAns) {
        correctCount++;
      }
    });
    const percentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
    const localResultStats = {
      score: correctCount,
      total: totalCount,
      percentage: percentage
    };

    try {
      const response = await submitAppletTest(id, answers) as any;

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

      // Graded status is false, so it's a teacher-assigned test
      setShowTeacherThankYou(true);
    } catch (error) {
      console.error("Submission failed on backend:", error);

      if (isPractice) {
        // Fallback for self-assigned practice tests: complete the todo on client
        try {
          const todosRef = collection(db, 'todos');
          const qTodos = query(todosRef, where('assignedTestId', '==', id));
          const snap = await getDocs(qTodos);
          for (const d of snap.docs) {
            await updateDoc(d.ref, {
              completed: true,
              completedAt: Timestamp.now()
            });
          }
        } catch (todoErr) {
          console.error("Failed to complete todo:", todoErr);
        }

        setResultStats(localResultStats);
        
        // Populate local recommendations based on wrong answers
        const localPerformance: Record<string, { correct: number; total: number }> = {};
        questions.forEach(q => {
          const topic = q.topic || 'Ostatní';
          if (!localPerformance[topic]) {
            localPerformance[topic] = { correct: 0, total: 0 };
          }
          localPerformance[topic].total += 1;
          if (answers[q.id] === correctAnswers[q.id]?.correctAnswer) {
            localPerformance[topic].correct += 1;
          }
        });
        
        const weaknesses = Object.entries(localPerformance)
          .map(([topic, stats]) => ({
            topic,
            accuracy: stats.total > 0 ? stats.correct / stats.total : 1,
          }))
          .filter(e => e.accuracy < 0.8)
          .map(e => e.topic);

        setAiAnalysis(weaknesses.length > 0 ? weaknesses.slice(0, 3) : [activeQuestion.topic]);
        setShowResults(true);
      } else {
        // Teacher test requires reliable backend submission
        toast.error(error instanceof Error ? error.message : 'Chyba při odevzdávání testu.');
      }
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
  const isPractice = assignedTest.autoGrade === true;
  const isChecked = checkedQuestions[activeQuestion.id]?.checked;
  const isCorrect = checkedQuestions[activeQuestion.id]?.isCorrect;
  const canGoNext = !isPractice || isChecked;

  if (showTeacherThankYou) {
    return (
      <div className="focus-container">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-8 max-w-2xl mx-auto py-12">
          <div className="w-24 h-24 bg-blue-50 text-brand-blue rounded-full flex items-center justify-center mx-auto shadow-xl">
            <Send size={48} />
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-display font-bold text-gray-900">Děkujeme za vyplnění!</h1>
            <p className="text-gray-500 text-lg">
              Tvůj test byl úspěšně odevzdán učiteli k ohodnocení.
            </p>
            <p className="text-sm text-gray-400">
              Jakmile učitel test zkontroluje a oznámkuje, výsledky i s komentářem uvidíš na své hlavní nástěnce.
            </p>
          </div>

          <div className="pt-6">
            <Button onClick={() => navigate('/student')} className="btn-blue rounded-2xl h-14 px-10 text-lg font-bold shadow-lg shadow-blue-100">
              Zpět na nástěnku
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (showResults && resultStats) {
    const isSuccess = resultStats.percentage >= 40;
    const isOutstanding = resultStats.percentage >= 80;

    let resultTitle = "Skvělá práce!";
    let resultSubtitle = "Test byl automaticky vyhodnocen.";
    let resultIcon = <CheckCircle2 size={48} />;
    let iconBgClass = "bg-green-50 text-green-500";

    if (isOutstanding) {
      resultTitle = "Úžasný výsledek!";
      resultSubtitle = "Test byl vyhodnocen. Jde ti to naprosto skvěle!";
    } else if (isSuccess) {
      resultTitle = "Dobrá práce!";
      resultSubtitle = "Máš pěkný základ, příště to bude ještě lepší!";
    } else {
      resultTitle = "Teď víme, na čem zapracovat!";
      resultSubtitle = "Ještě pár procvičení a už to tam bude. Každá chyba tě posouvá dál!";
      resultIcon = <Sparkles size={48} />;
      iconBgClass = "bg-amber-50 text-amber-500";
    }

    return (
      <div className="focus-container">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-8">
          <div className={`w-24 h-24 ${iconBgClass} rounded-full flex items-center justify-center mx-auto shadow-xl`}>
            {resultIcon}
          </div>

          <div className="space-y-2 max-w-xl mx-auto">
            <h1 className="text-5xl font-display font-bold text-gray-900 leading-tight">{resultTitle}</h1>
            <p className="text-gray-500 text-xl leading-relaxed">{resultSubtitle}</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
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

          {/* Progress gauge container */}
          <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl shadow-sm border border-gray-50">
            <div className="text-right">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Postup</div>
              <div className="text-xl font-black text-brand-blue">
                {currentQuestionIdx + 1} <span className="text-gray-300">/</span> {questions.length}
              </div>
            </div>
            <div className="w-12 h-12 flex items-center justify-center relative">
              <svg className="w-12 h-12 transform -rotate-90" viewBox="0 0 48 48">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="#eff6ff"
                  strokeWidth="4"
                  fill="transparent"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="#2B44B8"
                  strokeWidth="4"
                  fill="transparent"
                  strokeDasharray={125.6}
                  strokeDashoffset={125.6 - (125.6 * progress) / 100}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-[10px] font-black text-brand-blue">{Math.round(progress)}%</span>
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
          <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white relative">
            
            {/* Flying Teacher Avatar with speech bubble popover */}
            <div className="absolute top-6 right-6 group z-30">
              <div className="w-12 h-12 bg-amber-50 hover:bg-amber-100 border border-amber-200/50 text-amber-500 rounded-full flex items-center justify-center cursor-pointer shadow-md hover:shadow-lg hover:scale-105 transition-all">
                <Lightbulb className="w-6 h-6 animate-pulse" />
              </div>
              <div className="absolute right-0 top-14 w-64 p-4 bg-[#1E1B18] text-white text-xs rounded-2xl shadow-xl transition-all duration-300 opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto leading-relaxed border border-gray-800">
                <div className="absolute top-0 right-5 -mt-2 w-4 h-4 bg-[#1E1B18] transform rotate-45 border-t border-l border-gray-800" />
                <span className="font-extrabold text-amber-400 block mb-1">💡 Tip k řešení:</span>
                <span>
                  {activeQuestion.explanation?.includes('Tip:') 
                    ? activeQuestion.explanation.split('Tip:')[1].trim()
                    : getTopicTip(activeQuestion.topic) || 'Přečti si pozorně zadání a zkus postupně vyloučit zjevně chybné odpovědi.'}
                </span>
              </div>
            </div>

            <CardHeader className="p-10 bg-gradient-to-br from-blue-50/50 to-white border-b border-blue-50 pr-24">
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
            
            <CardContent className="p-10 space-y-8">
              <QuestionOptions
                question={activeQuestion}
                selectedAnswer={answers[activeQuestion.id] || ''}
                onChange={(value) => handleAnswer(activeQuestion.id, value)}
                disabled={isChecked}
              />

              {/* Instant feedback area for practice tests */}
              {isPractice && correctAnswers[activeQuestion.id] && (
                <div className="pt-6 border-t border-gray-100 space-y-4">
                  {!isChecked ? (
                    <div className="flex justify-center">
                      <Button
                        onClick={handleCheckAnswer}
                        disabled={!answers[activeQuestion.id]}
                        className="bg-[#B80053] hover:bg-[#9B004F] text-white rounded-2xl h-12 px-8 text-base font-bold shadow-lg"
                      >
                        Ověřit odpověď
                      </Button>
                    </div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`p-6 rounded-[2rem] border ${
                        isCorrect
                          ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                          : 'bg-rose-50 border-rose-100 text-rose-800'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isCorrect ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600'
                        }`}>
                          {isCorrect ? <CheckCircle2 className="w-6 h-6" /> : <HelpCircle className="w-6 h-6" />}
                        </div>
                        <div className="space-y-2 flex-1">
                          <h4 className="font-extrabold text-lg leading-tight">
                            {isCorrect ? 'Výborně! Odpověď je správná.' : 'Tato odpověď bohužel není správná.'}
                          </h4>
                          
                          {/* Formatted step-by-step Explanation only when incorrect */}
                          {!isCorrect && correctAnswers[activeQuestion.id].explanation && (
                            <div className="text-sm leading-normal opacity-90">
                              <span className="font-bold block mb-1">
                                Nápověda / Vysvětlení:
                              </span>
                              {formatExplanation(correctAnswers[activeQuestion.id].explanation, isCorrect)}
                            </div>
                          )}

                          {/* Try Again Button if incorrect */}
                          {!isCorrect && (
                            <div className="pt-2">
                              <Button
                                onClick={handleTryAgain}
                                className="bg-rose-500 hover:bg-rose-600 text-white rounded-xl h-10 px-5 text-xs font-bold shadow-md"
                              >
                                Zkusit znovu
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </AnimatePresence>

      <div className="flex justify-between items-center pt-6">
        {currentQuestionIdx > 0 ? (
          <Button
            variant="ghost"
            onClick={() => setCurrentQuestionIdx((index) => Math.max(0, index - 1))}
            disabled={isSubmitting}
            className="rounded-2xl gap-2 h-14 px-8 text-lg font-bold hover:bg-white hover:shadow-lg transition-all"
          >
            <ArrowLeft size={24} /> Předchozí
          </Button>
        ) : (
          <div />
        )}

        {currentQuestionIdx === questions.length - 1 ? (
          <Button
            onClick={handleSubmit}
            disabled={!answers[activeQuestion.id] || !canGoNext || isSubmitting}
            className="btn-orange rounded-2xl gap-2 h-14 px-12 text-xl font-bold shadow-2xl shadow-orange-200"
          >
            {isSubmitting ? <Loader2 size={24} className="animate-spin" /> : <>Odevzdat test <Send size={24} /></>}
          </Button>
        ) : (
          <Button
            onClick={() => setCurrentQuestionIdx((index) => index + 1)}
            disabled={!answers[activeQuestion.id] || !canGoNext}
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
  disabled
}: {
  question: PublicQuestion;
  selectedAnswer: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  if (question.type === 'open') {
    return (
      <div className="space-y-4">
        <Label className="text-sm font-bold text-gray-400 uppercase tracking-widest pl-4">Tvá odpověď</Label>
        <Textarea
          value={selectedAnswer}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Zde napište své řešení..."
          className="rounded-[2rem] border-4 border-gray-50 bg-gray-50/30 p-8 text-xl font-medium min-h-[200px] focus:border-brand-blue focus:bg-white transition-all outline-none"
        />
      </div>
    );
  }

  return (
    <RadioGroup value={selectedAnswer} onValueChange={onChange} disabled={disabled} className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {question.options.map((option, index) => (
        <div
          key={option}
          onClick={() => !disabled && onChange(option)}
          className={`flex items-center space-x-4 p-6 rounded-[2rem] border-4 transition-all duration-300 group ${
            disabled ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
          } ${
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
