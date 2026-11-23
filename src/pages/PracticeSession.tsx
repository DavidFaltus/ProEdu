import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, RotateCcw, 
  ArrowRight, ChevronLeft, ChevronRight, Send, Bookmark, Clock, Eye
} from 'lucide-react';
import {
  BookCyanIcon,
  StarPinkIcon,
  HeartPinkIcon,
  CorrectCyanIcon,
  WrongPinkIcon,
  BulbYellowIcon,
  DialogCyanIcon,
  BubbleYellowIcon,
  JokerBlueIcon,
} from '../components/common/CustomIcon';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription 
} from '../components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { 
  fetchPracticeCatalog, fetchSubtopicQuestions, checkPracticeAnswerApi,
  revealPracticeSolutionApi, finishPracticeSessionApi, sampleQuestionsForPractice,
  saveActivePracticeSession, getActivePracticeSession, deleteActivePracticeSession,
  getActivePracticeStorageKey
} from '../services/practiceService';
import { submitInquiry } from '../services/inquiryService';
import { sanitizeSvg } from '../utils/svgUtils';
import { cn } from '../lib/utils';
import { PracticeSubtopic, PracticeQuestion, ActivePracticeSession } from '../types';
import { MathRenderer } from '../components/common/MathRenderer';
import { evaluateStudentAnswer } from '../utils/mathEvaluator';
import RewardedAdModal from '../components/common/RewardedAdModal';
import MandatorySetPromoModal from '../components/common/MandatorySetPromoModal';
import UnifiedPaywallModal from '../components/common/UnifiedPaywallModal';
import { 
  recordGuestVideo, 
  recordGuestCompletedSubtopic, 
  getGuestState, 
  GUEST_MAX_VIDEOS 
} from '../services/jokerService';
import { 
  trackPracticeStart, 
  trackPracticeAnswer, 
  trackPracticeComplete,
  trackPracticeHintUsed,
  trackPracticeSolutionRevealed,
  trackPracticeAbandon,
  trackQuestionInquirySubmit,
  setDynamicPageSeo,
  startPerfTrace
} from '../services/analyticsService';

interface QuestionAnswerState {
  userAnswer: string;
  selectedOptionIndex?: number;
  isCorrect: boolean;
  usedHint: boolean;
  isSubmitted: boolean;
  tutorFeedback?: string;
  selfScore?: number;
  selfEvaluation?: 'correct' | 'partial' | 'wrong';
  solutionRevealed?: boolean;
  correctAnswer?: string;
  explanation?: string;
  solutionImageUrl?: string | null;
  solutionSvgContent?: string | null;
}

const getSafeExternalUrl = (rawUrl?: string | null): string | null => {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl, typeof window !== 'undefined' ? window.location.origin : 'https://proedu.cz');
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
};

