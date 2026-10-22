import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Building2, ShieldCheck, Mail, AlertCircle, Scale } from 'lucide-react';
import { Button } from '../components/ui/button';

export default function Terms() {
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
      <div className="bg-white rounded-3xl p-6 sm:p-10 border border-amber-200/60 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-100/50 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
            <FileText size={20} />
          </div>
          <span className="text-xs font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
            Právní dokument
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight">
          Obchodní podmínky
        </h1>
        <p className="mt-2 text-sm text-gray-500 font-medium">
          Platné a účinné od 13. srpna 2026 | ProEdu, s.r.o.
        </p>
      </div>

      {/* Content Cards */}
      <div className="space-y-6 text-sm leading-relaxed text-gray-700">

        {/* 1. Úvodní ustanovení */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <span>1. Úvodní ustanovení</span>
          </h2>
          <p>
            <strong>1.1.</strong> Tyto obchodní podmínky (dále jen „OP“) upravují v souladu s ustanovením § 1751 odst. 1 zákona č. 89/2012 Sb., občanský zákoník, vzájemná práva a povinnosti vznikající mezi poskytovatelem a zákazníkem (spotřebitelem) při poskytování služeb online doučování a vzdělávacích kurzů.
          </p>
          <p>
            <strong>1.2.</strong> Tyto OP jsou nedílnou součástí každé smlouvy o poskytování služeb uzavřené mezi poskytovatelem a zákazníkem.
          </p>
        </section>

        {/* 2. Identifikační údaje poskytovatele */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 size={20} className="text-amber-600" />
            <span>2. Identifikační údaje poskytovatele</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-[#FAF7F0] rounded-2xl border border-amber-200/60 font-medium text-xs sm:text-sm">
            <div>
              <span className="text-gray-400 block text-xs">Obchodní firma:</span>
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
              <span className="text-gray-400 block text-xs">Zápis v OR:</span>
              <span className="font-bold text-gray-900">Městský soud v Praze, oddíl C, vložka 441629</span>
            </div>
            <div className="sm:col-span-2">
              <span className="text-gray-400 block text-xs">E-mail:</span>
              <a href="mailto:info@pro-edu.eu" className="font-bold text-amber-700 hover:underline">info@pro-edu.eu</a>
            </div>
          </div>
        </section>

        {/* 3. Charakter služeb a vyloučení odpovědnosti */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <AlertCircle size={20} className="text-amber-600" />
            <span>3. Charakter služeb a vyloučení odpovědnosti za výsledek</span>
          </h2>
          <p>
            <strong>3.1.</strong> Poskytovatel nabízí online doučování, přípravu na zkoušky a vzdělávací kurzy (činnost mimoškolní výchovy a vzdělávání).
          </p>
          <p>
            <strong>3.2. Povaha služby:</strong> Online doučování představuje vzdělávací podporu a konzultační činnost. Předmětem plnění je poskytnutí procesu výuky, nikoliv dosažení konkrétního výsledku.
          </p>
          <p>
            <strong>3.3. Negarantování výsledku:</strong> Poskytovatel neodpovídá za výsledky, které zákazník (nebo student) v souvislosti s užíváním služeb zaznamená. Poskytovatel negarantuje dosažení konkrétních studijních výsledků, zlepšení známek ani úspěch u přijímacích, maturitních či jiných zkoušek. Úspěch ve studiu závisí na řadě faktorů, které poskytovatel nemůže ovlivnit (např. domácí příprava studenta, jeho schopnosti či aktuální psychický stav u zkoušky).
          </p>
          <p>
            <strong>3.4. Bezplatná úvodní konzultace:</strong> Poskytovatel může nabízet novým zákazníkům bezplatnou úvodní online konzultaci (v délce trvání např. 15 minut). Účelem této konzultace je seznámení s formou výuky, zjištění potřeb zákazníka a technické prověření spojení. Na bezplatnou konzultaci vzniká nárok pouze jednou na jednoho zákazníka/studenta a poskytovatel si vyhrazuje právo ji odmítnout z kapacitních důvodů. V případě, že se zákazník na sjednanou konzultaci bez včasné omluvy nedostaví, nárok na náhradní bezplatný termín zaniká.
          </p>
        </section>

        {/* 4. Uzavření smlouvy a právo na odmítnutí */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900">4. Uzavření smlouvy a právo na odmítnutí</h2>
          <p>
            <strong>4.1. Objednávka:</strong> Zákazník objednává služby prostřednictvím webového formuláře nebo e-mailu. Smluvní vztah vzniká v okamžiku, kdy poskytovatel potvrdí přijetí objednávky na e-mailovou adresu zákazníka.
          </p>
          <p>
            <strong>4.2. Účast nezletilých studentů:</strong> Je-li příjemcem služby (studentem) osoba mladší 18 let, objednávku vytvoří a smlouvu s poskytovatelem uzavírá její zákonný zástupce, který vystupuje jako zákazník a přebírá veškeré závazky vyplývající z těchto OP (zejména povinnost k úhradě ceny a dohled nad dodržováním pravidel výuky a autorských práv ze strany nezletilého studenta).
          </p>
          <p>
            <strong>4.3. Kapacitní výhrada:</strong> Poskytovatel negarantuje dostupnost konkrétních časových termínů výuky. Termíny lekcí jsou sjednávány individuálně dle aktuálních kapacitních možností lektorů.
          </p>
          <p>
            <strong>4.4. Právo odmítnout zákazníka:</strong> Poskytovatel si vyhrazuje právo odmítnout objednávku či uzavření smlouvy bez udání důvodu, zejména v případě naplnění kapacit, nevhodnosti poptávané služby pro potřeby zákazníka nebo v případě předchozích neuhrazených závazků zákazníka.
          </p>
        </section>

        {/* 5. Cena a platební podmínky */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900">5. Cena a platební podmínky</h2>
          <p>
            <strong>5.1.</strong> Cena za služby je stanovena dle aktuálního ceníku kurzu. Poskytovatel není plátcem DPH.
          </p>
          <p>
            <strong>5.2. Způsob platby:</strong> Cena kurzu je splatná před zahájením výuky na základě platebních instrukcí či zálohové faktury. Přístup k výuce je umožněn až po úplném zaplacení.
          </p>
          <p>
            <strong>5.3. Nezúčastnění se lekce:</strong> Pokud se zákazník nezúčastní domluvené lekce a neomluví se včas (v souladu s pravidly omlouvání, viz bod 7.4.), uhrazená cena za tuto lekci propadá bez náhrady.
          </p>
        </section>

        {/* 6. Autorská práva a ochrana obsahu */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck size={20} className="text-amber-600" />
            <span>6. Autorská práva a ochrana obsahu</span>
          </h2>
          <p>
            <strong>6.1.</strong> Veškeré studijní materiály, nahrávky lekcí, testy a postupy poskytnuté v rámci výuky jsou autorským dílem poskytovatele nebo lektora.
          </p>
          <p>
            <strong>6.2. Zákaz sdílení:</strong> Zákazník je oprávněn využívat materiály výhradně pro svou osobní potřebu (nebo potřebu studenta, pro kterého službu objednal). Je přísně zakázáno materiály bez písemného souhlasu poskytovatele dále šířit, kopírovat, nahrávat či zpřístupňovat třetím osobám.
          </p>
          <p>
            <strong>6.3. Účast třetích osob:</strong> Lekce je určena výhradně pro registrovaného zákazníka (studenta). Účast dalších osob (např. kamarádů) na lekci bez předchozí domluvy a doplatku je považována za podstatné porušení smlouvy.
          </p>
          <p>
            <strong>6.4. Pořizování a zpřístupnění záznamů:</strong> Zákazník bere na vědomí a souhlasí s tím, že průběh skupinových lekcí může být poskytovatelem nahráván za účelem vyhotovení záznamu pro účely studijní podpory a kompenzace absencí účastníků kurzu. Pokud si student nepřeje být na záznamu zachycen (obrazem či hlasem), je povinen mít po dobu konání lekce vypnutou kameru i mikrofon a dotazy pokládat výhradně prostřednictvím textového chatu.
          </p>
          <p>
            <strong>6.5. Zákaz pořizování vlastních nahrávek:</strong> Zákazníkovi ani studentovi není dovoleno pořizovat vlastní audio či video nahrávky z lekcí bez předchozího písemného souhlasu poskytovatele. Zpřístupněný videozáznam od poskytovatele je určen výhradně pro osobní studijní potřebu studenta. Jeho stahování, dalším šíření, sdílení s třetími osobami nebo zveřejňování je přísně zakázáno a zakládá právo poskytovatele na okamžité odstoupení od smlouvy a náhradu škody.
          </p>
        </section>

        {/* 7. Technické požadavky a organizace výuky */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900">7. Technické požadavky a organizace výuky</h2>
          <p>
            <strong>7.1.</strong> Zákazník je povinen zajistit si stabilní internetové připojení a funkční technické vybavení (mikrofon, kamera).
          </p>
          <p>
            <strong>7.2.</strong> Poskytovatel neodpovídá za výpadky výuky způsobené technickou chybou na straně zákazníka.
          </p>
          <p>
            <strong>7.3. Zrušení lekce lektorem:</strong> Pokud se lekce nemůže uskutečnit z důvodů na straně poskytovatele (např. náhlé onemocnění lektora) nebo v důsledku zásahu vyšší moci (tj. mimořádné, neovlivnitelné a nepřevídatelné události, jako jsou plošné výpadky internetové či elektrické sítě, rozsáhlé výpadky komunikačních platforem apod.), je poskytovatel povinen o tom zákazníka bez zbytečného odkladu informovat. Zákazníkovi bude v takovém případě nabídnut náhradní živý termín lekce, případně bude lekce kompenzována dodatečným záznamem či poměrným prodloužením kurzu. Smluvní strany neodpovídají za nesplnění povinností nebo prodlení způsobené vyšší mocí a zákazníkovi z tohoto důvodu nevzniká nárok na náhradu škody.
          </p>
          <p>
            <strong>7.4. Zrušení lekce zákazníkem:</strong> Výuka probíhá ve skupinách v předem stanovených pevný dnech a časech podle harmonogramu kurzu. Vzhledem ke skupinovému charakteru výuky není možné termíny jednotlivých lekce ze strany zákazníka měnit, posouvat ani individuálně nahrazovat. Poskytovatel si však vyhrazuje právo v odůvodněných případech (např. ze zdravotních důvodů) posoudit situaci zákazníka individuálně a dohodnout se na alternativním řešení; na takové individuální řešení však nevzniká právní nárok.
          </p>
          <p>
            <strong>7.5. Absence a kompenzace formou záznamu:</strong> Neúčast zákazníka (studenta) na jakékoliv lekci nezakládá nárok na vrácení ceny lekce ani na poskytnutí náhradního živého termínu. Jako standardní kompenzaci za neúčast poskytne poskytovatel zákazníkovi přístup k videozáznamu proběhlé lekce, a to po dobu 30 dnů od jejího konání.
          </p>
          <p>
            <strong>7.6. Pravidla chování při výuce:</strong> Zákazník (student) je povinen se při výuce chovat v souladu s dobrými mravy a nenarušovat průběh lekce. V případě opakovaného nebo hrubého porušování pravidel výuky (např. nevhodné či vulgární chování vůči lektorovi nebo ostatním účastníkům) je poskytovatel oprávněn studenta z lekce nebo celého kurzu vyloučit bez nároku na vrácení zaplacené ceny.
          </p>
        </section>

        {/* 8. Odstoupení od smlouvy */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900">8. Odstoupení od smlouvy (Informace pro spotřebitele)</h2>
          <p>
            <strong>8.1. Lhůta 14 dnů:</strong> Jako spotřebitel máte právo odstoupit od smlouvy do 14 dnů od jejího uzavření.
          </p>
          <p>
            <strong>8.2. Souhlas s dřívějším plněním:</strong> Pokud zákazník požádá o zahájení výuky před uplynutím této lhůty a služba je v této době plně poskytnuta (např. jednorázový kurz), právo na odstoupení zaniká. Pokud byla služba poskytnuta jen zčásti, hradí zákazník poměrnou část ceny za již proběhlé lekce.
          </p>
        </section>

        {/* 9. Reklamace a mimosoudní řešení sporů */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Scale size={20} className="text-amber-600" />
            <span>9. Reklamace a mimosoudní řešení sporů</span>
          </h2>
          <p>
            <strong>9.1.</strong> Reklamace (např. neuskutečnění lekce vinou lektora) uplatní zákazník na e-mail: <a href="mailto:info@pro-edu.eu" className="text-amber-700 font-bold hover:underline">info@pro-edu.eu</a>.
          </p>
          <p>
            <strong>9.2.</strong> V případě sporu má spotřebitel právo na mimosoudní řešení u České obchodní inspekce (<a href="https://www.coi.cz" target="_blank" rel="noopener noreferrer" className="text-amber-700 font-bold hover:underline">www.coi.cz</a>).
          </p>
        </section>

        {/* 10. Ochrana osobních údajů */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900">10. Ochrana osobních údajů</h2>
          <p>
            <strong>10.1.</strong> Ochrana osobních údajů probíhá v souladu s nařízením GDPR. Podrobné informace jsou uvedeny v samostatném dokumentu <Link to="/gdpr" className="text-amber-700 font-bold hover:underline">Zpracování osobních dat (GDPR)</Link> na webu poskytovatele.
          </p>
        </section>

        {/* 11. Závěrečná ustanovení */}
        <section className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200/70 shadow-xs space-y-3">
          <h2 className="text-xl font-bold text-gray-900">11. Závěrečná ustanovení</h2>
          <p>
            <strong>11.1.</strong> Tyto OP jsou platné a účinné od 13. srpna 2026.
          </p>
          <p>
            <strong>11.2.</strong> Poskytovatel si vyhrazuje právo na změnu OP. Pro zákazníka je rozhodné znění účinné v okamžiku uzavření smlouvy.
          </p>
          <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs text-gray-500 gap-2">
            <span>V Praze dne 13. 8. 2026 | ProEdu, s.r.o.</span>
            <Link to="/gdpr" className="font-bold text-amber-700 hover:underline">
              Přejít na Zásady ochrany osobních údajů (GDPR) &rarr;
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
