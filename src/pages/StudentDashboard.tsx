import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { cn, safeToDate } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Sparkles, ArrowRight, Play, BookOpen, RotateCcw, Target, CheckCircle2, Award } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import QuickCalendar from '../components/QuickCalendar';
import { getStudentInquiries, getAllInquiries, markInquiryAsRead, QuestionInquiry } from '../services/inquiryService';
import StudentInquiriesSection from '../components/StudentInquiriesSection';
import StudentLiveLessonsSection from '../components/StudentLiveLessonsSection';
import JokerZoneSection from '../components/JokerZoneSection';
import TeacherInquiriesOverview from '../components/admin/TeacherInquiriesOverview';
import TeacherLessonsOverview from '../components/admin/TeacherLessonsOverview';
import { subscribeToStudentLiveLessons, subscribeToTeacherLiveLessons } from '../services/liveLessonService';
import { LiveLesson } from '../types';
import { getJoinedLessonIds, markLessonAsJoined } from '../lib/liveLessonUtils';
import { 
  syncLiveLessonToInAppCalendar, 
  syncLiveLessonToGoogleCalendar, 
  getGoogleAccessToken, 
  getGoogleCalendarWebUrl 
} from '../services/calendarService';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import { getPersonalizedRecommendations, RecommendedPracticeItem } from '../services/recommendationService';
import { trackSectionClick } from '../services/analyticsService';

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

