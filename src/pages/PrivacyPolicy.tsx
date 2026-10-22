import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Building2, UserCheck, Lock, Eye, Clock, Scale } from 'lucide-react';
import { Button } from '../components/ui/button';

export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto py-6 px-4 sm:px-6 space-y-8 text-[#1E1B18]">
      {/* Top Bar with Back Button */}
      <div className="flex items-center justify-between">
        <Link to="/">
          <Button variant="ghost" className="gap-2 font-bold text-gray-600 hover:text-gray-900 rounded-2xl cursor-pointer">
            <ArrowLeft size={18} />
            Zpět na hlavní stránku
          </Button>
        </Link>
        <span className="text-xs font-semibold text-gray-400">Verze 1.0 • Platné od 13. 8. 2026</span>
      </div>

      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-6 sm:p-10 border border-emerald-200/60 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-100/50 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
            <ShieldCheck size={20} />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
            Ochrana soukromí
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
          Zásady ochrany osobních údajů (GDPR)
        </h1>
        <p className="mt-2 text-sm text-gray-500 font-medium">
          Platné a účinné od 13. srpna 2026 | ProEdu, s.r.o.
        </p>
      </div>

      {/* Intro Box */}
      <div className="bg-[#FAF7F0] p-6 rounded-3xl border border-gray-200/70 text-sm sm:text-base text-gray-700 leading-relaxed font-medium">
        Společnost <strong>ProEdu, s. r. o.</strong> plně respektuje vaše soukromí. Tento dokument vysvětluje, jakým způsobem zpracováváme a chráníme vaše osobní údaje v souladu s nařízením Evropského parlamentu a Rady (EU) 2016/679 (GDPR).
      </div>

      {/* Content Sections */}
      <div className="space-y-6 text-sm leading-relaxed text-gray-700">

        {/* 1. Totožnost a kontaktní údaje správce */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 size={20} className="text-emerald-600" />
            <span>1. Totožnost a kontaktní údaje správce</span>
          </h2>
          <p>Správcem vašich osobních údajů je společnost:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-[#FAF7F0] rounded-2xl border border-emerald-200/60 font-medium text-xs sm:text-sm">
            <div>
              <span className="text-gray-400 block text-xs">Název:</span>
              <span className="font-bold text-gray-900">ProEdu, s.r.o.</span>
            </div>
            <div>
              <span className="text-gray-400 block text-xs">IČO:</span>
              <span className="font-bold text-gray-900">24466883</span>
            </div>
            <div>
              <span className="text-gray-400 block text-xs">Sídlo:</span>
              <span className="font-bold text-gray-900">Uralská 689/7, Bubeneč, 160 00 Praha 6</span>
            </div>
            <div>
              <span className="text-gray-400 block text-xs">E-mail:</span>
              <a href="mailto:info@pro-edu.eu" className="font-bold text-emerald-700 hover:underline">info@pro-edu.eu</a>
            </div>
          </div>
        </section>

        {/* 2. Jaké údaje zpracováváme a proč? */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Eye size={20} className="text-emerald-600" />
            <span>2. Jaké údaje zpracováváme a proč?</span>
          </h2>
          <p>Zpracováváme pouze údaje nezbytné k tomu, abychom vám mohli poskytnout kvalitní doučování:</p>
          <ul className="space-y-2 mt-3 list-disc pl-5">
            <li><strong>Identifikační údaje:</strong> Jméno a příjmení (u studentů i zákonných zástupců).</li>
            <li><strong>Kontaktní údaje:</strong> E-mailová adresa a telefonní číslo (pro zasílání odkazů na lekce a komunikaci).</li>
            <li><strong>Fakturační údaje:</strong> Adresa trvalého bydliště, bankovní spojení (pro vystavení faktury a účetní evidenci).</li>
            <li><strong>Údaje z formulářů:</strong> Poptávané kurzy, preferované termíny výuky a doplňující poznámky zadané při objednávce nebo žádosti o bezplatnou konzultaci.</li>
            <li><strong>Obrazové a zvukové záznamy:</strong> Videozáznamy ze skupinových lekcí obsahující obraz, hlas či textové příspěvky studentů (za účelem zpřístupnění záznamu pro studijní účely a kompenzaci absencí).</li>
            <li><strong>Provozní údaje:</strong> Záznamy o účasti na lekcích (pro kontrolu čerpání kurzu).</li>
            <li><strong>Síťové identifikátory (Cookies):</strong> Informace o vašem pohybu na našem webu (viz bod 6).</li>
          </ul>
        </section>

        {/* 3. Právní základ zpracování */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Scale size={20} className="text-emerald-600" />
            <span>3. Právní základ zpracování</span>
          </h2>
          <p>Vaše údaje zpracováváme na základě těchto právních titulů (podle čl. 6 odst. 1 GDPR):</p>
          <p>
            <strong>3.1. Plnění smlouvy (čl. 6 odst. 1 písm. b GDPR):</strong> Zpracování je nutné pro uzavření a plnění smlouvy o poskytování vzdělávacích služeb (včetně bezplatné 15minutové konzultace) a pro pořizování záznamů z výuky jakožto přímé součásti poskytované služby.
          </p>
          <p>
            <strong>3.2. Plnění právní povinnosti (čl. 6 odst. 1 písm. c GDPR):</strong> Musíme vystavovat daňové doklady, vést účetnictví a plnit další povinnosti stanovené zákony ČR.
          </p>
          <p>
            <strong>3.3. Oprávněný zájem (čl. 6 odst. 1 písm. f GDPR):</strong> Ochrana právních nároků správce (případné spory), vnitřní administrativní potřeby a základní analytika výuky.
          </p>
          <p>
            <strong>3.4. Váš souhlas (čl. 6 odst. 1 písm. a GDPR):</strong> Udělujete jej například v cookies liště na webu pro analytické a marketingové účely.
          </p>
        </section>

        {/* 4. Nahrávání skupinových lekcí a ochrana soukromí */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900">4. Nahrávání skupinových lekcí a ochrana soukromí</h2>
          <p>
            <strong>4.1. Účel nahrávání:</strong> Skupinové lekce jsou nahrávány za účelem vyhotovení studijního záznamu, který slouží účastníkům kurzu pro opakování a jako náhrada za případnou absenci.
          </p>
          <p>
            <strong>4.2. Ochrana soukromí studenta:</strong> Záznam primárně zachycuje výklad lektora a sdílenou obrazovku. Pokud si student nebo jeho zákonný zástupce nepřeje být na záznamu zachycen (tváří nebo hlasem), má možnost mít po dobu lekce vypnutou kameru i mikrofon a dotazy pokládat výhradně prostřednictvím textového chatu.
          </p>
          <p>
            <strong>4.3. Dostupnost záznamu:</strong> Záznamy jsou zpřístupněny výhradně registrovaným účastníkům daného kurzu na omezenou dobu (30 dnů) a je přísně zakázáno je dále šířit či stahovat.
          </p>
        </section>

        {/* 5. Kdo má k údajům přístup? */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <UserCheck size={20} className="text-emerald-600" />
            <span>5. Kdo má k údajům přístup? (Příjemci a zpracovatelé)</span>
          </h2>
          <p>Osobní údaje nepředáváme neoprávněným třetím osobám ani je neprodáváme. Pro zajištění provozu využíváme tyto prověřené zpracovatele:</p>
          <ul className="space-y-2 mt-3 list-disc pl-5">
            <li><strong>Lektoři:</strong> Mají přístup k jménu a e-mailu studenta výhradně pro účely vedení výuky a komunikace.</li>
            <li><strong>Formspree, Inc.:</strong> Služba pro zpracování webových formulářů (registrace do kurzů, žádosti o konzultace). Údaje mohou být přenášeny do USA na základě standardních smluvních doložek (SCC) a rámce EU-US Data Privacy Framework.</li>
            <li><strong>Google Ireland Ltd. / Google LLC:</strong> Google Cloud, Google Meet (provozně-technické zázemí výuky, videohovory a uložení nahrávek) a Google Analytics (analýza návštěvnosti webu).</li>
            <li>Poskytovatelé účetních, daňových a IT služeb.</li>
          </ul>
        </section>

        {/* 6. Analytické nástroje a Cookies */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900">6. Analytické nástroje a Cookies</h2>
          <p>
            <strong>6.1.</strong> Náš web používá nástroj Google Analytics k měření návštěvnosti a chování uživatelů.
          </p>
          <p>
            <strong>6.2.</strong> Data z Google Analytics jsou anonymizována a nepoužíváme je k vaší přímé identifikaci.
          </p>
          <p>
            <strong>6.3.</strong> Tento nástroj spouštíme výhradně na základě vašeho aktivního souhlasu, který udělujete prostřednictvím cookies lišty při první návštěvě webu.
          </p>
          <p>
            <strong>6.4.</strong> Souhlas můžete kdykoliv změnit nebo odvolat v nastavení cookies lišty na webu nebo smazáním cookies ve svém prohlížeči.
          </p>
        </section>

        {/* 7. Doba uchování údajů */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Clock size={20} className="text-emerald-600" />
            <span>7. Doba uchování údajů</span>
          </h2>
          <p>
            <strong>7.1. Údaje pro plnění smlouvy a registrace:</strong> Uchováváme po dobu trvání kurzu a následně 3 roky od jeho ukončení (promlčecí lhůta pro případné nároky).
          </p>
          <p>
            <strong>7.2. Videozáznamy z lekcí:</strong> Uchováváme po dobu 30 dnů od konání lekce, následně jsou automaticky nebo manuálně mazány.
          </p>
          <p>
            <strong>7.3. Účetní a daňové doklady:</strong> Uchováváme po dobu 10 let od konce zdaňovacího období, jak vyžaduje zákon o DPH a zákon o účetnictví.
          </p>
          <p>
            <strong>7.4. Data z formulářů (bezplatná konzultace bez následné objednávky):</strong> Uchováváme po dobu 6 měsíců pro vyřízení poptávky.
          </p>
          <p>
            <strong>7.5. Cookies a analytika:</strong> Uchováváme po dobu stanovenou v nastavení Google Analytics (obvykle 2 až 14 měsíců) nebo do odvolání souhlasu.
          </p>
        </section>

        {/* 8. Vaše práva */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900">8. Vaše práva</h2>
          <p>Jako subjekt údajů máte následující práva:</p>
          <p>
            <strong>8.1. Právo na přístup:</strong> Právo získat potvrzení, zda vaše údaje zpracováváme, a získat jejich kopii.
          </p>
          <p>
            <strong>8.2. Právo na opravu:</strong> Právo požadovat opravu nepřesných nebo doplnění neúplných údajů.
          </p>
          <p>
            <strong>8.3. Právo na výmaz („právo být zapomenut“):</strong> Právo na smazání údajů, pokud již nejsou potřebné pro účely, pro které byly shromážděny, nebo pokud odvoláte souhlas.
          </p>
          <p>
            <strong>8.4. Právo na omezení zpracování a právo na přenositelnost údajů.</strong>
          </p>
          <p>
            <strong>8.5. Právo vznést námitku:</strong> Proti zpracování založeném na našem oprávněném zájmu.
          </p>
          <p>
            <strong>8.6. Právo podat stížnost:</strong> Pokud se domníváte, že zpracování probíhá v rozporu s legislativou, máte právo podat stížnost u Úřadu pro ochranu osobních údajů (Pplk. Sochora 27, 170 00 Praha 7, <a href="https://www.uoou.cz" target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-bold hover:underline">www.uoou.cz</a>).
          </p>
        </section>

        {/* 9. Zabezpečení dat */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Lock size={20} className="text-emerald-600" />
            <span>9. Zabezpečení dat</span>
          </h2>
          <p>
            <strong>9.1.</strong> Při nakládání s osobními údaji uplatňujeme adekvátní technická a organizační opatření (zašifrovaný přenos dat HTTPS, silná hesla, dvoufázové ověření přístupů, řízené přístupové práva pro lektory a šifrovaná úložiště), aby nedošlo k jejich neoprávněnému přístupu, ztrátě či zneužití.
          </p>
          <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-gray-500 gap-2">
            <span>V Praze dne 13. 8. 2026 | ProEdu, s.r.o.</span>
            <Link to="/terms" className="font-bold text-emerald-700 hover:underline">
              Přejít na Obchodní podmínky &rarr;
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
