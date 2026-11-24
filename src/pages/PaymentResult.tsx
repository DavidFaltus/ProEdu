import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ArrowRight,
  CreditCard,
  Home,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { verifyComgatePayment } from '../services/orderService';
import { trackCheckoutCancelled, trackPurchase } from '../services/analyticsService';
import { Button } from '../components/ui/button';
import UnifiedPaywallModal from '../components/common/UnifiedPaywallModal';
import { PREMIUM_BENEFITS } from '../constants/premiumBenefits';
import { toast } from 'sonner';

export type PaymentReturnRouteStatus = 'success' | 'cancelled' | 'pending';
type ResolvedPaymentState = 'verifying' | 'paid' | 'cancelled' | 'pending';

interface PaymentResultProps {
  routeStatus: PaymentReturnRouteStatus;
}

function cleanComgateParam(raw: string | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed || /^\$\{[^}]+\}$/.test(trimmed)) return '';
  return trimmed;
}

export default function PaymentResult({ routeStatus }: PaymentResultProps) {
  const [searchParams] = useSearchParams();
  const { user, profile, loading: authLoading, isPremium, refreshProfile, openAuthModal } = useAuth();

  const orderId = cleanComgateParam(searchParams.get('refId')) || cleanComgateParam(searchParams.get('orderId'));
  const comgateTransId = cleanComgateParam(searchParams.get('id'));

  const [resolvedState, setResolvedState] = useState<ResolvedPaymentState>('verifying');
  const [isManualChecking, setIsManualChecking] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const verifiedKeyRef = useRef<string | null>(null);

  const runVerification = async (isManual = false) => {
    if (!orderId || !user) return;
    if (isManual) setIsManualChecking(true);

    try {
      const res = await verifyComgatePayment(
        orderId,
        routeStatus === 'cancelled' && !isManual ? { markCancelledIfPending: true } : undefined
      );

      if (res.status === 'paid') {
        setResolvedState('paid');
        trackPurchase({
          orderId,
          planId: 'premium-monthly',
          amount: 99,
          currency: 'CZK',
          transId: comgateTransId || undefined,
        });
        await user.getIdToken(true).catch(() => {});
        await refreshProfile().catch(() => {});
        if (isManual) {
          toast.success('Platba byla potvrzena! Balíček ProEdu Premium je aktivní.');
        }
        return;
      }

      if (res.status === 'cancelled') {
        setResolvedState('cancelled');
        if (!isManual) {
          trackCheckoutCancelled({ orderId, source: 'gateway_return' });
        } else {
          toast.info('Objednávka je ve stavu zrušeno.');
        }
        return;
      }

      setResolvedState('pending');
      if (isManual) {
        toast.info('Platba zatím čeká na potvrzení z platební brány.');
      }
    } catch (err) {
      console.warn('[PaymentResult verify]:', err);
      if (routeStatus === 'cancelled') {
        setResolvedState('cancelled');
      } else {
        setResolvedState('pending');
      }
      if (isManual) {
        toast.error('Nepodařilo se ověřit stav platby. Zkus to prosím za chvíli znovu.');
      }
    } finally {
      if (isManual) setIsManualChecking(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;

    const verifyKey = `${routeStatus}:${orderId}:${user?.uid || 'guest'}`;
    if (verifiedKeyRef.current === verifyKey) return;
    verifiedKeyRef.current = verifyKey;

    if (!user) {
      if (routeStatus === 'cancelled') {
        setResolvedState('cancelled');
      } else {
        setResolvedState('pending');
      }
      return;
    }

    if (!orderId) {
      if (routeStatus === 'success' && isPremium) {
        setResolvedState('paid');
      } else if (routeStatus === 'cancelled') {
        setResolvedState('cancelled');
      } else {
        setResolvedState('pending');
      }
      return;
    }

    setResolvedState('verifying');
    void runVerification(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.uid, routeStatus, orderId, isPremium]);

  const formattedPeriodEnd = profile?.subscriptionPeriodEnd
    ? new Date(profile.subscriptionPeriodEnd).toLocaleDateString('cs-CZ', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const accentBarColor =
    resolvedState === 'paid'
      ? 'bg-[#0fa384]'
      : resolvedState === 'cancelled'
        ? 'bg-[#c47294]'
        : 'bg-[#f5c400]';

  return (
    <div className="py-6 sm:py-10 flex items-center justify-center">
      <div className="w-full max-w-xl bg-white rounded-[2.5rem] border border-[#efe6d8] shadow-xl overflow-hidden">
        {/* Horní barevný pruh podle stavu */}
        <div className={`h-2.5 w-full ${accentBarColor}`} />

        <div className="p-6 sm:p-10 space-y-6 text-center">
          {/* STAV 0: OVĚŘOVÁNÍ */}
          {(authLoading || resolvedState === 'verifying') && (
            <div className="py-10 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto">
                <RefreshCw size={28} className="text-amber-600 animate-spin" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-3xl sm:text-4xl font-playful text-gray-700 tracking-tight">
                  Ověřujeme stav platby
                </h1>
                <p className="text-sm text-gray-500 font-medium">
                  Chvilku strpení, kontrolujeme potvrzení z platební brány Comgate…
                </p>
              </div>
            </div>
          )}

          {/* STAV 1: ZAPLACENO */}
          {!authLoading && resolvedState === 'paid' && (
            <>
              <div className="w-16 h-16 rounded-2xl bg-[#e5f6f1] border border-[#c9e8de] text-[#0fa384] flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 size={34} />
              </div>

              <div className="space-y-2">
                <h1 className="text-3xl sm:text-4xl font-playful text-gray-700 tracking-tight">
                  Platba proběhla úspěšně!
                </h1>
                <p className="text-sm sm:text-base text-gray-600 font-medium leading-relaxed">
                  Balíček <strong className="text-gray-900">ProEdu Premium</strong> je aktivní. Máš odemčené všechny výhody pro přípravu na přijímačky.
                </p>
              </div>

              <div className="p-5 rounded-2xl bg-[#e5f6f1]/70 border border-[#c9e8de] text-left space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#c9e8de] text-xs font-bold text-[#0a6f5a]">
                  <span>Aktivní balíček: ProEdu Premium (99 Kč / měsíc)</span>
                  {formattedPeriodEnd && <span>Předplaceno do {formattedPeriodEnd}</span>}
                </div>

                <ul className="space-y-2 text-xs sm:text-sm">
                  {PREMIUM_BENEFITS.map((benefit) => (
                    <li key={benefit.id} className="flex items-start gap-2 font-semibold text-gray-800">
                      <CheckCircle2 size={15} className="text-[#0fa384] shrink-0 mt-0.5" />
                      <span>{benefit.label}</span>
                    </li>
                  ))}
                </ul>

                <p className="text-[11px] text-gray-600 pt-2 border-t border-[#c9e8de]">
                  Potvrzení o platbě a fakturu (PDF) jsme odeslali na tvůj e-mail.
                  {orderId && (
                    <span className="block mt-0.5 font-mono text-[11px] text-gray-500">
                      Číslo objednávky: {orderId}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Link to="/practice" className="flex-1">
                  <Button className="w-full h-12 rounded-2xl bg-[#0fa384] hover:bg-[#0c8a70] text-white font-black text-sm shadow-md cursor-pointer flex items-center justify-center gap-2">
                    <span>Pustit se do procvičování</span>
                    <ArrowRight size={17} />
                  </Button>
                </Link>
                <Link to="/settings?tab=subscription">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto h-12 px-5 rounded-2xl border-gray-200 text-gray-700 font-bold text-sm cursor-pointer"
                  >
                    Správa předplatného
                  </Button>
                </Link>
              </div>
            </>
          )}

          {/* STAV 2: ZRUŠENO */}
          {!authLoading && resolvedState === 'cancelled' && (
            <>
              <div className="w-16 h-16 rounded-2xl bg-[#f8e9f0] border border-[#efcddd] text-[#c47294] flex items-center justify-center mx-auto shadow-inner">
                <XCircle size={34} />
              </div>

              <div className="space-y-2">
                <h1 className="text-3xl sm:text-4xl font-playful text-gray-700 tracking-tight">
                  Platba byla zrušena
                </h1>
                <p className="text-sm sm:text-base text-gray-600 font-medium leading-relaxed">
                  Platbu na platební bráně Comgate jsi zrušil(a) a objednávka byla stornována.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#f8e9f0] border border-[#efcddd] text-left text-xs sm:text-sm text-[#6b2f4a] font-semibold flex items-start gap-2.5">
                <ShieldCheck size={18} className="text-[#c47294] shrink-0 mt-0.5" />
                <div>
                  <p>Z tvé platební karty nebyla stržena žádná částka.</p>
                  {orderId && (
                    <p className="mt-1 font-mono text-[11px] opacity-80">Objednávka: {orderId}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      openAuthModal();
                    } else {
                      setIsPaywallOpen(true);
                    }
                  }}
                  className="flex-1 h-12 rounded-2xl bg-[#c47294] hover:bg-[#b05d80] text-white font-black text-sm shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  <CreditCard size={17} />
                  <span>Zkusit zaplatit znovu</span>
                </Button>
                <Link to="/">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto h-12 px-5 rounded-2xl border-gray-200 text-gray-700 font-bold text-sm cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Home size={16} />
                    <span>Zpět do aplikace</span>
                  </Button>
                </Link>
              </div>
            </>
          )}

          {/* STAV 3: NEVYŘÍZENO / ČEKÁ NA POTVRZENÍ */}
          {!authLoading && resolvedState === 'pending' && (
            <>
              <div className="w-16 h-16 rounded-2xl bg-[#fff6d1] border border-[#f1dc8a] text-[#7a5a00] flex items-center justify-center mx-auto shadow-inner">
                <Clock size={34} />
              </div>

              <div className="space-y-2">
                <h1 className="text-3xl sm:text-4xl font-playful text-gray-700 tracking-tight">
                  Platba čeká na vyřízení
                </h1>
                <p className="text-sm sm:text-base text-gray-600 font-medium leading-relaxed">
                  {!user
                    ? 'Pro ověření výsledku tvojí platby se prosím nejprve přihlas ke svému účtu.'
                    : 'Platební brána Comgate zatím platbu nepotvrdila nebo platba neprošla. Jakmile banka úhradu potvrdí, předplatné se ti automaticky aktivuje.'}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#fff6d1] border border-[#f1dc8a] text-left text-xs sm:text-sm text-[#5a4300] space-y-1.5">
                <p className="font-bold">Co se děje dál?</p>
                <p className="leading-relaxed">
                  Pokud platba proběhla, dorazí ti za chvilku potvrzovací e-mail s fakturou a ProEdu Premium se ihned odemkne. Pokud platba v bance neprošla, můžeš stav zkontrolovat tlačítkem níže nebo objednávku vyřešit ve správě předplatného.
                </p>
                {orderId && (
                  <p className="pt-1 font-mono text-[11px] text-[#7a5a00]">
                    Číslo objednávky: {orderId}
                  </p>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                {!user ? (
                  <Button
                    type="button"
                    onClick={openAuthModal}
                    className="flex-1 h-12 rounded-2xl bg-[#f5c400] hover:bg-[#e0b400] text-[#26354d] font-black text-sm shadow-md cursor-pointer flex items-center justify-center gap-2"
                  >
                    <LogIn size={17} />
                    <span>Přihlásit se a ověřit platbu</span>
                  </Button>
                ) : orderId ? (
                  <Button
                    type="button"
                    disabled={isManualChecking}
                    onClick={() => runVerification(true)}
                    className="flex-1 h-12 rounded-2xl bg-[#f5c400] hover:bg-[#e0b400] text-[#26354d] font-black text-sm shadow-md cursor-pointer flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={16} className={isManualChecking ? 'animate-spin' : undefined} />
                    <span>{isManualChecking ? 'Kontroluji…' : 'Zkontrolovat stav platby'}</span>
                  </Button>
                ) : (
                  <Link to="/settings?tab=subscription" className="flex-1">
                    <Button className="w-full h-12 rounded-2xl bg-[#f5c400] hover:bg-[#e0b400] text-[#26354d] font-black text-sm shadow-md cursor-pointer">
                      Přejít do správy předplatného
                    </Button>
                  </Link>
                )}

                <Link to="/">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto h-12 px-5 rounded-2xl border-gray-200 text-gray-700 font-bold text-sm cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Home size={16} />
                    <span>Zpět do aplikace</span>
                  </Button>
                </Link>
              </div>

              {user && orderId && (
                <div className="pt-1">
                  <Link
                    to="/settings?tab=subscription"
                    className="text-xs font-bold text-gray-500 hover:text-gray-800 underline"
                  >
                    Zobrazit objednávky ve správě předplatného
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <UnifiedPaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        type="premium"
        onSuccess={() => {
          refreshProfile().catch(() => {});
          setIsPaywallOpen(false);
        }}
      />
    </div>
  );
}
