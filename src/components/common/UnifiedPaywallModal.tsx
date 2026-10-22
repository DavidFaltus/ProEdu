import React, { useState, useEffect } from 'react';
import { Crown, GraduationCap, Check, Sparkles, X, Play, BookOpen } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { db } from '../../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { trackPaywallImpression, trackPaywallCtaClick } from '../../services/analyticsService';

export type PaywallType = 'premium' | 'course';

export interface CourseOption {
  id: string;
  title: string;
  badge: string;
  description: string;
  price: string;
  subject?: string;
}

const DEFAULT_COURSES: CourseOption[] = [
  {
    id: 'course-combo',
    title: 'Komplexní příprava (Matematika + Čeština)',
    badge: 'Doporučeno • Nejoblíbenější',
    description: '2x týdně živá online lekce přes Google Meet, záznamy všech hodin, testy a materiály.',
    price: '3 990 Kč / sezóna',
    subject: 'MA + ČJ'
  },
  {
    id: 'course-math',
    title: 'Intenzivní kurz Matematiky na SŠ',
    badge: 'Matematika',
    description: '1x týdně živá online lekce, geometrie, rovnice, slovní úlohy a rozbory Cermat.',
    price: '2 490 Kč / sezóna',
    subject: 'Matematika'
  },
  {
    id: 'course-czech',
    title: 'Intenzivní kurz Českého jazyka na SŠ',
    badge: 'Český jazyk',
    description: '1x týdně živá online lekce, pravopis, větné rozbory, porozumění textu a sloh.',
    price: '2 490 Kč / sezóna',
    subject: 'Český jazyk'
  }
];

export interface UnifiedPaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: PaywallType;
  title?: string;
  description?: string;
  onSuccess?: () => void;
}

