import React, { useMemo, useState, useEffect } from 'react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { cn, safeToDate } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Sparkles, ArrowRight, Video, MessageSquare, CheckCircle2, Clock, Check, ExternalLink, Calendar, Info, Radio, RefreshCcw, Download } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import QuickCalendar from '../components/QuickCalendar';
import { getStudentInquiries, markInquiryAsRead, QuestionInquiry } from '../services/inquiryService';
import StudentInquiriesSection from '../components/StudentInquiriesSection';
import { subscribeToStudentLiveLessons } from '../services/liveLessonService';
import { LiveLesson } from '../types';
import { getJoinedLessonIds, markLessonAsJoined } from '../lib/liveLessonUtils';
import { 
  syncLiveLessonToInAppCalendar, 
  syncLiveLessonToGoogleCalendar, 
  getGoogleAccessToken, 
  getGoogleCalendarWebUrl, 
  downloadLessonIcsFile 
} from '../services/calendarService';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';

const MOTIVATIONAL_QUOTES = [
  { text: "Učení je jediná věc, kterou se mysl nikdy nevyčerpá, nikdy se jí nebojí a nikdy nelituje.", author: "Leonardo da Vinci" },
  { text: "Úspěch je součet malých snah opakovaných den co den.", author: "Robert Collier" },
  { text: "Kořeny vzdělání jsou hořké, ale ovoce je sladké.", author: "Aristoteles" },
  { text: "Trpělivost je hořká, ale její plody jsou sladké.", author: "Jean-Jacques Rousseau" },
  { text: "Vzdělání není plněním nádoby, ale zažehnutím ohně.", author: "Sokrates" },
  { text: "Dělej to nejlepší, co můžeš, dokud nevíš víc. Až budeš vědět víc, dělej to lépe.", author: "Maya Angelou" },
  { text: "Vaše dnešní úsilí určuje vaše zítřejší úspěchy. Každý krok se počítá.", author: "ProEdu" }
];

const GREETINGS = [
  "pojďme pracovat!",
  "hurá do učení!",
  "čas se posunout dál!",
  "jde se na to!",
  "pojďme na to šlápnout!"
];

const RECOMMENDED_TOPICS = [
  {
    title: 'Lineární rovnice a výrazy',
    subject: 'Matematika',
    difficulty: '10 úloh • Střední',
    icon: '🧮',
    bg: 'bg-blue-100 text-blue-700',
    tagClass: 'bg-blue-50 text-blue-700 border border-blue-200'
  },
  {
    title: 'Pravopis velkých písmen a shoda',
    subject: 'Čeština',
    difficulty: '10 úloh • Klíčové k PZ',
    icon: '📖',
    bg: 'bg-rose-100 text-rose-700',
    tagClass: 'bg-rose-50 text-rose-700 border border-rose-200'
  },
  {
    title: 'Planimetrie a výpočty úhlů',
    subject: 'Matematika',
    difficulty: '8 úloh • Geometrie',
    icon: '📐',
    bg: 'bg-amber-100 text-amber-700',
    tagClass: 'bg-amber-50 text-amber-700 border border-amber-200'
  },
  {
    title: 'Práce s textem a porozumění',
    subject: 'Čeština',
    difficulty: '10 úloh • Cermat typ',
    icon: '✍️',
    bg: 'bg-emerald-100 text-emerald-700',
    tagClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200'
  }
];

