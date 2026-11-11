import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Mail, Phone, MapPin, Building2, ExternalLink } from 'lucide-react';
import { PaymentLogosBar } from './PaymentLogos';

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-gray-200/80 bg-white/70 backdrop-blur-md text-gray-600 text-xs sm:text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Main Grid: Operator, Links & Payment info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Column 1: Provozovatel a identifikační údaje (dle Comgate & ČNB) */}
          <div className="space-y-3">
            <div>
              <Link to="/" className="inline-block hover:opacity-95 transition-opacity py-1">
                <img 
                  src={`${import.meta.env.BASE_URL}photo/proeducator-logo.svg`} 
                  alt="ProEducator" 
                  className="h-10 sm:h-12 w-auto object-contain"
                  referrerPolicy="no-referrer"
                />
              </Link>
            </div>
            
            <p className="text-gray-500 leading-relaxed text-xs">
              Moderní příprava na přijímací zkoušky z matematiky a českého jazyka pro žáky 5., 7. a 9. tříd.
            </p>

            <div className="pt-1 space-y-1 text-gray-500 text-xs">
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
          <div className="space-y-3 md:pl-6">
            <h4 className="font-bold text-gray-800 uppercase tracking-wider text-xs">
              Informace & Podmínky
            </h4>
            <ul className="space-y-2 text-xs">
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

            <div className="pt-2 text-xs text-gray-500 space-y-1">
              <div className="flex items-center gap-1.5">
                <Mail size={13} className="text-gray-400" />
                <a href="mailto:info@pro-edu.cz" className="hover:underline font-medium text-gray-700">info@pro-edu.cz</a>
              </div>
            </div>
          </div>

          {/* Column 3: Zabezpečení plateb a Comgate prohlášení (POVINNÉ DLE COMGATE) */}
          <div className="space-y-3 bg-[#FAF7F0] p-4 sm:p-5 rounded-2xl border border-amber-200/60">
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800">
              <ShieldCheck size={16} className="text-emerald-600" />
              <span>Bezpečné online platby</span>
            </div>

            <PaymentLogosBar />

            <p className="text-[11px] leading-relaxed text-gray-600 pt-1">
              Online platby pro vás zajišťuje platební brána <strong>Comgate</strong>. Poskytovatel služby, společnost Comgate a.s., je licencovaná platební instituce působící pod dohledem České národní banky. Platby probíhající skrze platební bránu jsou plně zabezpečeny a veškeré informace jsou šifrovány.
            </p>

            <div className="pt-1">
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
        <div className="pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-400">
          <div>
            © {new Date().getFullYear()} ProEdu, s.r.o. Všechna práva vyhrazena.
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span>Zabezpečení 256-bit SSL</span>
            <span>•</span>
            <span>3D Secure 2.0</span>
            <span>•</span>
            <span>PCI-DSS Compliant</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
