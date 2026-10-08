import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { 
  Video, 
  Calendar, 
  Clock, 
  Radio, 
  Play, 
  CheckCircle2, 
  ExternalLink, 
  Users, 
  ChevronDown, 
  ChevronUp, 
  ArrowRight 
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { toast } from 'sonner';
import { LiveLesson } from '../../types';
import { updateLessonStatus } from '../../services/liveLessonService';
import { cn, safeToDate } from '../../lib/utils';

interface TeacherLessonsOverviewProps {
  lessons: LiveLesson[];
  onNavigateToTab?: (tab: string) => void;
}

export default function TeacherLessonsOverview({
  lessons,
  onNavigateToTab
}: TeacherLessonsOverviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filter only active (live or scheduled) lessons
  const activeLessons = useMemo(() => {
    return lessons.filter(l => l.status === 'live' || l.status === 'scheduled');
  }, [lessons]);

  const hasActiveLiveLesson = useMemo(() => {
    return activeLessons.some(l => l.status === 'live');
  }, [activeLessons]);

  const sortedLessons = useMemo(() => {
    return [...activeLessons].sort((a, b) => {
      if (a.status === 'live' && b.status !== 'live') return -1;
      if (b.status === 'live' && a.status !== 'live') return 1;
      const aTime = a.scheduledAt?.toMillis ? a.scheduledAt.toMillis() : (safeToDate(a.scheduledAt)?.getTime() || 0);
      const bTime = b.scheduledAt?.toMillis ? b.scheduledAt.toMillis() : (safeToDate(b.scheduledAt)?.getTime() || 0);
      return aTime - bTime;
    });
  }, [activeLessons]);

  if (!activeLessons || activeLessons.length === 0 || sortedLessons.length === 0) {
    return null;
  }

  const primaryLesson = sortedLessons[0];
  const remainingLessons = sortedLessons.slice(1);

  const handleStartLesson = async (lesson: LiveLesson) => {
    if (!lesson.id) return;
    setUpdatingId(lesson.id);
    try {
      await updateLessonStatus(lesson.id, 'live');
      toast.success('Lekce byla spuštěna! Otevírám Google Meet...');
      window.open(lesson.meetUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast.error('Nepodařilo se spustit lekci: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleFinishLesson = async (lesson: LiveLesson) => {
    if (!lesson.id) return;
    setUpdatingId(lesson.id);
    try {
      await updateLessonStatus(lesson.id, 'completed');
      toast.success('Lekce byla označena jako dokončená.');
    } catch (err: any) {
      toast.error('Chyba: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const renderLessonCard = (lesson: LiveLesson, isPrimary = false) => {
    const isLive = lesson.status === 'live';
    const lessonDate = safeToDate(lesson.scheduledAt) || new Date();

    return (
      <div
        key={lesson.id}
        className={cn(
          "rounded-3xl p-5 sm:p-6 transition-all border space-y-4",
          isLive
            ? "bg-gradient-to-br from-red-50 via-white to-rose-50/40 border-red-300 shadow-lg shadow-red-100/50 ring-2 ring-red-400/20"
            : isPrimary
            ? "bg-[#FAF7F0]/60 border-amber-200/80 shadow-xs"
            : "bg-[#FAF7F0]/40 border-gray-200/70 hover:border-gray-300"
        )}
      >
        {/* Live Lesson Banner */}
        {isLive && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md shadow-red-600/20 animate-pulse">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Radio size={18} className="text-white animate-ping" />
              </div>
              <div>
                <p className="font-black text-xs sm:text-sm text-white">
                  Výuka právě probíhá – žáci se mohou připojovat
                </p>
                <p className="text-[11px] text-white/90">
                  Google Meet místnost je otevřená.
                </p>
              </div>
            </div>
            <Button
              onClick={() => window.open(lesson.meetUrl, '_blank', 'noopener,noreferrer')}
              className="h-8 px-3 rounded-xl bg-white hover:bg-gray-100 text-red-600 font-black text-xs shrink-0 shadow cursor-pointer transition-transform hover:scale-105"
            >
              Otevřít hovor
            </Button>
          </div>
        )}

        {/* Lesson Details */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {isLive ? (
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-red-600 text-white shadow-xs animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  PRÁVĚ PROBÍHÁ
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                  Naplánováno
                </span>
              )}

              <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-white border border-gray-200 text-gray-700 uppercase tracking-wider shadow-2xs">
                {lesson.subject || 'Výuka'}
              </span>

              <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/80 border border-gray-200 text-gray-600 flex items-center gap-1">
                <Users size={12} className="text-gray-400" />
                <span>
                  {lesson.targetAudience === 'individual'
                    ? `${lesson.studentIds?.length || 1} vybraných žáků`
                    : 'Všichni žáci'}
                </span>
              </span>
            </div>
          </div>

          <h4 className="text-lg sm:text-xl font-black text-gray-900 leading-snug">
            {lesson.title}
          </h4>

          {lesson.description && (
            <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
              {lesson.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs text-gray-500 font-semibold pt-1">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="text-gray-400 shrink-0" />
              <span>{format(lessonDate, 'EEEE d. MMMM yyyy', { locale: cs })}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-gray-400 shrink-0" />
              <span>{format(lessonDate, 'HH:mm')} ({lesson.durationMinutes} minut)</span>
            </div>
          </div>
        </div>

        {/* Buttons / Actions */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-t border-gray-100">
          <div>
            {isLive ? (
              <Button
                variant="outline"
                size="sm"
                disabled={updatingId === lesson.id}
                onClick={() => handleFinishLesson(lesson)}
                className="h-9 px-3.5 rounded-xl border-emerald-300 text-emerald-800 hover:bg-emerald-50 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span>Dokončit výuku</span>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(lesson.meetUrl, '_blank', 'noopener,noreferrer')}
                className="h-9 px-3.5 rounded-xl border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <ExternalLink size={13} />
                <span>Otestovat odkaz</span>
              </Button>
            )}
          </div>

          <div>
            {isLive ? (
              <Button
                onClick={() => window.open(lesson.meetUrl, '_blank', 'noopener,noreferrer')}
                className="h-10 px-5 rounded-xl font-black text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2 shadow-md shadow-red-300 cursor-pointer transition-transform hover:scale-[1.02]"
              >
                <Video size={16} />
                <span>Vstoupit do výuky (Meet)</span>
              </Button>
            ) : (
              <Button
                disabled={updatingId === lesson.id}
                onClick={() => handleStartLesson(lesson)}
                className="h-10 px-5 rounded-xl font-black text-xs sm:text-sm bg-[#1E1B18] hover:bg-black text-white flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-transform hover:scale-[1.02]"
              >
                <Play size={15} className="fill-current" />
                <span>Zahájit výuku (Meet)</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className={cn(
      "rounded-[2.5rem] border-none shadow-xl bg-white p-6 sm:p-8 space-y-6 relative overflow-hidden transition-all duration-300 w-full",
      hasActiveLiveLesson && "ring-4 ring-red-500/10 border-2 border-red-500/70"
    )}>
      {hasActiveLiveLesson && (
        <div className="absolute top-0 right-0 w-60 h-60 bg-gradient-to-br from-red-500/15 via-rose-500/5 to-transparent rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 relative z-10">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-2xl flex items-center justify-center shadow-inner transition-all",
            hasActiveLiveLesson
              ? "bg-red-600 text-white animate-pulse shadow-md"
              : "bg-blue-50 text-brand-blue"
          )}>
            {hasActiveLiveLesson ? <Video size={20} /> : <Calendar size={20} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-sans font-black text-2xl text-[#1E1B18]">
                {hasActiveLiveLesson ? 'Probíhá online výuka' : 'Naplánovaná hodina'}
              </h3>
              {hasActiveLiveLesson && (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-red-600 text-white animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                  Živě
                </span>
              )}
            </div>
            <p className="text-gray-400 text-xs font-semibold">
              {hasActiveLiveLesson
                ? 'Online výuka právě probíhá – žáci se mohou připojovat'
                : sortedLessons.length > 1
                ? 'Zobrazuje se nejbližší hodina. Další můžeš rozbalit níže.'
                : 'Přehled nadcházející online hodiny se žáky'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto relative z-10">
          {onNavigateToTab && (
            <button
              onClick={() => onNavigateToTab('lessons')}
              className="text-xs font-bold text-brand-blue hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Správa lekcí</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Primary single lesson */}
      <div className="space-y-4 relative z-10">
        {renderLessonCard(primaryLesson, true)}
      </div>

      {/* Expand/Collapse Toggle inside card */}
      {remainingLessons.length > 0 && (
        <div className="space-y-4 pt-1 relative z-10">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full py-3.5 px-5 rounded-2xl bg-[#FAF7F0] hover:bg-blue-50/70 border border-gray-200/80 hover:border-blue-200 text-[#1E1B18] font-bold text-xs sm:text-sm flex items-center justify-between transition-all hover:shadow-xs cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-100 text-brand-blue flex items-center justify-center group-hover:scale-105 transition-transform">
                <Calendar size={16} />
              </div>
              <span className="font-black text-[#1E1B18] group-hover:text-blue-950">
                {isExpanded
                  ? 'Sbalit na 1 hodinu'
                  : `Zobrazit další naplánované hodiny (${remainingLessons.length})`}
              </span>
            </div>

            <div className="w-7 h-7 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-700 shadow-2xs group-hover:border-blue-300">
              {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </div>
          </button>

          {isExpanded && (
            <div className="space-y-4 pt-2 border-t border-gray-100 animate-in fade-in slide-in-from-top-2 duration-300">
              {remainingLessons.map((lesson) => renderLessonCard(lesson, false))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
