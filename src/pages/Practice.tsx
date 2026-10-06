import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  Calculator, BookMarked, BookOpen, Play, Sparkles, Plus, 
  ArrowRight, CheckCircle2, ChevronRight, FileText, GraduationCap 
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { 
  getTopics, getSubtopics, getQuestionsForSubtopic, 
  PREDEFINED_SUBJECTS 
} from '../services/practiceService';
import { PracticeTopic, PracticeSubtopic } from '../types';
import { toast } from 'sonner';

const getSubjectIcon = (id: string) => {
  if (id === 'Matematika') return <Calculator className="w-8 h-8" />;
  return <BookMarked className="w-8 h-8" />;
};

export default function Practice() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [activeSubject, setActiveSubject] = useState<'Matematika' | 'Čeština'>('Matematika');
  const [topics, setTopics] = useState<PracticeTopic[]>([]);
  const [subtopics, setSubtopics] = useState<PracticeSubtopic[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const isTeacher = profile?.role === 'teacher';

  const loadData = async () => {
    setLoading(true);
    try {
      const fetchedTopics = await getTopics(activeSubject);
      const fetchedSubtopics = await getSubtopics(undefined, activeSubject);
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
          initial={{ opacity: 0, y: -10 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold text-[#1E1B18] tracking-tight"
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
          return (
            <motion.div
              key={sub.id}
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              onClick={() => setActiveSubject(sub.id as any)}
              className={`cursor-pointer rounded-3xl p-5 sm:p-6 border transition-all relative overflow-hidden flex items-center gap-5 sm:gap-6 ${
                isActive 
                  ? `border-transparent bg-gradient-to-br ${sub.gradient} text-white shadow-xl shadow-teal-900/10 ring-4 ring-offset-2 ring-emerald-500/20` 
                  : 'bg-white border-gray-200/80 hover:border-gray-300 shadow-sm hover:shadow-md'
              }`}
            >
              <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
                isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-700'
              }`}>
                {getSubjectIcon(sub.id)}
              </div>
              
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className={`text-2xl sm:text-3xl font-display font-black tracking-tight ${
                    isActive ? 'text-white' : 'text-[#1E1B18]'
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
        ) : topics.length === 0 ? (
          <div className="text-center py-16 bg-white/80 rounded-[2.5rem] border border-dashed border-gray-200 shadow-sm space-y-4 p-8">
            <BookOpen size={48} className="mx-auto text-gray-300" />
            <div className="space-y-1">
              <h4 className="text-2xl font-display font-bold text-gray-800">
                Žádná témata pro {activeSubject}
              </h4>
              <p className="text-gray-400 font-medium text-sm max-w-md mx-auto">
                Pro tento předmět zatím nebyla vytvořena témata.
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
            {topics.map((topic) => {
              const topicSubtopics = subtopics.filter(s => s.topicId === topic.id || s.topicId === topic.title);

              return (
                <div 
                  key={topic.id}
                  className="bg-white rounded-[2.5rem] p-6 sm:p-8 border border-gray-100 shadow-sm space-y-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-4">
                    <div>
                      <span className="text-[11px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-md">
                        Hlavní téma
                      </span>
                      <h3 className="text-2xl sm:text-3xl font-display font-black text-[#1E1B18] mt-1">
                        {topic.title}
                      </h3>
                      {topic.description && (
                        <p className="text-gray-500 text-sm font-medium mt-0.5">{topic.description}</p>
                      )}
                    </div>

                    <span className="text-xs font-bold text-gray-400 bg-gray-50 px-3 py-1 rounded-full self-start sm:self-auto">
                      {topicSubtopics.length} {topicSubtopics.length === 1 ? 'podtéma' : topicSubtopics.length < 5 ? 'podtémata' : 'podtémat'}
                    </span>
                  </div>

                  {/* Subtopics List */}
                  {topicSubtopics.length === 0 ? (
                    <p className="text-gray-400 text-sm italic py-4">Žádná podtémata v tomto tématu.</p>
                  ) : (
                    <div className="grid gap-3.5">
                      {topicSubtopics.map((subtopic) => (
                        <div
                          key={subtopic.id}
                          className="p-5 rounded-2xl bg-[#FAF7F0] hover:bg-white border border-gray-200/70 hover:border-gray-300 hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                        >
                          <div className="space-y-1.5 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-lg text-gray-900 leading-tight">
                                {subtopic.title}
                              </h4>
                            </div>
                            {subtopic.description && (
                              <p className="text-gray-500 text-xs sm:text-sm font-medium line-clamp-2">
                                {subtopic.description}
                              </p>
                            )}
                          </div>

                          {/* Action Buttons for this subtopic */}
                          <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center">
                            {/* Studovat Button */}
                            <Link to={`/study/${subtopic.id}`}>
                              <Button
                                variant="outline"
                                className="rounded-xl border-gray-300 hover:border-black font-bold text-xs h-10 px-4 flex items-center gap-1.5 cursor-pointer bg-white"
                              >
                                <BookOpen size={15} />
                                <span>Studovat</span>
                              </Button>
                            </Link>

                            {/* Procvičovat Button */}
                            <Link to={`/practice/session/${subtopic.id}`}>
                              <Button
                                className="rounded-xl bg-[#1E1B18] hover:bg-[#332f2b] text-white font-bold text-xs h-10 px-5 flex items-center gap-1.5 shadow-sm hover:scale-105 transition-transform cursor-pointer"
                              >
                                <Play size={14} className="fill-current text-[#F5C400]" />
                                <span>Procvičovat</span>
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
