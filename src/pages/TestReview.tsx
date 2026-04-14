import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AssignedTest, Test } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { motion } from 'motion/react';
import { ArrowLeft, CheckCircle2, XCircle, Info, BrainCircuit } from 'lucide-react';
import { GeometryDiagram } from '../components/GeometryDiagram';

export default function TestReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [assignedTest, setAssignedTest] = useState<AssignedTest | null>(null);
  const [testData, setTestData] = useState<Test | null>(null);
  const [loading, setLoading] = useState(true);

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
        console.error('Error fetching review data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
      <div className="w-16 h-16 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
      <p className="text-brand-blue font-bold text-xl">Načítám výsledky...</p>
    </div>
  );

  if (!assignedTest || !testData) return (
    <div className="text-center py-20">
      <h2 className="text-2xl font-bold text-gray-400">Výsledky nebyly nalezeny.</h2>
      <Button onClick={() => navigate('/student')} className="mt-4">Zpět na nástěnku</Button>
    </div>
  );

  const answers = assignedTest.answers || {};

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/student')} className="rounded-xl">
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-3xl font-display font-bold text-brand-blue">Přehled výsledků</h1>
            <p className="text-gray-400 font-bold">{testData.title}</p>
          </div>
        </div>
        <div className="bg-white px-6 py-3 rounded-2xl shadow-sm border border-gray-50 flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tvé skóre</div>
            <div className="text-2xl font-black text-brand-blue">
              {Object.values(assignedTest.topicPerformance || {}).reduce((acc: number, curr: any) => acc + curr.correct, 0)} 
              <span className="text-gray-300 mx-1">/</span> 
              {testData.questions.length}
            </div>
          </div>
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-brand-blue font-black text-xl">
            {assignedTest.grade || '-'}
          </div>
        </div>
      </header>

      <div className="space-y-8">
        {testData.questions.map((q, idx) => {
          const userAnswer = answers[q.id];
          const isCorrect = userAnswer === q.correctAnswer;

          return (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card className={`rounded-[2.5rem] border-none shadow-xl overflow-hidden ${isCorrect ? 'bg-white' : 'bg-red-50/30'}`}>
                <div className={`h-2 ${isCorrect ? 'bg-green-500' : 'bg-red-500'}`} />
                <CardHeader className="p-8">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          Otázka {idx + 1}
                        </span>
                        <span className="px-3 py-1 bg-blue-50 text-brand-blue rounded-full text-[10px] font-bold uppercase tracking-wider">
                          {q.topic}
                        </span>
                      </div>
                      <CardTitle className="text-2xl font-display leading-tight">
                        {q.question}
                      </CardTitle>
                    </div>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${isCorrect ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      {isCorrect ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
                    </div>
                  </div>
                  {q.diagram && (
                    <div className="mt-6">
                      <GeometryDiagram type={q.diagram} />
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-8 pt-0 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {q.options.map((opt, optIdx) => {
                      const isUserChoice = userAnswer === opt;
                      const isCorrectChoice = q.correctAnswer === opt;
                      
                      let variant = "border-gray-50 bg-gray-50/30";
                      if (isCorrectChoice) variant = "border-green-500 bg-green-50 text-green-700";
                      else if (isUserChoice && !isCorrect) variant = "border-red-500 bg-red-50 text-red-700";

                      return (
                        <div 
                          key={optIdx}
                          className={`p-4 rounded-2xl border-2 flex items-center gap-3 font-bold transition-all ${variant}`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                            isCorrectChoice ? 'bg-green-500 text-white' : 
                            isUserChoice ? 'bg-red-500 text-white' : 'bg-white text-gray-400'
                          }`}>
                            {String.fromCharCode(65 + optIdx)}
                          </div>
                          {opt}
                          {isCorrectChoice && <CheckCircle2 size={16} className="ml-auto text-green-500" />}
                          {isUserChoice && !isCorrect && <XCircle size={16} className="ml-auto text-red-500" />}
                        </div>
                      );
                    })}
                  </div>

                  {q.explanation && (
                    <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 flex gap-4">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-brand-blue shrink-0 shadow-sm">
                        <Info size={20} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-brand-blue uppercase tracking-widest mb-1">Vysvětlení</div>
                        <p className="text-gray-600 text-sm leading-relaxed">{q.explanation}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div className="flex justify-center pt-10">
        <Button 
          onClick={() => navigate('/student')}
          className="btn-blue rounded-2xl h-16 px-12 text-xl font-bold shadow-2xl shadow-blue-200"
        >
          Zpět na nástěnku
        </Button>
      </div>
    </div>
  );
}
