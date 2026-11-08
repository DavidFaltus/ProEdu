import React, { useState, useMemo } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  isToday,
  startOfWeek,
  endOfWeek,
  addHours,
  startOfDay,
  isBefore,
} from 'date-fns';
import { cs } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  ArrowRight,
  RefreshCcw,
  Video,
  ExternalLink,
  Play,
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  Lock,
} from 'lucide-react';
import {
  CalendarBlueIcon,
  CorrectCyanIcon,
  StarYellowIcon,
} from './common/CustomIcon';
import { safeToDate, cn } from '../lib/utils';
import { Button } from './ui/button';
import { motion, AnimatePresence } from 'motion/react';
import {
  getGoogleAccessToken,
  syncEventToGoogleCalendar,
  syncLiveLessonToGoogleCalendar,
  getGoogleCalendarWebUrl,
  deleteScheduledTodo,
  deleteScheduledPracticePlan,
} from '../services/calendarService';
import { LiveLesson, TodoItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface QuickCalendarProps {
  todos: TodoItem[];
  liveLessons?: LiveLesson[];
  onJoinLesson?: (lesson: LiveLesson) => void;
  onOpenScheduleModal?: () => void;
}

function safeFormat(date: any, formatStr: string, options?: any): string {
  const d = safeToDate(date);
  if (!d) return '';
  try {
    return format(d, formatStr, options);
  } catch {
    return '';
  }
}

function formatRelativeActivityTime(rawDate: any, isLive?: boolean): string {
  if (isLive) return 'Právě probíhá!';
  const date = safeToDate(rawDate);
  if (!date) return '';

  const now = new Date();
  const diffMinutes = Math.round(
    (date.getTime() - now.getTime()) / (60 * 1000)
  );

  if (diffMinutes > 0 && diffMinutes <= 60) {
    return `Za ${diffMinutes} min`;
  }

  if (isToday(date)) {
    return `Dnes v ${format(date, 'HH:mm')}`;
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(date, tomorrow)) {
    return `Zítra v ${format(date, 'HH:mm')}`;
  }

  return `${format(date, 'EEEE d. M.', { locale: cs })} v ${format(
    date,
    'HH:mm'
  )}`;
}

export default function QuickCalendar({
  todos,
  liveLessons = [],
  onJoinLesson,
  onOpenScheduleModal,
}: QuickCalendarProps) {
  const { user, isPremium } = useAuth();
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(
    null
  );

  // Vlastní uložená procvičování v kalendáři fungují pro PRO uživatele,
  // procvičování přiřazená učitelem (addedBy !== user.uid) se zobrazují všem studentům
  const visibleTodos = useMemo(() => {
    if (isPremium) return todos;
    return todos.filter(
      (t) =>
        t.type !== 'practice' ||
        Boolean(t.addedBy && user?.uid && t.addedBy !== user.uid)
    );
  }, [todos, isPremium, user?.uid]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

  const getTodosForDay = (day: Date) => {
    return visibleTodos.filter((todo) => {
      const d = safeToDate(todo.dueDate);
      return d ? isSameDay(d, day) : false;
    });
  };

  const getLessonsForDay = (day: Date) => {
    return liveLessons.filter((lesson) => {
      const d = safeToDate(lesson.scheduledAt);
      return d ? isSameDay(d, day) : false;
    });
  };

  const daysOfWeek = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
  const selectedDayTodos = getTodosForDay(selectedDay);
  const selectedDayLessons = getLessonsForDay(selectedDay);
  const hasEventsForSelectedDay =
    selectedDayTodos.length > 0 || selectedDayLessons.length > 0;

  // Denní kvóta pro vybraný den
  const selectedDayQuota = useMemo(() => {
    const practiceTodos = selectedDayTodos.filter((t) => t.type === 'practice');
    const total = practiceTodos.length;
    const completed = practiceTodos.filter((t) => t.completed).length;
    const isMet = total > 0 && completed === total;
    const isPast = isBefore(startOfDay(selectedDay), startOfDay(new Date()));
    const isMissed = total > 0 && !isMet && isPast;

    return {
      hasQuota: total > 0,
      total,
      completed,
      isMet,
      isMissed,
      isPast,
    };
  }, [selectedDayTodos, selectedDay]);

  // Seznam všech nadcházejících událostí (pro sekci "Nadcházející události" a fallback)
  const upcomingCandidates = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const cutoff = new Date(now.getTime() - 15 * 60 * 1000);

    const candidates: {
      id: string;
      title: string;
      date: Date;
      type: 'liveLesson' | 'todo';
      isLive?: boolean;
      lesson?: LiveLesson;
      todo?: TodoItem;
    }[] = [];

    // 1. Live lessons
    liveLessons.forEach((lesson) => {
      const d = safeToDate(lesson.scheduledAt);
      if (lesson.status === 'live') {
        candidates.push({
          id: `lesson-${lesson.id}`,
          title: lesson.title,
          date: d || now,
          type: 'liveLesson',
          isLive: true,
          lesson,
        });
      } else if (lesson.status === 'scheduled') {
        if (d && d >= cutoff) {
          candidates.push({
            id: `lesson-${lesson.id}`,
            title: lesson.title,
            date: d,
            type: 'liveLesson',
            isLive: false,
            lesson,
          });
        }
      }
    });

    // 2. Active todos (including scheduled practice for PRO users)
    visibleTodos.forEach((todo) => {
      if (!todo.completed && todo.dueDate) {
        if (
          todo.referenceId &&
          liveLessons.some((l) => l.id === todo.referenceId)
        ) {
          return;
        }
        const d = safeToDate(todo.dueDate);
        // Pro procvičování bereme i dnešní cvičení (bez ohledu na hodinu) a všechna budoucí
        if (
          d &&
          (todo.type === 'practice'
            ? !isBefore(startOfDay(d), todayStart)
            : d >= cutoff)
        ) {
          candidates.push({
            id: `todo-${todo.id}`,
            title: todo.title,
            date: d,
            type: 'todo',
            todo,
          });
        }
      }
    });

    candidates.sort((a, b) => {
      if (a.isLive && !b.isLive) return -1;
      if (b.isLive && !a.isLive) return 1;
      return a.date.getTime() - b.date.getTime();
    });

    return candidates;
  }, [visibleTodos, liveLessons]);

  const nextActivity = upcomingCandidates[0] || null;

  // Nadcházející události mimo právě zobrazený den (pro přehled pod událostmi vybraného dne)
  const upcomingOtherDaysEvents = useMemo(() => {
    return upcomingCandidates
      .filter((c) => !isSameDay(c.date, selectedDay))
      .slice(0, 5);
  }, [upcomingCandidates, selectedDay]);

  const handleJumpToDate = (date: Date) => {
    setSelectedDay(date);
    setCurrentDate(startOfMonth(date));
  };

  const handleDeleteTodo = async (todo: TodoItem, deleteWholePlan = false) => {
    if (!user?.uid) return;
    setDeletingId(todo.id);
    try {
      if (deleteWholePlan && todo.planId) {
        const count = await deleteScheduledPracticePlan(user.uid, todo.planId);
        toast.success(`Smazán celý plán procvičování (${count} položek).`);
      } else {
        await deleteScheduledTodo(todo.id);
        toast.success('Naplánované cvičení bylo odebráno z kalendáře.');
      }
    } catch (err: any) {
      console.error('Failed to delete scheduled todo:', err);
      toast.error('Nepodařilo se smazat položku z kalendáře.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSyncToGoogle = async () => {
    try {
      setIsSyncing(true);

      const dayLessons = hasEventsForSelectedDay
        ? selectedDayLessons
        : nextActivity?.type === 'liveLesson' && nextActivity.lesson
        ? [nextActivity.lesson]
        : [];

      const activeTodos = hasEventsForSelectedDay
        ? selectedDayTodos.filter((t) => !t.completed)
        : nextActivity?.type === 'todo' && nextActivity.todo
        ? [nextActivity.todo]
        : [];

      if (activeTodos.length === 0 && dayLessons.length === 0) {
        toast.info(
          'Žádné aktivní události ani online lekce k uložení do kalendáře.'
        );
        setIsSyncing(false);
        return;
      }

      let token = googleAccessToken;
      if (!token) {
        try {
          token = await getGoogleAccessToken();
          setGoogleAccessToken(token);
        } catch (authError: any) {
          if (dayLessons.length > 0) {
            window.open(getGoogleCalendarWebUrl(dayLessons[0]), '_blank');
            toast.info(
              'Otevřeno v Google Kalendáři pro snadné uložení jedním kliknutím.'
            );
            setIsSyncing(false);
            return;
          }
          throw authError;
        }
      }

      let syncedCount = 0;

      // 1. Sync live lessons
      for (const lesson of dayLessons) {
        await syncLiveLessonToGoogleCalendar(token, lesson);
        syncedCount++;
      }

      // 2. Sync active todos
      for (const todo of activeTodos) {
        if (
          todo.referenceId &&
          dayLessons.some((l) => l.id === todo.referenceId)
        ) {
          continue;
        }

        const dueDate = safeToDate(todo.dueDate);
        if (!dueDate) continue;

        const endData = addHours(dueDate, 1);

        const event = {
          summary: `ProEdu: ${todo.title}`,
          description: `Z aplikace ProEdu. ${
            todo.type === 'practice' ? 'Procvičování' : 'Úkol'
          }`,
          start: {
            dateTime: dueDate.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
          end: {
            dateTime: endData.toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        };

        await syncEventToGoogleCalendar(token, event);
        syncedCount++;
      }

      toast.success(
        syncedCount > 0
          ? `Úspěšně uloženo ${syncedCount} událostí do kalendáře.`
          : 'Události byly zkontrolovány.'
      );
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Chyba při ukládání do kalendáře.');
      if (error.message && error.message.includes('401')) {
        setGoogleAccessToken(null);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const isShowingNextActivityFallback =
    !hasEventsForSelectedDay && !!nextActivity;
  const displayDate =
    isShowingNextActivityFallback && nextActivity
      ? nextActivity.date
      : selectedDay;
  const hasItemsToDisplay = hasEventsForSelectedDay || !!nextActivity;

  return (
    <div className="grid lg:grid-cols-[1fr_325px] gap-4 sm:gap-5 bg-white rounded-[1.75rem] p-3.5 sm:p-5 shadow-md border border-gray-100 overflow-hidden h-full">
      {/* Calendar Grid Side */}
      <div className="space-y-3.5 flex flex-col justify-between h-full">
        <div>
          <div className="flex items-center justify-between mb-3.5 gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-brand-blue shadow-inner">
                <CalendarBlueIcon size={18} />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 capitalize">
                {format(currentDate, 'MMMM yyyy', { locale: cs })}
              </h3>
            </div>

            <div className="flex items-center gap-1.5">
              {onOpenScheduleModal && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenScheduleModal}
                  className="h-8 rounded-xl px-2.5 text-xs font-black border-blue-200 bg-blue-50/60 hover:bg-blue-100/80 text-brand-blue flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Naplánovat</span>
                  {!isPremium && (
                    <span className="text-[9px] font-black uppercase bg-amber-200/90 text-amber-900 px-1 py-0.2 rounded">
                      PRO
                    </span>
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={prevMonth}
                className="h-8 w-8 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all"
              >
                <ChevronLeft size={16} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={nextMonth}
                className="h-8 w-8 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all"
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1">
            {daysOfWeek.map((day) => (
              <div
                key={day}
                className="text-center text-[9px] font-black text-gray-400 uppercase tracking-widest py-1"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {calendarDays.map((day, idx) => {
              const dayTodos = getTodosForDay(day);
              const dayLessons = getLessonsForDay(day);
              const isCurrentMonth = isSameDay(
                startOfMonth(day),
                startOfMonth(currentDate)
              );
              const isSelected = isSameDay(day, selectedDay);
              const hasLessons = dayLessons.length > 0;
              const hasLiveLesson = dayLessons.some((l) => l.status === 'live');

              // Vyhodnocení denní kvóty procvičování (vlastní PRO plán nebo zadáno učitelem)
              const practiceTodos = dayTodos.filter(
                (t) => t.type === 'practice'
              );
              const hasPracticeQuota = practiceTodos.length > 0;
              const completedPracticeCount = practiceTodos.filter(
                (t) => t.completed
              ).length;
              const isQuotaMet =
                hasPracticeQuota &&
                completedPracticeCount === practiceTodos.length;
              const isPastDay = isBefore(
                startOfDay(day),
                startOfDay(new Date())
              );
              const isQuotaMissed =
                hasPracticeQuota && !isQuotaMet && isPastDay;
              const isQuotaTodayPending =
                hasPracticeQuota && !isQuotaMet && isToday(day);
              const isQuotaFuturePending =
                hasPracticeQuota && !isQuotaMet && !isPastDay && !isToday(day);

              // Určení barvy buňky podle plnění denní kvóty
              let cellColorClasses = '';
              if (isQuotaMet) {
                // ZELENÉ POLE: student splnil denní kvótu
                cellColorClasses = isSelected
                  ? 'bg-emerald-600 border-emerald-700 text-white shadow-md shadow-emerald-100 ring-2 ring-emerald-300'
                  : 'bg-emerald-100/90 border-emerald-400 text-emerald-950 hover:bg-emerald-200/80';
              } else if (isQuotaMissed) {
                // ČERVENÉ POLE: den uplynul a denní kvóta nebyla splněna
                cellColorClasses = isSelected
                  ? 'bg-rose-600 border-rose-700 text-white shadow-md shadow-rose-100 ring-2 ring-rose-300'
                  : 'bg-rose-100/90 border-rose-400 text-rose-950 hover:bg-rose-200/80';
              } else if (isQuotaTodayPending) {
                // DNEŠNÍ DEN V PLÁNU (čeká na splnění dnes, zčervená až po půlnoci)
                cellColorClasses = isSelected
                  ? 'bg-brand-blue border-brand-blue text-white shadow-md shadow-blue-100 ring-2 ring-amber-300'
                  : 'bg-amber-50/90 border-amber-400 text-amber-950 hover:bg-amber-100/80';
              } else if (isQuotaFuturePending) {
                // BUDOUCÍ NAPLÁNOVANÝ DEN
                cellColorClasses = isSelected
                  ? 'bg-brand-blue border-brand-blue text-white shadow-md shadow-blue-100'
                  : 'bg-blue-50/60 border-blue-200/90 text-brand-blue hover:border-brand-blue/50 hover:bg-blue-100/50';
              } else {
                // BĚŽNÝ DEN BEZ KVÓTY
                cellColorClasses = isSelected
                  ? 'bg-brand-blue border-brand-blue text-white shadow-md shadow-blue-100'
                  : isToday(day)
                  ? 'bg-blue-50/50 border-brand-blue/20 text-brand-blue hover:bg-blue-50'
                  : 'bg-white border-gray-50 text-gray-600 hover:border-brand-blue/30 hover:bg-blue-50/30';
              }

              const cellTitle = isQuotaMet
                ? `Denní kvóta splněna (${completedPracticeCount}/${practiceTodos.length})`
                : isQuotaMissed
                ? `Nesplněná denní kvóta (${completedPracticeCount}/${practiceTodos.length})`
                : hasPracticeQuota
                ? `Naplánováno: ${completedPracticeCount}/${practiceTodos.length} splněno`
                : undefined;

              return (
                <motion.div
                  key={idx}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedDay(day)}
                  title={cellTitle}
                  className={cn(
                    'relative aspect-square flex flex-col items-center justify-center rounded-xl transition-all cursor-pointer group border',
                    !isCurrentMonth ? 'opacity-30' : 'opacity-100',
                    cellColorClasses
                  )}
                >
                  <span
                    className={cn(
                      'text-base font-display font-bold leading-none mb-0.5',
                      isSelected ? 'text-white' : ''
                    )}
                  >
                    {format(day, 'd')}
                  </span>

                  {/* Event Indicator Dots */}
                  {(dayTodos.length > 0 || hasLessons) && (
                    <div className="flex gap-0.5 justify-center items-center">
                      {hasLessons && (
                        <div
                          className={cn(
                            'w-1.5 h-1.5 rounded-full shrink-0',
                            isSelected
                              ? 'bg-white'
                              : hasLiveLesson
                              ? 'bg-red-600 animate-pulse'
                              : 'bg-rose-500'
                          )}
                          title="Online lekce"
                        />
                      )}
                      {dayTodos.slice(0, hasLessons ? 2 : 3).map((t, i) => (
                        <div
                          key={i}
                          className={cn(
                            'w-1.5 h-1.5 rounded-full shrink-0',
                            isSelected
                              ? 'bg-white/90'
                              : t.completed
                              ? 'bg-emerald-600'
                              : isQuotaMissed
                              ? 'bg-rose-600'
                              : isQuotaTodayPending
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                          )}
                        />
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Legend at bottom of calendar grid */}
        <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap text-[10px] font-bold text-gray-500">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 border border-emerald-600 inline-block" />
              Splněná kvóta
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-400 border border-rose-600 inline-block" />
              Nesplněno
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-200 border border-amber-400 inline-block" />
              Dnes v plánu
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-100 border border-blue-300 inline-block" />
              Nadcházející
            </span>
          </div>
        </div>
      </div>

      {/* Right Column: Selected Day + Quota + Upcoming Activity Side */}
      <div className="bg-gray-50/50 rounded-2xl border border-gray-100 flex flex-col h-full min-h-[360px]">
        {/* Header */}
        <div className="p-4 sm:p-4.5 border-b border-gray-100 bg-white rounded-t-2xl">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-brand-blue">
              <StarYellowIcon size={14} className="animate-pulse" />
              {isShowingNextActivityFallback
                ? 'Nejbližší aktivita'
                : isToday(selectedDay)
                ? 'Dnešní aktivita'
                : 'Události dne'}
            </span>

            {/* Daily Quota Status Badge */}
            {selectedDayQuota.hasQuota ? (
              <span
                className={cn(
                  'text-[9px] font-black px-2 py-0.5 rounded-md border uppercase tracking-wider flex items-center gap-1',
                  selectedDayQuota.isMet
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : selectedDayQuota.isMissed
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : 'bg-amber-100 text-amber-900 border-amber-300'
                )}
              >
                {selectedDayQuota.isMet ? (
                  <>
                    <CheckCircle2 size={11} />
                    <span>
                      Splněno {selectedDayQuota.completed}/
                      {selectedDayQuota.total}
                    </span>
                  </>
                ) : selectedDayQuota.isMissed ? (
                  <>
                    <XCircle size={11} />
                    <span>
                      Nesplněno {selectedDayQuota.completed}/
                      {selectedDayQuota.total}
                    </span>
                  </>
                ) : (
                  <span>
                    Kvóta: {selectedDayQuota.completed}/{selectedDayQuota.total}
                  </span>
                )}
              </span>
            ) : (
              isShowingNextActivityFallback &&
              nextActivity && (
                <span
                  className={cn(
                    'text-[9px] font-black px-1.5 py-0.5 rounded border shadow-2xs uppercase tracking-wider',
                    nextActivity.isLive
                      ? 'bg-red-600 text-white border-red-500 animate-pulse'
                      : 'bg-blue-50 text-brand-blue border-blue-200'
                  )}
                >
                  {formatRelativeActivityTime(
                    nextActivity.date,
                    nextActivity.isLive
                  )}
                </span>
              )
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-sans font-black text-brand-blue lining-nums leading-none">
              {safeFormat(displayDate, 'd')}
            </span>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-0.5">
                {safeFormat(displayDate, 'EEEE', { locale: cs })}
              </span>
              <span className="text-xs font-bold text-gray-600 capitalize">
                {safeFormat(displayDate, 'LLLL yyyy', { locale: cs })}
              </span>
            </div>
          </div>

          {isShowingNextActivityFallback &&
            nextActivity &&
            !isSameDay(selectedDay, nextActivity.date) && (
              <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between gap-2 text-[10px] text-gray-500">
                <span className="truncate">
                  Pro {safeFormat(selectedDay, 'd. M.')} není nic v plánu
                </span>
                <button
                  type="button"
                  onClick={() => handleJumpToDate(nextActivity.date)}
                  className="text-brand-blue hover:text-blue-800 font-bold flex items-center gap-1 shrink-0 cursor-pointer hover:underline"
                >
                  <span>Přejít</span>
                  <ArrowRight size={11} />
                </button>
              </div>
            )}
        </div>

        {/* Scrollable Items List */}
        <div className="flex-1 p-3.5 sm:p-4 overflow-y-auto space-y-3 max-h-[380px] scrollbar-hide">
          <AnimatePresence mode="wait">
            {hasEventsForSelectedDay ? (
              <motion.div
                key={selectedDay.toISOString()}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                {/* 1. Live Lessons of the selected day */}
                {selectedDayLessons.map((lesson) => {
                  const isLive = lesson.status === 'live';
                  const lessonDate =
                    safeToDate(lesson.scheduledAt) || new Date();

                  return (
                    <div
                      key={`lesson-${lesson.id}`}
                      className={cn(
                        'p-3.5 rounded-2xl border transition-all shadow-sm',
                        isLive
                          ? 'bg-red-50/70 border-red-300 ring-1 ring-red-400/30 shadow-red-100'
                          : 'bg-white border-rose-200/80 hover:border-rose-300'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                            isLive
                              ? 'bg-red-600 text-white animate-pulse'
                              : 'bg-rose-100 text-rose-700'
                          )}
                        >
                          <Video size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            {isLive ? (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-red-600 text-white animate-pulse">
                                Živě
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-800">
                                Online lekce
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-gray-100 text-gray-600 uppercase">
                              {lesson.subject || 'Výuka'}
                            </span>
                          </div>

                          <h4 className="font-bold text-sm leading-tight text-gray-900 mb-1 truncate">
                            {lesson.title}
                          </h4>

                          <div className="flex items-center justify-between text-[11px] text-gray-500 font-semibold mb-2.5">
                            <div className="flex items-center gap-1">
                              <Clock size={12} className="text-gray-400" />
                              <span>
                                {safeFormat(lessonDate, 'HH:mm') || '10:00'} (
                                {lesson.durationMinutes} min)
                              </span>
                            </div>
                            <span className="text-gray-700 font-bold truncate max-w-[110px]">
                              {lesson.teacherName}
                            </span>
                          </div>

                          <Button
                            size="sm"
                            onClick={() => {
                              if (onJoinLesson) {
                                onJoinLesson(lesson);
                              } else {
                                window.open(
                                  lesson.meetUrl,
                                  '_blank',
                                  'noopener,noreferrer'
                                );
                              }
                            }}
                            className={cn(
                              'w-full h-8 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer',
                              isLive
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-gray-900 hover:bg-black text-white'
                            )}
                          >
                            <Video size={13} />
                            <span>
                              {isLive ? 'Připojit se' : 'Google Meet'}
                            </span>
                            <ExternalLink size={11} />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* 2. Todos / Scheduled Practice of the selected day */}
                {selectedDayTodos.map((todo) => {
                  const isPractice = todo.type === 'practice';
                  const isAssignedByTeacher = Boolean(
                    todo.addedBy && user?.uid && todo.addedBy !== user.uid
                  );
                  const isMissedPractice =
                    isPractice &&
                    !todo.completed &&
                    selectedDayQuota.isPast;

                  return (
                    <div
                      key={todo.id}
                      className={cn(
                        'p-3.5 rounded-2xl border shadow-2xs transition-all group',
                        todo.completed
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : isMissedPractice
                          ? 'bg-rose-50/60 border-rose-200'
                          : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-sm'
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <div
                          className={cn(
                            'mt-0.5 rounded-full p-0.5 shrink-0',
                            todo.completed
                              ? 'text-emerald-600'
                              : isMissedPractice
                              ? 'text-rose-500'
                              : 'text-brand-blue'
                          )}
                        >
                          {todo.completed ? (
                            <CorrectCyanIcon size={18} />
                          ) : (
                            <Circle size={17} />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1.5 mb-1">
                            <div className="flex items-center gap-1 flex-wrap">
                              {isAssignedByTeacher && (
                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200">
                                  Zadáno učitelem
                                </span>
                              )}
                              <span
                                className={cn(
                                  'px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider',
                                  todo.completed
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : isMissedPractice
                                    ? 'bg-rose-100 text-rose-800'
                                    : todo.type === 'practice'
                                    ? 'bg-blue-50 text-blue-700'
                                    : todo.type === 'course_lesson'
                                    ? 'bg-purple-50 text-purple-700'
                                    : 'bg-orange-50 text-orange-600'
                                )}
                              >
                                {todo.type === 'practice'
                                  ? todo.completed
                                    ? 'Splněno'
                                    : isMissedPractice
                                    ? 'Nesplněno'
                                  : 'Procvičování'
                                  : todo.type === 'course_lesson'
                                  ? 'Lekce'
                                  : 'Úkol'}
                              </span>
                              {todo.subjectId && (
                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-gray-100 text-gray-600">
                                  {todo.subjectId}
                                </span>
                              )}
                            </div>

                            {isPractice && !isAssignedByTeacher && (
                              <button
                                type="button"
                                disabled={deletingId === todo.id}
                                onClick={() => handleDeleteTodo(todo, false)}
                                className="text-gray-300 hover:text-rose-600 transition-colors p-0.5 cursor-pointer"
                                title="Odebrat z kalendáře"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>

                          <h4
                            className={cn(
                              'font-bold text-xs sm:text-sm leading-snug text-gray-900 mb-2',
                              todo.completed && 'line-through text-gray-500'
                            )}
                          >
                            {todo.title}
                          </h4>

                          <div className="flex items-center justify-between gap-2 pt-1">
                            <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                              <Clock size={11} />
                              <span>
                                {safeFormat(todo.dueDate, 'HH:mm') || '16:00'}
                              </span>
                            </div>

                            {isPractice && todo.referenceId && (
                              <Button
                                size="sm"
                                onClick={() =>
                                  navigate(
                                    `/practice/session/${todo.referenceId}`
                                  )
                                }
                                className={cn(
                                  'h-7 px-3 rounded-xl text-[11px] font-black flex items-center gap-1 cursor-pointer',
                                  todo.completed
                                    ? 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
                                    : 'bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] border border-blue-200/80'
                                )}
                              >
                                <Play
                                  size={10}
                                  className={
                                    todo.completed
                                      ? 'text-gray-700'
                                      : 'fill-[#0F2942] text-[#0F2942]'
                                  }
                                />
                                <span>
                                  {todo.completed ? 'Zopakovat' : 'Procvičit'}
                                </span>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* 3. Nadcházející události v dalších dnech */}
                {upcomingOtherDaysEvents.length > 0 && (
                  <div className="pt-3 mt-3 border-t border-gray-200/70 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                        Nadcházející události ({upcomingOtherDaysEvents.length})
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {upcomingOtherDaysEvents.slice(0, 3).map((item) => (
                        <div
                          key={item.id}
                          onClick={() => handleJumpToDate(item.date)}
                          className="p-2.5 rounded-xl bg-white border border-gray-100 hover:border-blue-200 flex items-center justify-between gap-2 cursor-pointer transition-all"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-[9px] font-black uppercase text-brand-blue block">
                              {format(item.date, 'EEEEEE d. M.', {
                                locale: cs,
                              })}
                            </span>
                            <p className="text-xs font-bold text-gray-800 truncate">
                              {item.title}
                            </p>
                          </div>
                          <ArrowRight
                            size={13}
                            className="text-gray-400 shrink-0"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ) : nextActivity ? (
              <motion.div
                key={`next-${nextActivity.id}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-3"
              >
                {nextActivity.type === 'liveLesson' && nextActivity.lesson ? (
                  (() => {
                    const lesson = nextActivity.lesson;
                    const isLive = lesson.status === 'live';
                    const lessonDate =
                      safeToDate(lesson.scheduledAt) || new Date();

                    return (
                      <div
                        className={cn(
                          'p-4 rounded-2xl border transition-all shadow-sm',
                          isLive
                            ? 'bg-red-50/70 border-red-300 ring-1 ring-red-400/30 shadow-red-100'
                            : 'bg-white border-rose-200/80 hover:border-rose-300'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
                              isLive
                                ? 'bg-red-600 text-white animate-pulse'
                                : 'bg-rose-100 text-rose-700'
                            )}
                          >
                            <Video size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              {isLive ? (
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-red-600 text-white animate-pulse">
                                  Živě
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-800">
                                  Online lekce
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-gray-100 text-gray-600 uppercase">
                                {lesson.subject || 'Výuka'}
                              </span>
                            </div>

                            <h4 className="font-bold text-sm leading-tight text-gray-900 mb-1 truncate">
                              {lesson.title}
                            </h4>

                            <div className="flex items-center justify-between text-[11px] text-gray-500 font-semibold mb-3">
                              <div className="flex items-center gap-1">
                                <Clock size={12} className="text-gray-400" />
                                <span>
                                  {safeFormat(lessonDate, 'HH:mm') || '10:00'} (
                                  {lesson.durationMinutes} min)
                                </span>
                              </div>
                              <span className="text-gray-700 font-bold truncate max-w-[120px]">
                                {lesson.teacherName}
                              </span>
                            </div>

                            <div className="pt-2 border-t border-gray-100">
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (onJoinLesson) {
                                    onJoinLesson(lesson);
                                  } else {
                                    window.open(
                                      lesson.meetUrl,
                                      '_blank',
                                      'noopener,noreferrer'
                                    );
                                  }
                                }}
                                className={cn(
                                  'w-full h-8 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer',
                                  isLive
                                    ? 'bg-red-600 hover:bg-red-700 text-white'
                                    : 'bg-gray-900 hover:bg-black text-white'
                                )}
                              >
                                <Video size={13} />
                                <span>
                                  {isLive ? 'Připojit se' : 'Google Meet'}
                                </span>
                                <ExternalLink size={11} />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  (() => {
                    const todo = nextActivity.todo;
                    return (
                      <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              'mt-1 rounded-full p-0.5',
                              todo?.completed
                                ? 'text-green-500'
                                : 'text-brand-blue'
                            )}
                          >
                            {todo?.completed ? (
                              <CorrectCyanIcon size={18} />
                            ) : (
                              <Circle size={18} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4
                              className={cn(
                                'font-bold text-sm leading-tight text-gray-900 mb-2',
                                todo?.completed && 'line-through text-gray-400'
                              )}
                            >
                              {nextActivity.title}
                            </h4>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400">
                                <Clock size={12} />
                                {safeFormat(nextActivity.date, 'HH:mm') ||
                                  '16:00'}
                              </div>
                              {todo?.type === 'practice' && todo.referenceId ? (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    navigate(
                                      `/practice/session/${todo.referenceId}`
                                    )
                                  }
                                  className="h-7 px-3 rounded-xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] text-[11px] font-black flex items-center gap-1 cursor-pointer"
                                >
                                  <Play
                                    size={10}
                                    className="fill-[#0F2942] text-[#0F2942]"
                                  />
                                  <span>Procvičit</span>
                                </Button>
                              ) : (
                                <span
                                  className={cn(
                                    'px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider',
                                    todo?.type === 'practice'
                                      ? 'bg-blue-50 text-blue-600'
                                      : todo?.type === 'course_lesson'
                                      ? 'bg-purple-50 text-purple-700'
                                      : 'bg-orange-50 text-orange-600'
                                  )}
                                >
                                  {todo?.type === 'practice'
                                    ? 'Procvičování'
                                    : todo?.type === 'course_lesson'
                                    ? 'Lekce'
                                    : 'Úkol'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}

                {/* Other upcoming events */}
                {upcomingCandidates.length > 1 && (
                  <div className="pt-2 border-t border-gray-200/70 space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 block">
                      Další v plánu
                    </span>
                    <div className="space-y-1.5">
                      {upcomingCandidates.slice(1, 4).map((item) => (
                        <div
                          key={item.id}
                          onClick={() => handleJumpToDate(item.date)}
                          className="p-2.5 rounded-xl bg-white border border-gray-100 hover:border-blue-200 flex items-center justify-between gap-2 cursor-pointer transition-all"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-[9px] font-black uppercase text-brand-blue block">
                              {format(item.date, 'EEEEEE d. M.', {
                                locale: cs,
                              })}
                            </span>
                            <p className="text-xs font-bold text-gray-800 truncate">
                              {item.title}
                            </p>
                          </div>
                          <ArrowRight
                            size={13}
                            className="text-gray-400 shrink-0"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center text-center py-8 px-3"
              >
                <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-gray-200 mb-3 border border-gray-50">
                  <CalendarBlueIcon size={30} />
                </div>
                <p className="text-gray-500 font-bold text-sm">
                  Žádné naplánované události
                </p>
                <p className="text-gray-400 text-xs mt-1 max-w-[220px]">
                  {isPremium
                    ? 'Naplánuj si procvičování témat a plň svou denní kvótu!'
                    : 'Sestav si vlastní rozvrh procvičování do kalendáře s funkcí PRO.'}
                </p>
                {onOpenScheduleModal && (
                  <Button
                    size="sm"
                    onClick={onOpenScheduleModal}
                    className="mt-4 rounded-xl bg-[#1E1B18] hover:bg-black text-white text-xs font-black h-9 px-4 flex items-center gap-1.5 cursor-pointer"
                  >
                    {!isPremium ? (
                      <Lock size={12} className="text-amber-400" />
                    ) : (
                      <Plus size={13} />
                    )}
                    <span>Naplánovat procvičování</span>
                    {!isPremium && (
                      <span className="text-[9px] font-black uppercase bg-amber-400 text-black px-1 py-0.2 rounded">
                        PRO
                      </span>
                    )}
                  </Button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ONLY THE SINGLE "Uložit do kalendáře" BUTTON */}
        {hasItemsToDisplay && (
          <div className="p-4 mt-auto border-t border-gray-100">
            <Button
              className="w-full bg-[#1E1B18] hover:bg-black text-white rounded-xl h-11 font-bold gap-2 text-sm shadow-md cursor-pointer transition-transform hover:scale-[1.01]"
              onClick={handleSyncToGoogle}
              disabled={isSyncing}
            >
              <RefreshCcw
                size={16}
                className={isSyncing ? 'animate-spin text-amber-400' : ''}
              />
              {isSyncing ? 'Ukládám do kalendáře...' : 'Uložit do kalendáře'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
