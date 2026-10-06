import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, 
  Lightbulb, Play, Sparkles
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { getSubtopicById, getQuestionsForSubtopic, getTopicById } from '../services/practiceService';
import { PracticeSubtopic, StudyStep } from '../types';

export default function StudyView() {
  const { subtopicId } = useParams<{ subtopicId: string }>();
  const navigate = useNavigate();

  const [subtopic, setSubtopic] = useState<PracticeSubtopic | null>(null);
  const [topicTitle, setTopicTitle] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const [expandedTips, setExpandedTips] = useState<Record<number, boolean>>({});
  const [stepAnswers, setStepAnswers] = useState<Record<number, string | null>>({});

  useEffect(() => {
    async function loadData() {
      if (!subtopicId) return;
      setLoading(true);
      try {
        const data = await getSubtopicById(subtopicId);
        setSubtopic(data);
        if (data) {
          const qs = await getQuestionsForSubtopic(data.id);
          setQuestionCount(qs.length);

          if (data.topicId) {
            const topic = await getTopicById(data.topicId);
            if (topic?.title) {
              setTopicTitle(topic.title);
            } else {
              setTopicTitle(data.topicId);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load study subtopic:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [subtopicId]);

  const toggleTip = (index: number) => {
    setExpandedTips(prev => ({ ...prev, [index]: !prev[index] }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-[#1E1B18] border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600 font-bold text-sm">Načítání výukových materiálů...</p>
      </div>
    );
  }

  if (!subtopic) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-2xl">
          ⚠️
        </div>
        <h2 className="text-3xl font-display font-black text-[#1E1B18]">Téma nebylo nalezeno</h2>
        <p className="text-gray-500">Studijní materiál k tomuto podtématu zatím nebyl vytvořen.</p>
        <Link to="/practice">
          <Button className="mt-4 rounded-xl bg-[#1E1B18] text-white font-bold">
            Zpět na přehled témat
          </Button>
        </Link>
      </div>
    );
  }

  const hasSvg = Boolean(subtopic.svgUrl || subtopic.svgContent);
  const steps: StudyStep[] = subtopic.studySteps || [];

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between">
        <Link 
          to="/practice" 
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-[#1E1B18] transition-colors bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100"
        >
          <ArrowLeft size={16} /> Zpět na témata
        </Link>

        {questionCount > 0 && (
          <Button
            onClick={() => navigate(`/practice/session/${subtopic.id}`)}
            className="rounded-xl bg-[#1E1B18] hover:bg-[#332f2b] text-white font-black px-5 h-11 flex items-center gap-2 shadow-md hover:scale-[1.02] transition-transform cursor-pointer"
          >
            <Play size={16} className="fill-current text-[#F5C400]" />
            <span>Spustit procvičování ({questionCount} úloh)</span>
          </Button>
        )}
      </div>

      {/* Main Topic Header */}
      <header className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm relative overflow-hidden">
        <div className="relative z-10 space-y-2">
          {/* Breadcrumbs single row: Předmět -> téma -> podtéma -> studijní materiál */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-bold text-gray-500 flex-wrap">
            <span className="text-gray-900 font-black">{subtopic.subjectId}</span>
            <span className="text-gray-300">→</span>
            <span>{topicTitle || 'Téma'}</span>
            <span className="text-gray-300">→</span>
            <span className="text-gray-700">{subtopic.title}</span>
            <span className="text-gray-300">→</span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200/60">
              Studijní materiál
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-display font-black text-[#1E1B18] tracking-tight pt-1">
            {subtopic.title}
          </h1>
        </div>
      </header>

      {/* Vizuální výukový list - přímo na stránce bez nadpisu a bez těžkých boxů */}
      {hasSvg && (
        <div className="w-full overflow-x-auto py-1 px-1 sm:px-2 flex justify-center items-start">
          {subtopic.svgContent ? (
            <div 
              className="w-full flex justify-center [&>svg]:w-full [&>svg]:max-w-full [&>svg]:h-auto shadow-sm rounded-2xl bg-white p-2 sm:p-4"
              dangerouslySetInnerHTML={{ __html: subtopic.svgContent }}
            />
          ) : subtopic.svgUrl ? (
            <img 
              src={subtopic.svgUrl} 
              alt={subtopic.title} 
              className="w-full h-auto max-w-full rounded-2xl shadow-sm bg-white p-2 sm:p-4 object-contain"
            />
          ) : null}
        </div>
      )}

      {/* Postup řešení krok za krokem */}
      {steps.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
            <h3 className="font-sans font-black text-2xl text-[#1E1B18]">
              Postup řešení krok za krokem
            </h3>
          </div>

          <div className="grid gap-4">
            {steps.map((step, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08 }}
                className="p-6 bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col gap-4 sm:gap-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 sm:gap-6 flex-1 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#1E1B18] text-[#FAF7F0] font-black text-base sm:text-lg flex items-center justify-center shrink-0 shadow-md">
                      {idx + 1}
                    </div>
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <h4 className="font-bold text-lg sm:text-xl text-[#1E1B18] tracking-tight">
                        {step.title}
                      </h4>
                      <p className="text-gray-600 font-medium text-sm sm:text-base leading-relaxed">
                        {step.content}
                      </p>
                    </div>
                  </div>

                  {/* Tutor Tip Button in top right corner */}
                  {step.tutorTip && (
                    <div className="shrink-0 pt-0.5">
                      <button 
                        onClick={() => toggleTip(idx)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl font-bold text-xs sm:text-sm transition-all cursor-pointer shadow-xs ${
                          expandedTips[idx]
                            ? "bg-amber-400 text-[#1E1B18] shadow-sm ring-2 ring-amber-400/40"
                            : "bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80"
                        }`}
                        title={expandedTips[idx] ? "Skrýt tip od lektora" : "Zobrazit tip od lektora"}
                      >
                        <Lightbulb size={15} className={expandedTips[idx] ? "text-[#1E1B18]" : "text-amber-600"} />
                        <span className="hidden sm:inline">Tip od lektora</span>
                        <span className="sm:hidden">Tip</span>
                        {expandedTips[idx] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Tutor Tip - Bublinka lektora rozkliknutá přímo pod záhlavím s ocáskem směřujícím k tlačítku vpravo */}
                {step.tutorTip && (
                  <AnimatePresence>
                    {expandedTips[idx] && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        className="relative mt-1"
                      >
                        {/* Triangle speech bubble tail positioned towards the button in the top right */}
                        <div className="absolute -top-2 right-8 sm:right-12 w-0 h-0 border-x-8 border-x-transparent border-b-8 border-b-amber-200" />
                        <div className="p-4 sm:p-5 bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-2xl border border-amber-200/80 text-amber-950 shadow-sm space-y-1.5">
                          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-800">
                            <Sparkles size={14} />
                            <span>Doporučení lektora</span>
                          </div>
                          <p className="text-sm sm:text-base font-medium leading-relaxed text-amber-900">
                            {step.tutorTip}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
                
                {/* 4-choice Test Question */}
                {step.testQuestion && (
                  <div className="mt-2 pt-4 border-t border-gray-100 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black uppercase tracking-wider bg-blue-100 text-blue-900 px-2.5 py-0.5 rounded-md">
                        Otázka k ověření kroku
                      </span>
                    </div>
                    <p className="font-bold text-gray-900 text-sm sm:text-base leading-snug">
                      {step.testQuestion}
                    </p>

                    {step.testOptions && step.testOptions.length > 0 && step.testOptions.some(Boolean) ? (
                      <div className="space-y-3">
                        <div className="grid sm:grid-cols-2 gap-2.5">
                          {step.testOptions.filter(Boolean).slice(0, 4).map((opt, oIdx) => {
                            const isSelected = stepAnswers[idx]?.trim() === opt.trim();
                            const isCorrect = step.correctAnswer?.trim() === opt.trim();
                            const hasAnswered = stepAnswers[idx] !== undefined && stepAnswers[idx] !== null;

                            let btnClass = "p-3.5 rounded-2xl border text-sm font-semibold text-left transition-all flex items-center gap-3 ";
                            if (hasAnswered) {
                              if (isSelected) {
                                btnClass += isCorrect
                                  ? "bg-emerald-100 border-emerald-400 text-emerald-950 font-bold shadow-sm"
                                  : "bg-red-100 border-red-400 text-red-950 font-bold shadow-sm";
                              } else {
                                btnClass += isCorrect
                                  ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-bold"
                                  : "bg-gray-50 border-gray-100 text-gray-400 opacity-50";
                              }
                            } else {
                              btnClass += "bg-white border-gray-200 hover:border-gray-900 hover:bg-gray-50/80 text-gray-800 cursor-pointer shadow-xs";
                            }

                            return (
                              <button 
                                key={oIdx} 
                                className={btnClass}
                                onClick={() => !hasAnswered && setStepAnswers(prev => ({ ...prev, [idx]: opt }))}
                                disabled={hasAnswered}
                              >
                                <span className="w-6 h-6 rounded-xl bg-gray-100 text-gray-700 text-xs font-black flex items-center justify-center shrink-0">
                                  {['A', 'B', 'C', 'D'][oIdx] || oIdx + 1}
                                </span>
                                <span className="leading-snug">{opt}</span>
                              </button>
                            );
                          })}
                        </div>

                        {stepAnswers[idx] !== undefined && stepAnswers[idx] !== null && (
                          <div className={`p-3.5 rounded-2xl border text-xs sm:text-sm font-bold flex items-center justify-between gap-3 ${
                            stepAnswers[idx]?.trim() === step.correctAnswer?.trim()
                              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                              : "bg-rose-50 border-rose-200 text-rose-900"
                          }`}>
                            <div className="flex items-center gap-2.5">
                              {stepAnswers[idx]?.trim() === step.correctAnswer?.trim() ? (
                                <>
                                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                                  <span>Správná odpověď! Skvělá práce.</span>
                                </>
                              ) : (
                                <>
                                  <span className="w-5 h-5 rounded-full bg-rose-200 text-rose-800 flex items-center justify-center font-black shrink-0 text-xs">✕</span>
                                  <span>Nesprávně.{step.correctAnswer ? ` Správná odpověď je: ${step.correctAnswer}` : ''}</span>
                                </>
                              )}
                            </div>
                            {stepAnswers[idx]?.trim() !== step.correctAnswer?.trim() && (
                              <button
                                onClick={() => setStepAnswers(prev => ({ ...prev, [idx]: null }))}
                                className="text-xs underline font-black text-rose-700 hover:text-rose-950 cursor-pointer shrink-0"
                              >
                                Zkusit znovu
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <Button
                          onClick={() => setStepAnswers(prev => ({ ...prev, [idx]: 'revealed' }))}
                          variant="outline"
                          className="rounded-xl font-bold text-sm h-10 px-4 cursor-pointer"
                          disabled={stepAnswers[idx] === 'revealed'}
                        >
                          {stepAnswers[idx] === 'revealed' ? 'Odpověď odhalena' : 'Zobrazit řešení'}
                        </Button>
                        {stepAnswers[idx] === 'revealed' && step.correctAnswer && (
                          <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-emerald-800 font-medium text-sm">
                            {step.correctAnswer}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Prominent Bottom Action Banner to Practice */}
      <div className="bg-gradient-to-br from-[#1E1B18] to-[#38332d] text-white rounded-[2.5rem] p-8 sm:p-10 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 text-center md:text-left z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-yellow-300 text-xs font-black uppercase tracking-wider">
            <Sparkles size={14} /> Jsi připraven?
          </div>
          <h3 className="text-2xl sm:text-3xl font-display font-black tracking-tight">
            Máš látku nastudovanou?
          </h3>
          <p className="text-gray-300 font-medium text-sm sm:text-base max-w-xl">
            Vyzkoušej si interaktivní procvičování a ověř si, zda látku ovládáš na 100 %.
          </p>
        </div>

        <Button
          onClick={() => navigate(`/practice/session/${subtopic.id}`)}
          className="rounded-2xl bg-[#F5C400] hover:bg-[#ffcf1a] text-[#1E1B18] font-black text-base px-8 h-14 shadow-lg hover:scale-105 transition-transform shrink-0 flex items-center gap-3 cursor-pointer z-10"
        >
          <Play size={20} className="fill-current text-[#1E1B18]" />
          <span>Spustit procvičování</span>
        </Button>
      </div>
    </div>
  );
}
