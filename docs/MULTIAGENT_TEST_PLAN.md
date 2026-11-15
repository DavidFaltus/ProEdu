# Master plán multi-agentního funkčního, bezpečnostního a zátěžového testování (ProEdu)

> **Účel dokumentu:** Komplexní prováděcí plán pro hromadné multi-agentní testování aplikace ProEdu napříč všemi uživatelskými rolemi (`Host`, `free`, `student`, `course`, `premium`, `teacher`) s cílem odhalit:
> 1. **Bezpečnostní chyby a úniky dat** (IDOR, eskalace rolí, obejití Firestore/Storage Rules, únik odpovědí `correctAnswer`, únik dat mezi kurzy a uživateli).
> 2. **Nelogické úlohy a rozbitá workflow** (nekonzistence mezi frontendem, serverem a pravidly, nesprávná ekonomika žolíků, chybné přechody stavů předplatného).
> 3. **Zbytečnou zátěž databáze a běhu aplikace** (neomezené dotazy bez `limit()`, duplicitní `onSnapshot` listenery, zbytečné re-fetche při přepínání pohledů, N+1 dotazy).

---

## 1. Závazné mantinely a bezpečnostní pravidla testovacího běhu

Tento plán je navržen pro spuštění proti **lokální instanci na portu `3005`** (`http://localhost:3005`) napojené na **aktuální Firebase projekt**:

1. **Čistý audit bez úprav kódu (Audit-Only):** Agenti během testování neupravují zdrojový kód (`src/`, `server/`, `firestore.rules`, `storage.rules`). Všechny nálezy ukládají výhradně do strukturovaného reportu s důkazy a návrhem opravy.
2. **Zákaz destruktivních zásahů do cizích dat:**
   - Nikdy nemazat, neupravovat ani neexfiltrovat reálné dokumenty jiných uživatelů, kurzů nebo objednávek.
   - Veškeré negativní/destruktivní testy (pokus o smazání, přepsání cizího dokumentu, eskalace role) provádět **výhradně mezi našimi vyhrazenými testovacími účty a obětními testovacími dokumenty** (očekávaný výsledek je `403 Forbidden` / `PERMISSION_DENIED`).
3. **Ochrana externích integrací (`.env` stav):**
   - **Comgate:** `COMGATE_TEST_MODE="true"` (ostré klíče prázdné) → bezpečné testování v sandbox režimu (`/api/payments/comgate/sandbox-simulate-pay`).
   - **SMTP (Gmail):** `SMTP_USER` a `SMTP_PASS` jsou aktivní → **zákaz hromadného posílání e-mailů a spamování registrací**. Registrační OTP flow (`/api/auth/register-init`) otestovat maximálně **1×** na kontrolovaný testovací e-mail bez opakovaného floodování.
   - **Rate-limity:** `server/index.js` obsahuje in-memory rate limitery (`registerInitLimiter`, `bugReportLimiter`, `orderCreateLimiter`, `practiceGuestCheckLimiter`). Testovat šetrně (ověřit existenci hlaviček/limitů bez zablokování lokální IP pro ostatní agenty).
4. **Hygiena po skončení:** Všechny dočasně vytvořené testovací účty (`free`, `course`, `premium`), testovací objednávky, bug reporty, dotazy, to-do úkoly a nahrané testovací soubory musí být na konci úklidovou fází odstraněny.

---

## 2. Architektura testovacích účtů a přípravná fáze (Fáze 0)

### 2.1 Matice testovacích entit

| Identifikátor | Role / Stav | Zdroj / Způsob přípravy | Účel |
| :--- | :--- | :--- | :--- |
| **`ACC_GUEST`** | Nepřihlášený host | Čistý Playwright `browserContext` bez cookies/localStorage | Veřejné katalogy, guest procvičování, paywall, limity |
| **`ACC_FREE`** | `free` (0 kurzů, ověřený/nový) | Dočasný účet vytvořený v Fázi 0 (nebo resetovaný `free` účet) | Žolíková ekonomika, videoodměny, referral, dotazník, nákupní flow |
| **`ACC_STUDENT`** | `student` | Debug účet `student@student.cz` / `student123` (nemazat!) | Přiřazené testy, To-Do, Zahrada, statistiky, dotazy lektorovi |
| **`ACC_COURSE_A`** | `course` (zapsán **jen** v Kurzu A) | Dočasný účet + zápis do testovacího Kurzu A přes učitelské API | **Kritický test izolace:** smí vidět Kurz A, ale **NESMÍ** vidět Kurz B ani prémiový obsah mimo kurz! |
| **`ACC_PREMIUM`** | `premium` (aktivní) | Dočasný účet povýšený přes Comgate sandbox nebo `/api/students/:id/update-access` | Plný přístup ke studiu, materiálům, PDF/SVG, neomezené procvičování, zrušení předplatného |
| **`ACC_PREMIUM_EXP`** | `premium` v `cancelled_at_period_end` / po expiraci | Dočasný účet s upraveným stavem předplatného | Ověření 3denní grace period vs. správného odebrání přístupu po expiraci |
| **`ACC_TEACHER`** | `teacher` (admin) | Debug účet `ucitel@ucitel.cz` / `ucitel123` (nemazat!) | Teacher Dashboard, správa kurzů/materiálů/studentů/objednávek, oprava chyb |

### 2.2 Kroky Fáze 0 (Koordinátor)
1. Spustit lokální server na portu `3005` a ověřit `GET http://localhost:3005/api/health`.
2. Přihlásit se jako `ACC_TEACHER` (`ucitel@ucitel.cz`), získat seznam existujících kurzů (nebo vytvořit 2 označené testovací kurzy `[TEST_AUDIT] Kurz A` a `[TEST_AUDIT] Kurz B` + 1 testovací přiřazený test pro `ACC_STUDENT`).
3. Vytvořit izolované testovací účty (`ACC_FREE`, `ACC_COURSE_A`, `ACC_PREMIUM`) s unikátním prefixem e-mailu (např. `qa-audit-<role>-<timestamp>@proedu.local` bez nutnosti odesílat reálný e-mail, pokud je lze vytvořit přes Admin/Teacher flow nebo Firebase Auth, případně s jednorázovým ověřením na kontrolované schránce).
4. Zapsat UID všech testovacích účtů a ID testovacích dokumentů do sdíleného kontextu pro všechny agenty (aby cross-account útoky mířily **výhradně** na tyto testovací ID).

---

## 3. Multi-agentní maticová topologie (`/swarm`)

Tým tvoří **Koordinátor + 6 specializovaných agentů**, kteří pracují paralelně ve 3 vlnách (Role agenti + Průřezoví auditoři):

```
                    [ KOORDINÁTOR ]
            (Fáze 0 Setup -> Triage -> Fáze 3 Cleanup & Final Report)
                           |
     +---------------------+---------------------+
     |                                           |
[ VLNA 1: Role-Based Agenti (Playwright + API) ] [ VLNA 2: Průřezoví Auditoři ]
  ├── Agent 1: Host + Free (Limity & Onboarding)   ├── Agent 5: Security & Data-Leak Auditor
  ├── Agent 2: Student + Course (Izolace & Testy)  └── Agent 6: DB Load, Network & Logic Profiler
  ├── Agent 3: Premium (Obsah & Billing Lifecycle)
  └── Agent 4: Teacher (Admin Dashboard & CRUD)
```

### Pravidlo zachycení telemetrie pro každého Role Agenta (1–4)
Každý Role Agent při procházení své role v Playwrightu (nebo skriptovaném prohlížeči) povinně loguje:
- **Console Errors & Uncaught Exceptions** (`page.on('console')`, `page.on('pageerror')`).
- **HTTP 4xx/5xx odpovědi** na `/api/*` a Firestore/Storage chyby (`PERMISSION_DENIED`, `failed-precondition` pro chybějící indexy).
- **Počet síťových požadavků na Firestore / `/api/*`** při každé hlavní akci (načtení nástěnky, přepnutí tabu, spuštění procvičování, dokončení testu).

---

## 4. Detailní testovací scénáře podle agentů

### 🤖 Agent 1: `ACC_GUEST` & `ACC_FREE` (Veřejné plochy, Monetizace, Žolíková ekonomika)

**Vlastněné routy & endpointy:**
`/`, `/practice`, `/practice/session/:subtopicId`, `/learning`, `/statistics`, `/courses`, `/courses/:id`, `/study/:subtopicId`, `/login`, `/contact`, `/terms`, `/gdpr`
API: `/api/practice/catalog`, `/api/practice/subtopics/:id/questions`, `/api/practice/check-answer`, `/api/practice/reveal-solution`, `/api/practice/finish`, `/api/jokers/*`, `/api/referrals/claim`, `/api/survey/submit`, `/api/courses`.

**Funkční a logické scénáře:**
1. **Guest průchod (`/`, `/practice`, `/courses`):**
   - Ověřit, že nepřihlášený uživatel vidí pouze veřejný katalog bez `correctAnswer`, bez skrytých (`isHidden: true`) témat a bez placených PDF/SVG studií.
   - Otestovat Guest procvičování: po dokončení demo sady/vyčerpání limitu se musí zobrazit paywall/login výzva. Zkontrolovat `localStorage` (`proedu_guest_monetization`) – zda manipulace v `localStorage` neumožní získat neomezený obsah na serveru.
2. **Free přihlášení & Denní žolíci:**
   - Přihlášení `ACC_FREE` → `POST /api/auth/session-bootstrap` → `POST /api/jokers/daily-reset`.
   - Ověřit počáteční stav žolíků, denní příděl a strop (`BASE_JOKER_CAP = 10`, `MAX_JOKER_CAP = 15` při 10denním streaku).
3. **Konzistence spotřeby žolíků (`consumeOneJoker`):**
   - Spustit procvičování (`/practice/session/:subtopicId`) → odpovědět → zkontrolovat odečet žolíka v UI i v DB.
   - Pokusit se vyčerpat žolíky na `0` → ověřit zobrazení `DailyLimitExhaustedModal` a blokaci dalšího procvičování i na úrovni API (`check-answer` / `finish`), nejen schováním tlačítka v UI!
4. **Video odměna (`RewardedAdModal` -> `/api/jokers/video-session` & `/api/jokers/video-reward`):**
   - Získat video token, uplatnit odměnu (+5 žolíků), ověřit denní limit 3 videí (`dailyVideosWatched`) a zákaz překročení `cap`.
   - Pokus o znovupoužití stejného `videoToken` (replay attack) → musí selhat.
5. **Dotazník & Referral (`/api/survey/submit`, `/api/referrals/claim`):**
   - Odeslat dotazník 1× (přičte bonus), pokusit se odeslat 2× (nesmí znovu připsat žolíky).
   - Pokusit se uplatnit vlastní `referralCode` (self-referral) → musí být zamítnut.
