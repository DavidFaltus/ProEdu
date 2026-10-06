# Technický a architektonický výzkum: Integrace Google Meet a živé výuky do ProEdu

> **Datum zpracování:** 6. října 2026  
> **Projekt:** ProEdu (Vzdělávací platforma)  
> **Cíl:** Analyzovat možnosti integrace videohovorů Google Meet do sekce *„Připojit se na hodinu“* v `StudentDashboard` a správy lekcí v `TeacherDashboard`, se zvláštním zřetelem na studenty **bez Google účtu** a v souladu s bezpečnostními pravidly projektu (`.agents/rules/proedu.md`).

---

## 1. Manažerské shrnutí (Executive Summary)

Uživatel položil klíčovou otázku:
> *"Rád bych byl schopný připojit do aplikace Google Meet a implementovat ho do funkce 'připojit se na hodinu'. Bylo by to možné? Již je možné připojit se do aplikace pomocí Google účtu, ale potřeboval bych i verzi pro uživatele bez připojeného Google účtu."*

### Klíčové závěry výzkumu:
1. **Způsob integrace (Nová záložka vs. Iframe):**  
   Google Meet **nelze** vložit do `<iframe>` uvnitř aplikace ProEdu. Google bezpečnostní hlavičky (`X-Frame-Options: SAMEORIGIN` a CSP `frame-ancestors 'self'`) to v moderních prohlížečích striktně blokují. Jediné technicky proveditelné a spolehlivé řešení je **otevření v nové záložce/okně** (`window.open(meetUrl, '_blank')`) s doprovodným řídicím panelem přímo v ProEdu.
2. **Připojení studentů BEZ Google účtu:**  
   - **Desktop (PC/Notebook):** Student **nemusí mít Google účet**. Po otevření odkazu zadá své jméno a klikne na *„Požádat o připojení“* (tzv. *Knocking / Klepání na dveře*). Učitel v místnosti dostane vyskakovací okno s povolením vstupu.
   - **Podmínka organizátora (Učitele):** Učitel musí mít Google účet. Pokud učitel používá osobní účet (`@gmail.com`) nebo placený Google Workspace (Business / Enterprise), studenti bez Google účtu se mohou po schválení připojit. Pozor: Pokud by škola využívala *Google Workspace for Education*, Google z bezpečnostních důvodů anonymní uživatele bez přihlášení blokuje.
   - **Mobilní zařízení (Android/iOS):** V mobilním rozhraní aplikace Meet obvykle vyžaduje přihlášení k účtu Google v nativní aplikaci. Pro studenty na mobilu bez účtu je doporučeno použít počítač nebo alternativní videohovor.
3. **Generování Meet odkazů:**  
   V projektu ProEdu již existuje základ v [`src/services/calendarService.ts`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/calendarService.ts). Nejefektivnější cesta je rozšířit volání Google Calendar API o parametr `conferenceDataVersion=1` s požadavkem `hangoutsMeet`. Učitel jedním kliknutím vytvoří schůzku a systém ProEdu automaticky uloží `meetUrl`. Pro učitele bez Google OAuth je k dispozici ruční vložení odkazu. Automatizace přes Service Account na pozadí bez Google Workspace domény není Googlem povolena.
4. **Volitelný fallback (Jitsi Meet iframe):**  
   Pokud lektor nebo student vyžaduje video běžící přímo v okně ProEdu bez vyskakování a 100% bez potřeby jakéhokoliv Google účtu na straně studenta, lze nabídnout Jitsi Meet IFrame API jako volitelnou alternativu.

---

## 2. Analýza A: Způsob integrace – Iframe vs. Nová záložka

### 2.1 Proč Google Meet nelze vložit do `<iframe>`?
Pokus o načtení adresy `https://meet.google.com/xxx-yyyy-zzz` do HTML prvku `<iframe>` selže z důvodu bezpečnostních mechanismů prosazovaných společností Google na úrovni HTTP hlaviček:

