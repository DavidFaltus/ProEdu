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
  const correctCount = reviewQuestions.filter((question) => question.isCorrect).length;

  if (!assignedTest || reviewQuestions.length === 0) {
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
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tvé skóre</div>
            <div className="text-2xl font-black text-brand-blue">
              {correctCount} <span className="text-gray-300 mx-1">/</span> {reviewQuestions.length}
            </div>
          </div>
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-brand-blue font-black text-xl">
            {assignedTest.grade || '-'}
          </div>
        </div>
      </header>

      <div className="space-y-8">
        {reviewQuestions.map((question, index) => (
          <div key={question.id}>
            <ReviewCard index={index} question={question} />
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

function ReviewCard({ index, question }: { index: number; question: ReviewQuestion }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
      <Card className={`rounded-[2.5rem] border-none shadow-xl overflow-hidden ${question.isCorrect ? 'bg-white' : 'bg-red-50/30'}`}>
        <div className={`h-2 ${question.isCorrect ? 'bg-green-500' : 'bg-red-500'}`} />
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
              </div>
              <CardTitle className="text-2xl font-display leading-tight">{question.question}</CardTitle>
            </div>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${question.isCorrect ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
              {question.isCorrect ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
            </div>
          </div>
          {question.diagram && (
            <div className="mt-6">
              <GeometryDiagram type={question.diagram} />
            </div>
          )}
        </CardHeader>
        <CardContent className="p-8 pt-0 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {question.options.map((option, optionIndex) => {
              const isUserChoice = question.userAnswer === option;
              const isCorrectChoice = question.correctAnswer === option;

              let variant = 'border-gray-50 bg-gray-50/30';
              if (isCorrectChoice) variant = 'border-green-500 bg-green-50 text-green-700';
              else if (isUserChoice && !question.isCorrect) variant = 'border-red-500 bg-red-50 text-red-700';

              return (
                <div key={`${question.id}-${optionIndex}`} className={`p-4 rounded-2xl border-2 flex items-center gap-3 font-bold transition-all ${variant}`}>
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                      isCorrectChoice ? 'bg-green-500 text-white' : isUserChoice ? 'bg-red-500 text-white' : 'bg-white text-gray-400'
                    }`}
                  >
                    {String.fromCharCode(65 + optionIndex)}
                  </div>
                  {option}
                  {isCorrectChoice && <CheckCircle2 size={16} className="ml-auto text-green-500" />}
                  {isUserChoice && !question.isCorrect && <XCircle size={16} className="ml-auto text-red-500" />}
                </div>
              );
            })}
          </div>

          {question.explanation && (
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