export default function StudentDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [inquiries, setInquiries] = useState<QuestionInquiry[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(false);
  const [liveLessons, setLiveLessons] = useState<LiveLesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(true);
  const [joinedLessonIds, setJoinedLessonIds] = useState<string[]>(() => getJoinedLessonIds());
  const [todos, setTodos] = useState<any[]>([]);
  const [syncingLessonId, setSyncingLessonId] = useState<string | null>(null);

  // Subscribe to student's todos in Firestore
  useEffect(() => {
    if (!user?.uid) return;
    const qTodos = query(
      collection(db, 'todos'),
      where('studentId', '==', user.uid)
    );
    const unsub = onSnapshot(
      qTodos,
      (snap) => {
        setTodos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (err) => {
        console.error('Error fetching student todos:', err);
      }
    );
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    const handleJoinedEvent = (e: Event) => {
      const customEvt = e as CustomEvent<{ lessonId: string }>;
      if (customEvt.detail?.lessonId) {
        setJoinedLessonIds(prev => 
          prev.includes(customEvt.detail.lessonId) ? prev : [...prev, customEvt.detail.lessonId]
        );
      }
    };

    window.addEventListener('proedu-lesson-joined', handleJoinedEvent);
    return () => window.removeEventListener('proedu-lesson-joined', handleJoinedEvent);
  }, []);

  const handleJoinLesson = (lesson: LiveLesson) => {
    markLessonAsJoined(lesson.id);
    setJoinedLessonIds(prev => prev.includes(lesson.id) ? prev : [...prev, lesson.id]);
    window.open(lesson.meetUrl, '_blank', 'noopener,noreferrer');
    toast.success(`Google Meet pro lekci "${lesson.title}" byl otevřen v novém okně.`);
  };

  const handleSyncLessonToCalendars = async (lesson: LiveLesson) => {
    if (!user?.uid) {
      toast.error('Pro synchronizaci do kalendáře musíte být přihlášeni.');
      return;
    }

    setSyncingLessonId(lesson.id);
    try {
      // 1. Synchronize to in-app calendar (Firestore todos collection)
      await syncLiveLessonToInAppCalendar(user.uid, lesson);

      // 2. Synchronize to Google Calendar
      try {
        const token = await getGoogleAccessToken();
        await syncLiveLessonToGoogleCalendar(token, lesson);
        toast.success(`Lekce "${lesson.title}" byla úspěšně přidána do Google Kalendáře i do vašeho kalendáře v aplikaci!`);
      } catch (googleErr: any) {
        console.warn('Direct Google Calendar OAuth failed, opening Web URL fallback:', googleErr);
        // Fallback: open prefilled Google Calendar web URL
        window.open(getGoogleCalendarWebUrl(lesson), '_blank');
        toast.success(`Lekce byla uložena do kalendáře v aplikaci a otevřena v Google Kalendáři pro uložení.`);
      }
    } catch (err: any) {
      console.error('Failed to sync lesson to calendar:', err);
      toast.error(err.message || 'Nepodařilo se synchronizovat lekci do kalendáře.');
    } finally {
      setSyncingLessonId(null);
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToStudentLiveLessons(
      user?.uid,
      (lessons) => {
        setLiveLessons(lessons);
        setLoadingLessons(false);
      },
      (err) => {
        console.error('Failed to load live lessons:', err);
        setLoadingLessons(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  useEffect(() => {
    async function loadInquiries() {
      if (!user?.uid) return;
      setLoadingInquiries(true);
      try {
        const data = await getStudentInquiries(user.uid);
        setInquiries(data);
      } catch (err) {
        console.error('Failed to load student inquiries:', err);
      } finally {
        setLoadingInquiries(false);
      }
    }
    loadInquiries();
  }, [user?.uid]);

  const handleMarkAsRead = async (inquiryId: string) => {
    try {
      await markInquiryAsRead(inquiryId);
      setInquiries(prev => prev.map(inq => inq.id === inquiryId ? { ...inq, isReadByStudent: true } : inq));
      toast.success('Odpověď označena jako přečtená');
    } catch (err) {
      console.error('Failed to mark inquiry as read:', err);
      toast.error('Nepodařilo se označit odpověď jako přečtenou');
    }
  };

  const formatDate = (val: any) => {
    if (!val) return '';
    try {
      const date = val.toDate ? val.toDate() : new Date(val.seconds ? val.seconds * 1000 : val);
      return date.toLocaleDateString('cs-CZ', {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '';
    }
  };


  const quote = useMemo(() => {
    const today = new Date().getDate();
    return MOTIVATIONAL_QUOTES[today % MOTIVATIONAL_QUOTES.length];
  }, []);

  const greeting = useMemo(() => {
    return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  }, []);

  return (
    <div className="space-y-8 md:space-y-10">
      {/* HEADER SECTION: Greeting on Left, Motivational Quote on Top Right */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <h1 className="text-4xl md:text-5xl font-display font-black text-[#1E1B18] tracking-tight leading-tight">
            Ahoj {profile?.name?.split(' ')[0] || (user ? 'studente' : 'Alexi')}, {greeting}
          </h1>
          <p className="text-gray-500 font-medium text-sm md:text-base">
            Vítej ve své studijní zóně ProEdu. Co si dnes procvičíme?
          </p>
        </div>

        {/* Motivational Quote in Top Right Corner (replacing streak) */}
        <div className="bg-white/95 backdrop-blur-sm p-4 sm:p-5 rounded-[2rem] shadow-sm border border-gray-100 max-w-lg shrink-0 flex items-start gap-3.5 self-start lg:self-center">
          <span className="text-2xl sm:text-3xl shrink-0 mt-0.5">💡</span>
          <div className="space-y-1 min-w-0">
            <p className="font-sans italic text-xs sm:text-sm text-[#1E1B18] leading-snug">
              "{quote.text}"
            </p>
            <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              — {quote.author}
            </p>
          </div>
        </div>
      </header>

      {/* MAIN TWO-COLUMN ROW: Calendar on Left, Recommended Practice on Right */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        {/* Left Column: Kalendář */}
        <div className="w-full">
          <QuickCalendar 
            todos={todos} 
            liveLessons={liveLessons} 
            onJoinLesson={handleJoinLesson} 
          />
        </div>

        {/* Right Column: Doporučená procvičování */}
        <Card className="rounded-[2.5rem] border-none shadow-xl bg-white p-6 sm:p-8 flex flex-col justify-between relative overflow-hidden h-full">
          <div className="absolute top-0 right-0 w-44 h-44 bg-gradient-to-br from-amber-100/40 via-yellow-50/20 to-transparent rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

          <div>
            {/* Card Header */}
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-inner">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="font-sans font-black text-2xl text-[#1E1B18]">Doporučená procvičování</h3>
                  <p className="text-gray-400 text-xs font-semibold">Témata pro nejlepší výsledky u zkoušek</p>
                </div>
              </div>
              <Link 
                to="/practice" 
                className="text-xs font-black text-brand-blue hover:underline flex items-center gap-1 shrink-0"
              >
                Všechna témata <ArrowRight size={14} />
              </Link>
            </div>

            {/* Personalized AI focus areas if available */}
            {profile?.focusAreas && profile.focusAreas.length > 0 && (
              <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-black uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
                    <Sparkles size={13} /> AI doporučení z tvých testů
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.focusAreas.map((area, idx) => (
                    <button
                      key={idx}
                      onClick={() => navigate('/practice')}
                      className="px-3 py-1.5 bg-white text-purple-900 rounded-xl text-xs font-bold shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer border border-purple-100"
                    >
                      <span>{area}</span>
                      <ArrowRight size={12} className="text-purple-400" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* List of Recommended Topics */}
            <div className="space-y-3">
              {RECOMMENDED_TOPICS.map((item, idx) => (
                <div
                  key={idx}
                  className="group p-3.5 sm:p-4 rounded-2xl bg-[#FAF7F0] hover:bg-white border border-gray-200/60 hover:border-gray-300 hover:shadow-md transition-all flex items-center justify-between gap-3.5"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0 shadow-sm", item.bg)}>
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md", item.tagClass)}>
                          {item.subject}
                        </span>
                        <span className="text-[11px] font-semibold text-gray-400">{item.difficulty}</span>
                      </div>
                      <h4 className="font-bold text-gray-800 text-sm md:text-base mt-0.5 truncate group-hover:text-black">
                        {item.title}
                      </h4>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => navigate('/practice')}
                    className="rounded-xl bg-[#1E1B18] hover:bg-[#332f2b] text-white font-bold text-xs px-3.5 h-9 shrink-0 flex items-center gap-1.5 transition-transform group-hover:scale-105 cursor-pointer"
                  >
                    <span>Procvičit</span>
                    <ArrowRight size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Motivation Bar */}
          <div className="mt-6 pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-amber-50/50 p-4 rounded-2xl">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🎯</span>
              <p className="text-xs font-bold text-amber-950 leading-tight">
                Denní cíl: 15 minut soustředěného procvičování denně.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/practice')}
              className="rounded-xl border-amber-300 text-amber-900 font-bold text-xs h-8 px-3 shrink-0 hover:bg-amber-100 self-end sm:self-auto cursor-pointer"
            >
              Katalog témat
            </Button>
          </div>
        </Card>
      </div>

      {/* SECTION: Zprávy a odpovědi od lektora - zobrazí 1 dotaz s možností rozkliknout celou sekci se všemi dotazy */}
      <StudentInquiriesSection
        inquiries={inquiries}
        onMarkAsRead={handleMarkAsRead}
        formatDate={formatDate}
      />

      {/* SECTION: Live / Scheduled Lessons (Hidden completely if user has no lessons) */}
      {!loadingLessons && liveLessons.length > 0 && (() => {
        const hasActiveLiveLesson = liveLessons.some(l => l.status === 'live');
        const sortedLessons = [...liveLessons].sort((a, b) => {
          if (a.status === 'live' && b.status !== 'live') return -1;
          if (b.status === 'live' && a.status !== 'live') return 1;
          const aTime = a.scheduledAt?.toMillis ? a.scheduledAt.toMillis() : (safeToDate(a.scheduledAt)?.getTime() || 0);
          const bTime = b.scheduledAt?.toMillis ? b.scheduledAt.toMillis() : (safeToDate(b.scheduledAt)?.getTime() || 0);
          return aTime - bTime;
        });

        return (
          <Card className={cn(
            "rounded-[2.5rem] p-6 sm:p-8 relative overflow-hidden transition-all duration-300",
            hasActiveLiveLesson
              ? "border-2 border-red-500/70 bg-gradient-to-b from-red-50/40 via-white to-white shadow-2xl shadow-red-500/10 ring-4 ring-red-500/10"
              : "border border-gray-100 shadow-md bg-white"
          )}>
            {hasActiveLiveLesson && (
              <div className="absolute top-0 right-0 w-72 h-72 bg-gradient-to-br from-red-500/15 via-rose-500/5 to-transparent rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
            )}

            <div className="flex justify-between items-center mb-6 relative z-10">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-2xl flex items-center justify-center transition-all",
                  hasActiveLiveLesson
                    ? "bg-red-600 text-white shadow-md animate-pulse"
                    : "bg-blue-50 text-brand-blue"
                )}>
                  {hasActiveLiveLesson ? <Video size={20} /> : <Calendar size={20} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    {hasActiveLiveLesson && (
                      <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-red-600 text-white animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                        Právě probíhá
                      </span>
                    )}
                    <h3 className="font-sans font-black text-2xl text-[#1E1B18]">
                      {hasActiveLiveLesson ? 'Připojit se na hodinu' : 'Naplánované hodiny'}
                    </h3>
                  </div>
                  <p className="text-gray-400 text-xs font-semibold">
                    {hasActiveLiveLesson
                      ? 'Online výuka právě probíhá – lektor tě čeká v hovoru'
                      : 'Přehled nadcházejících online lekcí a konzultací s lektorem'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6 relative z-10">
              {sortedLessons.map((lesson) => {
                const isLive = lesson.status === 'live';
                const isJoined = joinedLessonIds.includes(lesson.id);
                const lessonDate = safeToDate(lesson.scheduledAt) || new Date();

                return (
                  <div
                    key={lesson.id}
                    className={cn(
                      "rounded-3xl p-6 sm:p-8 transition-all border",
                      isLive
                        ? "bg-gradient-to-br from-red-50 via-white to-rose-50/40 border-red-300 shadow-xl shadow-red-100/50 ring-2 ring-red-400/20"
                        : "bg-gray-50/70 border-gray-200 hover:border-gray-300"
                    )}
                  >
                    {/* Active lesson unjoined banner */}
                    {isLive && !isJoined && (
                      <div className="mb-5 p-4 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-red-600/25 animate-pulse">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                            <Radio size={20} className="text-white animate-ping" />
                          </div>
                          <div>
                            <p className="font-black text-sm text-white">
                              Lektor tě čeká v hovoru – ještě ses nepřipojil(a)!
                            </p>
                            <p className="text-xs text-white/90">
                              Výuka již začala. Klikni níže a připoj se k online hodině Google Meet.
                            </p>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleJoinLesson(lesson)}
                          className="h-9 px-4 rounded-xl bg-white hover:bg-gray-100 text-red-600 font-black text-xs shrink-0 shadow cursor-pointer transition-transform hover:scale-105"
                        >
                          Vstoupit do hovoru teď
                        </Button>
                      </div>
                    )}

                    {/* Active lesson already joined confirmation */}
                    {isLive && isJoined && (
                      <div className="mb-5 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-xs text-emerald-800">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                          <span className="font-bold">K této online hodině ses již připojil(a).</span>
                          <span className="text-emerald-700 hidden sm:inline">Pokud jsi hovor náhodou zavřel(a), můžeš jej otevřít znovu.</span>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-100 font-black text-[11px] text-emerald-800 uppercase tracking-wider shrink-0">
                          Připojeno
                        </span>
                      </div>
                    )}

                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      <div className="space-y-3 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2">
                          {isLive ? (
                            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-red-600 text-white shadow-sm animate-pulse">
                              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                              PRÁVĚ PROBÍHÁ
                            </span>
                          ) : (
                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                              Naplánováno
                            </span>
                          )}

                          <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-white/80 border border-gray-200 text-gray-700 uppercase tracking-wider">
                            {lesson.subject || 'Výuka'}
                          </span>
                        </div>

                        <h4 className="text-xl sm:text-2xl font-black text-gray-900 leading-tight">
                          {lesson.title}
                        </h4>

                        {lesson.description && (
                          <p className="text-sm text-gray-600 leading-relaxed">
                            {lesson.description}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-y-2 gap-x-5 text-xs text-gray-500 font-semibold pt-1">
                          <div className="flex items-center gap-1.5">
                            <Calendar size={14} className="text-gray-400" />
                            <span>{format(lessonDate, 'EEEE d. MMMM yyyy', { locale: cs })}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock size={14} className="text-gray-400" />
                            <span>{format(lessonDate, 'HH:mm')} ({lesson.durationMinutes} minut)</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-gray-700">
                            <span className="font-bold">Lektor:</span> {lesson.teacherName}
                          </div>
                        </div>
                      </div>

                      {(() => {
                        const isSyncedInApp = todos.some((t: any) => t.referenceId === lesson.id);

                        return (
                          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2.5 shrink-0">
                            {/* Calendar Sync button / status */}
                            {isSyncedInApp ? (
                              <div className="flex items-center gap-1.5 self-center lg:self-end">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm">
                                  <Check size={14} className="text-emerald-600" />
                                  V kalendáři
                                </span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => downloadLessonIcsFile(lesson)}
                                  className="h-8 w-8 text-gray-500 hover:text-gray-900 rounded-xl cursor-pointer"
                                  title="Stáhnout .ics pro Apple/Outlook kalendář"
                                >
                                  <Download size={14} />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                disabled={syncingLessonId === lesson.id}
                                onClick={() => handleSyncLessonToCalendars(lesson)}
                                className="h-10 px-4 rounded-xl border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-transform hover:scale-[1.02] self-stretch sm:self-auto"
                              >
                                <RefreshCcw size={14} className={syncingLessonId === lesson.id ? "animate-spin text-brand-blue" : "text-brand-blue"} />
                                <span>{syncingLessonId === lesson.id ? 'Ukládám...' : 'Uložit do kalendáře'}</span>
                              </Button>
                            )}

                            {/* Main Google Meet Button */}
                            <Button
                              onClick={() => handleJoinLesson(lesson)}
                              className={cn(
                                "h-12 px-6 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer transition-transform hover:scale-[1.02]",
                                isLive && !isJoined
                                  ? "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-300 animate-pulse"
                                  : isLive && isJoined
                                  ? "bg-[#1E1B18] hover:bg-black text-white"
                                  : "bg-[#1E1B18] hover:bg-black text-white"
                              )}
                            >
                              <Video size={18} />
                              {isLive
                                ? (isJoined ? 'Znovu otevřít Google Meet' : 'Připojit se na hodinu (Google Meet)')
                                : 'Otevřít odkaz na lekci'}
                              <ExternalLink size={16} />
                            </Button>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Help notice specifically for users without Google account */}
                    <div className="mt-6 pt-5 border-t border-gray-200/60 bg-amber-50/60 -mx-6 -mb-6 sm:-mx-8 sm:-mb-8 p-4 sm:p-5 rounded-b-3xl border-dashed border-amber-200 text-xs text-amber-950 flex flex-col sm:flex-row items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-amber-200/80 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                        <Info size={16} />
                      </div>
                      <div className="space-y-1">
                        <p className="font-black text-amber-900">
                          Nemáš Google účet nebo nejsi přihlášený?
                        </p>
                        <p className="text-amber-800/90 leading-relaxed">
                          Můžeš se připojit i bez Google účtu! Po kliknutí na tlačítko se ti otevře Google Meet v nové záložce. Zadej své celé jméno a klikni na tlačítko <strong>„Požádat o připojení“</strong> (Ask to join). Lektor tě v hovoru uvidí a během několika sekund tě vpustí do hodiny. (Doporučujeme připojovat se z počítače nebo notebooku).
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}
    </div>
  );
}