export default function UnifiedPaywallModal({
  isOpen,
  onClose,
  type,
  title,
  description,
  onSuccess
}: UnifiedPaywallModalProps) {
  const { user, profile, updateProfileData, openAuthModal } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<'year' | 'month'>('year');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('course-combo');
  const [availableCourses, setAvailableCourses] = useState<CourseOption[]>(DEFAULT_COURSES);
  const [isActivating, setIsActivating] = useState(false);

  // Načtení případných dynamických kurzů z Firestore
  useEffect(() => {
    async function loadDbCourses() {
      if (type !== 'course') return;
      try {
        const snap = await getDocs(collection(db, 'courses'));
        if (!snap.empty) {
          const dbCourses: CourseOption[] = snap.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              title: data.title || 'Přípravný kurz',
              badge: 'Aktivní kurz',
              description: data.description || 'Pravidelné lekce a materiály ke kurzu.',
              price: 'V ceně kurzu'
            };
          });
          setAvailableCourses([...dbCourses, ...DEFAULT_COURSES.filter(c => !dbCourses.some(d => d.title === c.title))]);
        }
      } catch (err) {
        console.warn('Nepodařilo se načíst kurzy z DB, použit výchozí seznam:', err);
      }
    }
    if (isOpen) {
      trackPaywallImpression(type, { title: title || (type === 'course' ? 'Kurzy' : 'Premium') });
      loadDbCourses();
    }
  }, [isOpen, type, title]);

  const handleActivate = async () => {
    trackPaywallCtaClick('activate', type === 'course' ? selectedCourseId : selectedPlan);

    if (!user) {
      onClose();
      openAuthModal();
      toast.info('Pro aktivaci se prosím nejdříve přihlas.');
      return;
    }

    setIsActivating(true);
    try {
      if (type === 'course') {
        const selected = availableCourses.find(c => c.id === selectedCourseId) || availableCourses[0];
        await updateProfileData({ role: 'course' });
        toast.success(`🎉 Gratulujeme! Byl jsi úspěšně zapsán do kurzu "${selected.title}".`);
      } else {
        await updateProfileData({ role: 'premium' });
        toast.success('🎉 Gratulujeme! Balíček Premium byl úspěšně aktivován.');
      }
      onClose();
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      toast.error('Chyba při aktivaci: ' + err.message);
    } finally {
      setIsActivating(false);
    }
  };

  const isCourse = type === 'course';

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent className={`sm:max-w-lg rounded-[2.5rem] p-6 sm:p-8 text-white shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto relative overflow-hidden border ${
        isCourse 
          ? 'bg-gradient-to-br from-[#1E1B18] via-[#241E30] to-[#1E1B18] border-indigo-500/30' 
          : 'bg-gradient-to-br from-[#1E1B18] via-[#2D2823] to-[#1E1B18] border-amber-500/30'
      }`}>
        {/* Glow ambient effects */}
        <div className={`absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl pointer-events-none ${
          isCourse ? 'bg-indigo-500/15' : 'bg-amber-500/15'
        }`} />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-400/5 rounded-full blur-3xl pointer-events-none" />

        {/* Header Icon + Title */}
        <div className="text-center space-y-2.5 pt-1 relative z-10">
          <div className={`w-16 h-16 mx-auto rounded-3xl flex items-center justify-center text-white shadow-xl ${
            isCourse 
              ? 'bg-gradient-to-br from-blue-600 via-indigo-600 to-amber-500 shadow-indigo-500/25' 
              : 'bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-500/25'
          }`}>
            {isCourse ? (
              <GraduationCap className="w-8 h-8" />
            ) : (
              <Crown className="w-8 h-8 animate-pulse" />
            )}
          </div>

          <span className={`inline-flex items-center gap-1.5 px-3.5 py-1 text-[11px] font-black uppercase tracking-widest rounded-full ${
            isCourse 
              ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-400/30' 
              : 'bg-amber-400/15 text-amber-300 border border-amber-400/30'
          }`}>
            <Sparkles size={12} />
            {isCourse ? 'ProEdu Kurzy' : 'ProEdu Premium'}
          </span>

          <DialogTitle className="text-2xl sm:text-3xl font-display font-black text-white tracking-tight">
            {title || (isCourse ? 'Výběr z aktuální nabídky kurzů' : 'Získej ProEdu Premium')}
          </DialogTitle>

          <DialogDescription className="text-sm text-gray-300 font-medium leading-relaxed max-w-md mx-auto">
            {description || (isCourse 
              ? 'Připrav se na přijímací zkoušky s certifikovaným lektorem v živých online lekcích a s kompletními materiály.' 
              : 'Kompletní příprava na přijímací zkoušky na střední školy – všechny materiály, teorie krok za krokem a neomezené procvičování bez reklam.')}
          </DialogDescription>
        </div>

        {/* Dynamic Selector: Course list vs Premium plans */}
        {isCourse ? (
          /* Výběr kurzů z aktuální nabídky */
          <div className="space-y-3 relative z-10">
            <label className="text-xs font-black uppercase tracking-wider text-gray-300 block px-1">
              Vyber si svůj kurz z nabídky:
            </label>
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {availableCourses.map(course => {
                const isSelected = selectedCourseId === course.id;
                return (
                  <div
                    key={course.id}
                    onClick={() => setSelectedCourseId(course.id)}
                    className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer text-left flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'border-indigo-400 bg-indigo-500/20 shadow-md'
                        : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          isSelected ? 'bg-indigo-500 text-white' : 'bg-white/15 text-gray-200'
                        }`}>
                          {course.badge}
                        </span>
                        <h4 className="font-bold text-sm text-white leading-tight">
                          {course.title}
                        </h4>
                      </div>
                      <p className="text-xs text-gray-300 line-clamp-2 leading-relaxed font-medium">
                        {course.description}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-yellow-300">
                        {course.price}
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 mt-2 ml-auto flex items-center justify-center transition-colors ${
                        isSelected ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-white/30 bg-white/5'
                      }`}>
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Cenové karty pro Premium: Roční se slevou 20 % vs Měsíční */
          <div className="grid sm:grid-cols-2 gap-3 relative z-10">
            <div 
              onClick={() => setSelectedPlan('year')}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer text-left relative space-y-1 ${
                selectedPlan === 'year'
                  ? 'border-amber-400 bg-amber-400/15 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400/50'
                  : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10'
              }`}
            >
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 bg-amber-400/20 border border-amber-400/30 px-2 py-0.5 rounded-md inline-block">
                Zvýhodněno o 20 %
              </span>
              <div className="text-xl font-display font-black text-white mt-1">
                1 890 Kč <span className="text-xs font-normal text-gray-400">/ rok</span>
              </div>
              <div className="text-xs font-bold text-amber-300">jen 157 Kč / měsíc</div>
              <p className="text-[11px] text-gray-300 leading-snug">Plný přístup na 365 dní pro celou přípravu</p>
            </div>

            <div 
              onClick={() => setSelectedPlan('month')}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer text-left relative space-y-1 ${
                selectedPlan === 'month'
                  ? 'border-amber-400 bg-amber-400/15 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400/50'
                  : 'border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10'
              }`}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300 bg-white/10 px-2 py-0.5 rounded-md inline-block">
                Měsíčně
              </span>
              <div className="text-xl font-display font-black text-white mt-1">
                199 Kč <span className="text-xs font-normal text-gray-400">/ měsíc</span>
              </div>
              <div className="text-xs font-bold text-gray-200">Flexibilní předplatné</div>
              <p className="text-[11px] text-gray-300 leading-snug">Předplatné lze kdykoliv jednoduše zrušit</p>
            </div>
          </div>
        )}

        {/* Co balíček obsahuje (Feature checklist) */}
        <div className="space-y-2.5 text-xs text-gray-300 border-t border-b border-white/10 py-4 relative z-10">
          {isCourse ? (
            <>
              <div className="flex items-center gap-2.5 font-bold text-white">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Check size={12} strokeWidth={3} />
                </div>
                <span>Živé online lekce přes Google Meet s certifikovaným lektorem</span>
              </div>
              <div className="flex items-center gap-2.5 font-bold text-white">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Check size={12} strokeWidth={3} />
                </div>
                <span>Neomezený přístup k videozáznamům všech proběhlých hodin</span>
              </div>
              <div className="flex items-center gap-2.5 font-bold text-white">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Check size={12} strokeWidth={3} />
                </div>
                <span>Pracovní sešity a studijní materiály ke kurzu ke stažení</span>
              </div>
              <div className="flex items-center gap-2.5 font-bold text-white">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Check size={12} strokeWidth={3} />
                </div>
                <span>Kompletní balíček ProEdu Premium (všechny materiály i procvičování) v ceně</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 font-bold text-white">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Check size={12} strokeWidth={3} />
                </div>
                <span>Všechny výukové a grafické listy (Materiály) bez omezení</span>
              </div>
              <div className="flex items-center gap-2.5 font-bold text-white">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Check size={12} strokeWidth={3} />
                </div>
                <span>Kompletní teorie a vzorové postupy krok za krokem (Studium)</span>
              </div>
              <div className="flex items-center gap-2.5 font-bold text-white">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Check size={12} strokeWidth={3} />
                </div>
                <span>Neomezené procvičování – žádné čekání na žolíky</span>
              </div>
              <div className="flex items-center gap-2.5 font-bold text-white">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Check size={12} strokeWidth={3} />
                </div>
                <span>100% bez reklam a bez video pauz</span>
              </div>
              <div className="flex items-center gap-2.5 font-bold text-white">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <Check size={12} strokeWidth={3} />
                </div>
                <span>Možnost pokládat dotazy lektorům přímo u testových úloh</span>
              </div>
            </>
          )}
        </div>

        {/* Action Button */}
        <div className="space-y-2 pt-1 relative z-10">
          <Button
            onClick={handleActivate}
            disabled={isActivating}
            className={`w-full h-13 text-[#1E1B18] font-black rounded-2xl shadow-xl cursor-pointer flex items-center justify-center gap-2 transition-transform hover:scale-[1.01] ${
              isCourse
                ? 'bg-[#F5C400] hover:bg-[#F5C400]/90 shadow-yellow-500/25'
                : 'bg-[#F5C400] hover:bg-[#F5C400]/90 shadow-amber-400/25'
            }`}
          >
            {isCourse ? (
              <GraduationCap size={18} className="fill-current text-[#1E1B18]" />
            ) : (
              <Crown size={18} className="fill-current text-[#1E1B18]" />
            )}
            <span>
              {isCourse ? 'Zapsat se do vybraného kurzu' : 'Aktivovat balíček Premium'}
            </span>
          </Button>

          <p className="text-[11px] text-gray-400 text-center font-medium">
            V testovací verzi dojde k okamžité bezplatné aktivaci pro tvůj účet.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
