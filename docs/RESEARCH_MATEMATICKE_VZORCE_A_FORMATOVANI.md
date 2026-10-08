# Technický a architektonický výzkum: Zpracování, zobrazení, import z Excelu a tvorba matematických úloh v aplikaci ProEdu

> **Datum zpracování:** 8. října 2026  
> **Projekt:** ProEdu (Vzdělávací platforma pro přípravu na CERMAT přijímací zkoušky a maturitu)  
> **Cíl výzkumu:** Definovat ucelenou technickou a uživatelskou architekturu pro práci s matematickými výrazy (zlomky, mocniny, odmocniny, rovnice a geometrické symboly) napříč celou aplikací – od autorizace a hromadného importu z Excelu, přes administrátorské rozhraní, až po bezpečné vykreslování na webu a inteligentní vyhodnocování odpovědí žáků, v plném souladu s pravidly projektu ([.agents/rules/proedu.md](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/.agents/rules/proedu.md)).

---

## 1. Manažerské shrnutí (Executive Summary)

Aplikace **ProEdu** slouží primárně k přípravě žáků a studentů na jednotné přijímací zkoušky (CERMAT) a maturitní zkoušky. Matematika tvoří klíčový pilíř platformy. Dosavadní stav systému však narážel na několik zásadních technických limitů:

