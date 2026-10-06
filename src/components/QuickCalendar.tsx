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
  addHours 
} from 'date-fns';
import { cs } from 'date-fns/locale';
import { 
  ChevronLeft, 
  ChevronRight, 
  Circle, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  Clock, 
  ArrowRight, 
  RefreshCcw, 
  Video, 
  ExternalLink,
  Download,
  Sparkles
} from 'lucide-react';
type TodoItem = any;
import { safeToDate, cn } from '../lib/utils';
import { Button } from './ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { 
  getGoogleAccessToken, 
  syncEventToGoogleCalendar, 
  syncLiveLessonToGoogleCalendar,
  getGoogleCalendarWebUrl,
  downloadLessonIcsFile 
} from '../services/calendarService';
import { LiveLesson } from '../types';
import { toast } from 'sonner';

interface QuickCalendarProps {
  todos: TodoItem[];
  liveLessons?: LiveLesson[];
  onJoinLesson?: (lesson: LiveLesson) => void;
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
  const diffMinutes = Math.round((date.getTime() - now.getTime()) / (60 * 1000));
  
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

  return `${format(date, 'EEEE d. M.', { locale: cs })} v ${format(date, 'HH:mm')}`;
}

export default function QuickCalendar({ todos, liveLessons = [], onJoinLesson }: QuickCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);

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
    return todos.filter(todo => {
      const d = safeToDate(todo.dueDate);
      return d ? isSameDay(d, day) : false;
    });
  };

  const getLessonsForDay = (day: Date) => {
    return liveLessons.filter(lesson => {
      const d = safeToDate(lesson.scheduledAt);
      return d ? isSameDay(d, day) : false;
    });
  };

  const daysOfWeek = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
  const selectedDayTodos = getTodosForDay(selectedDay);
  const selectedDayLessons = getLessonsForDay(selectedDay);
  const hasEventsForSelectedDay = selectedDayTodos.length > 0 || selectedDayLessons.length > 0;

  // Compute the closest upcoming activity (Live lesson or active todo)
  const nextActivity = useMemo(() => {
    const now = new Date();
    // Allow events from 15 minutes ago (for lessons that just started)
    const cutoff = new Date(now.getTime() - 15 * 60 * 1000);

    const candidates: {
      id: string;
      title: string;
      date: Date;
      type: 'liveLesson' | 'todo';
      isLive?: boolean;
      lesson?: LiveLesson;
      todo?: any;
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

    // 2. Active todos
    todos.forEach((todo) => {
      if (!todo.completed && todo.dueDate) {
        // Skip duplicate reference if matching an active live lesson
        if (todo.referenceId && liveLessons.some(l => l.id === todo.referenceId)) {
          return;
        }
        const d = safeToDate(todo.dueDate);
        if (d && d >= cutoff) {
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

    if (candidates.length === 0) return null;

    // Sort by date ascending (live lessons currently running always take first precedence)
    candidates.sort((a, b) => {
      if (a.isLive && !b.isLive) return -1;
      if (b.isLive && !a.isLive) return 1;
      return a.date.getTime() - b.date.getTime();
    });

    return candidates[0];
  }, [todos, liveLessons]);

  const handleJumpToNextActivity = () => {
    if (!nextActivity) return;
    setSelectedDay(nextActivity.date);
    setCurrentDate(startOfMonth(nextActivity.date));
  };

  const handleSyncToGoogle = async () => {
    try {
      setIsSyncing(true);

      const dayLessons = hasEventsForSelectedDay 
        ? selectedDayLessons 
        : (nextActivity?.type === 'liveLesson' && nextActivity.lesson ? [nextActivity.lesson] : []);

      const activeTodos = hasEventsForSelectedDay 
        ? selectedDayTodos.filter(t => !t.completed) 
        : (nextActivity?.type === 'todo' && nextActivity.todo ? [nextActivity.todo] : []);

      if (activeTodos.length === 0 && dayLessons.length === 0) {
        toast.info("Žádné aktivní události ani online lekce k uložení do kalendáře.");
        setIsSyncing(false);
        return;
      }

      let token = googleAccessToken;
      if (!token) {
        try {
          token = await getGoogleAccessToken();
          setGoogleAccessToken(token);
        } catch (authError: any) {
          // Fallback to web link if OAuth is cancelled or unconfigured
          if (dayLessons.length > 0) {
            window.open(getGoogleCalendarWebUrl(dayLessons[0]), '_blank');
            toast.info("Otevřeno v Google Kalendáři pro snadné uložení jedním kliknutím.");
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

      // 2. Sync active todos (avoiding duplicates if already referencing a synced lesson)
      for (const todo of activeTodos) {
        if (todo.referenceId && dayLessons.some(l => l.id === todo.referenceId)) {
          continue;
        }

        const dueDate = safeToDate(todo.dueDate);
        if (!dueDate) continue;

        const endData = addHours(dueDate, 1);

        const event = {
          summary: `ProEdu: ${todo.title}`,
          description: `Z aplikace ProEdu. ${todo.type === 'practice' ? 'Procvičování' : 'Úkol'}`,
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

      toast.success(syncedCount > 0 ? `Úspěšně uloženo ${syncedCount} událostí do kalendáře.` : "Události byly zkontrolovány.");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Chyba při ukládání do kalendáře.");
      if (error.message && error.message.includes("401")) {
         setGoogleAccessToken(null);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const isShowingNextActivityFallback = !hasEventsForSelectedDay && !!nextActivity;
  const displayDate = isShowingNextActivityFallback && nextActivity ? nextActivity.date : selectedDay;
  const hasItemsToDisplay = hasEventsForSelectedDay || !!nextActivity;

  return (
    <div className="grid lg:grid-cols-[1fr_350px] gap-8 bg-white rounded-[2.5rem] p-8 shadow-xl border border-gray-100 overflow-hidden">
      {/* Calendar Grid Side */}
      <div className="space-y-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-brand-blue shadow-inner">
                <CalendarIcon size={20} />
              </div>
              <h3 className="text-2xl font-display font-black text-gray-900 capitalize">
                {format(currentDate, 'MMMM yyyy', { locale: cs })}
              </h3>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="icon" onClick={prevMonth} className="rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all">
                <ChevronLeft size={20} />
              </Button>
              <Button variant="ghost" size="icon" onClick={nextMonth} className="rounded-xl hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all">
                <ChevronRight size={20} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 mb-2">
            {daysOfWeek.map(day => (
              <div key={day} className="text-center text-[10px] font-black text-gray-400 uppercase tracking-widest py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day, idx) => {
              const dayTodos = getTodosForDay(day);
              const dayLessons = getLessonsForDay(day);
              const isCurrentMonth = isSameDay(startOfMonth(day), startOfMonth(currentDate));
              const isSelected = isSameDay(day, selectedDay);
              const hasLessons = dayLessons.length > 0;
              const hasLiveLesson = dayLessons.some(l => l.status === 'live');

              return (
                <motion.div
                  key={idx}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    "relative aspect-square flex flex-col items-center justify-center rounded-2xl transition-all cursor-pointer group border-2",
                    !isCurrentMonth ? "opacity-30" : "opacity-100",
                    isSelected 
                      ? "bg-brand-blue border-brand-blue text-white shadow-lg shadow-blue-100" 
                      : isToday(day)
                        ? "bg-blue-50/50 border-brand-blue/20 text-brand-blue hover:bg-blue-50"
                        : "bg-white border-gray-50 text-gray-600 hover:border-brand-blue/30 hover:bg-blue-50/30"
                  )}
                >
                  <span className={cn(
                    "text-lg font-display font-bold leading-none mb-1",
                    isSelected ? "text-white" : ""
                  )}>
                    {format(day, 'd')}
                  </span>

                  {/* Event Indicator Dots */}
                  {(dayTodos.length > 0 || hasLessons) && (
                    <div className="flex gap-0.5 justify-center items-center">
                      {/* Online Lesson red/purple indicator */}
                      {hasLessons && (
                        <div
                          className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            isSelected 
                              ? "bg-white" 
                              : hasLiveLesson 
                              ? "bg-red-600 animate-pulse" 
                              : "bg-rose-500"
                          )}
                          title="Online lekce"
                        />
                      )}
                      {/* Standard todos dots */}
                      {dayTodos.slice(0, hasLessons ? 2 : 3).map((t, i) => (
                        <div
                          key={i}
                          className={cn(
                            "w-1.5 h-1.5 rounded-full shrink-0",
                            isSelected ? "bg-white/80" : t.completed ? "bg-green-500" : "bg-blue-500"
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
      </div>

      {/* Right Column: Upcoming / Selected Activity Side */}
      <div className="bg-gray-50/50 rounded-[1.5rem] border border-gray-100 flex flex-col min-h-[460px]">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 bg-white rounded-t-[1.5rem]">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-brand-blue">
              <Sparkles size={13} className="text-amber-500 animate-pulse" />
              {isShowingNextActivityFallback ? 'Nejbližší aktivita' : isToday(selectedDay) ? 'Dnešní aktivita' : 'Události dne'}
            </span>
            {isShowingNextActivityFallback && nextActivity && (
              <span className={cn(
                "text-[10px] font-black px-2 py-0.5 rounded-md border shadow-2xs uppercase tracking-wider",
                nextActivity.isLive 
                  ? "bg-red-600 text-white border-red-500 animate-pulse" 
                  : "bg-blue-50 text-brand-blue border-blue-200"
              )}>
                {formatRelativeActivityTime(nextActivity.date, nextActivity.isLive)}
              </span>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-display font-black text-brand-blue lining-nums leading-none">
              {safeFormat(displayDate, 'd')}
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                {safeFormat(displayDate, 'EEEE', { locale: cs })}
              </span>
              <span className="text-sm font-bold text-gray-600 capitalize">
                {safeFormat(displayDate, 'LLLL yyyy', { locale: cs })}
              </span>
            </div>
          </div>

          {isShowingNextActivityFallback && nextActivity && !isSameDay(selectedDay, nextActivity.date) && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between gap-2 text-[11px] text-gray-500">
              <span className="truncate">Pro {safeFormat(selectedDay, 'd. M.')} není nic v plánu</span>
              <button
                type="button"
                onClick={handleJumpToNextActivity}
                className="text-brand-blue hover:text-blue-800 font-bold flex items-center gap-1 shrink-0 cursor-pointer hover:underline"
              >
                <span>Přejít na aktivitu</span>
                <ArrowRight size={12} />
              </button>
            </div>
          )}
        </div>

        {/* Scrollable Items List */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 max-h-[500px] scrollbar-hide">
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
                  const lessonDate = safeToDate(lesson.scheduledAt) || new Date();

                  return (
                    <div
                      key={`lesson-${lesson.id}`}
                      className={cn(
                        "p-4 rounded-2xl border transition-all shadow-sm",
                        isLive
                          ? "bg-red-50/70 border-red-300 ring-1 ring-red-400/30 shadow-red-100"
                          : "bg-white border-rose-200/80 hover:border-rose-300"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                          isLive ? "bg-red-600 text-white animate-pulse" : "bg-rose-100 text-rose-700"
                        )}>
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
                              <span>{safeFormat(lessonDate, 'HH:mm') || '10:00'} ({lesson.durationMinutes} min)</span>
                            </div>
                            <span className="text-gray-700 font-bold truncate max-w-[120px]">
                              {lesson.teacherName}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                            <Button
                              size="sm"
                              onClick={() => {
                                if (onJoinLesson) {
                                  onJoinLesson(lesson);
                                } else {
                                  window.open(lesson.meetUrl, '_blank', 'noopener,noreferrer');
                                }
                              }}
                              className={cn(
                                "flex-1 h-8 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer",
                                isLive ? "bg-red-600 hover:bg-red-700 text-white" : "bg-gray-900 hover:bg-black text-white"
                              )}
                            >
                              <Video size={13} />
                              <span>{isLive ? 'Připojit se' : 'Google Meet'}</span>
                              <ExternalLink size={11} />
                            </Button>

                            <Button
                              size="icon"
                              variant="outline"
                              title="Stáhnout .ics do kalendáře"
                              onClick={() => downloadLessonIcsFile(lesson)}
                              className="h-8 w-8 rounded-xl text-gray-600 hover:text-gray-900 border-gray-200 shrink-0 cursor-pointer"
                            >
                              <Download size={13} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* 2. Todos of the selected day */}
                {selectedDayTodos.map((todo) => (
                  <div 
                    key={todo.id}
                    className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "mt-1 rounded-full p-0.5",
                        todo.completed ? "text-green-500" : "text-brand-blue"
                      )}>
                        {todo.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </div>
                      <div className="flex-1">
                        <h4 className={cn(
                          "font-bold text-sm leading-tight text-gray-900 mb-2",
                          todo.completed && "line-through text-gray-400"
                        )}>
                          {todo.title}
                        </h4>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400">
                            <Clock size={12} />
                            {safeFormat(todo.dueDate, 'HH:mm') || '10:00'}
                          </div>
                          <span className={cn(
                            "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider",
                            todo.type === 'practice' ? "bg-blue-50 text-blue-600" : todo.type === 'course_lesson' ? "bg-purple-50 text-purple-700" : "bg-orange-50 text-orange-600"
                          )}>
                            {todo.type === 'practice' ? 'Procvičování' : todo.type === 'course_lesson' ? 'Lekce' : 'Úkol'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
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
                    const lessonDate = safeToDate(lesson.scheduledAt) || new Date();

                    return (
                      <div
                        className={cn(
                          "p-4 rounded-2xl border transition-all shadow-sm",
                          isLive
                            ? "bg-red-50/70 border-red-300 ring-1 ring-red-400/30 shadow-red-100"
                            : "bg-white border-rose-200/80 hover:border-rose-300"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
                            isLive ? "bg-red-600 text-white animate-pulse" : "bg-rose-100 text-rose-700"
                          )}>
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
                                <span>{safeFormat(lessonDate, 'HH:mm') || '10:00'} ({lesson.durationMinutes} min)</span>
                              </div>
                              <span className="text-gray-700 font-bold truncate max-w-[120px]">
                                {lesson.teacherName}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                              <Button
                                size="sm"
                                onClick={() => {
                                  if (onJoinLesson) {
                                    onJoinLesson(lesson);
                                  } else {
                                    window.open(lesson.meetUrl, '_blank', 'noopener,noreferrer');
                                  }
                                }}
                                className={cn(
                                  "flex-1 h-8 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer",
                                  isLive ? "bg-red-600 hover:bg-red-700 text-white" : "bg-gray-900 hover:bg-black text-white"
                                )}
                              >
                                <Video size={13} />
                                <span>{isLive ? 'Připojit se' : 'Google Meet'}</span>
                                <ExternalLink size={11} />
                              </Button>

                              <Button
                                size="icon"
                                variant="outline"
                                title="Stáhnout .ics do kalendáře"
                                onClick={() => downloadLessonIcsFile(lesson)}
                                className="h-8 w-8 rounded-xl text-gray-600 hover:text-gray-900 border-gray-200 shrink-0 cursor-pointer"
                              >
                                <Download size={13} />
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
                          <div className={cn(
                            "mt-1 rounded-full p-0.5",
                            todo?.completed ? "text-green-500" : "text-brand-blue"
                          )}>
                            {todo?.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                          </div>
                          <div className="flex-1">
                            <h4 className={cn(
                              "font-bold text-sm leading-tight text-gray-900 mb-2",
                              todo?.completed && "line-through text-gray-400"
                            )}>
                              {nextActivity.title}
                            </h4>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400">
                                <Clock size={12} />
                                {safeFormat(nextActivity.date, 'HH:mm') || '10:00'}
                              </div>
                              <span className={cn(
                                "px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider",
                                todo?.type === 'practice' ? "bg-blue-50 text-blue-600" : todo?.type === 'course_lesson' ? "bg-purple-50 text-purple-700" : "bg-orange-50 text-orange-600"
                              )}>
                                {todo?.type === 'practice' ? 'Procvičování' : todo?.type === 'course_lesson' ? 'Lekce' : 'Úkol'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center text-center py-12"
              >
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center text-gray-200 mb-4 border border-gray-50">
                  <CalendarIcon size={32} />
                </div>
                <p className="text-gray-400 font-bold text-sm">Žádné události</p>
                <p className="text-gray-300 text-xs mt-1">Užijte si volný den!</p>
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
              <RefreshCcw size={16} className={isSyncing ? "animate-spin text-amber-400" : ""} />
              {isSyncing ? "Ukládám do kalendáře..." : "Uložit do kalendáře"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
