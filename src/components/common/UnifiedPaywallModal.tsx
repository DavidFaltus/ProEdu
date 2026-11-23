import React, { useState, useEffect } from 'react';
import { X, ArrowLeft, Check, Copy, ShieldCheck, CheckCircle2, AlertCircle, Lock, XCircle } from 'lucide-react';
import {
  CapIcon,
  StarPinkIcon,
  StarYellowIcon,
  CorrectCyanIcon,
  PaymentPinkIcon,
  CardGrayIcon,
} from './CustomIcon';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'sonner';
import { db } from '../../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import {
  trackPaywallImpression,
  trackPaywallCtaClick,
  trackBeginCheckout,
  trackCheckoutCancelled,
  startPerfTrace
} from '../../services/analyticsService';
import {
  createOrder,
  simulateComgatePayment,
  buildOrderResultFromOrder,
  saveBillingAndPaymentSettings,
  getMyOrders,
  cancelPendingOrder,
  CreateOrderResult
} from '../../services/orderService';
import { Order } from '../../types';
import { Link, useNavigate } from 'react-router-dom';
import { PaymentLogosBar } from './PaymentLogos';
import { sanitizeSafeUrl } from '../../utils/svgUtils';

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
  initialOrder?: Order | null;
  defaultCourseId?: string;
}

type ModalStep = 'plan_overview' | 'order_form' | 'order_result';

