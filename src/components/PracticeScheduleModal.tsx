import React, { useState, useEffect, useMemo } from 'react';
import { format, addDays, startOfDay, isSameDay } from 'date-fns';
import { cs } from 'date-fns/locale';
import {
  Calendar,
  Clock,
  Plus,
  Minus,
  Trash2,
  Check,
  Lock,
  Sparkles,
  Layers,
  Shuffle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Button } from './ui/button';
import { CalendarBlueIcon, StarYellowIcon, CorrectCyanIcon } from './common/CustomIcon';
import { useAuth } from '../context/AuthContext';
import {
  PracticeTopic,
  PracticeSubtopic,
  TodoItem,
  ScheduleSubtopicSelection,
  ScheduleIntervalMode,
  ScheduleSequencingMode,
  ScheduleCollisionStrategy,
  ScheduleConfig,
} from '../types';
import {
  getTopics,
  getSubtopics,
  PREDEFINED_SUBJECTS,
} from '../services/practiceService';
import {
  generatePracticeSchedule,
  detectScheduleCollision,
  savePracticeScheduleToCalendar,
} from '../services/calendarService';
import UnifiedPaywallModal from './common/UnifiedPaywallModal';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

export interface PracticeScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSubject?: 'Matematika' | 'Čeština';
  initialTopic?: PracticeTopic | null;
  initialSubtopics?: PracticeSubtopic[];
  existingTodos?: TodoItem[];
  onScheduleSaved?: () => void;
}

const WEEKDAY_OPTIONS = [
  { day: 1, label: 'Po' },
  { day: 2, label: 'Út' },
  { day: 3, label: 'St' },
  { day: 4, label: 'Čt' },
  { day: 5, label: 'Pá' },
  { day: 6, label: 'So' },
  { day: 0, label: 'Ne' },
];

const REPETITION_PRESETS = [
  { value: 1, label: '1', desc: 'Jednorázově (1×)' },
  { value: 3, label: '3', desc: 'Upevnění (3×)' },
  { value: 5, label: '5', desc: 'Důkladně (5×)' },
  { value: 7, label: '7', desc: 'Celý týden (7×)' },
];

