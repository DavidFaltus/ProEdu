import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, Plus, Calendar,
  ArrowRight, ChevronRight, ChevronDown, Lock
} from 'lucide-react';
import { BrainPinkIcon, BrainWhiteIcon, BookCyanIcon, BookWhiteIcon, CalendarBlueIcon } from '../components/common/CustomIcon';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { 
  Dialog, DialogContent, DialogTitle, DialogDescription 
} from '../components/ui/dialog';
import { 
  getTopics, getSubtopics, getQuestionsForSubtopic, 
  PREDEFINED_SUBJECTS 
} from '../services/practiceService';
import { PracticeTopic, PracticeSubtopic, TodoItem } from '../types';
import { toast } from 'sonner';
import UnifiedPaywallModal from '../components/common/UnifiedPaywallModal';
import PracticeScheduleModal from '../components/PracticeScheduleModal';
import { trackPracticeSubjectChange, trackSectionClick } from '../services/analyticsService';
import { db } from '../lib/firebase';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';

const getSubjectIcon = (id: string, isActive: boolean) => {
  if (id === 'Matematika') {
    return isActive ? <BrainWhiteIcon className="w-9 h-9" /> : <BrainPinkIcon className="w-9 h-9" />;
  }
  return isActive ? <BookWhiteIcon className="w-9 h-9" /> : <BookCyanIcon className="w-9 h-9" />;
};

