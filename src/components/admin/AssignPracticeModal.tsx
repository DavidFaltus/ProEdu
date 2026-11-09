import React, { useState, useEffect, useMemo } from 'react';
import {
  format,
  addDays,
  startOfDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { cs } from 'date-fns/locale';
import {
  Calendar,
  Plus,
  Trash2,
  Check,
  Search,
  Users,
  UserCheck,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  Copy,
  Sparkles,
  Loader2,
  AlertCircle,
  EyeOff,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { CalendarBlueIcon, CorrectCyanIcon, CapIcon } from '../common/CustomIcon';
import { useAuth } from '../../context/AuthContext';
import {
  PracticeTopic,
  PracticeSubtopic,
  Course,
} from '../../types';
import { StudentProgressItem } from '../../services/studentProgressService';
import {
  getTopics,
  getSubtopics,
  PREDEFINED_SUBJECTS,
} from '../../services/practiceService';
import {
  assignPracticeToStudentsByTeacher,
  TeacherExerciseAssignmentInput,
} from '../../services/calendarService';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

export interface AssignPracticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: StudentProgressItem[];
  courses: Course[];
  initialStudent?: StudentProgressItem | null;
  onAssignedSuccess?: () => void;
}

interface DraftAssignmentRow {
  rowId: string;
  subtopicId: string;
  subtopicTitle: string;
  topicId: string;
  topicTitle?: string;
  subjectId: string;
  dueDate: Date;
}

export default function AssignPracticeModal({
  isOpen,
  onClose,
  students,
  courses,
  initialStudent = null,
  onAssignedSuccess,
}: AssignPracticeModalProps) {
  const { user } = useAuth();

  // Target selection mode: 'single' | 'multiple' | 'course'
  const [targetMode, setTargetMode] = useState<'single' | 'multiple' | 'course'>('single');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState('');

  // Catalog state
  const [catalogSubject, setCatalogSubject] = useState<'Matematika' | 'Čeština'>('Matematika');
  const [catalogTopics, setCatalogTopics] = useState<PracticeTopic[]>([]);
  const [catalogSubtopics, setCatalogSubtopics] = useState<PracticeSubtopic[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [topicSearch, setTopicSearch] = useState('');

  // Assigned rows with individual dates
  const [rows, setRows] = useState<DraftAssignmentRow[]>([]);
  const [baseDate, setBaseDate] = useState<Date>(() => startOfDay(new Date()));

  // Active row ID for inline visual calendar popover
  const [openCalendarRowId, setOpenCalendarRowId] = useState<string | null>(null);
  const [pickerMonth, setPickerMonth] = useState<Date>(() => new Date());

  const [isSaving, setIsSaving] = useState(false);

  // Initialize when modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (initialStudent) {
      setTargetMode('single');
      setSelectedStudentIds([initialStudent.uid]);
    } else {
      setTargetMode('multiple');
      setSelectedStudentIds([]);
    }
    setSelectedCourseIds([]);
    setStudentSearch('');
    setTopicSearch('');
    setRows([]);
    setBaseDate(startOfDay(new Date()));
    setOpenCalendarRowId(null);
  }, [isOpen, initialStudent]);

  // Fetch topics & subtopics for catalogSubject
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    async function loadCatalog() {
      setLoadingCatalog(true);
      try {
        const [fetchedTopics, fetchedSubtopics] = await Promise.all([
          getTopics(catalogSubject),
          getSubtopics(undefined, catalogSubject),
        ]);
        if (active) {
          setCatalogTopics(fetchedTopics);
          setCatalogSubtopics(fetchedSubtopics);
        }
      } catch (err) {
        console.error('Failed to load catalog in AssignPracticeModal:', err);
      } finally {
        if (active) setLoadingCatalog(false);
      }
    }
    loadCatalog();
    return () => {
      active = false;
    };
  }, [isOpen, catalogSubject]);

  // Compute final list of recipient student IDs
  const effectiveStudentIds = useMemo(() => {
    if (targetMode === 'single') {
      return initialStudent ? [initialStudent.uid] : selectedStudentIds.slice(0, 1);
    }
    if (targetMode === 'multiple') {
      return selectedStudentIds;
    }
    // targetMode === 'course'
    if (selectedCourseIds.length === 0) return [];
    const matchingStudents = students.filter((s) => {
      const enrolled = s.enrolledCourseIds || [];
      return (
        selectedCourseIds.some((cid) => enrolled.includes(cid)) ||
        (s.courseId && selectedCourseIds.includes(s.courseId))
      );
    });
    return matchingStudents.map((s) => s.uid);
  }, [targetMode, initialStudent, selectedStudentIds, selectedCourseIds, students]);

  const filteredStudentsList = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
    );
  }, [students, studentSearch]);

  const makeRowId = () =>
    `row-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // Add or remove single subtopic
  const handleToggleSubtopic = (sub: PracticeSubtopic, topicTitle?: string) => {
    setRows((prev) => {
      const exists = prev.some((r) => r.subtopicId === sub.id);
      if (exists) {
        return prev.filter((r) => r.subtopicId !== sub.id);
      }
      const nextOffset = prev.length;
      return [
        ...prev,
        {
          rowId: makeRowId(),
          subtopicId: sub.id,
          subtopicTitle: sub.title,
          topicId: sub.topicId,
          topicTitle,
          subjectId: sub.subjectId || catalogSubject,
          dueDate: addDays(baseDate, nextOffset),
        },
      ];
    });
  };

  // Add or remove whole topic (all its subtopics)
  const handleToggleWholeTopic = (
    topic: PracticeTopic,
    topicSubtopics: PracticeSubtopic[]
  ) => {
    if (topicSubtopics.length === 0) return;
    setRows((prev) => {
      const allSelected = topicSubtopics.every((ts) =>
        prev.some((r) => r.subtopicId === ts.id)
      );
      if (allSelected) {
        return prev.filter(
          (r) => !topicSubtopics.some((ts) => ts.id === r.subtopicId)
        );
      }
      const existingSubIds = new Set(prev.map((r) => r.subtopicId));
      let offset = prev.length;
      const toAdd: DraftAssignmentRow[] = [];
      for (const ts of topicSubtopics) {
        if (!existingSubIds.has(ts.id)) {
          toAdd.push({
            rowId: makeRowId(),
            subtopicId: ts.id,
            subtopicTitle: ts.title,
            topicId: ts.topicId,
            topicTitle: topic.title,
            subjectId: ts.subjectId || catalogSubject,
            dueDate: addDays(baseDate, offset++),
          });
        }
      }
      return [...prev, ...toAdd];
    });
  };

  // Duplicate a row (e.g. to assign the same exercise on another date)
  const handleDuplicateRow = (row: DraftAssignmentRow) => {
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.rowId === row.rowId);
      const copy: DraftAssignmentRow = {
        ...row,
        rowId: makeRowId(),
        dueDate: addDays(row.dueDate, 1),
      };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const handleRemoveRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
    if (openCalendarRowId === rowId) {
      setOpenCalendarRowId(null);
    }
  };

  const handleUpdateRowDate = (rowId: string, newDate: Date) => {
    const cleanDate = startOfDay(newDate);
    setRows((prev) =>
      prev.map((r) => (r.rowId === rowId ? { ...r, dueDate: cleanDate } : r))
    );
  };

  // Quick date distribution helpers
  const handleSetAllSameDate = () => {
    setRows((prev) => prev.map((r) => ({ ...r, dueDate: startOfDay(baseDate) })));
    toast.info(
      `Všem cvičením nastaveno datum ${format(baseDate, 'd. M. yyyy')}.`
    );
  };

  const handleSpreadByDays = (stepDays: number) => {
    setRows((prev) =>
      prev.map((r, idx) => ({
        ...r,
        dueDate: addDays(startOfDay(baseDate), idx * stepDays),
      }))
    );
    toast.info(
      stepDays === 1
        ? 'Data cvičení rozložena postupně den po dni.'
        : `Data cvičení rozložena s odstupem ${stepDays} dnů.`
    );
  };

  const handleSubmitAssignments = async () => {
    if (!user?.uid) return;
    if (effectiveStudentIds.length === 0) {
      toast.error('Vyberte prosím alespoň jednoho studenta.');
      return;
    }
    if (rows.length === 0) {
      toast.error('Vyberte prosím alespoň jedno procvičování k přiřazení.');
      return;
    }

    setIsSaving(true);
    try {
      const payload: TeacherExerciseAssignmentInput[] = rows.map((r) => ({
        subtopicId: r.subtopicId,
        subtopicTitle: r.subtopicTitle,
        topicId: r.topicId,
        subjectId: r.subjectId,
        dueDate: r.dueDate,
      }));

      await assignPracticeToStudentsByTeacher(
        user.uid,
        effectiveStudentIds,
        payload
      );

      toast.success(
        `Přiřazeno ${rows.length} cvičení do kalendáře (${
          effectiveStudentIds.length === 1
            ? '1 studentovi'
            : `${effectiveStudentIds.length} studentům`
        }) a odesláno upozornění!`
      );
      onAssignedSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to assign practice to students:', err);
      toast.error(err?.message || 'Nepodařilo se přiřadit procvičování.');
    } finally {
      setIsSaving(false);
    }
  };

  // Calendar days for inline mini-calendar picker
  const miniCalendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(pickerMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(pickerMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [pickerMonth]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-[90vw] lg:w-[75vw] lg:max-w-[75vw] xl:max-w-[1400px] lg:h-[85vh] max-h-[92vh] p-0 rounded-[2rem] border border-gray-100 bg-white shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-emerald-50/40 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-4 pr-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-brand-blue text-white flex items-center justify-center shadow-md shadow-blue-200 shrink-0">
                <CalendarBlueIcon size={22} />
              </div>
              <div>
                <DialogTitle className="text-xl sm:text-2xl font-sans font-black text-[#1E1B18]">
                  Přiřadit procvičování studentům do kalendáře
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm text-gray-500 font-medium mt-0.5">
                  Vyberte jednotlivá cvičení nebo celá témata a nastavte jim termíny v kalendáři. Student obdrží notifikaci.
                </DialogDescription>
              </div>
            </div>
          </div>
        </div>

        {/* Two-Column Body on PC */}
        <div className="flex-1 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:divide-x lg:divide-gray-100 min-h-0">
          {/* LEFT COLUMN: 1. Recipients + 2. Catalog Selection */}
          <div className="p-5 sm:p-6 lg:p-7 lg:overflow-y-auto space-y-6">
            {/* 1. KOMU PŘIŘADIT */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-sm font-black uppercase tracking-wider text-gray-700">
                  1. Komu procvičování přiřadit
                </h4>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-brand-blue">
                  Vybráno: {effectiveStudentIds.length}{' '}
                  {effectiveStudentIds.length === 1
                    ? 'student'
                    : effectiveStudentIds.length >= 2 &&
                      effectiveStudentIds.length <= 4
                    ? 'studenti'
                    : 'studentů'}
                </span>
              </div>

              {/* Mode tabs */}
              <div className="grid grid-cols-3 gap-2">
                {initialStudent && (
                  <button
                    type="button"
                    onClick={() => {
                      setTargetMode('single');
                      setSelectedStudentIds([initialStudent.uid]);
                    }}
                    className={cn(
                      'p-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all',
                      targetMode === 'single'
                        ? 'bg-[#1E1B18] text-white border-[#1E1B18]'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    )}
                  >
                    <UserCheck size={14} />
                    <span className="truncate">{initialStudent.name}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setTargetMode('multiple')}
                  className={cn(
                    'p-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all',
                    !initialStudent && 'col-span-2',
                    targetMode === 'multiple'
                      ? 'bg-[#1E1B18] text-white border-[#1E1B18]'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  )}
                >
                  <Users size={14} />
                  <span>Výběr studentů</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetMode('course')}
                  className={cn(
                    'p-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer transition-all',
                    targetMode === 'course'
                      ? 'bg-[#1E1B18] text-white border-[#1E1B18]'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  )}
                >
                  <GraduationCap size={14} />
                  <span>Celý kurz</span>
                </button>
              </div>

              {/* Multiple students selector */}
              {targetMode === 'multiple' && (
                <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <Input
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        placeholder="Hledat studenta..."
                        className="pl-8 h-9 rounded-xl bg-white text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const allVisibleIds = filteredStudentsList.map(
                          (s) => s.uid
                        );
                        const allChecked = allVisibleIds.every((id) =>
                          selectedStudentIds.includes(id)
                        );
                        if (allChecked) {
                          setSelectedStudentIds((prev) =>
                            prev.filter((id) => !allVisibleIds.includes(id))
                          );
                        } else {
                          setSelectedStudentIds((prev) =>
                            Array.from(new Set([...prev, ...allVisibleIds]))
                          );
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-xl text-[11px] font-black bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 cursor-pointer shrink-0"
                    >
                      Vybrat zobrazené
                    </button>
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {filteredStudentsList.map((st) => {
                      const isChecked = selectedStudentIds.includes(st.uid);
                      return (
                        <div
                          key={st.uid}
                          onClick={() =>
                            setSelectedStudentIds((prev) =>
                              isChecked
                                ? prev.filter((id) => id !== st.uid)
                                : [...prev, st.uid]
                            )
                          }
                          className={cn(
                            'p-2 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer transition-all',
                            isChecked
                              ? 'bg-blue-50/80 border-brand-blue text-gray-900 font-bold'
                              : 'bg-white border-gray-200/70 text-gray-700 hover:bg-gray-100/60'
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={cn(
                                'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                                isChecked
                                  ? 'bg-brand-blue border-brand-blue text-white'
                                  : 'bg-white border-gray-300'
                              )}
                            >
                              {isChecked && <Check size={11} />}
                            </div>
                            <span className="truncate">{st.name}</span>
                            <span className="text-[10px] text-gray-400 truncate">
                              ({st.email})
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Course selector */}
              {targetMode === 'course' && (
                <div className="p-3.5 rounded-2xl bg-gray-50 border border-gray-200/80 space-y-1.5 max-h-40 overflow-y-auto">
                  {courses.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">
                      Žádné kurzy nejsou k dispozici.
                    </p>
                  ) : (
                    courses.map((course) => {
                      const isChecked = selectedCourseIds.includes(course.id);
                      const countInCourse = students.filter(
                        (s) =>
                          (s.enrolledCourseIds || []).includes(course.id) ||
                          s.courseId === course.id
                      ).length;

                      return (
                        <div
                          key={course.id}
                          onClick={() =>
                            setSelectedCourseIds((prev) =>
                              isChecked
                                ? prev.filter((id) => id !== course.id)
                                : [...prev, course.id]
                            )
                          }
                          className={cn(
                            'p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer transition-all',
                            isChecked
                              ? 'bg-blue-50/80 border-brand-blue font-bold text-gray-900'
                              : 'bg-white border-gray-200/70 text-gray-700 hover:bg-gray-100/60'
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={cn(
                                'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                                isChecked
                                  ? 'bg-brand-blue border-brand-blue text-white'
                                  : 'bg-white border-gray-300'
                              )}
                            >
                              {isChecked && <Check size={11} />}
                            </div>
                            <span className="truncate">{course.title}</span>
                          </div>
                          <span className="text-[10px] font-bold text-brand-blue bg-blue-50 px-2 py-0.5 rounded-full shrink-0">
                            {countInCourse} studentů
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* 2. VÝBĚR CVIČENÍ NEBO CELÝCH TÉMAT Z KATALOGU */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-sm font-black uppercase tracking-wider text-gray-700">
                  2. Vyberte cvičení nebo celá témata
                </h4>

                <div className="flex items-center gap-1.5">
                  {PREDEFINED_SUBJECTS.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => setCatalogSubject(sub.id as any)}
                      className={cn(
                        'px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer border',
                        catalogSubject === sub.id
                          ? 'bg-[#1E1B18] text-white border-[#1E1B18]'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      )}
                    >
                      {sub.title}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <Input
                  value={topicSearch}
                  onChange={(e) => setTopicSearch(e.target.value)}
                  placeholder="Filtrovat témata nebo podtémata..."
                  className="pl-9 h-9 rounded-xl bg-gray-50 border-gray-200 text-xs"
                />
              </div>

              {loadingCatalog ? (
                <div className="py-8 text-center text-xs text-gray-400 font-bold">
                  Načítání katalogu procvičování...
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                  {catalogTopics.map((topic) => {
                    const tSubs = catalogSubtopics.filter(
                      (s) =>
                        (s.topicId === topic.id || s.topicId === topic.title) &&
                        (!topicSearch.trim() ||
                          topic.title
                            .toLowerCase()
                            .includes(topicSearch.toLowerCase()) ||
                          s.title
                            .toLowerCase()
                            .includes(topicSearch.toLowerCase()))
                    );
                    if (tSubs.length === 0) return null;

                    const allSelected = tSubs.every((ts) =>
                      rows.some((r) => r.subtopicId === ts.id)
                    );

                    return (
                      <div
                        key={topic.id}
                        className="p-3.5 rounded-2xl bg-[#FAF7F0] border border-gray-200/80 space-y-2.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="font-bold text-xs sm:text-sm text-gray-900">
                              {topic.title}
                            </span>
                            {topic.isHidden && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-gray-200/80 text-gray-700 border border-gray-300">
                                <EyeOff size={10} />
                                Skryto
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleWholeTopic(topic, tSubs)}
                            className={cn(
                              'px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border shrink-0',
                              allSelected
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-white text-brand-blue border-blue-200 hover:bg-blue-50'
                            )}
                          >
                            {allSelected
                              ? '✓ Celé téma vybráno'
                              : `+ Celé téma (${tSubs.length})`}
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {tSubs.map((sub) => {
                            const selectedCount = rows.filter(
                              (r) => r.subtopicId === sub.id
                            ).length;
                            const isSelected = selectedCount > 0;
                            const isSubHidden = Boolean(sub.isHidden || topic.isHidden);
                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() =>
                                  handleToggleSubtopic(sub, topic.title)
                                }
                                className={cn(
                                  'px-2.5 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer border flex items-center gap-1',
                                  isSelected
                                    ? 'bg-brand-blue text-white border-brand-blue shadow-2xs'
                                    : isSubHidden
                                      ? 'bg-gray-100/80 text-gray-600 border-dashed border-gray-300 hover:border-brand-blue/40'
                                      : 'bg-white text-gray-700 border-gray-200 hover:border-brand-blue/40'
                                )}
                              >
                                {isSelected ? (
                                  <Check size={12} />
                                ) : (
                                  <Plus size={12} className="text-gray-400" />
                                )}
                                <span>{sub.title}</span>
                                {isSubHidden && (
                                  <span
                                    className={cn(
                                      'ml-0.5 px-1.5 py-0.2 rounded text-[9px] font-black uppercase tracking-wider flex items-center gap-0.5',
                                      isSelected
                                        ? 'bg-white/25 text-white'
                                        : 'bg-gray-200 text-gray-700'
                                    )}
                                    title="Skryto v obecném přehledu pro studenty"
                                  >
                                    <EyeOff size={9} />
                                    Skryto
                                  </span>
                                )}
                                {selectedCount > 1 && (
                                  <span className="ml-0.5 px-1 rounded bg-white/20 text-[10px] font-black">
                                    {selectedCount}×
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Assigned Exercises & Individual Calendar Date Pickers */}
          <div className="p-5 sm:p-6 lg:p-7 bg-gray-50/60 border-t lg:border-t-0 border-gray-100 lg:overflow-y-auto flex flex-col space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider text-gray-800">
                  3. Termíny jednotlivých cvičení v kalendáři
                </h4>
                <span className="mt-1 inline-flex items-center px-2.5 py-0.5 text-[11px] rounded-full bg-blue-50 text-brand-blue font-bold">
                  {rows.length}{' '}
                  {rows.length === 1
                    ? 'přiřazené cvičení'
                    : rows.length >= 2 && rows.length <= 4
                    ? 'přiřazená cvičení'
                    : 'přiřazených cvičení'}
                </span>
              </div>
            </div>

            {/* Quick Date Distribution Toolbar */}
            {rows.length > 0 && (
              <div className="p-3 rounded-2xl bg-white border border-gray-200/90 shadow-2xs space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] font-black uppercase tracking-wider text-gray-500">
                    Hromadné nastavení od data:
                  </span>
                  <input
                    type="date"
                    value={format(baseDate, 'yyyy-MM-dd')}
                    onChange={(e) => {
                      const d = new Date(`${e.target.value}T00:00:00`);
                      if (!isNaN(d.getTime())) {
                        setBaseDate(startOfDay(d));
                      }
                    }}
                    className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl px-2.5 py-1 cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSetAllSameDate}
                    className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-gray-100 hover:bg-gray-200 text-gray-800 cursor-pointer transition-colors"
                  >
                    Nastavit všem stejné datum
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSpreadByDays(1)}
                    className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-brand-blue cursor-pointer transition-colors"
                  >
                    Rozložit po dnech (1/den)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSpreadByDays(2)}
                    className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-brand-blue cursor-pointer transition-colors"
                  >
                    Rozložit obden
                  </button>
                </div>
              </div>
            )}

            {/* List of exercises with individual Calendar Pickers */}
            {rows.length === 0 ? (
              <div className="flex-1 min-h-[240px] p-6 rounded-2xl bg-white border border-dashed border-gray-200 flex flex-col items-center justify-center text-center gap-2">
                <CalendarBlueIcon size={32} />
                <p className="text-xs font-bold text-gray-500">
                  Zatím nebylo vybráno žádné procvičování.
                </p>
                <p className="text-[11px] text-gray-400 max-w-xs">
                  Klikněte vlevo na jednotlivá podtémata nebo na tlačítko „+ Celé téma“. U každého cvičení si pak můžete v kalendáři zvolit přesné datum.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 pr-1">
                {rows.map((row, idx) => {
                  const isCalendarOpen = openCalendarRowId === row.rowId;

                  return (
                    <div
                      key={row.rowId}
                      className="p-3.5 rounded-2xl bg-white border border-gray-200/90 shadow-2xs space-y-2.5 hover:border-brand-blue/40 transition-all"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-black text-gray-400">
                              #{idx + 1}
                            </span>
                            <span
                              className={cn(
                                'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded',
                                row.subjectId === 'Matematika'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              )}
                            >
                              {row.subjectId}
                            </span>
                            {row.topicTitle && (
                              <span className="text-[10px] font-semibold text-gray-400 truncate">
                                {row.topicTitle}
                              </span>
                            )}
                          </div>
                          <p className="font-bold text-sm text-gray-900 truncate mt-0.5">
                            {row.subtopicTitle}
                          </p>
                        </div>

                        {/* Individual Calendar Picker Controls */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Button to toggle visual calendar grid */}
                          <button
                            type="button"
                            onClick={() => {
                              if (isCalendarOpen) {
                                setOpenCalendarRowId(null);
                              } else {
                                setPickerMonth(row.dueDate);
                                setOpenCalendarRowId(row.rowId);
                              }
                            }}
                            className={cn(
                              'px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all',
                              isCalendarOpen
                                ? 'bg-brand-blue text-white border-brand-blue shadow-xs'
                                : 'bg-blue-50/70 hover:bg-blue-100/80 text-brand-blue border-blue-200'
                            )}
                            title="Vybrat datum z kalendáře"
                          >
                            <Calendar size={13} />
                            <span className="capitalize">
                              {format(row.dueDate, 'EEEEEE d. M. yyyy', {
                                locale: cs,
                              })}
                            </span>
                          </button>

                          {/* Duplicate exercise for another date */}
                          <button
                            type="button"
                            onClick={() => handleDuplicateRow(row)}
                            className="w-8 h-8 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-600 cursor-pointer"
                            title="Přidat další opakování tohoto cvičení"
                          >
                            <Copy size={13} />
                          </button>

                          {/* Remove row */}
                          <button
                            type="button"
                            onClick={() => handleRemoveRow(row.rowId)}
                            className="w-8 h-8 rounded-xl border border-gray-200 bg-white hover:bg-rose-50 hover:border-rose-200 flex items-center justify-center text-gray-400 hover:text-rose-600 cursor-pointer"
                            title="Odebrat cvičení"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Inline Visual Calendar Picker when clicked */}
                      {isCalendarOpen && (
                        <div className="p-3 rounded-2xl bg-[#FAF7F0] border border-blue-200 space-y-2.5 animate-in fade-in duration-150">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-gray-800 capitalize">
                              {format(pickerMonth, 'LLLL yyyy', { locale: cs })}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setPickerMonth(subMonths(pickerMonth, 1))
                                }
                                className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 cursor-pointer"
                              >
                                <ChevronLeft size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setPickerMonth(addMonths(pickerMonth, 1))
                                }
                                className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-100 cursor-pointer"
                              >
                                <ChevronRight size={14} />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-black text-gray-400 uppercase">
                            {['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'].map(
                              (d) => (
                                <div key={d}>{d}</div>
                              )
                            )}
                          </div>

                          <div className="grid grid-cols-7 gap-1">
                            {miniCalendarDays.map((d, i) => {
                              const isSelectedDay = isSameDay(d, row.dueDate);
                              const isSameMonth = isSameDay(
                                startOfMonth(d),
                                startOfMonth(pickerMonth)
                              );
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => {
                                    handleUpdateRowDate(row.rowId, d);
                                    setOpenCalendarRowId(null);
                                  }}
                                  className={cn(
                                    'h-8 rounded-lg text-xs font-bold flex items-center justify-center cursor-pointer transition-all border',
                                    !isSameMonth && 'opacity-35',
                                    isSelectedDay
                                      ? 'bg-brand-blue text-white border-brand-blue shadow-xs font-black'
                                      : isToday(d)
                                      ? 'bg-blue-50 text-brand-blue border-blue-300'
                                      : 'bg-white text-gray-700 border-gray-100 hover:border-brand-blue/50 hover:bg-blue-50/40'
                                  )}
                                >
                                  {format(d, 'd')}
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-gray-200/70 gap-2">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  handleUpdateRowDate(row.rowId, new Date());
                                  setOpenCalendarRowId(null);
                                }}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white border border-gray-200 hover:bg-gray-100 cursor-pointer"
                              >
                                Dnes
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleUpdateRowDate(
                                    row.rowId,
                                    addDays(new Date(), 1)
                                  );
                                  setOpenCalendarRowId(null);
                                }}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white border border-gray-200 hover:bg-gray-100 cursor-pointer"
                              >
                                Zítra
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  handleUpdateRowDate(
                                    row.rowId,
                                    addDays(row.dueDate, 7)
                                  );
                                  setOpenCalendarRowId(null);
                                }}
                                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-white border border-gray-200 hover:bg-gray-100 cursor-pointer"
                              >
                                +1 týden
                              </button>
                            </div>

                            <input
                              type="date"
                              value={format(row.dueDate, 'yyyy-MM-dd')}
                              onChange={(e) => {
                                const parsed = new Date(
                                  `${e.target.value}T00:00:00`
                                );
                                if (!isNaN(parsed.getTime())) {
                                  handleUpdateRowDate(row.rowId, parsed);
                                }
                              }}
                              className="text-[11px] font-bold bg-white border border-gray-200 rounded-lg px-2 py-1"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
            <CorrectCyanIcon size={16} />
            <span>
              Přiřazená cvičení se okamžitě propíší do kalendáře studenta a odešlou mu notifikaci.
            </span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-xl font-bold h-11 px-4 cursor-pointer"
            >
              Zrušit
            </Button>
            <Button
              onClick={handleSubmitAssignments}
              disabled={
                isSaving ||
                rows.length === 0 ||
                effectiveStudentIds.length === 0
              }
              className="rounded-xl bg-[#1E1B18] hover:bg-black text-white font-black h-11 px-6 flex items-center gap-2 shadow-md cursor-pointer"
            >
              {isSaving ? (
                <Loader2 size={15} className="animate-spin text-amber-400" />
              ) : (
                <Calendar size={15} className="text-emerald-400" />
              )}
              <span>
                {isSaving
                  ? 'Přiřazuji do kalendáře...'
                  : `Přiřadit cvičení (${rows.length})`}
              </span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
