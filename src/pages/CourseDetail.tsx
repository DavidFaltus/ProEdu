import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  GraduationCap, Lock, ArrowLeft, Calendar, Clock, User, 
  Sparkles, Check, BookOpen, Video, ExternalLink, ShieldCheck, 
  Layers, Users, AlertCircle 
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import UnifiedPaywallModal from '../components/common/UnifiedPaywallModal';
import { Course } from '../types';
import { getCourseById } from '../services/courseService';

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, profile, isCourseUser, isTeacher } = useAuth();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  useEffect(() => {
    async function load() {
      if (!id) return;
      setLoading(true);
      try {
        const data = await getCourseById(id);
        setCourse(data);
      } catch (err) {
        console.error('Failed to load course detail:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 font-bold text-sm">Načítání detailu kurzu...</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-2xl font-display font-black text-gray-900">Kurz nebyl nalezen</h2>
        <p className="text-gray-500 text-sm">Požadovaný kurz neexistuje nebo byl přesunut.</p>
        <Link to="/courses">
          <Button className="rounded-xl font-bold bg-[#1E1B18] text-white">
            Zpět na přehled kurzů
          </Button>
        </Link>
      </div>
    );
  }

  const hasAccess = isCourseUser || isTeacher;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link 
          to="/courses" 
          className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-[#1E1B18] transition-colors bg-white px-4 py-2 rounded-xl shadow-xs border border-gray-100"
        >
          <ArrowLeft size={16} /> Zpět na nabídku kurzů
        </Link>

        {isTeacher && (
          <Link to="/teacher?tab=courses">
            <Button variant="outline" size="sm" className="rounded-xl font-bold text-xs h-9">
              Upravit v administraci
            </Button>
          </Link>
        )}
      </div>

      {/* Hero Header Card */}
      <div className="bg-gradient-to-br from-[#1E1B18] via-[#241E30] to-[#1E1B18] text-white rounded-[2.5rem] p-6 sm:p-10 shadow-xl relative overflow-hidden border border-indigo-500/20 space-y-6">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-400/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
              {course.subject || 'Příprava na SŠ'}
            </span>
            {course.badge && (
              <span className="px-3 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-amber-400/20 text-amber-300 border border-amber-400/30">
                {course.badge}
              </span>
            )}
            {hasAccess && (
              <span className="px-3 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center gap-1">
                <ShieldCheck size={12} /> Zapsán v kurzu
              </span>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-black text-white tracking-tight">
            {course.title}
          </h1>

          <p className="text-gray-300 text-sm sm:text-base max-w-3xl leading-relaxed font-medium">
            {course.description}
          </p>
        </div>

        {/* Quick Meta Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/10 relative z-10">
          <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
              <User size={12} /> Lektor
            </span>
            <p className="text-xs sm:text-sm font-bold text-white truncate" title={course.instructorName || 'Certifikovaný lektor ProEdu'}>
              {course.instructorName || 'Lektor ProEdu'}
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
              <Clock size={12} /> Harmonogram
            </span>
            <p className="text-xs sm:text-sm font-bold text-white truncate" title={course.schedule || '1x týdně, 90 minut'}>
              {course.schedule || '1× týdně, 90 min'}
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
              <Calendar size={12} /> Období
            </span>
            <p className="text-xs sm:text-sm font-bold text-white truncate">
              {course.startDate && course.endDate ? `${course.startDate} – ${course.endDate}` : 'Celý školní rok'}
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 p-3.5 rounded-2xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-gray-400 flex items-center gap-1">
              <Sparkles size={12} /> Náročnost
            </span>
            <p className="text-xs sm:text-sm font-bold text-amber-300 truncate" title={course.difficulty || 'Cermat 9. třída'}>
              {course.difficulty || 'Cermat 9. třída'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid: Syllabus (Left) vs Access Card (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Syllabus & Details */}
        <div className="lg:col-span-2 space-y-8">
          {/* Syllabus Section */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl sm:text-2xl font-display font-black text-gray-900 flex items-center gap-2.5">
                  <Layers className="text-indigo-600" size={24} />
                  Přehled látky a osnova kurzu
                </h3>
                <p className="text-gray-500 text-xs sm:text-sm font-medium mt-0.5">
                  Kompletní tematický plán přípravy na přijímací zkoušky.
                </p>
              </div>

              {course.syllabus && (
                <span className="px-3 py-1 bg-indigo-50 text-indigo-800 text-xs font-black rounded-xl">
                  {course.syllabus.length} témat
                </span>
              )}
            </div>

            {course.syllabus && course.syllabus.length > 0 ? (
              <div className="space-y-3">
                {course.syllabus.map((topic, index) => (
                  <div 
                    key={index}
                    className="p-4 rounded-2xl bg-gray-50/80 border border-gray-100 hover:border-indigo-200 transition-all flex items-start gap-3.5 group"
                  >
                    <div className="w-7 h-7 rounded-xl bg-white border border-gray-200 text-indigo-700 text-xs font-black flex items-center justify-center shrink-0 shadow-xs group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      {index + 1}
                    </div>
                    <div className="space-y-0.5 min-w-0">
                      <h4 className="text-sm font-bold text-gray-900 leading-snug">
                        {topic}
                      </h4>
                      <p className="text-xs text-gray-400 font-medium">
                        Živá lekce, řešené vzorové úlohy CERMAT a domácí cvičení.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm italic">
                Osnova kurzu je aktuálně připravována lektorem.
              </p>
            )}
          </div>

          {/* Benefits Box */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-100 shadow-sm space-y-5">
            <h3 className="text-xl font-display font-black text-gray-900 flex items-center gap-2">
              <Sparkles className="text-amber-500" size={20} />
              Co je součástí tohoto kurzu?
            </h3>

            <div className="grid sm:grid-cols-2 gap-3.5 text-xs text-gray-700">
              <div className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-100 flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={12} strokeWidth={3} />
                </div>
                <span><strong>Živá výuka přes Google Meet</strong> s certifikovaným lektorem v malé skupině.</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-100 flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={12} strokeWidth={3} />
                </div>
                <span><strong>Záznamy všech lekcí</strong> – zmeškanou hodinu si můžeš kdykoliv pustit zpětně.</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-100 flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={12} strokeWidth={3} />
                </div>
                <span><strong>Pracovní listy a taháky</strong> vytvořené speciálně pro CERMAT přijímačky.</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-gray-50/70 border border-gray-100 flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Check size={12} strokeWidth={3} />
                </div>
                <span><strong>Kompletní balíček ProEdu Premium</strong> (neomezené procvičování) v ceně.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Enrollment & Meet Link */}
        <div className="space-y-6">
          {hasAccess ? (
            /* Zapsaný student / Lektor */
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-emerald-100 shadow-lg shadow-emerald-500/5 space-y-6">
              <div className="flex items-center gap-2.5 text-emerald-700 font-bold text-sm bg-emerald-50 p-3 rounded-2xl border border-emerald-200/60">
                <ShieldCheck size={20} className="shrink-0" />
                <span>Máš aktivní přístup k tomuto kurzu!</span>
              </div>

              <div className="space-y-3">
                <h4 className="font-display font-black text-xl text-gray-900">
                  Živá výuka online
                </h4>
                <p className="text-xs text-gray-500 leading-relaxed font-medium">
                  Lekce probíhají pravidelně dle harmonogramu. Odkaz na Google Meet je aktivní před začátkem hodiny.
                </p>

                {course.meetUrl ? (
                  <a 
                    href={course.meetUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <Button className="w-full h-13 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md cursor-pointer">
                      <Video size={18} />
                      <span>Vstoupit do Google Meet lekce</span>
                      <ExternalLink size={14} className="opacity-70 ml-1" />
                    </Button>
                  </a>
                ) : (
                  <div className="p-3 rounded-xl bg-gray-50 text-gray-500 text-xs italic text-center">
                    Odkaz na Google Meet bude doplněn lektorem před začátkem kurzu.
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100 space-y-2 text-xs text-gray-600">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Pravidelný čas:</span>
                  <span className="font-bold text-gray-900">{course.schedule || 'Dle rozvrhu'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Lektor:</span>
                  <span className="font-bold text-gray-900">{course.instructorName || 'Lektor'}</span>
                </div>
              </div>
            </div>
          ) : (
            /* Ne-kurzový uživatel: Cenová karta a zápis */
            <div className="bg-white rounded-3xl p-6 sm:p-7 border border-indigo-100 shadow-xl shadow-indigo-500/5 space-y-6">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-md inline-block">
                  Cena kurzu
                </span>
                <div className="text-3xl font-display font-black text-gray-900">
                  {course.price || '2 490 Kč / sezóna'}
                </div>
                <p className="text-xs text-gray-500 font-medium">
                  Jednorázová platba na celou přijímačkovou sezónu až do dubna.
                </p>
              </div>

              <Button
                onClick={() => setIsPaywallOpen(true)}
                className="w-full h-14 rounded-2xl bg-[#F5C400] hover:bg-[#F5C400]/90 text-[#1E1B18] font-black text-base shadow-lg shadow-yellow-500/25 transition-transform hover:scale-[1.02] flex items-center justify-center gap-2 cursor-pointer"
              >
                <GraduationCap size={20} />
                <span>Zapsat se do kurzu</span>
              </Button>

              {/* Locked Google Meet Card */}
              <div className="p-4 rounded-2xl bg-gray-50 border border-dashed border-gray-200 text-center space-y-2">
                <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center mx-auto">
                  <Lock size={15} />
                </div>
                <h5 className="font-bold text-xs text-gray-700">
                  Google Meet odkaz a interní výuka
                </h5>
                <p className="text-[11px] text-gray-400 leading-snug">
                  Odkazy na živé online hodiny, videozáznamy a úkoly budou odemčeny po zápisu do kurzu.
                </p>
              </div>

              <div className="space-y-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-600" />
                  <span>Garance vrácení peněz do 14 dnů</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={14} className="text-emerald-600" />
                  <span>Okamžitý přístup k materiálům</span>
                </div>
              </div>
            </div>
          )}

          {/* Quick Help Card */}
          <div className="p-6 rounded-3xl bg-[#FAF7F0] border border-gray-200/60 space-y-2.5 text-xs text-gray-600">
            <h5 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
              <BookOpen size={16} className="text-indigo-600" />
              Máš dotaz ke kurzu?
            </h5>
            <p className="leading-relaxed">
              Potřebuješ poradit s výběrem kurzu nebo máš specifické požadavky? Napiš nám přes kontaktní formulář nebo na podporu.
            </p>
            <Link to="/contact" className="font-black text-indigo-700 hover:underline inline-block pt-1">
              Přejít na kontakt →
            </Link>
          </div>
        </div>
      </div>

      {/* Sjednocený Paywall Modal pro aktivaci kurzu */}
      <UnifiedPaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        type="course"
        title={`Zápis do kurzu: ${course.title}`}
        description="Potvrď výběr kurzu a získej okamžitý přístup k živým lekcím, materiálům a záznamům."
        onSuccess={() => {
          setIsPaywallOpen(false);
          // Obnovit stav, uživatel má nyní roli course
          window.location.reload();
        }}
      />
    </div>
  );
}