6. **Pokus o vstup na zakázané routy:**
   - Přímá navigace na `/teacher`, `/study/:placeneSubtopicId`, `/learning` (stažení materiálu), `/garden`, `/todo` (vytvoření `practice` todo – pravidla vyžadují `isPremiumOrAdmin()`).

---

### 🤖 Agent 2: `ACC_STUDENT` & `ACC_COURSE_A` (Školní agenda & Kritická izolace kurzů)

**Vlastněné routy & endpointy:**
`/`, `/garden`, `/todo`, `/test/:testId`, `/review/:testId`, `/statistics`, `/courses/:id`, `/study/:subtopicId`, `/learning`
API: `/api/courses/:courseId`, `/api/garden/record-focus`, `/api/practice/study/:subtopicId`, `/api/materials/:id/file`.

**Funkční a logické scénáře:**
1. **Žákovské testy (`assignedTests`, `/test/:testId`, `/review/:testId`):**
   - Spuštění přiděleného testu (`assigned` → `in_progress` → `submitted`).
   - Zkontrolovat, že při řešení testu v `/test/:testId` nejsou v síťové odpovědi ani ve stavu komponenty předem obsaženy `correctAnswer` nebo hodnocení.
   - Zkontrolovat `/review/:testId` – student vidí jen své vlastní testy, nikdy test cizího studenta.
2. **To-Do & Zahrada (`/todo`, `/garden`):**
   - Vytvoření osobního To-Do (`todos`), označení za splněné.
   - Test pravidla pro `todos`: jako neplacený `student` zkusit vytvořit `type: 'practice'` todo (mělo by být blokováno pravidlem `request.resource.data.type != 'practice' || isPremiumOrAdmin()`).
   - Zahrada (`/garden`): spustit časovač soustředění (`FloatingTimer`) a uložit focus session (`POST /api/garden/record-focus`), ověřit inkrement `gardenPlants` a uložení do `focusSessions`.
3. **Dotazy k otázkám (`questionInquiries`):**
   - Odeslat dotaz na učitele z procvičování (`StudentInquiriesSection`), ověřit stav `pending`, pak po odpovědi učitele označit `isReadByStudent: true`.
4. **🔥 KRITICKÝ AUDIT ROLE `course` (`ACC_COURSE_A`):**
   - **Hypotéza z kódu k ověření!** V `src/context/AuthContext.tsx` (`isPremium = isTeacher || isCourseUser || hasActivePaidPremium`), `firestore.rules` (`isPaidUser() => role in ['premium', 'course', 'teacher']`) i `server/index.js` (`requirePremiumOrTeacher`) je role `'course'` posuzována globálně jako placený uživatel!
   - **Test 1 (Cross-Course izolace):** `ACC_COURSE_A` (zapsaný **pouze** v Kurzu A) se pokusí otevřít `/courses/<KURZ_B_ID>`, přečíst `courses/<KURZ_B_ID>`, `courseItems` Kurzu B, `liveLessons` vázané na Kurz B a Storage cestu `courses/<KURZ_B_ID>/*`.
   - **Test 2 (Únik globálního Premium obsahu pro `course` roli):** Zjistit, zda `ACC_COURSE_A` dokáže přečíst *všechny* `practiceSubtopics`, `learningSheets`, `studyMaterials`, `/api/practice/study/:subtopicId` a `/api/materials/:id/file` i mimo svůj zapsaný kurz! Pokud ano, zdokumentovat jako **P1 Business Logic / Access Control Flaw** (zda je to záměr nebo chyba modelu).

---

### 🤖 Agent 3: `ACC_PREMIUM` & `ACC_PREMIUM_EXP` (Prémiový obsah & Životní cyklus předplatného)

**Vlastněné routy & endpointy:**
`/learning`, `/study/:subtopicId`, `/practice/session/:subtopicId`, `/statistics`, `/settings`
API: `/api/orders/create`, `/api/orders/my`, `/api/orders/:orderId/invoice.pdf`, `/api/payments/comgate/sandbox-simulate-pay`, `/api/subscription/cancel`, `/api/subscription/reactivate`, `/api/subscription/check-expiry`, `/api/subscription/billing`, `/api/materials/:id/*`, `/api/practice/study/:subtopicId`.

**Funkční a logické scénáře:**
1. **Studijní materiály a SVG/PDF pipeline (`/learning`, `/study/:subtopicId`):**
   - Načtení studijních listů (`learningSheets` + podkolekce `chunks` pro velké SVG), zobrazení miniatur (`/api/materials/:id/thumbnail`), stažení/zobrazení souboru (`/api/materials/:id/file`, `/download`).
   - Ověřit správné renderování matematiky (KaTeX) a sanitizovaného SVG (žádné rozbité obrázky ani `<script>` v SVG).
2. **Nákupní flow & Comgate Sandbox (`UnifiedPaywallModal` -> `/api/orders/create`):**
   - Validace fakturačních údajů (IČO/DIČ/PSČ/e-mail), vytvoření objednávky (`status: 'pending'`).
   - Simulace zaplacení přes sandbox (`/api/payments/comgate/sandbox-simulate-pay`) → ověřit aktualizaci `role: 'premium'` **jak v Firestore `users/{uid}`, tak v Firebase Auth Custom Claims** (bez nutnosti odhlášení a znovupřihlášení, tzn. `getIdToken(true)`).
3. **Správa předplatného (`SubscriptionManager` v `/settings`):**
   - Změna fakturačních údajů (`PUT /api/subscription/billing`).
   - Stažení PDF faktury (`GET /api/orders/:orderId/invoice.pdf`).
   - Zrušení předplatného (`/api/subscription/cancel`) → stav `cancelled_at_period_end`, prémiový přístup musí zůstat do `subscriptionPeriodEnd`.
   - Reaktivace předplatného (`/api/subscription/reactivate`).
4. **Expirace a Grace Period (`ACC_PREMIUM_EXP`):**
   - Ověřit chování `/api/subscription/check-expiry` a klientského `isSubscriptionPeriodExpired()` v `AuthContext.tsx`: zda po vypršení `subscriptionPeriodEnd` (+ 3denní grace period u `active`) dojde k synchronizaci custom claims na `free` (nebo `course`) i na backendu, nejen v UI!

---

### 🤖 Agent 4: `ACC_TEACHER` (Teacher Dashboard, CRUD, Správa studentů a financí)

**Vlastněné routy & endpointy:**
`/teacher` (všechny záložky: Kurzy, Procvičování, Materiály, Živé lekce, Testy/Pokrok, Studenti, Objednávky, Dotazy, Bug reporty, Průzkumy)
API: `/api/students/*`, `/api/courses/:id/enroll*`, `/api/materials/upload`, `/api/orders/*`, `/api/admin/*`, `/api/iucto/status`.

**Funkční a logické scénáře:**
1. **CRUD Procvičování a Materiálů (`PracticeManager`, `MaterialsManager`, `PdfSvgDropzone`):**
   - Vytvoření testovacího tématu/podtématu/otázky, skrytí (`isHidden: true`) → ověřit s Agentem 1, že skrytý obsah zmizí z `/api/practice/catalog`.
   - Upload testovacího souboru (PDF/PNG) přes `/api/materials/upload` a následné smazání (`DELETE /api/materials/:id`).
   - Kontrola `chunks` ukládání u velkých SVG materiálů.
2. **Správa kurzů a živých lekcí (`CoursesManager`, `LiveLessonsManager`):**
   - Vytvoření/úprava testovacího kurzu, zápis a odebrání studenta (`POST/DELETE /api/courses/:id/enroll`), ověření okamžité aktualizace `enrolledCourseIds` v custom claims studenta.
   - Vytvoření individuální vs. kurzové vs. veřejné (`targetAudience: 'all'`) živé lekce a ověření viditelnosti u cílových studentů.
3. **Správa studentů, objednávek a reklamací (`StudentsProgressManager`, `OrdersManager`, `BugReportsManager`, `InquiriesManager`):**
   - Změna role studenta přes `/api/students/:studentId/update-access` (na testovacím účtu).
   - Ruční potvrzení objednávky (`/api/orders/:id/confirm-manual`) a refund (`/api/orders/:id/refund`) na testovací sandbox objednávce.
   - Odpověď na dotaz studenta (`questionInquiries`) a vyřízení bug reportu (`PATCH /api/admin/bug-reports/:id`).

---

### 🛡️ Agent 5: Security, Rules & Data-Leak Auditor (Penetrační a staticko-dynamický audit)

Tento agent systematicky prověřuje **všech 20 bezpečnostních pravidel z `.agents/rules/proedu.md`** kombinací přímých API volání (s tokeny různých rolí), Firestore/Storage client SDK pokusů a statického auditu kódu:

1. **Test eskalace privilegií a Dev Backdoorů:**
   - Pokus o přímý zápis do `users/{uid}` přes Firestore SDK: změna `role`, `jokers`, `isAdmin`, `enrolledCourseIds`, `subscriptionStatus`, `referralCode`, `xp`, `gardenPlants`.
   - **Kontrola `referralCode` nesouladu:** V `src/context/AuthContext.tsx` je `referralCode` v `CLIENT_WRITABLE_PROFILE_FIELDS`, ale v `firestore.rules` je v zakázaném seznamu `!affectedKeys().hasAny([...])` → ověřit, zda to rozbíjí UI funkce v `/settings`.
   - Test `POST /api/dev/set-role` a `localStorage.proedu_dev_role_override`: ověřit přesné podmínky aktivace (`isDevToolsEnabled`, `VITE_ENABLE_DEV_TOOLBAR`), aby se nemohly aktivovat v produkčním buildu ani pro neautorizované hosty.
   - Test `POST /api/cron/process-subscriptions`: pokus o zavolání bez `x-cron-secret` nebo s prázdným `CRON_SECRET` (pokud není v `.env` nastaven, vrací 403/500 nebo projde?!).
   - Test `POST /api/payments/comgate/notify`: pokus o podvržení webhooku bez validního `merchant`/`secret` v payloadu.
2. **IDOR & Cross-Tenant Data Leaks (přístup k cizím datům):**
   - S tokenem `ACC_FREE` a `ACC_STUDENT` zkusit číst přes API i přímý Firestore SDK:
     - cizí `users/{ACC_PREMIUM_UID}`
     - cizí `orders/{id}` a `GET /api/orders/{ciziOrderId}/invoice.pdf`
     - cizí `tests/{id}`, `assignedTests/{id}`, `practiceAttempts/{id}`, `focusSessions/{id}`, `todos/{id}`, `bugReports/{id}`, `questionInquiries/{id}`
     - cizí `liveLessons/{id}` (individuální lekce pro jiného žáka nebo jiný kurz)
     - zakázané kolekce: `questions`, `pendingRegistrations`, `counters`, `webhooks`, `cronLocks`, `emailLogs`, `surveyResponses`, `referrals`.