export default function PracticeSession() {
  const { subtopicId } = useParams<{ subtopicId: string }>();
  const authCtx = useAuth();
  const { 
    user, 
    profile, 
    isPremium, 
    isCourseUser,
    isTeacher,
    jokers, 
    claimVideoReward, 
    openAuthModal 
  } = authCtx;
  const refreshProfile = (authCtx as { refreshProfile?: () => Promise<void> }).refreshProfile;
  const navigate = useNavigate();

  const [subtopic, setSubtopic] = useState<PracticeSubtopic | null>(null);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGuestDemoBlocked, setIsGuestDemoBlocked] = useState(false);
  const [isGuestLimitReached, setIsGuestLimitReached] = useState(false);
  const [guestRemaining, setGuestRemaining] = useState<number | null>(null);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);

  // Stavy pro video a paywall
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isMandatoryPromoOpen, setIsMandatoryPromoOpen] = useState(false);
  const [isPremiumFeatureModalOpen, setIsPremiumFeatureModalOpen] = useState(false);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);

  // Kontrola limitu žolíků a videí pro dnešní den
  const isGuest = !user;
  const hasUnlimitedAccess = isPremium || isCourseUser || isTeacher;
  const videosWatchedToday = isGuest ? getGuestState().videosWatched : (profile?.dailyVideosWatched || 0);
  const isVideoLimitReached = videosWatchedToday >= 3;
  const isOutOfJokersAndVideos = !hasUnlimitedAccess && jokers <= 0 && isVideoLimitReached;

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

  // Bookmarked / marked questions for later review
  const [bookmarkedSet, setBookmarkedSet] = useState<Set<number>>(new Set());

  // Active practice session state
  const [pendingResumeSession, setPendingResumeSession] = useState<ActivePracticeSession | null>(null);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const allSubtopicQuestionsRef = useRef<PracticeQuestion[]>([]);
  const debouncedInputSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string>(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );

  // Slider scrolling refs
  const sliderScrollRef = useRef<HTMLDivElement>(null);
  const sliderButtonRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  const [isCompleted, setIsCompleted] = useState(false);
  const sessionStartTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    async function loadData() {
      if (!subtopicId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setIsGuestDemoBlocked(false);
      setIsGuestLimitReached(false);
      setIsCompleted(false);
      setPendingResumeSession(null);
      setIsResumeModalOpen(false);
      setAnswersMap({});
      setOpenInputs({});
      setShowHintMap({});
      setBookmarkedSet(new Set());
      setCurrentIndex(0);

      const perfTrace = startPerfTrace('practice_questions_load', {
        subtopic_id: subtopicId,
      });

      try {
        const catalog = await fetchPracticeCatalog({ includeHidden: isTeacher });
        const subData = catalog.subtopics.find(s => s.id === subtopicId) || null;
        setSubtopic(subData);

        if (!user && (!catalog.firstDemoSubtopicId || subtopicId !== catalog.firstDemoSubtopicId)) {
          perfTrace.stop({ status: 'guest_demo_blocked' });
          setIsGuestDemoBlocked(true);
          setQuestions([]);
          return;
        }

        const [qRes, activeSession] = await Promise.all([
          fetchSubtopicQuestions(subtopicId),
          getActivePracticeSession(subtopicId, user?.uid || 'guest')
        ]);
        perfTrace.stop(
          {
            status: 'ok',
            subject: subData?.subjectId || 'unknown',
          },
          {
            questions_loaded: Array.isArray(qRes.questions) ? qRes.questions.length : 0,
          }
        );

        if (typeof qRes.guestRemaining === 'number') {
          setGuestRemaining(qRes.guestRemaining);
        }

        const qData = qRes.questions;
        allSubtopicQuestionsRef.current = qData;

        // Check if there is an active session to resume
        const hasSubmittedInSession = Boolean(
          activeSession?.answersMap &&
          Object.values(activeSession.answersMap).some(a => a.isSubmitted)
        );
        const hasInputsInSession = Boolean(
          activeSession?.openInputs &&
          Object.keys(activeSession.openInputs).length > 0
        );
        const hasValidSession = Boolean(
          activeSession &&
          activeSession.questionIds &&
          activeSession.questionIds.length > 0 &&
          (hasSubmittedInSession || activeSession.answeredCount > 0 || hasInputsInSession)
        );

        if (hasValidSession && activeSession) {
          const qMap = new Map(qData.map(q => [q.id, q]));
          const restoredQuestions = activeSession.questionIds
            .map(id => qMap.get(id))
            .filter((q): q is PracticeQuestion => Boolean(q));

          if (restoredQuestions.length > 0) {
            setPendingResumeSession(activeSession);
            setIsResumeModalOpen(true);
            setQuestions(restoredQuestions);
            sessionStartTimeRef.current = Date.now();
            return;
          }
        }

        const sampled = sampleQuestionsForPractice(qData, subData?.practiceConfig);
        setQuestions(sampled);
        sessionStartTimeRef.current = Date.now();

        if (subData) {
          setDynamicPageSeo({
            pagePath: `/practice/session/${subData.id}`,
            pageTitle: `Procvičování: ${subData.title} (${subData.subjectId}) | ProEdu`,
            indexable: false,
          });
          trackPracticeStart({
            subtopicId: subData.id,
            subtopicTitle: subData.title,
            subject: subData.subjectId,
            questionCount: sampled.length,
          });
        }
      } catch (err: any) {
        perfTrace.stop({ status: 'error', error_code: String(err?.code || err?.status || 'unknown') });
        if (err?.code === 'GUEST_LIMIT_REACHED' || err?.status === 429) {
          setIsGuestLimitReached(true);
        } else if (err?.code === 'DEMO_RESTRICTED' || err?.status === 401 || err?.status === 403) {
          setIsGuestDemoBlocked(true);
        } else {
          console.error('Failed to load practice questions:', err);
        }
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [subtopicId, user?.uid, isTeacher]);

  // Pokud student vstoupí do procvičování s 0 žolíky a vyčerpaným limitem videí, nepouštíme ho dovnitř a přesměrujeme na hlavní stránku
  useEffect(() => {
    if (!loading && isOutOfJokersAndVideos) {
      navigate('/', { replace: true, state: { showDailyLimitModal: true } });
    }
  }, [loading, isOutOfJokersAndVideos, navigate]);

  // Auto-scroll slider when currentIndex changes
  useEffect(() => {
    sliderButtonRefs.current[currentIndex]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center'
    });
  }, [currentIndex]);

  // Synchronous / debounced state persistence
  const persistSession = (
    currentAnswers: Record<number, QuestionAnswerState>,
    currentOpenInputs: Record<number, string>,
    currentHintMap: Record<number, boolean>,
    currentBookmarks: Set<number>,
    targetIndex: number,
    currentQuestions: PracticeQuestion[] = questions
  ) => {
    if (!subtopic || currentQuestions.length === 0 || isCompleted) return;

    const answeredCount = Object.values(currentAnswers).filter(a => a.isSubmitted).length;
    const hasTypedSomething = Object.values(currentOpenInputs).some(t => Boolean(t && t.trim()));
    if (answeredCount === 0 && !hasTypedSomething) return;

    const serializedAnswers: Record<string, any> = {};
    for (const [k, v] of Object.entries(currentAnswers)) {
      serializedAnswers[k] = {
        userAnswer: v.userAnswer,
        ...(typeof v.selectedOptionIndex === 'number' ? { selectedOptionIndex: v.selectedOptionIndex } : {}),
        isCorrect: Boolean(v.isCorrect),
        usedHint: Boolean(v.usedHint),
        isSubmitted: Boolean(v.isSubmitted),
        ...(v.tutorFeedback ? { tutorFeedback: v.tutorFeedback } : {}),
        ...(typeof v.selfScore === 'number' ? { selfScore: v.selfScore } : {}),
        ...(v.selfEvaluation ? { selfEvaluation: v.selfEvaluation } : {}),
        ...(v.solutionRevealed ? { solutionRevealed: true } : {})
      };
    }

    const serializedInputs: Record<string, string> = {};
    for (const [k, v] of Object.entries(currentOpenInputs)) {
      if (v && v.trim()) {
        serializedInputs[k] = v;
      }
    }

    const serializedHints: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(currentHintMap)) {
      if (v) {
        serializedHints[k] = true;
      }
    }

    const payload: ActivePracticeSession = {
      studentId: user?.uid || 'guest',
      subtopicId: subtopic.id,
      topicId: subtopic.topicId || '',
      subjectId: subtopic.subjectId || '',
      questionIds: currentQuestions.map(q => q.id),
      currentIndex: targetIndex,
      answersMap: serializedAnswers,
      openInputs: serializedInputs,
      showHintMap: serializedHints,
      bookmarkedIndices: Array.from(currentBookmarks),
      answeredCount,
      totalCount: currentQuestions.length,
      updatedAt: new Date()
    };

    saveActivePracticeSession(payload).catch(err => {
      console.warn('Failed to save active practice session:', err);
    });
  };

  const navigateToQuestion = (targetIdx: number) => {
    setCurrentIndex(targetIdx);
    persistSession(answersMap, openInputs, showHintMap, bookmarkedSet, targetIdx);
  };

  const handleOpenInputChange = (val: string) => {
    const nextInputs = { ...openInputs, [currentIndex]: val };
    setOpenInputs(nextInputs);

    if (debouncedInputSaveTimeoutRef.current) {
      clearTimeout(debouncedInputSaveTimeoutRef.current);
    }
    debouncedInputSaveTimeoutRef.current = setTimeout(() => {
      persistSession(answersMap, nextInputs, showHintMap, bookmarkedSet, currentIndex);
    }, 1000);
  };

  const handleAcceptResume = () => {
    if (!pendingResumeSession) return;
    const qMap = new Map(allSubtopicQuestionsRef.current.map(q => [q.id, q]));
    const restoredQuestions = pendingResumeSession.questionIds
      .map(id => qMap.get(id))
      .filter((q): q is PracticeQuestion => Boolean(q));

    const finalQuestions = restoredQuestions.length > 0
      ? restoredQuestions
      : sampleQuestionsForPractice(allSubtopicQuestionsRef.current, subtopic?.practiceConfig);

    setQuestions(finalQuestions);

    // Přemapujeme původní indexy podle questionId, aby nedošlo k posunu odpovědí při změně sady otázek
    const newIndexByQuestionId = new Map<string, number>();
    finalQuestions.forEach((q, idx) => newIndexByQuestionId.set(q.id, idx));

    const resolveNewIndex = (rawKey: string | number): number | undefined => {
      if (typeof rawKey === 'string' && newIndexByQuestionId.has(rawKey)) {
        return newIndexByQuestionId.get(rawKey);
      }
      const oldIdx = Number(rawKey);
      if (!Number.isNaN(oldIdx) && oldIdx >= 0 && oldIdx < pendingResumeSession.questionIds.length) {
        const qId = pendingResumeSession.questionIds[oldIdx];
        return newIndexByQuestionId.get(qId);
      }
      return undefined;
    };

    const restoredAnswers: Record<number, QuestionAnswerState> = {};
    if (pendingResumeSession.answersMap) {
      for (const [k, v] of Object.entries(pendingResumeSession.answersMap)) {
        const newIdx = resolveNewIndex(k);
        if (newIdx !== undefined) {
          restoredAnswers[newIdx] = v;
        }
      }
    }
    setAnswersMap(restoredAnswers);

    const restoredInputs: Record<number, string> = {};
    if (pendingResumeSession.openInputs) {
      for (const [k, v] of Object.entries(pendingResumeSession.openInputs)) {
        const newIdx = resolveNewIndex(k);
        if (newIdx !== undefined) {
          restoredInputs[newIdx] = v;
        }
      }
    }
    setOpenInputs(restoredInputs);

    const restoredHints: Record<number, boolean> = {};
    if (pendingResumeSession.showHintMap) {
      for (const [k, v] of Object.entries(pendingResumeSession.showHintMap)) {
        const newIdx = resolveNewIndex(k);
        if (newIdx !== undefined) {
          restoredHints[newIdx] = v;
        }
      }
    }
    setShowHintMap(restoredHints);

    if (Array.isArray(pendingResumeSession.bookmarkedIndices)) {
      const remappedBookmarks = new Set<number>();
      pendingResumeSession.bookmarkedIndices.forEach(oldIdx => {
        const newIdx = resolveNewIndex(oldIdx);
        if (newIdx !== undefined) remappedBookmarks.add(newIdx);
      });
      setBookmarkedSet(remappedBookmarks);
    }

    const remappedCurrentIdx = resolveNewIndex(pendingResumeSession.currentIndex || 0);
    const targetIndex = remappedCurrentIdx !== undefined
      ? remappedCurrentIdx
      : 0;
    setCurrentIndex(targetIndex);

    setIsResumeModalOpen(false);
    toast.success('Procvičování obnoveno z uloženého stavu.');
  };

  const handleRejectResumeAndRestart = async () => {
    if (subtopicId) {
      await deleteActivePracticeSession(subtopicId, user?.uid || 'guest');
    }
    const sampled = sampleQuestionsForPractice(allSubtopicQuestionsRef.current, subtopic?.practiceConfig);
    setQuestions(sampled);
    setCurrentIndex(0);
    setAnswersMap({});
    setOpenInputs({});
    setShowHintMap({});
    setBookmarkedSet(new Set());
    setIsCompleted(false);
    setIsMandatoryPromoOpen(false);
    sessionStartTimeRef.current = Date.now();
    setPendingResumeSession(null);
    setIsResumeModalOpen(false);
    toast.info('Procvičování bylo spuštěno od začátku.');
  };

  // Synchronous localStorage backup on tab close (scoped strictly by uid/'guest')
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!subtopic || questions.length === 0 || isCompleted) return;
      const answeredCount = Object.values(answersMap).filter(a => a.isSubmitted).length;
      if (answeredCount === 0) return;

      const serializedAnswers: Record<string, any> = {};
      for (const [k, v] of Object.entries(answersMap)) {
        serializedAnswers[k] = {
          userAnswer: v.userAnswer,
          ...(typeof v.selectedOptionIndex === 'number' ? { selectedOptionIndex: v.selectedOptionIndex } : {}),
          isCorrect: Boolean(v.isCorrect),
          usedHint: Boolean(v.usedHint),
          isSubmitted: Boolean(v.isSubmitted),
          ...(v.tutorFeedback ? { tutorFeedback: v.tutorFeedback } : {}),
          ...(typeof v.selfScore === 'number' ? { selfScore: v.selfScore } : {}),
          ...(v.selfEvaluation ? { selfEvaluation: v.selfEvaluation } : {}),
          ...(v.solutionRevealed ? { solutionRevealed: true } : {})
        };
      }
      const ownerId = user?.uid || 'guest';
      const storageKey = getActivePracticeStorageKey(ownerId, subtopic.id);
      try {
        localStorage.setItem(storageKey, JSON.stringify({
          studentId: ownerId,
          subtopicId: subtopic.id,
          topicId: subtopic.topicId || '',
          subjectId: subtopic.subjectId || '',
          questionIds: questions.map(q => q.id),
          currentIndex,
          answersMap: serializedAnswers,
          openInputs,
          showHintMap,
          bookmarkedIndices: Array.from(bookmarkedSet),
          answeredCount,
          totalCount: questions.length,
          updatedAt: new Date().toISOString()
        }));
      } catch {
        // ignore
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [subtopic, questions, isCompleted, answersMap, openInputs, showHintMap, bookmarkedSet, currentIndex, user?.uid]);

  const currentQuestion = questions[currentIndex];
  const currentAnswer = answersMap[currentIndex];
  const isAnswerSubmitted = !!currentAnswer?.isSubmitted;
  const isHintOpen = !!showHintMap[currentIndex];

  // U Češtiny nerozlišujeme velká a malá písmena plošně; case-sensitivity je řízeno nastavením konkrétní otázky (caseSensitive)
  const isCzechSubject = Boolean(
    subtopic?.subjectId === 'Čeština' ||
    currentQuestion?.subjectId === 'Čeština' ||
    subtopic?.subjectId?.toLowerCase().includes('češ') ||
    currentQuestion?.subjectId?.toLowerCase().includes('češ')
  );

  const patchQuestionSolution = (
    idx: number,
    res: {
      correctAnswer?: string;
      explanation?: string;
      solutionImageUrl?: string | null;
      solutionSvgContent?: string | null;
    }
  ) => {
    setQuestions(prev =>
      prev.map((q, qIdx) =>
        qIdx === idx
          ? {
              ...q,
              correctAnswer: res.correctAnswer ?? q.correctAnswer,
              explanation: res.explanation ?? q.explanation,
              solutionImageUrl: res.solutionImageUrl ?? q.solutionImageUrl,
              solutionSvgContent: res.solutionSvgContent ?? q.solutionSvgContent,
            }
          : q
      )
    );
  };

  const handleServerCheckError = (err: any): boolean => {
    if (err?.code === 'GUEST_LIMIT_REACHED' || err?.status === 429) {
      setIsGuestLimitReached(true);
      toast.info('Vyčerpal jsi limit demo pokusů pro hosta. Přihlas se zdarma a získej 10 žolíků denně!');
      return true;
    }
    if (err?.code === 'NO_JOKERS') {
      if (isVideoLimitReached) {
        navigate('/', { replace: true, state: { showDailyLimitModal: true } });
      } else {
        toast.error('Došly ti žolíky! Sleduj 15s video a získej +5 žolíků pro pokračování.');
        setIsVideoModalOpen(true);
      }
      refreshProfile?.().catch(() => {});
      return true;
    }
    if (err?.code === 'DEMO_RESTRICTED' || err?.status === 401 || err?.status === 403) {
      setIsGuestDemoBlocked(true);
      return true;
    }
    return false;
  };

  // Immediate choice selection & server-authoritative check
  const handleSelectChoice = async (option: string, optionIndex?: number) => {
    if (!currentQuestion || isAnswerSubmitted || isSubmittingAnswer) return;

    if (!hasUnlimitedAccess && user && jokers <= 0) {
      if (isVideoLimitReached) {
        navigate('/', { replace: true, state: { showDailyLimitModal: true } });
        return;
      }
      toast.error('Došly ti žolíky! Sleduj 15s video a získej +5 žolíků pro pokračování.');
      setIsVideoModalOpen(true);
      return;
    }

    setIsSubmittingAnswer(true);
    try {
      const apiRes = await checkPracticeAnswerApi({
        questionId: currentQuestion.id,
        subtopicId: subtopic?.id || subtopicId || '',
        studentAnswer: option,
        sessionId: sessionIdRef.current,
      });

      if (typeof apiRes.guestRemaining === 'number') {
        setGuestRemaining(apiRes.guestRemaining);
      }
      patchQuestionSolution(currentIndex, apiRes);

      const usedHint = !!showHintMap[currentIndex];
      trackPracticeAnswer({
        subtopicId: subtopic?.id || subtopicId || '',
        questionId: currentQuestion.id,
        questionIndex: currentIndex,
        isCorrect: apiRes.isCorrect,
        usedHint,
      });

      const nextAnswers: Record<number, QuestionAnswerState> = {
        ...answersMap,
        [currentIndex]: {
          userAnswer: option,
          selectedOptionIndex: optionIndex,
          isCorrect: apiRes.isCorrect,
          usedHint,
          isSubmitted: true,
          tutorFeedback: apiRes.tutorFeedback,
          correctAnswer: apiRes.correctAnswer,
          explanation: apiRes.explanation,
          solutionImageUrl: apiRes.solutionImageUrl,
          solutionSvgContent: apiRes.solutionSvgContent,
        },
      };
      setAnswersMap(nextAnswers);

      const nextBookmarks = new Set(bookmarkedSet);
      if (nextBookmarks.has(currentIndex)) {
        nextBookmarks.delete(currentIndex);
        setBookmarkedSet(nextBookmarks);
      }

      persistSession(nextAnswers, openInputs, showHintMap, nextBookmarks, currentIndex);

      if (!hasUnlimitedAccess && user) {
        await refreshProfile?.();
      }
    } catch (err: any) {
      if (!handleServerCheckError(err)) {
        toast.error(err?.message || 'Nepodařilo se vyhodnotit odpověď.');
      }
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  // Open-ended answer submission via server
  const handleCheckOpenAnswer = async () => {
    if (!currentQuestion || isAnswerSubmitted || isSubmittingAnswer) return;

    const answer = (openInputs[currentIndex] || '').trim();
    if (!answer) return;

    if (!hasUnlimitedAccess && user && jokers <= 0) {
      if (isVideoLimitReached) {
        navigate('/', { replace: true, state: { showDailyLimitModal: true } });
        return;
      }
      toast.error('Došly ti žolíky! Sleduj 15s video a získej +5 žolíků pro pokračování.');
      setIsVideoModalOpen(true);
      return;
    }

    setIsSubmittingAnswer(true);
    try {
      const apiRes = await checkPracticeAnswerApi({
        questionId: currentQuestion.id,
        subtopicId: subtopic?.id || subtopicId || '',
        studentAnswer: answer,
        sessionId: sessionIdRef.current,
      });

      if (typeof apiRes.guestRemaining === 'number') {
        setGuestRemaining(apiRes.guestRemaining);
      }
      patchQuestionSolution(currentIndex, apiRes);

      const usedHint = !!showHintMap[currentIndex];
      trackPracticeAnswer({
        subtopicId: subtopic?.id || subtopicId || '',
        questionId: currentQuestion.id,
        questionIndex: currentIndex,
        isCorrect: apiRes.isCorrect,
        usedHint,
      });

      const nextAnswers: Record<number, QuestionAnswerState> = {
        ...answersMap,
        [currentIndex]: {
          userAnswer: answer,
          isCorrect: apiRes.isCorrect,
          usedHint,
          isSubmitted: true,
          tutorFeedback: apiRes.tutorFeedback,
          correctAnswer: apiRes.correctAnswer,
          explanation: apiRes.explanation,
          solutionImageUrl: apiRes.solutionImageUrl,
          solutionSvgContent: apiRes.solutionSvgContent,
        },
      };
      setAnswersMap(nextAnswers);

      const nextBookmarks = new Set(bookmarkedSet);
      if (nextBookmarks.has(currentIndex)) {
        nextBookmarks.delete(currentIndex);
        setBookmarkedSet(nextBookmarks);
      }

      persistSession(nextAnswers, openInputs, showHintMap, nextBookmarks, currentIndex);

      if (!hasUnlimitedAccess && user) {
        await refreshProfile?.();
      }
    } catch (err: any) {
      if (!handleServerCheckError(err)) {
        toast.error(err?.message || 'Nepodařilo se vyhodnotit odpověď.');
      }
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  // Self-check solution reveal via server (neuděluje body ani nedokončuje todo!)
  const handleRevealSolution = async () => {
    if (!currentQuestion || isSubmittingAnswer) return;

    if (!hasUnlimitedAccess && user && jokers <= 0) {
      if (isVideoLimitReached) {
        navigate('/', { replace: true, state: { showDailyLimitModal: true } });
        return;
      }
      toast.error('Došly ti žolíky! Sleduj 15s video a získej +5 žolíků pro pokračování.');
      setIsVideoModalOpen(true);
      return;
    }

    setIsSubmittingAnswer(true);
    try {
      const apiRes = await revealPracticeSolutionApi({
        questionId: currentQuestion.id,
        subtopicId: subtopic?.id || subtopicId || '',
        sessionId: sessionIdRef.current,
      });

      if (typeof apiRes.guestRemaining === 'number') {
        setGuestRemaining(apiRes.guestRemaining);
      }
      patchQuestionSolution(currentIndex, apiRes);

      const currentAns = answersMap[currentIndex] || {
        userAnswer: '',
        isCorrect: false,
        usedHint: false,
        isSubmitted: false
      };

      const nextAnswers: Record<number, QuestionAnswerState> = {
        ...answersMap,
        [currentIndex]: {
          ...currentAns,
          solutionRevealed: true,
          correctAnswer: apiRes.correctAnswer,
          explanation: apiRes.explanation,
          solutionImageUrl: apiRes.solutionImageUrl,
          solutionSvgContent: apiRes.solutionSvgContent,
        }
      };
      setAnswersMap(nextAnswers);
      persistSession(nextAnswers, openInputs, showHintMap, bookmarkedSet, currentIndex);
      trackPracticeSolutionRevealed({
        subtopicId: subtopic?.id || subtopicId || '',
        questionId: currentQuestion?.id,
        questionIndex: currentIndex,
      });

      if (!hasUnlimitedAccess && user) {
        await refreshProfile?.();
      }
    } catch (err: any) {
      if (!handleServerCheckError(err)) {
        toast.error(err?.message || 'Nepodařilo se zobrazit vzorové řešení.');
      }
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  // Self-check evaluation (Správně = 1, Částečně = 0.5, Špatně = 0)
  const handleSelfCheckAnswer = (evalType: 'correct' | 'partial' | 'wrong', score: number) => {
    if (!currentQuestion || isAnswerSubmitted) return;

    const usedHint = !!showHintMap[currentIndex];
    const isCorrect = score > 0;
    const label = evalType === 'correct' ? 'Správně' : evalType === 'partial' ? 'Částečně správně' : 'Špatně';

    trackPracticeAnswer({
      subtopicId: subtopic?.id || subtopicId || '',
      questionId: currentQuestion.id,
      questionIndex: currentIndex,
      isCorrect: score === 1,
      usedHint,
    });

    const existing = answersMap[currentIndex];
    const nextAnswers: Record<number, QuestionAnswerState> = {
      ...answersMap,
      [currentIndex]: {
        ...(existing || {}),
        userAnswer: label,
        isCorrect,
        usedHint,
        isSubmitted: true,
        selfScore: score,
        selfEvaluation: evalType,
        solutionRevealed: true,
        tutorFeedback: currentQuestion.explanation || existing?.explanation || undefined
      }
    };
    setAnswersMap(nextAnswers);

    const nextBookmarks = new Set(bookmarkedSet);
    if (nextBookmarks.has(currentIndex)) {
      nextBookmarks.delete(currentIndex);
      setBookmarkedSet(nextBookmarks);
    }

    persistSession(nextAnswers, openInputs, showHintMap, nextBookmarks, currentIndex);
  };

  // Toggle hint

  const handleToggleHint = () => {
    const willOpen = !showHintMap[currentIndex];
    if (willOpen) {
      trackPracticeHintUsed({
        subtopicId: subtopic?.id || subtopicId || '',
        questionId: currentQuestion?.id,
        questionIndex: currentIndex,
      });
    }
    setShowHintMap(prev => ({ ...prev, [currentIndex]: willOpen }));
  };

  // Sledování předčasného opuštění procvičování (practice_session_abandon)
  const abandonStateRef = useRef({
    isCompleted: false,
    subtopicId: '',
    subtopicTitle: '',
    subject: '',
    answeredCount: 0,
    totalQuestions: 0,
    currentIndex: 0,
  });
  useEffect(() => {
    const answeredCount = Object.values(answersMap).filter(a => a?.isSubmitted).length;
    abandonStateRef.current = {
      isCompleted,
      subtopicId: subtopic?.id || subtopicId || '',
      subtopicTitle: subtopic?.title || '',
      subject: subtopic?.subjectId || '',
      answeredCount,
      totalQuestions: questions.length,
      currentIndex,
    };
  }, [isCompleted, subtopic, subtopicId, answersMap, questions.length, currentIndex]);

  useEffect(() => {
    return () => {
      const st = abandonStateRef.current;
      if (!st.isCompleted && st.totalQuestions > 0 && st.answeredCount < st.totalQuestions) {
        const durationSeconds = Math.max(0, Math.round((Date.now() - sessionStartTimeRef.current) / 1000));
        if (durationSeconds >= 3 || st.answeredCount > 0) {
          trackPracticeAbandon({
            subtopicId: st.subtopicId,
            subtopicTitle: st.subtopicTitle,
            subject: st.subject,
            answeredCount: st.answeredCount,
            totalQuestions: st.totalQuestions,
            currentQuestionIndex: st.currentIndex,
            durationSeconds,
          });
        }
      }
    };
  }, []);

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
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      persistSession(answersMap, openInputs, showHintMap, bookmarkedSet, nextIdx);
    } else {
      handleFinishPractice();
    }
  };

  // Final finish and server-authoritative score submission
  const handleFinishPractice = async () => {
    setIsCompleted(true);

    // Pro bezplatné uživatele zobrazíme po dokončení sady 5s povinné promo okno na Premium
    if (!hasUnlimitedAccess) {
      setIsMandatoryPromoOpen(true);
    }

    if (subtopic?.id) {
      deleteActivePracticeSession(subtopic.id, user?.uid || 'guest').catch(err => {
        console.warn('Failed to delete active practice session upon completion:', err);
      });
    }

    const submittedEntries = questions
      .map((q, idx) => ({ q, ans: answersMap[idx] }))
      .filter((item): item is { q: PracticeQuestion; ans: QuestionAnswerState } => Boolean(item.ans?.isSubmitted));

    const earnedScore = submittedEntries.reduce((acc, { ans }) => {
      if (typeof ans.selfScore === 'number') return acc + ans.selfScore;
      return acc + (ans.isCorrect ? 1 : 0);
    }, 0);
    const total = questions.length;
    const percentage = total > 0 ? Math.round((earnedScore / total) * 100) : 0;
    const durationSeconds = Math.round((Date.now() - sessionStartTimeRef.current) / 1000);

    trackPracticeComplete({
      subtopicId: subtopic?.id || subtopicId || '',
      subtopicTitle: subtopic?.title || '',
      subject: subtopic?.subjectId || '',
      totalQuestions: total,
      correctCount: earnedScore,
      scorePercentage: percentage,
      durationSeconds,
    });

    if (!user && subtopic && submittedEntries.length > 0) {
      recordGuestCompletedSubtopic(subtopic.id);
    }

    if (user && subtopic && submittedEntries.length > 0) {
      try {
        await finishPracticeSessionApi({
          subtopicId: subtopic.id,
          topicId: subtopic.topicId,
          subjectId: subtopic.subjectId,
          sessionId: sessionIdRef.current,
          answers: submittedEntries.map(({ q, ans }) => ({
            questionId: q.id,
            userAnswer: ans.userAnswer,
            isCorrect: Boolean(ans.isCorrect),
            usedHint: Boolean(ans.usedHint),
            ...(ans.selfEvaluation ? { selfCheckStatus: ans.selfEvaluation } : {}),
            ...(typeof ans.selfScore === 'number' ? { selfScore: ans.selfScore } : {}),
          })),
          durationSeconds,
        });
        await refreshProfile?.();
      } catch (err) {
        console.error('Failed to finish practice attempt:', err);
      }
    }
  };

  const handleRestart = async () => {
    if (isOutOfJokersAndVideos) {
      navigate('/', { replace: true, state: { showDailyLimitModal: true } });
      return;
    }
    if (subtopicId) {
      await deleteActivePracticeSession(subtopicId, user?.uid || 'guest');
    }
    const sampled = sampleQuestionsForPractice(allSubtopicQuestionsRef.current, subtopic?.practiceConfig);
    setQuestions(sampled);
    setCurrentIndex(0);
    setAnswersMap({});
    setOpenInputs({});
    setShowHintMap({});
    setBookmarkedSet(new Set());
    setIsCompleted(false);
    setIsMandatoryPromoOpen(false);
    sessionStartTimeRef.current = Date.now();
    setPendingResumeSession(null);
    toast.info('Procvičování bylo spuštěno od začátku.');
  };

  const handleToggleBookmark = () => {
    setBookmarkedSet(prev => {
      const next = new Set(prev);
      if (next.has(currentIndex)) {
        next.delete(currentIndex);
      } else {
        next.add(currentIndex);
      }
      persistSession(answersMap, openInputs, showHintMap, next, currentIndex);
      return next;
    });
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
        studentName: profile?.name || user.displayName || (isTeacher ? 'Učitel' : 'Student'),
        questionId: currentQuestion?.id || 'question',
        questionText: currentQuestion?.question || '',
        topic: subtopic?.title || 'Procvičování',
        comment,
        senderRole: isTeacher ? 'teacher' : 'student',
      });
      trackQuestionInquirySubmit({
        subtopicTitle: subtopic?.title || 'Procvičování',
        questionId: currentQuestion?.id || 'question',
        source: 'practice',
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

  if (isGuestDemoBlocked || isGuestLimitReached) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto text-3xl shadow-xs">
          🔒
        </div>
        <h2 className="text-3xl font-display font-black text-[#1E1B18]">
          {isGuestLimitReached
            ? 'Vyčerpal/a jsi limit ukázkových pokusů'
            : 'Toto cvičení je dostupné po přihlášení'}
        </h2>
        <p className="text-gray-600 font-medium text-sm sm:text-base max-w-lg mx-auto">
          {isGuestLimitReached
            ? 'Jako host si můžeš vyzkoušet až 5 úloh z ukázkového tématu. Zaregistruj se zdarma a získej 10 žolíků každý den!'
            : 'Neregistrovaní hosté si mohou vyzkoušet pouze první ukázkové podtéma. Zaregistruj se zdarma a odemkni všechna procvičování.'}
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Button
            onClick={openAuthModal}
            className="rounded-xl bg-[#1E1B18] text-white font-black px-6 h-11 cursor-pointer"
          >
            Přihlásit se / Registrovat zdarma
          </Button>
          <Link to="/practice">
            <Button variant="outline" className="rounded-xl font-bold h-11 px-5 cursor-pointer">
              Zpět na výběr témat
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-2xl">
          <BookCyanIcon size={32} />
        </div>
        <h2 className="text-3xl font-display font-black text-[#1E1B18]">Zatím žádné otázky</h2>
        <p className="text-gray-500">
          Pro téma "{subtopic?.title || 'Zvolené téma'}" zatím nebyly v administraci vloženy otázky k procvičování.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          {hasUnlimitedAccess && (subtopic?.hasStudyMaterial || subtopic?.hasStudyContent) && (
            <Link to={`/study/${subtopic.id}`}>
              <Button className="rounded-xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black border border-blue-200/80 cursor-pointer shadow-xs">
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
    const submittedList = Object.values(answersMap).filter(r => r.isSubmitted);
    const earnedScore = submittedList.reduce((acc, r) => {
      if (typeof r.selfScore === 'number') return acc + r.selfScore;
      return acc + (r.isCorrect ? 1 : 0);
    }, 0);
    const formattedScore = Number.isInteger(earnedScore) ? String(earnedScore) : earnedScore.toFixed(1).replace('.', ',');
    const totalCount = questions.length;
    const percentage = totalCount > 0 ? Math.round((earnedScore / totalCount) * 100) : 0;

    return (
      <div className="max-w-4xl mx-auto space-y-8 py-6 px-4">
        {/* Results Card */}

        <div className="bg-white rounded-[2.5rem] p-8 sm:p-12 text-center shadow-xl border border-gray-100 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-100/30 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

          <div className="w-20 h-20 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-3xl shadow-inner">
            {percentage >= 50 ? <StarPinkIcon size={42} /> : <HeartPinkIcon size={42} />}
          </div>

          <div className="space-y-2">
            <span className="text-xs font-black uppercase tracking-wider px-3 py-1 rounded-full bg-amber-100 text-amber-900">
              Výsledek procvičování
            </span>
            <h2 className="text-2xl sm:text-3xl font-sans font-black text-[#1E1B18]">
              {percentage >= 80 ? 'Skvělá práce!' : percentage >= 50 ? 'Dobrá práce!' : 'Trénink dělá mistra!'}
            </h2>
            <p className="text-gray-500 font-medium text-base">
              Úspěšně jsi dokončil procvičování pro téma "{subtopic?.title}".
            </p>
          </div>

          {/* Score Counter */}
          <div className="inline-flex items-center justify-center gap-6 bg-[#FAF7F0] px-8 py-5 rounded-3xl border border-gray-200/60">
            <div>
              <div className="text-4xl font-display font-black text-[#1E1B18]">{formattedScore} / {totalCount}</div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-0.5">Získaných bodů</div>
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

            {hasUnlimitedAccess && (subtopic?.hasStudyMaterial || subtopic?.hasStudyContent) && (
              <Link to={`/study/${subtopic.id}`}>
                <Button
                  variant="outline"
                  className="rounded-xl font-bold h-12 px-6 flex items-center gap-2 cursor-pointer"
                >
                  <BookCyanIcon size={18} /> Zopakovat teorii
                </Button>
              </Link>
            )}

            <Link to="/practice">
              <Button
                className="rounded-xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black h-12 px-6 flex items-center gap-2 cursor-pointer shadow-xs border border-blue-200/80"
              >
                <span>Další témata</span>
                <ArrowRight size={16} />
              </Button>
            </Link>
          </div>
        </div>

        {/* Detailed Question Review */}
        <div className="space-y-4">
          <h3 className="font-sans font-black text-xl sm:text-2xl text-[#1E1B18] px-2">
            Přehled otázek a vysvětlení
          </h3>

          <div className="space-y-3">
            {questions.map((q, i) => {
              const res = answersMap[i];
              const isPartial = res?.selfEvaluation === 'partial' || res?.selfScore === 0.5;
              const isCorrect = res?.isCorrect;
              const hasAnswered = !!res?.isSubmitted;
              const resolvedCorrectAnswer = res?.correctAnswer ?? q.correctAnswer;
              const resolvedExplanation = res?.explanation ?? q.explanation;

              return (
                <div 
                  key={q.id || i} 
                  className={`p-6 rounded-3xl border bg-white shadow-sm space-y-3 transition-all ${
                    !hasAnswered
                      ? 'border-gray-200'
                      : isPartial
                      ? 'border-amber-200/80'
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
                    ) : isPartial ? (
                      <span className="flex items-center gap-1.5 text-xs font-black text-amber-800 bg-amber-50 px-3 py-1 rounded-full shrink-0">
                        Částečně (+0,5 bodu)
                      </span>
                    ) : isCorrect ? (
                      <span className="flex items-center gap-1.5 text-xs font-black text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full shrink-0">
                        <CorrectCyanIcon size={16} /> Správně {res.usedHint && '(s nápovědou)'}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-black text-rose-700 bg-rose-50 px-3 py-1 rounded-full shrink-0">
                        <WrongPinkIcon size={16} /> Chyba
                      </span>
                    )}
                  </div>

                  <div className="text-sm space-y-1.5 pl-11">
                    {hasAnswered && (!isCorrect || isPartial) && (
                      <div className="text-gray-500 flex items-center gap-1 flex-wrap">
                        <span>Tvoje odpověď:</span>
                        <span className={cn('font-bold', isPartial ? 'text-amber-700' : 'text-rose-700 line-through')}>
                          <MathRenderer content={res.userAnswer || '(nevyplněno)'} inline />
                        </span>
                      </div>
                    )}
                    {resolvedCorrectAnswer && (
                      <div className="text-gray-700 flex items-center gap-1 flex-wrap">
                        <span>Správná odpověď:</span>
                        <span className="font-black text-emerald-700">
                          <MathRenderer content={resolvedCorrectAnswer} inline />
                        </span>
                      </div>
                    )}
                    {resolvedExplanation && (
                      <div className="mt-2 p-3 bg-gray-50 rounded-xl text-xs text-gray-600 font-medium leading-relaxed">
                        <span className="font-bold text-gray-800 flex items-center gap-1.5 mb-0.5"><BulbYellowIcon size={15} /> Vysvětlení:</span>
                        <MathRenderer content={resolvedExplanation} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5s Povinné promo okno na Premium po dokončení sady otázek pro free studenty */}
        <MandatorySetPromoModal
          isOpen={isMandatoryPromoOpen}
          onFinish={() => setIsMandatoryPromoOpen(false)}
          onOpenPaywall={() => setIsPremiumFeatureModalOpen(true)}
        />

        {/* Sjednocený Paywall dialog pro Premium funkce */}
        <UnifiedPaywallModal
          isOpen={isPremiumFeatureModalOpen}
          onClose={() => setIsPremiumFeatureModalOpen(false)}
          type="premium"
          title="ProEducator Premium"
          description="Staň se jedním z prvních podporovatelů platformy, zafixuj si poloviční cenu 99 Kč/měsíc napořád a získej okamžitý přístup ke všem nástrojům bez limitu žolíků."
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // ACTIVE QUESTION SCREEN WITH HORIZONTAL QUESTION SLIDER
  // -------------------------------------------------------------
  const answeredCount = Object.values(answersMap).filter(a => a.isSubmitted).length;
  const progressPercent = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6 py-2 sm:py-6 px-0.5 sm:px-6">
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
          {!hasUnlimitedAccess && user ? (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-950 border border-amber-300/80 rounded-xl text-xs font-bold shadow-2xs select-none"
              title="Zbývající žolíky pro dnešní den"
            >
              <JokerBlueIcon size={16} />
              <span className="font-mono font-black">{jokers}</span>
              <span className="text-[11px] text-amber-800 font-semibold hidden sm:inline">žolíků</span>
            </div>
          ) : hasUnlimitedAccess ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100/80 text-amber-900 border border-amber-300/60 rounded-xl text-xs font-black select-none">
              <StarPinkIcon size={14} />
              <span>{isTeacher ? 'Učitel' : isCourseUser ? 'Kurz' : 'Premium'}</span>
            </span>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold select-none">
              <span>Host{guestRemaining !== null ? ` (${guestRemaining})` : ''}</span>
            </div>
          )}

          <div className="text-xs font-bold text-gray-500 hidden md:block">
            Otázka <span className="font-black text-[#1E1B18]">{currentIndex + 1}</span> z {questions.length}
          </div>
          <Button
            size="sm"
            onClick={handleFinishPractice}
            className="rounded-xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black text-xs h-9 px-4 cursor-pointer shadow-xs border border-blue-200/80 transition-transform hover:scale-102"
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
              const isBookmarked = bookmarkedSet.has(idx);
              
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
                } else if (ans.selfEvaluation === 'partial' || ans.selfScore === 0.5) {
                  // Partial self check evaluation: Amber
                  colorClasses = 'bg-amber-400 hover:bg-amber-500 text-amber-950 border-amber-500 font-bold';
                } else {
                  // Answered incorrectly: Red
                  colorClasses = 'bg-rose-500 hover:bg-rose-600 text-white border-rose-600';
                }
              } else if (isBookmarked) {
                // Bookmarked question not yet answered: Bright orange
                colorClasses = 'bg-orange-500 hover:bg-orange-600 text-white border-orange-600';
              } else if (isActive) {
                colorClasses = 'bg-blue-50 text-[#0F2942] border-[#B9D8FC]';
              }

              return (
                <button
                  key={idx}
                  ref={el => { sliderButtonRefs.current[idx] = el; }}
                  onClick={() => navigateToQuestion(idx)}
                  className={`w-10 h-10 sm:w-11 sm:h-11 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-center shrink-0 border transition-all cursor-pointer ${colorClasses} ${
                    isActive ? 'ring-2 ring-inset ring-[#2B44B8] shadow-sm font-black' : ''
                  }`}
                  title={isBookmarked ? `Otázka ${idx + 1} (označeno k návratu)` : `Přejít na otázku ${idx + 1}`}
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
              className="h-full bg-[#2B44B8] rounded-full transition-all duration-300"
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
            <span className="w-8 h-8 rounded-xl bg-[#B9D8FC] text-[#0F2942] border border-blue-200/80 text-xs font-black flex items-center justify-center shadow-2xs">
              {currentIndex + 1}
            </span>
            <span className="px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider bg-gray-100 text-gray-700">
              {currentQuestion.type === 'choice' ? 'Výběr z možností' : currentQuestion.type === 'self_check' ? 'Self check otázka' : 'Vepisovací otázka'}
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
            {/* Bookmark / Mark question button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleBookmark}
              className={`rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer h-9 px-3.5 transition-colors ${
                bookmarkedSet.has(currentIndex)
                  ? 'bg-orange-50 text-orange-950 border border-orange-200/80 hover:bg-orange-100 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
              title={bookmarkedSet.has(currentIndex) ? 'Zrušit označení otázky' : 'Označit otázku k návratu'}
            >
              <Bookmark
                size={15}
                className={bookmarkedSet.has(currentIndex) ? 'fill-orange-500 text-orange-500' : 'text-gray-500'}
              />
              <span>{bookmarkedSet.has(currentIndex) ? 'Označeno' : 'Označit otázku'}</span>
            </Button>

            {/* Ask Tutor button (Decision Q3 = Option A) */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!hasUnlimitedAccess) {
                  setIsPremiumFeatureModalOpen(true);
                } else {
                  setIsInquiryModalOpen(true);
                }
              }}
              className="text-amber-800 hover:text-amber-950 hover:bg-amber-50 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer h-9 px-3.5"
            >
              <DialogCyanIcon size={16} />
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
                <BulbYellowIcon size={16} />
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
                <BulbYellowIcon size={20} className="shrink-0 mt-0.5" />
                <div className="leading-relaxed flex-1">
                  <MathRenderer content={currentQuestion.hint} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Question Text */}
        <div className="py-2 relative z-10">
          <div className="text-2xl sm:text-3xl font-display font-black text-gray-900 leading-snug">
            <MathRenderer content={currentQuestion.question} />
          </div>
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
                onClick={() => {
                  const safeImgUrl = getSafeExternalUrl(currentQuestion.imageUrl);
                  if (safeImgUrl) {
                    window.open(safeImgUrl, '_blank', 'noopener,noreferrer');
                  }
                }}
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
              const isSelected =
                currentAnswer?.selectedOptionIndex !== undefined
                  ? currentAnswer.selectedOptionIndex === idx
                  : currentAnswer?.userAnswer === option;
              const resolvedCorrectAns = currentAnswer?.correctAnswer ?? currentQuestion.correctAnswer;
              const isCorrectOption = isAnswerSubmitted && resolvedCorrectAns
                ? evaluateStudentAnswer(option, resolvedCorrectAns, {
                    caseSensitive: Boolean(currentQuestion.caseSensitive)
                  }).isCorrect
                : (isAnswerSubmitted && isSelected && Boolean(currentAnswer?.isCorrect));
              
              let optionStyle = 'bg-[#FAF7F0] border-gray-200/80 hover:bg-gray-100 hover:border-gray-300 text-gray-800';

              if (isAnswerSubmitted) {
                if (isCorrectOption) {
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
                  disabled={isAnswerSubmitted || isSubmittingAnswer}
                  onClick={() => handleSelectChoice(option, idx)}
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
            {/* Quick Math Symbols Bar for mobile/desktop typing (only for Math) */}
            {!isAnswerSubmitted && !isCzechSubject && (
              <div className="flex flex-wrap items-center gap-1.5 pb-1">
                <span className="text-[11px] font-bold text-gray-400 mr-1 select-none">Rychlé symboly:</span>
                {['/', '√', '²', '³', 'π', '±', '·', ',', '-'].map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => {
                      const prevVal = openInputs[currentIndex] ?? '';
                      handleOpenInputChange(prevVal + sym);
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
                disabled={isAnswerSubmitted || isSubmittingAnswer}
                value={openInputs[currentIndex] ?? currentAnswer?.userAnswer ?? ''}
                onChange={e => handleOpenInputChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !isAnswerSubmitted && !isSubmittingAnswer && (openInputs[currentIndex] || '').trim()) {
                    handleCheckOpenAnswer();
                  }
                }}
                placeholder={
                  isCzechSubject
                    ? 'Napiš svou odpověď sem...'
                    : 'Napiš svou odpověď sem (např. 1/2 nebo 3)...'
                }
                className="h-16 rounded-2xl border-gray-300 bg-gray-50 text-base sm:text-lg font-bold px-6 focus:bg-white flex-1"
              />
              {!isAnswerSubmitted && (
                <Button
                  onClick={handleCheckOpenAnswer}
                  disabled={!(openInputs[currentIndex] || '').trim() || isSubmittingAnswer}
                  className="h-16 rounded-2xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] border border-blue-200/80 px-8 font-black text-base cursor-pointer shadow-xs shrink-0 disabled:opacity-50"
                >
                  Zkontrolovat
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Self check question UI (porovnání s papírovým rýsováním / vzorovým řešením) */}
        {currentQuestion.type === 'self_check' && (() => {
          const resolvedSolutionSvg = currentAnswer?.solutionSvgContent ?? currentQuestion.solutionSvgContent;
          const resolvedSolutionImage = getSafeExternalUrl(currentAnswer?.solutionImageUrl ?? currentQuestion.solutionImageUrl);
          const resolvedExplanation = currentAnswer?.explanation ?? currentQuestion.explanation;
          return (
          <div className="pt-2 space-y-4 relative z-10">
            {/* Instrukce pro samostatnou práci na papír */}
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/70 border border-amber-200/80 text-amber-950 space-y-1.5">
              <div className="flex items-center gap-2 font-black text-sm sm:text-base text-amber-900">
                <span className="text-xl">✏️</span>
                <span>Úloha na rýsování / samostatné řešení na papír</span>
              </div>
              <p className="text-xs sm:text-sm text-amber-800 leading-relaxed font-medium">
                Vezmi si papír, tužku a rýsovací potřeby a vyřeš úlohu podle zadání. Až budeš mít hotovo, klikni na tlačítko níže pro porovnání se vzorovým řešením.
              </p>
            </div>

            {/* Tlačítko pro odkrytí řešení */}
            {!currentAnswer?.solutionRevealed && !isAnswerSubmitted && (
              <div className="flex justify-center py-2">
                <Button
                  onClick={handleRevealSolution}
                  disabled={isSubmittingAnswer}
                  className="rounded-2xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] border border-blue-200/80 px-8 py-6 font-black text-base shadow-sm flex items-center gap-2.5 transition-transform hover:scale-102 cursor-pointer disabled:opacity-50"
                >
                  <Eye size={20} />
                  <span>Zobrazit vzorové řešení pro kontrolu</span>
                </Button>
              </div>
            )}

            {/* Odkryté vzorové řešení */}
            {(currentAnswer?.solutionRevealed || isAnswerSubmitted) && (
              <div className="space-y-4 pt-1">
                <div className="p-4 sm:p-6 rounded-2xl bg-white border-2 border-dashed border-gray-200 space-y-4">
                  <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-3">
                    <span className="text-xs sm:text-sm font-black text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                      <span>📐</span> Vzorové řešení pro kontrolu
                    </span>
                    {(resolvedSolutionImage || resolvedSolutionSvg) && (
                      <span className="text-[11px] font-bold text-gray-400">
                        Kliknutím na obrázek jej zvětšíte
                      </span>
                    )}
                  </div>

                  {/* SVG nebo obrázek řešení */}
                  {resolvedSolutionSvg ? (
                    <div 
                      className="w-full flex justify-center [&>svg]:w-full [&>svg]:max-w-xl [&>svg]:h-auto rounded-xl bg-[#FAF7F0] p-3 border border-gray-200/80 overflow-hidden"
                      dangerouslySetInnerHTML={{ __html: sanitizeSvg(resolvedSolutionSvg) }}
                    />
                  ) : resolvedSolutionImage ? (
                    <div className="flex justify-center">
                      <div 
                        className="rounded-xl overflow-hidden border border-gray-200/80 bg-[#FAF7F0] p-2 shadow-2xs max-w-full cursor-zoom-in group relative"
                        onClick={() => setLightboxImageUrl(resolvedSolutionImage)}
                        title="Kliknutím otevřít v plné velikosti"
                      >
                        <img
                          src={resolvedSolutionImage}
                          alt="Vzorové řešení"
                          className="max-h-[380px] w-auto max-w-full rounded-lg object-contain group-hover:scale-[1.01] transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center pointer-events-none">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/75 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
                            🔍 Zvětšit
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Textové vysvětlení / konstrukční postup */}
                  {resolvedExplanation && (
                    <div className="text-xs sm:text-sm font-medium leading-relaxed pt-2 text-gray-700 bg-gray-50/80 p-3.5 rounded-xl border border-gray-100">
                      <div className="font-bold text-gray-800 mb-1 flex items-center gap-1.5">
                        <BulbYellowIcon size={16} /> Postup řešení / konstrukce:
                      </div>
                      <MathRenderer content={resolvedExplanation} />
                    </div>
                  )}
                </div>

                {/* Sebehodnotící tlačítka */}
                {!isAnswerSubmitted && (
                  <div className="p-4 sm:p-5 rounded-2xl bg-[#FAF7F0] border border-gray-200/80 space-y-3">
                    <p className="text-xs sm:text-sm font-black text-gray-800 text-center">
                      Porovnej své řešení se vzorem a vyber výsledek:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => handleSelfCheckAnswer('correct', 1)}
                        className="p-4 rounded-xl bg-white hover:bg-emerald-50 border-2 border-emerald-300 hover:border-emerald-500 text-emerald-900 font-black text-sm flex flex-col items-center justify-center gap-1.5 transition-all shadow-xs hover:scale-102 cursor-pointer"
                      >
                        <span className="text-xl">✅</span>
                        <span>Mám to správně</span>
                        <span className="text-[11px] font-bold text-emerald-700">1 bod (100 %)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelfCheckAnswer('partial', 0.5)}
                        className="p-4 rounded-xl bg-white hover:bg-amber-50 border-2 border-amber-300 hover:border-amber-500 text-amber-950 font-black text-sm flex flex-col items-center justify-center gap-1.5 transition-all shadow-xs hover:scale-102 cursor-pointer"
                      >
                        <span className="text-xl">⚠️</span>
                        <span>Částečně správně</span>
                        <span className="text-[11px] font-bold text-amber-800">0,5 bodu (50 %)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSelfCheckAnswer('wrong', 0)}
                        className="p-4 rounded-xl bg-white hover:bg-rose-50 border-2 border-rose-300 hover:border-rose-500 text-rose-900 font-black text-sm flex flex-col items-center justify-center gap-1.5 transition-all shadow-xs hover:scale-102 cursor-pointer"
                      >
                        <span className="text-xl">❌</span>
                        <span>Mám to špatně</span>
                        <span className="text-[11px] font-bold text-rose-700">0 bodů (0 %)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })()}

        {/* Feedback Banner after submission */}
        {isAnswerSubmitted && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-5 rounded-2xl border space-y-2.5 ${
              currentQuestion.type === 'self_check'
                ? currentAnswer.selfEvaluation === 'correct'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : currentAnswer.selfEvaluation === 'partial'
                    ? 'bg-amber-50 border-amber-200 text-amber-950'
                    : 'bg-rose-50 border-rose-200 text-rose-950'
                : currentAnswer.isCorrect
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}
          >
            <div className="flex items-center gap-2 font-black text-base">
              {currentQuestion.type === 'self_check' ? (
                currentAnswer.selfEvaluation === 'correct' ? (
                  <>
                    <CorrectCyanIcon size={22} className="shrink-0" />
                    <span>Označil/a jsi: Správné řešení (+1 bod)</span>
                  </>
                ) : currentAnswer.selfEvaluation === 'partial' ? (
                  <>
                    <span className="text-xl shrink-0">⚠️</span>
                    <span>Označil/a jsi: Částečně správné řešení (+0,5 bodu)</span>
                  </>
                ) : (
                  <>
                    <WrongPinkIcon size={22} className="shrink-0" />
                    <span>Označil/a jsi: Špatné řešení (0 bodů)</span>
                  </>
                )
              ) : currentAnswer.isCorrect ? (
                <>
                  <CorrectCyanIcon size={22} className="shrink-0" />
                  <span>
                    Výborně, správná odpověď! {currentAnswer.usedHint && '(použita nápověda)'}
                  </span>
                </>
              ) : (
                <>
                  <WrongPinkIcon size={22} className="shrink-0" />
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span>Bohužel nesprávně.{(currentAnswer.correctAnswer ?? currentQuestion.correctAnswer) ? ' Správně je:' : ''}</span>
                    {(currentAnswer.correctAnswer ?? currentQuestion.correctAnswer) && (
                      <strong className="inline-flex items-center">
                        <MathRenderer content={(currentAnswer.correctAnswer ?? currentQuestion.correctAnswer) || ''} inline />
                      </strong>
                    )}
                  </span>
                </>
              )}
            </div>

            {/* Didactic tutor feedback (e.g. unreduced fraction) */}
            {currentAnswer.tutorFeedback && (
              <div className="p-3 bg-amber-100/80 border border-amber-300 rounded-xl text-amber-950 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-2xs">
                <BulbYellowIcon size={18} className="shrink-0" />
                <span>{currentAnswer.tutorFeedback}</span>
              </div>
            )}

            {currentQuestion.type !== 'self_check' && (currentAnswer.explanation ?? currentQuestion.explanation) && (
              <div className="text-xs sm:text-sm font-medium leading-relaxed pt-1 border-t border-gray-200/50">
                <div className="font-bold text-gray-700 mb-0.5 flex items-center gap-1.5"><BulbYellowIcon size={15} /> Vysvětlení:</div>
                <MathRenderer content={(currentAnswer.explanation ?? currentQuestion.explanation) || ''} />
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
                className="rounded-2xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] border border-blue-200/80 font-black text-sm px-7 h-12 shadow-xs flex items-center gap-2 transition-transform hover:scale-105 cursor-pointer"
              >
                <span>Další otázka</span>
                <ArrowRight size={16} />
              </Button>
            ) : (
              <Button
                onClick={handleFinishPractice}
                className="rounded-2xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] border border-blue-200/80 font-black text-sm px-7 h-12 shadow-xs flex items-center gap-2 transition-transform hover:scale-105 cursor-pointer"
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
              <BubbleYellowIcon size={24} />
              Dotaz k otázce {currentIndex + 1}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-[#FAF7F0] p-4 rounded-2xl border border-gray-200/60 text-xs sm:text-sm font-medium text-gray-700">
              <span className="font-bold text-gray-400 block text-[10px] uppercase tracking-wider mb-1">
                Zadání úlohy:
              </span>
              <div className="line-clamp-3">
                <MathRenderer content={currentQuestion.question} />
              </div>
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
              className="rounded-xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] border border-blue-200/80 font-black h-11 px-6 flex items-center gap-2 cursor-pointer shadow-xs disabled:opacity-40"
            >
              <Send size={15} />
              <span>{isSubmittingInquiry ? 'Odesílání...' : 'Odeslat dotaz lektorovi'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pro navázání na rozpracované procvičování */}
      <Dialog open={isResumeModalOpen} onOpenChange={() => {}}>
        <DialogContent 
          showCloseButton={false}
          className="sm:max-w-md bg-white border-gray-200 p-6 rounded-3xl shadow-2xl"
        >
          <DialogHeader className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-sky-100 text-sky-600 flex items-center justify-center mx-auto mb-1">
              <Clock size={24} />
            </div>
            <DialogTitle className="text-xl font-black text-gray-900">
              Máš rozpracované procvičování
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              Našli jsme tvůj uložený postup v tomto tématu.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-[#FAF7F0] p-4 rounded-2xl border border-gray-200/80 space-y-3 my-2">
            <div className="flex justify-between items-center text-xs font-bold text-gray-700">
              <span>Zodpovězeno otázek</span>
              <span className="text-[#0F2942] font-black text-sm">
                {pendingResumeSession?.answeredCount || 0} z {pendingResumeSession?.totalCount || questions.length}
              </span>
            </div>
            <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-[#2B44B8] h-full rounded-full transition-all duration-300"
                style={{ 
                  width: `${Math.round(((pendingResumeSession?.answeredCount || 0) / (pendingResumeSession?.totalCount || questions.length || 1)) * 100)}%` 
                }}
              />
            </div>
            <p className="text-xs text-gray-500">
              Chceš navázat tam, kde jsi skončil/a, nebo si přeješ začít úplně od začátku s novými otázkami?
            </p>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleRejectResumeAndRestart}
              className="rounded-xl font-bold text-xs h-11 px-4 border-gray-300 hover:bg-gray-100 text-gray-700 w-full sm:w-auto flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw size={14} />
              <span>Začít od začátku</span>
            </Button>
            <Button
              type="button"
              onClick={handleAcceptResume}
              className="rounded-xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black text-xs h-11 px-6 w-full sm:flex-1 flex items-center justify-center gap-2 shadow-xs cursor-pointer border border-blue-200/80"
            >
              <span>Pokračovat</span>
              <ArrowRight size={14} />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 15s Video simulátor pro dobití žolíků */}
      <RewardedAdModal
        open={isVideoModalOpen}
        onOpenChange={setIsVideoModalOpen}
        isLimitReached={isVideoLimitReached}
        onRewardEarned={async () => {
          if (user) {
            const res = await claimVideoReward();
            if (!res.success && (res as any).limitReached) {
              navigate('/', { replace: true, state: { showDailyLimitModal: true } });
            } else if (res.success) {
              await refreshProfile?.();
            }
          } else {
            const res = recordGuestVideo();
            if (res.reachedLimit) {
              navigate('/', { replace: true, state: { showDailyLimitModal: true } });
            } else {
              toast.success(`Host zhlédl video ${res.videosWatched}/${GUEST_MAX_VIDEOS}!`);
            }
          }
        }}
        isGuest={!user}
        guestVideosWatched={getGuestState().videosWatched}
      />

      {/* 5s Povinné promo okno na Premium po dokončení sady otázek pro free studenty */}
      <MandatorySetPromoModal
        isOpen={isMandatoryPromoOpen}
        onFinish={() => setIsMandatoryPromoOpen(false)}
        onOpenPaywall={() => setIsPremiumFeatureModalOpen(true)}
      />

      {/* Sjednocený Paywall dialog pro Premium funkce (Dotaz lektorovi) */}
      <UnifiedPaywallModal
        isOpen={isPremiumFeatureModalOpen}
        onClose={() => setIsPremiumFeatureModalOpen(false)}
        type="premium"
        title="Komunikace s lektorem vyžaduje Premium"
        description="Staň se jedním z prvních podporovatelů platformy, zafixuj si poloviční cenu 99 Kč/měsíc napořád a získej okamžitý přístup ke všem nástrojům bez limitu žolíků."
      />

      {/* Lightbox dialog pro zvětšení vzorového řešení geometrie */}
      <Dialog open={Boolean(lightboxImageUrl)} onOpenChange={(open) => { if (!open) setLightboxImageUrl(null); }}>
        <DialogContent className="max-w-4xl p-4 sm:p-6 bg-white/95 backdrop-blur-md border border-gray-200 rounded-3xl shadow-2xl">
          <DialogHeader className="flex flex-row items-center justify-between pb-2">
            <DialogTitle className="text-base font-black text-gray-900 flex items-center gap-2">
              <span>📐</span> Vzorové řešení (plná velikost)
            </DialogTitle>
          </DialogHeader>
          {lightboxImageUrl && (
            <div className="flex items-center justify-center p-2 bg-[#FAF7F0] rounded-2xl overflow-auto max-h-[80vh]">
              <img
                src={lightboxImageUrl}
                alt="Vzorové řešení v plné velikosti"
                className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-xs"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
