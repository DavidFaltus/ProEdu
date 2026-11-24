import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ShieldCheck,
  Zap,
  ExternalLink,
  Mail,
  Phone,
  MapPin,
  Building2,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { PaymentLogosBar } from '../components/common/PaymentLogos';
import { InfoPinkIcon, CardGrayIcon } from '../components/common/CustomIcon';

export default function ShippingAndPayment() {
  return (
    <div className="max-w-4xl mx-auto py-4 sm:py-6 space-y-8 text-[#1E1B18]">
      {/* Top Bar with Back Button */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to="/">
          <Button
            variant="ghost"
            className="gap-2 font-bold text-gray-600 hover:text-gray-900 rounded-2xl cursor-pointer"
          >
            <ArrowLeft size={18} />
            Zpět na hlavní stránku
          </Button>
        </Link>
        <span className="text-xs font-semibold text-gray-400">ProEdu, s.r.o.</span>
      </div>

      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-6 sm:p-10 border border-blue-200/70 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-100/50 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-pink-50 flex items-center justify-center font-bold">
            <InfoPinkIcon size={24} />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
            Informace o platbě a dodání
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-playful text-gray-700 tracking-tight">
          Doprava a platba
        </h1>
        <p className="mt-2 text-sm text-gray-500 font-medium">
          Přehled způsobů úhrady a doručení digitálních vzdělávacích služeb na portálu ProEducator.
        </p>
      </div>

      {/* Content Cards */}
      <div className="space-y-6 text-sm leading-relaxed text-gray-700">
        {/* 1. Způsob dodání (Doprava) */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900 flex items-start gap-2.5">
            <Zap size={20} className="text-emerald-600 shrink-0 mt-1" />
            <span>1. Doprava a způsob dodání služeb</span>
          </h2>
          <p>
            Veškeré služby, kurzy a digitální předplatné <strong>ProEducator Premium</strong> jsou poskytovány výhradně elektronicky formou přístupu do online vzdělávací platformy a živých online lekcí.
          </p>
          <div className="bg-[#FAF7F0] p-4 rounded-2xl border border-amber-200/70 space-y-1.5 text-gray-700">
            <div className="font-bold text-gray-900">Elektronické dodání (online zpřístupnění) — Zdarma (0 Kč)</div>
            <p className="text-xs sm:text-sm text-gray-600">
              Po úspěšném potvrzení online platby je přístup k zakoupenému digitálnímu obsahu nebo předplatnému aktivován <strong>okamžitě a automaticky</strong> ve vašem uživatelském účtu bez jakýchkoliv nákladů na dopravu či balné.
            </p>
          </div>
        </section>

        {/* 2. Poskytovatel platební brány */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-start gap-2.5">
            <ShieldCheck size={20} className="text-blue-600 shrink-0 mt-1" />
            <span>2. Poskytovatel platební brány</span>
          </h2>
          <p>
            Online platby zajišťuje certifikovaná platební brána společnosti{' '}
            <strong>Comgate, a.s.</strong>, která je licencovanou platební institucí působící pod dohledem České národní banky. Veškerá komunikace mezi vaším prohlížečem a platební bránou je šifrovaná a zabezpečená podle standardů 3D Secure.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-200">
            <PaymentLogosBar />
            <a
              href="https://www.comgate.eu/cs/platebni-brana"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:text-blue-900 underline"
            >
              <span>Více o platební bráně Comgate</span>
              <ExternalLink size={13} />
            </a>
          </div>
        </section>

        {/* 3. Dostupné platební metody */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-5">
          <h2 className="text-xl font-bold text-gray-900">3. Platební metody a průběh platby</h2>

          {/* Platby kartou (výhradní metoda pro opakované předplatné) */}
          <div className="p-5 rounded-2xl bg-[#FAF7F0] border border-gray-200/80 space-y-2.5">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <h3 className="text-base font-bold text-gray-900 flex items-start gap-2.5">
                <CardGrayIcon size={20} className="shrink-0 mt-1" />
                <span>Platba platební kartou online (Visa, Mastercard, Apple Pay, Google Pay)</span>
              </h3>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                Okamžitá úhrada • Podpora předplatného
              </span>
            </div>
            <p className="text-gray-700">
              Vzhledem k charakteru pravidelného měsíčního předplatného jsou na platební bráně povoleny <strong>výhradně karetní platební metody</strong> (platební karty Visa, Mastercard, Maestro a digitální peněženky Apple Pay a Google Pay napojené na platební kartu), které umožňují bezpečné automatické stržení platby v následujícím měsíci ze stejného zdroje. Jednorázové bankovní převody, QR platby a odložené platby nejsou pro předplatné podporovány.
            </p>
            <p className="text-gray-700">
              Po potvrzení objednávky budete přesměrováni na zabezpečenou platební bránu Comgate, kde zadáte údaje své karty (případně potvrdíte platbu pomocí Apple Pay či Google Pay) a platbu autorizujete v mobilní aplikaci své banky (3D Secure). Částka se připíše okamžitě a služba je ihned aktivována.
            </p>
            <p className="text-xs text-gray-600">
              U měsíčního předplatného ProEducator Premium (99 Kč / 30 dní) slouží první úspěšná platba kartou jako iniciační autorizace pro následné automatické prodlužování předplatného. Podrobnosti najdete v{' '}
              <Link to="/terms#predplatne" className="text-amber-700 font-bold underline">
                pravidlech opakovaných plateb
              </Link>.
            </p>
            <div>
              <a
                href="https://help.comgate.eu/v1/docs/cs/platby-kartou"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 hover:underline"
              >
                <span>Podrobný průvodce platbou kartou (Comgate Help)</span>
                <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </section>

        {/* 4. Kontaktní údaje Comgate pro reklamace a dotazy k platbám */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-start gap-2.5">
            <Building2 size={20} className="text-amber-600 shrink-0 mt-1" />
            <span>4. Kontaktní údaje poskytovatele platební brány (reklamace a dotazy k platbám)</span>
          </h2>
          <p className="text-gray-600">
            V případě technických dotazů k průběhu platby nebo při reklamaci nezaúčtované transakce na platební bráně se můžete obrátit přímo na podporu společnosti Comgate, a.s.:
          </p>

          <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200 space-y-2.5 text-sm">
            <div className="font-bold text-gray-900 text-base">Comgate, a.s.</div>
            <div className="flex items-start gap-2 text-gray-700">
              <MapPin size={16} className="text-gray-400 shrink-0 mt-0.5" />
              <span>Gočárova třída 1754 / 48b, Hradec Králové</span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <Mail size={16} className="text-gray-400 shrink-0" />
              <span>
                E-mail:{' '}
                <a href="mailto:podpora@comgate.cz" className="text-blue-700 font-bold hover:underline">
                  podpora@comgate.cz
                </a>
              </span>
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <Phone size={16} className="text-gray-400 shrink-0" />
              <span>
                Tel:{' '}
                <a href="tel:+420228224267" className="text-blue-700 font-bold hover:underline">
                  +420 228 224 267
                </a>
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-gray-500 gap-2">
            <span>Dotazy ke službám ProEducator směřujte na info@pro-edu.eu</span>
            <div className="flex items-center gap-4">
              <Link to="/terms" className="font-bold text-amber-700 hover:underline">
                Obchodní podmínky &rarr;
              </Link>
              <Link to="/contact" className="font-bold text-amber-700 hover:underline">
                Kontakt &rarr;
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
