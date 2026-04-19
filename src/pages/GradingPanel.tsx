import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { AlertCircle, ArrowLeft, BarChart3, CheckCircle2, GraduationCap, Save, Target, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../lib/firebase';
import { AssignedTest, ReviewQuestion, Test, UserProfile } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';

interface TopicStats {
  correct: number;
  total: number;
}

export default function GradingPanel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [assignedTest, setAssignedTest] = useState<AssignedTest | null>(null);
  const [testData, setTestData] = useState<Test | null>(null);
  const [student, setStudent] = useState<UserProfile | null>(null);
  const [grade, setGrade] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) {
        setLoading(false);
        return;
      }

      try {
        const assignedSnap = await getDoc(doc(db, 'assignedTests', id));

        if (!assignedSnap.exists()) {
          return;
        }

        const assigned = { id: assignedSnap.id, ...assignedSnap.data() } as AssignedTest;
        setAssignedTest(assigned);
        setGrade(assigned.grade || '');
        setFeedback(assigned.feedback || '');

        const requests: Promise<unknown>[] = [
          getDoc(doc(db, 'users', assigned.studentId)).then((snapshot) => {
            if (snapshot.exists()) {
              setStudent({ uid: snapshot.id, ...snapshot.data() } as UserProfile);
            }
          }),
        ];

        if (assigned.testId) {
          requests.push(
            getDoc(doc(db, 'tests', assigned.testId)).then((snapshot) => {
              if (snapshot.exists()) {
                setTestData({ id: snapshot.id, ...snapshot.data() } as Test);
              }
            }),
          );
        }

        await Promise.all(requests);
      } catch (error) {
        console.error(error);
        toast.error('Chyba při načítání dat.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const handleSaveGrading = async () => {
    if (!id || !assignedTest || !testData || !grade) {
      toast.error('Prosím vyberte známku.');
      return;
    }

    const answers = assignedTest.answers || {};
    const reviewQuestions: ReviewQuestion[] = testData.questions.map((question) => ({
      id: question.id,
      question: question.question,
      options: question.options,
      topic: question.topic,
      topics: question.topics,
      explanation: question.explanation || '',
      diagram: question.diagram,
      courseId: question.courseId,
      imageUrl: question.imageUrl,
      correctAnswer: question.correctAnswer,
      userAnswer: answers[question.id],
      isCorrect: answers[question.id] === question.correctAnswer,
    }));

    try {
      await updateDoc(doc(db, 'assignedTests', id), {
        grade,
        feedback,
        status: 'graded',
        gradedAt: Timestamp.now(),
        reviewQuestions,
      });

      toast.success('Hodnocení bylo uloženo.');
      navigate('/teacher');
    } catch (error) {
      console.error(error);
      toast.error('Chyba při ukládání hodnocení.');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-16 h-16 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
        <p className="text-brand-blue font-bold text-xl">Načítám test k opravě...</p>
      </div>
    );
  }

  if (!assignedTest || !testData || !student) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-gray-400">Data nebyla nalezena.</h2>
        <Button onClick={() => navigate('/teacher')} className="mt-4">
          Zpět na portál
        </Button>
      </div>
    );
  }

  return (
    <div className="focus-container">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/teacher')} className="rounded-2xl w-14 h-14 bg-white shadow-sm hover:shadow-md border border-gray-50">
            <ArrowLeft size={24} />
          </Button>
          <div>
            <h1 className="text-4xl font-display font-bold text-brand-blue">Opravování testu</h1>
            <div className="flex items-center gap-2 text-gray-500 font-bold">
              <GraduationCap size={18} className="text-brand-orange" />
              {student.name} <span className="text-gray-300">•</span> {assignedTest.testTitle}
            </div>
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-3 gap-10">
        <div className="lg:col-span-2 space-y-8">
          {assignedTest.topicPerformance && (
            <Card className="rounded-[2rem] border-none shadow-xl bg-white overflow-hidden">
              <CardHeader className="bg-blue-50/30">
                <CardTitle className="text-xl font-display flex items-center gap-2">
                  <BarChart3 className="text-brand-blue" /> Výkon podle témat
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(assignedTest.topicPerformance).map(([topic, stats]) => {
                    const typedStats = stats as TopicStats;
                    const percentage = Math.round((typedStats.correct / typedStats.total) * 100);

                    return (
                      <div key={topic} className="space-y-2">
                        <div className="flex justify-between text-sm font-bold">
                          <span className="text-gray-700">{topic}</span>
                          <span className={percentage >= 50 ? 'text-green-600' : 'text-red-500'}>
                            {typedStats.correct} / {typedStats.total} ({percentage}%)
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${percentage >= 80 ? 'bg-green-500' : percentage >= 50 ? 'bg-brand-orange' : 'bg-red-500'}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-6">
            <h2 className="text-2xl font-display font-bold text-gray-900 flex items-center gap-2">
              <Target className="text-brand-orange" /> Odpovědi studenta
            </h2>

            {testData.questions.map((question, index) => {
              const studentAnswer = assignedTest.answers?.[question.id];
              const isCorrect = studentAnswer === question.correctAnswer;

              return (
                <Card key={question.id} className="rounded-[2rem] border-none shadow-xl bg-white overflow-hidden group hover:shadow-2xl transition-all">
                  <div className={`h-3 ${isCorrect ? 'bg-green-500' : 'bg-red-500'}`} />
                  <CardHeader className="p-8 pb-4">
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Otázka {index + 1}</span>
                        <CardTitle className="text-2xl font-display leading-tight">{question.question}</CardTitle>
                      </div>
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm ${isCorrect ? 'bg-green-50 text-green-500' : 'bg-red-50 text-red-500'}`}>
                        {isCorrect ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-8 pt-4 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {question.options.map((option, optionIndex) => (
                        <div
                          key={`${question.id}-${optionIndex}`}
                          className={`p-5 rounded-2xl text-lg border-4 transition-all ${
                            option === question.correctAnswer
                              ? 'bg-green-50 border-green-200 text-green-800 font-bold'
                              : option === studentAnswer
                                ? 'bg-red-50 border-red-200 text-red-800 font-bold'
                                : 'bg-gray-50/50 border-transparent text-gray-400'
                          }`}
                        >
                          <span className="mr-3 opacity-50">{String.fromCharCode(65 + optionIndex)}</span>
                          {option}
                        </div>
                      ))}
                    </div>

                    {!isCorrect && (
                      <div className="flex items-center gap-3 text-sm text-orange-700 bg-orange-50 p-4 rounded-2xl border border-orange-100">
                        <AlertCircle size={20} className="shrink-0" />
                        <span>
                          Student odpověděl špatně. Správná odpověď byla: <strong className="text-orange-900">{question.correctAnswer}</strong>
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <div className="space-y-8">
          <div className="sticky top-24">
            <Card className="rounded-[2.5rem] border-none shadow-2xl bg-white overflow-hidden">
              <div className="h-4 bg-brand-blue" />
              <CardHeader className="p-8">
                <CardTitle className="text-2xl font-display">Hodnocení</CardTitle>
                <CardDescription className="font-bold">Zadejte známku a zpětnou vazbu</CardDescription>
              </CardHeader>
              <CardContent className="p-8 pt-0 space-y-8">
                <div className="space-y-3">
                  <Label className="text-sm font-black uppercase tracking-widest text-gray-400">Známka</Label>
                  <Select value={grade} onValueChange={setGrade}>
                    <SelectTrigger className="rounded-2xl h-14 border-2 border-gray-50 bg-gray-50/30 text-xl font-black text-brand-blue">
                      <SelectValue placeholder="Vyberte známku" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      <SelectItem value="1" className="text-lg font-bold">1 - Výborně</SelectItem>
                      <SelectItem value="2" className="text-lg font-bold">2 - Chvalitebně</SelectItem>
                      <SelectItem value="3" className="text-lg font-bold">3 - Dobře</SelectItem>
                      <SelectItem value="4" className="text-lg font-bold">4 - Dostatečně</SelectItem>
                      <SelectItem value="5" className="text-lg font-bold">5 - Nedostatečně</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-black uppercase tracking-widest text-gray-400">Zpětná vazba</Label>
                  <Textarea
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="Napište studentovi vzkaz..."
                    className="min-h-[200px] rounded-[2rem] border-2 border-gray-50 bg-gray-50/30 p-6 text-lg leading-relaxed focus:bg-white transition-all"
                  />
                </div>

                <Button onClick={handleSaveGrading} className="btn-blue w-full h-16 rounded-2xl gap-3 text-xl font-bold shadow-2xl shadow-blue-100">
                  <Save size={24} /> Uložit hodnocení
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
