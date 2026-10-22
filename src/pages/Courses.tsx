import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { 
  BookOpen, Calendar, GraduationCap, Users, ArrowRight, 
  Sparkles, Check, Clock, ShieldCheck, Settings, Loader2 
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import UnifiedPaywallModal from '../components/common/UnifiedPaywallModal';
import { Course } from '../types';
import { DEFAULT_FLAGSHIP_COURSES, getAllCourses } from '../services/courseService';
import { trackSectionClick } from '../services/analyticsService';

export default function Courses() {
  const { profile, user, isCourseUser, isTeacher } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Paywall modal state for the banner
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function loadCourses() {
      try {
        const data = await getAllCourses();
        if (isMounted) {
          setCourses(data);
          setLoading(false);
        }
      } catch (err) {
        console.warn('Courses fetch fallback error:', err);
        if (isMounted) {
          setCourses(DEFAULT_FLAGSHIP_COURSES as Course[]);
          setLoading(false);
        }
      }
    }
    loadCourses();
    return () => {
      isMounted = false;
    };
  }, []);

  const displayCourses = courses.length > 0 ? courses : (DEFAULT_FLAGSHIP_COURSES as Course[]);

  return (
    <div className="page-container space-y-8 pb-16">
      {/* Header */}
      <section className="text-center space-y-4 max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center">
          <span className="px-3.5 py-1 text-xs font-black uppercase tracking-widest bg-indigo-100 text-indigo-900 border border-indigo-200/60 rounded-full inline-flex items-center gap-1.5">
            <GraduationCap size={14} /> Přípravné kurzy ProEdu
          </span>
        </motion.div>

        <motion.h1 initial={{ opacity: 0, y: -15 }} animate={{ opacity: 1, y: 0 }} className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-playful text-[#1E1B18] tracking-tight">
          {isTeacher ? 'Nabídka a správa kurzů' : isCourseUser ? 'Tvoje online kurzy' : 'Aktuální nabídka kurzů'}
        </motion.h1>

        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-base md:text-lg text-gray-500 leading-relaxed">
          {isTeacher 
            ? 'Přehled všech vypsaných kurzů pro 9. třídu. Kompletní správu a úpravy osnov najdeš v administraci.' 
            : isCourseUser
              ? 'Tvé zapsané kurzy, živé online hodiny přes Google Meet, podrobná osnova a materiály.'
              : 'Vyber si z naší nabídky online kurzů pro 9. třídu s živou výukou, kompletní osnovou témat a materiály.'}
        </motion.p>

        {/* Teacher "Správa kurzů" quick link */}
        {isTeacher && (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex justify-center pt-2">
            <Link to="/teacher?tab=courses">
              <Button 
                className="bg-[#F5C400] text-[#1E1B18] h-12 px-7 rounded-2xl font-black shadow-lg shadow-yellow-500/20 hover:bg-[#F5C400]/90 transition-all cursor-pointer flex items-center gap-2"
              >
                <Settings size={18} /> Přejít do správy kurzů v administraci
              </Button>
            </Link>
          </motion.div>
        )}
      </section>

      {/* Paywall Banner for non-course users */}
      {!isCourseUser && !isTeacher && (
        <div className="bg-gradient-to-r from-[#1E1B18] via-[#241E30] to-[#1E1B18] text-white p-6 sm:p-8 rounded-[2.5rem] shadow-xl border border-indigo-500/20 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="space-y-2 text-center md:text-left relative z-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 text-yellow-300 text-xs font-black uppercase tracking-wider rounded-full border border-white/15">
              <Sparkles size={12} /> Živá výuka s lektory
            </span>
            <h2 className="text-2xl sm:text-3xl font-sans font-black text-white">
              Odemkni si živou online výuku s lektorem
            </h2>
            <p className="text-gray-300 text-sm sm:text-base max-w-xl leading-relaxed">
              Klikni na libovolný kurz níže pro zobrazení podrobné osnovy témat, harmonogramu a náročnosti.
            </p>
          </div>

          <Button
            onClick={() => setIsPaywallOpen(true)}
            className="h-13 px-8 rounded-2xl bg-[#F5C400] hover:bg-[#F5C400]/90 text-[#1E1B18] font-black text-sm shadow-lg shadow-yellow-500/20 shrink-0 cursor-pointer flex items-center gap-2 relative z-10"
          >
            <GraduationCap size={18} />
            <span>Zapsat se do kurzu</span>
          </Button>
        </div>
      )}

      {/* Courses Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-[#B80053]">
          <Loader2 size={36} className="animate-spin" />
        </div>
      ) : displayCourses.length === 0 ? (
        <div className="text-center py-20 bg-white/70 rounded-[2.5rem] border border-gray-100 p-8 space-y-4">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto text-indigo-600">
            <BookOpen size={32} />
          </div>
          <h2 className="text-2xl font-display font-bold text-gray-800">Zatím tu žádné kurzy nejsou</h2>
          <p className="text-gray-500 max-w-md mx-auto text-sm">
            {isTeacher 
              ? 'Vytvoř první kurz pro studenty v administraci.' 
              : 'Aktuálně pro tebe nejsou vypsány žádné aktivní kurzy.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {displayCourses.map((course: Course, index: number) => {
              const isEnrolled = isCourseUser || isTeacher;
              const accentColor = course.color === 'purple' ? 'from-purple-500 to-indigo-600' :
                                  course.color === 'blue' ? 'from-blue-500 to-indigo-600' :
                                  course.color === 'orange' ? 'from-amber-500 to-orange-600' :
                                  course.color === 'green' ? 'from-emerald-500 to-teal-600' :
                                  'from-rose-500 to-pink-600';

              return (
                <motion.div
                  key={course.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="h-full"
                >
                  <Link
                    to={`/courses/${course.id}`}
                    onClick={() => trackSectionClick('course_card_click', `/courses/${course.id}`, {
                      courseId: course.id,
                      courseTitle: course.title,
                      isEnrolled,
                    })}
                    className="block h-full group"
                  >
                    <Card className="h-full rounded-[2.5rem] border border-gray-200/80 bg-white transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-md hover:shadow-2xl hover:-translate-y-1 group-hover:border-indigo-400">
                      <div className={`h-2.5 bg-gradient-to-r ${accentColor}`} />
                      
                      <CardHeader className="p-7 pb-3 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="w-12 h-12 bg-indigo-50 text-indigo-700 rounded-2xl flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                            <BookOpen size={24} />
                          </div>

                          {isEnrolled ? (
                            <span className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-100/90 px-2.5 py-1 rounded-lg border border-emerald-200/60">
                              <ShieldCheck size={13} /> {isTeacher ? 'Lektor' : 'Zapsáno'}
                            </span>
                          ) : (
                            <span className="text-xs font-black text-indigo-900 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                              {course.price || '2 490 Kč / sezóna'}
                            </span>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            {course.subject && (
                              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                                {course.subject}
                              </span>
                            )}
                            {course.badge && (
                              <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/50">
                                {course.badge}
                              </span>
                            )}
                          </div>
                          
                          <h3 className="text-xl font-sans font-bold text-[#1E1B18] group-hover:text-indigo-600 transition-colors leading-snug">
                            {course.title}
                          </h3>
                        </div>
                      </CardHeader>

                      <CardContent className="p-7 pt-2 flex flex-col justify-between flex-1">
                        <p className="text-gray-500 text-xs sm:text-sm line-clamp-3 leading-relaxed mb-4 font-medium">
                          {course.description}
                        </p>

                        {/* Schedule & Syllabus preview info */}
                        <div className="space-y-1.5 mb-6 bg-gray-50/80 p-3 rounded-2xl border border-gray-100 text-[11px] font-bold text-gray-600">
                          {course.schedule && (
                            <div className="flex items-center gap-1.5 text-gray-700">
                              <Clock size={12} className="text-indigo-600 shrink-0" />
                              <span className="truncate">{course.schedule}</span>
                            </div>
                          )}
                          {course.difficulty && (
                            <div className="flex items-center gap-1.5 text-gray-700">
                              <Sparkles size={12} className="text-amber-500 shrink-0" />
                              <span className="truncate">{course.difficulty}</span>
                            </div>
                          )}
                          {course.syllabus && course.syllabus.length > 0 && (
                            <div className="text-indigo-700 font-extrabold text-[10px] uppercase tracking-wider pt-1">
                              • Osnova: {course.syllabus.length} tematických bloků
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-auto">
                          <span className="text-xs font-black uppercase tracking-wider text-indigo-950 group-hover:text-indigo-600 transition-colors">
                            {isEnrolled ? 'Vstoupit do kurzu' : 'Zobrazit detail a osnovu'}
                          </span>

                          <div className="w-9 h-9 rounded-full bg-[#F5C400] text-[#1E1B18] flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                            <ArrowRight size={17} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Sjednocený Paywall Modal pro Kurzy (pro tlačítko v banneru) */}
      <UnifiedPaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        type="course"
        title="Výběr z aktuální nabídky kurzů"
        description="Získej přístup k živým online lekcím, záznamům výuky, konzultacím a studijním materiálům kurzu."
        onSuccess={() => {
          setIsPaywallOpen(false);
        }}
      />
    </div>
  );
}
