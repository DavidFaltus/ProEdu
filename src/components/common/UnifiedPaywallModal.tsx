import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, Check, Copy, CreditCard, QrCode, ShieldCheck, CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import {
  CapIcon,
  StarPinkIcon,
  StarYellowIcon,
  CorrectCyanIcon,
} from './CustomIcon';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { db } from '../../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { trackPaywallImpression, trackPaywallCtaClick } from '../../services/analyticsService';
import { createOrder, simulateComgatePayment, CreateOrderResult } from '../../services/orderService';
import { Link } from 'react-router-dom';

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

type ModalStep = 'plan_overview' | 'order_form' | 'order_result';

export default function UnifiedPaywallModal({
  isOpen,
  onClose,
  type,
  title,
  description,
  onSuccess
}: UnifiedPaywallModalProps) {
  const { user, profile, updateProfileData, openAuthModal } = useAuth();
  const [currentStep, setCurrentStep] = useState<ModalStep>('plan_overview');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('course-combo');
  const [availableCourses, setAvailableCourses] = useState<CourseOption[]>(DEFAULT_COURSES);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);

  // Formulářové stavy
  const [clientName, setClientName] = useState('');
  const [invoiceEmail, setInvoiceEmail] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'qr_bank_transfer' | 'comgate'>('qr_bank_transfer');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [newsletterConsent, setNewsletterConsent] = useState(false);

  // Výsledek po odeslání objednávky
  const [orderResult, setOrderResult] = useState<CreateOrderResult | null>(null);

  // Reset při otevření
  useEffect(() => {
    if (isOpen) {
      setCurrentStep('plan_overview');
      setOrderResult(null);
      if (profile?.name) setClientName(profile.name);
      if (user?.email) setInvoiceEmail(user.email);
    }
  }, [isOpen, profile?.name, user?.email]);

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

  const handleGoToOrderForm = () => {
    if (!user) {
      onClose();
      openAuthModal();
      toast.info('Pro objednání předplatného se prosím nejdříve přihlas.');
      return;
    }
    setClientName(profile?.name || '');
    setInvoiceEmail(user?.email || '');
    setCurrentStep('order_form');
  };

  const handleCourseActivate = async () => {
    trackPaywallCtaClick('activate', selectedCourseId);
    if (!user) {
      onClose();
      openAuthModal();
      toast.info('Pro zapsání do kurzu se prosím nejdříve přihlas.');
      return;
    }

    setIsSubmitting(true);
    try {
      const selected = availableCourses.find(c => c.id === selectedCourseId) || availableCourses[0];
      await updateProfileData({ role: 'course' });
      toast.success(`🎉 Gratulujeme! Byl jsi úspěšně zapsán do kurzu "${selected.title}".`);
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error('Chyba při zápisu: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      onClose();
      openAuthModal();
      return;
    }

    if (!clientName.trim() || clientName.trim().length < 2) {
      toast.error('Vyplňte prosím celé jméno a příjmení.');
      return;
    }

    if (!invoiceEmail.trim() || !invoiceEmail.includes('@')) {
      toast.error('Zadejte prosím platný e-mail pro zaslání faktury.');
      return;
    }

    if (!street.trim() || !city.trim() || !zip.trim()) {
      toast.error('Vyplňte prosím celou fakturační adresu (ulici, město i PSČ).');
      return;
    }

    if (!termsAccepted) {
      toast.error('Pro odeslání objednávky musíte souhlasit s obchodními podmínkami.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createOrder({
        clientName: clientName.trim(),
        billingAddress: {
          street: street.trim(),
          city: city.trim(),
          zip: zip.trim(),
          country: 'Česká republika'
        },
        invoiceEmail: invoiceEmail.trim(),
        paymentMethod,
        termsAccepted,
        newsletterConsent,
        planId: 'premium-monthly',
        amount: 99
      });

      setOrderResult(result);
      setCurrentStep('order_result');
      toast.success('Objednávka byla úspěšně vytvořena!');

      // Pokud Comgate vrátila přímou URL v živém režimu, přesměrovat
      if (paymentMethod === 'comgate' && result.comgate?.redirectUrl && result.comgate.isLive) {
        window.location.href = result.comgate.redirectUrl;
      }
    } catch (err: any) {
      console.error('Chyba při odesílání objednávky:', err);
      toast.error(err.message || 'Nepodařilo se vytvořit objednávku.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} bylo zkopírováno do schránky.`);
  };

  const handleSandboxSimulate = async () => {
    if (!orderResult?.orderId) return;
    setIsSimulatingPayment(true);
    try {
      const res = await simulateComgatePayment(orderResult.orderId);
      toast.success(res.message);
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSimulatingPayment(false);
    }
  };

  const isCourse = type === 'course';

  return (
    <Dialog open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="w-[94vw] sm:max-w-none md:w-[75vw] lg:w-[68vw] max-w-5xl rounded-[2.5rem] p-6 sm:p-8 md:p-10 lg:p-12 bg-white text-[#1E1B18] shadow-2xl relative border border-gray-100 overflow-hidden"
      >
        {/* Tlačítko Zpět (plovoucí vlevo nahoře) */}
        {currentStep !== 'plan_overview' && !isCourse && (
          <button
            type="button"
            onClick={() => {
              if (currentStep === 'order_result') setCurrentStep('order_form');
              else setCurrentStep('plan_overview');
            }}
            className="absolute top-4 left-4 sm:top-6 sm:left-7 z-30 px-3.5 py-1.5 rounded-xl bg-[#FAF6EE] hover:bg-gray-200 text-[#1E1B18] transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold border border-gray-200/80 shadow-2xs"
          >
            <ArrowLeft size={16} />
            <span>Zpět</span>
          </button>
        )}

        {/* Tlačítko Zavřít (plovoucí vpravo nahoře) */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Zavřít okno"
          title="Zavřít"
          className="absolute top-4 right-4 sm:top-6 sm:right-7 z-30 w-9 h-9 rounded-xl bg-[#FAF6EE] hover:bg-[#1E1B18] text-[#1E1B18] hover:text-white border border-gray-200/80 shadow-xs flex items-center justify-center transition-all cursor-pointer active:scale-95"
        >
          <X size={18} strokeWidth={2.5} />
        </button>

        {/* Jemné dekorativní podsvícení */}
        <div className={`absolute -top-20 -right-20 w-80 h-80 rounded-full blur-3xl pointer-events-none ${
          isCourse ? 'bg-[#2B44B8]/10' : 'bg-[#B9D8FC]/30'
        }`} />
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-[#FAF6EE] rounded-full blur-2xl pointer-events-none" />

        {/* ========================================================== */}
        {/* KROK 1: PŘEHLED NABÍDKY & VÝBĚR (PLAN OVERVIEW)           */}
        {/* ========================================================== */}
        {currentStep === 'plan_overview' && (
          <div className="space-y-5 relative z-10">
            {/* Čistá hlavička: Pouze nadpis s hvězdičkou za ním */}
            <div className="text-center space-y-1">
              <DialogTitle className="text-3xl sm:text-4xl font-playful text-[#1E1B18] tracking-tight flex items-center justify-center gap-2.5">
                <span>{title || (isCourse ? 'Výběr z aktuální nabídky kurzů' : 'Získej ProEdu Premium')}</span>
                {!isCourse && <StarYellowIcon size={26} className="shrink-0" />}
              </DialogTitle>

              <DialogDescription className="text-xs sm:text-sm text-gray-500 font-medium leading-relaxed max-w-xl mx-auto">
                {description || (isCourse 
                  ? 'Připrav se na přijímací zkoušky s certifikovaným lektorem v živých online lekcích a s kompletními materiály.' 
                  : 'Kompletní příprava na přijímací zkoušky na střední školy – všechny materiály, teorie krok za krokem a neomezené procvičování bez reklam.')}
              </DialogDescription>
            </div>

            {/* Dvousloupcové tělo na desktopu */}
            {isCourse ? (
              <div className="grid md:grid-cols-3 gap-4 my-auto">
                {availableCourses.map(course => {
                  const isSelected = selectedCourseId === course.id;
                  return (
                    <div
                      key={course.id}
                      onClick={() => setSelectedCourseId(course.id)}
                      className={`p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer text-left flex flex-col justify-between gap-3 ${
                        isSelected
                          ? 'border-[#2B44B8] bg-blue-50/50 shadow-md scale-[1.01]'
                          : 'border-gray-200/80 bg-[#FAF6EE]/60 hover:border-gray-300'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-md ${
                            isSelected ? 'bg-[#2B44B8] text-white' : 'bg-white text-gray-700 border border-gray-200'
                          }`}>
                            {course.badge}
                          </span>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            isSelected ? 'border-[#2B44B8] bg-[#2B44B8] text-white' : 'border-gray-300 bg-white'
                          }`}>
                            {isSelected && <CorrectCyanIcon size={14} />}
                          </div>
                        </div>
                        <h4 className="font-bold text-sm sm:text-base text-[#1E1B18] leading-tight">
                          {course.title}
                        </h4>
                        <p className="text-xs sm:text-sm text-gray-500 line-clamp-3 leading-relaxed font-medium">
                          {course.description}
                        </p>
                      </div>
                      <div className="pt-2.5 border-t border-gray-200/60 flex items-center justify-between">
                        <span className="text-xs text-gray-500 font-medium">Cena kurzu</span>
                        <span className="text-sm font-black text-[#B80053]">{course.price}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid md:grid-cols-12 gap-4 items-stretch">
                {/* Levá karta s cenou a flexibilitou */}
                <div className="md:col-span-5 p-4 sm:p-5 rounded-3xl border-2 border-[#B9D8FC] bg-gradient-to-br from-blue-50/80 via-sky-50/50 to-blue-50/80 flex flex-col justify-between text-center relative shadow-sm">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#0F2942] bg-[#B9D8FC] px-3 py-0.5 rounded-full inline-block mb-1.5 border border-blue-200/70">
                      Aktuální akční nabídka
                    </span>
                    <div className="text-4xl sm:text-5xl font-display font-black text-[#0F2942]">
                      99 Kč
                    </div>
                    <div className="text-xs font-bold text-gray-600 mt-0.5">/ měsíc</div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-blue-200/60 text-xs text-gray-600 font-medium space-y-0.5">
                    <p className="font-bold text-gray-800">Flexibilní předplatné</p>
                    <p className="text-[11px] leading-tight">Platba QR kódem nebo kartou online. Kdykoliv můžete jednoduše zrušit.</p>
                  </div>
                </div>

                {/* Pravý checklist výhod v 2-sloupcovém gridu */}
                <div className="md:col-span-7 bg-[#FAF6EE] p-4 sm:p-5 rounded-3xl border border-gray-200/70 flex flex-col justify-center space-y-2.5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-600">
                    Co všechno s balíčkem Premium získáš:
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm">
                    <div className="flex items-center gap-2.5 font-bold text-[#1E1B18] p-2.5 rounded-xl bg-white/70 border border-gray-100">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <Check size={13} strokeWidth={3} />
                      </div>
                      <span>Všechny materiály a listy bez omezení</span>
                    </div>
                    <div className="flex items-center gap-2.5 font-bold text-[#1E1B18] p-2.5 rounded-xl bg-white/70 border border-gray-100">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <Check size={13} strokeWidth={3} />
                      </div>
                      <span>Kompletní teorie a vzorové postupy</span>
                    </div>
                    <div className="flex items-center gap-2.5 font-bold text-[#1E1B18] p-2.5 rounded-xl bg-white/70 border border-gray-100">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <Check size={13} strokeWidth={3} />
                      </div>
                      <span>Neomezené procvičování bez čekání</span>
                    </div>
                    <div className="flex items-center gap-2.5 font-bold text-[#1E1B18] p-2.5 rounded-xl bg-white/70 border border-gray-100">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <Check size={13} strokeWidth={3} />
                      </div>
                      <span>100% bez reklam a bez video pauz</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Hlavní tlačítko přechodu k objednávce */}
            <Button
              onClick={isCourse ? handleCourseActivate : handleGoToOrderForm}
              disabled={isSubmitting}
              className="w-full h-12 sm:h-13 bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black rounded-2xl shadow-sm border border-blue-200/80 cursor-pointer flex items-center justify-center gap-2 transition-all text-sm sm:text-base mt-2"
            >
              {isCourse ? (
                <>
                  <CapIcon size={20} />
                  <span>Zapsat se do vybraného kurzu</span>
                </>
              ) : (
                <>
                  <CreditCard size={20} />
                  <span>Přejít k objednávce za 99 Kč</span>
                </>
              )}
            </Button>
          </div>
        )}

        {/* ========================================================== */}
        {/* KROK 2: OBJEDNÁVKOVÝ FORMULÁŘ (PŘEHLEDNÝ 2-SLOUPEČEK)       */}
        {/* ========================================================== */}
        {currentStep === 'order_form' && (
          <form onSubmit={handleOrderSubmit} className="flex-1 flex flex-col justify-between space-y-4 relative z-10 pt-2 sm:pt-0">
            <div className="text-center space-y-1">
              <DialogTitle className="text-2xl sm:text-3xl md:text-4xl font-playful text-[#1E1B18] flex items-center justify-center gap-2.5">
                <span>Fakturační a platební údaje</span>
                <StarYellowIcon size={22} className="shrink-0" />
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-gray-500">
                Předplatné ProEdu Premium • 99 Kč / měsíc
              </DialogDescription>
            </div>

            <div className="grid md:grid-cols-12 gap-5 items-stretch my-auto">
              {/* Levý sloupec (Desktop summary) */}
              <div className="md:col-span-4 bg-[#FAF6EE] p-4 sm:p-5 rounded-3xl border border-gray-200/80 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-white border border-gray-200 shadow-2xs">
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-900 bg-blue-50 px-2.5 py-0.5 rounded">
                      Objednávka
                    </span>
                    <div className="flex items-baseline justify-between mt-1.5">
                      <h4 className="font-bold text-sm sm:text-base text-gray-900">ProEdu Premium</h4>
                      <span className="text-xl sm:text-2xl font-black text-[#B80053]">99 Kč</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">Měsíční předplatné, bez vázanosti</p>
                  </div>

                  <div className="space-y-2 text-xs sm:text-sm text-gray-700">
                    <div className="flex items-center gap-2.5 font-semibold">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>Okamžitý přístup k materiálům a testům</span>
                    </div>
                    <div className="flex items-center gap-2.5 font-semibold">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>Faktura automaticky do e-mailu</span>
                    </div>
                    <div className="flex items-center gap-2.5 font-semibold">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>Podpora lektorů ProEdu</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-gray-200/70 text-xs text-gray-500 flex items-center gap-1.5">
                  <Lock size={14} className="text-gray-400 shrink-0" />
                  <span>Zabezpečené zpracování údajů</span>
                </div>
              </div>

              {/* Pravý sloupec (Formulářová pole) */}
              <div className="md:col-span-8 space-y-3">
                {/* 1. Řádek: Jméno a E-mail */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs sm:text-sm font-bold text-gray-700">Jméno a příjmení *</Label>
                    <Input
                      required
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                      placeholder="Jan Novák"
                      className="h-10 text-xs sm:text-sm rounded-xl border-gray-200 bg-[#FAF6EE]/50 font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs sm:text-sm font-bold text-gray-700">E-mail pro fakturu *</Label>
                    <Input
                      type="email"
                      required
                      value={invoiceEmail}
                      onChange={e => setInvoiceEmail(e.target.value)}
                      placeholder="faktura@email.cz"
                      className="h-10 text-xs sm:text-sm rounded-xl border-gray-200 bg-[#FAF6EE]/50 font-bold"
                    />
                  </div>
                </div>

                {/* 2. Řádek: Fakturační adresa */}
                <div className="space-y-1">
                  <Label className="text-xs sm:text-sm font-bold text-gray-700">Fakturační adresa *</Label>
                  <div className="grid grid-cols-12 gap-2.5">
                    <div className="col-span-12 sm:col-span-6">
                      <Input
                        required
                        value={street}
                        onChange={e => setStreet(e.target.value)}
                        placeholder="Ulice a č.p. (např. Školní 42)"
                        className="h-10 text-xs sm:text-sm rounded-xl border-gray-200 bg-[#FAF6EE]/50"
                      />
                    </div>
                    <div className="col-span-7 sm:col-span-3">
                      <Input
                        required
                        value={city}
                        onChange={e => setCity(e.target.value)}
                        placeholder="Město"
                        className="h-10 text-xs sm:text-sm rounded-xl border-gray-200 bg-[#FAF6EE]/50"
                      />
                    </div>
                    <div className="col-span-5 sm:col-span-3">
                      <Input
                        required
                        value={zip}
                        onChange={e => setZip(e.target.value)}
                        placeholder="PSČ"
                        className="h-10 text-xs sm:text-sm rounded-xl border-gray-200 bg-[#FAF6EE]/50"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Řádek: Volba způsobu platby */}
                <div className="space-y-1">
                  <Label className="text-xs sm:text-sm font-bold text-gray-700">Způsob platby *</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('qr_bank_transfer')}
                      className={`h-10 px-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-center gap-2 ${
                        paymentMethod === 'qr_bank_transfer'
                          ? 'border-[#2B44B8] bg-blue-50 text-[#0F2942] font-black shadow-xs'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 font-bold'
                      }`}
                    >
                      <QrCode size={17} />
                      <span className="text-xs sm:text-sm">QR kód</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('comgate')}
                      className={`h-10 px-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-center gap-2 ${
                        paymentMethod === 'comgate'
                          ? 'border-[#2B44B8] bg-blue-50 text-[#0F2942] font-black shadow-xs'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 font-bold'
                      }`}
                    >
                      <CreditCard size={17} />
                      <span className="text-xs sm:text-sm">Kartou online</span>
                    </button>
                  </div>
                </div>

                {/* 4. Řádek: Souhlasy */}
                <div className="space-y-1.5 pt-0.5 text-xs sm:text-sm">
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      required
                      checked={termsAccepted}
                      onChange={e => setTermsAccepted(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-gray-600 text-xs leading-normal">
                      Souhlasím s{' '}
                      <Link to="/terms" target="_blank" className="text-blue-700 underline font-bold">
                        obchodními podmínkami
                      </Link>{' '}
                      a se{' '}
                      <Link to="/privacy" target="_blank" className="text-blue-700 underline font-bold">
                        zpracováním osobních údajů
                      </Link>{' '}
                      *
                    </span>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newsletterConsent}
                      onChange={e => setNewsletterConsent(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-gray-500 text-xs leading-normal">
                      Mám zájem o odběr novinek a tipů k přijímačkám (newsletter).
                    </span>
                  </label>
                </div>

                {/* 5. Řádek: Tlačítko */}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-11 sm:h-12 bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black rounded-xl shadow-sm border border-blue-200/80 cursor-pointer flex items-center justify-center gap-2 transition-all text-xs sm:text-sm mt-1"
                >
                  {isSubmitting ? 'Zpracovávám objednávku...' : 'Dokončit objednávku a zaplatit 99 Kč'}
                </Button>
              </div>
            </div>
          </form>
        )}

        {/* ========================================================== */}
        {/* KROK 3: VÝSLEDEK OBJEDNÁVKY / DUMMY OKNA                   */}
        {/* ========================================================== */}
        {currentStep === 'order_result' && orderResult && (
          <div className="flex-1 flex flex-col justify-between space-y-4 relative z-10 pt-2 sm:pt-0">
            {orderResult.order.paymentMethod === 'qr_bank_transfer' ? (
              /* Zobrazení QR kódu a platebních instrukcí */
              <div className="space-y-4 my-auto">
                <div className="text-center space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs sm:text-sm font-bold">
                    <CheckCircle2 size={16} />
                    <span>Objednávka č. {orderResult.order.variableSymbol} vytvořena</span>
                  </div>
                  <DialogTitle className="text-3xl sm:text-4xl font-playful text-[#1E1B18] tracking-tight">
                    Platba přes QR kód
                  </DialogTitle>
                </div>

                <div className="grid md:grid-cols-12 gap-5 items-center">
                  {/* QR Kód vlevo */}
                  {orderResult.bankDetails?.qrImageUrl && (
                    <div className="md:col-span-5 flex flex-col items-center justify-center p-4 bg-white rounded-3xl border-2 border-gray-200 shadow-sm">
                      <img
                        src={orderResult.bankDetails.qrImageUrl}
                        alt="Platební QR kód SPAYD"
                        className="w-48 h-48 object-contain"
                      />
                      <p className="text-xs text-gray-500 font-bold mt-2 uppercase tracking-wider text-center">
                        Naskenujte v mobilním bankovnictví
                      </p>
                    </div>
                  )}

                  {/* Platební údaje vpravo */}
                  <div className="md:col-span-7 space-y-3">
                    <div className="bg-[#FAF6EE] p-4 rounded-3xl border border-gray-200 text-left text-xs sm:text-sm space-y-2.5">
                      <div className="grid sm:grid-cols-2 gap-2.5">
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-gray-100">
                          <span className="text-gray-500 font-medium">Číslo účtu:</span>
                          <div className="flex items-center gap-1 font-mono font-bold text-gray-900 text-xs sm:text-sm">
                            <span>{orderResult.bankDetails?.accountNumber} / {orderResult.bankDetails?.bankCode}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(`${orderResult.bankDetails?.accountNumber}/${orderResult.bankDetails?.bankCode}`, 'Číslo účtu')}
                              className="p-1 hover:bg-gray-200 rounded text-gray-500 cursor-pointer"
                              title="Zkopírovat"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-gray-100">
                          <span className="text-gray-500 font-medium">Částka k úhradě:</span>
                          <span className="font-black text-[#B80053] text-sm sm:text-base">99 Kč</span>
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-2.5">
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-gray-100">
                          <span className="text-gray-500 font-medium">Variabilní symbol:</span>
                          <div className="flex items-center gap-1 font-mono font-bold text-gray-900 text-xs sm:text-sm">
                            <span>{orderResult.bankDetails?.variableSymbol}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(orderResult.bankDetails?.variableSymbol || '', 'Variabilní symbol')}
                              className="p-1 hover:bg-gray-200 rounded text-gray-500 cursor-pointer"
                              title="Zkopírovat"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-gray-100">
                          <span className="text-gray-500 font-medium">Zpráva:</span>
                          <div className="flex items-center gap-1 font-mono font-semibold text-gray-800 text-xs truncate max-w-[170px]">
                            <span className="truncate">{orderResult.bankDetails?.message}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(orderResult.bankDetails?.message || '', 'Zpráva pro příjemce')}
                              className="p-1 hover:bg-gray-200 rounded text-gray-500 shrink-0 cursor-pointer"
                              title="Zkopírovat"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs text-left flex items-start gap-2.5">
                      <AlertCircle size={17} className="shrink-0 mt-0.5" />
                      <span>
                        Aktivace proběhne po připsání platby na účet. Faktura bude zaslána na <strong>{orderResult.order.invoiceEmail}</strong>.
                      </span>
                    </div>

                    <Button
                      onClick={onClose}
                      className="w-full h-11 bg-[#FAF6EE] hover:bg-gray-200 text-gray-800 font-bold rounded-xl border border-gray-300 text-xs sm:text-sm cursor-pointer"
                    >
                      Hotovo, rozumím
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* Comgate dummy okno */
              <div className="max-w-2xl mx-auto space-y-4 py-2 text-center my-auto">
                <div className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-blue-50 text-blue-900 border border-blue-200 rounded-full text-xs font-bold">
                  <CreditCard size={15} />
                  <span>Comgate platební brána</span>
                </div>

                <DialogTitle className="text-3xl sm:text-4xl font-playful text-[#1E1B18] tracking-tight">
                  Platba kartou online
                </DialogTitle>

                {/* Dummy Comgate info box */}
                <div className="bg-[#FAF6EE] p-5 rounded-3xl border border-gray-200 text-left space-y-3">
                  <div className="flex items-center justify-between pb-2.5 border-b border-gray-200">
                    <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Stav transakce</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase bg-blue-100 text-blue-900">
                      Sandbox testovací režim
                    </span>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3 py-1">
                    <div className="bg-white p-3 rounded-xl border border-gray-100 text-xs">
                      <div className="text-gray-500 text-[11px]">Objednávka</div>
                      <div className="font-mono font-bold text-gray-800 mt-1 text-sm">VS: {orderResult.order.variableSymbol}</div>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-gray-100 text-xs">
                      <div className="text-gray-500 text-[11px]">Částka k úhradě</div>
                      <div className="font-black text-emerald-700 text-base mt-1">99,00 Kč</div>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-gray-100 text-xs">
                      <div className="text-gray-500 text-[11px]">Klient</div>
                      <div className="font-bold text-gray-800 truncate mt-1 text-xs" title={orderResult.order.invoiceEmail}>
                        {orderResult.order.invoiceEmail}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 leading-relaxed">
                    V testovacím režimu můžete kliknutím níže otestovat okamžité schválení platby platební brány.
                  </div>
                </div>

                {/* Tlačítka */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={handleSandboxSimulate}
                    disabled={isSimulatingPayment}
                    className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.01]"
                  >
                    <Check size={18} />
                    <span>{isSimulatingPayment ? 'Zpracovávám platbu...' : 'Otestovat schválení platby Comgate'}</span>
                  </Button>

                  <Button
                    onClick={onClose}
                    variant="outline"
                    className="sm:w-32 h-12 border-gray-200 text-gray-700 font-semibold text-xs sm:text-sm rounded-xl cursor-pointer"
                  >
                    Zavřít
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