export default function UnifiedPaywallModal({
  isOpen,
  onClose,
  type,
  title,
  description,
  onSuccess,
  initialOrder,
  defaultCourseId
}: UnifiedPaywallModalProps) {
  const navigate = useNavigate();
  const { user, profile, openAuthModal, refreshProfile } = useAuth();
  const [currentStep, setCurrentStep] = useState<ModalStep>('plan_overview');
  const [selectedCourseId, setSelectedCourseId] = useState<string>(defaultCourseId || 'course-combo');
  const [availableCourses, setAvailableCourses] = useState<CourseOption[]>(DEFAULT_COURSES);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSimulatingPayment, setIsSimulatingPayment] = useState(false);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);
  const [isCheckingExistingPending, setIsCheckingExistingPending] = useState(false);

  // Formulářové stavy
  const [clientName, setClientName] = useState('');
  const [invoiceEmail, setInvoiceEmail] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [isCompanyPurchase, setIsCompanyPurchase] = useState(false);
  const [ico, setIco] = useState('');
  const [dic, setDic] = useState('');
  const [paymentMethod] = useState<'comgate'>('comgate');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [newsletterConsent, setNewsletterConsent] = useState(false);
  const [recurringConsent, setRecurringConsent] = useState(true);

  // Výsledek po odeslání objednávky
  const [orderResult, setOrderResult] = useState<CreateOrderResult | null>(null);

  // Reset pouze při otevření modalu (změna isOpen na true nebo předání existující neuhrazené objednávky)
  // DŮLEŽITÉ: Nesmí záviset na profile.billingDetails, jinak uložení fakturačních údajů při odeslání formuláře vyresetuje Krok 3!
  useEffect(() => {
    if (isOpen) {
      if (initialOrder) {
        setOrderResult(buildOrderResultFromOrder(initialOrder));
        setCurrentStep('order_result');
      } else {
        setCurrentStep('plan_overview');
        setOrderResult(null);
        // Pokud je přihlášený uživatel a otevírá paywall pro Premium, zkontrolujeme, zda už nemá živou čekající objednávku
        if (type === 'premium' && user) {
          setIsCheckingExistingPending(true);
          getMyOrders()
            .then((myOrders) => {
              const activePending = myOrders.find((o) => o.status === 'pending' && !(o as any).isRecurringRenewal);
              if (activePending) {
                setOrderResult(buildOrderResultFromOrder(activePending));
                setCurrentStep('order_result');
                toast.info('Máš již vytvořenou neuhrazenou objednávku. Přesměrovali jsme tě k jejímu zaplacení.');
              }
            })
            .catch(() => {})
            .finally(() => setIsCheckingExistingPending(false));
        }
      }
      setClientName(profile?.billingDetails?.clientName || profile?.name || '');
      setInvoiceEmail(profile?.billingDetails?.invoiceEmail || user?.email || '');
      if (profile?.billingDetails?.street) setStreet(profile.billingDetails.street);
      if (profile?.billingDetails?.city) setCity(profile.billingDetails.city);
      if (profile?.billingDetails?.zip) setZip(profile.billingDetails.zip);
      const savedIco = profile?.billingDetails?.ico || '';
      const savedDic = profile?.billingDetails?.dic || '';
      setIco(savedIco);
      setDic(savedDic);
      setIsCompanyPurchase(Boolean(savedIco || savedDic));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialOrder]);

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
    trackPaywallCtaClick('proceed_to_billing', 'premium-monthly');
    if (!user) {
      onClose();
      openAuthModal();
      toast.info('Pro objednání předplatného se prosím nejdříve přihlas.');
      return;
    }
    setClientName(profile?.billingDetails?.clientName || profile?.name || '');
    setInvoiceEmail(profile?.billingDetails?.invoiceEmail || user?.email || '');
    if (profile?.billingDetails?.street) setStreet(profile.billingDetails.street);
    if (profile?.billingDetails?.city) setCity(profile.billingDetails.city);
    if (profile?.billingDetails?.zip) setZip(profile.billingDetails.zip);
    setCurrentStep('order_form');
  };

  useEffect(() => {
    if (defaultCourseId) {
      setSelectedCourseId(defaultCourseId);
    }
  }, [defaultCourseId, isOpen]);

  const handleCourseInquiry = () => {
    trackPaywallCtaClick('course_detail', selectedCourseId);
    onClose();
    if (selectedCourseId) {
      navigate(`/courses/${encodeURIComponent(selectedCourseId)}`);
    } else {
      navigate('/courses');
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

    if (paymentMethod === 'comgate' && !recurringConsent) {
      toast.error('Pro platbu kartou online je vyžadován souhlas se zřízením opakované platby.');
      return;
    }

    setIsSubmitting(true);
    const checkoutTrace = startPerfTrace('comgate_checkout_create', {
      plan_id: 'premium-monthly',
    });
    try {
      const cleanIco = isCompanyPurchase ? ico.trim() : '';
      const cleanDic = isCompanyPurchase ? dic.trim() : '';

      const result = await createOrder({
        clientName: clientName.trim(),
        billingAddress: {
          street: street.trim(),
          city: city.trim(),
          zip: zip.trim(),
          country: 'Česká republika'
        },
        invoiceEmail: invoiceEmail.trim(),
        ico: cleanIco || undefined,
        dic: cleanDic || undefined,
        paymentMethod,
        termsAccepted,
        newsletterConsent,
        planId: 'premium-monthly',
        amount: 99
      });
      checkoutTrace.stop({
        status: 'ok',
        reused_existing: result.reusedExistingOrder ? 'true' : 'false',
      });

      // Okamžitě přepneme modal do Kroku 3
      setOrderResult(result);
      setCurrentStep('order_result');
      const isSandboxOrder = Boolean(
        result.comgate?.isSandbox ||
        String(result.comgate?.transId || '').startsWith('SANDBOX_')
      );
      trackBeginCheckout({
        orderId: result.orderId,
        planId: 'premium-monthly',
        amount: 99,
        currency: 'CZK',
        reusedExisting: Boolean(result.reusedExistingOrder),
        isSandbox: isSandboxOrder
      });
      if (result.reusedExistingOrder) {
        toast.info('Máš již vytvořenou neuhrazenou objednávku v platební lhůtě. Pokračuj prosím k jejímu zaplacení nebo ji níže zruš.');
        return;
      }
      toast.success('Objednávka byla úspěšně vytvořena!');

      // Asynchronně uložíme fakturační údaje přes autorizované serverové API
      saveBillingAndPaymentSettings({
        preferredPaymentMethod: paymentMethod,
        billingDetails: {
          clientName: clientName.trim(),
          invoiceEmail: invoiceEmail.trim(),
          street: street.trim(),
          city: city.trim(),
          zip: zip.trim(),
          country: 'Česká republika',
          ico: cleanIco,
          dic: cleanDic
        }
      })
        .then(() => refreshProfile())
        .catch(profileErr => {
          console.warn('[Billing Profile Sync]:', profileErr);
        });

      // Pokud Comgate vrátila bezpečnou přímou URL (produkční i test=true brána), okamžitě přesměrovat
      const safeRedirectUrl = sanitizeSafeUrl(result.comgate?.redirectUrl);
      if (paymentMethod === 'comgate' && safeRedirectUrl) {
        toast.loading('Přesměrovávám na platební bránu Comgate...');
        window.location.href = safeRedirectUrl;
        return;
      }
    } catch (err: any) {
      checkoutTrace.stop({ status: 'error' });
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

  const handleCancelCurrentOrder = async () => {
    const currentOrderId = orderResult?.orderId || (orderResult?.order as any)?.orderId || orderResult?.order?.id;
    if (!currentOrderId) return;
    setIsCancellingOrder(true);
    try {
      await cancelPendingOrder(currentOrderId);
      trackCheckoutCancelled({ orderId: currentOrderId, source: 'user_manual' });
      toast.success('Čekající objednávka byla zrušena. Nyní můžeš vytvořit novou.');
      setOrderResult(null);
      setCurrentStep('order_form');
      if (onSuccess) onSuccess();
    } catch (err: any) {
      toast.error(err?.message || 'Nepodařilo se zrušit objednávku.');
    } finally {
      setIsCancellingOrder(false);
    }
  };

  const handleSandboxSimulate = async () => {
    if (!import.meta.env.DEV) {
      toast.error('Testovací simulace platby není v tomto prostředí povolena.');
      return;
    }
    if (!orderResult?.orderId) return;
    setIsSimulatingPayment(true);
    try {
      const res = await simulateComgatePayment(orderResult.orderId);
      await refreshProfile();
      toast.success(res.message);
      if (onSuccess) onSuccess();
      onClose();
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
        {/* Tlačítko Zpět (plovoucí vlevo nahoře – pouze na kroku objednávkového formuláře, nikoliv na samotné platbě) */}
        {currentStep === 'order_form' && !isCourse && (
          <button
            type="button"
            onClick={() => setCurrentStep('plan_overview')}
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
                  : 'Staň se jedním z prvních podporovatelů platformy, zafixuj si poloviční cenu 99 Kč/měsíc napořád a získej okamžitý přístup ke všem nástrojům bez limitu žolíků.')}
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
                <div className="md:col-span-4 p-4 sm:p-5 rounded-3xl border-2 border-[#B9D8FC] bg-gradient-to-br from-blue-50/80 via-sky-50/50 to-blue-50/80 flex flex-col justify-between text-center relative shadow-sm">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#0F2942] bg-[#B9D8FC] px-3 py-1 rounded-full inline-block mb-2 border border-blue-200/70 shadow-2xs">
                      Nabídka pro první podporovatele (-50 %)
                    </span>
                    <div className="flex items-center justify-center gap-2 mt-1">
                      <span className="text-base sm:text-lg font-bold text-gray-400 line-through">
                        199 Kč
                      </span>
                      <span className="text-3xl sm:text-4xl lg:text-5xl font-display font-black text-[#0F2942]">
                        99 Kč
                      </span>
                    </div>
                    <div className="text-xs font-bold text-gray-600 mt-0.5">/ měsíc</div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-blue-200/60 text-xs text-gray-600 font-medium space-y-1">
                    <p className="font-black text-gray-800 text-[12px]">Poloviční cena zafixovaná napořád</p>
                    <p className="text-[11px] leading-relaxed text-gray-600">
                      Cena 99 Kč/měsíc ti zůstane i po přidání všech funkcí a zdražení na 199 Kč. Bez vázanosti, zrušit lze kdykoliv jedním klikem.
                    </p>
                  </div>
                </div>

                {/* Pravý checklist výhod v 2-sloupcovém gridu */}
                <div className="md:col-span-8 bg-[#FAF6EE] p-4 sm:p-5 rounded-3xl border border-gray-200/70 flex flex-col justify-center space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                    <StarYellowIcon size={16} />
                    <span>Konkrétní výhody balíčku Premium:</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs sm:text-sm">
                    {/* 1. Neomezené procvičování */}
                    <div className="flex items-start gap-2.5 font-bold text-[#1E1B18] p-2.5 rounded-xl bg-white/80 border border-gray-100 shadow-2xs">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Check size={13} strokeWidth={3} />
                      </div>
                      <div className="leading-snug">
                        <span>Neomezené procvičování bez žolíků a čekání</span>
                      </div>
                    </div>

                    {/* 2. Podrobné statistiky */}
                    <div className="flex items-start gap-2.5 font-bold text-[#1E1B18] p-2.5 rounded-xl bg-white/80 border border-gray-100 shadow-2xs">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Check size={13} strokeWidth={3} />
                      </div>
                      <div className="leading-snug">
                        <span>Podrobné statistiky a chytrá doporučení k procvičování</span>
                      </div>
                    </div>

                    {/* 3. Plánovač v kalendáři */}
                    <div className="flex items-start gap-2.5 font-bold text-[#1E1B18] p-2.5 rounded-xl bg-white/80 border border-gray-100 shadow-2xs">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Check size={13} strokeWidth={3} />
                      </div>
                      <div className="leading-snug">
                        <span>Chytrý studijní plánovač v kalendáři</span>
                      </div>
                    </div>

                    {/* 4. Grafické listy */}
                    <div className="flex items-start gap-2.5 font-bold text-[#1E1B18] p-2.5 rounded-xl bg-white/80 border border-gray-100 shadow-2xs">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Check size={13} strokeWidth={3} />
                      </div>
                      <div className="leading-snug">
                        <span>Přehledné grafické listy</span>
                      </div>
                    </div>

                    {/* 5. Bez reklam */}
                    <div className="flex items-start gap-2.5 font-bold text-[#1E1B18] p-2.5 rounded-xl bg-white/80 border border-gray-100 shadow-2xs">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                        <Check size={13} strokeWidth={3} />
                      </div>
                      <div className="leading-snug">
                        <span>100% bez reklam a přerušování</span>
                      </div>
                    </div>

                    {/* 6. Všechny budoucí funkce */}
                    <div className="flex items-start gap-2.5 font-bold text-[#1E1B18] p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80 shadow-2xs">
                      <div className="w-5 h-5 rounded-full bg-amber-200 text-amber-900 flex items-center justify-center shrink-0 mt-0.5">
                        <Check size={13} strokeWidth={3} />
                      </div>
                      <div className="leading-snug">
                        <span className="text-[#1E1B18]">Všechny budoucí funkce v ceně 99 Kč</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Hlavní tlačítko přechodu k objednávce */}
            <Button
              onClick={isCourse ? handleCourseInquiry : handleGoToOrderForm}
              disabled={isSubmitting}
              className="w-full h-12 sm:h-13 bg-[#B9D8FC] hover:bg-[#A3CCFA] text-[#0F2942] font-black rounded-2xl shadow-sm border border-blue-200/80 cursor-pointer flex items-center justify-center gap-2 transition-all text-sm sm:text-base mt-2"
            >
              {isCourse ? (
                <>
                  <CapIcon size={20} />
                  <span>Zobrazit detail kurzu a zápis</span>
                </>
              ) : (
                <>
                  <PaymentPinkIcon size={22} />
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
                      Objednávka pro podporovatele
                    </span>
                    <div className="flex items-baseline justify-between mt-1.5">
                      <h4 className="font-bold text-sm sm:text-base text-gray-900">ProEdu Premium</h4>
                      <div className="text-right">
                        <span className="text-xs text-gray-400 line-through mr-1 font-bold">199 Kč</span>
                        <span className="text-xl sm:text-2xl font-black text-[#B80053]">99 Kč</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">Zvýhodněná cena 99 Kč/měsíc zafixovaná napořád</p>
                  </div>

                  <div className="space-y-2 text-xs sm:text-sm text-gray-700">
                    <div className="flex items-center gap-2.5 font-semibold">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>Neomezené procvičování bez žolíků a reklam</span>
                    </div>
                    <div className="flex items-center gap-2.5 font-semibold">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>Statistiky, doporučení i studijní plánovač</span>
                    </div>
                    <div className="flex items-center gap-2.5 font-semibold">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>Všechny budoucí funkce i ostré testy v ceně</span>
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

                {/* Volitelné firemní údaje (IČO / DIČ pro iÚčto) */}
                <div className="space-y-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-gray-600">
                    <input
                      type="checkbox"
                      checked={isCompanyPurchase}
                      onChange={e => setIsCompanyPurchase(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span>Nakupuji na firmu / OSVČ (doplnit IČO / DIČ na fakturu)</span>
                  </label>

                  {isCompanyPurchase && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <Input
                        value={ico}
                        onChange={e => setIco(e.target.value)}
                        placeholder="IČO (např. 12345678)"
                        maxLength={20}
                        className="h-10 text-xs sm:text-sm rounded-xl border-gray-200 bg-[#FAF6EE]/50"
                      />
                      <Input
                        value={dic}
                        onChange={e => setDic(e.target.value)}
                        placeholder="DIČ (volitelné, např. CZ12345678)"
                        maxLength={20}
                        className="h-10 text-xs sm:text-sm rounded-xl border-gray-200 bg-[#FAF6EE]/50"
                      />
                    </div>
                  )}
                </div>

                {/* 3. Řádek: Způsob platby - Platební brána */}
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm font-bold text-gray-700">Způsob platby</Label>
                  <div className="h-11 px-4 rounded-xl border-2 border-[#2B44B8] bg-blue-50/70 text-[#0F2942] flex items-center justify-between shadow-2xs">
                    <div className="flex items-center gap-2.5">
                      <CardGrayIcon size={20} />
                      <span className="text-xs sm:text-sm font-bold">Platební brána (karta online, Apple Pay, Google Pay)</span>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded">
                      Okamžitá aktivace
                    </span>
                  </div>

                  <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] text-gray-500 bg-gray-50/80 p-2.5 rounded-xl border border-gray-200">
                    <span className="font-semibold text-gray-700">Podporované metody platební brány:</span>
                    <PaymentLogosBar />
                  </div>
                </div>

                {/* 4. Řádek: Souhlasy */}
                <div className="space-y-1.5 pt-0.5 text-xs sm:text-sm">
                  <label className="flex items-start gap-2 cursor-pointer select-none bg-blue-50/80 p-2.5 rounded-xl border border-blue-200">
                    <input
                      type="checkbox"
                      required
                      checked={recurringConsent}
                      onChange={e => setRecurringConsent(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                    <span className="text-[#0F2942] text-xs leading-normal">
                      <strong>Souhlasím se zřízením opakované platby (předplatného)</strong> ve výši 99 Kč měsíčně. Platba se automaticky obnovuje každých 30 dní. Předplatné lze kdykoliv bezplatně ukončit v nastavení účtu. *
                    </span>
                  </label>

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
                      <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline font-bold">
                        obchodními podmínkami
                      </Link>{' '}
                      a se{' '}
                      <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline font-bold">
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
        {/* KROK 3: VÝSLEDEK OBJEDNÁVKY / PLATEBNÍ BRÁNA COMGATE       */}
        {/* ========================================================== */}
        {currentStep === 'order_result' && orderResult && (
          <div className="flex-1 flex flex-col justify-between space-y-4 relative z-10 pt-2 sm:pt-0">
            <div className="max-w-2xl mx-auto w-full space-y-4 py-1 text-center my-auto">
              <DialogTitle className="text-3xl sm:text-4xl font-playful text-[#1E1B18] tracking-tight">
                Platba kartou online
              </DialogTitle>

              {/* Comgate platební brána karta */}
              <div className="bg-[#FAF6EE] p-5 rounded-3xl border border-gray-200 text-left space-y-3.5 shadow-xs">
                <div className="flex items-center justify-between pb-2.5 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <Lock size={14} className="text-emerald-600" />
                    <span className="text-xs text-gray-700 font-bold uppercase tracking-wider">Platební brána Comgate</span>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase bg-blue-100 text-blue-900">
                    {orderResult.comgate?.isLive
                      ? 'Zabezpečená platba'
                      : sanitizeSafeUrl(orderResult.comgate?.redirectUrl)
                        ? 'Testovací brána Comgate'
                        : 'Testovací režim'}
                  </span>
                </div>

                <div className="grid sm:grid-cols-3 gap-2.5">
                  <div className="bg-white p-2.5 rounded-xl border border-gray-100 text-xs">
                    <div className="text-gray-500 text-[11px]">Objednávka</div>
                    <div className="font-mono font-bold text-gray-800 mt-0.5 text-sm">VS: {orderResult.order.variableSymbol}</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-gray-100 text-xs">
                    <div className="text-gray-500 text-[11px]">Částka k úhradě</div>
                    <div className="font-black text-emerald-700 text-base mt-0.5">
                      {Number(orderResult.order.amount ?? 99).toFixed(2).replace('.', ',')} {orderResult.order.currency === 'CZK' || !orderResult.order.currency ? 'Kč' : orderResult.order.currency}
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-gray-100 text-xs">
                    <div className="text-gray-500 text-[11px]">E-mail klienta</div>
                    <div className="font-bold text-gray-800 truncate mt-0.5 text-xs" title={orderResult.order.invoiceEmail}>
                      {orderResult.order.invoiceEmail}
                    </div>
                  </div>
                </div>

                {/* Předvyplněná testovací karta v dummy bráně (pouze pokud server nevrátil reálnou Comgate redirectUrl) */}
                {import.meta.env.DEV && !sanitizeSafeUrl(orderResult.comgate?.redirectUrl) && (
                  <div className="bg-white p-4 rounded-2xl border-2 border-blue-200 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Testovací platební karta</span>
                      <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">VISA / Mastercard Test</span>
                    </div>
                    <div className="grid grid-cols-12 gap-2.5 text-xs">
                      <div className="col-span-7 bg-gray-50 p-2.5 rounded-xl border border-gray-200 font-mono font-bold text-gray-900 flex items-center justify-between">
                        <span>4242 •••• •••• 4242</span>
                        <CardGrayIcon size={17} />
                      </div>
                      <div className="col-span-3 bg-gray-50 p-2.5 rounded-xl border border-gray-200 font-mono font-bold text-gray-900 text-center">
                        12/28
                      </div>
                      <div className="col-span-2 bg-gray-50 p-2.5 rounded-xl border border-gray-200 font-mono font-bold text-gray-900 text-center">
                        ***
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-3 rounded-2xl bg-blue-50/80 border border-blue-200 text-blue-900 text-xs text-left flex items-start gap-2.5">
                  <ShieldCheck size={18} className="shrink-0 mt-0.5 text-blue-600" />
                  <span>
                    <strong>Opakované předplatné Comgate:</strong> Iniciační platba ve výši {orderResult.order.amount ?? 99} Kč autorizuje automatické prodlužování balíčku každých 30 dní. Po každém úspěšném stržení vám zašleme e-mailové potvrzení. Předplatné lze kdykoliv zrušit v nastavení účtu.
                  </span>
                </div>

                <div className="text-xs text-gray-600 leading-relaxed">
                  {sanitizeSafeUrl(orderResult.comgate?.redirectUrl)
                    ? orderResult.comgate?.isLive
                      ? 'Pro dokončení platby a aktivaci předplatného budete přesměrováni do zabezpečeného rozhraní platební brány Comgate.'
                      : 'Testovací režim Comgate: Kliknutím na tlačítko níže přejdete na testovací platební bránu Comgate k autorizaci platby.'
                    : import.meta.env.DEV
                      ? 'Testovací režim: Kliknutím na tlačítko níže otestuješ okamžité schválení platby na platební bráně a přepnutí účtu na ProEducator Premium.'
                      : 'Online platební brána se připravuje nebo vyžaduje dokončení konfigurace na serveru.'}
                </div>
              </div>

              {/* Tlačítka */}
              <div className="flex flex-col sm:flex-row gap-3">
                {(() => {
                  const safeComgateUrl = sanitizeSafeUrl(orderResult.comgate?.redirectUrl);
                  if (safeComgateUrl) {
                    return (
                      <a
                        href={safeComgateUrl}
                        className="flex-1 h-12 bg-[#2B44B8] hover:bg-[#1E3A8A] text-white font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.01]"
                      >
                        <CardGrayIcon size={20} />
                        <span>Přejít na bránu Comgate k autorizaci</span>
                      </a>
                    );
                  }
                  if (import.meta.env.DEV) {
                    return (
                      <Button
                        type="button"
                        onClick={handleSandboxSimulate}
                        disabled={isSimulatingPayment}
                        className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-md text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-all hover:scale-[1.01]"
                      >
                        <Check size={18} />
                        <span>
                          {isSimulatingPayment
                            ? 'Ověřuji platbu v databázi...'
                            : `Zaplatit ${orderResult.order.amount ?? 99} Kč (Testovací autorizace)`}
                        </span>
                      </Button>
                    );
                  }
                  return null;
                })()}

                <Button
                  type="button"
                  onClick={handleCancelCurrentOrder}
                  disabled={isCancellingOrder || isSimulatingPayment}
                  variant="outline"
                  className="h-12 px-4 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold text-xs sm:text-sm rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <XCircle size={16} />
                  <span>{isCancellingOrder ? 'Ruším...' : 'Zrušit objednávku'}</span>
                </Button>

                <Button
                  type="button"
                  onClick={onClose}
                  variant="outline"
                  className="sm:w-28 h-12 border-gray-200 text-gray-700 font-semibold text-xs sm:text-sm rounded-xl cursor-pointer"
                >
                  Zavřít
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