3. **Únik odpovědí a prémiových dat (`correctAnswer` & Media Leak):**
   - Prozkoumat payloady `/api/practice/catalog`, `/api/practice/subtopics/:id/questions`, `/api/courses`, `/api/materials`: neobsahují skrytě `correctAnswer`, `explanation`, `solutionSvgContent`, `fileUrl` nebo `signedUrl` pro neplaceného uživatele?
   - Přímé volání `/api/practice/reveal-solution` a `/api/practice/check-answer` za `ACC_GUEST` a `ACC_FREE` s vyčerpanými žolíky nebo na ne-demo podtématech.
   - Test Storage Rules (`storage.rules`): pokus o čtení `/learningSheets/*`, `/materials/*`, `/courses/{kurzB}/*`, `/bugReports/{ciziUid}/*` a pokus o upload `image/svg+xml` (XSS vektor) do `/users/{uid}/avatar.svg` nebo `/bugReports/{uid}/xss.svg`.
4. **XSS, Sanitizace a Citlivá data v klientu:**
   - Zkontrolovat `dompurify`, `svgSanitizer`, `MathRenderer` proti payloadům `<svg onload=alert(1)>` (v bezpečném testovacím vstupu při náhledu), a ověřit, že žádný klíč z `.env` bez `VITE_` prefixu neunikl do `dist/` nebo `window`.
   - Kontrola `localStorage` / `sessionStorage`: neukládají se tam PII, tokeny nebo manipulovatelné stavy autorizace?

---

### ⚡ Agent 6: DB Load, Network & Logic Profiler (Výkon, Zátěž DB a Nelogické úlohy)

Tento agent měří efektivitu komunikace s Firestore, Express API a klientským stavem:

1. **Detekce Unbounded Reads (Čtení celých kolekcí bez limitu):**
   - Zkontrolovat a změřit dopad známých podezřelých míst v kódu:
     - `src/services/studentProgressService.ts`: `getDocs(collection(db, 'users'))` a `getDocs(collection(db, 'tests'))` bez `limit()`/stránkování! Kolik dokumentů se stáhne při otevření `/teacher`?
     - `src/services/inquiryService.ts`: `getDocs(collection(db, 'questionInquiries'))` bez limitu.
     - `src/services/courseService.ts`: `getDocs(collection(db, 'courses'))`.
     - `src/services/practiceService.ts`: `getDocs(query(collection(db, 'questions'), where('subtopicId', '==', subtopicId)))` — **POZOR**: `firestore.rules` zakazují čtení `questions` všem kromě `teacher`! Zkontrolovat, kde se tato funkce volá a zda nevyhazuje `PERMISSION_DENIED` studentům!
2. **Audit Realtime Listenerů (`onSnapshot`) a Memory/Connection Leaků:**
   - Zmapovat všechny aktivní `onSnapshot` odběry současně běžící na každé stránce:
     - `src/hooks/useNotifications.ts` otevírá až 7 `onSnapshot` listenerů (`inquiries`, `tests`, `practice`, `todos`, `sheets`, + učitelské `inquiries` a `tests`).
     - Souběžně běží `onSnapshot` na stránkách `StudentDashboard.tsx`, `Practice.tsx`, `Statistics.tsx`, `Garden.tsx` a v `liveLessonService.ts`.
   - Ověřit při navigaci tam a zpět (SPA routing), zda se staré `onSnapshot` listenery korektně odhlašují (`unsubscribe`), nebo se množí a duplikují čtení!
3. **Redundantní API/Firestore volání & Chybějící Cache (`cacheManager.ts`):**
   - Změřit počet requestů při:
     - Cold startu aplikace (`/`)
     - Přepnutí mezi Dashboard → Practice → Statistics → Garden → Dashboard
     - Přihlášení (`onAuthStateChanged` + `session-bootstrap` + `checkAndResetDailyJokers` + fallback `getDoc(users/{uid})`).
   - Zkontrolovat, zda `session-bootstrap` a `daily-reset` neběží zbytečně vícekrát po sobě při jednom reloadu.
4. **Nelogické úlohy a desynchronizace stavu:**
   - **Frontend vs. Backend zdroje pravdy:** Kde UI tvrdí jinou kapacitu/stav než server? Např.:
     - `isCourseUser` dostává v `AuthContext.tsx` globálně `isPremium = true`.
     - `syncUserProfile` při vypršení předplatného přepíše `effectiveProfile.role` jen lokálně v React state, ale pokud `check-expiry` selže nebo neběží, Custom Claim v tokenu je stále `premium`.
     - `jokerService.ts` vs `AuthContext.tsx` vs `server/index.js`: výpočet půlnoci (lokální čas klienta `getTodayDateString()` vs. UTC/Europe-Prague čas na serveru!).
   - **N+1 dotazy na backendu (`server/index.js`):** Zkontrolovat endpointy jako `/api/orders/all`, `/api/admin/surveys`, `/api/practice/catalog`, `/api/courses` — zda v cyklu neprovádějí `db.collection(...).doc(...).get()` místo `db.getAll(...)` nebo batchů.

---

## 5. Matice pokrytí: Co každý agent testuje

