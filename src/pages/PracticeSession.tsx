import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, CheckCircle2, XCircle, Lightbulb, RotateCcw, 
  BookOpen, ArrowRight, MessageSquare, ChevronLeft, ChevronRight, Send
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter 
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { 
  getSubtopicById, getQuestionsForSubtopic, recordPracticeAttempt, sampleQuestionsForPractice 
} from '../services/practiceService';
import { submitInquiry } from '../services/inquiryService';
import { sanitizeSvg } from '../utils/pdfToSvg';
import { PracticeSubtopic, PracticeQuestion } from '../types';
import { MathRenderer } from '../components/common/MathRenderer';
import { evaluateStudentAnswer } from '../utils/mathEvaluator';

interface QuestionAnswerState {
  userAnswer: string;
  isCorrect: boolean;
  usedHint: boolean;
  isSubmitted: boolean;
  tutorFeedback?: string;
}


export default function PracticeSession() {
  const { subtopicId } = useParams<{ subtopicId: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [subtopic, setSubtopic] = useState<PracticeSubtopic | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  // Active question index
  const [currentIndex, setCurrentIndex] = useState(0);

  // Answers state per question index
  const [answersMap, setAnswersMap] = useState<Record<number, QuestionAnswerState>>({});
  // Open answer text input per question
  const [openInputs, setOpenInputs] = useState<Record<number, string>>({});
  // Hint shown flag per question
  const [showHintMap, setShowHintMap] = useState<Record<number, boolean>>({});

  // Question inquiries state
  const [isInquiryModalOpen, setIsInquiryModalOpen] = useState(false);
  const [inquiryComment, setInquiryComment] = useState('');
  const [isSubmittingInquiry, setIsSubmittingInquiry] = useState(false);
  const [askedInquirySet, setAskedInquirySet] = useState<Set<number>>(new Set());

  // Slider scrolling refs
  const sliderScrollRef = useRef<HTMLDivElement>(null);
  const sliderButtonRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  const [isCompleted, setIsCompleted] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!subtopicId) return;
      setLoading(true);
      try {
        const subData = await getSubtopicById(subtopicId);
        setSubtopic(subData);

        const qData = await getQuestionsForSubtopic(subtopicId);
        const sampled = sampleQuestionsForPractice(qData, subData?.practiceConfig);
        setQuestions(sampled);
      } catch (err) {
        console.error('Failed to load practice questions:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [subtopicId]);

  // Auto-scroll slider when currentIndex changes
  useEffect(() => {
    sliderButtonRefs.current[currentIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center'
    });
  }, [currentIndex]);

  const currentQuestion = questions[currentIndex];
  const currentAnswer = answersMap[currentIndex];
  const isAnswerSubmitted = !!currentAnswer?.isSubmitted;
  const isHintOpen = !!showHintMap[currentIndex];

  // Helper for answer normalization
  const normalize = (str: string) => str.toLowerCase().replace(/\s+/g, '').replace(/,/g, '.');

  // Immediate choice selection & check
  const handleSelectChoice = (option: string) => {
    if (!currentQuestion || isAnswerSubmitted) return;

    const evalResult = evaluateStudentAnswer(option, currentQuestion.correctAnswer);
    const usedHint = !!showHintMap[currentIndex];

    setAnswersMap(prev => ({
      ...prev,
      [currentIndex]: {
        userAnswer: option,
        isCorrect: evalResult.isCorrect,
        usedHint,
        isSubmitted: true,
        tutorFeedback: evalResult.tutorFeedback
      }
    }));
  };

  // Open-ended answer submission
  const handleCheckOpenAnswer = () => {
    if (!currentQuestion || isAnswerSubmitted) return;

    const answer = (openInputs[currentIndex] || '').trim();
    if (!answer) return;

    const evalResult = evaluateStudentAnswer(answer, currentQuestion.correctAnswer);
    const usedHint = !!showHintMap[currentIndex];

    setAnswersMap(prev => ({
      ...prev,
      [currentIndex]: {
        userAnswer: answer,
        isCorrect: evalResult.isCorrect,
        usedHint,
        isSubmitted: true,
        tutorFeedback: evalResult.tutorFeedback
      }
    }));
  };

  // Toggle hint

  const handleToggleHint = () => {
    setShowHintMap(prev => ({ ...prev, [currentIndex]: !prev[currentIndex] }));
  };

  // Slider scroll navigation buttons
  const scrollSlider = (direction: 'left' | 'right') => {
    if (sliderScrollRef.current) {
      const amount = direction === 'left' ? -200 : 200;
      sliderScrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // Next question or finish
  const handleNext = () => {
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(prev => prev + 1);
    } else {
      handleFinishPractice();
    }
  };

  // Final finish and score submission
  const handleFinishPractice = async () => {
    setIsCompleted(true);

    if (user && subtopic) {
      const correctCount = Object.values(answersMap).filter(a => a.isCorrect).length;
      const total = questions.length;
      const percentage = Math.round((correctCount / total) * 100);

      const answersRecord: Record<string, string> = {};
      questions.forEach((q, idx) => {
        if (answersMap[idx]) {
          answersRecord[q.id] = answersMap[idx].userAnswer;
        }
      });

      try {
        await recordPracticeAttempt({
          studentId: user.uid,
          subtopicId: subtopic.id,
          topicId: subtopic.topicId,
          subjectId: subtopic.subjectId,
          score: correctCount,
          totalQuestions: total,
          percentage,
          answers: answersRecord
        });
      } catch (err) {
        console.error('Failed to record attempt:', err);
      }
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setAnswersMap({});
    setOpenInputs({});
    setShowHintMap({});
    setIsCompleted(false);
  };

  // Inquiry submission handler (Decision Q3 = Option A)
  const handleSubmitInquiry = async () => {
    if (!user) {
      toast.error('Pro odeslání dotazu se prosím přihlas.');
      return;
    }
    const comment = inquiryComment.trim();
    if (!comment) {
      toast.error('Zadej prosím text svého dotazu.');
      return;
    }

    setIsSubmittingInquiry(true);
    try {
      await submitInquiry({
        studentId: user.uid,
        studentName: profile?.name || user.displayName || (profile?.role === 'teacher' ? 'Učitel' : 'Student'),
        questionId: currentQuestion?.id || 'question',
        questionText: currentQuestion?.question || '',
        topic: subtopic?.title || 'Procvičování',
        comment,
        senderRole: profile?.role === 'teacher' ? 'teacher' : 'student',
      });

      toast.success('Tvůj dotaz byl úspěšně odeslán lektorovi!');
      setAskedInquirySet(prev => new Set(prev).add(currentIndex));
      setInquiryComment('');
      setIsInquiryModalOpen(false);
    } catch (err: any) {
      console.error('Failed to submit inquiry:', err);
      toast.error(err?.message || 'Chyba při odesílání dotazu');
    } finally {
      setIsSubmittingInquiry(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-[#1E1B18] border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600 font-bold text-sm">Příprava procvičování...</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-2xl">
          📝
        </div>
        <h2 className="text-3xl font-display font-black text-[#1E1B18]">Zatím žádné otázky</h2>
        <p className="text-gray-500">
          Pro téma "{subtopic?.title || 'Zvolené téma'}" zatím nebyly v administraci vloženy otázky k procvičování.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          {subtopic?.hasStudyMaterial && (
            <Link to={`/study/${subtopic.id}`}>
              <Button className="rounded-xl bg-[#1E1B18] text-white font-bold">
                Přejít na teorii (Studovat)
              </Button>
            </Link>
          )}
          <Link to="/practice">
            <Button variant="outline" className="rounded-xl font-bold">
              Zpět na výběr témat
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // SUMMARY RESULTS SCREEN
  // -------------------------------------------------------------
  if (isCompleted) {
    const correctCount = Object.values(answersMap).filter(r => r.isCorrect).length;
    const totalCount = questions.length;
    const percentage = Math.round((correctCount / totalCount) * 100);

    return (
      <div className="max-w-4xl mx-auto space-y-8 py-6 px-4">
        {/* Results Card */}

        <div className="bg-white rounded-[2.5rem] p-8 sm:p-12 text-center shadow-xl border border-gray-100 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-100/30 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

          <div className="w-20 h-20 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-3xl shadow-inner">
            {percentage >= 80 ? '🏆' : percentage >= 50 ? '👏' : '💪'}
          </div>

          <div className="space-y-2">
            <span className="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full bg-amber-100 text-amber-900">
              Výsledek procvičování
            </span>
            <h2 className="text-3xl sm:text-4xl font-display font-black text-[#1E1B18]">
              {percentage >= 80 ? 'Skvělá práce!' : percentage >= 50 ? 'Dobrá práce!' : 'Trénink dělá mistra!'}
            </h2>
            <p className="text-gray-500 font-medium text-base">
              Úspěšně jsi dokončil procvičování pro téma "{subtopic?.title}".
            </p>
          </div>

          {/* Score Counter */}
          <div className="inline-flex items-center justify-center gap-6 bg-[#FAF7F0] px-8 py-5 rounded-3xl border border-gray-200/60">
            <div>
              <div className="text-4xl font-display font-black text-[#1E1B18]">{correctCount} / {totalCount}</div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-0.5">Správných odpovědí</div>
            </div>
            <div className="w-px h-12 bg-gray-200" />
            <div>
              <div className={`text-4xl font-display font-black ${percentage >= 70 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {percentage}%
              </div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-0.5">Úspěšnost</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button
              onClick={handleRestart}
              variant="outline"
              className="rounded-xl font-bold h-12 px-6 flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw size={16} /> Zkusit znovu
            </Button>

            {subtopic?.hasStudyMaterial && (
              <Link to={`/study/${subtopic.id}`}>
                <Button
                  variant="outline"
                  className="rounded-xl font-bold h-12 px-6 flex items-center gap-2 cursor-pointer"
                >
                  <BookOpen size={16} /> Zopakovat teorii
                </Button>
              </Link>
            )}

            <Link to="/practice">
              <Button
                className="rounded-xl bg-[#1E1B18] hover:bg-[#332f2b] text-white font-bold h-12 px-6 flex items-center gap-2 cursor-pointer shadow-md"
              >
                <span>Další témata</span>
                <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>

        {/* Detailed Question Review */}
        <div className="space-y-4">
          <h3 className="font-sans font-black text-2xl text-[#1E1B18] px-2">
            Přehled otázek a vysvětlení
          </h3>

          <div className="space-y-3">
            {questions.map((q, i) => {
              const res = answersMap[i];
              const isCorrect = res?.isCorrect;
              const hasAnswered = !!res?.isSubmitted;

              return (
                <div 
                  key={i} 
                  className={`p-6 rounded-3xl border bg-white shadow-sm space-y-3 transition-all ${
                    !hasAnswered
                      ? 'border-gray-200'
                      : isCorrect
                      ? 'border-emerald-200/80'
                      : 'border-rose-200/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-gray-100 font-bold text-xs flex items-center justify-center text-gray-700">
                        {i + 1}
                      </span>
                      <h4 className="font-bold text-base text-gray-900">
                        <MathRenderer content={q.question} inline />
                      </h4>
                    </div>
                    {!hasAnswered ? (
                      <span className="text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full shrink-0">
                        Nezodpovězeno
                      </span>
                    ) : isCorrect ? (
                      <span className="flex items-center gap-1.5 text-xs font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full shrink-0">
                        <CheckCircle2 size={16} /> Správně {res.usedHint && '(s nápovědou)'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-black text-rose-700 bg-rose-50 px-3 py-1 rounded-full shrink-0">
                        <XCircle size={16} /> Chyba
                      </span>
                    )}
                  </div>

                  <div className="text-sm space-y-1.5 pl-11">
                    {hasAnswered && !isCorrect && (
                      <div className="text-gray-500 flex items-center gap-1 flex-wrap">
                        <span>Tvoje odpověď:</span>
                        <span className="font-bold text-rose-700 line-through">
                          <MathRenderer content={res.userAnswer || '(nevyplněno)'} inline />
                        </span>
                      </div>
                    )}
                    <div className="text-gray-700 flex items-center gap-1 flex-wrap">
                      <span>Správná odpověď:</span>
                      <span className="font-black text-emerald-700">
                        <MathRenderer content={q.correctAnswer} inline />
                      </span>
                    </div>
                    {q.explanation && (
                      <div className="mt-2 p-3 bg-gray-50 rounded-xl text-xs text-gray-600 font-medium leading-relaxed">
                        <span className="font-bold text-gray-800 block mb-0.5">💡 Vysvětlení:</span>
                        <MathRenderer content={q.explanation} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // ACTIVE QUESTION SCREEN WITH HORIZONTAL QUESTION SLIDER
  // -------------------------------------------------------------
  const answeredCount = Object.keys(answersMap).length;
  const progressPercent = Math.round((answeredCount / questions.length) * 100);

  return (
    <div className="max-w-5xl mx-auto space-y-6 py-6 px-4 sm:px-6">
      {/* Top Header with Breadcrumbs & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-5 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Link 
            to="/practice" 
            className="inline-flex items-center gap-2 text-xs font-bold text-gray-600 hover:text-black transition-colors bg-gray-50 hover:bg-gray-100 px-3.5 py-2 rounded-xl border border-gray-200/60 shadow-2xs shrink-0 cursor-pointer"
          >
            <ArrowLeft size={14} /> Ukončit
          </Link>

          <div className="h-4 w-px bg-gray-200 hidden sm:block shrink-0" />

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider px-2.5 py-1 bg-amber-50 text-amber-900 rounded-full border border-amber-200/60 shadow-2xs shrink-0">
              Procvičování
            </span>
            <span className="text-xs sm:text-sm font-bold text-gray-800 truncate">
              {subtopic?.title}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
          <div className="text-xs font-bold text-gray-500 hidden md:block">
            Otázka <span className="font-black text-[#1E1B18]">{currentIndex + 1}</span> z {questions.length}
          </div>
          <Button
            size="sm"
            onClick={handleFinishPractice}
            className="rounded-xl bg-[#1E1B18] hover:bg-[#332f2b] text-white font-bold text-xs h-9 px-4 cursor-pointer shadow-sm transition-transform hover:scale-102"
          >
            Ukončit a vyhodnotit
          </Button>
        </div>
      </div>

      {/* TOP HORIZONTAL QUESTION SLIDER / PICKER */}
      <div className="bg-white p-3.5 sm:p-4 rounded-3xl border border-gray-200/80 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => scrollSlider('left')}
            className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 flex items-center justify-center shrink-0 border border-gray-200 cursor-pointer transition-colors shadow-2xs"
            title="Posunout doleva"
          >
            <ChevronLeft size={16} />
          </button>

          <div
            ref={sliderScrollRef}
            className="flex-1 flex items-center gap-2 overflow-x-auto scroll-smooth py-1 px-1 scrollbar-none"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {questions.map((_, idx) => {
              const ans = answersMap[idx];
              const isActive = idx === currentIndex;
              
              // Determine button color
              let colorClasses = 'bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200';

              if (ans?.isSubmitted) {
                if (ans.isCorrect) {
                  if (ans.usedHint) {
                    // Answered correctly WITH hint: Orange
                    colorClasses = 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600';
                  } else {
                    // Answered correctly WITHOUT hint: Green
                    colorClasses = 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600';
                  }
                } else {
                  // Answered incorrectly: Red
                  colorClasses = 'bg-rose-500 hover:bg-rose-600 text-white border-rose-600';
                }
              } else if (isActive) {
                colorClasses = 'bg-[#FAF7F0] text-[#1E1B18] border-[#1E1B18]';
              }

              return (
                <button
                  key={idx}
                  ref={el => { sliderButtonRefs.current[idx] = el; }}
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center shrink-0 border transition-all cursor-pointer ${colorClasses} ${
                    isActive ? 'ring-2 ring-inset ring-[#1E1B18] shadow-sm font-black' : ''
                  }`}
                  title={`Přejít na otázku ${idx + 1}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => scrollSlider('right')}
            className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 flex items-center justify-center shrink-0 border border-gray-200 cursor-pointer transition-colors shadow-2xs"
            title="Posunout doprava"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Progress bar line */}
        <div className="space-y-1.5 pt-1 border-t border-gray-100">
          <div className="flex justify-between items-center text-[11px] font-bold text-gray-400 px-1">
            <span>Postup procvičováním</span>
            <span>{answeredCount} z {questions.length} vyřešeno ({progressPercent}%)</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-[#1E1B18] rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Question Card */}
      <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-7 sm:p-12 space-y-7 relative overflow-hidden">
        {/* Soft background accent blob */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-100/25 rounded-full blur-3xl -mr-28 -mt-28 pointer-events-none" />

        {/* Card Header with Question Type, Hint & Inquiry buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-5 relative z-10">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#1E1B18] text-white text-xs font-black flex items-center justify-center shadow-xs">
              {currentIndex + 1}
            </span>
            <span className="px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-gray-100 text-gray-700">
              {currentQuestion.type === 'choice' ? 'Výběr z možností' : 'Vepisovací otázka'}
            </span>
            <span className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider border ${
              (currentQuestion.difficulty || 'Střední') === 'Lehká'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : (currentQuestion.difficulty || 'Střední') === 'Těžká'
                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                  : 'bg-amber-50 text-amber-900 border-amber-200'
            }`}>
              {currentQuestion.difficulty || 'Střední'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Ask Tutor button (Decision Q3 = Option A) */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsInquiryModalOpen(true)}
              className="text-amber-800 hover:text-amber-950 hover:bg-amber-50 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer h-9 px-3.5"
            >
              <MessageSquare size={15} className="text-amber-600" />
              <span>Doptat se lektora</span>
              {askedInquirySet.has(currentIndex) && (
                <span className="w-2 h-2 rounded-full bg-emerald-500" title="Dotaz odeslán" />
              )}
            </Button>

            {/* Hint toggle */}
            {currentQuestion.hint && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleHint}
                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer h-9 px-3.5"
              >
                <Lightbulb size={15} />
                <span>{isHintOpen ? 'Skrýt nápovědu' : 'Nápověda'}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Hint Box */}
        <AnimatePresence>
          {isHintOpen && currentQuestion.hint && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden relative z-10"
            >
              <div className="p-4 sm:p-5 bg-amber-50 border border-amber-200 rounded-2xl text-xs sm:text-sm text-amber-900 font-medium flex items-start gap-3 shadow-xs">
                <span className="text-xl">💡</span>
                <div className="leading-relaxed flex-1">
                  <MathRenderer content={currentQuestion.hint} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Question Text */}
        <div className="py-2 relative z-10">
          <h2 className="text-2xl sm:text-3xl font-display font-black text-gray-900 leading-snug">
            <MathRenderer content={currentQuestion.question} />
          </h2>
        </div>

        {/* Optional Question Image / SVG (pod zadáním - přímo na stránku jako materiál) */}
        {currentQuestion.svgContent ? (
          <div className="py-2 relative z-10 flex justify-center w-full">
            <div 
              className="w-full max-w-3xl flex justify-center [&>svg]:w-full [&>svg]:max-w-full [&>svg]:h-auto shadow-xs rounded-2xl bg-[#FAF7F0] p-3 sm:p-5 border border-gray-200/80 overflow-hidden"
              dangerouslySetInnerHTML={{ __html: sanitizeSvg(currentQuestion.svgContent) }}
            />
          </div>
        ) : currentQuestion.imageUrl ? (
          <div className="py-2 relative z-10 flex justify-center">
            <div className="rounded-2xl overflow-hidden border border-gray-200/80 bg-[#FAF7F0] p-2.5 sm:p-3 shadow-xs max-w-full">
              <img
                src={currentQuestion.imageUrl}
                alt="Obrázek k úloze"
                className="max-h-[360px] w-auto max-w-full rounded-xl object-contain hover:scale-[1.01] transition-transform cursor-pointer mx-auto"
                onClick={() => window.open(currentQuestion.imageUrl, '_blank')}
                title="Kliknutím otevřete obrázek v plné velikosti"
              />
            </div>
          </div>
        ) : null}

        {/* Answer Options: Multiple Choice in 2-column grid */}
        {currentQuestion.type === 'choice' && currentQuestion.options && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 relative z-10">
            {currentQuestion.options.map((option, idx) => {
              const letter = String.fromCharCode(65 + idx); // A, B, C, D
              const isSelected = currentAnswer?.userAnswer === option;
              
              let optionStyle = 'bg-[#FAF7F0] border-gray-200/80 hover:bg-gray-100 hover:border-gray-300 text-gray-800';

              if (isAnswerSubmitted) {
                if (option === currentQuestion.correctAnswer) {
                  optionStyle = 'bg-emerald-600 text-white border-transparent shadow-md';
                } else if (isSelected && !currentAnswer.isCorrect) {
                  optionStyle = 'bg-rose-600 text-white border-transparent shadow-md';
                } else {
                  optionStyle = 'opacity-40 bg-gray-50 border-gray-200 text-gray-400';
                }
              }

              return (
                <button
                  key={idx}
                  disabled={isAnswerSubmitted}
                  onClick={() => handleSelectChoice(option)}
                  className={`p-5 sm:p-6 rounded-2xl border text-left font-medium text-sm sm:text-base flex items-center gap-4 transition-all cursor-pointer ${optionStyle} ${
                    isAnswerSubmitted ? 'cursor-default' : ''
                  }`}
                >
                  <span className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center shrink-0 ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-white text-gray-700 shadow-sm border border-gray-200/50'
                  }`}>
                    {letter}
                  </span>
                  <span className="flex-1 min-w-0 font-bold">
                    <MathRenderer content={option} inline />
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Answer Options: Open-ended text field */}
        {currentQuestion.type === 'open' && (
          <div className="pt-2 space-y-3 relative z-10">
            {/* Quick Math Symbols Bar for mobile/desktop typing */}
            {!isAnswerSubmitted && (
              <div className="flex flex-wrap items-center gap-1.5 pb-1">
                <span className="text-[11px] font-bold text-gray-400 mr-1 select-none">Rychlé symboly:</span>
                {['/', '√', '²', '³', 'π', '±', '·', ',', '-'].map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => {
                      const prevVal = openInputs[currentIndex] ?? '';
                      setOpenInputs(p => ({ ...p, [currentIndex]: prevVal + sym }));
                    }}
                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-sm border border-gray-200 transition-colors cursor-pointer"
                    title={`Vložit symbol ${sym}`}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                disabled={isAnswerSubmitted}
                value={openInputs[currentIndex] ?? currentAnswer?.userAnswer ?? ''}
                onChange={e => setOpenInputs(prev => ({ ...prev, [currentIndex]: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !isAnswerSubmitted && (openInputs[currentIndex] || '').trim()) {
                    handleCheckOpenAnswer();
                  }
                }}
                placeholder="Napiš svou odpověď sem (např. 1/2 nebo 3)..."
                className="h-16 rounded-2xl border-gray-300 bg-gray-50 text-base sm:text-lg font-bold px-6 focus:bg-white flex-1"
              />
              {!isAnswerSubmitted && (
                <Button
                  onClick={handleCheckOpenAnswer}
                  disabled={!(openInputs[currentIndex] || '').trim()}
                  className="h-16 rounded-2xl bg-[#1E1B18] hover:bg-[#332f2b] text-white px-8 font-black text-base cursor-pointer shadow-md shrink-0"
                >
                  Zkontrolovat
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Feedback Banner after submission */}
        {isAnswerSubmitted && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-5 rounded-2xl border space-y-2.5 ${
              currentAnswer.isCorrect
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}
          >
            <div className="flex items-center gap-2 font-black text-base">
              {currentAnswer.isCorrect ? (
                <>
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                  <span>
                    Výborně, správná odpověď! {currentAnswer.usedHint && '(použita nápověda)'}
                  </span>
                </>
              ) : (
                <>
                  <XCircle size={20} className="text-rose-600 shrink-0" />
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span>Bohužel nesprávně. Správně je:</span>
                    <strong className="inline-flex items-center">
                      <MathRenderer content={currentQuestion.correctAnswer} inline />
                    </strong>
                  </span>
                </>
              )}
            </div>

            {/* Didactic tutor feedback (e.g. unreduced fraction) */}
            {currentAnswer.tutorFeedback && (
              <div className="p-3 bg-amber-100/80 border border-amber-300 rounded-xl text-amber-950 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-2xs">
                <span className="text-base shrink-0">💡</span>
                <span>{currentAnswer.tutorFeedback}</span>
              </div>
            )}

            {currentQuestion.explanation && (
              <div className="text-xs sm:text-sm font-medium leading-relaxed pt-1 border-t border-gray-200/50">
                <div className="font-bold text-gray-700 mb-0.5">💡 Vysvětlení:</div>
                <MathRenderer content={currentQuestion.explanation} />
              </div>
            )}
          </motion.div>
        )}

        {/* Footer Actions: Next Question / Finish */}
        <div className="pt-4 flex items-center justify-end border-t border-gray-100">
          <div className="flex items-center gap-2">
            {currentIndex + 1 < questions.length ? (
              <Button
                onClick={handleNext}
                className="rounded-2xl bg-[#1E1B18] hover:bg-[#332f2b] text-white font-black text-sm px-7 h-12 shadow-md flex items-center gap-2 transition-transform hover:scale-105 cursor-pointer"
              >
                <span>Další otázka</span>
                <ArrowRight size={16} />
              </Button>
            ) : (
              <Button
                onClick={handleFinishPractice}
                className="rounded-2xl bg-[#1E1B18] hover:bg-[#332f2b] text-white font-black text-sm px-7 h-12 shadow-md flex items-center gap-2 transition-transform hover:scale-105 cursor-pointer"
              >
                <span>Zobrazit vyhodnocení</span>
                <ArrowRight size={16} />
              </Button>
            )}
          </div>
        </div>
      </Card>


      {/* DIALOG FOR ASKING THE TUTOR (Decision Q3 = Option A) */}
      <Dialog open={isInquiryModalOpen} onOpenChange={setIsInquiryModalOpen}>
        <DialogContent className="rounded-[2.5rem] p-6 sm:p-8 max-w-lg bg-white border border-gray-100 shadow-2xl">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl font-display font-black text-[#1E1B18] flex items-center gap-2.5">
              <MessageSquare className="text-amber-600" size={22} />
              Dotaz k otázce {currentIndex + 1}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-[#FAF7F0] p-4 rounded-2xl border border-gray-200/60 text-xs sm:text-sm font-medium text-gray-700">
              <span className="font-bold text-gray-400 block text-[10px] uppercase tracking-wider mb-1">
                Zadání úlohy:
              </span>
              <p className="line-clamp-3">{currentQuestion.question}</p>
              {currentQuestion.svgContent ? (
                <div 
                  className="mt-2 pt-2 border-t border-gray-200/50 flex justify-center max-h-36 overflow-hidden [&>svg]:max-h-36 [&>svg]:w-auto [&>svg]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: sanitizeSvg(currentQuestion.svgContent) }}
                />
              ) : currentQuestion.imageUrl ? (
                <div className="mt-2 pt-2 border-t border-gray-200/50 flex justify-center">
                  <img
                    src={currentQuestion.imageUrl}
                    alt="Obrázek k úloze"
                    className="max-h-32 rounded-lg object-contain border border-gray-200 bg-white p-1"
                  />
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 block">
                Napiš svůj dotaz pro lektora:
              </label>
              <Textarea
                placeholder="Popiš, co ti není jasné, s čím potřebuješ pomoct nebo jak jsi nad úlohou přemýšlel..."
                value={inquiryComment}
                onChange={(e) => setInquiryComment(e.target.value)}
                className="min-h-[120px] rounded-2xl p-4 text-sm bg-gray-50 border-gray-200 focus:border-[#1E1B18]"
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-end pt-2">
            <Button
              variant="outline"
              onClick={() => setIsInquiryModalOpen(false)}
              className="rounded-xl font-bold h-11 px-5"
            >
              Zrušit
            </Button>
            <Button
              onClick={handleSubmitInquiry}
              disabled={isSubmittingInquiry || !inquiryComment.trim()}
              className="rounded-xl bg-[#1E1B18] hover:bg-[#332f2b] text-white font-bold h-11 px-6 flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-40"
            >
              <Send size={15} />
              <span>{isSubmittingInquiry ? 'Odesílání...' : 'Odeslat dotaz lektorovi'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
