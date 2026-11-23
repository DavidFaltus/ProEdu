import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Play,
  Lock,
  Check,
  RotateCcw
} from 'lucide-react';
import {
  CorrectCyanIcon,
  WrongPinkIcon,
  StarPinkIcon,
  StarYellowIcon,
  BulbYellowIcon
} from '../components/common/CustomIcon';
import { Button } from '../components/ui/button';
import { useAuth } from '../context/AuthContext';
import {
  fetchStudySubtopic,
  fetchPracticeCatalog,
  fetchMaterialStatus
} from '../services/practiceService';
import { PracticeSubtopic, StudyStep, MaterialStatus } from '../types';
import { MathRenderer } from '../components/common/MathRenderer';
import InlineStudyMedia from '../components/common/InlineStudyMedia';
import TheoryMaterialViewer from '../components/study/TheoryMaterialViewer';
import UnifiedPaywallModal from '../components/common/UnifiedPaywallModal';
import {
  loadStudyProgress,
  saveStudyProgress,
  resetStudyProgress,
} from '../services/studyProgressService';
import {
  trackStudySessionStart,
  trackStudyStepComplete,
  trackStudySessionComplete,
  setDynamicPageSeo,
  startPerfTrace
} from '../services/analyticsService';

export default function StudyView() {
  const { subtopicId } = useParams<{ subtopicId: string }>();
  const { user, isPremium, isCourseUser, isTeacher, openAuthModal } = useAuth();
  const hasStudyAccess = isPremium || isCourseUser || isTeacher;
  const navigate = useNavigate();

  const [subtopic, setSubtopic] = useState<PracticeSubtopic | null>(null);
  const [topicTitle, setTopicTitle] = useState<string>('');
  const [questionCount, setQuestionCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const [expandedTips, setExpandedTips] = useState<Record<number, boolean>>({});
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [verifiedAnswers, setVerifiedAnswers] = useState<Record<number, string>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<number, string>>({});
  const [wrongAttemptStep, setWrongAttemptStep] = useState<Record<number, boolean>>({});
  const [expandedCompletedSteps, setExpandedCompletedSteps] = useState<Record<number, boolean>>({});

  const [isPaywallDismissed, setIsPaywallDismissed] = useState(false);
  const [materialMeta, setMaterialMeta] = useState<{
    status?: MaterialStatus;
    errorMessage?: string | null;
    fileUrl?: string | null;
    pdfUrl?: string | null;
    svgUrl?: string | null;
    downloadUrl?: string | null;
    fileType?: string | null;
    originalName?: string | null;
  } | null>(null);

  const progressStorageKey = useMemo(() => {
    if (!subtopicId) return null;
    const uidPart = user?.uid || 'guest';
    return `proedu_study_progress_${uidPart}_${subtopicId}`;
  }, [user?.uid, subtopicId]);

  useEffect(() => {
    async function loadData() {
      if (!subtopicId) {
        setLoading(false);
        return;
      }
      if (!hasStudyAccess) {
        setSubtopic(null);
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      setLoading(true);
      setAccessDenied(false);
      const perfTrace = startPerfTrace('study_subtopic_load', {
        subtopic_id: subtopicId,
      });
      try {
        const [studyRes, catalog] = await Promise.all([
          fetchStudySubtopic(subtopicId),
          fetchPracticeCatalog({ includeHidden: isTeacher }).catch(() => null)
        ]);

        if (studyRes.forbidden) {
          perfTrace.stop({ status: 'forbidden' });
          setAccessDenied(true);
          setSubtopic(null);
          return;
        }

        const data = studyRes.subtopic;
        perfTrace.stop(
          {
            status: 'ok',
            subject: data?.subjectId || 'unknown',
          },
          {
            steps_count: (data?.studySteps || []).length,
          }
        );
        setSubtopic(data);
        if (data) {
          setDynamicPageSeo({
            pagePath: `/study/${data.id}`,
            pageTitle: `Výuka: ${data.title} (${data.subjectId}) | ProEdu`,
            indexable: false,
          });
          trackStudySessionStart({
            subtopicId: data.id,
            subtopicTitle: data.title,
            totalSteps: (data.studySteps || []).length,
            hasMaterial: Boolean(data.materialId || data.pdfUrl || data.fileUrl || data.svgUrl),
          });
          const cfgTotal =
            data.practiceConfig?.totalCount ||
            ((data.practiceConfig?.easyCount || 0) +
              (data.practiceConfig?.mediumCount || 0) +
              (data.practiceConfig?.hardCount || 0));
          setQuestionCount(cfgTotal || data.questionCount || 0);

          const matchedTopic = catalog?.topics.find(
            (t) => t.id === data.topicId || t.title === data.topicId
          );
          setTopicTitle(matchedTopic?.title || data.topicId || '');
        }
      } catch (err) {
        perfTrace.stop({ status: 'error' });
        console.error('Failed to load study subtopic:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [subtopicId, hasStudyAccess, isTeacher]);

  const steps: StudyStep[] = subtopic?.studySteps || [];

  // Load saved step completion progress from Firestore / localStorage
  useEffect(() => {
    if (!subtopicId || !subtopic) return;
    let cancelled = false;
    const totalSteps = (subtopic.studySteps || []).length;
    loadStudyProgress(user?.uid, subtopicId, totalSteps)
      .then((record) => {
        if (cancelled) return;
        setCompletedSteps(record.completedSteps);
        setVerifiedAnswers(record.verifiedAnswers);
        setSelectedOptions(record.verifiedAnswers);
        setWrongAttemptStep({});
        setExpandedCompletedSteps({});
      })
      .catch(() => {
        if (cancelled) return;
        setCompletedSteps([]);
        setVerifiedAnswers({});
        setSelectedOptions({});
        setWrongAttemptStep({});
        setExpandedCompletedSteps({});
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, subtopicId, subtopic]);

  const saveProgress = (nextCompleted: number[], nextVerified: Record<number, string>) => {
    if (!subtopicId) return;
    saveStudyProgress(user?.uid, subtopicId, {
      completedSteps: nextCompleted,
      verifiedAnswers: nextVerified,
      totalSteps: steps.length,
    });
  };

  const markStepCompleted = (idx: number, answerVal: string) => {
    const isNewStep = !completedSteps.includes(idx);
    const nextCompleted = completedSteps.includes(idx)
      ? completedSteps
      : [...completedSteps, idx].sort((a, b) => a - b);
    const nextVerified = { ...verifiedAnswers, [idx]: answerVal };
    setCompletedSteps(nextCompleted);
    setVerifiedAnswers(nextVerified);
    setWrongAttemptStep((prev) => ({ ...prev, [idx]: false }));
    setExpandedCompletedSteps((prev) => ({ ...prev, [idx]: false }));
    saveProgress(nextCompleted, nextVerified);
    if (isNewStep && subtopicId) {
      trackStudyStepComplete({
        subtopicId,
        stepIndex: idx,
        totalSteps: steps.length,
      });
    }
  };

  // Měření celkové doby strávené ve výukovém režimu (study_session_complete při odchodu)
  const studyStartTimeRef = React.useRef<number>(Date.now());
  const studySnapshotRef = React.useRef({
    subtopicId: '',
    subtopicTitle: '',
    completedCount: 0,
    totalSteps: 0,
  });
  useEffect(() => {
    studyStartTimeRef.current = Date.now();
  }, [subtopicId]);
  useEffect(() => {
    studySnapshotRef.current = {
      subtopicId: subtopic?.id || subtopicId || '',
      subtopicTitle: subtopic?.title || '',
      completedCount: completedSteps.length,
      totalSteps: steps.length,
    };
  }, [subtopic, subtopicId, completedSteps.length, steps.length]);
  useEffect(() => {
    return () => {
      const snap = studySnapshotRef.current;
      if (snap.subtopicId && snap.subtopicTitle) {
        const durationSeconds = Math.max(0, Math.round((Date.now() - studyStartTimeRef.current) / 1000));
        trackStudySessionComplete({
          subtopicId: snap.subtopicId,
          subtopicTitle: snap.subtopicTitle,
          completedStepsCount: snap.completedCount,
          totalSteps: snap.totalSteps,
          durationSeconds,
        });
      }
    };
  }, []);

  const handleResetStepsProgress = () => {
    setCompletedSteps([]);
    setVerifiedAnswers({});
    setSelectedOptions({});
    setWrongAttemptStep({});
    setExpandedCompletedSteps({});
    if (subtopicId) {
      resetStudyProgress(user?.uid, subtopicId);
    }
  };

  const handleSelectOption = (idx: number, opt: string) => {
    setSelectedOptions((prev) => ({ ...prev, [idx]: opt }));
    if (wrongAttemptStep[idx]) {
      setWrongAttemptStep((prev) => ({ ...prev, [idx]: false }));
    }
  };

  const handleCheckStepAnswer = (idx: number, step: StudyStep) => {
    const chosen = selectedOptions[idx]?.trim();
    if (!chosen) return;
    const expected = step.correctAnswer?.trim();
    if (!expected || chosen === expected) {
      markStepCompleted(idx, selectedOptions[idx]!);
    } else {
      setWrongAttemptStep((prev) => ({ ...prev, [idx]: true }));
    }
  };

  const linkedMaterialId = useMemo(() => {
    if (!subtopic) return null;
    if (subtopic.materialId) return subtopic.materialId;
    const candidateUrl = subtopic.pdfUrl || subtopic.fileUrl || subtopic.svgUrl || '';
    const match = candidateUrl.match(/\/api\/materials\/([^/?#]+)/);
    return match ? match[1] : null;
  }, [subtopic]);

  // Real-time sledování přípravy přiřazeného materiálu (dokud má status 'processing') přes autorizované API
  useEffect(() => {
    if (!linkedMaterialId || !hasStudyAccess) {
      setMaterialMeta(null);
      return;
    }

    let cancelled = false;
    let pollTimer: number | null = null;

    const applyStatus = (data: any) => {
      if (!data || cancelled) return;
      setMaterialMeta({
        status: data.status || 'ready',
        errorMessage: data.errorMessage || null,
        fileUrl: data.fileUrl ?? null,
        pdfUrl: data.pdfUrl ?? null,
        svgUrl: data.svgUrl ?? null,
        downloadUrl: data.downloadUrl ?? null,
        fileType: data.fileType ?? null,
        originalName: data.originalName ?? null
      });
      if (data.status !== 'processing' && pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    fetchMaterialStatus(linkedMaterialId).then(applyStatus).catch(() => {});

    pollTimer = window.setInterval(() => {
      fetchMaterialStatus(linkedMaterialId).then(applyStatus).catch(() => {});
    }, 3000);

    return () => {
      cancelled = true;
      if (pollTimer !== null) window.clearInterval(pollTimer);
    };
  }, [linkedMaterialId, hasStudyAccess]);

  const toggleTip = (index: number) => {
    setExpandedTips((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const toggleCompletedStepExpand = (index: number) => {
    setExpandedCompletedSteps((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-[#1E1B18] border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-600 font-bold text-sm">Načítání výukových materiálů...</p>
      </div>
    );
  }

  if (!hasStudyAccess || accessDenied) {
    return (
      <>
        <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto shadow-xs">
            <Lock size={28} />
          </div>
          <h2 className="text-3xl font-display font-black text-[#1E1B18]">
            Studijní teorie a výklady jsou součástí ProEducator Premium
          </h2>
          <p className="text-gray-600 font-medium text-sm sm:text-base max-w-lg mx-auto">
            Pro zobrazení kompletní teorie, vzorových příkladů a tipů lektora je nutné aktivní předplatné Premium nebo přiřazený kurz.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            {!user ? (
              <Button
                onClick={openAuthModal}
                className="rounded-xl bg-[#1E1B18] text-white font-black px-6 h-11 cursor-pointer"
              >
                Přihlásit se / Registrovat
              </Button>
            ) : (
              <Button
                onClick={() => setIsPaywallDismissed(false)}
                className="rounded-xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] border border-blue-200/80 font-black px-6 h-11 cursor-pointer"
              >
                Odemknout Premium
              </Button>
            )}
            <Link to="/practice">
              <Button variant="outline" className="rounded-xl font-bold h-11 px-5 cursor-pointer">
                Zpět na přehled témat
              </Button>
            </Link>
          </div>
        </div>

        <UnifiedPaywallModal
          isOpen={!isPaywallDismissed}
          onClose={() => {
            setIsPaywallDismissed(true);
            navigate('/practice');
          }}
          type="premium"
          description="Staň se jedním z prvních podporovatelů platformy, zafixuj si poloviční cenu 99 Kč/měsíc napořád a získej okamžitý přístup ke všem nástrojům bez limitu žolíků."
        />
      </>
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

  const effectiveFileUrl =
    materialMeta?.fileUrl || subtopic.fileUrl || subtopic.pdfUrl || subtopic.svgUrl || null;
  const effectivePdfUrl = materialMeta?.pdfUrl || subtopic.pdfUrl || null;
  const effectiveDownloadUrl = materialMeta?.downloadUrl || subtopic.downloadUrl || null;
  const effectiveFileType = materialMeta?.fileType || subtopic.fileType || null;
  const effectiveOriginalName = materialMeta?.originalName || subtopic.originalName || null;

  const hasVisualMaterial = Boolean(
    effectiveFileUrl || effectivePdfUrl || subtopic.svgUrl || subtopic.svgContent
  );
  const isMaterialProcessing = materialMeta?.status === 'processing';
  const isMaterialError = materialMeta?.status === 'error';
  const cleanTheoryText =
    subtopic.studyTheory?.trim() && !subtopic.studyTheory.includes('<svg')
      ? subtopic.studyTheory.trim()
      : '';

  const hasTheorySection = Boolean(
    isMaterialProcessing || isMaterialError || hasVisualMaterial || cleanTheoryText
  );
  const hasStepsSection = steps.length > 0;
  const isTwoColumnLayout = hasTheorySection && hasStepsSection;

  // Determine the first incomplete step index (steps unlock strictly sequentially)
  let firstIncompleteIdx = steps.length;
  for (let i = 0; i < steps.length; i++) {
    if (!completedSteps.includes(i)) {
      firstIncompleteIdx = i;
      break;
    }
  }
  const allStepsCompleted = steps.length === 0 || completedSteps.length >= steps.length;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-16 relative">
      {/* Top Breadcrumb Navigation */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          to="/practice"
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-[#1E1B18] transition-colors bg-white px-4 py-2 rounded-xl shadow-2xs border border-gray-100"
        >
          <ArrowLeft size={16} /> Zpět na témata
        </Link>

        {questionCount > 0 && (
          <Button
            onClick={() => navigate(`/practice/session/${subtopic.id}`)}
            className="rounded-xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] border border-blue-200/80 font-black px-5 h-11 flex items-center gap-2 shadow-2xs hover:scale-[1.01] transition-transform cursor-pointer"
          >
            <Play size={16} className="fill-[#0F2942] text-[#0F2942]" />
            <span>Spustit procvičování ({questionCount} úloh)</span>
          </Button>
        )}
      </div>

      {/* Main Topic Header */}
      <header className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-2xs relative overflow-hidden">
        <div className="relative z-10 space-y-1.5">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-bold text-gray-500 flex-wrap">
            <span>{subtopic.subjectId}</span>
            <span className="text-gray-300">→</span>
            <span>{topicTitle || 'Téma'}</span>
            <span className="text-gray-300">→</span>
            <span className="text-gray-700">{subtopic.title}</span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-playful text-gray-700 tracking-tight pt-1">
            {subtopic.title}
          </h1>
        </div>
      </header>

      {/* Main Study Layout: 2-Column when both Theory & Steps exist, 1-Column otherwise */}
      <div
        className={
          isTwoColumnLayout
            ? 'grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start'
            : 'max-w-4xl mx-auto w-full space-y-6'
        }
      >
        {/* LEFT COLUMN: 1 Teorie (Sticky on desktop) */}
        {hasTheorySection && (
          <div className={isTwoColumnLayout ? 'lg:col-span-5 lg:sticky lg:top-6' : 'w-full'}>
            <TheoryMaterialViewer
              materialId={linkedMaterialId}
              title={subtopic.title}
              svgContent={subtopic.svgContent}
              fileUrl={effectiveFileUrl}
              pdfUrl={effectivePdfUrl}
              svgUrl={subtopic.svgUrl}
              downloadUrl={effectiveDownloadUrl}
              fileType={effectiveFileType}
              originalName={effectiveOriginalName}
              studyTheory={cleanTheoryText}
              theoryImages={subtopic.sampleProblem?.theoryImages}
              isProcessing={isMaterialProcessing}
              isError={isMaterialError}
              errorMessage={materialMeta?.errorMessage}
              showStickyHint={isTwoColumnLayout}
            />
          </div>
        )}

        {/* RIGHT COLUMN: 2 Postup řešení krok za krokem */}
        {hasStepsSection && (
          <div className={isTwoColumnLayout ? 'lg:col-span-7 space-y-4' : 'w-full space-y-4'}>
            {/* Section Header */}
            <div className="flex items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#DCEBFE] text-[#1D4ED8] font-black text-sm flex items-center justify-center shrink-0">
                  {hasTheorySection ? '2' : '1'}
                </div>
                <h2 className="font-sans font-black text-xl sm:text-2xl text-[#0F2942]">
                  Postup řešení krok za krokem
                </h2>
              </div>

              {completedSteps.length > 0 && (
                <button
                  type="button"
                  onClick={handleResetStepsProgress}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-[#0F2942] transition-colors cursor-pointer"
                  title="Resetovat splněné kroky a projít je znovu"
                >
                  <RotateCcw size={13} />
                  <span>Projít znovu</span>
                </button>
              )}
            </div>

            {/* Steps List */}
            <div className="space-y-3.5">
              {steps.map((step, idx) => {
                const isCompleted = completedSteps.includes(idx);
                const isActive = idx === firstIncompleteIdx;
                const isLocked = !isCompleted && idx > firstIncompleteIdx;
                const isExpandedCompleted = isCompleted && Boolean(expandedCompletedSteps[idx]);

                const hasStepAttachment = Boolean(
                  step.svgContent || step.imageUrl || step.fileUrl || step.pdfUrl
                );
                const validOptions = Array.isArray(step.testOptions)
                  ? step.testOptions.filter(Boolean).slice(0, 4)
                  : [];
                const hasMultipleChoiceQuestion = Boolean(
                  step.testQuestion && validOptions.length > 0
                );

                // STATE 1: COMPLETED & COLLAPSED (Compact bar like Krok 1 in design)
                if (isCompleted && !isExpandedCompleted) {
                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => toggleCompletedStepExpand(idx)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleCompletedStepExpand(idx);
                        }
                      }}
                      className="bg-white rounded-2xl px-5 py-4 border border-gray-100 shadow-2xs hover:border-emerald-200 hover:shadow-xs transition-all flex items-center justify-between gap-4 cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                          <Check size={18} strokeWidth={2.5} />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                            KROK {idx + 1}
                          </span>
                          <h3 className="font-black text-sm sm:text-base text-[#0F2942] truncate">
                            <MathRenderer content={step.title} inline />
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black">
                          Splněno
                        </span>
                        <ChevronDown size={16} className="text-gray-400" />
                      </div>
                    </motion.div>
                  );
                }

                // STATE 2: LOCKED STEP (Compact bar with lock icon)
                if (isLocked) {
                  return (
                    <div
                      key={idx}
                      className="bg-white/75 rounded-2xl px-5 py-4 border border-gray-200/70 flex items-center justify-between gap-4 select-none"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center shrink-0">
                          <Lock size={16} />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                            KROK {idx + 1}
                          </span>
                          <h3 className="font-bold text-sm sm:text-base text-gray-500 truncate">
                            <MathRenderer content={step.title} inline />
                          </h3>
                        </div>
                      </div>

                      <span className="text-xs font-bold text-gray-400 shrink-0">
                        Odemkne se po kroku {idx}
                      </span>
                    </div>
                  );
                }

                // STATE 3: ACTIVE STEP (or EXPANDED COMPLETED STEP)
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-5 sm:p-6 bg-white rounded-3xl transition-all flex flex-col gap-4 ${
                      isActive
                        ? 'border-2 border-[#B9D8FC] shadow-sm'
                        : 'border border-emerald-200 shadow-2xs'
                    }`}
                  >
                    {/* Step Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3.5 flex-1 min-w-0">
                        {isCompleted ? (
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <Check size={18} strokeWidth={2.5} />
                          </div>
                        ) : (
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#DCEBFE] text-[#1D4ED8] font-black text-sm sm:text-base flex items-center justify-center shrink-0">
                            {idx + 1}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                            KROK {idx + 1} Z {steps.length}
                          </span>
                          <h3 className="font-black text-lg sm:text-xl text-[#0F2942] tracking-tight leading-snug">
                            <MathRenderer content={step.title} inline />
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {step.tutorTip && (
                          <button
                            type="button"
                            onClick={() => toggleTip(idx)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-xs transition-all cursor-pointer ${
                              expandedTips[idx]
                                ? 'bg-amber-400 text-[#1E1B18] shadow-2xs ring-2 ring-amber-400/40'
                                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80'
                            }`}
                            title={expandedTips[idx] ? 'Skrýt tip od lektora' : 'Zobrazit tip od lektora'}
                          >
                            <BulbYellowIcon size={15} />
                            <span>Tip od lektora</span>
                          </button>
                        )}

                        {isCompleted && (
                          <button
                            type="button"
                            onClick={() => toggleCompletedStepExpand(idx)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-black transition-colors cursor-pointer"
                            title="Sbalit krok"
                          >
                            <span>Splněno</span>
                            <ChevronUp size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Tutor Tip Bubble */}
                    {step.tutorTip && (
                      <AnimatePresence>
                        {expandedTips[idx] && (
                          <motion.div
                            initial={{ opacity: 0, y: -6, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                            transition={{ duration: 0.18 }}
                            className="relative"
                          >
                            <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-2xl border border-amber-200/80 text-amber-950 shadow-2xs space-y-1">
                              <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-800">
                                <StarPinkIcon size={14} />
                                <span>Doporučení lektora</span>
                              </div>
                              <div className="text-xs sm:text-sm font-medium leading-relaxed text-amber-900">
                                <MathRenderer content={step.tutorTip} />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    )}

                    {/* Step Explanation Text */}
                    {step.content?.trim() && (
                      <div className="text-gray-700 font-medium text-sm sm:text-base leading-relaxed">
                        <MathRenderer
                          content={step.content}
                          imageMap={subtopic.sampleProblem?.theoryImages}
                        />
                      </div>
                    )}

                    {/* Step Embedded SVG Image (purely embedded, non-interactive, no download) */}
                    {hasStepAttachment && (
                      <div
                        className="py-1 pointer-events-none select-none"
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        <InlineStudyMedia
                          svgContent={step.svgContent}
                          fileUrl={step.fileUrl}
                          pdfUrl={step.pdfUrl}
                          imageUrl={step.imageUrl}
                          fileType={step.fileType}
                          originalName={step.originalName}
                          alt={step.title || `Krok ${idx + 1}`}
                        />
                      </div>
                    )}

                    {/* Verification Question or Step Completion Action */}
                    {step.testQuestion ? (
                      <div className="pt-3 border-t border-gray-100 space-y-3">
                        <div>
                          <span className="inline-block text-[10px] font-black uppercase tracking-wider bg-[#EBF3FE] text-[#1E40AF] px-2.5 py-1 rounded-md">
                            Otázka k ověření kroku
                          </span>
                        </div>

                        <div className="font-black text-[#0F2942] text-sm sm:text-base leading-snug">
                          <MathRenderer content={step.testQuestion} />
                        </div>

                        {hasMultipleChoiceQuestion ? (
                          <div className="space-y-3.5">
                            <div className="grid sm:grid-cols-2 gap-2.5">
                              {validOptions.map((opt, oIdx) => {
                                const currentSelection = isCompleted
                                  ? verifiedAnswers[idx] || step.correctAnswer
                                  : selectedOptions[idx];
                                const isSelected = currentSelection?.trim() === opt.trim();
                                const isWrongSelected =
                                  !isCompleted && isSelected && Boolean(wrongAttemptStep[idx]);

                                let btnClass =
                                  'p-3.5 rounded-2xl text-sm font-bold text-left transition-all flex items-center gap-3 ';
                                let badgeClass =
                                  'w-7 h-7 rounded-full text-xs font-black flex items-center justify-center shrink-0 transition-colors ';

                                if (isCompleted) {
                                  if (isSelected) {
                                    btnClass +=
                                      'bg-emerald-50/80 border-2 border-emerald-500 text-emerald-950';
                                    badgeClass += 'bg-emerald-600 text-white';
                                  } else {
                                    btnClass +=
                                      'bg-gray-50/60 border border-gray-200 text-gray-400 opacity-60';
                                    badgeClass += 'bg-gray-100 text-gray-400';
                                  }
                                } else if (isWrongSelected) {
                                  btnClass +=
                                    'bg-rose-50/70 border-2 border-rose-400 text-rose-950 cursor-pointer';
                                  badgeClass += 'bg-rose-600 text-white';
                                } else if (isSelected) {
                                  btnClass +=
                                    'bg-white border-2 border-[#2563EB] text-[#0F2942] shadow-2xs cursor-pointer';
                                  badgeClass += 'bg-[#2563EB] text-white';
                                } else {
                                  btnClass +=
                                    'bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50/60 text-gray-800 cursor-pointer';
                                  badgeClass += 'bg-gray-100 text-gray-600';
                                }

                                return (
                                  <button
                                    key={oIdx}
                                    type="button"
                                    className={btnClass}
                                    onClick={() => !isCompleted && handleSelectOption(idx, opt)}
                                    disabled={isCompleted}
                                  >
                                    <span className={badgeClass}>
                                      {['A', 'B', 'C', 'D'][oIdx] || oIdx + 1}
                                    </span>
                                    <span className="leading-snug flex-1">
                                      <MathRenderer content={opt} inline />
                                    </span>
                                  </button>
                                );
                              })}
                            </div>

                            {/* Wrong attempt feedback */}
                            {!isCompleted && wrongAttemptStep[idx] && (
                              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs sm:text-sm font-bold flex items-center gap-2.5">
                                <WrongPinkIcon size={18} className="shrink-0" />
                                <span>
                                  Nesprávná odpověď. Projdi si prosím krok ještě jednou a vyber správnou možnost.
                                </span>
                              </div>
                            )}

                            {/* Action Row: Zkontrolovat button + unlock hint */}
                            {!isCompleted ? (
                              <div className="flex items-center justify-between gap-3 pt-0.5 flex-wrap">
                                <button
                                  type="button"
                                  disabled={!selectedOptions[idx]}
                                  onClick={() => handleCheckStepAnswer(idx, step)}
                                  className="px-6 py-2.5 rounded-full bg-[#F5C400] hover:bg-[#E5B600] active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-[#0F2942] font-black text-xs sm:text-sm shadow-2xs transition-all cursor-pointer"
                                >
                                  Zkontrolovat
                                </button>

                                <span className="text-xs font-bold text-gray-500">
                                  {idx + 1 < steps.length
                                    ? `Správně odemkne krok ${idx + 2}`
                                    : 'Správně dokončí studium'}
                                </span>
                              </div>
                            ) : (
                              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm font-bold flex items-center gap-2">
                                <CorrectCyanIcon size={18} className="shrink-0" />
                                <span>Správná odpověď! Krok je splněn.</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* Open question fallback (no options configured) */
                          <div className="space-y-3">
                            {!isCompleted ? (
                              <div className="flex items-center justify-between gap-3 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => markStepCompleted(idx, 'revealed')}
                                  className="px-6 py-2.5 rounded-full bg-[#F5C400] hover:bg-[#E5B600] text-[#0F2942] font-black text-xs sm:text-sm shadow-2xs transition-all cursor-pointer"
                                >
                                  Zkontrolovat řešení
                                </button>
                                <span className="text-xs font-bold text-gray-500">
                                  {idx + 1 < steps.length
                                    ? `Odemkne krok ${idx + 2}`
                                    : 'Dokončí studium'}
                                </span>
                              </div>
                            ) : (
                              step.correctAnswer && (
                                <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-900 font-bold text-sm">
                                  <MathRenderer content={step.correctAnswer} />
                                </div>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Step without verification question */
                      !isCompleted && (
                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                          <button
                            type="button"
                            onClick={() => markStepCompleted(idx, 'done')}
                            className="px-6 py-2.5 rounded-full bg-[#F5C400] hover:bg-[#E5B600] text-[#0F2942] font-black text-xs sm:text-sm shadow-2xs transition-all cursor-pointer"
                          >
                            {idx + 1 < steps.length ? 'Pokračovat na další krok' : 'Dokončit studium'}
                          </button>
                          <span className="text-xs font-bold text-gray-500">
                            {idx + 1 < steps.length
                              ? `Odemkne krok ${idx + 2}`
                              : 'Dokončí studium'}
                          </span>
                        </div>
                      )
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Prominent Bottom Action Banner to Practice */}
      <div
        className={`rounded-[2.5rem] p-8 sm:p-10 shadow-xs border-2 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden transition-all ${
          allStepsCompleted
            ? 'bg-gradient-to-br from-blue-50/90 via-sky-50/70 to-blue-50/90 text-[#0F2942] border-[#B9D8FC]'
            : 'bg-gray-50 text-gray-600 border-gray-200/80'
        }`}
      >
        {allStepsCompleted && (
          <div className="absolute top-0 right-0 w-80 h-80 bg-[#B9D8FC]/30 rounded-full blur-3xl pointer-events-none" />
        )}

        <div className="space-y-2 text-center md:text-left z-10">
          <div
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
              allStepsCompleted
                ? 'bg-[#B9D8FC] text-[#0F2942] border border-blue-200/80'
                : 'bg-gray-200/80 text-gray-600'
            }`}
          >
            {allStepsCompleted ? (
              <>
                <StarYellowIcon size={15} /> Jsi připraven?
              </>
            ) : (
              <>
                <Lock size={13} /> Splněno {completedSteps.length} z {steps.length} kroků
              </>
            )}
          </div>
          <h3 className="text-2xl sm:text-3xl font-display font-black tracking-tight text-[#0F2942]">
            {allStepsCompleted ? 'Máš látku nastudovanou?' : 'Nejprve dokonči všechny kroky studia'}
          </h3>
          <p className="text-gray-600 font-medium text-sm sm:text-base max-w-xl">
            {allStepsCompleted
              ? 'Vyzkoušej si interaktivní procvičování a ověř si, zda látku ovládáš na 100 %.'
              : 'Odpověz správně na kontrolní otázky v jednotlivých krocích výkladu, abys odemkl závěrečný přechod k procvičování.'}
          </p>
        </div>

        <Button
          onClick={() => allStepsCompleted && navigate(`/practice/session/${subtopic.id}`)}
          disabled={!allStepsCompleted}
          className={`rounded-2xl font-black text-base px-8 h-14 shadow-xs shrink-0 flex items-center gap-3 z-10 transition-all ${
            allStepsCompleted
              ? 'bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] border border-blue-200/80 hover:scale-105 cursor-pointer'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed opacity-75'
          }`}
        >
          {allStepsCompleted ? (
            <>
              <Play size={20} className="fill-[#0F2942] text-[#0F2942]" />
              <span>Spustit procvičování</span>
            </>
          ) : (
            <>
              <Lock size={18} />
              <span>Odemkne se po splnění kroků</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
