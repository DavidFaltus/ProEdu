# 🎓 ProEdu - Výuková platforma, která se Ti přizpůsobí

ProEdu je moderní, adaptivní webová aplikace navržená pro přípravu žáků na přijímací zkoušky na střední školy (přijímačky na SŠ) a didaktické testy (maturita). Systém automaticky analyzuje výsledky studentů a pomocí AI jim doporučuje oblasti, na které by se měli nejvíce zaměřit.

---

## 🚀 Klíčové Funkce

### 👤 Studentská sekce
- **Nástěnka (Dashboard):** Přehled aktivních úkolů (To-do list), historie vyhodnocených testů a osobní statistiky.
- **AI Doporučení (Focus Areas):** Automatické vyhodnocení silných a slabých stránek žáka z testů s návrhy oblastí k procvičování.
- **Spouštění testů:** Interaktivní testové rozhraní s okamžitým vyhodnocením nebo možností ručního oznámkování učitelem.
- **Studijní materiály & kurzy:** Přístup k výukovým souborům (PDF, odkazy) nahraným učitelem v rámci jednotlivých předmětů.
- **Veřejné procvičování:** Možnost vygenerovat si náhodný procvičovací test na základě zvoleného tématu.

### 👩‍🏫 Učitelská sekce (Administrace)
- **Správa studentů:** Přehled žáků, jejich výsledků, historie testů a doporučených témat.
- **Přiřazování testů & úkolů:** Možnost přiřadit konkrétní testy jednotlivým studentům s termínem odevzdání.
- **Banka otázek:** Správa a tvorba otázek s možností kategorizace podle témat.
- **AI Generování testů:** Automatické generování nových otázek na zadané téma pomocí modelu **Gemini 2.5 Flash**.
- **AI Extrakt z PDF:** Možnost nahrát PDF soubor s otázkami a PDF s klíčem odpovědí a nechat AI sestavit kompletní interaktivní test.
- **Hodnotící panel:** Ruční opravování testů, přidělování známek a psaní zpětné vazby studentům.
- **Správa kurzů:** Zakládání tříd/kurzů a přiřazování studentů do nich.

---

## 🛠️ Použité Technologie

- **Frontend:** React, TypeScript, React Router, Tailwind CSS, shadcn/ui, Lucide ikony, Framer Motion (Motion).
- **Backend:** Node.js, Express server s integrací Firebase Admin SDK a Google GenAI.
- **AI Modely:** Google Gemini 2.5 Flash (`@google/genai`).
- **Databáze & Bezpečnost:** Firebase Auth (ověřování uživatelů) a Cloud Firestore s komplexním zabezpečením (Firestore Security Rules).
- **Úložiště:** Firebase Storage pro ukládání studijních materiálů učiteli.

---

## 🔒 Bezpečnost & Firestore Pravidla (Rules)

Bezpečnost a ochrana osobních údajů je v aplikaci prioritou:
- **Vlastnictví dokumentů (Row-level security):** Každý dokument v kolekcích (`assignedTests`, `todos`, `users`) obsahuje jednoznačný identifikátor vlastnictví (`uid`, `studentId`, `createdBy`) a pravidla Firestore striktně omezují čtení a zápis pouze na vlastníka a učitele.
- **Validace schémat:** Firestore pravidla v souboru [firestore.rules](firestore.rules) detailně ověřují datový typ, povolené hodnoty, délkové limity stringů a povinná pole u každé zapisované položky.
- **Imutabilní pole:** Klíčová pole jako `uid`, `createdAt`, `createdBy` a `studentId` nelze po vytvoření dokumentu upravovat.
- **Rozdělení rolí:** Role (`student` / `teacher`) jsou vynucovány na serveru a z Firestore dokumentu uživatele. Frontend nemůže sám měnit privilegované hodnoty (jako jsou známky, role, zpětná vazba).

---

## 💻 Spuštění a Vývoj

### Požadavky
- **Node.js** (verze 18+)

### Lokální instalace a spuštění

1. **Nainstalujte závislosti:**
   ```bash
   npm install
   ```

2. **Konfigurace prostředí:**
   Vytvořte soubor `.env.local` (případně `.env`) a nastavte váš Gemini API klíč:
   ```env
   GEMINI_API_KEY=vys_klíč_k_gemini_api
   ```
   *Ujistěte se, že máte v kořenovém adresáři k dispozici soubor `firebase-applet-config.json` a případně přihlášený Firebase projekt.*

3. **Spuštění vývojového serveru:**
   Aplikace je nastavena pro běh na portu **3005**:
   ```bash
   npm run dev
   ```

---

## 🧑‍💻 Testovací účty (Debug)

Pro účely ladění a testování aplikace použijte následující přihlašovací údaje:

### Učitel (Teacher)
- **E-mail:** `ucitel@ucitel.cz`
- **Heslo:** `ucitel123`

### Student
- **E-mail:** `student@student.cz`
- **Heslo:** `student123`
