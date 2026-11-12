import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Mail, MapPin, Building2, ExternalLink } from 'lucide-react';
import { PaymentLogosBar } from './PaymentLogos';

export default function Footer() {
  return (
    <footer className="mt-10 border-t border-gray-200/80 bg-white/70 backdrop-blur-md text-gray-600 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 space-y-4">
        {/* Main Grid: Operator, Links & Payment info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-start">
          
          {/* Column 1: Provozovatel a identifikační údaje (dle Comgate & ČNB) */}
          <div className="space-y-2">
            <div>
              <Link to="/" className="inline-block hover:opacity-95 transition-opacity">
                <img 
                  src={`${import.meta.env.BASE_URL}photo/proeducator-logo.svg`} 
                  alt="ProEducator" 
                  className="h-8 sm:h-9 w-auto object-contain"
                  referrerPolicy="no-referrer"
                />
              </Link>
            </div>

            <div className="space-y-1 text-gray-500 text-xs">
              <div className="flex items-center gap-1.5">
                <Building2 size={13} className="text-gray-400 shrink-0" />
                <span className="font-semibold text-gray-700">ProEdu, s.r.o.</span>
                <span>• IČO: 24466883</span>
              </div>
              <div className="flex items-center gap-1.5">
                <MapPin size={13} className="text-gray-400 shrink-0" />
                <span>Uralská 689/7, Bubeneč, 160 00 Praha 6</span>
              </div>
              <div className="text-[11px] text-gray-400 pl-4">
                Zapsáno v OR: Městský soud v Praze, oddíl C, vložka 441629
              </div>
            </div>
          </div>

          {/* Column 2: Rychlé odkazy a právní dokumenty */}
          <div className="space-y-1.5 md:pl-4">
            <h4 className="font-bold text-gray-800 uppercase tracking-wider text-[11px]">
              Informace & Podmínky
            </h4>
            <ul className="space-y-1 text-xs">
              <li>
                <Link to="/terms" className="hover:text-black hover:underline transition-colors flex items-center gap-1">
                  <span>Obchodní podmínky & Reklamační řád</span>
                </Link>
              </li>
              <li>
                <Link to="/terms#predplatne" className="hover:text-black hover:underline transition-colors flex items-center gap-1 font-semibold text-gray-700">
                  <span>Pravidla opakovaných plateb (Předplatné)</span>
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="hover:text-black hover:underline transition-colors flex items-center gap-1">
                  <span>Zásady ochrany osobních údajů (GDPR)</span>
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-black hover:underline transition-colors flex items-center gap-1">
                  <span>Kontakt a zákaznická podpora</span>
                </Link>
              </li>
            </ul>

            <div className="pt-0.5 text-xs text-gray-500">
              <div className="flex items-center gap-1.5">
                <Mail size={13} className="text-gray-400" />
                <a href="mailto:info@pro-edu.eu" className="hover:underline font-medium text-gray-700">info@pro-edu.eu</a>
              </div>
            </div>
          </div>

          {/* Column 3: Zabezpečení plateb a Comgate prohlášení (POVINNÉ DLE COMGATE) */}
          <div className="space-y-2 bg-[#FAF7F0] p-3 sm:p-3.5 rounded-xl border border-amber-200/60">
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
              <ShieldCheck size={14} className="text-emerald-600" />
              <span>Bezpečné online platby</span>
            </div>

            <PaymentLogosBar />

            <p className="text-[11px] leading-relaxed text-gray-600">
              Online platby pro vás zajišťuje platební brána <strong>Comgate</strong>. Poskytovatel služby, společnost Comgate a.s., je licencovaná platební instituce působící pod dohledem České národní banky. Platby probíhající skrze platební bránu jsou plně zabezpečeny a veškeré informace jsou šifrovány.
            </p>

            <div>
              <a 
                href="https://www.comgate.cz/cz/platebni-brana" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 hover:text-emerald-950 underline"
              >
                <span>Další informace a kontakty na www.comgate.eu</span>
                <ExternalLink size={10} />
              </a>
            </div>
          </div>

        </div>

        {/* Bottom copyright */}
        <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
          <div>
            © {new Date().getFullYear()} ProEdu, s.r.o. Všechna práva vyhrazena.
          </div>
        </div>
      </div>
    </footer>
  );
}
