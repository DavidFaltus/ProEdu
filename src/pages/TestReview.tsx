import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle2, Info, XCircle } from 'lucide-react';
import { db } from '../lib/firebase';
import { AssignedTest, ReviewQuestion } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { GeometryDiagram } from '../components/GeometryDiagram';

export default function TestReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [assignedTest, setAssignedTest] = useState<AssignedTest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReview = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const assignedSnap = await getDoc(doc(db, 'assignedTests', id));

        if (assignedSnap.exists()) {
          setAssignedTest({ id: assignedSnap.id, ...assignedSnap.data() } as AssignedTest);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchReview();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-16 h-16 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
        <p className="text-brand-blue font-bold text-xl">Načítám výsledky...</p>
      </div>
    );
  }

  const reviewQuestions = assignedTest?.reviewQuestions || [];
  const displayQuestions = reviewQuestions.length > 0 ? reviewQuestions : (assignedTest?.questions || []);
  const correctCount = reviewQuestions.filter((question) => question.isCorrect).length;

  if (!assignedTest || (reviewQuestions.length === 0 && (assignedTest.questions || []).length === 0)) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-gray-400">Výsledky nebyly nalezeny.</h2>
        <Button onClick={() => navigate('/student')} className="mt-4">
          Zpět na nástěnku
        </Button>
      </div>
    );
  }

  return (
    <div className="focus-container">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/student')} className="rounded-xl">
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-3xl font-display font-bold text-brand-blue">Přehled výsledků</h1>
            <p className="text-gray-400 font-bold">{assignedTest.testTitle}</p>
          </div>
        </div>
        <div className="bg-white px-6 py-3 rounded-2xl shadow-sm border border-gray-50 flex items-center gap-4">
          <div className="text-right">
            {assignedTest.autoGrade !== false && reviewQuestions.length > 0 ? (
              <>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tvé skóre</div>
                <div className="text-2xl font-black text-brand-blue">
                  {correctCount} <span className="text-gray-300 mx-1">/</span> {reviewQuestions.length}
                </div>
              </>
            ) : (
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Stav testu</div>
            )}
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shadow-sm ${
            assignedTest.status === 'pending' ? 'bg-gray-100 text-gray-400' :
            assignedTest.status === 'submitted' ? 'bg-orange-50 text-brand-orange text-sm' :
            'bg-blue-50 text-brand-blue'
          }`}>
            {assignedTest.status === 'submitted' ? 'K opravě' : assignedTest.grade || '-'}
          </div>
        </div>
      </header>

      {assignedTest.feedback && (
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
           <Card className="rounded-[2.5rem] border-none shadow-xl bg-blue-600 text-white p-8 overflow-hidden relative">
              <div className="relative z-10">
                <div className="text-xs font-black uppercase tracking-[0.2em] mb-2 opacity-80">Slovní hodnocení učitele</div>
                <p className="text-xl font-medium leading-relaxed italic">"{assignedTest.feedback}"</p>
              </div>
              <div className="absolute top-0 right-0 p-8 opacity-20">
                <Info size={120} />
              </div>
           </Card>
        </motion.div>
      )}

      <div className="space-y-8">
        {displayQuestions.map((question, index) => (
          <div key={question.id}>
            <ReviewCard 
              index={index} 
              question={question as any} 
              userAnswer={reviewQuestions.length > 0 ? (question as any).userAnswer : assignedTest.answers?.[question.id]}
              autoGrade={assignedTest.autoGrade !== false}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-center pt-10">
        <Button onClick={() => navigate('/student')} className="btn-blue rounded-2xl h-16 px-12 text-xl font-bold shadow-2xl shadow-blue-200">
          Zpět na nástěnku
        </Button>
      </div>
    </div>
  );
}

function ReviewCard({ 
  index, 
  question, 
  userAnswer,
  autoGrade 
}: { 
  index: number; 
  question: any; 
  userAnswer?: string;
  autoGrade: boolean;
}) {
  const isCorrect = autoGrade ? question.isCorrect : undefined;
  
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
      <Card className={`rounded-[2.5rem] border-none shadow-xl overflow-hidden ${isCorrect === true ? 'bg-white' : isCorrect === false ? 'bg-red-50/30' : 'bg-white'}`}>
        {autoGrade && <div className={`h-2 ${isCorrect ? 'bg-green-500' : 'bg-red-500'}`} />}
        <CardHeader className="p-8">
          <div className="flex justify-between items-start gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  Otázka {index + 1}
                </span>
                <span className="px-3 py-1 bg-blue-50 text-brand-blue rounded-full text-[10px] font-bold uppercase tracking-wider">
                  {question.topic}
                </span>
                {question.type === 'open' && (
                  <span className="px-3 py-1 bg-orange-50 text-brand-orange rounded-full text-[10px] font-bold uppercase tracking-wider">
                    Otevřená otázka
                  </span>
                )}
              </div>
              <CardTitle className="text-2xl font-display leading-tight">{question.question}</CardTitle>
            </div>
            {autoGrade && (
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${isCorrect ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                {isCorrect ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
              </div>
            )}
          </div>
          {question.imageUrl && (
            <div className="mt-6 rounded-2xl overflow-hidden border border-gray-100 max-w-lg">
               <img src={question.imageUrl} alt="Zadání" className="w-full object-contain max-h-64" referrerPolicy="no-referrer" />
            </div>
          )}
          {question.diagram && (
            <div className="mt-6">
              <GeometryDiagram type={question.diagram} />
            </div>
          )}
        </CardHeader>
        <CardContent className="p-8 pt-0 space-y-6">
          {question.type === 'open' ? (
             <div className="space-y-2">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">Tvá odpověď</div>
                <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100 italic text-gray-700 font-medium leading-relaxed">
                  {userAnswer || <span className="text-gray-300 italic">Bez odpovědi</span>}
                </div>
             </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {question.options?.map((option: any, optionIndex: number) => {
                const isUserChoice = userAnswer === option;
                const isCorrectChoice = question.correctAnswer === option;

                let variant = 'border-gray-50 bg-gray-50/30';
                if (autoGrade) {
                  if (isCorrectChoice) variant = 'border-green-500 bg-green-50 text-green-700';
                  else if (isUserChoice && !isCorrect) variant = 'border-red-500 bg-red-50 text-red-700';
                } else if (isUserChoice) {
                   variant = 'border-brand-blue bg-blue-50 text-brand-blue shadow-sm';
                }

                return (
                  <div key={`${question.id}-${optionIndex}`} className={`p-4 rounded-2xl border-2 flex items-center gap-3 font-bold transition-all ${variant}`}>
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                        isCorrectChoice && autoGrade ? 'bg-green-500 text-white' : isUserChoice && autoGrade && !isCorrect ? 'bg-red-500 text-white' : isUserChoice && !autoGrade ? 'bg-brand-blue text-white' : 'bg-white text-gray-400'
                      }`}
                    >
                      {String.fromCharCode(65 + optionIndex)}
                    </div>
                    {option}
                    {isCorrectChoice && autoGrade && <CheckCircle2 size={16} className="ml-auto text-green-500" />}
                    {isUserChoice && autoGrade && !isCorrect && <XCircle size={16} className="ml-auto text-red-500" />}
                  </div>
                );
              })}
            </div>
          )}

          {autoGrade && question.explanation && (
            <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 flex gap-4">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-brand-blue shrink-0 shadow-sm">
                <Info size={20} />
              </div>
              <div>
                <div className="text-xs font-bold text-brand-blue uppercase tracking-widest mb-1">Vysvětlení</div>
                <p className="text-gray-600 text-sm leading-relaxed">{question.explanation}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
