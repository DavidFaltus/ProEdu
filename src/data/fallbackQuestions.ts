import { Question } from '../types';

export const FALLBACK_QUESTIONS: Question[] = [
  // ==========================================
  // MATEMATIKA - Počítání a čísla (5)
  // ==========================================
  {
    id: 'mat_num_1',
    question: 'Určete hodnotu výrazu: 3 * (-2)² - 4 * (2 - 5)',
    options: ['24', '0', '18', '20'],
    correctAnswer: '24',
    topic: 'Počítání a čísla',
    explanation: '3 * (-2)² - 4 * (-3) = 3 * 4 + 12 = 12 + 12 = 24.'
  },
  {
    id: 'mat_num_2',
    question: 'Vypočítejte a uveďte v základním tvaru: (2/3 - 1/2) : 5/6',
    options: ['1/5', '1/6', '5/36', '3/10'],
    correctAnswer: '1/5',
    topic: 'Počítání a čísla',
    explanation: '(4/6 - 3/6) : 5/6 = 1/6 * 6/5 = 1/5.'
  },
  {
    id: 'mat_num_3',
    question: 'Nalezněte nejmenší společný násobek (n) čísel 12 a 18.',
    options: ['36', '6', '72', '54'],
    correctAnswer: '36',
    topic: 'Počítání a čísla',
    explanation: 'Rozklad na prvočinitele: 12 = 2 * 2 * 3, 18 = 2 * 3 * 3. Nejmenší společný násobek je 2² * 3² = 4 * 9 = 36.'
  },
  {
    id: 'mat_num_4',
    question: 'Vyjádřete v metrech čtverečních: 0,35 km² + 4,5 ha',
    options: ['395 000 m²', '35 450 m²', '39 500 m²', '3 950 000 m²'],
    correctAnswer: '395 000 m²',
    topic: 'Počítání a čísla',
    explanation: '0,35 km² = 350 000 m², 4,5 ha = 45 000 m². Součet: 350 000 + 45 000 = 395 000 m².'
  },
  {
    id: 'mat_num_5',
    question: 'Které z následujících čísel je prvočíslo?',
    options: ['29', '15', '51', '91'],
    correctAnswer: '29',
    topic: 'Počítání a čísla',
    explanation: 'Číslo 29 je dělitelné pouze jedničkou a sebou samým. (15=3*5, 51=3*17, 91=7*13).'
  },

  // ==========================================
  // MATEMATIKA - Rovnice a výrazy (5)
  // ==========================================
  {
    id: 'mat_eq_1',
    question: 'Řešte rovnici pro reálné číslo x: 3(x - 2) + 5 = 2(2x + 1)',
    options: ['x = -3', 'x = 3', 'x = -1', 'x = 1'],
    correctAnswer: 'x = -3',
    topic: 'Rovnice a výrazy',
    explanation: 'Roznásobíme: 3x - 6 + 5 = 4x + 2 => 3x - 1 = 4x + 2 => -x = 3 => x = -3.'
  },
  {
    id: 'mat_eq_2',
    question: 'Zjednodušte výraz: (2a - b)² - (2a + b)(2a - b)',
    options: ['2b² - 4ab', '2b²', '-4ab', '-2b² + 4ab'],
    correctAnswer: '2b² - 4ab',
    topic: 'Rovnice a výrazy',
    explanation: '(4a² - 4ab + b²) - (4a² - b²) = 4a² - 4ab + b² - 4a² + b² = 2b² - 4ab.'
  },
  {
    id: 'mat_eq_3',
    question: 'Vypočítejte hodnotu výrazu 3x² - 2x + 5 pro x = -2.',
    options: ['21', '13', '17', '9'],
    correctAnswer: '21',
    topic: 'Rovnice a výrazy',
    explanation: 'Dosadíme: 3(-2)² - 2(-2) + 5 = 3(4) + 4 + 5 = 12 + 4 + 5 = 21.'
  },
  {
    id: 'mat_eq_4',
    question: 'Určete podmínky, za kterých má lomený výraz smysl: (x - 3) / (x² - 4)',
    options: ['x ≠ ±2', 'x ≠ 2', 'x ≠ 3', 'x ≠ ±3'],
    correctAnswer: 'x ≠ ±2',
    topic: 'Rovnice a výrazy',
    explanation: 'Jmenovatel se nesmí rovnat nule: x² - 4 ≠ 0 => (x - 2)(x + 2) ≠ 0 => x ≠ 2 a x ≠ -2.'
  },
  {
    id: 'mat_eq_5',
    question: 'Řešte rovnici: x/3 - (x-1)/2 = 1',
    options: ['x = -3', 'x = 3', 'x = -5', 'x = 5'],
    correctAnswer: 'x = -3',
    topic: 'Rovnice a výrazy',
    explanation: 'Vynásobíme 6: 2x - 3(x - 1) = 6 => 2x - 3x + 3 = 6 => -x = 3 => x = -3.'
  },

  // ==========================================
  // MATEMATIKA - Procenta poměry a data (5)
  // ==========================================
  {
    id: 'mat_pct_1',
    question: 'Kabát stál původně 2400 Kč. Byl zlevněn o 15 %. Kolik stojí po slevě?',
    options: ['2040 Kč', '2000 Kč', '2160 Kč', '1980 Kč'],
    correctAnswer: '2040 Kč',
    topic: 'Procenta poměry a data',
    explanation: 'Sleva: 15 % ze 2400 je 0,15 * 2400 = 360 Kč. Nová cena: 2400 - 360 = 2040 Kč.'
  },
  {
    id: 'mat_pct_2',
    question: 'Rozdělte částku 420 Kč v poměru 3 : 4. Jaká je větší část?',
    options: ['240 Kč', '180 Kč', '280 Kč', '300 Kč'],
    correctAnswer: '240 Kč',
    topic: 'Procenta poměry a data',
    explanation: 'Celkem dílů: 3 + 4 = 7. Jeden díl: 420 / 7 = 60 Kč. Větší část (4 díly): 4 * 60 = 240 Kč.'
  },
  {
    id: 'mat_pct_3',
    question: 'Na mapě s měřítkem 1 : 50 000 je vzdálenost dvou míst 6 cm. Jaká je skutečná vzdálenost?',
    options: ['3 km', '30 km', '300 m', '12 km'],
    correctAnswer: '3 km',
    topic: 'Procenta poměry a data',
    explanation: '6 cm * 50 000 = 300 000 cm = 3 000 m = 3 km.'
  },
  {
    id: 'mat_pct_4',
    question: 'Pokud 8 dělníků provede práci za 6 dní, za kolik dní ji provede 12 dělníků při stejném tempu?',
    options: ['4 dny', '9 dní', '3 dny', '5 dní'],
    correctAnswer: '4 dny',
    topic: 'Procenta poměry a data',
    explanation: 'Nepřímá úměrnost: 8 * 6 = 12 * x => 48 = 12x => x = 4 dny.'
  },
  {
    id: 'mat_pct_5',
    question: 'Průměrný věk čtyř sourozenců je 10 let. Pokud nejstaršímu je 16, jaký je průměrný věk zbylých tří?',
    options: ['8 let', '9 let', '10 let', '7 let'],
    correctAnswer: '8 let',
    topic: 'Procenta poměry a data',
    explanation: 'Celkový věk čtyř sourozenců: 4 * 10 = 40 let. Celkový věk tří zbylých: 40 - 16 = 24 let. Jejich průměr: 24 / 3 = 8 let.'
  },

  // ==========================================
  // MATEMATIKA - Geometrie (5)
  // ==========================================
  {
    id: 'mat_geo_1',
    question: 'Jaký je obsah pravoúhlého trojúhelníku s odvěsnami 6 cm a 8 cm?',
    options: ['24 cm²', '48 cm²', '14 cm²', '10 cm²'],
    correctAnswer: '24 cm²',
    topic: 'Geometrie',
    explanation: 'Obsah S = (a * b) / 2 = (6 * 8) / 2 = 48 / 2 = 24 cm².'
  },
  {
    id: 'mat_geo_2',
    question: 'Vypočítejte výšku rovnostranného trojúhelníku o straně a = 6 cm.',
    options: ['3√3 cm', '3 cm', '6√3 cm', '3√2 cm'],
    correctAnswer: '3√3 cm',
    topic: 'Geometrie',
    explanation: 'Výška v = a * √3 / 2 = 6 * √3 / 2 = 3√3 cm.'
  },
  {
    id: 'mat_geo_3',
    question: 'Kvádr s rozměry podstavy 3 cm a 4 cm má objem 60 cm³. Jaká je jeho výška?',
    options: ['5 cm', '10 cm', '12 cm', '15 cm'],
    correctAnswer: '5 cm',
    topic: 'Geometrie',
    explanation: 'Objem V = a * b * c => 60 = 3 * 4 * v => 60 = 12v => v = 5 cm.'
  },
  {
    id: 'mat_geo_4',
    question: 'Jaký je vnitřní úhel v pravidelném šestiúhelníku?',
    options: ['120°', '108°', '90°', '135°'],
    correctAnswer: '120°',
    topic: 'Geometrie',
    explanation: 'Součet úhlů: (n - 2) * 180° = 4 * 180° = 720°. Jeden úhel: 720° / 6 = 120°.'
  },
  {
    id: 'mat_geo_5',
    question: 'Kružnice opsaná pravoúhlému trojúhelníku má poloměr 5 cm. Jak dlouhá je jeho přepona?',
    options: ['10 cm', '5 cm', '7,5 cm', '8 cm'],
    correctAnswer: '10 cm',
    topic: 'Geometrie',
    explanation: 'Thaletova věta: přepona pravoúhlého trojúhelníku je průměrem kružnice opsané. Průměr d = 2 * r = 2 * 5 = 10 cm.'
  },

  // ==========================================
  // MATEMATIKA - Rýsování (5)
  // ==========================================
  {
    id: 'mat_draw_1',
    question: 'Co je to osa úhlu?',
    options: ['Polopřímka dělící úhel na dvě shodné části', 'Přímka kolmá k ramenu úhlu', 'Úsečka spojující ramena úhlu', 'Kružnice procházející vrcholem'],
    correctAnswer: 'Polopřímka dělící úhel na dvě shodné části',
    topic: 'Rýsování',
    explanation: 'Osa úhlu dělí daný úhel na dvě stejné poloviny a prochází jeho vrcholem.'
  },
  {
    id: 'mat_draw_2',
    question: 'Jaká je definice Thaletovy kružnice nad průměrem AB?',
    options: ['Množina vrcholů všech pravoúhlých trojúhelníků s přeponou AB', 'Kružnice se středem v bodě A a poloměrem AB', 'Kružnice opsaná rovnostrannému trojúhelníku', 'Kružnice dotýkající se obou os souřadnic'],
    correctAnswer: 'Množina vrcholů všech pravoúhlých trojúhelníků s přeponou AB',
    topic: 'Rýsování',
    explanation: 'Thaletova kružnice nad průměrem AB (vyjma bodů A, B) je množinou bodů v rovině, ze kterých je úsečka AB vidět pod pravým úhlem.'
  },
  {
    id: 'mat_draw_3',
    question: 'Při konstrukci trojúhelníku ABC jsou dány strany a, b a úhel γ. Jakou větu o shodnosti trojúhelníků použijete?',
    options: ['sus', 'sss', 'usu', 'Ssu'],
    correctAnswer: 'sus',
    topic: 'Rýsování',
    explanation: 'Máme zadanou stranu (b), úhel mezi nimi (γ) a druhou stranu (a) -> věta strana-úhel-strana (sus).'
  },
  {
    id: 'mat_draw_4',
    question: 'Který bod je průsečíkem výšek v trojúhelníku?',
    options: ['Ortocentrum', 'Těžiště', 'Střed kružnice opsané', 'Střed kružnice vepsané'],
    correctAnswer: 'Ortocentrum',
    topic: 'Rýsování',
    explanation: 'Průsečík výšek v trojúhelníku se nazývá ortocentrum.'
  },
  {
    id: 'mat_draw_5',
    question: 'Trojúhelník lze sestrojit, pokud platí trojúhelníková nerovnost. Kterou trojici délek stran nelze použít?',
    options: ['3 cm, 4 cm, 8 cm', '5 cm, 5 cm, 5 cm', '6 cm, 8 cm, 10 cm', '3 cm, 5 cm, 7 cm'],
    correctAnswer: '3 cm, 4 cm, 8 cm',
    topic: 'Rýsování',
    explanation: 'Trojúhelníková nerovnost říká, že součet dvou libovolných stran musí být větší než strana třetí. Zde 3 + 4 = 7, což není více než 8.'
  },

  // ==========================================
  // MATEMATIKA - Slovní úlohy (5)
  // ==========================================
  {
    id: 'mat_word_1',
    question: 'Petr šel na výlet rychlostí 4 km/h. O 2 hodiny později za ním vyjel cyklista rychlostí 12 km/h. Za jak dlouho od startu cyklisty ho dohoní?',
    options: ['1 hodinu', '1,5 hodiny', '2 hodiny', '45 minut'],
    correctAnswer: '1 hodinu',
    topic: 'Slovní úlohy',
    explanation: 'Dráhy se rovnají: s1 = s2 => v1 * (t + 2) = v2 * t => 4(t + 2) = 12t => 4t + 8 = 12t => 8 = 8t => t = 1 hodina.'
  },
  {
    id: 'mat_word_2',
    question: 'Jeden přítok napustí bazén za 6 hodin, druhý za 12 hodin. Za jak dlouho se bazén napustí, pokud budou otevřeny oba současně?',
    options: ['4 hodiny', '9 hodin', '3 hodiny', '5 hodin'],
    correctAnswer: '4 hodiny',
    topic: 'Slovní úlohy',
    explanation: 'Společná práce: 1/6 + 1/12 = 1/t => 2/12 + 1/12 = 3/12 = 1/4 => t = 4 hodiny.'
  },
  {
    id: 'mat_word_3',
    question: 'Na farmě jsou slepice a králíci. Celkem mají 35 hlav a 94 nohou. Kolik je na farmě králíků?',
    options: ['12', '23', '15', '20'],
    correctAnswer: '12',
    topic: 'Slovní úlohy',
    explanation: 'Soustava rovnic: s + k = 35, 2s + 4k = 94. Z první s = 35 - k => 2(35 - k) + 4k = 94 => 70 - 2k + 4k = 94 => 2k = 24 => k = 12.'
  },
  {
    id: 'mat_word_4',
    question: 'Cena knihy byla nejprve zvýšena o 20 % a poté byla nová cena snížena o 20 %. Jak se změnila původní cena?',
    options: ['Klesla o 4 %', 'Nezměnila se', 'Stoupla o 2 %', 'Klesla o 2 %'],
    correctAnswer: 'Klesla o 4 %',
    topic: 'Slovní úlohy',
    explanation: 'Původní cena x. Zvýšení: 1,2x. Snížení: 1,2x * 0,8 = 0,96x. Cena tedy klesla na 96 % původní, což je pokles o 4 %.'
  },
  {
    id: 'mat_word_5',
    question: 'Auto spotřebuje 6 litrů benzínu na 100 km. Kolik litrů spotřebuje na cestu dlouhou 250 km?',
    options: ['15 litrů', '12 litrů', '18 litrů', '20 litrů'],
    correctAnswer: '15 litrů',
    topic: 'Slovní úlohy',
    explanation: 'Na 100 km spotřebuje 6 litrů, na 50 km spotřebuje 3 litry. Celkem 6 + 6 + 3 = 15 litrů.'
  },

  // ==========================================
  // MATEMATIKA - Logické chytáky (5)
  // ==========================================
  {
    id: 'mat_log_1',
    question: 'V řadě stojí 5 dětí. Každé z nich má jednoho sourozence právě vedle sebe. Jaký je nejmenší možný počet dětí z jedné rodiny v této řadě?',
    options: ['2', '1', '3', '4'],
    correctAnswer: '2',
    topic: 'Logické chytáky',
    explanation: 'Aby mělo každé dítě sourozence vedle sebe, musí tvořit dvojice. Nejmenší možný počet dětí z jedné rodiny v této řadě je 2 (např. konfigurace rodin AA BBB).'
  },
  {
    id: 'mat_log_2',
    question: 'Pokračujte v řadě čísel: 2, 6, 12, 20, 30, ...',
    options: ['42', '36', '40', '50'],
    correctAnswer: '42',
    topic: 'Logické chytáky',
    explanation: 'Rozdíly mezi členy jsou postupně: +4, +6, +8, +10. Další rozdíl musí být +12. 30 + 12 = 42.'
  },
  {
    id: 'mat_log_3',
    question: 'Pokud v košíku zbývá jedno jablko a v místnosti je pět lidí, jak rozdělíte 5 jablek mezi 5 lidí tak, aby každý dostal jedno, ale jedno jablko zůstalo v košíku?',
    options: ['Poslední člověk dostane jablko i s košíkem', 'Jedno jablko rozkrojíme', 'Jeden člověk nedostane nic', 'Košík si nechá učitel'],
    correctAnswer: 'Poslední člověk dostane jablko i s košíkem',
    topic: 'Logické chytáky',
    explanation: 'Čtyři lidé dostanou po jednom jablku a pátý člověk dostane košík, ve kterém leží to poslední jablko.'
  },
  {
    id: 'mat_log_4',
    question: 'Hlemýžď leze na 10 metrů vysokou zeď. Přes den vyleze 3 metry, v noci sklouzne o 2 metry dolů. Za kolik dní dosáhne vrcholu?',
    options: ['8 dní', '10 dní', '7 dní', '9 dní'],
    correctAnswer: '8 dní',
    topic: 'Logické chytáky',
    explanation: 'Každý den čistý zisk 1 metr. Po 7 dnech je ve výšce 7 metrů. 8. den vyleze 3 metry a dosáhne vrcholu (10m), už nesklouzne dolů.'
  },
  {
    id: 'mat_log_5',
    question: 'Kolikrát lze odečíst číslo 5 od čísla 25?',
    options: ['Pouze jednou', 'Pětkrát', 'Nekonečněkrát', 'Čtyřikrát'],
    correctAnswer: 'Pouze jednou',
    topic: 'Logické chytáky',
    explanation: 'Protože jakmile odečtete 5 jednou, už neodečítáte od čísla 25, ale od čísla 20.'
  },

  // ==========================================
  // ČEŠTINA - Pravopis a chytáky (5)
  // ==========================================
  {
    id: 'cze_orth_1',
    question: 'Doplňte správně i/y: Dívky se na koncertu rozezpíval_ a diváci nadšeně tleskal_.',
    options: ['-y, -i', '-y, -y', '-i, -i', '-i, -y'],
    correctAnswer: '-y, -i',
    topic: 'Pravopis a chytáky',
    explanation: 'Shoda přísudku s podmětem: Podmět "dívky" (rod ženský) -> rozezpívaly. Podmět "diváci" (rod mužský životný) -> tleskali.'
  },
  {
    id: 'cze_orth_2',
    question: 'Které slovo je napsáno pravopisně SPRÁVNĚ?',
    options: ['výjimka', 'vyjímka', 'vihýbat', 'víminka'],
    correctAnswer: 'výjimka',
    topic: 'Pravopis a chytáky',
    explanation: 'Slovo "výjimka" se píše s dlouhým "ý" a krátkým "i", je to častý pravopisný chyták.'
  },
  {
    id: 'cze_orth_3',
    question: 'Doplňte správná písmena: Udělal to z čistého zapomnětl_vost_. V noci se mi zdál sm_šný sen.',
    options: ['-i-i, -i-', '-y-i, -y-', '-i-y, -i-', '-y-y, -y-'],
    correctAnswer: '-i-i, -i-',
    topic: 'Pravopis a chytáky',
    explanation: 'zapomnětlivosti (přípona -ivý, vzor kost), smíšný -> smát se -> směšný / směšný sen.'
  },
  {
    id: 'cze_orth_4',
    question: 'Která z následujících vět obsahuje pravopisnou CHYBU?',
    options: ['Oba psi hlasitě vyli na měsíc.', 'Vlci vyli v lese celou noc.', 'Vili jsme krásné věnce z pampelišek.', 'Chlapci vilily na zahradě vodu.'],
    correctAnswer: 'Chlapci vilily na zahradě vodu.',
    topic: 'Pravopis a chytáky',
    explanation: 'Ve slově "vilily" (vylévali vodu) má být tvrdé "y" (vylít/vylévat) a shoda s rodem mužským životným "chlapci vylili". správně: vylili.'
  },
  {
    id: 'cze_orth_5',
    question: 'Doplňte správné předložky s/z: Vstal __ postele a setřel prach __ stolu.',
    options: ['z, ze', 's, se', 'z, s', 's, z'],
    correctAnswer: 'z, ze',
    topic: 'Pravopis a chytáky',
    explanation: 'Předložka z/ze vyjadřuje směr zevnitř ven (z postele) a z povrchu pryč (ze stolu).'
  },

  // ==========================================
  // ČEŠTINA - Gramatika (stavba slov, vět) (5)
  // ==========================================
  {
    id: 'cze_gram_1',
    question: 'Určete větný člen: Včera jsme na zahradě spatřili neznámého PTÁKA.',
    options: ['Předmět', 'Podmět', 'Přívlastek shodný', 'Doplněk'],
    correctAnswer: 'Předmět',
    topic: 'Gramatika (stavba slov, vět)',
    explanation: 'Spatřili jsme (koho, co?) -> ptáka. Jedná se o předmět ve 4. pádě.'
  },
  {
    id: 'cze_gram_2',
    question: 'Kolik vět obsahuje následující souvětí? "Když jsme přišli domů, zjistili jsme, že nikdo není doma, a tak jsme si pustili televizi."',
    options: ['4', '3', '5', '2'],
    correctAnswer: '4',
    topic: 'Gramatika (stavba slov, vět)',
    explanation: 'Věty poznáme podle počtu určitých slovesných tvarů: 1. Když jsme přišli, 2. zjistili jsme, 3. že nikdo není doma, 4. pustili jsme si.'
  },
  {
    id: 'cze_gram_3',
    question: 'Jaký slovní druh je slovo "rychle" ve větě "Běžel velmi rychle"?',
    options: ['Příslovce', 'Přídavné jméno', 'Sloveso', 'Částice'],
    correctAnswer: 'Příslovce',
    topic: 'Gramatika (stavba slov, vět)',
    explanation: 'Slovo "rychle" vyjadřuje způsob děje (jak běžel?) a je to příslovce.'
  },
  {
    id: 'cze_gram_4',
    question: 'Která z možností správně rozebírá slovo "podmořský" podle stavby slova?',
    options: ['pod- (předpona), -moř- (kořen), -ský (přípona)', 'podmoř- (kořen), -ský (přípona)', 'po- (předpona), -dmoř- (kořen), -ský (přípona)', 'pod- (předpona), -mořský (kořen)'],
    correctAnswer: 'pod- (předpona), -moř- (kořen), -ský (přípona)',
    topic: 'Gramatika (stavba slov, vět)',
    explanation: 'Základem slova je "moře" (kořen -moř-), předpona je pod-, příponová část je -ský.'
  },
  {
    id: 'cze_gram_5',
    question: 'Který z následujících poměrů mezi větami hlavními vyjadřuje spojka "nebo"?',
    options: ['Vylučovací', 'Slučovací', 'Odporovací', 'Důsledkový'],
    correctAnswer: 'Vylučovací',
    topic: 'Gramatika (stavba slov, vět)',
    explanation: 'Spojka "nebo" vyjadřuje poměr vylučovací (platí buď jedna, nebo druhá varianta).'
  },

  // ==========================================
  // ČEŠTINA - Spisovnost a významy slov (5)
  // ==========================================
  {
    id: 'cze_voc_1',
    question: 'Které z následujících slov je synonymem ke slovu "efektivní"?',
    options: ['Účinný', 'Pomalý', 'Zajímavý', 'Nápadný'],
    correctAnswer: 'Účinný',
    topic: 'Spisovnost a významy slov',
    explanation: 'Efektivní znamená přinášející dobré výsledky, tedy účinný či výkonný.'
  },
  {
    id: 'cze_voc_2',
    question: 'Určete vztah mezi slovy "zámek" (budova) a "zámek" (na klíč).',
    options: ['Homonyma', 'Synonyma', 'Antonyma', 'Hyperonyma'],
    correctAnswer: 'Homonyma',
    topic: 'Spisovnost a významy slov',
    explanation: 'Slova homonymní (souzvučná) znějí stejně, ale mají zcela odlišný původ a význam.'
  },
  {
    id: 'cze_voc_3',
    question: 'Co znamená frazeologické spojení "vzít nohy na ramena"?',
    options: ['Rychle utéct', 'Unavit se', 'Udělat kotrmelec', 'Být ohebný'],
    correctAnswer: 'Rychle utéct',
    topic: 'Spisovnost a významy slov',
    explanation: 'Tento frazeologismus vyjadřuje spěšný útěk nebo úprk.'
  },
  {
    id: 'cze_voc_4',
    question: 'Který z následujících tvarů 2. pádu množného čísla podstatného jména "ruce" je spisovný?',
    options: ['rukou', 'ruku', 'rukách', 'rucem'],
    correctAnswer: 'rukou',
    topic: 'Spisovnost a významy slov',
    explanation: 'Spisovný tvar genitivu plurálu je "rukou" (případně hovorově spisovné rukou). Ostatní tvary jsou nespisovné.'
  },
  {
    id: 'cze_voc_5',
    question: 'Které z následujících slov je archaismus (zastaralé slovo)?',
    options: ['Almara', 'Počítač', 'Internet', 'Smartphone'],
    correctAnswer: 'Almara',
    topic: 'Spisovnost a významy slov',
    explanation: 'Almara je zastaralé označení pro skříň.'
  },

  // ==========================================
  // ČEŠTINA - Práce s textem a sloh (5)
  // ==========================================
  {
    id: 'cze_text_1',
    question: 'Který funkční styl je charakteristický pro novinové články a zprávy?',
    options: ['Publicistický', 'Umělecký', 'Odborný', 'Prostěsdělovací'],
    correctAnswer: 'Publicistický',
    topic: 'Práce s textem a sloh',
    explanation: 'Publicistický styl slouží k informování veřejnosti o aktuálních událostech prostřednictvím médií.'
  },
  {
    id: 'cze_text_2',
    question: 'Který slohový útvar je nejvhodnější pro detailní popis chování a vlastností konkrétní osoby?',
    options: ['Charakteristika', 'Úvaha', 'Zpráva', 'Popis pracovního postupu'],
    correctAnswer: 'Charakteristika',
    topic: 'Práce s textem a sloh',
    explanation: 'Charakteristika zachycuje vnitřní i vnější vlastnosti osoby, její povahu a chování.'
  },
  {
    id: 'cze_text_3',
    question: 'Co je hlavním cílem úvahy jako slohového útvaru?',
    options: ['Zamyslet se nad problémem a vyjádšit vlastní názor', 'Pravdivě informovat o nehodě', 'Popsat složení stroje', 'Povědět vtipnou příhodu'],
    correctAnswer: 'Zamyslet se nad problémem a vyjádšit vlastní názor',
    topic: 'Práce s textem a sloh',
    explanation: 'Úvaha rozebírá myšlenky autora, hledá souvislosti a nutí čtenáře k zamyšlení.'
  },
  {
    id: 'cze_text_4',
    question: 'Co vyjadřuje pointa příběhu?',
    options: ['Nečekané a překvapivé vyvrcholení nebo závěr děje', 'Úvodní představení postav', 'Seznam použité literatury', 'Popis krajiny'],
    correctAnswer: 'Nečekané a překvapivé vyvrcholení nebo závěr děje',
    topic: 'Práce s textem a sloh',
    explanation: 'Pointa je nečekaný zvrat, vtipné či překvapivé zakončení vyprávění.'
  },
  {
    id: 'cze_text_5',
    question: 'Která z následujících možností nejlépe popisuje pojem "kontext"?',
    options: ['Souvislost, ve které se slovo nebo text vyskytuje', 'Slovník cizích slov', 'Pravopisná příručka', 'Rozdělení textu na odstavce'],
    correctAnswer: 'Souvislost, ve které se slovo nebo text vyskytuje',
    topic: 'Práce s textem a sloh',
    explanation: 'Kontext určuje přesný význam slov podle věty či textu, ve kterém jsou použita.'
  },

  // ==========================================
  // ČEŠTINA - Literatura a poezie (5)
  // ==========================================
  {
    id: 'cze_lit_1',
    question: 'Kdo je autorem slavné básnické sbírky "Kytice"?',
    options: ['Karel Jaromír Erben', 'Karel Hynek Mácha', 'Jan Neruda', 'Karel Čapek'],
    correctAnswer: 'Karel Jaromír Erben',
    topic: 'Literatura a poezie',
    explanation: 'Kytici z pověstí národních napsal Karel Jaromír Erben a vyšla roku 1853.'
  },
  {
    id: 'cze_lit_2',
    question: 'Jak se nazývá básnický prostředek založený na přenosu vlastností živé bytosti na věc? (např. "potok zpívá")',
    options: ['Personifikace', 'Metafora', 'Přirovnání', 'Hyperbola'],
    correctAnswer: 'Personifikace',
    topic: 'Literatura a poezie',
    explanation: 'Personifikace (polidštění) přisuzuje neživým věcem lidské vlastnosti či jednání.'
  },
  {
    id: 'cze_lit_3',
    question: 'Který literární žánr představuje krátký příběh, ve kterém vystupují zvířata s lidskými vlastnostmi a plyne z něj ponaučení?',
    options: ['Bajka', 'Pohádka', 'Pověst', 'Román'],
    correctAnswer: 'Bajka',
    topic: 'Literatura a poezie',
    explanation: 'Bajka je alegorický žánr, kde zvířata jednají jako lidé a v závěru je moralizující ponaučení.'
  },
  {
    id: 'cze_lit_4',
    question: 'Jak se nazývá rým s rýmovým schématem AABB?',
    options: ['Sdružený', 'Střídavý', 'Obkročný', 'Přerývaný'],
    correctAnswer: 'Sdružený',
    topic: 'Literatura a poezie',
    explanation: 'Rým sdružený spojuje dva sousední verše (AABB).'
  },
  {
    id: 'cze_lit_5',
    question: 'Které dílo Karla Čapka varuje před nebezpečím fašismu a zneužitím technologií?',
    options: ['Bílá nemoc', 'R.U.R.', 'Devatero pohádek', 'Zahradníkův rok'],
    correctAnswer: 'Bílá nemoc',
    topic: 'Literatura a poezie',
    explanation: 'Drama Bílá nemoc (1937) reaguje na nástup nacismu a varuje před válečnou hrozbou.'
  },

  // ==========================================
  // ANGLIČTINA - Poslech a porozumění (5)
  // ==========================================
  {
    id: 'eng_list_1',
    question: 'Complete the dialogue: "Could you tell me how to get to the library?" - "________"',
    options: ['Go straight on and turn left.', 'Yes, I like reading books.', 'The library is closed today.', 'I have many books at home.'],
    correctAnswer: 'Go straight on and turn left.',
    topic: 'Poslech a porozumění',
    explanation: 'The question asks for directions ("how to get to..."), so the correct response gives directions.'
  },
  {
    id: 'eng_list_2',
    question: 'Which of the following phrases is most suitable for ordering food in a restaurant?',
    options: ['I would like to have the tomato soup, please.', 'Give me the soup now.', 'What are you eating?', 'I want to cook some soup.'],
    correctAnswer: 'I would like to have the tomato soup, please.',
    topic: 'Poslech a porozumění',
    explanation: '"I would like to have..." is the polite standard way to order food in English.'
  },
  {
    id: 'eng_list_3',
    question: 'Complete the reaction: "I passed my driving test yesterday!" - "________"',
    options: ['Congratulations! That is great news.', 'Never mind, try again.', 'What a pity!', 'I do not have a car.'],
    correctAnswer: 'Congratulations! That is great news.',
    topic: 'Poslech a porozumění',
    explanation: 'Passing a test is an achievement, so the standard response is to congratulate the speaker.'
  },
  {
    id: 'eng_list_4',
    question: 'Read the short text: "Sarah was late because she missed the bus. She had to walk to school in the rain." Why was Sarah wet?',
    options: ['Because it was raining and she walked.', 'Because she took a shower.', 'Because she swam in the pool.', 'Because she missed the bus.'],
    correctAnswer: 'Because it was raining and she walked.',
    topic: 'Poslech a porozumění',
    explanation: 'The text states she walked in the rain, which is why she got wet.'
  },
  {
    id: 'eng_list_5',
    question: 'Complete: "How long does it take to fly to London?" - "________"',
    options: ['About two hours.', 'By plane.', 'It is very cheap.', 'London is big.'],
    correctAnswer: 'About two hours.',
    topic: 'Poslech a porozumění',
    explanation: '"How long does it take..." asks for a duration of time, so "About two hours" is the correct response.'
  },

  // ==========================================
  // ANGLIČTINA - Slovní zásoba (5)
  // ==========================================
  {
    id: 'eng_voc_1',
    question: 'What is the opposite of the word "generous"?',
    options: ['Mean', 'Kind', 'Polite', 'Rich'],
    correctAnswer: 'Mean',
    topic: 'Slovní zásoba',
    explanation: '"Generous" means willing to give money or help. The opposite is "mean" (unwilling to share or spend money).'
  },
  {
    id: 'eng_voc_2',
    question: 'Which word describes a person who is very good at learning and understanding things?',
    options: ['Intelligent', 'Lazy', 'Stubborn', 'Impatient'],
    correctAnswer: 'Intelligent',
    topic: 'Slovní zásoba',
    explanation: '"Intelligent" or smart is the term for someone who learns and understands quickly.'
  },
  {
    id: 'eng_voc_3',
    question: 'Choose the correct word: "We need to ________ a table at the restaurant for tonight."',
    options: ['book', 'make', 'order', 'keep'],
    correctAnswer: 'book',
    topic: 'Slovní zásoba',
    explanation: 'To reserve a table or room is commonly expressed as "to book a table".'
  },
  {
    id: 'eng_voc_4',
    question: 'Which of the following is a fruit?',
    options: ['Peach', 'Cabbage', 'Onion', 'Beef'],
    correctAnswer: 'Peach',
    topic: 'Slovní zásoba',
    explanation: 'A peach is a sweet fruit. Cabbage and onion are vegetables, beef is meat.'
  },
  {
    id: 'eng_voc_5',
    question: 'What does the word "annual" mean?',
    options: ['Happening once every year', 'Very old', 'Extremely large', 'Happening monthly'],
    correctAnswer: 'Happening once every year',
    topic: 'Slovní zásoba',
    explanation: '"Annual" refers to events that take place once a year.'
  },

  // ==========================================
  // ANGLIČTINA - Časy a pomocná slovesa (5)
  // ==========================================
  {
    id: 'eng_tns_1',
    question: 'Choose the correct form: "She ________ to Spain three times so far."',
    options: ['has been', 'was', 'went', 'has gone'],
    correctAnswer: 'has been',
    topic: 'Časy a pomocná slovesa',
    explanation: 'We use the Present Perfect ("has been") to describe life experiences up to the present, especially with "so far".'
  },
  {
    id: 'eng_tns_2',
    question: 'Complete the sentence: "While I ________ my homework, my phone suddenly rang."',
    options: ['was doing', 'did', 'have done', 'am doing'],
    correctAnswer: 'was doing',
    topic: 'Časy a pomocná slovesa',
    explanation: 'The past continuous ("was doing") is used for a longer background activity that was interrupted by a shorter action (past simple "rang").'
  },
  {
    id: 'eng_tns_3',
    question: 'Identify the correct question: "________ you see the movie last night?"',
    options: ['Did', 'Have', 'Do', 'Were'],
    correctAnswer: 'Did',
    topic: 'Časy a pomocná slovesa',
    explanation: '"Last night" indicates past simple, which forms questions using the auxiliary verb "did".'
  },
  {
    id: 'eng_tns_4',
    question: 'Complete: "I think it ________ rain tomorrow, so take an umbrella."',
    options: ['will', 'is going', 'must to', 'does'],
    correctAnswer: 'will',
    topic: 'Časy a pomocná slovesa',
    explanation: 'We use "will" for predictions about the future based on opinions or thoughts ("I think").'
  },
  {
    id: 'eng_tns_5',
    question: 'Complete: "He ________ not like playing football when he was a child."',
    options: ['did', 'does', 'was', 'has'],
    correctAnswer: 'did',
    topic: 'Časy a pomocná slovesa',
    explanation: '"When he was a child" refers to the past, so the past auxiliary verb "did" is correct.'
  },

  // ==========================================
  // ANGLIČTINA - Předložky (5)
  // ==========================================
  {
    id: 'eng_prep_1',
    question: 'Fill in the blank: "My birthday is ________ October 15th."',
    options: ['on', 'in', 'at', 'by'],
    correctAnswer: 'on',
    topic: 'Předložky',
    explanation: 'We use "on" for specific dates (on October 15th) and days (on Monday).'
  },
  {
    id: 'eng_prep_2',
    question: 'Complete: "I am interested ________ learning new languages."',
    options: ['in', 'about', 'at', 'on'],
    correctAnswer: 'in',
    topic: 'Předložky',
    explanation: 'The adjective "interested" takes the dependent preposition "in" (interested in something).'
  },
  {
    id: 'eng_prep_3',
    question: 'Complete: "She is good ________ playing the piano."',
    options: ['at', 'in', 'for', 'with'],
    correctAnswer: 'at',
    topic: 'Předložky',
    explanation: 'We say someone is "good at" (or "bad at") doing an activity.'
  },
  {
    id: 'eng_prep_4',
    question: 'Complete: "We arrived ________ the airport just in time for our flight."',
    options: ['at', 'in', 'to', 'on'],
    correctAnswer: 'at',
    topic: 'Předložky',
    explanation: 'We generally use "arrive at" for specific places or buildings like airports, hotels, etc. (We use "arrive in" for cities/countries).'
  },
  {
    id: 'eng_prep_5',
    question: 'Complete: "The keys are ________ the drawer next to your bed."',
    options: ['in', 'on', 'at', 'under'],
    correctAnswer: 'in',
    topic: 'Předložky',
    explanation: '"In the drawer" is correct because the drawer is an enclosed space.'
  },

  // ==========================================
  // ANGLIČTINA - Ustálené vazby (5)
  // ==========================================
  {
    id: 'eng_col_1',
    question: 'Complete: "I am looking forward to ________ you next week."',
    options: ['seeing', 'see', 'to see', 'saw'],
    correctAnswer: 'seeing',
    topic: 'Ustálené vazby',
    explanation: 'The phrase "look forward to" is followed by the gerund (verb-ing).'
  },
  {
    id: 'eng_col_2',
    question: 'Choose the correct phrasal verb: "Please ________ the lights when you leave the room."',
    options: ['turn off', 'turn on', 'take off', 'look after'],
    correctAnswer: 'turn off',
    topic: 'Ustálené vazby',
    explanation: '"Turn off" means to stop the flow of electricity/lights. "Turn on" is to start them.'
  },
  {
    id: 'eng_col_3',
    question: 'Complete: "She decided to ________ up tennis because she wanted to get fit."',
    options: ['take', 'make', 'do', 'go'],
    correctAnswer: 'take',
    topic: 'Ustálené vazby',
    explanation: 'The phrasal verb "take up" means to start a new hobby or sport.'
  },
  {
    id: 'eng_col_4',
    question: 'Complete: "I need to ________ a decision about my future soon."',
    options: ['make', 'do', 'take', 'have'],
    correctAnswer: 'make',
    topic: 'Ustálené vazby',
    explanation: 'In English, we say "make a decision" (not do a decision).'
  },
  {
    id: 'eng_col_5',
    question: 'Complete: "He did not study at all, so he failed the exam. In other words, he ________ his time."',
    options: ['wasted', 'lost', 'missed', 'spent'],
    correctAnswer: 'wasted',
    topic: 'Ustálené vazby',
    explanation: '"Waste time" means to use time badly or on useless things.'
  },

  // ==========================================
  // ANGLIČTINA - Stavba věty (5)
  // ==========================================
  {
    id: 'eng_sen_1',
    question: 'Which of the following sentences has the correct word order?',
    options: [
      'He always goes to the gym on Mondays.',
      'Always he goes on Mondays to the gym.',
      'He goes to the gym always on Mondays.',
      'Mondays he goes always to the gym.'
    ],
    correctAnswer: 'He always goes to the gym on Mondays.',
    topic: 'Stavba věty',
    explanation: 'The adverb of frequency ("always") goes before the main verb ("goes"). The place ("to the gym") goes before time ("on Mondays").'
  },
  {
    id: 'eng_sen_2',
    question: 'Complete the sentence (First Conditional): "If it ________ tomorrow, we will stay at home."',
    options: ['rains', 'will rain', 'rain', 'rained'],
    correctAnswer: 'rains',
    topic: 'Stavba věty',
    explanation: 'In the first conditional, the "if-clause" takes the present simple ("rains") and the main clause takes the future ("will stay").'
  },
  {
    id: 'eng_sen_3',
    question: 'Choose the correct relative pronoun: "The girl ________ lives next door is a doctor."',
    options: ['who', 'which', 'whom', 'whose'],
    correctAnswer: 'who',
    topic: 'Stavba věty',
    explanation: 'We use the relative pronoun "who" to refer to people.'
  },
  {
    id: 'eng_sen_4',
    question: 'Complete: "He asked me where ________."',
    options: ['I lived', 'did I live', 'do I live', 'I live'],
    correctAnswer: 'I lived',
    topic: 'Stavba věty',
    explanation: 'In reported questions, we use statement word order (subject + verb) and shift the tense back (past simple "I lived").'
  },
  {
    id: 'eng_sen_5',
    question: 'Choose the correct passive voice sentence for: "The chef cooked the meal."',
    options: [
      'The meal was cooked by the chef.',
      'The meal is cooked by the chef.',
      'The chef was cooked by the meal.',
      'The meal had cooked by the chef.'
    ],
    correctAnswer: 'The meal was cooked by the chef.',
    topic: 'Stavba věty',
    explanation: 'Past Simple passive is formed with was/were + past participle ("was cooked").'
  }
];
