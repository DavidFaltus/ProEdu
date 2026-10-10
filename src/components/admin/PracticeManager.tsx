import React, { useState, useEffect } from 'react';
import { 
  Plus, Upload, Trash2, Edit2, BookOpen, HelpCircle, CheckCircle2, 
  FileText, Sparkles, ChevronDown, ChevronRight, X, AlertCircle, Play, Lightbulb, FileSpreadsheet,
  Image as ImageIcon, Eye, AlertTriangle, Loader2, SlidersHorizontal
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { toast } from 'sonner';
import { 
  getTopics, getSubtopics, getQuestionsForSubtopic, 
  saveTopic, deleteTopic, saveSubtopic, deleteSubtopic, 
  saveQuestion, deleteQuestion, seedInitialPracticeData, PREDEFINED_SUBJECTS,
  ExistingMaterialItem, cleanStudyStep,
  parsePracticeQuestionsExcelFile, importPracticeQuestionsToFirestore,
  parseStudyStepsExcelFile, importStudyStepsToFirestore,
  PracticeExcelParseResult, StudyExcelParseResult,
  PracticeImportStats, StudyImportStats
} from '../../services/practiceService';
import { PracticeTopic, PracticeSubtopic, PracticeQuestion, QuestionType, StudyStep, PracticeConfig } from '../../types';
import { auth } from '../../lib/firebase';
import PdfSvgDropzone from './PdfSvgDropzone';
import MaterialSelectorModal from './MaterialSelectorModal';
import { convertFileToSvg, sanitizeSvg } from '../../utils/pdfToSvg';
import { MathRenderer } from '../common/MathRenderer';
import QuickFormulaToolbar from './QuickFormulaToolbar';
import { validateLatexSyntax } from '../../utils/mathPreprocessor';

interface PracticeManagerProps {
  userId: string;
}

export default function PracticeManager({ userId }: PracticeManagerProps) {
  const effectiveUserId = userId || auth.currentUser?.uid || '';
  const [activeSubject, setActiveSubject] = useState<'Matematika' | 'Čeština'>('Matematika');
  const [topics, setTopics] = useState<PracticeTopic[]>([]);
  const [subtopics, setSubtopics] = useState<PracticeSubtopic[]>([]);
  const [questionsMap, setQuestionsMap] = useState<Record<string, PracticeQuestion[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedSubtopics, setExpandedSubtopics] = useState<Record<string, boolean>>({});

  // Modals state
  const [isTopicModalOpen, setIsTopicModalOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Partial<PracticeTopic> | null>(null);

  const [isSubtopicModalOpen, setIsSubtopicModalOpen] = useState(false);
  const [editingSubtopic, setEditingSubtopic] = useState<Partial<PracticeSubtopic> | null>(null);
  const [subtopicParentTopicId, setSubtopicParentTopicId] = useState<string>('');
  const [isMaterialSelectorOpen, setIsMaterialSelectorOpen] = useState(false);
  const [isStudyContentModalOpen, setIsStudyContentModalOpen] = useState(false);
  const [editingStudySubtopic, setEditingStudySubtopic] = useState<Partial<PracticeSubtopic> | null>(null);

  const [isPracticeConfigModalOpen, setIsPracticeConfigModalOpen] = useState(false);
  const [configuringSubtopic, setConfiguringSubtopic] = useState<PracticeSubtopic | null>(null);
  const [practiceConfigForm, setPracticeConfigForm] = useState<{
    easyCount: number;
    mediumCount: number;
    hardCount: number;
  }>({ easyCount: 0, mediumCount: 0, hardCount: 0 });

  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Partial<PracticeQuestion> | null>(null);
  const [questionParentSubtopic, setQuestionParentSubtopic] = useState<PracticeSubtopic | null>(null);

  // Deletion confirmation modal state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    type: 'topic' | 'subtopic' | 'question';
    id: string;
    title: string;
    details?: string;
  }>({
    isOpen: false,
    type: 'topic',
    id: '',
    title: '',
  });
  const [isDeleting, setIsDeleting] = useState(false);

  // Excel import state - Procvičování
  const [isPracticeModalOpen, setIsPracticeModalOpen] = useState(false);
  const [practiceFile, setPracticeFile] = useState<File | null>(null);
  const [practiceParsed, setPracticeParsed] = useState<PracticeExcelParseResult | null>(null);
  const [isImportingPractice, setIsImportingPractice] = useState(false);
  const [practiceProgressMsg, setPracticeProgressMsg] = useState('');
  const [practiceStats, setPracticeStats] = useState<PracticeImportStats | null>(null);

  // Excel import state - Studovat
  const [isStudyModalOpen, setIsStudyModalOpen] = useState(false);
  const [studyFile, setStudyFile] = useState<File | null>(null);
  const [studyParsed, setStudyParsed] = useState<StudyExcelParseResult | null>(null);
  const [isImportingStudy, setIsImportingStudy] = useState(false);
  const [studyProgressMsg, setStudyProgressMsg] = useState('');
  const [studyStats, setStudyStats] = useState<StudyImportStats | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const tData = await getTopics(activeSubject);
      const sData = await getSubtopics(undefined, activeSubject);
      setTopics(tData);
      setSubtopics(sData);

      // Preload questions for all subtopics
      const qMap: Record<string, PracticeQuestion[]> = {};
      for (const s of sData) {
        const qs = await getQuestionsForSubtopic(s.id);
        qMap[s.id] = qs;
      }
      setQuestionsMap(qMap);
    } catch (err: any) {
      toast.error('Chyba při načítání témat: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeSubject]);

  // Toggle subtopic questions expand
  const toggleSubtopic = (subId: string) => {
    setExpandedSubtopics(prev => ({ ...prev, [subId]: !prev[subId] }));
  };

  // --- TOPIC ACTIONS ---
  const handleSaveTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTopic?.title?.trim()) return;

    try {
      await saveTopic({
        ...editingTopic,
        subjectId: activeSubject
      }, effectiveUserId);
      toast.success(editingTopic.id ? 'Téma upraveno' : 'Téma vytvořeno');
      setIsTopicModalOpen(false);
      setEditingTopic(null);
      await loadData();
    } catch (err: any) {
      toast.error('Chyba při ukládání: ' + err.message);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm.id) return;
    setIsDeleting(true);
    try {
      if (deleteConfirm.type === 'topic') {
        await deleteTopic(deleteConfirm.id);
        toast.success(`Téma "${deleteConfirm.title}" bylo smazáno`);
      } else if (deleteConfirm.type === 'subtopic') {
        await deleteSubtopic(deleteConfirm.id);
        toast.success(`Podtéma "${deleteConfirm.title}" bylo smazáno`);
      } else if (deleteConfirm.type === 'question') {
        await deleteQuestion(deleteConfirm.id);
        toast.success('Otázka byla smazána');
      }
      setDeleteConfirm(prev => ({ ...prev, isOpen: false }));
      await loadData();
    } catch (err: any) {
      toast.error('Chyba při mazání: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteTopic = (topicId: string, title: string) => {
    setDeleteConfirm({
      isOpen: true,
      type: 'topic',
      id: topicId,
      title: title,
      details: 'Budou smazána všechna podtémata i všechny obsažené otázky v tomto tématu.'
    });
  };

  // --- SUBTOPIC ACTIONS (BASIC INFO) ---
  const handleOpenNewSubtopic = (topicId: string) => {
    setSubtopicParentTopicId(topicId);
    setEditingSubtopic({
      title: '',
      description: '',
      topicId: topicId,
      subjectId: activeSubject
    });
    setIsSubtopicModalOpen(true);
  };

  const handleOpenEditSubtopic = (sub: PracticeSubtopic) => {
    setSubtopicParentTopicId(sub.topicId);
    setEditingSubtopic({
      id: sub.id,
      title: sub.title,
      description: sub.description || '',
      topicId: sub.topicId,
      subjectId: sub.subjectId
    });
    setIsSubtopicModalOpen(true);
  };

  const handleSaveSubtopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubtopic?.title?.trim()) {
      toast.error('Zadejte prosím název podtématu.');
      return;
    }

    try {
      await saveSubtopic({
        id: editingSubtopic.id,
        title: editingSubtopic.title.trim(),
        description: editingSubtopic.description?.trim() || '',
        topicId: subtopicParentTopicId,
        subjectId: activeSubject
      }, effectiveUserId);
      toast.success(editingSubtopic.id ? 'Podtéma bylo úspěšně upraveno' : 'Podtéma bylo úspěšně vytvořeno');
      setIsSubtopicModalOpen(false);
      setEditingSubtopic(null);
      await loadData();
    } catch (err: any) {
      toast.error('Chyba při ukládání: ' + err.message);
    }
  };

  // --- STUDY CONTENT ACTIONS ---
  const handleOpenStudyContent = (sub: PracticeSubtopic) => {
    setEditingStudySubtopic({
      ...sub,
      studySteps: sub.studySteps?.length
        ? sub.studySteps.map(cleanStudyStep)
        : [{ title: 'Krok 1', content: '' }],
      sampleProblem: sub.sampleProblem || { problem: '', correctAnswer: '', options: ['', '', '', ''], explanation: '' }
    });
    setIsStudyContentModalOpen(true);
  };

  const handleSaveStudyContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudySubtopic?.id) return;

    try {
      const cleanSteps: StudyStep[] = (editingStudySubtopic.studySteps || [])
        .filter(s => s.title?.trim() || s.content?.trim() || s.imageUrl || s.svgContent)
        .map(cleanStudyStep);

      await saveSubtopic({
        id: editingStudySubtopic.id,
        hasStudyMaterial: true,
        svgUrl: editingStudySubtopic.svgUrl || null,
        svgContent: editingStudySubtopic.svgContent || null,
        studyTheory: editingStudySubtopic.studyTheory?.trim() || '',
        sampleProblem: editingStudySubtopic.sampleProblem,
        studySteps: cleanSteps
      }, effectiveUserId);
      toast.success('Studijní výklad byl úspěšně uložen');
      setIsStudyContentModalOpen(false);
      setEditingStudySubtopic(null);
      await loadData();
    } catch (err: any) {
      toast.error('Chyba při ukládání: ' + err.message);
    }
  };

  // --- PRACTICE CONFIG ACTIONS ("Upravit Procvičování") ---
  const handleOpenPracticeConfig = (sub: PracticeSubtopic) => {
    setConfiguringSubtopic(sub);
    setPracticeConfigForm({
      easyCount: sub.practiceConfig?.easyCount ?? 0,
      mediumCount: sub.practiceConfig?.mediumCount ?? 0,
      hardCount: sub.practiceConfig?.hardCount ?? 0
    });
    setIsPracticeConfigModalOpen(true);
  };

  const handleSavePracticeConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configuringSubtopic?.id) return;

    const easy = Math.max(0, Math.floor(Number(practiceConfigForm.easyCount) || 0));
    const med = Math.max(0, Math.floor(Number(practiceConfigForm.mediumCount) || 0));
    const hard = Math.max(0, Math.floor(Number(practiceConfigForm.hardCount) || 0));
    const total = easy + med + hard;

    try {
      const configToSave = total > 0 ? {
        easyCount: easy,
        mediumCount: med,
        hardCount: hard,
        totalCount: total
      } : null;

      await saveSubtopic({
        id: configuringSubtopic.id,
        practiceConfig: configToSave as any
      }, effectiveUserId);

      toast.success(total > 0
        ? `Konfigurace procvičování uložena (celkem ${total} otázek pro žáka)`
        : 'Nastaveno procvičování všech dostupných otázek'
      );
      setIsPracticeConfigModalOpen(false);
      setConfiguringSubtopic(null);
      await loadData();
    } catch (err: any) {
      toast.error('Chyba při ukládání konfigurace: ' + err.message);
    }
  };

  const handleResetPracticeConfig = async () => {
    if (!configuringSubtopic?.id) return;
    try {
      await saveSubtopic({
        id: configuringSubtopic.id,
        practiceConfig: null as any
      }, effectiveUserId);
      toast.success('Konfigurace byla resetována. Žáci budou procvičovat všechny dostupné otázky.');
      setIsPracticeConfigModalOpen(false);
      setConfiguringSubtopic(null);
      await loadData();
    } catch (err: any) {
      toast.error('Chyba při resetování konfigurace: ' + err.message);
    }
  };

  const handleSelectMaterial = (mat: ExistingMaterialItem) => {
    setEditingStudySubtopic(prev => ({
      ...prev,
      svgContent: mat.svgContent || '',
      svgUrl: mat.svgUrl || '',
      hasStudyMaterial: true,
      studyTheory: prev?.studyTheory || mat.studyTheory || ''
    }));
    toast.success(`Materiál "${mat.title}" byl přiřazen k tomuto podtématu.`);
  };

  const addStep = () => {
    const current = editingStudySubtopic?.studySteps || [];
    setEditingStudySubtopic(prev => ({
      ...prev,
      studySteps: [
        ...current,
        {
          title: `Krok ${current.length + 1}`,
          content: '',
          testQuestion: '',
          testOptions: ['', '', '', ''],
          correctAnswer: '',
          tutorTip: '',
          imageUrl: '',
          svgContent: ''
        }
      ]
    }));
  };

  const removeStep = (idx: number) => {
    setEditingStudySubtopic(prev => ({
      ...prev,
      studySteps: (prev?.studySteps || []).filter((_, i) => i !== idx)
    }));
  };

  const updateStep = (idx: number, field: keyof StudyStep, value: any) => {
    setEditingStudySubtopic(prev => {
      const updated = [...(prev?.studySteps || [])];
      updated[idx] = {
        ...updated[idx],
        [field]: value
      };
      return {
        ...prev,
        studySteps: updated
      };
    });
  };

  const updateStepOption = (stepIdx: number, optIdx: number, value: string) => {
    setEditingStudySubtopic(prev => {
      const updated = [...(prev?.studySteps || [])];
      const step = { ...updated[stepIdx] };
      const currentOpts = [...(step.testOptions || ['', '', '', ''])];
      while (currentOpts.length < 4) {
        currentOpts.push('');
      }
      currentOpts[optIdx] = value;
      step.testOptions = currentOpts;
      updated[stepIdx] = step;
      return {
        ...prev,
        studySteps: updated
      };
    });
  };

  const handleDeleteSubtopic = (subId: string, title: string) => {
    setDeleteConfirm({
      isOpen: true,
      type: 'subtopic',
      id: subId,
      title: title,
      details: 'Bude smazána látka studia i všechny obsažené otázky k procvičování.'
    });
  };

  // --- QUESTION ACTIONS ---
  const handleOpenNewQuestion = (sub: PracticeSubtopic) => {
    setQuestionParentSubtopic(sub);
    setEditingQuestion({
      type: 'choice',
      question: '',
      options: ['', '', '', ''],
      correctAnswer: '',
      hint: '',
      explanation: '',
      difficulty: 'Střední',
      subtopicId: sub.id,
      topicId: sub.topicId,
      subjectId: sub.subjectId
    });
    setIsQuestionModalOpen(true);
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion?.question?.trim()) {
      toast.error('Vyplňte zadání otázky.');
      return;
    }

    if (editingQuestion.type === 'choice') {
      const opts = (editingQuestion.options || []).map(o => o.trim()).filter(Boolean);
      if (opts.length < 2) {
        toast.error('Vyplňte možnosti odpovědí.');
        return;
      }
      if (!editingQuestion.correctAnswer?.trim()) {
        toast.error('Vyberte správnou odpověď z možností.');
        return;
      }
    } else {
      if (!editingQuestion?.correctAnswer?.trim()) {
        toast.error('Vyplňte správnou odpověď.');
        return;
      }
    }

    try {
      await saveQuestion({
        ...editingQuestion,
        difficulty: editingQuestion.difficulty || 'Střední',
        subtopicId: questionParentSubtopic?.id || editingQuestion.subtopicId,
        topicId: questionParentSubtopic?.topicId || editingQuestion.topicId,
        subjectId: activeSubject
      }, effectiveUserId);

      toast.success(editingQuestion.id ? 'Otázka upravena' : 'Otázka vytvořena');
      setIsQuestionModalOpen(false);
      setEditingQuestion(null);
      await loadData();
    } catch (err: any) {
      toast.error('Chyba při ukládání: ' + err.message);
    }
  };

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [conversionMsg, setConversionMsg] = useState('');

  const handleQuestionImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    const validExts = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf'];
    if (!ext || !validExts.includes(ext)) {
      toast.error('Nahrajte prosím obrázek (PNG, JPG, WebP, SVG) nebo PDF.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast.error('Soubor je příliš velký (maximum 15 MB).');
      return;
    }

    setIsUploadingImage(true);
    setConversionMsg('Převádím soubor na vektorové SVG...');
    try {
      const res = await convertFileToSvg(file, (msg) => setConversionMsg(msg));
      setEditingQuestion(prev => ({
        ...prev,
        svgContent: res.svgString,
        imageUrl: res.thumbnailDataUrl || ''
      }));
      toast.success(
        ext === 'svg'
          ? 'SVG soubor úspěšně načten a přiřazen k otázce!'
          : ext === 'pdf'
            ? 'PDF úspěšně převedeno na vektorové SVG a vloženo k otázce!'
            : 'Obrázek byl úspěšně převeden do formátu SVG a vložen k otázce!'
      );
    } catch (err: any) {
      console.error('Error processing question image/svg:', err);
      toast.error('Nepodařilo se zpracovat soubor: ' + (err.message || ''));
    } finally {
      setIsUploadingImage(false);
      setConversionMsg('');
      e.target.value = '';
    }
  };

  const [uploadingStepIdx, setUploadingStepIdx] = useState<number | null>(null);
  const [stepConversionMsg, setStepConversionMsg] = useState('');

  const handleStepImageUpload = async (stepIdx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    const validExts = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'pdf'];
    if (!ext || !validExts.includes(ext)) {
      toast.error('Nahrajte prosím obrázek (PNG, JPG, WebP, SVG) nebo PDF.');
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      toast.error('Soubor je příliš velký (maximum 15 MB).');
      return;
    }

    setUploadingStepIdx(stepIdx);
    setStepConversionMsg('Převádím soubor na vektorové SVG...');
    try {
      const res = await convertFileToSvg(file, (msg) => setStepConversionMsg(msg));
      setEditingStudySubtopic(prev => {
        const updated = [...(prev?.studySteps || [])];
        updated[stepIdx] = {
          ...updated[stepIdx],
          svgContent: res.svgString,
          imageUrl: res.thumbnailDataUrl || ''
        };
        return {
          ...prev,
          studySteps: updated
        };
      });
      toast.success(
        ext === 'svg'
          ? 'SVG soubor úspěšně načten a vložen ke kroku!'
          : ext === 'pdf'
            ? 'PDF úspěšně převedeno na vektorové SVG a vloženo ke kroku!'
            : 'Obrázek byl úspěšně převeden do formátu SVG a vložen ke kroku!'
      );
    } catch (err: any) {
      console.error('Error processing step image/svg:', err);
      toast.error('Nepodařilo se zpracovat soubor: ' + (err.message || ''));
    } finally {
      setUploadingStepIdx(null);
      setStepConversionMsg('');
      e.target.value = '';
    }
  };

  const handleRemoveStepImage = (stepIdx: number) => {
    setEditingStudySubtopic(prev => {
      const updated = [...(prev?.studySteps || [])];
      updated[stepIdx] = {
        ...updated[stepIdx],
        svgContent: '',
        imageUrl: ''
      };
      return {
        ...prev,
        studySteps: updated
      };
    });
  };

  const handleStepImageUrlChange = (stepIdx: number, url: string) => {
    setEditingStudySubtopic(prev => {
      const updated = [...(prev?.studySteps || [])];
      updated[stepIdx] = {
        ...updated[stepIdx],
        imageUrl: url,
        svgContent: ''
      };
      return {
        ...prev,
        studySteps: updated
      };
    });
  };

  const handleDeleteQuestion = (questionId: string, questionText?: string) => {
    setDeleteConfirm({
      isOpen: true,
      type: 'question',
      id: questionId,
      title: questionText || 'Vybraná otázka',
      details: 'Otázka bude trvale odstraněna z procvičování.'
    });
  };

  // --- 1. EXCEL IMPORT PROČVIČOVÁNÍ ---
  const handlePracticeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPracticeFile(file);
    setPracticeStats(null);
    try {
      const parsed = await parsePracticeQuestionsExcelFile(file);
      setPracticeParsed(parsed);
      if (parsed.invalidRows.length > 0) {
        toast.warning(`Soubor načten: ${parsed.validRows.length} platných otázek, ${parsed.invalidRows.length} řádků má chybu.`);
      } else {
        toast.success(`Soubor načten: ${parsed.validRows.length} platných otázek k importu.`);
      }
    } catch (err: any) {
      setPracticeParsed(null);
      toast.error('Chyba při čtení Excelu: ' + err.message);
    }
  };

  const handleExecutePracticeImport = async () => {
    if (!practiceParsed || practiceParsed.validRows.length === 0) return;
    setIsImportingPractice(true);
    setPracticeProgressMsg('Zahajuji import...');
    try {
      const stats = await importPracticeQuestionsToFirestore(
        practiceParsed.validRows,
        effectiveUserId,
        (msg) => setPracticeProgressMsg(msg)
      );
      setPracticeStats(stats);
      toast.success(`Import procvičování dokončen! Naimportováno: ${stats.importedQuestions} nových otázek.`);
      await loadData();
    } catch (err: any) {
      toast.error('Chyba během importu: ' + err.message);
    } finally {
      setIsImportingPractice(false);
      setPracticeProgressMsg('');
    }
  };

  // --- 2. EXCEL IMPORT STUDIUM (KROKY) ---
  const handleStudyFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStudyFile(file);
    setStudyStats(null);
    try {
      const parsed = await parseStudyStepsExcelFile(file);
      setStudyParsed(parsed);
      if (parsed.invalidRows.length > 0) {
        toast.warning(`Soubor načten: ${parsed.validRows.length} platných kroků, ${parsed.invalidRows.length} řádků má chybu.`);
      } else {
        toast.success(`Soubor načten: ${parsed.validRows.length} platných kroků výkladu k importu.`);
      }
    } catch (err: any) {
      setStudyParsed(null);
      toast.error('Chyba při čtení Excelu: ' + err.message);
    }
  };

  const handleExecuteStudyImport = async () => {
    if (!studyParsed || studyParsed.validRows.length === 0) return;
    setIsImportingStudy(true);
    setStudyProgressMsg('Zahajuji import...');
    try {
      const stats = await importStudyStepsToFirestore(
        studyParsed.validRows,
        effectiveUserId,
        (msg) => setStudyProgressMsg(msg)
      );
      setStudyStats(stats);
      toast.success(`Import studia dokončen! Naimportováno: ${stats.importedSteps} kroků.`);
      await loadData();
    } catch (err: any) {
      toast.error('Chyba během importu: ' + err.message);
    } finally {
      setIsImportingStudy(false);
      setStudyProgressMsg('');
    }
  };

  // Track last active input/textarea element and cursor selection range for formula insertion
  const lastActiveInputRef = React.useRef<{
    element: HTMLInputElement | HTMLTextAreaElement;
    start: number;
    end: number;
  } | null>(null);

  const handleInputTrack = (e: React.SyntheticEvent<HTMLElement>) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      lastActiveInputRef.current = {
        element: target,
        start: target.selectionStart ?? target.value.length,
        end: target.selectionEnd ?? target.value.length
      };
    }
  };

  const insertSnippetAtCursor = (rawSnippet: string) => {
    let targetEl: (HTMLInputElement | HTMLTextAreaElement) | null = null;
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      targetEl = activeEl as HTMLInputElement | HTMLTextAreaElement;
    } else if (lastActiveInputRef.current?.element && document.body.contains(lastActiveInputRef.current.element)) {
      targetEl = lastActiveInputRef.current.element;
    }

    // Fallback: look for the question textarea inside the question dialog
    if (!targetEl) {
      const questionEl = document.querySelector('textarea[data-field="question"]') as HTMLTextAreaElement | null;
      if (questionEl) targetEl = questionEl;
    }

    if (!targetEl) return;

    const start = (targetEl === activeEl)
      ? (targetEl.selectionStart ?? targetEl.value.length)
      : (lastActiveInputRef.current?.start ?? targetEl.value.length);
    const end = (targetEl === activeEl)
      ? (targetEl.selectionEnd ?? targetEl.value.length)
      : (lastActiveInputRef.current?.end ?? targetEl.value.length);

    const currentVal = targetEl.value || '';

    // If the cursor is ALREADY inside an unclosed $...$ or $$...$$ math block, insert without outer $ signs
    const textBefore = currentVal.slice(0, start);
    const cleanEscaped = textBefore.replace(/\\\$/g, '');
    const dollarCount = (cleanEscaped.match(/\$/g) || []).length;
    const isInsideMath = dollarCount % 2 === 1;

    let snippetToInsert = rawSnippet;
    if (isInsideMath) {
      if (snippetToInsert.startsWith('$$') && snippetToInsert.endsWith('$$') && snippetToInsert.length >= 4) {
        snippetToInsert = snippetToInsert.slice(2, -2).trim();
      } else if (snippetToInsert.startsWith('$') && snippetToInsert.endsWith('$') && snippetToInsert.length >= 2) {
        snippetToInsert = snippetToInsert.slice(1, -1);
      }
    }

    const newVal = currentVal.slice(0, start) + snippetToInsert + currentVal.slice(end);

    const proto = targetEl instanceof HTMLTextAreaElement 
      ? window.HTMLTextAreaElement.prototype 
      : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    if (nativeSetter) {
      nativeSetter.call(targetEl, newVal);
    } else {
      targetEl.value = newVal;
    }

    targetEl.dispatchEvent(new Event('input', { bubbles: true }));

    targetEl.focus();
    const newCursor = start + snippetToInsert.length;
    try {
      targetEl.setSelectionRange(newCursor, newCursor);
    } catch {
      // ignore
    }

    lastActiveInputRef.current = {
      element: targetEl,
      start: newCursor,
      end: newCursor
    };
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar & Subject Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-gray-100 shadow-sm">
        {/* Subject Pills */}
        <div className="flex gap-2">
          {PREDEFINED_SUBJECTS.map((sub) => (
            <button
              key={sub.id}
              onClick={() => setActiveSubject(sub.id as any)}
              className={`px-5 py-2.5 rounded-2xl font-black text-sm transition-all cursor-pointer ${
                activeSubject === sub.id
                  ? 'bg-[#1E1B18] text-white shadow-md'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {sub.title}
            </button>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setEditingTopic({ title: '', description: '', subjectId: activeSubject });
              setIsTopicModalOpen(true);
            }}
            className="rounded-xl bg-[#1E1B18] hover:bg-[#332f2b] text-white font-bold h-10 px-4 flex items-center gap-2 cursor-pointer shadow-sm text-xs"
          >
            <Plus size={16} />
            <span>Nové téma</span>
          </Button>

          <Button
            onClick={() => {
              setPracticeFile(null);
              setPracticeParsed(null);
              setPracticeStats(null);
              setIsPracticeModalOpen(true);
            }}
            variant="outline"
            className="rounded-xl border-gray-200 hover:border-black font-bold h-10 px-3.5 flex items-center gap-2 cursor-pointer text-xs bg-white shadow-xs"
          >
            <Upload size={15} className="text-[#B80053]" />
            <span>Importovat procvičování</span>
          </Button>

          <Button
            onClick={() => {
              setStudyFile(null);
              setStudyParsed(null);
              setStudyStats(null);
              setIsStudyModalOpen(true);
            }}
            variant="outline"
            className="rounded-xl border-gray-200 hover:border-black font-bold h-10 px-3.5 flex items-center gap-2 cursor-pointer text-xs bg-white shadow-xs"
          >
            <BookOpen size={15} className="text-[#0F5238]" />
            <span>Importovat studium</span>
          </Button>
        </div>
      </div>

      {/* Main Hierarchy List */}
      {loading ? (
        <div className="text-center py-16 bg-white rounded-3xl">
          <div className="w-10 h-10 border-4 border-[#1E1B18] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 font-bold text-sm">Načítání témat pro {activeSubject}...</p>
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200 p-8 space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto text-2xl">
            📚
          </div>
          <h3 className="text-2xl font-display font-black text-gray-800">Žádná témata pro {activeSubject}</h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto">
            Vytvořte své první hlavní téma nebo importujte hotový přehled z Excelu.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Button
              onClick={() => {
                setEditingTopic({ title: '', description: '', subjectId: activeSubject });
                setIsTopicModalOpen(true);
              }}
              className="rounded-xl bg-[#1E1B18] text-white font-bold h-10 px-5 text-xs"
            >
              + Vytvořit první téma
            </Button>
            <Button
              onClick={() => {
                setPracticeFile(null);
                setPracticeParsed(null);
                setPracticeStats(null);
                setIsPracticeModalOpen(true);
              }}
              variant="outline"
              className="rounded-xl font-bold h-10 px-4 text-xs"
            >
              📥 Import procvičování
            </Button>
            <Button
              onClick={() => {
                setStudyFile(null);
                setStudyParsed(null);
                setStudyStats(null);
                setIsStudyModalOpen(true);
              }}
              variant="outline"
              className="rounded-xl font-bold h-10 px-4 text-xs"
            >
              📖 Import studia
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {topics.map((topic) => {
            const topicSubtopics = subtopics.filter(s => s.topicId === topic.id || s.topicId === topic.title);

            return (
              <div 
                key={topic.id}
                className="bg-white rounded-3xl p-6 sm:p-7 border border-gray-100 shadow-sm space-y-5"
              >
                {/* Topic Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md">
                        Hlavní téma
                      </span>
                      <h3 className="text-xl sm:text-2xl font-black text-[#1E1B18]">
                        {topic.title}
                      </h3>
                    </div>
                    {topic.description && (
                      <p className="text-gray-400 text-xs mt-0.5 font-medium">{topic.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <Button
                      onClick={() => handleOpenNewSubtopic(topic.id)}
                      size="sm"
                      className="rounded-xl bg-gray-100 hover:bg-[#1E1B18] hover:text-white text-gray-800 font-bold text-xs h-9 px-3.5 transition-colors cursor-pointer"
                    >
                      <Plus size={14} className="mr-1" /> Přidat podtéma
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingTopic(topic);
                        setIsTopicModalOpen(true);
                      }}
                      className="rounded-xl h-9 w-9 p-0 text-gray-500 hover:text-black cursor-pointer"
                      title="Upravit téma"
                    >
                      <Edit2 size={15} />
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTopic(topic.id, topic.title)}
                      className="rounded-xl h-9 w-9 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                      title="Smazat téma"
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>

                {/* Subtopics List */}
                {topicSubtopics.length === 0 ? (
                  <p className="text-gray-400 text-xs italic py-2">
                    Toto téma zatím nemá žádná podtémata. Klikněte na "+ Přidat podtéma".
                  </p>
                ) : (
                  <div className="space-y-4">
                    {topicSubtopics.map((sub) => {
                      const questions = questionsMap[sub.id] || [];
                      const isExpanded = !!expandedSubtopics[sub.id];

                      return (
                        <div 
                          key={sub.id}
                          className="rounded-2xl border border-gray-200/80 bg-[#FAF7F0] p-4 sm:p-5 space-y-4 transition-all"
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  onClick={() => toggleSubtopic(sub.id)}
                                  className="font-bold text-base text-gray-900 hover:text-brand-blue flex items-center gap-1.5 cursor-pointer text-left"
                                >
                                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                  <span>{sub.title}</span>
                                </button>

                                <span className="text-[11px] font-bold text-gray-500 bg-white px-2.5 py-0.5 rounded-md border border-gray-200">
                                  {questions.length} {questions.length === 1 ? 'otázka' : questions.length < 5 ? 'otázky' : 'otázek'}
                                </span>

                                {sub.practiceConfig && (sub.practiceConfig.totalCount ?? 0) > 0 && (
                                  <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-md flex items-center gap-1 shadow-2xs" title="Aktivní konfigurace výběru otázek">
                                    <SlidersHorizontal size={11} />
                                    <span>
                                      Výběr {sub.practiceConfig.totalCount} ({sub.practiceConfig.easyCount ?? 0}L / {sub.practiceConfig.mediumCount ?? 0}S / {sub.practiceConfig.hardCount ?? 0}T)
                                    </span>
                                  </span>
                                )}
                              </div>

                              {sub.description && (
                                <p className="text-gray-500 text-xs pl-6">{sub.description}</p>
                              )}
                            </div>

                            {/* Subtopic Action Buttons */}
                            <div className="flex items-center gap-2 shrink-0 self-end md:self-center pl-6 md:pl-0">
                              <Button
                                onClick={() => handleOpenNewQuestion(sub)}
                                size="sm"
                                className="rounded-xl bg-[#1E1B18] text-white hover:bg-[#332f2b] font-bold text-xs h-8 px-3 flex items-center gap-1 cursor-pointer"
                              >
                                <Plus size={13} />
                                <span>Přidat procvičování</span>
                              </Button>

                              <Button
                                onClick={() => handleOpenPracticeConfig(sub)}
                                variant="outline"
                                size="sm"
                                className="rounded-xl bg-white border-gray-200 hover:border-black text-gray-800 font-bold text-xs h-8 px-3 flex items-center gap-1 cursor-pointer"
                                title="Nastavit počet a distribuci obtížností pro studenty"
                              >
                                <SlidersHorizontal size={13} />
                                <span>Upravit Procvičování</span>
                              </Button>

                              <Button
                                onClick={() => handleOpenStudyContent(sub)}
                                variant="outline"
                                size="sm"
                                className="rounded-xl bg-white border-gray-200 hover:border-black text-gray-800 font-bold text-xs h-8 px-3 flex items-center gap-1 cursor-pointer"
                              >
                                <BookOpen size={13} />
                                <span>Upravit Studium</span>
                              </Button>

                              <Button
                                onClick={() => window.open(`/study/${sub.id}`, '_blank', 'noopener,noreferrer')}
                                variant="outline"
                                size="sm"
                                className="rounded-xl bg-white border-gray-200 hover:border-black text-gray-800 font-bold text-xs h-8 px-3 flex items-center gap-1 cursor-pointer"
                                title="Otevřít náhled studia v nové záložce"
                              >
                                <Eye size={13} />
                                <span>Náhled studia</span>
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEditSubtopic(sub)}
                                className="rounded-xl h-8 w-8 p-0 text-gray-500 hover:text-black cursor-pointer"
                                title="Upravit podtéma (název a popis)"
                              >
                                <Edit2 size={14} />
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteSubtopic(sub.id, sub.title)}
                                className="rounded-xl h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                title="Smazat podtéma"
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          </div>

                          {/* Expanded Questions for this Subtopic */}
                          {isExpanded && (
                            <div className="pl-6 pt-3 border-t border-gray-200/60 space-y-2.5">
                              <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                                <span>Seznam otázek k procvičování</span>
                                <span className="text-gray-400">Typ: Volba ze 4 / Vepisovací</span>
                              </div>

                              {questions.length === 0 ? (
                                <p className="text-gray-400 text-xs italic py-2">
                                  Zatím žádné otázky. Klikněte na "+ Přidat procvičování" pro přidání otázky s volbou ze 4 nebo volnou odpovědí.
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {questions.map((q, qIdx) => (
                                    <div 
                                      key={q.id}
                                      className="p-3 bg-white rounded-xl border border-gray-200/80 shadow-xs flex items-start justify-between gap-3 text-xs"
                                    >
                                      <div className="space-y-1 min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-gray-400">{qIdx + 1}.</span>
                                          <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-wider ${
                                            q.type === 'choice' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                                          }`}>
                                            {q.type === 'choice' ? '4 možnosti' : 'Volná odpověď'}
                                          </span>
                                          <span className={`px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-wider border ${
                                            (q.difficulty || 'Střední') === 'Lehká' 
                                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                              : (q.difficulty || 'Střední') === 'Těžká'
                                                ? 'bg-rose-50 text-rose-800 border-rose-200'
                                                : 'bg-amber-50 text-amber-800 border-amber-200'
                                          }`}>
                                            {q.difficulty || 'Střední'}
                                          </span>
                                          {(q.svgContent || q.imageUrl) && (
                                            <span className="px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1 shrink-0" title={q.svgContent ? 'Otázka má vložené vektorové SVG zadání' : 'Otázka má přiložený obrázek'}>
                                              <ImageIcon size={10} />
                                              <span>{q.svgContent ? 'SVG' : 'Obrázek'}</span>
                                            </span>
                                          )}
                                          <span className="font-bold text-gray-800 truncate">{q.question}</span>
                                        </div>
                                        <div className="pl-5 text-gray-500">
                                          Správná odpověď: <span className="font-bold text-emerald-700">{q.correctAnswer}</span>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1 shrink-0">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            setQuestionParentSubtopic(sub);
                                            setEditingQuestion(q);
                                            setIsQuestionModalOpen(true);
                                          }}
                                          className="rounded-lg h-7 w-7 p-0 text-gray-400 hover:text-black cursor-pointer"
                                        >
                                          <Edit2 size={12} />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDeleteQuestion(q.id, q.question)}
                                          className="rounded-lg h-7 w-7 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                                        >
                                          <Trash2 size={12} />
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: CREATE / EDIT TOPIC                                  */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isTopicModalOpen} onOpenChange={setIsTopicModalOpen}>
        <DialogContent className="rounded-3xl p-6 sm:p-8 w-full sm:max-w-xl bg-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-black text-[#1E1B18]">
              {editingTopic?.id ? 'Upravit hlavní téma' : 'Nové hlavní téma'}
            </DialogTitle>
          </DialogHeader>


          <form onSubmit={handleSaveTopic} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Předmět</label>
              <Input
                disabled
                value={activeSubject}
                className="rounded-xl h-11 bg-gray-100 font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Název tématu *</label>
              <Input
                required
                value={editingTopic?.title || ''}
                onChange={e => setEditingTopic(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Např. Počítání a čísla, Pravopis"
                className="rounded-xl h-11 font-medium"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Popis tématu</label>
              <textarea
                rows={2}
                value={editingTopic?.description || ''}
                onChange={e => setEditingTopic(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Stručný přehled okruhů v tomto tématu..."
                className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:border-black outline-none font-medium"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsTopicModalOpen(false)} className="rounded-xl">
                Zrušit
              </Button>
              <Button type="submit" className="rounded-xl bg-[#1E1B18] text-white font-bold">
                Uložit téma
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: CREATE / EDIT SUBTOPIC (METADATA)                     */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isSubtopicModalOpen} onOpenChange={setIsSubtopicModalOpen}>
        <DialogContent className="rounded-3xl p-6 sm:p-8 w-full sm:max-w-xl bg-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-black text-[#1E1B18]">
              {editingSubtopic?.id ? 'Upravit podtéma' : 'Nové podtéma'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveSubtopic} className="space-y-4 py-2">
            {/* Prominent Info Banner for Studovat Section */}
            <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 text-amber-950 shadow-xs">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                <BookOpen size={20} />
              </div>
              <div className="space-y-1">
                <h5 className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                  Vytváříte podtéma i interaktivní sekci "Studovat"
                </h5>
                <p className="text-xs text-amber-800 font-medium leading-relaxed">
                  Tento formulář spravuje název a popis podtématu. Výukové materiály a kroky výkladu pro sekci <strong>Studovat</strong> můžete kdykoliv upravit samostatně kliknutím na tlačítko <strong>Upravit Studium</strong>.
                </p>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Předmět</label>
              <Input
                disabled
                value={activeSubject}
                className="rounded-xl h-11 bg-gray-100 font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Název podtémata *</label>
              <Input
                required
                value={editingSubtopic?.title || ''}
                onChange={e => setEditingSubtopic(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Např. Zlomky a smíšená čísla"
                className="rounded-xl h-11 font-medium bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Popis podtémata</label>
              <textarea
                rows={2}
                value={editingSubtopic?.description || ''}
                onChange={e => setEditingSubtopic(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Krátké vysvětlení, co se zde student naučí..."
                className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:border-black outline-none font-medium"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsSubtopicModalOpen(false)} className="rounded-xl cursor-pointer">
                Zrušit
              </Button>
              <Button type="submit" className="rounded-xl bg-[#1E1B18] text-white font-bold cursor-pointer">
                {editingSubtopic?.id ? 'Uložit podtéma' : 'Vytvořit podtéma'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2B: EDIT STUDY CONTENT & MATERIAL                        */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isStudyContentModalOpen} onOpenChange={setIsStudyContentModalOpen}>
        <DialogContent className="rounded-3xl p-6 sm:p-10 w-full sm:max-w-5xl lg:max-w-6xl xl:max-w-7xl bg-white max-h-[92vh] overflow-y-auto shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <BookOpen size={20} />
              </div>
              <div>
                <DialogTitle className="text-2xl font-display font-black text-[#1E1B18]">
                  Studijní výklad: {editingStudySubtopic?.title || 'Podtéma'}
                </DialogTitle>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  Správa grafického výukového listu, teoretického výkladu a jednotlivých kroků pro žáky.
                </p>
              </div>
            </div>
          </DialogHeader>

          <form 
            onSubmit={handleSaveStudyContent} 
            className="space-y-5 py-2"
            onFocusCapture={handleInputTrack}
            onSelectCapture={handleInputTrack}
            onKeyUpCapture={handleInputTrack}
            onMouseUpCapture={handleInputTrack}
          >
            {/* Grafický list: Drag & Drop PDF / SVG + Výběr z materiálů */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-700">
                  Grafický výukový list (PDF / SVG)
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMaterialSelectorOpen(true)}
                  className="h-7 text-xs font-bold text-amber-700 hover:bg-amber-50 cursor-pointer flex items-center gap-1.5"
                >
                  <BookOpen size={13} />
                  <span>Vybrat z existujících materiálů</span>
                </Button>
              </div>

              <PdfSvgDropzone
                valueSvgString={editingStudySubtopic?.svgContent}
                valueSvgUrl={editingStudySubtopic?.svgUrl}
                onChange={(res) => {
                  if (res) {
                    setEditingStudySubtopic(prev => ({
                      ...prev,
                      svgContent: res.svgString,
                      svgUrl: '',
                      hasStudyMaterial: true
                    }));
                  } else {
                    setEditingStudySubtopic(prev => ({
                      ...prev,
                      svgContent: '',
                      svgUrl: ''
                    }));
                  }
                }}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Teoretický výklad / Popis látky</label>
              <textarea
                rows={4}
                value={editingStudySubtopic?.studyTheory || ''}
                onChange={e => setEditingStudySubtopic(prev => ({ ...prev, studyTheory: e.target.value }))}
                placeholder="Podrobné vysvětlení pravidel, pouček a vzorců..."
                className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:border-black outline-none font-medium leading-relaxed"
              />
            </div>

            {/* Steps Builder */}
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-[#1E1B18] flex items-center gap-1.5">
                    <CheckCircle2 size={16} className="text-amber-600" />
                    Kroky řešení a výkladu (krok za krokem)
                  </h4>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    U každého kroku můžete kromě výkladu přidat i kontrolní 4-volbový kvíz a bublinku s tipem od lektora.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={addStep}
                  className="rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold text-xs h-8 px-3 flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus size={14} /> Přidat krok
                </Button>
              </div>

              {(!editingStudySubtopic?.studySteps || editingStudySubtopic.studySteps.length === 0) ? (
                <div className="text-center py-6 px-4 bg-gray-50 rounded-2xl border border-dashed border-gray-200 space-y-2">
                  <p className="text-xs text-gray-400 font-medium">Toto podtéma zatím nemá žádné studijní kroky.</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addStep}
                    className="rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <Plus size={13} className="mr-1" /> Vytvořit první krok
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {editingStudySubtopic.studySteps.map((step, idx) => (
                    <div key={idx} className="p-4 sm:p-5 rounded-2xl border border-gray-200 bg-gray-50/60 space-y-4 relative">
                      {/* Step Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          <span className="w-7 h-7 rounded-xl bg-[#1E1B18] text-[#FAF7F0] font-black text-xs flex items-center justify-center shrink-0 shadow-sm">
                            {idx + 1}
                          </span>
                          <Input
                            value={step.title}
                            onChange={e => updateStep(idx, 'title', e.target.value)}
                            placeholder={`Název kroku ${idx + 1} (např. Určení kořene slova)`}
                            className="h-10 rounded-xl text-sm font-bold bg-white"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => removeStep(idx)}
                          className="h-9 w-9 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl shrink-0 cursor-pointer"
                          title="Smazat krok"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>

                      {/* Step Explanation Content */}
                      <div className="space-y-2 pl-0 sm:pl-9">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                            Výkladový text kroku * (Podporuje KaTeX & Markdown)
                          </label>
                        </div>
                        <QuickFormulaToolbar 
                          size="xs"
                          onInsert={insertSnippetAtCursor}
                        />
                        <textarea
                          rows={3}
                          value={step.content}
                          onChange={e => updateStep(idx, 'content', e.target.value)}
                          placeholder="Podrobné vysvětlení a postup v rámci tohoto kroku..."
                          className="w-full p-3 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black font-medium leading-relaxed"
                        />
                        {step.content && (
                          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1">
                            <span className="font-bold text-gray-500 block">Náhled výkladu:</span>
                            <MathRenderer content={step.content} />
                          </div>
                        )}
                      </div>

                      {/* Step Image / SVG */}
                      <div className="space-y-2.5 bg-[#FAF7F0] p-4 rounded-2xl border border-gray-200/80 ml-0 sm:ml-9">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                            <ImageIcon size={15} className="text-amber-600" />
                            <span>Grafický podklad / Obrázek ke kroku (volitelné - konvertuje se do SVG)</span>
                          </label>
                          {(step.svgContent || step.imageUrl) && (
                            <button
                              type="button"
                              onClick={() => handleRemoveStepImage(idx)}
                              className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 size={13} />
                              <span>Odebrat obrázek</span>
                            </button>
                          )}
                        </div>

                        {uploadingStepIdx === idx ? (
                          <div className="border-2 border-dashed border-amber-300 bg-amber-50/70 rounded-2xl p-5 text-center space-y-2 animate-pulse">
                            <div className="w-7 h-7 border-3 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto" />
                            <p className="font-bold text-xs text-amber-900">{stepConversionMsg || 'Zpracovávám soubor a převádím do SVG...'}</p>
                          </div>
                        ) : (step.svgContent || step.imageUrl) ? (
                          <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col items-center justify-center space-y-2.5 shadow-2xs">
                            {step.svgContent ? (
                              <div 
                                className="max-h-52 w-full overflow-hidden flex justify-center [&>svg]:max-h-52 [&>svg]:w-auto [&>svg]:max-w-full"
                                dangerouslySetInnerHTML={{ __html: sanitizeSvg(step.svgContent) }}
                              />
                            ) : (
                              <img
                                src={step.imageUrl}
                                alt={`Náhled ke kroku ${idx + 1}`}
                                className="max-h-52 w-auto max-w-full rounded-lg object-contain border border-gray-100 shadow-2xs"
                              />
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleRemoveStepImage(idx)}
                                className="px-2.5 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                              >
                                Změnit / Smazat obrázek
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex flex-col sm:flex-row items-center gap-2.5">
                              {/* File Upload Button */}
                              <label className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 flex items-center justify-center gap-2 cursor-pointer shadow-2xs hover:border-black transition-all shrink-0">
                                <Upload size={14} className="text-amber-600" />
                                <span>Nahrát soubor (obrázek / SVG / PDF)</span>
                                <input
                                  type="file"
                                  accept=".pdf,.svg,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
                                  className="hidden"
                                  onChange={(e) => handleStepImageUpload(idx, e)}
                                  disabled={uploadingStepIdx !== null}
                                />
                              </label>

                              <span className="text-xs text-gray-400 font-semibold shrink-0">nebo URL:</span>

                              {/* URL Input */}
                              <div className="flex-1 w-full">
                                <Input
                                  type="text"
                                  placeholder="https://... nebo /materials/obrazek.svg"
                                  value={step.imageUrl || ''}
                                  onChange={e => handleStepImageUrlChange(idx, e.target.value)}
                                  className="rounded-xl h-9 text-xs bg-white"
                                />
                              </div>
                            </div>
                            <p className="text-[11px] text-gray-400 font-medium">
                              Nahraný soubor se automaticky převede na SVG a zobrazí se žákům v tomto kroku výkladu.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Sub-grid: 4-choice Quiz + Tutor Tip */}
                      <div className="pl-0 sm:pl-9 pt-3 border-t border-gray-200/60 grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* 4-choice Test Question */}
                        <div className="space-y-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                          <div className="space-y-1">
                            <h5 className="text-[11px] font-black text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                              <CheckCircle2 size={14} className="text-blue-600" /> Kontrolní otázka ke kroku (volitelná)
                            </h5>
                            <p className="text-[11px] text-gray-400 font-medium">
                              Otázka pro ověření pochopení tohoto konkrétního kroku (výběr ze 4 možností).
                            </p>
                          </div>

                          <Input
                            value={step.testQuestion || ''}
                            onChange={e => updateStep(idx, 'testQuestion', e.target.value)}
                            placeholder="Znění kontrolní otázky..."
                            className="h-9 text-xs rounded-xl bg-gray-50/80 font-medium"
                          />

                          <div className="space-y-2 pt-1">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                              Možnosti A–D (kliknutím na písmeno označte správnou)
                            </span>
                            {[0, 1, 2, 3].map(optIdx => {
                              const letter = ['A', 'B', 'C', 'D'][optIdx];
                              const val = step.testOptions?.[optIdx] || '';
                              const isCorrect = Boolean(val && step.correctAnswer === val);

                              return (
                                <div key={optIdx} className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (val) {
                                        updateStep(idx, 'correctAnswer', val);
                                      }
                                    }}
                                    className={`w-7 h-7 rounded-lg text-xs font-black flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                                      isCorrect
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                                    }`}
                                    title={isCorrect ? 'Označeno jako správná odpověď' : `Klikněte pro nastavení ${letter} jako správné`}
                                  >
                                    {letter}
                                  </button>
                                  <Input
                                    value={val}
                                    onChange={e => {
                                      const newVal = e.target.value;
                                      const wasCorrect = step.correctAnswer === val;
                                      updateStepOption(idx, optIdx, newVal);
                                      if (wasCorrect) {
                                        updateStep(idx, 'correctAnswer', newVal);
                                      }
                                    }}
                                    placeholder={`Možnost ${letter}`}
                                    className={`h-8 text-xs rounded-xl ${isCorrect ? 'border-emerald-500 bg-emerald-50/40 font-bold text-emerald-950' : 'bg-gray-50'}`}
                                  />
                                  {isCorrect && (
                                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0">
                                      Správná
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          <div className="space-y-1.5 pt-1.5 border-t border-gray-100">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                              Zvolená správná odpověď:
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {[0, 1, 2, 3].map(optIdx => {
                                const letter = ['A', 'B', 'C', 'D'][optIdx];
                                const val = step.testOptions?.[optIdx]?.trim();
                                const isCorrect = Boolean(val && step.correctAnswer === val);
                                if (!val) return null;

                                return (
                                  <button
                                    key={optIdx}
                                    type="button"
                                    onClick={() => updateStep(idx, 'correctAnswer', val)}
                                    className={`flex items-center gap-2 p-1.5 px-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                      isCorrect
                                        ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500 shadow-2xs'
                                        : 'bg-white border-gray-200 hover:bg-gray-50'
                                    }`}
                                  >
                                    <span className={`w-5 h-5 rounded-md text-[10px] font-black flex items-center justify-center shrink-0 ${
                                      isCorrect ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'
                                    }`}>
                                      {letter}
                                    </span>
                                    <div className="flex-1 min-w-0 text-xs font-bold text-gray-900 truncate">
                                      <MathRenderer content={val} inline />
                                    </div>
                                    {isCorrect && (
                                      <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded uppercase shrink-0">
                                        ✓
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                            {step.correctAnswer && (
                              <div className="flex items-center gap-1.5 p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-950 mt-1">
                                <span className="text-[10px] uppercase tracking-wider text-emerald-700">Správně:</span>
                                <MathRenderer content={step.correctAnswer} inline />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Tutor Tip */}
                        <div className="space-y-3 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col">
                          <div className="space-y-1">
                            <h5 className="text-[11px] font-black text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                              <Sparkles size={14} className="text-amber-600" /> Bublinka s tipem od lektora
                            </h5>
                            <p className="text-[11px] text-gray-400 font-medium">
                              Tento tip se studentovi zobrazí v přehledné bublince až po rozkliknutí tlačítka u kroku.
                            </p>
                          </div>
                          <textarea
                            value={step.tutorTip || ''}
                            onChange={e => updateStep(idx, 'tutorTip', e.target.value)}
                            rows={6}
                            placeholder="Extra doporučení lektora, pomůcka, trik nebo častá chyba v tomto kroku..."
                            className="w-full flex-1 p-3 rounded-xl border border-gray-200 text-xs bg-gray-50/70 focus:outline-none focus:ring-1 focus:ring-black resize-none font-medium leading-relaxed"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsStudyContentModalOpen(false)} className="rounded-xl cursor-pointer">
                Zrušit
              </Button>
              <Button type="submit" className="rounded-xl bg-[#1E1B18] text-white font-bold cursor-pointer">
                Uložit studium
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2C: EDIT PRACTICE CONFIGURATION ("Upravit Procvičování") */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isPracticeConfigModalOpen} onOpenChange={setIsPracticeConfigModalOpen}>
        <DialogContent className="rounded-3xl p-6 sm:p-8 w-full sm:max-w-xl bg-white shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <SlidersHorizontal size={20} />
              </div>
              <div>
                <DialogTitle className="text-2xl font-display font-black text-[#1E1B18]">
                  Upravit Procvičování
                </DialogTitle>
                <p className="text-xs text-gray-500 font-medium mt-0.5">
                  {configuringSubtopic?.title || 'Podtéma'}
                </p>
              </div>
            </div>
          </DialogHeader>

          {configuringSubtopic && (() => {
            const subQuestions = questionsMap[configuringSubtopic.id] || [];
            const availableEasy = subQuestions.filter(q => (q.difficulty || 'Střední') === 'Lehká').length;
            const availableMed = subQuestions.filter(q => (q.difficulty || 'Střední') === 'Střední').length;
            const availableHard = subQuestions.filter(q => (q.difficulty || 'Střední') === 'Těžká').length;
            const totalAvailable = subQuestions.length;
            const currentTotal = (Number(practiceConfigForm.easyCount) || 0) + (Number(practiceConfigForm.mediumCount) || 0) + (Number(practiceConfigForm.hardCount) || 0);

            return (
              <form onSubmit={handleSavePracticeConfig} className="space-y-5 py-2">
                {/* Bank status overview */}
                <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Otázky v bance podtématu:
                    </span>
                    <span className="text-xs font-black text-gray-800">
                      Celkem {totalAvailable} {totalAvailable === 1 ? 'otázka' : totalAvailable < 5 ? 'otázky' : 'otázek'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="p-2.5 bg-emerald-50/70 border border-emerald-200/70 rounded-xl">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 block">Lehké</span>
                      <span className="text-lg font-black text-emerald-900">{availableEasy}</span>
                    </div>
                    <div className="p-2.5 bg-amber-50/70 border border-amber-200/70 rounded-xl">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block">Střední</span>
                      <span className="text-lg font-black text-amber-900">{availableMed}</span>
                    </div>
                    <div className="p-2.5 bg-rose-50/70 border border-rose-200/70 rounded-xl">
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 block">Těžké</span>
                      <span className="text-lg font-black text-rose-900">{availableHard}</span>
                    </div>
                  </div>
                </div>

                {/* Form fields: counts per difficulty */}
                <div className="space-y-3">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-gray-700">
                    Kolik otázek vylosovat pro žáka:
                  </h5>

                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-3 p-3 bg-white border border-gray-200 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                        <div>
                          <label className="text-xs font-bold text-gray-800 block">Počet lehkých otázek</label>
                          <span className="text-[10px] text-gray-400">Dostupných: {availableEasy}</span>
                        </div>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        value={practiceConfigForm.easyCount}
                        onChange={e => setPracticeConfigForm(prev => ({ ...prev, easyCount: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                        className="w-24 h-10 text-center font-bold text-sm rounded-xl"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 p-3 bg-white border border-gray-200 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                        <div>
                          <label className="text-xs font-bold text-gray-800 block">Počet středních otázek</label>
                          <span className="text-[10px] text-gray-400">Dostupných: {availableMed}</span>
                        </div>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        value={practiceConfigForm.mediumCount}
                        onChange={e => setPracticeConfigForm(prev => ({ ...prev, mediumCount: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                        className="w-24 h-10 text-center font-bold text-sm rounded-xl"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 p-3 bg-white border border-gray-200 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                        <div>
                          <label className="text-xs font-bold text-gray-800 block">Počet těžkých otázek</label>
                          <span className="text-[10px] text-gray-400">Dostupných: {availableHard}</span>
                        </div>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        value={practiceConfigForm.hardCount}
                        onChange={e => setPracticeConfigForm(prev => ({ ...prev, hardCount: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                        className="w-24 h-10 text-center font-bold text-sm rounded-xl"
                      />
                    </div>
                  </div>
                </div>

                {/* Status Callout */}
                <div className={`p-4 rounded-2xl border text-xs font-medium space-y-1 ${
                  currentTotal > 0
                    ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950'
                    : 'bg-gray-50 border-gray-200 text-gray-600'
                }`}>
                  <div className="flex items-center justify-between font-bold">
                    <span>Celkem otázek pro žáka:</span>
                    <span className="text-sm font-black text-indigo-700">
                      {currentTotal > 0 ? `${currentTotal} otázek` : 'Všechny otázky (bez omezení)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    {currentTotal > 0
                      ? 'Při spuštění procvičování systém náhodně vylosuje zadané počty a seřadí je od lehkých po těžké.'
                      : 'Při zadání 0 (nebo nevyplnění) dostane student k procvičení všechny otázky z banky.'}
                  </p>

                  {(practiceConfigForm.easyCount > availableEasy ||
                    practiceConfigForm.mediumCount > availableMed ||
                    practiceConfigForm.hardCount > availableHard) && (
                    <div className="pt-1 text-amber-800 font-bold flex items-center gap-1">
                      <AlertTriangle size={13} className="shrink-0" />
                      <span>
                        Upozornění: Požadovaný počet některých otázek přesahuje aktuální počet v bance. Žákovi se vygeneruje tolik otázek, kolik jich je reálně k dispozici.
                      </span>
                    </div>
                  )}
                </div>

                <DialogFooter className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleResetPracticeConfig}
                    className="text-xs text-gray-500 hover:text-red-600 rounded-xl cursor-pointer w-full sm:w-auto"
                  >
                    Resetovat na všechny otázky
                  </Button>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsPracticeConfigModalOpen(false)}
                      className="rounded-xl cursor-pointer"
                    >
                      Zrušit
                    </Button>
                    <Button
                      type="submit"
                      className="rounded-xl bg-[#1E1B18] text-white font-bold cursor-pointer"
                    >
                      Uložit nastavení
                    </Button>
                  </div>
                </DialogFooter>
              </form>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: CREATE / EDIT QUESTION (CHOICE OR OPEN)              */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isQuestionModalOpen} onOpenChange={setIsQuestionModalOpen}>
        <DialogContent className="rounded-3xl p-6 sm:p-10 w-full sm:max-w-3xl lg:max-w-4xl bg-white max-h-[92vh] overflow-y-auto shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-black text-[#1E1B18]">
              {editingQuestion?.id ? 'Upravit otázku' : 'Nová otázka'}
            </DialogTitle>
          </DialogHeader>

          <form 
            onSubmit={handleSaveQuestion} 
            className="space-y-5 py-2"
            onFocusCapture={handleInputTrack}
            onSelectCapture={handleInputTrack}
            onKeyUpCapture={handleInputTrack}
            onMouseUpCapture={handleInputTrack}
          >
            {/* Type & Difficulty selector grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">Typ otázky</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingQuestion(prev => ({ 
                      ...prev, 
                      type: 'choice',
                      options: prev?.options?.length ? prev.options : ['', '', '', '']
                    }))}
                    className={`p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      editingQuestion?.type === 'choice'
                        ? 'bg-[#1E1B18] text-white border-transparent shadow-sm'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    4 možnosti
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingQuestion(prev => ({ ...prev, type: 'open' }))}
                    className={`p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      editingQuestion?.type === 'open'
                        ? 'bg-[#1E1B18] text-white border-transparent shadow-sm'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Volná odpověď
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1.5">Obtížnost otázky</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Lehká', 'Střední', 'Těžká'] as const).map(diff => {
                    const isSelected = (editingQuestion?.difficulty || 'Střední') === diff;
                    const colorClasses = diff === 'Lehká'
                      ? (isSelected ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100/60')
                      : diff === 'Těžká'
                        ? (isSelected ? 'bg-rose-600 text-white border-rose-600 shadow-sm' : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100/60')
                        : (isSelected ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100/60');

                    return (
                      <button
                        key={diff}
                        type="button"
                        onClick={() => setEditingQuestion(prev => prev ? ({ ...prev, difficulty: diff }) : null)}
                        className={`p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${colorClasses}`}
                      >
                        <span>{diff}</span>
                        {isSelected && <span className="text-[10px]">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Jediná univerzální sekce Matematika: pro celý formulář otázky */}
            <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs pb-1 pt-0.5">
              <QuickFormulaToolbar 
                onInsert={insertSnippetAtCursor}
              />
            </div>

            {/* Question Text with Live Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-700 block">Zadání otázky *</label>
                <span className="text-[11px] text-gray-400">Podporuje KaTeX & Markdown ($vzor$ / $$blok$$)</span>
              </div>

              <textarea
                required
                data-field="question"
                rows={3}
                value={editingQuestion?.question || ''}
                onChange={e => setEditingQuestion(prev => ({ ...prev, question: e.target.value }))}
                placeholder="Zadejte text otázky nebo úlohy (např. Vypočtěte hodnotu výrazu: $\frac{1}{2} + \frac{3}{4}$)..."
                className="w-full rounded-xl border border-gray-200 p-3.5 text-sm focus:border-black outline-none font-medium leading-snug bg-white"
              />

              {/* Question Live Preview */}
              {editingQuestion?.question && (
                <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200 space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-amber-800">
                    <span>Náhled zadání v reálném čase:</span>
                    {!validateLatexSyntax(editingQuestion.question).isValid && (
                      <span className="text-rose-600 normal-case font-bold">
                        ⚠️ {validateLatexSyntax(editingQuestion.question).error}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold text-gray-900 leading-snug">
                    <MathRenderer content={editingQuestion.question} />
                  </div>
                </div>
              )}
            </div>

            {/* Optional Question Image / SVG (pod zadáním) */}
            <div className="space-y-2.5 bg-[#FAF7F0] p-4 sm:p-5 rounded-2xl border border-gray-200/80">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                  <ImageIcon size={15} className="text-amber-600" />
                  <span>Grafický podklad / Obrázek k úloze (volitelný – konvertuje se do SVG)</span>
                </label>
                {(editingQuestion?.svgContent || editingQuestion?.imageUrl) && (
                  <button
                    type="button"
                    onClick={() => setEditingQuestion(prev => ({ ...prev, svgContent: '', imageUrl: '' }))}
                    className="text-xs font-bold text-red-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Odebrat obrázek/SVG</span>
                  </button>
                )}
              </div>

              {isUploadingImage ? (
                <div className="border-2 border-dashed border-amber-300 bg-amber-50/70 rounded-2xl p-6 text-center space-y-2 animate-pulse">
                  <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="font-bold text-xs text-amber-900">{conversionMsg || 'Zpracovávám soubor a převádím do SVG...'}</p>
                </div>
              ) : (editingQuestion?.svgContent || editingQuestion?.imageUrl) ? (
                <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col items-center justify-center space-y-2.5 shadow-2xs">
                  {editingQuestion?.svgContent ? (
                    <div 
                      className="w-full flex justify-center [&>svg]:max-h-56 [&>svg]:w-auto [&>svg]:max-w-full overflow-hidden p-2 bg-[#FAF7F0] rounded-lg"
                      dangerouslySetInnerHTML={{ __html: sanitizeSvg(editingQuestion.svgContent) }}
                    />
                  ) : (
                    <img
                      src={editingQuestion.imageUrl}
                      alt="Náhled k úloze"
                      className="max-h-52 w-auto max-w-full rounded-lg object-contain border border-gray-100 shadow-2xs"
                    />
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 w-full pt-1 border-t border-gray-100">
                    <span className="text-[11px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      {editingQuestion?.svgContent ? 'Uloženo jako vektorové SVG (vkládá se přímo do stránky)' : 'Obrázek (URL / data)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingQuestion(prev => ({ ...prev, svgContent: '', imageUrl: '' }))}
                      className="px-2.5 py-1 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      Smazat
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row items-center gap-2.5">
                    {/* File Upload Button (PDF, SVG, PNG, JPG, WebP) */}
                    <label className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-gray-700 flex items-center justify-center gap-2 cursor-pointer shadow-2xs hover:border-black transition-all shrink-0">
                      <Upload size={14} className="text-amber-600" />
                      <span>Nahrát soubor (obrázek / SVG / PDF)</span>
                      <input
                        type="file"
                        accept=".pdf,.svg,.png,.jpg,.jpeg,.webp,image/*,application/pdf"
                        className="hidden"
                        onChange={handleQuestionImageUpload}
                        disabled={isUploadingImage}
                      />
                    </label>

                    <span className="text-xs text-gray-400 font-semibold shrink-0">nebo URL:</span>

                    {/* URL Input */}
                    <div className="flex-1 w-full">
                      <Input
                        type="text"
                        placeholder="https://... nebo /materials/obrazek.svg"
                        value={editingQuestion?.imageUrl || ''}
                        onChange={e => setEditingQuestion(prev => ({ ...prev, imageUrl: e.target.value, svgContent: '' }))}
                        className="rounded-xl h-10 text-xs bg-white"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 font-medium">
                    Nahraný soubor (PNG, JPG, WebP, SVG i PDF) se <strong>automaticky převede na SVG</strong> a vloží se přímo do stránky pod zadání otázky, stejně jako studijní materiály.
                  </p>
                </div>
              )}
            </div>

            {/* Options if choice */}
            {editingQuestion?.type === 'choice' && (
              <div className="space-y-3 bg-gray-50/70 p-5 rounded-2xl border border-gray-200/80">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700 block">
                    4 Možnosti odpovědi (A–D)
                  </label>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Klikněte na písmeno pro označení správné
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                  {['A', 'B', 'C', 'D'].map((letter, idx) => {
                    const val = (editingQuestion.options && editingQuestion.options[idx]) || '';
                    const isCorrect = Boolean(val && editingQuestion.correctAnswer === val);
                    const hasMath = Boolean(val && (val.includes('$') || val.includes('\\') || val.includes('/') || val.includes('^')));

                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (val) {
                                setEditingQuestion(prev => ({ ...prev, correctAnswer: val }));
                              }
                            }}
                            className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                              isCorrect
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
                            }`}
                            title={isCorrect ? 'Označeno jako správná odpověď' : `Klikněte pro nastavení ${letter} jako správné`}
                          >
                            {letter}
                          </button>
                          <Input
                            required
                            value={val}
                            onChange={e => {
                              const newVal = e.target.value;
                              const wasCorrect = editingQuestion.correctAnswer === val;
                              const opts = [...(editingQuestion.options || ['', '', '', ''])];
                              opts[idx] = newVal;
                              setEditingQuestion(prev => ({
                                ...prev,
                                options: opts,
                                ...(wasCorrect ? { correctAnswer: newVal } : {})
                              }));
                            }}
                            placeholder={`Možnost ${letter} (např. $\\frac{1}{2}$ nebo 5)`}
                            className={`rounded-xl h-10 text-xs font-medium flex-1 ${isCorrect ? 'border-emerald-500 bg-emerald-50/40 font-bold text-emerald-950' : 'bg-white'}`}
                          />
                          {isCorrect && (
                            <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md uppercase tracking-wider shrink-0">
                              Správná
                            </span>
                          )}
                        </div>
                        {hasMath && (
                          <div className="pl-10 text-xs text-gray-700 flex items-center gap-1 font-semibold">
                            <span className="text-[10px] text-gray-400">Náhled:</span>
                            <span className="px-2 py-0.5 bg-white border border-gray-200 rounded-md shadow-2xs">
                              <MathRenderer content={val} inline />
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Visual Picker for correct answer */}
                <div className="pt-3 border-t border-gray-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-800 block">
                      Výběr správné odpovědi z možností (A–D): *
                    </label>
                    <span className="text-[10px] text-gray-400 font-medium">Klikněte na možnost pro označení správné</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {['A', 'B', 'C', 'D'].map((letter, idx) => {
                      const val = (editingQuestion.options && editingQuestion.options[idx])?.trim() || '';
                      const isCorrect = Boolean(val && editingQuestion.correctAnswer === val);

                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={!val}
                          onClick={() => {
                            if (val) {
                              setEditingQuestion(prev => ({ ...prev, correctAnswer: val }));
                            }
                          }}
                          className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                            !val 
                              ? 'opacity-40 bg-gray-50 border-dashed border-gray-200 cursor-not-allowed'
                              : isCorrect
                                ? 'bg-emerald-50/90 border-emerald-500 shadow-xs ring-2 ring-emerald-500/20'
                                : 'bg-white border-gray-200 hover:border-gray-400 hover:bg-gray-50'
                          }`}
                        >
                          <span className={`w-7 h-7 rounded-xl text-xs font-black flex items-center justify-center shrink-0 transition-colors ${
                            isCorrect 
                              ? 'bg-emerald-600 text-white shadow-xs' 
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            {letter}
                          </span>
                          
                          <div className="flex-1 min-w-0 text-sm font-bold text-gray-900 leading-snug">
                            {val ? (
                              <MathRenderer content={val} inline />
                            ) : (
                              <span className="text-xs text-gray-400 italic font-normal">Nevyplněno</span>
                            )}
                          </div>

                          {isCorrect && (
                            <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg uppercase tracking-wider shrink-0 flex items-center gap-1">
                              <CheckCircle2 size={13} />
                              <span>Správná</span>
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {editingQuestion.correctAnswer && (
                    <div className="flex items-center gap-2.5 p-3 bg-emerald-50/80 border border-emerald-200 rounded-2xl text-xs text-emerald-950 mt-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 shrink-0">
                        Aktivní správná odpověď:
                      </span>
                      <div className="font-bold text-sm bg-white px-3 py-1 rounded-xl border border-emerald-200 shadow-2xs">
                        <MathRenderer content={editingQuestion.correctAnswer} inline />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Correct Answer input only for 'open' (vepisovací) questions */}
            {editingQuestion?.type === 'open' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Správná odpověď (hodnota pro vyhodnocení – např. 1/2 nebo $\frac{1}{2}$ nebo 0,5) *
                </label>
                <Input
                  required
                  value={editingQuestion?.correctAnswer || ''}
                  onChange={e => setEditingQuestion(prev => ({ ...prev, correctAnswer: e.target.value }))}
                  placeholder="Např. 1/2 nebo 36 nebo x=5"
                  className="rounded-xl h-11 font-bold border-emerald-300 focus:border-emerald-600 bg-white"
                />
                {editingQuestion?.correctAnswer && (
                  <div className="text-xs text-emerald-800 flex items-center gap-1 font-semibold pt-0.5">
                    <span className="text-[10px] text-gray-400">Náhled odpovědi:</span>
                    <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-md">
                      <MathRenderer content={editingQuestion.correctAnswer} inline />
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Student hint (takes full width, difficulty removed) */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-700 block mb-1">Nápověda pro studenta (volitelná)</label>
              <Input
                value={editingQuestion?.hint || ''}
                onChange={e => setEditingQuestion(prev => ({ ...prev, hint: e.target.value }))}
                placeholder="Drobná rada při zaseknutí..."
                className="rounded-xl h-11 text-xs"
              />
              {editingQuestion?.hint && (
                <div className="text-xs text-gray-700 flex items-center gap-1 font-medium pt-0.5">
                  <span className="text-[10px] text-gray-400">Náhled nápovědy:</span>
                  <span className="px-2 py-0.5 bg-amber-50 border border-amber-200/80 rounded-md">
                    <MathRenderer content={editingQuestion.hint} inline />
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-700 block">Vysvětlení a postup řešení (volitelné)</label>
                <span className="text-[11px] text-gray-400">Zobrazí se studentovi po odevzdání</span>
              </div>
              <textarea
                rows={2}
                value={editingQuestion?.explanation || ''}
                onChange={e => setEditingQuestion(prev => ({ ...prev, explanation: e.target.value }))}
                placeholder="Zobrazí se studentovi po odevzdání odpovědi..."
                className="w-full rounded-xl border border-gray-200 p-3 text-xs focus:border-black outline-none font-medium leading-snug bg-white"
              />
              {editingQuestion?.explanation && (
                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-1 text-xs">
                  <span className="font-bold text-gray-600 block">Náhled vysvětlení:</span>
                  <MathRenderer content={editingQuestion.explanation} />
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsQuestionModalOpen(false)} className="rounded-xl">
                Zrušit
              </Button>
              <Button type="submit" className="rounded-xl bg-[#1E1B18] text-white font-bold">
                Uložit otázku
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 4A: EXCEL IMPORT - PROCVIČOVÁNÍ                          */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isPracticeModalOpen} onOpenChange={(open) => {
        setIsPracticeModalOpen(open);
        if (!open) {
          setPracticeFile(null);
          setPracticeParsed(null);
          setPracticeStats(null);
        }
      }}>
        <DialogContent className="rounded-3xl p-6 sm:p-8 w-full sm:max-w-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-black text-[#1E1B18] flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-[#B80053]/10 text-[#B80053] flex items-center justify-center">
                <Upload size={20} />
              </div>
              <span>Import úloh do procvičování</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-pink-50/60 rounded-2xl border border-pink-100 text-xs">
              <span className="text-gray-700 font-medium">
                Importujte otázky (výběr ze 4 možností i volná odpověď) s automatickou deduplikací a sloupcem Obtížnost (Lehká / Střední / Těžká).
              </span>
              <a 
                href="/ProEdu_Import_Procvicovani.xlsx" 
                download 
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#B80053] border border-pink-200 hover:bg-pink-100 font-bold rounded-xl shrink-0 transition-colors"
              >
                <FileSpreadsheet size={14} />
                <span>Stáhnout šablonu (.xlsx)</span>
              </a>
            </div>

            {/* Dropzone */}
            {!practiceStats && (
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center hover:border-black transition-colors">
                <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handlePracticeFileChange}
                  className="hidden"
                  id="practice-excel-input"
                  disabled={isImportingPractice}
                />
                <label 
                  htmlFor="practice-excel-input" 
                  className="inline-block px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold text-xs cursor-pointer transition-colors"
                >
                  Vybrat soubor Excel (.xlsx) pro procvičování
                </label>
                {practiceFile && (
                  <p className="text-xs font-bold text-emerald-700 mt-2 truncate">
                    Vybráno: {practiceFile.name}
                  </p>
                )}
              </div>
            )}

            {/* Validation / Parsing preview */}
            {practiceParsed && !practiceStats && (
              <div className="space-y-3">
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-xs space-y-1.5 text-emerald-950 font-medium">
                  <div className="font-bold text-sm text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle2 size={16} /> Soubor zkontrolován
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="bg-white p-2 rounded-xl shadow-xs border border-emerald-100">
                      <div className="text-lg font-black text-emerald-800">{practiceParsed.validRows.length}</div>
                      <div className="text-[10px] text-gray-500 uppercase font-bold">Platných otázek</div>
                    </div>
                    <div className="bg-white p-2 rounded-xl shadow-xs border border-emerald-100">
                      <div className="text-lg font-black text-gray-800">{practiceParsed.topicsFound.length}</div>
                      <div className="text-[10px] text-gray-500 uppercase font-bold">Témat</div>
                    </div>
                    <div className="bg-white p-2 rounded-xl shadow-xs border border-emerald-100">
                      <div className="text-lg font-black text-gray-800">{practiceParsed.subtopicsFound.length}</div>
                      <div className="text-[10px] text-gray-500 uppercase font-bold">Podtémat</div>
                    </div>
                  </div>
                </div>

                {practiceParsed.invalidRows.length > 0 && (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs space-y-2 text-amber-950">
                    <div className="font-bold text-amber-900 flex items-center gap-1.5">
                      <AlertCircle size={15} /> Neplatné řádky ({practiceParsed.invalidRows.length} z {practiceParsed.totalRows}):
                    </div>
                    <p className="text-[11px] text-amber-800">
                      Tyto řádky nebudou importovány. Můžete soubor opravit a nahrát znovu, nebo pokračovat s platnými řádky.
                    </p>
                    <ul className="list-disc pl-4 space-y-1 max-h-32 overflow-y-auto text-[11px]">
                      {practiceParsed.invalidRows.map((inv, idx) => (
                        <li key={idx}>
                          <strong>Řádek {inv.rowNumber}:</strong> {inv.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Importing indicator */}
            {isImportingPractice && (
              <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100 text-center space-y-2">
                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold text-blue-900">{practiceProgressMsg || 'Probíhá import do databáze...'}</p>
                <p className="text-[11px] text-blue-700">Kontroluji a vynechávám případné duplikáty...</p>
              </div>
            )}

            {/* Final Statistics Report */}
            {practiceStats && (
              <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-3">
                <div className="flex items-center gap-2 text-emerald-900 font-black text-base">
                  <CheckCircle2 size={20} className="text-emerald-600" />
                  <span>Import procvičování byl úspěšně dokončen!</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center text-xs">
                  <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-xs">
                    <div className="text-2xl font-black text-emerald-700">{practiceStats.importedQuestions}</div>
                    <div className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">Naimportováno úloh</div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-xs">
                    <div className="text-2xl font-black text-gray-500">{practiceStats.skippedDuplicates}</div>
                    <div className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">Přeskočeno duplikátů</div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-xs">
                    <div className="text-2xl font-black text-gray-800">{practiceStats.topicsCreated}</div>
                    <div className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">Nových témat</div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-xs">
                    <div className="text-2xl font-black text-gray-800">{practiceStats.subtopicsCreated}</div>
                    <div className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">Nových podtémat</div>
                  </div>
                </div>

                {practiceStats.errors.length > 0 && (
                  <div className="p-3 bg-red-50 rounded-xl border border-red-100 text-xs text-red-900 space-y-1">
                    <div className="font-bold">Varování během ukládání:</div>
                    <ul className="list-disc pl-4 text-[11px] space-y-0.5">
                      {practiceStats.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="pt-2">
              {practiceStats ? (
                <Button 
                  onClick={() => {
                    setIsPracticeModalOpen(false);
                    setPracticeFile(null);
                    setPracticeParsed(null);
                    setPracticeStats(null);
                  }}
                  className="rounded-xl bg-[#1E1B18] text-white font-bold w-full sm:w-auto"
                >
                  Hotovo
                </Button>
              ) : (
                <>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsPracticeModalOpen(false)} 
                    disabled={isImportingPractice}
                    className="rounded-xl"
                  >
                    Zrušit
                  </Button>
                  <Button 
                    onClick={handleExecutePracticeImport}
                    disabled={!practiceParsed || practiceParsed.validRows.length === 0 || isImportingPractice}
                    className="rounded-xl bg-[#B80053] hover:bg-[#9a0045] text-white font-bold"
                  >
                    {isImportingPractice ? 'Importuji...' : `Potvrdit a importovat (${practiceParsed?.validRows.length || 0} úloh)`}
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 4B: EXCEL IMPORT - STUDIUM (KROKY)                       */}
      {/* ------------------------------------------------------------- */}
      <Dialog open={isStudyModalOpen} onOpenChange={(open) => {
        setIsStudyModalOpen(open);
        if (!open) {
          setStudyFile(null);
          setStudyParsed(null);
          setStudyStats(null);
        }
      }}>
        <DialogContent className="rounded-3xl p-6 sm:p-8 w-full sm:max-w-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-display font-black text-[#1E1B18] flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-[#0F5238]/10 text-[#0F5238] flex items-center justify-center">
                <BookOpen size={20} />
              </div>
              <span>Import kroků výkladu (Studovat)</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-emerald-50/60 rounded-2xl border border-emerald-100 text-xs">
              <span className="text-gray-700 font-medium">
                Importujte krokový výklad teorie s ověřovacími otázkami a tipy lektora.
              </span>
              <a 
                href="/ProEdu_Import_Studovat.xlsx" 
                download 
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#0F5238] border border-emerald-200 hover:bg-emerald-100 font-bold rounded-xl shrink-0 transition-colors"
              >
                <FileSpreadsheet size={14} />
                <span>Stáhnout šablonu (.xlsx)</span>
              </a>
            </div>

            {/* Dropzone */}
            {!studyStats && (
              <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center hover:border-black transition-colors">
                <Upload size={32} className="mx-auto text-gray-400 mb-2" />
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleStudyFileChange}
                  className="hidden"
                  id="study-excel-input"
                  disabled={isImportingStudy}
                />
                <label 
                  htmlFor="study-excel-input" 
                  className="inline-block px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl font-bold text-xs cursor-pointer transition-colors"
                >
                  Vybrat soubor Excel (.xlsx) pro studium
                </label>
                {studyFile && (
                  <p className="text-xs font-bold text-emerald-700 mt-2 truncate">
                    Vybráno: {studyFile.name}
                  </p>
                )}
              </div>
            )}

            {/* Validation / Parsing preview */}
            {studyParsed && !studyStats && (
              <div className="space-y-3">
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-xs space-y-1.5 text-emerald-950 font-medium">
                  <div className="font-bold text-sm text-emerald-900 flex items-center gap-1.5">
                    <CheckCircle2 size={16} /> Soubor zkontrolován
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                    <div className="bg-white p-2 rounded-xl shadow-xs border border-emerald-100">
                      <div className="text-lg font-black text-emerald-800">{studyParsed.validRows.length}</div>
                      <div className="text-[10px] text-gray-500 uppercase font-bold">Platných kroků</div>
                    </div>
                    <div className="bg-white p-2 rounded-xl shadow-xs border border-emerald-100">
                      <div className="text-lg font-black text-gray-800">{studyParsed.topicsFound.length}</div>
                      <div className="text-[10px] text-gray-500 uppercase font-bold">Témat</div>
                    </div>
                    <div className="bg-white p-2 rounded-xl shadow-xs border border-emerald-100">
                      <div className="text-lg font-black text-gray-800">{studyParsed.subtopicsFound.length}</div>
                      <div className="text-[10px] text-gray-500 uppercase font-bold">Podtémat</div>
                    </div>
                  </div>
                </div>

                {studyParsed.invalidRows.length > 0 && (
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs space-y-2 text-amber-950">
                    <div className="font-bold text-amber-900 flex items-center gap-1.5">
                      <AlertCircle size={15} /> Neplatné řádky ({studyParsed.invalidRows.length} z {studyParsed.totalRows}):
                    </div>
                    <p className="text-[11px] text-amber-800">
                      Tyto řádky nebudou importovány. Můžete soubor opravit a nahrát znovu, nebo pokračovat s platnými řádky.
                    </p>
                    <ul className="list-disc pl-4 space-y-1 max-h-32 overflow-y-auto text-[11px]">
                      {studyParsed.invalidRows.map((inv, idx) => (
                        <li key={idx}>
                          <strong>Řádek {inv.rowNumber}:</strong> {inv.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Importing indicator */}
            {isImportingStudy && (
              <div className="p-5 bg-blue-50 rounded-2xl border border-blue-100 text-center space-y-2">
                <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold text-blue-900">{studyProgressMsg || 'Probíhá import do databáze...'}</p>
                <p className="text-[11px] text-blue-700">Kontroluji a vynechávám případné duplikáty kroků...</p>
              </div>
            )}

            {/* Final Statistics Report */}
            {studyStats && (
              <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-3">
                <div className="flex items-center gap-2 text-emerald-900 font-black text-base">
                  <CheckCircle2 size={20} className="text-emerald-600" />
                  <span>Import studia byl úspěšně dokončen!</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center text-xs">
                  <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-xs">
                    <div className="text-2xl font-black text-emerald-700">{studyStats.importedSteps}</div>
                    <div className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">Naimportováno kroků</div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-xs">
                    <div className="text-2xl font-black text-gray-500">{studyStats.skippedDuplicates}</div>
                    <div className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">Přeskočeno duplikátů</div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-xs">
                    <div className="text-2xl font-black text-gray-800">{studyStats.subtopicsUpdated}</div>
                    <div className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">Doplněno podtémat</div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-xs">
                    <div className="text-2xl font-black text-gray-800">{studyStats.topicsCreated + studyStats.subtopicsCreated}</div>
                    <div className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">Nových témat / podtémat</div>
                  </div>
                </div>

                {studyStats.errors.length > 0 && (
                  <div className="p-3 bg-red-50 rounded-xl border border-red-100 text-xs text-red-900 space-y-1">
                    <div className="font-bold">Varování během ukládání:</div>
                    <ul className="list-disc pl-4 text-[11px] space-y-0.5">
                      {studyStats.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="pt-2">
              {studyStats ? (
                <Button 
                  onClick={() => {
                    setIsStudyModalOpen(false);
                    setStudyFile(null);
                    setStudyParsed(null);
                    setStudyStats(null);
                  }}
                  className="rounded-xl bg-[#1E1B18] text-white font-bold w-full sm:w-auto"
                >
                  Hotovo
                </Button>
              ) : (
                <>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsStudyModalOpen(false)} 
                    disabled={isImportingStudy}
                    className="rounded-xl"
                  >
                    Zrušit
                  </Button>
                  <Button 
                    onClick={handleExecuteStudyImport}
                    disabled={!studyParsed || studyParsed.validRows.length === 0 || isImportingStudy}
                    className="rounded-xl bg-[#0F5238] hover:bg-[#0b3c29] text-white font-bold"
                  >
                    {isImportingStudy ? 'Importuji...' : `Potvrdit a importovat (${studyParsed?.validRows.length || 0} kroků)`}
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL 5: SELECT EXISTING MATERIAL */}
      <MaterialSelectorModal
        isOpen={isMaterialSelectorOpen}
        onClose={() => setIsMaterialSelectorOpen(false)}
        onSelect={handleSelectMaterial}
        activeSubject={activeSubject}
      />

      {/* MODAL 6: DELETE CONFIRMATION DIALOG */}
      <Dialog 
        open={deleteConfirm.isOpen} 
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeleteConfirm(prev => ({ ...prev, isOpen: false }));
          }
        }}
      >
        <DialogContent className="rounded-[2.5rem] p-6 sm:p-8 border-none shadow-2xl max-w-md bg-white">
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 shadow-inner">
                <AlertTriangle size={24} />
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-xl font-display font-black text-[#1E1B18]">
                  {deleteConfirm.type === 'topic' && 'Smazat téma?'}
                  {deleteConfirm.type === 'subtopic' && 'Smazat podtéma?'}
                  {deleteConfirm.type === 'question' && 'Smazat otázku?'}
                </DialogTitle>
                <p className="text-xs text-gray-500 font-medium">
                  Tato akce je nevratná a data budou trvale odstraněna.
                </p>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
              <p className="text-xs font-bold text-gray-700 leading-snug">
                Položka: <span className="text-[#1E1B18] font-black">"{deleteConfirm.title}"</span>
              </p>
              {deleteConfirm.details && (
                <p className="text-[11px] text-red-600 font-semibold leading-relaxed">
                  ⚠️ {deleteConfirm.details}
                </p>
              )}
            </div>

            <DialogFooter className="flex items-center justify-end gap-2.5 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteConfirm(prev => ({ ...prev, isOpen: false }))}
                disabled={isDeleting}
                className="rounded-xl border-gray-200 hover:bg-gray-50 font-bold text-xs h-10 px-4 cursor-pointer"
              >
                Zrušit
              </Button>
              <Button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs h-10 px-5 flex items-center gap-1.5 shadow-md cursor-pointer transition-transform active:scale-95"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Mazání...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Smazat</span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