1. **Hlavička `X-Frame-Options`:**  
   Google Meet posílá hlavičku `X-Frame-Options: SAMEORIGIN` (případně `DENY`).  
   *Zdroj:* [RFC 7034 – HTTP Header Field X-Frame-Options](https://datatracker.ietf.org/doc/html/rfc7034) a [MDN Web Docs – X-Frame-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options).  
   Prohlížeč odmítne vykreslit rámec s chybou typu:  
   `Refused to display 'https://meet.google.com/...' in a frame because it set 'X-Frame-Options' to 'SAMEORIGIN'.`
2. **Content Security Policy (`frame-ancestors`):**  
   Google Meet obsahuje v CSP direktivu `frame-ancestors 'self'`, což znamená, že stránku smí rámovat pouze domény ze stejného původu (`*.google.com`). Žádná cizí webová aplikace (např. `proedu.cz` nebo `localhost:3005`) nemůže tento zákaz obejít.  
   *Zdroj:* [W3C Content Security Policy Level 3 – frame-ancestors](https://www.w3.org/TR/CSP3/#directive-frame-ancestors).
3. **Oprávnění médií a cookies (Permissions Policy & Partitioned Cookies):**  
   I kdyby existoval proxy mechanismus (což by porušovalo Google Terms of Service), moderní prohlížeče (Chrome, Safari, Firefox) blokují přístup k webkameře a mikrofonu v cizích rámcích bez explicitní hlavičky `allow="camera; microphone; display-capture"` a uplatňují CHIPS (Cookies Having Independent Partitioned State), což by rozbilo přihlášení a session Google účtu.

### 2.2 Doporučený integrační vzor: Bezpečné otevření v nové záložce
Osvědčený standard používaný v LMS systémech (Google Classroom, Canvas LMS, Moodle):
1. V ProEdu v sekci **„Připojit se na hodinu“** student vidí kartu aktivní nebo naplánované lekce (název, lektor, čas, stav).
2. Tlačítko **„Vstoupit do lekce (Google Meet)“** otevře schůzku v novém okně/záložce s bezpečnostními atributy:
   ```html
   <a 
     href={lesson.meetUrl} 
     target="_blank" 
     rel="noopener noreferrer"
     className="btn-primary"
   >
     Vstoupit do lekce
   </a>
   ```
3. V ProEdu zůstává studentovi otevřený pomocný panel:
   - Stav lekce (např. „Lekce právě probíhá“).
   - Sdílené materiály a úkoly k lekci.
   - Instrukce pro studenty bez Google účtu (viz kapitola 3).
   - Tlačítko pro ukončení / nahlášení účasti.

---

## 3. Analýza B: Připojení pro uživatele BEZ Google účtu

### 3.1 Jak funguje připojení pro nepřihlášeného uživatele?
Google Meet oficiálně podporuje účast uživatelů bez Google účtu. Tento mechanismus se nazývá **Guest access** a využívá proces **Knocking (Klepání)**.

*Primární zdroj:* [Google Meet Help: Join a video meeting](https://support.google.com/meet/answer/9303069)  
*Sekce nápovědy:* *"Join without a Google Account"*

#### Průběh z pohledu studenta:
1. Student klikne na odkaz `meet.google.com/xxx-yyyy-zzz`.
2. Prohlížeč rozpozná, že uživatel není přihlášen k žádnému Google účtu.
3. Místo okamžitého přesměrování na přihlašovací formulář Google zobrazí pole:  
   **„Jak se jmenujete?“ (What's your name?)**.
4. Student napíše své jméno (např. *„Jan Novák (ProEdu)“*).
5. Student klikne na tlačítko **„Požádat o připojení“ (Ask to join)**.
6. Na obrazovce se zobrazí stav: *„Čekání na schválení organizátorem...“*.

#### Průběh z pohledu učitele (Organizátora):
1. Učiteli v probíhajícím hovoru vyskočí dialogové okno:  
   *„Uživatel Jan Novák (ProEdu) žádá o připojení k tomuto hovoru.“*
2. Učitel má dvě volby:
   - **Vpustit (Admit)** – student je okamžitě připojen se zapnutým zvukem/videem.
   - **Odmítnout (Deny entry)** – studentovi se zobrazí informace, že byl vstup zamítnut.

---

### 3.2 Zásadní rozdíly podle typu účtu organizátora (Učitele)

To, zda se student bez Google účtu může připojit, závisí výhradně na typu účtu učitele a nastavení bezpečnosti:

| Typ účtu učitele (Host) | Může se připojit student BEZ Google účtu? | Podmínky a omezení |
| :--- | :---: | :--- |
| **Osobní účet Google (@gmail.com)** | **ANO** (přes Desktop Web) | Student musí „zaklepat“ a učitel musí vstup povolit. Délka hovoru pro 3+ účastníky je u bezplatného účtu omezena na 60 minut. |
| **Google Workspace Business / Enterprise** | **ANO** | Hostitel musí mít v nastavení povolen externí přístup (standardně zapnuto). Host musí být schválen učitelem. |
| **Google Workspace for Education (Školní účty)** | **NE / Striktně omezeno** | Google Workspace for Education má bezpečnostní pravidlo: **Anonymní uživatelé (nepřihlášení k účtu Google) se NEMOHOU připojit k hovorům organizovaným účty Education** (prevence zoombombingu ve školách). |

*Primární citace pro Google Workspace for Education:*  
> *"Anonymous users (users not signed in to a Google Account) cannot join meetings organized by Google Workspace for Education users."*  
> Zdroj: [Google Workspace Admin Help: Manage Meet safety settings](https://support.google.com/a/answer/9822731) a [Control who can join video meetings](https://support.google.com/a/answer/9822731).

#### Doporučení pro ProEdu:
Pokud lektor učí přes soukromý Gmail nebo komerční Workspace, studenti bez Google účtu se bez problémů připojí pomocí "Ask to join". Pokud by však lektor používal školní licenci Google Workspace for Education, studentům musí být doporučeno přihlásit se školním nebo osobním Google účtem.

---

### 3.3 Desktop vs. Mobilní zařízení (Android & iOS)

*Zdroj:* [Google Meet Help: Join a meeting on Android / iOS](https://support.google.com/meet/answer/9303069?co=GENIE.Platform%3DAndroid)

1. **Desktopové prohlížeče (Windows, macOS, Linux, Chrome OS):**
   - Plná podpora pro nepřihlášené uživatele v prohlížečích Google Chrome, Microsoft Edge, Mozilla Firefox i Apple Safari.
   - Nevyžaduje instalaci žádného softwaru ani doplňku.
2. **Mobilní zařízení (Android, iPhone, iPad):**
   - Kliknutí na odkaz na telefonu se pokusí otevřít aplikaci **Google Meet**.
   - V aplikaci Google Meet mobilní operační systémy a Google obvykle **vynucují přihlášení k existujícímu Google účtu** na daném zařízení (na Androidu je účet přítomen vždy; na iOS musí být uživatel přihlášen v aplikaci Meet).
   - Otevření v mobilním webovém prohlížeči bez aplikace často vyzývá ke stažení aplikace nebo vyžaduje přepnutí prohlížeče do režimu „Verze pro počítač“ (Desktop site).

> **Doporučení pro UX v ProEdu:**  
> V StudentDashboard v sekci „Připojit se na hodinu“ zobrazit srozumitelné upozornění:  
> *„Připojuješ se bez Google účtu? Doporučujeme použít počítač nebo notebook. Stačí zadat své jméno a počkat, až tě učitel vpustí do hodiny.“*

---

## 4. Analýza C: Jak se vytváří Google Meet místnost / odkaz

Existují čtyři technické způsoby, jak získat odkaz na Google Meet:

```
+---------------------------------------------------------------------------------------+
| Možnost 1: Ruční zadání odkazu lektorem (meet.google.com/xxx-yyyy-zzz)                |
| -> Okamžitě funkční, žádné API klíče, 0 závislostí.                                  |
+---------------------------------------------------------------------------------------+
| Možnost 2: Google Calendar API (conferenceData.createRequest) [DOPORUČENO]            |
| -> Využívá stávající calendarService.ts v ProEdu, 1 kliknutí pro učitele.             |
+---------------------------------------------------------------------------------------+
| Možnost 3: Google Meet REST API v2 (spaces.create)                                    |
| -> Nové specializované API, vyžaduje scope meetings.space.created.                    |
+---------------------------------------------------------------------------------------+
| Možnost 4: Backend Service Account bez uživatele                                      |
| -> TECHNICKY NEMOŽNÉ pro obecné účty bez Google Workspace Domain Delegation.          |
+---------------------------------------------------------------------------------------+
```

### 4.1 Možnost 1: Ruční zadání odkazu učitelem (Zero-overhead)
- **Jak funguje:** Učitel si ve svém Google kalendáři nebo přímo na `meet.google.com` vytvoří trvalou nebo jednorázovou místnost. Zkopíruje odkaz ve tvaru `https://meet.google.com/abc-defg-hij` a vloží jej do formuláře vytvoření lekce v TeacherDashboard.
- **Výhody:** Funguje pro všechny účty (Gmail, Workspace, cizí videoplatformy), 100% spolehlivost bez nutnosti OAuth scopes.
- **Nevýhody:** Učitel musí odkaz zkopírovat ručně.

### 4.2 Možnost 2: Automatické vytvoření přes Google Calendar API (Doporučeno pro Google přihlášení)
V repozitáři ProEdu již existuje [`src/services/calendarService.ts`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/services/calendarService.ts), který žádá o rozsah `https://www.googleapis.com/auth/calendar.events`.

*Primární zdroj:* [Google Calendar API: Create Events with Conferences](https://developers.google.com/calendar/api/guides/create-events) a [Events.insert Reference](https://developers.google.com/calendar/api/v3/reference/events/insert).

Aby Calendar API automaticky vygenerovalo Google Meet odkaz, musí volání obsahovat:
1. URL parametr `conferenceDataVersion=1`.
2. V těle požadavku objekt `conferenceData.createRequest`:
   ```typescript
   const eventData = {
     summary: "Matematika: Příprava na přijímací zkoušky",
     description: "Živá lekce v ProEdu s lektorem",
     start: { dateTime: startTime.toISOString() },
     end: { dateTime: endTime.toISOString() },
     conferenceData: {
       createRequest: {
         requestId: crypto.randomUUID(), // unikátní ID pro idempotenci
         conferenceSolutionKey: {
           type: "hangoutsMeet" // vyžádá vytvoření Google Meet místnosti
         }
       }
     }
   };

   // Volání API:
   const response = await fetch(
     'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1',
     {
       method: 'POST',
       headers: {
         Authorization: `Bearer ${accessToken}`,
         'Content-Type': 'application/json'
       },
       body: JSON.stringify(eventData)
     }
   );

   const result = await response.json();
   // Získání Meet odkazu:
   const meetUrl = result.conferenceData?.entryPoints?.find(
     (ep: any) => ep.entryPointType === 'video'
   )?.uri;
   ```
- **Výsledek:** Učitel klikne na *„Vytvořit lekci a vygenerovat Google Meet“*, proběhne OAuth autorizace (pokud již není token) a ProEdu okamžitě obdrží platný odkaz `meetUrl`. Funguje i pro běžné osobní `@gmail.com` účty!

### 4.3 Možnost 3: Google Meet REST API v2 (`spaces.create`)
Google v letech 2023–2024 uvedl nové specializované Meet REST API v2.

*Primární zdroj:* [Google Meet REST API: spaces.create](https://developers.google.com/meet/api/reference/rest/v2/spaces/create)

- **Endpoint:** `POST https://meet.googleapis.com/v2/spaces`
- **Scope:** `https://www.googleapis.com/auth/meetings.space.created`
- **Tělo požadavku:** Umožňuje nastavit `config.accessType` (`OPEN`, `TRUSTED`, `RESTRICTED`).
- **Hodnocení pro ProEdu:** Vhodné v případě, že organizace vyžaduje čistě správu místností bez záznamu v Google kalendáři. Pro účely vzdělávací platformy je však **Google Calendar API (Možnost 2)** výhodnější, protože učiteli i studentovi zároveň vytvoří událost v kalendáři a nevyžaduje specifické schvalování nových Meet API scopes v Google Cloud Console.

### 4.4 Možnost 4: Vytváření Meet odkazů backendovým Service Accountem (Proč to nelze?)
Často navrhovaný nápad bývá: *„Ať Cloud Function na backendu přes Service Account sama vygeneruje Google Meet odkaz, aby se učitel nemusel přihlašovat přes Google.“*

*Primární zdroj:* [Google Cloud IAM: Delegating authority using service accounts](https://developers.google.com/identity/protocols/oauth2/service-account#delegatingauthority)

**Technický důvod, proč to pro obecné uživatele nefunguje:**
- Service Account je strojová identita (např. `firebase-adminsdk@project.iam.gserviceaccount.com`).
- Google Meet nepovoluje vytváření hovorů strojovým identitám, protože nemají licenci Google Meet ani schránku.
- Vytvoření schůzky přes Service Account je možné **POUZE** přes mechanismus **Domain-Wide Delegation (DWD)** v rámci placené Google Workspace domény, kde administrátor povolí Service Accountu impersonovat konkrétního uživatele v doméně (`subject: "lektor@mojeskola.cz"`).
- Osobní účty `@gmail.com` delegaci autority nepodporují.
- **Závěr:** Odkaz musí vzniknout buď na straně přihlášeného učitele (OAuth token), nebo ručním zadáním.

---

## 5. Analýza D: Datový model a bezpečnostní architektura pro ProEdu

V souladu s pravidly projektu (`.agents/rules/proedu.md`):
- *Pravidlo 2 & 6:* Explicitní model kolekce ve Firestore s bezpečnostními pravidly.
- *Pravidlo 3 & 7:* Document-level ownership (`teacherId`) a imutabilní pole (`teacherId`, `createdAt`).
- *Pravidlo 8:* Validace tvaru dat, délek řetězců a povolených enumů.
- *Pravidlo 9:* Zákaz broad reads (studenti čtou jen lekce, které se jich týkají).
- *Pravidlo 15:* Partial-safe updates.

### 5.1 Datový model kolekce `liveLessons`

```typescript
// src/types/liveLesson.ts
export type LiveLessonStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
export type VideoProvider = 'google_meet' | 'jitsi' | 'custom';
export type TargetAudience = 'all' | 'course' | 'individual';

export interface LiveLesson {
  id: string;
  title: string;                 // max 256 znaků
  description?: string;          // max 2000 znaků
  subject?: string;              // např. "Matematika", "Český jazyk" (max 128 znaků)
  
  // Vlastnictví (Učitel)
  teacherId: string;             // UID učitele (imutabilní, ověřeno v rules)
  teacherName: string;           // Zobrazované jméno učitele
  
  // Video konference
  provider: VideoProvider;       // 'google_meet' | 'jitsi' | 'custom'
  meetUrl: string;               // URL odkazu (max 1024 znaků)
  
  // Časový plán
  scheduledAt: Timestamp;        // Začátek lekce
  durationMinutes: number;       // Délka v minutách (např. 45, 60)
  status: LiveLessonStatus;      // 'scheduled' | 'live' | 'completed' | 'cancelled'
  
  // Cílová skupina (Přístupová práva pro studenty)
  targetAudience: TargetAudience;
  courseId?: string | null;      // Pokud je vázáno na kurz
  studentIds?: string[];         // Seznam povolených UID studentů (max 100)
  
  // Metadata
  createdAt: Timestamp;          // Imutabilní
  updatedAt?: Timestamp;
}
```

### 5.2 Návrh Firestore Security Rules pro `liveLessons`

Vkládá se do `firestore.rules`:

```javascript
// --- Validace schématu pro liveLessons ---
function isValidLiveLesson(data) {
  return data.title is string && data.title.size() <= 256 &&
         (!('description' in data) || data.description == null || (data.description is string && data.description.size() <= 2000)) &&
         (!('subject' in data) || data.subject == null || (data.subject is string && data.subject.size() <= 128)) &&
         data.teacherId is string && data.teacherId == request.auth.uid &&
         data.teacherName is string && data.teacherName.size() <= 128 &&
         data.provider is string && (data.provider == 'google_meet' || data.provider == 'jitsi' || data.provider == 'custom') &&
         data.meetUrl is string && data.meetUrl.size() <= 1024 &&
         data.scheduledAt is timestamp &&
         data.durationMinutes is number && data.durationMinutes > 0 && data.durationMinutes <= 480 &&
         data.status is string && (data.status == 'scheduled' || data.status == 'live' || data.status == 'completed' || data.status == 'cancelled') &&
         data.targetAudience is string && (data.targetAudience == 'all' || data.targetAudience == 'course' || data.targetAudience == 'individual') &&
         (!('courseId' in data) || data.courseId == null || (data.courseId is string && data.courseId.size() <= 128)) &&
         (!('studentIds' in data) || data.studentIds == null || (data.studentIds is list && data.studentIds.size() <= 100)) &&
         data.createdAt is timestamp;
}

// Kontrola neměnnosti základních polí
function keepsLessonImmutableFields() {
  return unchanged('teacherId') &&
         unchanged('createdAt');
}

// --- Pravidla pro kolekci liveLessons ---
match /liveLessons/{lessonId} {
  // Čtení:
  // 1. Učitel (isAdmin) může číst všechny lekce
  // 2. Student může číst POUZE pokud je přihlášen a:
  //    - lekce je pro všechny (targetAudience == 'all')
  //    - nebo je jeho UID v seznamu studentIds
  //    - nebo je zapsán v daném courseId
  // Žádné neomezené broad reads pro nepřihlášené!
  allow read: if isAuthenticated() && (
    isAdmin() ||
    resource.data.targetAudience == 'all' ||
    (resource.data.targetAudience == 'individual' && request.auth.uid in resource.data.studentIds) ||
    (resource.data.targetAudience == 'course' && resource.data.courseId != null)
  );

  // Vytvoření: Pouze učitel (isAdmin), s validním tvarem dat a svým UID
  allow create: if isAdmin() &&
                request.resource.data.teacherId == request.auth.uid &&
                isValidLiveLesson(request.resource.data);

  // Úprava: Pouze učitel, který lekci vytvořil, se zachováním imutabilních polí
  allow update: if isAdmin() &&
                resource.data.teacherId == request.auth.uid &&
                keepsLessonImmutableFields() &&
                isValidLiveLesson(request.resource.data);

  // Mazání: Pouze učitel, který lekci vytvořil
  allow delete: if isAdmin() &&
                resource.data.teacherId == request.auth.uid;
}
```

---

### 5.3 Změny v TeacherDashboard

V [`src/pages/TeacherDashboard.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/TeacherDashboard.tsx) se přidá nová záložka nebo sekce **„Živé lekce“** (např. tab `lessons`):
1. **Přehled naplánovaných a aktivních lekcí:**
   - Karta lekce s indikátorem stavu (Naplánováno / Právě probíhá / Dokončeno).
   - Tlačítko **„Zahájit lekci“** (přepne status na `live` a otevře Meet v novém okně).
   - Tlačítko **„Ukončit lekci“** (přepne status na `completed`).
2. **Formulář „Nová živá lekce“:**
   - Název hodiny, předmět, datum a čas, délka.
   - Výběr cílové skupiny (Všichni studenti / Konkrétní kurz / Vybraní studenti).
   - Způsob vytvoření Meet odkazu:
     - **Tlačítko „Vygenerovat přes Google Kalendář“:** Zavolá upravený `calendarService.ts` a automaticky předvyplní pole s odkazem.
     - **Pole „Vložit vlastní odkaz (Google Meet / Zoom / jiné)“:** Umožní učiteli vložit libovolný link.
     - **Přepínač na „Jitsi Meet“:** Automaticky vygeneruje bezpečnou zabezpečenou místnost (např. `proedu-lekce-[uuid]`).

---

### 5.4 Změny v StudentDashboard (Sekce „Připojit se na hodinu“)

V [`src/pages/StudentDashboard.tsx`](file:///C:/PROJEKTY/PRO%20EDU/APPKA/ProEdu/src/pages/StudentDashboard.tsx) (řádky 271–295) se stávající prázdný placeholder nahradí reaktivním stavem načítajícím lekce z Firestore:

1. **Stav 1: Lekce právě probíhá (`status === 'live'`):**
   - Zvýrazněná interaktivní karta s animovaným pulzujícím indikátorem 🔴 **ŽIVÝ PŘENOS**.
   - Název lekce a jméno lektora.
   - Velké hlavní tlačítko: **„Připojit se k výuce (Google Meet)“** otevírající odkaz v nové záložce.
   - **Informační box pro studenty bez Google účtu:**
     ```
     💡 Nemáš účet Google?
     1. Klikni na tlačítko připojit se.
     2. Na stránce Google Meet napiš své celé jméno.
     3. Klikni na „Požádat o připojení“ (Ask to join).
     4. Lektor tě během několika sekund vpustí do hodiny.
     (Doporučujeme připojení z počítače nebo notebooku.)
     ```
2. **Stav 2: Nadcházející naplánovaná lekce (`status === 'scheduled'`):**
   - Zobrazení odpočtu času do začátku hodiny (např. *„Začíná dnes v 16:00 (za 45 minut)“*).
   - Tlačítko je do začátku hodiny neaktivní nebo informativní.
3. **Stav 3: Žádná naplánovaná lekce:**
   - Původní čistý stav: *„Momentálně nejsou naplánované žádné živé lekce. O začátku další lekce tě bude lektor včas informovat.“*

---

## 6. Analýza E: Alternativní řešení – Jitsi Meet IFrame Fallback

Pro scénáře, kdy:
- Učitel **nemá** Google účet nebo nechce propojovat Google kalendář,
- Student se chce připojit z mobilního telefonu bez nutnosti instalovat aplikaci Google Meet a bez nutnosti mít Google účet,
- ProEdu chce nabídnout **přímé video uvnitř stránky (in-app video)** bez otevírání nových zálozek.

*Primární zdroj:* [Jitsi Meet IFrame API Handbook](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe) a [Jitsi Meet Authentication Policy](https://jitsi.org/blog/authentication-on-meet-jit-si/).

### 6.1 Jak funguje Jitsi Meet IFrame v ProEdu?
Jitsi Meet poskytuje oficiální JavaScriptovou knihovnu `https://meet.jit.si/external_api.js`, která umožňuje vykreslit videokonferenci přímo do `<div>` kontejneru v Reactu.

```typescript
// Ukázka jednoduché integrace v React komponentě
import { useEffect, useRef } from 'react';

export function JitsiMeetingRoom({ roomName, displayName }: { roomName: string; displayName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // @ts-ignore
    const api = new window.JitsiMeetExternalAPI('meet.jit.si', {
      roomName: `proedu-${roomName}`,
      parentNode: containerRef.current,
      userInfo: { displayName },
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        disableDeepLinking: true // zabrání nucenému otevírání mobilní aplikace
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'closedcaptions', 'desktop', 
          'fullscreen', 'chat', 'raisehand', 'tileview'
        ]
      }
    });

    return () => api.dispose();
  }, [roomName, displayName]);

  return <div ref={containerRef} className="w-full h-[600px] rounded-2xl overflow-hidden shadow-lg" />;
}
```

### 6.2 Důležitá změna v pravidlech veřejného serveru `meet.jit.si` (Od 24. srpna 2023):
- **Zakladatel místnosti (Učitel):** Od srpna 2023 veřejný server `meet.jit.si` vyžaduje, aby se zakladatel místnosti jednorázově přihlásil (přes Google, GitHub nebo Facebook účet). Tím Jitsi brání zneužívání bezplatné infrastruktury.
- **Připojující se účastníci (Studenti):** **ŽÁDNÝ ÚČET NEPOTŘEBUJÍ.** Studenti se mohou připojit zcela anonymně bez jakéhokoliv přihlášení.
- **Vlastní server (Self-hosted Jitsi):** Pokud by ProEdu v budoucnu hostovalo vlastní instanci Jitsi (např. na Dockeru na vlastním VPS za cca 10 € měsíčně), lze autentizaci zcela vypnout a mít 100% kontrolu nad daty žáků v souladu s GDPR.

---

### 6.3 Srovnání: Google Meet vs. Jitsi Meet

| Kritérium | Google Meet | Jitsi Meet (Veřejný / Vlastní) |
| :--- | :--- | :--- |
| **Způsob zobrazení v ProEdu** | Nová záložka (`_blank`) | Přímo v aplikaci (`<iframe>` / In-app) |
| **Účet pro UČITELE** | Vyžaduje Google účet | Veřejný vyžaduje 1x login; self-hosted bez účtu |
| **Účet pro STUDENTA** | **Není potřeba** (na PC přes Knocking) | **Není potřeba vůbec** na žádném zařízení |
| **Mobilní přístup žáka** | Vyžaduje aplikaci Meet | Funguje přímo v mobilním webovém prohlížeči |
| **Kvalita přenosu a stabilita** | Špičková globální infrastruktura Google | Velmi dobrá (závisí na serveru) |
| **Délka hovoru zdarma** | 60 min (osobní Gmail), neomezeně (Workspace) | Neomezeně |
| **Implementační náročnost** | Nízká (Calendar API + link) | Nízká až střední |

---

## 7. Doporučený plán implementace (Implementační Roadmapa)

Pro dosažení maximální bezpečnosti, spolehlivosti a skvělého uživatelského zážitku doporučujeme postupovat ve 3 fázích:

### Fáze 1: Datový model a základní správa lekcí (Okamžitá hodnota)
1. Přidat kolekci `liveLessons` do `firestore.rules` s přísnou validací a kontrolou vlastnictví.
2. Definovat TypeScript rozhraní `LiveLesson` v `src/types/`.
3. Vytvořit formulář pro učitele v `TeacherDashboard` umožňující:
   - Vytvořit lekci s ručním zadáním odkazu (Google Meet, Zoom, MS Teams).
   - Přepínat stav lekce (`scheduled` -> `live` -> `completed`).
4. Upravit `StudentDashboard` v sekci *„Připojit se na hodinu“*:
   - Zobrazit aktivní lekci a výrazné tlačítko pro otevření Meet odkazu v nové záložce.
   - Doplnit návodný text pro studenty bez Google účtu (jméno -> Požádat o připojení).

### Fáze 2: Automatické generování Meet odkazu přes Google Calendar API
1. Rozšířit stávající `src/services/calendarService.ts`:
   - Přidat parametr `conferenceDataVersion=1`.
   - Přidat `conferenceData.createRequest` s typem `hangoutsMeet`.
2. Do formuláře učitele přidat tlačítko *„Vygenerovat Google Meet odkaz z kalendáře“*.
3. Při uložení lekce se automaticky vytvoří událost v Google kalendáři lektora a do ProEdu se uloží vygenerované `meetUrl`.

### Fáze 3: Podpora Jitsi Meet jako volitelný in-app fallback
1. Přidat možnost volby poskytovatele videa při vytváření lekce (`Google Meet` vs. `Jitsi Meet`).
2. Pro lekce s Jitsi Meet umožnit studentům i učitelům otevřít video hovor přímo v ProEdu v integrovaném přehrávači.
3. Tím bude pokryta potřeba studentů, kteří nemají Google účet a připojují se z mobilních telefonů.

---

## 8. Souhrnné citace a primární zdroje

1. **Google Meet Help – Připojení k hovoru bez účtu:**  
   URL: [https://support.google.com/meet/answer/9303069](https://support.google.com/meet/answer/9303069)
2. **Google Workspace Admin Help – Bezpečnostní pravidla a anonymní účastníci:**  
   URL: [https://support.google.com/a/answer/9822731](https://support.google.com/a/answer/9822731)
3. **Google Calendar API – Vytváření událostí s videokonferencí (conferenceData):**  
   URL: [https://developers.google.com/calendar/api/guides/create-events](https://developers.google.com/calendar/api/guides/create-events)  
   URL: [https://developers.google.com/calendar/api/v3/reference/events/insert](https://developers.google.com/calendar/api/v3/reference/events/insert)
4. **Google Meet REST API v2 – spaces.create:**  
   URL: [https://developers.google.com/meet/api/reference/rest/v2/spaces/create](https://developers.google.com/meet/api/reference/rest/v2/spaces/create)
5. **W3C Content Security Policy Level 3 – Direktiva `frame-ancestors`:**  
   URL: [https://www.w3.org/TR/CSP3/#directive-frame-ancestors](https://www.w3.org/TR/CSP3/#directive-frame-ancestors)
6. **IETF RFC 7034 – HTTP Header Field X-Frame-Options:**  
   URL: [https://datatracker.ietf.org/doc/html/rfc7034](https://datatracker.ietf.org/doc/html/rfc7034)
7. **Jitsi Meet IFrame API Handbook:**  
   URL: [https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe)
8. **Jitsi Meet – Změna pravidel autentizace (2023):**  
   URL: [https://jitsi.org/blog/authentication-on-meet-jit-si/](https://jitsi.org/blog/authentication-on-meet-jit-si/)