export default function PracticeScheduleModal({
  isOpen,
  onClose,
  initialSubject = 'Matematika',
  initialTopic = null,
  initialSubtopics = [],
  existingTodos = [],
  onScheduleSaved,
}: PracticeScheduleModalProps) {
  const { user, isPremium, openAuthModal } = useAuth();

  // Catalog state for picking additional topics/subtopics
  const [catalogSubject, setCatalogSubject] = useState<'Matematika' | 'Čeština'>(
    initialSubject
  );
  const [catalogTopics, setCatalogTopics] = useState<PracticeTopic[]>([]);
  const [catalogSubtopics, setCatalogSubtopics] = useState<PracticeSubtopic[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [isPickerExpanded, setIsPickerExpanded] = useState(false);

  // Selected subtopics & repetitions
  const [selections, setSelections] = useState<ScheduleSubtopicSelection[]>([]);
  const [globalRepetitions, setGlobalRepetitions] = useState<number>(3);

  // Schedule parameters
  const [intervalMode, setIntervalMode] = useState<ScheduleIntervalMode>('daily');
  const [customIntervalDays, setCustomIntervalDays] = useState<number>(2);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([1, 3, 5]); // Po, St, Pá
  const [sequencingMode, setSequencingMode] =
    useState<ScheduleSequencingMode>('blocks');
  const [dailyQuota, setDailyQuota] = useState<number>(1);
  const [startPreset, setStartPreset] = useState<'today' | 'tomorrow' | 'custom'>(
    'today'
  );
  const [customStartDateStr, setCustomStartDateStr] = useState<string>(() =>
    format(new Date(), 'yyyy-MM-dd')
  );
  const [preferredHour, setPreferredHour] = useState<number>(16);
  const [collisionStrategy, setCollisionStrategy] =
    useState<ScheduleCollisionStrategy>('merge');

  // Saving & Paywall state
  const [isSaving, setIsSaving] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  // Initialize selections whenever modal opens
  useEffect(() => {
    if (!isOpen) return;

    const visibleInitialSubtopics = (initialSubtopics || []).filter(sub => !sub.isHidden);
    const defaultReps = visibleInitialSubtopics.length > 1 ? 3 : 5;
    setGlobalRepetitions(defaultReps);

    if (visibleInitialSubtopics.length > 0 && !initialTopic?.isHidden) {
      setSelections(
        visibleInitialSubtopics.map((sub) => ({
          subtopicId: sub.id,
          subtopicTitle: sub.title,
          topicId: sub.topicId,
          topicTitle: initialTopic?.title,
          subjectId: sub.subjectId || initialSubject,
          repetitions: defaultReps,
        }))
      );
      setIsPickerExpanded(false);
    } else {
      setSelections([]);
      setIsPickerExpanded(true);
    }

    setCatalogSubject(initialSubject);
    setStartPreset('today');
    setCustomStartDateStr(format(new Date(), 'yyyy-MM-dd'));
  }, [isOpen, initialSubject, initialTopic, initialSubtopics]);

  // Load catalog when picker is expanded or no initial subtopics
  useEffect(() => {
    if (!isOpen || !isPickerExpanded) return;

    let active = true;
    async function fetchCatalog() {
      setLoadingCatalog(true);
      try {
        const [fetchedTopics, fetchedSubtopics] = await Promise.all([
          getTopics(catalogSubject),
          getSubtopics(undefined, catalogSubject),
        ]);
        if (active) {
          const visibleSubs = fetchedSubtopics.filter((s) => !s.isHidden);
          const visibleTopics = fetchedTopics.filter(
            (t) =>
              !t.isHidden &&
              visibleSubs.some((s) => s.topicId === t.id || s.topicId === t.title)
          );
          setCatalogTopics(visibleTopics);
          setCatalogSubtopics(visibleSubs);
        }
      } catch (err) {
        console.error('Failed to load catalog for schedule modal:', err);
      } finally {
        if (active) setLoadingCatalog(false);
      }
    }
    fetchCatalog();
    return () => {
      active = false;
    };
  }, [isOpen, isPickerExpanded, catalogSubject]);

  const effectiveStartDate = useMemo(() => {
    const now = new Date();
    if (startPreset === 'today') return startOfDay(now);
    if (startPreset === 'tomorrow') return startOfDay(addDays(now, 1));
    const parsed = new Date(`${customStartDateStr}T00:00:00`);
    return isNaN(parsed.getTime()) ? startOfDay(now) : startOfDay(parsed);
  }, [startPreset, customStartDateStr]);

  const scheduleConfig: ScheduleConfig = useMemo(
    () => ({
      selections,
      intervalMode,
      customIntervalDays,
      selectedWeekdays,
      sequencingMode,
      dailyQuota,
      startDate: effectiveStartDate,
      preferredHour,
      collisionStrategy,
    }),
    [
      selections,
      intervalMode,
      customIntervalDays,
      selectedWeekdays,
      sequencingMode,
      dailyQuota,
      effectiveStartDate,
      preferredHour,
      collisionStrategy,
    ]
  );

  const collisionInfo = useMemo(
    () => detectScheduleCollision(scheduleConfig, existingTodos),
    [scheduleConfig, existingTodos]
  );

  const generatedItems = useMemo(
    () => generatePracticeSchedule(scheduleConfig, existingTodos),
    [scheduleConfig, existingTodos]
  );

  // Group generated items by calendar day for clean visual preview
  const groupedPreviewDays = useMemo(() => {
    const groups: { date: Date; items: typeof generatedItems }[] = [];
    for (const item of generatedItems) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && isSameDay(lastGroup.date, item.dueDate)) {
        lastGroup.items.push(item);
      } else {
        groups.push({
          date: startOfDay(item.dueDate),
          items: [item],
        });
      }
    }
    return groups;
  }, [generatedItems]);

  const handleApplyGlobalRepetitions = (reps: number) => {
    setGlobalRepetitions(reps);
    setSelections((prev) => prev.map((s) => ({ ...s, repetitions: reps })));
  };

  const handleUpdateSubtopicReps = (subtopicId: string, delta: number) => {
    setSelections((prev) =>
      prev.map((s) =>
        s.subtopicId === subtopicId
          ? { ...s, repetitions: Math.max(1, Math.min(30, s.repetitions + delta)) }
          : s
      )
    );
  };

  const handleRemoveSubtopic = (subtopicId: string) => {
    setSelections((prev) => prev.filter((s) => s.subtopicId !== subtopicId));
  };

  const handleToggleSubtopicFromCatalog = (
    sub: PracticeSubtopic,
    topicTitle?: string
  ) => {
    setSelections((prev) => {
      const exists = prev.some((s) => s.subtopicId === sub.id);
      if (exists) {
        return prev.filter((s) => s.subtopicId !== sub.id);
      }
      return [
        ...prev,
        {
          subtopicId: sub.id,
          subtopicTitle: sub.title,
          topicId: sub.topicId,
          topicTitle,
          subjectId: sub.subjectId || catalogSubject,
          repetitions: globalRepetitions,
        },
      ];
    });
  };

  const handleSelectWholeTopicFromCatalog = (
    topic: PracticeTopic,
    topicSubtopics: PracticeSubtopic[]
  ) => {
    if (topicSubtopics.length === 0) return;
    setSelections((prev) => {
      const allSelected = topicSubtopics.every((ts) =>
        prev.some((s) => s.subtopicId === ts.id)
      );
      if (allSelected) {
        return prev.filter(
          (s) => !topicSubtopics.some((ts) => ts.id === s.subtopicId)
        );
      }
      const existingIds = new Set(prev.map((s) => s.subtopicId));
      const added: ScheduleSubtopicSelection[] = topicSubtopics
        .filter((ts) => !existingIds.has(ts.id))
        .map((ts) => ({
          subtopicId: ts.id,
          subtopicTitle: ts.title,
          topicId: ts.topicId,
          topicTitle: topic.title,
          subjectId: ts.subjectId || catalogSubject,
          repetitions: globalRepetitions,
        }));
      return [...prev, ...added];
    });
  };

  const toggleWeekday = (dayNumber: number) => {
    setSelectedWeekdays((prev) => {
      if (prev.includes(dayNumber)) {
        if (prev.length <= 1) return prev; // keep at least 1 day selected
        return prev.filter((d) => d !== dayNumber);
      }
      return [...prev, dayNumber].sort();
    });
  };

  const executeSaveSchedule = async () => {
    if (!user?.uid) {
      openAuthModal();
      toast.info('Pro uložení rozvrhu do kalendáře se prosím nejprve přihlaste.');
      return;
    }

    if (generatedItems.length === 0) {
      toast.error('Vyberte prosím alespoň jedno podtéma k naplánování.');
      return;
    }

    setIsSaving(true);
    try {
      const { count } = await savePracticeScheduleToCalendar(
        user.uid,
        generatedItems
      );
      toast.success(
        `Rozvrh uložen! Do kalendáře bylo přidáno ${count} ${
          count === 1 ? 'cvičení' : count < 5 ? 'cvičení' : 'cvičení'
        } v ${groupedPreviewDays.length} dnech.`
      );
      onScheduleSaved?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to save practice schedule:', err);
      toast.error(
        err?.message || 'Nepodařilo se uložit rozvrh procvičování do kalendáře.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveClick = async () => {
    if (generatedItems.length === 0) {
      toast.error('Vyberte prosím alespoň jedno podtéma k naplánování.');
      return;
    }

    if (!user) {
      openAuthModal();
      toast.info('Pro uložení rozvrhu do kalendáře se prosím přihlaste.');
      return;
    }

    if (!isPremium) {
      // Open PRO Paywall modal; user can see their preview and unlock saving with PRO
      setIsPaywallOpen(true);
      return;
    }

    await executeSaveSchedule();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="w-[95vw] sm:max-w-[90vw] lg:w-[75vw] lg:max-w-[75vw] xl:max-w-[1400px] lg:h-[85vh] max-h-[92vh] p-0 rounded-[2rem] border border-gray-100 bg-white shadow-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-5 sm:p-6 bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-amber-50/40 border-b border-gray-100 shrink-0">
            <div className="flex items-start justify-between gap-4 pr-6">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-brand-blue text-white flex items-center justify-center shadow-md shadow-blue-200 shrink-0">
                  <CalendarBlueIcon size={22} />
                </div>
                <div>
                  <DialogTitle className="text-xl sm:text-2xl font-sans font-black text-[#1E1B18]">
                    Naplánovat procvičování do kalendáře
                  </DialogTitle>
                  <DialogDescription className="text-xs sm:text-sm text-gray-500 font-medium mt-0.5">
                    Rozvrhni si témata a počet opakování. Když splníš denní kvótu, den v kalendáři zezelená!
                  </DialogDescription>
                </div>
              </div>
            </div>
          </div>

          {/* Main Body: Two-Column Layout on PC (Left = Settings, Right = Live Schedule Preview) */}
          <div className="flex-1 overflow-y-auto lg:overflow-hidden lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:divide-x lg:divide-gray-100 min-h-0">
            {/* LEFT COLUMN: Configuration Controls */}
            <div className="p-5 sm:p-6 lg:p-7 lg:overflow-y-auto space-y-6">
            {/* SECTION 1: Selected Subtopics & Repetitions */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-sm font-black uppercase tracking-wider text-gray-700 leading-tight">
                    1. Vybraná cvičení a počet opakování
                  </h4>
                  <span className="mt-1 inline-flex items-center px-2.5 py-0.5 text-[11px] rounded-full bg-blue-50 text-brand-blue font-bold">
                    {selections.length}{' '}
                    {selections.length === 1
                      ? 'podtéma'
                      : selections.length >= 2 && selections.length <= 4
                      ? 'podtémata'
                      : 'podtémat'}
                  </span>
                </div>

                {/* Quick global repetition presets on a single line */}
                <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                  <span className="text-[11px] font-bold text-gray-400 mr-0.5">
                    Počet opakování:
                  </span>
                  {REPETITION_PRESETS.map((preset) => {
                    const isActive =
                      selections.length > 0 &&
                      selections.every((s) => s.repetitions === preset.value);
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => handleApplyGlobalRepetitions(preset.value)}
                        className={cn(
                          'w-8 h-8 rounded-xl text-xs font-black transition-all cursor-pointer border flex items-center justify-center shrink-0',
                          isActive
                            ? 'bg-[#1E1B18] text-white border-[#1E1B18] shadow-xs'
                            : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                        )}
                        title={preset.desc}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected items list */}
              {selections.length === 0 ? (
                <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 text-amber-900 text-xs font-bold flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0 text-amber-600" />
                  <span>
                    Zatím nemáte vybrané žádné podtéma. Vyberte si celé téma nebo jednotlivá podtémata níže.
                  </span>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {selections.map((item) => (
                    <div
                      key={item.subtopicId}
                      className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#FAF7F0] border border-gray-200/70"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={cn(
                              'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded',
                              item.subjectId === 'Matematika'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            )}
                          >
                            {item.subjectId}
                          </span>
                          {item.topicTitle && (
                            <span className="text-[10px] font-semibold text-gray-400 truncate">
                              {item.topicTitle}
                            </span>
                          )}
                        </div>
                        <p className="font-bold text-sm text-[#1E1B18] truncate mt-0.5">
                          {item.subtopicTitle}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center bg-white rounded-xl border border-gray-200 p-0.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateSubtopicReps(item.subtopicId, -1)
                            }
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100 cursor-pointer"
                            title="Snížit počet opakování"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="px-2.5 text-xs font-black text-gray-900 min-w-[44px] text-center">
                            {item.repetitions}×
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateSubtopicReps(item.subtopicId, 1)
                            }
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100 cursor-pointer"
                            title="Zvýšit počet opakování"
                          >
                            <Plus size={13} />
                          </button>
                        </div>

                        {selections.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSubtopic(item.subtopicId)}
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Odebrat z plánu"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Toggle to add more topics/subtopics from catalog */}
              <div>
                <button
                  type="button"
                  onClick={() => setIsPickerExpanded((prev) => !prev)}
                  className="text-xs font-bold text-brand-blue hover:text-blue-800 flex items-center gap-1.5 cursor-pointer py-1"
                >
                  {isPickerExpanded ? (
                    <>
                      <ChevronUp size={15} />
                      <span>Skrýt výběr dalších témat a podtémat</span>
                    </>
                  ) : (
                    <>
                      <Plus size={15} />
                      <span>
                        Přidat další podtéma nebo celé téma z katalogu
                      </span>
                    </>
                  )}
                </button>

                {isPickerExpanded && (
                  <div className="mt-2 p-4 rounded-2xl border border-gray-200 bg-gray-50/70 space-y-3">
                    <div className="flex items-center gap-2">
                      {PREDEFINED_SUBJECTS.map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setCatalogSubject(sub.id as any)}
                          className={cn(
                            'px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer border',
                            catalogSubject === sub.id
                              ? 'bg-[#1E1B18] text-white border-[#1E1B18]'
                              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                          )}
                        >
                          {sub.title}
                        </button>
                      ))}
                    </div>

                    {loadingCatalog ? (
                      <p className="text-xs text-gray-400 font-semibold py-3">
                        Načítání katalogu témat...
                      </p>
                    ) : catalogTopics.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">
                        Žádná témata k dispozici.
                      </p>
                    ) : (
                      <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
                        {catalogTopics.map((topic) => {
                          const tSubs = catalogSubtopics.filter(
                            (s) =>
                              s.topicId === topic.id || s.topicId === topic.title
                          );
                          if (tSubs.length === 0) return null;
                          const allTopicSelected = tSubs.every((ts) =>
                            selections.some((s) => s.subtopicId === ts.id)
                          );

                          return (
                            <div
                              key={topic.id}
                              className="p-3 rounded-xl bg-white border border-gray-200/80 space-y-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-xs text-gray-900">
                                  {topic.title}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSelectWholeTopicFromCatalog(
                                      topic,
                                      tSubs
                                    )
                                  }
                                  className={cn(
                                    'px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border',
                                    allTopicSelected
                                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                      : 'bg-blue-50 text-brand-blue border-blue-200 hover:bg-blue-100'
                                  )}
                                >
                                  {allTopicSelected
                                    ? '✓ Celé téma vybráno'
                                    : `+ Vybrat celé téma (${tSubs.length})`}
                                </button>
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                {tSubs.map((sub) => {
                                  const isSelected = selections.some(
                                    (s) => s.subtopicId === sub.id
                                  );
                                  return (
                                    <button
                                      key={sub.id}
                                      type="button"
                                      onClick={() =>
                                        handleToggleSubtopicFromCatalog(
                                          sub,
                                          topic.title
                                        )
                                      }
                                      className={cn(
                                        'px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer border flex items-center gap-1',
                                        isSelected
                                          ? 'bg-brand-blue text-white border-brand-blue'
                                          : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                                      )}
                                    >
                                      {isSelected && <Check size={12} />}
                                      <span>{sub.title}</span>
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
                )}
              </div>
            </div>

            {/* SECTION 2: Ordering when multiple subtopics are selected (Blocks vs Interleaved) */}
            {selections.length > 1 && (
              <div className="space-y-2.5 pt-2 border-t border-gray-100">
                <h4 className="text-sm font-black uppercase tracking-wider text-gray-700">
                  2. Pořadí procvičování podtémat
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSequencingMode('blocks')}
                    className={cn(
                      'p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3',
                      sequencingMode === 'blocks'
                        ? 'bg-blue-50/70 border-brand-blue ring-2 ring-brand-blue/20'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                        sequencingMode === 'blocks'
                          ? 'bg-brand-blue text-white'
                          : 'bg-gray-100 text-gray-600'
                      )}
                    >
                      <Layers size={16} />
                    </div>
                    <div>
                      <div className="font-black text-xs text-gray-900">
                        Po blocích za sebou (Doporučeno)
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                        Nejdříve procvičíš jedno podtéma po všechna jeho opakování (např. celý týden) a pak přejdeš na další.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSequencingMode('interleaved')}
                    className={cn(
                      'p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3',
                      sequencingMode === 'interleaved'
                        ? 'bg-blue-50/70 border-brand-blue ring-2 ring-brand-blue/20'
                        : 'bg-white border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                        sequencingMode === 'interleaved'
                          ? 'bg-brand-blue text-white'
                          : 'bg-gray-100 text-gray-600'
                      )}
                    >
                      <Shuffle size={16} />
                    </div>
                    <div>
                      <div className="font-black text-xs text-gray-900">
                        Střídavě dokola (A → B → C)
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                        Podtémata se postupně střídají a celý cyklus se zopakuje podle zvoleného počtu opakování.
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* SECTION 3: Frequency / Interval & Daily Quota */}
            <div className="space-y-3 pt-2 border-t border-gray-100">
              <h4 className="text-sm font-black uppercase tracking-wider text-gray-700">
                {selections.length > 1
                  ? '3. Jak často chceš procvičovat?'
                  : '2. Jak často chceš procvičovat?'}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setIntervalMode('daily')}
                  className={cn(
                    'p-3 rounded-2xl border text-left transition-all cursor-pointer',
                    intervalMode === 'daily'
                      ? 'bg-[#1E1B18] text-white border-[#1E1B18] shadow-sm'
                      : 'bg-white text-gray-800 border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className="font-black text-xs">Každý den</div>
                  <div
                    className={cn(
                      'text-[11px] mt-0.5',
                      intervalMode === 'daily' ? 'text-gray-300' : 'text-gray-500'
                    )}
                  >
                    Pravidelný denní návyk
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setIntervalMode('custom_interval')}
                  className={cn(
                    'p-3 rounded-2xl border text-left transition-all cursor-pointer',
                    intervalMode === 'custom_interval'
                      ? 'bg-[#1E1B18] text-white border-[#1E1B18] shadow-sm'
                      : 'bg-white text-gray-800 border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className="font-black text-xs">Obden / Vlastní interval</div>
                  <div
                    className={cn(
                      'text-[11px] mt-0.5',
                      intervalMode === 'custom_interval'
                        ? 'text-gray-300'
                        : 'text-gray-500'
                    )}
                  >
                    Každé {customIntervalDays} dny
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setIntervalMode('weekdays')}
                  className={cn(
                    'p-3 rounded-2xl border text-left transition-all cursor-pointer',
                    intervalMode === 'weekdays'
                      ? 'bg-[#1E1B18] text-white border-[#1E1B18] shadow-sm'
                      : 'bg-white text-gray-800 border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className="font-black text-xs">Vybrané dny v týdnu</div>
                  <div
                    className={cn(
                      'text-[11px] mt-0.5',
                      intervalMode === 'weekdays'
                        ? 'text-gray-300'
                        : 'text-gray-500'
                    )}
                  >
                    Např. Po, St, Pá
                  </div>
                </button>
              </div>

              {/* Sub-options for custom_interval or weekdays */}
              {intervalMode === 'custom_interval' && (
                <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-2xl border border-gray-200/80 flex-wrap">
                  <span className="text-xs font-bold text-gray-700">
                    Opakovat vždy jednou za:
                  </span>
                  {[2, 3, 4, 5, 7].map((daysCount) => (
                    <button
                      key={daysCount}
                      type="button"
                      onClick={() => setCustomIntervalDays(daysCount)}
                      className={cn(
                        'px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer border',
                        customIntervalDays === daysCount
                          ? 'bg-brand-blue text-white border-brand-blue'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                      )}
                    >
                      {daysCount === 2
                        ? '2 dny (Obden)'
                        : daysCount === 7
                        ? '7 dní (Týdně)'
                        : `${daysCount} dny`}
                    </button>
                  ))}
                </div>
              )}

              {intervalMode === 'weekdays' && (
                <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-2xl border border-gray-200/80 flex-wrap">
                  <span className="text-xs font-bold text-gray-700 mr-1">
                    Tréninkové dny:
                  </span>
                  {WEEKDAY_OPTIONS.map((w) => {
                    const active = selectedWeekdays.includes(w.day);
                    return (
                      <button
                        key={w.day}
                        type="button"
                        onClick={() => toggleWeekday(w.day)}
                        className={cn(
                          'w-9 h-9 rounded-xl text-xs font-black transition-all cursor-pointer border',
                          active
                            ? 'bg-brand-blue text-white border-brand-blue shadow-xs'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                        )}
                      >
                        {w.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Daily Quota & Start Date Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Daily Quota */}
                <div className="p-3 rounded-2xl bg-gray-50/80 border border-gray-200/70 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-gray-800">
                      Denní kvóta (dávka)
                    </div>
                    <div className="text-[10px] text-gray-500 font-medium">
                      Kolik cvičení za den splnit pro zelené pole
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setDailyQuota(q)}
                        className={cn(
                          'w-8 h-8 rounded-xl text-xs font-black transition-all cursor-pointer border',
                          dailyQuota === q
                            ? 'bg-[#1E1B18] text-white border-[#1E1B18]'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
                        )}
                      >
                        {q}×
                      </button>
                    ))}
                  </div>
                </div>

                {/* Start Date */}
                <div className="p-3 rounded-2xl bg-gray-50/80 border border-gray-200/70 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-gray-800">
                      Začátek plánu
                    </span>
                    <div className="flex items-center gap-1">
                      {(
                        [
                          { id: 'today', label: 'Od dneška' },
                          { id: 'tomorrow', label: 'Od zítřka' },
                          { id: 'custom', label: 'Datum' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setStartPreset(opt.id)}
                          className={cn(
                            'px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer border',
                            startPreset === opt.id
                              ? 'bg-[#1E1B18] text-white border-[#1E1B18]'
                              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {startPreset === 'custom' && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="date"
                        value={customStartDateStr}
                        min={format(new Date(), 'yyyy-MM-dd')}
                        onChange={(e) => setCustomStartDateStr(e.target.value)}
                        className="w-full text-xs font-bold bg-white border border-gray-200 rounded-xl px-2.5 py-1.5"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Collision Handling Option (shown when overlapping with existing scheduled items) */}
              {collisionInfo.hasCollision && (
                <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-black text-amber-900">
                    <AlertCircle size={15} className="text-amber-600 shrink-0" />
                    <span>
                      V některých dnech ({collisionInfo.collidingDaysCount}×) již máte naplánované jiné procvičování:
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setCollisionStrategy('merge')}
                      className={cn(
                        'p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer',
                        collisionStrategy === 'merge'
                          ? 'bg-[#1E1B18] text-white border-[#1E1B18]'
                          : 'bg-white text-gray-700 border-amber-200 hover:bg-amber-100/40'
                      )}
                    >
                      Přidat k existujícím dnům
                    </button>
                    <button
                      type="button"
                      onClick={() => setCollisionStrategy('append_after')}
                      className={cn(
                        'p-2.5 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer',
                        collisionStrategy === 'append_after'
                          ? 'bg-[#1E1B18] text-white border-[#1E1B18]'
                          : 'bg-white text-gray-700 border-amber-200 hover:bg-amber-100/40'
                      )}
                    >
                      Navázat až po skončení stávajícího plánu
                      {collisionInfo.latestExistingDate && (
                        <span className="block text-[10px] opacity-80 font-normal">
                          (od{' '}
                          {format(
                            addDays(collisionInfo.latestExistingDate, 1),
                            'd. M. yyyy'
                          )}
                          )
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
            </div>

            {/* RIGHT COLUMN: Live Schedule Preview */}
            <div className="p-5 sm:p-6 lg:p-7 bg-gray-50/60 border-t lg:border-t-0 border-gray-100 lg:overflow-y-auto flex flex-col space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-sm font-black uppercase tracking-wider text-gray-800 flex items-center gap-1.5">
                  <StarYellowIcon size={16} />
                  <span>Náhled tvého rozvrhu v kalendáři</span>
                </h4>
                {groupedPreviewDays.length > 0 && (
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-600 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                      Celkem {generatedItems.length} cvičení
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-brand-blue border border-blue-200">
                      {groupedPreviewDays.length}{' '}
                      {groupedPreviewDays.length === 1
                        ? 'tréninkový den'
                        : groupedPreviewDays.length < 5
                        ? 'tréninkové dny'
                        : 'tréninkových dnů'}
                    </span>
                  </div>
                )}
              </div>

              {groupedPreviewDays.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-white border border-blue-100 shadow-2xs flex items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                      Období studijního plánu
                    </span>
                    <span className="font-black text-gray-900 text-sm">
                      {format(groupedPreviewDays[0].date, 'd. M. yyyy')} –{' '}
                      {format(
                        groupedPreviewDays[groupedPreviewDays.length - 1].date,
                        'd. M. yyyy'
                      )}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                      Denní kvóta
                    </span>
                    <span className="font-black text-brand-blue text-sm">
                      {dailyQuota}{' '}
                      {dailyQuota === 1 ? 'cvičení / den' : 'cvičení / den'}
                    </span>
                  </div>
                </div>
              )}

              {groupedPreviewDays.length === 0 ? (
                <div className="flex-1 min-h-[220px] p-6 rounded-2xl bg-white border border-dashed border-gray-200 flex items-center justify-center text-center text-xs text-gray-400 font-bold">
                  Po výběru podtémat vlevo se zde okamžitě zobrazí přehled tvého rozvrhu den po dni.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pr-1">
                  {groupedPreviewDays.map((group, idx) => (
                    <div
                      key={group.date.toISOString()}
                      className="p-3.5 rounded-2xl bg-white border border-gray-200/90 shadow-2xs flex flex-col justify-between gap-2 hover:border-brand-blue/40 transition-colors"
                    >
                      <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
                        <span className="text-xs font-black text-brand-blue uppercase tracking-wider capitalize">
                          {format(group.date, 'EEEEEE d. M.', { locale: cs })}
                        </span>
                        <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md">
                          Den {idx + 1}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {group.items.map((it, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-1.5 text-xs"
                          >
                            <span className="font-bold text-gray-800 truncate">
                              {it.subtopicTitle}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-brand-blue text-[10px] font-black shrink-0">
                              {it.repetitionIndex}/{it.totalRepetitions}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 sm:p-5 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
              <CorrectCyanIcon size={16} />
              <span>
                Splněné dny v kalendáři zezelenají, zmeškané dny zčervenají.
              </span>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <Button
                variant="outline"
                onClick={onClose}
                className="rounded-xl font-bold h-11 px-4 cursor-pointer"
              >
                Zrušit
              </Button>
              <Button
                onClick={handleSaveClick}
                disabled={isSaving || generatedItems.length === 0}
                className="rounded-xl bg-[#1E1B18] hover:bg-black text-white font-black h-11 px-6 flex items-center gap-2 shadow-md cursor-pointer"
              >
                {!isPremium ? (
                  <Lock size={15} className="text-amber-400" />
                ) : (
                  <Calendar size={15} className="text-emerald-400" />
                )}
                <span>
                  {isSaving
                    ? 'Ukládám rozvrh...'
                    : `Uložit do kalendáře (${generatedItems.length})`}
                </span>
                {!isPremium && (
                  <span className="text-[10px] font-black uppercase bg-amber-400 text-black px-1.5 py-0.5 rounded ml-0.5">
                    PRO
                  </span>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* PRO Paywall Modal when a Free user clicks "Uložit do kalendáře" */}
      <UnifiedPaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        type="premium"
        title="Chytrý studijní plánovač v kalendáři"
        description="Staň se jedním z prvních podporovatelů platformy, zafixuj si poloviční cenu 99 Kč/měsíc napořád a získej okamžitý přístup ke všem nástrojům bez limitu žolíků."
        onSuccess={() => {
          setIsPaywallOpen(false);
          executeSaveSchedule();
        }}
      />
    </>
  );
}