export default function Practice() {
  const { user, profile, isPremium, openAuthModal } = useAuth();
  const navigate = useNavigate();

  const [activeSubject, setActiveSubject] = useState<'Matematika' | 'Čeština'>('Matematika');
  const [topics, setTopics] = useState<PracticeTopic[]>([]);
  const [subtopics, setSubtopics] = useState<PracticeSubtopic[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [selectedSubtopicForStudy, setSelectedSubtopicForStudy] = useState<PracticeSubtopic | null>(null);
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});

  // State pro plánování procvičování do kalendáře
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleInitialTopic, setScheduleInitialTopic] = useState<PracticeTopic | null>(null);
  const [scheduleInitialSubtopics, setScheduleInitialSubtopics] = useState<PracticeSubtopic[]>([]);
  const [studentTodos, setStudentTodos] = useState<TodoItem[]>([]);

  useEffect(() => {
    if (!user?.uid) {
      setStudentTodos([]);
      return;
    }
    const qTodos = query(
      collection(db, 'todos'),
      where('studentId', '==', user.uid),
      limit(300)
    );
    const unsub = onSnapshot(
      qTodos,
      (snap) => {
        setStudentTodos(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<TodoItem, 'id'>) })));
      },
      (err) => {
        console.error('Error loading student todos in Practice:', err);
      }
    );
    return () => unsub();
  }, [user?.uid]);

  const handleOpenScheduleForTopic = (e: React.MouseEvent, topic: PracticeTopic, topicSubtopics: PracticeSubtopic[]) => {
    e.stopPropagation();
    setScheduleInitialTopic(topic);
    setScheduleInitialSubtopics(topicSubtopics);
    setIsScheduleModalOpen(true);
  };

  const handleOpenScheduleForSubtopic = (e: React.MouseEvent, topic: PracticeTopic, subtopic: PracticeSubtopic) => {
    e.stopPropagation();
    setScheduleInitialTopic(topic);
    setScheduleInitialSubtopics([subtopic]);
    setIsScheduleModalOpen(true);
  };

  const toggleTopic = (topicId: string) => {
    setExpandedTopics(prev => ({
      ...prev,
      [topicId]: !prev[topicId]
    }));
  };

  const isTeacher = profile?.role === 'teacher';

  const visibleSubtopics = React.useMemo(
    () => subtopics.filter(s => !s.isHidden),
    [subtopics]
  );

  const visibleTopics = React.useMemo(
    () =>
      topics.filter(
        t =>
          !t.isHidden &&
          visibleSubtopics.some(s => s.topicId === t.id || s.topicId === t.title)
      ),
    [topics, visibleSubtopics]
  );

  // Najdeme první reálně zobrazené podtéma v daném předmětu (pro neregistrovaného)
  const firstVisibleSubtopicId = React.useMemo(() => {
    for (const topic of visibleTopics) {
      const matching = visibleSubtopics.filter(s => s.topicId === topic.id || s.topicId === topic.title);
      if (matching.length > 0) {
        return matching[0].id;
      }
    }
    return null;
  }, [visibleTopics, visibleSubtopics]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedTopics, fetchedSubtopics] = await Promise.all([
        getTopics(activeSubject),
        getSubtopics(undefined, activeSubject)
      ]);
      setTopics(fetchedTopics);
      setSubtopics(fetchedSubtopics);
    } catch (err) {
      console.error('Failed to load practice content:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeSubject]);

  return (
    <div className="page-container max-w-7xl mx-auto space-y-8 pb-16">
      {/* Page Header */}
      <section className="text-center space-y-3 max-w-3xl mx-auto">
        <motion.h1 
          initial={{ opacity: 0, y: -15 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-playful text-gray-700 tracking-tight"
        >
          Procvičování témat
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 0.1 }} 
          className="text-base md:text-lg text-gray-500 leading-relaxed"
        >
          Vyber si předmět, prostuduj si teorii s přehlednými grafickými listy a otestuj své znalosti v testech.
        </motion.p>
      </section>

      {/* Compact Subject Cards with Larger Text */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl mx-auto">
        {PREDEFINED_SUBJECTS.map((sub) => {
          const isActive = activeSubject === sub.id;
          const isSubMath = sub.id === 'Matematika';
          return (
            <motion.div
              key={sub.id}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.985 }}
              onClick={() => {
                setActiveSubject(sub.id as any);
                trackPracticeSubjectChange(sub.id);
              }}
              className={`cursor-pointer rounded-3xl p-5 sm:p-6 border transition-all duration-300 relative overflow-hidden flex items-center gap-5 sm:gap-6 group ${
                isActive 
                  ? `border-transparent bg-gradient-to-br ${sub.gradient} text-white shadow-xl ${isSubMath ? 'shadow-teal-900/10 ring-emerald-500/20' : 'shadow-rose-900/10 ring-rose-500/20'} ring-4 ring-offset-2` 
                  : `bg-white border-gray-200/80 ${isSubMath ? 'hover:border-emerald-500' : 'hover:border-rose-500'} shadow-sm hover:shadow-xl`
              }`}
            >
              <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-transform duration-300 group-hover:scale-105 ${
                isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
              }`}>
                {getSubjectIcon(sub.id, isActive)}
              </div>
              
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className={`text-2xl sm:text-3xl font-sans font-black tracking-tight transition-colors duration-300 ${
                    isActive
                      ? 'text-white'
                      : isSubMath
                        ? 'text-[#1E1B18] group-hover:text-emerald-600'
                        : 'text-[#1E1B18] group-hover:text-rose-600'
                  }`}>
                    {sub.title}
                  </h3>
                  {isActive && (
                    <span className="text-[11px] font-black uppercase tracking-wider bg-white/25 px-2.5 py-1 rounded-full text-white">
                      Vybráno
                    </span>
                  )}
                </div>
                <p className={`text-sm sm:text-base font-medium mt-1 leading-snug ${
                  isActive ? 'text-white/90' : 'text-gray-500'
                }`}>
                  {sub.description}
                </p>
              </div>
            </motion.div>
          );
        })}
      </section>

      {/* Main Content Area: Topics & Subtopics */}
      <div className="max-w-5xl mx-auto space-y-6">
        {loading ? (
          <div className="text-center py-16 bg-white/60 rounded-[2.5rem] border border-gray-100">
            <div className="w-10 h-10 border-4 border-[#1E1B18] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 font-bold text-sm">Načítání témat pro předmět {activeSubject}...</p>
          </div>
        ) : visibleTopics.length === 0 ? (
          <div className="text-center py-16 bg-white/80 rounded-[2.5rem] border border-dashed border-gray-200 shadow-sm space-y-4 p-8">
            <BookCyanIcon size={48} className="mx-auto" />
            <div className="space-y-1">
              <h4 className="text-2xl font-display font-bold text-gray-800">
                Žádná témata pro {activeSubject}
              </h4>
              <p className="text-gray-400 font-medium text-sm max-w-md mx-auto">
                Pro tento předmět zatím nejsou zpřístupněna žádná témata.
              </p>
            </div>

            {isTeacher && (
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <Link to="/teacher?tab=practices">
                  <Button variant="outline" className="rounded-xl font-bold h-11 px-5 cursor-pointer">
                    Přejít do administrace témat
                  </Button>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {visibleTopics.map((topic, index) => {
              const topicSubtopics = visibleSubtopics.filter(s => s.topicId === topic.id || s.topicId === topic.title);
              const isExpanded = !!expandedTopics[topic.id];
              const isMath = activeSubject === 'Matematika';

              return (
                <motion.div 
                  key={topic.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ y: -4 }}
                  className={`bg-white rounded-[2.5rem] p-6 sm:p-8 border border-gray-200/80 shadow-sm hover:shadow-xl ${
                    isMath ? 'hover:border-emerald-500' : 'hover:border-rose-500'
                  } transition-all duration-300`}
                >
                  {/* Topic Header - clickable to expand/collapse with arrow in the right corner */}
                  <div 
                    onClick={() => toggleTopic(topic.id)}
                    className="flex items-center justify-between gap-4 cursor-pointer select-none group"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleTopic(topic.id);
                      }
                    }}
                    aria-expanded={isExpanded}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md ${
                          isMath ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
                        }`}>
                          Hlavní téma
                        </span>
                        <span className="text-xs font-bold text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                          {topicSubtopics.length} {topicSubtopics.length === 1 ? 'podtéma' : topicSubtopics.length < 5 ? 'podtémata' : 'podtémat'}
                        </span>
                      </div>
                      <h3 className={`text-2xl sm:text-3xl font-playful text-[#1E1B18] mt-1 ${
                        isMath ? 'group-hover:text-emerald-600' : 'group-hover:text-rose-600'
                      } transition-colors duration-300`}>
                        {topic.title}
                      </h3>
                      {topic.description && (
                        <p className="text-gray-500 text-sm font-medium mt-0.5">{topic.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 self-center">
                      {topicSubtopics.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleOpenScheduleForTopic(e, topic, topicSubtopics)}
                          className="rounded-xl font-bold text-xs h-10 px-3.5 flex items-center gap-1.5 cursor-pointer bg-white border-gray-200 hover:border-brand-blue hover:bg-blue-50/40 text-gray-800 transition-all"
                          title="Naplánovat celé téma do kalendáře"
                        >
                          <Calendar size={14} className="text-brand-blue" />
                          <span className="hidden sm:inline">Naplánovat téma</span>
                          {!isPremium && (
                            <span className="text-[9px] font-black uppercase text-amber-700 bg-amber-100 px-1 py-0.5 rounded">
                              PRO
                            </span>
                          )}
                        </Button>
                      )}
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-105 ${
                        isExpanded
                          ? isMath
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-2xs'
                            : 'bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-2xs'
                          : isMath
                            ? 'bg-gray-50 group-hover:bg-emerald-500 text-gray-500 group-hover:text-white'
                            : 'bg-gray-50 group-hover:bg-rose-500 text-gray-500 group-hover:text-white'
                      }`}>
                        <ChevronDown 
                          size={22} 
                          className={`transition-transform duration-300 ${
                            isExpanded ? 'rotate-180' : ''
                          }`} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Subtopics List (Rendered when expanded) */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        className="mt-6 pt-5 border-t border-gray-100 space-y-4"
                      >
                        {topicSubtopics.length === 0 ? (
                          <p className="text-gray-400 text-sm italic py-4">Žádná podtémata v tomto tématu.</p>
                        ) : (
                          <div className="grid gap-3.5">
                            {topicSubtopics.map((subtopic) => {
                              const isFirstDemo = subtopic.id === firstVisibleSubtopicId;
                              const isLockedForGuest = !user && !isFirstDemo;
                              const isStudyLocked = !isPremium;

                              const handlePracticeClick = (e: React.MouseEvent) => {
                                trackSectionClick('practice_start_btn', `/practice/session/${subtopic.id}`, {
                                  subtopicId: subtopic.id,
                                  subtopicTitle: subtopic.title,
                                  subject: activeSubject,
                                  isLocked: isLockedForGuest
                                });

                                if (isLockedForGuest) {
                                  e.preventDefault();
                                  openAuthModal();
                                  toast.info('Toto cvičení je dostupné po bezplatné registraci. Zaregistruj se a získej 20 žolíků na každý den!');
                                }
                              };

                              const handleStudyClick = (e: React.MouseEvent) => {
                                trackSectionClick('practice_study_btn', `/study/${subtopic.id}`, {
                                  subtopicId: subtopic.id,
                                  subtopicTitle: subtopic.title,
                                  subject: activeSubject,
                                  isLocked: isStudyLocked
                                });

                                if (isStudyLocked) {
                                  e.preventDefault();
                                  if (!user) {
                                    openAuthModal();
                                    toast.info('Studium a teorie je dostupné pro předplatitele ProEdu Premium. Přihlaste se prosím.');
                                  } else {
                                    setSelectedSubtopicForStudy(subtopic);
                                    setIsPremiumModalOpen(true);
                                  }
                                }
                              };

                              return (
                                <div
                                  key={subtopic.id}
                                  className={`group/sub p-5 rounded-2xl border transition-all duration-300 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                                    isLockedForGuest
                                      ? 'bg-[#FAF7F0]/60 border-gray-200/50 opacity-85'
                                      : `bg-[#FAF7F0] hover:bg-white border-gray-200/70 ${
                                          isMath ? 'hover:border-emerald-500' : 'hover:border-rose-500'
                                        } hover:shadow-md hover:-translate-y-0.5`
                                  }`}
                                >
                                  <div className="space-y-1.5 flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className={`font-bold text-lg text-[#1E1B18] ${
                                        isMath ? 'group-hover/sub:text-emerald-600' : 'group-hover/sub:text-rose-600'
                                      } transition-colors duration-300 leading-tight`}>
                                        {subtopic.title}
                                      </h4>
                                      {isFirstDemo && !user && (
                                        <span className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                                          Vyzkoušet zdarma
                                        </span>
                                      )}
                                      {isLockedForGuest && (
                                        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md">
                                          <Lock size={12} /> Vyžaduje registraci
                                        </span>
                                      )}
                                    </div>
                                    {subtopic.description && (
                                      <p className="text-gray-500 text-xs sm:text-sm font-medium line-clamp-2">
                                        {subtopic.description}
                                      </p>
                                    )}
                                  </div>

                                  {/* Action Buttons for this subtopic */}
                                  <div className="flex items-center gap-2 flex-wrap shrink-0 self-end md:self-center">
                                    {/* Do kalendáře Button */}
                                    <Button
                                      variant="outline"
                                      onClick={(e) => handleOpenScheduleForSubtopic(e, topic, subtopic)}
                                      className="rounded-xl font-bold text-xs h-10 px-3.5 flex items-center gap-1.5 cursor-pointer bg-white border-gray-200 hover:border-brand-blue hover:bg-blue-50/40 text-gray-800 transition-all"
                                      title="Přidat cvičení do kalendáře"
                                    >
                                      <Calendar size={14} className="text-brand-blue" />
                                      <span>Do kalendáře</span>
                                      {!isPremium && (
                                        <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-1 py-0.5 rounded ml-0.5">
                                          PRO
                                        </span>
                                      )}
                                    </Button>

                                    {/* Studovat Button (Zamčeno pro Free a hosty, pouze pro Premium) */}
                                    <Link 
                                      to={isStudyLocked ? '#' : `/study/${subtopic.id}`}
                                      onClick={handleStudyClick}
                                    >
                                      <Button
                                        variant="outline"
                                        className={`rounded-xl font-bold text-xs h-10 px-4 flex items-center gap-1.5 cursor-pointer bg-white transition-all ${
                                          isStudyLocked ? 'border-amber-300 hover:border-amber-400 text-amber-900' : 'border-gray-300 hover:border-black'
                                        }`}
                                      >
                                        {isStudyLocked ? (
                                          <Lock size={13} className="text-amber-500" />
                                        ) : (
                                          <BookCyanIcon size={16} />
                                        )}
                                        <span>Studovat</span>
                                        {isStudyLocked && (
                                          <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-1 py-0.5 rounded ml-0.5">
                                            PRO
                                          </span>
                                        )}
                                      </Button>
                                    </Link>

                                    {/* Procvičovat Button */}
                                    <Link 
                                      to={isLockedForGuest ? '#' : `/practice/session/${subtopic.id}`}
                                      onClick={handlePracticeClick}
                                    >
                                      <Button
                                        className="rounded-xl bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black text-xs h-10 px-5 flex items-center gap-1.5 shadow-xs border border-blue-200/80 hover:scale-105 transition-transform cursor-pointer"
                                      >
                                        {isLockedForGuest ? (
                                          <Lock size={14} className="text-[#0F2942]" />
                                        ) : (
                                          <Play size={14} className="fill-[#0F2942] text-[#0F2942]" />
                                        )}
                                        <span>{isLockedForGuest ? 'Odemknout' : 'Procvičovat'}</span>
                                      </Button>
                                    </Link>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sjednocený Paywall dialog pro sekci Studium */}
      <UnifiedPaywallModal
        isOpen={isPremiumModalOpen}
        onClose={() => setIsPremiumModalOpen(false)}
        type="premium"
        description="Kompletní výukové listy, vysvětlení látky krok za krokem, tipy lektora a vzorové řešené úlohy jsou dostupné pouze v balíčku Premium."
        onSuccess={() => {
          if (selectedSubtopicForStudy) {
            navigate(`/study/${selectedSubtopicForStudy.id}`);
          }
        }}
      />

      {/* Modal pro naplánování procvičování do kalendáře */}
      <PracticeScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        initialSubject={activeSubject}
        initialTopic={scheduleInitialTopic}
        initialSubtopics={scheduleInitialSubtopics}
        existingTodos={studentTodos}
      />
    </div>
  );
}
