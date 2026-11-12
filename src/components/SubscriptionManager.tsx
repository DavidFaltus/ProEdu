import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import {
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Calendar,
  RefreshCw,
  ArrowRight,
  Building2,
  XCircle,
  Clock,
  CreditCard,
  QrCode,
  Receipt
} from 'lucide-react';
import { StarYellowIcon, CorrectCyanIcon, CapIcon } from './common/CustomIcon';
import UnifiedPaywallModal from './common/UnifiedPaywallModal';
import {
  cancelSubscription,
  reactivateSubscription,
  saveBillingAndPaymentSettings,
  getMyOrders
} from '../services/orderService';
import { Order } from '../types';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

const CANCEL_REASONS = [
  'Už mám po přijímacích zkouškách',
  'Předplatné je pro mě příliš drahé',
  'V aplikaci mi chyběly některé funkce nebo materiály',
  'Přecházím na jiný způsob přípravy',
  'Pouze zkouším fungování aplikace',
  'Jiný důvod'
];

export default function SubscriptionManager() {
  const { profile, updateProfileData } = useAuth();

  // Stavy modálů
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<Order | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  // Stavy jednotlivých plateb a objednávek uživatele
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  // Stavy rušení a obnovy
  const [selectedReason, setSelectedReason] = useState<string>(CANCEL_REASONS[0]);
  const [customReason, setCustomReason] = useState<string>('');
  const [isProcessingCancel, setIsProcessingCancel] = useState(false);
  const [isProcessingReactivate, setIsProcessingReactivate] = useState(false);

  // Stavy fakturačních údajů
  const [clientName, setClientName] = useState(profile?.billingDetails?.clientName || profile?.name || '');
  const [invoiceEmail, setInvoiceEmail] = useState(profile?.billingDetails?.invoiceEmail || profile?.email || '');
  const [street, setStreet] = useState(profile?.billingDetails?.street || '');
  const [city, setCity] = useState(profile?.billingDetails?.city || '');
  const [zip, setZip] = useState(profile?.billingDetails?.zip || '');
  const [ico, setIco] = useState(profile?.billingDetails?.ico || '');
  const [dic, setDic] = useState(profile?.billingDetails?.dic || '');
  const [isSavingBilling, setIsSavingBilling] = useState(false);

  const isPremium = profile?.role === 'premium';
  const isCourse = profile?.role === 'course';
  const isTeacher = profile?.role === 'teacher';

  // Výpočet data konce období
  const periodEndDate = React.useMemo(() => {
    if (profile?.subscriptionPeriodEnd) {
      const d = new Date(profile.subscriptionPeriodEnd);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }, [profile?.subscriptionPeriodEnd]);

  const isPeriodExpired = React.useMemo(() => {
    return periodEndDate.getTime() <= Date.now();
  }, [periodEndDate]);

  const isCancelledAtPeriodEnd = isPremium && profile?.subscriptionStatus === 'cancelled_at_period_end' && !isPeriodExpired;

  const formattedPeriodEnd = periodEndDate.toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Synchronizace formuláře s profilem
  useEffect(() => {
    if (profile) {
      setClientName(profile.billingDetails?.clientName || profile.name || '');
      setInvoiceEmail(profile.billingDetails?.invoiceEmail || profile.email || '');
      setStreet(profile.billingDetails?.street || '');
      setCity(profile.billingDetails?.city || '');
      setZip(profile.billingDetails?.zip || '');
      setIco(profile.billingDetails?.ico || '');
      setDic(profile.billingDetails?.dic || '');
    }
  }, [profile]);

  const loadMyOrders = async () => {
    setLoadingOrders(true);
    try {
      const data = await getMyOrders();
      setOrders(data);
    } catch (err) {
      console.warn('Chyba při načítání jednotlivých plateb:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    loadMyOrders();
  }, [profile?.uid]);

  const handleOpenNewOrderModal = () => {
    setSelectedOrderForPayment(null);
    setIsPaywallOpen(true);
  };

  const handleOpenExistingOrderPayment = (order: Order) => {
    setSelectedOrderForPayment(order);
    setIsPaywallOpen(true);
  };

  const handleSaveBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      toast.error('Vyplň prosím jméno a příjmení nebo název firmy.');
      return;
    }
    if (!invoiceEmail.trim() || !invoiceEmail.includes('@')) {
      toast.error('Zadej prosím platný e-mail pro zasílání faktur.');
      return;
    }

    setIsSavingBilling(true);
    try {
      const billingDetails = {
        clientName: clientName.trim(),
        invoiceEmail: invoiceEmail.trim(),
        street: street.trim(),
        city: city.trim(),
        zip: zip.trim(),
        country: 'Česká republika',
        ico: ico.trim(),
        dic: dic.trim()
      };

      await saveBillingAndPaymentSettings({
        billingDetails
      });
      await updateProfileData({
        billingDetails
      });
      toast.success('Fakturační údaje byly úspěšně uloženy.');
    } catch (err: any) {
      toast.error(err.message || 'Nepodařilo se uložit fakturační údaje.');
    } finally {
      setIsSavingBilling(false);
    }
  };

  const handleConfirmCancel = async (immediate: boolean = false) => {
    const finalReason =
      selectedReason === 'Jiný důvod' && customReason.trim()
        ? `Jiný důvod: ${customReason.trim()}`
        : selectedReason;

    setIsProcessingCancel(true);
    try {
      // 1. Provede zápis a počká na potvrzení z databáze Firestore
      const res = await cancelSubscription({
        reason: finalReason,
        immediate,
        currentPeriodEnd: periodEndDate.toISOString()
      });

      if (immediate) {
        await updateProfileData({
          role: 'free',
          subscriptionStatus: 'inactive',
          subscriptionCancelledAt: new Date().toISOString(),
          subscriptionCancelReason: finalReason
        });
      } else {
        await updateProfileData({
          subscriptionStatus: 'cancelled_at_period_end',
          subscriptionCancelledAt: new Date().toISOString(),
          subscriptionCancelReason: finalReason,
          subscriptionPeriodEnd: res.subscriptionPeriodEnd || periodEndDate.toISOString()
        });
      }

      toast.success(res.message);
      setIsCancelModalOpen(false);

      // 2. Po potvrzení z databáze obnovíme stránku, aby se stav okamžitě a konzistentně propsal v celé aplikaci
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err: any) {
      toast.error(err.message || 'Nepodařilo se zrušit předplatné.');
      setIsProcessingCancel(false);
    }
  };

  const handleReactivate = async () => {
    setIsProcessingReactivate(true);
    try {
      const res = await reactivateSubscription(periodEndDate.toISOString());
      await updateProfileData({
        role: 'premium',
        subscriptionStatus: 'active',
        subscriptionCancelledAt: null,
        subscriptionPeriodEnd: res.subscriptionPeriodEnd
      });
      toast.success(res.message);
      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (err: any) {
      toast.error(err.message || 'Nepodařilo se obnovit předplatné.');
      setIsProcessingReactivate(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 mt-8">
      {/* 1. KARTA: AKTUÁLNÍ PŘEDPLATNÉ A POROVNÁNÍ TARIFŮ */}
      <div className="bg-white p-7 sm:p-10 rounded-[2.5rem] shadow-xl border border-gray-100/80 space-y-8 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-6">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-black uppercase tracking-widest text-gray-400">
                Aktuální tarif
              </span>
              {isPremium && !isCancelledAtPeriodEnd && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 size={13} /> Aktivní předplatné
                </span>
              )}
              {isCancelledAtPeriodEnd && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-800 border border-amber-200">
                  <Clock size={13} /> Zrušeno ke konci období
                </span>
              )}
              {isCourse && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200">
                  <Sparkles size={13} /> Živý kurz + Premium
                </span>
              )}
              {!isPremium && !isCourse && !isTeacher && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600">
                  Verze zdarma
                </span>
              )}
            </div>

            <h2 className="text-2xl sm:text-3xl font-sans font-black text-gray-900 flex items-center gap-2.5">
              {isPremium ? (
                <>
                  <StarYellowIcon size={28} />
                  ProEducator Premium
                </>
              ) : isCourse ? (
                <>
                  <CapIcon size={28} />
                  Živý přípravný kurz + Premium
                </>
              ) : isTeacher ? (
                'Učitelský / Administrátorský účet'
              ) : (
                'ProEducator Free'
              )}
            </h2>
          </div>

          <div className="text-left sm:text-right shrink-0">
            {isPremium ? (
              <div>
                <div className="text-3xl font-black text-[#1E1B18]">99 Kč</div>
                <div className="text-xs font-bold text-gray-400">za měsíc vč. DPH</div>
              </div>
            ) : isCourse ? (
              <div>
                <div className="text-lg font-black text-blue-700">V ceně kurzu</div>
                <div className="text-xs font-bold text-gray-400">Kompletní přístup</div>
              </div>
            ) : (
              <div>
                <div className="text-3xl font-black text-gray-700">0 Kč</div>
                <div className="text-xs font-bold text-gray-400">navždy zdarma</div>
              </div>
            )}
          </div>
        </div>

        {/* Stavový informační box pro aktivní nebo zrušené Premium */}
        {isPremium && !isCancelledAtPeriodEnd && (
          <div className="bg-[#FAF7F0] border border-[#E6E0D4] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-[#F5C400]/20 text-[#1E1B18] flex items-center justify-center shrink-0 mt-0.5">
                <Calendar size={20} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-black text-gray-900">
                  Další automatické prodloužení: <span className="text-[#B80053]">{formattedPeriodEnd}</span>
                </p>
                <p className="text-xs text-gray-600 font-medium">
                  Máš neomezený přístup ke všem procvičováním bez žolíků, studijním tahákům a vysvětlením.
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => setIsCancelModalOpen(true)}
              className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold text-xs h-10 px-4 shrink-0 cursor-pointer"
            >
              Zrušit předplatné
            </Button>
          </div>
        )}

        {isCancelledAtPeriodEnd && (
          <div className="bg-amber-50/80 border-2 border-amber-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle size={20} />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-black text-amber-950">
                  Předplatné je zrušeno – výhody ti skončí dne {formattedPeriodEnd}
                </p>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Další platba již nebude stržena. Až do <strong>{formattedPeriodEnd}</strong> ti zůstává plný přístup k ProEducator Premium, poté se účet přepne na bezplatný tarif Free.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                onClick={handleReactivate}
                disabled={isProcessingReactivate}
                className="rounded-xl bg-[#F5C400] hover:bg-[#F5C400]/90 text-[#1E1B18] font-black text-xs h-10 px-5 shadow-md cursor-pointer"
              >
                <RefreshCw size={15} className={cn('mr-2', isProcessingReactivate && 'animate-spin')} />
                {isProcessingReactivate ? 'Obnovuji...' : 'Obnovit předplatné'}
              </Button>

              <Button
                variant="outline"
                onClick={() => handleConfirmCancel(true)}
                disabled={isProcessingCancel}
                className="rounded-xl border-gray-300 text-gray-600 hover:bg-white hover:text-red-600 font-bold text-xs h-10 px-4 cursor-pointer"
              >
                {isProcessingCancel ? 'Ukončuji...' : 'Ukončit ihned (přepnout na Free)'}
              </Button>
            </div>
          </div>
        )}

        {/* Porovnání a změna tarifu: Free vs. Premium */}
        <div className="space-y-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-400">
            Porovnání předplatných
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tarif Free */}
            <div
              className={cn(
                'rounded-2xl p-5 border-2 transition-all flex flex-col justify-between gap-4',
                !isPremium && !isCourse
                  ? 'border-[#1E1B18] bg-gray-50/70'
                  : 'border-gray-100 bg-white hover:border-gray-200'
              )}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-black text-lg text-gray-900">Free</span>
                  <span className="font-black text-lg text-gray-700">0 Kč</span>
                </div>
                <ul className="space-y-2 text-xs text-gray-600 font-medium">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-gray-400 shrink-0" />
                    Denní příděl 5 žolíků na procvičování
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-gray-400 shrink-0" />
                    Základní přehled témat a zahrádka soustředění
                  </li>
                </ul>
              </div>

              {!isPremium && !isCourse ? (
                <div className="text-center py-2 px-3 rounded-xl bg-gray-200/70 text-gray-700 text-xs font-black">
                  Tvůj současný tarif
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setIsCancelModalOpen(true)}
                  className="w-full rounded-xl h-10 text-xs font-bold border-gray-200 text-gray-600 hover:text-red-600 hover:border-red-200 cursor-pointer"
                >
                  Přejít zpět na Free (Zrušit Premium)
                </Button>
              )}
            </div>

            {/* Tarif Premium Měsíční */}
            <div
              className={cn(
                'rounded-2xl p-5 border-2 transition-all flex flex-col justify-between gap-4 relative',
                isPremium
                  ? 'border-[#F5C400] bg-[#FAF7F0]/60 shadow-md'
                  : 'border-gray-200 bg-white hover:border-[#F5C400]'
              )}
            >
              <div className="space-y-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300 inline-block">
                  Nabídka pro první podporovatele
                </span>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-black text-lg text-gray-900 flex items-center gap-1.5">
                    <StarYellowIcon size={18} /> ProEdu Premium
                  </span>
                  <div className="text-right">
                    <span className="text-xs text-gray-400 line-through font-bold mr-1.5">199 Kč</span>
                    <span className="font-black text-lg text-[#B80053]">99 Kč / měs.</span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-600 font-medium leading-relaxed">
                  Zafixuj si poloviční cenu 99 Kč/měsíc napořád a získej okamžitý přístup ke všem nástrojům bez limitu žolíků.
                </p>
                <ul className="space-y-2 text-xs text-gray-700 font-medium">
                  <li className="flex items-center gap-2">
                    <CorrectCyanIcon size={14} className="shrink-0" />
                    <span>Neomezené procvičování bez žolíků a čekání</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CorrectCyanIcon size={14} className="shrink-0" />
                    <span>Podrobné statistiky a chytrá doporučení k procvičování</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CorrectCyanIcon size={14} className="shrink-0" />
                    <span>Chytrý studijní plánovač v kalendáři</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CorrectCyanIcon size={14} className="shrink-0" />
                    <span>Přehledné grafické listy</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CorrectCyanIcon size={14} className="shrink-0" />
                    <span>100% bez reklam a přerušování</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CorrectCyanIcon size={14} className="shrink-0" />
                    <span>Všechny budoucí funkce v ceně 99 Kč</span>
                  </li>
                </ul>
              </div>

              {isPremium && !isCancelledAtPeriodEnd ? (
                <div className="text-center py-2 px-3 rounded-xl bg-[#F5C400]/30 text-[#1E1B18] text-xs font-black">
                  Tvůj současný tarif (Zafixováno 99 Kč)
                </div>
              ) : isCancelledAtPeriodEnd ? (
                <Button
                  onClick={handleReactivate}
                  disabled={isProcessingReactivate}
                  className="w-full rounded-xl h-10 bg-[#F5C400] hover:bg-[#F5C400]/90 text-[#1E1B18] text-xs font-black cursor-pointer"
                >
                  Obnovit měsíční Premium
                </Button>
              ) : (
                <Button
                  onClick={handleOpenNewOrderModal}
                  className="w-full rounded-xl h-10 bg-[#B80053] hover:bg-[#B80053]/90 text-white text-xs font-black shadow-md shadow-pink-100 cursor-pointer"
                >
                  Zafixovat Premium za 99 Kč / měs.
                </Button>
              )}
            </div>
          </div>

          {/* Proklik na Živé kurzy */}
          <div className="rounded-2xl bg-gray-50 border border-gray-100 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center shrink-0">
                <CapIcon size={22} />
              </div>
              <div>
                <p className="text-xs font-black text-gray-900">
                  Zajímají tě Živé online kurzy s lektorem?
                </p>
                <p className="text-[11px] text-gray-500">
                  Součástí každého živého kurzu je automaticky i plný přístup k ProEducator Premium.
                </p>
              </div>
            </div>
            <Link
              to="/courses"
              className="inline-flex items-center gap-1.5 text-xs font-black text-[#B80053] hover:underline shrink-0"
            >
              Prohlédnout kurzy <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* 2. KARTA: JEDNOTLIVÉ PLATBY A OBJEDNÁVKY (VČETNĚ NEUHRAZENÝCH) */}
      <div className="bg-white p-7 sm:p-10 rounded-[2.5rem] shadow-xl border border-gray-100/80 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Receipt size={18} className="text-[#B80053]" />
              <h3 className="font-sans font-black text-xl text-gray-900">
                Jednotlivé platby
              </h3>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Přehled tvých objednávek a plateb. Neuhrazenou objednávku můžeš rozkliknout a okamžitě zaplatit.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadMyOrders}
            disabled={loadingOrders}
            className="rounded-xl h-9 px-3 text-xs font-bold border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer shrink-0"
          >
            <RefreshCw size={13} className={cn('mr-1.5', loadingOrders && 'animate-spin')} />
            Obnovit
          </Button>
        </div>

        {loadingOrders ? (
          <div className="py-8 text-center text-xs font-bold text-gray-400">
            Načítám přehled plateb...
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-gray-50/80 border border-gray-100 rounded-2xl p-6 text-center space-y-3">
            <p className="text-xs font-bold text-gray-500">
              Zatím zde nemáš žádné vytvořené platby ani objednávky.
            </p>
            {!isPremium && !isCourse && (
              <Button
                type="button"
                onClick={handleOpenNewOrderModal}
                className="rounded-xl h-9 px-4 bg-[#B80053] hover:bg-[#B80053]/90 text-white text-xs font-black cursor-pointer"
              >
                Vytvořit objednávku Premium (99 Kč)
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(order => {
              const isPaid = order.status === 'paid';
              const isCancelled = order.status === 'cancelled';
              const isPending = !isPaid && !isCancelled;
              const orderKey = (order as any).orderId || order.id || order.variableSymbol;
              const createdDate = order.createdAt
                ? new Date(order.createdAt).toLocaleDateString('cs-CZ', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : '—';

              return (
                <div
                  key={orderKey}
                  onClick={() => {
                    if (isPending) handleOpenExistingOrderPayment(order);
                  }}
                  className={cn(
                    'p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4',
                    isPending
                      ? 'border-amber-200 bg-amber-50/40 hover:bg-amber-50/70 hover:border-amber-300 cursor-pointer shadow-2xs'
                      : 'border-gray-100 bg-gray-50/60'
                  )}
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-sm text-gray-900">
                        ProEducator Premium (Měsíční)
                      </span>
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 size={12} /> Uhrazeno
                        </span>
                      ) : isCancelled ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gray-200 text-gray-600">
                          Zrušeno
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-200">
                          <Clock size={12} /> Čeká na úhradu
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 font-medium">
                      <span>Datum: <strong className="text-gray-700">{createdDate}</strong></span>
                      {order.variableSymbol && (
                        <span>VS: <strong className="font-mono text-gray-800">{order.variableSymbol}</strong></span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        {order.paymentMethod === 'comgate' ? (
                          <>
                            <CreditCard size={13} className="text-blue-600" />
                            <span>Kartou online</span>
                          </>
                        ) : (
                          <>
                            <QrCode size={13} className="text-purple-600" />
                            <span>QR platba</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-200/60">
                    <span className="text-base sm:text-lg font-black text-gray-900">
                      {order.amount || 99} {order.currency === 'CZK' || !order.currency ? 'Kč' : order.currency}
                    </span>

                    {isPending && (
                      <Button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          handleOpenExistingOrderPayment(order);
                        }}
                        className="rounded-xl h-9 px-4 bg-[#B80053] hover:bg-[#B80053]/90 text-white text-xs font-black shadow-sm cursor-pointer flex items-center gap-1.5"
                      >
                        <CreditCard size={14} />
                        <span>Rozkliknout a zaplatit</span>
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. KARTA: FAKTURAČNÍ ÚDAJE */}
      <form
        onSubmit={handleSaveBilling}
        className="bg-white p-7 sm:p-10 rounded-[2.5rem] shadow-xl border border-gray-100/80 space-y-6"
      >
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-[#B80053]" />
            <h3 className="font-sans font-black text-xl text-gray-900">
              Fakturační údaje
            </h3>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Tyto údaje se automaticky použijí pro vystavování faktur a při objednávce předplatného.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">
              Jméno a příjmení / Název firmy *
            </Label>
            <Input
              value={clientName}
              onChange={e => setClientName(e.target.value)}
              placeholder="Jan Novák"
              className="rounded-2xl h-12 bg-gray-50 border-none font-bold px-4"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">
              E-mail pro zasílání faktur *
            </Label>
            <Input
              type="email"
              value={invoiceEmail}
              onChange={e => setInvoiceEmail(e.target.value)}
              placeholder="jan.novak@email.cz"
              className="rounded-2xl h-12 bg-gray-50 border-none font-bold px-4"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">
              Ulice a číslo popisné
            </Label>
            <Input
              value={street}
              onChange={e => setStreet(e.target.value)}
              placeholder="Např. Dlouhá 123/4"
              className="rounded-2xl h-12 bg-gray-50 border-none font-bold px-4"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">
              Město
            </Label>
            <Input
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="Praha"
              className="rounded-2xl h-12 bg-gray-50 border-none font-bold px-4"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">
              PSČ
            </Label>
            <Input
              value={zip}
              onChange={e => setZip(e.target.value)}
              placeholder="110 00"
              className="rounded-2xl h-12 bg-gray-50 border-none font-bold px-4"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">
              IČO (volitelné)
            </Label>
            <Input
              value={ico}
              onChange={e => setIco(e.target.value)}
              placeholder="12345678"
              className="rounded-2xl h-12 bg-gray-50 border-none font-bold px-4"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">
              DIČ (volitelné)
            </Label>
            <Input
              value={dic}
              onChange={e => setDic(e.target.value)}
              placeholder="CZ12345678"
              className="rounded-2xl h-12 bg-gray-50 border-none font-bold px-4"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={isSavingBilling}
            className="rounded-2xl h-12 px-8 bg-[#B80053] hover:bg-[#B80053]/90 text-white font-bold shadow-lg shadow-pink-100 cursor-pointer"
          >
            {isSavingBilling ? 'Ukládám...' : 'Uložit fakturační údaje'}
          </Button>
        </div>
      </form>

      {/* MODÁL PRO POTVRZENÍ ZRUŠENÍ PŘEDPLATNÉHO */}
      <Dialog open={isCancelModalOpen} onOpenChange={setIsCancelModalOpen}>
        <DialogContent className="sm:max-w-lg rounded-[2rem] p-6 sm:p-8 bg-white border border-gray-100 shadow-2xl space-y-6">
          <div className="space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-2">
              <Clock size={26} />
            </div>
            <DialogTitle className="text-2xl font-sans font-black text-gray-900">
              Zrušení obnovování předplatného
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600 leading-relaxed">
              Předplatné ti neskončí ihned. Tvoje prémiové výhody zůstanou plně aktivní až do konce již zaplaceného období (<strong className="text-gray-900">{formattedPeriodEnd}</strong>).
            </DialogDescription>
          </div>

          {/* Informační box o zachování výhod a zrušení plateb */}
          <div className="bg-[#FAF7F0] rounded-2xl p-4 space-y-2.5 border border-[#E6E0D4]">
            <div className="flex items-center gap-2.5 text-xs font-bold text-gray-800">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              <span>Až do {formattedPeriodEnd} můžeš Premium neomezeně využívat</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs font-bold text-gray-800">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              <span>Žádná další platba (99 Kč) se z tvé karty již nestrhne</span>
            </div>
            <div className="flex items-center gap-2.5 text-xs font-bold text-gray-800">
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
              <span>Předplatné můžeš kdykoliv před vypršením znovu obnovit</span>
            </div>
          </div>

          {/* Výběr důvodu zrušení */}
          <div className="space-y-3">
            <Label className="text-xs font-black uppercase tracking-widest text-gray-400">
              Proč se rozhoduješ předplatné ukončit? (pomůže nám to zlepšit aplikaci)
            </Label>
            <div className="space-y-2">
              {CANCEL_REASONS.map(reason => (
                <label
                  key={reason}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border text-xs font-bold cursor-pointer transition-all',
                    selectedReason === reason
                      ? 'border-[#B80053] bg-pink-50/40 text-gray-900'
                      : 'border-gray-100 bg-gray-50/60 text-gray-600 hover:bg-gray-50'
                  )}
                >
                  <input
                    type="radio"
                    name="cancelReason"
                    value={reason}
                    checked={selectedReason === reason}
                    onChange={() => setSelectedReason(reason)}
                    className="accent-[#B80053]"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>

            {selectedReason === 'Jiný důvod' && (
              <Input
                value={customReason}
                onChange={e => setCustomReason(e.target.value)}
                placeholder="Napiš nám prosím krátce tvůj důvod..."
                className="rounded-xl h-11 bg-gray-50 border-gray-200 text-xs font-medium mt-2"
              />
            )}
          </div>

          {/* Akční tlačítka */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <Button
              type="button"
              disabled={isProcessingCancel}
              onClick={() => setIsCancelModalOpen(false)}
              className="flex-1 rounded-xl h-11 bg-[#F5C400] hover:bg-[#F5C400]/90 text-[#1E1B18] font-black text-xs cursor-pointer"
            >
              Ponechat si Premium
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isProcessingCancel}
              onClick={() => handleConfirmCancel(false)}
              className="flex-1 rounded-xl h-11 border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs cursor-pointer"
            >
              {isProcessingCancel ? 'Ukládám v databázi...' : `Zrušit k ${formattedPeriodEnd}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* STANDARDNÍ OBJEDNÁVKOVÝ MODÁL PRO AKTIVACI PREMIUM NEBO ÚHRADU EXISTUJÍCÍ OBJEDNÁVKY */}
      <UnifiedPaywallModal
        isOpen={isPaywallOpen}
        onClose={() => {
          setIsPaywallOpen(false);
          setSelectedOrderForPayment(null);
          loadMyOrders();
        }}
        onSuccess={() => {
          loadMyOrders();
        }}
        initialOrder={selectedOrderForPayment}
        type="premium"
        title="Přejdi na ProEducator Premium"
        description="Získej neomezené procvičování všech témat bez žolíků a kompletní studijní materiály."
      />
    </div>
  );
}
