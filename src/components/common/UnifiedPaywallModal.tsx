import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import {
  CapIcon,
  StarPinkIcon,
  StarYellowIcon,
  CorrectCyanIcon,
} from './CustomIcon';
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
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg rounded-[2rem] sm:rounded-[2.5rem] p-4 sm:p-8 bg-white text-[#1E1B18] shadow-2xl space-y-3.5 sm:space-y-6 max-h-[92vh] overflow-y-auto relative overflow-hidden border border-gray-100"
      >
        {/* Stylizovaný křížek v pravém horním rohu */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Zavřít okno"
          title="Zavřít"
          className="absolute top-3.5 right-3.5 sm:top-6 sm:right-6 z-30 w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[#FAF6EE] hover:bg-[#1E1B18] text-[#1E1B18] hover:text-white border border-gray-200/80 hover:border-[#1E1B18] shadow-xs flex items-center justify-center transition-all cursor-pointer active:scale-95"
        >
          <X size={18} strokeWidth={2.5} />
        </button>

        {/* Jemné dekorativní podsvícení v barvách aplikace */}
        <div className={`absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl pointer-events-none ${
          isCourse ? 'bg-[#2B44B8]/10' : 'bg-[#F5C400]/20'
        }`} />
        <div className="absolute -bottom-20 -left-20 w-56 h-56 bg-[#FAF6EE] rounded-full blur-2xl pointer-events-none" />

        {/* Header Icon + Title */}
        <div className="text-center space-y-1 sm:space-y-2.5 pt-0.5 sm:pt-1 relative z-10">
          <div className={`hidden sm:flex w-16 h-16 mx-auto rounded-3xl items-center justify-center shadow-md border ${
            isCourse 
              ? 'bg-[#2B44B8] text-white border-[#1e339a]' 
              : 'bg-[#F5C400] text-[#1E1B18] border-[#C29B00]/30'
          }`}>
            {isCourse ? (
              <CapIcon className="w-9 h-9" />
            ) : (
              <StarPinkIcon className="w-9 h-9" />
            )}
          </div>

          <span className={`hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1 text-[11px] font-black uppercase tracking-widest rounded-full border ${
            isCourse 
              ? 'bg-blue-50 text-[#2B44B8] border-blue-200/60' 
              : 'bg-amber-50 text-amber-900 border-amber-200/80'
          }`}>
            {isCourse ? <StarYellowIcon size={13} /> : <StarPinkIcon size={13} />}
            {isCourse ? 'ProEdu Kurzy' : 'ProEdu Premium'}
          </span>

          <DialogTitle className="text-xl sm:text-3xl font-playful font-black text-[#1E1B18] tracking-tight px-8 sm:px-0">
            {title || (isCourse ? 'Výběr z aktuální nabídky kurzů' : 'Získej ProEdu Premium')}
          </DialogTitle>

          <DialogDescription className="hidden sm:block text-sm text-gray-500 font-medium leading-relaxed max-w-md mx-auto">
            {description || (isCourse 
              ? 'Připrav se na přijímací zkoušky s certifikovaným lektorem v živých online lekcích a s kompletními materiály.' 
              : 'Kompletní příprava na přijímací zkoušky na střední školy – všechny materiály, teorie krok za krokem a neomezené procvičování bez reklam.')}
          </DialogDescription>
        </div>

        {/* Dynamic Selector: Course list vs Premium plans */}
        {isCourse ? (
          /* Výběr kurzů z aktuální nabídky */
          <div className="space-y-2.5 sm:space-y-3 relative z-10">
            <label className="text-xs font-black uppercase tracking-wider text-gray-500 block px-1">
              Vyber si svůj kurz z nabídky:
            </label>
            <div className="space-y-2 sm:space-y-2.5 max-h-52 sm:max-h-56 overflow-y-auto pr-1 custom-scrollbar">
              {availableCourses.map(course => {
                const isSelected = selectedCourseId === course.id;
                return (
                  <div
                    key={course.id}
                    onClick={() => setSelectedCourseId(course.id)}
                    className={`p-3 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer text-left flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'border-[#2B44B8] bg-blue-50/50 shadow-sm'
                        : 'border-gray-200/80 bg-[#FAF6EE]/60 hover:border-gray-300 hover:bg-[#FAF6EE]'
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          isSelected ? 'bg-[#2B44B8] text-white' : 'bg-white text-gray-700 border border-gray-200'
                        }`}>
                          {course.badge}
                        </span>
                        <h4 className="font-bold text-sm text-[#1E1B18] leading-tight">
                          {course.title}
                        </h4>
                      </div>
                      <p className="hidden sm:block text-xs text-gray-500 line-clamp-2 leading-relaxed font-medium">
                        {course.description}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-[#B80053]">
                        {course.price}
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 mt-2 ml-auto flex items-center justify-center transition-colors ${
                        isSelected ? 'border-[#2B44B8] bg-[#2B44B8] text-white' : 'border-gray-300 bg-white'
                      }`}>
                        {isSelected && <CorrectCyanIcon size={16} />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Cenové karty pro Premium: Roční se slevou 20 % vs Měsíční */
          <div className="grid sm:grid-cols-2 gap-2.5 sm:gap-3 relative z-10">
            <div 
              onClick={() => setSelectedPlan('year')}
              className={`p-3 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer text-left relative space-y-0.5 sm:space-y-1 ${
                selectedPlan === 'year'
                  ? 'border-[#F5C400] bg-amber-50/70 shadow-sm ring-1 ring-[#F5C400]/50'
                  : 'border-gray-200/80 bg-[#FAF6EE]/60 hover:border-gray-300 hover:bg-[#FAF6EE]'
              }`}
            >
              <span className="text-[10px] font-black uppercase tracking-wider text-[#1E1B18] bg-[#F5C400] px-2 py-0.5 rounded-md inline-block">
                Zvýhodněno o 20 %
              </span>
              <div className="text-lg sm:text-xl font-sans font-black text-[#1E1B18] mt-0.5 sm:mt-1">
                1 890 Kč <span className="text-xs font-semibold text-gray-500">/ rok</span>
              </div>
              <div className="text-xs font-black text-amber-800">jen 157 Kč / měsíc</div>
              <p className="hidden sm:block text-[11px] text-gray-500 font-medium leading-snug">Plný přístup na 365 dní pro celou přípravu</p>
            </div>

            <div 
              onClick={() => setSelectedPlan('month')}
              className={`p-3 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer text-left relative space-y-0.5 sm:space-y-1 ${
                selectedPlan === 'month'
                  ? 'border-[#F5C400] bg-amber-50/70 shadow-sm ring-1 ring-[#F5C400]/50'
                  : 'border-gray-200/80 bg-[#FAF6EE]/60 hover:border-gray-300 hover:bg-[#FAF6EE]'
              }`}
            >
              <span className="text-[10px] font-black uppercase tracking-wider text-gray-700 bg-white border border-gray-200 px-2 py-0.5 rounded-md inline-block">
                Měsíčně
              </span>
              <div className="text-lg sm:text-xl font-sans font-black text-[#1E1B18] mt-0.5 sm:mt-1">
                199 Kč <span className="text-xs font-semibold text-gray-500">/ měsíc</span>
              </div>
              <div className="text-xs font-bold text-gray-700">Flexibilní předplatné</div>
              <p className="hidden sm:block text-[11px] text-gray-500 font-medium leading-snug">Předplatné lze kdykoliv jednoduše zrušit</p>
            </div>
          </div>
        )}

        {/* Co balíček obsahuje (Feature checklist) */}
        <div className="space-y-2 sm:space-y-2.5 text-[11px] sm:text-xs bg-[#FAF6EE] p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl border border-gray-200/70 relative z-10">
          {isCourse ? (
            <>
              <div className="flex items-center gap-2.5 font-bold text-[#1E1B18]">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                  <CorrectCyanIcon size={16} />
                </div>
                <span>Živé online lekce přes Google Meet s certifikovaným lektorem</span>
              </div>
              <div className="flex items-center gap-2.5 font-bold text-[#1E1B18]">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                  <CorrectCyanIcon size={16} />
                </div>
                <span>Neomezený přístup k videozáznamům všech proběhlých hodin</span>
              </div>
              <div className="flex items-center gap-2.5 font-bold text-[#1E1B18]">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                  <CorrectCyanIcon size={16} />
                </div>
                <span>Pracovní sešity a studijní materiály ke kurzu ke stažení</span>
              </div>
              <div className="flex items-center gap-2.5 font-bold text-[#1E1B18]">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                  <CorrectCyanIcon size={16} />
                </div>
                <span>Kompletní balíček ProEdu Premium (všechny materiály i procvičování) v ceně</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2.5 font-bold text-[#1E1B18]">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                  <CorrectCyanIcon size={16} />
                </div>
                <span>Všechny výukové a grafické listy (Materiály) bez omezení</span>
              </div>
              <div className="flex items-center gap-2.5 font-bold text-[#1E1B18]">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                  <CorrectCyanIcon size={16} />
                </div>
                <span>Kompletní teorie a vzorové postupy krok za krokem (Studium)</span>
              </div>
              <div className="flex items-center gap-2.5 font-bold text-[#1E1B18]">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                  <CorrectCyanIcon size={16} />
                </div>
                <span>Neomezené procvičování – žádné čekání na žolíky</span>
              </div>
              <div className="flex items-center gap-2.5 font-bold text-[#1E1B18]">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                  <CorrectCyanIcon size={16} />
                </div>
                <span>100% bez reklam a bez video pauz</span>
              </div>
              <div className="flex items-center gap-2.5 font-bold text-[#1E1B18]">
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0">
                  <CorrectCyanIcon size={16} />
                </div>
                <span>Možnost pokládat dotazy lektorům přímo u testových úloh</span>
              </div>
            </>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-1 relative z-10">
          <Button
            onClick={handleActivate}
            disabled={isActivating}
            className="w-full h-13 bg-[#F5C400] hover:bg-[#EAB308] text-[#1E1B18] font-black rounded-2xl shadow-md border-b-4 border-[#C29B00] active:border-b-0 active:translate-y-[2px] cursor-pointer flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
          >
            {isCourse ? (
              <CapIcon size={20} />
            ) : (
              <StarPinkIcon size={20} />
            )}
            <span>
              {isCourse ? 'Zapsat se do vybraného kurzu' : 'Aktivovat balíček Premium'}
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