export default function StudentDashboard() {
  const { user, profile, isPremium } = useAuth();
  const navigate = useNavigate();

  // Sekce pro lektora a hodiny jsou povoleny pouze pro platící uživatele (Premium/Kurz) a učitele.
  // Pro odhlášené a Free uživatele se tyto sekce NIKDY nezobrazují na hlavní straně.
  const isTeacher = profile?.role === 'teacher';
  const isFreeOrGuest = (!user && !profile) || profile?.role === 'free' || (!isPremium && !isTeacher);
  const canViewTutorAndLessons = !isFreeOrGuest;

  const [inquiries, setInquiries] = useState<QuestionInquiry[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(false);
  const [liveLessons, setLiveLessons] = useState<LiveLesson[]>([]);
  const [loadingLessons, setLoadingLessons] = useState(true);
  const [joinedLessonIds, setJoinedLessonIds] = useState<string[]>(() => getJoinedLessonIds());
  const [todos, setTodos] = useState<any[]>([]);
  const [syncingLessonId, setSyncingLessonId] = useState<string | null>(null);

  // Personalized practice recommendations
  const [recommendedItems, setRecommendedItems] = useState<RecommendedPracticeItem[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadRecommendations() {
      setLoadingRecommendations(true);
      try {
        const items = await getPersonalizedRecommendations(user?.uid, profile?.focusAreas || []);
        if (isMounted) {
          setRecommendedItems(items);
        }
      } catch (err) {
        console.error('Failed to load personalized recommendations:', err);
      } finally {
        if (isMounted) {
          setLoadingRecommendations(false);
        }
      }
    }
    loadRecommendations();
    return () => {
      isMounted = false;
    };
  }, [user?.uid, profile?.focusAreas]);

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
    if (!user?.uid || !canViewTutorAndLessons) {
      setLiveLessons([]);
      setLoadingLessons(false);
      return;
    }

    setLoadingLessons(true);
    const unsubscribe = isTeacher
      ? subscribeToTeacherLiveLessons(
          user.uid,
          (lessons) => {
            setLiveLessons(lessons);
            setLoadingLessons(false);
          },
          (err) => {
            console.error('Failed to load teacher live lessons:', err);
            setLoadingLessons(false);
          }
        )
      : subscribeToStudentLiveLessons(
          user.uid,
          (lessons) => {
            setLiveLessons(lessons);
            setLoadingLessons(false);
          },
          (err) => {
            console.error('Failed to load student live lessons:', err);
            setLoadingLessons(false);
          }
        );

    return () => unsubscribe();
  }, [user?.uid, isTeacher, canViewTutorAndLessons]);

  const loadInquiries = useCallback(async () => {
    if (!user?.uid || !canViewTutorAndLessons) {
      setInquiries([]);
      setLoadingInquiries(false);
      return;
    }
    setLoadingInquiries(true);
    try {
      const data = isTeacher
        ? await getAllInquiries(user.uid)
        : await getStudentInquiries(user.uid);
      setInquiries(data);
    } catch (err) {
      console.error('Failed to load inquiries:', err);
    } finally {
      setLoadingInquiries(false);
    }
  }, [user?.uid, isTeacher, canViewTutorAndLessons]);

  useEffect(() => {
    loadInquiries();
  }, [loadInquiries]);

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
    <div className="space-y-6 md:space-y-10">
      {/* HEADER SECTION: Greeting on Left, Motivational Quote on Top Right */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6">
        <div className="space-y-1 sm:space-y-1.5">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-playful text-[#1E1B18] tracking-tight leading-tight">
            Ahoj {profile?.name?.split(' ')[0] || (isTeacher ? 'učiteli' : user ? 'studente' : 'Alexi')}, {greeting}
          </h1>
          <p className="text-gray-500 font-medium text-xs sm:text-sm md:text-base">
            {isTeacher 
              ? 'Vítej ve svém pracovním prostoru ProEdu. Co máme dnes v plánu?' 
              : 'Vítej ve své studijní zóně ProEdu. Co si dnes procvičíme?'}
          </p>
        </div>

        {/* Motivational Quote in Top Right Corner (replacing streak) */}
        <div className="bg-white/95 backdrop-blur-sm p-3.5 sm:p-5 rounded-2xl sm:rounded-[2rem] shadow-sm border border-gray-100 w-full lg:max-w-md shrink-0 flex items-start gap-3 sm:gap-3.5 self-start lg:self-center">
          <span className="text-xl sm:text-3xl shrink-0 mt-0.5">💡</span>
          <div className="space-y-0.5 sm:space-y-1 min-w-0">
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
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-stretch">
        {/* Left Column: Kalendář */}
        <div className="w-full h-full flex flex-col">
          <QuickCalendar 
            todos={todos} 
            liveLessons={liveLessons} 
            onJoinLesson={handleJoinLesson} 
          />
        </div>

        {/* Right Column: Doporučená procvičování */}
        <Card className="rounded-[1.75rem] border-none shadow-md bg-white p-4 sm:p-5 flex flex-col justify-start relative overflow-hidden h-full">
          <div className="absolute top-0 right-0 w-36 h-36 bg-gradient-to-br from-amber-100/40 via-yellow-50/20 to-transparent rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none" />

          <div className="flex flex-col justify-start h-full space-y-4">
            <div>
              {/* Card Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3.5 pb-2.5 border-b border-gray-100 gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-inner shrink-0">
                    <Sparkles size={16} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-sans font-black text-lg sm:text-xl text-[#1E1B18] truncate">Doporučená procvičování</h3>
                    <p className="text-gray-400 text-[11px] font-semibold truncate">
                      {user ? 'Přizpůsobeno podle tvých dosavadních výsledků a cílů' : 'Témata pro nejlepší výsledky u zkoušek'}
                    </p>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    trackSectionClick('dashboard_catalog_btn', '/practice');
                    navigate('/practice');
                  }}
                  className="rounded-xl border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-800 font-bold text-xs h-8 px-3 flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs shrink-0 self-start sm:self-auto"
                >
                  <span>Katalog témat</span>
                  <ArrowRight size={12} />
                </Button>
              </div>

              {/* List of Recommended Topics (3 items) */}
              {loadingRecommendations ? (
                <div className="space-y-2.5">
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      className="p-3 rounded-xl bg-[#FAF7F0] border border-gray-200/50 flex items-center justify-between gap-3 animate-pulse"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-gray-200 shrink-0" />
                        <div className="space-y-1.5">
                          <div className="h-2.5 w-24 bg-gray-200 rounded" />
                          <div className="h-3.5 w-40 bg-gray-300 rounded" />
                        </div>
                      </div>
                      <div className="h-8 w-20 bg-gray-200 rounded-xl shrink-0" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {recommendedItems.slice(0, 3).map((item) => {
                    const badgeStyles = {
                      warning: 'bg-rose-100 text-rose-800 border-rose-200',
                      accent: 'bg-purple-100 text-purple-800 border-purple-200',
                      info: 'bg-blue-100 text-blue-800 border-blue-200',
                      success: 'bg-emerald-100 text-emerald-800 border-emerald-200'
                    }[item.badge.variant];

                    const badgeIcon = {
                      warning: <RotateCcw size={9} />,
                      accent: <Target size={9} />,
                      info: <Sparkles size={9} />,
                      success: <CheckCircle2 size={9} />
                    }[item.badge.variant];

                    return (
                      <div
                        key={item.subtopicId}
                        onClick={() => {
                          trackSectionClick('dashboard_recommended_card', `/practice/session/${item.subtopicId}`, {
                            subtopicId: item.subtopicId,
                            title: item.title,
                            subject: item.subject
                          });
                          navigate(`/practice/session/${item.subtopicId}`);
                        }}
                        className="group p-3 sm:p-3.5 rounded-2xl bg-[#FAF7F0] hover:bg-white border border-gray-200/60 hover:border-gray-300 hover:shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 shadow-xs transition-transform group-hover:scale-105 mt-0.5 sm:mt-0", item.bg)}>
                            {item.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={cn("text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded", item.tagClass)}>
                                {item.subject}
                              </span>
                              <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1", badgeStyles)}>
                                {badgeIcon}
                                {item.badge.text}
                              </span>
                            </div>
                            <h4 className="font-bold text-gray-800 text-xs sm:text-sm mt-0.5 group-hover:text-black leading-snug line-clamp-1 sm:line-clamp-2">
                              {item.title}
                            </h4>
                            <p className="text-[11px] font-medium text-gray-400 truncate max-w-xs sm:max-w-sm">
                              {item.reasonText}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto pt-1 sm:pt-0 border-t border-gray-200/40 sm:border-0 justify-end">
                          {item.hasStudyMaterial && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                trackSectionClick('dashboard_recommended_theory', `/study/${item.subtopicId}`, {
                                  subtopicId: item.subtopicId,
                                  title: item.title,
                                  subject: item.subject
                                });
                                navigate(`/study/${item.subtopicId}`);
                              }}
                              title="Prostudovat teorii před testem"
                              className="flex-1 sm:flex-none rounded-xl border-gray-200 hover:border-black text-gray-700 font-bold text-xs h-9 px-3 flex items-center justify-center gap-1.5 cursor-pointer bg-white"
                            >
                              <BookOpen size={13} />
                              <span>Teorie</span>
                            </Button>
                          )}

                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              trackSectionClick('dashboard_recommended_practice_btn', `/practice/session/${item.subtopicId}`, {
                                subtopicId: item.subtopicId,
                                title: item.title,
                                subject: item.subject
                              });
                              navigate(`/practice/session/${item.subtopicId}`);
                            }}
                            className="flex-1 sm:flex-none rounded-xl bg-[#1E1B18] hover:bg-[#332f2b] text-white font-bold text-xs px-4 h-9 flex items-center justify-center gap-1.5 transition-transform group-hover:scale-105 cursor-pointer shadow-2xs"
                          >
                            <Play size={11} className="fill-current text-[#F5C400]" />
                            <span>Procvičit</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* JOKER BONUS & STREAK ZONE (For Free tier, Students, and Guests) */}
      <JokerZoneSection />

      {/* DYNAMIC GRID: Dotazy (Left) & Naplánovaná hodina (Right) */}
      {(() => {
        // Skrýt sekce "Odpověď od lektora" a "Naplánovaná hodina" pro nepřihlášené a Free uživatele
        if (!canViewTutorAndLessons) return null;

        // Pro učitele/admina zobrazovat sekci dotazů vždy (včetně prázdného stavu); pro studenta jen pokud má dotazy
        const hasInquiries = isTeacher 
          ? !loadingInquiries 
          : (!loadingInquiries && inquiries && inquiries.length > 0);

        const activeLessons = isTeacher
          ? liveLessons.filter(l => l.status === 'live' || l.status === 'scheduled')
          : liveLessons;
        const hasLessons = !loadingLessons && activeLessons && activeLessons.length > 0;

        if (!hasInquiries && !hasLessons) return null;

        const bothExist = hasInquiries && hasLessons;

        return (
          <div className={cn(
            bothExist 
              ? "grid grid-cols-1 xl:grid-cols-2 gap-8 items-start" 
              : "w-full"
          )}>
            {hasInquiries && (
              isTeacher ? (
                <TeacherInquiriesOverview
                  inquiries={inquiries}
                  onRefresh={loadInquiries}
                  onNavigateToTab={(tab) => navigate(`/teacher?tab=${tab}`)}
                />
              ) : (
                <StudentInquiriesSection
                  inquiries={inquiries}
                  onMarkAsRead={handleMarkAsRead}
                  formatDate={formatDate}
                />
              )
            )}

            {hasLessons && (
              isTeacher ? (
                <TeacherLessonsOverview
                  lessons={liveLessons}
                  onNavigateToTab={(tab) => navigate(`/teacher?tab=${tab}`)}
                />
              ) : (
                <StudentLiveLessonsSection
                  liveLessons={liveLessons}
                  todos={todos}
                  joinedLessonIds={joinedLessonIds}
                  syncingLessonId={syncingLessonId}
                  onJoinLesson={handleJoinLesson}
                  onSyncLesson={handleSyncLessonToCalendars}
                />
              )
            )}
          </div>
        );
      })()}
    </div>
  );
}