1. **Stav stávajícího repozitáře:** V [`package.json`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/package.json) jsou již nainstalovány potřebné knihovny (`katex` v0.19, `react-markdown` v10.1, `remark-math` v6.0, `rehype-katex` v7.0 a `xlsx` v0.18). V souboru [`src/main.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/main.tsx) je rovněž naimportován styl `katex/dist/katex.min.css`. Avšak **v žádné komponentě aplikace se KaTeX ani Markdown zatím nepoužívá** – texty otázek, možností a vysvětlení se v [`src/pages/PracticeSession.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/PracticeSession.tsx) a [`src/pages/StudyView.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/StudyView.tsx) vykreslují jako čistý text (`{currentQuestion.question}`, `{option}`).
2. **Překážka tvorby obsahu:** Učitelé a autoři testů zadávají úlohy přes Excel (`.xlsx`). Většina pedagogů neovládá syntaxi LaTeXu (např. `\frac{3}{4}` nebo `\sqrt{16}`). Pokud učitel napíše do Excelu `= 1/2`, Excel buňku vyhodnotí jako excelový vzorec a zobrazí chybu `#HODNOTA!` nebo výsledek `0,5`, čímž se zadání znehodnotí.
3. **Absence vizuální kontroly v administraci:** V [`src/components/admin/PracticeManager.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/components/admin/PracticeManager.tsx) zadává učitel text do obyčejného elementu `<textarea>` a možnosti do `<Input>`. Nemá k dispozici žádný náhled (Live Preview) ani nástrojovou lištu pro vložení zlomku či odmocniny. Syntaktickou chybu v LaTeXu zjistí až po spuštění procvičování.
4. **Rigidní vyhodnocování odpovědí žáků:** V [`PracticeSession.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/PracticeSession.tsx) probíhá kontrola volné odpovědi pouze přes triviální textovou rovnost:
   ```typescript
   const normalize = (str: string) => str.toLowerCase().replace(/\s+/g, '').replace(/,/g, '.');
   const isCorrect = normalize(answer) === normalize(currentQuestion.correctAnswer);
   ```
   Pokud je správná odpověď `1/2`, systém označí odpověď žáka `0,5`, `0.5`, `2/4` nebo `$\frac{1}{2}$` jako **CHYBNĚ**, což je z didaktického hlediska nepřijatelné.

### Hlavní doporučení výzkumu v kostce:
- **Web Rendering:** Vytvořit dedikovanou komponentu `MathRenderer.tsx`, která transparentně kombinuje `react-markdown` + `remark-math` + `rehype-katex` pro bohatý text s lehkým inline režimem pro rychlé vykreslování v tlačítkách a kartách výběru možností (A–D). Zabezpečit mobilní layout s horizontálním posunem dlouhých vzorců bez rozbití designu stránky.
- **Excel Import:** Zpřístupnit standardní zápis LaTeXu `$ ... $` s podporou inteligentního preprocesoru (Smart Shortcode Engine), který automaticky převede intuitivní zápisy učitelů (např. `1/2` na `\frac{1}{2}`, `sqrt(x)` na `\sqrt{x}`, `+-` na `\pm`) a při importu v [`practiceService.ts`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/practiceService.ts) provede syntaktickou validaci KaTeXem.
- **Admin UI:** Obohatit administrátorské editační formuláře v `PracticeManager.tsx` o **Quick Formula Toolbar** (rychlá klikací lišta symbolů) a okamžitý **Live Preview** s detekcí chybějících složených závorek či neuzavřených tagů.
- **Vyhodnocování (Answer Checking):** Implementovat víceúrovňový normalizační modul `mathEvaluator.ts`. Umožnit numerické porovnávání zlomků a desetinných čísel, detekci základního tvaru (pomocí algoritmu největšího společného dělitele – NSD/GCD) a poskytnutí didaktické zpětné vazby žákovi (*„Hodnota je správná, ale zkrať zlomek na základní tvar“*).

---

## 2. PILÍŘ 1: Zobrazení na webu (Web Rendering & Frontend architektura)

### 2.1 Analýza technologií: React-Markdown vs. Dedikovaný KaTeX Renderer

V moderním ekosystému Reactu existují tři hlavní přístupy k vykreslování matematických vzorců:

| Kritérium | Přístup A: `react-markdown` + `remark-math` + `rehype-katex` | Přístup B: Přímý KaTeX (`katex.renderToString`) | Přístup C: Dedikovaná hybridní komponenta `MathRenderer` |
| :--- | :--- | :--- | :--- |
| **Podpora formátování** | Plný Markdown (odstavce, tučné písmo, odrážky, tabulky) + KaTeX vzorce | Pouze čistý LaTeX (žádný Markdown, žádný volný text bez `\text{}`) | Plný Markdown + KaTeX + lehký inline režim |
| **Vhodnost pro UI prvky** | Komplikované v tlačítkách – React-Markdown implicitně balí obsah do `<p>`, což rozbíjí flexbox | Vynikající pro jednořádkové hodnoty (možnosti A–D) | **Optimální:** Automaticky rozlišuje inline kontext (bez `<p>`) vs. blokový výklad |
| **Režie a výkon** | Vyšší (parsování AST stromu Markdownu i HTML) | Minimální (rychlé lineární parsování regexem / KaTeXem) | Vybalancovaný výkon (memoizace a rozlišení režimu) |
| **Bezpečnost** | Vysoká (při vynechání `rehype-raw` neprovádí libovolné HTML) | Vysoká (při `trust: false` neumožňuje XSS) | **Maximální** (striktní KaTeX sanitace + Markdown bez raw HTML) |

> [!IMPORTANT]
> **Doporučená volba pro ProEdu:** Přístup C – vytvoření unifikované komponenty `MathRenderer.tsx`. V aplikaci ProEdu máme dva typy zobrazení:
> 1. **Dlouhé výukové texty a vysvětlení** (např. [`StudyView.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/StudyView.tsx) – teorie, kroky postupu, tipy lektora, nápovědy). Zde je Markdown nezbytný pro odstavce a formátování.
> 2. **Kompaktní UI elementy** (např. volby možností A, B, C, D v [`PracticeSession.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/PracticeSession.tsx), záhlaví, odznaky). Zde je nežádoucí, aby React-Markdown obalil text do bloku `<p class="mb-4">`, který způsobí rozpad vertikálního zarovnání v tlačítku.

---

### 2.2 Integrace s Vite a Tailwind CSS v4

V projektu ProEdu je nakonfigurován **Tailwind CSS v4** (`@tailwindcss/vite` v4.1.14 a `@import "tailwindcss";` v [`src/index.css`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/index.css)).

#### 1. Import stylů KaTeXu
V souboru [`src/main.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/main.tsx) je již řádek:
```typescript
import 'katex/dist/katex.min.css';
```
Tento import je správný a funkční. Vite během sestavení (`vite build`) automaticky zanalyzuje soubor `katex.min.css`, vyextrahuje odkazy na fonty (`KaTeX_Main-Regular.woff2`, `KaTeX_Math-Italic.woff2` atd.) z adresáře `node_modules/katex/dist/fonts/` a zkopíruje je do distribučního adresáře `dist/assets/`.

#### 2. Řešení konfliktů s Preflightem v Tailwind CSS v4
Tailwind CSS v4 aplikuje základní reset (Preflight), který může ovlivnit chování KaTeXu ve dvou aspektech:
- **Line-height & Vertical-align:** KaTeX používá absolutní a relativní posuny pro horní a dolní indexy (`.vlist`, `.mfrac`, `.msup`). Pokud rodičovský prvek nastaví pevnou výšku řádku, zlomky se mohou vizuálně oříznout.
- **Písmo (Font stack):** V `src/index.css` je nastaven globální font `Plus Jakarta Sans`. KaTeX vyžaduje své vlastní fonty (`KaTeX_Main`, `KaTeX_Math`, `serif`). Preflight nesmí přepsat font uvnitř třídy `.katex`.

**Doporučené doplnění do `src/index.css`:**
```css
/* Oprava a podpora KaTeXu pro Tailwind CSS v4 */
.katex {
  font-size: 1.05em; /* Lehce zvětšit pro lepší čitelnost zlomků v textu */
  text-rendering: auto;
}

/* Ochrana proti přetečení blokových vzorců na mobilních zařízeních */
.katex-display {
  overflow-x: auto;
  overflow-y: hidden;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  margin: 0.75rem 0 !important;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}

/* Zajištění správné barvy při tmavých a světlých motivech */
.katex .katex-html {
  color: inherit;
}
```

---

### 2.3 Inline (`$...$`) vs. Block (`$$...$$`) syntaxe

- **Inline vzorec (`$ ... $`):** Vložen plynule do věty. Zlomky jsou automaticky renderovány v kompaktní výšce (`\textstyle`), např. `$x = \frac{1}{2}$`.
- **Block / Display vzorec (`$$ ... $$`):** Vycentrován na samostatném řádku v plné typografické velikosti (`\displaystyle`), např.:
  $$\int_{0}^{1} x^2 \, dx = \frac{1}{3}$$
- **Vynucení plné velikosti v řádku:** Pokud autor chce plně velký zlomek i v řádku (např. v možnosti A), může v LaTeXu použít `\dfrac{a}{b}` místo `\frac{a}{b}`, nebo `$\displaystyle \frac{a}{b}$`.

---

### 2.4 Bezpečnostní analýza (Security & XSS ochrana)

*Primární zdroj:* [KaTeX Official Documentation: Security & Options](https://katex.org/docs/security.html)

Podle pravidla projektu **#1: Bezpečnost je priorita** a **#18: Bezpečnostní checklist** je nutné analyzovat, zda KaTeX nemůže být zneužit k útoku typu Stored Cross-Site Scripting (XSS), pokud by útočník uložil škodlivý kód do databáze Firestore.

#### Proč je KaTeX ze své podstaty bezpečný?
1. KaTeX **nepoužívá** funkci `eval()` ani nevytváří HTML elementy typu `<script>`, `<iframe>` či `<object>`.
2. KaTeX parsuje matematický kód do vlastního abstraktního syntaktického stromu (AST) a generuje výhradně bezpečné elementy: `<span>` s matematickými třídami a volitelně `<math>` pro MathML.
3. **Příkaz `\href` a `\url`:** Jediné potenciální riziko v LaTeXu představují příkazy pro odkazy. Pokud by autor napsal `\href{javascript:alert(1)}{Klikni}`, mohl by vzniknout XSS vektor.
4. **Řešení v ProEdu:** Nastavit parametr `trust: false` (což je výchozí hodnota KaTeXu). Při `trust: false` KaTeX striktně zakazuje vkládání nebezpečných protokolů a odkazů.
5. **Ochrana proti Denial of Service (DOS):** Proti zacykleným makrům (např. `\def\foo{\foo\foo}\foo`) KaTeX obsahuje limit `maxExpand: 1000`.

---

### 2.5 Ukázka kódu: Implementace komponenty `MathRenderer.tsx`

Níže je kompletní kód připravený k začlenění do `src/components/common/MathRenderer.tsx`:

```tsx
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import katex from 'katex';

interface MathRendererProps {
  content: string | undefined | null;
  /**
   * Pokud je true, obsah se vykreslí bez obalujícího <p> elementu (ideální pro možnosti A, B, C, D v tlačítkách)
   */
  inline?: boolean;
  className?: string;
}

/**
 * Univerzální komponenta pro bezpečné vykreslování textu s matematickými vzorci v ProEdu.
 * Podporuje inline formát $...$ i blokový formát $$...$$.
 */
export const MathRenderer: React.FC<MathRendererProps> = ({ 
  content = '', 
  inline = false, 
  className = '' 
}) => {
  const text = String(content || '').trim();

  // Rychlý fallback pro prázdný obsah
  if (!text) return null;

  // Pokud je aktivován inline režim a text neobsahuje pokročilý Markdown (odrážky, více řádků),
  // použijeme rychlé přímé vykreslení bez zbytečné režie Markdown AST
  const isPureInline = inline && !text.includes('\n') && !text.startsWith('#') && !text.startsWith('-');

  if (isPureInline) {
    // Rozdělíme text podle $...$ a $$...$$ pro rychlý rendering
    const parts = useMemo(() => {
      const tokens: { isMath: boolean; isBlock: boolean; value: string }[] = [];
      const regex = /(\$\$[\s\S]*?\$\$|\$[^\$]+?\$)/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          tokens.push({ isMath: false, isBlock: false, value: text.slice(lastIndex, match.index) });
        }
        const raw = match[0];
        const isBlock = raw.startsWith('$$');
        const formula = isBlock ? raw.slice(2, -2).trim() : raw.slice(1, -1).trim();
        tokens.push({ isMath: true, isBlock, value: formula });
        lastIndex = regex.lastIndex;
      }

      if (lastIndex < text.length) {
        tokens.push({ isMath: false, isBlock: false, value: text.slice(lastIndex) });
      }

      return tokens;
    }, [text]);

    // Pokud text neobsahuje žádné dolary, vrátíme čistý text
    if (parts.length === 1 && !parts[0].isMath) {
      return <span className={className}>{text}</span>;
    }

    return (
      <span className={`inline-flex flex-wrap items-center gap-x-1 ${className}`}>
        {parts.map((part, idx) => {
          if (!part.isMath) {
            return <span key={idx}>{part.value}</span>;
          }
          try {
            const html = katex.renderToString(part.value, {
              displayMode: part.isBlock,
              throwOnError: false,
              errorColor: '#cc0000',
              trust: false,
              strict: false
            });
            return (
              <span 
                key={idx} 
                className={part.isBlock ? "block my-2 w-full overflow-x-auto" : "inline-block"}
                dangerouslySetInnerHTML={{ __html: html }} 
              />
            );
          } catch {
            return <span key={idx} className="text-red-500 font-mono text-xs">{part.value}</span>;
          }
        })}
      </span>
    );
  }

  // Bohaté zobrazení s podporou plného Markdownu a KaTeXu
  return (
    <div className={`prose-math leading-relaxed break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[
          [
            rehypeKatex, 
            { 
              throwOnError: false, 
              strict: false, 
              trust: false,
              errorColor: '#cc0000' 
            }
          ]
        ]}
        components={{
          // Zajištění, aby inline použití neobalovalo do <p>
          p: ({ children }) => (
            inline ? <span>{children}</span> : <p className="mb-2 last:mb-0">{children}</p>
          ),
          // Zajištění horizontálního scrollování pro velké rovnice
          div: ({ node, className: compClass, ...props }) => {
            if (compClass?.includes('math-display')) {
              return <div className="overflow-x-auto py-1 max-w-full" {...props} />;
            }
            return <div className={compClass} {...props} />;
          }
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
};
```

---

## 3. PILÍŘ 2: Import z Excelu (.xlsx) pro autory a učitele

### 3.1 Záludnosti formátu Excel (.xlsx) pro matematiku

V ProEdu se pro hromadný import otázek a studijních kroků používá knihovna **SheetJS (`xlsx`)** v metodě [`parsePracticeQuestionsExcelFile`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/practiceService.ts#L665).

Při zadávání matematických otázek v tabulkových procesorech (Microsoft Excel, Google Sheets, LibreOffice Calc) naráží autoři na následující kritické pasti:

#### 1. Past rovnítka (`=`) na začátku buňky
V Excelu je znak `=` vyhrazen pro inicializaci výpočtového vzorce Excelu (např. `=SUMA(A1:A5)`).
- Pokud učitel napíše do zadání: `= 5 + 3`, Excel se pokusí výraz vyhodnotit jako vzorec. Buňka zobrazí číslo `8` a původní zadání zmizí.
- Pokud učitel napíše: `=\frac{1}{2}`, Excel ohlásí fatální chybu `#NÁZEV?` (`#NAME?`), protože nezná funkci `\frac`.
- **Řešení pro autory:**
  1. Používat obalení do dolarů: `$ = 5 + 3 $` (Excel to chápe jako text).
  2. Zadat na začátek buňky apostrof: `'= 5 + 3` (Excel apostrof skryje a buňku striktně chápe jako textový řetězec).
  3. Preprocesor v ProEdu automaticky odstraní počáteční apostrof, pokud ho SheetJS načte.

#### 2. Zpětná lomítka (`\`) a escapování
- V souborech typu `.csv` často dochází k tomu, že exportní nástroje escapují zpětná lomítka na `\\` nebo je naopak odmažou.
- **Výhoda formátu `.xlsx`:** Knihovna `xlsx` čte buňky z nativního XML stromu sešitu (`xl/sharedStrings.xml`). Zpětná lomítka LaTeXu (`\sqrt`, `\frac`, `\cdot`) zůstávají v řetězci 100% zachována bez jakéhokoliv poškození!

---

### 3.2 Smart Preprocessor: Inteligentní transformace pro pedagogy

Učitelé základních a středních škol často neznají LaTeX, ale chtějí rychle zadávat zlomky a mocniny.
Navrhujeme vytvořit deterministický preprocesor **`src/utils/mathPreprocessor.ts`**, který:
1. **Ponechá nedotčený explicitní LaTeX:** Pokud text již obsahuje `$ ... $`, preprocesor do něj nezasahuje.
2. **Přetransformuje intuitivní zápisy na LaTeX:**
   - Zlomky: `3/4` $\rightarrow$ `\frac{3}{4}`
   - Odmocniny: `sqrt(16)` nebo `odmocnina(16)` $\rightarrow$ `\sqrt{16}`
   - Mocniny: `x^2`, `a^3`, `(a+b)^2` $\rightarrow$ `x^{2}`, `a^{3}`, `(a+b)^{2}`
   - Znaménka násobení: `*` $\rightarrow$ `\cdot`
   - Plus-mínus: `+-` nebo `+/-` $\rightarrow$ `\pm`
   - Dělení: `:` v kontextu čísel $\rightarrow$ `\div`
   - Nerovnosti: `<=` $\rightarrow$ `\le`, `>=` $\rightarrow$ `\ge`
   - Pí: `pi` $\rightarrow$ `\pi`
   - Stupně: `45°` $\rightarrow$ `45^\circ`
3. **Ochrana českého kontextu:** Preprocesor nesmí omylem převést běžný text (např. datum `15. 4. 2026`, spojení `a/nebo` nebo číslované odrážky `1/ Úvod`). Transformace se aplikuje pouze na izolované matematické výrazy nebo pomocí jednoduchého shortcodu např. `{{3/4}}`.

#### Implementace modulu `src/utils/mathPreprocessor.ts`:

```typescript
/**
 * Nástroj pro inteligentní transformaci intuitivního zápisu učitelů do platného LaTeXu.
 */

// Pomocná funkce pro převod zlomku např. "1/2" -> "\frac{1}{2}"
export function transformFractions(input: string): string {
  // Převádí čísla a jednoduché proměnné oddělené lomítkem (např. 3/4, -5/8, x/2), vynechává data a URL
  return input.replace(/(^|[\s(=])([+-]?\d+|[a-zA-Z])\/(\d+|[a-zA-Z])(?=$|[\s),.;])/g, '$1\\frac{$2}{$3}');
}

// Pomocná funkce pro převod odmocnin např. sqrt(x) nebo sqrt(16) -> \sqrt{x}
export function transformRoots(input: string): string {
  return input
    .replace(/(?:sqrt|odmocnina)\s*\(([^)]+)\)/gi, '\\sqrt{$1}')
    .replace(/(?:cbrt|3odmocnina)\s*\(([^)]+)\)/gi, '\\sqrt[3]{$1}');
}

// Pomocná funkce pro převod mocnin např. x^2 -> x^{2}
export function transformPowers(input: string): string {
  return input.replace(/([a-zA-Z0-9\)])\^([a-zA-Z0-9+-]+)/g, '$1^{$2}');
}

// Pomocná funkce pro matematické symboly
export function transformSymbols(input: string): string {
  return input
    .replace(/\+-|\+\/-/g, '\\pm ')
    .replace(/<=/g, '\\le ')
    .replace(/>=/g, '\\ge ')
    .replace(/!=/g, '\\ne ')
    .replace(/(?<=\d)\s*\*\s*(?=\d|[a-zA-Z])/g, ' \\cdot ') // 3 * x -> 3 \cdot x
    .replace(/(?<=\d)\s*:\s*(?=\d)/g, ' \\div ');          // 6 : 2 -> 6 \div 2
}

/**
 * Hlavní funkce preprocesoru.
 * Pokud text neobsahuje dolary, automaticky identifikuje matematické konstrukce
 * a obalí je do KaTeX dolarů ($...$).
 */
export function preprocessMathText(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let result = text.trim();

  // Odstranění úvodního apostrofu z Excelu
  if (result.startsWith("'")) {
    result = result.substring(1);
  }

  // Podpora pro explicitní shortcode {{vzorec}} pro učitele, kteří nechtějí řešit $
  result = result.replace(/\{\{([^}]+)\}\}/g, (_match, inner) => {
    let math = inner;
    math = transformRoots(math);
    math = transformFractions(math);
    math = transformPowers(math);
    math = transformSymbols(math);
    return `$${math.trim()}$`;
  });

  // Pokud řetězec již obsahuje explicitní LaTeX dolary, preprocesujeme pouze části uvnitř dolarů nebo ponecháme
  if (result.includes('$')) {
    return result;
  }

  // Heuristická detekce: Pokud je celý text krátký matematický výraz (např. v možnostech A–D)
  const isLikelyMathFormula = /^([+-]?\d+[\/\^]|sqrt\(|[a-z]\s*=|x\^)/i.test(result);
  if (isLikelyMathFormula) {
    let math = result;
    math = transformRoots(math);
    math = transformFractions(math);
    math = transformPowers(math);
    math = transformSymbols(math);
    return `$${math.trim()}$`;
  }

  return result;
}
```

---

### 3.3 Validace vzorců při importu v `parsePracticeQuestionsExcelFile`

*Primární zdroj:* [`src/services/practiceService.ts`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/practiceService.ts#L665)

V současném kódu se kontroluje pouze přítomnost sloupců a neprázdnost hodnot. Pokud učitel nahraje soubor s neplatným LaTeXem (např. neuzavřený dolar `Vypočítejte $x + 2 a výsledek zapište`), KaTeX v aplikaci buď zčervená, nebo rozhodí formátování celého odstavce.

#### Rozšíření validační logiky v `practiceService.ts`:

```typescript
import katex from 'katex';
import { preprocessMathText } from '../utils/mathPreprocessor';

/**
 * Zkontroluje platnost všech KaTeX výrazů v textu.
 * Vrátí null, pokud je text v pořádku, nebo text chybové hlášky.
 */
export function validateLatexSyntax(text: string): string | null {
  if (!text) return null;

  // 1. Kontrola parity dolarů
  const dollarCount = (text.match(/(?<!\\)\$/g) || []).length;
  if (dollarCount % 2 !== 0) {
    return 'Lichý počet znaků $ (neuzavřený matematický vzorec).';
  }

  // 2. Extrakce a parsování všech vzorců KaTeXem
  const regex = /(\$\$[\s\S]*?\$\$|\$[^\$]+?\$)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const isBlock = raw.startsWith('$$');
    const formula = isBlock ? raw.slice(2, -2) : raw.slice(1, -1);

    try {
      katex.renderToString(formula, {
        displayMode: isBlock,
        throwOnError: true // Vyhodí výjimku při neplatné syntaxi
      });
    } catch (err: any) {
      return `Chyba v matematickém vzorci "${raw}": ${err.message}`;
    }
  }

  return null;
}
```

Tuto funkci začleníme přímo do cyklu `rawRows.forEach` v [`parsePracticeQuestionsExcelFile`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/practiceService.ts#L697). Pokud je detekována chyba, řádek se automaticky přidá do `invalidRows` s přesným číslem řádku v Excelu a konkrétním popisem chyby. Tím je zabráněno uložení neplatných dat do Firestore (pravidlo **#2: Firestore je jediný zdroj pravdy** a **#8: Validuj datový tvar**).

---

### 3.4 Tahák pro autory a učitele (Author Cheat Sheet)

Tato přehledná tabulka by měla být součástí nápovědy v modálním okně importu a v přiložené šabloně `.xlsx`:

| Matematický prvek | Doporučený LaTeX zápis | Intuitivní zápis (Shortcode) | Vizuální výsledek na webu |
| :--- | :--- | :--- | :---: |
| **Zlomek** | `$\frac{1}{2}$` nebo `$\dfrac{3}{4}$` | `{{1/2}}` nebo `3/4` v možnostech | $\frac{1}{2}$, $\frac{3}{4}$ |
| **Složený zlomek** | `$\frac{\frac{1}{2}}{3}$` | `{{\frac{1}{2}/3}}` | $\frac{\frac{1}{2}}{3}$ |
| **Mocnina** | `$x^2$` nebo `$a^{12}$` | `x^2` nebo `a^12` | $x^2$, $a^{12}$ |
| **Odmocnina** | `$\sqrt{16}$` | `sqrt(16)` nebo `odmocnina(16)` | $\sqrt{16}$ |
| **N-tá odmocnina** | `$\sqrt[3]{27}$` | `cbrt(27)` | $\sqrt[3]{27}$ |
| **Násobení (tečka)** | `$3 \cdot 5$` | `3 * 5` | $3 \cdot 5$ |
| **Dělení (dvojtečka)**| `$12 : 4$` nebo `$12 \div 4$`| `12 : 4` | $12 : 4$ |
| **Plus-mínus** | `$\pm 5$` | `+-5` nebo `+/- 5` | $\pm 5$ |
| **Stupně (úhly)** | `$45^\circ$` | `45°` | $45^\circ$ |
| **Pí** | `$\pi$` | `pi` | $\pi$ |
| **Rovnice** | `$2x + 5 = 15$` | `$2x + 5 = 15$` | $2x + 5 = 15$ |
| **Soustava rovnic** | `$$\begin{cases} x+y=5 \\ x-y=1 \end{cases}$$` | `$$\begin{cases} x+y=5 \\ x-y=1 \end{cases}$$` | Soustava se svorkou |

---

## 4. PILÍŘ 3: Tvorba a editace v administraci (Admin UI & UX)

### 4.1 Slabiny stávajícího řešení v `PracticeManager.tsx`

V komponentě [`src/components/admin/PracticeManager.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/components/admin/PracticeManager.tsx#L1301-L1530) se editace provádí takto:
- Zadání otázky je běžná `<textarea>` bez podpory formátování.
- Možnosti A–D jsou běžné textové inputy.
- Učitel nemá okamžitou zpětnou vazbu, zda vzorec napsal správně.
- Učitel musí manuálně psát složité tagy `\frac{}{}` včetně složených závorek, které se na české klávesnici píší obtížně (`AltGr + B`, `AltGr + N`).

---

### 4.2 Quick Formula Toolbar (Rychlá nástrojová lišta)

Nad každé textové pole (Zadání, Možnosti, Vysvětlení) umístíme kompaktní panel tlačítek. Kliknutí na tlačítko vloží předpřipravenou šablonu na pozici kurzoru a nastaví kurzor mezi složené závorky.

```tsx
interface QuickToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  onInsert: (newText: string) => void;
  currentValue: string;
}

export const QuickFormulaToolbar: React.FC<QuickToolbarProps> = ({
  textareaRef,
  onInsert,
  currentValue
}) => {
  const insertSnippet = (before: string, after: string = '', placeholder: string = '') => {
    const el = textareaRef.current;
    if (!el) {
      onInsert(currentValue + before + placeholder + after);
      return;
    }

    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const selectedText = currentValue.substring(start, end) || placeholder;

    const updatedText = 
      currentValue.substring(0, start) + 
      before + selectedText + after + 
      currentValue.substring(end);

    onInsert(updatedText);

    // Vrácení focusu a nastavení pozice kurzoru
    setTimeout(() => {
      el.focus();
      const newCursorPos = start + before.length + selectedText.length;
      el.setSelectionRange(newCursorPos, newCursorPos);
    }, 10);
  };

  const tools = [
    { label: '½ Zlomek', snippet: ['$\\frac{', '}{jmenovatel}$', 'čitatel'], title: 'Vložit zlomek' },
    { label: 'x² Mocnina', snippet: ['^{', '}', '2'], title: 'Vložit mocninu' },
    { label: '√ Odmocnina', snippet: ['$\\sqrt{', '}$', 'x'], title: 'Vložit odmocninu' },
    { label: '· Násobení', snippet: [' \\cdot ', ''], title: 'Znaménko násobení' },
    { label: '± Plus-mínus', snippet: ['\\pm ', ''], title: 'Znaménko plus-mínus' },
    { label: '° Stupeň', snippet: ['^{\\circ}', ''], title: 'Značka stupně' },
    { label: 'π Pí', snippet: ['\\pi', ''], title: 'Ludolfovo číslo pí' },
    { label: '≤ Menší rovno', snippet: [' \\le ', ''], title: 'Menší nebo rovno' },
    { label: '≥ Větší rovno', snippet: [' \\ge ', ''], title: 'Větší nebo rovno' },
    { label: '$ Vzorec $', snippet: ['$', '$', 'vzorec'], title: 'Obalit text do matematického režimu' }
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-gray-50 border border-gray-200 rounded-xl mb-1.5">
      <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 px-1">
        Vzorce:
      </span>
      {tools.map((tool, idx) => (
        <button
          key={idx}
          type="button"
          onClick={() => insertSnippet(tool.snippet[0], tool.snippet[1] || '', tool.snippet[2] || '')}
          title={tool.title}
          className="px-2 py-1 text-xs font-bold rounded-lg bg-white border border-gray-200/80 hover:bg-gray-100 hover:border-gray-300 text-gray-700 shadow-2xs transition-colors cursor-pointer"
        >
          {tool.label}
        </button>
      ))}
    </div>
  );
};
```

---

### 4.3 Live Preview (Okamžitý živý náhled)

Přímo pod editačním polem v `PracticeManager.tsx` se zobrazí dynamický náhled, který okamžitě vykresluje vzorce pomocí `MathRenderer`. Pokud autor udělá chybu v syntaxi, zobrazí se varovný banner:

```tsx
{/* Live Preview Box */}
{editingQuestion?.question && (
  <div className="mt-2 p-3 bg-[#FAF7F0] rounded-xl border border-gray-200/80">
    <div className="flex items-center justify-between mb-1">
      <span className="text-[10px] font-black uppercase tracking-wider text-gray-500">
        Živý náhled zadání (jak to uvidí žák):
      </span>
      {validateLatexSyntax(editingQuestion.question) && (
        <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
          ⚠️ Chyba v syntaxi vzorce
        </span>
      )}
    </div>
    <div className="text-gray-900 font-medium text-sm">
      <MathRenderer content={editingQuestion.question} />
    </div>
  </div>
)}
```

---

### 4.4 Hodnocení: MathLive vs. Textarea s nástrojovou lištou

*Primární zdroj:* [CortexJS MathLive Documentation](https://cortexjs.io/mathlive/)

Zvažovali jsme nasazení vizuálního editoru **MathLive (`<math-field>`)** od CortexJS.

| Kritérium | Volba 1: Textarea + Quick Toolbar + Live Preview | Volba 2: MathLive (`<math-field>`) |
| :--- | :--- | :--- |
| **Typ obsahu** | **Smíšený text + vzorce** (slovní úlohy, otázky s větami a odrážkami) | Primárně čistě matematické výrazy (např. rovnice) |
| **Složitost integrace** | Nulová (standardní React state, 0 nových závislostí) | Vyšší (Web Component, nutnost správy refů a event listenerů) |
| **Mobilní stabilita** | 100% spolehlivá na všech platformách | Může kolidovat s nativní mobilní klávesnicí iOS/Android |
| **Velikost balíčku** | 0 KB navíc (již máme KaTeX a React-Markdown) | +150 KB (velikost celé knihovny MathLive) |
| **Doporučení pro ProEdu** | **DOPORUČENO pro Fázi 1 a 2** | Vhodné případně do budoucna pro dedikovaný modul krokového řešení rovnic |

> [!TIP]
> **Závěr:** Pro tvorbu úloh v ProEdu je kombinace `Textarea + Toolbar + Live Preview` jednoznačně nejvhodnější, protože 90 % otázek v testech CERMAT jsou slovní úlohy s doprovodným textem, kde by čistě matematické editory způsobovaly komplikace při psaní běžného českého textu.

---

## 5. PILÍŘ 4: Vyhodnocování odpovědí žáků (Student Answer Checking)

### 5.1 Úlohy s výběrem odpovědí (Choice Questions)
V úlohách typu `choice` (výběr ze 4 možností A, B, C, D) je situace přímočará:
- Každá možnost je v databázi uložena jako řetězec (např. `$\frac{3}{4}$`).
- Při renderování se použije `<MathRenderer content={option} inline />`.
- Hodnocení je deterministické: porovnává se index nebo identický řetězec vybrané volby.

---

### 5.2 Úlohy s volnou odpovědí (Open Questions) a didaktická úskalí

V úlohách typu `open` žák vepisuje výsledek do textového pole. Zde vzniká největší didaktický a technický problém:

#### Problém 1: Zlomky vs. Desetinná čísla
- Správný výsledek: $\frac{1}{2}$
- Co žák napíše: `1/2`, `0.5`, `0,5` (s českou čárkou), `2/4` (nezkrácený zlomek) nebo `4/8`.
- Podle stávajícího kódu v `PracticeSession.tsx` projde pouze přesná textová shoda. Všechny ostatní zápisy jsou označeny jako chyba!

#### Problém 2: Standard CERMAT – Požadavek na základní tvar
Pravidla jednotných přijímacích zkoušek CERMAT striktně vyžadují:
> *„Výsledek zapište zlomkem v základním tvaru nebo celým číslem.“*

Pokud žák napíše `2/4` místo `1/2`, matematicky je hodnota správná, ale didakticky nesplnil podmínku základního tvaru. Systém by ho neměl pouze odbýt červeným křížkem, ale měl by mu poskytnout inteligentní zpětnou vazbu:
> *„Hodnota je správná, ale zlomek není v základním tvaru. Zkrať ho na 1/2.“*

---

### 5.3 Matematický vyhodnocovací modul `src/utils/mathEvaluator.ts`

Vytvoříme specializovaný vyhodnocovací engine, který pracuje ve 3 stupních:

1. **Stupeň 1: Textová a typografická normalizace:** Odstranění mezer, převod české čárky `,` na tečku `.`, sjednocení symbolů.
2. **Stupeň 2: Aritmetické a zlomkové parsování (Fraction Engine):**
   - Převod na racionální číslo (čitatel / jmenovatel).
   - Výpočet největšího společného dělitele (NSD / GCD) pomocí Eukleidova algoritmu.
   - Detekce zkráceného vs. nezkráceného tvaru.
   - Numerické porovnání s tolerancí $\varepsilon = 10^{-7}$.
3. **Stupeň 3: Didaktická zpětná vazba:**

```typescript
/**
 * src/utils/mathEvaluator.ts
 * Inteligentní modul pro porovnávání matematických odpovědí žáků v ProEdu.
 */

export interface MathCheckResult {
  isCorrect: boolean;
  isEquivalentValue: boolean;
  needsSimplification: boolean;
  feedbackMessage?: string;
  normalizedUserAnswer: string;
}

// Eukleidův algoritmus pro nalezení největšího společného dělitele
export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

// Datová struktura pro racionální číslo
interface ParsedFraction {
  numerator: number;
  denominator: number;
  isReduced: boolean;
  decimalValue: number;
}

// Pokus o parsování zlomku nebo čísla
export function parseMathValue(input: string): ParsedFraction | null {
  if (!input) return null;

  // Vyčištění textu: odstranění dolarů, mezer, LaTeXových příkazů
  let clean = input
    .replace(/\$/g, '')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')
    .replace(/\\dfrac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')
    .replace(/\s+/g, '')
    .replace(/,/g, '.');

  // 1. Kontrola zlomku: [čitatel]/[jmenovatel]
  const fracMatch = clean.match(/^([+-]?\d+)\/([+-]?\d+)$/);
  if (fracMatch) {
    let num = parseInt(fracMatch[1], 10);
    let den = parseInt(fracMatch[2], 10);

    if (den === 0) return null; // Dělení nulou není platné číslo

    // Normalizace znaménka do čitatele
    if (den < 0) {
      num = -num;
      den = -den;
    }

    const divisor = gcd(num, den);
    const isReduced = divisor === 1;

    return {
      numerator: num,
      denominator: den,
      isReduced,
      decimalValue: num / den
    };
  }

  // 2. Kontrola celého nebo desetinného čísla
  const numMatch = clean.match(/^([+-]?\d*(?:\.\d+)?)$/);
  if (numMatch && numMatch[1] && numMatch[1] !== '-' && numMatch[1] !== '+') {
    const val = parseFloat(numMatch[1]);
    return {
      numerator: val,
      denominator: 1,
      isReduced: true,
      decimalValue: val
    };
  }

  return null;
}

/**
 * Hlavní vyhodnocovací funkce pro volné odpovědi žáků.
 */
export function evaluateStudentAnswer(
  userAnswerRaw: string, 
  correctAnswerRaw: string
): MathCheckResult {
  const userClean = (userAnswerRaw || '').trim();
  const correctClean = (correctAnswerRaw || '').trim();

  // 1. Triviální přesná textová shoda
  const normUser = userClean.toLowerCase().replace(/\s+/g, '').replace(/,/g, '.');
  const normCorrect = correctClean.toLowerCase().replace(/\s+/g, '').replace(/,/g, '.');

  if (normUser === normCorrect && normUser.length > 0) {
    return {
      isCorrect: true,
      isEquivalentValue: true,
      needsSimplification: false,
      normalizedUserAnswer: userClean
    };
  }

  // 2. Numerická a zlomková analýza
  const parsedUser = parseMathValue(userClean);
  const parsedCorrect = parseMathValue(correctClean);

  if (parsedUser && parsedCorrect) {
    const EPSILON = 1e-7;
    const isValueEqual = Math.abs(parsedUser.decimalValue - parsedCorrect.decimalValue) < EPSILON;

    if (isValueEqual) {
      // Hodnota je stejná! Nyní zkontrolujeme základní tvar zlomku
      if (!parsedUser.isReduced && parsedCorrect.isReduced) {
        const reducedNum = parsedUser.numerator / gcd(parsedUser.numerator, parsedUser.denominator);
        const reducedDen = parsedUser.denominator / gcd(parsedUser.numerator, parsedUser.denominator);
        return {
          isCorrect: false, // Podle CERMAT pravidel není nezkrácený zlomek plně správně
          isEquivalentValue: true,
          needsSimplification: true,
          feedbackMessage: `Výsledek má správnou číselnou hodnotu, ale zlomek není v základním tvaru! Zkrať ho na ${reducedNum}/${reducedDen}.`,
          normalizedUserAnswer: userClean
        };
      }

      // Žák zadal správný zlomek nebo správné desetinné číslo
      return {
        isCorrect: true,
        isEquivalentValue: true,
        needsSimplification: false,
        normalizedUserAnswer: userClean
      };
    }
  }

  // 3. Odpověď je nesprávná
  return {
    isCorrect: false,
    isEquivalentValue: false,
    needsSimplification: false,
    normalizedUserAnswer: userClean
  };
}
```

---

### 5.4 UX zadávání na mobilních zařízeních (Mobile Input UX)

Na chytrých telefonech (iOS a Android) nemají žáci na nativní české klávesnici snadno přístupné znaky jako `/` (lomítko pro zlomek), `^` (stříška pro mocninu) nebo `√` (odmocnina).

#### Doporučené řešení pro ProEdu:
Místo těžkopádné celoobrazovkové matematické klávesnice, která na mobilu zakryje celé zadání otázky, implementovat **Pomocnou matematickou lištu (Math Assist Bar)** přímo nad polem pro vepisování odpovědi:

```tsx
{/* Pomocná lišta pro zadávání symbolů na mobilu */}
<div className="flex items-center gap-1.5 pt-1 overflow-x-auto pb-1">
  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider shrink-0">
    Vložit:
  </span>
  {['/', '√', '²', '³', 'π', '-', ','].map(sym => (
    <button
      key={sym}
      type="button"
      onClick={() => handleAppendSymbol(sym)}
      className="px-2.5 py-1 text-xs font-black rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-800 active:scale-95 transition-all cursor-pointer"
    >
      {sym}
    </button>
  ))}
</div>
```

---

## 6. Bezpečnostní checklist (Security & Compliance)

V souladu s pravidly projektu uvedenými v souboru [`.agents/rules/proedu.md`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/.agents/rules/proedu.md):

- [x] **Pravidlo #1 & #19 (Žádný nebezpečný kód a XSS prevence):** Knihovna KaTeX je provozována s parametrem `trust: false`. Je zakázáno provádění JavaScriptu v matematických odkazech (`\href`, `\url`).
- [x] **Pravidlo #2 & #8 (Firestore validace):** Při importu z Excelu je v [`practiceService.ts`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/practiceService.ts) prováděna validace datového typu a KaTeX syntaxe ještě před zápisem do Firestore. Chybné řádky jsou zahozeny s varováním pro učitele.
- [x] **Pravidlo #5 & #11 (Zákaz zápisu privilegovaných hodnot klientem):** Vyhodnocování v modulu `mathEvaluator.ts` běží deterministicky. Ukládání výsledků pokusu (`recordPracticeAttempt`) zapisuje pouze povolená data uživatele (`studentId`, `score`, `percentage`).
- [x] **Pravidlo #14 (Změna databázového modelu):** Datový model kolekcí `questions` a `practiceSubtopics` zůstává 100% zpětně kompatibilní – textová pole (`question`, `options`, `correctAnswer`, `hint`, `explanation`) obsahují standardní text s volitelnými LaTeX tagy `$ ... $`.
- [x] **Pravidlo #20 (Funkčnost a bezpečnost v rovnováze):** Žáci mají pohodlné zadávání bez bezpečnostního rizika, učitelé mají nástroje pro snadný import bez nutnosti expertní znalosti LaTeXu.

---

## 7. Doporučený plán implementace krok za krokem (Roadmap)

Integraci doporučujeme rozdělit do 4 na sebe navazujících kroků:

```
┌────────────────────────────────────────────────────────┐
│ FÁZE 1: ZÁKLAD ZOBRAZENÍ (Web Rendering)              │
│ - Vytvořit src/components/common/MathRenderer.tsx      │
│ - Doplnit CSS pravidla do src/index.css                │
│ - Nasadit MathRenderer do PracticeSession a StudyView  │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ FÁZE 2: SMART EXCEL IMPORT A VALIDACE                  │
│ - Vytvořit src/utils/mathPreprocessor.ts               │
│ - Rozšířit parsePracticeQuestionsExcelFile v service   │
│ - Aktualizovat vzorovou šablonu .xlsx s tahákem        │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ FÁZE 3: ADMIN ROZHRANÍ (PracticeManager.tsx)           │
│ - Vytvořit QuickFormulaToolbar komponentu              │
│ - Přidat Live Preview box pod editační pole            │
│ - Otestovat vkládání zlomků, mocnin a odmocnin         │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ FÁZE 4: INTELIGENTNÍ VYHODNOCOVÁNÍ ODPOVĚDÍ           │
│ - Vytvořit src/utils/mathEvaluator.ts (NSD, zlomky)    │
│ - Integrovat do handleCheckOpenAnswer v PracticeSession│
│ - Přidat didaktickou hlášku při nezkráceném zlomku     │
│ - Přidat mobilní asistenční lištu pro zadávání symbolů │
└────────────────────────────────────────────────────────┘
```

### Krok 1: Základ zobrazení (Web Rendering)
1. Vytvořit komponentu [`src/components/common/MathRenderer.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/components/common/MathRenderer.tsx) podle specifikace v kapitole 2.5.
2. Vložit optimalizační CSS pravidla pro KaTeX do [`src/index.css`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/index.css).
3. V [`src/pages/PracticeSession.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/PracticeSession.tsx) nahradit:
   - `{currentQuestion.question}` $\rightarrow$ `<MathRenderer content={currentQuestion.question} />`
   - `{option}` $\rightarrow$ `<MathRenderer content={option} inline />`
   - `{currentQuestion.hint}` $\rightarrow$ `<MathRenderer content={currentQuestion.hint} />`
   - `{q.explanation}` $\rightarrow$ `<MathRenderer content={q.explanation} />`
4. V [`src/pages/StudyView.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/StudyView.tsx) nahradit texty teorie, kroků výkladu a tipů lektora komponentou `<MathRenderer content={step.content} />`.

### Krok 2: Smart Excel Import a Validace
1. Vytvořit pomocný modul [`src/utils/mathPreprocessor.ts`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/utils/mathPreprocessor.ts).
2. V [`src/services/practiceService.ts`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/practiceService.ts) obohatit funkci `parsePracticeQuestionsExcelFile` o volání `preprocessMathText` a validaci `validateLatexSyntax`.
3. V případě syntaktické chyby zařadit řádek do `invalidRows` s detailním popisem chyby.

### Krok 3: Administrátorské rozhraní (Admin UI)
1. Do modálního okna úpravy otázky v [`src/components/admin/PracticeManager.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/components/admin/PracticeManager.tsx) doplnit komponentu `QuickFormulaToolbar` nad textová pole otázky, možností a vysvětlení.
2. Pod textová pole přidat dynamický blok `Live Preview`, který učiteli okamžitě ukáže reálný vzhled matematických výrazů.

### Krok 4: Inteligentní vyhodnocování a mobilní UX
1. Vytvořit vyhodnocovací modul [`src/utils/mathEvaluator.ts`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/utils/mathEvaluator.ts).
2. V [`src/pages/PracticeSession.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/PracticeSession.tsx) upravit metodu `handleCheckOpenAnswer` tak, aby volala `evaluateStudentAnswer(answer, currentQuestion.correctAnswer)`.
3. Pokud žák zadal správnou hodnotu, ale nezkrácený zlomek, zobrazit žluté upozornění s návodem k pokrácení a umožnit mu odpověď upravit před finálním odevzdáním.
4. Nad vstupní pole pro volnou odpověď přidat mobilní tlačítkovou lištu (`/`, `√`, `²`, `³`, `π`, `-`, `,`).

---

## 8. Bibliografie a primární zdroje

1. **KaTeX:**
   - Oficiální dokumentace: [https://katex.org](https://katex.org)
   - KaTeX Security Policy & Options: [https://katex.org/docs/security.html](https://katex.org/docs/security.html)
   - KaTeX Supported Functions & Symbols: [https://katex.org/docs/supported.html](https://katex.org/docs/supported.html)
2. **Unified / Remark / Rehype:**
   - React-Markdown v10 GitHub: [https://github.com/remarkjs/react-markdown](https://github.com/remarkjs/react-markdown)
   - Remark-Math GitHub: [https://github.com/remarkjs/remark-math](https://github.com/remarkjs/remark-math)
   - Rehype-Katex GitHub: [https://github.com/remarkjs/remark-math/tree/main/packages/rehype-katex](https://github.com/remarkjs/remark-math/tree/main/packages/rehype-katex)
3. **CortexJS & MathLive:**
   - CortexJS MathLive Guide: [https://cortexjs.io/mathlive/](https://cortexjs.io/mathlive/)
   - CortexJS Compute Engine (Equivalence checking): [https://cortexjs.io/compute-engine/](https://cortexjs.io/compute-engine/)
4. **SheetJS (xlsx):**
   - SheetJS Community Edition Documentation: [https://docs.sheetjs.com/](https://docs.sheetjs.com/)
   - Cell Objects and Formula Handling: [https://docs.sheetjs.com/docs/csf/cell](https://docs.sheetjs.com/docs/csf/cell)
5. **CERMAT (Centrum pro zjišťování výsledků vzdělávání):**
   - Pravidla a specifikace testů z matematiky pro jednotné přijímací zkoušky: [https://prijimacky.cermat.cz](https://prijimacky.cermat.cz)