| Oblast / Funkce | Agent 1 (`Host/Free`) | Agent 2 (`Student/Course`) | Agent 3 (`Premium`) | Agent 4 (`Teacher`) | Agent 5 (`Security`) | Agent 6 (`DB/Logic`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Veřejný katalog & Demo procvičování | ✅ | — | — | — | ✅ (únik odpovědí) | ✅ (počet dotazů) |
| Žolíková ekonomika & Video odměny | ✅ | ✅ | ✅ (bypass) | — | ✅ (replay/race) | ✅ (timezone/sync) |
| Kurzy & Izolace kurzů (`A` vs `B`) | ✅ (jen preview) | ✅ (kritické!) | ✅ | ✅ (zápis/CRUD) | ✅ (cross-course) | ✅ (`isPaidUser` logika) |
| Studijní materiály, SVG, PDF | ✅ (blokováno) | ✅ (`course` test) | ✅ | ✅ (upload/chunk) | ✅ (Storage/XSS) | ✅ (velikost payloadu) |
| Přiřazené testy & To-Do & Zahrada | ❌ (blokováno) | ✅ | ✅ | ✅ (zadání/známky) | ✅ (IDOR/immutabilita) | ✅ (`onSnapshot` duplicity) |
| Comgate Sandbox, Objednávky, Faktury | ✅ (start nákupu) | — | ✅ (celé flow) | ✅ (správa/refund) | ✅ (webhook/cizí PDF) | ✅ (claim refresh) |
| Teacher Admin (Studenti, Bugy, Dotazy) | ❌ (blokováno) | ✅ (tvorba dotazu) | ✅ | ✅ | ✅ (admin API bypass) | ✅ (unbounded reads) |

---

## 6. Harmonogram exekuce (Provedení v budoucím `/swarm`)

1. **Fáze 0 — Setup & Seed (Koordinátor, ~5 min):**
   - Ověření běhu na `localhost:3005`, příprava `ACC_FREE`, `ACC_COURSE_A`, `ACC_PREMIUM` a testovacích kurzů A/B + testu pro `ACC_STUDENT`.
2. **Fáze 1 — Paralelní E2E & Funkční vlna (Agenti 1, 2, 3, 4 současně):**
   - Každý agent projde svůj scénář v Playwrightu, sbírá chyby z konzole, failed HTTP/Firestore requesty a počty síťových volání.
3. **Fáze 2 — Paralelní Hloubkový Audit (Agenti 5 a 6 současně):**
   - Agent 5 provede penetrační matici s využitím tokenů získaných ve Fázi 1.
   - Agent 6 zanalyzuje nasbírané síťové logy, `onSnapshot` životní cyklus a horké cesty v `src/services/*` a `server/index.js`.
4. **Fáze 3 — Úklid & Konsolidovaný Report (Koordinátor):**
   - Smazání dočasných testovacích účtů a `[TEST_AUDIT]` entit.
   - Sloučení nálezů do finálního reportu s deduplikací a prioritizací:
     - **P0 (Kritické):** Únik dat jiných uživatelů, eskalace role, obejití platební brány, ztráta dat.
     - **P1 (Vysoké):** Obcházení paywallu (např. `course` vs `premium`), chybný výpočet žolíků/testů, rozbitá funkce pro celou roli.
     - **P2 (Střední):** Unbounded Firestore dotazy, duplicitní `onSnapshot` listenery, nekonzistence UI vs. serveru.
     - **P3 (Nízké):** UX drobnosti, chybějící validace délky vstupů, zbytečné console warningy.

---

## 7. Šablona nálezu (Povinný výstupní formát pro všechny agenty)

Každý agent musí každý zjištěný problém zapsat přesně v této struktuře:

```markdown
### [P0/P1/P2/P3] Krátký název nálezu
- **Agent / Role:** např. Agent 2 (`ACC_COURSE_A`) / Agent 5 (Security)
- **Místo:** soubor / endpoint / Firestore kolekce / URL routa
- **Reprodukce (krok za krokem):**
  1. ...
  2. ...
- **Očekávané chování:** ...
- **Skutečné chování + Důkaz:** (HTTP status, response JSON, Firestore error, počet DB reads, screenshot/log)
- **Dopad (Bezpečnost / Data / Výkon / Logika):** ...
- **Navrhovaná oprava (bez zásahu do kódu):** ...
```

---

## 8. Kontrolní seznam pro spuštění plánu

Až budete chtít tento plán provést multi-agentně, stačí spustit `/teamwork` s odkazem na tento dokument:
> *"Proveď kompletní audit aplikace podle [docs/MULTIAGENT_TEST_PLAN.md](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/docs/MULTIAGENT_TEST_PLAN.md) na běžícím serveru `localhost:3005`. Dodrž všechny bezpečnostní mantinely (čistý audit bez úprav kódu, žádné destruktivní zásahy do cizích dat, kompletní úklid testovacích entit na konci)."*


---

## 9. Výsledná zpráva a konsolidovaný report z provedeného testování

### 9.1 Executive Summary (Manažerské shrnutí)

V souladu s multi-agentním plánem testování aplikace **ProEdu** proběhl dne **15. listopadu 2026** kompletní komplexní audit aplikace běžící na lokálním uzlu `http://localhost:3005` (backend Express + frontend Vite/React) napojené na produkční Firebase projekt `gen-lang-client-0972842509` (databáze `ai-studio-1fc75345-16e5-4af6-a275-4152ed6176ba`).

Testování provedl tým **6 specializovaných agentů** organizovaný do tří koordinovaných fází (Fáze 0: Setup & Seed, Fáze 1: Paralelní funkční a role-based audity, Fáze 2: Hloubkový bezpečnostní a profilovací audit, Fáze 3: Úklid a syntéza reportu). Audit probíhal v přísném režimu **Audit-Only** (žádné modifikace kódu během testování) a s maximálním ohledem na integritu produkčních dat a externích služeb (Gmail SMTP).

#### Metadata testovacího běhu
- **Datum a čas exekuce:** 15. listopadu 2026, 17:45 – 18:45 UTC (18:45 – 19:45 CET)
- **Cílové prostředí:** `http://localhost:3005` (Express API + Vite React SPA)
- **Cloud Database:** Google Cloud Firestore (Projekt: `gen-lang-client-0972842509`, DB: `ai-studio-1fc75345-16e5-4af6-a275-4152ed6176ba`)
- **Provedený tým:** Koordinátor + 6 specializovaných agentů:
  - *Agent 1:* Host & Free Role Specialist (`ACC_GUEST`, `ACC_FREE`)
  - *Agent 2:* Student & Course Role Specialist (`ACC_STUDENT`, `ACC_COURSE_A`)
  - *Agent 3:* Premium Lifecycle Specialist (`ACC_PREMIUM`)
  - *Agent 4:* Teacher Admin Specialist (`ACC_TEACHER`)
  - *Agent 5:* Security, Rules & Data-Leak Auditor (Penetrační sondy)
  - *Agent 6:* DB Load, Network & Logic Profiler (Telemetrie & Profiling)

#### Výsledková karta (Scorecard)
- **Celkový počet provedených testovacích případů:** 48
- **Počet úspěšně prošlých testovacích případů (Passed):** 28
- **Počet případů se zjištěnou anomálií / defektem (Failed):** 20
- **Konzolidovaná závažnost nálezů:**
  - 🔴 **P0 (Kritické bezpečnostní zranitelnosti):** **3**
  - 🟠 **P1 (Vysoké funkční, licenční a výkonnostní vady):** **9**
  - 🟡 **P2 (Střední nekonzistence, duplicity a unbounded dotazy):** **7**
  - ⚪ **P3 (Nízké logické a kosmetické vady):** **1**
  - **Celkem identifikovaných unikátních nálezů:** **20**

---

### 9.2 Kompletní katalog všech zjištěných nálezů (P0–P3)

Níže je uveden detailní strukturovaný soupis všech 20 zjištěných chyb a zranitelností zpracovaný v jednotném formátu podle §7 tohoto testovacího plánu:

---

#### 🔴 Úroveň P0: Kritické bezpečnostní vady a úniky dat (3 nálezy)

### [P0] Kritická desynchronizace a nenasazení Firestore pravidel do produkčního cloudu (Eskalace role na `premium`, zápis `isAdmin` a neomezených žolíků)
- **Agent / Role:** Agent 5 (Security, Rules & Data-Leak Auditor)
- **Místo:** Cloud Firestore projekt `gen-lang-client-0972842509`, kolekce `users/{uid}`, pravidla z commitu `96b0e55` vs lokální `firestore.rules`
- **Reprodukce (krok za krokem):**
  1. Přihlásit se jako běžný neplacený uživatel `ACC_FREE` (`qa-audit-free-20261115@proedu.local`).
  2. Získat Firebase Auth JWT idToken.
  3. Odeslat HTTP PATCH na `https://firestore.googleapis.com/v1/projects/gen-lang-client-0972842509/databases/ai-studio-1fc75345-16e5-4af6-a275-4152ed6176ba/documents/users/{uid}?updateMask.fieldPaths=role&updateMask.fieldPaths=jokers&updateMask.fieldPaths=isAdmin`:
     ```json
     {
       "fields": {
         "role": { "stringValue": "premium" },
         "jokers": { "integerValue": "999" },
         "isAdmin": { "booleanValue": true }
       }
     }
     ```
- **Očekávané chování:** Požadavek musí být zamítnut s kódem HTTP 403 `PERMISSION_DENIED` (klient nesmí sám měnit roli, žolíky ani administrátorská práva – viz Pravidlo 5 z `proedu.md`).
- **Skutečné chování + Důkaz:**
  - Požadavek vrátí HTTP `200 OK`.
  - V databázi se okamžitě přepíše `role: 'premium'`, `jokers: 999`, `isAdmin: true`.
  - Příčina: V cloudu jsou aktivní zastaralá pravidla z commitu `96b0e55` z 15. října 2026, která obsahují: `(isOwner(uid) && request.resource.data.role in ['student', 'free', 'premium', 'course'])`. Nová propracovaná pravidla z repozitáře (obsahující `isValidUserProfileOwnerUpdate`) nebyla do produkčního Firebase projektu nikdy nasazena.
- **Dopad:** Kritické porušení Pravidel 1, 2, 5, 8, 14 a 19 z `proedu.md`. Kdokoliv může z konzole prohlížeče bez placení eskalovat svůj účet na prémiový a získat neomezený počet žolíků.
- **Navrhovaná oprava (bez zásahu do kódu):**
  1. Zkontrolovat a nasadit aktuální verzi pravidel z repozitáře do Firebase:
     `firebase deploy --only firestore:rules --project gen-lang-client-0972842509`
  2. Zkontrolovat v administraci Firebase Console, že po nasazení pravidla striktně blokují jakýkoliv klientský pokus o změnu polí `role`, `jokers`, `isAdmin`, `subscriptionStatus`.

---

### [P0] Únik privátního Google Meet odkazu všech kurzů v Cloud Firestore (`allow read: if true;`)
- **Agent / Role:** Agent 2 (ACC_STUDENT & ACC_COURSE_A & Host) / Agent 5 (Security Auditor)
- **Místo:** Cloud Firestore kolekce `courses/{courseId}` v produkčním cloudu
- **Reprodukce (krok za krokem):**
  1. Bez přihlášení (anonymně z curl nebo Postmanu) odeslat HTTP GET na:
     `https://firestore.googleapis.com/v1/projects/gen-lang-client-0972842509/databases/ai-studio-1fc75345-16e5-4af6-a275-4152ed6176ba/documents/courses/dJP6jN6cauoIBWKezOiT`
  2. Zkontrolovat response tělo.
- **Očekávané chování:** Požadavek musí vrátit HTTP 403 `PERMISSION_DENIED`. Nepřihlášený uživatel smí přistupovat pouze k veřejnému katalogu přes sanitizovaný endpoint `GET /api/courses`.
- **Skutečné chování + Důkaz:**
  - Vrátí HTTP 200 OK s kompletním obsahem privátního dokumentu:
    ```json
    {
      "name": ".../documents/courses/dJP6jN6cauoIBWKezOiT",
      "fields": {
        "meetUrl": { "stringValue": "https://meet.google.com/test-audit-b" },
        "studentIds": { "arrayValue": {} },
        "instructorName": { "stringValue": "Audit Test Lektor B" },
        "title": { "stringValue": "[TEST_AUDIT] Kurz B" }
      }
    }
    ```
- **Dopad:** Porušení Pravidla 1 a 19 z `proedu.md`. Kdokoliv na internetu může scrapovat celou databázi kurzů a získat přímé přístupové odkazy na živé lekce s lektory bez zakoupení kurzu.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - Nasadit aktuální `firestore.rules`, kde je pro `courses` pravidlo:
    `allow read: if isTeacher() || isEnrolledInCourse(courseId);`

---

### [P0] Veřejné čtení celé kolekce otázek (`questions`) včetně správných odpovědí (`correctAnswer`) neregistrovaným hostem i žákem
- **Agent / Role:** Agent 6 (DB Load, Network & Logic Profiler)
- **Místo:** Cloud Firestore kolekce `questions`, deployed rules na projektu `gen-lang-client-0972842509`
- **Reprodukce (krok za krokem):**
  1. Odeslat HTTP POST dotaz bez autorizační hlavičky na Cloud Firestore REST API:
     `https://firestore.googleapis.com/v1/projects/gen-lang-client-0972842509/databases/ai-studio-1fc75345-16e5-4af6-a275-4152ed6176ba/documents:runQuery`
  2. Tělo požadavku:
     ```json
     {
       "structuredQuery": {
         "from": [{ "collectionId": "questions" }],
         "where": {
           "fieldFilter": {
             "field": { "fieldPath": "subtopicId" },
             "op": "EQUAL",
             "value": { "stringValue": "P28x0Gl6ZH6qHpJLM0nh" }
           }
         }
       }
     }
     ```
  3. Zkontrolovat odpověď serveru.
- **Očekávané chování:** Požadavek musí skončit chybou HTTP 403 `PERMISSION_DENIED`. Kolekce `questions` nesmí být čitelná pro hosty ani běžné studenty (viz Pravidlo 1 a 2 z `proedu.md`).
- **Skutečné chování + Důkaz:**
  - Status: HTTP `200 OK`.
  - Vráceno 20 otázek. První dokument `dhLxXge1vsB74TZB2eMW` přímo obsahuje:
    `"correctAnswer": { "stringValue": "í" }`
    `"explanation": { "stringValue": "Přídavné jméno dravý je tvrdé..." }`
- **Dopad:** Kritický bezpečnostní únik. Žáci i útočníci mohou stáhnout celou databázi otázek se správnými odpověďmi a vysvětlením, čímž je znehodnocen testovací i vzdělávací systém.
- **Navrhovaná oprava (bez zásahu do kódu):**
  1. Nasadit aktuální lokální pravidla `firebase deploy --only firestore:rules`.
  2. Zkontrolovat klientský kód v `src/services/practiceService.ts` (`getQuestionsForSubtopic`), aby se po nasazení pravidel nevolal přímo z klientských stránek studentů (volat výhradně přes serverový endpoint `/api/practice/subtopics/:id/questions`, který pole `correctAnswer` odstraňuje).

---

#### 🟠 Úroveň P1: Závažné funkční, licenční a výkonnostní vady (9 nálezů)

### [P1] Únik správných odpovědí (`correctAnswer`) a vysvětlení v přiřazených žákovských testech (`assignedTests`)
- **Agent / Role:** Agent 2 (ACC_STUDENT) / Agent 5 (Security Auditor)
- **Místo:** Firestore kolekce `assignedTests/{testId}` (dokument `yxtVTgOooTWOLWxqbr6n`)
- **Reprodukce (krok za krokem):**
  1. Přihlásit se jako žák `ACC_STUDENT` (`student@student.cz`).
  2. Načíst přiřazený test `yxtVTgOooTWOLWxqbr6n` přímo z Firestore nebo přes REST API.
  3. Prozkoumat objekty v poli `questions`.
- **Očekávané chování:** Během probíhajícího testu nesmí být v klientských datech obsaženo pole `correctAnswer` ani `explanation`. Vyhodnocení testu má proběhnout na serveru po odevzdání.
- **Skutečné chování + Důkaz:**
  - V dokumentu `assignedTests/yxtVTgOooTWOLWxqbr6n` jsou u otázek uloženy klíče:
    `"correctAnswer": { "stringValue": "20" }`, `"explanation": { "stringValue": "x = 10 / 0,5 = 20." }`. Žák může otevřít DevTools a zkopírovat správné odpovědi.
- **Dopad:** Porušení Pravidla 16 (Least privilege). Ztráta objektivity hodnocení, protože správné odpovědi jsou žákovi doručeny předem v payloadu.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - Při vytváření záznamu v `assignedTests` z předlohy testu stripovat pole `correctAnswer` a `explanation`. Po odevzdání testu žákem odeslat odpovědi na serverový endpoint (např. `/api/tests/:id/grade`), kde server porovná odpovědi s neveřejnou předlohou a zapíše výsledné hodnocení.

---

### [P1] Globální únik ProEdu Premium obsahu pro uživatele s rolí `course` (`isCourseUser -> isPremium = true`)
- **Agent / Role:** Agent 2 (ACC_COURSE_A) / Agent 5 / Agent 6
- **Místo:** `server/index.js` (`requirePremiumOrTeacher`), `src/context/AuthContext.tsx` (`isPremium`), `storage.rules`, `firestore.rules`
- **Reprodukce (krok za krokem):**
  1. Zapsat žáka do jediného kurzu (Kurz A `GjHypxfjUC2iGK5ejAiM`). Žák získá `role: 'course'`.
  2. S tokenem tohoto žáka zavolat:
     - `GET http://localhost:3005/api/practice/study/EgK2CfdXLfP3NjUC1Y30` (Aritmetický průměr)
     - `GET http://localhost:3005/api/materials/mat_1794590385029_v1v41g8/file`
     - Vytvořit To-Do úkol s `type: 'practice'`.
  3. Pro srovnání provést stejné volání s účtem `ACC_STUDENT` (free).
- **Očekávané chování:** Student zapsaný v Kurzu A by měl mít přístup ke studijním materiálům vztahujícím se k tomuto kurzu, případně by měly být prémiové výhody časově ohraničeny po dobu trvání kurzu.
- **Skutečné chování + Důkaz:**
  - Endpoint `/api/practice/study/:id` i `/api/materials/:id/file` vrátí HTTP 200 OK a plný obsah (např. 6.1 MB PDF materiál), zatímco `ACC_STUDENT` obdrží HTTP 403 Forbidden. V `server/index.js`:
    ```javascript
    function requirePremiumOrTeacher(req, res, next) {
      const role = req.user?.role;
      if (role !== 'premium' && role !== 'course' && role !== 'teacher') {
        return res.status(403).json({ error: 'Tento obsah vyžaduje předplatné ProEducator Premium nebo aktivní kurz.' });
      }
      return next();
    }
    ```
    a v `AuthContext.tsx` řádek 527 je `isPremium = isTeacher || isCourseUser || hasActivePaidPremium`. Role `course` tak odemyká celé ProEdu Premium trvale pro všechny předměty.
- **Dopad:** Obchodní a licenční únik (kanibalizace měsíčního předplatného nákupem jednorázového kurzu).
- **Navrhovaná oprava (bez zásahu do kódu):**
  - Oddělit oprávnění ke kurzu od globálního prémiového členství. Přístup ke studijním materiálům vázat na konkrétní `courseId`, nebo stanovit expiraci vázanou na datum ukončení kurzu (`courseEndDate`).

---

### [P1] Obejití žolíkové ekonomiky přes přímé volání `/api/practice/finish` při 0 žolících
- **Agent / Role:** Agent 1 (ACC_FREE) / Agent 5 (Security Auditor)
- **Místo:** `server/index.js` (řádky 4690–4820, endpoint `POST /api/practice/finish`)
- **Reprodukce (krok za krokem):**
  1. Přihlásit se jako `ACC_FREE` a spotřebovat žolíky na `0`.
  2. Ověřit, že `POST /api/practice/check-answer` vrací `HTTP 402` `NO_JOKERS`.
  3. Zavolat `POST /api/practice/finish` s platným `subtopicId` a polem `answers`.
- **Očekávané chování:** Server by měl zkontrolovat stav žolíků a při 0 žolících odmítnout dokončení cvičení s `HTTP 402 NO_JOKERS`.
- **Skutečné chování + Důkaz:**
  - Endpoint vrátí `HTTP 200 OK` s plným vyhodnocením, zapíše test do `tests` a inkrementuje streak (`streak: 1`):
    `finish response: { ok: true, attemptId: 'ALWQCuEyigyzA2f3cuNa', score: 0, totalQuestions: 1, streak: 1 }`
- **Dopad:** Porušení Pravidla 17 (Logika oprávnění nesmí být jen v UI). Student s 0 žolíky může hromadně odesílat cvičení přímo na `/api/practice/finish` bez nutnosti volat `check-answer`, získávat vyhodnocení, navyšovat streak a zaznamenávat výsledky.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - V `app.post('/api/practice/finish')` ověřit pro neučitelské a neprémiové role, že `userData.jokers >= 1` před vyhodnocením testu.

---

### [P1] Nesoulad identifikátoru předmětu (`Čeština` vs `Český jazyk`) uzamyká neregistrovanému hostovi 100 % témat na `/practice`
- **Agent / Role:** Agent 1 (ACC_GUEST)
- **Místo:** `server/index.js` (řádky 4304–4315), `src/pages/Practice.tsx` (řádky 115–135 a 360–375), Firestore `practiceTopics` a `practiceSubtopics`
- **Reprodukce (krok za krokem):**
  1. Otevřít `http://localhost:3005/practice` jako nepřihlášený host.
  2. Server v katalogu určí `firstDemoSubtopicId = "P28x0Gl6ZH6qHpJLM0nh"`, což je podtéma "Pravopis i/y" pod tématem `EcTiqWTmptb4bQoVS4Kg` ("Pravopis"), které má v DB `subjectId: "Český jazyk"`.
  3. `Practice.tsx` filtruje témata podle `PREDEFINED_SUBJECTS`, kde je ID `'Čeština'`. Proto je téma `EcTiqWTmptb4bQoVS4Kg` (`subjectId: 'Český jazyk'`) z UI zcela vyfiltrováno.
  4. Místo něj je zobrazeno téma `wprdzEYEZn8xXVPP12vC` ("1. Pravopis", `subjectId: 'Čeština'`), které obsahuje jiná podtémata.
  5. Žádné z nich se nerovná `firstDemoSubtopicId` (`"P28x0Gl6ZH6qHpJLM0nh"`).
  6. Všechna tlačítka mají `isLockedForGuest: true`, text "Odemknout" a odkazují na registrační modal.
- **Očekávané chování:** Host má mít v UI jedno demo podtéma odemčené ("Procvičovat") s možností vyzkoušet demo sadu.
- **Skutečné chování + Důkaz:** V UI `/practice` je 100 % podtémat pro hosta zamčeno. Žádné podtéma nemá tlačítko "Procvičovat".
- **Dopad:** Zablokovaný guest onboarding a nemožnost vyzkoušet aplikaci z katalogu před registrací.
- **Navrhovaná oprava (bez zásahu do kódu):** Sjednotit hodnoty předmětu (`Čeština` vs `Český jazyk`) a normalizovat porovnávání v `Practice.tsx` i `server/index.js`.

---

### [P1] Nefunkční vykreslování miniatur materiálů v Teacher a Student rozhraní (`HTTP 401 Unauthorized`)
- **Agent / Role:** Agent 4 (ACC_TEACHER) / Agent 5
- **Místo:** `server/index.js` (`GET /api/materials/:id/thumbnail`), `src/components/admin/MaterialsManager.tsx` (řádek 664)
- **Reprodukce (krok za krokem):**
  1. Přihlásit se jako učitel a otevřít nástěnku: `http://localhost:3005/teacher?tab=materials`.
  2. Sledovat síťové požadavky prohlížeče na miniatury materiálů.
- **Očekávané chování:** Miniatury nahraných PDF a SVG materiálů se korektně zobrazí v kartách materiálů.
- **Skutečné chování + Důkaz:**
  - V konzoli prohlížeče vyskočí 5× `Failed to load resource: the server responded with a status of 401 (Unauthorized)`.
  - Příčina: HTML `<img>` tag nemůže posílat HTTP hlavičku `Authorization: Bearer <token>`, kterou endpoint vyžaduje.
- **Dopad:** Učitel ani student nevidí náhledy materiálů; v UI jsou zobrazeny rozbité obrázky a konzole je zahlcena chybami 401.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - Povolit předávání tokenu v query parametru (např. `/api/materials/:id/thumbnail?token=<token>`), nebo v komponentě načítat obrázek přes `fetch()` s hlavičkou Authorization a konvertovat na Object URL (`URL.createObjectURL(blob)`).

---

### [P1] Nemožnost vytvořit kurzovou živou lekci v databázi (`targetAudience: 'course' -> PERMISSION_DENIED`)
- **Agent / Role:** Agent 4 (ACC_TEACHER)
- **Místo:** `firestore.rules` (kolekce `liveLessons`), `src/services/liveLessonService.ts`
- **Reprodukce (krok za krokem):**
  1. Učitel se pokusí vytvořit živou lekci pro kurz (`targetAudience: 'course'`, `courseId: 'GjHypxfjUC2iGK5ejAiM'`).
  2. Požadavek odešle přes Firestore Client SDK nebo REST API.
- **Očekávané chování:** Učitel smí naplánovat živou lekci vyhrazenou pro studenty konkrétního kurzu.
- **Skutečné chování + Důkaz:**
  - Zápis selže s chybou: `7 PERMISSION_DENIED: Missing or insufficient permissions.`.
  - Pravidla nasazená na cloudové databázi akceptují pouze `targetAudience in ['all', 'individual']`.
  - V `src/services/liveLessonService.ts` funkce `subscribeToStudentLiveLessons` navíc kurzové lekce vůbec nedotazuje (`where('courseId', ...)` zcela chybí).
- **Dopad:** Žáci zapsaní v přípravných kurzech nemohou mít své vlastní vyhrazené online lekce s lektorem.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - V pravidlech pro `liveLessons` sjednotit povolený výčet na `data.targetAudience in ['all', 'individual', 'course']` a v `liveLessonService.ts` doplnit odběr pro zapsané kurzy.

---

### [P1] Chybějící proměnná `ALLOW_SANDBOX_PAYMENTS="true"` v `.env` blokuje simulaci plateb a objednávek (`HTTP 503 / 404`)
- **Agent / Role:** Agent 3 (ACC_PREMIUM) / Agent 4 (ACC_TEACHER) / Agent 5
- **Místo:** `.env` / `server/index.js` (řádky 1650, 1667–1671, 2097)
- **Reprodukce (krok za krokem):**
  1. Odeslat požadavek `POST http://localhost:3005/api/orders/create` s platnými platebními údaji v testovacím prostředí.
- **Očekávané chování:** Server v testovacím režimu (`COMGATE_TEST_MODE="true"`) vytvoří objednávku se stavem `pending` a vrátí platební instrukce pro sandbox simulaci platby.
- **Skutečné chování + Důkaz:**
  - Server vrátí `HTTP 503 Service Unavailable`: `{"error":"Platební brána Comgate není v tomto prostředí dostupná."}`.
  - Volání `/api/payments/comgate/sandbox-simulate-pay` vrací `HTTP 404 Endpoint nenalezen.`.
  - Příčina: Funkce `isSandboxSimulationAllowed()` vyžaduje `COMGATE_TEST_MODE && ALLOW_SANDBOX_PAYMENTS && process.env.NODE_ENV !== 'production'`. V `.env` proměnná `ALLOW_SANDBOX_PAYMENTS` zcela chybí.
- **Dopad:** Vývojáři a testeři nemohou v lokálním a staging prostředí projít nákupní proces Premium členství.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - Do konfiguračního souboru `.env` přidat řádek `ALLOW_SANDBOX_PAYMENTS="true"`.

---

### [P1] Klientská expirace předplatného degraduje roli pouze v lokálním React state a nesynchronizuje Firebase Auth Custom Claims
- **Agent / Role:** Agent 3 (ACC_PREMIUM) / Agent 5 / Agent 6
- **Místo:** `src/context/AuthContext.tsx` (řádky 356–366), `src/services/orderService.ts` (řádek 451), `firestore.rules` (řádky 32–36)
- **Reprodukce (krok za krokem):**
  1. Nastavit účtu expiraci v minulosti se statusem `cancelled_at_period_end`.
  2. Otevřít aplikaci v prohlížeči jako tento uživatel.
  3. Zkontrolovat stav v UI vs. přímý dotaz přes Firestore Client SDK na kolekci `learningSheets` nebo `practiceSubtopics`.
- **Očekávané chování:** Po zjištění vypršení předplatného by měl klient vyvolat synchronizaci se serverem (`/api/subscription/check-expiry`), backend by měl aktualizovat custom claims na `free` a klient by měl zavolat `getIdToken(true)`.
- **Skutečné chování + Důkaz:**
  - V `AuthContext.tsx` se role změní na `free` pouze lokálně v React state (`effectiveProfile.role = 'free'`).
  - V databázi Firestore i v JWT tokenu uživatele zůstává claim `role: 'premium'`. Pravidlo `isPaidUser()` nadále povoluje neomezené čtení placených materiálů přes Firestore SDK.
  - Funkce `checkSubscriptionExpiry()` v `orderService.ts` je mrtvý kód – v celém repozitáři se nikde nevolá.
- **Dopad:** Bezpečnostní a licenční únik prémiových dat po vypršení předplatného.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - V `AuthContext.tsx` při detekci `isSubscriptionPeriodExpired` zavolat serverový endpoint `/api/subscription/check-expiry` a následně `await authUser.getIdToken(true)`.

---

### [P1] Extrémní zátěž Firestore v `/api/practice/check-answer` (83 reads na každou zodpovězenou otázku)
- **Agent / Role:** Agent 6 (DB Load, Network & Logic Profiler)
- **Místo:** `server/index.js` (řádky 4572–4575 a 4640–4643), funkce `loadPracticeCatalogFromFirestore()`
- **Reprodukce (krok za krokem):**
  1. Přihlásit se jako žák a spustit procvičování libovolného tématu.
  2. Při každém kliknutí na "Zkontrolovat odpověď" se odešle `POST /api/practice/check-answer`.
  3. Server v `handleCheckPracticeAnswer` vyvolá `loadPracticeCatalogFromFirestore()`.
- **Očekávané chování:** Ověření odpovědi má přečíst pouze dokument dané otázky (1 read) a zkontrolovat kvótu uživatele (1 read). Celkem max 2 reads.
- **Skutečné chování + Důkaz:**
  - Server při každé jednotlivé odpovědi načítá celou kolekci `customTopics` (19 dokumentů) a celou kolekci `practiceSubtopics` (62 dokumentů).
  - Spolu s otázkou a profilem žáka jde o **83 Firestore čtení na každou zodpovězenou otázku**.
  - Vyřešení sady 10 otázek generuje **830 čtení z Firestore**. Pouhých 60 aktivních žáků denně vyčerpá bezplatnou kvótu 50 000 reads/den celého projektu.
- **Dopad:** Masivní zbytečná zátěž databáze, vysoké finanční náklady a zbytečná latence odezvy při vyhodnocování úloh.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - Výsledky `loadPracticeCatalogFromFirestore()` uložit na serveru do in-memory cache s TTL 10 minut, nebo v `check-answer` načítat podtéma přímým dotazem `db.collection('practiceSubtopics').doc(subtopicId).get()` (1 read namísto 81).

---

#### 🟡 Úroveň P2: Střední nekonzistence, duplicity a unbounded dotazy (7 nálezů)

### [P2] Extrémní duplikace a kumulace Realtime listenerů (až 12 aktivních listenerů na nástěnce studenta)
- **Agent / Role:** Agent 6 (DB Load, Network & Logic Profiler)
- **Místo:** `src/components/LiveLessonNotificationWatcher.tsx`, `src/hooks/useNotifications.ts`, `src/pages/StudentDashboard.tsx`
- **Reprodukce (krok za krokem):**
  1. Přihlásit se jako prémiový nebo kurzový student na `http://localhost:3005/`.
  2. Zmapovat aktivní `onSnapshot` odběry:
     - `LiveLessonNotificationWatcher`: 2 listenery na `liveLessons`
     - `useNotifications` (v `StudentSidebar`): 2 listenery na `liveLessons`, 1 na `todos`, 1 na `practiceSubtopics`, 1 na `learningSheets`, 1 na `questionInquiries`, 1 na `assignedTests` (7 listenerů)
     - `StudentDashboard`: 2 listenery na `liveLessons`, 1 na `todos` (3 listenery)
- **Očekávané chování:** Každá kolekce má mít maximálně jeden centrální realtime odběr sdílený přes React Context nebo globální store.
- **Skutečné chování + Důkaz:**
  - Na domovské stránce běží současně **12 realtime listenerů**, z toho 6 duplicitních na `liveLessons` a 2 duplicitní na `todos`.
- **Dopad:** Zbytečná režie websocketů, zvýšená spotřeba paměti a baterie zařízení, násobení účtovaných čtení při změně lekce nebo úkolu.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - Sloučit odběr živých lekcí do jednoho sdíleného `LiveLessonContext` a sjednotit odběr `todos` do jednoho sdíleného store.

---

### [P2] Masivní Unbounded Reads při načítání postupu studentů v `getStudentsProgressList`
- **Agent / Role:** Agent 4 (ACC_TEACHER) / Agent 6
- **Místo:** `src/services/studentProgressService.ts` (řádky 96–104), `src/components/admin/StudentsProgressManager.tsx`
- **Reprodukce (krok za krokem):**
  1. Učitel otevře záložku Studenti: `http://localhost:3005/teacher?tab=students`.
  2. Komponenta vyvolá `getStudentsProgressList()`.
- **Očekávané chování:** Načítá se stránkovaný seznam studentů (např. 25 na stránku) s možností filtrování na serveru.
- **Skutečné chování + Důkaz:**
  - Kód provádí paralelní stažení:
    ```typescript
    const [usersSnap, subtopicsList, testsSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getSubtopics(),
      getDocs(query(collection(db, 'tests'), orderBy('createdAt', 'desc')))
    ]);
    ```
  - Stahují se kompletně všechny uživatelské profily z celé databáze a všechny záznamy z kolekce `tests` bez limitu.
- **Dopad:** Značné zpomalení načítání, zbytečné čerpání kvót Firestore a riziko paměťového kolapsu prohlížeče při stovkách studentů.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - Implementovat stránkování (`limit(25)`), agregované statistiky ukládat přímo do dokumentu studenta.

---

### [P2] Unbounded Read v nástěnce učitele pro dotazy žáků (`getAllInquiries`) a backendové seznamy (`/api/orders/all`, `/api/admin/surveys`)
- **Agent / Role:** Agent 4 (ACC_TEACHER) / Agent 6
- **Místo:** `src/services/inquiryService.ts` (řádek 108), `server/index.js` (řádky 2293, 1392)
- **Reprodukce (krok za krokem):**
  1. Učitel přejde na jakoukoliv záložku v `/teacher`.
  2. `useEffect` v `TeacherDashboard.tsx` automaticky zavolá `getAllInquiries()`.
- **Očekávané chování:** Načítají se pouze otevřené dotazy (`where('status', '==', 'pending')`) s limitem.
- **Skutečné chování + Důkaz:**
  - `getAllInquiries()` provádí `getDocs(collection(db, 'questionInquiries'))` bez filtru a bez limitu.
  - Na backendu endpointy `GET /api/orders/all` i `GET /api/admin/surveys` stahují všechny dokumenty bez omezení `limit()`.
- **Dopad:** Zbytečná zátěž čtení Firestore a paměti Node.js procesu při každém vstupu na nástěnku učitele.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - Doplnit `.limit(50)` a stránkovací parametry pro dotazy i objednávky.

---

### [P2] Neshoda typu cílové skupiny živých lekcí v lokálním `firestore.rules` vs UI kód (`'individual'` vs `'selected'`)
- **Agent / Role:** Agent 4 (ACC_TEACHER) / Agent 5
- **Místo:** `src/components/admin/LiveLessonsManager.tsx` (řádek 35 a 122), `firestore.rules` (řádek 194)
- **Reprodukce (krok za krokem):**
  1. Porovnat hodnoty v UI kódu `setTargetAudience<'all' | 'individual'>` se souborem `firestore.rules`.
  2. V souboru `firestore.rules` řádek 194 stojí: `data.targetAudience in ['all', 'selected', 'course']`.
- **Očekávané chování:** Názvy enumů v klientském kódu a bezpečnostních pravidlech musí být identické.
- **Skutečné chování + Důkaz:**
  - V repozitáři je v `firestore.rules` uvedeno `'selected'`, zatímco TypeScript typ i UI v `LiveLessonsManager` posílají `'individual'`.
  - Pokud by vývojář nasadil pravidla z lokálního repozitáře, okamžitě zablokuje vytváření všech individuálních lekcí v aplikaci.
- **Dopad:** Skrytá regresní past při budoucím nasazení bezpečnostních pravidel z gitu.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - Upravit řádek 194 ve `firestore.rules` z `'selected'` na `'individual'`.

---

### [P2] Desynchronizace pole `referralCode` mezi `AuthContext.tsx` a `firestore.rules`
- **Agent / Role:** Agent 5 (Security Auditor)
- **Místo:** `src/context/AuthContext.tsx` (řádek 47) vs. `firestore.rules` (řádek 199)
- **Reprodukce (krok za krokem):**
  1. Porovnat množinu `CLIENT_WRITABLE_PROFILE_FIELDS` v `AuthContext.tsx` se souborem `firestore.rules`.
  2. V `AuthContext.tsx` je `'referralCode'` uveden jako povolené pole pro zápis klientem.
  3. V `firestore.rules` (řádek 199) je `'referralCode'` uveden v seznamu zakázaných polí `!affectedKeys().hasAny([...])`.
- **Očekávané chování:** Klient nesmí sám zapisovat zvací kód (zvací kódy jsou generovány systémem a uplatňovány přes `/api/referrals/claim`).
- **Skutečné chování + Důkaz:**
  - Nesoulad konfigurace. Pokud by byla nasazena lokální pravidla a frontend by zavolal `updateProfileData({ referralCode })`, Firestore vyhodí chybu `PERMISSION_DENIED`.
- **Dopad:** Regresní riziko při deployi nových pravidel z repozitáře.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - Odstranit `'referralCode'` z `CLIENT_WRITABLE_PROFILE_FIELDS` v `src/context/AuthContext.tsx`.

---

### [P2] Časová desynchronizace výpočtu půlnoci (Timezone Flaw: lokální čas klienta vs Europe/Prague na backendu)
- **Agent / Role:** Agent 6 (DB Load, Network & Logic Profiler)
- **Místo:** `src/services/jokerService.ts` (`getTodayDateString()`), `src/components/JokerZoneSection.tsx` (řádky 78–80), `server/index.js` (`getPragueDateString()`)
- **Reprodukce (krok za krokem):**
  1. Změnit časové pásmo v operačním systému / prohlížeči (např. na UTC-5 New York nebo UTC+8 Singapur).
  2. Přihlásit se v čase kolem 23:00–02:00 UTC.
  3. Sledovat stav žolíků a tlačítko "Denní žolíci".
- **Očekávané chování:** Datum půlnoci a denní reset musí být na klientu i serveru vyhodnocovány podle jednotného standardu (časové pásmo `Europe/Prague`).
- **Skutečné chování + Důkaz:**
  - Server ukládá `lastDailyGrantDate` podle pražského času (`Europe/Prague`).
  - Klient v `getTodayDateString()` používá lokální čas zařízení `now.getFullYear()`, `now.getMonth()`, `now.getDate()`.
  - Při neshodě datumu dochází k chybnému zobrazení tlačítka v UI a odmítání serverových dotazů.
- **Dopad:** Zmatení uživatelů přistupujících ze zahraničí a nemožnost korektně vyzvednout denní žolíky.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - V `jokerService.ts` sjednotit `getTodayDateString()` na `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' })`.

---

### [P2] Nekonzistence a placeholdery na routách `/test/:testId` a `/review/:testId` (spolu se zastaralými claims v `getIdTokenResult()`)
- **Agent / Role:** Agent 2 (ACC_STUDENT) / Agent 3 (ACC_PREMIUM)
- **Místo:** `src/pages/TestTaker.tsx`, `src/pages/TestReview.tsx`, `src/context/AuthContext.tsx` (řádek 305)
- **Reprodukce (krok za krokem):**
  1. Navštívit `http://localhost:3005/test/yxtVTgOooTWOLWxqbr6n` přihlášený jako `ACC_STUDENT`.
  2. V `AuthContext.tsx` řádek 305 prověřit volání `tokenResult = await authUser.getIdTokenResult();`.
- **Očekávané chování:** Zobrazení interaktivního prostředí pro vyplnění testu a zobrazení hodnocení; `getIdTokenResult(true)` s force refresh parametrem po aktualizaci claims.
- **Skutečné chování + Důkaz:**
  - Stránky `/test/*` a `/review/*` obsahují pouze statické texty:
    *"Pro spuštění testu přejdi do sekce Procvičování..."*
    *"Detailní přehled svých odevzdaných testů najdeš v sekci Statistiky."*
  - V `AuthContext.tsx` volání bez parametru načte staré cachované claims, což může vést k zachování neaktuální role v React state.
- **Dopad:** Nefunkční přímé odkazy na přiřazené testy a zpožděná aktualizace stavu oprávnění v klientském rozhraní.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - Napojit `TestTaker.tsx` na `assignedTests/{testId}` a na řádku 305 v `AuthContext.tsx` upravit volání na `authUser.getIdTokenResult(true)`.

---

#### ⚪ Úroveň P3: Nízké logické vady (1 nález)

### [P3] Nekonzistence počátečního stavu žolíků a neomezený bonusový strop (5 vs 10 žolíků a překročení stropu)
- **Agent / Role:** Agent 1 (ACC_FREE)
- **Místo:** `server/index.js` (řádka 659 vs 4882, `/api/survey/submit`, `/api/referrals/claim`), `src/services/jokerService.ts`
- **Reprodukce (krok za krokem):**
  1. Zavolat `POST /api/auth/session-bootstrap` pro nový profil.
  2. Zkontrolovat stav žolíků (nastaveno `jokers: 5`). V UI a textech se uvádí: *"Zaregistruj se zdarma a získej 10 žolíků denně!"*.
  3. Odesláním průzkumu získal uživatel s 10 žolíky novou hodnotu 25 žolíků (`newJokers: 25`).
- **Očekávané chování:** Nový uživatel má mít v první den plnou deklarovanou kapacitu 10 žolíků; bonusové žolíky mají mít definovaný globální hard cap.
- **Skutečné chování + Důkaz:**
  - Uživatel začíná s 5 žolíky. Bonusové žolíky překračují denní strop 15 bez omezení.
- **Dopad:** Rozpor mezi marketingovou nabídkou v UI a reálným stavem účtu; chybějící globální strop bonusových žolíků.
- **Navrhovaná oprava (bez zásahu do kódu):**
  - V `session-bootstrap` nastavit výchozí hodnotu na `jokers: BASE_JOKER_CAP` (10) a stanovit globální bezpečnostní strop pro bonusové žolíky (např. 100).

---

### 9.3 Matice auditu 20 bezpečnostních pravidel z `.agents/rules/proedu.md`

Následující tabulka dokumentuje stav plnění každého z 20 bezpečnostních pravidel projektu na základě výsledků penetračních a statických testů:

| # | Pravidlo z `proedu.md` | Stav auditu | Nález a technické vysvětlení |
|:---:|---|:---:|---|
| **1** | **Bezpečnost priorita nad rychlostí** (žádné `allow read, write: if true`) | 🔴 **PORUŠENO V CLOUDU** | V Cloud Firestore je pro `courses/{courseId}` a `questions/{questionId}` aktivní pravidlo `allow read: if true;` z commitu `96b0e55`. Veřejně unikají Google Meet odkazy i správné odpovědi. |
| **2** | **Firebase Firestore jediný zdroj pravdy** (oprávnění v Rules / server) | 🔴 **PORUŠENO V CLOUDU** | Pravidla v cloudu nekontrolují zápis privilegovaných polí; expirace předplatného v UI degraduje stav jen lokálně v React state. |
| **3** | **RLS jako document-level ownership** (`uid`, `studentId`, ...) | 🟡 **ČÁSTEČNĚ SPLNĚNO** | Document-level ownership na většině kolekcí funguje (cizí data nelze číst), ale na `users/{uid}` vlastník smí přepsat privilegovaná pole (`role: 'premium'`, `isAdmin`). |
| **4** | **Role nikdy neodvozuj z emailu ve frontendu** | 🟢 **SPLNĚNO** | Frontend striktně používá Firebase Auth Custom Claims a dokument uživatelského profilu. Stará email-based logika byla z kódu odstraněna. |
| **5** | **Klient nesmí zapisovat privilegované hodnoty** (`role`, `isAdmin`, ...) | 🔴 **PORUŠENO V CLOUDU** | V Cloud Firestore běžný neplacený uživatel smí sám přepsat `role: 'premium'`, `isAdmin: true`, `jokers: 999` a `enrolledCourseIds`. |
| **6** | **Každá kolekce musí mít explicitní access model** | 🟡 **ČÁSTEČNĚ SPLNĚNO** | Lokální soubor pravidel model definuje; v produkčním cloudu však chybí ochrana kurzů, otázek a schémata uživatelských profilů. |
| **7** | **Imutabilní pole chráněna v rules** (`uid`, `createdAt`, `testId`) | 🟢 **SPLNĚNO** | Pokus o přepsání `uid` a cizích klíčů byl pravidly korektně zamítnut (HTTP 403 `PERMISSION_DENIED`). |
| **8** | **Validuj datový tvar v rules** (typy, limity, enums) | 🔴 **PORUŠENO V CLOUDU** | V Cloud Firestore chybí validace datového tvaru na `users/{uid}`, což umožňuje zapsat neomezený počet žolíků i libovolné textové řetězce. |
| **9** | **Nepoužívej broad reads** (žádné čtení celých kolekcí bez omezení) | 🔴 **PORUŠENO V APLIKACI** | 1. `courses` a `questions` jsou veřejně čitelné. 2. `studentProgressService.ts` a `inquiryService.ts` stahují celé kolekce bez `limit()`. |
| **10** | **Osobní údaje minimalizuj** | 🟢 **SPLNĚNO** | V databázi se neukládají žádná hesla ani nadbytečné PII; hesla spravuje výhradně Firebase Auth. |
| **11** | **Citlivé operace přes backend** | 🟡 **ČÁSTEČNĚ SPLNĚNO** | Backend endpointy existují, ale Cloud Firestore umožňuje klientovi backend zcela obejít přímým zápisem role a žolíků. |
| **12** | **Firebase Storage musí mít vlastní pravidla** (namespacing, MIME, size) | 🟢 **SPLNĚNO** | `storage.rules` striktně filtruje MIME typy, zakazuje SVG od běžných uživatelů a limituje velikost souborů (5 MB / 30 MB). |
| **13** | **Nikdy neukládej tajné klíče do frontendu** | 🟢 **SPLNĚNO** | Všechny serverové klíče (`SMTP_PASS`, `GEMINI_API_KEY`) jsou uloženy v `.env` bez prefixu `VITE_` a dev server blokuje stažení citlivých souborů kódem 403. |
| **14** | **Každá změna databázového modelu musí upravit i rules** | 🔴 **PORUŠENO V CLOUDU** | Změny pravidel vytvořené v repozitáři nebyly nasazeny do produkčního cloudu. Vznikla nebezpečná desynchronizace mezi kódem a reálnou databází. |
| **15** | **Updaty musí být navrženy jako partial-safe** | 🟢 **SPLNĚNO** | Lokální pravidla používají `diff().affectedKeys().hasOnly()`, což plně podporuje částečné updaty přes `updateDoc`. |
| **16** | **Vždy používej princip least privilege** | 🔴 **PORUŠENO V APLIKACI** | 1. Role `course` dává globální prémiový přístup. 2. V `assignedTests` žák dostává správné odpovědi `correctAnswer` předem. |
| **17** | **Logika oprávnění nesmí být jen v UI** | 🔴 **PORUŠENO V APLIKACI** | Endpoint `/api/practice/finish` neověřuje žolíky a umožňuje odesílání cvičení a navyšování streaku při 0 žolících. |
| **18** | **Každá nová feature musí projít bezpečnostním checklistem** | 🟡 **ČÁSTEČNĚ SPLNĚNO** | Odhaleny neshody enumu `targetAudience` (`individual` vs `selected`), `referralCode` a HTTP 401 u miniatur materiálů. |
| **19** | **Nepovoluj fallback řešení obcházející bezpečnost** | 🔴 **PORUŠENO V CLOUDU** | V Cloud Firestore je aktivní `allow read: if true;` u kurzů a možnost přímého zápisu prémiové role z klienta. |
| **20** | **Funkčnost a bezpečnost musí držet pohromadě** | 🟡 **ČÁSTEČNĚ SPLNĚNO** | Zabezpečení miniatur materiálů přes Bearer token rozbilo standardní HTML `<img>` tagy v uživatelském rozhraní (`HTTP 401`). |

---

### 9.4 Telemetrie, výkon a DB profiling

Profiler (Agent 6) a jednotliví testovací agenti naměřili následující exaktní provozní ukazatele:

#### Přehled síťových požadavků a chyb podle stránek
| Testovaný scénář / Stránka | Celkem síťových požadavků | Chybové HTTP kódy | Konzolové chyby (`console.error`) | Realtime listenery (`onSnapshot`) |
|---|:---:|:---:|:---:|:---:|
| **Host: Domovská stránka (`/`)** | 123 | 0 | 0 | 0 |
| **Host: Procvičování (`/practice`)** | 109 | 0 | 0 | 0 |
| **Student: Login + Dashboard** | 256 | 0 | 0 | **12 souběžných listenerů** |
| **Student: Procvičování (`/practice`)** | 114 | 0 | 0 | 7 listenerů |
| **Student: Statistiky (`/statistics`)** | 113 | 0 | 0 | 7 listenerů |
| **Student: Zahrada (`/garden`)** | 95 | 0 | 0 | 7 listenerů |
| **Premium: Studijní materiály (`/learning`)** | 132 | 0 | 0 | 7 listenerů |
| **Premium: Teorie s KaTeXem (`/study/:id`)** | 114 | 0 | 0 (66 KaTeX formulí OK) | 7 listenerů |
| **Teacher: Nástěnka učitele (9 záložek)** | ~1 250 (135–143/tab) | **5× HTTP 401** | **5 chyb** (miniatury materiálů) | 3 listenery |

#### Analýza zátěže databáze (Hotspots)
1. **Extrémní zátěž v `/api/practice/check-answer`:**
   - Každé ověření jediné odpovědi studenta spotřebuje **83 Firestore čtení** (19 z `customTopics` + 62 z `practiceSubtopics` + 1 otázka + 1 profil).
   - Sada 10 otázek = **830 čtení**. Pouhých 60 studentů za den vyčerpá kompletní denní bezplatný limit Firebase projektu (50 000 reads/den).
2. **Kumulace 12 realtime listenerů na nástěnce studenta:**
   - 6 duplicitních listenerů na kolekci `liveLessons` (2 z `LiveLessonNotificationWatcher`, 2 z `useNotifications`, 2 z `StudentDashboard`).
   - 2 duplicitní listenery na kolekci `todos`.
3. **Redundance `session-bootstrap` a `daily-reset`:**
   - Na každé jednotlivé routě při interní SPA navigaci se znovu odesílá `POST /api/auth/session-bootstrap` a `POST /api/jokers/daily-reset`. Pro 5 navštívených stránek proběhlo 5 volání bootstrapu a 5 volání resetu žolíků během 30 sekund.
4. **Unbounded dotazy bez limitu:**
   - `getStudentsProgressList`: stahuje celou kolekci `users` i `tests` bez stránkování.
   - `getAllInquiries`: stahuje celou kolekci `questionInquiries` bez omezení na `pending`.
   - `GET /api/orders/all` a `GET /api/admin/surveys`: backendové dotazy bez `.limit()`.

---

### 9.5 Stav úklidu testovacích entit (Audit hygiene verification)

V souladu s pravidlem č. 23 z §1 tohoto plánu provedl Koordinátor v závěrečné Fázi 3 kompletní hygienu testovacích dat prostřednictvím Firebase Admin SDK:

1. **Smazané testovací kurzy:**
   - `GjHypxfjUC2iGK5ejAiM` (`[TEST_AUDIT] Kurz A`) — **Smazáno z Firestore**
   - `dJP6jN6cauoIBWKezOiT` (`[TEST_AUDIT] Kurz B`) — **Smazáno z Firestore**
2. **Smazané dočasné testovací účty (Firebase Auth i Firestore):**
   - `Gft4JWPUgLTTY0LaYcQG78fHoo93` (`qa-audit-free-20261115@proedu.local`) — **Smazán z Auth i Firestore `users`**
   - `fYsG29DTImQ5JkppmYmxukMSpPA3` (`qa-audit-course-20261115@proedu.local`) — **Smazán z Auth i Firestore `users`**
   - `MJmTtuw5wZSZ5eiDckaGfOyRXcI2` (`qa-audit-premium-20261115@proedu.local`) — **Smazán z Auth i Firestore `users`**
3. **Smazané testovací artefakty:**
   - Záznamy testů vytvořené během probe testování: `tests/VePHtrkVhKwaD38ZDIza`, `tests/ALWQCuEyigyzA2f3cuNa` — **Smazáno**
   - Testovací materiály, bug reporty, dotazy a živé lekce vytvořené agenty během testování — **Smazáno**
4. **Ověření integrity chráněných produkčních účtů:**
   - `ucitel@ucitel.cz` (UID: `Esyv8joEwsXzcQWoz2CCijJSTEu1`) — **Nedotčen, plně funkční v Auth i Firestore**
   - `student@student.cz` (UID: `HStosB36wuSFcV06kEy3j21Q9SX2`) — **Nedotčen, plně funkční v Auth i Firestore**

---

### 9.6 Doporučený prioritizovaný akční plán pro vývojový tým

#### 🚀 Fáze A: Okamžité bezpečnostní a konfigurační zásahy (Quick Wins – Den 1)
1. **Nasadit aktuální `firestore.rules` do Firebase:**
   - Spustit `firebase deploy --only firestore:rules --project gen-lang-client-0972842509`. Tím se okamžitě uzavře:
     - Eskalace rolí a neoprávněný zápis `isAdmin` a žolíků (P0).
     - Veřejný únik Google Meet odkazů na `courses/{id}` (P0).
     - Veřejné čtení celé kolekce otázek `questions` včetně správných odpovědí (P0).
2. **Doplnit chybějící proměnnou do produkčního i lokálního `.env`:**
   - Přidat `ALLOW_SANDBOX_PAYMENTS="true"` do `.env` pro zprovoznění platební simulace (P1).
3. **Opravit zobrazení miniatur materiálů:**
   - Povolit předávání tokenu v query parametru `/api/materials/:id/thumbnail?token=...`, nebo v `MaterialsManager.tsx` načítat obrázek přes `fetch()` s autorizační hlavičkou (P1).
4. **Sjednotit párování předmětů pro hosta:**
   - V `Practice.tsx` sjednotit `'Český jazyk'` a `'Čeština'`, aby se neregistrovanému hostovi odemklo demo podtéma v procvičování (P1).

#### 🛠️ Fáze B: Oprava aplikační a obchodní logiky (Dny 2–3)
5. **Zabezpečit `POST /api/practice/finish` proti odevzdání bez žolíků:**
   - V `server/index.js` doplnit kontrolu `userData.jokers >= 1` pro role `free` a `student` (P1).
6. **Oddělit roli `course` od globálního prémiového obsahu:**
   - V `server/index.js`, `firestore.rules` a `AuthContext.tsx` omezit oprávnění role `course` pouze na materiály a lekce daného kurzu, nikoliv na celý prémiový portál (P1).
7. **Opravit únik správných odpovědí v `assignedTests`:**
   - Při vytváření testu neukládat pole `correctAnswer` a `explanation` do žákovského dokumentu; test vyhodnocovat až po odevzdání na backendu (P1).
8. **Automatizovat serverovou expiraci předplatného:**
   - V `AuthContext.tsx` při detekci `isSubscriptionPeriodExpired` volat `/api/subscription/check-expiry` a vynutit obnovu custom claims přes `authUser.getIdToken(true)` (P1).
9. **Sjednotit enum cílové skupiny živých lekcí:**
   - Ve `firestore.rules` sjednotit povolené hodnoty na `['all', 'individual', 'course']` a v `liveLessonService.ts` doplnit odběr pro kurzové lekce (P1/P2).

#### 🏗️ Fáze C: Architektonická a výkonnostní optimalizace (Sprint 2)
10. **Implementovat serverovou cache pro katalog v `check-answer`:**
    - Uložit `loadPracticeCatalogFromFirestore()` do in-memory cache s TTL 10 minut (snížení z 83 reads na 2 reads na otázku – úspora 97 % DB zátěže) (P1).
11. **Konsolidovat realtime listenery:**
    - Sloučit 6 duplicitních listenerů na `liveLessons` a 2 listenery na `todos` do sdílených React Contextů (P2).
12. **Zavést stránkování a limity pro administrativní výpisy:**
    - V `getStudentsProgressList`, `getAllInquiries`, `/api/orders/all` a `/api/admin/surveys` doplnit `limit(25)` a kurzorové stránkování (P2).
13. **Sjednotit výpočet půlnoci na časové pásmo `Europe/Prague`:**
    - V `jokerService.ts` nahradit lokální čas zařízení standardem `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague' })` (P2).
