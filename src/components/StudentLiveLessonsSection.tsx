import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { cn, safeToDate } from '../lib/utils';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { 
  Video, 
  Calendar, 
  Clock, 
  Radio, 
  CheckCircle2, 
  Check, 
  RefreshCcw, 
  ExternalLink, 
  Info, 
  ChevronDown, 
  ChevronUp 
} from 'lucide-react';
import { LiveLesson } from '../types';

interface StudentLiveLessonsSectionProps {
  liveLessons: LiveLesson[];
  todos: any[];
  joinedLessonIds: string[];
  syncingLessonId: string | null;
  onJoinLesson: (lesson: LiveLesson) => void;
  onSyncLesson: (lesson: LiveLesson) => Promise<void>;
}

export default function StudentLiveLessonsSection({
  liveLessons,
  todos,
  joinedLessonIds,
  syncingLessonId,
  onJoinLesson,
  onSyncLesson
}: StudentLiveLessonsSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showMeetHelp, setShowMeetHelp] = useState(false);

  const hasActiveLiveLesson = useMemo(() => {
    return liveLessons.some(l => l.status === 'live');
  }, [liveLessons]);

  const sortedLessons = useMemo(() => {
    return [...liveLessons].sort((a, b) => {
      if (a.status === 'live' && b.status !== 'live') return -1;
      if (b.status === 'live' && a.status !== 'live') return 1;
      const aTime = a.scheduledAt?.toMillis ? a.scheduledAt.toMillis() : (safeToDate(a.scheduledAt)?.getTime() || 0);
      const bTime = b.scheduledAt?.toMillis ? b.scheduledAt.toMillis() : (safeToDate(b.scheduledAt)?.getTime() || 0);
      return aTime - bTime;
    });
  }, [liveLessons]);

  if (!liveLessons || liveLessons.length === 0 || sortedLessons.length === 0) {
    return null;
  }

  const primaryLesson = sortedLessons[0];
  const remainingLessons = sortedLessons.slice(1);

  const renderLessonCard = (lesson: LiveLesson, isPrimary = false) => {
    const isLive = lesson.status === 'live';
    const isJoined = lesson.id ? joinedLessonIds.includes(lesson.id) : false;
    const lessonDate = safeToDate(lesson.scheduledAt) || new Date();
    const isSyncedInApp = todos.some((t: any) => t.referenceId === lesson.id);

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
        {/* Active lesson unjoined banner */}
        {isLive && !isJoined && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md shadow-red-600/20 animate-pulse">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Radio size={18} className="text-white animate-ping" />
              </div>
              <div>
                <p className="font-black text-xs sm:text-sm text-white">
                  Lektor tě čeká v hovoru – ještě ses nepřipojil(a)!
                </p>
                <p className="text-[11px] text-white/90">
                  Výuka již začala. Klikni a připoj se k online hodině Google Meet.
                </p>
              </div>
            </div>
            <Button
              onClick={() => onJoinLesson(lesson)}
              className="h-8 px-3 rounded-xl bg-white hover:bg-gray-100 text-red-600 font-black text-xs shrink-0 shadow cursor-pointer transition-transform hover:scale-105"
            >
              Vstoupit do hovoru
            </Button>
          </div>
        )}

        {/* Active lesson already joined confirmation */}
        {isLive && isJoined && (
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2.5 text-xs text-emerald-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span className="font-bold">K této online hodině ses již připojil(a).</span>
            </div>
            <span className="px-2 py-0.5 rounded-lg bg-emerald-100 font-black text-[10px] text-emerald-800 uppercase tracking-wider shrink-0">
              Připojeno
            </span>
          </div>
        )}

        {/* Lesson details */}
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
            </div>

            <div className="text-xs text-gray-500 font-semibold flex items-center gap-1.5">
              <span className="text-gray-400">Lektor:</span>
              <span className="font-bold text-gray-800">{lesson.teacherName}</span>
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
          {/* Calendar Sync */}
          <div>
            {isSyncedInApp ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                <Check size={14} className="text-emerald-600" />
                V kalendáři
              </span>
            ) : (
              <Button
                variant="outline"
                disabled={syncingLessonId === lesson.id}
                onClick={() => onSyncLesson(lesson)}
                className="h-9 px-3.5 rounded-xl border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-2xs transition-transform hover:scale-[1.02] w-full sm:w-auto"
              >
                <RefreshCcw size={13} className={syncingLessonId === lesson.id ? "animate-spin text-brand-blue" : "text-brand-blue"} />
                <span>{syncingLessonId === lesson.id ? 'Ukládám...' : 'Do kalendáře'}</span>
              </Button>
            )}
          </div>

          {/* Join Google Meet Button */}
          <Button
            onClick={() => onJoinLesson(lesson)}
            className={cn(
              "h-10 px-5 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-transform hover:scale-[1.02]",
              isLive && !isJoined
                ? "bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-300 animate-pulse"
                : "bg-[#1E1B18] hover:bg-black text-white"
            )}
          >
            <Video size={16} />
            <span>
              {isLive
                ? (isJoined ? 'Znovu otevřít Meet' : 'Připojit se (Google Meet)')
                : 'Otevřít odkaz na lekci'}
            </span>
            <ExternalLink size={14} />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card className={cn(
      "rounded-[2.5rem] border-none shadow-xl bg-white p-6 sm:p-8 space-y-6 relative overflow-hidden transition-all duration-300",
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
                {hasActiveLiveLesson ? 'Připojit se na hodinu' : 'Naplánovaná hodina'}
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
                ? 'Online výuka právě probíhá – lektor tě čeká v hovoru'
                : sortedLessons.length > 1
                ? 'Zobrazuje se nejbližší hodina. Další můžeš rozbalit níže.'
                : 'Přehled nadcházející online lekce s lektorem'}
            </p>
          </div>
        </div>

        {sortedLessons.length > 1 && (
          <div className="flex items-center gap-2 self-start sm:self-auto relative z-10">
            <span className="text-xs font-bold text-gray-500 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-200/60">
              Celkem hodin: {sortedLessons.length}
            </span>
          </div>
        )}
      </div>

      {/* Primary single lesson */}
      <div className="space-y-4 relative z-10">
        {renderLessonCard(primaryLesson, true)}
      </div>

      {/* Meet Help Toggle Accordion */}
      <div className="relative z-10 pt-1">
        <button
          onClick={() => setShowMeetHelp(!showMeetHelp)}
          className="text-xs font-bold text-gray-500 hover:text-amber-900 flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <Info size={14} className="text-amber-600" />
          <span>Nemáš Google účet? Jak se připojit bez přihlášení</span>
          {showMeetHelp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showMeetHelp && (
          <div className="mt-2 p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950 space-y-1 animate-in fade-in duration-200">
            <p className="font-black text-amber-900">
              Připojení k online výuce bez Google účtu:
            </p>
            <p className="text-amber-900/80 leading-relaxed">
              Můžeš se připojit i bez přihlášení! Po kliknutí na tlačítko se ti otevře Google Meet v nové záložce. Zadej své celé jméno a klikni na <strong>„Požádat o připojení“</strong>. Lektor tě v hovoru uvidí a během chvilky tě vpustí do hodiny.
            </p>
          </div>
        )}
      </div>

      {/* Expand/Collapse Toggle & List of remaining lessons inside this same card */}
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
